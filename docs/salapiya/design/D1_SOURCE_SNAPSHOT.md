# D1 complete authored code and configuration

Full UTF-8 file contents, not diffs or excerpts. Generated with
`python scripts/salapiya/write-source-snapshot.py` against approved D0.
Binary fonts/logos and unchanged third-party notices are linked in
[the exact file inventory](D1_FILES.json); rendered evidence has its
[own review index](review/d1/README.md). Source files remain authoritative.

## apps/salapiya/assets/branding/display/manifest.json

````json
[
  {
    "source": "source/salapiya_original.svg",
    "output": "display/salapiya_original.png",
    "width": 944,
    "height": 794,
    "sourceSha256": "5f6f711dfc2b4019f2253cbb122b083f35227842f43249b861a99e3f970c06b1",
    "outputSha256": "face31d61df5900deac4f7528bf89042947d2fa6522867d7818389f375519677",
    "renderer": "155.0.4283.62"
  },
  {
    "source": "mark/salapiya_mark.svg",
    "output": "display/salapiya_mark.png",
    "width": 768,
    "height": 771,
    "sourceSha256": "f223376778b191c77115193cbf8952686ba2955a872ff9f5682a804e887b2813",
    "outputSha256": "f8139c0a613fd040d0534927bf4c2c6c59e756f144b28ceb6cbce3fb7e519029",
    "renderer": "155.0.4283.62"
  },
  {
    "source": "horizontal/salapiya_horizontal_on_light.svg",
    "output": "display/salapiya_horizontal_on_light.png",
    "width": 1441,
    "height": 463,
    "sourceSha256": "d43fda57aee08873886d74443bfc1ec9582aada970d03c47f50b3b7374789fec",
    "outputSha256": "64833d38f8173074c8c1d8d5e57e4734b957349b14e369c5c725ca88c13edcec",
    "renderer": "155.0.4283.62"
  },
  {
    "source": "horizontal/salapiya_horizontal_on_dark.svg",
    "output": "display/salapiya_horizontal_on_dark.png",
    "width": 1441,
    "height": 463,
    "sourceSha256": "2c70019fc683db470f97d4f9ad24aca8b5c7808bc356f263801852e7ebd56142",
    "outputSha256": "636b9a012546c4090e5621f606bf5b4ec4eb14c629b07c7f54dd601dc1998801",
    "renderer": "155.0.4283.62"
  },
  {
    "source": "vertical/salapiya_vertical_on_light.svg",
    "output": "display/salapiya_vertical_on_light.png",
    "width": 944,
    "height": 794,
    "sourceSha256": "68a22a5f30fab3c0d9f1defff70347dd73592f7a802d74ee0fffd2a738240502",
    "outputSha256": "dadb1666eb4ba7b0dac212c62c86dc92a1d58a844b9f7590aa7b957653bc979d",
    "renderer": "155.0.4283.62"
  },
  {
    "source": "vertical/salapiya_vertical_on_dark.svg",
    "output": "display/salapiya_vertical_on_dark.png",
    "width": 944,
    "height": 794,
    "sourceSha256": "cbf5c996fad731be5f4143d5273a81a7571e33751ab1355d0755ca819897b0aa",
    "outputSha256": "35c863ed16f07e64f001923e72a2f92a33e7070d5b51b246f72d1507dff96013",
    "renderer": "155.0.4283.62"
  }
]
````

## apps/salapiya/assets/fonts/manifest.json

````json
[
  {
    "family": "nunitosans",
    "sourceCommit": "8b0a1d0f5983c89bc2b93f1b5fb55f9e252744b5",
    "sourceFilename": "NunitoSans[YTLC,opsz,wdth,wght].ttf",
    "version": "Version 3.101;gftools[0.9.27]",
    "bytes": 571240,
    "sha256": "f934d7142fb4784bf828da485b7dcbd90c0c80d514e9d49a5da0ed3a1ae2491d",
    "axes": [
      {
        "tag": "wght",
        "default": 200.0,
        "min": 200.0,
        "max": 1000.0
      },
      {
        "tag": "wdth",
        "default": 100.0,
        "min": 75.0,
        "max": 125.0
      },
      {
        "tag": "opsz",
        "default": 12.0,
        "min": 6.0,
        "max": 12.0
      },
      {
        "tag": "YTLC",
        "default": 500.0,
        "min": 440.0,
        "max": 540.0
      }
    ],
    "tnum": false,
    "missingGlyphs": []
  },
  {
    "family": "geist",
    "sourceCommit": "718e1db4deb9e4d9d85a0ead1b9f5fde2761ccfd",
    "sourceFilename": "Geist[wght].ttf",
    "version": "Version 1.800",
    "bytes": 169056,
    "sha256": "73894e0448cae90a92b6c2f8732b7bb9acb7b94c418bff559dad4a18e1de9659",
    "axes": [
      {
        "tag": "wght",
        "default": 400.0,
        "min": 100.0,
        "max": 900.0
      }
    ],
    "tnum": true,
    "missingGlyphs": []
  },
  {
    "family": "sourcesans3",
    "sourceCommit": "914ec116571b1162d886aa402e715552221f0b77",
    "sourceFilename": "SourceSans3[wght].ttf",
    "version": "Version 3.052;hotconv 1.1.0;makeotfexe 2.6.0",
    "bytes": 646340,
    "sha256": "042fe2cc0b933e328410d7acbd0aa6a1873dca5aef81875f4bc214b08825c7b9",
    "axes": [
      {
        "tag": "wght",
        "default": 200.0,
        "min": 200.0,
        "max": 900.0
      }
    ],
    "tnum": false,
    "missingGlyphs": []
  }
]
````

## apps/salapiya/integration_test/branding_test.dart

````dart
import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets('all six unchanged logos: native SVG and browser export', (
    tester,
  ) async {
    const sources = {
      'mark': 'mark/salapiya_mark',
      'horizontal-light': 'horizontal/salapiya_horizontal_on_light',
      'horizontal-dark': 'horizontal/salapiya_horizontal_on_dark',
      'vertical-light': 'vertical/salapiya_vertical_on_light',
      'vertical-dark': 'vertical/salapiya_vertical_on_dark',
      'original': 'source/salapiya_original',
    };
    final shots = <String, String>{};
    final metrics = <String, Map<String, num>>{};
    await binding.setSurfaceSize(const Size(720, 400));
    for (final entry in sources.entries) {
      final key = GlobalKey();
      final raw = <List<int>>[];
      for (final svg in [false, true]) {
        await tester.pumpWidget(
          Directionality(
            textDirection: TextDirection.ltr,
            child: Center(
              child: RepaintBoundary(
                key: key,
                child: SizedBox(
                  width: 640,
                  height: 320,
                  child: svg
                      ? SvgPicture.asset(
                          'assets/branding/${entry.value}.svg',
                          fit: BoxFit.contain,
                        )
                      : Image.asset(
                          'assets/branding/display/${entry.value.split('/').last}.png',
                          fit: BoxFit.contain,
                        ),
                ),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        // Embedded source PNGs are decoded asynchronously by the SVG codec.
        await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 300)),
        );
        await tester.pumpAndSettle();
        final image =
            await (key.currentContext!.findRenderObject()!
                    as RenderRepaintBoundary)
                .toImage(pixelRatio: 1);
        final png = await image.toByteData(format: ui.ImageByteFormat.png);
        final rgba = await image.toByteData(format: ui.ImageByteFormat.rawRgba);
        raw.add(rgba!.buffer.asUint8List());
        shots['${Platform.operatingSystem}-logo-${entry.key}-${svg ? 'svg' : 'export'}'] =
            base64Encode(png!.buffer.asUint8List());
        image.dispose();
        expect(tester.takeException(), isNull);
      }
      var sum = 0, changed = 0;
      for (var pixel = 0; pixel < raw[0].length; pixel += 4) {
        var max = 0;
        for (var channel = 0; channel < 4; channel++) {
          final difference = (raw[0][pixel + channel] - raw[1][pixel + channel])
              .abs();
          sum += difference;
          if (difference > max) max = difference;
        }
        if (max > 16) changed++;
      }
      metrics[entry.key] = {
        'meanAbsoluteChannelDifference': sum / raw[0].length,
        'pixelsWithAnyChannelDifferenceAbove16': changed,
        'pixels': 640 * 320,
      };
    }
    await binding.setSurfaceSize(null);
    binding.reportData = {
      'platform': Platform.operatingSystem,
      'kind': 'branding',
      'screenshots': shots,
      'metrics': metrics,
      'note': 'Identical 640x320 transparent contain rectangles on each native renderer. Pixel differences include normal resampling/antialiasing; inspect shape/gradient differences visually.',
    };
  });
}
````

## apps/salapiya/integration_test/layout_test.dart

````dart
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
        child: SalapiyaApp(settings: settings),
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
````

## apps/salapiya/integration_test/startup_test.dart

````dart
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
        child: SalapiyaApp(settings: settings),
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
        await tester.ensureVisible(find.text('Luminous Lattice · comparison'));
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
````

## apps/salapiya/lib/app.dart

````dart
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'design_system/theme.dart';
import 'gallery/gallery.dart';
import 'gallery/settings.dart';

class SalapiyaApp extends StatefulWidget {
  const SalapiyaApp({super.key, this.settings});
  final GallerySettings? settings;
  @override
  State<SalapiyaApp> createState() => _SalapiyaAppState();
}

class _SalapiyaAppState extends State<SalapiyaApp> {
  static bool licensesRegistered = false;
  late final GallerySettings settings = widget.settings ?? GallerySettings();
  @override
  void initState() {
    super.initState();
    if (licensesRegistered) return;
    licensesRegistered = true;
    for (final family in ['nunitosans', 'geist', 'sourcesans3']) {
      LicenseRegistry.addLicense(() async* {
        yield LicenseEntryWithLineBreaks([
          'Salapiya font: $family',
        ], await rootBundle.loadString('assets/fonts/$family/OFL.txt'));
      });
    }
  }

  @override
  void dispose() {
    if (widget.settings == null) settings.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: settings,
    builder: (context, _) => MaterialApp(
      title: 'Salapiya · Design gallery',
      debugShowCheckedModeBanner: false,
      theme: SalapiyaTheme.build(Brightness.light),
      darkTheme: SalapiyaTheme.build(Brightness.dark),
      themeMode: settings.themeMode,
      themeAnimationDuration: Duration.zero,
      builder: (context, child) {
        final media = MediaQuery.of(context);
        return MediaQuery(
          data: media.copyWith(
            disableAnimations: media.disableAnimations || settings.reduceMotion,
            textScaler: settings.textScale == null
                ? media.textScaler
                : TextScaler.linear(settings.textScale!),
          ),
          child: CraftPreferences(
            effects: settings.effects && !media.highContrast,
            child: Theme(
              data: Theme.of(context).copyWith(
                filledButtonTheme: FilledButtonThemeData(
                  style: Theme.of(context).filledButtonTheme.style?.copyWith(
                    animationDuration:
                        settings.reduceMotion || media.disableAnimations
                        ? Duration.zero
                        : const Duration(milliseconds: 120),
                  ),
                ),
                outlinedButtonTheme: OutlinedButtonThemeData(
                  style: Theme.of(context).outlinedButtonTheme.style?.copyWith(
                    animationDuration:
                        settings.reduceMotion || media.disableAnimations
                        ? Duration.zero
                        : const Duration(milliseconds: 120),
                  ),
                ),
                textButtonTheme: TextButtonThemeData(
                  style: Theme.of(context).textButtonTheme.style?.copyWith(
                    animationDuration:
                        settings.reduceMotion || media.disableAnimations
                        ? Duration.zero
                        : const Duration(milliseconds: 120),
                  ),
                ),
              ),
              child: child!,
            ),
          ),
        );
      },
      home: GalleryHome(settings: settings),
    ),
  );
}
````

## apps/salapiya/lib/design_system/components.dart

````dart
import 'package:flutter/material.dart';

import 'theme.dart';
import 'craft.dart';

class CraftPanel extends StatelessWidget {
  const CraftPanel({
    super.key,
    required this.child,
    this.focal = false,
    this.padding = 24,
  });
  final Widget child;
  final bool focal;
  final double padding;
  @override
  Widget build(BuildContext context) {
    final c = CraftTheme.of(context);
    final effects = CraftPreferences.effectsOf(context);
    return Container(
      padding: EdgeInsets.all(padding),
      decoration: BoxDecoration(
        color: c.surface,
        gradient: focal && effects
            ? LinearGradient(colors: [c.focalStart, c.focalEnd])
            : null,
        borderRadius: BorderRadius.circular(Space.cardRadius),
        border: Border.all(color: c.divider),
        boxShadow: focal && effects ? c.shadow : null,
      ),
      child: Material(type: MaterialType.transparency, child: child),
    );
  }
}

class SectionTitle extends StatelessWidget {
  const SectionTitle(this.title, {super.key, this.caption});
  final String title;
  final String? caption;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 16),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Semantics(
          header: true,
          child: Text(title, style: Theme.of(context).textTheme.titleLarge),
        ),
        if (caption != null)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              caption!,
              style: TextStyle(color: CraftTheme.of(context).secondary),
            ),
          ),
      ],
    ),
  );
}

