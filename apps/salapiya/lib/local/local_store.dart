import 'dart:convert';

import 'package:powersync/powersync.dart';
import 'package:powersync/native.dart';
import 'package:sqlite_async/sqlite_async.dart';

import '../p0/exact_money.dart';
import 'finance_domain.dart';

// P0-verified encrypted native factory. No replicated tables or connector.
PowerSyncDatabase openLocalDatabase(String path, String key) =>
    PowerSyncDatabase.withFactory(
      _LocalFactory(path, key),
      schema: const Schema([]),
      logger: attachedLogger,
    );

final class _LocalFactory extends NativePowerSyncOpenFactory {
  _LocalFactory(String path, String key)
    : super(
        path: path,
        encryptionOptions: EncryptionOptions(key: key),
        sqliteOptions: const SqliteOptions(
          synchronous: SqliteSynchronous.full,
          profileQueries: false,
        ),
      );
  @override
  List<String> pragmaStatements(SqliteOpenOptions options) => [
    ...super.pragmaStatements(options),
    'PRAGMA foreign_keys=ON',
    'PRAGMA temp_store=MEMORY',
  ];
}

const localSchemaVersion = 1;
const defaultLocalCategories = [
  ('food', 'Food & drink', 'expense'),
  ('transport', 'Transport', 'expense'),
  ('groceries', 'Groceries', 'expense'),
  ('bills', 'Bills', 'expense'),
  ('fees', 'Fees', 'expense'),
  ('other', 'Other', 'expense'),
  ('income', 'Income', 'income'),
];

class LocalStore {
  LocalStore(this.db, this.owner);
  final PowerSyncDatabase db;
  final String owner;
  Future<void> migrate({bool interrupt = false}) => db.writeTransaction((
    tx,
  ) async {
    await tx.execute(
      'CREATE TABLE IF NOT EXISTS local_schema(version INTEGER NOT NULL) STRICT',
    );
    final versions = await tx.getAll('SELECT version FROM local_schema');
    if (versions.isNotEmpty) {
      if (versions.length != 1 ||
          versions.single['version'] != localSchemaVersion) {
        reject(
          'Unsupported database version. Preserve this database and use a compatible Salapiya version.',
        );
      }
      return;
    }
    for (final sql in _schema) {
      await tx.execute(sql);
    }
    for (final table in [
      'local_command',
      'local_revision',
      'local_posting',
      'local_seal',
      'local_category',
    ]) {
      for (final op in ['UPDATE', 'DELETE']) {
        await tx.execute(
          "CREATE TRIGGER ${table}_${op.toLowerCase()} BEFORE $op ON $table BEGIN SELECT RAISE(ABORT,'immutable financial evidence'); END",
        );
      }
    }
    for (final trigger in _triggers) {
      await tx.execute(trigger);
    }
    if (interrupt) {
      throw StateError('Injected migration interruption');
    }
    await tx.execute('INSERT INTO local_schema VALUES(?)', [
      localSchemaVersion,
    ]);
  });
  Future<void> initializeProfile(
    String name,
    Map<String, String> preferences,
  ) => db.writeTransaction((tx) async {
    _name(name);
    final rows = await tx.getAll('SELECT id FROM local_profile');
    if (rows.isNotEmpty) {
      if (rows.single['id'] != owner) {
        reject('Database profile identity mismatch.');
      }
      return;
    }
    await tx.execute('INSERT INTO local_profile VALUES(?,?,0,?)', [
      owner,
      name.trim(),
      jsonEncode(preferences),
    ]);
    for (final c in defaultLocalCategories) {
      await tx.execute('INSERT INTO local_category VALUES(?,?,?,?)', [
        'category-${c.$1}',
        owner,
        c.$2,
        c.$3,
      ]);
    }
  });
  Future<void> integrity() async {
    if ((await db.get('PRAGMA quick_check')).values.single != 'ok' ||
        (await db.getAll('PRAGMA foreign_key_check')).isNotEmpty) {
      reject(
        'Database integrity check failed. Preserve your files and restore a verified backup.',
      );
    }
    final profile = await db.getAll('SELECT id,revision FROM local_profile');
    if (profile.length != 1 || profile.single['id'] != owner) {
      reject('Database identity does not match the protected profile.');
    }
    final commands = await db.get(
      'SELECT count(*) AS n FROM local_command WHERE owner_id=?',
      [owner],
    );
    final seals = await db.get(
      'SELECT count(*) AS n FROM local_seal WHERE owner_id=?',
      [owner],
    );
    if (commands['n'] != profile.single['revision'] ||
        seals['n'] != commands['n']) {
      reject(
        'Incomplete financial command evidence. Existing data is preserved.',
      );
    }
    final snap = await snapshot();
    for (final r in snap.revisions) {
      for (final date in r.postings.map((p) => p.date).toSet()) {
        if (sumMinor(
              r.postings.where((p) => p.date == date).map((p) => p.amount),
            ) !=
            BigInt.zero) {
          reject('Unbalanced financial evidence.');
        }
      }
    }
  }

