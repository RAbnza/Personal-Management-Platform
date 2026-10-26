import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:path_provider/path_provider.dart';
import 'package:salapiya/app.dart';
import 'package:salapiya/gallery/settings.dart';
import 'package:salapiya/local/finance_domain.dart';
import 'package:salapiya/local/local_profiles.dart';
import 'package:salapiya/local/local_runtime.dart';
import 'package:salapiya/p0/auth_runtime.dart';
import 'package:salapiya/p0/google_auth_proof.dart';
import 'package:salapiya/shared/shared_domain.dart';

import '../test/local_money_journey.dart';
import 'p3_native_test.dart' show p3Wait, p3Enter, p3Select, p3Choice, p3Save;
import 'p4_cards_test.dart' show nativeEnter;

Future<void> connectedFinanceSave(WidgetTester tester) async {
  FocusManager.instance.primaryFocus?.unfocus();
  await localTap(tester, find.text('Review').last);
  await localTap(tester, find.text('Save reviewed values'));
  await localWait(tester, () => find.text('Done').evaluate().isNotEmpty);
  await localTap(tester, find.text('Done'));
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets(
    'P4 scenario 31 real native hosted card adoption, source revision and actual card refund',
    (tester) async {
      final support = await getApplicationSupportDirectory();
      final file = File(
        Platform.isWindows
            ? const String.fromEnvironment('P4_NATIVE_CONFIG_PATH')
            : '${support.path}/p4-native-config.json',
      );
      final config = object(jsonDecode(await file.readAsString()));
      await file.delete();
      final role = config['role'] as String, settings = GallerySettings();
      final profiles = LocalProfiles(
        Directory('${support.path}/p4-native-$role'),
        OsProfileVault(slot: 'salapiya.p4.native.$role'),
      );
      final runtime = LocalRuntime(profiles, settings),
          scope = 'salapiya.p4.native.auth.$role.${newLocalId()}';
      try {
        final auth = await initializeProofAuth(
          config['url'] as String,
          config['publicKey'] as String,
          scope: scope,
          detectSessionInUri: false,
        );
        await auth.client.auth.setSession(config['refreshToken'] as String);
        runtime.connected.flow = GoogleAuthProof(
          auth,
          scope,
          const FlutterSecureStorage(),
        );
        await runtime.reopen();
        if (runtime.connected.binding?['paused'] == 1) {
          await runtime.connected.pause(false);
        }
        if (runtime.session == null) {
          final store = await profiles.retrieveConnected(
            config['profile'] as String,
            'P4 synthetic native',
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
        final c = runtime.session!.localFinance, store = c.store;
        await p3Wait(tester, () async {
          await runtime.connected.refresh();
          return runtime.connected.complete &&
              (await store.db.getAll(
                'SELECT group_id FROM shared_snapshot_cache WHERE group_id=?',
                [config['group']],
              )).isNotEmpty;
        });
        Future<void> settled() async {
          await tester.runAsync(runtime.connected.syncNow);
          await p3Wait(tester, () async {
            await runtime.connected.refresh();
            return (await store.db.getAll(
              "SELECT id FROM connected_intent WHERE state IN ('pending','accepted')",
            )).isEmpty;
          });
          await tester.runAsync(c.reload);
        }

        Future<SharedGroup> group() async => SharedGroup(
          object(
            jsonDecode(
              (await store.db.get(
                    'SELECT document FROM shared_snapshot_cache WHERE group_id=?',
                    [config['group']],
                  ))['document']
                  as String,
            ),
          ),
        );
        final suffix = newLocalId().substring(0, 8),
            cardName = 'P4 native $role $suffix',
            purchaseName = 'P4 card dinner $role $suffix';
        final cashBefore = c.liquid;
        await localTap(tester, find.byKey(const ValueKey('nav-money')));
        await localTap(tester, find.text('Cards').first);
        await localTap(tester, find.text('Add credit card'));
        await localWait(
          tester,
          () => find.byKey(const ValueKey('native-name')).evaluate().isNotEmpty,
        );
        await nativeEnter(tester, 'name', cardName);
        await nativeEnter(tester, 'issuer', 'Synthetic provider');
        await nativeEnter(tester, 'limit', '10000.00');
        await connectedFinanceSave(tester);
        await settled();
        final card = c.snapshot.current
            .singleWhere(
              (r) => financeType(r) == 'creditCard' && r.title == cardName,
            )
            .actionId;
        // Genuine SDK disconnect: the ordinary purchase remains durable locally
        // and becomes accepted only through the existing connector and CDC path.
        await tester.runAsync(() => runtime.connected.pause(true));
        await localTap(tester, find.text('Add expense').first);
        await localEnter(tester, 'name', purchaseName);
        await localEnter(tester, 'amount', '1200.00');
        await localTap(tester, find.byKey(const ValueKey('select-funding')));
        await localTap(tester, find.text('Credit card').last);
        await localTap(tester, find.byKey(const ValueKey('select-card')));
        await p3Choice(tester, cardName);
        await localConfirm(tester);
        expect(c.liquid, cashBefore);
        expect(
          financeBalance(c.snapshot, 'card_liability', 'card', card),
          BigInt.from(-120000),
        );
        expect(
          await tester.runAsync(
            () => store.db.getAll(
              "SELECT id FROM connected_intent WHERE state='pending'",
            ),
          ),
          isNotEmpty,
        );
        await tester.runAsync(() => runtime.connected.pause(false));
        await settled();
        final purchase = c.snapshot.current
            .singleWhere(
              (r) =>
                  r.title == purchaseName && financeType(r) == 'cardPurchase',
            )
            .id;
        expect(
          await tester.runAsync(
            () => store.db.getAll('SELECT id FROM p2_command WHERE id=?', [
              purchase,
            ]),
          ),
          hasLength(1),
        );
        await localTap(tester, find.byKey(const ValueKey('nav-shared')));
        await localTap(
          tester,
          find.byWidgetPredicate(
            (w) =>
                w is DropdownButtonFormField<String> &&
                w.key.toString().contains('group-'),
          ),
        );
        await p3Choice(tester, config['name'] as String);
        await localTap(tester, find.text('Add shared expense'));
        await p3Enter(tester, 'Description', purchaseName);
        await p3Enter(tester, 'Bill total (PHP)', '1200.00');
        await p3Select(tester, 'method', 'Exact / custom');
        await p3Enter(tester, 'Native P4 owner · contributed (PHP)', '1200.00');
        await p3Enter(
          tester,
          'Native P4 owner · exact share (PHP; ignored for Equal)',
          '400.00',
        );
        await p3Enter(
          tester,
          'Native P4 consumer · exact share (PHP; ignored for Equal)',
          '800.00',
        );
        await p3Save(tester);
        await p3Wait(
          tester,
          () async => (await group()).bills.values.any(
            (b) => (b['revisions'] as List).last['name'] == purchaseName,
          ),
        );
        final bill = (await group()).bills.entries
            .singleWhere(
              (b) =>
                  (b.value['revisions'] as List).last['name'] == purchaseName,
            )
            .key;
        await localTap(tester, find.byKey(ValueKey('private-bill-$bill')));
        await p3Select(tester, 'existing', '$purchaseName · 1200.00 PHP');
        await p3Enter(
          tester,
          'Reason / source review',
          'Adopt genuine native card purchase',
        );
        await p3Save(tester, private: true);
        await settled();
        var adopted = c.snapshot.current.singleWhere(
          (r) =>
              r.values['sharedKey'] == bill && r.values['sharedMode'] == 'bill',
        );
        expect(adopted.actionId, purchase);
        expect(c.liquid, cashBefore);
        await localTap(tester, find.byKey(ValueKey('correct-bill-$bill')));
        await p3Enter(tester, 'Description', '$purchaseName revised');
        await p3Enter(
          tester,
          'Reason',
          'Provider source description revised; funding unchanged',
        );
        await p3Save(tester);
        await p3Wait(
          tester,
          () async =>
              (await group()).revision(bill)['name'] == '$purchaseName revised',
        );
        await localTap(tester, find.byKey(ValueKey('private-bill-$bill')));
        await p3Enter(
          tester,
          'Reason / source review',
          'Review corrected source without replaying card funding',
        );
        await p3Save(tester, private: true);
        await settled();
        adopted = c.snapshot.current.singleWhere(
          (r) =>
              r.values['sharedKey'] == bill && r.values['sharedMode'] == 'bill',
        );
        expect(adopted.actionId, purchase);
        await localTap(tester, find.byKey(const ValueKey('nav-money')));
        await localTap(tester, find.text('Cards').first);
        await localTap(tester, find.text('Card refund'));
        await localWait(
          tester,
          () => find.byKey(const ValueKey('native-name')).evaluate().isNotEmpty,
        );
        await nativeEnter(tester, 'name', 'Actual credit $suffix');
        await localTap(
          tester,
          find.byKey(const ValueKey('native-select-card')),
        );
        await p3Choice(tester, '$cardName · ${civilToday()} · v1');
        await localTap(
          tester,
          find.byKey(const ValueKey('native-select-purchase')),
        );
        await p3Choice(
          tester,
          '${adopted.title} · ${adopted.date} · v${adopted.number}',
        );
        await nativeEnter(tester, 'amount', '90.00');
        await nativeEnter(tester, 'reason', 'Actual provider card credit');
        await connectedFinanceSave(tester);
        await settled();
        final credit = c.snapshot.current.singleWhere(
          (r) => r.title == 'Actual credit $suffix',
        );
        await localTap(tester, find.byKey(const ValueKey('nav-shared')));
        await localTap(
          tester,
          find.byWidgetPredicate(
            (w) =>
                w is DropdownButtonFormField<String> &&
                w.key.toString().contains('group-'),
          ),
        );
        await p3Choice(tester, config['name'] as String);
        await localTap(tester, find.byKey(ValueKey('refund-bill-$bill')));
        await p3Enter(tester, 'Refund total (PHP)', '90.00');
        await p3Enter(
          tester,
          'Native P4 owner · actual money received (PHP)',
          '90.00',
        );
        await p3Enter(
          tester,
          'Native P4 owner · consumed-share credit (PHP)',
          '30.00',
        );
        await p3Enter(
          tester,
          'Native P4 consumer · consumed-share credit (PHP)',
          '60.00',
        );
        await p3Enter(tester, 'Reason', 'Actual provider refund');
        await p3Save(tester);
        await p3Wait(
          tester,
          () async =>
              ((await group()).bills[bill]['refunds'] as List).isNotEmpty,
        );
        final refund =
            ((await group()).bills[bill]['refunds'] as List).last['id']
                as String;
        await localTap(tester, find.byKey(ValueKey('private-refund-$refund')));
        await p3Select(
          tester,
          'existingCardRefund',
          '${credit.title} · 90.00 PHP · ${credit.date}',
        );
        await p3Enter(
          tester,
          'Reason / source review',
          'Adopt actual card credit without another liability movement',
        );
        await p3Save(tester, private: true);
        await settled();
        final totals = <String, BigInt>{};
        for (final r in c.snapshot.current.where(
          (r) => r.values['card'] == card,
        )) {
          for (final p in r.postings) {
            totals[p.ledger] = (totals[p.ledger] ?? BigInt.zero) + p.amount;
          }
        }
        expect(totals, {
          'card_liability': BigInt.from(-111000),
          'expense': BigInt.from(37000),
          'shared_receivable': BigInt.from(74000),
        });
        expect(c.liquid, cashBefore);
        final raw =
            (await tester.runAsync(
                  () => store.db.get(
                    'SELECT document FROM shared_snapshot_cache WHERE group_id=?',
                    [config['group']],
                  ),
                ))!['document']
                as String;
        expect(raw, isNot(contains(card)));
        await tester.runAsync(store.integrity);
        expect(tester.takeException(), isNull);
        debugPrint(
          'P4_NATIVE_HOSTED: scenario 31 accepted and downloaded on $role; one liability and no cash replay.',
        );
      } finally {
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.runAsync(runtime.close);
        runtime.dispose();
        settings.dispose();
      }
    },
    skip: !const bool.fromEnvironment('P4_HOSTED_NATIVE'),
  );
}
