import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:salapiya/p0/enrollment_proof.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets('native OS delivers the development callback to app_links', (
    tester,
  ) async {
    final completer = Completer<Uri>();
    final links = AppLinks();
    final subscription = links.uriLinkStream.listen((uri) {
      if (isProofCallback(uri) && !completer.isCompleted) {
        completer.complete(uri);
      }
    });
    try {
      debugPrint('P0_CALLBACK_READY');
      final received = await tester.runAsync(
        () => completer.future.timeout(const Duration(seconds: 45)),
      );
      expect(received?.queryParameters['code'], 'synthetic-callback-only');
    } finally {
      await subscription.cancel();
    }
  });
}
