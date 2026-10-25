import 'dart:convert';
import 'dart:io';
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
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
  await localTap(tester, find.byKey(ValueKey('shared-field-$key')));
  await localTap(tester, find.text(label).last);
}

Future<void> p3Save(WidgetTester tester, {bool private = false}) async {
  await localTap(tester, find.text('Review').last);
  await localTap(tester, find.text('Save reviewed values'));
  if (private) await localTap(tester, find.text('Save my private action'));
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
        final auth = await initializeProofAuth(
          config['url'] as String,
          config['publicKey'] as String,
          scope: 'salapiya.p3.native.auth.$role',
          detectSessionInUri: false,
        );
        await auth.client.auth.setSession(config['refreshToken'] as String);
        runtime.connected.flow = GoogleAuthProof(
          auth,
          'salapiya.p3.native.auth.$role',
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
        await p3Wait(
          tester,
          () async => (await store.db.getAll(
            'SELECT id FROM p3_group WHERE group_id=?',
            [config['nativeGroup']],
          )).isNotEmpty,
        );
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
                      'SELECT document FROM p3_group WHERE group_id=?',
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
          'SELECT document FROM p3_group WHERE group_id=?',
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
                    'SELECT document FROM p3_group WHERE group_id=?',
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
        final accountName = 'P3 cash $role ${accepted.version}';
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
        await localTap(tester, find.text('Bills'));
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
                    'SELECT document FROM p3_group WHERE group_id=?',
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
        await localTap(tester, find.text('Payments'));
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
        final cash = (await reopened.snapshot()).balance(account);
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
        // A separate live PowerSync connection uses the former member's signed JWT.
        final peerSession = (await auth.client.auth.setSession(
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
        expect(former.bills.containsKey(config['excludedBill']), isFalse);
        expect(
          await peerDb.getAll('SELECT id FROM p3_group WHERE group_id=?', [
            config['nativeGroup'],
          ]),
          isEmpty,
        );
        await peerDb.close();
        await tester.pumpWidget(const SizedBox.shrink());
      } finally {
        await runtime.close();
      }
    },
  );
}