class StatusNotice extends StatelessWidget {
  const StatusNotice(
    this.text, {
    super.key,
    this.tone = NoticeTone.neutral,
    this.live = false,
    this.action,
  });
  final String text;
  final NoticeTone tone;
  final bool live;
  final Widget? action;
  @override
  Widget build(BuildContext context) {
    final (ink, fill) = CraftTheme.of(context).tone(tone);
    final icon = switch (tone) {
      NoticeTone.success => Icons.check_circle_outline,
      NoticeTone.warning => Icons.error_outline,
      NoticeTone.error => Icons.cancel_outlined,
      NoticeTone.information => Icons.info_outline,
      NoticeTone.neutral => Icons.schedule,
    };
    return Semantics(
      liveRegion: live,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: fill,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(icon, color: ink, size: 20),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(text, style: TextStyle(color: ink)),
                ),
              ],
            ),
            if (action != null)
              Padding(padding: const EdgeInsets.only(top: 8), child: action!),
          ],
        ),
      ),
    );
  }
}

/// Exact formatted strings are supplied by the application, never calculated here.
class AmountText extends StatelessWidget {
  const AmountText(
    this.value, {
    super.key,
    this.large = false,
    this.semanticLabel,
  });
  final String value;
  final bool large;
  final String? semanticLabel;
  @override
  Widget build(BuildContext context) {
    if (!large) {
      return Text(
        value,
        semanticsLabel:
            semanticLabel ??
            value
                .replaceAll('₱', 'Philippine pesos ')
                .replaceAll('−', 'minus '),
        style: Theme.of(context).textTheme.titleMedium!
            .copyWith(fontFeatures: const [FontFeature.tabularFigures()]),
      );
    }
    return LayoutBuilder(
      builder: (context, box) {
        final base = Theme.of(context).textTheme.displaySmall!
            .copyWith(fontFeatures: const [FontFeature.tabularFigures()]);
        var style = base;
        var fits = true;
        if (box.hasBoundedWidth) {
          // The parent first gives amounts a full-width row. Only then adapt the
          // display role, retaining OS scaling and the 14px minimum text role.
          for (final size in [32.0, 26.0, 20.0, 16.0, 14.0]) {
            style = base.copyWith(fontSize: size);
            final measure = TextPainter(
              text: TextSpan(text: value, style: style),
              textDirection: Directionality.of(context),
              textScaler: MediaQuery.textScalerOf(context),
              maxLines: 1,
            )..layout();
            fits = measure.width <= box.maxWidth;
            measure.dispose();
            if (fits) break;
          }
        }
        final text = Text(
          value,
          softWrap: false,
          semanticsLabel:
              semanticLabel ??
              value
                  .replaceAll('₱', 'Philippine pesos ')
                  .replaceAll('−', 'minus '),
          style: style,
        );
        return fits ? text : _ScrollableAmount(child: text);
      },
    );
  }
}

class _ScrollableAmount extends StatefulWidget {
  const _ScrollableAmount({required this.child});
  final Widget child;
  @override
  State<_ScrollableAmount> createState() => _ScrollableAmountState();
}

class _ScrollableAmountState extends State<_ScrollableAmount> {
  final controller = ScrollController(keepScrollOffset: false);
  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scrollbar(
    controller: controller,
    thumbVisibility: true,
    child: SingleChildScrollView(
      controller: controller,
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.only(bottom: 12),
      child: widget.child,
    ),
  );
}

class MoneySummary extends StatelessWidget {
  const MoneySummary({
    super.key,
    required this.label,
    required this.value,
    required this.coverage,
    this.detail,
    this.onDetails,
  });
  final String label, coverage;
  final String? value, detail;
  final VoidCallback? onDetails;
  @override
  Widget build(BuildContext context) => CraftPanel(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: TextStyle(color: CraftTheme.of(context).secondary)),
        const SizedBox(height: 8),
        if (value == null)
          const Text('Not yet available')
        else
          AmountText(value!, large: true),
        const SizedBox(height: 12),
        Text(coverage),
        if (detail != null)
          Padding(padding: const EdgeInsets.only(top: 8), child: Text(detail!)),
        if (onDetails != null)
          TextButton(
            onPressed: onDetails,
            child: const Text('View source details'),
          ),
      ],
    ),
  );
}

class RecordRow extends StatelessWidget {
  const RecordRow({
    super.key,
    required this.title,
    required this.subtitle,
    required this.amount,
    required this.icon,
    required this.onDetails,
  });
  final String title, subtitle, amount;
  final IconData icon;
  final VoidCallback onDetails;
  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, box) {
      final narrow =
          box.maxWidth < 500 || MediaQuery.textScalerOf(context).scale(14) > 21;
      final text = Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: Theme.of(context).textTheme.titleMedium),
          Text(
            subtitle,
            style: TextStyle(color: CraftTheme.of(context).secondary),
          ),
        ],
      );
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: CraftTheme.of(context).selection,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(icon, color: CraftTheme.of(context).primary),
                ),
                const SizedBox(width: 12),
                Expanded(child: text),
                if (!narrow)
                  Padding(
                    padding: const EdgeInsets.only(left: 16),
                    child: AmountText(amount),
                  ),
              ],
            ),
            if (narrow)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: AmountText(amount),
              ),
            TextButton(onPressed: onDetails, child: Text('Details · $title')),
          ],
        ),
      );
    },
  );
}

class ReviewRows extends StatelessWidget {
  const ReviewRows({super.key, required this.rows});
  final List<(String, String)> rows;
  @override
  Widget build(BuildContext context) => Column(
    children: [
      for (final row in rows)
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: LayoutBuilder(
            builder: (context, box) {
              final label = Text(
                row.$1,
                style: TextStyle(color: CraftTheme.of(context).secondary),
              );
              final value = Text(
                row.$2,
                style: const TextStyle(
                  fontWeight: FontWeight.w600,
                  fontFeatures: [FontFeature.tabularFigures()],
                ),
              );
              return box.maxWidth < 460 ||
                      MediaQuery.textScalerOf(context).scale(14) > 21
                  ? Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [label, value],
                    )
                  : Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(child: label),
                        const SizedBox(width: 24),
                        Expanded(child: value),
                      ],
                    );
            },
          ),
        ),
    ],
  );
}

class EmptyPanel extends StatelessWidget {
  const EmptyPanel({
    super.key,
    required this.title,
    required this.message,
    this.action,
  });
  final String title, message;
  final Widget? action;
  @override
  Widget build(BuildContext context) => CraftPanel(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const CraftMotif(size: 64),
        const SizedBox(height: 16),
        SectionTitle(title, caption: message),
        ?action,
      ],
    ),
  );
}

class BusyAction extends StatelessWidget {
  const BusyAction({
    super.key,
    required this.busy,
    required this.label,
    required this.onPressed,
  });
  final bool busy;
  final String label;
  final VoidCallback onPressed;
  @override
  Widget build(BuildContext context) => Semantics(
    liveRegion: busy,
    child: FilledButton.icon(
      onPressed: busy ? null : onPressed,
      icon: busy
          ? const Icon(Icons.hourglass_top_rounded)
          : const Icon(Icons.check_rounded),
      label: Text(busy ? 'Demo processing…' : label),
    ),
  );
}

class AdaptivePair extends StatelessWidget {
  const AdaptivePair({super.key, required this.children, this.minWidth = 400});
  final List<Widget> children;
  final double minWidth;
  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, box) {
      final columns =
          box.maxWidth >= minWidth * 2 + 24 &&
              MediaQuery.textScalerOf(context).scale(14) <= 21
          ? 2
          : 1;
      final width = (box.maxWidth - 24 * (columns - 1)) / columns;
      return Wrap(
        spacing: 24,
        runSpacing: 24,
        children: children
            .map((child) => SizedBox(width: width, child: child))
            .toList(),
      );
    },
  );
}
````

## apps/salapiya/lib/design_system/craft.dart

````dart
import 'package:flutter/material.dart';

import 'theme.dart';

/// Original abstract interlacing; no traditional artwork or logo is copied.
class CraftMotif extends StatelessWidget {
  const CraftMotif({super.key, this.lattice = false, this.size = 96});
  final bool lattice;
  final double size;
  @override
  Widget build(BuildContext context) {
    final c = CraftTheme.of(context);
    return ExcludeSemantics(
      child: IgnorePointer(
        child: SizedBox.square(
          dimension: size,
          child: CraftPreferences.effectsOf(context)
              ? RepaintBoundary(
                  child: CustomPaint(
                    painter: _WeavePainter(
                      c.primary,
                      c.warm,
                      c.selection,
                      lattice,
                    ),
                  ),
                )
              : null,
        ),
      ),
    );
  }
}

class _WeavePainter extends CustomPainter {
  const _WeavePainter(this.ink, this.warm, this.gap, this.lattice);
  final Color ink, warm, gap;
  final bool lattice;
  @override
  void paint(Canvas canvas, Size size) {
    canvas.scale(size.width / 96, size.height / 96);
    final p = Paint()..strokeCap = StrokeCap.round;
    if (lattice) {
      p
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3;
      for (var i = 0; i < 3; i++) {
        p.color = i == 1 ? warm : ink;
        canvas.drawRRect(
          RRect.fromRectAndRadius(
            Rect.fromLTWH(8.0 + i * 16, 8.0 + i * 16, 52, 52),
            const Radius.circular(8),
          ),
          p,
        );
      }
      return;
    }
    for (var i = 0; i < 3; i++) {
      p
        ..color = ink
        ..strokeWidth = 8;
      canvas.drawLine(Offset(16.0 + i * 28, 6), Offset(16.0 + i * 28, 90), p);
      p.color = warm;
      canvas.drawLine(Offset(6, 16.0 + i * 28), Offset(90, 16.0 + i * 28), p);
    }
    for (var x = 0; x < 3; x++) {
      for (var y = 0; y < 3; y++) {
        if ((x + y).isEven) {
          p
            ..color = gap
            ..strokeWidth = 14;
          canvas.drawLine(
            Offset(16.0 + x * 28, 8.0 + y * 28),
            Offset(16.0 + x * 28, 24.0 + y * 28),
            p,
          );
          p
            ..color = ink
            ..strokeWidth = 8;
          canvas.drawLine(
            Offset(16.0 + x * 28, 6.0 + y * 28),
            Offset(16.0 + x * 28, 26.0 + y * 28),
            p,
          );
        }
      }
    }
  }

  @override
  bool shouldRepaint(_WeavePainter old) =>
      old.ink != ink ||
      old.warm != warm ||
      old.gap != gap ||
      old.lattice != lattice;
}

class BrandMark extends StatelessWidget {
  const BrandMark({super.key, this.size = 48});
  final double size;
  @override
  Widget build(BuildContext context) => Image.asset(
    'assets/branding/display/salapiya_mark.png',
    width: size,
    height: size,
    fit: BoxFit.contain,
    excludeFromSemantics: true,
  );
}
````

## apps/salapiya/lib/design_system/navigation.dart

````dart
import 'package:flutter/material.dart';

import 'theme.dart';

/// Presentation only. Selection and routing belong to the caller.
class DestinationControl extends StatelessWidget {
  const DestinationControl({
    super.key,
    required this.label,
    required this.icon,
    required this.selected,
    this.onPressed,
    this.compact = false,
    this.vertical = false,
  });
  final String label;
  final IconData icon;
  final bool selected, compact, vertical;
  final VoidCallback? onPressed;
  @override
  Widget build(BuildContext context) => Semantics(
    selected: selected,
    child: Tooltip(
      message: label,
      child: TextButton(
        style: TextButton.styleFrom(
          backgroundColor: selected ? CraftTheme.of(context).selection : null,
          minimumSize: const Size(48, 48),
          padding: vertical
              ? const EdgeInsets.symmetric(horizontal: 2, vertical: 12)
              : const EdgeInsets.all(12),
        ),
        onPressed: onPressed,
        child: compact
            ? Icon(icon, semanticLabel: label)
            : vertical
            ? Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(icon, size: 20),
                  const SizedBox(height: 8),
                  Text(
                    label,
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 12),
                  ),
                ],
              )
            : Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(icon, size: 20),
                  const SizedBox(width: 12),
                  Flexible(child: Text(label)),
                ],
              ),
      ),
    ),
  );
}
````

## apps/salapiya/lib/design_system/theme.dart

````dart
import 'package:flutter/material.dart';

abstract final class Space {
  static const double xs = 4, sm = 8, md = 12, lg = 16, xl = 24, xxl = 32;
  static const double target = 48, cardRadius = 20, controlRadius = 12;
}

abstract final class Palette {
  static const porcelain = Color(0xFFF7F8FC), midnight = Color(0xFF0D1020);
  static const violet = Color(0xFF6B469C), lavender = Color(0xFFC8B6F2);
  static const white = Color(0xFFFFFFFF);
}

enum NoticeTone { neutral, information, success, warning, error }

