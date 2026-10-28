import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/local/local_profiles.dart';
import 'package:salapiya/local/local_store.dart';
import 'package:salapiya/p0/portable_recovery.dart';

import '../test/local_test_support.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('P6 independently keyed full-scale optimized archive restore', () async {
    final manifest = jsonDecode(
      await File('build/p6-native-capacity/manifest.json').readAsString(),
    ) as Map;
    final source = openLocalDatabase(
      'build/p6-native-capacity/local.sqlite',
      manifest['key'] as String,
    );
    await source.initialize();
    final dir = await Directory.systemTemp.createTemp(
      'salapiya-p6-restore-scale-',
    );
    final profiles = LocalProfiles(dir, MemoryProfileVault());
    try {
      final store = LocalStore(source, manifest['owner'] as String);
      final backup = Stopwatch()..start();
      final before = await LocalBackup.capture(store);
      final secret = await PortableRecovery.newRecoverySecret();
      final bytes = await LocalBackup.seal(before, secret);
      final backupMs = backup.elapsedMilliseconds;
      final clock = Stopwatch()..start();
      final restored = await profiles.restore(
        await LocalBackup.unseal(bytes, secret),
      );
      final restoreMs = clock.elapsedMilliseconds;
      final after = await LocalBackup.capture(restored);
      expect(after['commands'], before['commands']);
      expect(after['revision'], before['revision']);
      expect(after['life'], before['life']);
      expect(
        (await restored.snapshot()).balance(manifest['wallet'] as String),
        BigInt.parse(manifest['expectedMinor'] as String),
      );
      final result = {
        'commands': manifest['commands'],
        'backupBytes': bytes.length,
        'backupMs': backupMs,
        'restoreMs': restoreMs,
        'sameOriginalCommandsAndLife': true,
        'newIndependentKey': true,
        'maxRssBytes': ProcessInfo.maxRss,
        'environment':
            'Windows test engine; synthetic-only fixture, no hosted upload',
      };
      await File('build/p6-restore-capacity.json')
          .writeAsString(jsonEncode(result));
      // ignore: avoid_print
      print('P6_RESTORE_CAPACITY ${jsonEncode(result)}');
    } finally {
      await profiles.close();
      await source.close();
      await dir.delete(recursive: true);
    }
  }, timeout: const Timeout(Duration(minutes: 30)));
}
