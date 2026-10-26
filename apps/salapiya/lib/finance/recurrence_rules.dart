part of '../local/finance_domain.dart';

const nativeRecurrenceCommands = {
  'recurrence',
  'recurrenceGenerate',
  'occurrenceOverride',
  'recurrenceLink',
  'recurrenceUnlink',
};
bool _zonesReady = false;
tz.Location financeZone(String name) {
  if (!_zonesReady) {
    tzdata.initializeTimeZones();
    _zonesReady = true;
  }
  try {
    return tz.getLocation(name);
  } catch (_) {
    reject('Choose a supported named IANA timezone.');
  }
}

String financeZoneToday(String name) =>
    tz.TZDateTime.now(financeZone(name)).toIso8601String().substring(0, 10);
String occurrenceIdentity(LocalRevision rule, String logical) {
  final digest = crypto.sha256
      .convert(
        utf8.encode(
          'salapiya-recurring-1:${rule.actionId}:${rule.number}:$logical',
        ),
      )
      .toString();
  return '${digest.substring(0, 8)}-${digest.substring(8, 12)}-5${digest.substring(13, 16)}-a${digest.substring(17, 20)}-${digest.substring(20, 32)}';
}

List<String> recurringDates(
  Map<String, String> v,
  String from,
  String through,
) {
  planningDate(from);
  planningDate(through);
  final start = DateTime.parse('${planningDate(v['start'] ?? '')}T00:00:00Z');
  final to = DateTime.parse('${through}T00:00:00Z'),
      windowStart = DateTime.parse('${from}T00:00:00Z');
  if (to.isBefore(windowStart) || to.difference(windowStart).inDays > 365) {
    reject('Generate an inclusive window of at most 366 days.');
  }
  financeZone(v['timezone'] ?? '');
  final frequency = v['frequency'],
      interval = int.tryParse(v['interval'] ?? '') ?? 0;
  if (interval < 1 ||
      interval >
          (frequency == 'daily'
              ? 365
              : frequency == 'weekly'
              ? 52
              : 120) ||
      !['daily', 'weekly', 'monthly'].contains(frequency)) {
    reject('Choose a supported recurrence interval.');
  }
  final weekdays = (v['weekdays'] ?? '')
      .split(',')
      .where((v) => v.isNotEmpty)
      .map(int.tryParse)
      .toList();
  if (frequency == 'weekly' &&
      (weekdays.isEmpty ||
          weekdays.any((d) => d == null || d < 1 || d > 7) ||
          weekdays.toSet().length != weekdays.length)) {
    reject('Select distinct ISO weekdays 1–7.');
  }
  final monthDay = int.tryParse(v['monthDay'] ?? '') ?? 0;
  if (frequency == 'monthly' &&
      (monthDay < 1 ||
          monthDay > 31 ||
          !['last_valid_day', 'skip'].contains(v['monthPolicy']))) {
    reject('Choose a monthly day and explicit short-month policy.');
  }
  final end = (v['end'] ?? '').isEmpty ? null : planningDate(v['end']!);
  if (end != null && end.compareTo(v['start']!) < 0) {
    reject('Recurrence end cannot precede its start.');
  }
  final limit = (v['count'] ?? '').isEmpty
      ? null
      : int.tryParse(v['count']!) ?? 0;
  if (limit != null && (limit < 1 || limit > 10000)) {
    reject('Bound a rule to 1–10,000 emitted occurrences.');
  }
  final result = <String>[];
  var emitted = 0, work = 0;
  final monday = start.subtract(Duration(days: start.weekday - 1));
  for (
    var day = start;
    !day.isAfter(to);
    day = day.add(const Duration(days: 1))
  ) {
    if (++work > 100000) {
      reject('Calendar history exceeds the supported work bound.');
    }
    final label = day.toIso8601String().substring(0, 10);
    if (end != null && label.compareTo(end) > 0) break;
    var match = false;
    if (frequency == 'daily') {
      match = day.difference(start).inDays % interval == 0;
    }
    if (frequency == 'weekly') {
      match =
          day.difference(monday).inDays ~/ 7 % interval == 0 &&
          weekdays.contains(day.weekday);
    }
    if (frequency == 'monthly') {
      final month = (day.year - start.year) * 12 + day.month - start.month;
      final last = DateTime.utc(day.year, day.month + 1, 0).day;
      final wanted = v['monthPolicy'] == 'last_valid_day' && monthDay > last
          ? last
          : monthDay;
      match = month % interval == 0 && day.day == wanted;
    }
    if (!match) continue;
    emitted++;
    if (limit != null && emitted > limit) break;
    if (!day.isBefore(windowStart)) {
      result.add(label);
      if (result.length > 500) {
        reject('At most 500 emitted dates per generation.');
      }
    }
  }
  return result;
}

List<LocalRevision> effectiveRecurringLinks(
  LocalSnapshot s,
  String occurrence,
) => s.current
    .where(
      (r) =>
          financeType(r) == 'recurrenceLink' &&
          r.values['occurrence'] == occurrence &&
          !s.current.any(
            (u) =>
                financeType(u) == 'recurrenceUnlink' &&
                u.values['link'] == r.id,
          ),
    )
    .toList();