@immutable
class CraftTheme extends ThemeExtension<CraftTheme> {
  const CraftTheme({required this.dark});
  final bool dark;
  Color get surface => dark ? const Color(0xFF171B31) : Palette.white;
  Color get raised => dark ? const Color(0xFF20253F) : Palette.white;
  Color get subtle => dark ? const Color(0xFF202440) : const Color(0xFFEEF0F8);
  Color get text => dark ? const Color(0xFFF3F5FF) : const Color(0xFF22252B);
  Color get secondary =>
      dark ? const Color(0xFFB7C2DE) : const Color(0xFF5E6570);
  Color get border => dark ? const Color(0xFF929CBA) : const Color(0xFF7A8197);
  Color get divider => dark ? const Color(0xFF363D5B) : const Color(0xFFDCE0EC);
  Color get primary => dark ? Palette.lavender : Palette.violet;
  Color get onPrimary => dark ? const Color(0xFF1B1B22) : Palette.white;
  Color get hover => dark ? const Color(0xFFBCA5EE) : const Color(0xFF5D3D88);
  Color get pressed => dark ? const Color(0xFFB09AE0) : const Color(0xFF503474);
  Color get selection =>
      dark ? const Color(0xFF332A45) : const Color(0xFFEEEAF5);
  Color get warm => dark ? const Color(0xFFD9BE97) : const Color(0xFF82603A);
  Color get warmSurface =>
      dark ? const Color(0xFF30291F) : const Color(0xFFF5EEE5);
  Color get plum => dark ? const Color(0xFFF3B6EF) : const Color(0xFF80456F);
  Color get plumSurface =>
      dark ? const Color(0xFF38203F) : const Color(0xFFF4E5EE);
  Color get blue => dark ? const Color(0xFF8BDCFF) : const Color(0xFF245E87);
  Color get blueSurface =>
      dark ? const Color(0xFF132C45) : const Color(0xFFE5F1FA);
  Color get focalStart =>
      dark ? const Color(0xFF302153) : const Color(0xFFEEE8FF);
  Color get focalEnd =>
      dark ? const Color(0xFF142C49) : const Color(0xFFE1EFFF);
  (Color, Color) tone(NoticeTone tone) => switch (tone) {
    NoticeTone.neutral => (secondary, subtle),
    NoticeTone.information =>
      dark
          ? (const Color(0xFF9AC5FF), const Color(0xFF19283B))
          : (const Color(0xFF235EA7), const Color(0xFFEDF4FF)),
    NoticeTone.success =>
      dark
          ? (const Color(0xFF75D5A5), const Color(0xFF142B22))
          : (const Color(0xFF146C43), const Color(0xFFEDF8F1)),
    NoticeTone.warning =>
      dark
          ? (const Color(0xFFF3C16B), const Color(0xFF312716))
          : (const Color(0xFF8A4B0F), const Color(0xFFFFF4DF)),
    NoticeTone.error =>
      dark
          ? (const Color(0xFFFDA29B), const Color(0xFF371D22))
          : (const Color(0xFFB42318), const Color(0xFFFFF0ED)),
  };
  List<BoxShadow> get shadow => [
    BoxShadow(
      color: Colors.black.withValues(alpha: dark ? .20 : .08),
      offset: const Offset(0, 4),
      blurRadius: 16,
    ),
  ];
  static CraftTheme of(BuildContext context) =>
      Theme.of(context).extension<CraftTheme>()!;
  @override
  CraftTheme copyWith({bool? dark}) => CraftTheme(dark: dark ?? this.dark);
  @override
  CraftTheme lerp(covariant CraftTheme? other, double t) =>
      t < .5 ? this : other ?? this;
}

class CraftPreferences extends InheritedWidget {
  const CraftPreferences({
    super.key,
    required this.effects,
    required super.child,
  });
  final bool effects;
  static bool effectsOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<CraftPreferences>()?.effects ??
      true;
  @override
  bool updateShouldNotify(CraftPreferences oldWidget) =>
      effects != oldWidget.effects;
}

abstract final class SalapiyaTheme {
  static ThemeData build(Brightness brightness) {
    final c = CraftTheme(dark: brightness == Brightness.dark);
    TextStyle type(double size, FontWeight weight, double height) => TextStyle(
      fontFamily: 'Nunito Sans',
      fontSize: size,
      fontWeight: weight,
      height: height,
      color: c.text,
    );
    final outline = OutlineInputBorder(
      borderRadius: BorderRadius.circular(Space.controlRadius),
      borderSide: BorderSide(color: c.border),
    );
    final scheme =
        ColorScheme.fromSeed(
          seedColor: Palette.violet,
          brightness: brightness,
        ).copyWith(
          primary: c.primary,
          onPrimary: c.onPrimary,
          surface: c.surface,
          onSurface: c.text,
          onSurfaceVariant: c.secondary,
          surfaceContainerHighest: c.subtle,
          outline: c.border,
          outlineVariant: c.divider,
          error: c.tone(NoticeTone.error).$1,
        );
    ButtonStyle button({bool filled = false}) => ButtonStyle(
      minimumSize: const WidgetStatePropertyAll(Size(48, 48)),
      padding: const WidgetStatePropertyAll(
        EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      ),
      shape: WidgetStatePropertyAll(
        RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
      textStyle: WidgetStatePropertyAll(type(14, FontWeight.w700, 1.4)),
      foregroundColor: WidgetStateProperty.resolveWith(
        (s) => s.contains(WidgetState.disabled)
            ? c.secondary
            : filled
            ? c.onPrimary
            : c.primary,
      ),
      backgroundColor: WidgetStateProperty.resolveWith(
        (s) => s.contains(WidgetState.disabled)
            ? c.subtle
            : !filled
            ? null
            : s.contains(WidgetState.pressed)
            ? c.pressed
            : s.contains(WidgetState.hovered)
            ? c.hover
            : c.primary,
      ),
      side: WidgetStateProperty.resolveWith(
        (s) => s.contains(WidgetState.focused)
            ? BorderSide(color: filled ? c.onPrimary : c.primary, width: 3)
            : null,
      ),
    );
    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
      scaffoldBackgroundColor: c.dark ? Palette.midnight : Palette.porcelain,
      fontFamily: 'Nunito Sans',
      extensions: [c],
      textTheme: TextTheme(
        displaySmall: type(32, FontWeight.w600, 1.2),
        headlineMedium: type(26, FontWeight.w700, 1.25),
        titleLarge: type(20, FontWeight.w600, 1.3),
        titleMedium: type(16, FontWeight.w700, 1.4),
        bodyLarge: type(16, FontWeight.w400, 1.5),
        bodyMedium: type(14, FontWeight.w400, 1.45),
        bodySmall: type(14, FontWeight.w400, 1.45),
        labelLarge: type(14, FontWeight.w600, 1.4),
      ),
      filledButtonTheme: FilledButtonThemeData(style: button(filled: true)),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: button().copyWith(
          side: WidgetStateProperty.resolveWith(
            (s) => BorderSide(
              color: s.contains(WidgetState.focused) ? c.primary : c.border,
              width: s.contains(WidgetState.focused) ? 3 : 1,
            ),
          ),
        ),
      ),
      textButtonTheme: TextButtonThemeData(style: button()),
      iconButtonTheme: IconButtonThemeData(
        style: ButtonStyle(
          minimumSize: const WidgetStatePropertyAll(Size(48, 48)),
          foregroundColor: WidgetStatePropertyAll(c.primary),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: c.surface,
        border: outline,
        enabledBorder: outline,
        focusedBorder: outline.copyWith(
          borderSide: BorderSide(color: c.primary, width: 2),
        ),
        errorBorder: outline.copyWith(
          borderSide: BorderSide(color: scheme.error),
        ),
        focusedErrorBorder: outline.copyWith(
          borderSide: BorderSide(color: scheme.error, width: 2),
        ),
        floatingLabelBehavior: FloatingLabelBehavior.always,
        contentPadding: const EdgeInsets.all(16),
        helperMaxLines: 4,
        errorMaxLines: 4,
      ),
      dividerTheme: DividerThemeData(color: c.divider, space: 24),
      appBarTheme: AppBarTheme(
        backgroundColor: c.surface,
        foregroundColor: c.text,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: c.raised,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: c.raised,
        showDragHandle: true,
        surfaceTintColor: Colors.transparent,
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: c.text,
        contentTextStyle: TextStyle(
          color: c.surface,
          fontFamily: 'Nunito Sans',
        ),
      ),
    );
  }
}
````

## apps/salapiya/lib/gallery/gallery.dart

````dart
import 'package:flutter/material.dart';

import '../design_system/components.dart';
import '../design_system/craft.dart';
import '../design_system/theme.dart';
import 'settings.dart';
import 'specimens.dart';

class GalleryHome extends StatelessWidget {
  const GalleryHome({super.key, required this.settings});
  final GallerySettings settings;

