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
