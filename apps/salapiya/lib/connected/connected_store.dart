part of '../local/local_store.dart';

const connectedSchema = Schema([
  Table('p3_private_review', [
    Column.text('owner_id'),
    Column.text('profile_id'),
    Column.text('group_id'),
    Column.text('bill_id'),
    Column.text('private_revision'),
    Column.text('source_stamp'),
    Column.text('reason'),
    Column.text('recorded_at'),
  ]),
  Table.insertOnly('p3_transport', [Column.text('payload')]),
  Table('p3_group', [
    Column.text('owner_id'),
    Column.text('group_id'),
    Column.integer('version'),
    Column.text('document'),
  ]),
  Table.insertOnly('p2_transport', [Column.text('payload')]),
  Table('p2_profile', [
    Column.text('owner_id'),
    Column.text('name'),
    Column.integer('revision'),
  ]),
  Table('p2_command', [
    Column.text('owner_id'),
    Column.text('profile_id'),
    Column.text('payload'),
    Column.text('plan'),
    Column.integer('sequence_no'),
    Column.text('recorded_at'),
  ]),
]);

Future<void> _migrateConnection(SqliteWriteContext tx) async {
  await tx.execute(
    'CREATE TABLE IF NOT EXISTS connected_schema(version INTEGER NOT NULL) STRICT',
  );
  final versions = await tx.getAll('SELECT version FROM connected_schema');
  if (versions.isNotEmpty) {
    if (versions.length != 1 || ![1, 2].contains(versions.single['version'])) {
      reject(
        'Unsupported connected storage version. Existing records are preserved.',
      );
    }
    if (versions.single['version'] == 1) {
      final columns = (await tx.getAll('PRAGMA table_info(connected_profile)'))
          .map((r) => r['name'])
          .toSet();
      if (!columns.contains('enrollment_name')) {
        await tx.execute(
          'ALTER TABLE connected_profile ADD COLUMN enrollment_name TEXT',
        );
      }
      await tx.execute(
        'ALTER TABLE connected_profile ADD COLUMN view_revision INTEGER NOT NULL DEFAULT 0',
      );
      await _connectionVersionTriggers(tx);
      await tx.execute('UPDATE connected_schema SET version=2');
    }
    return;
  }
  for (final sql in [
    '''CREATE TABLE connected_profile(profile_id TEXT PRIMARY KEY REFERENCES local_profile(id),
      remote_owner TEXT NOT NULL, email TEXT NOT NULL, phase TEXT NOT NULL
      CHECK(phase IN ('staged','published','connected','restored')),
      enrollment_id TEXT NOT NULL, enrollment_snapshot TEXT, enrollment_name TEXT,
      boundary INTEGER NOT NULL DEFAULT 0, last_sync TEXT,view_revision INTEGER NOT NULL DEFAULT 0,
      paused INTEGER NOT NULL DEFAULT 0 CHECK(paused IN (0,1))) STRICT''',
    '''CREATE TABLE connected_intent(id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES local_profile(id),
      payload TEXT NOT NULL, envelope TEXT NOT NULL, recorded_at TEXT NOT NULL,
      state TEXT NOT NULL CHECK(state IN ('pending','accepted','reconciled','review','restored')),
      reason TEXT, sequence_no INTEGER NOT NULL UNIQUE) STRICT''',
    '''CREATE TRIGGER connected_intent_frozen BEFORE UPDATE ON connected_intent
      WHEN NEW.id<>OLD.id OR NEW.profile_id<>OLD.profile_id OR NEW.payload<>OLD.payload
      OR NEW.envelope<>OLD.envelope OR NEW.recorded_at<>OLD.recorded_at OR NEW.sequence_no<>OLD.sequence_no
      BEGIN SELECT RAISE(ABORT,'immutable command intent'); END''',
    '''CREATE TRIGGER connected_intent_retained BEFORE DELETE ON connected_intent
      BEGIN SELECT RAISE(ABORT,'retain command intent'); END''',
    'CREATE INDEX connected_intent_state ON connected_intent(profile_id,state,sequence_no)',
  ]) {
    await tx.execute(sql);
  }
  await _connectionVersionTriggers(tx);
  await tx.execute('INSERT INTO connected_schema VALUES(2)');
}

