import 'dart:async';
import 'dart:io';

import 'package:salapiya/local/finance_domain.dart';
import 'package:salapiya/local/local_store.dart';

// Synthetic local crash fixture only; no authenticated cloud writes.
Future<void> main(List<String> args) async {
  final db = openLocalDatabase(args[0], 'synthetic-p2-crash-key');
  await db.initialize();
  final store = LocalStore(db, '00000000-0000-4000-8000-000000000001');
  await store.migrate();
  await store.initializeProfile('P2 crash fixture', {});
  const account = '00000000-0000-4000-8000-000000000002';
  await store.commit(
    LocalCommand(
      id: account,
      owner: store.owner,
      expectedVersion: 0,
      kind: 'account',
      values: {
        'name': 'Wallet',
        'kind': 'Cash',
        'amount': '1250.00',
        'cutoff': '2026-10-14',
      },
    ),
  );
  await store.stageConnection(
    '00000000-0000-4000-8000-000000000004',
    'synthetic@example.test',
    newLocalId(),
  );
  await db.execute("UPDATE connected_profile SET phase='connected'");
  final expense = LocalCommand(
    id: '00000000-0000-4000-8000-000000000003',
    owner: store.owner,
    expectedVersion: (await store.snapshot()).version,
    kind: 'expense',
    values: {
      'name': 'P2 durable intent',
      'account': account,
      'amount': '185.50',
      'date': '2026-10-21',
      'category': 'category-food',
    },
  );
  await store.saveDraft('expense:', expense.id, expense.values);
  Future<void> ready() async {
    await File('${args[0]}.ready').writeAsString('ready', flush: true);
    await Completer<void>().future;
  }

  if (args[1] == 'uncommitted') {
    await db.writeTransaction((tx) async {
      await store.queueConnected(tx, expense);
      await ready(); // Actual intent + SDK transport + draft delete, before COMMIT.
    });
  } else {
    await store.commit(expense);
    await ready();
  }
}
