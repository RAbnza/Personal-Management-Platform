import 'dart:convert';
import 'dart:io';

import 'package:salapiya/p0/local_ledger.dart';
import 'package:salapiya/p0/portable_recovery.dart';
import 'package:salapiya/p0/proof_database.dart';

// Only synthetic fixture material. The output is ignored; never use real records.
Future<void> main() async {
  final dir = await Directory.systemTemp.createTemp('p0-transfer-source-');
  final db = openProofDatabase(
    '${dir.path}/source.sqlite',
    await PortableRecovery.newRecoverySecret(),
  );
  try {
    await db.initialize();
    await LocalLedger(db).migrate();
    await LocalLedger(
      db,
    ).expense(id: 'portable-local', owner: 'portable-owner', amount: '500050');
    await LocalLedger(db).expense(
      id: 'portable-pending',
      owner: 'portable-owner',
      amount: '1',
      connected: true,
    );
    final bundle = await PortableRecovery.capture(db, 'portable-owner', {
      'receipt': utf8.encode('synthetic-portable-file'),
    });
    final secret = await PortableRecovery.newRecoverySecret();
    final archive = await PortableRecovery.seal(bundle, secret);
    final output = File('build/p0-transfer.json');
    await output.parent.create(recursive: true);
    await output.writeAsString(
      jsonEncode({
        'P0_TRANSFER_ARCHIVE': base64Encode(archive),
        'P0_TRANSFER_SECRET': secret,
      }),
      flush: true,
    );
  } finally {
    await db.close();
    await dir.delete(recursive: true);
  }
}
