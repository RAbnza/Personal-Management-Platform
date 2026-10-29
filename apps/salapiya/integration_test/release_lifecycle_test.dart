import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:path_provider/path_provider.dart';
import 'package:powersync/powersync.dart';
import 'package:salapiya/connected/command_connector.dart';
import 'package:salapiya/local/local_store.dart';
import 'package:salapiya/local/finance_domain.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../test/release_lifecycle_widgets_test.dart' show releaseRemovalJourney;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets(
    'native reviewed offline local removal preserves cancellation',
    releaseRemovalJourney,
  );
  testWidgets(
    'real SDK removes revoked-session streams; peer authority and private draft survive',
    (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(body: Text('Synthetic lifecycle acceptance')),
        ),
      );
      await tester.runAsync(() async {
        const configPath = String.fromEnvironment(
          'SALAPIYA_RELEASE_CONFIG_PATH',
        );
        final file = Platform.isWindows
            ? File(configPath)
            : File(
                '${(await getApplicationSupportDirectory()).path}/release-lifecycle-config.json',
              );
        final c = jsonDecode(await file.readAsString()) as Map;
        await file.delete();
        SupabaseClient client() => SupabaseClient(
          c['url'] as String,
          c['publicKey'] as String,
          authOptions: const AuthClientOptions(autoRefreshToken: false),
        );
        final primary = client(), peer = client();
        final directory = await Directory.systemTemp.createTemp(
          'salapiya-release-stream-',
        );
        final database = openLocalDatabase(
          '${directory.path}/isolated.sqlite',
          'synthetic-release-stream-key',
        );
        try {
          await primary.auth.setSession(c['refreshToken'] as String);
          await peer.auth.setSession(c['peerRefreshToken'] as String);
          final token = primary.auth.currentSession!.accessToken;
          final claims = jsonDecode(
            utf8.decode(
              base64Url.decode(base64Url.normalize(token.split('.')[1])),
            ),
          ) as Map;
          final session = claims['session_id'] as String;
          expect(primary.auth.currentUser!.id, c['actor']);
          await database.initialize();
          final store = LocalStore(database, c['profile'] as String);
          await store.migrate();
          await store.initializeProfile('Synthetic lifecycle draft', {});
          final draftId = newLocalId();
          await store.saveDraft('expense', draftId, {
            'amount': '12.34',
            'name': 'Retained offline intent',
          });
          final draft = await database.getAll('SELECT * FROM local_draft');
          Future<void> connect() => database.connect(
            connector: FinancialConnector(
              store: store,
              actor: c['actor'] as String,
              credentials: () async => PowerSyncCredentials(
                endpoint: c['endpoint'] as String,
                token: token,
                userId: c['actor'] as String,
              ),
              submit: (_, _) => throw StateError(
                'This isolated read fixture must not submit money',
              ),
            ),
          );
          Future<void> waitForCount(int expected) async {
            final deadline = DateTime.now().add(const Duration(seconds: 90));
            while (DateTime.now().isBefore(deadline)) {
              final rows = await database.getAll('SELECT id FROM p2_profile');
              if (rows.length == expected && database.currentStatus.connected) {
                return;
              }
              await Future<void>.delayed(const Duration(milliseconds: 250));
            }
            fail(
              'Actual PowerSync session-entitlement checkpoint did not converge',
            );
          }

          await connect();
          await waitForCount(1);
          expect(
            (await database.getAll('SELECT id FROM p2_profile')).single['id'],
            c['profile'],
          );
          await peer.rpc(
            'p7_revoke_device',
            params: {'target_session': session},
          );
          await expectLater(
            primary.rpc('p2_profile_boundary'),
            throwsA(isA<PostgrestException>()),
          );
          expect(await primary.from('p2_profile').select(), isEmpty);
          await waitForCount(0);
          // Reconnect with the exact copied, still-unexpired old JWT. Client
          // subscription/connection parameters cannot substitute its signed sid.
          await database.disconnect();
          await connect();
          await waitForCount(0);
          expect(await database.getAll('SELECT * FROM local_draft'), draft);
          expect(
            (await peer.rpc('p2_profile_boundary') as Map)['id'],
            c['profile'],
          );
          debugPrint(
            'RELEASE_LIFECYCLE hostedRPC=denied RLS=empty oldJWTStream=empty peer=authorized localDraft=preserved',
          );
        } finally {
          await database.disconnect();
          await database.close();
          await primary.dispose();
          await peer.dispose();
          await directory.delete(recursive: true);
        }
      });
    },
    timeout: const Timeout(Duration(minutes: 5)),
  );
}
