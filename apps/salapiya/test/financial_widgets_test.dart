import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/design_system/theme.dart';
import 'package:salapiya/features/finance/contracts/financial_models.dart';
import 'package:salapiya/features/finance/presentation/financial_editor.dart';
import 'package:salapiya/features/finance/presentation/financial_widgets.dart';
import 'package:salapiya/features/finance/presentation/money_screen.dart';
import 'package:salapiya/features/finance/presentation/debts_screen.dart';
import 'package:salapiya/features/finance/presentation/shared_screen.dart';
import 'package:salapiya/prototype/scenarios.dart';

import 'financial_journey.dart';

void main() {
  testWidgets('D3 complete financial entry review and source navigation', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(1280, 900);
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await financialJourney(tester);
  });
  for (final width in [360.0, 1280.0]) {
    testWidgets('financial forms and module surfaces reflow at $width', (
      tester,
    ) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = Size(width, 800);
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final session = PrototypeSession();
      final theme = SalapiyaTheme.build(
        width == 360 ? Brightness.dark : Brightness.light,
      );
      Future<void> render(Widget child) async {
        await tester.pumpWidget(
          MaterialApp(
            theme: theme,
            home: MediaQuery(
              data: MediaQueryData(
                size: Size(width, 800),
                textScaler: TextScaler.linear(width == 360 ? 1.5 : 1),
              ),
              child: child,
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull, reason: child.toStringDeep());
      }

      for (final action in FinancialAction.values) {
        await render(
          FinancialEditor(
            key: ValueKey(action),
            controller: session.finance,
            action: action,
          ),
        );
        await tester.ensureVisible(find.byKey(const ValueKey('review-action')));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull, reason: action.name);
      }
      for (final child in [
        MoneyScreen(session: session),
        MoneyScreen(session: session, initial: 'Cards'),
        MoneyScreen(session: session, initial: 'Import'),
        DebtsScreen(session: session),
        SharedScreen(session: session),
      ]) {
        await render(
          FinancePage(key: UniqueKey(), title: 'Reflow proof', child: child),
        );
      }
      await tester.pumpWidget(const SizedBox.shrink());
      session.dispose();
    });
  }
}
