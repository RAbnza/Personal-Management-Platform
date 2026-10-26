import 'dart:async';
import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:flutter/widgets.dart';
import 'package:timezone/timezone.dart' as tz;

import '../features/life/application/life_controller.dart';
import '../local/local_store.dart';
import 'life_domain.dart';
import 'native_notifications.dart';

const reminderModules = [
  'Personal',
  'Tasks',
  'Learning',
  'Books',
  'Career',
  'Debts',
  'Cards',
  'Recurring',
];
const reminderModes = [
  'Inherited',
  'At due time',
  '15 minutes before',
  '1 hour before',
  '1 day before',
  '7 days before',
  'Off',
];

class DeviceReminders extends ChangeNotifier with WidgetsBindingObserver {
  DeviceReminders(
    this.store,
    this.sources, {
    NotificationDevice? device,
    DateTime Function()? clock,
  }) : device = device ?? NativeNotificationDevice(),
       clock = clock ?? DateTime.now;
  final LocalStore store;
  final List<AgendaItem> Function() sources;
  final NotificationDevice device;
  final DateTime Function() clock;
  Map<String, dynamic> preferences = {
    'enabled': false,
    'enabledAt': '',
    'quiet': true,
    'start': '22:00',
    'end': '07:00',
    'timezone': 'Device',
    'showDate': false,
    'modules': {for (final m in reminderModules) m: true},
  };
  Map<String, dynamic> choices = {};
  bool allowed = false, ready = false, closed = false;
  bool permissionKnown = true;
  String status = 'Notifications are off on this device.';
  String? pendingTap;
  String timezone = 'Asia/Manila';
  void Function(AgendaItem?)? navigate;
  Future<void> _work = Future.value();
  Timer? _timer;
  WidgetsBinding? _binding;
  final Map<String, String> sourceStates = {};
  Future<void> initialize() async {
    try {
      _binding = WidgetsBinding.instance;
      _binding!.addObserver(this);
    } catch (_) {
      /* Pure domain tests have no native binding. */
    }
    for (final key in ['preferences', 'choices']) {
      final rows = await store.db.getAll(
        'SELECT value FROM life_device WHERE key=?',
        ['reminder:$key'],
      );
      if (rows.isNotEmpty) {
        final value = Map<String, dynamic>.from(
          jsonDecode(rows.single['value'] as String) as Map,
        );
        if (key == 'preferences') {
          preferences = value;
        } else {
          choices = value;
        }
      }
    }
    try {
      if (device case final NativeNotificationDevice native) {
        native.onClockChanged = () => unawaited(reconcile());
      }
      await device.initialize(_tap);
      ready = true;
      await reconcile();
    } catch (_) {
      status = 'Native notification registration unavailable. In-app commitments remain usable; retry after checking platform settings.';
      notifyListeners();
    }
    _timer = Timer.periodic(
      const Duration(minutes: 1),
      (_) => unawaited(reconcile()),
    );
  }

  Future<void> _persist(String key, Map<String, dynamic> value) =>
      store.db.execute(
        'INSERT INTO life_device VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
        ['reminder:$key', jsonEncode(value)],
      );
  Future<void> configure(
    Map<String, dynamic> changes, {
    bool request = false,
  }) async {
    final wasEnabled = preferences['enabled'] == true;
    final next = {...preferences, ...changes};
    LifeTime.zone(
      next['timezone'] == 'Device' ? timezone : next['timezone'] as String,
    );
    LifeController.validateTime(next['start'] as String);
    LifeController.validateTime(next['end'] as String);
    if (next['start'] == next['end']) {
      lifeReject('Quiet hours must have different endpoints.');
    }
    if (next['enabled'] == true && preferences['enabled'] != true) {
      next['enabledAt'] = clock().toUtc().toIso8601String();
    }
    if (request) {
      final permission = await device.permission(request: true);
      permissionKnown = permission != null;
      allowed = permission != false;
    }
    await _persist('preferences', next);
    preferences = next;
    if (wasEnabled &&
        next['enabled'] != true &&
        device is NativeNotificationDevice) {
      await (device as NativeNotificationDevice).cancel(999);
    }
    if (request &&
        !wasEnabled &&
        next['enabled'] == true &&
        allowed &&
        device is NativeNotificationDevice) {
      await (device as NativeNotificationDevice).confirmDeviceOptIn();
    }
    await reconcile();
  }

