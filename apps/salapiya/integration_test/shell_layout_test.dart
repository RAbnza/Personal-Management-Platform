import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:salapiya/app.dart';
import 'package:salapiya/app/shell_navigation.dart';
import 'package:salapiya/gallery/settings.dart';
import 'package:salapiya/prototype/scenarios.dart';

import '../test/shell_journey.dart';

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets('D2 native adaptive layout and bounded frame timings', (
    tester,
  ) async {
    final settings = GallerySettings();
    final session = PrototypeSession();
    await tester.pumpWidget(SalapiyaApp(settings: settings, session: session));
    final sizes = Platform.isWindows
        ? [
            const Size(320, 568),
            const Size(640, 480),
            const Size(900, 600),
            const Size(1440, 900),
          ]
        : [
            const Size(320, 568),
            const Size(360, 640),
            const Size(412, 900),
            const Size(800, 360),
          ];
    var cases = 0;
    for (final size in sizes) {
      await binding.setSurfaceSize(size);
      for (final scale in [1.0, 1.5, 2.0]) {
        for (final theme in [ThemeMode.light, ThemeMode.dark]) {
          settings.change(() {
            settings.textScale = scale;
            settings.themeMode = theme;
            settings.reduceMotion = scale == 2;
            settings.effects = scale != 2;
          });
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull, reason: '$size $scale $theme');
          await tester.tap(find.byTooltip('Quick actions'));
          await tester.pumpAndSettle();
          await tapVisible(tester, find.text('Add task'));
          await tester.binding.handlePopRoute();
          await tester.pumpAndSettle();
          final view = tester.widget<SingleChildScrollView>(
            find.byKey(const PageStorageKey('destination-overview')),
          );
          view.controller!.jumpTo(view.controller!.position.maxScrollExtent);
          await tester.pumpAndSettle();
          final end = tester
              .getBottomLeft(find.textContaining('Next: interview on 23 Oct'))
              .dy;
          expect(
            end,
            lessThan(tester.getTopLeft(find.byType(ShellBottomBar)).dy),
          );
          view.controller!.jumpTo(0);
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
          cases++;
        }
      }
    }
    await binding.setSurfaceSize(null);
    settings.change(() {
      settings.textScale = 1;
      settings.reduceMotion = false;
      settings.effects = true;
    });
    await tester.pumpAndSettle();
    final frames = <ui.FrameTiming>[];
    void timing(List<ui.FrameTiming> batch) => frames.addAll(batch);
    binding.addTimingsCallback(timing);
    for (var i = 0; i < 10; i++) {
      await tester.tap(find.byTooltip('Quick actions'));
      await tester.pumpAndSettle();
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      for (final destination in [
        AppDestination.money,
        AppDestination.life,
        AppDestination.overview,
      ]) {
        await tester.tap(find.byKey(ValueKey('nav-${destination.name}')));
        await tester.pumpAndSettle();
      }
      session.select(
        OverviewScenario.values[i % OverviewScenario.values.length],
      );
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
    final idle = frames.length;
    binding.removeTimingsCallback(timing);
    double p95(Iterable<int> values) {
      final sorted = values.toList()..sort();
      return sorted.isEmpty
          ? 0
          : sorted[((sorted.length - 1) * .95).round()] / 1000;
    }

    binding.reportData = {
      'platform': Platform.operatingSystem,
      'mode': kProfileMode ? 'profile' : 'debug',
      'status': 'passed',
      'layoutCases': cases,
      'viewportEvidence': 'Flutter constrained logical surfaces; not OS window resizing or physical device acceptance',
      'performance': {
        'scenario': '10 menu cycles, 30 tab selections and 10 scenario changes; one second drain and one second idle',
        'frames': active.length,
        'buildP95Ms': p95(active.map((f) => f.buildDuration.inMicroseconds)),
        'rasterP95Ms': p95(active.map((f) => f.rasterDuration.inMicroseconds)),
        'idleFrames': idle,
      },
    };
    expect(tester.takeException(), isNull);
  });
}
