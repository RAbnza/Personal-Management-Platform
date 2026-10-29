import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/local/finance_domain.dart';
import 'package:salapiya/local/local_finance_controller.dart';
import 'package:salapiya/features/finance/contracts/financial_models.dart';

import 'local_test_support.dart';

void main() {
  late LocalFixture f;
  setUp(() async {
    f = await LocalFixture.open();
  });
  tearDown(() => f.close());
  test('multi-portion refunds commit one cash receipt with exact independent source caps', () async {
    final a = await f.account('Wallet');
    final purchase = await f.post('expense', {
      'name': 'Split receipt',
      'account': a,
      'amount': '100.00',
      'category': 'category-food',
      'split': 'true',
      'splitAmount': '40.00',
      'splitCategory': 'category-transport',
    });
    final v = {
      'source': purchase,
      'sourceVersion': '1',
      'account': a,
      'amount': '50.00',
      'refundMultiple': 'true',
      'refundCount': '2',
      'refundPosting': '$purchase-p2',
      'refundFirstAmount': '20.00',
      'refund1Posting': '$purchase-p3',
      'refund1Amount': '30.00',
      'reason': 'Two returned portions',
    };
    await f.post('refund', v);
    await expectLater(
      f.store.commit(
        await f.command('refund', {
          ...v,
          'amount': '30.01',
          'refundFirstAmount': '20.00',
          'refund1Amount': '10.01',
          'refund1Posting': '$purchase-p2',
        }),
      ),
      throwsA(isA<LocalRuleException>()),
    );
    await expectLater(
      f.store.commit(
        await f.command('refund', {
          ...v,
          'amount': '50.01',
          'refundFirstAmount': '20.01',
        }),
      ),
      throwsA(isA<LocalRuleException>()),
    );
    final c = LocalFinancialController(f.store, await f.store.snapshot());
    expect(c.recognizedSpending, BigInt.from(5000));
    expect(c.account(a).balance, BigInt.from(120000));
    c.dispose();
  });
  test('100 exact category portions fit the bounded native command and SQLite schema', () async {
    final a = await f.account('Wallet');
    final id = await f.post('expense', {
      'name': 'Hundred centavos',
      'account': a,
      'amount': '1.00',
      'category': 'category-food',
      'split': 'true',
      'splitCount': '100',
      'splitAmount': '0.01',
      'splitCategory': 'category-food',
      for (var i = 2; i < 100; i++) ...{
        'split${i}Amount': '0.01',
        'split${i}Category': 'category-food',
      },
    });
    final r = (await f.store.snapshot()).revision(id);
    expect(r.postings.where((p) => p.ledger == 'expense').length, 100);
    expect(sumMinor(r.postings.map((p) => p.amount)), BigInt.zero);
    await f.store.integrity();
  });
  test('reconciliation records full-range signed balances and lossless differences', () async {
    final a = await f.account('Wallet');
    final r = await f.post('reconcile', {
      'account': a,
      'amount': '-92233720368547758.08',
    });
    final snapshot = await f.store.snapshot();
    expect(snapshot.revision(r).amount, BigInt.parse('-9223372036854900808'));
    expect(snapshot.balance(a), BigInt.from(125000));
    await expectLater(
      f.store.commit(
        await f.command('adjustment', {
          'source': r,
          'account': a,
          'reason': 'Exceeds one component',
        }),
      ),
      throwsA(anything),
    );
  });
  test('standalone signed adjustment and its correction/reversal use equity and historical balance checks', () async {
    final a = await f.account('Wallet');
    final id = await f.post('adjustment', {
      'account': a,
      'amount': '-10.01',
      'reason': 'Tracked cash difference',
    });
    final r = (await f.store.snapshot()).revision(id);
    final correction = await f.post('correction', {
      ...r.values,
      'source': id,
      'sourceVersion': '1',
      'amount': '-10.02',
      'reason': 'Correct evidence',
    });
    var c = LocalFinancialController(f.store, await f.store.snapshot());
    expect(c.recognizedSpending, BigInt.zero);
    expect(c.recognizedIncome, BigInt.zero);
    expect(c.account(a).balance, BigInt.from(123998));
    c.dispose();
    await f.post('reversal', {
      'source': correction,
      'sourceVersion': '2',
      'reason': 'Void adjustment',
    });
    c = LocalFinancialController(f.store, await f.store.snapshot());
    expect(c.account(a).balance, BigInt.from(125000));
    c.dispose();
  });
  test('opening correction/reversal preserves account and cutoff, warns for negative history', () async {
    final a = await f.account('Opening wallet');
    final v = {
      'source': a,
      'sourceVersion': '1',
      'account': a,
      'date': '2026-10-14',
      'amount': '1000.01',
      'reason': 'Confirmed baseline',
    };
    await expectLater(
      f.store.commit(
        await f.command('correction', {...v, 'date': '2026-10-15'}),
      ),
      throwsA(isA<LocalRuleException>()),
    );
    final corrected = await f.post('correction', v);
    expect((await f.store.snapshot()).balance(a), BigInt.from(100001));
    await f.post('expense', {
      'name': 'Later spending',
      'account': a,
      'amount': '10.00',
      'category': 'category-food',
    });
    final reverse = {
      'source': corrected,
      'sourceVersion': '2',
      'reason': 'Void baseline',
    };
    await expectLater(
      f.store.commit(await f.command('reversal', reverse)),
      throwsA(isA<LocalRuleException>()),
    );
    await f.post('reversal', {...reverse, 'acknowledge': 'true'});
    expect((await f.store.snapshot()).balance(a), BigInt.from(-1000));
    expect((await f.store.snapshot()).account(a).cutoff, '2026-10-14');
  });
  test('100-part-compatible split model caps refunds by original posting, including repeated categories', () async {
    final a = await f.account('Wallet');
    final e = await f.post('expense', {
      'name': 'Three portions',
      'account': a,
      'amount': '100.00',
      'category': 'category-food',
      'split': 'true',
      'splitCount': '3',
      'splitAmount': '30.00',
      'split2Amount': '20.00',
      'split2Category': 'category-food',
      'splitCategory': 'category-transport',
    });
    final values = {
      'source': e,
      'sourceVersion': '1',
      'account': a,
      'amount': '20.00',
      'refundPosting': '$e-p3',
      'reason': 'Return selected portion',
    };
    final refund = await f.post('refund', values);
    await expectLater(
      f.store.commit(await f.command('refund', {...values, 'amount': '0.01'})),
      throwsA(isA<LocalRuleException>()),
    );
    final rv = (await f.store.snapshot()).revision(refund);
    await f.post('correction', {
      ...rv.values,
      'source': refund,
      'sourceVersion': '1',
      'amount': '19.99',
      'reason': 'Refund receipt corrected',
    });
    await f.post('refund', {...values, 'amount': '0.01'});
    final c = LocalFinancialController(f.store, await f.store.snapshot());
    expect(c.recognizedSpending, BigInt.from(8000));
    c.dispose();
  });
  test('multiple transfer fees keep dates/bearing accounts and fee refund portion caps', () async {
    final a = await f.account('Source'),
        b = await f.account('Destination', '0.00');
    final t = await f.post('transfer', {
      'account': a,
      'destination': b,
      'amount': '100.00',
      'fee': '1.00',
      'feeTreatment': 'withheld',
      'feeCategory': 'category-fees',
      'feeCount': '2',
      'extraFee1Amount': '2.00',
      'extraFee1Treatment': 'separate',
      'extraFee1Account': b,
      'extraFee1Category': 'category-fees',
      'extraFee1Date': '2026-10-22',
    });
    final fees = (await f.store.snapshot()).revision(t).postings;
    final portion =
        fees.indexWhere(
          (p) => p.ledger == 'expense' && p.date == '2026-10-22',
        ) +
        1;
    await f.post('refund', {
      'source': t,
      'sourceVersion': '1',
      'account': b,
      'amount': '2.00',
      'refundPosting': '$t-p$portion',
      'date': '2026-10-22',
      'reason': 'Fee returned',
    });
    final c = LocalFinancialController(f.store, await f.store.snapshot());
    expect(c.recognizedSpending, BigInt.from(100));
    expect(c.recognizedIncome, BigInt.zero);
    expect(c.liquid, BigInt.from(124900));
    c.dispose();
  });
  test(
    'D5 F-EXPENSE exact split, income, current balances and classifications',
    () async {
      final cash = await f.account('Cash wallet');
      final bank = await f.account('Everyday bank', '24850.50');
      await f.account('Mobile wallet', '3200.25');
      await f.post('expense', {
        'name': 'Lunch & ride',
        'account': cash,
        'amount': '185.50',
        'category': 'category-food',
        'split': 'true',
        'splitAmount': '150.00',
        'splitCategory': 'category-transport',
      });
      final c = LocalFinancialController(f.store, await f.store.snapshot());
      expect(c.account(cash).balance, BigInt.from(106450));
      expect(c.liquid, BigInt.from(2911525));
      expect(c.recognizedSpending, BigInt.from(18550));
      await f.post('income', {
        'name': 'Salary',
        'account': bank,
        'amount': '18000.01',
        'category': 'category-income',
        'incomeClass': 'earned',
      });
      await c.reload();
      expect(c.recognizedIncome, BigInt.from(1800001));
      expect(c.recognizedSpending, BigInt.from(18550));
      expect(await f.store.db.getNextCrudTransaction(), isNull);
      c.dispose();
    },
  );
  for (final treatment in ['source_additional', 'withheld', 'separate']) {
    test(
      'F-TRANSFER $treatment has one fee and no principal income/spending',
      () async {
        final a = await f.account('Source', '24850.50'),
            b = await f.account('Destination', '3200.25');
        final payer = await f.account('Fee payer', '1250.00');
        await f.post('transfer', {
          'account': a,
          'destination': b,
          'amount': '1000.00',
          'fee': '10.00',
          'feeTreatment': treatment,
          'feeAccount': payer,
          'feeCategory': 'category-fees',
        });
        final c = LocalFinancialController(f.store, await f.store.snapshot());
        expect(c.liquid, BigInt.from(2929075));
        expect(c.account(b).balance, BigInt.from(420025));
        expect(
          c.account(a).balance,
          BigInt.from(treatment == 'separate' ? 2385050 : 2384050),
        );
        expect(c.recognizedSpending, BigInt.from(1000));
        expect(c.recognizedIncome, BigInt.zero);
        c.dispose();
      },
    );
  }
  test('cutoff strictness, exact input, foreign accounts/categories and split rejects', () async {
    final a = await f.account('Cash');
    for (final change in [
      {'date': '2026-10-14'},
      {'date': ''},
      {'date': '2026-02-30'},
      {'amount': '1.001'},
      {'amount': '1000000000.01'},
      {'amount': '0.00'},
      {'amount': '-1.00'},
      {'account': newLocalId()},
      {'category': 'category-income'},
      {
        'split': 'true',
        'splitAmount': '10.00',
        'splitCategory': 'category-transport',
      },
      {
        'split': 'true',
        'splitAmount': '0.00',
        'splitCategory': 'category-food',
      },
    ]) {
      final command = await f.command('expense', {
        'name': 'Invalid',
        'account': a,
        'amount': '10.00',
        'category': 'category-food',
        ...change,
      });
      await expectLater(f.store.commit(command), throwsA(anything));
    }
    expect((await f.store.snapshot()).version, 1);
  });
  test('historical negative balance requires acknowledgement despite positive final balance', () async {
    final a = await f.account('Cash', '0.00');
    await f.post('income', {
      'name': 'Later salary',
      'account': a,
      'date': '2026-10-21',
      'amount': '100.00',
      'incomeClass': 'earned',
      'category': 'category-income',
    });
    final v = {
      'name': 'Earlier expense',
      'account': a,
      'date': '2026-10-20',
      'amount': '20.00',
      'category': 'category-food',
    };
    await expectLater(
      f.store.commit(await f.command('expense', v)),
      throwsA(isA<LocalRuleException>()),
    );
    await f.post('expense', {...v, 'acknowledge': 'true'});
    expect((await f.store.snapshot()).balance(a), BigInt.from(8000));
  });
  test('correction/reversal retain originals, current versions, dependencies and exact source caps', () async {
    final a = await f.account('Cash');
    final e = await f.post('expense', {
      'name': 'Original',
      'account': a,
      'amount': '100.00',
      'category': 'category-food',
    });
    final values = (await f.store.snapshot()).revision(e).values;
    final corrected = await f.post('correction', {
      ...values,
      'source': e,
      'sourceVersion': '1',
      'amount': '120.00',
      'reason': 'Receipt correction',
    });
    var s = await f.store.snapshot();
    expect(s.revision(e).amount, BigInt.from(10000));
    expect(s.balance(a), BigInt.from(113000));
    await expectLater(
      f.store.commit(
        await f.command('reversal', {
          'source': e,
          'sourceVersion': '1',
          'reason': 'stale',
        }),
      ),
      throwsA(isA<LocalRuleException>()),
    );
    final refund = await f.post('refund', {
      'source': corrected,
      'sourceVersion': '2',
      'account': a,
      'amount': '20.00',
      'refundCategory': 'category-food',
      'reason': 'Returned item',
    });
    await expectLater(
      f.store.commit(
        await f.command('refund', {
          'source': corrected,
          'sourceVersion': '2',
          'account': a,
          'amount': '100.01',
          'refundCategory': 'category-food',
          'reason': 'Over-refund',
        }),
      ),
      throwsA(isA<LocalRuleException>()),
    );
    await expectLater(
      f.store.commit(
        await f.command('reversal', {
          'source': corrected,
          'sourceVersion': '2',
          'reason': 'has refund',
        }),
      ),
      throwsA(isA<LocalRuleException>()),
    );
    await f.post('reversal', {
      'source': refund,
      'sourceVersion': '1',
      'reason': 'Refund recorded in error',
    });
    await f.post('reversal', {
      'source': corrected,
      'sourceVersion': '2',
      'reason': 'Purchase recorded in error',
    });
    s = await f.store.snapshot();
    expect(s.balance(a), BigInt.from(125000));
    expect(s.revisions.length, 6);
  });
  test('split refund caps apply per original category, fees eligible, no invented income', () async {
    final a = await f.account('Cash');
    final e = await f.post('expense', {
      'name': 'Split',
      'account': a,
      'amount': '185.50',
      'category': 'category-food',
      'split': 'true',
      'splitAmount': '150.00',
      'splitCategory': 'category-transport',
    });
    final refund = {
      'source': e,
      'sourceVersion': '1',
      'account': a,
      'refundCategory': 'category-transport',
      'reason': 'Returned',
    };
    await expectLater(
      f.store.commit(await f.command('refund', {...refund, 'amount': '35.51'})),
      throwsA(isA<LocalRuleException>()),
    );
    await f.post('refund', {...refund, 'amount': '35.50'});
    final c = LocalFinancialController(f.store, await f.store.snapshot());
    expect(c.recognizedSpending, BigInt.from(15000));
    expect(c.recognizedIncome, BigInt.zero);
    c.dispose();
  });
  test('reconciliation compares as of date, adjustment equity is explicit and rejects stale sources', () async {
    final a = await f.account('Cash');
    final r = await f.post('reconcile', {'account': a, 'amount': '1200.00'});
    expect((await f.store.snapshot()).balance(a), BigInt.from(125000));
    await f.post('adjustment', {
      'source': r,
      'account': a,
      'reason': 'Counted cash',
    });
    var c = LocalFinancialController(f.store, await f.store.snapshot());
    expect(c.account(a).balance, BigInt.from(120000));
    expect(c.recognizedSpending, BigInt.zero);
    c.dispose();
    await expectLater(
      f.store.commit(
        await f.command('adjustment', {
          'source': r,
          'account': a,
          'reason': 'Duplicate',
        }),
      ),
      throwsA(isA<LocalRuleException>()),
    );
    final comparison = await f.post('reconcile', {
      'account': a,
      'amount': '1100.00',
    });
    await f.post('expense', {
      'name': 'Late receipt',
      'date': '2026-10-20',
      'account': a,
      'amount': '10.00',
      'category': 'category-food',
    });
    await expectLater(
      f.store.commit(
        await f.command('adjustment', {
          'source': comparison,
          'account': a,
          'reason': 'stale',
        }),
      ),
      throwsA(isA<LocalRuleException>()),
    );
    c = LocalFinancialController(f.store, await f.store.snapshot());
    expect(c.comparisonStatus(comparison), contains('Sources changed'));
    c.dispose();
  });
  test(
    'archive retains nonzero balance/history and replay works after archive',
    () async {
      final a = await f.account('Cash', '0.00');
      final cmd = await f.command('income', {
        'name': 'Gift',
        'account': a,
        'amount': '10.00',
        'category': 'category-income',
        'incomeClass': 'gift',
      });
      await f.store.commit(cmd);
      await f.post('archive', {'account': a, 'reason': 'Closed'});
      await f.store.commit(cmd);
      await expectLater(
        f.store.commit(await f.command('income', cmd.values)),
        throwsA(isA<LocalRuleException>()),
      );
      expect((await f.store.snapshot()).accounts.single.archived, isTrue);
      expect((await f.store.snapshot()).balance(a), BigInt.from(1000));
    },
  );
  test('preview/current version race rejects one competing command; accepted ID is idempotent', () async {
    final a = await f.account('Cash');
    final x = await f.command('expense', {
      'name': 'One',
      'account': a,
      'amount': '1.00',
      'category': 'category-food',
    });
    final y = await f.command('expense', {...x.values, 'name': 'Two'});
    final results = await Future.wait([
      f.store.commit(x).then((_) => true).catchError((Object _) => false),
      f.store.commit(y).then((_) => true).catchError((Object _) => false),
    ]);
    expect(results.where((x) => x).length, 1);
    final accepted = results.first ? x : y;
    await f.store.commit(accepted);
    await expectLater(
      f.store.commit(
        LocalCommand(
          id: accepted.id,
          owner: accepted.owner,
          expectedVersion: accepted.expectedVersion,
          kind: accepted.kind,
          values: {...accepted.values, 'amount': '2.00'},
        ),
      ),
      throwsA(isA<LocalRuleException>()),
    );
    expect((await f.store.snapshot()).balance(a), BigInt.from(124900));
  });
  test('presentation commit cannot claim memory-only success', () async {
    final c = LocalFinancialController(f.store, await f.store.snapshot());
    final preview = c.preview(FinancialAction.account, {
      ...c.defaults(FinancialAction.account),
      'name': 'Wallet',
    }, c.nextCommand());
    expect(preview.valid, isTrue, reason: preview.errors.join('\n'));
    expect(
      await c.commitPreview(preview, DemoOutcome.accepted),
      DemoOutcome.accepted,
    );
    expect((await f.store.snapshot()).accounts.single.name, 'Wallet');
    c.dispose();
  });
}
