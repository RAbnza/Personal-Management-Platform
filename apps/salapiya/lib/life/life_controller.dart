import 'dart:async';
import 'dart:convert';

import '../features/life/application/life_controller.dart';
import '../features/finance/application/financial_controller.dart';
import '../features/planning/application/planning_controller.dart';
import '../local/local_finance_controller.dart';
import '../local/local_store.dart';
import '../local/finance_domain.dart' show newLocalId;
import '../local/finance_domain.dart' show financialReminderSources;
import 'life_domain.dart';
import 'device_reminders.dart';

/// Presentation adapter over validated immutable commands and encrypted queries.
/// Mutable D4 models are read models only; every production write goes through
/// commitLife and expected source versions, including checkbox shortcuts.
class DurableLifeController extends LifeController {
  DurableLifeController(this.store) : super(demo: false) {
    permission = false;
  }
  final LocalStore store;
  Map<String, LifeRecord> records = const {};
  List<Map<String, dynamic>> intents = const [];
  StreamSubscription<dynamic>? _subscription;
  Future<void> _reloads = Future.value();
  bool _disposed = false;
  String? error;
  bool initialComplete = true;
  Map<String, dynamic> viewPreferences = {
    'tabs': {
      for (final tab in ['Tasks', 'Learning', 'Books', 'Career']) tab: true,
    },
    'calendar': {for (final module in reminderModules) module: true},
    'timezone': 'Asia/Manila',
  };
  Future<void> saveViewPreferences(Map<String, dynamic> next) async {
    validateLifeView(next);
    await store.db.execute(
      'INSERT INTO life_device VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      ['life:view', jsonEncode(next)],
    );
    viewPreferences = next;
    changed();
  }

  bool tabVisible(String tab) => (viewPreferences['tabs'] as Map)[tab] != false;
  bool calendarVisible(String module) =>
      (viewPreferences['calendar'] as Map)[module] != false;
  String get displayTimezone => viewPreferences['timezone'] as String;
  DeviceReminders? device;
  FinancialController? _finance;
  Future<void> startReminders(
    FinancialController finance, {
    required bool Function() complete,
  }) async {
    _finance = finance;
    device = DeviceReminders(store, () {
      final today = LifeTime.today(),
          day = DateTime.parse('${today}T00:00:00Z');
      return agendaWindow(
        finance,
        day
            .subtract(const Duration(days: 90))
            .toIso8601String()
            .substring(0, 10),
        day.add(const Duration(days: 90)).toIso8601String().substring(0, 10),
        financial: complete(),
      );
    });
    device!.addListener(notifyListeners);
    finance.addListener(_financialChanged);
    await device!.initialize();
  }

  void _financialChanged() {
    unawaited(device?.reconcile());
  }

  int get waiting =>
      intents.where((r) => ['pending', 'accepted'].contains(r['state'])).length;
  int get reviewing => intents
      .where(
        (r) =>
            r['resolved_at'] == null &&
            ['review', 'restored'].contains(r['state']),
      )
      .length;
  String get coverage =>
      'Private Life · ${records.length} records · $waiting waiting · $reviewing for review${initialComplete ? '' : ' · initial Life download incomplete'}';

  Future<void> initialize() async {
    final binding = await store.connection();
    if (binding != null) {
      final boundary = await store.db.getAll(
        "SELECT value FROM life_device WHERE key='life:boundary'",
      );
      final count =
          (await store.db.get(
                'SELECT count(*) n FROM p5_command WHERE profile_id=? AND owner_id=?',
                [store.owner, binding['remote_owner']],
              ))['n']
              as int;
      initialComplete =
          boundary.isNotEmpty &&
          count >= (int.tryParse(boundary.single['value'] as String) ?? -1);
    }
    final prefs = await store.db.getAll(
      "SELECT value FROM life_device WHERE key='life:view'",
    );
    if (prefs.isNotEmpty) {
      viewPreferences = Map<String, dynamic>.from(
        jsonDecode(prefs.single['value'] as String) as Map,
      );
    }
    await reload();
    _subscription = store.db
        .watch('''SELECT id,payload AS token FROM life_revision
      UNION ALL SELECT id,state||coalesce(reason,'') FROM life_intent
      UNION ALL SELECT id,payload FROM p5_command''')
        .distinct((a, b) => jsonEncode(a) == jsonEncode(b))
        .listen((_) => unawaited(reload()));
  }

