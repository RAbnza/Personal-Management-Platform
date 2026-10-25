import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/connected/command_connector.dart';
import 'package:salapiya/connected/financial_contract.dart';
import 'package:salapiya/local/finance_domain.dart';
import 'package:salapiya/local/local_profiles.dart';
import 'package:salapiya/local/local_store.dart';
import 'package:salapiya/local/local_runtime.dart';
import 'package:salapiya/gallery/settings.dart';
import 'package:salapiya/p0/portable_recovery.dart';

import 'local_test_support.dart';

const actor = '30000000-0000-4000-8000-000000000001';
final fixture = jsonDecode(
  File('../../contracts/salapiya/p2_finance.json').readAsStringSync(),
) as Map<String, dynamic>;

LocalSnapshot emptySnapshot(String owner) => LocalSnapshot(
  owner: owner,
  version: 0,
  accounts: [],
  categories: [
    for (final c in defaultLocalCategories)
      LocalCategory('category-${c.$1}', c.$2, c.$3),
  ],
  revisions: [],
);

// Explicit download simulation, as in the retained P0 tests. These inserts do
// not certify CDC. Real native hosted tests separately exercise PowerSync.
Future<void> download(LocalStore store, List<LocalCommand> commands) async {
  var s = emptySnapshot(store.owner);
  await store.db.execute(
    'INSERT OR REPLACE INTO p2_profile(id,owner_id,name,revision) VALUES(?,?,?,?)',
    [store.owner, actor, 'Synthetic P2', commands.length],
  );
  for (final c in commands) {
    final plan = planLocal(s, rebaseCommand(c, s.version));
    await store.db.execute(
      'INSERT OR REPLACE INTO p2_command(id,owner_id,profile_id,payload,plan,sequence_no,recorded_at) VALUES(?,?,?,?,?,?,?)',
      [
        c.id,
        actor,
        store.owner,
        c.payload,
        jsonEncode(financialPlanJson(plan)),
        s.version + 1,
        '2026-10-25T00:00:00Z',
      ],
    );
    s = applyFinancialPlan(s, plan);
  }
  // Remove only these synthetic view-write transport records, before queuing
  // any real test command. No production queue is cleared by application code.
  while (true) {
    final t = await store.db.getNextCrudTransaction();
    if (t == null) break;
    await t.complete();
  }
}

Future<List<LocalCommand>> history(LocalStore store) async => [
  for (final r in await store.db.getAll(
    'SELECT id,payload FROM local_command ORDER BY sequence_no',
  ))
    LocalCommand.decode(r['id'] as String, r['payload'] as String),
];
Future<void> enroll(LocalStore store) async {
  final original = await history(store);
  await store.stageConnection(actor, 'synthetic@example.test', newLocalId());
  await store.db.execute("UPDATE connected_profile SET phase='published'");
  await download(store, original);
  expect(await store.reconcileDownloaded(), isTrue);
}

