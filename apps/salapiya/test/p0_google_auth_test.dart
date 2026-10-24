import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/p0/auth_runtime.dart';
import 'package:salapiya/p0/google_auth_proof.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('restart restores guarded attempt; cancel destroys verifier and late callback cannot exchange', () async {
    FlutterSecureStorage.setMockInitialValues({});
    const vault = FlutterSecureStorage();
    const scope = 'salapiya.p0.google.test';
    final auth = await initializeProofAuth(
      'https://p0proof.supabase.co',
      'synthetic-public-client',
      scope: scope,
      detectSessionInUri: false,
    );
    final flow = GoogleAuthProof(auth, scope, vault);
    try {
      await vault.write(
        key: '$scope.attempt',
        value: jsonEncode({
          'version': 1,
          'owner': 'bound-owner',
          'started': DateTime.now().toUtc().toIso8601String(),
        }),
      );
      await vault.write(key: flow.verifierSlot, value: 'synthetic-verifier');
      await vault.write(
        key: '$scope.profile',
        value: 'preserved-local-profile',
      );
      await flow.restoreAttempt();
      expect(flow.pending, true);
      expect(flow.outcome, 'interrupted_attempt_restored');
      await flow.cancel();
      expect(await vault.read(key: flow.verifierSlot), isNull);
      expect(await vault.read(key: '$scope.attempt'), isNull);
      await flow.handle(
        Uri.parse('dev.salapiya.p0://auth/callback?code=synthetic-late-code'),
      );
      expect(flow.outcome, 'late_callback_ignored');
      expect(auth.client.auth.currentSession, isNull);
      expect(
        await vault.read(key: '$scope.profile'),
        'preserved-local-profile',
      );
    } finally {
      await flow.close();
    }
  });
  test(
    'expired attempt cannot survive restart or retain a usable verifier',
    () async {
      FlutterSecureStorage.setMockInitialValues({});
      const vault = FlutterSecureStorage();
      const scope = 'salapiya.p0.google.expiry-test';
      final auth = await initializeProofAuth(
        'https://p0proof.supabase.co',
        'synthetic-public-client',
        scope: scope,
        detectSessionInUri: false,
      );
      final flow = GoogleAuthProof(auth, scope, vault);
      try {
        await vault.write(
          key: '$scope.attempt',
          value: jsonEncode({
            'version': 1,
            'owner': null,
            'started': DateTime.now()
                .toUtc()
                .subtract(const Duration(minutes: 16))
                .toIso8601String(),
          }),
        );
        await vault.write(
          key: flow.verifierSlot,
          value: 'synthetic-expired-verifier',
        );
        await flow.restoreAttempt();
        expect(flow.pending, false);
        expect(flow.outcome, 'expired_attempt_preserved_local_data');
        expect(await vault.read(key: flow.verifierSlot), isNull);
      } finally {
        await flow.close();
      }
    },
  );
}