  Future<void> reload() {
    final next = _reloads.catchError((Object _) {}).then((_) async {
      if (_disposed) return;
      try {
        await store.reconcileLife();
        records = await store.lifeRecords();
        intents = await store.lifeIntents();
        final history = await store.lifeHistory();
        _publish(history);
        error = null;
      } catch (_) {
        error = 'Life records could not be refreshed. Existing records and drafts are preserved. Retry after checking storage or synchronization.';
      }
      if (!_disposed) {
        changed();
        unawaited(device?.reconcile());
      }
    });
    _reloads = next;
    return next;
  }

  void _publish(List<Map<String, dynamic>> history) {
    final trails = <String, List<String>>{};
    for (final row in history) {
      final c = LifeCommand.decode(
        row['id'] as String,
        row['payload'] as String,
      );
      trails
          .putIfAbsent(c.recordId, () => [])
          .add(
            'v${c.expectedVersion + 1} · ${row['recorded_at']} · ${c.reason} · ${c.fields['status']} · ${c.fields['progress'] ?? ''}${(c.fields['completed'] ?? '').isNotEmpty ? ' · entered completion ${c.fields['completed']}' : ''}',
          );
    }
    List<String> trail(String id) => trails[id] ?? [];
    final oldEntries = {for (final e in entries) e.id: e};
    entries.clear();
    final oldEvents = {for (final e in events) e.id: e};
    events.clear();
    final oldApps = {for (final a in applications) a.id: a};
    applications.clear();
    for (final r in records.values) {
      final v = r.fields;
      if ([LifeType.task, LifeType.learning, LifeType.book].contains(r.type)) {
        final kind = LifeKind.values.byName(r.type.name);
        final e = oldEntries[r.id] ?? LifeEntry(r.id, kind, r.title);
        e.title = r.title;
        e.detail = v['detail']!;
        e.due = v['due']!;
        e.priority = v['priority'] ?? 'Normal';
        e.total = int.parse(v['total'] ?? '1');
        e.progress = int.parse(
          v['progress'] ?? (r.status == 'Completed' ? '1' : '0'),
        );
        e.status = r.status;
        e.notes = r.notes;
        e.archived = r.archived;
        e.version = r.version;
        e.history
          ..clear()
          ..addAll(trail(r.id));
        entries.add(e);
      } else if (r is PersonalRecord) {
        final e =
            oldEvents[r.id] ??
            PersonalEvent(r.id, r.title, r.date, r.time, '', '');
        e.title = r.title;
        e.date = r.date;
        e.time = r.allDay ? 'All day' : r.time;
        e.location = v['location']!;
        e.notes = r.notes;
        e.cancelled = r.status == 'Cancelled' || r.archived;
        e.version = r.version;
        e.history
          ..clear()
          ..addAll(trail(r.id));
        events.add(e);
      } else if (r is ApplicationRecord) {
        final a =
            oldApps[r.id] ??
            CareerApplication(r.id, r.company, r.title, v['date']!);
        a.company = r.company;
        a.position = r.title;
        a.date = v['date']!;
        a.stage = r.status;
        a.location = v['location']!;
        a.notes = r.notes;
        a.archived = r.archived;
        a.version = r.version;
        final oldChildren = {for (final e in a.events) e.id: e};
        a.events.clear();
        for (final child in records.values.whereType<CareerEventRecord>().where(
          (e) => e.applicationId == r.id,
        )) {
          final e =
              oldChildren[child.id] ??
              CareerEvent(
                child.id,
                child.kind,
                child.date,
                child.time,
                child.notes,
              );
          e.kind = child.kind;
          e.date = child.date;
          e.time = child.allDay ? 'All day' : child.time;
          e.notes = child.notes;
          e.complete = !child.active;
          e.version = child.version;
          a.events.add(e);
        }
        a.history
          ..clear()
          ..addAll(trail(r.id));
        for (final e in a.events) {
          a.history.addAll(trail(e.id));
        }
        applications.add(a);
      }
    }
  }

  Map<String, String> fields(String? id) =>
      id == null ? {} : records[id]?.fields ?? {};

  Future<void> _save(
    LifeType type,
    Map<String, String> values,
    Map<String, String> data, {
    String? oldId,
    int? oldVersion,
  }) async {
    final recordId = oldId ?? values['__record'] ?? newLocalId();
    final c = LifeCommand(
      id: values['__command'],
      owner: store.owner,
      recordId: recordId,
      type: type,
      expectedVersion:
          int.tryParse(values['__version'] ?? '') ?? oldVersion ?? 0,
      fields: {...fields(oldId), ...data},
      reason: values['reason']?.trim().isNotEmpty == true
          ? values['reason']!
          : 'Created',
      recordedAt: DateTime.tryParse(values['__recordedAt'] ?? ''),
    );
    await store.commitLife(c, draft: values['__draft']);
    await reload();
  }