  void controls(BuildContext context) => showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    sheetAnimationStyle: MediaQuery.disableAnimationsOf(context)
        ? AnimationStyle.noAnimation
        : null,
    builder: (context) => ListenableBuilder(
      listenable: settings,
      builder: (context, _) => SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SectionTitle(
              'Your viewing preferences',
              caption: 'Demo only. Closing the app resets every change.',
            ),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final mode in ThemeMode.values)
                  ChoiceChip(
                    label: Text(
                      '${mode.name[0].toUpperCase()}${mode.name.substring(1)}',
                    ),
                    selected: settings.themeMode == mode,
                    onSelected: (_) =>
                        settings.change(() => settings.themeMode = mode),
                  ),
              ],
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Craft effects'),
              subtitle: const Text(
                'Woven details, focal gradients and shadows',
              ),
              value: settings.effects,
              onChanged: (v) => settings.change(() => settings.effects = v),
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Reduce motion'),
              subtitle: const Text('System reduced motion is always respected'),
              value: settings.reduceMotion,
              onChanged: (v) =>
                  settings.change(() => settings.reduceMotion = v),
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Compact specimens'),
              value: settings.compact,
              onChanged: (v) => settings.change(() => settings.compact = v),
            ),
            DropdownButtonFormField<double>(
              initialValue: settings.textScale ?? 0,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Text size preview'),
              items: const [
                DropdownMenuItem(value: 0, child: Text('System text size')),
                DropdownMenuItem(value: 1, child: Text('100%')),
                DropdownMenuItem(value: 1.5, child: Text('150%')),
                DropdownMenuItem(value: 2, child: Text('200%')),
              ],
              onChanged: (v) =>
                  settings.change(() => settings.textScale = v == 0 ? null : v),
            ),
            const SizedBox(height: 24),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                OutlinedButton(
                  onPressed: () {
                    settings.reset();
                    Navigator.pop(context);
                  },
                  child: const Text('Reset gallery'),
                ),
                FilledButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text('Done'),
                ),
                TextButton(
                  onPressed: () => showLicensePage(
                    context: context,
                    applicationName: 'Salapiya design gallery',
                  ),
                  child: const Text('Licenses'),
                ),
              ],
            ),
          ],
        ),
      ),
    ),
  );

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, bounds) {
      final wide =
          bounds.maxWidth >= 1050 &&
          MediaQuery.textScalerOf(context).scale(14) <= 21;
      final c = CraftTheme.of(context);
      return Scaffold(
        body: SafeArea(
          child: Row(
            children: [
              if (wide)
                Container(
                  width: 248,
                  decoration: BoxDecoration(
                    color: c.surface,
                    border: Border(right: BorderSide(color: c.divider)),
                  ),
                  child: ListView(
                    padding: const EdgeInsets.all(24),
                    children: [
                      const Row(
                        children: [
                          BrandMark(size: 40),
                          SizedBox(width: 12),
                          Expanded(
                            child: Text(
                              'Salapiya',
                              style: TextStyle(
                                fontSize: 24,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 36),
                      Text(
                        'DESIGN ATELIER',
                        style: TextStyle(
                          color: c.secondary,
                          fontSize: 12,
                          letterSpacing: 1.6,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 16),
                      for (final section in GallerySection.values)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: Material(
                            type: MaterialType.transparency,
                            child: ListTile(
                              contentPadding: const EdgeInsets.symmetric(
                                horizontal: 12,
                              ),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                              selected: settings.section == section,
                              selectedTileColor: c.selection,
                              selectedColor: c.primary,
                              leading: Icon(section.icon, size: 20),
                              title: Text(section.label),
                              onTap: () => settings.change(
                                () => settings.section = section,
                              ),
                            ),
                          ),
                        ),
                      const SizedBox(height: 40),
                      const CraftMotif(size: 72),
                      const SizedBox(height: 16),
                      Text(
                        'A little craft.\nA clearer everyday.',
                        style: TextStyle(color: c.secondary),
                      ),
                    ],
                  ),
                ),
              Expanded(
                child: Column(
                  children: [
                    Container(
                      decoration: BoxDecoration(
                        color: c.surface,
                        border: Border(bottom: BorderSide(color: c.divider)),
                      ),
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 8,
                      ),
                      child: Row(
                        children: [
                          if (!wide)
                            const Padding(
                              padding: EdgeInsets.only(right: 12),
                              child: BrandMark(size: 32),
                            ),
                          Expanded(
                            child: wide
                                ? Text(
                                    'Woven Calm / Component collection',
                                    style: TextStyle(color: c.secondary),
                                  )
                                : DropdownButtonHideUnderline(
                                    child: DropdownButton<GallerySection>(
                                      isExpanded: true,
                                      value: settings.section,
                                      items: [
                                        for (final s in GallerySection.values)
                                          DropdownMenuItem(
                                            value: s,
                                            child: Text(
                                              s.label,
                                              overflow: TextOverflow.ellipsis,
                                            ),
                                          ),
                                      ],
                                      onChanged: (v) => settings.change(
                                        () => settings.section = v!,
                                      ),
                                    ),
                                  ),
                          ),
                          const Tooltip(
                            message: 'Demonstration mode. Synthetic data; changes reset on close.',
                            child: Padding(
                              padding: EdgeInsets.symmetric(horizontal: 8),
                              child: Text(
                                'DEMO',
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                          ),
                          IconButton(
                            tooltip: 'Viewing preferences',
                            onPressed: () => controls(context),
                            icon: const Icon(Icons.tune_rounded),
                          ),
                        ],
                      ),
                    ),
                    Expanded(
                      child: SingleChildScrollView(
                        key: PageStorageKey(settings.section),
                        padding: EdgeInsets.all(
                          bounds.maxWidth < 600 ? 16 : 32,
                        ),
                        child: Align(
                          alignment: Alignment.topCenter,
                          child: ConstrainedBox(
                            constraints: const BoxConstraints(maxWidth: 1280),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                Text(
                                  'D1  /  INTERACTIVE DESIGN STUDY',
                                  style: TextStyle(
                                    fontSize: 12,
                                    letterSpacing: 1.3,
                                    fontWeight: FontWeight.w700,
                                    color: c.primary,
                                  ),
                                ),
                                const SizedBox(height: 12),
                                Text(
                                  settings.section.label,
                                  style: Theme.of(context)
                                      .textTheme
                                      .headlineMedium,
                                ),
                                const SizedBox(height: 12),
                                Text(
                                  'Demonstration · Synthetic data only. Changes reset when you close the app.',
                                  style: TextStyle(color: c.secondary),
                                ),
                                const SizedBox(height: 28),
                                GallerySpecimens(
                                  key: ValueKey(
                                    '${settings.section.name}-${settings.resetRevision}',
                                  ),
                                  section: settings.section,
                                  compact: settings.compact,
                                ),
                                const SizedBox(height: 32),
                                Text(
                                  'SALAPIYA  /  WOVEN CALM  /  OWNER REVIEW',
                                  style: TextStyle(
                                    color: c.secondary,
                                    fontSize: 12,
                                    letterSpacing: 1,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      );
    },
  );
}
````

## apps/salapiya/lib/gallery/navigation_study.dart

````dart
import 'package:flutter/material.dart';

import '../design_system/components.dart';
import '../design_system/theme.dart';
import '../design_system/navigation.dart';

const specimenDestinations = <(String, IconData)>[
  ('Overview', Icons.dashboard_outlined),
  ('Money', Icons.account_balance_wallet_outlined),
  ('Debts', Icons.handshake_outlined),
  ('Shared Expenses', Icons.people_outline),
  ('Life', Icons.calendar_today_outlined),
];

class NavigationStudy extends StatefulWidget {
  const NavigationStudy({super.key, required this.compact});
  final bool compact;
  @override
  State<NavigationStudy> createState() => _NavigationStudyState();
}

class _NavigationStudyState extends State<NavigationStudy> {
  int selected = 0;
  bool shelf = false;
  void select(int i) => setState(() => selected = i);
  Widget destinations({bool rail = false, bool capsule = false}) =>
      LayoutBuilder(
        builder: (context, box) {
          // Labels remain available at narrow widths and enlarged text; never squeeze five labels.
          final stacked =
              rail ||
              box.maxWidth < 296 ||
              MediaQuery.textScalerOf(context).scale(14) > 18;
          final children = [
            for (var i = 0; i < specimenDestinations.length; i++)
              DestinationControl(
                label: specimenDestinations[i].$1,
                icon: specimenDestinations[i].$2,
                selected: selected == i,
                compact: rail && widget.compact,
                vertical: !stacked,
                onPressed: () => select(i),
              ),
          ];
          return Container(
            decoration: BoxDecoration(
              color: CraftTheme.of(context).surface,
              border: Border.all(color: CraftTheme.of(context).divider),
              borderRadius: BorderRadius.circular(capsule ? 28 : 12),
            ),
            padding: const EdgeInsets.all(8),
            child: stacked
                ? Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: children,
                  )
                : Row(
                    children: [
                      for (final child in children) Expanded(child: child),
                    ],
                  ),
          );
        },
      );
  void action(String name) => ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(content: Text('$name specimen only — no record created.')),
  );
  Widget dock() => Wrap(
    spacing: 8,
    runSpacing: 8,
    children: [
      OutlinedButton.icon(
        onPressed: () => action('Expense'),
        icon: const Icon(Icons.remove),
        label: const Text('Expense'),
      ),
      OutlinedButton.icon(
        onPressed: () => action('Transfer'),
        icon: const Icon(Icons.swap_horiz),
        label: const Text('Transfer'),
      ),
      const OutlinedButton(onPressed: null, child: Text('Unavailable action')),
    ],
  );
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      const StatusNotice(
        'Component studies only. Both Android concepts remain open for D2 interaction testing.',
        tone: NoticeTone.information,
      ),
      const SizedBox(height: 24),
      AdaptivePair(
        children: [
          CraftPanel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const SectionTitle(
                  'Windows rail',
                  caption: 'Use Compact specimens in viewing preferences to compare icon mode.',
                ),
                Align(
                  alignment: Alignment.centerLeft,
                  child: SizedBox(
                    width: widget.compact ? 80 : 240,
                    child: destinations(rail: true),
                  ),
                ),
              ],
            ),
          ),
          CraftPanel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SectionTitle(
                  'Contextual action dock',
                  caption: 'A bounded tool tray, separate from destination navigation.',
                ),
                dock(),
                const SizedBox(height: 16),
                Text(
                  'Selected destination: ${specimenDestinations[selected].$1}',
                ),
              ],
            ),
          ),
        ],
      ),
      const SizedBox(height: 24),
      CraftPanel(
        padding: 12,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const SectionTitle(
              'Android A · anchored',
              caption: 'Five destinations; Add occupies its own row. Narrow/large-text study uses the labeled fallback list.',
            ),
            Center(
              child: FilledButton.icon(
                onPressed: () => action('Add'),
                icon: const Icon(Icons.add),
                label: const Text('Add'),
              ),
            ),
            const SizedBox(height: 12),
            destinations(),
          ],
        ),
      ),
      const SizedBox(height: 24),
      CraftPanel(
        padding: 12,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const SectionTitle(
              'Android B · floating',
              caption:
                  'Inset navigation with a separate, expandable action shelf.',
            ),
            Align(
              alignment: Alignment.centerRight,
              child: OutlinedButton.icon(
                onPressed: () => setState(() => shelf = !shelf),
                icon: Icon(shelf ? Icons.expand_less : Icons.expand_more),
                label: const Text('Quick actions'),
              ),
            ),
            if (shelf)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: dock(),
              ),
            const SizedBox(height: 12),
            destinations(capsule: true),
          ],
        ),
      ),
    ],
  );
}
````

## apps/salapiya/lib/gallery/review_editor.dart

````dart
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../design_system/components.dart';
import '../design_system/theme.dart';
import '../prototype/fixtures.dart';

enum ReviewPresentation { dialog, sheet, panel }

Future<void> openReview(
  BuildContext context,
  ReviewPresentation presentation,
) async {
  final focus = FocusManager.instance.primaryFocus;
  final reduce = MediaQuery.disableAnimationsOf(context);
  final editor = DemoReviewEditor(presentation: presentation);
  if (presentation == ReviewPresentation.sheet) {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      isDismissible: false,
      enableDrag: false,
      sheetAnimationStyle: reduce
          ? AnimationStyle.noAnimation
          : const AnimationStyle(duration: Duration(milliseconds: 200)),
      builder: (_) => editor,
    );
  } else {
    await showGeneralDialog<void>(
      context: context,
      barrierDismissible: false,
      barrierLabel: 'Review specimen',
      transitionDuration: reduce
          ? Duration.zero
          : const Duration(milliseconds: 160),
      pageBuilder: (context, _, _) => SafeArea(
        child: presentation == ReviewPresentation.panel
            ? Align(
                alignment: Alignment.centerRight,
                child: SizedBox(
                  width: 520,
                  child: Material(
                    color: CraftTheme.of(context).raised,
                    child: editor,
                  ),
                ),
              )
            : Dialog(
                insetPadding: const EdgeInsets.all(16),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 520),
                  child: editor,
                ),
              ),
      ),
    );
  }
  if (focus?.context != null) focus!.requestFocus();
}

/// Entirely synthetic draft; intentionally no persistence/application service.
class DemoReviewEditor extends StatefulWidget {
  const DemoReviewEditor({super.key, required this.presentation});
  final ReviewPresentation presentation;
  @override
  State<DemoReviewEditor> createState() => _DemoReviewEditorState();
}

class _DemoReviewEditorState extends State<DemoReviewEditor> {
  final amount = TextEditingController(text: '185.50');
  final form = GlobalKey<FormState>();
  final editorFocus = FocusNode(debugLabel: 'Review editor');
  bool dirty = false, review = false, unknown = false, closed = false;
  @override
  void dispose() {
    editorFocus.dispose();
    amount.dispose();
    super.dispose();
  }

