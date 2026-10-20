import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/app.dart';

void main() {
  testWidgets('starts without services and responds to a tap', (tester) async {
    await tester.pumpWidget(const SalapiyaApp());
    expect(find.text('Salapiya'), findsOneWidget);
    expect(find.text('Your money, on your terms.'), findsOneWidget);
    expect(find.text('Startup checks: 0'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Run startup check'));
    await tester.pump();
    expect(find.text('Startup checks: 1'), findsOneWidget);
  });

  testWidgets('startup action is reachable using the keyboard', (tester) async {
    await tester.pumpWidget(const SalapiyaApp());
    await tester.sendKeyEvent(LogicalKeyboardKey.tab);
    await tester.pump();
    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    await tester.pump();
    expect(find.text('Startup checks: 1'), findsOneWidget);
  });

  testWidgets('compact display supports enlarged text without overflow', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 568);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      MaterialApp(
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context)
              .copyWith(textScaler: TextScaler.linear(2)),
          child: child!,
        ),
        home: const StartupPage(),
      ),
    );
    await tester.ensureVisible(find.text('Run startup check'));
    await tester.tap(find.text('Run startup check'));
    await tester.pump();
    expect(find.text('Startup checks: 1'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('system dark theme retains a labeled action', (tester) async {
    tester.platformDispatcher.platformBrightnessTestValue = Brightness.dark;
    addTearDown(tester.platformDispatcher.clearPlatformBrightnessTestValue);
    final semantics = tester.ensureSemantics();
    await tester.pumpWidget(const SalapiyaApp());
    final context = tester.element(find.byType(StartupPage));
    expect(Theme.of(context).brightness, Brightness.dark);
    expect(
      tester.getSemantics(find.byType(FilledButton)),
      matchesSemantics(
        label: 'Run startup check',
        isButton: true,
        isFocusable: true,
        hasEnabledState: true,
        isEnabled: true,
        hasTapAction: true,
        hasFocusAction: true,
      ),
    );
    semantics.dispose();
  });
}
