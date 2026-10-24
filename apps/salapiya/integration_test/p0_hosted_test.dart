import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:integration_test/integration_test.dart';
import 'package:path_provider/path_provider.dart';
import 'package:salapiya/p0/auth_runtime.dart';
import 'package:salapiya/p0/command_connector.dart';
import 'package:salapiya/p0/connected_recovery.dart';
import 'package:salapiya/p0/enrollment_proof.dart';
import 'package:salapiya/p0/local_ledger.dart';
import 'package:salapiya/p0/portable_recovery.dart';
import 'package:salapiya/p0/proof_database.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets(
    'native hosted auth, enrollment, durable RPC retry and recovery review',
    (_) async {
      final File configFile;
      if (Platform.isWindows) {
        const configPath = String.fromEnvironment('P0_NATIVE_CONFIG_PATH');
        if (configPath.isEmpty) {
          throw StateError('External runtime fixture path required');
        }
        configFile = File(configPath);
      } else {
        configFile = File(
          '${(await getApplicationSupportDirectory()).path}/p0-hosted-config.json',
        );
      }
      final config =
          jsonDecode(await configFile.readAsString()) as Map<String, dynamic>;
      await configFile
          .delete(); // Never bundle session material in a Flutter build.
      final auth = await initializeProofAuth(
        config['url'] as String,
        config['publicKey'] as String,
      );
      final client = auth.client;
      final other = SupabaseClient(
        config['url'] as String,
        config['publicKey'] as String,
        authOptions: const AuthClientOptions(autoRefreshToken: false),
      );
      final dir = await Directory.systemTemp.createTemp('salapiya-hosted-');
      const vault = FlutterSecureStorage();
      const keySlot = 'salapiya.p0.hosted.db-key';
      await vault.write(
        key: keySlot,
        value: await PortableRecovery.newRecoverySecret(),
      );
      var db = openProofDatabase(
        '${dir.path}/device.sqlite',
        (await vault.read(key: keySlot))!,
      );
      final recoveryDb = openProofDatabase(
        '${dir.path}/recovery.sqlite',
        await PortableRecovery.newRecoverySecret(),
      );
      try {
        await client.auth.setSession(config['refreshToken'] as String);
        await other.auth.setSession(config['otherRefreshToken'] as String);
        final owner = config['owner'] as String;
        expect(client.auth.currentUser?.id, owner);
        expect(other.auth.currentUser?.id, config['otherOwner']);
        await db.initialize();
        await recoveryDb.initialize();
        var ledger = LocalLedger(db);
        await ledger.migrate();
        await LocalLedger(recoveryDb).migrate();
        final enrollment = EnrollmentProof(db);
        final localId = config['profileId'] as String;
        await enrollment.createLocal(localId);
        await ledger.expense(
          id: config['sourceId'] as String,
          owner: localId,
          amount: '500050',
        );
        final snapshot = await enrollment.stage(
          config['sourceId'] as String,
          owner,
        );
        final stage = await client.rpc(
          'p0_stage_enrollment',
          params: {
            'enrollment_id': config['sourceId'],
            'profile_id': localId,
            'snapshot': jsonDecode(snapshot),
          },
        );
        if (stage['outcome'] == 'collision') {
          await enrollment.collision();
          await enrollment.cancel();
          expect(await ledger.expenseView(localId), BigInt.from(500050));
        } else {
          final publication = await client.rpc(
            'p0_publish_enrollment',
            params: {'enrollment_id': config['sourceId']},
          );
          expect(publication['outcome'], 'published');
          final profiles = await client
              .from('p0_profile')
              .select('id,owner_id')
              .eq('id', localId);
          expect(profiles.length, 1);
          final actions = await client
              .from('p0_accepted')
              .select()
              .eq('id', config['sourceId'] as String);
          await enrollment.completePublication(owner, localId, actions);
          expect(await ledger.expenseView(owner), BigInt.from(500050));
        }
        final existing = await client.from('p0_profile').select('id');
        expect(
          existing.length,
          1,
        ); // Android retrieves the same actual cloud owner.
        final primary = ProofConnector.supabase(
          client: client,
          owner: owner,
          endpoint: config['powersyncUrl'] as String,
        );
        var loseResponse = true;
        final transport = ProofConnector(
          owner: owner,
          credentials: primary.fetchCredentials,
          submit: (id, payload) async {
            final receipt = await primary.submit(id, payload);
            if (loseResponse) {
              loseResponse = false;
              throw const SocketException(
                'Injected client response loss after actual hosted commit',
              );
            }
            return receipt;
          },
        );
        await ledger.expense(
          id: config['commandId'] as String,
          owner: owner,
          amount: '100000000000',
          connected: true,
        );
        await expectLater(
          transport.uploadData(db),
          throwsA(isA<SocketException>()),
        );
        await db.close();
        db = openProofDatabase(
          '${dir.path}/device.sqlite',
          (await vault.read(key: keySlot))!,
        );
        await db.initialize();
        ledger = LocalLedger(db);
        await transport.uploadData(db);
        expect(await db.getNextCrudTransaction(), isNull);
        final accepted = await client
            .from('p0_accepted')
            .select('id')
            .eq('id', config['commandId'] as String);
        expect(accepted.length, 1);
        await ledger.expense(
          id: config['rejectedId'] as String,
          owner: owner,
          amount: '1',
          connected: true,
          revision: 999999999,
        );
        await ledger.expense(
          id: config['unrelatedId'] as String,
          owner: owner,
          amount: '2',
          connected: true,
        );
        await primary.uploadData(db);
        await primary.uploadData(db);
        expect(
          (await db.get('SELECT state FROM proof_intent WHERE id=?', [
            config['rejectedId'],
          ]))['state'],
          'review',
        );
        expect(
          (await db.get('SELECT state FROM proof_intent WHERE id=?', [
            config['unrelatedId'],
          ]))['state'],
          'accepted',
        );
        expect(await db.getNextCrudTransaction(), isNull);
        final otherRows = await other
            .from('p0_accepted')
            .select('id')
            .eq('owner_id', owner);
        expect(otherRows, isEmpty);
        expect(
          await client
              .from('p0_accepted')
              .select('id')
              .eq('owner_id', config['otherOwner'] as String),
          isEmpty,
        );
        await ledger.expense(
          id: config['missingId'] as String,
          owner: owner,
          amount: '3',
          connected: true,
        );
        final secret = await PortableRecovery.newRecoverySecret();
        final backup = await PortableRecovery.seal(
          await PortableRecovery.capture(db, owner, {}),
          secret,
        );
        final bundle = await PortableRecovery.unseal(backup, secret);
        await PortableRecovery.restore(recoveryDb, bundle, owner);
        final recovery = ConnectedRecovery(recoveryDb, client);
        expect(
          await recovery.review(config['commandId'] as String, owner),
          'accepted',
        );
        expect(
          await recovery.review(config['rejectedId'] as String, owner),
          'rejected',
        );
        expect(await recoveryDb.getNextCrudTransaction(), isNull);
        expect(
          await recovery.review(config['missingId'] as String, owner),
          'missing',
        );
        expect(await recoveryDb.getNextCrudTransaction(), isNull);
        expect(
          await recovery.review(
            config['missingId'] as String,
            owner,
            explicitlyResumeMissing: true,
          ),
          'missing',
        );
        await primary.uploadData(recoveryDb);
        // The original device subsequently retries its same ID; server effect stays one.
        await primary.uploadData(db);
        expect(
          (await client
                  .from('p0_accepted')
                  .select('id')
                  .eq('id', config['missingId'] as String))
              .length,
          1,
        );
        if (config['syncEnabled'] == true) {
          // Client-controlled owner parameters must not widen signed-user streams.
          await db.connect(
            connector: primary,
            params: {'owner_id': config['otherOwner']},
          );
          await db.waitForFirstSync().timeout(const Duration(seconds: 60));
          await db
              .watch(
                'SELECT id FROM p0_accepted WHERE id=?',
                parameters: [config['commandId']],
              )
              .firstWhere((rows) => rows.length == 1)
              .timeout(const Duration(seconds: 60));
          await ledger.reconcile(owner);
          expect(
            (await db.get('SELECT state FROM proof_intent WHERE id=?', [
              config['commandId'],
            ]))['state'],
            'reconciled',
          );
          expect(
            await db.getAll('SELECT id FROM p0_accepted WHERE owner_id!=?', [
              owner,
            ]),
            isEmpty,
          );
          if (config['peerCommandId'] != null) {
            expect(
              (await db.getAll('SELECT id FROM p0_accepted WHERE id=?', [
                config['peerCommandId'],
              ])).length,
              1,
            );
          }
          await db.disconnect();
          final downloadedTotal = await ledger.expenseView(owner);
          await ledger.expense(
            id: config['offlineId'] as String,
            owner: owner,
            amount: '4',
            connected: true,
          );
          await db.close();
          db = openProofDatabase(
            '${dir.path}/device.sqlite',
            (await vault.read(key: keySlot))!,
          );
          await db.initialize();
          ledger = LocalLedger(db);
          expect(await db.getNextCrudTransaction(), isNotNull);
          expect(
            await ledger.expenseView(owner),
            downloadedTotal + BigInt.from(4),
          );
          // Reopen retains cached history plus the offline queue. SDK reconnect
          // uploads it and advances the real download checkpoint before reconcile.
          await db.connect(connector: primary);
          await db
              .watch(
                'SELECT id FROM p0_accepted WHERE id=?',
                parameters: [config['offlineId']],
              )
              .firstWhere((rows) => rows.length == 1)
              .timeout(const Duration(seconds: 60));
          await ledger.reconcile(owner);
          expect(
            (await db.get('SELECT state FROM proof_intent WHERE id=?', [
              config['offlineId'],
            ]))['state'],
            'reconciled',
          );
          expect(
            await ledger.expenseView(owner),
            downloadedTotal + BigInt.from(4),
          );
          await db.disconnect();

          final otherDb = openProofDatabase(
            '${dir.path}/other-owner.sqlite',
            await PortableRecovery.newRecoverySecret(),
          );
          try {
            await otherDb.initialize();
            final otherLedger = LocalLedger(otherDb);
            await otherLedger.migrate();
            final otherOwner = config['otherOwner'] as String;
            await otherLedger.expense(
              id: config['otherCommandId'] as String,
              owner: otherOwner,
              amount: '7',
              connected: true,
            );
            await otherDb.connect(
              connector: ProofConnector.supabase(
                client: other,
                owner: otherOwner,
                endpoint: config['powersyncUrl'] as String,
              ),
              params: {'owner_id': owner},
            );
            await otherDb.waitForFirstSync().timeout(
              const Duration(seconds: 60),
            );
            await otherDb
                .watch(
                  'SELECT id FROM p0_accepted WHERE id=?',
                  parameters: [config['otherCommandId']],
                )
                .firstWhere((rows) => rows.length == 1)
                .timeout(const Duration(seconds: 60));
            expect(
              await otherDb.getAll(
                'SELECT id FROM p0_accepted WHERE owner_id!=?',
                [otherOwner],
              ),
              isEmpty,
            );
            expect(
              await otherDb.getAll(
                'SELECT id FROM p0_profile WHERE owner_id!=?',
                [otherOwner],
              ),
              isEmpty,
            );
          } finally {
            await otherDb.close();
          }
        } else {
          debugPrint('P0_CDC_NOT_RUN_INSTANCE_UNPROVISIONED');
        }
        final revokedRefresh = other.auth.currentSession!.refreshToken!;
        await other.auth.signOut(scope: SignOutScope.local);
        await expectLater(
          other.auth.refreshSession(revokedRefresh),
          throwsA(isA<AuthException>()),
        );
        final oauth = await client.auth.getOAuthSignInUrl(
          provider: OAuthProvider.google,
          redirectTo: proofCallback,
        );
        expect(
          Uri.parse(oauth.url).queryParameters['code_challenge_method'],
          's256',
        );
      } finally {
        await db.close();
        await recoveryDb.close();
        await other.auth.signOut(scope: SignOutScope.local);
        await client.auth.signOut(scope: SignOutScope.local);
        await other.dispose();
        await auth.dispose();
        await vault.delete(key: keySlot);
        await vault.delete(
          key: 'salapiya.p0.hosted.pkce.supabase.auth.token-code-verifier',
        );
        await dir.delete(recursive: true);
      }
    },
    timeout: const Timeout(Duration(minutes: 3)),
  );
}
