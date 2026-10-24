import 'package:flutter/foundation.dart';

import '../../finance/application/financial_controller.dart';
import '../../finance/contracts/financial_models.dart';

String civil(DateTime d) => d.toIso8601String().substring(0, 10);
DateTime dateValue(String value) {
  final d = DateTime.tryParse(value);
  if (d == null || civil(d) != value || d.year < 1900 || d.year > 2199) {
    throw const FormatException(
      'Use a valid date from 1900–2199 (YYYY-MM-DD).',
    );
  }
  return d;
}

BigInt minor(String value, {bool zero = true}) {
  if (!RegExp(r'^\d+(\.\d{1,2})?$').hasMatch(value.trim())) {
    throw const FormatException(
      'Enter a positive PHP amount with at most two decimals.',
    );
  }
  final parts = value.trim().split('.');
  final result =
      BigInt.parse(parts[0]) * BigInt.from(100) +
      BigInt.parse(parts.length == 1 ? '0' : parts[1].padRight(2, '0'));
  if ((!zero && result == BigInt.zero) ||
      result > BigInt.parse('9223372036854775807')) {
    throw const FormatException('Amount is outside the supported demo range.');
  }
  return result;
}

class PlanRule {
  PlanRule(
    this.id,
    this.name,
    this.kind,
    this.amount,
    this.start,
    this.frequency,
    this.interval,
    this.day,
    this.monthEnd,
    this.account,
    this.end,
    this.count,
    this.weekdays,
  );
  final String id, name, kind, start, frequency, monthEnd, account, end;
  final BigInt amount;
  final int interval, day, count;
  final Set<int> weekdays;
  int version = 1;
  bool archived = false;
  final List<String> history = [];
}

class Occurrence {
  Occurrence(this.id, this.ruleId, this.logical, this.due, this.expected);
  final String id, ruleId, logical;
  String due, state = 'Planned';
  int version = 1;
  BigInt expected;
  final Map<String, BigInt> links = {};
  final List<String> history = [];
  BigInt get linked => ExactFinance.sum(links.values);
  BigInt get remaining => expected - linked;
  bool get active => state != 'Skipped' && state != 'Cancelled';
}

class BudgetPlan {
  BudgetPlan(
    this.id,
    this.category,
    this.start,
    this.end,
    this.limit,
    this.basis,
  );
  final String id;
  String category, start, end, basis;
  BigInt limit;
  bool archived = false;
  final List<String> history = [];
}

class SavingsPlan {
  SavingsPlan(this.id, this.name, this.target, this.due);
  final String id;
  String name, due, status = 'Active';
  BigInt target;
  final Map<String, BigInt> reservations = {};
  final List<String> history = [];
  BigInt get reserved => ExactFinance.sum(reservations.values);
}

/// All financial plans are memory-only evidence. No method posts money.
class PlanningController extends ChangeNotifier {
  PlanningController(this.finance) {
    reset();
  }
  final FinancialController finance;
  final List<PlanRule> rules = [];
  final List<Occurrence> occurrences = [];
  final List<BudgetPlan> budgets = [];
  final List<SavingsPlan> goals = [];
  int serial = 0, revision = 0;
  void changed() {
    revision++;
    notifyListeners();
  }

  void reset({bool empty = false}) {
    rules.clear();
    occurrences.clear();
    budgets.clear();
    goals.clear();
    if (!empty) {
      rules.addAll([
        PlanRule(
          'electricity',
          'Electricity',
          'Bill',
          BigInt.from(185000),
          '2026-10-25',
          'Monthly',
          1,
          25,
          'Last valid day',
          'account-1',
          '',
          12,
          {1},
        ),
        PlanRule(
          'salary',
          'Studio salary',
          'Income',
          BigInt.from(3200000),
          '2026-10-30',
          'Monthly',
          1,
          30,
          'Last valid day',
          'account-1',
          '',
          12,
          {1},
        ),
        PlanRule(
          'music',
          'Music subscription',
          'Subscription',
          BigInt.from(14900),
          '2026-10-27',
          'Monthly',
          1,
          27,
          'Last valid day',
          'account-2',
          '',
          12,
          {1},
        ),
      ]);
      for (final r in rules) {
        generate(r, '2026-10-21', '2026-12-31', notify: false);
      }
      budgets.addAll([
        BudgetPlan(
          'food',
          'Food & drink',
          '2026-10-01',
          '2026-10-31',
          BigInt.from(600000),
          'Net',
        ),
        BudgetPlan(
          'transport',
          'Transport',
          '2026-10-01',
          '2026-10-31',
          BigInt.from(250000),
          'Net',
        ),
        BudgetPlan(
          'groceries',
          'Groceries',
          '2026-10-01',
          '2026-10-31',
          BigInt.from(450000),
          'Net',
        ),
      ]);
      goals.addAll([
        SavingsPlan(
          'buffer',
          'A softer landing',
          BigInt.from(6000000),
          '2027-03-31',
        )..reservations['account-1'] = BigInt.from(1200000),
        SavingsPlan(
          'island',
          'A week in Siargao',
          BigInt.from(2500000),
          '2027-06-01',
        )..reservations['account-1'] = BigInt.from(500000),
      ]);
    }
    changed();
  }

