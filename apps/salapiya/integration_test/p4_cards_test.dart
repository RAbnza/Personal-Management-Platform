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

Future<void> nativeEnter(WidgetTester tester, String key, String value) async {
  final field = find.byKey(ValueKey('native-$key'));
  await tester.ensureVisible(field);
  await tester.pumpAndSettle();
  final editable = find.descendant(
    of: field,
    matching: find.byType(EditableText),
  );
  await tester.runAsync(
    () async => tester
        .state<EditableTextState>(editable)
        .updateEditingValue(
          TextEditingValue(
            text: value,
            selection: TextSelection.collapsed(offset: value.length),
          ),
        ),
  );
  await localSettle(tester);
}

Future<void> nativeSave(WidgetTester tester) async {
  FocusManager.instance.primaryFocus?.unfocus();
  await localTap(tester, find.text('Review').last);
  await localWait(
    tester,
    () => find.text('Save reviewed values').evaluate().isNotEmpty,
  );
  await localTap(tester, find.text('Save reviewed values'));
  await localWait(
    tester,
    () => find.text('Saved locally.').evaluate().isNotEmpty,
  );
  await localTap(tester, find.text('Done'));
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets('P4 cards through the normal offline production application', (
    tester,
  ) async {
    final support = await getApplicationSupportDirectory();
    final directory = Directory('${support.path}/p4-cards-${newLocalId()}');
    final slot = 'salapiya.p4.cards.${newLocalId()}';
    final profiles = LocalProfiles(directory, OsProfileVault(slot: slot));
    final settings = GallerySettings();
    final runtime = LocalRuntime(profiles, settings);
    final previousNetwork = HttpOverrides.current, network = NoNetworkProof();
    HttpOverrides.global = network;
    var runtimeClosed = false;
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
      await tester.enterText(find.byType(TextField), 'P4 synthetic owner');
      await localTap(tester, find.text('Create local profile'));
      await localWait(tester, () => runtime.session != null);
      await localTap(tester, find.byKey(const ValueKey('nav-money')));
      await localTap(tester, find.byTooltip('Create account'));
      await localEnter(tester, 'name', 'P4 wallet');
      await localEnter(tester, 'amount', '5000.00');
      await localConfirm(tester);
      final c = runtime.session!.localFinance;
      final account = c.snapshot.accounts.single.id;
      await localTap(tester, find.text('Cards').first);
      await localTap(tester, find.text('Add credit card'));
      await localWait(
        tester,
        () => find.byKey(const ValueKey('native-name')).evaluate().isNotEmpty,
      );
      await nativeEnter(tester, 'name', 'P4 card');
      await nativeEnter(tester, 'issuer', 'Synthetic issuer');
      await nativeEnter(tester, 'limit', '10000.00');
      await nativeSave(tester);
      final card = c.snapshot.current
          .singleWhere((r) => financeType(r) == 'creditCard')
          .actionId;
      await localTap(tester, find.text('Add expense').first);
      await localEnter(tester, 'name', 'Native card dinner');
      await localEnter(tester, 'amount', '1200.00');
      await localTap(tester, find.byKey(const ValueKey('select-funding')));
      await localTap(tester, find.text('Credit card').last);
      await localConfirm(tester);
      expect(c.snapshot.balance(account), BigInt.from(500000));
      expect(
        financeBalance(c.snapshot, 'card_liability', 'card', card),
        BigInt.from(-120000),
      );
      expect(c.recognizedSpending, BigInt.from(120000));
      await localTap(tester, find.text('Pay credit card'));
      await localWait(
        tester,
        () => find.byKey(const ValueKey('native-amount')).evaluate().isNotEmpty,
      );
      await nativeEnter(tester, 'name', 'Native repayment');
      await nativeEnter(tester, 'amount', '1500.00');
      final cardField = find.widgetWithText(
        DropdownButtonFormField<String>,
        'Credit card',
      );
      await localTap(tester, cardField);
      await localTap(tester, find.textContaining('P4 card ·').last);
      await localTap(
        tester,
        find.widgetWithText(
          DropdownButtonFormField<String>,
          'Actual cash account',
        ),
      );
      await localTap(tester, find.text('P4 wallet').last);
      await nativeSave(tester);
      expect(c.snapshot.balance(account), BigInt.from(350000));
      expect(
        financeBalance(c.snapshot, 'card_liability', 'card', card),
        BigInt.from(30000),
      );
      expect(c.recognizedSpending, BigInt.from(120000));
      expect(find.textContaining('Card credit: 300.00 PHP'), findsOneWidget);
      await tester.runAsync(c.store.integrity);
      expect(network.attempts, 0);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.runAsync(runtime.close);
      runtimeClosed = true;
      final reopened = await tester.runAsync(profiles.reopen);
      expect(
        financeBalance(
          await tester.runAsync(reopened!.snapshot) ?? c.snapshot,
          'card_liability',
          'card',
          card,
        ),
        BigInt.from(30000),
      );
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      if (!runtimeClosed) await tester.runAsync(runtime.close);
      await profiles.close();
      await OsProfileVault.storage.delete(key: slot);
      if (await directory.exists()) await directory.delete(recursive: true);
      settings.dispose();
      HttpOverrides.global = previousNetwork;
    }
  });
}
