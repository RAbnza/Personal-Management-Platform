import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:salapiya/p0/proof_database.dart';
import 'package:salapiya/p0/secure_auth_storage.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('P0 native encrypted PowerSync local-only and credentials', (
    _,
  ) async {
    final root = await getApplicationSupportDirectory();
    final dir = await Directory(root.path).createTemp('p0-compatibility-');
    const storage = FlutterSecureStorage();
    const slot = 'salapiya.p0.synthetic';
    final path = p.join(dir.path, 'proof.sqlite');
    await storage.write(key: slot, value: 'synthetic-test-key-only');
    expect(await storage.read(key: slot), 'synthetic-test-key-only');
    var db = openProofDatabase(path, (await storage.read(key: slot))!);
    try {
      await db.initialize();
      await db.execute('INSERT INTO local_probe(id,value) VALUES(?,?)', [
        'offline',
        'private-synthetic-marker',
      ]);
      expect(await db.getNextCrudTransaction(), isNull);
      await db.close();
      db = openProofDatabase(path, (await storage.read(key: slot))!);
      await db.initialize();
      expect(
        (await db.get('SELECT value FROM local_probe'))['value'],
        'private-synthetic-marker',
      );
      await db.close();
      final bytes = await File(path).readAsBytes();
      expect(
        String.fromCharCodes(bytes).contains('private-synthetic-marker'),
        isFalse,
      );
      final wrong = openProofDatabase(path, 'wrong-key');
      try {
        await expectLater(wrong.initialize(), throwsA(anything));
      } finally {
        // A failed initialization also propagates through close in this SDK.
        try {
          await wrong.close();
        } catch (_) {
          /* Expected failed-open cleanup. */
        }
      }
      final auth = SupabaseClient(
        'https://example.invalid',
        'synthetic-public-key',
        authOptions: const AuthClientOptions(
          pkceAsyncStorage: SecurePkceStorage(storage, 'salapiya.p0.pkce'),
          authFlowType: AuthFlowType.pkce,
          autoRefreshToken: false,
        ),
      );
      try {
        final oauth = await auth.auth.getOAuthSignInUrl(
          provider: OAuthProvider.google,
          redirectTo: 'dev.salapiya.p0://auth/callback',
        );
        final uri = Uri.parse(oauth.url);
        expect(uri.queryParameters['code_challenge_method'], 's256');
        expect(uri.queryParameters['provider'], 'google');
        const sessionStore = SecureSessionStorage(
          storage,
          'salapiya.p0.session',
        );
        await sessionStore.initialize();
        await sessionStore.persistSession('synthetic-session-only');
        expect(await sessionStore.hasAccessToken(), isTrue);
        expect(await sessionStore.accessToken(), 'synthetic-session-only');
        await sessionStore.removePersistedSession();
        expect(await sessionStore.hasAccessToken(), isFalse);
      } finally {
        await auth.dispose();
        await const SecurePkceStorage(
          storage,
          'salapiya.p0.pkce',
        ).removeItem(key: 'supabase.auth.token-code-verifier');
      }
    } finally {
      await db.close();
      await storage.delete(key: slot);
      expect(await storage.read(key: slot), isNull);
      await dir.delete(recursive: true);
    }
  });
}
