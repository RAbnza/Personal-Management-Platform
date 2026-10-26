part of '../local/local_store.dart';

Future<void> _migrateLife(SqliteWriteContext tx) async {
  for (final sql in [
    '''CREATE TABLE IF NOT EXISTS life_revision(
      sequence_no INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE,
      owner_id TEXT NOT NULL REFERENCES local_profile(id), record_id TEXT NOT NULL,
      version INTEGER NOT NULL CHECK(version>0), payload TEXT NOT NULL,
      recorded_at TEXT NOT NULL, UNIQUE(owner_id,record_id,version)) STRICT''',
    '''CREATE TABLE IF NOT EXISTS life_intent(id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES local_profile(id), payload TEXT NOT NULL,
      state TEXT NOT NULL CHECK(state IN ('pending','accepted','reconciled','review','restored')),
      reason TEXT, sequence_no INTEGER NOT NULL UNIQUE) STRICT''',
    '''CREATE TABLE IF NOT EXISTS life_device(key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT''',
    '''CREATE TABLE IF NOT EXISTS life_review_resolution(intent_id TEXT PRIMARY KEY REFERENCES life_intent(id),
      replacement_id TEXT,recorded_at TEXT NOT NULL) STRICT''',
    '''CREATE TABLE IF NOT EXISTS device_reminder(logical_key TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,generation TEXT NOT NULL,os_id INTEGER NOT NULL UNIQUE,
      due_utc TEXT NOT NULL,state TEXT NOT NULL,destination TEXT NOT NULL) STRICT''',
    '''CREATE TRIGGER IF NOT EXISTS life_intent_frozen BEFORE UPDATE ON life_intent
      WHEN NEW.id<>OLD.id OR NEW.owner_id<>OLD.owner_id OR NEW.payload<>OLD.payload OR NEW.sequence_no<>OLD.sequence_no
      BEGIN SELECT RAISE(ABORT,'immutable Life intent'); END''',
    '''CREATE TRIGGER IF NOT EXISTS life_intent_retained BEFORE DELETE ON life_intent
      BEGIN SELECT RAISE(ABORT,'retain Life intent'); END''',
    'CREATE INDEX IF NOT EXISTS life_owner_records ON life_revision(owner_id,record_id,version)',
  ]) {
    await tx.execute(sql);
  }
  for (final op in ['UPDATE', 'DELETE']) {
    await tx.execute(
      '''CREATE TRIGGER IF NOT EXISTS life_review_resolution_${op.toLowerCase()} BEFORE $op ON life_review_resolution
      BEGIN SELECT RAISE(ABORT,'immutable Life review decision'); END''',
    );
    await tx.execute(
      '''CREATE TRIGGER IF NOT EXISTS life_revision_${op.toLowerCase()}
      BEFORE $op ON life_revision BEGIN SELECT RAISE(ABORT,'immutable Life history'); END''',
    );
  }
}