  List<String> dates(PlanRule r, String from, String to) {
    final start = dateValue(r.start),
        lower = dateValue(from),
        upper = dateValue(to);
    if (upper.isBefore(lower) || upper.difference(lower).inDays > 365) {
      throw const FormatException(
        'Choose an inclusive window of at most 366 days.',
      );
    }
    final result = <String>[];
    var emitted = 0;
    final anchor = start.subtract(Duration(days: start.weekday - 1));
    for (var d = start; !d.isAfter(upper); d = d.add(const Duration(days: 1))) {
      final label = civil(d);
      if (r.end.isNotEmpty && label.compareTo(r.end) > 0) break;
      final months = (d.year - start.year) * 12 + d.month - start.month;
      final last = DateTime(d.year, d.month + 1, 0).day;
      final wantedDay = r.monthEnd == 'Last valid day'
          ? r.day.clamp(1, last)
          : r.day;
      final match = switch (r.frequency) {
        'Daily' => d.difference(start).inDays % r.interval == 0,
        'Weekly' =>
          (d.difference(anchor).inDays ~/ 7) % r.interval == 0 &&
              r.weekdays.contains(d.weekday),
        _ => months % r.interval == 0 && d.day == wantedDay,
      };
      if (!match) continue;
      emitted++;
      if (r.count > 0 && emitted > r.count) break;
      if (!d.isBefore(lower)) result.add(label);
      if (result.length > 500) {
        throw const FormatException('Narrow the preview to 500 occurrences.');
      }
    }
    return result;
  }

  void generate(PlanRule r, String from, String to, {bool notify = true}) {
    if (r.archived) return;
    for (final d in dates(r, from, to)) {
      if (!occurrences.any((o) => o.ruleId == r.id && o.logical == d)) {
        occurrences.add(Occurrence('${r.id}:$d', r.id, d, d, r.amount));
      }
    }
    if (notify) changed();
  }

  PlanRule saveRule(Map<String, String> v, {PlanRule? previous}) {
    final start = dateValue(v['start']!);
    final end = v['end'] ?? '';
    if (end.isNotEmpty && dateValue(end).isBefore(start)) {
      throw const FormatException('End precedes start.');
    }
    final interval = int.tryParse(v['interval'] ?? '') ?? 0;
    final frequency = v['frequency']!;
    final maximum = frequency == 'Daily'
        ? 365
        : frequency == 'Weekly'
        ? 52
        : 120;
    final day = int.tryParse(v['day'] ?? '') ?? 0;
    final count = int.tryParse(v['count'] ?? '') ?? -1;
    final weekdays = (v['weekdays'] ?? '')
        .split(',')
        .map((x) => int.tryParse(x.trim()) ?? 0)
        .toSet();
    if (interval < 1 ||
        interval > maximum ||
        day < 1 ||
        day > 31 ||
        count < 0 ||
        count > 10000 ||
        (frequency == 'Weekly' &&
            (weekdays.isEmpty || weekdays.any((x) => x < 1 || x > 7)))) {
      throw const FormatException(
        'Check interval, month day, weekdays (1–7) and count (0 = unbounded).',
      );
    }
    if (previous != null && !start.isAfter(DateTime(2026, 10, 21))) {
      throw const FormatException(
        'A revised rule must begin after 21 October 2026.',
      );
    }
    final r = PlanRule(
      'rule-${++serial}',
      v['name']!,
      v['kind']!,
      minor(v['amount']!, zero: false),
      civil(start),
      frequency,
      interval,
      day,
      v['monthEnd']!,
      v['account']!,
      end,
      count,
      weekdays,
    );
    final previewEnd = civil(start.add(const Duration(days: 89)));
    dates(r, r.start, previewEnd);
    if (previous != null) {
      previous.archived = true;
      previous.history.add(
        'Superseded from ${r.start}; linked and historical occurrences retained.',
      );
      for (final o in occurrences.where(
        (o) =>
            o.ruleId == previous.id &&
            o.links.isEmpty &&
            o.logical.compareTo(r.start) >= 0 &&
            o.due.compareTo(r.start) >= 0 &&
            o.state == 'Planned',
      )) {
        o.state = 'Cancelled';
        o.version++;
      }
      r.version = previous.version + 1;
      r.history.add(
        'Replaces ${previous.name} v${previous.version} from ${r.start}',
      );
    }
    rules.add(r);
    generate(r, r.start, previewEnd);
    return r;
  }

