part of '../local/finance_domain.dart';

const nativeDebtCommands = {
  'debtImport',
  'borrowing',
  'debtPayment',
  'debtClassification',
  'debtSchedule',
  'debtPayoff',
  'debtAdjustment',
};

void planDebt(FinanceRuleContext c) {
  final s = c.s, v = c.v, op = c.operation;
  if (v['debtComponentContract'] != null && v['debtComponentContract'] != '1') {
    reject(
      'Unsupported debt component evidence version. Preserve the original source.',
    );
  }
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
    if (op == 'debtImport' &&
        v['debtComponentContract'] == '1' &&
        c.value('outstandingPrincipal').isNotEmpty &&
        c.money('outstandingPrincipal', zero: true) > c.total) {
      reject(
        'Known outstanding principal cannot exceed the imported recognized liability. Original principal is separate historical evidence.',
      );
    }
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
    case 'debtAdjustment':
      c.total = c.money('amount');
      c.text('reason');
      c.text('reference');
      if (c.value('verified') != 'true') {
        reject('Confirm the provider adjustment and its exact classification.');
      }
      final adjustment = c.value('adjustmentKind');
      if (['recognized_charge', 'rounding_charge'].contains(adjustment)) {
        if (!['interest', 'fee', 'penalty'].contains(c.value('chargeType'))) {
          reject('Classify the recognized charge as interest, fee or penalty.');
        }
        c.post('debt_liability', -c.total);
        c.expense(c.total);
        c.source = debt.id;
      } else if ([
        'recognized_waiver',
        'rounding_waiver',
      ].contains(adjustment)) {
        if (c.total > liability) reject('Waiver exceeds recognized liability.');
        if (c.value('waiverBasis') == 'imported_unknown' &&
            financeType(debt) == 'debtImport') {
          if (c.total >
              debtOpeningWaiverCapacity(s, debt, excluding: c.old?.id)) {
            reject(
              'The opening-basis waiver exceeds supported remaining imported opening evidence; use the original recognized charge source for separately posted charges.',
            );
          }
          c.post('equity', -c.total);
          c.source = debt.id;
        } else if (c.value('waiverBasis') == 'recognized_charge') {
          final charge = c.ref('chargeSource', {'debtAdjustment', 'borrowing'});
          final remaining = debtChargeRemaining(
            s,
            charge,
            excluding: c.old?.id,
          );
          if (charge.values['debt'] != debt.actionId ||
              charge.date.compareTo(c.date) > 0 ||
              !recognizedDebtCharge(charge) ||
              remaining == null ||
              c.total > remaining) {
            reject(
              'Waiver needs this debt’s unpaid original recognized charge. Resolve unknown reductions before offsetting its expense.',
            );
          }
          c.post(
            'expense',
            -c.total,
            category: s
                .category(
                  financeType(charge) == 'borrowing'
                      ? charge.values['feeCategory']!
                      : charge.values['category']!,
                  'expense',
                )
                .id,
          );
          c.source = charge.id;
        } else {
          reject(
            'Choose a supported original recognized charge or disclosed imported-opening waiver.',
          );
        }
        c.post('debt_liability', c.total);
      } else if (adjustment == 'avoided_future') {
        c.source = debt.id;
      } else {
        reject(
          'Choose an explicit provider charge, waiver, rounding treatment or avoided future charge.',
        );
      }
      c.effects.add(
        'Provider adjustment evidence only: recognized charges/waivers change liability with their supported counterpart; avoided unposted charges have no postings. No cash payment is invented.',
      );
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
                      (r.values['scheduleSource'] ?? '').isNotEmpty &&
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
                      (r.values['scheduleSource'] ?? '').isNotEmpty &&
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
            financeType(debt) != 'debtImport' ||
            waiver > debtOpeningWaiverCapacity(s, debt, excluding: c.old?.id)) {
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
  if (['debtPayment', 'debtClassification', 'debtPayoff'].contains(op)) {
    validateDebtReductionSources(c, debt);
  }
}

