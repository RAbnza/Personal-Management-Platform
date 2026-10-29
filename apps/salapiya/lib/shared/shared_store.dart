part of '../local/local_store.dart';

Future<void> _migrateShared(SqliteWriteContext tx) async {
  await tx.execute(
    'CREATE TABLE IF NOT EXISTS shared_schema(version INTEGER NOT NULL) STRICT',
  );
  final versions = await tx.getAll('SELECT version FROM shared_schema');
  if (versions.isNotEmpty) {
    if (versions.length != 1 ||
        ![1, 2, 3].contains(versions.single['version'])) {
      reject('Unsupported shared storage version; preserve your database.');
    }
    if (versions.single['version'] == 1) {
      await tx.execute(
        'CREATE TABLE shared_review_history(id TEXT PRIMARY KEY,payload TEXT NOT NULL) STRICT',
      );
      await tx.execute('UPDATE shared_schema SET version=2');
    }
    if (versions.single['version'] != 3) {
      await _createSharedSnapshots(tx);
      await tx.execute('UPDATE shared_schema SET version=3');
    }
    return;
  }
  final posting = await tx.get(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='local_posting'",
  );
  if (!(posting['sql'] as String).contains('shared_receivable')) {
    // Rebuild only the journal leaf table inside the existing migration
    // transaction. IDs, integer values, ownership FKs and seals are preserved.
    // No foreign-key disable, writable_schema or PostgreSQL migration replay.
    final definition = _schema.firstWhere(
      (s) => s.startsWith('CREATE TABLE local_posting('),
    );
    await tx.execute(
      definition.replaceFirst('local_posting(', 'local_posting_p3('),
    );
    await tx.execute(
      'INSERT INTO local_posting_p3 SELECT * FROM local_posting',
    );
    await tx.execute('DROP TRIGGER local_seal_balanced');
    await tx.execute('DROP TABLE local_posting');
    await tx.execute('ALTER TABLE local_posting_p3 RENAME TO local_posting');
    await tx.execute(
      'CREATE INDEX local_posting_history ON local_posting(owner_id,account_id,effective_date)',
    );
    for (final op in ['UPDATE', 'DELETE']) {
      await tx.execute(
        "CREATE TRIGGER local_posting_${op.toLowerCase()} BEFORE $op ON local_posting BEGIN SELECT RAISE(ABORT,'immutable financial evidence'); END",
      );
    }
    for (final sql in _triggers.where(
      (s) =>
          s.startsWith('CREATE TRIGGER local_posting_') ||
          s.startsWith('CREATE TRIGGER local_seal_balanced'),
    )) {
      await tx.execute(sql);
    }
  }
  for (final sql in [
    'CREATE TABLE shared_review_history(id TEXT PRIMARY KEY,payload TEXT NOT NULL) STRICT',
    '''CREATE TABLE shared_intent(id TEXT PRIMARY KEY,actor TEXT NOT NULL,group_id TEXT NOT NULL,
     payload TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('pending','accepted','reconciled','review','restored')),
     reason TEXT,receipt TEXT,recorded_at TEXT NOT NULL,queued INTEGER NOT NULL CHECK(queued IN (0,1))) STRICT''',
    '''CREATE TRIGGER shared_intent_frozen BEFORE UPDATE ON shared_intent WHEN
     NEW.id<>OLD.id OR NEW.actor<>OLD.actor OR NEW.group_id<>OLD.group_id OR NEW.payload<>OLD.payload OR NEW.recorded_at<>OLD.recorded_at
     BEGIN SELECT RAISE(ABORT,'immutable shared intent'); END''',
    '''CREATE TRIGGER shared_intent_retained BEFORE DELETE ON shared_intent BEGIN SELECT RAISE(ABORT,'retain original shared intent'); END''',
    '''CREATE TABLE shared_draft(id TEXT PRIMARY KEY,group_id TEXT NOT NULL,payload TEXT NOT NULL,updated_at TEXT NOT NULL) STRICT''',
  ]) {
    await tx.execute(sql);
  }
  await _createSharedSnapshots(tx);
  await tx.execute('INSERT INTO shared_schema VALUES(3)');
}

extension SharedLocalStore on LocalStore {
  Future<void> saveSharedIntent(
    String id,
    String actor,
    String group,
    String payload, {
    required bool queued,
  }) => db.writeTransaction((tx) async {
    final binding = await connectionIn(tx);
    if (binding == null ||
        binding['remote_owner'] != actor ||
        binding['phase'] != 'connected') {
      reject('Current connected identity required.');
    }
    final old = await tx.getAll(
      'SELECT payload FROM shared_intent WHERE id=?',
      [id],
    );
    if (old.isNotEmpty) {
      if (old.single['payload'] != payload) {
        reject('This command already has different frozen values.');
      }
      return;
    }
    await tx.execute(
      'INSERT INTO shared_intent VALUES(?,?,?,?,\'pending\',NULL,NULL,?,?)',
      [
        id,
        actor,
        group,
        payload,
        DateTime.now().toUtc().toIso8601String(),
        queued ? 1 : 0,
      ],
    );
    if (queued) {
      await tx.execute('INSERT INTO p3_transport(id,payload) VALUES(?,?)', [
        id,
        payload,
      ]);
    }
    await tx.execute('DELETE FROM shared_draft WHERE id=?', [id]);
  });
  Future<void> recordSharedReceipt(
    String id,
    String actor,
    Map<String, dynamic> receipt,
  ) async {
    final row = await db.get('SELECT * FROM shared_intent WHERE id=?', [id]);
    if (receipt['id'] != id ||
        receipt['owner_id'] != actor ||
        receipt['group_id'] != row['group_id'] ||
        !['accepted', 'rejected'].contains(receipt['outcome'])) {
      reject('Invalid authenticated group receipt.');
    }
    await db.execute(
      'UPDATE shared_intent SET state=?,reason=?,receipt=? WHERE id=?',
      [
        receipt['outcome'] == 'accepted' ? 'accepted' : 'review',
        receipt['reason'],
        jsonEncode(receipt),
        id,
      ],
    );
  }

  Future<void> reconcileShared() async {
    await reconcileSharedSnapshots();
    if ((await db.getAll(
      "SELECT id FROM shared_intent WHERE state='accepted' LIMIT 1",
    )).isEmpty) {
      return;
    }
    await db.writeTransaction((tx) async {
      for (final intent in await tx.getAll(
        "SELECT * FROM shared_intent WHERE state='accepted'",
      )) {
        final snapshots = await tx.getAll(
          'SELECT document FROM shared_snapshot_cache WHERE owner_id=? AND group_id=?',
          [intent['actor'], intent['group_id']],
        );
        if (snapshots.isEmpty) continue;
        final data = jsonDecode(snapshots.single['document'] as String) as Map;
        final id = intent['id'];
        var found = (data['activity'] as List).any((e) => e['id'] == id);
        for (final b in (data['bills'] as Map).values) {
          found =
              found ||
              (b['revisions'] as List).any((r) => r['id'] == id) ||
              (b['refunds'] as List).any((f) => f['id'] == id);
        }
        for (final s in (data['settlements'] as Map).values) {
          found =
              found ||
              s['id'] == id ||
              (s['events'] as List).any((e) => e['id'] == id);
        }
        if (found) {
          await tx.execute(
            "UPDATE shared_intent SET state='reconciled' WHERE id=?",
            [id],
          );
        }
      }
    });
  }
}
