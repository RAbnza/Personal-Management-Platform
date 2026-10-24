import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/p0/command_connector.dart';
import 'package:salapiya/p0/local_ledger.dart';
import 'package:salapiya/p0/proof_database.dart';

void main() {
  test('real SDK queue; simulated response loss/rejection/download handoff', () async {
    final dir = await Directory.systemTemp.createTemp('salapiya-queue-');
    var db = openProofDatabase('${dir.path}/proof.sqlite', 'synthetic-key');
    var ledger = LocalLedger(db);
    final receipts = <String, Map<String, dynamic>>{};
    var loseResponse = true;
    var effects = 0;
    final connector = ProofConnector(
      owner: 'a',
      credentials: () async => null,
      submit: (id, payload) async {
        final receipt = receipts.putIfAbsent(id, () {
          if (id == 'reject')
            return {
              'id': id,
              'owner_id': 'a',
              'outcome': 'rejected',
              'reason': 'stale_revision',
            };
          effects++;
          return {'id': id, 'owner_id': 'a', 'outcome': 'accepted'};
        });
        if (loseResponse) {
          loseResponse = false;
          throw const SocketException('Simulated lost response');
        }
        return receipt;
      },
    );
    try {
      await db.initialize();
      await ledger.migrate();
      await ledger.expense(id: 'one', owner: 'a', amount: '1', connected: true);
      await expectLater(
        connector.uploadData(db),
        throwsA(isA<SocketException>()),
      );
      await db.close();
      db = openProofDatabase('${dir.path}/proof.sqlite', 'synthetic-key');
      await db.initialize();
      ledger = LocalLedger(db);
      await connector.uploadData(db);
      expect(effects, 1);
      expect(await db.getNextCrudTransaction(), isNull);
      expect(await ledger.expenseView('a'), BigInt.one);
      final payload =
          (await db.get('SELECT payload FROM proof_intent'))['payload']
              as String;
      // Deliberate local injection emulates an accepted download, not live CDC.
      await db.execute(
        'INSERT INTO p0_accepted(id,owner_id,payload,amount_minor,revision) VALUES(?,?,?,?,?)',
        ['one', 'a', payload, '1', 1],
      );
      expect(
        await ledger.expenseView('a'),
        BigInt.one,
      ); // no doubled overlay even before reconciliation
      await ledger.reconcile('a');
      expect(
        (await db.get('SELECT state FROM proof_intent'))['state'],
        'reconciled',
      );
      expect(await ledger.expenseView('a'), BigInt.one);
      // Remove only the synthetic download injection's SDK upload record.
      await (await db.getNextCrudTransaction())!.complete();
      await ledger.expense(
        id: 'reject',
        owner: 'a',
        amount: '2',
        connected: true,
      );
      await ledger.expense(
        id: 'unrelated',
        owner: 'a',
        amount: '3',
        connected: true,
      );
      await connector.uploadData(db);
      await connector.uploadData(db);
      expect(
        (await db.get(
          "SELECT state FROM proof_intent WHERE id='reject'",
        ))['state'],
        'review',
      );
      expect(
        (await db.get(
          "SELECT count(*) AS n FROM proof_evidence WHERE intent_id='reject'",
        ))['n'],
        2,
      );
      expect(effects, 2);
      expect(await db.getNextCrudTransaction(), isNull);
      expect(await ledger.expenseView('a'), BigInt.from(4));
      expect(await ledger.expenseView('b'), BigInt.zero);
      expect(jsonDecode(payload)['amount_minor'], '1');
    } finally {
      await db.close();
      await dir.delete(recursive: true);
    }
  });
}
