import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:path_provider/path_provider.dart';
import 'package:salapiya/gallery/settings.dart';
import 'package:salapiya/life/life_controller.dart';
import 'package:salapiya/local/local_profiles.dart';
import 'package:salapiya/local/local_runtime.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets(
    'P5 Android encrypted source and OS alarm survive a real reboot boundary',
    (tester) async {
      expect(Platform.isAndroid, isTrue);
      const stage = String.fromEnvironment('P5_REBOOT_STAGE');
      expect(['seed', 'verify'], contains(stage));
      final support = await getApplicationSupportDirectory(),
          settings = GallerySettings();
      final runtime = LocalRuntime(
        LocalProfiles(
          Directory('${support.path}/p5-reboot-verification'),
          const OsProfileVault(slot: 'salapiya.p5.reboot.verification'),
        ),
        settings,
      );
      try {
        await runtime.reopen();
        if (stage == 'seed' && runtime.session == null) {
          await runtime.create(
            'P5 isolated reboot verification',
            ThemeMode.light,
          );
        }
        expect(
          runtime.session,
          isNotNull,
          reason: 'Reboot must preserve the protected source; never recreate missing data during verification.',
        );
        final c = runtime.session!.life as DurableLifeController, d = c.device!;
        expect(d.ready, isTrue, reason: d.status);
        expect(
          d.allowed,
          isTrue,
          reason: 'Reuse the notification permission already granted for this emulator test.',
        );
        if (stage == 'seed') {
          final future = DateTime.now().toUtc().add(const Duration(hours: 2)),
              text = future.toIso8601String();
          await c.saveEvent({
            'title': 'P5 synthetic reboot source',
            'date': text.substring(0, 10),
            'time': text.substring(11, 16),
            'timezone': 'UTC',
            'reason': 'Bounded native reboot verification',
          }, old: c.events.firstOrNull);
          await d.configure({'enabled': true, 'quiet': false});
        }
        expect(c.events, hasLength(1));
        final rows = await c.store.db.getAll(
          "SELECT * FROM device_reminder WHERE state='scheduled'",
        );
        expect(rows, hasLength(1));
        final osId = rows.single['os_id'] as int;
        expect(await d.device.pending(), contains(osId));
        expect((await c.store.snapshot()).version, 0);
        debugPrint(
          'P5_REBOOT_$stage: retained encrypted source and OS schedule id=$osId; source version=${c.events.single.version}; financial revision=0.',
        );
        if (stage == 'verify') {
          await d.configure({'enabled': false});
          expect(await d.device.pending(), isNot(contains(osId)));
        }
      } finally {
        await runtime.close();
        runtime.dispose();
        settings.dispose();
      }
    },
  );
}
