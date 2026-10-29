import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/p0/enrollment_proof.dart';
import 'package:salapiya/p0/local_ledger.dart';
import 'package:salapiya/p0/proof_database.dart';

void main() {
  test('local unauthenticated creation; durable frozen enrollment; collision cancel preserves data', () async {
    final dir = await Directory.systemTemp.createTemp('salapiya-enroll-');
    final path = '${dir.path}/proof.sqlite';
    var db = openProofDatabase(path, 'synthetic');
    try {
      await db.initialize();
      await LocalLedger(db).migrate();
      var enrollment = EnrollmentProof(db);
      await enrollment.createLocal('local');
      await LocalLedger(db)
          .expense(id: 'source', owner: 'local', amount: '500050');
      final snapshot = await enrollment.stage(
        'enrollment',
        'trusted-owner-placeholder',
      );
      expect(jsonDecode(snapshot), [
        {'id': 'source', 'amount_minor': '500050'},
      ]);
      await expectLater(
        LocalLedger(db).expense(id: 'frozen', owner: 'local', amount: '1'),
        throwsStateError,
      );
      await db.close();
      db = openProofDatabase(path, 'synthetic');
      await db.initialize();
      enrollment = EnrollmentProof(db);
      expect(
        await enrollment.stage('enrollment', 'trusted-owner-placeholder'),
        snapshot,
      );
      await expectLater(
        enrollment.stage('another', 'wrong-owner'),
        throwsStateError,
      );
      await enrollment.collision();
      await enrollment.cancel();
      expect(await LocalLedger(db).expenseView('local'), BigInt.from(500050));
      await LocalLedger(db)
          .expense(id: 'after-cancel', owner: 'local', amount: '1');
      expect(await db.getNextCrudTransaction(), isNull);
      await expectLater(enrollment.createLocal('different'), throwsStateError);
    } finally {
      await db.close();
      await dir.delete(recursive: true);
    }
  });
  test('callback filter allows only the exact PKCE proof endpoint', () {
    expect(isProofCallback(Uri.parse('$proofCallback?code=synthetic')), isTrue);
    for (final uri in [
      'https://auth/callback?code=x',
      'dev.salapiya.p0://evil/callback?code=x',
      'dev.salapiya.p0://userinfo@auth/callback?code=x',
      'dev.salapiya.p0://auth:1234/callback?code=x',
      '$proofCallback/other?code=x',
      '$proofCallback#access_token=x',
      proofCallback,
    ]) {
      expect(isProofCallback(Uri.parse(uri)), isFalse);
    }
  });
  test(
    'bounded publication verifies the complete owner graph before remapping',
    () async {
      final dir = await Directory.systemTemp.createTemp('salapiya-publish-');
      final db = openProofDatabase('${dir.path}/proof.sqlite', 'synthetic');
      try {
        await db.initialize();
        final ledger = LocalLedger(db);
        await ledger.migrate();
        final enrollment = EnrollmentProof(db);
        await enrollment.createLocal('local');
        await ledger.expense(id: 'source', owner: 'local', amount: '1');
        await enrollment.stage('claim', 'owner');
        await expectLater(
          enrollment.completePublication('wrong', 'local', []),
          throwsStateError,
        );
        await expectLater(
          enrollment.completePublication('owner', 'local', []),
          throwsStateError,
        );
        expect(
          (await db.get('SELECT owner_id FROM proof_intent'))['owner_id'],
          'local',
        );
        final accepted = {
          'id': 'source',
          'owner_id': 'owner',
          'amount_minor': '1',
          'payload': jsonEncode({
            'amount_minor': '1',
            'expected_revision': 0,
            'kind': 'expense',
            'owner_id': 'owner',
            'version': 1,
          }),
        };
        await enrollment.completePublication('owner', 'local', [accepted]);
        expect(await ledger.expenseView('owner'), BigInt.one);
        await db.execute(
          "UPDATE proof_intent SET state='reconciled' WHERE id='source'",
        );
        await enrollment.completePublication('owner', 'local', [accepted]);
        expect(
          (await db.get('SELECT state FROM proof_intent'))['state'],
          'reconciled',
        );
        await ledger.expense(
          id: 'next',
          owner: 'owner',
          amount: '1',
          connected: true,
        );
        expect(
          (await db.get('SELECT count(*) AS n FROM proof_evidence'))['n'],
          4,
        );
      } finally {
        await db.close();
        await dir.delete(recursive: true);
      }
    },
  );
}