/// An exact range rather than an invented winner when historic reductions lack
/// principal allocation. Import original principal is not outstanding principal.
(BigInt, BigInt)? debtPrincipalRange(
  LocalSnapshot s,
  LocalRevision debt,
  String through, {
  String? excluding,
}) {
  final initial = financeType(debt) == 'borrowing'
      ? debt.amount
      : debt.values['debtComponentContract'] == '1' &&
            debt.values['outstandingPrincipal']?.isNotEmpty == true
      ? parsePhp(debt.values['outstandingPrincipal']!)
      : null;
  if (initial == null) return null;
  if (debt.date.compareTo(through) > 0) return (BigInt.zero, BigInt.zero);
  var known = BigInt.zero, unknown = BigInt.zero;
  for (final r in s.current.where(
    (r) =>
        r.id != excluding &&
        r.values['debt'] == debt.actionId &&
        r.date.compareTo(through) <= 0,
  )) {
    if (financeType(r) == 'debtPayoff') return (BigInt.zero, BigInt.zero);
    if (['debtPayment', 'debtClassification'].contains(financeType(r))) {
      final reduction = parsePhp(r.values['reduction'] ?? '0.00'),
          principal = parsePhp(
            r.values['debtComponentContract'] == '1' &&
                    r.values['principalReduction']?.isNotEmpty == true
                ? r.values['principalReduction']!
                : '0.00',
          ),
          sources = sumMinor(
            debtAllocations(
              r.values['debtComponentContract'] == '1'
                  ? r.values['reductionSources'] ?? ''
                  : '',
            ).values,
          );
      known += principal;
      unknown += reduction - principal - sources;
    }
    if (financeType(r) == 'debtAdjustment' &&
        [
          'recognized_waiver',
          'rounding_waiver',
        ].contains(r.values['adjustmentKind']) &&
        r.values['waiverBasis'] == 'imported_unknown') {
      unknown += r.amount;
    }
  }
  final upper = initial - known, lower = upper - unknown;
  return (
    lower > BigInt.zero ? lower : BigInt.zero,
    upper > BigInt.zero ? upper : BigInt.zero,
  );
}

bool recognizedDebtCharge(LocalRevision r) => financeType(r) == 'borrowing'
    ? parsePhp(r.values['financedFee']!) > BigInt.zero
    : financeType(r) == 'debtAdjustment' &&
          [
            'recognized_charge',
            'rounding_charge',
          ].contains(r.values['adjustmentKind']);

BigInt debtOpeningWaiverCapacity(
  LocalSnapshot s,
  LocalRevision debt, {
  String? excluding,
}) {
  var remaining = debt.amount;
  for (final r in s.current.where(
    (r) => r.id != excluding && r.values['debt'] == debt.actionId,
  )) {
    if ([
      'debtPayment',
      'debtClassification',
      'debtPayoff',
    ].contains(financeType(r))) {
      remaining -=
          parsePhp(r.values['reduction'] ?? '0.00') -
          (r.values['debtComponentContract'] == '1'
              ? sumMinor(
                  debtAllocations(r.values['reductionSources'] ?? '').values,
                )
              : BigInt.zero);
      if (financeType(r) == 'debtPayoff' &&
          r.values['waiverBasis'] == 'imported_unknown') {
        remaining -= parsePhp(r.values['waiver'] ?? '0.00');
      }
    }
    if (financeType(r) == 'debtAdjustment' &&
        [
          'recognized_waiver',
          'rounding_waiver',
        ].contains(r.values['adjustmentKind']) &&
        r.values['waiverBasis'] == 'imported_unknown') {
      remaining -= r.amount;
    }
  }
  return remaining > BigInt.zero ? remaining : BigInt.zero;
}