  Future<LocalSnapshot> snapshot() => db.readTransaction(_snapshot);
  Future<LocalSnapshot> _snapshot(SqliteReadContext tx) async {
    final profile = await tx.get(
      'SELECT revision FROM local_profile WHERE id=?',
      [owner],
    );
    final accounts = await tx.getAll(
      'SELECT * FROM local_account WHERE owner_id=? ORDER BY rowid',
      [owner],
    );
    final categories = await tx.getAll(
      'SELECT * FROM local_category WHERE owner_id=? ORDER BY rowid',
      [owner],
    );
    final revisions = await tx.getAll(
      'SELECT * FROM local_revision WHERE owner_id=? ORDER BY sequence_no',
      [owner],
    );
    final postings = await tx.getAll(
      'SELECT * FROM local_posting WHERE owner_id=? ORDER BY rowid',
      [owner],
    );
    final byRevision = <String, List<LocalPosting>>{};
    for (final p in postings) {
      byRevision
          .putIfAbsent(p['revision_id'] as String, () => [])
          .add(
            LocalPosting(
              p['ledger'] as String,
              parseMinor(p['amount_minor'].toString()),
              p['effective_date'] as String,
              account: p['account_id'] as String?,
              category: p['category_id'] as String?,
            ),
          );
    }
    return LocalSnapshot(
      owner: owner,
      version: profile['revision'] as int,
      accounts: [
        for (final a in accounts)
          LocalAccount(
            a['id'] as String,
            a['name'] as String,
            a['kind'] as String,
            a['cutoff'] as String,
            a['archived'] == 1,
            a['institution'] as String,
            a['notes'] as String,
          ),
      ],
      categories: [
        for (final c in categories)
          LocalCategory(
            c['id'] as String,
            c['name'] as String,
            c['kind'] as String,
          ),
      ],
      revisions: [
        for (final r in revisions)
          LocalRevision(
            id: r['id'] as String,
            actionId: r['action_id'] as String,
            kind: r['kind'] as String,
            change: r['change_kind'] as String,
            date: r['effective_date'] as String,
            title: r['title'] as String,
            amount: parseMinor(r['amount_minor'].toString()),
            values: Map<String, String>.from(
              jsonDecode(r['values_json'] as String) as Map,
            ),
            postings: byRevision[r['id']] ?? [],
            number: r['revision_no'] as int,
            previous: r['previous_id'] as String?,
            source: r['source_id'] as String?,
          ),
      ],
    );
  }