  Future<void> dismiss() async {
    if (closed) return;
    if (dirty) {
      final discard = await showDialog<bool>(
        context: context,
        animationStyle: MediaQuery.disableAnimationsOf(context)
            ? AnimationStyle.noAnimation
            : null,
        barrierDismissible: false,
        builder: (context) => AlertDialog(
          title: const Text('Discard demo changes?'),
          content: const Text(
            'This draft only exists in memory. You can keep editing or discard it.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Keep editing'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Discard draft'),
            ),
          ],
        ),
      );
      if (discard != true || !mounted) return;
    }
    setState(() => closed = true);
    // PopScope must rebuild before programmatic dismissal.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) Navigator.pop(context);
    });
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: closed,
    onPopInvokedWithResult: (didPop, _) {
      if (!didPop) dismiss();
    },
    child: CallbackShortcuts(
      bindings: {const SingleActivator(LogicalKeyboardKey.escape): dismiss},
      child: Focus(
        focusNode: editorFocus,
        autofocus: true,
        child: SingleChildScrollView(
          padding: EdgeInsets.fromLTRB(
            24,
            8,
            24,
            24 + MediaQuery.viewInsetsOf(context).bottom,
          ),
          child: Form(
            key: form,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const SizedBox(height: 16),
                SectionTitle(
                  unknown
                      ? 'Outcome unknown'
                      : review
                      ? 'Review demo expense'
                      : 'Edit demo expense',
                  caption: 'Private · Cash wallet · Demonstration only',
                ),
                if (unknown)
                  const StatusNotice(
                    'We cannot confirm the simulated outcome. No record was saved. In a real workflow, check status before retrying.',
                    tone: NoticeTone.warning,
                    live: true,
                  )
                else if (review)
                  ReviewRows(
                    rows: [
                      ('Account', 'Cash wallet'),
                      (
                        'Amount',
                        DemoMoney.format(DemoMoney.parse(amount.text)!),
                      ),
                      ('Date', '21 Oct 2026'),
                      ('Coverage', 'This isolated example only'),
                    ],
                  )
                else ...[
                  TextFormField(
                    key: const ValueKey('review-amount'),
                    controller: amount,
                    autofocus: true,
                    keyboardType: const TextInputType.numberWithOptions(
                      decimal: true,
                    ),
                    decoration: const InputDecoration(
                      labelText: 'Amount in Philippine pesos',
                      prefixText: '₱ ',
                      helperText: 'Use up to two decimals. Example: 185.50',
                    ),
                    validator: DemoMoney.validate,
                    onChanged: (_) => setState(() => dirty = true),
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'Changing this example does not change any account balance.',
                  ),
                ],
                const SizedBox(height: 24),
                Wrap(
                  spacing: 12,
                  runSpacing: 12,
                  children: [
                    OutlinedButton(
                      onPressed: dismiss,
                      child: const Text('Close draft'),
                    ),
                    if (review && !unknown)
                      TextButton(
                        onPressed: () => setState(() => review = false),
                        child: const Text('Edit'),
                      ),
                    if (!review && !unknown)
                      FilledButton(
                        onPressed: () {
                          if (form.currentState!.validate()) {
                            editorFocus.requestFocus();
                            setState(() => review = true);
                          }
                        },
                        child: const Text('Review'),
                      ),
                    if (review && !unknown)
                      FilledButton(
                        onPressed: () => setState(() {
                          unknown = true;
                          dirty = true;
                        }),
                        child: const Text('Simulate unknown outcome'),
                      ),
                    if (unknown)
                      TextButton(
                        onPressed: () => setState(() {
                          unknown = false;
                          review = true;
                        }),
                        child: const Text('Inspect draft'),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    ),
  );
}
````

## apps/salapiya/lib/gallery/settings.dart

````dart
import 'package:flutter/material.dart';

enum GallerySection {
  foundations('Foundations', Icons.auto_awesome_outlined),
  typography('Typography', Icons.text_fields_rounded),
  actions('Actions & forms', Icons.tune_rounded),
  finance('Money specimens', Icons.account_balance_wallet_outlined),
  navigation('Navigation studies', Icons.space_dashboard_outlined),
  overlays('Overlays & review', Icons.layers_outlined),
  feedback('Feedback & status', Icons.chat_bubble_outline_rounded),
  branding('Brand & craft', Icons.texture_rounded);

  const GallerySection(this.label, this.icon);
  final String label;
  final IconData icon;
}

class GallerySettings extends ChangeNotifier {
  ThemeMode themeMode = ThemeMode.system;
  bool effects = true, reduceMotion = false, compact = false;
  double? textScale;
  GallerySection section = GallerySection.foundations;
  int resetRevision = 0;
  void change(VoidCallback update) {
    update();
    notifyListeners();
  }

  void reset() => change(() {
    themeMode = ThemeMode.system;
    effects = true;
    reduceMotion = false;
    compact = false;
    textScale = null;
    section = GallerySection.foundations;
    resetRevision++;
  });
}
````

## apps/salapiya/lib/gallery/specimens.dart

````dart
import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../design_system/components.dart';
import '../design_system/craft.dart';
import 'navigation_study.dart';
import '../design_system/theme.dart';
import '../prototype/fixtures.dart';
import 'review_editor.dart';
import 'settings.dart';

class GallerySpecimens extends StatefulWidget {
  const GallerySpecimens({
    super.key,
    required this.section,
    required this.compact,
  });
  final GallerySection section;
  final bool compact;
  @override
  State<GallerySpecimens> createState() => _GallerySpecimensState();
}

class _GallerySpecimensState extends State<GallerySpecimens> {
  final amount = TextEditingController(text: '185.50');
  final form = GlobalKey<FormState>();
  bool checked = true, busy = false, svg = false;
  String account = 'Cash wallet', radio = 'Private', result = '';
  DateTime date = DateTime(2026, 10, 21);
  DemoCoverage coverage = DemoCoverage.complete;
  DemoSync sync = DemoSync.localOnly;
  DemoReceipt receipt = DemoReceipt.awaiting;
  @override
  void dispose() {
    amount.dispose();
    super.dispose();
  }

  void announce(String message) =>
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(message)));
  Widget stack(List<Widget> children) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      for (var i = 0; i < children.length; i++) ...[
        if (i > 0) const SizedBox(height: 24),
        children[i],
      ],
    ],
  );
  Widget panel(String title, String caption, Widget content) => CraftPanel(
    padding: widget.compact ? 16 : 24,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionTitle(title, caption: caption),
        content,
      ],
    ),
  );
  @override
  Widget build(BuildContext context) => switch (widget.section) {
    GallerySection.foundations => foundations(),
    GallerySection.typography => typography(),
    GallerySection.actions => actions(),
    GallerySection.finance => finance(),
    GallerySection.navigation => NavigationStudy(compact: widget.compact),
    GallerySection.overlays => overlays(),
    GallerySection.feedback => feedback(),
    GallerySection.branding => branding(),
  };

  Widget foundations() {
    final c = CraftTheme.of(context);
    return stack([
      CraftPanel(
        focal: true,
        child: LayoutBuilder(
          builder: (context, box) => Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (box.maxWidth <= 500 && CraftPreferences.effectsOf(context))
                const Padding(
                  padding: EdgeInsets.only(bottom: 16),
                  child: CraftMotif(size: 56),
                ),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Made with care.\nClear by design.',
                          style: Theme.of(context).textTheme.displaySmall,
                        ),
                        const SizedBox(height: 12),
                        const Text(
                          'A calm place for everyday decisions, shaped by the warmth and rhythm of Filipino craft.',
                        ),
                      ],
                    ),
                  ),
                  if (box.maxWidth > 500)
                    const Padding(
                      padding: EdgeInsets.only(left: 32),
                      child: CraftMotif(size: 144),
                    ),
                ],
              ),
              const SizedBox(height: 24),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  Chip(label: Text(c.dark ? 'Midnight Spectrum' : 'Porcelain')),
                  const Chip(label: Text('Nunito Sans')),
                  const Chip(label: Text('Woven Calm')),
                ],
              ),
            ],
          ),
        ),
      ),
      AdaptivePair(
        children: [
          panel(
            'A considered palette',
            'Semantic roles keep money and meaning legible.',
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                for (final swatch in <(String, Color, Color)>[
                  ('Violet', c.primary, c.onPrimary),
                  ('Warm craft', c.warmSurface, c.warm),
                  ('Plum', c.plumSurface, c.plum),
                  ('Blue', c.blueSurface, c.blue),
                ])
                  Container(
                    width: 120,
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: swatch.$2,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      swatch.$1,
                      style: TextStyle(
                        color: swatch.$3,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
              ],
            ),
          ),
          panel(
            'Surfaces with purpose',
            'Opaque reading surfaces. Expressive framing stays at the edge.',
            stack([
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: c.subtle,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Text('Inset · quiet context'),
              ),
              const CraftPanel(
                padding: 16,
                child: Text('Base · content and controls'),
              ),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: c.raised,
                  boxShadow: CraftPreferences.effectsOf(context)
                      ? c.shadow
                      : null,
                  border: Border.all(color: c.divider),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: const Text('Raised · focused attention'),
              ),
            ]),
          ),
        ],
      ),
      panel(
        'Rhythm & geometry',
        '4 / 8 / 12 / 16 / 24 / 32 spacing · 12 control / 20 card / 24 dialog corners',
        Wrap(
          spacing: 16,
          runSpacing: 16,
          crossAxisAlignment: WrapCrossAlignment.end,
          children: [
            for (final n in [4, 8, 12, 16, 24, 32])
              Column(
                children: [
                  Container(
                    width: n.toDouble(),
                    height: n.toDouble(),
                    decoration: BoxDecoration(
                      color: c.primary,
                      borderRadius: BorderRadius.circular(4),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text('$n'),
                ],
              ),
            const CraftMotif(size: 80),
          ],
        ),
      ),
      const StatusNotice(
        'Craft effects can be switched off. Financial values, labels and statuses remain unchanged.',
        tone: NoticeTone.information,
      ),
    ]);
  }

  Widget typography() => stack([
    const StatusNotice(
      'Nunito Sans is the approved baseline. Geist and Source Sans 3 are comparison specimens only. All fonts are bundled offline.',
      tone: NoticeTone.information,
    ),
    for (final family in ['Nunito Sans', 'Geist', 'Source Sans 3'])
      CraftPanel(
        child: DefaultTextStyle.merge(
          style: TextStyle(
            fontFamily: family,
            fontSize: 16,
            height: 1.5,
            fontFeatures: const [FontFeature.tabularFigures()],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                family,
                style: TextStyle(
                  fontFamily: family,
                  fontSize: 26,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 16),
              const Text(
                'Your everyday, thoughtfully connected.',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 12),
              const Text(
                'Overview · Money · Debts · Shared · Life',
                style: TextStyle(fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 12),
              const Text(
                'A little clarity goes a long way. Review the source and coverage before making a decision.',
              ),
              const SizedBox(height: 12),
              const Text('Everyday bank — family savings and rainy-day fund'),
              const Text(
                'Amount in Philippine pesos',
                style: TextStyle(fontWeight: FontWeight.w600),
              ),
              Text(
                'Enter an amount greater than zero.',
                style: TextStyle(
                  color: CraftTheme.of(context).tone(NoticeTone.error).$1,
                ),
              ),
              const SizedBox(height: 16),
              const Text(
                '₱29,300.75     −₱185.50',
                style: TextStyle(fontSize: 24, fontWeight: FontWeight.w600),
              ),
              const Text('21 Oct 2026 · Miyerkules'),
              const Text(
                'Áá Éé Íí Óó Úú Ññ · Kumusta, kaibigan?\nPag-iimpok para sa pamilya. Bayanihan.',
              ),
              const SizedBox(height: 16),
              const Align(
                alignment: Alignment.centerRight,
                child: Text(
                  '₱11,111.11\n₱88,888.88\n₱00,000.00',
                  textAlign: TextAlign.right,
                ),
              ),
            ],
          ),
        ),
      ),
  ]);

  Widget actions() => stack([
    panel(
      'Actions, with intention',
      'Tab through controls to inspect focus. Hover and press on Windows.',
      Wrap(
        spacing: 12,
        runSpacing: 12,
        children: [
          FilledButton(
            onPressed: () => announce('Primary demo action activated.'),
            child: const Text('Primary action'),
          ),
          OutlinedButton(
            onPressed: () => announce('Secondary demo action activated.'),
            child: const Text('Secondary action'),
          ),
          TextButton(
            onPressed: () => announce('Text demo action activated.'),
            child: const Text('Text action'),
          ),
          OutlinedButton.icon(
            style: OutlinedButton.styleFrom(
              foregroundColor: CraftTheme.of(context).tone(NoticeTone.error).$1,
            ),
            onPressed: () async {
              final confirmed = await showDialog<bool>(
                context: context,
                builder: (context) => AlertDialog(
                  title: const Text('Discard example?'),
                  content: const Text(
                    'Only the demonstration state will change.',
                  ),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.pop(context, false),
                      child: const Text('Cancel'),
                    ),
                    FilledButton(
                      onPressed: () => Navigator.pop(context, true),
                      child: const Text('Discard example'),
                    ),
                  ],
                ),
              );
              if (confirmed == true && mounted) {
                announce('Example discarded. No financial record was changed.');
              }
            },
            icon: const Icon(Icons.delete_outline),
            label: const Text('Destructive action'),
          ),
          IconButton(
            tooltip: 'Inspect source',
            onPressed: () => announce('Source: synthetic fixture F-EXPENSE.'),
            icon: const Icon(Icons.info_outline),
          ),
          const FilledButton(onPressed: null, child: Text('Disabled action')),
          BusyAction(
            busy: busy,
            label: 'Simulate processing',
            onPressed: () => setState(() => busy = true),
          ),
          if (busy)
            TextButton(
              onPressed: () => setState(() => busy = false),
              child: const Text('Reset busy state'),
            ),
        ],
      ),
    ),
    panel(
      'An approachable form',
      'Persistent labels, explicit help and exact decimal parsing.',
      Form(
        key: form,
        child: stack([
          TextFormField(
            key: const ValueKey('demo-amount'),
            controller: amount,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(
              labelText: 'Amount in Philippine pesos',
              prefixText: '₱ ',
              helperText:
                  'Example: 185.50. No commas; at most two decimal places.',
            ),
            validator: DemoMoney.validate,
          ),
          DropdownButtonFormField<String>(
            initialValue: account,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Source account'),
            items: [
              for (final a in demoAccounts)
                DropdownMenuItem(value: a.$1, child: Text(a.$1)),
            ],
            onChanged: (v) => setState(() => account = v!),
          ),
          const TextFormFieldReadOnly(),
          const TextField(
            enabled: false,
            decoration: InputDecoration(
              labelText: 'Unavailable field',
              hintText: 'Disabled specimen',
            ),
          ),
          RadioGroup<String>(
            groupValue: radio,
            onChanged: (v) => setState(() => radio = v!),
            child: Column(
              children: [
                for (final v in ['Private', 'Shared specimen'])
                  RadioListTile<String>(
                    contentPadding: EdgeInsets.zero,
                    title: Text(v),
                    value: v,
                  ),
              ],
            ),
          ),
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Include a note in this demo'),
            value: checked,
            onChanged: (v) => setState(() => checked = v!),
          ),
          OutlinedButton.icon(
            onPressed: () async {
              final picked = await showDatePicker(
                context: context,
                initialDate: date,
                firstDate: DateTime(2026),
                lastDate: DateTime(2027),
              );
              if (picked != null && mounted) setState(() => date = picked);
            },
            icon: const Icon(Icons.calendar_today_outlined),
            label: Text('Date · ${date.day}/${date.month}/${date.year}'),
          ),
          Align(
            alignment: Alignment.centerLeft,
            child: FilledButton(
              onPressed: () {
                if (form.currentState!.validate()) {
                  setState(
                    () => result =
                        'Valid demo amount: ${DemoMoney.format(DemoMoney.parse(amount.text)!)}. Nothing saved.',
                  );
                } else {
                  setState(() => result = 'Please correct the amount above.');
                }
              },
              child: const Text('Validate example'),
            ),
          ),
          if (result.isNotEmpty)
            StatusNotice(
              result,
              live: true,
              tone: result.startsWith('Valid')
                  ? NoticeTone.success
                  : NoticeTone.error,
            ),
        ]),
      ),
    ),
  ]);

  Widget finance() {
    final unavailable = [
      DemoCoverage.empty,
      DemoCoverage.loading,
      DemoCoverage.error,
    ].contains(coverage);
    return stack([
      DropdownButtonFormField<DemoCoverage>(
        initialValue: coverage,
        isExpanded: true,
        decoration: const InputDecoration(
          labelText: 'Financial coverage scenario',
        ),
        items: [
          for (final s in DemoCoverage.values)
            DropdownMenuItem(value: s, child: Text(s.name)),
        ],
        onChanged: (v) => setState(() => coverage = v!),
      ),
      if (coverage == DemoCoverage.empty)
        const EmptyPanel(
          title: 'No accounts in this example',
          message: 'An empty list does not mean a verified zero balance.',
        ),
      if (coverage == DemoCoverage.loading)
        const StatusNotice(
          'Loading specimen · totals are withheld until coverage is known.',
        ),
      if (coverage == DemoCoverage.error)
        StatusNotice(
          'Could not load the example. No balance is available.',
          tone: NoticeTone.error,
          action: TextButton(
            onPressed: () => setState(() => coverage = DemoCoverage.complete),
            child: const Text('Retry demo'),
          ),
        ),
      if (coverage == DemoCoverage.incomplete)
        const StatusNotice(
          'Incomplete download · known balances only. Overall total withheld.',
          tone: NoticeTone.warning,
        ),
      if (coverage == DemoCoverage.pending)
        const StatusNotice(
          'Pending expense · projected total is separate from the last accepted total.',
          tone: NoticeTone.information,
        ),
      AdaptivePair(
        children: [
          MoneySummary(
            label: 'Liquid money · actual',
            value: unavailable || coverage == DemoCoverage.incomplete
                ? null
                : DemoMoney.format(DemoMoney.liquid),
            coverage: 'Three synthetic accounts · F-BASE',
            detail: 'Credit card liability is excluded.',
            onDetails: () => showDialog<void>(
              context: context,
              builder: (context) => AlertDialog(
                title: const Text('Coverage & sources'),
                content: const ReviewRows(
                  rows: [
                    ('Coverage', 'Cash wallet, Everyday bank, Mobile wallet'),
                    ('Basis', 'Accepted fixture F-BASE'),
                    ('Excluded', 'Card liability and projected changes'),
                  ],
                ),
                actions: [
                  TextButton(
                    onPressed: () => Navigator.pop(context),
                    child: const Text('Close details'),
                  ),
                ],
              ),
            ),
          ),
          MoneySummary(
            label: coverage == DemoCoverage.pending
                ? 'Liquid money · projected'
                : 'Card liability · separate',
            value: unavailable
                ? null
                : coverage == DemoCoverage.pending
                ? DemoMoney.format(DemoMoney.liquid - DemoMoney.expense)
                : DemoMoney.format(DemoMoney.card),
            coverage: coverage == DemoCoverage.pending
                ? 'After pending ₱185.50 expense · not accepted'
                : 'Amount owed · never added to liquid money',
          ),
        ],
      ),
      if (!unavailable)
        panel(
          'Recent activity',
          'Explicit directions; transfers are never called income.',
          Column(
            children: [
              RecordRow(
                title: 'Food & transport',
                subtitle: '21 Oct 2026 · Cash wallet · Expense',
                amount: '−₱185.50',
                icon: Icons.north_east,
                onDetails: () => openReview(context, ReviewPresentation.dialog),
              ),
              RecordRow(
                title: 'Bank to mobile wallet',
                subtitle: 'Own-account transfer · separate fee ₱10.00',
                amount: '₱1,000.00',
                icon: Icons.swap_horiz,
                onDetails: () => announce(
                  'Transfer principal does not change total liquid money. Fee reduces it by ₱10.00.',
                ),
              ),
              RecordRow(
                title: 'Shared settlement received',
                subtitle: 'Incoming cash · not new income',
                amount: '+₱800.00',
                icon: Icons.south_west,
                onDetails: () => announce(
                  'Synthetic settlement specimen. No account changed.',
                ),
              ),
            ],
          ),
        ),
      if (!unavailable)
        panel(
          'Account balances',
          'Exact centavos formatted at the presentation boundary. Scroll the table horizontally if needed.',
          SingleChildScrollView(
            key: const PageStorageKey('account-table-scroll'),
            scrollDirection: Axis.horizontal,
            child: DataTable(
              columns: const [
                DataColumn(label: Text('Account')),
                DataColumn(label: Text('Balance'), numeric: true),
              ],
              rows: [
                for (final a in demoAccounts)
                  DataRow(
                    cells: [
                      DataCell(Text(a.$1)),
                      DataCell(
                        AmountText(DemoMoney.format(BigInt.parse(a.$2))),
                      ),
                    ],
                  ),
              ],
            ),
          ),
        ),
      panel(
        'Upcoming & debt context',
        'Expected obligations are not actual expenses.',
        const ReviewRows(
          rows: [
            ('Electricity · expected 25 Oct', '₱1,850.00'),
            ('Debt · due 28 Oct', '₱2,000.00'),
            ('Debt payment · actual paid', '₱2,050.00'),
            ('Contractual / external fee', '₱2,000.00 / ₱50.00'),
            ('Unresolved breakdown', 'Principal and interest unavailable'),
          ],
        ),
      ),
      ExpansionTile(
        key: const PageStorageKey('expense-allocation-detail'),
        title: const Text('Inspect isolated expense allocation'),
        childrenPadding: const EdgeInsets.all(16),
        children: const [
          ReviewRows(
            rows: [
              ('Food', '₱150.00'),
              ('Transport', '₱35.50'),
              ('Wallet after expense', '₱1,064.50'),
            ],
          ),
        ],
      ),
    ]);
  }

  Widget overlays() => stack([
    panel(
      'A focused moment',
      'The same review/edit content adapts to three presentations. Escape or system Back respects dirty drafts.',
      Wrap(
        spacing: 12,
        runSpacing: 12,
        children: [
          for (final p in ReviewPresentation.values)
            FilledButton.icon(
              onPressed: () => openReview(context, p),
              icon: Icon(
                p == ReviewPresentation.sheet
                    ? Icons.vertical_align_bottom
                    : p == ReviewPresentation.panel
                    ? Icons.view_sidebar_outlined
                    : Icons.layers_outlined,
              ),
              label: Text('Open ${p.name}'),
            ),
        ],
      ),
    ),
    const StatusNotice(
      'Try an invalid amount, Review → Edit, then close a changed draft. “Keep editing” preserves it. Simulate unknown outcome to see cautious recovery language.',
      tone: NoticeTone.information,
    ),
    const EmptyPanel(
      title: 'Review before committing',
      message: 'Source, amount, date and coverage stay visible together. This gallery never commits a financial action.',
    ),
  ]);

  Widget feedback() => stack([
    const EmptyPanel(
      title: 'A quiet beginning',
      message: 'No items in this synthetic example. Add controls elsewhere are only demonstrations.',
    ),
    panel(
      'Synchronization status',
      'A transport status is not recipient confirmation.',
      DropdownButtonFormField<DemoSync>(
        initialValue: sync,
        isExpanded: true,
        decoration: const InputDecoration(labelText: 'Sync specimen'),
        items: [
          for (final s in DemoSync.values)
            DropdownMenuItem(value: s, child: Text(s.name)),
        ],
        onChanged: (v) => setState(() => sync = v!),
      ),
    ),
    StatusNotice(
      switch (sync) {
        DemoSync.localOnly =>
          'Local-only · on this device; no remote backup claimed.',
        DemoSync.offline =>
          'Offline · connection unavailable; inspect local coverage.',
        DemoSync.waiting => 'Waiting for synchronization · not submitted yet.',
        DemoSync.pending => 'Pending acceptance · sent, but not yet accepted.',
        DemoSync.reconciled => 'Synced · server accepted and reconciled. Recipient confirmation remains separate.',
      },
      tone: sync == DemoSync.reconciled
          ? NoticeTone.success
          : NoticeTone.information,
      live: true,
    ),
    panel(
      'Recipient confirmation',
      'Business evidence, independent from sync.',
      DropdownButtonFormField<DemoReceipt>(
        initialValue: receipt,
        isExpanded: true,
        decoration: const InputDecoration(labelText: 'Receipt specimen'),
        items: [
          for (final s in DemoReceipt.values)
            DropdownMenuItem(value: s, child: Text(s.name)),
        ],
        onChanged: (v) => setState(() => receipt = v!),
      ),
    ),
    StatusNotice(
      switch (receipt) {
        DemoReceipt.awaiting =>
          'Awaiting recipient confirmation · receipt not confirmed.',
        DemoReceipt.confirmed =>
          'Recipient confirmed · synthetic evidence only.',
        DemoReceipt.manual => 'Manually recorded · not recipient-confirmed.',
      },
      tone: receipt == DemoReceipt.confirmed
          ? NoticeTone.success
          : NoticeTone.warning,
      live: true,
    ),
    const StatusNotice('Loading · requesting the example. No amount implied.'),
    StatusNotice(
      'Error · the example could not be loaded.',
      tone: NoticeTone.error,
      action: TextButton(
        onPressed: () =>
            announce('Demo retry requested. No network request was made.'),
        child: const Text('Retry example'),
      ),
    ),
    const StatusNotice(
      'Incomplete download · some records are missing; totals may be unavailable.',
      tone: NoticeTone.warning,
    ),
    const StatusNotice(
      'Unavailable information · do not substitute a zero or guess a breakdown.',
    ),
  ]);

  Widget branding() {
    final c = CraftTheme.of(context);
    const variants = <(String, String, String, bool)>[
      ('Symbol', 'mark/salapiya_mark.svg', 'salapiya_mark.png', false),
      (
        'Horizontal · light',
        'horizontal/salapiya_horizontal_on_light.svg',
        'salapiya_horizontal_on_light.png',
        false,
      ),
      (
        'Horizontal · dark',
        'horizontal/salapiya_horizontal_on_dark.svg',
        'salapiya_horizontal_on_dark.png',
        true,
      ),
      (
        'Vertical · light',
        'vertical/salapiya_vertical_on_light.svg',
        'salapiya_vertical_on_light.png',
        false,
      ),
      (
        'Vertical · dark',
        'vertical/salapiya_vertical_on_dark.svg',
        'salapiya_vertical_on_dark.png',
        true,
      ),
      (
        'Original · archival',
        'source/salapiya_original.svg',
        'salapiya_original.png',
        true,
      ),
    ];
    return stack([
      SwitchListTile(
        contentPadding: EdgeInsets.zero,
        title: const Text('Compare SVG renderer'),
        subtitle: const Text(
          'Off: transparent browser display exports. On: unchanged source through flutter_svg.',
        ),
        value: svg,
        onChanged: (v) => setState(() => svg = v),
      ),
      AdaptivePair(
        children: [
          for (final v in variants)
            panel(
              v.$1,
              svg
                  ? 'flutter_svg 2.3.0 · source fidelity specimen'
                  : 'Transparent source export · preserved color',
              Container(
                height: 192,
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: v.$4 ? Palette.midnight : Palette.porcelain,
                  border: Border.all(color: c.divider),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: svg
                    ? SvgPicture.asset(
                        'assets/branding/${v.$2}',
                        semanticsLabel: v.$1,
                        fit: BoxFit.contain,
                      )
                    : Image.asset(
                        'assets/branding/display/${v.$3}',
                        semanticLabel: v.$1,
                        fit: BoxFit.contain,
                      ),
              ),
            ),
        ],
      ),
      panel(
        'Clear space & practical scale',
        'A quarter-symbol clear space is reserved around the mark. No recoloring or stretching.',
        Wrap(
          spacing: 24,
          runSpacing: 16,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            for (final size in [24.0, 32.0, 48.0, 64.0])
              Column(
                children: [
                  Padding(
                    padding: EdgeInsets.all(size / 4),
                    child: BrandMark(size: size),
                  ),
                  Text('${size.toInt()} px'),
                ],
              ),
          ],
        ),
      ),
      AdaptivePair(
        children: [
          for (final lattice in [false, true])
            CraftPanel(
              focal: true,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  CraftMotif(size: 96, lattice: lattice),
                  const SizedBox(height: 16),
                  SectionTitle(
                    lattice
                        ? 'Luminous Lattice · comparison'
                        : 'Woven Calm · selected',
                    caption: 'A little clarity, every day.',
                  ),
                  const CraftPanel(
                    padding: 16,
                    child: Text('Your next step is yours to choose.'),
                  ),
                ],
              ),
            ),
        ],
      ),
      const StatusNotice(
        'The supplied logos remain unchanged. The abstract craft motifs are separate UI decoration, never a replacement logo.',
        tone: NoticeTone.information,
      ),
    ]);
  }
}

