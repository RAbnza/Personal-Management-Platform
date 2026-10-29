import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:salapiya/p0/local_ledger.dart';
import 'package:salapiya/p0/portable_recovery.dart';
import 'package:salapiya/p0/proof_database.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  test(
    'restore Windows-produced synthetic archive on a fresh native installation',
    () async {
      const encoded = String.fromEnvironment('P0_TRANSFER_ARCHIVE');
      const secret = String.fromEnvironment('P0_TRANSFER_SECRET');
      expect(
        encoded,
        isNotEmpty,
        reason: 'Run tool/p0_make_transfer.dart and supply its ignored dart-define file',
      );
      final dir = await Directory.systemTemp.createTemp('p0-transfer-target-');
      final db = openProofDatabase(
        '${dir.path}/target.sqlite',
        await PortableRecovery.newRecoverySecret(),
      );
      try {
        await db.initialize();
        await LocalLedger(db).migrate();
        final bundle = await PortableRecovery.unseal(
          base64Decode(encoded),
          secret,
        );
        final files = await PortableRecovery.restore(
          db,
          bundle,
          'portable-owner',
        );
        expect(
          await LocalLedger(db).expenseView('portable-owner'),
          BigInt.from(500050),
        );
        expect(utf8.decode(files['receipt']!), 'synthetic-portable-file');
        expect(
          (await db.get(
            "SELECT state FROM proof_intent WHERE id='portable-pending'",
          ))['state'],
          'review',
        );
        expect(await db.getNextCrudTransaction(), isNull);
      } finally {
        await db.close();
        await dir.delete(recursive: true);
      }
    },
  );
}
