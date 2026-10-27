import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import '../test/android_overview_polish_test.dart' show overviewPolishJourney;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets('native Overview polish and expense access', (tester) async {
    await overviewPolishJourney(tester, android: Platform.isAndroid);
  });
}
