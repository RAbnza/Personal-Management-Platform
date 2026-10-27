import 'dart:async';
import 'dart:io';

import 'package:salapiya/local/local_store.dart';
import 'package:salapiya/life/life_domain.dart';

Future<void> main(List<String> args) async {
  const owner = '50000000-0000-4000-8000-000000000001';
  final db = openLocalDatabase(args[0], 'synthetic-p5-crash-key');
  await db.initialize();
  final store = LocalStore(db, owner);
  await store.migrate();
  await store.initializeProfile('P5 crash fixture', {});
  if (args[1] == 'connected') {
    await store.stageConnection(
      '50000000-0000-4000-8000-000000000009',
      'synthetic@example.test',
      '50000000-0000-4000-8000-000000000008',
    );
    await db.execute("UPDATE connected_profile SET phase='connected'");
  }
  final c = LifeCommand(
    id: '50000000-0000-4000-8000-000000000002',
    owner: owner,
    recordId: '50000000-0000-4000-8000-000000000003',
    type: LifeType.task,
    expectedVersion: 0,
    fields: {'title': 'P5 durable process evidence'},
    reason: 'Created',
    recordedAt: DateTime.utc(2026, 10, 26),
  );
  await store.saveDraft('life:new-task', c.id, {
    'title': 'P5 durable process evidence',
  });
  Future<void> ready() async {
    await File('${args[0]}.ready').writeAsString('ready', flush: true);
    await Completer<void>().future;
  }

  if (args[2] == 'uncommitted') {
    await store.commitLife(c, draft: 'life:new-task', beforeCommit: ready);
  } else {
    await store.commitLife(c, draft: 'life:new-task');
    await ready();
  }
}