  Future<void> choose(AgendaItem item, String mode, String action) async {
    if (!reminderModes.contains(mode)) {
      lifeReject('Choose a supported reminder offset.');
    }
    final current = sources()
        .where((r) => r.id == item.id && r.generation == item.generation)
        .firstOrNull;
    if (current == null) {
      lifeReject(
        'This source generation is obsolete. Open the current source.',
      );
    }
    final choice = <String, dynamic>{
      'generation': item.generation,
      'mode': mode,
      'action': action,
      if (action == 'Snoozed 1 hour')
        'snooze': clock()
            .toUtc()
            .add(const Duration(hours: 1))
            .toIso8601String(),
    };
    final next = {...choices, item.id: choice};
    await _persist('choices', next);
    choices = next;
    await reconcile();
  }

  String state(AgendaItem item) =>
      sourceStates[item.id] ??
      (preferences['enabled'] == true
          ? 'Awaiting device reconciliation'
          : 'Off · in-app only');
  Future<void> reconcile() {
    final next = _work.catchError((Object _) {}).then((_) => _reconcile());
    _work = next;
    return next;
  }

  Future<void> _reconcile() async {
    if (closed || !ready) return;
    try {
      final deviceZone = await device.timezone();
      LifeTime.zone(deviceZone);
      timezone = preferences['timezone'] == 'Device'
          ? deviceZone
          : preferences['timezone'] as String;
      final permission = await device.permission();
      permissionKnown = permission != null;
      allowed = permission != false;
      final enabled = preferences['enabled'] == true && allowed;
      final now = clock().toUtc();
      final optin = DateTime.tryParse(
        preferences['enabledAt'] as String? ?? '',
      );
      final os = await device.pending();
      final rows = await store.db.getAll(
        'SELECT * FROM device_reminder ORDER BY os_id',
      );
      final existing = {
        for (final r in rows)
          r['logical_key'] as String: Map<String, dynamic>.from(r),
      };
      var nextId = rows.isEmpty
          ? int.parse(
                      sha256
                          .convert(utf8.encode(store.owner))
                          .toString()
                          .substring(0, 7),
                      radix: 16,
                    ) *
                    4 +
                1000
          : (rows.last['os_id'] as int) + 1;
      final desired = <String, Map<String, dynamic>>{};
      final currentSources = sources();
      final currentById = {
        for (final source in currentSources) source.id: source,
      };
      sourceStates.clear();
      for (final item in currentSources) {
        final choice = Map<String, dynamic>.from(
          choices[item.id] as Map? ?? {},
        );
        final same = choice['generation'] == item.generation;
        final mode = choice['mode'] as String? ?? 'Inherited';
        final action = same ? choice['action'] as String? ?? '' : '';
        if (!enabled ||
            (preferences['modules'] as Map)[item.kind] != true ||
            mode == 'Off' ||
            action == 'Dismissed') {
          sourceStates[item.id] = !allowed && preferences['enabled'] == true
              ? 'OS permission denied · in-app only'
              : action == 'Dismissed'
              ? 'Dismissed · source unchanged'
              : 'Off · in-app only';
          continue;
        }
        final lead = switch (mode) {
          '15 minutes before' => const Duration(minutes: 15),
          '1 hour before' => const Duration(hours: 1),
          '1 day before' => const Duration(days: 1),
          '7 days before' => const Duration(days: 7),
          _ => Duration.zero,
        };
        final original =
            item.utc ?? LifeTime.instant(item.date, '09:00', timezone, 'Later');
        var at = original.subtract(lead);
        final snooze = action == 'Snoozed 1 hour'
            ? DateTime.tryParse(choice['snooze'] as String? ?? '')
            : null;
        if (snooze != null) at = snooze;
        at = deferQuiet(at, preferences, timezone);
        if (at.isAfter(now.add(const Duration(days: 90)))) {
          sourceStates[item.id] = 'Outside the 90-day scheduling horizon';
          continue;
        }
        final key = sha256
            .convert(
              utf8.encode(
                jsonEncode([
                  store.owner,
                  item.id,
                  item.generation,
                  mode,
                  snooze?.toIso8601String(),
                ]),
              ),
            )
            .toString();
        final previous = existing[key];
        if (previous != null &&
            [
              'elapsed',
              'suppressed',
              'dismissed',
            ].contains(previous['state'])) {
          sourceStates[item.id] = 'Elapsed or suppressed · no automatic resend';
          continue;
        }
        if (at.isBefore(now) || optin == null || at.isBefore(optin)) {
          sourceStates[item.id] =
              'Elapsed or predates opt-in · no automatic resend';
          if (previous == null) {
            await store.db.execute(
              'INSERT INTO device_reminder VALUES(?,?,?,?,?,?,?)',
              [
                key,
                item.id,
                item.generation,
                nextId++,
                at.toUtc().toIso8601String(),
                'suppressed',
                item.sourceId,
              ],
            );
          }
          continue;
        }
        desired[key] = {
          'key': key,
          'item': item,
          'at': at.toUtc(),
          'id': previous?['os_id'] ?? nextId++,
        };
      }
      final selected = desired.entries.toList()
        ..sort(
          (a, b) =>
              (a.value['at'] as DateTime).compareTo(b.value['at'] as DateTime),
        );
      bool invalidSource(Map<String, dynamic> row) {
        final current = currentById[row['source_id']],
            choice = choices[row['source_id']] as Map?;
        return !enabled ||
            current == null ||
            current.generation != row['generation'] ||
            (preferences['modules'] as Map)[current.kind] != true ||
            choice?['mode'] == 'Off' ||
            choice?['generation'] == row['generation'] &&
                choice?['action'] == 'Dismissed' ||
            desired.values.any(
              (v) => (v['item'] as AgendaItem).id == row['source_id'],
            );
      }

      final latePending = rows
          .where(
            (r) =>
                os.contains(r['os_id']) &&
                DateTime.parse(r['due_utc'] as String).isBefore(now) &&
                !invalidSource(Map<String, dynamic>.from(r)),
          )
          .length;
      final bounded = Map<String, Map<String, dynamic>>.fromEntries(
        selected.take((128 - latePending).clamp(0, 128)),
      );
      // Cancel obsolete generations before registering successors. Never touch
      // the journal or source business state from this adapter.
      for (final row in rows) {
        final id = row['os_id'] as int, key = row['logical_key'] as String;
        if (!bounded.containsKey(key)) {
          final at = DateTime.parse(row['due_utc'] as String);
          final invalid = invalidSource(Map<String, dynamic>.from(row));
          if ((invalid || at.isAfter(now)) &&
              ['prepared', 'scheduled', 'elapsed'].contains(row['state'])) {
            await device.cancel(id);
            await store.db.execute(
              'UPDATE device_reminder SET state=? WHERE logical_key=?',
              ['obsolete', key],
            );
          } else if (!os.contains(id) &&
              ['prepared', 'scheduled'].contains(row['state']) &&
              at.isBefore(now)) {
            await store.db.execute(
              "UPDATE device_reminder SET state='elapsed' WHERE logical_key=?",
              [key],
            );
          }
        }
      }
      for (final entry in bounded.entries) {
        final value = entry.value,
            item = value['item'] as AgendaItem,
            at = value['at'] as DateTime,
            id = value['id'] as int;
        await store.db.execute(
          'INSERT INTO device_reminder VALUES(?,?,?,?,?,?,?) ON CONFLICT(logical_key) DO UPDATE SET state=excluded.state,due_utc=excluded.due_utc',
          [
            entry.key,
            item.id,
            item.generation,
            id,
            at.toIso8601String(),
            'prepared',
            item.sourceId,
          ],
        );
        if (!os.contains(id) ||
            existing[entry.key]?['due_utc'] != at.toIso8601String()) {
          if (os.contains(id)) await device.cancel(id);
          if (!sources().any(
            (s) => s.id == item.id && s.generation == item.generation,
          )) {
            await device.cancel(id);
            await store.db.execute(
              "UPDATE device_reminder SET state='obsolete' WHERE logical_key=?",
              [entry.key],
            );
            continue;
          }
          await device.schedule(
            id,
            at,
            'p5:${entry.key}',
            showDate: preferences['showDate'] == true,
            date: item.date,
          );
          if (at.isAfter(clock().toUtc()) &&
              !(await device.pending()).contains(id)) {
            throw StateError('The OS did not retain the requested schedule.');
          }
        }
        await store.db.execute(
          "UPDATE device_reminder SET state='scheduled' WHERE logical_key=?",
          [entry.key],
        );
        sourceStates[item.id] =
            'Scheduled on this device · ${at.toIso8601String()} · delivery best effort';
      }
      status =
          '${device.capability}\n${!permissionKnown
              ? 'Windows permission status unknown; OS schedule registration is checked separately'
              : allowed
              ? 'OS notifications enabled'
              : 'Notification permission denied'} · ${bounded.length} scheduled · nearest 128 within 90 days. Delivery is not completion.';
    } catch (_) {
      status = 'Native scheduling could not be reconciled. In-app sources remain available. Retry; previously registered notifications may remain until cancellation succeeds.';
    }
    if (!closed) notifyListeners();
  }

  void _tap(String payload) {
    if (closed) return;
    pendingTap = payload;
    if (navigate != null) unawaited(openPendingTap());
  }

  Future<void> openPendingTap() async {
    final payload = pendingTap;
    if (payload == null || navigate == null) return;
    pendingTap = null;
    if (!RegExp(r'^p5:[a-f0-9]{64}$').hasMatch(payload)) return;
    final rows = await store.db.getAll(
      'SELECT source_id,generation FROM device_reminder WHERE logical_key=?',
      [payload.substring(3)],
    );
    if (closed) return;
    final row = rows.firstOrNull;
    final item = row == null
        ? null
        : sources()
              .where(
                (s) =>
                    s.id == row['source_id'] &&
                    s.generation == row['generation'],
              )
              .firstOrNull;
    navigate?.call(item);
  }

  Future<List<Map<String, dynamic>>> history() async => (await store.db.getAll(
    'SELECT source_id,generation,due_utc,state FROM device_reminder ORDER BY os_id DESC LIMIT 100',
  )).map((r) => Map<String, dynamic>.from(r)).toList();
  Future<void> stop() async {
    closed = true;
    _timer?.cancel();
    _binding?.removeObserver(this);
    await _work;
    if (device is NativeNotificationDevice) {
      await (device as NativeNotificationDevice).detach();
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) unawaited(reconcile());
  }

  @override
  void dispose() {
    unawaited(stop());
    super.dispose();
  }
}

