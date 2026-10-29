import 'package:flutter/foundation.dart';

import 'dart:async';

import '../../planning/application/planning_controller.dart';
import '../../finance/application/financial_controller.dart';

enum LifeKind { task, learning, book }

class LifeEntry {
  LifeEntry(
    this.id,
    this.kind,
    this.title, {
    this.detail = '',
    this.due = '',
    this.priority = 'Normal',
    this.total = 1,
    this.progress = 0,
  });
  final String id;
  final LifeKind kind;
  String title, detail, due, priority, status = 'In progress', notes = '';
  int total, progress, version = 1;
  bool archived = false;
  final List<String> history = ['Created in the demo household'];
}

class PersonalEvent {
  PersonalEvent(
    this.id,
    this.title,
    this.date,
    this.time,
    this.location,
    this.notes,
  );
  final String id;
  String title, date, time, location, notes;
  bool cancelled = false;
  int version = 1;
  final List<String> history = [];
}

class CareerApplication {
  CareerApplication(
    this.id,
    this.company,
    this.position,
    this.date, {
    this.stage = 'Applied',
    this.location = 'Metro Manila',
    this.notes = '',
  });
  final String id;
  String company, position, date, stage, location, notes;
  bool archived = false;
  int version = 1;
  final List<CareerEvent> events = [];
  final List<String> history = [];
}

class CareerEvent {
  CareerEvent(this.id, this.kind, this.date, this.time, this.notes);
  final String id;
  String kind, date, time, notes;
  bool complete = false;
  int version = 1;
}

class AgendaItem {
  const AgendaItem(
    this.id,
    this.sourceId,
    this.kind,
    this.title,
    this.date,
    this.time,
    this.version, {
    this.amount,
    this.sourceGeneration,
    this.utc,
    this.timezone = 'Asia/Manila',
  });
  final String id, sourceId, kind, title, date, time;
  final int version;
  final BigInt? amount;
  final String? sourceGeneration;
  final DateTime? utc;
  final String timezone;
  String get generation =>
      sourceGeneration ?? '$id:$version:$date:$time:$amount';
}

class ReminderChoice {
  ReminderChoice(this.generation, this.mode, this.state);
  final String generation;
  String mode, state;
}

class LifeController extends ChangeNotifier {
  LifeController({bool demo = true}) {
    if (demo) reset();
  }
  final List<LifeEntry> entries = [];
  final List<PersonalEvent> events = [];
  final List<CareerApplication> applications = [];
  final Map<String, ReminderChoice> reminders = {};
  final List<String> reminderHistory = [];
  bool permission = true, quietHours = true, sensitiveContent = false;
  String quietStart = '22:00', quietEnd = '07:00';
  int serial = 0, revision = 0;
  void changed() {
    revision++;
    notifyListeners();
  }

  void reset({bool empty = false}) {
    entries.clear();
    events.clear();
    applications.clear();
    reminders.clear();
    reminderHistory.clear();
    permission = true;
    quietHours = true;
    sensitiveContent = false;
    if (!empty) {
      entries.addAll([
        LifeEntry(
          'chapter',
          LifeKind.task,
          'A chapter for yourself',
          detail: 'Twenty quiet minutes with a book',
          due: '2026-10-24',
          priority: 'Normal',
        ),
        LifeEntry(
          'portfolio',
          LifeKind.task,
          'Polish the portfolio case study',
          detail: 'Make the decision process clear',
          due: '2026-10-22',
          priority: 'High',
        ),
        LifeEntry(
          'walk',
          LifeKind.task,
          'An evening walk',
          detail: 'A little time outdoors',
          due: '2026-10-21',
          priority: 'Low',
        ),
        LifeEntry(
          'dart',
          LifeKind.learning,
          'Thoughtful interfaces with Flutter',
          detail: 'Self-paced course · 12 lessons',
          due: '2026-11-15',
          total: 12,
          progress: 5,
        ),
        LifeEntry(
          'spanish',
          LifeKind.learning,
          'Everyday Spanish',
          detail: 'Practice sessions',
          due: '2026-12-01',
          total: 30,
          progress: 8,
        ),
        LifeEntry(
          'book-1',
          LifeKind.book,
          'The Art of Noticing',
          detail: 'Rob Walker',
          due: '2026-11-10',
          total: 256,
          progress: 96,
        ),
        LifeEntry(
          'book-2',
          LifeKind.book,
          'A Field Guide to Getting Lost',
          detail: 'Rebecca Solnit',
          due: '2026-12-01',
          total: 224,
          progress: 32,
        ),
      ]);
      events.add(
        PersonalEvent(
          'dentist',
          'Dental appointment',
          '2026-10-26',
          '09:30',
          'Quezon City',
          'Bring the appointment card.',
        ),
      );
      applications.addAll([
        CareerApplication(
            'studio',
            'Amihan Studio',
            'Product designer',
            '2026-10-16',
            stage: 'Interview',
            notes: 'Fictional team · design systems and thoughtful products',
          )
          ..events.add(
            CareerEvent(
              'interview',
              'Interview',
              '2026-10-23',
              '10:00',
              'Portfolio conversation · online',
            ),
          )
          ..history.add('Applied 16 Oct → interview invitation 20 Oct'),
        CareerApplication(
            'bayan',
            'Bayan Digital',
            'Flutter developer',
            '2026-10-19',
            notes: 'Fictional company · hybrid',
          )
          ..events.add(
            CareerEvent(
              'follow-up',
              'Follow-up',
              '2026-10-29',
              '14:00',
              'Check the application status.',
            ),
          ),
        CareerApplication(
          'north',
          'North & Co.',
          'UX engineer',
          '2026-10-20',
          stage: 'Saved',
        ),
      ]);
    }
    changed();
  }

