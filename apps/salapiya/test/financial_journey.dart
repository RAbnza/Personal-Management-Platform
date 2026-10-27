import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/app.dart';
import 'package:salapiya/features/finance/presentation/financial_editor.dart';
import 'package:salapiya/features/finance/presentation/financial_widgets.dart';
import 'package:salapiya/prototype/scenarios.dart';

Future<void> financialTap(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder.first);
  await tester.pumpAndSettle();
  await tester.tap(finder.first);
  await tester.pumpAndSettle();
}

Future<void> financialEnter(
  WidgetTester tester,
  String key,
  String value,
) async {
  final field = find.byKey(ValueKey(key));
  await tester.ensureVisible(field);
  await tester.pumpAndSettle();
  final editable = find.descendant(
    of: field,
    matching: find.byType(EditableText),
  );
  // Drive the same editing callback on native and widget bindings. The native
  // test IME can deliver a stale client value when revisiting a scrolled field.
  tester
      .state<EditableTextState>(editable)
      .updateEditingValue(
        TextEditingValue(
          text: value,
          selection: TextSelection.collapsed(offset: value.length),
        ),
      );
  await tester.pumpAndSettle();
}

Future<void> financialJourney(WidgetTester tester) async {
  final session = PrototypeSession();
  await tester.pumpWidget(SalapiyaApp(session: session));
  await tester.pumpAndSettle();
  await tester.tap(find.byTooltip('Quick actions'));
  await tester.pumpAndSettle();
  await financialTap(tester, find.text('Add expense').last);
  expect(find.byType(FinancialEditor), findsOneWidget);
  await financialEnter(tester, 'field-name', 'Demo lunch');
  await financialEnter(tester, 'field-amount', '185.501');
  FocusManager.instance.primaryFocus?.unfocus();
  await financialTap(tester, find.byKey(const ValueKey('review-action')));
  expect(find.textContaining('at most two decimals'), findsOneWidget);
  await tester.ensureVisible(find.byKey(const ValueKey('field-amount')));
  await financialEnter(tester, 'field-amount', '185.50');
  await tester.pumpAndSettle();
  FocusManager.instance.primaryFocus?.unfocus();
  expect(
    tester
        .widget<TextField>(find.byKey(const ValueKey('field-amount')))
        .controller!
        .text,
    '185.50',
  );
  await financialTap(tester, find.byKey(const ValueKey('review-action')));
  expect(
    find.text('Edit details'),
    findsOneWidget,
    reason: tester
        .widgetList<FinanceNotice>(find.byType(FinanceNotice))
        .map((n) => n.text)
        .join('\n'),
  );
  await financialTap(tester, find.text('Edit details'));
  expect(
    tester
        .widget<TextField>(find.byKey(const ValueKey('field-name')))
        .controller!
        .text,
    'Demo lunch',
  );
  await financialTap(tester, find.byKey(const ValueKey('review-action')));
  await financialTap(tester, find.byKey(const ValueKey('simulate-action')));
  expect(find.text('Demo action complete'), findsOneWidget);
  await financialTap(tester, find.text('Done'));
  expect(session.finance.liquid, BigInt.from(2911525));
  await financialTap(tester, find.byKey(const ValueKey('nav-money')));
  expect(find.text('Money'), findsWidgets);
  await financialTap(tester, find.text('Cards').first);
  expect(find.text('EVERYDAY CREDIT'), findsOneWidget);
  await financialTap(tester, find.text('Record card purchase'));
  await financialTap(tester, find.byKey(const ValueKey('review-action')));
  await financialTap(tester, find.byKey(const ValueKey('simulate-action')));
  await financialTap(tester, find.text('Done'));
  expect(session.finance.cardBalance, BigInt.from(600000));
  await financialTap(tester, find.byKey(const ValueKey('nav-debts')));
  expect(find.text('One step closer.'), findsOneWidget);
  await financialTap(tester, find.text('Add existing debt'));
  await financialTap(tester, find.byKey(const ValueKey('review-action')));
  await financialTap(tester, find.byKey(const ValueKey('simulate-action')));
  await financialTap(tester, find.text('Done'));
  expect(session.finance.debts.length, 2);
  await financialTap(tester, find.byKey(const ValueKey('nav-shared')));
  await financialTap(tester, find.text('Add shared expense'));
  await financialTap(tester, find.byKey(const ValueKey('review-action')));
  expect(find.textContaining('paid ₱1,200.00'), findsOneWidget);
  await financialTap(tester, find.byKey(const ValueKey('simulate-action')));
  await financialTap(tester, find.text('Done'));
  expect(session.finance.bills.length, 2);
  await financialTap(tester, find.byKey(const ValueKey('nav-money')));
  await financialTap(tester, find.text('Import').first);
  await financialTap(tester, find.text('Market groceries'));
  await financialTap(tester, find.text('Review selected records'));
  await financialTap(tester, find.text('Simulate import'));
  expect(find.textContaining('2 accepted demo rows'), findsOneWidget);
  expect(session.finance.liquid, BigInt.from(3155025));
  expect(tester.takeException(), isNull);
  await tester.pumpWidget(const SizedBox.shrink());
  await tester.pumpAndSettle();
  session.dispose();
}
