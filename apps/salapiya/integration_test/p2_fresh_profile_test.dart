import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:path_provider/path_provider.dart';
import 'package:salapiya/app.dart';
import 'package:salapiya/gallery/settings.dart';
import 'package:salapiya/local/local_profiles.dart';
import 'package:salapiya/local/local_runtime.dart';
import 'package:salapiya/p0/auth_runtime.dart';
import 'package:salapiya/p0/google_auth_proof.dart';

import '../test/local_money_journey.dart';

// OAuth itself is certified by p2_google_product_test. This covers the remaining
// no-local/no-cloud branch with existing synthetic authenticated identities.
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets('fresh connected profile needs no disposable local profile', (
    tester,
  ) async {
    const configPath = String.fromEnvironment('P2_NATIVE_CONFIG_PATH');
    final support = await getApplicationSupportDirectory();
    final file = File(
      Platform.isWindows ? configPath : '${support.path}/p2-native-config.json',
    );
    final config =
        jsonDecode(await file.readAsString()) as Map<String, dynamic>;
    await file.delete();
    final role = config['role'] as String;
    final settings = GallerySettings();
    final runtime = LocalRuntime(
      LocalProfiles(
        Directory('${support.path}/p2-fresh-$role'),
        OsProfileVault(slot: 'salapiya.p2.fresh.$role'),
      ),
      settings,
    );
    try {
      final auth = await initializeProofAuth(
        config['url'] as String,
        config['publicKey'] as String,
        scope: 'salapiya.p2.fresh.auth.$role',
        detectSessionInUri: false,
      );
      await auth.client.auth.setSession(config['refreshToken'] as String);
      runtime.connected.flow = GoogleAuthProof(
        auth,
        'salapiya.p2.fresh.auth.$role',
        const FlutterSecureStorage(),
      );
      await runtime.reopen();
      final firstRun = runtime.session == null;
      if (firstRun) expect(await runtime.connected.boundary(), isNull);
      await tester.pumpWidget(
        SalapiyaApp(
          production: true,
          settings: settings,
          localRuntime: runtime,
        ),
      );
      await localSettle(tester);
      if (firstRun) {
        await localTap(tester, find.text('Continue with Google'));
        expect(runtime.session, isNull);
        await localTap(tester, find.text('Review connection'));
        expect(runtime.session, isNull);
        await localTap(tester, find.text('Confirm connection'));
        await localWait(
          tester,
          () => runtime.session != null && !runtime.connected.busy,
        );
        expect(runtime.connected.error, isNull);
        expect(runtime.connected.complete, isTrue);
        expect(
          (await runtime.session!.localFinance.store.snapshot()).accounts,
          isEmpty,
        );
        await localTap(tester, find.byType(BackButton));
        await localTap(tester, find.byKey(const ValueKey('nav-money')));
        await localTap(tester, find.byTooltip('Create account'));
        await localEnter(tester, 'name', 'Synthetic fresh $role');
        await localEnter(tester, 'amount', '1.00');
        await localEnter(tester, 'cutoff', '2026-10-25');
        await localConfirm(tester);
      }
      await tester.runAsync(runtime.connected.syncNow);
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(seconds: 2)),
      );
      await tester.runAsync(runtime.connected.syncNow);
      expect(runtime.connected.error, isNull);
      final snapshot = await runtime.session!.localFinance.store.snapshot();
      expect(snapshot.accounts, hasLength(1));
      expect(snapshot.balance(snapshot.accounts.single.id), BigInt.from(100));
      expect(runtime.connected.pendingCount, 0);
      expect(runtime.connected.label, 'Synced');
      debugPrint(
        'P2_FRESH_EVIDENCE ${jsonEncode({'role': role, 'createdWithoutLocalProfile': firstRun, 'profile': snapshot.owner, 'acceptedAccounts': snapshot.accounts.length, 'balance_minor': '100', 'status': runtime.connected.label, 'realHosted': true, 'googleOAuthCertifiedByThisTest': false})}',
      );
      await runtime.session!.localFinance.store.integrity();
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      await runtime.close();
      runtime.dispose();
      settings.dispose();
    }
  }, timeout: const Timeout(Duration(minutes: 4)));
}
