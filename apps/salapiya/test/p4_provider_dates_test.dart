import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/local/finance_domain.dart';
import 'package:salapiya/local/local_finance_controller.dart';

import 'local_test_support.dart';

void main() {
  test('current Overview liabilities exclude future payments and retain cross-card credit separately', () async {
    final f = await LocalFixture.open();
    addTearDown(f.close);
    final account = await f.account('Wallet', '5000.00');
    final card = await f.post('creditCard', {
      'name': 'Outstanding card',
      'issuer': 'Provider',
      'amount': '100.00',
      'limit': '',
    });
    await f.post('creditCard', {
      'name': 'Credit card',
      'issuer': 'Provider',
      'amount': '-50.00',
      'limit': '',
    });
    final debt = await f.post('debtImport', {
      'name': 'Liability',
      'lender': 'Provider',
      'debtType': 'personal_loan',
      'amount': '1000.00',
    });
    final future = DateTime.parse('${civilToday()}T00:00:00Z')
        .add(const Duration(days: 1))
        .toIso8601String()
        .substring(0, 10);
    await f.post('cardPayment', {
      'name': 'Future card payment',
      'card': card,
      'account': account,
      'date': future,
      'amount': '100.00',
    });
    await f.post('debtPayment', {
      'name': 'Future debt payment',
      'debt': debt,
      'account': account,
      'date': future,
      'amount': '1000.00',
      'reduction': '1000.00',
      'interest': '0.00',
      'fee': '0.00',
      'externalFee': '0.00',
      'clearing': '0.00',
      'certainty': 'confirmed_total',
      'unapplied': '1000.00',
    });
    final c = LocalFinancialController(f.store, await f.store.snapshot());
    addTearDown(c.dispose);
    expect(c.debtTotal, BigInt.from(100000));
    expect(c.cardLiabilityAndCredit, (BigInt.from(10000), BigInt.from(5000)));
    expect(c.cardBalance, BigInt.from(5000));
    expect(c.liquid, BigInt.from(500000));
  });
  test('provider comparison uses posting dates and future allocations retain current due', () async {
    final f = await LocalFixture.open();
    addTearDown(f.close);
    final cash = await f.account('Wallet', '1000.00');
    final card = await f.post('creditCard', {
      'name': 'Card',
      'issuer': 'Provider',
      'amount': '100.00',
      'limit': '',
    });
    await f.post('cardPurchase', {
      'name': 'Pending provider posting',
      'card': card,
      'amount': '50.00',
      'postingDate': '2026-10-25',
      'category': 'category-food',
    });
    final statement = await f.post('statement', {
      'name': 'Statement',
      'card': card,
      'start': '2026-10-01',
      'end': '2026-10-21',
      'issued': '2026-10-21',
      'due': '2026-11-05',
      'amount': '100.00',
      'minimum': '',
      'reference': 'provider',
      'verified': 'true',
    });
    final payment = await f.post('cardPayment', {
      'name': 'Recorded future cash',
      'card': card,
      'account': cash,
      'date': '2026-10-30',
      'amount': '100.00',
    });
    await f.post('cardAllocation', {
      'name': 'Future allocation',
      'card': card,
      'statement': statement,
      'payment': payment,
      'date': '2026-10-30',
      'amount': '100.00',
      'verified': 'true',
    });
    final s = await f.store.snapshot();
    expect(
      statementRecordedBalance(s, s.revision(statement)),
      BigInt.from(10000),
    );
    expect(
      financialReminderSources(
        s,
        '2026-10-21',
        '2026-11-30',
        asOf: '2026-10-21',
      ).single.amount,
      BigInt.from(10000),
    );
    expect(
      financialReminderSources(
        s,
        '2026-10-21',
        '2026-11-30',
        asOf: '2026-10-30',
      ),
      isEmpty,
    );
    expect(
      financeBalance(s, 'card_liability', 'card', card, through: '2026-10-21'),
      BigInt.from(-15000),
    );
    await f.store.integrity();
  });
}