extension LifeLocalStore on LocalStore {
  Future<void> resolveLifeReview(String id, String? replacement) => db.execute(
    'INSERT INTO life_review_resolution VALUES(?,?,?)',
    [id, replacement, DateTime.now().toUtc().toIso8601String()],
  );
  Future<Map<String, dynamic>> captureLifeArchive(
    SqliteReadContext tx,
  ) async => {
    'contract': 1,
    'presetVersion': 1,
    'attachmentByteObjects': 0,
    'viewPreferences': (await tx.getAll(
      "SELECT value FROM life_device WHERE key='life:view'",
    )).map((r) => jsonDecode(r['value'] as String)).firstOrNull,
    'resolutions': [
      for (final r in await tx.getAll('SELECT * FROM life_review_resolution'))
        Map<String, dynamic>.from(r),
    ],
    'revisions': [
      for (final r in await tx.getAll(
        'SELECT id,payload,recorded_at FROM life_revision WHERE owner_id=? ORDER BY sequence_no',
        [owner],
      ))
        Map<String, dynamic>.from(r),
    ],
    'intents': [
      for (final r in await tx.getAll(
        'SELECT id,payload,state FROM life_intent WHERE owner_id=? ORDER BY sequence_no',
        [owner],
      ))
        Map<String, dynamic>.from(r),
    ],
  };
  Future<void> restoreLifeArchive(
    Map<String, dynamic> life, {
    required bool connected,
  }) => db.writeTransaction((tx) async {
    validateLifeArchive(life, owner, connected: connected);
    for (final row in life['revisions'] as List) {
      final r = row as Map;
      await _insertLife(
        tx,
        LifeCommand.decode(r['id'] as String, r['payload'] as String),
        r['recorded_at'] as String,
      );
    }
    var sequence = 0;
    for (final row in life['intents'] as List) {
      final r = row as Map;
      await tx.execute(
        "INSERT INTO life_intent VALUES(?,?,?,'restored','Current receipt and source review required',?)",
        [r['id'], owner, r['payload'], ++sequence],
      );
    }
    for (final raw in life['resolutions'] as List? ?? []) {
      final row = raw as Map;
      await tx.execute('INSERT INTO life_review_resolution VALUES(?,?,?)', [
        row['intent_id'],
        row['replacement_id'],
        row['recorded_at'],
      ]);
    }
    if (life['viewPreferences'] case final Map prefs) {
      await tx.execute("INSERT INTO life_device VALUES('life:view',?)", [
        jsonEncode(prefs),
      ]);
    }
  });
  Future<Map<String, LifeRecord>> lifeRecordsIn(
    SqliteReadContext tx, {
    bool pending = true,
  }) async {
    final rows = await tx.getAll(
      'SELECT id,payload FROM life_revision WHERE owner_id=? ORDER BY sequence_no LIMIT 20001',
      [owner],
    );
    if (rows.length > 20000) {
      lifeReject(
        'Life history exceeds the supported 20,000 revision capacity.',
      );
    }
    final result = <String, LifeRecord>{};
    for (final row in rows) {
      final c = LifeCommand.decode(
        row['id'] as String,
        row['payload'] as String,
      );
      result[c.recordId] = applyLifeCommand(result, c);
    }
    if (pending) {
      for (final row in await tx.getAll(
        "SELECT i.id,i.payload FROM life_intent i WHERE i.owner_id=? AND i.state IN ('pending','accepted') AND NOT EXISTS(SELECT 1 FROM life_revision r WHERE r.id=i.id) ORDER BY i.sequence_no",
        [owner],
      )) {
        try {
          final c = LifeCommand.decode(
            row['id'] as String,
            row['payload'] as String,
          );
          result[c.recordId] = applyLifeCommand(result, c);
        } on FormatException {
          /* Conflict is retained for explicit review. */
        }
      }
    }
    return Map.unmodifiable(result);
  }

  Future<Map<String, LifeRecord>> lifeRecords({bool pending = true}) =>
      db.readTransaction((tx) => lifeRecordsIn(tx, pending: pending));
  Future<List<Map<String, dynamic>>> lifeHistory() async => (await db.getAll(
    'SELECT id,payload,recorded_at FROM life_revision WHERE owner_id=? ORDER BY sequence_no',
    [owner],
  )).map((r) => Map<String, dynamic>.from(r)).toList();

  Future<void> _insertLife(
    SqliteWriteContext tx,
    LifeCommand c,
    String recordedAt,
  ) async {
    if (c.owner != owner) lifeReject('Wrong private profile.');
    final existing = await tx.getAll(
      'SELECT payload FROM life_revision WHERE id=?',
      [c.id],
    );
    if (existing.isNotEmpty) {
      if (existing.single['payload'] != c.payload) {
        lifeReject('Command ID reused with a changed payload.');
      }
      return;
    }
    final records = await lifeRecordsIn(tx, pending: false);
    applyLifeCommand(records, c);
    final count =
        (await tx.get('SELECT count(*) n FROM life_revision'))['n'] as int;
    if (count >= 20000 || records.length >= 10000 && c.expectedVersion == 0) {
      lifeReject(
        'Life capacity reached. Preserve history and narrow the workspace before adding records.',
      );
    }
    await tx.execute('INSERT INTO life_revision VALUES(?,?,?,?,?,?,?)', [
      count + 1,
      c.id,
      owner,
      c.recordId,
      c.expectedVersion + 1,
      c.payload,
      recordedAt,
    ]);
  }