  Future<String> commit(
    LocalCommand command, {
    bool interrupt = false,
    String? recordedAt,
    Future<void> Function()? afterRevision,
  }) => db.writeTransaction((tx) async {
    if (command.owner != owner) {
      reject('Wrong profile owner.');
    }
    final old = await tx.getAll(
      'SELECT payload,result_id FROM local_command WHERE id=? AND owner_id=?',
      [command.id, owner],
    );
    if (old.isNotEmpty) {
      if (old.single['payload'] != command.payload) {
        reject('This command ID already belongs to a different payload.');
      }
      return old.single['result_id'] as String;
    }
    final snap = await _snapshot(tx);
    final plan = planLocal(snap, command);
    final sequence = snap.version + 1;
    await tx.execute('INSERT INTO local_command VALUES(?,?,?,?,?,?)', [
      command.id,
      owner,
      command.payload,
      command.id,
      sequence,
      recordedAt ?? DateTime.now().toUtc().toIso8601String(),
    ]);
    if (plan.account case final a?) {
      await tx.execute('INSERT INTO local_account VALUES(?,?,?,?,?,0,?,?)', [
        a.id,
        owner,
        a.name,
        a.kind,
        a.cutoff,
        a.institution,
        a.notes,
      ]);
    }
    if (plan.category case final c?) {
      await tx.execute('INSERT INTO local_category VALUES(?,?,?,?)', [
        c.id,
        owner,
        c.name,
        c.kind,
      ]);
    }
    if (plan.archiveId case final id?) {
      await tx.execute(
        'UPDATE local_account SET archived=1 WHERE id=? AND owner_id=?',
        [id, owner],
      );
    }
    if (plan.revision case final r?) {
      await tx.execute(
        'INSERT INTO local_revision VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [
          r.id,
          owner,
          r.actionId,
          sequence,
          r.number,
          r.kind,
          r.change,
          r.date,
          r.title,
          sqliteInteger(r.amount),
          jsonEncode(r.values),
          r.previous,
          r.source,
          command.id,
          1,
        ],
      );
      if (interrupt) {
        throw StateError('Injected failure after revision');
      }
      if (afterRevision != null) {
        await afterRevision();
      }
      var line = 0;
      for (final p in r.postings) {
        await tx.execute(
          'INSERT INTO local_posting VALUES(?,?,?,?,?,?,?,?,?)',
          [
            '${r.id}-p${++line}',
            owner,
            r.id,
            p.ledger,
            p.account,
            p.category,
            p.date,
            sqliteInteger(p.amount),
            1,
          ],
        );
      }
    }
    if (interrupt) {
      throw StateError('Injected transaction interruption');
    }
    await tx.execute('INSERT INTO local_seal VALUES(?,?)', [command.id, owner]);
    await tx.execute('UPDATE local_profile SET revision=? WHERE id=?', [
      sequence,
      owner,
    ]);
    await tx.execute(
      'DELETE FROM local_draft WHERE owner_id=? AND command_id=?',
      [owner, command.id],
    );
    return command.id;
  });
  Future<Map<String, String>> preferences() async => Map<String, String>.from(
    jsonDecode(
      (await db.get('SELECT preferences FROM local_profile WHERE id=?', [
            owner,
          ]))['preferences']
          as String,
    ) as Map,
  );
  Future<String> displayName() async =>
      (await db.get('SELECT name FROM local_profile WHERE id=?', [
            owner,
          ]))['name']
          as String;
  static void _name(String name) {
    if (name.trim().isEmpty || name.trim().length > 200) {
      reject('Enter a display name (1–200 characters).');
    }
  }

  Future<void> savePreferences(String name, Map<String, String> values) async {
    _name(name);
    await db.execute(
      'UPDATE local_profile SET name=?, preferences=? WHERE id=?',
      [name.trim(), jsonEncode(values), owner],
    );
  }

  Future<void> saveDraft(
    String operation,
    String commandId,
    Map<String, String> values,
  ) async {
    if (operation.length > 200 ||
        values.length > 512 ||
        values.values.any((v) => v.length > 20000)) {
      reject('Draft exceeds the supported size.');
    }
    await db.writeTransaction((tx) async {
      if ((await tx.getAll('SELECT id FROM local_command WHERE id=?', [
        commandId,
      ])).isNotEmpty) {
        return;
      }
      await tx.execute(
        'INSERT INTO local_draft VALUES(?,?,?,?,?) ON CONFLICT(owner_id,operation) DO UPDATE SET command_id=excluded.command_id,values_json=excluded.values_json,updated_at=excluded.updated_at',
        [
          owner,
          operation,
          commandId,
          jsonEncode(values),
          DateTime.now().toUtc().toIso8601String(),
        ],
      );
    });
  }

  Future<Map<String, dynamic>?> draft(String operation) async {
    final rows = await db.getAll(
      'SELECT command_id,values_json FROM local_draft WHERE owner_id=? AND operation=?',
      [owner, operation],
    );
    return rows.isEmpty
        ? null
        : {
            'command': rows.single['command_id'],
            'values': Map<String, String>.from(
              jsonDecode(rows.single['values_json'] as String) as Map,
            ),
          };
  }

  Future<void> discardDraft(String operation) async {
    await db.execute(
      'DELETE FROM local_draft WHERE owner_id=? AND operation=?',
      [owner, operation],
    );
  }

  Future<List<Map<String, dynamic>>> drafts() async => [
    for (final r in await db.getAll(
      'SELECT operation,command_id,values_json FROM local_draft WHERE owner_id=? ORDER BY updated_at DESC',
      [owner],
    ))
      Map<String, dynamic>.from(r),
  ];
  Future<bool> hasReceipt(String id) async => (await db.getAll(
    'SELECT id FROM local_command WHERE owner_id=? AND id=?',
    [owner, id],
  )).isNotEmpty;
  Future<void> close() => db.close();
}