class TextFormFieldReadOnly extends StatelessWidget {
  const TextFormFieldReadOnly({super.key});
  @override
  Widget build(BuildContext context) => TextFormField(
    initialValue: 'Synthetic source · F-EXPENSE',
    readOnly: true,
    decoration: const InputDecoration(
      labelText: 'Source reference · read only',
    ),
  );
}
````

## apps/salapiya/lib/prototype/fixtures.dart

````dart
/// Synthetic presentation fixtures only. No production ledger or persistence.
abstract final class DemoMoney {
  static final liquid = BigInt.from(2930075);
  static final expense = BigInt.from(18550);
  static final card = BigInt.from(480000);
  static final maximumInput = BigInt.from(100000000000);

  static BigInt? parse(String input) {
    if (!RegExp(r'^(0|[1-9]\d*)(\.\d{1,2})?$').hasMatch(input)) return null;
    final parts = input.split('.');
    return BigInt.parse(parts[0]) * BigInt.from(100) +
        BigInt.parse(parts.length == 1 ? '0' : parts[1].padRight(2, '0'));
  }

  static String? validate(String? input) {
    final value = parse(input ?? '');
    if (value == null) {
      return 'Enter pesos with up to two decimals, without commas.';
    }
    if (value <= BigInt.zero) return 'Enter an amount greater than zero.';
    if (value > maximumInput) return 'Amount exceeds the demonstration limit.';
    return null;
  }

  static String format(BigInt value) {
    final digits = (value.abs() ~/ BigInt.from(100)).toString();
    final grouped = digits.replaceAllMapped(
      RegExp(r'(\d)(?=(\d{3})+$)'),
      (m) => '${m[1]},',
    );
    final cents = (value.abs() % BigInt.from(100)).toString().padLeft(2, '0');
    return '${value.isNegative ? '−' : ''}₱$grouped.$cents';
  }
}

enum DemoCoverage { complete, pending, incomplete, empty, loading, error }

enum DemoSync { localOnly, offline, waiting, pending, reconciled }

enum DemoReceipt { awaiting, confirmed, manual }

const demoAccounts = <(String, String)>[
  ('Cash wallet', '125000'),
  ('Everyday bank', '2485050'),
  ('Mobile wallet', '320025'),
];
````

## apps/salapiya/pubspec.lock

