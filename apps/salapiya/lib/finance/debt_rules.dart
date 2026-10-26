part of '../local/finance_domain.dart';

const nativeDebtCommands = {
  'debtImport',
  'borrowing',
  'debtPayment',
  'debtClassification',
  'debtSchedule',
  'debtPayoff',
};

void planDebt(FinanceRuleContext c) {
  final s = c.s, v = c.v, op = c.operation;
  if (['debtImport', 'borrowing'].contains(op)) {
    c.text('lender', max: 200);
    if (![
      'personal_loan',
      'installment_loan',
      'bnpl',
      'flexible_manual',
    ].contains(c.value('debtType'))) {
      reject('Choose a supported debt type.');
    }
    if (c.value('principal').isNotEmpty) c.money('principal');
    v['debt'] = c.old?.actionId ?? c.command.id;
    c.total = c.money('amount');
    if (op == 'debtImport') {
      c.post('debt_liability', -c.total);
      c.post('equity', c.total);
      c.effects.add(
        'Opening recognized liability only. No cash proceeds, income or new expense. Principal breakdown remains separately evidenced.',
      );
    } else {
      final withheld = c.money('withheld', zero: true),
          financed = c.money('financedFee', zero: true);
      if (withheld >= c.total || c.total + financed > maxComponent) {
        reject('Review net proceeds and financed fees.');
      }
      c.post('debt_liability', -(c.total + financed));
      if (c.value('fundingUse') == 'purchase') {
        if (withheld != BigInt.zero) {
          reject(
            'Purchase funding requires an explicit separate cash proceeds workflow for withheld fees.',
          );
        }
        c.expense(c.total);
      } else if (c.value('fundingUse') == 'cash') {
        c.cash(c.total - withheld);
      } else {
        reject('Choose actual cash proceeds or a financed purchase.');
      }
      if (withheld + financed != BigInt.zero) {
        c.expense(withheld + financed, key: 'feeCategory');
      }
      c.effects.add(
        'Borrowing is not income. Withheld and financed fees are distinct actual charges; neither is deducted twice.',
      );
    }
    return;
  }
  final debt = c.ref('debt', {'debtImport', 'borrowing'});
  v['debt'] = debt.actionId;
  if (c.date.compareTo(debt.date) < 0) {
    reject('Debt activity cannot precede its opening/start date.');
  }
  if (s.current.any(
    (r) =>
        r.id != c.old?.id &&
        financeType(r) == 'debtPayoff' &&
        r.values['debt'] == debt.actionId,
  )) {
    reject('This debt is closed. Resolve the closure evidence first.');
  }
  final liability = -financeBalance(
    s,
    'debt_liability',
    'debt',
    debt.actionId,
    excluding: c.old?.id,
  );
  final clearing = financeBalance(
    s,
    'debt_clearing',
    'debt',
    debt.actionId,
    excluding: c.old?.id,
  );
  switch (op) {
    case 'debtPayment':
      c.total = c.money('amount');
      final external = c.money('externalFee', zero: true);
      final reduction = c.money('reduction', zero: true),
          interest = c.money('interest', zero: true),
          fee = c.money('fee', zero: true),
          unresolved = c.money('clearing', zero: true);
      if (sumMinor([external, reduction, interest, fee, unresolved]) !=
              c.total ||
          reduction > liability) {
        reject(
          'Actual cash must equal known liability reduction, new charges, external fees and unresolved clearing.',
        );
      }
      if (c.value('certainty') == 'confirmed_total') {
        if (unresolved != BigInt.zero ||
            interest != BigInt.zero ||
            fee != BigInt.zero) {
          reject(
            'Confirmed-total payments reduce already recognized liability; separate new charges explicitly.',
          );
        }
      } else if (![
        'known_components',
        'unresolved',
      ].contains(c.value('certainty'))) {
        reject('Disclose the payment classification evidence.');
      }
      c.cash(-c.total);
      c.post('debt_liability', reduction);
      c.post('debt_clearing', unresolved);
      if (interest != BigInt.zero) c.expense(interest, key: 'interestCategory');
      if (fee + external != BigInt.zero) {
        c.expense(fee + external, key: 'feeCategory');
      }
      final contractual = c.total - external;
      final allocations = debtAllocations(c.value('allocations'));
      final unapplied = c.money('unapplied', zero: true);
      if (sumMinor(allocations.values) + unapplied != contractual) {
        reject(
          'Due allocations plus explicit unapplied contractual money must equal the contractual payment.',
        );
      }
      if (allocations.isNotEmpty) {
        final schedule = c.ref('scheduleSource', {'debtSchedule'});
        if (schedule.values['debt'] != debt.actionId) {
          reject('Use this debt’s current schedule.');
        }
        final rows = financeSchedule(schedule.values['schedule']!);
        for (final allocation in allocations.entries) {
          final row = rows.where((r) => r.id == allocation.key).firstOrNull;
          if (row == null) {
            reject('Choose an installment in the current schedule.');
          }
          final paid = sumMinor(
            s.current
                .where(
                  (r) =>
                      r.id != c.old?.id &&
                      financeType(r) == 'debtPayment' &&
                      r.values['scheduleSource'] != null &&
                      s.revision(r.values['scheduleSource']!).actionId ==
                          schedule.actionId,
                )
                .map(
                  (r) =>
                      debtAllocations(r.values['allocations'] ?? '')[row.id] ??
                      BigInt.zero,
                ),
          );
          if (paid + allocation.value + row.paid > row.amount) {
            reject('Payment exceeds remaining scheduled due.');
          }
        }
      }
      c.effects.add(
        'Unknown principal/interest stays unknown. Contractual due satisfaction and recognized-liability reduction are separate.',
      );
    case 'debtClassification':
      final payment = c.ref('payment', {'debtPayment'});
      if (payment.values['debt'] != debt.actionId ||
          payment.date.compareTo(c.date) > 0) {
        reject('Choose an actual payment on this debt.');
      }
      final reduction = c.money('reduction', zero: true),
          interest = c.money('interest', zero: true),
          fee = c.money('fee', zero: true);
      c.total = reduction + interest + fee;
      if (c.total == BigInt.zero ||
          reduction > liability ||
          c.total > clearing ||
          c.total + c.used(op, 'payment', payment.id) >
              parsePhp(payment.values['clearing']!)) {
        reject(
          'Classification exceeds remaining actual clearing or recognized liability.',
        );
      }
      c.text('reason');
      c.source = payment.id;
      c.post('debt_clearing', -c.total);
      c.post('debt_liability', reduction);
      if (interest != BigInt.zero) c.expense(interest, key: 'interestCategory');
      if (fee != BigInt.zero) c.expense(fee, key: 'feeCategory');
      c.effects.add(
        'Reclassify existing actual payment evidence. No second cash deduction.',
      );
    case 'debtSchedule':
      final rows = financeSchedule(c.text('schedule', max: 20000));
      if (c.old != null) {
        final formerRows = financeSchedule(c.old!.values['schedule']!);
        for (final former in formerRows) {
          final revised = rows.where((r) => r.id == former.id).firstOrNull;
          final allocated = sumMinor(
            s.current
                .where(
                  (r) =>
                      financeType(r) == 'debtPayment' &&
                      r.values['scheduleSource'] != null &&
                      s.revision(r.values['scheduleSource']!).actionId ==
                          c.old!.actionId,
                )
                .map(
                  (r) =>
                      debtAllocations(
                        r.values['allocations'] ?? '',
                      )[former.id] ??
                      BigInt.zero,
                ),
          );
          if (revised == null && former.paid + allocated > BigInt.zero ||
              revised != null &&
                  (revised.paid != former.paid ||
                      revised.amount < former.paid + allocated)) {
            reject(
              'Retain stable obligations, historical paid amounts and every actual allocation in the revised schedule.',
            );
          }
        }
        if (rows.any(
          (r) =>
              !formerRows.any((old) => old.id == r.id) && r.paid != BigInt.zero,
        )) {
          reject('New schedule obligations cannot invent historical payment.');
        }
      }
      c.total = sumMinor(rows.map((r) => r.amount));
      if (s.current.any(
        (r) =>
            r.id != c.old?.id &&
            financeType(r) == op &&
            r.values['debt'] == debt.actionId,
      )) {
        reject(
          'Revise the current schedule instead of adding a competing schedule.',
        );
      }
      if (financeType(debt) != 'debtImport' &&
          rows.any((r) => r.paid != BigInt.zero)) {
        reject(
          'Historical paid installments belong only to imported debt setup.',
        );
      }
      if (c.value('verified') != 'true') {
        reject('Confirm provider dates, totals and historical satisfaction.');
      }
      c.text('reference');
      c.effects.add(
        'Scheduled contractual payable is not recognized liability. Historical paid amounts do not deduct cash again.',
      );
    case 'debtPayoff':
      c.total = c.money('amount', zero: true);
      final reduction = c.money('reduction', zero: true),
          waiver = c.money('waiver', zero: true),
          interest = c.money('interest', zero: true),
          fee = c.money('fee', zero: true);
      c.money('avoided', zero: true);
      if (clearing != BigInt.zero ||
          c.total != reduction + interest + fee ||
          reduction + waiver != liability) {
        reject(
          'Provider payoff must reconcile exact cash, recognized liability, waiver and unresolved payments. No balance is forced to zero.',
        );
      }
      if (c.value('verified') != 'true' ||
          c.money('providerPayoff', zero: true) != c.total) {
        reject('Confirm the exact provider payoff amount.');
      }
      c.text('reference');
      c.text('reason');
      if (c.total != BigInt.zero) c.cash(-c.total);
      c.post('debt_liability', reduction + waiver);
      if (interest != BigInt.zero) c.expense(interest, key: 'interestCategory');
      if (fee != BigInt.zero) c.expense(fee, key: 'feeCategory');
      if (waiver != BigInt.zero) {
        if (c.value('waiverBasis') != 'imported_unknown' ||
            financeType(debt) != 'debtImport') {
          reject(
            'This waiver needs its original recognized charge evidence; do not guess an expense offset.',
          );
        }
        c.post('equity', -waiver);
      }
      c.effects.add(
        'Close only after exact reconciliation. Retain old schedules as cancelled future commitments; avoided unposted charges create no expense reversal.',
      );
    default:
      reject('Unsupported debt command.');
  }
}

Map<String, BigInt> debtAllocations(String input) {
  if (input.trim().isEmpty) return {};
  final rows = input.trim().split('\n');
  if (rows.length > 120) reject('Allocate at most 120 explicit installments.');
  final result = <String, BigInt>{};
  for (final row in rows) {
    final pair = row.split(',').map((s) => s.trim()).toList();
    if (pair.length != 2 || pair[0].isEmpty || result.containsKey(pair[0])) {
      reject('Use unique installment-label,PHP amount allocation rows.');
    }
    result[pair[0]] = component(parsePhp(pair[1]), positive: true);
  }
  return result;
}
