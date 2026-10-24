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
          await tester.pumpAndSettle();
          expect(find.text('Your day, in balance.'), findsOneWidget);
          expect(find.textContaining('Tala reported'), findsNothing);
          expect(find.textContaining('DEMO ·'), findsNothing);
          expect(runtime.session!.finance.liquid, BigInt.from(10000));
          expect(find.text('Real receipt'), findsOneWidget);
          await tester.tap(find.byKey(const ValueKey('nav-money')));
          await tester.pumpAndSettle();
          expect(find.text('Make room for living.'), findsOneWidget);
          expect(find.text('Real wallet'), findsWidgets);
          await tester.tap(find.byKey(const ValueKey('nav-debts')));
          await tester.pumpAndSettle();
          expect(find.text('Your space is ready to grow.'), findsOneWidget);
          expect(find.text('Home essentials loan'), findsNothing);
          // Both navigation systems stay usable with enlarged text and Midnight.
          await tester.runAsync(() async {
            settings.change(() {
              settings.textScale = 2;
              settings.themeMode = ThemeMode.dark;
            });
            await runtime.flushPreferences();
          });
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
          await tester.tap(
            mobile
                ? find.byKey(const ValueKey('navigation-fallback'))
                : find.byTooltip('Navigation · 5 destinations'),
          );
          await tester.pumpAndSettle();
          await tester.tap(find.text('Money'));
          await tester.pumpAndSettle();
          expect(find.text('Make room for living.'), findsOneWidget);
          expect(tester.takeException(), isNull);
        } finally {
          debugDefaultTargetPlatformOverride = null;
          await tester.pumpWidget(const SizedBox.shrink());
          await tester.pumpAndSettle();
          await tester.runAsync(runtime.flushPreferences);
          runtime.dispose();
          settings.dispose();
          await tester.runAsync(f.close);
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
        await tester.pumpAndSettle();
        expect(find.text('Create a local offline profile'), findsOneWidget);
        expect(find.text('Continue with Google'), findsOneWidget);
        expect(find.text('Restore from backup'), findsOneWidget);
        await tester.ensureVisible(find.text('Continue with Google'));
        await tester.tap(find.text('Continue with Google'));
        await tester.pumpAndSettle();
        expect(
          find.textContaining('planned for a later milestone'),
          findsOneWidget,
        );
        expect(runtime.session, isNull);
      } finally {
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pumpAndSettle();
        await tester.runAsync(runtime.close);
        runtime.dispose();
        settings.dispose();
        await tester.runAsync(() => dir.delete(recursive: true));
      }
    },
  );
}
