import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/app.dart';
import 'package:salapiya/gallery/settings.dart';
import 'package:salapiya/local/finance_domain.dart';
import 'package:salapiya/local/local_profiles.dart';
import 'package:salapiya/local/local_runtime.dart';
import 'package:salapiya/local/local_store.dart';

import 'local_test_support.dart';

void main() {
  for (final mobile in [false, true]) {
    testWidgets(
      'P2 ${mobile ? 'Android' : 'Windows'} pending totals and connection review remain usable at 200% in Midnight',
      (tester) async {
        debugDefaultTargetPlatformOverride = mobile
            ? TargetPlatform.android
            : TargetPlatform.windows;
        addTearDown(() => debugDefaultTargetPlatformOverride = null);
        tester.view.physicalSize = mobile
            ? const Size(412, 900)
            : const Size(1200, 900);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final f = (await tester.runAsync(LocalFixture.open))!;
        final settings = GallerySettings(),
            runtime = LocalRuntime(
              LocalProfiles(f.directory, MemoryProfileVault()),
              GallerySettings(),
            );
        try {
          await tester.runAsync(() async {
            final a = await f.account('Connected summary', '100.00');
            await f.store.savePreferences('Synthetic connected owner', {
              'theme': 'dark',
              'textScale': '2.0',
            });
            // Explicit cached-connection UI fixture; this test does not certify CDC.
            await f.store.stageConnection(
              newLocalId(),
              'synthetic@example.test',
              newLocalId(),
            );
            await f.store.db.execute(
              "UPDATE connected_profile SET phase='connected'",
            );
            await f.post('expense', {
              'account': a,
              'name': 'Exact waiting purchase',
              'date': '2026-10-22',
              'amount': '9.99',
              'category': 'category-food',
            });
            await runtime.activate(f.store);
          });
          await tester.pumpWidget(
            SalapiyaApp(
              production: true,
              settings: runtime.settings,
              localRuntime: runtime,
            ),
          );
          await tester.pumpAndSettle();
          expect(runtime.session!.accepted, BigInt.from(10000));
          expect(runtime.session!.projected, BigInt.from(9001));
          expect(
            find.textContaining('Waiting local work is included once'),
            findsOneWidget,
          );
          expect(find.textContaining('Pending outflow'), findsNothing);
          expect(find.textContaining('LOCAL ONLY'), findsNothing);
          expect(tester.takeException(), isNull);
          final profile = find.byTooltip('Profile & utilities').first;
          await tester.ensureVisible(profile);
          await tester.tap(profile);
          await tester.pumpAndSettle();
          await tester.ensureVisible(find.text('Connection'));
          await tester.tap(find.text('Connection'));
          await tester.pumpAndSettle();
          expect(find.text('Your money, across devices.'), findsOneWidget);
          expect(find.textContaining('1 waiting'), findsOneWidget);
          expect(find.text('Sync now'), findsOneWidget);
          expect(tester.takeException(), isNull);
        } finally {
          debugDefaultTargetPlatformOverride = null;
          await tester.pumpWidget(const SizedBox.shrink());
          await tester.pumpAndSettle();
          // SDK shutdown can schedule timers in this widget test's fake clock.
          // Pump it while the real encrypted database closes; do not leave an
          // outstanding cancellation behind for the next platform fixture.
          var databaseClosed = false;
          final closing = (() async {
            await runtime.close();
            runtime.dispose();
            runtime.settings.dispose();
            settings.dispose();
            await f.close();
          })().whenComplete(() => databaseClosed = true);
          for (var i = 0; i < 200 && !databaseClosed; i++) {
            await tester.pump(const Duration(milliseconds: 20));
            await tester.runAsync(
              () => Future<void>.delayed(const Duration(milliseconds: 10)),
            );
          }
          expect(databaseClosed, isTrue);
          await closing;
        }
      },
    );
  }
}