Future<void> _connectionVersionTriggers(SqliteWriteContext tx) async {
  await tx.execute(
    '''CREATE TRIGGER connected_intent_insert_version AFTER INSERT ON connected_intent
    BEGIN UPDATE connected_profile SET view_revision=view_revision+1 WHERE profile_id=NEW.profile_id; END''',
  );
  await tx.execute(
    '''CREATE TRIGGER connected_intent_update_version AFTER UPDATE OF state,reason ON connected_intent
    WHEN NEW.state<>OLD.state OR NEW.reason IS NOT OLD.reason
    BEGIN UPDATE connected_profile SET view_revision=view_revision+1 WHERE profile_id=NEW.profile_id; END''',
  );
}

extension ConnectedLocalStore on LocalStore {
  Future<void> migrateConnected() => db.writeTransaction(_migrateConnection);
  Future<Map<String, dynamic>?> connectionIn(SqliteReadContext tx) async {
    final rows = await tx.getAll(
      'SELECT * FROM connected_profile WHERE profile_id=?',
      [owner],
    );
    return rows.isEmpty ? null : Map<String, dynamic>.from(rows.single);
  }

  Future<Map<String, dynamic>?> connection() =>
      db.readTransaction(connectionIn);

  // This accepted projection is still the original P1 ledger. A pending overlay
  // contributes only until the matching downloaded command is materialized.
  Future<LocalSnapshot> connectedSnapshot(
    SqliteReadContext tx, {
    LocalSnapshot? accepted,
  }) async {
    var snap = accepted ?? await _snapshot(tx);
    final state = await connectionIn(tx);
    if (state == null) return snap;
    final acceptedVersion = snap.version;
    final conflicts = <String>{};
    final rows = await tx.getAll(
      '''SELECT i.* FROM connected_intent i
      WHERE i.profile_id=? AND i.state IN ('pending','accepted')
      AND NOT EXISTS(SELECT 1 FROM local_command c WHERE c.id=i.id)
      ORDER BY i.sequence_no''',
      [owner],
    );
    for (final row in rows) {
      try {
        final c = LocalCommand.decode(
          row['id'] as String,
          row['payload'] as String,
        );
        snap = applyFinancialPlan(
          snap,
          planLocal(snap, rebaseCommand(c, snap.version)),
        );
      } on LocalRuleException {
        // Intent remains inspectable; incompatible monetary facts never merge.
        conflicts.add(row['id'] as String);
      } on RangeError {
        conflicts.add(row['id'] as String);
      }
    }
    // Every durable local edit/download changes the preview token, even when a
    // rejected overlay no longer contributes money.
    return LocalSnapshot(
      owner: owner,
      version: acceptedVersion + (state['view_revision'] as int),
      accounts: snap.accounts,
      categories: snap.categories,
      revisions: snap.revisions,
      projectionConflicts: conflicts,
    );
  }