void main() {
  test('an unpublished enrollment archive preserves its frozen graph without granting authority to recreate published history', () async {
    final f = await LocalFixture.open();
    final dir = await Directory.systemTemp.createTemp(
      'salapiya-p2-stage-backup-',
    );
    final restoredProfiles = LocalProfiles(dir, MemoryProfileVault());
    try {
      await f.account('Unpublished wallet');
      await f.store.stageConnection(
        actor,
        'synthetic@example.test',
        newLocalId(),
      );
      final staged = (await f.store.connection())!;
      final bundle = await LocalBackup.capture(f.store);
      expect((bundle['connection'] as Map)['origin'], 'staged');
      final restored = await restoredProfiles.restore(bundle);
      final state = (await restored.connection())!;
      expect(state['phase'], 'restored');
      expect(state['enrollment_id'], staged['enrollment_id']);
      expect(state['enrollment_snapshot'], staged['enrollment_snapshot']);
      expect(state['enrollment_name'], staged['enrollment_name']);
      expect(await restored.db.getNextCrudTransaction(), isNull);
    } finally {
      await restoredProfiles.close();
      await dir.delete(recursive: true);
      await f.close();
    }
  });
  test('production Overview separates accepted money from the exact durable pending projection', () async {
    final f = await LocalFixture.open();
    final settings = GallerySettings();
    final runtime = LocalRuntime(
      LocalProfiles(f.directory, MemoryProfileVault()),
      settings,
    );
    try {
      final a = await f.account('Summary wallet', '100.00');
      await enroll(f.store);
      await f.post('expense', {
        'account': a,
        'name': 'Pending exact expense',
        'date': '2026-10-22',
        'amount': '9.99',
        'category': 'category-food',
      });
      await runtime.activate(f.store);
      expect(runtime.session!.accepted, BigInt.from(10000));
      expect(runtime.session!.projected, BigInt.from(9001));
      expect(runtime.session!.pending, isTrue);
    } finally {
      await runtime.close();
      runtime.dispose();
      settings.dispose();
      await f.close();
    }
  });
  test('connected preview generations never repeat when a pending overlay is rejected', () async {
    final f = await LocalFixture.open();
    try {
      final a = await f.account('Generation wallet', '100.00');
      await enroll(f.store);
      final first = await f.command('expense', {
        'account': a,
        'name': 'Waiting',
        'date': '2026-10-22',
        'amount': '1.00',
        'category': 'category-food',
      });
      await f.store.commit(first);
      final preview = await f.command('income', {
        'account': a,
        'name': 'Frozen preview',
        'date': '2026-10-22',
        'amount': '2.00',
        'category': 'category-income',
        'incomeClass': 'gift',
      });
      final version = (await f.store.snapshot()).version;
      await f.store.db.execute(
        "UPDATE connected_intent SET state='review',reason='server conflict' WHERE id=?",
        [first.id],
      );
      expect((await f.store.snapshot()).version, greaterThan(version));
      await expectLater(
        f.store.commit(preview),
        throwsA(isA<LocalRuleException>()),
      );
    } finally {
      await f.close();
    }
  });
  test('P1 schema upgrade rolls back interruption, preserves history and accepts version-1 archives', () async {
    final f = await LocalFixture.open();
    final recoveryDir = await Directory.systemTemp.createTemp(
      'salapiya-p2-old-archive-',
    );
    final recovered = LocalProfiles(recoveryDir, MemoryProfileVault());
    try {
      final id = await f.account('Original P1 wallet');
      final before = await LocalBackup.capture(f.store);
      await f.store.db.writeTransaction((tx) async {
        for (final table in [
          'connected_intent',
          'connected_profile',
          'connected_schema',
        ]) {
          await tx.execute('DROP TABLE $table');
        }
        await tx.execute('UPDATE local_schema SET version=1');
      });
      await expectLater(f.store.migrate(interrupt: true), throwsStateError);
      expect(
        (await f.store.db.get('SELECT version FROM local_schema'))['version'],
        1,
      );
      expect(
        await f.store.db.getAll(
          "SELECT name FROM sqlite_master WHERE name='connected_profile'",
        ),
        isEmpty,
      );
      await f.store.migrate();
      await f.store.integrity();
      expect(
        (await f.store.db.get('SELECT version FROM local_schema'))['version'],
        2,
      );
      expect((await f.store.snapshot()).accounts.single.id, id);
      expect(
        (await LocalBackup.capture(f.store))['commands'],
        before['commands'],
      );
      before['localSchema'] = 1;
      LocalBackup.validate(before);
      final old = await recovered.restore(before);
      expect((await old.snapshot()).accounts.single.id, id);
      expect((await old.snapshot()).balance(id), BigInt.from(125000));
    } finally {
      await recovered.close();
      await recoveryDir.delete(recursive: true);
      await f.close();
    }
  });
  test('reviewed cloud switch retains the original protected key, encrypted files, records and drafts', () async {
    final dir = await Directory.systemTemp.createTemp('salapiya-p2-switch-');
    final vault = MemoryProfileVault();
    final active = LocalProfiles(dir, vault);
    try {
      final old = await active.create('Preserved original', {'theme': 'dark'});
      final id = newLocalId();
      await old.commit(
        LocalCommand(
          id: id,
          owner: old.owner,
          expectedVersion: 0,
          kind: 'account',
          values: {
            'name': 'Preserved wallet',
            'kind': 'Cash',
            'cutoff': '2026-10-01',
            'amount': '100.00',
          },
        ),
      );
      await old.saveDraft('expense:', newLocalId(), {
        'name': 'Preserved draft',
      });
      final descriptor = jsonDecode(vault.value!) as Map;
      final remote = await active.retrieveConnected(
        newLocalId(),
        'Reviewed cloud',
        actor,
        'synthetic@example.test',
        preserveCurrent: true,
      );
      expect(remote.owner, isNot(old.owner));
      expect((jsonDecode(vault.value!) as Map)['preserved'], descriptor);
      final original = openLocalDatabase(
        '${dir.path}/${descriptor['id']}.sqlite',
        descriptor['key'] as String,
      );
      await original.initialize();
      final preserved = LocalStore(original, old.owner);
      try {
        await preserved.integrity();
        expect((await preserved.snapshot()).balance(id), BigInt.from(10000));
        expect((await preserved.drafts()).length, 1);
      } finally {
        await original.close();
      }
    } finally {
      await active.close();
      await dir.delete(recursive: true);
    }
  });
  test('shared P1/P2 fixture reproduces every exact financial plan and account balance', () {
    var s = emptySnapshot(fixture['profile'] as String);
    for (final raw in fixture['commands'] as List) {
      final row = raw as Map;
      final c = LocalCommand.decode(
        row['id'] as String,
        row['payload'] as String,
      );
      final p = planLocal(s, c);
      expect(canonicalJson(financialPlanJson(p)), canonicalJson(row['plan']));
      s = applyFinancialPlan(s, p);
      expect({
        for (final a in s.accounts) a.id: '${s.balance(a.id)}',
      }, row['balances']);
    }
  });
  test('P1 enrollment freeze/cancel retains ledger, IDs, drafts, preferences and original key', () async {
    final f = await LocalFixture.open();
    try {
      final a = await f.account('Retained wallet');
      await f.store.savePreferences('Retained name', {'hideAmounts': 'true'});
      await f.store.saveDraft('expense:', newLocalId(), {
        'name': 'Retained draft',
      });
      final before = await LocalBackup.capture(f.store);
      await f.store.stageConnection(
        actor,
        'synthetic@example.test',
        newLocalId(),
      );
      final staged = (await f.store.connection())!;
      await f.store.stageConnection(
        actor,
        'synthetic@example.test',
        newLocalId(),
      );
      expect(
        (await f.store.connection())!['enrollment_id'],
        staged['enrollment_id'],
      );
      await expectLater(
        f.post('income', {
          'account': a,
          'amount': '1.00',
          'name': 'Frozen',
          'category': 'category-income',
          'incomeClass': 'gift',
        }),
        throwsA(isA<LocalRuleException>()),
      );
      await f.store.cancelStaging();
      final after = await LocalBackup.capture(f.store);
      for (final key in [
        'commands',
        'drafts',
        'preferences',
        'owner',
        'revision',
      ]) {
        expect(after[key], before[key]);
      }
      expect((await f.store.snapshot()).balance(a), BigInt.from(125000));
    } finally {
      await f.close();
    }
  });
  test('A06 real SDK queue survives lost response/reopen; receipt alone does not retire overlay; downloaded evidence does not double count', () async {
    final f = await LocalFixture.open();
    var store = f.store;
    try {
      final a = await f.account('Connected wallet', '100.00');
      await enroll(store);
      final baseline = await history(store);
      final c = await f.command('expense', {
        'account': a,
        'name': 'Offline expense',
        'date': '2026-10-22',
        'amount': '10.01',
        'category': 'category-food',
      });
      await store.saveDraft('expense:', c.id, c.values);
      await expectLater(store.commit(c, interrupt: true), throwsStateError);
      expect(await store.hasReceipt(c.id), isFalse);
      expect(await store.draft('expense:'), isNotNull);
      expect(await store.db.getNextCrudTransaction(), isNull);
      await store.commit(c);
      expect(await store.draft('expense:'), isNull);
      expect((await store.snapshot()).balance(a), BigInt.from(8999));
      var effects = 0, lost = true;
      Map<String, dynamic>? receipt;
      FinancialConnector connector() => FinancialConnector(
        store: store,
        actor: actor,
        credentials: () async => null,
        submit: (id, payload) async {
          if (receipt == null) {
            effects++;
            receipt = {
              'id': id,
              'owner_id': actor,
              'profile_id': store.owner,
              'outcome': 'accepted',
            };
          }
          if (lost) {
            lost = false;
            throw const SocketException(
              'Simulated lost response after server commit',
            );
          }
          return receipt!;
        },
      );
      await expectLater(
        connector().uploadData(store.db),
        throwsA(isA<SocketException>()),
      );
      await store.close();
      final reopened = openLocalDatabase(
        '${f.directory.path}/local.sqlite',
        'synthetic-p1-key',
      );
      await reopened.initialize();
      store = LocalStore(reopened, f.store.owner);
      await store.migrate();
      await store.integrity();
      await connector().uploadData(store.db);
      expect(effects, 1);
      expect(await store.db.getNextCrudTransaction(), isNull);
      expect(
        (await store.db.get('SELECT state FROM connected_intent'))['state'],
        'accepted',
      );
      expect((await store.snapshot()).balance(a), BigInt.from(8999));
      // Cached boundary without new row cannot prove this pending command.
      expect(await store.reconcileDownloaded(requiredBoundary: 2), isFalse);
      expect(
        (await store.db.get('SELECT state FROM connected_intent'))['state'],
        'accepted',
      );
      await download(store, [...baseline, c]);
      expect(await store.reconcileDownloaded(requiredBoundary: 2), isTrue);
      expect(
        (await store.db.get('SELECT state FROM connected_intent'))['state'],
        'reconciled',
      );
      expect((await store.snapshot()).balance(a), BigInt.from(8999));
      await expectLater(
        store.commit(
          LocalCommand(
            id: c.id,
            owner: c.owner,
            expectedVersion: c.expectedVersion,
            kind: c.kind,
            values: {...c.values, 'amount': '10.02'},
          ),
        ),
        throwsA(isA<LocalRuleException>()),
      );
    } finally {
      await store.close();
      if (!identical(store, f.store)) await f.store.close();
      await f.directory.delete(recursive: true);
    }
  });
  test('rejected intent remains reviewable while unrelated queued work continues and connected offline corrections are gated', () async {
    final f = await LocalFixture.open();
    try {
      final a = await f.account('Connected wallet', '100.00');
      await enroll(f.store);
      final rejected = await f.post('expense', {
        'account': a,
        'name': 'Rejected',
        'date': '2026-10-22',
        'amount': '10.00',
        'category': 'category-food',
      });
      await f.post('income', {
        'account': a,
        'name': 'Valid',
        'date': '2026-10-22',
        'amount': '20.00',
        'category': 'category-income',
        'incomeClass': 'gift',
      });
      final connector = FinancialConnector(
        store: f.store,
        actor: actor,
        credentials: () async => null,
        submit: (id, _) async => {
          'id': id,
          'owner_id': actor,
          'profile_id': f.store.owner,
          'outcome': id == rejected ? 'rejected' : 'accepted',
          'reason': id == rejected ? 'source changed' : null,
        },
      );
      await connector.uploadData(f.store.db);
      await connector.uploadData(f.store.db);
      expect(await f.store.db.getNextCrudTransaction(), isNull);
      expect((await f.store.snapshot()).balance(a), BigInt.from(12000));
      expect(
        (await f.store.db.get(
          'SELECT state,reason,payload FROM connected_intent WHERE id=?',
          [rejected],
        ))['state'],
        'review',
      );
      await expectLater(
        f.post('archive', {'account': a, 'reason': 'Offline'}),
        throwsA(isA<LocalRuleException>()),
      );
    } finally {
      await f.close();
    }
  });
  test('A23 connected archive excludes credentials; independent restore holds original intents pending current authority/receipt review', () async {
    final f = await LocalFixture.open();
    final dir = await Directory.systemTemp.createTemp('salapiya-p2-restore-');
    final profiles = LocalProfiles(dir, MemoryProfileVault());
    try {
      final a = await f.account('Backed up', '100.00');
      await enroll(f.store);
      final id = await f.post('expense', {
        'account': a,
        'name': 'Unaccepted',
        'date': '2026-10-22',
        'amount': '10.00',
        'category': 'category-food',
      });
      final secret = await PortableRecovery.newRecoverySecret(),
          bundle = await LocalBackup.capture(f.store);
      expect(bundle['format'], 2);
      expect(jsonEncode(bundle), isNot(contains('access_token')));
      final archive = await LocalBackup.seal(bundle, secret);
      final restored = await profiles.restore(
        await LocalBackup.unseal(archive, secret),
      );
      expect((await restored.connection())!['phase'], 'restored');
      expect((await restored.snapshot()).balance(a), BigInt.from(10000));
      expect(
        (await restored.db.get('SELECT id,state FROM connected_intent'))['id'],
        id,
      );
      expect(
        (await restored.db.get('SELECT state FROM connected_intent'))['state'],
        'restored',
      );
      expect(await restored.db.getNextCrudTransaction(), isNull);
      await expectLater(
        restored.commit(
          LocalCommand(
            id: newLocalId(),
            owner: restored.owner,
            expectedVersion: (await restored.snapshot()).version,
            kind: 'category',
            values: {'name': 'Blocked', 'classification': 'expense'},
          ),
        ),
        throwsA(isA<LocalRuleException>()),
      );
    } finally {
      await profiles.close();
      await dir.delete(recursive: true);
      await f.close();
    }
  });
}
