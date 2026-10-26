part of '../local/finance_domain.dart';

void planCard(FinanceRuleContext c) {
  final s = c.s, v = c.v, op = c.operation;
  if (op == 'creditCard') {
    c.text('issuer', max: 200);
    if (c.value('limit').isNotEmpty) c.money('limit', zero: true, wide: true);
    if (s.current.any(
      (r) =>
          r.id != c.old?.id &&
          financeType(r) == 'creditCard' &&
          r.title.toLowerCase() == c.title.toLowerCase(),
    )) {
      reject('That card name already exists.');
    }
    v['card'] = c.old?.actionId ?? c.command.id;
    c.total = c.money('amount', zero: true, signed: true);
    c.post('card_liability', -c.total);
    c.post('equity', c.total);
    return;
  }
  final card = c.ref('card', {'creditCard'});
  v['card'] = card.actionId;
  if (c.date.compareTo(card.date) < 0) {
    reject('Card activity cannot precede its opening evidence.');
  }
  switch (op) {
    case 'cardAuthorization':
      c.total = c.money('amount');
      c.text('reference');
      c.effects.add(
        'Pending authorization only; no recognized posted liability or spending.',
      );
    case 'cardPurchase':
    case 'cardFee':
    case 'cardInterest':
      final posted = civilDate(c.text('postingDate'));
      if (posted.compareTo(c.date) < 0) {
        reject('Posting date cannot precede the transaction date.');
      }
      c.total = c.money('amount');
      c.kind = 'expense';
      c.post('card_liability', -c.total);
      if (c.value('split') == 'true') {
        final count = int.tryParse(c.value('splitCount')) ?? 2;
        if (count < 2 || count > 100) reject('Use 2–100 expense portions.');
        var allocated = c.money('splitAmount');
        c.expense(allocated);
        for (var i = 2; i < count; i++) {
          final part = c.money('split${i}Amount');
          allocated += part;
          c.expense(part, key: 'split${i}Category');
        }
        if (allocated >= c.total) {
          reject('Leave a positive final expense portion.');
        }
        c.expense(c.total - allocated, key: 'splitCategory');
      } else {
        c.expense(c.total);
      }
      if (c.value('authorization').isNotEmpty) {
        final auth = c.ref('authorization', {'cardAuthorization'});
        if (auth.values['card'] != card.actionId ||
            s.current.any(
              (r) => r.id != c.old?.id && r.values['authorization'] == auth.id,
            )) {
          reject('Authorization already used or belongs to another card.');
        }
        c.source = auth.id;
      }
      c.effects.add(
        'Spending uses the transaction date. Provider posting date is $posted; no cash moves.',
      );
    case 'cardPayment':
      c.total = c.money('amount');
      c.cash(-c.total);
      c.post('card_liability', c.total);
      c.effects.add(
        'Repayment is not another purchase expense. Excess payment is noncash card credit.',
      );
    case 'cardRefund':
      final purchase = c.ref('purchase', {'cardPurchase'});
      if (purchase.values['card'] != card.actionId ||
          purchase.date.compareTo(c.date) > 0) {
        reject(
          'Use the matching current purchase or Shared Expenses refund workflow.',
        );
      }
      c.total = c.money('amount');
      final category = c.text('category');
      final sharedPurchase = purchase.values.containsKey('sharedGroup');
      final available = sharedPurchase
          ? parsePhp(purchase.values['fundingAmount']!)
          : sumMinor(
              purchase.postings
                  .where((p) => p.ledger == 'expense' && p.category == category)
                  .map((p) => p.amount),
            );
      final used = sumMinor(
        s.current
            .where(
              (r) =>
                  r.id != c.old?.id &&
                  financeType(r) == 'cardRefund' &&
                  r.values['purchase'] == purchase.id &&
                  (sharedPurchase || r.values['category'] == category),
            )
            .map(
              (r) => r.values['fundingAmount'] == null
                  ? r.amount
                  : parsePhp(r.values['fundingAmount']!),
            ),
      );
      if (c.total + used > available) {
        reject('Refund exceeds the original category portion.');
      }
      c.text('reason');
      c.kind = 'refund';
      c.source = purchase.id;
      c.post('card_liability', c.total);
      if (sharedPurchase) {
        c.post('shared_clearing', -c.total);
        c.effects.add(
          'Actual card credit is retained in clearing until explicit group-refund adoption.',
        );
      } else {
        c.expense(-c.total);
      }
    case 'statement':
      final start = civilDate(c.text('start')),
          end = civilDate(c.text('end')),
          issued = civilDate(c.text('issued')),
          due = civilDate(c.text('due'));
      if (start.compareTo(end) > 0 ||
          end.compareTo(issued) > 0 ||
          issued.compareTo(due) > 0) {
        reject('Review statement cycle, issue and due dates.');
      }
      c.total = c.money('amount', zero: true, signed: true);
      if (c.value('minimum').isNotEmpty) {
        final minimum = c.money('minimum', zero: true);
        if (minimum > (c.total > BigInt.zero ? c.total : BigInt.zero)) {
          reject('Minimum due exceeds the positive statement balance.');
        }
      }
      c.text('reference');
      if (c.value('verified') != 'true') {
        reject('Confirm the provider statement evidence.');
      }
    case 'statementLink':
      final statement = c.ref('statement', {'statement'});
      final activity = c.ref('activity', {
        'cardPurchase',
        'cardPayment',
        'cardFee',
        'cardInterest',
        'cardRefund',
      });
      if (statement.values['card'] != card.actionId ||
          activity.values['card'] != card.actionId ||
          s.current.any(
            (r) =>
                r.id != c.old?.id &&
                financeType(r) == op &&
                r.values['activity'] == activity.id,
          )) {
        reject('Statement activity is foreign or already linked.');
      }
      if (c.value('verified') != 'true') {
        reject('Confirm provider membership; dates alone do not establish it.');
      }
      c.source = activity.id;
    case 'cardAllocation':
      final statement = c.ref('statement', {'statement'});
      final payment = c.ref('payment', {'cardPayment', 'cardRefund'});
      if (statement.values['card'] != card.actionId ||
          payment.values['card'] != card.actionId ||
          payment.date.compareTo(c.date) > 0 ||
          statement.values['issued']!.compareTo(c.date) > 0) {
        reject('Allocation sources or date are incompatible.');
      }
      c.total = c.money('amount');
      if (c.total + c.used(op, 'payment', payment.id) > payment.amount ||
          c.total + c.used(op, 'statement', statement.id) > statement.amount) {
        reject(
          'Allocation exceeds confirmed payment/credit or statement remaining due.',
        );
      }
      if (c.value('verified') != 'true') {
        reject('Confirm the actual provider allocation.');
      }
      c.source = payment.id;
    case 'installment':
      final purchase = c.ref('purchase', {'cardPurchase'});
      if (purchase.values['card'] != card.actionId) {
        reject('Choose a purchase on this card.');
      }
      final rows = financeSchedule(c.text('schedule'));
      c.total = sumMinor(rows.map((r) => r.amount));
      if (c.value('principal').isNotEmpty ||
          c.value('interest').isNotEmpty ||
          c.value('fee').isNotEmpty) {
        if (['principal', 'interest', 'fee'].any((k) => c.value(k).isEmpty)) {
          reject('Supply all confirmed components or leave all unknown.');
        }
        if (sumMinor(
                  [
                    'principal',
                    'interest',
                    'fee',
                  ].map((k) => c.money(k, zero: true)),
                ) !=
                c.total ||
            c.money('principal', zero: true) >
                -sumMinor(
                  purchase.postings
                      .where((p) => p.ledger == 'card_liability')
                      .map((p) => p.amount),
                )) {
          reject('Provider installment components do not reconcile.');
        }
      }
      if (s.current.any(
        (r) =>
            r.id != c.old?.id &&
            financeType(r) == op &&
            r.values['purchase'] == purchase.id,
      )) {
        reject('This purchase already has a current installment plan.');
      }
      if (c.value('verified') != 'true') {
        reject('Confirm provider dates and amounts.');
      }
      c.text('reference');
      c.source = purchase.id;
    case 'installmentApplication':
      final plan = c.ref('plan', {'installment'});
      final allocation = c.ref('payment', {'cardAllocation'});
      final statement = financeSource(s, allocation.values['statement']!, {
        'statement',
      });
      if (plan.values['card'] != card.actionId ||
          statement.values['card'] != card.actionId) {
        reject('Choose matching provider application sources.');
      }
      final row = financeSchedule(plan.values['schedule']!)
          .where((r) => r.id == c.value('row'))
          .firstOrNull;
      if (row == null) reject('Choose a current scheduled installment.');
      c.total = c.money('amount');
      final usedRow = sumMinor(
        s.current
            .where(
              (r) =>
                  r.id != c.old?.id &&
                  financeType(r) == op &&
                  r.values['plan'] == plan.id &&
                  r.values['row'] == row.id,
            )
            .map((r) => r.amount),
      );
      if (c.total + usedRow + row.paid > row.amount ||
          c.total + c.used(op, 'payment', allocation.id) > allocation.amount) {
        reject(
          'Application exceeds installment or actual allocation capacity.',
        );
      }
      if (c.value('verified') != 'true') {
        reject('Confirm provider application evidence.');
      }
      c.source = allocation.id;
    default:
      reject('Unsupported native financial operation.');
  }
}

