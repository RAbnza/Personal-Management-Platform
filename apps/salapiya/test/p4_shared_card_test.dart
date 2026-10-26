import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/local/finance_domain.dart';

import 'local_test_support.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('P3 card adoption and actual refund retain one liability with separate consumption axes', () async {
    final f = await LocalFixture.open();
    try {
      final id = await f.post('creditCard', {
        'name': 'Shared card',
        'issuer': 'Synthetic',
        'amount': '0.00',
        'limit': '',
      });
      final buy = await f.post('cardPurchase', {
        'name': 'Dinner',
        'card': id,
        'amount': '1200.00',
        'category': 'category-food',
        'postingDate': '2026-10-22',
      });
      final group = newLocalId(), bill = newLocalId();
      final adoption = await f.post('shared', {
        'name': 'Card-funded shared dinner',
        'sharedMode': 'bill',
        'sharedAccounting': '2',
        'sharedGroup': group,
        'sharedKey': bill,
        'sharedRevision': bill,
        'funding': 'card',
        'card': id,
        'fundingAmount': '1200.00',
        'shareAmount': '400.00',
        'category': 'category-food',
        'account': '',
        'source': buy,
        'sourceVersion': '1',
        'reason': 'Adopt own purchase',
      });
      var s = await f.store.snapshot();
      expect(
        financeBalance(s, 'card_liability', 'card', id),
        BigInt.from(-120000),
      );
      BigInt ledger(String key) => sumMinor(
        s.current
            .expand((r) => r.postings)
            .where((p) => p.ledger == key)
            .map((p) => p.amount),
      );
      expect(ledger('expense'), BigInt.from(40000));
      expect(ledger('shared_receivable'), BigInt.from(80000));
      final refund = await f.post('cardRefund', {
        'name': 'Actual provider refund',
        'card': id,
        'purchase': adoption,
        'amount': '90.00',
        'category': 'category-food',
        'reason': 'Provider credit',
      });
      final groupRefund = newLocalId();
      await f.post('shared', {
        'name': 'Adopt returned card credit',
        'sharedMode': 'refund',
        'sharedAccounting': '2',
        'sharedGroup': group,
        'sharedKey': groupRefund,
        'sharedRevision': groupRefund,
        'funding': 'card',
        'card': id,
        'fundingAmount': '90.00',
        'shareAmount': '30.00',
        'category': 'category-food',
        'account': '',
        'source': refund,
        'sourceVersion': '1',
        'reason': 'Adopt exact provider refund',
        'billSource': bill,
        'billRevision': bill,
        'coverage': 'adopted',
      });
      s = await f.store.snapshot();
      expect(
        financeBalance(s, 'card_liability', 'card', id),
        BigInt.from(-111000),
      );
      expect(ledger('expense'), BigInt.from(37000));
      expect(ledger('shared_receivable'), BigInt.from(74000));
      expect(ledger('cash'), BigInt.zero);
      expect(ledger('shared_clearing'), BigInt.zero);
      await f.store.integrity();
    } finally {
      await f.close();
    }
  });
}