  @override
  Future<void> saveEntry(
    LifeKind kind,
    Map<String, String> v, {
    LifeEntry? old,
  }) => _save(
    LifeType.values.byName(kind.name),
    v,
    {
      for (final key in lifeDefaults(LifeType.values.byName(kind.name)).keys)
        if (v.containsKey(key)) key: v[key]!,
    },
    oldId: old?.id,
    oldVersion: old?.version,
  );
  @override
  Future<void> saveEvent(Map<String, String> v, {PersonalEvent? old}) => _save(
    LifeType.personal,
    v,
    {
      for (final key in lifeDefaults(LifeType.personal).keys)
        if (v.containsKey(key)) key: v[key]!,
      'utc': '',
    },
    oldId: old?.id,
    oldVersion: old?.version,
  );
  @override
  Future<void> saveApplication(
    Map<String, String> v, {
    CareerApplication? old,
  }) async {
    if (old == null &&
        v['duplicateConsent'] != 'true' &&
        records.values.whereType<ApplicationRecord>().any(
          (r) =>
              r.company.trim().toLowerCase() ==
                  v['company']!.trim().toLowerCase() &&
              r.position.toLowerCase() == v['position']!.trim().toLowerCase(),
        )) {
      lifeReject(
        'A company/role match exists. Confirm a separate application attempt; valid reapplications are allowed.',
      );
    }
    await _save(
      LifeType.application,
      v,
      {
        for (final key in lifeDefaults(LifeType.application).keys)
          if (v.containsKey(key)) key: v[key]!,
        'title': v['position']!,
        'pipelineStage': v['stage']!,
        'outcome': v['outcome'] ?? '',
        'status': (v['outcome'] ?? '').isEmpty ? v['stage']! : v['outcome']!,
      },
      oldId: old?.id,
      oldVersion: old?.version,
    );
  }

  @override
  Future<void> saveCareerEvent(
    CareerApplication a,
    Map<String, String> v, {
    CareerEvent? old,
  }) => _save(
    LifeType.careerEvent,
    v,
    {
      for (final key in lifeDefaults(LifeType.careerEvent).keys)
        if (v.containsKey(key)) key: v[key]!,
      'title': v['kind']!,
      'eventKind': v['kind']!,
      'application': a.id,
      'utc': '',
    },
    oldId: old?.id,
    oldVersion: old?.version,
  );

  Future<void> change(
    String id,
    int version,
    Map<String, String> fields,
    String reason,
  ) async {
    final record = records[id];
    if (record == null) lifeReject('Record unavailable.');
    await _save(
      record.type,
      {'reason': reason},
      fields,
      oldId: id,
      oldVersion: version,
    );
  }

  @override
  Future<void> progress(LifeEntry e, int value, String note) async {
    if (e.archived || value < 0 || value > e.total) {
      lifeReject('Choose valid progress on an active record.');
    }
    await change(e.id, e.version, {
      if (e.kind != LifeKind.task) 'progress': '$value',
      // Explicit progress action documents this mapping; editing a total does
      // not fabricate completion. Manual completion dates remain field values.
      'status': value == e.total ? 'Completed' : 'In progress',
    }, note.trim().isEmpty ? 'Progress updated' : note);
  }

  @override
  Future<void> archive(LifeEntry e) => change(e.id, e.version, {
    'archived': '${!e.archived}',
  }, e.archived ? 'Restored' : 'Archived');
  @override
  Future<void> cancelEvent(PersonalEvent e, String reason) => change(
    e.id,
    e.version,
    records[e.id]?.archived == true
        ? {'archived': 'false'}
        : {'status': e.cancelled ? 'Scheduled' : 'Cancelled'},
    reason,
  );
  @override
  Future<void> archiveApplication(CareerApplication a) => change(
    a.id,
    a.version,
    {'archived': '${!a.archived}'},
    a.archived ? 'Restored' : 'Archived',
  );
  @override
  Future<void> completeCareerEvent(CareerApplication a, CareerEvent e) =>
      change(e.id, e.version, {
        'status': e.complete ? 'Scheduled' : 'Completed',
      }, e.complete ? 'Reopened event' : 'Completed event');

