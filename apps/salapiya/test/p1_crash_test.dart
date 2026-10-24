import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/local/local_store.dart';

void main() {
  for (final mode in ['committed', 'uncommitted']) {
    test(
      'P1 killed process recovers $mode financial action and draft atomically',
      () async {
        final dir = await Directory.systemTemp.createTemp('salapiya-p1-kill-');
        final path = '${dir.path}/local.sqlite';
        final worker = await Process.start('dart', [
          'run',
          'tool/p1_crash_worker.dart',
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
                'Worker did not become ready: ${String.fromCharCodes(errors)}',
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
          final db = openLocalDatabase(path, 'synthetic-p1-crash-key');
          try {
            await db.initialize();
            final store = LocalStore(
              db,
              '00000000-0000-4000-8000-000000000001',
            );
            await store.migrate();
            await store.integrity();
            final snapshot = await store.snapshot();
            final committed = mode == 'committed';
            expect(
              snapshot.balance('00000000-0000-4000-8000-000000000002'),
              BigInt.from(committed ? 106450 : 125000),
            );
            expect(snapshot.version, committed ? 2 : 1);
            expect(
              await store.hasReceipt('00000000-0000-4000-8000-000000000003'),
              committed,
            );
            expect(
              await store.draft('expense:'),
              committed ? isNull : isNotNull,
            );
            expect(
              (await db.get('PRAGMA integrity_check')).values.single,
              'ok',
            );
            expect(await db.getNextCrudTransaction(), isNull);
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