  FutureOr<void> saveEntry(
    LifeKind kind,
    Map<String, String> v, {
    LifeEntry? old,
  }) {
    final due = v['due'] ?? '';
    if (due.isNotEmpty) dateValue(due);
    final total = kind == LifeKind.task
        ? 1
        : int.tryParse(v['total'] ?? '') ?? 0;
    final progress = kind == LifeKind.task
        ? (old?.progress ?? 0)
        : int.tryParse(v['progress'] ?? '') ?? -1;
    if (total <= 0 || progress < 0 || progress > total) {
      throw const FormatException(
        'Progress must be between zero and the positive goal.',
      );
    }
    final e = old ?? LifeEntry('life-${++serial}', kind, v['title']!);
    e.history.add(
      'v${e.version} · ${old == null ? 'Created' : v['reason']} · ${e.title} · $progress / $total',
    );
    e.title = v['title']!;
    e.detail = v['detail'] ?? '';
    e.due = due;
    e.priority = v['priority'] ?? 'Normal';
    e.total = total;
    e.progress = progress;
    e.notes = v['notes'] ?? '';
    e.status = progress == total ? 'Completed' : 'In progress';
    e.version++;
    if (old == null) entries.add(e);
    changed();
  }

  FutureOr<void> progress(LifeEntry e, int value, String note) {
    if (value < 0 || value > e.total || e.archived) {
      throw const FormatException('Choose valid progress on an active record.');
    }
    e.history.add('Progress ${e.progress} → $value / ${e.total} · $note');
    e.progress = value;
    e.status = value == e.total ? 'Completed' : 'In progress';
    e.version++;
    changed();
  }

  FutureOr<void> archive(LifeEntry e) {
    e.archived = !e.archived;
    e.version++;
    e.history.add(
      e.archived
          ? 'Archived; active reminders cancelled'
          : 'Restored; current deadline projection resumed',
    );
    changed();
  }

  FutureOr<void> saveEvent(Map<String, String> v, {PersonalEvent? old}) {
    dateValue(v['date']!);
    validateTime(v['time']!);
    final e =
        old ??
        PersonalEvent(
          'event-${++serial}',
          v['title']!,
          v['date']!,
          v['time']!,
          v['location'] ?? '',
          v['notes'] ?? '',
        );
    e.history.add(
      'v${e.version} · ${e.date} ${e.time} · ${old == null ? 'Created' : v['reason']}',
    );
    e.title = v['title']!;
    e.date = v['date']!;
    e.time = v['time']!;
    e.location = v['location'] ?? '';
    e.notes = v['notes'] ?? '';
    e.version++;
    if (old == null) events.add(e);
    changed();
  }

  static void validateTime(String value) {
    if (!RegExp(r'^([01]\d|2[0-3]):[0-5]\d$').hasMatch(value)) {
      throw const FormatException('Use a 24-hour time (HH:MM).');
    }
  }

  FutureOr<void> saveApplication(
    Map<String, String> v, {
    CareerApplication? old,
  }) {
    dateValue(v['date']!);
    final a =
        old ??
        CareerApplication(
          'career-${++serial}',
          v['company']!,
          v['position']!,
          v['date']!,
        );
    a.history.add(
      'v${a.version} · ${a.stage} → ${v['stage']} · ${v['reason'] ?? 'Created'}',
    );
    a.company = v['company']!;
    a.position = v['position']!;
    a.date = v['date']!;
    a.stage = v['stage']!;
    a.location = v['location'] ?? '';
    a.notes = v['notes'] ?? '';
    a.version++;
    if (old == null) applications.add(a);
    changed();
  }

