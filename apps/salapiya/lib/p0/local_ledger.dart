import 'dart:convert';

import 'package:powersync/powersync.dart';

import 'exact_money.dart';

// A bounded expense proof, not the production ledger schema or sync engine.
class LocalLedger {
  LocalLedger(this.db);
  final PowerSyncDatabase db;

  Future<void> migrate({bool fail = false}) => db.writeTransaction((tx) async {
    await tx.execute(
      'CREATE TABLE IF NOT EXISTS proof_version(version INTEGER NOT NULL) STRICT',
    );
    final rows = await tx.getAll('SELECT version FROM proof_version');
    if (rows.isNotEmpty) {
      if (rows.single['version'] != 1)
        throw StateError('Unsupported schema; preserve database');
      return;
    }
    await tx.execute('''CREATE TABLE proof_intent(
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, payload TEXT NOT NULL,
      amount_minor INTEGER NOT NULL CHECK(amount_minor BETWEEN 1 AND 100000000000),
      state TEXT NOT NULL CHECK(state IN ('local','pending','accepted','review','reconciled')),
      reason TEXT, UNIQUE(id,owner_id)) STRICT''');
    await tx.execute(
      '''CREATE TABLE proof_evidence(
      id TEXT PRIMARY KEY, intent_id TEXT NOT NULL REFERENCES proof_intent(id),
      kind TEXT NOT NULL CHECK(kind IN ('expense','cash')), amount_minor INTEGER NOT NULL) STRICT''',
    );
    await tx.execute(
      "CREATE TRIGGER proof_evidence_immutable_update BEFORE UPDATE ON proof_evidence BEGIN SELECT RAISE(ABORT,'immutable evidence'); END",
    );
    await tx.execute(
      "CREATE TRIGGER proof_evidence_immutable_delete BEFORE DELETE ON proof_evidence BEGIN SELECT RAISE(ABORT,'immutable evidence'); END",
    );
    if (fail) throw StateError('Injected interrupted migration');
    await tx.execute('INSERT INTO proof_version VALUES(1)');
  });

  Future<void> expense({
    required String id,
    required String owner,
    required String amount,
    bool connected = false,
    int revision = 0,
    bool failAfterIntent = false,
  }) async {
    final minor = sqliteInteger(component(parseMinor(amount), positive: true));
    final payload = jsonEncode({
      'amount_minor': amount,
      'expected_revision': revision,
      'kind': 'expense',
      'owner_id': owner,
      'version': 1,
    });
    await db.writeTransaction((tx) async {
      final prior = await tx.getAll(
        'SELECT payload FROM proof_intent WHERE id=?',
        [id],
      );
      if (prior.isNotEmpty) {
        if (prior.single['payload'] != payload)
          throw StateError('Command ID payload mismatch');
        return;
      }
      await tx.execute(
        'INSERT INTO proof_intent(id,owner_id,payload,amount_minor,state) VALUES(?,?,?,?,?)',
        [id, owner, payload, minor, connected ? 'pending' : 'local'],
      );
      if (failAfterIntent) throw StateError('Injected failure');
      await tx.execute('INSERT INTO proof_evidence VALUES(?,?,?,?)', [
        '$id-expense',
        id,
        'expense',
        minor,
      ]);
      await tx.execute('INSERT INTO proof_evidence VALUES(?,?,?,?)', [
        '$id-cash',
        id,
        'cash',
        -minor,
      ]);
      if (connected)
        await tx.execute(
          'INSERT INTO command_transport(id,payload) VALUES(?,?)',
          [id, payload],
        );
    });
  }

  // Receipt alone never removes the overlay. Only matching accepted download does.
  Future<void> reconcile(String owner) => db.writeTransaction((tx) async {
    await tx.execute(
      '''UPDATE proof_intent SET state='reconciled' WHERE owner_id=?
      AND state IN ('pending','accepted') AND EXISTS(
        SELECT 1 FROM p0_accepted a WHERE a.id=proof_intent.id
        AND a.owner_id=proof_intent.owner_id AND a.payload=proof_intent.payload
        AND a.amount_minor=CAST(proof_intent.amount_minor AS TEXT))''',
      [owner],
    );
  });

  // Sum through BigInt: SQLite SUM may overflow, and TOTAL converts to double.
  Future<BigInt> expenseView(String owner) async {
    final rows = await db.getAll(
      '''SELECT amount_minor FROM proof_intent
      WHERE owner_id=? AND state IN ('local','pending','accepted')
      AND NOT EXISTS(SELECT 1 FROM p0_accepted a WHERE a.id=proof_intent.id
        AND a.owner_id=proof_intent.owner_id AND a.payload=proof_intent.payload
        AND a.amount_minor=CAST(proof_intent.amount_minor AS TEXT))
      UNION ALL SELECT amount_minor FROM p0_accepted WHERE owner_id=?''',
      [owner, owner],
    );
    return rows.fold<BigInt>(
      BigInt.zero,
      (sum, row) => sum + parseMinor(row['amount_minor'].toString()),
    );
  }
}
