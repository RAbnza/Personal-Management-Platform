import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:path_provider/path_provider.dart';
import 'package:salapiya/app.dart';
import 'package:salapiya/gallery/settings.dart';
import 'package:salapiya/local/finance_domain.dart';
import 'package:salapiya/local/local_profiles.dart';
import 'package:salapiya/local/local_runtime.dart';
import 'package:salapiya/local/local_store.dart';

import '../test/local_money_journey.dart';
import '../test/p6_capacity_journey.dart' show distribution;

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets(
    'P6 real native production UI and commands over the isolated 10,000-action encrypted fixture',
    (tester) async {
      final support = await getApplicationSupportDirectory();
      final fixture = Platform.isWindows
          ? const String.fromEnvironment('P6_CAPACITY_DIRECTORY')
          : '${support.path}/p6-native-capacity';
      final manifest = jsonDecode(
        await File('$fixture/manifest.json').readAsString(),
      ) as Map;
      expect(manifest['syntheticOnly'], isTrue);
      final dir = await Directory.systemTemp.createTemp(
        'salapiya-p6-native-capacity-',
      );
      for (final suffix in ['', '-wal']) {
        final file = File('$fixture/local.sqlite$suffix');
        if (await file.exists()) {
          await file.copy('${dir.path}/local.sqlite$suffix');
        }
      }
      final settings = GallerySettings();
      final profiles = LocalProfiles(
        dir,
        OsProfileVault(slot: 'salapiya.p6.capacity.${newLocalId()}'),
      );
      final runtime = LocalRuntime(profiles, settings);
      final open = Stopwatch()..start();
      final db = openLocalDatabase(
        '${dir.path}/local.sqlite',
        manifest['key'] as String,
      );
      await db.initialize();
      final store = LocalStore(db, manifest['owner'] as String);
      profiles.active = store;
      try {
        await store.migrate();
        await store.integrity();
        var snapshot = await store.snapshot();
        final openMs = open.elapsedMilliseconds;
        final wallet = manifest['wallet'] as String;
        final expected = BigInt.parse(manifest['expectedMinor'] as String);
        expect(snapshot.version, manifest['commands']);
        expect(snapshot.balance(wallet), expected);
        final activation = Stopwatch()..start();
        await runtime.activate(store);
        await tester.pumpWidget(
          SalapiyaApp(
            production: true,
            settings: settings,
            localRuntime: runtime,
          ),
        );
        await localSettle(tester);
        expect(tester.takeException(), isNull);
        final overviewMs = activation.elapsedMilliseconds;
        final saves = <int>[];
        for (var i = 0; i < 20; i++) {
          final sample = Stopwatch()..start();
          await store.commit(
            LocalCommand(
              id: newLocalId(),
              owner: store.owner,
              expectedVersion: snapshot.version + i,
              kind: 'income',
              values: {
                'name': 'P6 native capacity $i',
                'account': wallet,
                'amount': '0.01',
                'date': civilToday(),
                'category': 'category-income',
                'incomeClass': 'earned',
                'acknowledge': 'false',
              },
            ),
          );
          saves.add(sample.elapsedMicroseconds);
        }
        snapshot = await store.snapshot();
        expect(snapshot.balance(wallet), expected + BigInt.from(20));
        await runtime.session!.localFinance.reload();
        final navigation = <int>[];
        for (final name in ['money', 'debts', 'life', 'overview']) {
          final sample = Stopwatch()..start();
          await localTap(tester, find.byKey(ValueKey('nav-$name')));
          navigation.add(sample.elapsedMicroseconds);
          expect(tester.takeException(), isNull, reason: name);
        }
        final result = {
          'platform': Platform.operatingSystem,
          'os': Platform.operatingSystemVersion,
          'fixtureCommands': manifest['commands'],
          'encryptedOpenIntegrityAndSnapshotMs': openMs,
          'activationAndOverviewMs': overviewMs,
          'saveAtCapacity': distribution(saves),
          'navigationWithTestSettling': distribution(navigation),
          'rssBytes': ProcessInfo.currentRss,
          'maxRssBytes': ProcessInfo.maxRss,
          'imageCapture': false,
          'limits': 'Debug integration engine; copied synthetic encrypted fixture, warm OS caches, no signed installed cold start; navigation includes test settling.',
        };
        await File(
          '${support.path}/p6-capacity-${Platform.operatingSystem}.json',
        ).writeAsString(jsonEncode(result));
        binding.reportData = result;
        debugPrint('P6_NATIVE_CAPACITY ${jsonEncode(result)}');
      } finally {
        await tester.pumpWidget(const SizedBox.shrink());
        await localSettle(tester);
        await runtime.close();
        runtime.dispose();
        settings.dispose();
        await dir.delete(recursive: true);
      }
    },
    timeout: const Timeout(Duration(minutes: 15)),
  );
}
