# D1R complete authored code and configuration

Full final UTF-8 contents of every modified/new code file, not diffs or excerpts.
Generated from the D1 base diff plus new D1R files. Source files are authoritative.
No configuration, dependency, logo or font asset changed. See [file inventory](D1R_FILES.json).

## apps/salapiya/integration_test/refinement_test.dart

````dart
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
    await tester.pumpWidget(SalapiyaApp(settings: settings));
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
    expect(find.text('Luminous Lattice'), findsOneWidget);
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
        await tester.ensureVisible(find.text('Luminous Lattice · selected'));
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
    if (focal) {
      return LatticeFrame(
        focal: true,
        padding: EdgeInsets.all(padding),
        child: Material(type: MaterialType.transparency, child: child),
      );
    }
    return Container(
      padding: EdgeInsets.all(padding),
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(Space.cardRadius),
        border: Border.all(color: c.divider),
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
  const CraftMotif({super.key, this.lattice = true, this.size = 96});
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

/// One soft, opaque pane with an optional stepped pearl edge. The edge is
/// confined to the frame margin; it never runs behind labels or financial data.
class LatticeFrame extends StatelessWidget {
  const LatticeFrame({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(8),
    this.radius = Space.cardRadius,
    this.focal = false,
    this.raised = false,
  });
  final Widget child;
  final EdgeInsetsGeometry padding;
  final double radius;
  final bool focal, raised;

  @override
  Widget build(BuildContext context) {
    final c = CraftTheme.of(context);
    final effects = CraftPreferences.effectsOf(context);
    return Container(
      decoration: BoxDecoration(
        color: raised ? c.raised : c.surface,
        gradient: focal && effects
            ? LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [c.focalStart, c.focalEnd],
              )
            : null,
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(color: effects ? c.latticeEdge : c.divider),
        boxShadow: effects && (raised || focal) ? c.shadow : null,
      ),
      child: CustomPaint(
        foregroundPainter: effects ? _PaneEdge(c.pearlEdge, radius) : null,
        child: Padding(padding: padding, child: child),
      ),
    );
  }
}

class _PaneEdge extends CustomPainter {
  const _PaneEdge(this.color, this.radius);
  final Color color;
  final double radius;

  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()
      ..color = color
      ..strokeWidth = 1.5
      ..strokeCap = StrokeCap.round;
    // Original offset two-step seam, built from lines rather than rebuilt paths.
    final end = size.width - radius;
    if (end <= radius + 24) return;
    canvas.drawLine(Offset(radius, 4), Offset(end - 16, 4), p);
    canvas.drawLine(Offset(end - 16, 4), Offset(end - 16, 8), p);
    canvas.drawLine(Offset(end - 16, 8), Offset(end, 8), p);
  }

  @override
  bool shouldRepaint(_PaneEdge old) =>
      old.color != color || old.radius != radius;
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

## apps/salapiya/lib/design_system/floating_actions.dart

````dart
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'craft.dart';
import 'theme.dart';

/// Caller-owned actions: this component knows nothing about finance or routing.
@immutable
class FloatingQuickAction {
  const FloatingQuickAction({
    required this.label,
    required this.icon,
    required this.onSelected,
  });
  final String label;
  final IconData icon;
  final VoidCallback onSelected;
}

/// Place separately above the trailing edge of a navigation capsule. The caller
/// reserves space for both controls; the menu owns only its transient modal route.
class FloatingActionMenu extends StatefulWidget {
  const FloatingActionMenu({super.key, required this.actions});
  final List<FloatingQuickAction> actions;

  @override
  State<FloatingActionMenu> createState() => _FloatingActionMenuState();
}

class _FloatingActionMenuState extends State<FloatingActionMenu> {
  final _trigger = GlobalKey();
  final _focus = FocusNode(debugLabel: 'Quick actions trigger');
  bool _open = false;

  @override
  void dispose() {
    _focus.dispose();
    super.dispose();
  }

