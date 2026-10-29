import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:salapiya/app.dart';
import 'package:salapiya/gallery/settings.dart';

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets('native gallery, fonts, interactions and visual evidence', (
    tester,
  ) async {
    final settings = GallerySettings()..themeMode = ThemeMode.light;
    final capture = GlobalKey();
    final shots = <String, String>{};
    final fontWidths = <String, List<double>>{};
    Future<void> edit(Finder field, String value) async {
      if (kProfileMode) {
        // TestTextInput's synthetic client -1 is accepted only in debug builds.
        // Profile exercises rendering and edit callbacks, not keyboard delivery.
        final editable = find.descendant(
          of: field,
          matching: find.byType(EditableText),
        );
        tester
            .state<EditableTextState>(editable)
            .updateEditingValue(
              TextEditingValue(
                text: value,
                selection: TextSelection.collapsed(offset: value.length),
              ),
            );
      } else {
        await tester.enterText(field, value);
      }
      await tester.pumpAndSettle();
    }

    binding.reportData = {
      'screenshots': shots,
      'platform': Platform.operatingSystem,
      'status': 'incomplete',
    };
    Future<void> screenshot(String name) async {
      await tester.pumpAndSettle();
      final boundary =
          capture.currentContext!.findRenderObject()! as RenderRepaintBoundary;
      final image = await boundary.toImage(pixelRatio: 1);
      final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
      shots['${Platform.operatingSystem}-$name'] = base64Encode(
        bytes!.buffer.asUint8List(),
      );
      image.dispose();
    }

    await tester.pumpWidget(
      RepaintBoundary(
        key: capture,
        child: SalapiyaApp(gallery: true, settings: settings),
      ),
    );
    await tester.pumpAndSettle();
    await screenshot('light-foundations');
    for (final family in ['Nunito Sans', 'Geist', 'Source Sans 3']) {
      for (final weight in [
        FontWeight.w400,
        FontWeight.w600,
        FontWeight.w700,
      ]) {
        final widths = <double>[];
        for (var n = 0; n <= 9; n++) {
          final painter = TextPainter(
            text: TextSpan(
              text: '$n',
              style: TextStyle(
                fontFamily: family,
                fontSize: 24,
                fontWeight: weight,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
            textDirection: TextDirection.ltr,
          )..layout();
          widths.add(painter.width);
          painter.dispose();
        }
        fontWidths['$family-${weight.value}'] = widths;
        expect(
          widths.reduce((a, b) => a > b ? a : b) -
              widths.reduce((a, b) => a < b ? a : b),
          lessThan(.01),
          reason: '$family tabular digits',
        );
      }
    }
    await tester.tap(find.byTooltip('Viewing preferences'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Dark'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Done'));
    await tester.pumpAndSettle();
    expect(settings.themeMode, ThemeMode.dark);
    await screenshot('dark-foundations');
    for (final section in [
      GallerySection.typography,
      GallerySection.finance,
      GallerySection.branding,
      GallerySection.navigation,
      GallerySection.feedback,
    ]) {
      settings.change(() {
        settings.section = section;
        settings.themeMode = ThemeMode.light;
      });
      await tester.pumpAndSettle();
      await screenshot('light-${section.name}');
      if (section == GallerySection.typography) {
        for (final family in ['Geist', 'Source Sans 3']) {
          await tester.ensureVisible(find.text(family));
          await screenshot('type-${family.replaceAll(' ', '-')}');
        }
      }
      if (section == GallerySection.branding) {
        await tester.tap(find.text('Compare SVG renderer'));
        await tester.pumpAndSettle();
        await screenshot('brand-svg');
        await tester.ensureVisible(
          find.text('Luminous Lattice · historical motif'),
        );
        await screenshot('craft-comparison');
      }
    }
    settings.change(() => settings.section = GallerySection.actions);
    await tester.pumpAndSettle();
    await edit(find.byKey(const ValueKey('demo-amount')), '1.001');
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Validate example'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Validate example'));
    await tester.pumpAndSettle();
    expect(
      find.text('Enter pesos with up to two decimals, without commas.'),
      findsOneWidget,
    );
    await tester.ensureVisible(find.byKey(const ValueKey('demo-amount')));
    await Scrollable.ensureVisible(
      tester.element(find.byKey(const ValueKey('demo-amount'))),
      alignment: .25,
    );
    await screenshot('validation');
    settings.change(() => settings.section = GallerySection.overlays);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Open sheet'));
    await tester.pumpAndSettle();
    await edit(find.byKey(const ValueKey('review-amount')), '200.25');
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Review'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Review'));
    await tester.pumpAndSettle();
    await screenshot('review-sheet');
    expect(find.text('₱200.25'), findsOneWidget);
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.text('Discard demo changes?'), findsOneWidget);
    await screenshot('dirty-dismiss');
    await tester.tap(find.text('Keep editing'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Close draft'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Discard draft'));
    await tester.pumpAndSettle();
    settings.change(() {
      settings.section = GallerySection.foundations;
      settings.textScale = 2;
      settings.compact = true;
      settings.effects = false;
      settings.reduceMotion = true;
    });
    await tester.pumpAndSettle();
    await screenshot('large-text-reduced');
    expect(tester.takeException(), isNull);
    final frames = <ui.FrameTiming>[];
    void timing(List<ui.FrameTiming> values) => frames.addAll(values);
    binding.addTimingsCallback(timing);
    settings.change(() {
      settings.textScale = 1;
      settings.effects = true;
    });
    await tester.pumpAndSettle();
    for (var i = 0; i < 16; i++) {
      settings.change(() {
        settings.section = GallerySection.values[i % 8];
        settings.themeMode = i.isEven ? ThemeMode.light : ThemeMode.dark;
      });
      await tester.pumpAndSettle();
    }
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(seconds: 1)),
    );
    final activeFrames = List<ui.FrameTiming>.of(frames);
    frames.clear();
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(seconds: 1)),
    );
    final idleFrames = frames.length;
    binding.removeTimingsCallback(timing);
    double percentile(List<int> values) {
      if (values.isEmpty) return 0;
      values.sort();
      return values[((values.length - 1) * .95).round()] / 1000;
    }

    binding.reportData = {
      'screenshots': shots,
      'fontWidths': fontWidths,
      'platform': Platform.operatingSystem,
      'viewportPhysical': {
        'width': tester.view.physicalSize.width,
        'height': tester.view.physicalSize.height,
      },
      'pixelRatio': tester.view.devicePixelRatio,
      'performance': {
        'mode': kProfileMode
            ? 'profile'
            : kReleaseMode
            ? 'release'
            : 'debug',
        'scenario': '16 section/theme changes, then one second idle after one second drain',
        'frames': activeFrames.length,
        'buildP95Ms': percentile(
          activeFrames.map((f) => f.buildDuration.inMicroseconds).toList(),
        ),
        'rasterP95Ms': percentile(
          activeFrames.map((f) => f.rasterDuration.inMicroseconds).toList(),
        ),
        'idleFrames': idleFrames,
      },
    };
  });
}
