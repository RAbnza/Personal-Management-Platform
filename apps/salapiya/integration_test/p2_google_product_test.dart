// Owner-assisted real Google acceptance using the normal product composition.
// No harness controls, provider secrets, password fixtures or imported sessions.
import 'dart:convert';
import 'dart:io';

import 'package:cryptography/cryptography.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:path_provider/path_provider.dart';
import 'package:salapiya/app.dart';
import 'package:salapiya/gallery/settings.dart';
import 'package:salapiya/local/finance_domain.dart';
import 'package:salapiya/local/local_profiles.dart';
import 'package:salapiya/local/local_runtime.dart';
import 'package:salapiya/local/local_store.dart';

import '../test/local_money_journey.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets(
    'P2 real Google production onboarding and owner-isolated retrieval',
    (tester) async {
      const action = String.fromEnvironment(
        'P2_GOOGLE_ACTION',
        defaultValue: 'connect',
      );
      const reuseSession = bool.fromEnvironment('P2_GOOGLE_USE_SESSION');
      final expectedMinor = BigInt.parse(
        const String.fromEnvironment(
          'P2_GOOGLE_EXPECTED_MINOR',
          defaultValue: '8766',
        ),
      );
      const expectedRevisions = int.fromEnvironment(
        'P2_GOOGLE_EXPECTED_REVISIONS',
        defaultValue: 2,
      );
      final role = Platform.isWindows ? 'windows' : 'android';
      final profileAction = action == 'reauth_wrong'
          ? (Platform.isWindows ? 'retrieve' : 'connect')
          : action;
      final support = await getApplicationSupportDirectory();
      final profiles = LocalProfiles(
        Directory('${support.path}/p2-google-$profileAction'),
        OsProfileVault(slot: 'salapiya.p2.google.$profileAction'),
      );
      final runtime = LocalRuntime(profiles, GallerySettings());
      final actualSettings = runtime.settings;
      try {
        await runtime.reopen();
        if (action == 'reauth_wrong' && runtime.session == null)
          reject(
            'The existing Google acceptance profile is required for reauthentication.',
          );
        if (runtime.session == null && action != 'retrieve') {
          await runtime.create('P2 synthetic $role $action', ThemeMode.system);
          final store = runtime.session!.localFinance.store;
          final account = newLocalId();
          await store.commit(
            LocalCommand(
              id: account,
              owner: store.owner,
              expectedVersion: 0,
              kind: 'account',
              values: {
                'name': 'Google test wallet',
                'kind': 'Cash',
                'cutoff': '2026-10-01',
                'amount': '100.00',
              },
            ),
          );
          await store.commit(
            LocalCommand(
              id: newLocalId(),
              owner: store.owner,
              expectedVersion: 1,
              kind: 'expense',
              values: {
                'name': 'Google test purchase',
                'date': '2026-10-25',
                'amount': '12.34',
                'account': account,
                'category': 'category-food',
              },
            ),
          );
          await runtime.session!.localFinance.reload();
        }
        final before = runtime.session == null
            ? null
            : await LocalBackup.capture(runtime.session!.localFinance.store);
        await tester.pumpWidget(
          SalapiyaApp(
            production: true,
            settings: actualSettings,
            localRuntime: runtime,
          ),
        );
        await localSettle(tester);
        if (runtime.session == null) {
          await localTap(tester, find.text('Continue with Google'));
        } else {
          await localTap(tester, find.byTooltip('Profile & utilities'));
          await localTap(tester, find.text('Connection'));
        }
        final c = runtime.connected;
        if (reuseSession) {
          await tester.runAsync(c.initializeAuth);
          expect(c.flow!.client.auth.currentSession, isNotNull);
        } else {
          await localTap(
            tester,
            find.text(
              c.binding == null
                  ? 'Select Google account'
                  : 'Reconnect Google account',
            ),
          );
          debugPrint('P2_GOOGLE_SELECT_ACCOUNT role=$role action=$action');
          await tester.runAsync(() async {
            final started = DateTime.now();
            while (c.flow?.pending == true &&
                DateTime.now().difference(started) <
                    const Duration(minutes: 10)) {
              await Future<void>.delayed(const Duration(milliseconds: 250));
            }
          });
          if (action == 'reauth_wrong') {
            expect(c.flow?.outcome, 'wrong_account_local_data_preserved');
            expect(c.flow!.client.auth.currentUser, isNull);
            final preserved = await LocalBackup.capture(
              runtime.session!.localFinance.store,
            );
            for (final key in ['owner', 'commands', 'drafts', 'preferences']) {
              expect(preserved[key], before![key]);
            }
            debugPrint('P2_GOOGLE_WRONG_ACCOUNT_REJECTED role=$role');
            await localSettle(tester);
            await localTap(tester, find.text('Reconnect Google account'));
            debugPrint('P2_GOOGLE_SELECT_BOUND_ACCOUNT role=$role');
            await tester.runAsync(() async {
              final started = DateTime.now();
              while (c.flow?.pending == true &&
                  DateTime.now().difference(started) <
                      const Duration(minutes: 10)) {
                await Future<void>.delayed(const Duration(milliseconds: 250));
              }
            });
          }
          expect(c.flow?.outcome, 'google_code_exchange_verified');
        }
        expect(
          c.flow!.client.auth.currentUser!.identities!.any(
            (i) => i.provider == 'google',
          ),
          isTrue,
        );
        await tester.runAsync(() async {
          while (c.busy) {
            await Future<void>.delayed(const Duration(milliseconds: 100));
          }
        });
        await tester.runAsync(c.lookup);
        await localSettle(tester);
        expect(c.error, isNull);
        if (action == 'collision') {
          expect(c.cloud, isNotNull);
          expect(c.cloud!['id'], isNot(before!['owner']));
          expect(find.textContaining('no automatic merge'), findsWidgets);
          await localTap(tester, find.text('Cancel connection'));
          final after = await LocalBackup.capture(
            runtime.session!.localFinance.store,
          );
          for (final key in [
            'owner',
            'commands',
            'drafts',
            'revision',
            'preferences',
          ]) {
            expect(after[key], before[key]);
          }
          expect(
            await runtime.session!.localFinance.store.connection(),
            isNull,
          );
        } else {
          if (c.binding == null) {
            await localTap(tester, find.text('Review connection'));
            await localTap(tester, find.text('Confirm connection'));
            await tester.runAsync(() async {
              while (c.busy) {
                await Future<void>.delayed(const Duration(milliseconds: 100));
              }
            });
          } else {
            await tester.runAsync(c.syncNow);
          }
          expect(c.error, isNull);
          expect(c.complete, isTrue);
          final snapshot = await runtime.session!.localFinance.store.snapshot();
          expect(snapshot.accounts.single.name, 'Google test wallet');
          expect(snapshot.balance(snapshot.accounts.single.id), expectedMinor);
          expect(snapshot.revisions.length, expectedRevisions);
          if (action == 'identity_b') {
            final earlier = File(
              '${support.path}/p2-google-retrieve-evidence.json',
            );
            if (await earlier.exists()) {
              final a = jsonDecode(await earlier.readAsString()) as Map;
              expect(
                a['profile'],
                isNot(runtime.session!.localFinance.store.owner),
              );
              expect(
                await c.flow!.client
                    .from('p2_command')
                    .select('id')
                    .eq('profile_id', a['profile'] as String),
                isEmpty,
              );
              expect(
                await runtime.session!.localFinance.store.db.getAll(
                  'SELECT id FROM p2_command WHERE profile_id=?',
                  [a['profile']],
                ),
                isEmpty,
              );
            }
          }
        }
        final actor = c.flow!.client.auth.currentUser!.id;
        final fingerprint = (await Sha256().hash(utf8.encode(actor))).bytes
            .take(6)
            .map((b) => b.toRadixString(16).padLeft(2, '0'))
            .join();
        final evidence = {
          'role': role,
          'action': action,
          'googleCodeExchange': !reuseSession,
          'reusedManagedGoogleSession': reuseSession,
          'identityFingerprint': fingerprint,
          'profile': runtime.session!.localFinance.store.owner,
          'status': c.label,
          'exactMinorUnits': action == 'collision' ? '8766' : '$expectedMinor',
          'collisionCancelled': action == 'collision',
        };
        await File('${support.path}/p2-google-$action-evidence.json')
            .writeAsString(jsonEncode(evidence));
        debugPrint('P2_GOOGLE_EVIDENCE ${jsonEncode(evidence)}');
      } finally {
        await tester.pumpWidget(const SizedBox.shrink());
        await runtime.close();
        runtime.dispose();
        actualSettings.dispose();
      }
    },
    timeout: const Timeout(Duration(minutes: 13)),
  );
}
