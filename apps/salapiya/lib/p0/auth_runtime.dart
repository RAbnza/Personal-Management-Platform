import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'enrollment_proof.dart';
import 'secure_auth_storage.dart';

// Maintained native PKCE initialization shared by proof and production. The
// product initializes it only for optional connection or a bound online session.
// Local-only startup does not require network authentication.
Future<Supabase> initializeProofAuth(
  String url,
  String publicKey, {
  String scope = 'salapiya.p0.hosted',
  bool detectSessionInUri = true,
}) async {
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
      localStorage: SecureSessionStorage(storage, '$scope.session'),
      pkceAsyncStorage: SecurePkceStorage(storage, '$scope.pkce'),
      detectSessionInUriPredicate: isProofCallback,
      detectSessionInUri: detectSessionInUri,
    ),
  );
}

Future<bool> connectProofGoogle(SupabaseClient client) =>
    client.auth.signInWithOAuth(
      OAuthProvider.google,
      redirectTo: proofCallback,
      authScreenLaunchMode: LaunchMode.externalApplication,
      queryParams: {'prompt': 'select_account'},
    );
