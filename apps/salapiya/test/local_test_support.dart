import 'dart:io';

import 'package:salapiya/local/finance_domain.dart';
import 'package:salapiya/local/local_store.dart';
import 'package:salapiya/local/local_profiles.dart';

class MemoryProfileVault implements ProfileVault {
  String? value;
  bool fail = false;
  int writes = 0;
  int? failAt;
  @override
  Future<String?> read() async => value;
  @override
  Future<void> write(String value) async {
    writes++;
    if (fail || writes == failAt) {
      throw const FileSystemException('Injected protected storage failure');
    }
    this.value = value;
  }
}

class LocalFixture {
  LocalFixture(this.directory, this.store);
  final Directory directory;
  final LocalStore store;
  static Future<LocalFixture> open() async {
    final directory = await Directory.systemTemp.createTemp('salapiya-p1-');
    final db = openLocalDatabase(
      '${directory.path}/local.sqlite',
      'synthetic-p1-key',
    );
    await db.initialize();
    final store = LocalStore(db, newLocalId());
    await store.migrate();
    await store.initializeProfile('Synthetic private owner', {});
    return LocalFixture(directory, store);
  }

  Future<LocalCommand> command(
    String kind,
    Map<String, String> values, {
    String? id,
    int? version,
  }) async => LocalCommand(
    id: id ?? newLocalId(),
    owner: store.owner,
    expectedVersion: version ?? (await store.snapshot()).version,
    kind: kind,
    values: {'date': '2026-10-21', 'acknowledge': 'false', ...values},
  );
  Future<String> post(String kind, Map<String, String> values) async {
    final c = await command(kind, values);
    await store.commit(c);
    return c.id;
  }

  Future<String> account(
    String name, [
    String opening = '1250.00',
    String cutoff = '2026-10-14',
  ]) => post('account', {
    'name': name,
    'kind': 'Cash',
    'amount': opening,
    'cutoff': cutoff,
  });
  Future<void> close() async {
    await store.close();
    await directory.delete(recursive: true);
  }
}
