import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/app.dart';
import 'package:salapiya/gallery/settings.dart';
import 'package:salapiya/local/local_profiles.dart';
import 'package:salapiya/local/local_runtime.dart';
import 'package:salapiya/life/life_controller.dart';
import 'package:salapiya/life/life_domain.dart';
import 'package:salapiya/features/life/application/life_controller.dart';

import 'local_test_support.dart';
import 'local_money_journey.dart' show localSettle, localTap;
import 'p1_widgets_test.dart' show closeWithWidgetClock;

void main() {
  for (final mobile in [false, true]) {
    testWidgets(
      'P5 ${mobile ? 'Android' : 'Windows'} production Life navigation, labels, themes and large text remain usable',
      (tester) async {
        debugDefaultTargetPlatformOverride = mobile
            ? TargetPlatform.android
            : TargetPlatform.windows;
        addTearDown(() => debugDefaultTargetPlatformOverride = null);
        tester.view.physicalSize = mobile
            ? const Size(412, 900)
            : const Size(1000, 850);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final fixture = (await tester.runAsync(LocalFixture.open))!,
            settings = GallerySettings()
              ..textScale = 2
              ..reduceMotion = true;
        final runtime = LocalRuntime(
          LocalProfiles(fixture.directory, MemoryProfileVault()),
          settings,
        );
        final semantics = tester.ensureSemantics();
        try {
          await tester.runAsync(() async {
            await runtime.activate(fixture.store);
            final c = runtime.session!.life as DurableLifeController;
            await c.saveEntry(LifeKind.task, {
              'title': 'A durable accessible task',
              'due': '',
              'status': 'Not started',
            });
            await c.saveApplication({
              'company': 'Synthetic salary employer',
              'position': 'Private role',
              'stage': 'Saved',
              'stageDate': LifeTime.today(),
              'salaryMin': '12345.67',
            });
            runtime.session!.togglePrivacy();
            settings.textScale = 2;
            settings.reduceMotion = true;
            settings.themeMode = mobile ? ThemeMode.dark : ThemeMode.light;
          });
          await tester.pumpWidget(
            SalapiyaApp(session: runtime.session, settings: settings),
          );
          await localSettle(tester);
          await localTap(
            tester,
            mobile
                ? find.byKey(const ValueKey('navigation-fallback'))
                : find.byTooltip('Navigation \u00b7 5 destinations'),
          );
          await localTap(tester, find.text('Life').last);
          await localTap(tester, find.text('Tasks').first);
          expect(find.text('A durable accessible task'), findsOneWidget);
          expect(find.textContaining('View state:'), findsNothing);
          expect(find.text('Simulated outcome'), findsNothing);
          expect(
            find.bySemanticsLabel('Complete task A durable accessible task'),
            findsWidgets,
          );
          expect(tester.takeException(), isNull);
          await localTap(tester, find.text('Career').first);
          await localTap(tester, find.text('Synthetic salary employer'));
          expect(find.text('12345.67'), findsNothing);
          expect(find.text('Hidden'), findsWidgets);
          await tester.runAsync(() async {
            runtime.session!.togglePrivacy();
          });
          await localSettle(tester);
          expect(find.text('12345.67'), findsWidgets);
          await localTap(tester, find.byType(BackButton));
          await localTap(tester, find.text('Calendar').first);
          expect(find.text('Demo today'), findsNothing);
          expect(tester.takeException(), isNull);
          await localTap(tester, find.text('Preferences & help'));
          expect(find.textContaining('Visibility changes'), findsOneWidget);
          expect(tester.takeException(), isNull);
          await tester.pumpWidget(const SizedBox());
          await localSettle(tester);
        } finally {
          debugDefaultTargetPlatformOverride = null;
          semantics.dispose();
          await closeWithWidgetClock(tester, runtime.close);
          runtime.dispose();
          settings.dispose();
          await closeWithWidgetClock(tester, fixture.close);
        }
      },
    );
  }
}
