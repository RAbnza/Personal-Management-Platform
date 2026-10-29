import 'dart:convert';
import 'dart:io';

import 'package:salapiya/local/local_store.dart';

Future<void> main() async {
  final dir = await Directory.systemTemp.createTemp('salapiya-p6-index-proof-');
  await File('build/p6-native-capacity/local.sqlite')
      .copy('${dir.path}/proof.sqlite');
  final db = openLocalDatabase('${dir.path}/proof.sqlite', 'synthetic-p1-key');
  await db.initialize();
  try {
    final id = (await db.get(
      'SELECT id FROM local_command ORDER BY sequence_no DESC LIMIT 1',
    ))['id'];
    const query =
        'SELECT p.effective_date FROM local_posting p JOIN local_revision r ON r.id=p.revision_id WHERE r.command_id=? GROUP BY p.effective_date HAVING SUM(p.amount_minor)<>0';
    final before = await db.getAll('EXPLAIN QUERY PLAN $query', [id]);
    final clock = Stopwatch()..start();
    for (var i = 0; i < 25; i++) {
      if ((await db.getAll(query, [id])).isNotEmpty) {
        throw StateError('Unbalanced synthetic evidence');
      }
    }
    final beforeUs = clock.elapsedMicroseconds;
    await db.execute(
      'CREATE INDEX IF NOT EXISTS local_revision_command ON local_revision(command_id)',
    );
    await db.execute(
      'CREATE INDEX IF NOT EXISTS local_posting_revision ON local_posting(revision_id,effective_date)',
    );
    // A distinct SQL text forces a fresh EXPLAIN statement after schema change.
    final after = await db.getAll('EXPLAIN QUERY PLAN $query /* indexed */', [
      id,
    ]);
    final indexes = await db.getAll(
      "SELECT name FROM sqlite_master WHERE type='index' AND name IN ('local_revision_command','local_posting_revision')",
    );
    await db.execute('ANALYZE local_revision');
    await db.execute('ANALYZE local_posting');
    final analyzed = await db.getAll(
      'EXPLAIN QUERY PLAN $query /* analyzed */',
      [id],
    );
    final forced = await db.getAll(
      'EXPLAIN QUERY PLAN SELECT p.effective_date FROM local_revision r INDEXED BY local_revision_command CROSS JOIN local_posting p INDEXED BY local_posting_revision ON p.revision_id=r.id WHERE r.command_id=? GROUP BY p.effective_date HAVING SUM(p.amount_minor)<>0',
      [id],
    );
    clock.reset();
    for (var i = 0; i < 25; i++) {
      if ((await db.getAll(query, [id])).isNotEmpty) {
        throw StateError('Unbalanced synthetic evidence');
      }
    }
    final result = {
      'beforePlan': before.map((r) => r['detail']).toList(),
      'afterPlan': after.map((r) => r['detail']).toList(),
      'analyzedPlan': analyzed.map((r) => r['detail']).toList(),
      'orderedPlan': forced.map((r) => r['detail']).toList(),
      'indexes': indexes.map((r) => r['name']).toList(),
      'samples': 25,
      'beforeTotalMs': beforeUs / 1000,
      'afterTotalMs': clock.elapsedMicroseconds / 1000,
      'scope': 'same exact seal query; isolated encrypted10k synthetic fixture; no monetary condition changed',
    };
    await File('build/p6-seal-query-plan.json')
        .writeAsString(jsonEncode(result));
    stdout.writeln(jsonEncode(result));
  } finally {
    await db.close();
    await dir.delete(recursive: true);
  }
}
