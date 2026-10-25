// Reuses only owner-authorized, OS-protected real Google sessions established in
// P0/P2. No password fixture, service key, synthetic JWT or new OAuth success is
// substituted. This test never changes the default private profile.
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:path_provider/path_provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:salapiya/local/finance_domain.dart';
import 'package:salapiya/local/local_store.dart';
import 'package:salapiya/shared/shared_repository.dart';
import 'package:salapiya/app.dart';
import 'package:salapiya/gallery/settings.dart';
import 'package:salapiya/local/local_runtime.dart';
import 'package:salapiya/local/local_profiles.dart';
import 'package:salapiya/p0/auth_runtime.dart';
import 'package:salapiya/p0/google_auth_proof.dart';

import '../test/local_money_journey.dart';

import 'p2_native_test.dart' show PrivateDownload;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets(
    'two real protected Google identities share one accepted bill through actual native CDC',
    (tester) async {
      const url = String.fromEnvironment('SALAPIYA_SUPABASE_URL'),
          key = String.fromEnvironment('SALAPIYA_PUBLIC_KEY'),
          endpoint = String.fromEnvironment('SALAPIYA_POWERSYNC_URL');
      const vault = FlutterSecureStorage();
      final clients = <String, SupabaseClient>{};
      final role = Platform.isWindows ? 'windows' : 'android';
      LocalRuntime? authorizationRuntime;
      SupabaseClient? managedClient;
      for (final scope in [
        'salapiya.production.google.v1',
        'salapiya.p0.google.$role',
        'salapiya.p3.google.b',
      ]) {
        final saved = await vault.read(key: '$scope.session');
        if (saved == null) continue;
        final client = SupabaseClient(
          url,
          key,
          authOptions: const AuthClientOptions(
            autoRefreshToken: true,
            authFlowType: AuthFlowType.pkce,
          ),
        );
        try {
          await client.auth.recoverSession(saved);
          final user = (await client.auth.getUser()).user!;
          if (!(user.identities?.any((i) => i.provider == 'google') ?? false)) {
            await client.dispose();
            continue;
          }
          // Persist SDK refresh rotation back to its original protected scope.
          await vault.write(
            key: '$scope.session',
            value: jsonEncode(client.auth.currentSession!.toJson()),
          );
          if (clients.containsKey(user.id)) {
            await client.dispose();
          } else {
            clients[user.id] = client;
          }
        } catch (_) {
          await client.dispose();
        }
      }
      if (clients.length == 1 &&
          const bool.fromEnvironment('P3_GOOGLE_REAUTHORIZE')) {
        const scope = 'salapiya.p3.google.b';
        final auth = await initializeProofAuth(
          url,
          key,
          scope: scope,
          detectSessionInUri: false,
        );
        final flow = GoogleAuthProof(auth, scope, vault);
        await flow.listen();
        final support = await getApplicationSupportDirectory();
        final settings = GallerySettings();
        authorizationRuntime = LocalRuntime(
          LocalProfiles(
            Directory('${support.path}/p3-google-authorization-b'),
            const OsProfileVault(slot: 'salapiya.p3.google.authorization.b'),
          ),
          settings,
        );
        authorizationRuntime.connected.flow = flow;
        await tester.pumpWidget(
          SalapiyaApp(
            production: true,
            settings: settings,
            localRuntime: authorizationRuntime,
          ),
        );
        await localSettle(tester);
        await localTap(tester, find.text('Continue with Google'));
        await localTap(tester, find.text('Select Google account'));
        debugPrint('P3_GOOGLE_SELECT_SECOND_DEVELOPMENT_ACCOUNT');
        await tester.runAsync(() async {
          final started = DateTime.now();
          while (flow.pending &&
              DateTime.now().difference(started) <
                  const Duration(minutes: 10)) {
            await Future<void>.delayed(const Duration(milliseconds: 250));
          }
        });
        expect(flow.outcome, 'google_code_exchange_verified');
        final user = (await flow.client.auth.getUser()).user!;
        expect(user.identities?.any((i) => i.provider == 'google'), isTrue);
        expect(
          clients.containsKey(user.id),
          isFalse,
          reason: 'Select the other approved Google development identity.',
        );
        managedClient = flow.client;
        clients[user.id] = flow.client;
      }
      if (clients.length < 2) {
        for (final c in clients.values) {
          await c.dispose();
        }
        fail(
          'A second real Google development session requires interactive account reauthorization. No synthetic OAuth substitution was used.',
        );
      }
      final a = clients.values.first,
          b = clients.values.last,
          g = newLocalId(),
          pa = newLocalId(),
          pb = newLocalId();
      var version = 0;
      Future<void> post(
        SupabaseClient client,
        String op,
        Map<String, dynamic> values, {
        String? id,
      }) async {
        final receipt = await client.rpc(
          'p3_submit_command',
          params: {
            'command_id': id ?? newLocalId(),
            'command_payload': jsonEncode({
              'contract': 3,
              'group': g,
              'op': op,
              'version': version,
              'values': values,
            }),
          },
        ) as Map;
        expect(
          receipt['outcome'],
          'accepted',
          reason: receipt['reason'] as String?,
        );
        version = receipt['version'] as int;
      }

      try {
        await post(a, 'create', {
          'name': 'P3 real Google synthetic group',
          'display': 'Google test A',
          'participant': pa,
        });
        final token = SharedRepository.invitationToken();
        await post(a, 'invite', {
          'email': b.auth.currentUser!.email,
          'hash': SharedRepository.tokenHash(token),
        });
        final review = await b.rpc(
          'p3_review_invitation',
          params: {'group_id': g, 'token': token},
        ) as Map;
        expect(review['historyPolicy'], 1);
        await post(b, 'accept', {
          'token': token,
          'consent': true,
          'display': 'Google test B',
          'participant': pb,
        });
        final bill = newLocalId();
        await post(a, 'bill', {
          'name': 'Google-connected shared bill',
          'date': civilToday(),
          'total': '10000',
          'paid': {pa: '10000'},
          'shares': {pa: '5000', pb: '5000'},
          'method': 'equal',
        }, id: bill);
        final support = await getApplicationSupportDirectory();
        for (final client in [a, b]) {
          final db = openLocalDatabase(
            '${support.path}/p3-google-${newLocalId()}.sqlite',
            newLocalId(),
          );
          await db.initialize();
          await db.connect(
            connector: PrivateDownload(client.auth.currentSession!, endpoint),
          );
          await tester.runAsync(() => db.waitForFirstSync());
          final rows = await db.getAll(
            'SELECT document FROM p3_group WHERE group_id=?',
            [g],
          );
          expect(rows, hasLength(1));
          final doc = jsonDecode(rows.single['document'] as String) as Map;
          expect(doc['complete'], isTrue);
          final resources = await db.getAll(
            "SELECT payload FROM p3_resource WHERE group_id=? AND kind='bill' AND source_id=?",
            [g, bill],
          );
          expect(resources, hasLength(1));
          expect(
            (jsonDecode(resources.single['payload'] as String)
                as Map)['revisions'][0]['total'],
            '10000',
          );
          expect(
            await db.getAll('SELECT id FROM p2_command WHERE owner_id<>?', [
              client.auth.currentUser!.id,
            ]),
            isEmpty,
          );
          await db.close();
        }
      } finally {
        for (final client in clients.values) {
          if (!identical(client, managedClient)) await client.dispose();
        }
        await tester.pumpWidget(const SizedBox.shrink());
        await authorizationRuntime?.close();
      }
      await tester.pumpWidget(
        const MaterialApp(home: Text('Real Google group evidence verified')),
      );
    },
  );
}
