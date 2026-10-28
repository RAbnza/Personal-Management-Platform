import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:path_provider/path_provider.dart';
import 'package:salapiya/app.dart';
import 'package:salapiya/gallery/settings.dart';
import 'package:salapiya/local/finance_domain.dart';
import 'package:salapiya/local/local_profiles.dart';
import 'package:salapiya/local/local_runtime.dart';
import 'package:salapiya/life/life_controller.dart';

import '../test/local_money_journey.dart';
import 'p4_cards_test.dart' show nativeEnter, nativeSave;
import 'p5_life_native_test.dart' show lifeEnter, lifeSave;

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets(
    'P6 production onboarding, reviewed money, Life, reflow and encrypted reopen without image capture',
    (tester) async {
      final support = await getApplicationSupportDirectory();
      final dir = Directory('${support.path}/redesign-test-${newLocalId()}');
      final slot = 'salapiya.redesign.${newLocalId()}';
      final profiles = LocalProfiles(dir, OsProfileVault(slot: slot));
      final settings = GallerySettings()..themeMode = ThemeMode.light;
      var runtime = LocalRuntime(profiles, settings);
      Future<void> checkScreen(String name) async {
        await localSettle(tester);
        for (final scroll in tester.stateList<ScrollableState>(
          find.byType(Scrollable),
        )) {
          if (axisDirectionToAxis(scroll.position.axisDirection) ==
              Axis.vertical) {
            scroll.position.jumpTo(scroll.position.minScrollExtent);
          }
        }
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull, reason: name);
        expect(find.byType(Scaffold), findsWidgets, reason: name);
      }

      Future<void> back() async =>
          localTap(tester, find.byType(BackButton).first);
      try {
        await binding.setSurfaceSize(
          Platform.isWindows ? const Size(1440, 900) : const Size(412, 900),
        );
        await runtime.reopen();
        await tester.pumpWidget(
          SalapiyaApp(
            production: true,
            settings: settings,
            localRuntime: runtime,
          ),
        );
        await checkScreen('welcome');
        await localTap(tester, find.text('Continue with Google'));
        await checkScreen('connection');
        expect(runtime.session, isNull);
        await back();
        await localTap(tester, find.text('Restore from backup'));
        await checkScreen('restore');
        await back();
        await localTap(tester, find.text('Create a local offline profile'));
        await tester.enterText(
          find.byType(TextField),
          'P6 synthetic release check',
        );
        await localTap(tester, find.text('Cancel'));
        expect(find.text('Discard your changes?'), findsOneWidget);
        await localTap(tester, find.text('Keep editing'));
        await checkScreen('profile-setup');
        await localTap(tester, find.text('Create local profile'));
        await localWait(tester, () => runtime.session != null);
        await checkScreen('overview-empty');
        await localTap(tester, find.byKey(const ValueKey('nav-money')));
        await localTap(tester, find.text('Add account'));
        await localEnter(tester, 'name', 'Everyday wallet');
        await localEnter(tester, 'amount', '25000.00');
        await checkScreen('account-form');
        await localConfirm(tester);
        await localTap(tester, find.text('Add expense').first);
        await localEnter(tester, 'name', 'Weekly groceries');
        await localEnter(tester, 'amount', '850.25');
        await localEnter(tester, 'date', civilToday());
        await localConfirm(tester);
        expect(runtime.session!.finance.liquid, BigInt.from(2414975));
        await localTap(tester, find.text('Cards').first);
        await localTap(tester, find.text('Add credit card'));
        await nativeEnter(tester, 'name', 'Everyday card');
        await nativeEnter(tester, 'issuer', 'Synthetic provider');
        await nativeEnter(tester, 'limit', '50000.00');
        await nativeSave(tester);
        await localTap(tester, find.byKey(const ValueKey('nav-life')));
        await localTap(tester, find.text('Tasks').first);
        await localTap(tester, find.text('New task'));
        await lifeEnter(tester, 'title', 'Plan the week');
        await checkScreen('task-form');
        await lifeSave(tester);
        expect(
          (runtime.session!.life as DurableLifeController).entries.single.title,
          'Plan the week',
        );
        for (final mode in [ThemeMode.light, ThemeMode.dark]) {
          settings.change(() => settings.themeMode = mode);
          await localTap(tester, find.byKey(const ValueKey('nav-overview')));
          await checkScreen('${mode.name}-overview');
          await localTap(tester, find.byKey(const ValueKey('nav-money')));
          for (final tab in [
            'Accounts',
            'Activity',
            'Cards',
            'Planning',
            'Reports',
            'Import',
            'Files',
          ]) {
            await localTap(tester, find.text(tab).first);
            await checkScreen('${mode.name}-${tab.toLowerCase()}');
          }
          for (final dest in ['debts', 'shared', 'life']) {
            await localTap(tester, find.byKey(ValueKey('nav-$dest')));
            await checkScreen('${mode.name}-$dest');
          }
          await localTap(tester, find.text('Career').first);
          await checkScreen('${mode.name}-career');
          if (mode == ThemeMode.light) {
            for (final tab in ['Calendar', 'Learning', 'Books']) {
              await localTap(tester, find.text(tab).first);
              await checkScreen('light-${tab.toLowerCase()}');
            }
          }
        }
        final count = runtime.session!.localFinance.snapshot.revisions.length;
        settings.change(() {
          settings.textScale = 2;
          settings.reduceMotion = true;
        });
        await checkScreen('large-text-career');
        expect(runtime.session!.localFinance.snapshot.revisions.length, count);
        await tester.pumpWidget(const SizedBox.shrink());
        await localSettle(tester);
        await runtime.close();
        runtime.dispose();
        runtime = LocalRuntime(profiles, settings);
        await runtime.reopen();
        expect(runtime.session!.finance.liquid, BigInt.from(2414975));
        expect(
          (runtime.session!.life as DurableLifeController).entries.single.title,
          'Plan the week',
        );
        binding.reportData = {
          'platform': Platform.operatingSystem,
          'imageCapture': false,
          'result': 'passed',
          'scope': 'isolated synthetic profile, native rendering and reviewed UI; no hosted sign-in or release certification',
        };
      } finally {
        await tester.pumpWidget(const SizedBox.shrink());
        await localSettle(tester);
        await runtime.close();
        runtime.dispose();
        settings.dispose();
        await OsProfileVault.storage.delete(key: slot);
        if (await dir.exists()) await dir.delete(recursive: true);
        await binding.setSurfaceSize(null);
      }
    },
  );
}