  FutureOr<void> saveCareerEvent(
    CareerApplication a,
    Map<String, String> v, {
    CareerEvent? old,
  }) {
    dateValue(v['date']!);
    validateTime(v['time']!);
    final e =
        old ??
        CareerEvent(
          'career-event-${++serial}',
          v['kind']!,
          v['date']!,
          v['time']!,
          v['notes'] ?? '',
        );
    a.history.add(
      '${old == null ? 'Added' : 'Revised'} ${e.kind} · ${e.date} ${e.time}',
    );
    e.kind = v['kind']!;
    e.date = v['date']!;
    e.time = v['time']!;
    e.notes = v['notes'] ?? '';
    e.version++;
    a.version++;
    if (old == null) a.events.add(e);
    changed();
  }

  List<AgendaItem> agenda(
    PlanningController p,
    FinancialController f, {
    bool financial = true,
  }) {
    final result = <AgendaItem>[
      for (final e in events.where((e) => !e.cancelled))
        AgendaItem(e.id, e.id, 'Personal', e.title, e.date, e.time, e.version),
      for (final e in entries.where(
        (e) => !e.archived && e.status != 'Completed' && e.due.isNotEmpty,
      ))
        AgendaItem(
          e.id,
          e.id,
          switch (e.kind) {
            LifeKind.task => 'Tasks',
            LifeKind.learning => 'Learning',
            LifeKind.book => 'Books',
          },
          e.title,
          e.due,
          'All day',
          e.version,
        ),
      for (final a in applications.where(
        (a) =>
            !a.archived &&
            !['Rejected', 'Withdrawn', 'Accepted'].contains(a.stage),
      ))
        for (final e in a.events.where((e) => !e.complete))
          AgendaItem(
            e.id,
            a.id,
            'Career',
            '${e.kind} · ${a.company}',
            e.date,
            e.time,
            e.version + a.version,
          ),
      if (financial) ...[
        for (final o in p.occurrences.where(
          (o) => o.active && o.remaining > BigInt.zero,
        ))
          AgendaItem(
            o.id,
            o.id,
            'Recurring',
            p.rules.firstWhere((r) => r.id == o.ruleId).name,
            o.due,
            'All day',
            o.version,
            amount: o.remaining,
          ),
        for (final statement in f.statementDefinitions.where(
          (x) => x.balance > (f.statementCoverage[x.id] ?? BigInt.zero),
        ))
          AgendaItem(
            'card-due:${statement.id}',
            statement.id,
            'Cards',
            'Card statement due',
            statement.due,
            'All day',
            statement.version,
            amount:
                statement.balance -
                (f.statementCoverage[statement.id] ?? BigInt.zero),
          ),
        for (final d in f.debts.where(
          (d) =>
              d.principal + d.charges > BigInt.zero &&
              d.contractualPaid < d.expected * BigInt.from(d.installments),
        ))
          AgendaItem(
            'debt-${d.id}',
            d.id,
            'Debts',
            d.contractualPaid > BigInt.zero
                ? '${d.name} · review due coverage'
                : d.name,
            d.firstDue,
            'All day',
            d.scheduleVersion,
            amount: d.contractualPaid > BigInt.zero ? null : d.expected,
          ),
      ],
    ];
    result.sort(
      (a, b) => '${a.date} ${a.time}'.compareTo('${b.date} ${b.time}'),
    );
    return result;
  }

  String reminderState(AgendaItem item) {
    if (!permission) return 'Permission denied · in-app only';
    final r = reminders[item.id];
    if (r != null && r.generation != item.generation) {
      return 'Old reminder cancelled · source changed';
    }
    if (r?.mode == 'Off') return 'Reminder off';
    return r?.state ?? 'Planned on this device · demo only';
  }

  FutureOr<void> reminder(AgendaItem item, String mode, String action) {
    reminders[item.id] = ReminderChoice(item.generation, mode, action);
    reminderHistory.add('${item.title} · $mode · $action · ${item.generation}');
    changed();
  }

  FutureOr<void> cancelEvent(PersonalEvent e, String reason) {
    e.cancelled = !e.cancelled;
    e.version++;
    e.history.add('${e.cancelled ? 'Cancelled' : 'Restored'} · $reason');
    changed();
  }

  FutureOr<void> archiveApplication(CareerApplication a) {
    a.archived = !a.archived;
    a.version++;
    a.history.add(a.archived ? 'Archived' : 'Restored');
    changed();
  }

  FutureOr<void> completeCareerEvent(CareerApplication a, CareerEvent e) {
    e.complete = !e.complete;
    e.version++;
    a.history.add('${e.kind} ${e.complete ? 'completed' : 'reopened'}');
    changed();
  }
}