  Future<void> commitLife(
    LifeCommand c, {
    String? draft,
    bool interrupt = false,
    Future<void> Function()? beforeCommit,
  }) => db.writeTransaction((tx) async {
    if (c.owner != owner) lifeReject('Wrong private profile.');
    final old = await tx.getAll(
      'SELECT payload FROM life_intent WHERE id=? UNION ALL SELECT payload FROM life_revision WHERE id=?',
      [c.id, c.id],
    );
    if (old.isNotEmpty) {
      if (old.any((r) => r['payload'] != c.payload)) {
        lifeReject('Command ID reused with a changed payload.');
      }
      if (draft != null) {
        await tx.execute(
          'DELETE FROM local_draft WHERE owner_id=? AND operation=?',
          [owner, draft],
        );
      }
      return;
    }
    final binding = await connectionIn(tx);
    if (binding == null) {
      await _insertLife(tx, c, c.recordedAt.toIso8601String());
    } else {
      if (binding['phase'] != 'connected') {
        lifeReject(
          'Finish connection/recovery review first. Your draft remains protected.',
        );
      }
      final current = await lifeRecordsIn(tx);
      if (c.expectedVersion == 0 && current.length >= 10000) {
        lifeReject(
          'Life record capacity reached. Preserve existing history before enlarging this workspace.',
        );
      }
      applyLifeCommand(current, c);
      await _queueLife(tx, c);
    }
    if (draft != null) {
      await tx.execute(
        'DELETE FROM local_draft WHERE owner_id=? AND operation=?',
        [owner, draft],
      );
    }
    if (beforeCommit != null) await beforeCommit();
    if (interrupt) throw StateError('Injected Life transaction interruption');
  });
  Future<void> _queueLife(SqliteWriteContext tx, LifeCommand c) async {
    if (((await tx.get('SELECT count(*) n FROM life_intent'))['n'] as int) >=
        20000) {
      lifeReject(
        'Life intent capacity reached. Preserve existing evidence before enlarging this workspace.',
      );
    }
    final next = (await tx.get(
      'SELECT coalesce(max(sequence_no),0)+1 n FROM life_intent',
    ))['n'];
    await tx.execute("INSERT INTO life_intent VALUES(?,?,?,'pending',NULL,?)", [
      c.id,
      owner,
      c.payload,
      next,
    ]);
    await tx.execute('INSERT INTO p2_transport(id,payload) VALUES(?,?)', [
      c.id,
      jsonEncode({'contract': 5, 'payload': c.payload}),
    ]);
  }

  /// P2 has already resolved local/cloud profile collisions. Publish original
  /// local Life commands only after that same profile is connected.
  Future<void> publishLocalLife() => db.writeTransaction((tx) async {
    final binding = await connectionIn(tx);
    if (binding?['phase'] != 'connected') return;
    for (final row in await tx.getAll(
      '''SELECT r.id,r.payload FROM life_revision r
      WHERE r.owner_id=? AND NOT EXISTS(SELECT 1 FROM life_intent i WHERE i.id=r.id)
      AND NOT EXISTS(SELECT 1 FROM p5_command p WHERE p.id=r.id AND p.owner_id=?) ORDER BY r.sequence_no''',
      [owner, binding!['remote_owner']],
    )) {
      await _queueLife(
        tx,
        LifeCommand.decode(row['id'] as String, row['payload'] as String),
      );
    }
  });
  Future<void> recordLifeReceipt(
    String id,
    String actor,
    Map<String, dynamic> receipt,
  ) async {
    if (receipt['id'] != id ||
        receipt['owner_id'] != actor ||
        receipt['profile_id'] != owner ||
        !['accepted', 'rejected'].contains(receipt['outcome'])) {
      lifeReject('Invalid authenticated Life receipt.');
    }
    await db.execute(
      "UPDATE life_intent SET state=?,reason=? WHERE id=? AND state IN ('pending','accepted')",
      [
        receipt['outcome'] == 'accepted' ? 'accepted' : 'review',
        receipt['reason'],
        id,
      ],
    );
  }

