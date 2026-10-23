import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/app.dart';
import 'package:salapiya/gallery/settings.dart';
import 'package:salapiya/prototype/scenarios.dart';
import 'package:salapiya/app/previews.dart';
import 'package:salapiya/app/shell_navigation.dart';

import 'shell_journey.dart';

void main() {
  for (final platform in [TargetPlatform.windows, TargetPlatform.android]) {
    testWidgets('D2 acceptance journey $platform', (tester) async {
      debugDefaultTargetPlatformOverride = platform;
      addTearDown(() => debugDefaultTargetPlatformOverride = null);
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = platform == TargetPlatform.windows
          ? const Size(1440, 900)
          : const Size(412, 900);
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await shellJourney(tester);
      debugDefaultTargetPlatformOverride = null;
    });
    testWidgets(
      'adaptive shell $platform, themes, scale and resize retention',
      (tester) async {
        debugDefaultTargetPlatformOverride = platform;
        addTearDown(() => debugDefaultTargetPlatformOverride = null);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final settings = GallerySettings();
        await tester.pumpWidget(SalapiyaApp(settings: settings));
        for (final size in [
          const Size(320, 568),
          const Size(800, 360),
          const Size(640, 480),
          const Size(900, 600),
          const Size(1280, 800),
          const Size(1440, 900),
        ]) {
          tester.view.physicalSize = size;
          for (final scale in [1.0, 1.5, 2.0]) {
            for (final theme in [ThemeMode.light, ThemeMode.dark]) {
              settings.change(() {
                settings.textScale = scale;
                settings.themeMode = theme;
                settings.reduceMotion = scale == 2;
                settings.effects = scale != 2;
              });
              await tester.pumpAndSettle();
              expect(
                tester.takeException(),
                isNull,
                reason: '$platform $size $scale $theme',
              );
              await tester.tap(find.byTooltip('Quick actions'));
              await tester.pumpAndSettle();
              await tapVisible(tester, find.text('Add task'));
              expect(find.text('Add task · preview'), findsOneWidget);
              await tester.binding.handlePopRoute();
              await tester.pumpAndSettle();
              expect(tester.takeException(), isNull);
            }
          }
        }
        debugDefaultTargetPlatformOverride = null;
      },
    );
  }
  test('scenario amounts and transport never imply recipient confirmation', () {
    final session = PrototypeSession();
    session.select(OverviewScenario.pending);
    expect(session.accepted.toString(), '2930075');
    expect(session.projected.toString(), '2911525');
    session.select(OverviewScenario.incomplete);
    expect(session.accepted, isNull);
    session.select(OverviewScenario.empty);
    expect(session.accepted, BigInt.zero);
    session.select(OverviewScenario.current);
    expect(session.receipt.name, 'awaiting');
    session.dispose();
  });
  testWidgets(
    'scroll, nested source return, menu shield and final-item clearance',
    (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(412, 900);
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(const SalapiyaApp());
      await tester.pumpAndSettle();
      final overview = find.byKey(const PageStorageKey('destination-overview'));
      final controller = tester
          .widget<SingleChildScrollView>(overview)
          .controller!;
      controller.jumpTo(controller.position.maxScrollExtent);
      await tester.pumpAndSettle();
      final original = controller.offset;
      final footerTop = tester.getTopLeft(find.byType(ShellBottomBar)).dy;
      final finalText = find.textContaining('Next: interview on 23 Oct');
      expect(tester.getBottomLeft(finalText).dy, lessThan(footerTop));
      await tester.tap(find.byKey(const ValueKey('nav-money')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('nav-overview')));
      await tester.pumpAndSettle();
      expect(controller.offset, original);
      tester.view.physicalSize = const Size(800, 600);
      await tester.pumpAndSettle();
      expect(controller.offset, greaterThan(0));
      await tapVisible(tester, find.text('Demo household'));
      await tapVisible(tester, find.text('Tala reported a payment'));
      expect(find.text('Review payment confirmation'), findsWidgets);
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      expect(find.text('Demo household'), findsWidgets);
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      expect(controller.offset, greaterThan(0));
      final moneyPoint = tester.getCenter(
        find.byKey(const ValueKey('nav-money')),
      );
      await tester.tap(find.byTooltip('Quick actions'));
      await tester.pumpAndSettle();
      await tester.tapAt(moneyPoint);
      await tester.pumpAndSettle();
      expect(find.text('Money Today'), findsOneWidget);
      expect(find.byKey(const ValueKey('quick-actions-menu')), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'utilities, all scenarios, enlarged text and keyboard-safe task',
    (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(320, 568);
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final settings = GallerySettings()..textScale = 2;
      final session = PrototypeSession();
      await tester.pumpWidget(
        SalapiyaApp(settings: settings, session: session),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Profile & utilities').last);
      await tester.pumpAndSettle();
      for (final scenario in OverviewScenario.values) {
        session.select(scenario);
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
      }
      await tapVisible(tester, find.text('First-run preview'));
      await tapVisible(tester, find.text('Restore from backup'));
      await tapVisible(tester, find.text('Cancel'));
      await tapVisible(tester, find.text('Skip to populated demo'));
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Quick actions'));
      await tester.pumpAndSettle();
      await tapVisible(tester, find.text('Add task'));
      tester.view.viewInsets = const FakeViewPadding(bottom: 220);
      addTearDown(tester.view.resetViewInsets);
      await tester.pumpAndSettle();
      await tapVisible(tester, find.text('Preview outcome'));
      expect(find.byType(DemoActionPage), findsOneWidget);
      expect(
        tester.getBottomLeft(find.text('Preview outcome')).dy,
        lessThanOrEqualTo(348),
      );
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets('all five destinations stay reachable at narrow 200% text', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(320, 568);
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      SalapiyaApp(settings: GallerySettings()..textScale = 2),
    );
    await tester.pumpAndSettle();
    for (final destination in AppDestination.values) {
      await tester.tap(find.text('Navigation'));
      await tester.pumpAndSettle();
      await tapVisible(tester, find.text(destination.label).last);
      expect(tester.takeException(), isNull, reason: destination.label);
      await tester.tap(find.byTooltip('Quick actions'));
      await tester.pumpAndSettle();
      expect(find.byTooltip('Close quick actions'), findsOneWidget);
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
    }
  });

  testWidgets(
    'shell destinations and quick actions have labeled touch targets',
    (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(412, 900);
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final semantics = tester.ensureSemantics();
      await tester.pumpWidget(const SalapiyaApp());
      await tester.pumpAndSettle();
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
      semantics.dispose();
    },
  );
}
