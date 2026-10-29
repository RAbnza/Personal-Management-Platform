import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:salapiya/app.dart';
import 'package:salapiya/gallery/settings.dart';

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets('D1R native gallery, menu, layout and bounded frame sample', (
    tester,
  ) async {
    final settings = GallerySettings()..section = GallerySection.navigation;
    await tester.pumpWidget(SalapiyaApp(gallery: true, settings: settings));
    await tester.pumpAndSettle();

    Future<void> open() async {
      await Scrollable.ensureVisible(
        tester.element(find.byTooltip('Quick actions')),
        alignment: 1,
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Quick actions'));
      await tester.pumpAndSettle();
      expect(find.text('Add expense'), findsOneWidget);
    }

    await open();
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.text('Add expense'), findsNothing);
    expect(settings.section, GallerySection.navigation);
    await open();
    await tester.sendKeyEvent(
      LogicalKeyboardKey.escape,
      physicalKey: PhysicalKeyboardKey.escape,
    );
    await tester.pumpAndSettle();
    expect(find.text('Add expense'), findsNothing);
    await open();
    await tester.tap(find.text('Add expense'));
    await tester.pumpAndSettle();
    expect(
      find.text('Add expense specimen only — no record created.'),
      findsOneWidget,
    );
    final rows = <Map<String, Object>>[];
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
    for (final size in sizes) {
      await binding.setSurfaceSize(size);
      for (final scale in [1.0, 2.0]) {
        for (final theme in [ThemeMode.light, ThemeMode.dark]) {
          settings.change(() {
            settings.textScale = scale;
            settings.themeMode = theme;
            settings.reduceMotion = scale == 2;
          });
          await tester.pumpAndSettle();
          await open();
          await tester.ensureVisible(find.text('Add task'));
          await tester.pumpAndSettle();
          await tester.tap(find.text('Add task'));
          await tester.pumpAndSettle();
          expect(
            find.text('Add task specimen only — no record created.'),
            findsWidgets,
          );
          expect(tester.takeException(), isNull, reason: '$size $scale $theme');
        }
        rows.add({
          'width': size.width,
          'height': size.height,
          'textScale': scale,
          'themes': 2,
        });
      }
    }
    await binding.setSurfaceSize(null);
    settings.change(() {
      settings.textScale = null;
      settings.reduceMotion = false;
      settings.section = GallerySection.foundations;
    });
    await tester.pumpAndSettle();
    expect(find.text('Daylight / editorial'), findsOneWidget);
    settings.change(() => settings.effects = false);
    await tester.pumpAndSettle();
    expect(find.text('Made with care.\nClear by design.'), findsOneWidget);
    settings.change(() {
      settings.effects = true;
      settings.section = GallerySection.finance;
    });
    await tester.pumpAndSettle();
    expect(find.text('₱29,300.75'), findsWidgets);
    settings.change(() => settings.section = GallerySection.navigation);
    await tester.pumpAndSettle();
    // Remove queued demo feedback before the idle sample.
    ScaffoldMessenger.of(tester.element(find.byTooltip('Quick actions')))
        .clearSnackBars();
    await tester.pumpAndSettle();
    final frames = <ui.FrameTiming>[];
    void timings(List<ui.FrameTiming> batch) => frames.addAll(batch);
    binding.addTimingsCallback(timings);
    for (var i = 0; i < 12; i++) {
      await open();
      await tester.tap(find.byTooltip('Close quick actions'));
      await tester.pumpAndSettle();
    }
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(seconds: 1)),
    );
    final active = List<ui.FrameTiming>.of(frames);
    frames.clear();
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(seconds: 1)),
    );
    final closedIdle = frames.length;
    await open();
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(seconds: 1)),
    );
    frames.clear();
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(seconds: 1)),
    );
    final openIdle = frames.length;
    binding.removeTimingsCallback(timings);
    await tester.tap(find.byTooltip('Close quick actions'));
    await tester.pumpAndSettle();
    double p95(Iterable<int> values) {
      final sorted = values.toList()..sort();
      return sorted.isEmpty
          ? 0
          : sorted[((sorted.length - 1) * .95).round()] / 1000;
    }

    expect(tester.takeException(), isNull);
    binding.reportData = {
      'platform': Platform.operatingSystem,
      'mode': kProfileMode ? 'profile' : 'debug',
      'status': 'passed',
      'layout': rows,
      'performance': {
        'scenario': '12 open/close cycles; one-second timing drain before each one-second idle sample',
        'frames': active.length,
        'buildP95Ms': p95(active.map((f) => f.buildDuration.inMicroseconds)),
        'rasterP95Ms': p95(active.map((f) => f.rasterDuration.inMicroseconds)),
        'closedIdleFrames': closedIdle,
        'openIdleFrames': openIdle,
      },
    };
  });
}