  Future<void> _show() async {
    if (_open || widget.actions.isEmpty) return;
    final navigator = Navigator.of(context, rootNavigator: true);
    final overlay = navigator.overlay!.context.findRenderObject()! as RenderBox;
    final box = _trigger.currentContext!.findRenderObject()! as RenderBox;
    final anchor = box.localToGlobal(Offset.zero, ancestor: overlay) & box.size;
    final actions = List<FloatingQuickAction>.unmodifiable(widget.actions);
    final route = _ActionRoute(
      anchor: anchor,
      actions: actions,
      reduceMotion: MediaQuery.disableAnimationsOf(context),
      scrim: CraftTheme.of(context).modalScrim,
      barrierText: MaterialLocalizations.of(context).modalBarrierDismissLabel,
    );
    setState(() => _open = true);
    final selected = await navigator.push<int>(route);
    // Wait for reverse motion and barrier removal before restoring focus or
    // invoking the caller. A fast second tap cannot open another route meanwhile.
    await route.completed;
    if (!mounted) return;
    setState(() => _open = false);
    _focus.requestFocus();
    if (selected != null) actions[selected].onSelected();
  }

  @override
  Widget build(BuildContext context) => Semantics(
    expanded: _open,
    child: IconButton.filled(
      key: _trigger,
      focusNode: _focus,
      tooltip: 'Quick actions',
      style: _triggerStyle(context),
      onPressed: widget.actions.isEmpty ? null : _show,
      icon: const Icon(Icons.add),
    ),
  );
}

ButtonStyle _triggerStyle(BuildContext context) {
  final c = CraftTheme.of(context);
  return IconButton.styleFrom(
    minimumSize: const Size(56, 56),
    backgroundColor: c.primary,
    foregroundColor: c.onPrimary,
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
  ).copyWith(
    side: WidgetStateProperty.resolveWith(
      (states) => states.contains(WidgetState.focused)
          ? BorderSide(color: c.onPrimary, width: 3)
          : BorderSide(color: c.primary),
    ),
  );
}

class _ActionRoute extends PopupRoute<int> {
  _ActionRoute({
    required this.anchor,
    required this.actions,
    required this.reduceMotion,
    required this.scrim,
    required this.barrierText,
  }) : super(
         requestFocus: true,
         traversalEdgeBehavior: TraversalEdgeBehavior.closedLoop,
         settings: const RouteSettings(name: 'floating-quick-actions'),
       );

  final Rect anchor;
  final List<FloatingQuickAction> actions;
  final bool reduceMotion;
  final Color scrim;
  final String barrierText;
  bool _closing = false;

  @override
  Duration get transitionDuration =>
      reduceMotion ? Duration.zero : Space.menuDuration;
  @override
  Color get barrierColor => scrim;
  @override
  bool get barrierDismissible => true;
  @override
  String get barrierLabel => barrierText;

  void close([int? index]) {
    if (_closing || !isCurrent) return;
    navigator!.pop(index);
  }

  @override
  bool didPop(int? result) {
    _closing = true;
    return super.didPop(result);
  }

