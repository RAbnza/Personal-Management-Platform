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
      '$proofCallback/other?code=x',
      '$proofCallback#access_token=x',
      proofCallback,
    ]) {
      expect(isProofCallback(Uri.parse(uri)), isFalse);
    }
  });
}
