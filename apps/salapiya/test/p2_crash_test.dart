import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/local/local_store.dart';

void main() {
  for (final mode in ['committed', 'uncommitted']) {
    test(
      'P2 killed process preserves $mode intent, SDK queue and draft as one transaction',
      () async {
        final dir = await Directory.systemTemp.createTemp('salapiya-p2-kill-'),
            path = '${dir.path}/local.sqlite';
        final worker = await Process.start('dart', [
          'run',
          'tool/p2_crash_worker.dart',
          path,
          mode,
        ], runInShell: Platform.isWindows);
        final errors = <int>[];
        worker.stderr.listen(errors.addAll);
        worker.stdout.drain<void>();
        try {
          final deadline = DateTime.now().add(const Duration(seconds: 60));
          while (!await File('$path.ready').exists()) {
            if (DateTime.now().isAfter(deadline)) {
              fail(
                'P2 worker did not reach the transaction boundary: ${utf8.decode(errors, allowMalformed: true)}',
              );
            }
            await Future<void>.delayed(const Duration(milliseconds: 100));
          }
          if (Platform.isWindows) {
            expect(
              (await Process.run('taskkill', [
                '/PID',
                '${worker.pid}',
                '/T',
                '/F',
              ])).exitCode,
              0,
            );
          } else {
            worker.kill(ProcessSignal.sigkill);
          }
          await worker.exitCode;
          final db = openLocalDatabase(path, 'synthetic-p2-crash-key');
          try {
            await db.initialize();
            final store = LocalStore(
              db,
              '00000000-0000-4000-8000-000000000001',
            );
            await store.migrate();
            await store.integrity();
            final committed = mode == 'committed';
            final snapshot = await store.snapshot();
            expect(
              snapshot.balance('00000000-0000-4000-8000-000000000002'),
              BigInt.from(committed ? 106450 : 125000),
            );
            expect(
              await store.hasReceipt('00000000-0000-4000-8000-000000000003'),
              committed,
            );
            expect(
              await store.draft('expense:'),
              committed ? isNull : isNotNull,
            );
            final intent = await db.getAll('SELECT * FROM connected_intent');
            expect(intent.length, committed ? 1 : 0);
            final transport = await db.getNextCrudTransaction();
            if (committed) {
              expect(intent.single['state'], 'pending');
              expect(transport!.crud.single.table, 'p2_transport');
              expect(transport.crud.single.id, intent.single['id']);
              expect(
                transport.crud.single.opData!['payload'],
                intent.single['envelope'],
              );
              expect(
                (jsonDecode(intent.single['envelope'] as String)
                    as Map)['payload'],
                intent.single['payload'],
              );
            } else {
              expect(transport, isNull);
            }
            expect(
              (await db.get('PRAGMA integrity_check')).values.single,
              'ok',
            );
          } finally {
            await db.close();
          }
        } finally {
          worker.kill();
          await dir.delete(recursive: true);
        }
      },
      timeout: const Timeout(Duration(minutes: 2)),
    );
  }
}
