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

import '../test/local_money_journey.dart';
import 'p1_local_money_test.dart' show NoNetworkProof;
import 'p4_cards_test.dart' show nativeEnter, nativeSave;

Future<void> debtSelect(WidgetTester tester, String key, String choice) async {
  await localTap(tester, find.byKey(ValueKey('native-select-$key')));
  await localTap(tester, find.textContaining(choice).last);
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets(
    'P4 debt import, unknown actual payment, classification, schedule revision and reconciled payoff in production',
    (tester) async {
      final support = await getApplicationSupportDirectory();
      final directory = Directory('${support.path}/p4-debts-${newLocalId()}');
      final slot = 'salapiya.p4.debts.${newLocalId()}';
      final profiles = LocalProfiles(directory, OsProfileVault(slot: slot));
      final settings = GallerySettings();
      final runtime = LocalRuntime(profiles, settings);
      final previousNetwork = HttpOverrides.current, network = NoNetworkProof();
      HttpOverrides.global = network;
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
        await localTap(tester, find.text('Create a local offline profile'));
        await tester.enterText(find.byType(TextField), 'P4 debt owner');
        await localTap(tester, find.text('Create local profile'));
        await localWait(tester, () => runtime.session != null);
        await localTap(tester, find.byKey(const ValueKey('nav-money')));
        await localTap(tester, find.byTooltip('Create account'));
        await localEnter(tester, 'name', 'Debt wallet');
        await localEnter(tester, 'amount', '10000.00');
        await localConfirm(tester);
        final c = runtime.session!.localFinance,
            account = c.snapshot.accounts.single.id;
        await localTap(tester, find.byKey(const ValueKey('nav-debts')));
        await localTap(tester, find.text('Add existing debt').first);
        await localWait(
          tester,
          () => find.byKey(const ValueKey('native-name')).evaluate().isNotEmpty,
        );
        await nativeEnter(tester, 'name', 'Imported native debt');
        await nativeEnter(tester, 'lender', 'Synthetic provider');
        await nativeEnter(tester, 'amount', '6400.00');
        await nativeSave(tester);
        final debt = c.snapshot.current
            .singleWhere((r) => financeType(r) == 'debtImport')
            .actionId;
        expect(c.snapshot.balance(account), BigInt.from(1000000));
        await localTap(tester, find.text('Provider schedule').first);
        await localWait(
          tester,
          () => find.byKey(const ValueKey('native-name')).evaluate().isNotEmpty,
        );
        await nativeEnter(tester, 'name', 'Synthetic schedule');
        await debtSelect(tester, 'debt', 'Imported native debt ·');
        await nativeEnter(
          tester,
          'schedule',
          'first,2026-11-20,3200.00\nsecond,2026-12-20,3200.00',
        );
        await nativeEnter(tester, 'reference', 'Provider schedule');
        await debtSelect(tester, 'verified', 'I confirm these provider facts');
        await nativeSave(tester);
        await localTap(tester, find.text('Record debt payment').first);
        await localWait(
          tester,
          () => find.byKey(const ValueKey('native-name')).evaluate().isNotEmpty,
        );
        await nativeEnter(tester, 'name', 'Unknown native payment');
        await debtSelect(tester, 'debt', 'Imported native debt ·');
        await debtSelect(tester, 'account', 'Debt wallet');
        await nativeEnter(tester, 'amount', '1000.00');
        await nativeEnter(tester, 'clearing', '1000.00');
        await debtSelect(tester, 'scheduleSource', 'Synthetic schedule ·');
        await nativeEnter(tester, 'allocations', 'first,1000.00');
        await nativeSave(tester);
        expect(c.snapshot.balance(account), BigInt.from(900000));
        expect(
          financeBalance(c.snapshot, 'debt_liability', 'debt', debt),
          BigInt.from(-640000),
        );
        expect(
          financeBalance(c.snapshot, 'debt_clearing', 'debt', debt),
          BigInt.from(100000),
        );
        await localTap(tester, find.text('Classify payment').first);
        await localWait(
          tester,
          () => find.byKey(const ValueKey('native-name')).evaluate().isNotEmpty,
        );
        await nativeEnter(tester, 'name', 'Known provider breakdown');
        await debtSelect(tester, 'debt', 'Imported native debt ·');
        await debtSelect(tester, 'payment', 'Unknown native payment ·');
        await nativeEnter(tester, 'reduction', '900.00');
        await nativeEnter(tester, 'interest', '100.00');
        await nativeEnter(tester, 'reason', 'Provider breakdown received');
        await nativeSave(tester);
        expect(c.snapshot.balance(account), BigInt.from(900000));
        expect(
          financeBalance(c.snapshot, 'debt_clearing', 'debt', debt),
          BigInt.zero,
        );
        await localTap(tester, find.text('Synthetic schedule').first);
        await localTap(tester, find.text('Correct with reason'));
        await localWait(
          tester,
          () => find.byKey(const ValueKey('native-name')).evaluate().isNotEmpty,
        );
        await nativeEnter(
          tester,
          'schedule',
          'first,2026-11-25,3200.00\nsecond,2026-12-25,3200.00',
        );
        await nativeEnter(
          tester,
          'reason',
          'Provider revised due dates, preserve allocations',
        );
        await nativeSave(tester);
        await localTap(tester, find.byType(BackButton).first);
        await localTap(tester, find.text('Early settlement').first);
        await localWait(
          tester,
          () => find.byKey(const ValueKey('native-name')).evaluate().isNotEmpty,
        );
        await nativeEnter(tester, 'name', 'Reconciled native payoff');
        await debtSelect(tester, 'debt', 'Imported native debt ·');
        await debtSelect(tester, 'account', 'Debt wallet');
        await nativeEnter(tester, 'amount', '5500.00');
        await nativeEnter(tester, 'providerPayoff', '5500.00');
        await nativeEnter(tester, 'reduction', '5500.00');
        await nativeEnter(tester, 'reference', 'Provider closure');
        await nativeEnter(tester, 'reason', 'Exact provider payoff');
        await debtSelect(tester, 'verified', 'I confirm these provider facts');
        await nativeSave(tester);
        expect(c.snapshot.balance(account), BigInt.from(350000));
        expect(
          financeBalance(c.snapshot, 'debt_liability', 'debt', debt),
          BigInt.zero,
        );
        expect(c.recognizedSpending, BigInt.from(10000));
        await tester.runAsync(c.store.integrity);
        expect(network.attempts, 0);
      } finally {
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.runAsync(runtime.close);
        await profiles.close();
        await OsProfileVault.storage.delete(key: slot);
        if (await directory.exists()) await directory.delete(recursive: true);
        settings.dispose();
        HttpOverrides.global = previousNetwork;
      }
    },
  );
}