  void exception(
    Occurrence o,
    String action,
    String due,
    String amount,
    String reason,
  ) {
    if (reason.trim().isEmpty) {
      throw const FormatException('Explain this exception.');
    }
    if (!o.active) {
      throw const FormatException(
        'Skipped/cancelled history cannot be regenerated.',
      );
    }
    final next = minor(amount, zero: false);
    dateValue(due);
    if (next < o.linked || (action == 'Skip' && o.links.isNotEmpty)) {
      throw const FormatException(
        'Reverse actual links before reducing or skipping this occurrence.',
      );
    }
    o.history.add(
      '${o.due} · ${ExactFinance.money(o.expected)} → $action · $reason',
    );
    o.due = due;
    o.version++;
    o.expected = next;
    o.state = action == 'Skip'
        ? 'Skipped'
        : o.linked == next
        ? 'Completed'
        : o.links.isEmpty
        ? 'Planned'
        : 'Partially linked';
    changed();
  }

  void link(Occurrence o, FinancialRecord r, BigInt amount) {
    final rule = rules.firstWhere((x) => x.id == o.ruleId);
    final used = ExactFinance.sum(
      occurrences.map((x) => x.links[r.id] ?? BigInt.zero),
    );
    final corrected = finance.records.any(
      (x) => x.sourceId == r.id && ['correction', 'reversal'].contains(x.kind),
    );
    if (!o.active ||
        corrected ||
        !(rule.kind == 'Income'
            ? r.kind == 'income'
            : ['expense', 'cardPurchase'].contains(r.kind)) ||
        amount <= BigInt.zero ||
        amount > o.remaining ||
        used + amount > r.amount) {
      throw const FormatException(
        'Select current eligible actual evidence with enough unlinked capacity.',
      );
    }
    o.links[r.id] = (o.links[r.id] ?? BigInt.zero) + amount;
    o.version++;
    finance.planningDependencies.add(r.id);
    o.history.add(
      'Linked ${ExactFinance.money(amount)} to ${r.title}; no new transaction.',
    );
    o.state = o.remaining == BigInt.zero ? 'Completed' : 'Partially linked';
    changed();
  }

  void unlink(Occurrence o, String id) {
    if (o.links.remove(id) == null) return;
    o.version++;
    if (!occurrences.any((x) => x.links.containsKey(id))) {
      finance.planningDependencies.remove(id);
    }
    o.history.add('Reversed link $id; original financial evidence retained.');
    o.state = o.links.isEmpty ? 'Planned' : 'Partially linked';
    changed();
  }

  void archiveRule(PlanRule r) {
    r.archived = true;
    r.history.add('Archived at 2026-10-21.');
    for (final o in occurrences.where(
      (o) =>
          o.ruleId == r.id &&
          o.links.isEmpty &&
          o.logical.compareTo('2026-10-21') >= 0 &&
          o.due.compareTo('2026-10-21') >= 0 &&
          o.state == 'Planned',
    )) {
      o.state = 'Cancelled';
      o.version++;
    }
    changed();
  }

  List<FinancialRecord> contributions(
    String from,
    String to, {
    String category = 'All',
    String account = 'All',
  }) => finance.records
      .where(
        (r) =>
            !r.sharedOnly &&
            r.date.compareTo(from) >= 0 &&
            r.date.compareTo(to) <= 0 &&
            (category == 'All' || r.categorySpending.containsKey(category)) &&
            (account == 'All' || r.accountId == account),
      )
      .toList();
  BigInt spending(String from, String to, String category, String basis) =>
      ExactFinance.sum(
        contributions(from, to, category: category).map(
          (r) =>
              basis == 'Gross' &&
                  ['refund', 'cardRefund', 'sharedRefund'].contains(r.kind)
              ? BigInt.zero
              : category == 'All'
              ? r.spending
              : (r.categorySpending[category] ?? BigInt.zero),
        ),
      );
  void saveBudget(Map<String, String> v, {BudgetPlan? old}) {
    final start = dateValue(v['start']!), end = dateValue(v['end']!);
    if (end.isBefore(start) || end.difference(start).inDays > 365) {
      throw const FormatException('A budget period must contain 1–366 days.');
    }
    if (budgets.any(
      (b) =>
          b != old &&
          b.category == v['category'] &&
          b.start.compareTo(v['end']!) <= 0 &&
          b.end.compareTo(v['start']!) >= 0,
    )) {
      throw const FormatException(
        'This category overlaps an existing or archived budget. Edit that budget instead.',
      );
    }
    final limit = minor(v['amount']!);
    final b =
        old ??
        BudgetPlan(
          'budget-${++serial}',
          v['category']!,
          v['start']!,
          v['end']!,
          limit,
          v['basis']!,
        );
    if (old != null) {
      b.history.add(
        '${b.start}–${b.end} · ${ExactFinance.money(b.limit)} · ${b.basis} → ${v['reason']}',
      );
    }
    b.category = v['category']!;
    b.start = v['start']!;
    b.end = v['end']!;
    b.limit = limit;
    b.basis = v['basis']!;
    if (old == null) budgets.add(b);
    changed();
  }