  Future<String> queueConnected(
    SqliteWriteContext tx,
    LocalCommand c, {
    bool interrupt = false,
  }) async {
    if (c.owner != owner) reject('Wrong profile owner.');
    final old = await tx.getAll(
      'SELECT payload FROM connected_intent WHERE id=?',
      [c.id],
    );
    if (old.isNotEmpty) {
      if (old.single['payload'] != c.payload) {
        reject('This command ID already belongs to a different payload.');
      }
      return c.id;
    }
    final existing = await tx.getAll(
      'SELECT payload FROM local_command WHERE id=?',
      [c.id],
    );
    if (existing.isNotEmpty) {
      if (existing.single['payload'] != c.payload) {
        reject('This command ID already belongs to a different payload.');
      }
      return c.id;
    }
    final state = (await connectionIn(tx))!;
    if (state['phase'] != 'connected') {
      reject(
        'Finish the connection or recovery review before saving connected activity. Your existing records and drafts are preserved.',
      );
    }
    final snap = await connectedSnapshot(tx);
    planLocal(snap, c);
    if (dependencySensitive(c)) {
      final n = await tx.get(
        "SELECT count(*) AS n FROM connected_intent WHERE state IN ('pending','accepted','restored')",
      );
      final last = DateTime.tryParse(state['last_sync'] as String? ?? '');
      if (!db.currentStatus.connected ||
          state['paused'] == 1 ||
          n['n'] != 0 ||
          last == null ||
          DateTime.now().toUtc().difference(last) >
              const Duration(minutes: 1)) {
        reject(
          'Sync now before finalizing this change. Connected corrections, refunds, reversals, comparisons, adjustments and archive actions need a fresh online review with no waiting work.',
        );
      }
    }
    final envelope = jsonEncode({
      'contract': 2,
      'profile_id': owner,
      'payload': c.payload,
      'base_revision': state['boundary'],
    });
    final next = (await tx.get(
      'SELECT coalesce(max(sequence_no),0)+1 AS n FROM connected_intent',
    ))['n'];
    await tx.execute(
      'INSERT INTO connected_intent VALUES(?,?,?,?,?,?,NULL,?)',
      [
        c.id,
        owner,
        c.payload,
        envelope,
        DateTime.now().toUtc().toIso8601String(),
        'pending',
        next,
      ],
    );
    if (interrupt) {
      throw StateError('Injected connected transaction interruption');
    }
    await tx.execute('INSERT INTO p2_transport(id,payload) VALUES(?,?)', [
      c.id,
      envelope,
    ]);
    await tx.execute(
      'DELETE FROM local_draft WHERE owner_id=? AND command_id=?',
      [owner, c.id],
    );
    return c.id;
  }

  Future<void> stageConnection(
    String actor,
    String email,
    String enrollmentId,
  ) => db.writeTransaction((tx) async {
    final old = await connectionIn(tx);
    if (old != null) {
      if (old['remote_owner'] != actor) {
        reject(
          'Reconnect with the Google identity already bound to this profile.',
        );
      }
      return;
    }
    final rows = await tx.getAll(
      'SELECT id,payload,recorded_at FROM local_command ORDER BY sequence_no',
    );
    final snapshot = jsonEncode(
      rows.map((r) => Map<String, dynamic>.from(r)).toList(),
    );
    if (rows.length > 20000 ||
        utf8.encode(snapshot).length > 32 * 1024 * 1024) {
      reject(
        'This profile exceeds the supported enrollment size. Local records are unchanged.',
      );
    }
    await tx.execute(
      '''INSERT INTO connected_profile(profile_id,remote_owner,email,phase,enrollment_id,enrollment_snapshot,enrollment_name)
      VALUES(?,?,?,'staged',?,?,?)''',
      [
        owner,
        actor,
        email,
        enrollmentId,
        snapshot,
        (await tx.get('SELECT name FROM local_profile WHERE id=?', [
          owner,
        ]))['name'],
      ],
    );
  });

  Future<void> cancelStaging() => db.execute(
    "DELETE FROM connected_profile WHERE profile_id=? AND phase='staged'",
    [owner],
  );

