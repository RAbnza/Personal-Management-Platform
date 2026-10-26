part of '../local/finance_domain.dart';

const nativePlanningCommands = {
  'budget',
  'savingsGoal',
  'reservation',
  'savingsReallocation',
};
String planningDate(String input, {bool exclusive = false}) {
  final date = civilDate(input);
  if (date.compareTo(exclusive ? '2200-01-01' : '2199-12-31') > 0) {
    reject('Planning dates support 1900–2199.');
  }
  return date;
}

BigInt savingsReserved(
  LocalSnapshot s, {
  String? goal,
  String? account,
  String? excluding,
}) {
  var total = BigInt.zero;
  for (final r in s.current.where((r) => r.id != excluding)) {
    if (financeType(r) == 'reservation' &&
        (goal == null || r.values['goal'] == goal) &&
        (account == null || r.values['account'] == account)) {
      total += parseMinor(r.values['delta']!);
    }
    if (financeType(r) == 'savingsReallocation') {
      if ((goal == null || r.values['fromGoal'] == goal) &&
          (account == null || r.values['fromAccount'] == account)) {
        total -= r.amount;
      }
      if ((goal == null || r.values['goal'] == goal) &&
          (account == null || r.values['account'] == account)) {
        total += r.amount;
      }
    }
  }
  return total;
}

BigInt eligibleSavings(LocalSnapshot s, String account, String asOf) {
  final a = s.account(account);
  if (a.archived || a.cutoff.compareTo(asOf) > 0) return BigInt.zero;
  final value = s.balance(account, through: asOf);
  return value > BigInt.zero ? value : BigInt.zero;
}

(BigInt, BigInt) supportedSavings(LocalSnapshot s, String goal, String asOf) {
  var lower = BigInt.zero, upper = BigInt.zero;
  for (final account in s.accounts) {
    final reserved = savingsReserved(s, goal: goal, account: account.id);
    final all = savingsReserved(s, account: account.id),
        capacity = eligibleSavings(s, account.id, asOf);
    final min = capacity - (all - reserved),
        max = capacity < reserved ? capacity : reserved;
    lower += min < BigInt.zero
        ? BigInt.zero
        : min > reserved
        ? reserved
        : min;
    upper += max;
  }
  return (lower, upper);
}

void planPlanning(FinanceRuleContext c) {
  final s = c.s, v = c.v, op = c.operation;
  switch (op) {
    case 'budget':
      s.category(c.text('category'), 'expense');
      c.total = c.money('amount', zero: true, wide: true);
      final start = planningDate(c.text('start')),
          end = planningDate(c.text('endExclusive'), exclusive: true);
      final days = DateTime.parse('${end}T00:00:00Z')
          .difference(DateTime.parse('${start}T00:00:00Z'))
          .inDays;
      if (days < 1 || days > 366) {
        reject('Budget periods use 1–366 days with an exclusive end.');
      }
      if (!['net', 'gross'].contains(c.value('basis')) ||
          !['active', 'archived'].contains(c.value('status'))) {
        reject('Choose budget spending basis and lifecycle.');
      }
      if (s.current.any(
        (r) =>
            r.id != c.old?.id &&
            financeType(r) == op &&
            r.values['category'] == c.value('category') &&
            r.values['start']!.compareTo(end) < 0 &&
            start.compareTo(r.values['endExclusive']!) < 0,
      )) {
        reject(
          'This category already has an overlapping budget, including archived periods.',
        );
      }
      c.effects.add(
        'Spending allowance only. Net/gross comparisons use the whole explicit period; no money is posted.',
      );
    case 'savingsGoal':
      c.total = c.money('amount', wide: true);
      if (c.value('targetDate').isNotEmpty) planningDate(c.value('targetDate'));
      if (!['active', 'completed', 'archived'].contains(c.value('status'))) {
        reject('Choose an explicit goal state.');
      }
      if (c.value('status') == 'archived' &&
          savingsReserved(s, goal: c.old?.actionId ?? c.command.id) !=
              BigInt.zero) {
        reject('Release reservations explicitly before archiving this goal.');
      }
      c.effects.add(
        'Goal target and state are management evidence, not an asset or automatic transfer.',
      );
    case 'reservation':
    case 'savingsReallocation':
      if (c.old != null) {
        reject(
          'Change reservations through a new reviewed absolute reservation or reallocation. Preserve earlier decisions.',
        );
      }
      final goal = c.ref('goal', {'savingsGoal'});
      final account = s.account(c.text('account'));
      v['goal'] = goal.actionId;
      c.total = c.money('amount', zero: op == 'reservation', wide: true);
      final current = savingsReserved(
        s,
        goal: goal.actionId,
        account: account.id,
      );
      final total = savingsReserved(s, account: account.id);
      BigInt increase;
      if (op == 'reservation') {
        increase = c.total - current;
        v['delta'] = '$increase';
      } else {
        if (c.total == BigInt.zero) {
          reject('Reallocate a positive reserved amount.');
        }
        final origin = c.ref('fromGoal', {'savingsGoal'});
        final fromAccount = s.account(c.text('fromAccount'));
        v['fromGoal'] = origin.actionId;
        if (origin.actionId == goal.actionId && fromAccount.id == account.id ||
            c.total >
                savingsReserved(
                  s,
                  goal: origin.actionId,
                  account: fromAccount.id,
                )) {
          reject(
            'Choose distinct reservations with sufficient existing reserved money.',
          );
        }
        increase = fromAccount.id == account.id ? BigInt.zero : c.total;
      }
      if (c.total > current && op == 'reservation' ||
          op == 'savingsReallocation') {
        if (goal.values['status'] != 'active' ||
            account.archived ||
            account.cutoff.compareTo(c.date) > 0 ||
            total + increase > eligibleSavings(s, account.id, c.date)) {
          reject(
            'New or increased reservations require an active goal and supported actual cash capacity.',
          );
        }
      }
      c.effects.add(
        'Reservations remain separate from actual liquid assets. Spending may subsequently underfund them; no goal wins automatically.',
      );
    default:
      reject('Unsupported planning command.');
  }
}

BigInt budgetSpending(LocalSnapshot s, LocalRevision budget) => sumMinor(
  s.current
      .expand((r) => r.postings)
      .where(
        (p) =>
            p.ledger == 'expense' &&
            p.category == budget.values['category'] &&
            p.date.compareTo(budget.values['start']!) >= 0 &&
            p.date.compareTo(budget.values['endExclusive']!) < 0 &&
            (budget.values['basis'] == 'net' || p.amount > BigInt.zero),
      )
      .map((p) => p.amount),
);
