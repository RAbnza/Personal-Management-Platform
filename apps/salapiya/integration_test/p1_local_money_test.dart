import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:path_provider/path_provider.dart';
import 'package:salapiya/local/finance_domain.dart';
import 'package:salapiya/local/local_profiles.dart';

import '../test/local_money_journey.dart';

class NoNetworkProof extends HttpOverrides {
  int attempts = 0;
  @override
  HttpClient createHttpClient(SecurityContext? context) {
    attempts++;
    throw StateError('Local-only production composition attempted HTTP.');
  }
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets(
    'P1 native offline profile and everyday money through approved UI',
    (tester) async {
      final previousNetwork = HttpOverrides.current;
      final network = NoNetworkProof();
      HttpOverrides.global = network;
      final support = await getApplicationSupportDirectory();
      final dir = Directory('${support.path}/p1-integration-${newLocalId()}');
      final slot = 'salapiya.p1.integration.${newLocalId()}';
      final vault = OsProfileVault(slot: slot),
          profiles = LocalProfiles(dir, OsProfileVault(slot: slot));
      try {
        await localMoneyJourney(tester, profiles);
        expect(network.attempts, 0);
      } finally {
        await profiles.close();
        await OsProfileVault.storage.delete(key: vault.slot);
        if (await dir.exists()) {
          await dir.delete(recursive: true);
        }
        HttpOverrides.global = previousNetwork;
      }
    },
  );
}
