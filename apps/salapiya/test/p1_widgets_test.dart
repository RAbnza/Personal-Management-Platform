import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/app.dart';
import 'package:salapiya/gallery/settings.dart';
import 'package:salapiya/local/finance_domain.dart';
import 'package:salapiya/local/local_profiles.dart';
import 'package:salapiya/local/local_runtime.dart';

import 'local_test_support.dart';
import 'local_money_journey.dart' show localSettle, localTap;

Future<void> closeWithWidgetClock(
  WidgetTester tester,
  Future<void> Function() work,
) async {
  Future<void>? closing;
  var closed = false;
  await tester.runAsync(() async {
    closing = work().whenComplete(() => closed = true);
  });
  for (var i = 0; i < 200 && !closed; i++) {
    await tester.pump();
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 20)),
    );
  }
  expect(
    closed,
    isTrue,
    reason: 'Native cleanup must release its asynchronous leases',
  );
  await tester.runAsync(() => closing!);
}

void main() {
  for (final mobile in [false, true]) {
    testWidgets(
      'P1 ${mobile ? 'Android' : 'Windows'} composition uses committed records and truthful availability',
      (tester) async {
        debugDefaultTargetPlatformOverride = mobile
            ? TargetPlatform.android
            : TargetPlatform.windows;
        addTearDown(() => debugDefaultTargetPlatformOverride = null);
        tester.view.physicalSize = mobile
            ? const Size(412, 900)
            : const Size(1400, 1000);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final f = (await tester.runAsync(LocalFixture.open))!;
        final settings = GallerySettings();
        final runtime = LocalRuntime(
          LocalProfiles(f.directory, MemoryProfileVault()),
          settings,
        );
        try {
          await tester.runAsync(() async {
            final account = await f.account('Real wallet', '150.00');
            await f.post('expense', {
              'name': 'Real receipt',
              'account': account,
              'date': civilToday(),
              'amount': '50.00',
              'category': 'category-food',
            });
            await runtime.activate(f.store);
          });
          await tester.pumpWidget(
            SalapiyaApp(session: runtime.session, settings: settings),
          );
          await localSettle(tester);
          expect(find.text('Your day, in balance.'), findsOneWidget);
          expect(find.textContaining('Tala reported'), findsNothing);
          expect(find.textContaining('DEMO ·'), findsNothing);
          expect(runtime.session!.finance.liquid, BigInt.from(10000));
          expect(find.text('Real receipt'), findsOneWidget);
          await tester.tap(find.byKey(const ValueKey('nav-money')));
          await localSettle(tester);
          expect(find.text('Make room for living.'), findsOneWidget);
          expect(find.text('Real wallet'), findsWidgets);
          await tester.tap(find.byKey(const ValueKey('nav-debts')));
          await localSettle(tester);
          expect(find.text('One step closer.'), findsOneWidget);
          expect(find.text('Home essentials loan'), findsNothing);
          // Both navigation systems stay usable with enlarged text and Midnight.
          await tester.runAsync(() async {
            settings.change(() {
              settings.textScale = 2;
              settings.themeMode = ThemeMode.dark;
            });
            await runtime.flushPreferences();
          });
          await localSettle(tester);
          expect(tester.takeException(), isNull);
          await tester.tap(
            mobile
                ? find.byKey(const ValueKey('navigation-fallback'))
                : find.byTooltip('Navigation · 5 destinations'),
          );
          await localSettle(tester);
          await tester.tap(find.text('Money'));
          await localSettle(tester);
          expect(find.text('Make room for living.'), findsOneWidget);
          expect(tester.takeException(), isNull);
        } finally {
          debugDefaultTargetPlatformOverride = null;
          await tester.pumpWidget(const SizedBox.shrink());
          await localSettle(tester);
          await tester.runAsync(runtime.flushPreferences);
          await closeWithWidgetClock(tester, runtime.close);
          runtime.dispose();
          settings.dispose();
          await closeWithWidgetClock(tester, f.close);
        }
      },
    );
  }
  testWidgets(
    'first-run keeps the three approved choices and no fake connection',
    (tester) async {
      final dir = (await tester.runAsync(
        () => Directory.systemTemp.createTemp('salapiya-p1-welcome-'),
      ))!;
      final settings = GallerySettings();
      final runtime = LocalRuntime(
        LocalProfiles(dir, MemoryProfileVault()),
        settings,
      );
      try {
        await tester.runAsync(runtime.reopen);
        await tester.pumpWidget(
          SalapiyaApp(
            production: true,
            settings: settings,
            localRuntime: runtime,
          ),
        );
        await localSettle(tester);
        expect(find.text('Create a local offline profile'), findsOneWidget);
        expect(find.text('Continue with Google'), findsOneWidget);
        expect(find.text('Restore from backup'), findsOneWidget);
        await tester.ensureVisible(find.text('Continue with Google'));
        await localTap(tester, find.text('Continue with Google'));
        await localSettle(tester);
        expect(
          find.textContaining('This build supports local use.'),
          findsOneWidget,
        );
        expect(runtime.session, isNull);
      } finally {
        await tester.pumpWidget(const SizedBox.shrink());
        await localSettle(tester);
        await closeWithWidgetClock(tester, runtime.close);
        runtime.dispose();
        settings.dispose();
        await tester.runAsync(() => dir.delete(recursive: true));
      }
    },
  );
}