  Future<void> reconcileLife() => db.writeTransaction((tx) async {
    final binding = await connectionIn(tx);
    if (binding == null) return;
    for (final row in await tx.getAll(
      'SELECT * FROM p5_command WHERE owner_id=? AND profile_id=? ORDER BY sequence_no',
      [binding['remote_owner'], owner],
    )) {
      final c = LifeCommand.decode(
        row['id'] as String,
        row['payload'] as String,
      );
      await _insertLife(tx, c, row['recorded_at'] as String);
      await tx.execute(
        "UPDATE life_intent SET state='reconciled',reason=NULL WHERE id=? AND payload=? AND state<>'reconciled'",
        [c.id, c.payload],
      );
    }
    final current = Map<String, LifeRecord>.of(
      await lifeRecordsIn(tx, pending: false),
    );
    for (final row in await tx.getAll(
      "SELECT * FROM life_intent WHERE state IN ('pending','accepted') AND NOT EXISTS(SELECT 1 FROM life_revision r WHERE r.id=life_intent.id) ORDER BY sequence_no",
    )) {
      try {
        final c = LifeCommand.decode(
          row['id'] as String,
          row['payload'] as String,
        );
        current[c.recordId] = applyLifeCommand(current, c);
      } on FormatException {
        await tx.execute(
          "UPDATE life_intent SET state='review',reason='Source changed; review the current version and retained original intent.' WHERE id=?",
          [row['id']],
        );
      }
    }
  });
  Future<List<Map<String, dynamic>>> lifeIntents() async => (await db.getAll(
    'SELECT i.*,r.recorded_at AS resolved_at FROM life_intent i LEFT JOIN life_review_resolution r ON r.intent_id=i.id ORDER BY i.sequence_no',
  )).map((r) => Map<String, dynamic>.from(r)).toList();
  Future<void> reviewRestoredLife(
    String id,
    Map<String, dynamic>? receipt,
    String actor,
  ) => db.writeTransaction((tx) async {
    final binding = await connectionIn(tx);
    if (binding?['remote_owner'] != actor) {
      lifeReject('Reconnect with the bound identity.');
    }
    final row = await tx.get(
      "SELECT * FROM life_intent WHERE id=? AND state='restored'",
      [id],
    );
    if ((await tx.getAll(
      'SELECT intent_id FROM life_review_resolution WHERE intent_id=?',
      [id],
    )).isNotEmpty) {
      await tx.execute(
        "UPDATE life_intent SET state='review',reason='Previously resolved review retained; original intent is not retried.' WHERE id=?",
        [id],
      );
      return;
    }
    if (receipt != null) {
      if (receipt['id'] != id ||
          receipt['owner_id'] != actor ||
          receipt['profile_id'] != owner) {
        lifeReject('Recovery receipt identity mismatch.');
      }
      await tx.execute('UPDATE life_intent SET state=?,reason=? WHERE id=?', [
        receipt['outcome'] == 'accepted' ? 'accepted' : 'review',
        receipt['reason'],
        id,
      ]);
    } else {
      final c = LifeCommand.decode(id, row['payload'] as String);
      try {
        applyLifeCommand(await lifeRecordsIn(tx), c);
      } on FormatException {
        await tx.execute(
          "UPDATE life_intent SET state='review',reason='Restored intent conflicts with current authority.' WHERE id=?",
          [id],
        );
        return;
      }
      await tx.execute(
        "UPDATE life_intent SET state='pending',reason=NULL WHERE id=?",
        [id],
      );
      await tx.execute('INSERT INTO p2_transport(id,payload) VALUES(?,?)', [
        id,
        jsonEncode({'contract': 5, 'payload': c.payload}),
      ]);
    }
  });
}