````yaml
# Generated by pub
# See https://dart.dev/tools/pub/glossary#lockfile
packages:
  args:
    dependency: transitive
    description:
      name: args
      sha256: d0481093c50b1da8910eb0bb301626d4d8eb7284aa739614d2b394ee09e3ea04
      url: "https://pub.dev"
    source: hosted
    version: "2.7.0"
  async:
    dependency: transitive
    description:
      name: async
      sha256: e2eb0491ba5ddb6177742d2da23904574082139b07c1e33b8503b9f46f3e1a37
      url: "https://pub.dev"
    source: hosted
    version: "2.13.1"
  boolean_selector:
    dependency: transitive
    description:
      name: boolean_selector
      sha256: "8aab1771e1243a5063b8b0ff68042d67334e3feab9e95b9490f9a6ebf73b42ea"
      url: "https://pub.dev"
    source: hosted
    version: "2.1.2"
  characters:
    dependency: transitive
    description:
      name: characters
      sha256: faf38497bda5ead2a8c7615f4f7939df04333478bf32e4173fcb06d428b5716b
      url: "https://pub.dev"
    source: hosted
    version: "1.4.1"
  clock:
    dependency: transitive
    description:
      name: clock
      sha256: e51d50bca3217c9a9fa2b41a30e4a38971133f5f9ec7a3d57bae095007f1d28e
      url: "https://pub.dev"
    source: hosted
    version: "1.1.3"
  collection:
    dependency: transitive
    description:
      name: collection
      sha256: "2f5709ae4d3d59dd8f7cd309b4e023046b57d8a6c82130785d2b0e5868084e76"
      url: "https://pub.dev"
    source: hosted
    version: "1.19.1"
  fake_async:
    dependency: transitive
    description:
      name: fake_async
      sha256: "5368f224a74523e8d2e7399ea1638b37aecfca824a3cc4dfdf77bf1fa905ac44"
      url: "https://pub.dev"
    source: hosted
    version: "1.3.3"
  file:
    dependency: transitive
    description:
      name: file
      sha256: a3b4f84adafef897088c160faf7dfffb7696046cb13ae90b508c2cbc95d3b8d4
      url: "https://pub.dev"
    source: hosted
    version: "7.0.1"
  flutter:
    dependency: "direct main"
    description: flutter
    source: sdk
    version: "0.0.0"
  flutter_driver:
    dependency: transitive
    description: flutter
    source: sdk
    version: "0.0.0"
  flutter_lints:
    dependency: "direct dev"
    description:
      name: flutter_lints
      sha256: "3105dc8492f6183fb076ccf1f351ac3d60564bff92e20bfc4af9cc1651f4e7e1"
      url: "https://pub.dev"
    source: hosted
    version: "6.0.0"
  flutter_svg:
    dependency: "direct main"
    description:
      name: flutter_svg
      sha256: "35882981abcbfb8c15b286f0cd690ff25bac12d95eff3e25ee207f37d4c42e7f"
      url: "https://pub.dev"
    source: hosted
    version: "2.3.0"
  flutter_test:
    dependency: "direct dev"
    description: flutter
    source: sdk
    version: "0.0.0"
  fuchsia_remote_debug_protocol:
    dependency: transitive
    description: flutter
    source: sdk
    version: "0.0.0"
  http:
    dependency: transitive
    description:
      name: http
      sha256: "87721a4a50b19c7f1d49001e51409bddc46303966ce89a65af4f4e6004896412"
      url: "https://pub.dev"
    source: hosted
    version: "1.6.0"
  http_parser:
    dependency: transitive
    description:
      name: http_parser
      sha256: "178d74305e7866013777bab2c3d8726205dc5a4dd935297175b19a23a2e66571"
      url: "https://pub.dev"
    source: hosted
    version: "4.1.2"
  integration_test:
    dependency: "direct dev"
    description: flutter
    source: sdk
    version: "0.0.0"
  leak_tracker:
    dependency: transitive
    description:
      name: leak_tracker
      sha256: "33e2e26bdd85a0112ec15400c8cbffea70d0f9c3407491f672a2fad47915e2de"
      url: "https://pub.dev"
    source: hosted
    version: "11.0.2"
  leak_tracker_flutter_testing:
    dependency: transitive
    description:
      name: leak_tracker_flutter_testing
      sha256: "1dbc140bb5a23c75ea9c4811222756104fbcd1a27173f0c34ca01e16bea473c1"
      url: "https://pub.dev"
    source: hosted
    version: "3.0.10"
  leak_tracker_testing:
    dependency: transitive
    description:
      name: leak_tracker_testing
      sha256: "8d5a2d49f4a66b49744b23b018848400d23e54caf9463f4eb20df3eb8acb2eb1"
      url: "https://pub.dev"
    source: hosted
    version: "3.0.2"
  lints:
    dependency: transitive
    description:
      name: lints
      sha256: "12f842a479589fea194fe5c5a3095abc7be0c1f2ddfa9a0e76aed1dbd26a87df"
      url: "https://pub.dev"
    source: hosted
    version: "6.1.0"
  matcher:
    dependency: transitive
    description:
      name: matcher
      sha256: "31bd099b47c10cd1aeb55146a2d46ce0277630ecef3f7dae54ad7873f36696cd"
      url: "https://pub.dev"
    source: hosted
    version: "0.12.20"
  material_color_utilities:
    dependency: transitive
    description:
      name: material_color_utilities
      sha256: "9c337007e82b1889149c82ed242ed1cb24a66044e30979c44912381e9be4c48b"
      url: "https://pub.dev"
    source: hosted
    version: "0.13.0"
  meta:
    dependency: transitive
    description:
      name: meta
      sha256: c82594181e3312f3d0695fc95aaaf7758d75b8d4ae2bbecf223b9fd5109a059d
      url: "https://pub.dev"
    source: hosted
    version: "1.18.3"
  path:
    dependency: transitive
    description:
      name: path
      sha256: "75cca69d1490965be98c73ceaea117e8a04dd21217b37b292c9ddbec0d955bc5"
      url: "https://pub.dev"
    source: hosted
    version: "1.9.1"
  path_parsing:
    dependency: transitive
    description:
      name: path_parsing
      sha256: "883402936929eac138ee0a45da5b0f2c80f89913e6dc3bf77eb65b84b409c6ca"
      url: "https://pub.dev"
    source: hosted
    version: "1.1.0"
  petitparser:
    dependency: transitive
    description:
      name: petitparser
      sha256: "91bd59303e9f769f108f8df05e371341b15d59e995e6806aefab827b58336675"
      url: "https://pub.dev"
    source: hosted
    version: "7.0.2"
  platform:
    dependency: transitive
    description:
      name: platform
      sha256: a36d119c13416516a7b5913fbe8af8531e11633d784c550b2125f76c758524ec
      url: "https://pub.dev"
    source: hosted
    version: "3.2.0"
  process:
    dependency: transitive
    description:
      name: process
      sha256: "4242ba3508d37e01808bdf71ad1d5bb93a8d671bf2e7450e6b1b353fb0808891"
      url: "https://pub.dev"
    source: hosted
    version: "5.0.6"
  sky_engine:
    dependency: transitive
    description: flutter
    source: sdk
    version: "0.0.0"
  source_span:
    dependency: transitive
    description:
      name: source_span
      sha256: "56a02f1f4cd1a2d96303c0144c93bd6d909eea6bee6bf5a0e0b685edbd4c47ab"
      url: "https://pub.dev"
    source: hosted
    version: "1.10.2"
  stack_trace:
    dependency: transitive
    description:
      name: stack_trace
      sha256: "277654b3034d17ac6f9f1cb5595db011b1d5d41e8806866db28e0abaa101c490"
      url: "https://pub.dev"
    source: hosted
    version: "1.12.2"
  stream_channel:
    dependency: transitive
    description:
      name: stream_channel
      sha256: "969e04c80b8bcdf826f8f16579c7b14d780458bd97f56d107d3950fdbeef059d"
      url: "https://pub.dev"
    source: hosted
    version: "2.1.4"
  string_scanner:
    dependency: transitive
    description:
      name: string_scanner
      sha256: "921cd31725b72fe181906c6a94d987c78e3b98c2e205b397ea399d4054872b43"
      url: "https://pub.dev"
    source: hosted
    version: "1.4.1"
  sync_http:
    dependency: transitive
    description:
      name: sync_http
      sha256: "7f0cd72eca000d2e026bcd6f990b81d0ca06022ef4e32fb257b30d3d1014a961"
      url: "https://pub.dev"
    source: hosted
    version: "0.3.1"
  term_glyph:
    dependency: transitive
    description:
      name: term_glyph
      sha256: "7f554798625ea768a7518313e58f83891c7f5024f88e46e7182a4558850a4b8e"
      url: "https://pub.dev"
    source: hosted
    version: "1.2.2"
  test_api:
    dependency: transitive
    description:
      name: test_api
      sha256: "2a122cbe059f8b610d3a5415f42e255b6c17b1f21eee1d960f31080237fb4f11"
      url: "https://pub.dev"
    source: hosted
    version: "0.7.12"
  typed_data:
    dependency: transitive
    description:
      name: typed_data
      sha256: f9049c039ebfeb4cf7a7104a675823cd72dba8297f264b6637062516699fa006
      url: "https://pub.dev"
    source: hosted
    version: "1.4.0"
  vector_graphics:
    dependency: transitive
    description:
      name: vector_graphics
      sha256: "0964703d02677ac8636b4aef95de0b7e816224ff0082908c2c950529cb9a2f5e"
      url: "https://pub.dev"
    source: hosted
    version: "1.2.4"
  vector_graphics_codec:
    dependency: transitive
    description:
      name: vector_graphics_codec
      sha256: "99fd9fbd34d9f9a32efd7b6a6aae14125d8237b10403b422a6a6dfeac2806146"
      url: "https://pub.dev"
    source: hosted
    version: "1.1.13"
  vector_graphics_compiler:
    dependency: transitive
    description:
      name: vector_graphics_compiler
      sha256: a8e2c19796144da2f81bcc96dad1bb19c4677b561c452081b97ee737b9faed65
      url: "https://pub.dev"
    source: hosted
    version: "1.3.2"
  vector_math:
    dependency: transitive
    description:
      name: vector_math
      sha256: "1d774bbdf6b72a0b12122fc1560c9c2d2a67db5a4a4cc2bd8a5c990ab20e3188"
      url: "https://pub.dev"
    source: hosted
    version: "2.4.0"
  vm_service:
    dependency: transitive
    description:
      name: vm_service
      sha256: "89b11d62e1040ee681af3b4f1c97a803ecbf010c6e8b9c5896ee5b08c3bf7b78"
      url: "https://pub.dev"
    source: hosted
    version: "15.4.0"
  web:
    dependency: transitive
    description:
      name: web
      sha256: "868d88a33d8a87b18ffc05f9f030ba328ffefba92d6c127917a2ba740f9cfe4a"
      url: "https://pub.dev"
    source: hosted
    version: "1.1.1"
  webdriver:
    dependency: transitive
    description:
      name: webdriver
      sha256: "28b82ec894fed45dd71c23ba62d1af973ed97dd59a4f5790a4d38b0b13e5657e"
      url: "https://pub.dev"
    source: hosted
    version: "3.2.0"
  xml:
    dependency: transitive
    description:
      name: xml
      sha256: "67f0aff7be013d107995e9b75bf4e7f2c3ef2dfdb2c8e68024bba0a7fd5756a4"
      url: "https://pub.dev"
    source: hosted
    version: "7.0.1"
sdks:
  dart: ">=3.13.5 <4.0.0"
  flutter: ">=3.47.7"
````

## apps/salapiya/pubspec.yaml

````yaml
name: salapiya
description: Salapiya Woven Calm interactive design gallery.
publish_to: none
version: 0.1.0+1

environment:
  sdk: '>=3.13.5 <4.0.0'
  flutter: '>=3.47.7'

dependencies:
  flutter_svg: 2.3.0
  flutter:
    sdk: flutter

dev_dependencies:
  integration_test:
    sdk: flutter
  flutter_test:
    sdk: flutter
  flutter_lints: 6.0.0

flutter:
  uses-material-design: true

  assets:
    - assets/branding/source/
    - assets/branding/mark/
    - assets/branding/horizontal/
    - assets/branding/vertical/
    - assets/branding/display/
    - assets/fonts/nunitosans/OFL.txt
    - assets/fonts/geist/OFL.txt
    - assets/fonts/sourcesans3/OFL.txt
  fonts:
    - family: Nunito Sans
      fonts:
        - asset: assets/fonts/nunitosans/regular.ttf
    - family: Geist
      fonts:
        - asset: assets/fonts/geist/regular.ttf
    - family: Source Sans 3
      fonts:
        - asset: assets/fonts/sourcesans3/regular.ttf
````

## apps/salapiya/test/widget_test.dart

````dart
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/app.dart';
import 'package:salapiya/design_system/theme.dart';
import 'package:salapiya/design_system/components.dart';
import 'package:salapiya/gallery/settings.dart';
import 'package:salapiya/gallery/review_editor.dart';
import 'package:salapiya/prototype/fixtures.dart';