  // Projection and overlay retirement are one SQLite transaction. The remote
  // plan must equal a fresh pure-domain replay; neither an RPC acknowledgement
  // nor a remembered SDK first-sync flag can substitute for these downloaded rows.
  Future<bool> reconcileDownloaded({
    int? requiredBoundary,
  }) => db.writeTransaction((tx) async {
    final state = await connectionIn(tx);
    if (state == null ||
        state['phase'] == 'staged' ||
        state['phase'] == 'restored') {
      return false;
    }
    final profiles = await tx.getAll(
      'SELECT * FROM p2_profile WHERE id=? AND owner_id=?',
      [owner, state['remote_owner']],
    );
    if (profiles.length != 1) return false;
    final boundary = profiles.single['revision'] as int;
    if (requiredBoundary != null && boundary < requiredBoundary) return false;
    final rows = await tx.getAll(
      'SELECT * FROM p2_command WHERE profile_id=? AND owner_id=? ORDER BY sequence_no',
      [owner, state['remote_owner']],
    );
    if (rows.length != boundary) return false;
    var verified = LocalSnapshot(
      owner: owner,
      version: 0,
      accounts: [],
      categories: [
        for (final c in defaultLocalCategories)
          LocalCategory('category-${c.$1}', c.$2, c.$3),
      ],
      revisions: [],
    );
    for (var i = 0; i < rows.length; i++) {
      final row = rows[i], id = rows[i]['id'] as String;
      if (row['sequence_no'] != i + 1) return false;
      final c = LocalCommand.decode(id, row['payload'] as String);
      if (c.owner != owner || c.payload != row['payload']) {
        reject(
          'Downloaded command contract mismatch. Local data is preserved.',
        );
      }
      final plan = planLocal(verified, rebaseCommand(c, i));
      if (canonicalJson(financialPlanJson(plan)) !=
          canonicalJson(jsonDecode(row['plan'] as String))) {
        reject(
          'Financial rule versions disagree. Update Salapiya before continuing synchronization.',
        );
      }
      verified = applyFinancialPlan(verified, plan);
      final local = await tx.getAll(
        'SELECT payload,sequence_no FROM local_command WHERE id=?',
        [id],
      );
      if (local.isNotEmpty) {
        if (local.single['payload'] != c.payload ||
            local.single['sequence_no'] != i + 1) {
          reject(
            'Downloaded evidence differs from this profile. Review connection before continuing.',
          );
        }
      } else {
        final snap = await _snapshot(tx);
        if (snap.version != i) reject('Downloaded history is not contiguous.');
        final plan = planLocal(snap, rebaseCommand(c, snap.version));
        if (canonicalJson(financialPlanJson(plan)) !=
            canonicalJson(jsonDecode(row['plan'] as String))) {
          reject(
            'Financial rule versions disagree. Update Salapiya before continuing synchronization.',
          );
        }
        await commitAccepted(
          tx,
          c,
          fromServer: true,
          recordedAt: row['recorded_at'] as String,
        );
      }
      final intents = await tx.getAll(
        'SELECT payload,state FROM connected_intent WHERE id=?',
        [id],
      );
      if (intents.isNotEmpty) {
        if (intents.single['payload'] != c.payload) {
          reject('Downloaded receipt payload mismatch.');
        }
        // Require the authenticated receipt persisted by the connector/recovery.
        if (intents.single['state'] == 'accepted') {
          await tx.execute(
            "UPDATE connected_intent SET state='reconciled',reason=NULL WHERE id=?",
            [id],
          );
        }
      }
    }
    final total = await tx.get(
      'SELECT revision FROM local_profile WHERE id=?',
      [owner],
    );
    if (total['revision'] != boundary) {
      reject('Local and remote accepted coverage differ.');
    }
    // Download may beat upload acknowledgement. A later reconciliation retires
    // it; the NOT EXISTS overlay rule already prevents counting it twice.
    var verifiedAt = state['last_sync'] as String?;
    final checkpoint = db.currentStatus.connected
        ? db.currentStatus.lastSyncedAt
        : null;
    if (checkpoint != null &&
        (verifiedAt == null ||
            checkpoint.isAfter(DateTime.parse(verifiedAt)))) {
      verifiedAt = checkpoint.toUtc().toIso8601String();
    }
    await tx.execute(
      "UPDATE connected_profile SET phase='connected',boundary=?,last_sync=? WHERE profile_id=?",
      [boundary, verifiedAt, owner],
    );
    return true;
  });
}
