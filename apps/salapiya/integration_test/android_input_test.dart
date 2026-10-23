import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:salapiya/app.dart';

import '../test/shell_journey.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets('Android native rotation and reported IME inset', (tester) async {
    if (!Platform.isAndroid) return;
    addTearDown(() => SystemChrome.setPreferredOrientations([]));
    await tester.pumpWidget(const SalapiyaApp());
    await tester.pumpAndSettle();
    await SystemChrome.setPreferredOrientations([
      DeviceOrientation.landscapeLeft,
    ]);
    for (
      var i = 0;
      i < 30 &&
          tester.view.physicalSize.width < tester.view.physicalSize.height;
      i++
    ) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    await tester.pumpAndSettle();
    expect(
      tester.view.physicalSize.width,
      greaterThan(tester.view.physicalSize.height),
    );
    expect(tester.takeException(), isNull);
    await SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
    for (
      var i = 0;
      i < 30 &&
          tester.view.physicalSize.width > tester.view.physicalSize.height;
      i++
    ) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    await tester.pumpAndSettle();
    expect(
      tester.view.physicalSize.height,
      greaterThan(tester.view.physicalSize.width),
    );
    await tester.tap(find.byTooltip('Quick actions'));
    await tester.pumpAndSettle();
    await tapVisible(tester, find.text('Add task'));
    await tapVisible(tester, find.byKey(const ValueKey('demo-task-note')));
    await SystemChannels.textInput.invokeMethod<void>('TextInput.show');
    for (var i = 0; i < 50 && tester.view.viewInsets.bottom == 0; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    await tester.pumpAndSettle();
    expect(
      tester.view.viewInsets.bottom,
      greaterThan(0),
      reason: 'Requires emulator show_ime_with_hard_keyboard=1; host restores its prior value.',
    );
    await tapVisible(tester, find.text('Preview outcome'));
    expect(find.textContaining('Preview complete'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await SystemChannels.textInput.invokeMethod<void>('TextInput.hide');
    await SystemChrome.setPreferredOrientations([]);
  });
}
