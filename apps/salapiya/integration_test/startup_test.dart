import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:salapiya/app.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('native startup renders and accepts an interaction', (
    tester,
  ) async {
    await tester.pumpWidget(const SalapiyaApp());
    await tester.pumpAndSettle();

    expect(find.text('Salapiya'), findsOneWidget);
    expect(find.text('Startup checks: 0'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Run startup check'));
    await tester.pumpAndSettle();
    expect(find.text('Startup checks: 1'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
