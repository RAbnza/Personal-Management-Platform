import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/p0/proof_database.dart';

void main() {
  for (final mode in ['committed', 'uncommitted']) {
    test('killed Dart process recovers $mode WAL transaction', () async {
      final dir = await Directory.systemTemp.createTemp('salapiya-kill-');
      final path = '${dir.path}/proof.sqlite';
      final worker = await Process.start('dart', [
        'run',
        'tool/p0_crash_worker.dart',
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
            fail('Worker readiness timeout: ${String.fromCharCodes(errors)}');
          }
          await Future<void>.delayed(const Duration(milliseconds: 100));
        }
        // On Windows runInShell starts cmd, so terminate the process tree.
        if (Platform.isWindows) {
          final killed = await Process.run('taskkill', [
            '/PID',
            '${worker.pid}',
            '/T',
            '/F',
          ]);
          expect(killed.exitCode, 0);
        } else {
          worker.kill(ProcessSignal.sigkill);
        }
        await worker.exitCode;
        final db = openProofDatabase(path, 'synthetic-crash-key');
        try {
          await db.initialize();
          expect((await db.get('PRAGMA integrity_check')).values.single, 'ok');
          expect(
            (await db.get('SELECT count(*) AS n FROM proof_intent'))['n'],
            mode == 'committed' ? 1 : 0,
          );
          expect(
            (await db.get('SELECT count(*) AS n FROM proof_evidence'))['n'],
            mode == 'committed' ? 2 : 0,
          );
          expect(
            await db.getNextCrudTransaction(),
            mode == 'committed' ? isNotNull : isNull,
          );
        } finally {
          await db.close();
        }
      } finally {
        worker.kill();
        await dir.delete(recursive: true);
      }
    }, timeout: const Timeout(Duration(minutes: 2)));
  }
}