void main() {
  testWidgets(
    'scrolled finance and expanded detail survive section revisit without storage collision',
    (tester) async {
      final settings = GallerySettings()..section = GallerySection.finance;
      await tester.pumpWidget(SalapiyaApp(settings: settings));
      await tester.pumpAndSettle();
      await tester.ensureVisible(
        find.text('Inspect isolated expense allocation'),
      );
      await tester.tap(find.text('Inspect isolated expense allocation'));
      await tester.pumpAndSettle();
      settings.change(() => settings.section = GallerySection.foundations);
      await tester.pumpAndSettle();
      settings.change(() => settings.section = GallerySection.finance);
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.text('Wallet after expense'), findsOneWidget);
    },
  );
  testWidgets('modal restores keyboard focus and preserves unknown draft', (
    tester,
  ) async {
    final settings = GallerySettings()..section = GallerySection.overlays;
    await tester.pumpWidget(SalapiyaApp(settings: settings));
    await tester.pumpAndSettle();
    final origin = Focus.of(tester.element(find.text('Open dialog')));
    origin.requestFocus();
    await tester.pump();
    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Review'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Simulate unknown outcome'));
    await tester.pumpAndSettle();
    expect(find.text('Outcome unknown'), findsOneWidget);
    await tester.tap(find.text('Close draft'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Keep editing'));
    await tester.pumpAndSettle();
    expect(find.text('Outcome unknown'), findsOneWidget);
    await tester.tap(find.text('Close draft'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Discard draft'));
    await tester.pumpAndSettle();
    expect(origin.hasFocus, isTrue);
  });
  testWidgets('Android visible actions have labeled 48px touch targets', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(412, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final semantics = tester.ensureSemantics();
    await tester.pumpWidget(
      SalapiyaApp(
        settings: GallerySettings()..section = GallerySection.actions,
      ),
    );
    await tester.pumpAndSettle();
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
    semantics.dispose();
  });
  test('exact decimal boundaries and synthetic totals', () {
    expect(DemoMoney.format(DemoMoney.liquid), '₱29,300.75');
    expect(
      DemoMoney.format(DemoMoney.liquid - DemoMoney.expense),
      '₱29,115.25',
    );
    expect(DemoMoney.format(-DemoMoney.expense), '−₱185.50');
    expect(DemoMoney.parse('0.01'), BigInt.one);
    expect(DemoMoney.parse('185.5'), BigInt.from(18550));
    for (final bad in ['1,000', '1e3', '-1', '01', '.5', '1.001', 'NaN', '']) {
      expect(DemoMoney.validate(bad), isNotNull, reason: bad);
    }
    expect(DemoMoney.validate('0'), isNotNull);
    expect(DemoMoney.validate('1000000000.01'), isNotNull);
    expect(DemoMoney.validate('1000000000.00'), isNull);
    expect(
      demoAccounts.map((a) => BigInt.parse(a.$2)).reduce((a, b) => a + b),
      DemoMoney.liquid,
    );
  });
  test('semantic foreground pairs meet normal-text contrast', () {
    double ratio(Color a, Color b) {
      final x = a.computeLuminance(), y = b.computeLuminance();
      return ((x > y ? x : y) + .05) / ((x > y ? y : x) + .05);
    }

    for (final dark in [false, true]) {
      final c = CraftTheme(dark: dark);
      for (final pair in [
        (c.text, c.surface),
        (c.secondary, c.surface),
        (c.primary, c.surface),
        (c.onPrimary, c.primary),
        (c.warm, c.warmSurface),
        (c.plum, c.plumSurface),
        (c.blue, c.blueSurface),
        ...NoticeTone.values.map(c.tone),
      ]) {
        expect(ratio(pair.$1, pair.$2), greaterThanOrEqualTo(4.5));
      }
      expect(ratio(c.border, c.surface), greaterThanOrEqualTo(3));
    }
  });
  for (final size in [
    const Size(640, 480),
    const Size(900, 600),
    const Size(1280, 800),
    const Size(1600, 900),
    const Size(320, 568),
    const Size(360, 640),
    const Size(412, 800),
    const Size(800, 360),
  ]) {
    for (final scale in [1.0, 2.0]) {
      testWidgets('all sections ${size.width}x${size.height} at $scale', (
        tester,
      ) async {
        tester.view.physicalSize = size;
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final settings = GallerySettings()..textScale = scale;
        await tester.pumpWidget(SalapiyaApp(settings: settings));
        for (final theme in [ThemeMode.light, ThemeMode.dark]) {
          for (final section in GallerySection.values) {
            settings.change(() {
              settings.section = section;
              settings.themeMode = theme;
            });
            await tester.pumpAndSettle();
            expect(
              tester.takeException(),
              isNull,
              reason: '${section.name} $theme',
            );
          }
        }
        await tester.pumpWidget(const SizedBox());
        settings.dispose();
      });
    }
  }
  testWidgets('startup controls support theme and reduced motion', (
    tester,
  ) async {
    final settings = GallerySettings();
    await tester.pumpWidget(SalapiyaApp(settings: settings));
    await tester.tap(find.byTooltip('Viewing preferences'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Dark'));
    await tester.pumpAndSettle();
    expect(settings.themeMode, ThemeMode.dark);
    await tester.tap(find.text('Reduce motion'));
    await tester.pumpAndSettle();
    expect(settings.reduceMotion, isTrue);
    await tester.tap(find.text('Done'));
    await tester.pumpAndSettle();
    expect(
      MediaQuery.disableAnimationsOf(
        tester.element(find.text('Foundations').last),
      ),
      isTrue,
    );
    await tester.sendKeyEvent(LogicalKeyboardKey.tab);
    await tester.pump();
    expect(FocusManager.instance.primaryFocus, isNotNull);
  });
  testWidgets('amount validation and dirty overlay recovery', (tester) async {
    final settings = GallerySettings()..section = GallerySection.actions;
    await tester.pumpWidget(SalapiyaApp(settings: settings));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const ValueKey('demo-amount')), '0.001');
    await tester.ensureVisible(find.text('Validate example'));
    await tester.tap(find.text('Validate example'));
    await tester.pumpAndSettle();
    expect(
      find.text('Enter pesos with up to two decimals, without commas.'),
      findsOneWidget,
    );
    settings.change(() => settings.section = GallerySection.overlays);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Open dialog'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const ValueKey('review-amount')), '200');
    await tester.tap(find.text('Review'));
    await tester.pumpAndSettle();
    expect(find.text('₱200.00'), findsOneWidget);
    await tester.tap(find.text('Edit'));
    await tester.pumpAndSettle();
    await tester.sendKeyEvent(LogicalKeyboardKey.escape);
    await tester.pumpAndSettle();
    expect(find.text('Discard demo changes?'), findsOneWidget);
    await tester.tap(find.text('Keep editing'));
    await tester.pumpAndSettle();
    expect(find.byType(DemoReviewEditor), findsOneWidget);
    await tester.tap(find.text('Close draft'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Discard draft'));
    await tester.pumpAndSettle();
    expect(find.byType(DemoReviewEditor), findsNothing);
  });
  testWidgets('native font amount remains one line at narrow 200% scale', (
    tester,
  ) async {
    final loader = FontLoader('Nunito Sans')
      ..addFont(rootBundle.load('assets/fonts/nunitosans/regular.ttf'));
    await loader.load();
    for (final value in ['₱29,300.75', '−₱185.50', '₱1,000,000,000.00']) {
      await tester.pumpWidget(
        MaterialApp(
          theme: SalapiyaTheme.build(Brightness.light),
          home: MediaQuery(
            data: const MediaQueryData(textScaler: TextScaler.linear(2)),
            child: Center(
              child: SizedBox(
                width: 240,
                child: AmountText(value, large: true),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      final paragraph = tester.renderObject<RenderParagraph>(
        find.descendant(of: find.text(value), matching: find.byType(RichText)),
      );
      final boxes = paragraph.getBoxesForSelection(
        TextSelection(baseOffset: 0, extentOffset: value.length),
      );
      expect(boxes.map((box) => box.top).toSet().length, 1, reason: value);
      expect(tester.takeException(), isNull);
    }
  });
}
````

## apps/salapiya/test_driver/gallery_driver.dart

````dart
import 'dart:convert';
import 'dart:io';

import 'package:integration_test/integration_test_driver.dart';

Future<void> main() async {
  await integrationDriver(
    writeResponseOnFailure: true,
    responseDataCallback: (data) async {
      if (data == null) return;
      final directory = Directory('../../docs/salapiya/design/review/d1')
        ..createSync(recursive: true);
      final shots = data.remove('screenshots') as Map<String, dynamic>? ?? {};
      for (final entry in shots.entries) {
        File('${directory.path}/${entry.key}.png')
            .writeAsBytesSync(base64Decode(entry.value as String));
      }
      final mode =
          data['kind'] ??
          (data['performance'] as Map<String, dynamic>?)?['mode'] ??
          'incomplete';
      File('${directory.path}/${data['platform']}-runtime-$mode.json')
          .writeAsStringSync(const JsonEncoder.withIndent('  ').convert(data));
    },
  );
}
````

## scripts/salapiya/export-branding.cjs

````javascript
// Render protected SVG sources without modifying their geometry or colors.
const { chromium } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const root = "apps/salapiya/assets/branding";
  const entries = [
    ["source/salapiya_original.svg", 944, 794],
    ["mark/salapiya_mark.svg", 768, 771],
    ["horizontal/salapiya_horizontal_on_light.svg", 1441, 463],
    ["horizontal/salapiya_horizontal_on_dark.svg", 1441, 463],
    ["vertical/salapiya_vertical_on_light.svg", 944, 794],
    ["vertical/salapiya_vertical_on_dark.svg", 944, 794],
  ];
  const manifest = [];
  fs.mkdirSync(path.join(root, "display"), { recursive: true });
  for (const [source, width, height] of entries) {
    const bytes = fs.readFileSync(path.join(root, source));
    const page = await browser.newPage({
      viewport: { width, height },
      deviceScaleFactor: 1,
    });
    await page.setContent(
      '<body style="margin:0;background:transparent"><img style="display:block;width:100%;height:100%;object-fit:contain" src="data:image/svg+xml;base64,' +
        bytes.toString("base64") +
        '"></body>',
    );
    await page.locator("img").evaluate((img) => img.decode());
    const output = "display/" + path.basename(source, ".svg") + ".png";
    await page.screenshot({
      path: path.join(root, output),
      omitBackground: true,
    });
    manifest.push({
      source,
      output,
      width,
      height,
      sourceSha256: crypto.createHash("sha256").update(bytes).digest("hex"),
      outputSha256: crypto
        .createHash("sha256")
        .update(fs.readFileSync(path.join(root, output)))
        .digest("hex"),
      renderer: await browser.version(),
    });
    await page.close();
  }
  fs.writeFileSync(
    path.join(root, "display/manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  await browser.close();
  console.log("Exported six transparent source-faithful display references.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
````

## scripts/salapiya/write-source-snapshot.py

````python
"""Write the D1 full source/configuration snapshot and exact file inventory.

Run from any directory with Python 3. Uses only the standard library and Git.
The D0 baseline is fixed so the output remains reproducible after committing D1.
Generated inventory excludes its own hash to avoid a recursive checksum.
"""
from pathlib import Path
import hashlib
import json
import subprocess

ROOT = Path(__file__).resolve().parents[2]
BASE = "7914b72310d2979b9d7d80885c587b0437585194"
DOCS = ROOT / "docs/salapiya/design"


def git_paths(*args):
    raw = subprocess.check_output(["git", "-C", str(ROOT), *args])
    return {p for p in raw.decode("utf-8").split("\0") if p}


def main():
    changed = git_paths("diff", "--name-only", "-z", BASE)
    changed |= git_paths("ls-files", "--others", "--exclude-standard", "-z")
    changed = {p for p in changed if (ROOT / p).is_file()}
    code = sorted(p for p in changed if (
        p.startswith("apps/salapiya/") and Path(p).suffix in {".dart", ".yaml", ".lock", ".json"}
        or p.startswith("scripts/salapiya/") and Path(p).suffix in {".cjs", ".py"}
    ))
    lines = ["# D1 complete authored code and configuration", "",
             "Full UTF-8 file contents, not diffs or excerpts. Generated with",
             "`python scripts/salapiya/write-source-snapshot.py` against approved D0.",
             "Binary fonts/logos and unchanged third-party notices are linked in",
             "[the exact file inventory](D1_FILES.json); rendered evidence has its",
             "[own review index](review/d1/README.md). Source files remain authoritative.", ""]
    for path in code:
        contents = (ROOT / path).read_text(encoding="utf-8-sig")
        language = {".dart": "dart", ".yaml": "yaml", ".lock": "yaml", ".json": "json", ".cjs": "javascript", ".py": "python"}[Path(path).suffix]
        lines += [f"## {path}", "", f"````{language}", contents.rstrip("\n"), "````", ""]
    snapshot = DOCS / "D1_SOURCE_SNAPSHOT.md"
    snapshot.write_text("\n".join(lines), encoding="utf-8", newline="\n")
    changed.add(snapshot.relative_to(ROOT).as_posix())
    inventory = DOCS / "D1_FILES.json"
    changed.add(inventory.relative_to(ROOT).as_posix())
    previous = git_paths("ls-tree", "-r", "--name-only", "-z", BASE)
    files = []
    for path in sorted(changed):
        full = ROOT / path
        own = full == inventory
        data = b"" if own else full.read_bytes()
        files.append({"path": path, "status": "modified" if path in previous else "created",
                      "bytes": None if own else len(data),
                      "sha256": None if own else hashlib.sha256(data).hexdigest()})
    inventory.write_text(json.dumps({"baseline": BASE, "note": "Hashes describe local file bytes; Git may normalize line endings. Inventory omits its own recursive hash.", "codeFilesInSnapshot": code, "files": files}, indent=2)+"\n", encoding="utf-8", newline="\n")
    print(f"Snapshot: {len(code)} complete code/config files. Inventory: {len(files)} files.")


if __name__ == "__main__":
    main()
````
