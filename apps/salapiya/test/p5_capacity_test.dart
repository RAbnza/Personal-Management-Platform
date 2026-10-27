import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/life/life_domain.dart';
import 'package:salapiya/local/finance_domain.dart' show newLocalId;
import 'package:salapiya/local/local_store.dart';

import 'local_test_support.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('bounded private Life storage and replay measurements retain all source identities', () async {
    final f = await LocalFixture.open();
    try {
      final write = Stopwatch()..start();
      var transportBytes = 0;
      for (var i = 0; i < 250; i++) {
        final c = LifeCommand(
          owner: f.store.owner,
          recordId: newLocalId(),
          type: LifeType.task,
          expectedVersion: 0,
          fields: {'title': 'Synthetic capacity task $i'},
          reason: 'Bounded storage measurement',
        );
        transportBytes += utf8.encode(c.payload).length;
        await f.store.commitLife(c);
      }
      write.stop();
      final samples = <int>[];
      for (var i = 0; i < 10; i++) {
        final clock = Stopwatch()..start();
        final records = await f.store.lifeRecords();
        expect(records.length, 250);
        expect(records.keys.toSet().length, 250);
        samples.add(clock.elapsedMicroseconds);
      }
      samples.sort();
      final archive = await f.store.db.readTransaction(
        f.store.captureLifeArchive,
      );
      final sqlite = await File('${f.directory.path}/local.sqlite').length();
      // Aggregate synthetic measurements only; these are host regression figures,
      // not physical-device or release-scale performance certification.
      // ignore: avoid_print
      print(
        'P5_CAPACITY records=250 writesMs=${write.elapsedMilliseconds} '
        'readMedianUs=${samples[5]} readP95Us=${samples[9]} '
        'payloadBytes=$transportBytes lifeArchiveBytes=${utf8.encode(jsonEncode(archive)).length} '
        'sqliteMainBytes=$sqlite',
      );
      expect(archive['attachmentByteObjects'], 0);
      expect((await f.store.snapshot()).version, 0);
    } finally {
      await f.close();
    }
  });
}