  BigInt capacity(String id) {
    final a = finance.account(id);
    final cash = cashThrough(id, '2026-10-21');
    return a.archived
        ? BigInt.zero
        : cash > BigInt.zero
        ? cash
        : BigInt.zero;
  }

  BigInt cashThrough(String id, String date) {
    final a = finance.account(id);
    if (a.cutoff.compareTo(date) > 0) return BigInt.zero;
    return a.balance -
        ExactFinance.sum(
          finance.records
              .where((r) => r.date.compareTo(date) > 0)
              .map((r) => r.cash[id] ?? BigInt.zero),
        );
  }

  BigInt get actualCash => ExactFinance.sum(
    finance.accounts.map((a) => cashThrough(a.id, '2026-10-21')),
  );

  BigInt reservedIn(String id) =>
      ExactFinance.sum(goals.map((g) => g.reservations[id] ?? BigInt.zero));
  (BigInt, BigInt) support(SavingsPlan g) {
    var lower = BigInt.zero, upper = BigInt.zero;
    for (final e in g.reservations.entries) {
      final c = capacity(e.key), t = reservedIn(e.key), r = e.value;
      final low = c - (t - r);
      lower += low < BigInt.zero
          ? BigInt.zero
          : low > r
          ? r
          : low;
      upper += c < r ? c : r;
    }
    return (lower, upper);
  }

  void saveGoal(Map<String, String> v, {SavingsPlan? old}) {
    dateValue(v['due']!);
    final target = minor(v['amount']!, zero: false);
    final g =
        old ?? SavingsPlan('goal-${++serial}', v['name']!, target, v['due']!);
    g.history.add(
      '${old == null ? 'Created' : 'Revised'} target ${ExactFinance.money(target)} · ${v['reason'] ?? 'New goal'}',
    );
    g.name = v['name']!;
    g.target = target;
    g.due = v['due']!;
    if (old == null) goals.add(g);
    changed();
  }

  void reserve(SavingsPlan g, String account, BigInt amount) {
    final before = g.reservations[account] ?? BigInt.zero;
    if (amount < BigInt.zero ||
        (amount > before &&
            (g.status != 'Active' ||
                reservedIn(account) - before + amount > capacity(account)))) {
      throw const FormatException(
        'New reservations need an active goal and enough eligible cash across all goals. Releases remain available.',
      );
    }
    g.reservations[account] = amount;
    g.history.add(
      'Reservation ${ExactFinance.money(before)} → ${ExactFinance.money(amount)}; no money moved.',
    );
    changed();
  }

  void reallocate(
    SavingsPlan from,
    String source,
    SavingsPlan to,
    String destination,
    BigInt amount,
  ) {
    final before = from.reservations[source] ?? BigInt.zero;
    if (from == to && source == destination) {
      throw const FormatException('Choose a different goal or account.');
    }
    final targetTotal =
        reservedIn(destination) +
        (source == destination ? BigInt.zero : amount);
    if (amount <= BigInt.zero ||
        amount > before ||
        to.status != 'Active' ||
        targetTotal > capacity(destination)) {
      throw const FormatException(
        'Reallocation must be supported at the destination and cannot exceed the source reservation.',
      );
    }
    from.reservations[source] = before - amount;
    to.reservations[destination] =
        (to.reservations[destination] ?? BigInt.zero) + amount;
    from.history.add(
      'Reallocated ${ExactFinance.money(amount)} to ${to.name}.',
    );
    to.history.add('Received reservation from ${from.name}; no transfer.');
    changed();
  }

  void goalStatus(SavingsPlan g, String status) {
    if (status == 'Archived' && g.reserved != BigInt.zero) {
      throw const FormatException('Release all reservations before archiving.');
    }
    g.status = status;
    g.history.add(
      '$status · reservations retained unless explicitly released.',
    );
    changed();
  }
}
