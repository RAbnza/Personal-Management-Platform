import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/connected/command_connector.dart';
import 'package:salapiya/life/life_domain.dart';
import 'package:salapiya/local/finance_domain.dart';
import 'package:salapiya/local/local_profiles.dart';
import 'package:salapiya/local/local_store.dart';

import 'local_test_support.dart';
import 'p2_connected_test.dart' show enroll, actor;

Future<void> drainSyntheticDownloads(LocalStore store) async {
  while (true) {
    final t = await store.db.getNextCrudTransaction();
    if (t == null) return;
    await t.complete();
  }
}

Future<void> downloaded(LocalStore store, LifeCommand c, int sequence) async {
  await store.db.execute(
    'INSERT OR REPLACE INTO p5_command(id,owner_id,profile_id,payload,sequence_no,recorded_at) VALUES(?,?,?,?,?,?)',
    [c.id, actor, store.owner, c.payload, sequence, '2026-10-26T01:00:00Z'],
  );
  await drainSyntheticDownloads(
    store,
  ); // Test-only view writes; actual CDC has native evidence.
}

void main() {
  test('restoring a previously resolved rejected Life intent never resurrects it as a new command', () async {
    final f = await LocalFixture.open();
    await enroll(f.store);
    final c = LifeCommand(
      owner: f.store.owner,
      recordId: newLocalId(),
      type: LifeType.task,
      expectedVersion: 0,
      fields: {'title': 'Retained rejected draft'},
      reason: 'Create',
    );
    await f.store.commitLife(c);
    await f.store.db.execute(
      "UPDATE life_intent SET state='review',reason='Synthetic conflict' WHERE id=?",
      [c.id],
    );
    await f.store.resolveLifeReview(c.id, null);
    final archive = await LocalBackup.capture(f.store),
        directory = await Directory.systemTemp.createTemp(
          'salapiya-p5-resolved-restore-',
        ),
        profiles = LocalProfiles(directory, MemoryProfileVault());
    final restored = await profiles.restore(archive);
    await restored.reviewRestoredLife(c.id, null, actor);
    expect((await restored.lifeIntents()).single['state'], 'review');
    expect(await restored.lifeRecords(), isEmpty);
    expect(await restored.db.getNextCrudTransaction(), isNull);
    await profiles.close();
    await directory.delete(recursive: true);
    await f.close();
  });
  test('response loss preserves the exact transport; receipt plus download retires one overlay without financial revisions', () async {
    final f = await LocalFixture.open();
    await enroll(f.store);
    final c = LifeCommand(
      owner: f.store.owner,
      recordId: newLocalId(),
      type: LifeType.task,
      expectedVersion: 0,
      fields: {'title': 'Offline task'},
      reason: 'Created',
    );
    await f.store.commitLife(c);
    final received = <String, String>{};
    var lose = true, calls = 0;
    final connector = FinancialConnector(
      store: f.store,
      actor: actor,
      credentials: () async => null,
      submit: (id, payload) async =>
          throw StateError('No financial command expected'),
      submitLife: (id, payload) async {
        calls++;
        expect(received[id] ?? payload, payload);
        received[id] = payload;
        if (lose) {
          lose = false;
          throw StateError('Response lost after server commit');
        }
        return {
          'id': id,
          'owner_id': actor,
          'profile_id': f.store.owner,
          'outcome': 'accepted',
          'reason': null,
        };
      },
    );
    await expectLater(connector.uploadData(f.store.db), throwsStateError);
    expect((await f.store.lifeIntents()).single['state'], 'pending');
    expect((await f.store.lifeRecords()).length, 1);
    await connector.uploadData(f.store.db);
    expect(calls, 2);
    expect(received.length, 1);
    expect((await f.store.lifeIntents()).single['state'], 'accepted');
    await downloaded(f.store, c, 1);
    await f.store.reconcileLife();
    expect((await f.store.lifeIntents()).single['state'], 'reconciled');
    expect((await f.store.lifeHistory()).length, 1);
    expect((await f.store.lifeRecords()).length, 1);
    expect((await f.store.snapshot()).version, 0);
    await f.close();
  });
  test('competing source edit remains inspectable while unrelated creates continue', () async {
    final f = await LocalFixture.open();
    await enroll(f.store);
    final original = LifeCommand(
      owner: f.store.owner,
      recordId: newLocalId(),
      type: LifeType.book,
      expectedVersion: 0,
      fields: {'title': 'Book', 'total': '100'},
      reason: 'Created',
    );
    await downloaded(f.store, original, 1);
    await f.store.reconcileLife();
    final local = LifeCommand(
      owner: f.store.owner,
      recordId: original.recordId,
      type: original.type,
      expectedVersion: 1,
      fields: {...original.fields, 'progress': '20'},
      reason: 'Offline progress',
    );
    await f.store.commitLife(local);
    final remote = LifeCommand(
      owner: f.store.owner,
      recordId: original.recordId,
      type: original.type,
      expectedVersion: 1,
      fields: {...original.fields, 'progress': '30'},
      reason: 'Accepted peer progress',
    );
    // A real download does not clear pending SDK work; this simulation inserts
    // the view and drains only its synthetic operation after the existing queue.
    await downloaded(f.store, remote, 2);
    await f.store.reconcileLife();
    expect((await f.store.lifeIntents()).single['state'], 'review');
    expect(
      (await f.store.lifeRecords())[original.recordId]!.fields['progress'],
      '30',
    );
    final independent = LifeCommand(
      owner: f.store.owner,
      recordId: newLocalId(),
      type: LifeType.task,
      expectedVersion: 0,
      fields: {'title': 'Independent'},
      reason: 'Created',
    );
    await f.store.commitLife(independent);
    var submissions = 0;
    final connector = FinancialConnector(
      store: f.store,
      actor: actor,
      credentials: () async => null,
      submit: (a, b) async => throw StateError('Unexpected financial command'),
      submitLife: (id, payload) async {
        expect(id, independent.id);
        submissions++;
        return {
          'id': id,
          'owner_id': actor,
          'profile_id': f.store.owner,
          'outcome': 'accepted',
        };
      },
    );
    while (await f.store.db.getNextCrudTransaction() != null) {
      await connector.uploadData(f.store.db);
    }
    expect(submissions, 1);
    expect((await f.store.lifeRecords()).length, 2);
    await f.store.resolveLifeReview(local.id, null);
    expect(
      (await f.store.lifeIntents()).singleWhere(
        (r) => r['id'] == local.id,
      )['resolved_at'],
      isNotNull,
    );
    await f.close();
  });
  test('connected archive retains original pending identities with a recovery hold and no portable notification consent', () async {
    final f = await LocalFixture.open();
    await enroll(f.store);
    final c = LifeCommand(
      owner: f.store.owner,
      recordId: newLocalId(),
      type: LifeType.task,
      expectedVersion: 0,
      fields: {'title': 'Pending restore'},
      reason: 'Created',
    );
    await f.store.commitLife(c);
    await f.store.db.execute(
      "INSERT INTO life_device VALUES('reminder:preferences',?)",
      [
        jsonEncode({'enabled': true}),
      ],
    );
    final archive = await LocalBackup.capture(f.store),
        dir = await Directory.systemTemp.createTemp(
          'salapiya-p5-connected-restore-',
        ),
        profiles = LocalProfiles(dir, MemoryProfileVault());
    final restored = await profiles.restore(archive);
    final intent = (await restored.lifeIntents()).single;
    expect(intent['id'], c.id);
    expect(intent['payload'], c.payload);
    expect(intent['state'], 'restored');
    expect(await restored.lifeRecords(), isEmpty);
    expect(await restored.db.getNextCrudTransaction(), isNull);
    expect(
      await restored.db.getAll(
        "SELECT * FROM life_device WHERE key LIKE 'reminder:%'",
      ),
      isEmpty,
    );
    await restored.reviewRestoredLife(c.id, null, actor);
    expect((await restored.lifeIntents()).single['state'], 'pending');
    expect((await restored.db.getNextCrudTransaction())!.crud.single.id, c.id);
    await profiles.close();
    await dir.delete(recursive: true);
    await f.close();
  });
}