  List<AgendaItem> agendaWindow(
    FinancialController finance,
    String from,
    String through, {
    bool financial = true,
    String timezone = 'Asia/Manila',
  }) {
    final result = <AgendaItem>[];
    for (final r in records.values.where((r) => r.active)) {
      if (r is CareerDocumentRecord) continue;
      String date = '',
          time = 'All day',
          kind = '',
          sourceId = r.id,
          generation = '${r.id}:${r.version}';
      DateTime? utc;
      if (r is ScheduledRecord) {
        date = r.date;
        time = r.time.isEmpty ? 'All day' : r.time;
        utc = r.utc;
        if (utc != null) {
          final local = tzTime(utc, timezone);
          date = local.$1;
          time = local.$2;
        }
        kind = r is PersonalRecord ? 'Personal' : 'Career';
        if (r is CareerEventRecord) {
          final a = records[r.applicationId];
          if (a is! ApplicationRecord ||
              a.archived ||
              a.terminal ||
              !['Interview', 'Assessment', 'Follow-up'].contains(r.kind)) {
            continue;
          }
          sourceId = a.id;
          generation += ':${a.version}';
        }
      } else if (r is ApplicationRecord) {
        if (r.terminal || r.fields['followUp']!.isEmpty) continue;
        date = r.fields['followUp']!;
        kind = 'Career';
        generation += ':followUp';
      } else {
        date = r.fields['due'] ?? '';
        kind = switch (r.type) {
          LifeType.task => 'Tasks',
          LifeType.learning => 'Learning',
          _ => 'Books',
        };
      }
      if (date.isEmpty ||
          date.compareTo(from) < 0 ||
          date.compareTo(through) > 0) {
        continue;
      }
      result.add(
        AgendaItem(
          r is ApplicationRecord ? 'followUp:${r.id}' : 'life:${r.id}',
          sourceId,
          kind,
          r is CareerEventRecord
              ? '${r.kind} · ${(records[r.applicationId] as ApplicationRecord).company}'
              : r is ApplicationRecord
              ? 'Follow-up · ${r.company}'
              : r.title,
          date,
          time,
          r.version,
          sourceGeneration: generation,
          utc: utc,
          timezone: timezone,
        ),
      );
    }
    if (financial && finance is LocalFinancialController) {
      for (final r in financialReminderSources(
        finance.acceptedSnapshot,
        from,
        through,
      )) {
        result.add(
          AgendaItem(
            r.id,
            r.source,
            switch (r.kind) {
              'Debt due' => 'Debts',
              'Recurring expectation' => 'Recurring',
              _ => 'Cards',
            },
            r.title,
            r.date,
            'All day',
            0,
            amount: r.amount,
            sourceGeneration: r.version,
          ),
        );
      }
    }
    result.sort((a, b) {
      final order = '${a.date} ${a.time == 'All day' ? '00:00' : a.time}'
          .compareTo('${b.date} ${b.time == 'All day' ? '00:00' : b.time}');
      return order == 0 ? a.id.compareTo(b.id) : order;
    });
    return result;
  }

  @override
  List<AgendaItem> agenda(
    PlanningController p,
    FinancialController f, {
    bool financial = true,
  }) {
    final today = LifeTime.today(), day = DateTime.parse('${today}T00:00:00Z');
    return agendaWindow(
      f,
      day.subtract(const Duration(days: 90)).toIso8601String().substring(0, 10),
      day.add(const Duration(days: 90)).toIso8601String().substring(0, 10),
      financial: financial,
    );
  }

  @override
  void reset({bool empty = false}) {
    if (!empty) throw StateError('Production Life cannot be reset.');
  }

  @override
  void dispose() {
    _disposed = true;
    _finance?.removeListener(_financialChanged);
    device?.removeListener(notifyListeners);
    device?.dispose();
    unawaited(_subscription?.cancel());
    super.dispose();
  }

  Future<void> close() async {
    await _subscription?.cancel();
    await _reloads;
    await device?.stop();
  }

  @override
  String reminderState(AgendaItem item) =>
      device?.state(item) ?? 'Native registration unavailable · in-app only';
  @override
  Future<void> reminder(AgendaItem item, String mode, String action) async {
    if (device == null) {
      lifeReject(
        'Native reminder service is unavailable. In-app sources remain usable.',
      );
    }
    await device!.choose(item, mode, action);
  }
}

(String, String) tzTime(DateTime utc, String timezone) {
  final value = LifeTime.zone(timezone);
  // Use the zone offset at the instant, never the device's current UTC offset.
  final local = utc.add(value.timeZone(utc.millisecondsSinceEpoch).offset);
  final text = local.toIso8601String();
  return (text.substring(0, 10), text.substring(11, 16));
}
