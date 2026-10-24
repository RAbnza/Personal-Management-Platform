import 'dart:async';
import 'dart:io';

import 'package:salapiya/local/finance_domain.dart';
import 'package:salapiya/local/local_store.dart';

Future<void> main(List<String> args) async {
  final db = openLocalDatabase(args[0], 'synthetic-p1-crash-key');
  await db.initialize();
  final store = LocalStore(db, '00000000-0000-4000-8000-000000000001');
  await store.migrate();
  await store.initializeProfile('Crash fixture', {});
  final account = LocalCommand(
    id: '00000000-0000-4000-8000-000000000002',
    owner: store.owner,
    expectedVersion: 0,
    kind: 'account',
    values: {
      'name': 'Wallet',
      'kind': 'Cash',
      'amount': '1250.00',
      'cutoff': '2026-10-14',
    },
  );
  await store.commit(account);
  final expense = LocalCommand(
    id: '00000000-0000-4000-8000-000000000003',
    owner: store.owner,
    expectedVersion: 1,
    kind: 'expense',
    values: {
      'name': 'Durable expense',
      'account': account.id,
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
    await store.commit(expense, afterRevision: ready);
  } else {
    await store.commit(expense);
    await ready();
  }
}