class FinanceScheduleRow {
  const FinanceScheduleRow(this.id, this.date, this.amount, this.paid);
  final String id, date;
  final BigInt amount, paid;
}

/// Explicit provider rows: stable-label,date,PHP amount[,historically paid PHP].
List<FinanceScheduleRow> financeSchedule(String input) {
  final lines = input.trim().split('\n');
  if (lines.isEmpty || lines.length > 120) {
    reject('Supply 1–120 explicit provider installments.');
  }
  final seen = <String>{};
  final result = <FinanceScheduleRow>[];
  String? previous;
  for (final line in lines) {
    final cells = line.split(',').map((v) => v.trim()).toList();
    if (cells.length < 3 ||
        cells.length > 4 ||
        cells[0].isEmpty ||
        cells[0].length > 100 ||
        !seen.add(cells[0])) {
      reject(
        'Use unique installment labels, date, amount and optional historical paid amount.',
      );
    }
    final date = civilDate(cells[1]);
    if (previous != null && date.compareTo(previous) < 0) {
      reject('List installments in due-date order.');
    }
    previous = date;
    final amount = component(parsePhp(cells[2]), positive: true);
    final paid = cells.length == 4 ? parsePhp(cells[3]) : BigInt.zero;
    if (paid > amount) {
      reject('Historical paid amount exceeds the installment.');
    }
    result.add(FinanceScheduleRow(cells[0], date, amount, paid));
  }
  return result;
}