LocalRevision recurrenceRule(LocalSnapshot s, String id) {
  final r = s.revision(id);
  if (financeType(r) != 'recurrence') {
    reject('Choose an owned immutable recurring rule.');
  }
  return r;
}

void planRecurrence(FinanceRuleContext c) {
  final s = c.s, v = c.v, op = c.operation;
  if (op == 'recurrence') {
    c.total = c.money('amount');
    if (![
          'income',
          'bill',
          'subscription',
        ].contains(c.value('recurringKind')) ||
        !['active', 'archived'].contains(c.value('status'))) {
      reject('Choose recurring kind and lifecycle.');
    }
    final start = planningDate(c.text('start'));
    recurringDates(v, start, start);
    if (c.value('account').isNotEmpty) s.account(c.value('account'));
    if (c.value('category').isNotEmpty) {
      s.category(
        c.value('category'),
        c.value('recurringKind') == 'income' ? 'income' : 'expense',
      );
    }
    if (c.old != null &&
        start.compareTo(c.date) <= 0 &&
        c.value('status') != 'archived') {
      reject('Future rule replacement requires an explicitly future boundary.');
    }
    c.effects.add(
      'Expected activity only. Reaching a date never posts money or proves payment.',
    );
    return;
  }
  if (op == 'recurrenceUnlink') {
    if (c.old != null) {
      reject('Link reversals cannot be corrected or reversed.');
    }
    final link = c.ref('link', {'recurrenceLink'});
    if (s.current.any(
      (r) => financeType(r) == op && r.values['link'] == link.id,
    )) {
      reject('This link is already reversed.');
    }
    c.text('reason');
    c.source = link.id;
    c.total = link.amount;
    return;
  }
  if (c.old != null) {
    reject(
      'Use a new occurrence decision or exact link reversal. Preserve earlier evidence.',
    );
  }
  final rule = recurrenceRule(s, c.text('rule'));
  if (op == 'recurrenceGenerate') {
    if (!s.current.contains(rule) || rule.values['status'] != 'active') {
      reject('Generate only the current active rule.');
    }
    final dates = recurringDates(
      rule.values,
      c.text('from'),
      c.text('through'),
    );
    v['dates'] = jsonEncode(dates);
    c.total = BigInt.zero;
    c.source = rule.id;
    return;
  }
  final logical = planningDate(c.text('logicalDate'));
  if (!recurringDates(rule.values, logical, logical).contains(logical) ||
      !s.current.any(
        (r) =>
            financeType(r) == 'recurrenceGenerate' &&
            r.values['rule'] == rule.id &&
            (jsonDecode(r.values['dates']!) as List).contains(logical),
      )) {
    reject('Generate this logical occurrence explicitly first.');
  }
  final occurrence = occurrenceIdentity(rule, logical);
  v['occurrence'] = occurrence;
  final overrides = s.current
      .where(
        (r) =>
            financeType(r) == 'occurrenceOverride' &&
            r.values['occurrence'] == occurrence,
      )
      .toList();
  final override = overrides.lastOrNull;
  final linked = sumMinor(
    effectiveRecurringLinks(s, occurrence).map((r) => r.amount),
  );
  final expected = override?.amount ?? rule.amount;
  final terminal = ['skipped', 'cancelled'].contains(override?.values['state']);
  if (op == 'occurrenceOverride') {
    if (terminal) {
      reject('Skipped/cancelled generations remain terminal history.');
    }
    c.total = c.money('amount');
    planningDate(c.text('due'));
    if (!['planned', 'skipped', 'cancelled'].contains(c.value('state')) ||
        c.total < linked ||
        (c.value('state') != 'planned' && linked != BigInt.zero)) {
      reject(
        'Resolve actual links before cancelling, skipping or reducing this expectation.',
      );
    }
    c.text('reason');
    c.source = override?.id ?? rule.id;
    return;
  }
  if (op != 'recurrenceLink' || terminal) {
    reject('This occurrence cannot accept actual links.');
  }
  final actual = s.revision(c.text('actual'));
  if (!s.current.contains(actual) ||
      (rule.values['recurringKind'] == 'income'
          ? actual.kind != 'income'
          : !['expense', 'cardPurchase'].contains(financeType(actual)))) {
    reject('Choose eligible current actual income or purchase evidence.');
  }
  c.total = c.money('amount');
  final used = sumMinor(
    s.current
        .where(
          (r) =>
              financeType(r) == op &&
              r.values['actual'] == actual.id &&
              !s.current.any(
                (u) =>
                    financeType(u) == 'recurrenceUnlink' &&
                    u.values['link'] == r.id,
              ),
        )
        .map((r) => r.amount),
  );
  if (linked + c.total > expected || used + c.total > actual.amount) {
    reject('Actual links exceed expected or remaining actual capacity.');
  }
  c.source = actual.id;
  c.effects.add(
    'Link existing actual evidence only. No extra cash, income, expense or payment is created.',
  );
}
