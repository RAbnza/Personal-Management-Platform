// Describe an already copied, isolated synthetic encrypted DB for native probes.
import 'dart:convert';
import 'dart:io';

import 'package:salapiya/local/local_store.dart';

Future<void> main(List<String> args) async {
  if (args.length != 1) {
    throw ArgumentError('Select the copied P6 fixture directory');
  }
  final directory = Directory(args.single).absolute;
  if (!directory.path
      .replaceAll('\\', '/')
      .endsWith('/build/p6-native-capacity')) {
    throw ArgumentError(
      'Only the ignored P6 synthetic fixture destination is permitted',
    );
  }
  final db = openLocalDatabase(
    '${directory.path}/local.sqlite',
    'synthetic-p1-key',
  );
  await db.initialize();
  try {
    final profile = await db.get('SELECT id,revision FROM local_profile');
    final store = LocalStore(db, profile['id'] as String);
    await store.integrity();
    final snapshot = await store.snapshot();
    final wallet = snapshot.accounts.singleWhere(
      (a) => a.name == 'P6 multi-year capacity wallet',
    );
    if (snapshot.version != 10046) {
      throw StateError('Expected completed 10,000-action synthetic fixture');
    }
    await db.execute('PRAGMA wal_checkpoint(TRUNCATE)');
    await File('${directory.path}/manifest.json').writeAsString(
      jsonEncode({
        'syntheticOnly': true,
        'key': 'synthetic-p1-key',
        'owner': store.owner,
        'wallet': wallet.id,
        'expectedMinor': snapshot.balance(wallet.id).toString(),
        'commands': snapshot.version,
      }),
    );
    stdout.writeln('Verified isolated 10,000-action native capacity fixture.');
  } finally {
    await db.close();
  }
}