const _schema = [
  '''CREATE TABLE local_profile(id TEXT PRIMARY KEY, name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200),
    revision INTEGER NOT NULL CHECK(revision>=0), preferences TEXT NOT NULL) STRICT''',
  '''CREATE TABLE local_command(id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES local_profile(id),
    payload TEXT NOT NULL, result_id TEXT NOT NULL, sequence_no INTEGER NOT NULL UNIQUE CHECK(sequence_no>0), recorded_at TEXT NOT NULL,
    UNIQUE(id,owner_id)) STRICT''',
  '''CREATE TABLE local_account(id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES local_profile(id), name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('Cash','Bank','Mobile wallet','Checking','Savings')), cutoff TEXT NOT NULL,
    archived INTEGER NOT NULL CHECK(archived IN (0,1)), institution TEXT NOT NULL, notes TEXT NOT NULL, UNIQUE(id,owner_id)) STRICT''',
  '''CREATE TABLE local_category(id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES local_profile(id),
    name TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('income','expense')), UNIQUE(owner_id,name COLLATE NOCASE), UNIQUE(id,owner_id)) STRICT''',
  '''CREATE TABLE local_revision(id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES local_profile(id), action_id TEXT NOT NULL,
    sequence_no INTEGER NOT NULL UNIQUE, revision_no INTEGER NOT NULL CHECK(revision_no>0),
    kind TEXT NOT NULL CHECK(kind IN ('opening','income','expense','transfer','refund','reconcile','adjustment')),
    change_kind TEXT NOT NULL CHECK(change_kind IN ('create','replace','reverse')), effective_date TEXT NOT NULL,
    title TEXT NOT NULL, amount_minor INTEGER NOT NULL, values_json TEXT NOT NULL,
    previous_id TEXT UNIQUE, source_id TEXT, command_id TEXT NOT NULL, contract INTEGER NOT NULL CHECK(contract=1),
    UNIQUE(id,owner_id), UNIQUE(action_id,revision_no),
    FOREIGN KEY(previous_id,owner_id) REFERENCES local_revision(id,owner_id),
    FOREIGN KEY(source_id,owner_id) REFERENCES local_revision(id,owner_id),
    FOREIGN KEY(command_id,owner_id) REFERENCES local_command(id,owner_id)) STRICT''',
  '''CREATE TABLE local_posting(id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, revision_id TEXT NOT NULL,
    ledger TEXT NOT NULL CHECK(ledger IN ('cash','expense','income','equity')), account_id TEXT, category_id TEXT,
    effective_date TEXT NOT NULL, amount_minor INTEGER NOT NULL CHECK(amount_minor<>0 AND amount_minor BETWEEN -100000000000 AND 100000000000),
    contract INTEGER NOT NULL CHECK(contract=1),
    CHECK((ledger='cash' AND account_id IS NOT NULL AND category_id IS NULL) OR
      (ledger IN ('expense','income') AND account_id IS NULL AND category_id IS NOT NULL) OR
      (ledger='equity' AND account_id IS NULL AND category_id IS NULL)),
    FOREIGN KEY(revision_id,owner_id) REFERENCES local_revision(id,owner_id),
    FOREIGN KEY(account_id,owner_id) REFERENCES local_account(id,owner_id),
    FOREIGN KEY(category_id,owner_id) REFERENCES local_category(id,owner_id)) STRICT''',
  '''CREATE TABLE local_draft(owner_id TEXT NOT NULL REFERENCES local_profile(id), operation TEXT NOT NULL,
    command_id TEXT NOT NULL, values_json TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(owner_id,operation)) STRICT''',
  '''CREATE TABLE local_seal(command_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL,
    FOREIGN KEY(command_id,owner_id) REFERENCES local_command(id,owner_id)) STRICT''',
  'CREATE INDEX local_posting_history ON local_posting(owner_id,account_id,effective_date)',
  'CREATE INDEX local_revision_sources ON local_revision(owner_id,source_id)',
];
const _triggers = [
  "CREATE TRIGGER local_revision_sealed BEFORE INSERT ON local_revision WHEN EXISTS(SELECT 1 FROM local_seal WHERE command_id=NEW.command_id) BEGIN SELECT RAISE(ABORT,'sealed command'); END",
  "CREATE TRIGGER local_posting_sealed BEFORE INSERT ON local_posting WHEN EXISTS(SELECT 1 FROM local_revision r JOIN local_seal s ON s.command_id=r.command_id WHERE r.id=NEW.revision_id) BEGIN SELECT RAISE(ABORT,'sealed financial evidence'); END",
  "CREATE TRIGGER local_posting_classification BEFORE INSERT ON local_posting WHEN NEW.category_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM local_category c WHERE c.id=NEW.category_id AND c.owner_id=NEW.owner_id AND c.kind=NEW.ledger) BEGIN SELECT RAISE(ABORT,'category classification'); END",
  "CREATE TRIGGER local_seal_balanced BEFORE INSERT ON local_seal WHEN EXISTS(SELECT p.effective_date FROM local_posting p JOIN local_revision r ON r.id=p.revision_id WHERE r.command_id=NEW.command_id GROUP BY p.effective_date HAVING SUM(p.amount_minor)<>0) BEGIN SELECT RAISE(ABORT,'unbalanced journal'); END",
  "CREATE TRIGGER local_account_metadata BEFORE UPDATE ON local_account WHEN NEW.id<>OLD.id OR NEW.owner_id<>OLD.owner_id OR NEW.name<>OLD.name OR NEW.kind<>OLD.kind OR NEW.cutoff<>OLD.cutoff OR NEW.institution<>OLD.institution OR NEW.notes<>OLD.notes OR NEW.archived<>1 BEGIN SELECT RAISE(ABORT,'account evidence requires command'); END",
  "CREATE TRIGGER local_account_delete BEFORE DELETE ON local_account BEGIN SELECT RAISE(ABORT,'account history retained'); END",
];
