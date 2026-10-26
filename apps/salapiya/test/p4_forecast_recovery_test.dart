import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/local/finance_domain.dart';
import 'package:salapiya/local/local_profiles.dart';
import 'package:salapiya/p0/portable_recovery.dart';

import 'local_test_support.dart';

void main() {
  late LocalFixture f;
  setUp(() async => f = await LocalFixture.open());
  tearDown(() => f.close());
  test('read-only forecasts retain exact bridge, installment historical payment, explicit bases and source exclusions', () async {
    final account = await f.account('Actual cash', '5000.00');
    final card = await f.post('creditCard', {
      'name': 'Provider card',
      'issuer': 'Provider',
      'amount': '0.00',
      'limit': '10000.00',
    });
    final purchase = await f.post('cardPurchase', {
      'name': 'Purchase',
      'card': card,
      'amount': '1200.00',
      'postingDate': '2026-10-21',
      'category': 'category-food',
    });
    final plan = await f.post('installment', {
      'name': 'Plan',
      'card': card,
      'purchase': purchase,
      'schedule': 'first,2026-11-01,400.00,100.00\nsecond,2026-12-01,400.00\nthird,2027-01-01,400.00',
      'principal': '1200.00',
      'interest': '0.00',
      'fee': '0.00',
      'reference': 'provider plan',
      'verified': 'true',
    });
    final statement = await f.post('statement', {
      'name': 'Statement',
      'card': card,
      'start': '2026-10-01',
      'end': '2026-10-21',
      'issued': '2026-10-21',
      'due': '2026-11-01',
      'amount': '1200.00',
      'minimum': '100.00',
      'reference': 'confirmed',
      'verified': 'true',
    });
    final actual = await f.post('income', {
      'name': 'Recorded future income',
      'date': '2026-10-25',
      'account': account,
      'amount': '100.01',
      'category': 'category-income',
      'incomeClass': 'earned',
    });
    final s = await f.store.snapshot(),
        before = await LocalBackup.capture(f.store);
    FinanceForecast project({
      Set<String> excluded = const {},
      List<String> statements = const [],
    }) => financialForecast(
      s,
      today: '2026-10-21',
      from: '2026-11-01',
      through: '2026-12-01',
      cardInstallments: [card],
      cardStatements: statements,
      excludedSources: excluded,
    );
    final p = project();
    expect(p.opening, BigInt.from(500000));
    expect(p.windowOpening, BigInt.from(510001));
    expect(p.daily['2026-11-01'], BigInt.from(480001));
    expect(p.daily['2026-12-01'], BigInt.from(440001));
    expect(
      project(excluded: {'installment:$plan:first'}).daily['2026-11-01'],
      BigInt.from(510001),
    );
    expect(
      () => project(excluded: {actual}),
      throwsA(isA<LocalRuleException>()),
    );
    expect(
      () => project(statements: [statement]),
      throwsA(isA<LocalRuleException>()),
    );
    final after = await LocalBackup.capture(f.store);
    expect(after['commands'], before['commands']);
    expect(
      () => financialForecast(
        s,
        today: '2026-10-21',
        from: '2026-10-21',
        through: '2026-11-01',
      ),
      throwsA(isA<LocalRuleException>()),
    );
    expect(
      () => financialForecast(
        s,
        today: '2026-10-21',
        from: '2026-10-22',
        through: '2027-10-23',
      ),
      throwsA(isA<LocalRuleException>()),
    );
  });

  test(
    'financial due revision invalidates prior source version without a payment',
    () async {
      final card = await f.post('creditCard', {
        'name': 'Card',
        'issuer': 'Provider',
        'amount': '100.00',
        'limit': '',
      });
      final statement = await f.post('statement', {
        'name': 'Statement',
        'card': card,
        'start': '2026-10-01',
        'end': '2026-10-21',
        'issued': '2026-10-21',
        'due': '2026-11-01',
        'amount': '100.00',
        'minimum': '',
        'reference': 'confirmed',
        'verified': 'true',
      });
      final before = financialReminderSources(
        await f.store.snapshot(),
        '2026-10-21',
        '2026-12-01',
      ).single;
      final revision = await f.post('financeCorrection', {
        'replace': statement,
        'replaceVersion': '1',
        'reason': 'Provider due-date revision',
        'due': '2026-11-05',
      });
      final s = await f.store.snapshot(),
          after = financialReminderSources(
            s,
            '2026-10-21',
            '2026-12-01',
          ).single;
      expect(after.id, before.id);
      expect(after.version, isNot(before.version));
      expect(after.date, '2026-11-05');
      expect(after.source, revision);
      expect(
        s.current.expand((r) => r.postings).where((p) => p.ledger == 'cash'),
        isEmpty,
      );
    },
  );

  test('P4 independent encrypted restore preserves full domain recipes, original IDs and metadata-only file coverage', () async {
    final account = await f.account('Wallet', '5000.00');
    final card = await f.post('creditCard', {
      'name': 'Card',
      'issuer': 'Provider',
      'amount': '0.00',
      'limit': '',
    });
    final purchase = await f.post('cardPurchase', {
      'name': 'Card receipt',
      'card': card,
      'amount': '125.01',
      'postingDate': '2026-10-21',
      'category': 'category-food',
    });
    await f.post('cardPayment', {
      'name': 'Actual payment',
      'card': card,
      'amount': '25.00',
      'account': account,
    });
    await f.post('debtImport', {
      'name': 'Imported debt',
      'lender': 'Provider',
      'debtType': 'personal_loan',
      'amount': '500.00',
      'principal': '',
    });
    await f.post('budget', {
      'name': 'Budget',
      'amount': '0.00',
      'category': 'category-food',
      'start': '2026-10-01',
      'endExclusive': '2026-11-01',
      'basis': 'net',
      'status': 'active',
    });
    final goal = await f.post('savingsGoal', {
      'name': 'Goal',
      'amount': '100.00',
      'status': 'active',
    });
    await f.post('reservation', {
      'name': 'Reserve',
      'goal': goal,
      'account': account,
      'amount': '100.00',
    });
    await f.post('financialFile', {
      'name': 'receipt.pdf',
      'sourceRevision': purchase,
      'mime': 'application/pdf',
      'size': '10',
      'checksum': 'a' * 64,
    });
    await f.store.saveDraft('cash-import:review', newLocalId(), {
      'checksum': 'synthetic',
      'raw0': '["retained original input"]',
    });
    final bundle = await LocalBackup.capture(f.store),
        secret = await PortableRecovery.newRecoverySecret();
    expect((bundle['financialCoverage'] as Map)['supportingFileMetadata'], 1);
    expect((bundle['financialCoverage'] as Map)['attachmentByteObjects'], 0);
    final sealed = await LocalBackup.seal(bundle, secret);
    await expectLater(
      LocalBackup.unseal(sealed, await PortableRecovery.newRecoverySecret()),
      throwsA(anything),
    );
    final corrupt = List<int>.from(sealed);
    corrupt[corrupt.length - 1] ^= 1;
    await expectLater(LocalBackup.unseal(corrupt, secret), throwsA(anything));
    final restoredDir = await Directory.systemTemp.createTemp(
      'salapiya-p4-independent-',
    );
    final profiles = LocalProfiles(restoredDir, MemoryProfileVault());
    try {
      final restored = await profiles.restore(
        await LocalBackup.unseal(sealed, secret),
      );
      expect(
        jsonEncode((await LocalBackup.capture(restored))['commands']),
        jsonEncode(bundle['commands']),
      );
      expect((await restored.snapshot()).balance(account), BigInt.from(497500));
      expect(
        (await restored.draft('cash-import:review'))!['values']['raw0'],
        '["retained original input"]',
      );
      await restored.integrity();
      expect(
        await restoredDir.list().any((f) => f.path.endsWith('.sfp')),
        isFalse,
      );
      await expectLater(
        profiles.restore(bundle),
        throwsA(isA<LocalRuleException>()),
      );
    } finally {
      await profiles.close();
      await restoredDir.delete(recursive: true);
    }
  });
}
