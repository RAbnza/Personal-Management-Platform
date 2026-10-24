import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'enrollment_proof.dart';
import 'secure_auth_storage.dart';

// Only the isolated P0 harness initializes this. Local-only product startup
// remains unchanged and does not require network authentication.
Future<Supabase> initializeProofAuth(String url, String publicKey) async {
  final uri = Uri.parse(url);
  if (uri.scheme != 'https' ||
      !uri.host.endsWith('.supabase.co') ||
      publicKey.isEmpty) {
    throw ArgumentError(
      'Valid development public client configuration required',
    );
  }
  const storage = FlutterSecureStorage();
  return Supabase.initialize(
    url: url,
    publishableKey: publicKey,
    debug: false,
    authOptions: FlutterAuthClientOptions(
      authFlowType: AuthFlowType.pkce,
      localStorage: const SecureSessionStorage(
        storage,
        'salapiya.p0.hosted.session',
      ),
      pkceAsyncStorage: const SecurePkceStorage(
        storage,
        'salapiya.p0.hosted.pkce',
      ),
      detectSessionInUriPredicate: isProofCallback,
    ),
  );
}

Future<bool> connectProofGoogle(SupabaseClient client) => client.auth
    .signInWithOAuth(OAuthProvider.google, redirectTo: proofCallback);