DateTime deferQuiet(
  DateTime instant,
  Map<String, dynamic> prefs,
  String timezone,
) {
  if (prefs['quiet'] != true) return instant;
  final zone = LifeTime.zone(timezone),
      local = tz.TZDateTime.from(instant, zone);
  int minutes(String s) {
    final p = s.split(':');
    return int.parse(p[0]) * 60 + int.parse(p[1]);
  }

  final start = minutes(prefs['start'] as String),
      end = minutes(prefs['end'] as String),
      value = local.hour * 60 + local.minute;
  final inside = start < end
      ? value >= start && value < end
      : value >= start || value < end;
  if (!inside) return instant;
  final date = DateTime.utc(
    local.year,
    local.month,
    local.day,
  ).add(Duration(days: start > end && value >= start ? 1 : 0));
  // DST gaps can move the quiet endpoint. Choose the first valid minute after
  // it, and the later fold if duplicated, preserving the quiet interval.
  for (var n = 0; n <= 180; n++) {
    final wall = date.add(Duration(minutes: end + n)),
        text = wall.toIso8601String();
    final candidates = LifeTime.candidates(
      text.substring(0, 10),
      text.substring(11, 16),
      timezone,
    );
    if (candidates.isNotEmpty) return candidates.last;
  }
  lifeReject('Quiet-hour endpoint cannot be resolved in this timezone.');
}
