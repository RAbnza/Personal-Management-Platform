import 'dart:convert';
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
import 'package:salapiya/p0/portable_recovery.dart';

import '../test/local_money_journey.dart';

// Public synthetic fixture secret, never used by product code or real profiles.
final fixtureSecret = base64UrlEncode(List.generate(32, (i) => i));
const restartSlot = 'salapiya.p1.native-restart.v1';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets('P1 native independent recovery and real process restart', (
    tester,
  ) async {
    final support = await getApplicationSupportDirectory();
    final directory = Directory('${support.path}/p1-native-restart-v1');
    final profiles = LocalProfiles(
      directory,
      const OsProfileVault(slot: restartSlot),
    );
    final settings = GallerySettings();
    final runtime = LocalRuntime(profiles, settings);
    const verify = bool.fromEnvironment('P1_VERIFY_RESTART');
    try {
      if (!verify) {
        if (await profiles.vault.read() != null || await directory.exists()) {
          reject(
            'Previous synthetic restart evidence exists. Run the verify stage first; do not replace it.',
          );
        }
        Map<String, dynamic> bundle;
        if (const bool.fromEnvironment('P1_IMPORT_WINDOWS')) {
          final external = (await getExternalStorageDirectory())!;
          bundle = await LocalBackup.unseal(
            await File('${external.path}/p1-windows.salapiya').readAsBytes(),
            fixtureSecret,
          );
        } else {
          final sourceDir = Directory(
            '${support.path}/p1-source-${newLocalId()}',
          );
          final sourceSlot = 'salapiya.p1.source.${newLocalId()}';
          final sourceProfiles = LocalProfiles(
            sourceDir,
            OsProfileVault(slot: sourceSlot),
          );
          try {
            final store = await sourceProfiles.create('Recovery fixture', {
              'theme': 'dark',
              'hideAmounts': 'false',
            });
            Future<String> post(String kind, Map<String, String> values) async {
              final id = newLocalId();
              await store.commit(
                LocalCommand(
                  id: id,
                  owner: store.owner,
                  expectedVersion: (await store.snapshot()).version,
                  kind: kind,
                  values: {'date': '2026-10-21', ...values},
                ),
              );
              return id;
            }

            final cash = await post('account', {
              'name': 'Recovery cash',
              'kind': 'Cash',
              'amount': '1250.00',
              'cutoff': '2026-10-14',
            });
            final bank = await post('account', {
              'name': 'Recovery bank',
              'kind': 'Bank',
              'amount': '500.00',
              'cutoff': '2026-10-14',
            });
            final expense = await post('expense', {
              'name': 'Recovery receipt',
              'account': cash,
              'amount': '185.50',
              'category': 'category-food',
            });
            await post('income', {
              'name': 'Recovery gift',
              'account': cash,
              'amount': '20.01',
              'category': 'category-income',
              'incomeClass': 'gift',
            });
            await post('transfer', {
              'account': cash,
              'destination': bank,
              'amount': '100.00',
              'fee': '10.00',
              'feeTreatment': 'source_additional',
              'feeCategory': 'category-fees',
            });
            final original = (await store.snapshot()).revision(expense);
            final replacement = await post('correction', {
              ...original.values,
              'source': expense,
              'sourceVersion': '1',
              'amount': '180.50',
              'reason': 'Receipt evidence',
            });
            await post('refund', {
              'source': replacement,
              'sourceVersion': '2',
              'account': cash,
              'amount': '20.00',
              'refundCategory': 'category-food',
              'reason': 'Returned portion',
            });
            final comparison = await post('reconcile', {
              'account': cash,
              'amount': '1000.00',
            });
            await post('adjustment', {
              'source': comparison,
              'account': cash,
              'reason': 'Cash count',
            });
            await store.saveDraft('expense:', newLocalId(), {
              'name': 'Unposted recovered draft',
              'amount': '12.34',
            });
            bundle = await LocalBackup.capture(store);
            final archive = await LocalBackup.seal(bundle, fixtureSecret);
            await expectLater(
              LocalBackup.unseal(
                archive,
                await PortableRecovery.newRecoverySecret(),
              ),
              throwsA(anything),
            );
            const export = String.fromEnvironment('P1_EXPORT_PATH');
              if (export.isNotEmpty) {
              await PortableRecovery.writeNewArchive(File(export), archive);
              }
            final file = File('${sourceDir.path}/${store.owner}.sqlite');
            expect(
              utf8.decode(await file.readAsBytes(), allowMalformed: true),
              isNot(contains('Recovery receipt')),
            );
          } finally {
            await sourceProfiles.close();
            await OsProfileVault.storage.delete(key: sourceSlot);
              if (await sourceDir.exists()) {
              await sourceDir.delete(recursive: true);
              }
          }
        }
        // Validate on a separately keyed native database and resume activation
        // from a real OS-protected descriptor after an interrupted final stage.
        await expectLater(
          profiles.restore(bundle, interruptActivation: true),
          throwsStateError,
        );
      }
      await runtime.reopen();
      final s = runtime.session!;
      expect(s.finance.version, 9);
      expect(s.finance.liquid, BigInt.from(160000));
      expect(s.profile.name, 'Recovery fixture');
      expect(settings.themeMode, ThemeMode.dark);
      final store = s.localFinance.store;
      expect((await store.draft('expense:'))!['values']['amount'], '12.34');
      expect(s.localFinance.snapshot.revisions.length, 9);
      expect(await store.db.getNextCrudTransaction(), isNull);
      await store.integrity();
      await tester.pumpWidget(
        SalapiyaApp(
          production: true,
          settings: settings,
          localRuntime: runtime,
        ),
      );
      await localSettle(tester);
      expect(find.text('Your day, in balance.'), findsOneWidget);
      expect(find.text('Create a local offline profile'), findsNothing);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
      await localSettle(tester);
      await runtime.close();
      if (verify) {
        await OsProfileVault.storage.delete(key: restartSlot);
        await directory.delete(recursive: true);
      }
      // Seed stage intentionally leaves only its synthetic protected fixture
      // for a second invocation in a new native process.
    } finally {
      await runtime.close();
      runtime.dispose();
      settings.dispose();
    }
  });
}
