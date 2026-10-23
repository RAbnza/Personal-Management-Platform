import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:salapiya/app.dart';
import 'package:salapiya/gallery/settings.dart';

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets('native constrained-surface layout matrix', (tester) async {
    final settings = GallerySettings();
    final key = GlobalKey();
    final rows = <Map<String, dynamic>>[];
    final shots = <String, String>{};
    Future<void> capture(String name) async {
      await tester.pumpAndSettle();
      final image =
          await (key.currentContext!.findRenderObject()!
                  as RenderRepaintBoundary)
              .toImage(pixelRatio: 1);
      final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
      shots['${Platform.operatingSystem}-$name'] = base64Encode(
        bytes!.buffer.asUint8List(),
      );
      image.dispose();
    }

    final sizes = Platform.isWindows
        ? [
            const Size(640, 480),
            const Size(900, 600),
            const Size(1280, 800),
            const Size(1600, 900),
          ]
        : [
            const Size(320, 568),
            const Size(360, 640),
            const Size(412, 800),
            const Size(800, 360),
          ];
    await tester.pumpWidget(
      RepaintBoundary(
        key: key,
        child: SalapiyaApp(gallery: true, settings: settings),
      ),
    );
    for (final size in sizes) {
      await binding.setSurfaceSize(size);
      for (final scale in [1.0, 2.0]) {
        for (final theme in [ThemeMode.light, ThemeMode.dark]) {
          for (final section in GallerySection.values) {
            settings.change(() {
              settings.textScale = scale;
              settings.themeMode = theme;
              settings.section = section;
              settings.compact = true;
            });
            await tester.pumpAndSettle();
            expect(
              tester.takeException(),
              isNull,
              reason: '$size $scale $theme $section',
            );
          }
        }
        rows.add({
          'width': size.width,
          'height': size.height,
          'textScale': scale,
          'themes': 2,
          'sections': 8,
          'result': 'pass',
        });
      }
      settings.change(() {
        settings.section = GallerySection.finance;
        settings.textScale = 2;
        settings.themeMode = ThemeMode.dark;
      });
      await tester.pumpAndSettle();
      if (size == sizes.first || size == sizes.last) {
        await Scrollable.ensureVisible(
          tester.element(find.text('Liquid money · actual')),
          alignment: .1,
        );
        await tester.pumpAndSettle();
        await capture(
          'constrained-${size.width.toInt()}x${size.height.toInt()}-money-200pct',
        );
      }
    }
    await binding.setSurfaceSize(null);
    settings.change(() {
      settings.section = GallerySection.navigation;
      settings.textScale = 1;
      settings.themeMode = ThemeMode.light;
      settings.compact = false;
    });
    await tester.pumpAndSettle();
    for (final concept in ['Android A · anchored', 'Android B · floating']) {
      await Scrollable.ensureVisible(
        tester.element(find.text(concept)),
        alignment: .1,
      );
      await capture(
        concept.startsWith('Android A') ? 'navigation-a' : 'navigation-b',
      );
    }
    binding.reportData = {
      'platform': Platform.operatingSystem,
      'screenshots': shots,
      'kind': 'layout',
      'evidence': 'Native Flutter constrained logical surfaces; not OS window resizing or device-density changes.',
      'cases': rows,
    };
  });
}
