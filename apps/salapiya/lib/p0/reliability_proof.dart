import 'dart:async';
import 'dart:io';

import 'package:powersync/powersync.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'command_connector.dart';
import 'connected_recovery.dart';
import 'exact_money.dart';
import 'local_ledger.dart';
import 'portable_recovery.dart';
import 'proof_database.dart';

// Controlled HTTP service failure, not a destructive hosted-provider outage.
Future<Map<String, Object>> runReliabilityProof(
  PowerSyncDatabase original,
  SupabaseClient client,
  String endpoint,
) async {
  final owner = (await client.auth.getUser()).user!.id;
  final connector = ProofConnector.supabase(
    client: client,
    owner: owner,
    endpoint: endpoint,
  );
  await original.disconnect();
  while (await original.getNextCrudTransaction() != null) {
    await connector.uploadData(original);
  }
  final id = uuid.v4();
  await LocalLedger(original)
      .expense(id: id, owner: owner, amount: '11', connected: true);
  final archiveKey = await PortableRecovery.newRecoverySecret();
  final archive = await PortableRecovery.seal(
    await PortableRecovery.capture(original, owner, {
      'proof_file': [80, 48],
    }),
    archiveKey,
  );
  final directory = await Directory.systemTemp.createTemp(
    'salapiya-reliability-',
  );
  final path = '${directory.path}/restored.sqlite';
  final freshKey = await PortableRecovery.newRecoverySecret();
  var restored = openProofDatabase(path, freshKey);
  final outage = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
  var failures = 0;
  final requests = outage.listen((request) async {
    failures++;
    request.response.statusCode = HttpStatus.serviceUnavailable;
    await request.response.close();
  });
  try {
    await restored.initialize();
    await LocalLedger(restored).migrate();
    final files = await PortableRecovery.restore(
      restored,
      await PortableRecovery.unseal(archive, archiveKey),
      owner,
    );
    if (files['proof_file']?.length != 2 ||
        await restored.getNextCrudTransaction() != null) {
      throw StateError('Restore was not held');
    }
    final review = ConnectedRecovery(restored, client);
    if (await review.review(id, owner) != 'missing') {
      throw StateError('Unexpected prior receipt');
    }
    await review.review(id, owner, explicitlyResumeMissing: true);
    final failing = ProofConnector(
      owner: owner,
      credentials: connector.fetchCredentials,
      submit: (_, _) async {
        final http = HttpClient();
        try {
          final request = await http.postUrl(
            Uri.parse('http://127.0.0.1:${outage.port}/upload'),
          );
          final response = await request.close();
          await response.drain<void>();
          if (response.statusCode != 503) {
            throw StateError('Fault endpoint failed');
          }
          throw const HttpException('Controlled service unavailable');
        } finally {
          http.close(force: true);
        }
      },
    );
    try {
      await failing.uploadData(restored);
      throw StateError('Failed upload acknowledged');
    } on HttpException {
      /* Keep the actual durable SDK queue. */
    }
    if (failures != 1 || await restored.getNextCrudTransaction() == null) {
      throw StateError('Outage lost pending work');
    }
    await restored.close();
    restored = openProofDatabase(path, freshKey);
    await restored.initialize();
    if (await restored.getNextCrudTransaction() == null) {
      throw StateError('Restart lost pending work');
    }
    final watch = Stopwatch()..start();
    await restored.connect(connector: connector);
    await restored.waitForFirstSync().timeout(const Duration(seconds: 60));
    await restored
        .watch('SELECT id FROM p0_accepted WHERE id=?', parameters: [id])
        .firstWhere((rows) => rows.length == 1)
        .timeout(const Duration(seconds: 60));
    await LocalLedger(restored).reconcile(owner);
    // Original archive-accepted intents activate only after receipt + real download.
    for (final row in await restored.getAll(
      "SELECT id FROM proof_intent WHERE state='review'",
    )) {
      final recovery = ConnectedRecovery(restored, client);
      final outcome = await recovery.review(row['id'] as String, owner);
      if (outcome == 'accepted') {
        await recovery.acceptDownloaded(row['id'] as String, owner);
      }
    }
    final remote = await client.from('p0_accepted').select('id,amount_minor');
    final downloaded = await restored.getAll(
      'SELECT id,owner_id,amount_minor FROM p0_accepted',
    );
    BigInt sum(Iterable<Map<String, dynamic>> rows) => rows.fold(
      BigInt.zero,
      (total, row) => total + parseMinor(row['amount_minor'] as String),
    );
    if (remote.length != downloaded.length ||
        sum(remote) != sum(downloaded) ||
        downloaded.any((r) => r['owner_id'] != owner)) {
      throw StateError('Full resync mismatch');
    }
    if (await LocalLedger(restored).expenseView(owner) != sum(remote)) {
      throw StateError('Restore double counted');
    }
    // Old device's original ID must return the same receipt after restored retry.
    await connector.uploadData(original);
    if ((await client.from('p0_accepted').select('id').eq('id', id)).length !=
        1) {
      throw StateError('Duplicate restored command');
    }
    return {
      'controlled503Requests': failures,
      'archiveBytes': archive.length,
      'freshReplicaRows': remote.length,
      'initialSyncAndRecoveryMs': watch.elapsedMilliseconds,
      'currentIdentityReceiptAndDownloadActivation': true,
      'originalDeviceReplaySingleEffect': true,
    };
  } finally {
    await restored.close();
    await requests.cancel();
    await outage.close(force: true);
    await directory.delete(recursive: true);
  }
}
