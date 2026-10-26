import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/local/finance_domain.dart';

import 'local_test_support.dart';

void main() {
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