BigInt? debtChargeRemaining(
  LocalSnapshot s,
  LocalRevision charge, {
  String? excluding,
}) {
  var remaining = financeType(charge) == 'borrowing'
      ? parsePhp(charge.values['financedFee']!)
      : charge.amount;
  for (final r in s.current.where(
    (r) => r.id != excluding && r.values['debt'] == charge.values['debt'],
  )) {
    if ([
      'debtPayment',
      'debtClassification',
      'debtPayoff',
    ].contains(financeType(r))) {
      final reduction = parsePhp(r.values['reduction'] ?? '0.00'),
          principal = parsePhp(
            r.values['debtComponentContract'] == '1' &&
                    r.values['principalReduction']?.isNotEmpty == true
                ? r.values['principalReduction']!
                : '0.00',
          ),
          sources = debtAllocations(
            r.values['debtComponentContract'] == '1'
                ? r.values['reductionSources'] ?? ''
                : '',
          );
      if (r.date.compareTo(charge.date) >= 0 &&
          reduction > principal + sumMinor(sources.values)) {
        return null;
      }
      remaining -= sources[charge.id] ?? BigInt.zero;
    }
    if (financeType(r) == 'debtAdjustment' &&
        [
          'recognized_waiver',
          'rounding_waiver',
        ].contains(r.values['adjustmentKind']) &&
        r.values['chargeSource'] == charge.id) {
      remaining -= r.amount;
    }
  }
  return remaining;
}

void validateDebtReductionSources(FinanceRuleContext c, LocalRevision debt) {
  if (c.value('debtComponentContract') != '1') return;
  if (c.value('principalReduction').isEmpty &&
      c.value('reductionSources').isEmpty) {
    return;
  }
  final principal = c.value('principalReduction').isEmpty
          ? BigInt.zero
          : c.money('principalReduction', zero: true),
      sources = debtAllocations(c.value('reductionSources')),
      reduction = c.money('reduction', zero: true);
  if (principal + sumMinor(sources.values) != reduction) {
    reject(
      'Explicit principal and recognized-charge reductions must equal the liability reduction; leave both blank when unknown.',
    );
  }
  final range = debtPrincipalRange(
    c.s,
    debt,
    '9999-12-31',
    excluding: c.old?.id,
  );
  if (principal > BigInt.zero && (range == null || principal > range.$1)) {
    reject(
      'Principal reduction exceeds independently supported outstanding principal. Resolve earlier unknown allocations first.',
    );
  }
  for (final entry in sources.entries) {
    final charge = financeSource(c.s, entry.key, {
          'debtAdjustment',
          'borrowing',
        }),
        available = debtChargeRemaining(c.s, charge, excluding: c.old?.id);
    if (charge.values['debt'] != debt.actionId ||
        charge.date.compareTo(c.date) > 0 ||
        !recognizedDebtCharge(charge) ||
        available == null ||
        entry.value > available) {
      reject(
        'Recognized charge allocation exceeds supported unpaid source capacity.',
      );
    }
  }
}

void validateDebtProjection(FinanceRuleContext c) {
  final debt = c.v['debt'];
  if (debt == null) return;
  if (c.operation != 'debtAdjustment' &&
      c.v['debtComponentContract'] != '1' &&
      !c.s.current.any(
        (r) =>
            r.values['debt'] == debt &&
            (r.values['debtComponentContract'] == '1' ||
                financeType(r) == 'debtAdjustment'),
      )) {
    return;
  }
  final postings =
      [
            ...c.s.current
                .where((r) => r.id != c.old?.id && r.values['debt'] == debt)
                .expand((r) => r.postings),
            ...c.posts,
          ]
          .where((p) => ['debt_liability', 'debt_clearing'].contains(p.ledger))
          .toList()
        ..sort((a, b) => a.date.compareTo(b.date));
  var liability = BigInt.zero, clearing = BigInt.zero;
  for (var i = 0; i < postings.length; i++) {
    final p = postings[i];
    if (p.ledger == 'debt_liability') {
      liability += p.amount;
    } else {
      clearing += p.amount;
    }
    if (i + 1 == postings.length || postings[i + 1].date != p.date) {
      if (liability > BigInt.zero || clearing < BigInt.zero) {
        reject(
          'Debt correction would over-reduce recognized liability or payment clearing at an economic date.',
        );
      }
    }
  }
  final closed =
      c.operation == 'debtPayoff' && c.command.kind != 'financeReversal' ||
      c.s.current.any(
        (r) =>
            r.id != c.old?.id &&
            financeType(r) == 'debtPayoff' &&
            r.values['debt'] == debt,
      );
  if (closed && (liability != BigInt.zero || clearing != BigInt.zero)) {
    reject(
      'A retained provider payoff must remain exactly reconciled after every correction or reversal.',
    );
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
