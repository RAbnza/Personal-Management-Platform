// Cross-device Money acceptance with the real OS-persisted Account A Google
// sessions established by p2_google_product_test. No imported fixture tokens.
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:path_provider/path_provider.dart';
import 'package:salapiya/app.dart';
import 'package:salapiya/connected/command_connector.dart';
import 'package:salapiya/gallery/settings.dart';
import 'package:salapiya/local/finance_domain.dart';
import 'package:salapiya/local/local_profiles.dart';
import 'package:salapiya/local/local_runtime.dart';
import 'package:salapiya/local/local_store.dart';

import '../test/local_money_journey.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets(
    'P2 real Google A05/A06 offline Money and private accepted convergence',
    (tester) async {
      const stage = String.fromEnvironment(
        'P2_GOOGLE_MONEY_STAGE',
        defaultValue: 'offline',
      );
      final role = Platform.isWindows ? 'windows' : 'android',
          profileScope = Platform.isWindows ? 'retrieve' : 'connect';
      final support = await getApplicationSupportDirectory();
      final runtime = LocalRuntime(
        LocalProfiles(
          Directory('${support.path}/p2-google-$profileScope'),
          OsProfileVault(slot: 'salapiya.p2.google.$profileScope'),
        ),
        GallerySettings(),
      );
      try {
        await runtime.reopen();
        expect(runtime.session, isNotNull);
        await runtime.connected.restore();
        final c = runtime.connected,
            store = runtime.session!.localFinance.store;
        expect(
          c.flow!.client.auth.currentUser!.identities!.any(
            (i) => i.provider == 'google',
          ),
          isTrue,
        );
        expect(
          c.flow!.client.auth.currentUser!.id,
          (await store.connection())!['remote_owner'],
        );
        Future<void> drained() async {
          await c.syncNow();
          for (var i = 0; i < 200; i++) {
            await c.refresh();
            if (c.pendingCount == 0) break;
            await Future<void>.delayed(const Duration(milliseconds: 200));
          }
          expect(c.error, isNull);
          expect(c.pendingCount, 0);
          expect(c.reviewCount, 0);
        }

        await tester.pumpWidget(
          SalapiyaApp(
            production: true,
            settings: runtime.settings,
            localRuntime: runtime,
          ),
        );
        await localSettle(tester);
        if (stage == 'offline') {
          await tester.runAsync(() => c.pause(true));
          if (!runtime.session!.localFinance.snapshot.revisions.any(
            (r) => r.title == 'P2 Google offline $role',
          )) {
            await localTap(tester, find.byKey(const ValueKey('nav-money')));
            await localTap(tester, find.text('Add expense'));
            await localEnter(tester, 'name', 'P2 Google offline $role');
            await localEnter(
              tester,
              'amount',
              role == 'windows' ? '0.11' : '0.22',
            );
            await localEnter(tester, 'date', '2026-10-25');
            await localConfirm(tester);
          }
          if (role == 'android') {
            await tester.runAsync(() => c.pause(false));
            await tester.runAsync(drained);
          }
        } else {
          await tester.runAsync(() => c.pause(false));
          await tester.runAsync(drained);
          final snap = await store.snapshot();
          expect(
            snap.revisions
                .where((r) => r.title == 'P2 Google offline windows')
                .length,
            1,
          );
          expect(
            snap.revisions
                .where((r) => r.title == 'P2 Google offline android')
                .length,
            1,
          );
          if (role == 'windows' &&
              stage == 'online' &&
              !snap.revisions.any(
                (r) => r.title == 'P2 Google actual lost response',
              )) {
            expect(snap.balance(snap.accounts.single.id), BigInt.from(8733));
            await tester.runAsync(() => c.pause(true));
            final id = newLocalId();
            final command = LocalCommand(
              id: id,
              owner: store.owner,
              expectedVersion: (await store.snapshot()).version,
              kind: 'income',
              values: {
                'name': 'P2 Google actual lost response',
                'date': '2026-10-25',
                'amount': '0.44',
                'account': snap.accounts.single.id,
                'category': 'category-income',
                'incomeClass': 'gift',
              },
            );
            await store.commit(command);
            await store.db.execute('UPDATE connected_profile SET paused=0');
            final connector = FinancialConnector(
              store: store,
              actor: c.flow!.client.auth.currentUser!.id,
              credentials: () async => null,
              submit: (id, envelope) async {
                await c.flow!.client.rpc(
                  'p2_submit_command',
                  params: {'command_id': id, 'command_payload': envelope},
                );
                throw const SocketException(
                  'Discarded actual Google-owned committed response',
                );
              },
            );
            await expectLater(
              connector.uploadData(store.db),
              throwsA(isA<SocketException>()),
            );
            expect(await store.db.getNextCrudTransaction(), isNotNull);
            await tester.runAsync(drained);
            final result = await c.flow!.client.rpc(
              'p2_review_command',
              params: {'command_id': id, 'command_payload': command.payload},
            ) as Map;
            expect(result['outcome'], 'accepted');
          }
          final finalSnapshot = await store.snapshot();
          expect(
            finalSnapshot.balance(finalSnapshot.accounts.single.id),
            BigInt.from(8777),
          );
          expect(finalSnapshot.revisions.length, 5);
        }
        await c.refresh();
        final snapshot = await store.snapshot();
        final evidence = {
          'role': role,
          'stage': stage,
          'profile': store.owner,
          'googleSession': true,
          'minor_units': '${snapshot.balance(snapshot.accounts.single.id)}',
          'revision_ids': [for (final r in snapshot.revisions) r.id],
          'pending': c.pendingCount,
          'review': c.reviewCount,
          'status': c.label,
        };
        await File('${support.path}/p2-google-money-$role-$stage.json')
            .writeAsString(jsonEncode(evidence));
        debugPrint('P2_GOOGLE_MONEY_EVIDENCE ${jsonEncode(evidence)}');
      } finally {
        await tester.pumpWidget(const SizedBox.shrink());
        await runtime.close();
        runtime.dispose();
        runtime.settings.dispose();
      }
    },
    timeout: const Timeout(Duration(minutes: 5)),
  );
}
