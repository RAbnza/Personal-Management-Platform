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

Future<void> waitForNativePicker(
  WidgetTester tester,
  bool Function() ready,
  String label,
) async {
  debugPrint('P4_NATIVE_PICKER: $label');
  for (var i = 0; i < 1500 && !ready(); i++) {
    await tester.pump();
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 200)),
    );
  }
  expect(
    ready(),
    isTrue,
    reason: 'Actual native picker did not complete: $label',
  );
  await localSettle(tester);
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets(
    'P4 native file selection, verified preview, cash CSV and filtered export in production',
    (tester) async {
      final support = await getApplicationSupportDirectory(),
          slot = 'salapiya.p4.portability.${newLocalId()}';
      final directory = Directory(
        '${support.path}/p4-portability-${newLocalId()}',
      );
      final profiles = LocalProfiles(directory, OsProfileVault(slot: slot)),
          settings = GallerySettings();
      final runtime = LocalRuntime(profiles, settings),
          previous = HttpOverrides.current,
          network = NoNetworkProof();
      HttpOverrides.global = network;
      LocalRuntime? restoredRuntime;
      Directory? restoredDirectory;
      String? restoredSlot;
      var originalClosed = false;
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
        await tester.enterText(find.byType(TextField), 'P4 portability owner');
        await localTap(tester, find.text('Create local profile'));
        await localWait(tester, () => runtime.session != null);
        await localTap(tester, find.byKey(const ValueKey('nav-money')));
        await localTap(tester, find.byTooltip('Create account'));
        await localEnter(tester, 'name', 'Portability wallet');
        await localEnter(tester, 'amount', '1000.00');
        await localEnter(tester, 'cutoff', '2026-10-01');
        await localConfirm(tester);
        final c = runtime.session!.localFinance,
            account = c.snapshot.accounts.single.id;
        await localTap(tester, find.text('Add expense').first);
        await localEnter(tester, 'name', 'Synthetic supporting source');
        await localEnter(tester, 'amount', '20.00');
        await localConfirm(tester);
        expect(c.snapshot.balance(account), BigInt.from(98000));
        await localTap(tester, find.text('Files').first);
        await localTap(
          tester,
          find.byType(DropdownButtonFormField<String>).first,
        );
        await localTap(
          tester,
          find.textContaining('Synthetic supporting source ·').last,
        );
        await localTap(tester, find.text('Choose private supporting file'));
        await waitForNativePicker(
          tester,
          () =>
              find.text('Review private supporting file').evaluate().isNotEmpty,
          'select test/fixtures/p4_receipt.png',
        );
        await localTap(tester, find.text('Attach private file'));
        await localWait(
          tester,
          () =>
              c.snapshot.current.any((r) => financeType(r) == 'financialFile'),
        );
        expect(c.snapshot.balance(account), BigInt.from(98000));
        await localTap(tester, find.text('Preview unscanned image'));
        await localWait(
          tester,
          () => find
              .text(
                'Unscanned private image. Integrity verification is not a safety scan.',
              )
              .evaluate()
              .isNotEmpty,
        );
        expect(find.byType(Image), findsWidgets);
        await localTap(tester, find.text('Close'));
        await localTap(tester, find.text('Import').first);
        await localTap(
          tester,
          find.text('Choose supported cash CSV / start a new review'),
        );
        await waitForNativePicker(
          tester,
          () => find
              .text('Stage & generate immutable preview')
              .evaluate()
              .isNotEmpty,
          'select test/fixtures/p4_cash.csv',
        );
        await localTap(tester, find.text('Stage & generate immutable preview'));
        await localWait(
          tester,
          () => find.text('Confirm exact row decisions').evaluate().isNotEmpty,
        );
        expect(c.snapshot.balance(account), BigInt.from(98000));
        await localTap(tester, find.text('Confirm exact row decisions'));
        await localWait(
          tester,
          () => find.text('Process next reviewed chunk').evaluate().isNotEmpty,
        );
        await localTap(tester, find.text('Process next reviewed chunk'));
        await localWait(
          tester,
          () => c.snapshot.balance(account) == BigInt.from(105500),
        );
        expect(
          c.snapshot.current
              .where((r) => r.values.containsKey('importRow'))
              .length,
          2,
        );
        await localTap(tester, find.text('Reports').first);
        await localTap(tester, find.text('Export filtered financial CSV'));
        await waitForNativePicker(
          tester,
          () => find
              .textContaining('Financial CSV saved with the displayed filters')
              .evaluate()
              .isNotEmpty,
          'save synthetic financial CSV to a temporary test destination',
        );
        await tester.runAsync(c.store.integrity);
        final originalIds = c.snapshot.revisions.map((r) => r.id).toList(),
            owner = c.store.owner;
        await localTap(tester, find.byTooltip('Profile & utilities'));
        await localTap(tester, find.text('Backup & recovery'));
        await localTap(tester, find.text('Generate recovery secret'));
        final secretField = find.widgetWithText(TextField, 'Recovery secret');
        final recoverySecret = tester
            .widget<TextField>(secretField)
            .controller!
            .text;
        expect(recoverySecret, isNotEmpty);
        await localTap(
          tester,
          find.widgetWithText(
            CheckboxListTile,
            'I have saved this recovery secret in a separate safe place',
          ),
        );
        await localTap(tester, find.text('Save encrypted backup'));
        await waitForNativePicker(
          tester,
          () => find
              .textContaining('Encrypted backup saved.')
              .evaluate()
              .isNotEmpty,
          'save encrypted synthetic financial archive',
        );
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.runAsync(runtime.close);
        runtime.dispose();
        originalClosed = true;
        restoredDirectory = Directory(
          '${support.path}/p4-independent-${newLocalId()}',
        );
        restoredSlot = 'salapiya.p4.independent.${newLocalId()}';
        restoredRuntime = LocalRuntime(
          LocalProfiles(restoredDirectory, OsProfileVault(slot: restoredSlot)),
          settings,
        );
        await tester.runAsync(restoredRuntime.reopen);
        await tester.pumpWidget(
          SalapiyaApp(
            production: true,
            settings: settings,
            localRuntime: restoredRuntime,
          ),
        );
        await localSettle(tester);
        await localTap(tester, find.text('Restore from backup'));
        await tester.enterText(
          find.widgetWithText(TextField, 'Recovery secret'),
          recoverySecret,
        );
        FocusManager.instance.primaryFocus?.unfocus();
        await localSettle(tester);
        await localTap(tester, find.text('Choose and inspect backup'));
        await waitForNativePicker(
          tester,
          () =>
              find.text('Restore reviewed local profile').evaluate().isNotEmpty,
          'select the encrypted archive just saved',
        );
        await localTap(tester, find.text('Restore reviewed local profile'));
        await localWait(tester, () => restoredRuntime!.session != null);
        final recovered = restoredRuntime.session!.localFinance;
        expect(recovered.store.owner, owner);
        expect(
          recovered.snapshot.revisions.map((r) => r.id).toList(),
          originalIds,
        );
        expect(recovered.snapshot.balance(account), BigInt.from(105500));
        await localTap(tester, find.byKey(const ValueKey('nav-money')));
        await localTap(tester, find.text('Files').first);
        await localWait(
          tester,
          () => find
              .textContaining('Actual bytes absent on this device.')
              .evaluate()
              .isNotEmpty,
        );
        final recoveredVersion = recovered.snapshot.version;
        await localTap(
          tester,
          find.text('Restore local bytes from identical original'),
        );
        await waitForNativePicker(
          tester,
          () => find
              .textContaining('Original bytes match the immutable checksum')
              .evaluate()
              .isNotEmpty,
          'select the same test/fixtures/p4_receipt.png to restore local bytes',
        );
        expect(recovered.snapshot.version, recoveredVersion);
        await localTap(tester, find.text('Preview unscanned image'));
        await localWait(
          tester,
          () => find
              .text(
                'Unscanned private image. Integrity verification is not a safety scan.',
              )
              .evaluate()
              .isNotEmpty,
        );
        await localTap(tester, find.text('Close'));
        await tester.runAsync(recovered.store.integrity);
        expect(network.attempts, 0);
        expect(tester.takeException(), isNull);
      } finally {
        await tester.pumpWidget(const SizedBox.shrink());
        if (!originalClosed) {
          await tester.runAsync(runtime.close);
          runtime.dispose();
        }
        if (restoredRuntime != null) {
          await tester.runAsync(restoredRuntime.close);
          restoredRuntime.dispose();
        }
        settings.dispose();
        await OsProfileVault.storage.delete(key: slot);
        if (restoredSlot != null) {
          await OsProfileVault.storage.delete(key: restoredSlot);
        }
        if (restoredDirectory != null && await restoredDirectory.exists()) {
          await restoredDirectory.delete(recursive: true);
        }
        if (await directory.exists()) await directory.delete(recursive: true);
        HttpOverrides.global = previous;
      }
    },
    skip: !const bool.fromEnvironment('P4_NATIVE_PICKERS'),
  );
}
