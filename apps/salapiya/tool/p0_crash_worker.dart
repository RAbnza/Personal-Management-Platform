import 'dart:async';
import 'dart:io';

import 'package:salapiya/p0/local_ledger.dart';
import 'package:salapiya/p0/proof_database.dart';

Future<void> main(List<String> args) async {
  final db = openProofDatabase(args[0], 'synthetic-crash-key');
  await db.initialize();
  final ledger = LocalLedger(db);
  await ledger.migrate();
  if (args[1] == 'committed') {
    await ledger.expense(
      id: 'crash',
      owner: 'a',
      amount: '500050',
      connected: true,
    );
    await File('${args[0]}.ready').writeAsString('ready', flush: true);
    await Completer<void>().future;
  } else {
    await db.writeTransaction((tx) async {
      await tx.execute(
        "INSERT INTO proof_intent VALUES('crash','a','{}',1,'pending',NULL)",
      );
      await File('${args[0]}.ready').writeAsString('ready', flush: true);
      await Completer<void>().future;
    });
  }
}
