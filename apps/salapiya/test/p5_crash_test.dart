import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/local/local_store.dart';

void main() {
  for (final authority in ['local', 'connected']) {
    for (final mode in ['committed', 'uncommitted']) {
      test(
        'P5 killed $authority process preserves $mode command, history, transport and protected draft atomically',
        () async {
          final dir = await Directory.systemTemp.createTemp(
                'salapiya-p5-crash-',
              ),
              path = '${dir.path}/local.sqlite';
          final worker = await Process.start('dart', [
                'run',
                'tool/p5_crash_worker.dart',
                path,
                authority,
                mode,
              ], runInShell: Platform.isWindows),
              errors = <int>[];
          worker.stderr.listen(errors.addAll);
          worker.stdout.drain<void>();
          try {
            final deadline = DateTime.now().add(const Duration(seconds: 60));
            while (!await File('$path.ready').exists()) {
              if (DateTime.now().isAfter(deadline)) {
                fail(
                  'P5 process did not reach the durable boundary: ${utf8.decode(errors, allowMalformed: true)}',
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
            final db = openLocalDatabase(path, 'synthetic-p5-crash-key');
            await db.initialize();
            try {
              final store = LocalStore(
                db,
                '50000000-0000-4000-8000-000000000001',
              );
              await store.migrate();
              await store.integrity();
              final committed = mode == 'committed';
              expect((await store.lifeRecords()).length, committed ? 1 : 0);
              expect(
                await store.draft('life:new-task'),
                committed ? isNull : isNotNull,
              );
              expect((await store.snapshot()).version, 0);
              final intents = await store.lifeIntents(),
                  transport = await db.getNextCrudTransaction();
              if (authority == 'connected' && committed) {
                expect(intents.length, 1);
                expect(transport!.crud.single.table, 'p2_transport');
                expect(transport.crud.single.id, intents.single['id']);
              } else {
                expect(intents, isEmpty);
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
            try {
              await dir.delete(recursive: true);
            } on PathNotFoundException {
              // SQLite may retire WAL/SHM while Windows enumerates this isolated
              // directory. Ignore only a cleanup that actually removed it.
              if (await dir.exists()) rethrow;
            }
          }
        },
        timeout: const Timeout(Duration(minutes: 2)),
      );
    }
  }
}
