import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/local/finance_domain.dart';
import 'package:salapiya/local/local_profiles.dart';
import 'package:salapiya/local/local_store.dart';
import 'package:salapiya/p0/portable_recovery.dart';

import 'local_test_support.dart';

void main() {
  for (final afterRename in [false, true]) {
    test(
      'restore activation resumes across ${afterRename ? 'final descriptor failure' : 'staging interruption'}',
      () async {
        final f = await LocalFixture.open();
        final dir = await Directory.systemTemp.createTemp(
          'salapiya-p1-activation-',
        );
        final vault = MemoryProfileVault();
        final profiles = LocalProfiles(dir, vault);
        try {
          await f.account('Recoverable');
          final bundle = await LocalBackup.capture(f.store);
          if (afterRename) vault.failAt = 2;
          await expectLater(
            profiles.restore(bundle, interruptActivation: !afterRename),
            throwsA(anything),
          );
          expect((jsonDecode(vault.value!) as Map)['phase'], 'restoring');
          vault.failAt = null;
          final reopened = (await profiles.reopen())!;
          expect(reopened.owner, f.store.owner);
          expect(
            (await reopened.snapshot()).accounts.single.name,
            'Recoverable',
          );
          await reopened.integrity();
        } finally {
          await profiles.close();
          await dir.delete(recursive: true);
          await f.close();
        }
      },
    );
  }
  test(
    'migration rollback, strict schema, supported version and integrity checks',
    () async {
      final dir = await Directory.systemTemp.createTemp('salapiya-p1-migrate-');
      final db = openLocalDatabase(
        '${dir.path}/local.sqlite',
        'test-migration-key',
      );
      try {
        await db.initialize();
        final store = LocalStore(db, newLocalId());
        await expectLater(store.migrate(interrupt: true), throwsStateError);
        expect(
          await db.getAll(
            "SELECT name FROM sqlite_master WHERE name='local_profile'",
          ),
          isEmpty,
        );
        await store.migrate();
        await store.initializeProfile('Private', {});
        await store.integrity();
        expect((await db.get('PRAGMA foreign_keys')).values.single, 1);
        expect((await db.get('PRAGMA synchronous')).values.single, 2);
        await db.execute('UPDATE local_schema SET version=2');
        await expectLater(store.migrate(), throwsA(isA<LocalRuleException>()));
        expect(await store.displayName(), 'Private');
      } finally {
        await db.close();
        await dir.delete(recursive: true);
      }
    },
  );
  test('financial rollback preserves draft; committed evidence sealed and draft removed atomically', () async {
    final f = await LocalFixture.open();
    try {
      final a = await f.account('Private wallet');
      final c = await f.command('expense', {
        'name': 'Immutable lunch',
        'account': a,
        'amount': '185.50',
        'category': 'category-food',
      });
      await f.store.saveDraft('expense:', c.id, c.values);
      await expectLater(f.store.commit(c, interrupt: true), throwsStateError);
      expect(await f.store.hasReceipt(c.id), isFalse);
      expect((await f.store.snapshot()).balance(a), BigInt.from(125000));
      expect(await f.store.draft('expense:'), isNotNull);
      await f.store.commit(c);
      expect(await f.store.draft('expense:'), isNull);
      await f.store.saveDraft('expense:', c.id, c.values);
      expect(await f.store.draft('expense:'), isNull);
      for (final sql in [
        "UPDATE local_posting SET amount_minor=1",
        "DELETE FROM local_revision",
        "UPDATE local_command SET payload='{}'",
        "INSERT INTO local_posting SELECT id||'x',owner_id,revision_id,ledger,account_id,category_id,effective_date,amount_minor,contract FROM local_posting LIMIT 1",
        "UPDATE local_account SET cutoff='1900-01-01'",
        "DELETE FROM local_category",
      ]) {
        await expectLater(f.store.db.execute(sql), throwsA(anything));
      }
      await f.store.integrity();
    } finally {
      await f.close();
    }
  });
  test('one offline profile, protected key, safe reopen, persisted preferences and missing-key refusal', () async {
    final dir = await Directory.systemTemp.createTemp('salapiya-p1-profile-');
    final vault = MemoryProfileVault(),
        profiles = LocalProfiles(dir, MemoryProfileVault());
    final manager = LocalProfiles(dir, vault);
    try {
      expect(await manager.reopen(), isNull);
      final store = await manager.create('Real local profile', {
        'theme': 'dark',
      });
      final owner = store.owner;
      await store.savePreferences('Renamed', {
        'theme': 'dark',
        'hideAmounts': 'true',
      });
      await store.saveDraft('income:', newLocalId(), {
        'amount': '90071992547409.91',
      });
      await expectLater(
        manager.create('Second', {}),
        throwsA(isA<LocalRuleException>()),
      );
      await manager.close();
      final bytes = await File('${dir.path}/$owner.sqlite').readAsBytes();
      expect(
        utf8.decode(bytes, allowMalformed: true),
        isNot(contains('Renamed')),
      );
      final reopened = (await manager.reopen())!;
      expect(reopened.owner, owner);
      expect(await reopened.displayName(), 'Renamed');
      expect((await reopened.preferences())['theme'], 'dark');
      expect(
        (await reopened.draft('income:'))!['values']['amount'],
        '90071992547409.91',
      );
      await manager.close();
      await expectLater(profiles.reopen(), throwsA(isA<LocalRuleException>()));
      expect(await File('${dir.path}/$owner.sqlite').exists(), isTrue);
      final original = jsonDecode(vault.value!) as Map<String, dynamic>;
      vault.value = jsonEncode({
        ...original,
        'key': await PortableRecovery.newRecoverySecret(),
      });
      await expectLater(manager.reopen(), throwsA(anything));
      expect(await File('${dir.path}/$owner.sqlite').exists(), isTrue);
      vault.value = jsonEncode(original);
      expect((await manager.reopen())!.owner, owner);
    } finally {
      await manager.close();
      await profiles.close();
      await dir.delete(recursive: true);
    }
  });
  test(
    'interrupted first-run activation resumes the same identity and key',
    () async {
      final dir = await Directory.systemTemp.createTemp('salapiya-p1-init-');
      final vault = MemoryProfileVault()..failAt = 2;
      final profiles = LocalProfiles(dir, vault);
      try {
        await expectLater(
          profiles.create('Interrupted', {}),
          throwsA(anything),
        );
        final id = (jsonDecode(vault.value!) as Map)['id'];
        expect((jsonDecode(vault.value!) as Map)['phase'], 'initializing');
        vault.failAt = null;
        final store = (await profiles.reopen())!;
        expect(store.owner, id);
        expect(await store.displayName(), 'Interrupted');
        expect(
          (await store.snapshot()).categories.length,
          defaultLocalCategories.length,
        );
      } finally {
        await profiles.close();
        await dir.delete(recursive: true);
      }
    },
  );
  test('portable encrypted backup independently restores history, preferences and drafts without OS key', () async {
    final f = await LocalFixture.open();
    final recovery = await Directory.systemTemp.createTemp(
      'salapiya-p1-recovery-',
    );
    final manager = LocalProfiles(recovery, MemoryProfileVault());
    try {
      final a = await f.account('Wallet');
      final e = await f.post('expense', {
        'name': 'Exact lunch',
        'account': a,
        'amount': '185.50',
        'category': 'category-food',
      });
      final old = (await f.store.snapshot()).revision(e);
      await f.post('correction', {
        ...old.values,
        'source': e,
        'sourceVersion': '1',
        'reason': 'Receipt',
        'amount': '185.51',
      });
      await f.store.savePreferences('Restorable', {'theme': 'light'});
      await f.store.saveDraft('transfer:', newLocalId(), {'amount': '1000.00'});
      final bundle = await LocalBackup.capture(f.store),
          secret = await PortableRecovery.newRecoverySecret();
      final bytes = await LocalBackup.seal(bundle, secret);
      expect(
        utf8.decode(bytes, allowMalformed: true),
        isNot(contains('Exact lunch')),
      );
      await expectLater(
        LocalBackup.unseal(bytes, await PortableRecovery.newRecoverySecret()),
        throwsA(anything),
      );
      final tampered = bytes.toList()..[bytes.length - 1] ^= 1;
      await expectLater(
        LocalBackup.unseal(tampered, secret),
        throwsA(anything),
      );
      final restored = await manager.restore(
        await LocalBackup.unseal(bytes, secret),
      );
      expect(restored.owner, f.store.owner);
      expect((await restored.snapshot()).balance(a), BigInt.from(106449));
      expect(
        (await restored.snapshot()).revisions.map((r) => r.id),
        (await f.store.snapshot()).revisions.map((r) => r.id),
      );
      expect(await restored.displayName(), 'Restorable');
      expect((await restored.preferences())['theme'], 'light');
      expect(
        (await restored.draft('transfer:'))!['values']['amount'],
        '1000.00',
      );
      await expectLater(
        manager.restore(bundle),
        throwsA(isA<LocalRuleException>()),
      );
      expect(
        () => LocalBackup.validate({...bundle, 'localSchema': 2}),
        throwsA(anything),
      );
      expect(
        () => LocalBackup.validate({...bundle, 'authority': 'connected'}),
        throwsA(anything),
      );
    } finally {
      await manager.close();
      await recovery.delete(recursive: true);
      await f.close();
    }
  });
  test('restore failure preserves active data; invalid financial recipes never activate', () async {
    final f = await LocalFixture.open();
    final dir = await Directory.systemTemp.createTemp(
      'salapiya-p1-bad-restore-',
    );
    final vault = MemoryProfileVault(),
        profiles = LocalProfiles(dir, MemoryProfileVault());
    try {
      await f.account('Existing');
      final bundle = await LocalBackup.capture(f.store);
      await expectLater(
        profiles.restore(bundle, interrupt: true),
        throwsStateError,
      );
      expect(await profiles.vault.read(), isNull);
      expect(profiles.active, isNull);
      expect((await f.store.snapshot()).accounts.single.name, 'Existing');
      final commands = (bundle['commands'] as List)
          .map((r) => Map<String, dynamic>.from(r as Map))
          .toList();
      final c = LocalCommand.decode(
        commands.first['id'] as String,
        commands.first['payload'] as String,
      );
      commands.first['payload'] = LocalCommand(
        id: c.id,
        owner: c.owner,
        expectedVersion: c.expectedVersion,
        kind: c.kind,
        values: {...c.values, 'amount': '-1.00'},
      ).payload;
      final other = LocalProfiles(dir, vault);
      await expectLater(
        other.restore({...bundle, 'commands': commands}),
        throwsA(anything),
      );
      expect(vault.value, isNull);
      expect(other.active, isNull);
    } finally {
      await profiles.close();
      await dir.delete(recursive: true);
      await f.close();
    }
  });
  test(
    'profile owner checks reject copied command and cross-profile queries',
    () async {
      final f = await LocalFixture.open();
      try {
        final command = LocalCommand(
          id: newLocalId(),
          owner: newLocalId(),
          expectedVersion: 0,
          kind: 'account',
          values: {
            'name': 'Foreign',
            'kind': 'Cash',
            'amount': '0',
            'cutoff': '2026-10-14',
          },
        );
        await expectLater(
          f.store.commit(command),
          throwsA(isA<LocalRuleException>()),
        );
        final foreign = LocalStore(f.store.db, newLocalId());
        await expectLater(foreign.snapshot(), throwsA(anything));
        await expectLater(
          foreign.integrity(),
          throwsA(isA<LocalRuleException>()),
        );
        expect(await foreign.draft('income:'), isNull);
      } finally {
        await f.close();
      }
    },
  );
}
