import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/p0/local_ledger.dart';
import 'package:salapiya/p0/proof_database.dart';

void main() {
  test(
    'encrypted SQLite migration, atomic evidence, reopen, strict ranges',
    () async {
      final dir = await Directory.systemTemp.createTemp('salapiya-p0-');
      var db = openProofDatabase('${dir.path}/proof.sqlite', 'synthetic-only');
      try {
        await db.initialize();
        var ledger = LocalLedger(db);
        await expectLater(ledger.migrate(fail: true), throwsStateError);
        expect(
          await db.getAll(
            "SELECT name FROM sqlite_master WHERE name='proof_intent'",
          ),
          isEmpty,
        );
        await ledger.migrate();
        await expectLater(
          ledger.expense(
            id: 'rollback',
            owner: 'a',
            amount: '1',
            failAfterIntent: true,
          ),
          throwsStateError,
        );
        expect(await db.getAll('SELECT * FROM proof_intent'), isEmpty);
        await ledger.expense(id: 'local', owner: 'a', amount: '100000000000');
        expect(await db.getNextCrudTransaction(), isNull);
        await expectLater(
          db.execute("UPDATE proof_evidence SET amount_minor=1"),
          throwsA(anything),
        );
        await expectLater(
          db.execute("DELETE FROM proof_evidence"),
          throwsA(anything),
        );
        await expectLater(
          db.execute(
            "INSERT INTO proof_intent VALUES('bad','a','{}',1.5,'local',NULL)",
          ),
          throwsA(anything),
        );
        await db.close();
        db = openProofDatabase('${dir.path}/proof.sqlite', 'synthetic-only');
        await db.initialize();
        ledger = LocalLedger(db);
        await ledger.migrate();
        expect(await ledger.expenseView('a'), BigInt.from(100000000000));
        expect(await ledger.expenseView('b'), BigInt.zero);
        expect(
          (await db.get('SELECT count(*) AS n FROM proof_evidence'))['n'],
          2,
        );
        await db.execute('UPDATE proof_version SET version=2');
        await expectLater(ledger.migrate(), throwsStateError);
      } finally {
        await db.close();
        await dir.delete(recursive: true);
      }
    },
  );
}