  @override
  Widget buildPage(
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
  ) => Shortcuts(
    shortcuts: const {
      SingleActivator(LogicalKeyboardKey.escape): DismissIntent(),
    },
    child: Actions(
      actions: {
        DismissIntent: CallbackAction<DismissIntent>(
          onInvoke: (_) {
            close();
            return null;
          },
        ),
      },
      child: Semantics(
        scopesRoute: true,
        namesRoute: true,
        explicitChildNodes: true,
        label: 'Quick actions',
        child: LayoutBuilder(
          builder: (context, bounds) {
            final media = MediaQuery.of(context);
            final left = media.padding.left + 12;
            final right = bounds.maxWidth - media.padding.right - 12;
            final top = media.padding.top + 12;
            final bottom =
                bounds.maxHeight -
                math.max(media.padding.bottom, media.viewInsets.bottom) -
                12;
            final width = math.min(360.0, math.max(0.0, right - left));
            // Measure labels with the actual text scale; no fixed row heights or
            // clipped labels. Allow a header and frame padding in the estimate.
            var listHeight = 64.0 + media.textScaler.scale(20) * 1.4;
            for (final action in actions) {
              final text = TextPainter(
                text: TextSpan(
                  text: action.label,
                  style: Theme.of(context).textTheme.labelLarge,
                ),
                textDirection: Directionality.of(context),
                textScaler: media.textScaler,
              )..layout(maxWidth: math.max(1, width - 88));
              listHeight += math.max(48, text.height + 24) + 4;
              text.dispose();
            }
            final anchored =
                media.viewInsets.bottom == 0 &&
                anchor.bottom <= bottom &&
                anchor.left >= left &&
                anchor.right - left >= width &&
                anchor.right <= right &&
                anchor.top - top >= listHeight + 12;
            final menuRight = anchored ? right - anchor.right : 0.0;
            final menuBottom = anchored ? bottom - anchor.top + 12 : 68.0;
            final available = math.max(0.0, bottom - top - menuBottom);
            return Stack(
              children: [
                Positioned(
                  left: left,
                  right: bounds.maxWidth - right,
                  top: top,
                  bottom: bounds.maxHeight - bottom,
                  child: Stack(
                    children: [
                      Positioned(
                        right: menuRight,
                        bottom: menuBottom,
                        width: width,
                        child: ConstrainedBox(
                          constraints: BoxConstraints(maxHeight: available),
                          child: LatticeFrame(
                            key: ValueKey(
                              anchored
                                  ? 'quick-actions-menu'
                                  : 'quick-actions-sheet',
                            ),
                            raised: true,
                            padding: const EdgeInsets.all(12),
                            child: Material(
                              type: MaterialType.transparency,
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  Flexible(
                                    child: SingleChildScrollView(
                                      primary: false,
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.stretch,
                                        children: [
                                          Padding(
                                            padding: const EdgeInsets.all(8),
                                            child: Text(
                                              'Quick actions',
                                              style: Theme.of(context)
                                                  .textTheme
                                                  .titleMedium,
                                            ),
                                          ),
                                          for (
                                            var i = 0;
                                            i < actions.length;
                                            i++
                                          )
                                            Padding(
                                              padding: const EdgeInsets.only(
                                                bottom: 4,
                                              ),
                                              child: TextButton(
                                                onPressed: () => close(i),
                                                style: TextButton.styleFrom(
                                                  alignment:
                                                      Alignment.centerLeft,
                                                  padding: const EdgeInsets.all(
                                                    12,
                                                  ),
                                                  backgroundColor:
                                                      CraftTheme.of(context)
                                                          .subtle,
                                                ),
                                                child: Row(
                                                  children: [
                                                    Icon(
                                                      actions[i].icon,
                                                      size: 24,
                                                    ),
                                                    const SizedBox(width: 12),
                                                    Expanded(
                                                      child: Text(
                                                        actions[i].label,
                                                      ),
                                                    ),
                                                  ],
                                                ),
                                              ),
                                            ),
                                        ],
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
                      Positioned(
                        right: menuRight,
                        bottom: anchored ? bottom - anchor.bottom : 0,
                        child: Semantics(
                          expanded: true,
                          child: IconButton.filled(
                            autofocus: true,
                            tooltip: 'Close quick actions',
                            style: _triggerStyle(context),
                            onPressed: close,
                            icon: const Icon(Icons.close),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            );
          },
        ),
      ),
    ),
  );

  @override
  Widget buildTransitions(
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child,
  ) {
    if (reduceMotion) return child;
    return AnimatedBuilder(
      animation: animation,
      child: child,
      builder: (context, child) {
        final value = Curves.easeOutCubic.transform(animation.value);
        // SDK barriers stop hit testing during reverse transitions. Keep this
        // full-viewport shield outside the route's IgnorePointer until removal.
        return AbsorbPointer(
          absorbing: _closing,
          child: Opacity(
            opacity: value,
            child: Transform.translate(
              offset: Offset(0, 4 * (1 - value)),
              child: child,
            ),
          ),
        );
      },
    );
  }
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
          side: selected
              ? BorderSide(color: CraftTheme.of(context).primary)
              : null,
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
  static const double floatingRadius = 28, paneInset = 8;
  static const menuDuration = Duration(milliseconds: 160);
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
  Color get pearlEdge => dark ? const Color(0xFF73658E) : Palette.white;
  Color get latticeEdge => Color.lerp(divider, primary, .28)!;
  Color get modalScrim => Colors.black.withValues(alpha: dark ? .64 : .44);
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
                'Lattice edges, focal gradients and shadows',
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
                                    'Luminous Lattice / Component collection',
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
                                  'D1R  /  INTERACTIVE DESIGN STUDY',
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
                                  'SALAPIYA  /  LUMINOUS LATTICE  /  OWNER REVIEW',
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
import '../design_system/craft.dart';
import '../design_system/floating_actions.dart';

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
  String quickResult = 'Choose an action to preview its demo-only outcome.';
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
          return LatticeFrame(
            raised: capsule,
            radius: capsule ? Space.floatingRadius : Space.cardRadius,
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
        'Component studies only. Android B is selected; final application-shell validation belongs to D2.',
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
              'Android B · floating · selected',
              caption: 'Five destinations, with a separate + for quick actions. Demo only.',
            ),
            StatusNotice(quickResult, live: true),
            const SizedBox(height: 12),
            Align(
              alignment: Alignment.centerRight,
              child: FloatingActionMenu(
                actions: [
                  for (final item in const [
                    ('Add expense', Icons.remove_circle_outline),
                    ('Record income', Icons.add_circle_outline),
                    ('Transfer money', Icons.swap_horiz_outlined),
                    ('Record debt payment', Icons.handshake_outlined),
                    ('Add shared expense', Icons.people_outline),
                    ('Add task', Icons.check_circle_outline),
                  ])
                    FloatingQuickAction(
                      label: item.$1,
                      icon: item.$2,
                      onSelected: () => setState(() {
                        quickResult =
                            '${item.$1} specimen only — no record created.';
                      }),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            destinations(capsule: true),
          ],
        ),
      ),
      const SizedBox(height: 24),
      ExpansionTile(
        key: const PageStorageKey('historical-android-a'),
        title: const Text('Android A · historical comparison'),
        subtitle: const Text(
          'Superseded by the owner’s D1 review. No second production navigation.',
        ),
        children: [
          CraftPanel(
            padding: 12,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
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
        ],
      ),
    ],
  );
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
                      child: CraftMotif(size: 96),
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
                  const Chip(label: Text('Luminous Lattice')),
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
          for (final lattice in [true, false])
            CraftPanel(
              focal: true,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  CraftMotif(size: 96, lattice: lattice),
                  const SizedBox(height: 16),
                  SectionTitle(
                    lattice
                        ? 'Luminous Lattice · selected'
                        : 'Woven Calm · historical motif',
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

## apps/salapiya/test/floating_actions_test.dart

````dart
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/app.dart';
import 'package:salapiya/design_system/craft.dart';
import 'package:salapiya/design_system/floating_actions.dart';
import 'package:salapiya/design_system/theme.dart';
import 'package:salapiya/gallery/settings.dart';

Widget harness({
  VoidCallback? action,
  VoidCallback? background,
  bool reduced = false,
  double scale = 1,
  double keyboard = 0,
  Brightness brightness = Brightness.light,
}) => MaterialApp(
  theme: SalapiyaTheme.build(brightness),
  builder: (context, child) => MediaQuery(
    data: MediaQuery.of(context).copyWith(
      disableAnimations: reduced,
      textScaler: TextScaler.linear(scale),
      padding: const EdgeInsets.only(top: 24, bottom: 24),
      viewInsets: EdgeInsets.only(bottom: keyboard),
    ),
    child: child!,
  ),
  home: Scaffold(
    body: SafeArea(
      child: Stack(
        children: [
          Align(
            alignment: Alignment.topLeft,
            child: TextButton(
              onPressed: background ?? () {},
              child: const Text('Background destination'),
            ),
          ),
          Positioned(
            right: 16,
            bottom: 24,
            child: FloatingActionMenu(
              actions: [
                for (final label in [
                  'Add expense',
                  'Record income',
                  'Transfer money',
                  'Record debt payment',
                  'Add shared expense',
                  'Add task',
                ])
                  FloatingQuickAction(
                    label: label,
                    icon: Icons.add_circle_outline,
                    onSelected: action ?? () {},
                  ),
              ],
            ),
          ),
        ],
      ),
    ),
  ),
);

void main() {
  testWidgets(
    'lattice default, both themes and optional effects preserve content',
    (tester) async {
      final settings = GallerySettings();
      await tester.pumpWidget(SalapiyaApp(settings: settings));
      await tester.pumpAndSettle();
      expect(find.text('Luminous Lattice'), findsOneWidget);
      expect(
        tester
            .widgetList<CraftMotif>(find.byType(CraftMotif))
            .every((m) => m.lattice),
        isTrue,
      );
      for (final mode in [ThemeMode.dark, ThemeMode.light]) {
        settings.change(() {
          settings.themeMode = mode;
          settings.effects = false;
        });
        await tester.pumpAndSettle();
        final frame = find.byType(LatticeFrame).first;
        final painted = tester.widget<CustomPaint>(
          find.descendant(of: frame, matching: find.byType(CustomPaint)).first,
        );
        expect(painted.foregroundPainter, isNull);
        expect(find.text('Made with care.\nClear by design.'), findsOneWidget);
        expect(tester.takeException(), isNull);
      }
    },
  );

  testWidgets(
    'plus opens one modal, outside blocks destination then restores focus',
    (tester) async {
      var background = 0;
      await tester.pumpWidget(harness(background: () => background++));
      final trigger = find.byTooltip('Quick actions');
      final origin = tester
          .widget<IconButton>(find.byType(IconButton))
          .focusNode!;
      origin.requestFocus();
      final point = tester.getCenter(trigger);
      await tester.tap(trigger);
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('quick-actions-menu')), findsOneWidget);
      expect(find.text('Add expense'), findsOneWidget);
      expect(find.byType(ModalBarrier), findsWidgets);
      final barrier = tester.widget<ModalBarrier>(
        find.byType(ModalBarrier).last,
      );
      expect(barrier.color!.a, greaterThan(0));
      await tester.tapAt(
        tester.getCenter(
          find.text('Background destination', skipOffstage: false),
        ),
      );
      await tester.pumpAndSettle();
      expect(background, 0);
      expect(find.text('Add expense'), findsNothing);
      expect(origin.hasFocus, isTrue);
      await tester.tapAt(point);
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Close quick actions'));
      await tester.pumpAndSettle();
      expect(origin.hasFocus, isTrue);
    },
  );

  testWidgets(
    'Back, Escape, repeated trigger and duplicate selection are safe',
    (tester) async {
      var selected = 0;
      await tester.pumpWidget(harness(action: () => selected++));
      for (final back in [true, false]) {
        await tester.tap(find.byTooltip('Quick actions'));
        await tester.pumpAndSettle();
        if (back) {
          await tester.binding.handlePopRoute();
        } else {
          await tester.sendKeyEvent(LogicalKeyboardKey.escape);
        }
        await tester.pumpAndSettle();
        expect(find.text('Add expense'), findsNothing);
        expect(find.byTooltip('Quick actions'), findsOneWidget);
      }
      final point = tester.getCenter(find.byTooltip('Quick actions'));
      await tester.tapAt(point);
      await tester.tapAt(point);
      await tester.pumpAndSettle();
      expect(find.text('Add expense'), findsOneWidget);
      final actionPoint = tester.getCenter(find.text('Add expense'));
      await tester.tapAt(actionPoint);
      await tester.tapAt(actionPoint);
      await tester.pumpAndSettle();
      expect(selected, 1);
      expect(find.text('Add expense'), findsNothing);
    },
  );

  testWidgets('modal focus traversal, semantics and labeled 48px targets', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    await tester.pumpWidget(harness());
    expect(
      tester
          .getSemantics(find.byType(FloatingActionMenu))
          .getSemanticsData()
          .flagsCollection
          .isExpanded
          .toBoolOrNull(),
      isFalse,
    );
    await tester.tap(find.byTooltip('Quick actions'));
    await tester.pumpAndSettle();
    final labels = <String>[];
    void collect(SemanticsNode node) {
      labels.add(node.label);
      if (node.label == 'Close quick actions') {
        expect(
          node.getSemanticsData().flagsCollection.isExpanded.toBoolOrNull(),
          isTrue,
        );
      }
      node.visitChildren((child) {
        collect(child);
        return true;
      });
    }

    collect(
      tester
          .binding
          .renderViews
          .first
          .owner!
          .semanticsOwner!
          .rootSemanticsNode!,
    );
    expect(labels.join(' '), isNot(contains('Background destination')));
    expect(labels.join(' '), contains('Add expense'));
    for (var i = 0; i < 16; i++) {
      await tester.sendKeyEvent(LogicalKeyboardKey.tab);
      await tester.pump();
      final focusContext = FocusManager.instance.primaryFocus!.context!;
      expect(
        ModalRoute.of(focusContext)!.settings.name,
        'floating-quick-actions',
      );
    }
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
    await tester.sendKeyEvent(LogicalKeyboardKey.escape);
    await tester.pumpAndSettle();
    semantics.dispose();
  });

  testWidgets('reverse dismissal consumes taps until the scrim is gone', (
    tester,
  ) async {
    var background = 0;
    await tester.pumpWidget(harness(background: () => background++));
    final point = tester.getCenter(find.text('Background destination'));
    await tester.tap(find.byTooltip('Quick actions'));
    await tester.pumpAndSettle();
    await tester.tapAt(point);
    await tester.pump(const Duration(milliseconds: 30));
    await tester.tapAt(point);
    await tester.pumpAndSettle();
    expect(background, 0);
    await tester.tapAt(point);
    await tester.pumpAndSettle();
    expect(background, 1);
  });

  testWidgets('rapid outside dismissal does not pop the underlying page', (
    tester,
  ) async {
    await tester.pumpWidget(harness());
    final nav = Navigator.of(tester.element(find.byType(FloatingActionMenu)));
    nav.push(
      MaterialPageRoute<void>(
        builder: (context) => Scaffold(
          body: Column(
            children: [
              const Text('Second page'),
              FloatingActionMenu(
                actions: [
                  FloatingQuickAction(
                    label: 'Add task',
                    icon: Icons.add,
                    onSelected: () {},
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Quick actions'));
    await tester.pumpAndSettle();
    await tester.tapAt(const Offset(10, 300));
    await tester.tapAt(const Offset(10, 300));
    await tester.pumpAndSettle();
    expect(find.text('Second page'), findsOneWidget);
    expect(find.text('Add task'), findsNothing);
  });

  testWidgets('scrolled navigation comparison survives section revisit', (
    tester,
  ) async {
    final settings = GallerySettings()..section = GallerySection.navigation;
    await tester.pumpWidget(SalapiyaApp(settings: settings));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Android A · historical comparison'));
    await tester.tap(find.text('Android A · historical comparison'));
    await tester.pumpAndSettle();
    settings.change(() => settings.section = GallerySection.finance);
    await tester.pumpAndSettle();
    settings.change(() => settings.section = GallerySection.navigation);
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'reduced motion opens and dismisses immediately without translation',
    (tester) async {
      await tester.pumpWidget(harness(reduced: true));
      await tester.tap(find.byTooltip('Quick actions'));
      await tester.pump();
      final route = ModalRoute.of(tester.element(find.text('Add expense')))!;
      expect(route.animation!.value, 1);
      expect(route.transitionDuration, Duration.zero);
      await tester.tap(find.byTooltip('Close quick actions'));
      await tester.pump();
      expect(find.text('Add expense'), findsNothing);
    },
  );

  for (final size in [
    const Size(320, 568),
    const Size(800, 360),
    const Size(640, 480),
    const Size(1600, 900),
  ]) {
    for (final scale in [1.0, 2.0]) {
      testWidgets('menu reachable $size text $scale, keyboard and themes', (
        tester,
      ) async {
        tester.view.physicalSize = size;
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        for (final brightness in Brightness.values) {
          for (final keyboard in [0.0, size.height * .4]) {
            await tester.pumpWidget(
              harness(scale: scale, keyboard: keyboard, brightness: brightness),
            );
            await tester.tap(find.byTooltip('Quick actions'));
            await tester.pumpAndSettle();
            final close = tester.getRect(find.byTooltip('Close quick actions'));
            expect(close.bottom, lessThanOrEqualTo(size.height - keyboard));
            expect(close.top, greaterThanOrEqualTo(24));
            await tester.ensureVisible(find.text('Add task'));
            await tester.pumpAndSettle();
            final last = tester.getRect(find.text('Add task'));
            expect(last.top, greaterThanOrEqualTo(24));
            expect(last.bottom, lessThanOrEqualTo(close.top));
            expect(tester.takeException(), isNull);
            await tester.tap(find.text('Add task'));
            await tester.pumpAndSettle();
          }
        }
      });
    }
  }
}
````

## apps/salapiya/test_driver/refinement_driver.dart

````dart
import 'dart:convert';
import 'dart:io';

import 'package:integration_test/integration_test_driver.dart';

Future<void> main() async {
  await integrationDriver(
    writeResponseOnFailure: true,
    responseDataCallback: (data) async {
      if (data == null) return;
      final directory = Directory('../../docs/salapiya/design/review/d1r')
        ..createSync(recursive: true);
      File('${directory.path}/${data['platform']}-${data['mode']}.json')
          .writeAsStringSync(
            '${const JsonEncoder.withIndent('  ').convert(data)}\n',
          );
    },
  );
}
````
