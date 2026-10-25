import 'dart:convert';
import 'dart:io';
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:salapiya/connected/command_connector.dart';
import 'package:path_provider/path_provider.dart';
import 'package:salapiya/app.dart';
import 'package:salapiya/gallery/settings.dart';
import 'package:salapiya/local/local_profiles.dart';
import 'package:salapiya/local/local_runtime.dart';
import 'package:salapiya/local/local_store.dart';
import 'package:salapiya/local/finance_domain.dart';
import 'package:salapiya/p0/auth_runtime.dart';
import 'package:salapiya/p0/google_auth_proof.dart';
import 'package:salapiya/shared/shared_domain.dart';
import 'package:salapiya/shared/shared_screen.dart';
import 'package:salapiya/shared/shared_repository.dart';
import 'package:salapiya/p0/portable_recovery.dart';

import '../test/local_money_journey.dart';
import 'p2_native_test.dart' show PrivateDownload;

Future<void> p3Wait(
  WidgetTester tester,
  FutureOr<bool> Function() ready,
) async {
  for (var i = 0; i < 400; i++) {
    if (await tester.runAsync(() async => await ready()) == true) {
      await localSettle(tester);
      return;
    }
    await tester.pump(const Duration(milliseconds: 30));
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 80)),
    );
  }
  fail('P3 native operation did not complete.');
}

Future<void> p3Enter(WidgetTester tester, String label, String value) async {
  final field = find.widgetWithText(TextField, label);
  await localWait(tester, () => field.evaluate().isNotEmpty);
  await tester.ensureVisible(field);
  await tester.pumpAndSettle();
  final editable = find.descendant(
    of: field,
    matching: find.byType(EditableText),
  );
  await tester.runAsync(() async {
    tester
        .state<EditableTextState>(editable)
        .updateEditingValue(
          TextEditingValue(
            text: value,
            selection: TextSelection.collapsed(offset: value.length),
          ),
        );
  });
  await localSettle(tester);
}

Future<void> p3Select(WidgetTester tester, String key, String label) async {
  await localWait(
    tester,
    () => find.byKey(ValueKey('shared-field-$key')).evaluate().isNotEmpty,
  );
  await localTap(tester, find.byKey(ValueKey('shared-field-$key')));
  await p3Choice(tester, label);
}

Future<void> p3Choice(WidgetTester tester, String label) async {
  // Repeated isolated runs retain the user's/test profile history. Native
  // dropdowns lazily build long lists; scroll rather than resetting accounts.
  if (find.text(label).evaluate().isEmpty) {
    await tester.scrollUntilVisible(
      find.text(label),
      240,
      scrollable: find.byType(Scrollable).last,
      maxScrolls: 100,
    );
    await localSettle(tester);
  }
  await localTap(tester, find.text(label).last);
}

