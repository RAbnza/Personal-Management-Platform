import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/local/finance_domain.dart';
import 'package:salapiya/local/local_profiles.dart';

import 'local_test_support.dart';

void main() {
  test('staging replay rolls back the entire validated prefix on a foreign command', () async {
    final f = await LocalFixture.open();
    addTearDown(f.close);
    final account = await f.command('account', {
      'name': 'Recoverable wallet',
      'kind': 'Cash',
      'amount': '100.00',
      'cutoff': '2026-10-01',
    });
    final foreign = LocalCommand(
      id: newLocalId(),
      owner: newLocalId(),
      expectedVersion: 1,
      kind: 'income',
      values: {
        'name': 'Forged',
        'account': account.id,
        'amount': '1.01',
        'date': '2026-10-21',
        'category': 'category-income',
        'incomeClass': 'earned',
      },
    );
    Map<String, dynamic> row(LocalCommand c) => {
      'id': c.id,
      'payload': c.payload,
      'recorded_at': '2026-10-21T00:00:00Z',
    };
    await expectLater(
      f.store.replayFinancialArchive([
        row(account),
        row(foreign),
      ], fromServer: false),
      throwsA(isA<LocalRuleException>()),
    );
    expect((await f.store.snapshot()).version, 0);
    expect((await f.store.snapshot()).accounts, isEmpty);
    expect(await f.store.hasReceipt(account.id), isFalse);
    expect((await f.store.db.get('SELECT count(*) n FROM local_seal'))['n'], 0);
    await f.store.replayFinancialArchive([row(account)], fromServer: false);
    expect((await f.store.snapshot()).balance(account.id), BigInt.from(10000));
    await expectLater(
      f.store.replayFinancialArchive([], fromServer: false),
      throwsA(isA<LocalRuleException>()),
    );
    await f.store.integrity();
  });

  test('cached staging replay preserves every original import command, cutoff rebase and exact postings', () async {
    final fixture = jsonDecode(
      await File('../../contracts/salapiya/p4_import.json').readAsString(),
    ) as Map;
    final source = await LocalFixture.open(owner: fixture['profile'] as String);
    final dir = await Directory.systemTemp.createTemp('salapiya-p6-replay-');
    final profiles = LocalProfiles(dir, MemoryProfileVault());
    try {
      for (final raw in fixture['commands'] as List) {
        final row = raw as Map;
        await source.store.commit(
          LocalCommand.decode(row['id'] as String, row['payload'] as String),
          recordedAt: '2026-10-26T00:00:00Z',
        );
      }
      final archive = await LocalBackup.capture(source.store);
      final restored = await profiles.restore(archive);
      final after = await LocalBackup.capture(restored);
      expect(after['commands'], archive['commands']);
      expect(after['revision'], archive['revision']);
      final snapshot = await restored.snapshot();
      expect(
        snapshot.balance(snapshot.accounts.single.id),
        BigInt.from(100000),
      );
      expect(snapshot.accounts.single.cutoff, '2026-10-01');
      expect(
        snapshot.revisions.map((r) => r.id),
        (await source.store.snapshot()).revisions.map((r) => r.id),
      );
      await restored.integrity();
    } finally {
      await profiles.close();
      await source.close();
      await dir.delete(recursive: true);
    }
  });
}
