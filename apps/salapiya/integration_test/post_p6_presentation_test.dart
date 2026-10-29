import 'package:flutter/services.dart';
import 'package:flutter/material.dart';
import 'package:salapiya/app.dart';
import 'package:salapiya/gallery/settings.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import '../test/post_p6_presentation_test.dart' show polishFormJourney;
import '../test/android_overview_polish_test.dart' show overviewPolishJourney;

import 'dart:io';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets(
    'native reviewed fee, exact effects, evidence and local success',
    polishFormJourney,
  );
  testWidgets('native Overview and creation remain available', (tester) async {
    await overviewPolishJourney(tester, android: Platform.isAndroid);
  });
  if (Platform.isWindows) {
    testWidgets('native caption retains Windows frame behavior in both themes', (
      tester,
    ) async {
      const script = String.fromEnvironment('SALAPIYA_CHROME_PROBE');
      expect(
        script,
        isNotEmpty,
        reason: 'Provide the repository caption probe path.',
      );
      final settings = GallerySettings();
      try {
        for (final mode in [ThemeMode.light, ThemeMode.dark]) {
          settings.change(() => settings.themeMode = mode);
          await tester.pumpWidget(SalapiyaApp(settings: settings));
          await tester.pumpAndSettle();
          // Caption color attributes are setters, not readable DWM attributes.
          // Require successful native application of the same semantic colors.
          final dark = mode == ThemeMode.dark;
          final applied = await tester.runAsync(
            () =>
                const MethodChannel('dev.salapiya/window_chrome')
                    .invokeMethod<bool>('theme', [
                      dark,
                      dark ? 0x14151A : 0xF3F4F6,
                      dark ? 0xF3F2F0 : 0x222126,
                      dark ? 0x3B3C41 : 0xE3E4E9,
                    ]),
          );
          expect(applied, true);
          final result = await tester.runAsync(
            () => Process.run('powershell.exe', [
              '-NoProfile',
              '-ExecutionPolicy',
              'Bypass',
              '-File',
              script,
              '-TargetProcessId',
              '$pid',
              '-Theme',
              mode.name,
            ]),
          );
          expect(
            result!.exitCode,
            0,
            reason: '${result.stdout} ${result.stderr}',
          );
          // Text-only native state evidence; no capture API.
          debugPrint(result.stdout.toString());
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
        }
      } finally {
        await tester.pumpWidget(const SizedBox.shrink());
        settings.dispose();
      }
    });
  }
}