Future<void> p3Save(WidgetTester tester, {bool private = false}) async {
  await localWait(tester, () => find.text('Review').evaluate().isNotEmpty);
  await localTap(tester, find.text('Review').last);
  await localWait(
    tester,
    () => find.text('Save reviewed values').evaluate().isNotEmpty,
  );
  await localTap(tester, find.text('Save reviewed values'));
  if (private) {
    await localWait(
      tester,
      () => find.text('Save my private action').evaluate().isNotEmpty,
    );
    await localTap(tester, find.text('Save my private action'));
  }
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets(
    'P3 normal product UI, actual entitled CDC, exact bill, offline queue restart and private isolation',
    (tester) async {
      const configPath = String.fromEnvironment('P3_NATIVE_CONFIG_PATH');
      final support = await getApplicationSupportDirectory();
      final file = File(
        Platform.isWindows
            ? configPath
            : '${support.path}/p3-native-config.json',
      );
      final config = object(jsonDecode(await file.readAsString()));
      await file.delete();
      final role = config['role'] as String;
      final settings = GallerySettings();
      final profiles = LocalProfiles(
        Directory('${support.path}/p3-native-$role'),
        OsProfileVault(slot: 'salapiya.p3.native.$role'),
      );
      final runtime = LocalRuntime(profiles, settings);
      try {
        // Supabase restores persisted sessions asynchronously after initialize.
        // A fresh fixture scope avoids an old B session racing this A sign-in.
        final authScope = 'salapiya.p3.native.auth.$role.${newLocalId()}';
        final auth = await initializeProofAuth(
          config['url'] as String,
          config['publicKey'] as String,
          scope: authScope,
          detectSessionInUri: false,
        );
        await auth.client.auth.setSession(config['refreshToken'] as String);
        runtime.connected.flow = GoogleAuthProof(
          auth,
          authScope,
          const FlutterSecureStorage(),
        );
        await runtime.reopen();
        if (runtime.session == null) {
          final store = await profiles.retrieveConnected(
            config['profile'] as String,
            'P3 synthetic native',
            auth.client.auth.currentUser!.id,
            auth.client.auth.currentUser!.email!,
          );
          await runtime.activate(store);
        }
        await tester.pumpWidget(
          SalapiyaApp(
            production: true,
            settings: settings,
            localRuntime: runtime,
          ),
        );
        await tester.runAsync(runtime.connected.syncNow);
        await localSettle(tester);
        final store = runtime.session!.localFinance.store;
        var downloadAttempts = 0;
        await p3Wait(tester, () async {
          await store.reconcileSharedSnapshots();
          if (++downloadAttempts == 400) {
            debugPrint(
              'P3 download diagnostics: groups=${(await store.db.getAll("SELECT id FROM p3_group")).length}, resources=${(await store.db.getAll("SELECT id FROM p3_resource")).length}, connected=${store.db.currentStatus.connected}, error=${runtime.connected.error}',
            );
          }
          return (await store.db.getAll(
            'SELECT group_id FROM shared_snapshot_cache WHERE group_id=?',
            [config['nativeGroup']],
          )).isNotEmpty;
        });
        if (const String.fromEnvironment('P3_NATIVE_STAGE') == 'verify') {
          final local = (await store.financialView()).$2;
          expect(local.version, config['expectedProfileVersion']);
          for (final row in config['expectedAccounts'] as List) {
            expect(
              local.balance(row['id'] as String).toString(),
              row['amount'],
            );
          }
          final group = SharedGroup(
            object(
              jsonDecode(
                (await store.db.get(
                      'SELECT document FROM shared_snapshot_cache WHERE group_id=?',
                      [config['nativeGroup']],
                    ))['document']
                    as String,
              ),
            ),
          );
          expect(group.version, config['expectedGroupVersion']);
          for (final p in object(config['expectedPositions']).entries) {
            expect(group.positions()[p.key].toString(), p.value);
          }
          expect(
            group.people.values
                .where((p) => p['user'] == auth.client.auth.currentUser!.id)
                .length,
            1,
          );
          return;
        }
        final baseline = (await store.db.get(
          'SELECT count(*) n FROM local_command',
        ))['n'];
        await localTap(tester, find.text('Shared Expenses').first);
        await localWait(
          tester,
          () => find.byType(NativeSharedScreen).evaluate().isNotEmpty,
        );
        // Select this run's isolated active fixture rather than any old synthetic group.
        final groupDropdown = find.byWidgetPredicate(
          (w) =>
              w is DropdownButtonFormField<String> &&
              w.key.toString().contains('group-'),
        );
        await localTap(tester, groupDropdown);
        await localTap(
          tester,
          find
              .text(config['nativeName'] as String? ?? 'P3 native shared group')
              .last,
        );
        await localTap(tester, find.text('People'));
        for (final name in ['Manual one windows', 'Manual two windows']) {
          final existing = SharedGroup(
            object(
              jsonDecode(
                (await store.db.get(
                      'SELECT document FROM shared_snapshot_cache WHERE group_id=?',
                      [config['nativeGroup']],
                    ))['document']
                    as String,
              ),
            ),
          );
          if (existing.people.values.any((p) => p['name'] == name)) continue;
          await localTap(tester, find.text('Add manual person'));
          await p3Enter(tester, 'Participant name', name);
          await localTap(tester, find.text('Review').last);
          await localTap(tester, find.text('Save reviewed values'));
          await localWait(tester, () => find.text(name).evaluate().isNotEmpty);
        }
        final raw = await store.db.get(
          'SELECT document FROM shared_snapshot_cache WHERE group_id=?',
          [config['nativeGroup']],
        );
        final group = SharedGroup(
          object(jsonDecode(raw['document'] as String)),
        );
        final title = 'Native PHP100 $role ${group.version}';
        await store.db.disconnect();
        await localTap(tester, find.text('Add shared expense'));
        await p3Enter(tester, 'Description', title);
        await p3Enter(tester, 'Bill total (PHP)', '100.00');
        await p3Enter(tester, 'Native fixture A · contributed (PHP)', '100.00');
        await localTap(tester, find.text('Review').last);
        await localTap(tester, find.text('Save reviewed values'));
        await p3Wait(
          tester,
          () async => (await store.db.getAll(
            "SELECT id FROM shared_intent WHERE state='pending' AND queued=1",
          )).isNotEmpty,
        );
        expect(
          (await store.db.get('SELECT count(*) n FROM local_command'))['n'],
          baseline,
        );
        // Real loopback HTTP 503 failures exercise the production connector's
        // SDK transaction without shutting down either hosted provider. Then
        // discard a genuinely committed hosted response and reopen the queue.
        final archiveSecret = await PortableRecovery.newRecoverySecret();
        final oldArchive = await LocalBackup.seal(
          await LocalBackup.capture(store),
          archiveSecret,
        );
        final failureServer = await HttpServer.bind(
          InternetAddress.loopbackIPv4,
          0,
        );
        var requests = 0, outage = true, responseLost = false;
        final serving = failureServer.listen((request) async {
          requests++;
          request.response.statusCode = 503;
          await request.response.close();
        });
        final http = HttpClient();
        final connector = FinancialConnector(
          store: store,
          actor: auth.client.auth.currentUser!.id,
          credentials: () async => null,
          submit: (id, envelope) async => object(
            await auth.client.rpc(
              'p2_submit_command',
              params: {'command_id': id, 'command_payload': envelope},
            ),
          ),
          submitShared: (id, envelope) async {
            if (outage) {
              final response = await (await http.getUrl(
                Uri.parse('http://127.0.0.1:${failureServer.port}/group'),
              )).close();
              await response.drain<void>();
              if (response.statusCode == 503) {
                throw const HttpException('Synthetic provider HTTP 503');
              }
            }
            final result = object(
              await auth.client.rpc(
                'p3_submit_command',
                params: {'command_id': id, 'command_payload': envelope},
              ),
            );
            expect(result['outcome'], 'accepted');
            responseLost = true;
            throw const HttpException('Synthetic lost committed response');
          },
        );
        await tester.runAsync(() async {
          for (var i = 0; i < 2; i++) {
            await expectLater(
              connector.uploadData(store.db),
              throwsA(isA<HttpException>()),
            );
          }
          outage = false;
          await expectLater(
            connector.uploadData(store.db),
            throwsA(isA<HttpException>()),
          );
        });
        expect(requests, 2);
        expect(responseLost, isTrue);
        http.close(force: true);
        await serving.cancel();
        await failureServer.close(force: true);
        // Same protected database/queue reopened by production profile manager.
        await tester.pumpWidget(const SizedBox.shrink());
        await profiles.close();
        final reopenedRuntime = runtime;
        await reopenedRuntime.reopen();
        await tester.pumpWidget(
          SalapiyaApp(
            production: true,
            settings: settings,
            localRuntime: reopenedRuntime,
          ),
        );
        await tester.runAsync(reopenedRuntime.connected.syncNow);
        final reopened = reopenedRuntime.session!.localFinance.store;
        await p3Wait(tester, () async {
          await reopened.reconcileShared();
          return (await reopened.db.getAll(
            "SELECT id FROM shared_intent WHERE state IN ('pending','accepted')",
          )).isEmpty;
        });
        final accepted = SharedGroup(
          object(
            jsonDecode(
              (await reopened.db.get(
                    'SELECT document FROM shared_snapshot_cache WHERE group_id=?',
                    [config['nativeGroup']],
                  ))['document']
                  as String,
            ),
          ),
        );
        expect(
          accepted.bills.values
              .where((b) => (b['revisions'] as List).last['name'] == title)
              .length,
          1,
        );
        expect(
          accepted.positions().values.fold(BigInt.zero, (a, b) => a + b),
          BigInt.zero,
        );
        // Exercise private funding and recipient confirmation in the normal app
        // using a new isolated synthetic private account.
        await localTap(tester, find.byKey(const ValueKey('nav-money')));
        await localTap(tester, find.byTooltip('Create account'));
        final accountName = 'P3 cash $role ${newLocalId().substring(0, 8)}';
        await localEnter(tester, 'name', accountName);
        await localEnter(tester, 'amount', '2000.00');
        await localEnter(tester, 'cutoff', '2026-10-24');
        await localConfirm(tester);
        await p3Wait(
          tester,
          () async => (await reopened.db.getAll(
            "SELECT id FROM connected_intent WHERE state IN ('pending','accepted')",
          )).isEmpty,
        );
        await tester.runAsync(runtime.connected.syncNow);
        final account = (await reopened.snapshot()).accounts
            .firstWhere((a) => a.name == accountName)
            .id;
        final nativeBill = accepted.bills.entries
            .firstWhere(
              (b) => (b.value['revisions'] as List).last['name'] == title,
            )
            .key;
        await localTap(tester, find.byKey(const ValueKey('nav-shared')));
        await localTap(
          tester,
          find.byWidgetPredicate(
            (w) =>
                w is DropdownButtonFormField<String> &&
                w.key.toString().contains('group-'),
          ),
        );
        await localTap(
          tester,
          find
              .text(config['nativeName'] as String? ?? 'P3 native shared group')
              .last,
        );
        await localTap(tester, find.widgetWithText(ChoiceChip, 'Bills'));
        await localTap(
          tester,
          find.byKey(ValueKey('private-bill-$nativeBill')),
        );
        await p3Select(tester, 'account', accountName);
        await p3Save(tester, private: true);
        await p3Wait(
          tester,
          () async => (await reopened.db.getAll(
            "SELECT id FROM connected_intent WHERE state IN ('pending','accepted')",
          )).isEmpty,
        );
        expect(
          (await reopened.snapshot()).balance(account),
          BigInt.from(190000),
        );
        await localTap(tester, find.text('Report payment'));
        await p3Select(tester, 'sender', 'Manual one windows');
        await p3Select(tester, 'recipient', 'Native fixture A');
        await p3Select(tester, 'mode', 'Selected bills / partial allocations');
        await p3Enter(
          tester,
          'Actual amount (PHP; required except Full)',
          '1.00',
        );
        await tester.ensureVisible(
          find.byKey(ValueKey('shared-field-allocation:$nativeBill')),
        );
        tester
                .widget<TextField>(
                  find.byKey(ValueKey('shared-field-allocation:$nativeBill')),
                )
                .controller!
                .text =
            '1.00';
        await p3Save(tester);
        final intent = await reopened.db.get(
          "SELECT id FROM shared_intent WHERE json_extract(payload,'\$.op')='report' AND group_id=? ORDER BY recorded_at DESC LIMIT 1",
          [config['nativeGroup']],
        );
        final payment = intent['id'] as String;
        Future<SharedGroup> current() async => SharedGroup(
          object(
            jsonDecode(
              (await reopened.db.get(
                    'SELECT document FROM shared_snapshot_cache WHERE group_id=?',
                    [config['nativeGroup']],
                  ))['document']
                  as String,
            ),
          ),
        );
        await p3Wait(
          tester,
          () async => (await current()).settlements.containsKey(payment),
        );
        expect(
          (await current()).positions(),
          isNot((await current()).positions(projected: true)),
        );
        await localTap(tester, find.widgetWithText(ChoiceChip, 'Payments'));
        await localTap(
          tester,
          find.byKey(ValueKey('private-payment-$payment')),
        );
        await p3Select(tester, 'account', accountName);
        await p3Save(tester, private: true);
        await p3Wait(
          tester,
          () async => (await reopened.db.getAll(
            "SELECT id FROM connected_intent WHERE state IN ('pending','accepted')",
          )).isEmpty,
        );
        var cash = (await reopened.snapshot()).balance(account);
        expect(cash, BigInt.from(190100));
        await localTap(tester, find.byKey(ValueKey('payment-$payment')));
        await p3Save(tester);
        await p3Wait(
          tester,
          () async =>
              (await current()).settlements[payment]['state'] == 'confirmed',
        );
        expect((await reopened.snapshot()).balance(account), cash);
        await localTap(tester, find.byKey(ValueKey('private-clear-$payment')));
        await p3Save(tester, private: true);
        await p3Wait(
          tester,
          () async => (await reopened.db.getAll(
            "SELECT id FROM connected_intent WHERE state IN ('pending','accepted')",
          )).isEmpty,
        );
        await localTap(tester, find.byKey(ValueKey('payment-$payment')));
        await p3Select(
          tester,
          'state',
          'Reverse confirmation · no automatic cash return',
        );
        await p3Enter(
          tester,
          'Reason (required except confirmation)',
          'Synthetic recipient reversal',
        );
        await p3Save(tester);
        await p3Wait(
          tester,
          () async =>
              (await current()).settlements[payment]['state'] == 'reversed',
        );
        await localTap(
          tester,
          find.byKey(ValueKey('private-unclear-$payment')),
        );
        await p3Enter(
          tester,
          'Reason / source review',
          'Restore clearing and retain actual received cash',
        );
        await p3Save(tester, private: true);
        await p3Wait(
          tester,
          () async => (await reopened.db.getAll(
            "SELECT id FROM connected_intent WHERE state IN ('pending','accepted')",
          )).isEmpty,
        );
        expect((await reopened.snapshot()).balance(account), cash);
        expect(tester.takeException(), isNull);
        // Correct and refund the accepted group source through the real editor.
        // The private adoption is deliberately retained at its prior revision.
        await localTap(tester, find.widgetWithText(ChoiceChip, 'Bills'));
        await localTap(
          tester,
          find.byKey(ValueKey('correct-bill-$nativeBill')),
        );
        await p3Enter(tester, 'Description', '$title corrected');
        await p3Enter(
          tester,
          'Reason',
          'Retain original immutable bill history',
        );
        await p3Save(tester);
        await p3Wait(
          tester,
          () async =>
              ((await current()).bills[nativeBill]['revisions'] as List)
                  .length ==
              2,
        );
        expect((await reopened.snapshot()).balance(account), cash);
        await localTap(tester, find.byKey(ValueKey('refund-bill-$nativeBill')));
        await p3Enter(tester, 'Refund total (PHP)', '3.00');
        await p3Enter(
          tester,
          'Native fixture A · actual money received (PHP)',
          '3.00',
        );
        await p3Enter(
          tester,
          'Manual one windows · consumed-share credit (PHP)',
          '3.00',
        );
        await p3Enter(
          tester,
          'Reason',
          'Independent merchant money and consumption credit',
        );
        await p3Save(tester);
        await p3Wait(
          tester,
          () async => ((await current()).bills[nativeBill]['refunds'] as List)
              .isNotEmpty,
        );
        expect((await reopened.snapshot()).balance(account), cash);
        final refundId =
            ((await current()).bills[nativeBill]['refunds'] as List)
                .single['id'];
        await localTap(
          tester,
          find.byKey(ValueKey('private-refund-$refundId')),
        );
        await p3Select(tester, 'account', accountName);
        await p3Save(tester, private: true);
        await p3Wait(
          tester,
          () async => (await reopened.db.getAll(
            "SELECT id FROM connected_intent WHERE state IN ('pending','accepted')",
          )).isEmpty,
        );
        cash += BigInt.from(300);
        expect((await reopened.snapshot()).balance(account), cash);
        // Continue a real Add Expense result into group sharing, then adopt its
        // original action. The group handoff cannot repeat the private cash.
        await localTap(tester, find.byKey(const ValueKey('nav-money')));
        await localTap(tester, find.text('Add expense'));
        final integratedTitle = 'Integrated purchase $role ${accepted.version}';
        await localEnter(tester, 'name', integratedTitle);
        await localEnter(tester, 'amount', '3.00');
        await localTap(tester, find.byKey(const ValueKey('select-account')));
        await p3Choice(tester, accountName);
        await localTap(tester, find.byKey(const ValueKey('review-action')));
        await localTap(tester, find.text('Confirm & save'));
        await localWait(
          tester,
          () => find.text('Share this purchase').evaluate().isNotEmpty,
        );
        await p3Wait(
          tester,
          () async => (await reopened.db.getAll(
            "SELECT id FROM connected_intent WHERE state IN ('pending','accepted')",
          )).isEmpty,
        );
        expect(
          (await reopened.snapshot()).balance(account),
          cash - BigInt.from(300),
        );
        cash -= BigInt.from(300);
        await localTap(tester, find.text('Share this purchase'));
        await localTap(tester, find.text(config['nativeName'] as String).last);
        await localWait(
          tester,
          () => find.text('Share your saved purchase').evaluate().isNotEmpty,
        );
        await p3Save(tester);
        await localTap(tester, find.text('Done'));
        await localTap(tester, find.byKey(const ValueKey('nav-shared')));
        await p3Wait(
          tester,
          () async => (await current()).bills.values.any(
            (b) => (b['revisions'] as List).last['name'] == integratedTitle,
          ),
        );
        final integratedBill = (await current()).bills.entries
            .firstWhere(
              (b) =>
                  (b.value['revisions'] as List).last['name'] ==
                  integratedTitle,
            )
            .key;
        await localTap(tester, find.widgetWithText(ChoiceChip, 'Bills'));
        await localTap(
          tester,
          find.byKey(ValueKey('private-bill-$integratedBill')),
        );
        await p3Select(tester, 'account', accountName);
        await p3Enter(
          tester,
          'Reason / source review',
          'Keep the original actual purchase',
        );
        await p3Save(tester, private: true);
        await p3Wait(
          tester,
          () async => (await reopened.db.getAll(
            "SELECT id FROM connected_intent WHERE state IN ('pending','accepted')",
          )).isEmpty,
        );
        expect((await reopened.snapshot()).balance(account), cash);
        expect(tester.takeException(), isNull);
        // A genuinely older encrypted archive holds the original group command
        // before its server acceptance. A fresh independently keyed profile must
        // review its original receipt and download current authority/history.
        final restoredId = newLocalId();
        final recoveryProfiles = LocalProfiles(
          Directory('${support.path}/p3-recovery-$role-$restoredId'),
          OsProfileVault(slot: 'salapiya.p3.recovery.$role.$restoredId'),
        );
        final recovered = await recoveryProfiles.restore(
          await LocalBackup.unseal(oldArchive, archiveSecret),
        );
        expect(await recovered.db.getAll('SELECT id FROM p3_group'), isEmpty);
        expect((await recovered.connection())!['phase'], 'restored');
        final recoveryRuntime = LocalRuntime(
          recoveryProfiles,
          GallerySettings(),
        );
        recoveryRuntime.connected.flow = runtime.connected.flow;
        await recoveryRuntime.activate(recovered);
        await tester.pumpWidget(
          SalapiyaApp(
            production: true,
            settings: recoveryRuntime.settings,
            localRuntime: recoveryRuntime,
          ),
        );
        await tester.runAsync(recoveryRuntime.connected.syncNow);
        expect(recoveryRuntime.connected.error, isNull);
        final recoveryRepository = SharedRepository(recoveryRuntime, recovered);
        await recoveryRepository.open();
        for (final row in await recovered.db.getAll(
          "SELECT id FROM shared_intent WHERE state='restored'",
        )) {
          await recoveryRepository.retry(row['id'] as String);
        }
        await p3Wait(tester, () async {
          await recovered.reconcileShared();
          return (await recovered.db.getAll(
            "SELECT id FROM shared_intent WHERE state IN ('pending','accepted','restored')",
          )).isEmpty;
        });
        expect((await recovered.snapshot()).balance(account), cash);
        expect(
          (await recovered.financialView()).$2.version,
          (await reopened.financialView()).$2.version,
        );
        recoveryRepository.dispose();
        await tester.pumpWidget(const SizedBox.shrink());
        recoveryRuntime.connected.flow = null;
        await recoveryRuntime.close();
        // A separate live PowerSync connection uses the former member's signed JWT.
        final peerClient = SupabaseClient(
          config['url'] as String,
          config['publicKey'] as String,
        );
        final peerSession = (await peerClient.auth.setSession(
          config['otherRefreshToken'] as String,
        )).session!;
        final peerDb = openLocalDatabase(
          '${support.path}/p3-privacy-${newLocalId()}.sqlite',
          newLocalId(),
        );
        await peerDb.initialize();
        await peerDb.connect(
          connector: PrivateDownload(peerSession, config['endpoint'] as String),
        );
        await tester.runAsync(() => peerDb.waitForFirstSync());
        final records = await peerDb.getAll(
          'SELECT document FROM p3_group WHERE group_id=?',
          [config['group']],
        );
        expect(records, isNotEmpty);
        final former = SharedGroup(
          object(jsonDecode(records.single['document'] as String)),
        );
        expect(former.complete, isFalse);
        expect(
          await peerDb.getAll(
            "SELECT id FROM p3_resource WHERE group_id=? AND kind='bill' AND source_id=?",
            [config['group'], config['excludedBill']],
          ),
          isEmpty,
        );
        expect(
          await peerDb.getAll(
            "SELECT id FROM p3_resource WHERE group_id=? AND kind='bill'",
            [config['group']],
          ),
          isNotEmpty,
        );
        expect(
          await peerDb.getAll('SELECT id FROM p3_group WHERE group_id=?', [
            config['nativeGroup'],
          ]),
          isEmpty,
        );
        await peerDb.close();
        await peerClient.dispose();
        await tester.pumpWidget(const SizedBox.shrink());
      } finally {
        await tester.pumpWidget(const SizedBox.shrink());
        await runtime.close();
      }
    },
  );
}
