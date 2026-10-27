import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/life/life_domain.dart';
import 'package:salapiya/local/finance_domain.dart';
import 'package:salapiya/local/local_profiles.dart';
import 'package:salapiya/local/local_store.dart';
import 'package:salapiya/life/life_controller.dart';
import 'package:salapiya/features/life/application/life_controller.dart';

import 'local_test_support.dart';

import 'package:salapiya/p0/portable_recovery.dart';

void main() {
  test('P4 schema forward upgrade rolls back an interrupted Life migration without changing financial history', () async {
    final f = await LocalFixture.open();
    await f.account('Preserved wallet', '100.00');
    final before = await f.store.snapshot();
    for (final table in [
      'life_review_resolution',
      'life_intent',
      'life_revision',
      'life_device',
      'device_reminder',
    ]) {
      await f.store.db.execute('DROP TABLE $table');
    }
    await f.store.db.execute('UPDATE local_schema SET version=6');
    await expectLater(f.store.migrate(interrupt: true), throwsStateError);
    expect(
      (await f.store.db.get('SELECT version FROM local_schema'))['version'],
      6,
    );
    expect(
      await f.store.db.getAll(
        "SELECT name FROM sqlite_master WHERE name='life_revision'",
      ),
      isEmpty,
    );
    await f.store.migrate();
    expect((await f.store.snapshot()).version, before.version);
    expect(
      (await f.store.snapshot()).revisions.map((r) => r.id),
      before.revisions.map((r) => r.id),
    );
    expect(await f.store.lifeRecords(), isEmpty);
    await f.store.integrity();
    await f.close();
  });
  test(
    'civil dates, IANA instants, DST gaps and ambiguous folds are explicit',
    () {
      expect(
        LifeTime.instant('2026-10-27', '02:30', 'UTC'),
        DateTime.utc(2026, 10, 27, 2, 30),
      );
      expect(
        LifeTime.instant('2026-10-27', '02:30', 'Etc/UTC'),
        DateTime.utc(2026, 10, 27, 2, 30),
      );
      final lordHoweEarly = LifeTime.instant(
        '2026-04-05',
        '01:45',
        'Australia/Lord_Howe',
        'Earlier',
      );
      final lordHoweLater = LifeTime.instant(
        '2026-04-05',
        '01:45',
        'Australia/Lord_Howe',
        'Later',
      );
      expect(
        lordHoweLater.difference(lordHoweEarly),
        const Duration(minutes: 30),
      );
      expect(() => lifeDate('2026-02-29'), throwsFormatException);
      expect(
        () => LifeTime.instant('2026-03-08', '02:30', 'America/New_York'),
        throwsFormatException,
      );
      expect(
        () => LifeTime.instant('2026-11-01', '01:30', 'America/New_York'),
        throwsFormatException,
      );
      final early = LifeTime.instant(
        '2026-11-01',
        '01:30',
        'America/New_York',
        'Earlier',
      );
      final later = LifeTime.instant(
        '2026-11-01',
        '01:30',
        'America/New_York',
        'Later',
      );
      expect(later.difference(early), const Duration(hours: 1));
      expect(tzTime(early, 'Asia/Manila'), ('2026-11-01', '13:30'));
    },
  );
  test('closed preset validation never fabricates completion or accepts arbitrary fields', () {
    for (final rating in ['0', '4.1250', '5.0000', '-0.0000']) {
      expect(
        validateLifeFields(LifeType.book, {
          'title': 'Book',
          'rating': rating,
        })['rating'],
        rating,
      );
    }
    for (final rating in ['5.0001', '-0.0001', 'NaN', '1e0', '01', '1.00001']) {
      expect(
        () => validateLifeFields(LifeType.book, {
          'title': 'Book',
          'rating': rating,
        }),
        throwsFormatException,
      );
    }
    expect(
      () => validateLifeFields(LifeType.book, {
        'title': 'Book',
        'total': '100',
        'progress': '101',
      }),
      throwsFormatException,
    );
    expect(
      () => validateLifeFields(LifeType.learning, {
        'title': 'Course',
        'total': '-1',
      }),
      throwsFormatException,
    );
    expect(
      () => validateLifeFields(LifeType.task, {
        'title': 'Task',
        'formula': '1+1',
      }),
      throwsFormatException,
    );
    final v = validateLifeFields(LifeType.book, {
      'title': 'Book',
      'total': '100',
      'progress': '100',
    });
    expect(v['status'], 'In progress');
    expect(
      validateLifeFields(LifeType.task, {
        'title': 'Task',
        'completed': '2026-10-20',
      })['status'],
      'In progress',
    );
  });
  test('fixture persists every preset/history and restores under a new independent key', () async {
    final fixture = jsonDecode(
      await File('../../contracts/salapiya/p5_life.json').readAsString(),
    ) as Map;
    final f = await LocalFixture.open(owner: fixture['profile'] as String);
    final before = await f.store.snapshot();
    for (final raw in fixture['commands'] as List) {
      final row = raw as Map;
      await f.store.commitLife(
        LifeCommand.decode(row['id'] as String, row['payload'] as String),
      );
    }
    final records = await f.store.lifeRecords();
    expect(records.length, 11);
    expect((await f.store.snapshot()).version, before.version);
    expect((await f.store.snapshot()).revisions, isEmpty);
    final first = (fixture['commands'] as List).first as Map,
        c = LifeCommand.decode(
          first['id'] as String,
          first['payload'] as String,
        );
    await f.store.commitLife(c); // exact original ID replay
    expect(
      (await f.store.lifeHistory()).length,
      (fixture['commands'] as List).length,
    );
    expect(
      () => f.store.commitLife(
        LifeCommand(
          owner: f.store.owner,
          recordId: c.recordId,
          type: c.type,
          expectedVersion: 0,
          fields: c.fields,
          reason: 'stale',
        ),
      ),
      throwsFormatException,
    );
    final raw = await LocalBackup.capture(f.store);
    final secret = await PortableRecovery.newRecoverySecret(),
        sealed = await LocalBackup.seal(raw, secret);
    final dir = await Directory.systemTemp.createTemp('salapiya-p5-restore-');
    final profiles = LocalProfiles(dir, MemoryProfileVault());
    final restored = await profiles.restore(
      await LocalBackup.unseal(sealed, secret),
    );
    expect(
      (await restored.lifeRecords()).map((id, r) => MapEntry(id, r.fields)),
      records.map((id, r) => MapEntry(id, r.fields)),
    );
    expect(
      (await restored.lifeHistory()).length,
      (fixture['commands'] as List).length,
    );
    expect(await restored.db.getAll('SELECT * FROM device_reminder'), isEmpty);
    await profiles.close();
    await dir.delete(recursive: true);
    await f.close();
  });
  test('atomic Life writes rollback, version conflicts preserve history, and reopen removes stale generations', () async {
    final f = await LocalFixture.open(), c = DurableLifeController(f.store);
    await c.initialize();
    expect(c.entries, isEmpty);
    await c.saveEntry(LifeKind.task, {
      'title': 'Real task',
      'due': LifeTime.today(),
      'status': 'Not started',
    });
    final entry = c.entries.single;
    final firstVersion = entry.version;
    await c.progress(entry, 1, 'Completed');
    expect(c.entries.single.status, 'Completed');
    await c.progress(entry, 0, 'Reopened');
    expect(c.entries.single.version, firstVersion + 2);
    await c.archive(entry);
    expect(c.entries.single.archived, isTrue);
    await c.archive(entry);
    expect(c.entries.single.archived, isFalse);
    final command = LifeCommand(
      owner: f.store.owner,
      recordId: newLocalId(),
      type: LifeType.task,
      expectedVersion: 0,
      fields: {'title': 'Interrupted'},
      reason: 'Create',
    );
    await expectLater(
      f.store.commitLife(command, interrupt: true),
      throwsStateError,
    );
    expect((await f.store.lifeRecords()).length, 1);
    await expectLater(
      f.store.db.execute("UPDATE life_revision SET payload='{}'"),
      throwsA(anything),
    );
    c.dispose();
    await Future<void>.delayed(const Duration(milliseconds: 100));
    await f.close();
  });
}
