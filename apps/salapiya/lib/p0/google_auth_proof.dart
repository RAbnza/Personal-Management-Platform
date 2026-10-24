import 'dart:async';
import 'dart:convert';

import 'package:app_links/app_links.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'auth_runtime.dart';
import 'enrollment_proof.dart';

// A single-attempt lifecycle guard around the maintained Supabase PKCE flow.
// Supabase owns OAuth state validation and code exchange. No tokens/URIs in logs.
class GoogleAuthProof extends ChangeNotifier {
  GoogleAuthProof(this.auth, this.scope, this.vault);
  final Supabase auth;
  final String scope;
  final FlutterSecureStorage vault;
  StreamSubscription<Uri>? _links;
  Map<String, dynamic>? _attempt;
  bool _handling = false;
  String outcome = 'ready';
  bool get pending => _attempt != null;
  SupabaseClient get client => auth.client;
  String get verifierSlot => '$scope.pkce.supabase.auth.token-code-verifier';

  Future<void> listen() async {
    await restoreAttempt();
    final links = AppLinks();
    _links = links.uriLinkStream.listen((uri) {
      unawaited(handle(uri));
    });
    final initial = await links.getInitialLink();
    if (initial != null) await handle(initial);
    notifyListeners();
  }

  Future<void> restoreAttempt() async {
    final saved = await vault.read(key: '$scope.attempt');
    if (saved != null) {
      final attempt = jsonDecode(saved) as Map<String, dynamic>;
      if (DateTime.now().toUtc().difference(
            DateTime.parse(attempt['started'] as String),
          ) <
          const Duration(minutes: 15)) {
        _attempt = attempt;
        outcome = 'interrupted_attempt_restored';
      } else {
        await cancel();
        outcome = 'expired_attempt_preserved_local_data';
      }
    }
  }

  Future<void> start({String? expectedOwner}) async {
    if (_handling || pending) {
      throw StateError('Finish or cancel the current attempt');
    }
    _attempt = {
      'version': 1,
      'owner': expectedOwner,
      'started': DateTime.now().toUtc().toIso8601String(),
    };
    await vault.write(key: '$scope.attempt', value: jsonEncode(_attempt));
    outcome = 'waiting_for_google';
    notifyListeners();
    try {
      if (!await connectProofGoogle(client)) {
        throw StateError('Browser unavailable');
      }
      if (await vault.read(key: verifierSlot) == null) {
        throw StateError('Missing secure verifier');
      }
    } catch (_) {
      await cancel();
      outcome = 'browser_launch_failed';
      notifyListeners();
    }
  }

  Future<void> cancel() async {
    if (_handling) throw StateError('Code exchange in progress');
    _attempt = null;
    await vault.delete(key: '$scope.attempt');
    await vault.delete(key: verifierSlot);
    outcome = 'cancelled_local_data_preserved';
    notifyListeners();
  }

  Future<void> handle(Uri uri) async {
    if (!isProofCallback(uri) || _handling) return;
    if (!pending) {
      outcome = 'late_callback_ignored';
      notifyListeners();
      return;
    }
    _handling = true;
    try {
      if (uri.queryParameters.containsKey('error')) {
        outcome = 'provider_cancelled';
        return;
      }
      if (await vault.read(key: verifierSlot) == null) {
        throw StateError('Verifier unavailable');
      }
      final response = await client.auth.getSessionFromUrl(uri);
      final session = response.session;
      final google =
          session.user.identities?.any(
            (identity) => identity.provider == 'google',
          ) ??
          false;
      if (!google) throw StateError('Google identity required');
      final expected = _attempt?['owner'];
      if (expected != null && session.user.id != expected) {
        await client.auth.signOut(scope: SignOutScope.local);
        outcome = 'wrong_account_local_data_preserved';
      } else {
        // Await storage rather than relying on the SDK's asynchronous listener.
        await vault.write(
          key: '$scope.session',
          value: jsonEncode(session.toJson()),
        );
        outcome = 'google_code_exchange_verified';
      }
    } catch (_) {
      outcome = 'callback_failed_local_data_preserved';
    } finally {
      _attempt = null;
      _handling = false;
      await vault.delete(key: '$scope.attempt');
      await vault.delete(key: verifierSlot);
      notifyListeners();
    }
  }

  Future<void> close() async {
    await _links?.cancel();
    await auth.dispose();
    dispose();
  }
}
