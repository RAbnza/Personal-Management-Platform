import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/local/finance_domain.dart';
import 'package:salapiya/shared/shared_domain.dart';
import 'package:salapiya/shared/card_funding_contract.dart';
import 'package:salapiya/local/local_profiles.dart';
import 'package:salapiya/local/local_store.dart';
import 'package:salapiya/p0/portable_recovery.dart';

import 'dart:convert';
import 'dart:io';

import 'local_test_support.dart';

const a = '10000000-0000-4000-8000-000000000001';
const b = '10000000-0000-4000-8000-000000000002';
const c = '10000000-0000-4000-8000-000000000003';
void main() {
  final fixture = jsonDecode(
    File('../../contracts/salapiya/p3_shared.json').readAsStringSync(),
  ) as Map;
  test('P2 journal leaf upgrade rolls back interruption and preserves exact IDs, money, FKs and seals', () async {
    final f = await LocalFixture.open();
    try {
      final account = await f.account('Upgrade fixture');
      await f.post('expense', {
        'name': 'Prior P2 spending',
        'amount': '10.01',
        'account': account,
        'category': 'category-food',
      });
      final rows = await f.store.db.getAll(
        'SELECT * FROM local_posting ORDER BY id',
      );
      await f.store.db.writeTransaction((tx) async {
        final triggers = await tx.getAll(
          "SELECT sql FROM sqlite_master WHERE type='trigger' AND (tbl_name='local_posting' OR name='local_seal_balanced')",
        );
        var ddl =
            (await tx.get(
                  "SELECT sql FROM sqlite_master WHERE name='local_posting'",
                ))['sql']
                as String;
        ddl = ddl
            .replaceFirst('local_posting(', 'local_posting_old(')
            .replaceAll(
              ",\u0027shared_receivable\u0027,\u0027shared_payable\u0027,\u0027shared_clearing\u0027",
              '',
            );
        await tx.execute(ddl);
        await tx.execute(
          'INSERT INTO local_posting_old SELECT * FROM local_posting',
        );
        await tx.execute('DROP TRIGGER local_seal_balanced');
        await tx.execute('DROP TABLE local_posting');
        await tx.execute(
          'ALTER TABLE local_posting_old RENAME TO local_posting',
        );
        for (final t in triggers) {
          await tx.execute(t['sql'] as String);
        }
        await tx.execute('DROP TABLE shared_intent');
        await tx.execute('DROP TABLE shared_draft');
        await tx.execute('DROP TABLE shared_schema');
        await tx.execute('DROP TABLE shared_review_history');
        await tx.execute('UPDATE local_schema SET version=2');
      });
      await expectLater(f.store.migrate(interrupt: true), throwsA(anything));
      expect(
        (await f.store.db.get('SELECT version FROM local_schema'))['version'],
        2,
      );
      expect(
        await f.store.db.getAll('SELECT * FROM local_posting ORDER BY id'),
        rows,
      );
      await f.store.migrate();
      await f.store.integrity();
      expect(
        (await f.store.db.get('SELECT version FROM local_schema'))['version'],
        3,
      );
      expect(
        await f.store.db.getAll('SELECT * FROM local_posting ORDER BY id'),
        rows,
      );
      expect((await f.store.snapshot()).balance(account), BigInt.from(123999));
    } finally {
      await f.close();
    }
  });
  test('P3 archive preserves original group intent and draft without membership, secrets or automatic replay', () async {
    final f = await LocalFixture.open();
    final directory = await Directory.systemTemp.createTemp(
      'salapiya-p3-restore-',
    );
    final profiles = LocalProfiles(directory, MemoryProfileVault());
    try {
      await f.account('Archive fixture');
      await f.store.stageConnection(a, 'synthetic@example.test', newLocalId());
      await f.store.db.execute(
        "UPDATE connected_profile SET phase='connected'",
      );
      final id = newLocalId();
      final payload = jsonEncode({
        'contract': 3,
        'group': b,
        'op': 'bill',
        'version': 1,
        'values': {
          'name': 'Original offline group intent',
          'date': '2026-10-25',
          'total': '10000',
          'paid': {a: '10000'},
          'shares': {a: '5000', b: '5000'},
          'method': 'exact',
        },
      });
      await f.store.saveSharedIntent(id, a, b, payload, queued: true);
      await f.store.db.execute('INSERT INTO shared_draft VALUES(?,?,?,?)', [
        c,
        b,
        jsonEncode({
          'title': 'Draft',
          'fields': {'name': 'Recoverable'},
          'op': 'bill',
        }),
        '2026-10-25T00:00:00Z',
      ]);
      final archive = await LocalBackup.capture(f.store);
      expect(archive['format'], 3);
      expect((archive['sharedIntents'] as List).single['payload'], payload);
      expect(jsonEncode(archive), isNot(contains('token_hash')));
      expect(archive.containsKey('groups'), isFalse);
      final secret = await PortableRecovery.newRecoverySecret();
      final restored = await profiles.restore(
        await LocalBackup.unseal(
          await LocalBackup.seal(archive, secret),
          secret,
        ),
      );
      expect((await restored.connection())!['phase'], 'restored');
      expect(
        (await restored.db.get('SELECT state FROM shared_intent WHERE id=?', [
          id,
        ]))['state'],
        'restored',
      );
      expect(await restored.db.getAll('SELECT id FROM p3_group'), isEmpty);
      expect(await restored.db.getNextCrudTransaction(), isNull);
      expect(
        (await restored.db.get('SELECT payload FROM shared_draft WHERE id=?', [
          c,
        ]))['payload'],
        contains('Recoverable'),
      );
    } finally {
      await profiles.close();
      await directory.delete(recursive: true);
      await f.close();
    }
  });
  test(
    'shared canonical fixture and P4 existing-card nonduplication contract',
    () {
      expect(
        equalShares(
          BigInt.parse(fixture['rounding']['total'] as String),
          List<String>.from(fixture['people'] as List),
        ).values.toList(),
        fixture['rounding']['shares'],
      );
      final expected = fixture['existingCard'];
      final evidence = SharedCardEvidence(
        owner: a,
        transaction: b,
        revision: c,
        fundedMinor: BigInt.parse(expected['purchaseLiability'] as String),
        liabilityMinor: BigInt.parse(expected['purchaseLiability'] as String),
      );
      final plan = classifyExistingSharedCard(
        owner: a,
        evidence: evidence,
        expectedRevision: c,
        contribution: evidence.fundedMinor,
        consumedShare: BigInt.parse(expected['consumedShare'] as String),
      );
      expect(plan.additionalCash.toString(), expected['additionalCash']);
      expect(
        plan.additionalCardLiability.toString(),
        expected['additionalLiability'],
      );
      expect(plan.position.toString(), expected['receivable']);
      expect(
        () => classifyExistingSharedCard(
          owner: b,
          evidence: evidence,
          expectedRevision: c,
          contribution: evidence.fundedMinor,
          consumedShare: BigInt.zero,
        ),
        throwsA(anything),
      );
    },
  );
  test('canonical PHP100 split, independent axes, exact large values and invalid serialization', () {
    expect(equalShares(BigInt.from(10000), [c, b, a]), {
      a: '3334',
      b: '3333',
      c: '3333',
    });
    for (final bad in [100, '01', '1.0', '1e3', '-1', '9223372036854775808']) {
      expect(() => sharedMinor(bad), throwsA(anything));
    }
    expect(
      sharedMinor('9223372036854775807').toString(),
      '9223372036854775807',
    );
    expect(
      () => validateSharedAxis({a: '9999'}, {a: {}}, BigInt.from(10000)),
      throwsA(anything),
    );
  });
  test('reciprocal attribution retains source explanations; pending, disputed, confirmed and advance stay distinct', () {
    final g = SharedGroup({
      'id': a,
      'name': 'Fixture',
      'version': 1,
      'complete': true,
      'archived': false,
      'people': {a: {}, b: {}, c: {}},
      'bills': {
        'one': {
          'revisions': [
            {
              'id': 'r1',
              'total': '120000',
              'paid': {a: '120000'},
              'shares': {a: '40000', b: '40000', c: '40000'},
            },
          ],
          'refunds': [],
        },
        'two': {
          'revisions': [
            {
              'id': 'r2',
              'total': '10000',
              'paid': {b: '10000'},
              'shares': {a: '10000'},
            },
          ],
          'refunds': [],
        },
      },
      'settlements': {
        's': {
          'sender': b,
          'recipient': a,
          'amount': '15000',
          'advance': '0',
          'state': 'pending',
          'allocations': {
            'one': {'amount': '15000', 'revision': 'r1'},
          },
        },
      },
    });
    expect(g.due(b, a), BigInt.from(30000));
    expect(g.positions()[a], BigInt.from(70000));
    expect(g.positions(projected: true)[a], BigInt.from(55000));
    expect(g.settlementAllocation(b, a, BigInt.from(30000))['allocations'], {
      'one': {'revision': 'r1', 'amount': '30000'},
    });
    final s = g.data['settlements']['s'];
    s['state'] = 'disputed';
    expect(g.suggestions, isEmpty);
    expect(g.positions(projected: true)[a], BigInt.from(70000));
    s['state'] = 'confirmed';
    expect(g.due(b, a), BigInt.from(15000));
    expect(sumMinor(g.positions().values), BigInt.zero);
    expect(g.edges().where((e) => e.bill == 'one').length, 3);
    s['state'] = 'reversed';
    expect(g.positions()[a], BigInt.from(70000));
  });
  test('encrypted private existing-purchase adoption, versioned share review, no duplicate cash, P4 fail-closed and immutable source guards', () async {
    final f = await LocalFixture.open();
    try {
      final account = await f.account('P3 wallet', '2000.00');
      final purchase = await f.post('expense', {
        'name': 'Dinner',
        'amount': '1200.00',
        'account': account,
        'category': 'category-food',
      });
      final values = {
        'name': 'Shared dinner',
        'sharedMode': 'bill',
        'sharedGroup': a,
        'sharedKey': b,
        'sharedRevision': b,
        'fundingAmount': '1200.00',
        'shareAmount': '400.00',
        'account': account,
        'category': 'category-food',
        'funding': 'cash',
        'source': purchase,
        'sourceVersion': '1',
        'reason': 'Adopt same purchase',
      };
      final id = await f.post('shared', values);
      var snapshot = await f.store.snapshot();
      expect(snapshot.balance(account), BigInt.from(80000));
      var r = snapshot.revision(id);
      expect(r.previous, purchase);
      expect(r.actionId, purchase);
      expect(r.postings.map((p) => [p.ledger, p.amount.toString()]).toList(), [
        ['cash', '-120000'],
        ['expense', '40000'],
        ['shared_receivable', '80000'],
      ]);
      final revised = await f.post('shared', {
        ...values,
        'source': id,
        'sourceVersion': '2',
        'shareAmount': '300.00',
        'sharedRevision': c,
        'reason': 'Keep cash, correct consumed share',
      });
      snapshot = await f.store.snapshot();
      expect(snapshot.balance(account), BigInt.from(80000));
      expect(
        snapshot
            .revision(revised)
            .postings
            .where((p) => p.ledger == 'expense')
            .single
            .amount,
        BigInt.from(30000),
      );
      await expectLater(
        f.post('correction', {
          'source': revised,
          'sourceVersion': '3',
          'amount': '1.00',
          'reason': 'Bypass',
          'account': account,
          'category': 'category-food',
        }),
        throwsA(anything),
      );
      await expectLater(
        f.post('shared', {...values, 'funding': 'card'}),
        throwsA(anything),
      );
      await f.store.integrity();
    } finally {
      await f.close();
    }
  });
}
