import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/design_system/theme.dart';
import 'package:salapiya/features/finance/presentation/financial_widgets.dart';
import 'package:salapiya/finance/debt_screen.dart';
import 'package:salapiya/finance/finance_screen.dart';
import 'package:salapiya/local/finance_domain.dart';
import 'package:salapiya/local/local_finance_controller.dart';

import 'local_money_journey.dart' show localSettle, localTap;
import 'local_test_support.dart';
import 'p1_widgets_test.dart' show closeWithWidgetClock;

String _offset(int days) =>
    DateTime.parse('${civilToday()}T00:00:00Z')
        .add(Duration(days: days))
        .toIso8601String()
        .substring(0, 10);

Future<(LocalFixture, LocalFinancialController, Map<String, String>)> _open(
  WidgetTester tester,
) async {
  final f = (await tester.runAsync(LocalFixture.open))!;
  late LocalFinancialController controller;
  final ids = <String, String>{};
  await tester.runAsync(() async {
    Future<void> debt(String name, int? firstDue, [String extra = '']) async {
      final id = ids[name] = await f.post('debtImport', {
        'name': name,
        'lender': '$name lender',
        'debtType': 'installment_loan',
        'amount': '1000.00',
        'principal': '',
      });
      if (firstDue == null) return;
      await f.post('debtSchedule', {
        'name': '$name schedule',
        'debt': id,
        'schedule':
            'one,${_offset(firstDue)},500.00\ntwo,${_offset(firstDue + 30)},500.00',
        'verified': 'true',
        'reference': 'letter',
        if (extra.isNotEmpty) ...{
          'frequency': 'monthly',
          'firstDue': _offset(firstDue),
          'installmentAmount': '500.00',
        },
      });
    }

    await debt('Unscheduled loan', null);
    await debt('Later loan', 30);
    await debt('Overdue loan', -5, 'cadence');
    await debt('Soon loan', 3);
    await debt('Today loan', 0);
    controller = LocalFinancialController(f.store, await f.store.snapshot());
  });
  return (f, controller, ids);
}

Widget _app(Widget child) => MaterialApp(
  theme: SalapiyaTheme.build(Brightness.light),
  home: FinancialEnvironment(production: true, child: child),
);

void main() {
  testWidgets(
    'debts are ordered by urgency with text status and no invented date',
    (tester) async {
      tester.view.physicalSize = const Size(1000, 6000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final (f, controller, _) = await _open(tester);
      try {
        await tester.pumpWidget(
          _app(
            Scaffold(
              body: SingleChildScrollView(
                child: NativeDebtsScreen(controller: controller),
              ),
            ),
          ),
        );
        await localSettle(tester);
        double top(String title) =>
            tester.getTopLeft(find.text(title).first).dy;
        final order = [
          'Overdue loan',
          'Today loan',
          'Soon loan',
          'Later loan',
          'Unscheduled loan',
        ];
        for (var i = 0; i + 1 < order.length; i++) {
          expect(top(order[i]), lessThan(top(order[i + 1])), reason: order[i]);
        }
        expect(find.text('Overdue'), findsWidgets);
        expect(find.text('Due today'), findsOneWidget);
        expect(find.text('Due soon'), findsOneWidget);
        expect(find.text('Upcoming'), findsNWidgets(2)); // filter tab + badge
        expect(find.text('Schedule not set'), findsNWidgets(2));
        expect(find.textContaining('5 days overdue'), findsOneWidget);
        expect(find.textContaining('Next due ${_offset(-5)}'), findsOneWidget);
        expect(find.text('Monthly'), findsOneWidget);
        expect(find.text('Scheduled installment'), findsOneWidget);
        expect(find.text('Set schedule'), findsOneWidget);

        await localTap(tester, find.widgetWithText(TextButton, 'Overdue'));
        expect(find.text('Due today'), findsNothing);
        expect(find.text('Schedule not set'), findsNothing);
        expect(find.text('Overdue'), findsWidgets);
        await localTap(tester, find.widgetWithText(TextButton, 'Unscheduled'));
        expect(find.text('Schedule not set'), findsNWidgets(2));
        expect(find.text('Due soon'), findsNothing);
        expect(tester.takeException(), isNull);
      } finally {
        await tester.pumpWidget(const SizedBox.shrink());
        controller.dispose();
        await closeWithWidgetClock(tester, f.close);
      }
    },
  );

  testWidgets(
    'detail separates next installment from final scheduled installment',
    (tester) async {
      tester.view.physicalSize = const Size(1000, 4000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final (f, controller, ids) = await _open(tester);
      try {
        await tester.pumpWidget(
          _app(
            NativeDebtDetail(
              controller: controller,
              debtId: ids['Overdue loan']!,
            ),
          ),
        );
        await localSettle(tester);
        expect(find.text('Edit schedule'), findsOneWidget);
        expect(find.text('Next installment'), findsOneWidget);
        expect(find.text('Final scheduled installment'), findsOneWidget);
        expect(find.text(_offset(25)), findsWidgets);
        expect(find.text('Monthly'), findsOneWidget);

        await tester.pumpWidget(
          _app(
            NativeDebtDetail(
              controller: controller,
              debtId: ids['Unscheduled loan']!,
            ),
          ),
        );
        await localSettle(tester);
        expect(find.text('Schedule not set'), findsWidgets);
        expect(find.text('Set schedule'), findsOneWidget);
        expect(find.text('Final scheduled installment'), findsNothing);
        expect(tester.takeException(), isNull);
      } finally {
        await tester.pumpWidget(const SizedBox.shrink());
        controller.dispose();
        await closeWithWidgetClock(tester, f.close);
      }
    },
  );

  Future<void> choose(WidgetTester tester, String label) async {
    await localTap(
      tester,
      find.byKey(const ValueKey('native-select-frequency')),
    );
    await localTap(tester, find.text(label).last);
  }

  Future<void> chooseSplit(WidgetTester tester, String label) async {
    await localTap(
      tester,
      find.byKey(const ValueKey('native-select-splitMode')),
    );
    await localTap(tester, find.text(label).last);
  }

  Future<void> enter(WidgetTester tester, String key, String value) async {
    await tester.ensureVisible(find.byKey(ValueKey('native-$key')));
    await tester.enterText(find.byKey(ValueKey('native-$key')), value);
    await tester.pumpAndSettle();
  }

  /// Dismiss the error popup, after checking its text.
  Future<void> dismissProblem(WidgetTester tester, String contains) async {
    expect(find.text('Please check the form'), findsOneWidget);
    expect(
      find.descendant(
        of: find.byType(AlertDialog),
        matching: find.textContaining(contains),
      ),
      findsOneWidget,
    );
    await localTap(tester, find.text('OK'));
    expect(find.byType(AlertDialog), findsNothing);
  }

  bool splitEnabled(WidgetTester tester) =>
      tester
          .widget<DropdownButtonFormField<String>>(
            find.byKey(const ValueKey('native-select-splitMode')),
          )
          .onChanged !=
      null;

  Widget editor(
    LocalFinancialController controller,
    String operation,
    String title, {
    Map<String, String> initial = const {},
  }) => _app(
    NativeFinanceEditor(
      controller: controller,
      operation: operation,
      title: title,
      initial: initial,
    ),
  );

  testWidgets('a new schedule divides the debt itself and guides each step', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1000, 4000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final (f, controller, ids) = await _open(tester);
    try {
      await tester.pumpWidget(
        editor(
          controller,
          'debtSchedule',
          'Set schedule',
          initial: {'debt': ids['Unscheduled loan']!},
        ),
      );
      await localSettle(tester);
      for (final hidden in [
        'schedule',
        'reference',
        'name',
        'verified',
        'installmentAmount',
        'totalAmount',
      ]) {
        expect(find.byKey(ValueKey('native-$hidden')), findsNothing);
      }
      expect(
        find.byKey(const ValueKey('native-select-splitMode')),
        findsNothing,
      );
      await choose(tester, 'Monthly');
      expect(find.text('Same amount each time'), findsNothing);
      expect(splitEnabled(tester), isFalse, reason: 'needs a payment count');
      expect(
        find.text('Enter how many payments are left first.'),
        findsOneWidget,
      );

      await localTap(tester, find.widgetWithText(FilledButton, 'Review'));
      await dismissProblem(tester, 'Enter the date of your next payment.');
      expect(
        find.text('Enter the date of your next payment.'),
        findsOneWidget,
        reason: 'the date field is marked',
      );

      await enter(tester, 'firstDue', '2026-11-30');
      expect(
        find.text('Enter the date of your next payment.'),
        findsNothing,
        reason: 'editing the field clears its mark',
      );
      await enter(tester, 'installmentCount', '3');
      expect(splitEnabled(tester), isTrue);
      expect(
        find.text(
          'Your debt of 1000.00 PHP will be paid in 3 payments of 333.33 PHP, with the last payment 333.34 PHP so the total is exact.',
        ),
        findsOneWidget,
      );

      await choose(tester, 'Custom');
      await enter(tester, 'intervalDays', '0');
      await localTap(tester, find.widgetWithText(FilledButton, 'Review'));
      await dismissProblem(tester, '1 to 3660');
      expect(find.textContaining('1 to 3660'), findsOneWidget);
      expect(
        tester
            .widget<TextField>(find.byKey(const ValueKey('native-firstDue')))
            .controller!
            .text,
        '2026-11-30',
        reason: 'entered values survive a failed validation',
      );

      await enter(tester, 'intervalDays', '10');
      await localTap(tester, find.widgetWithText(FilledButton, 'Review'));
      expect(
        find.textContaining(
          '3 payments totaling 1000.00 PHP (333.33 to 333.34 each)',
        ),
        findsOneWidget,
      );
      await localTap(tester, find.text('Save reviewed values'));
      expect(find.text('Set schedule saved'), findsOneWidget);

      final saved = controller.snapshot.current.firstWhere(
        (r) =>
            financeType(r) == 'debtSchedule' &&
            r.values['debt'] == ids['Unscheduled loan'],
      );
      expect(
        saved.values['schedule'],
        'Installment 1,2026-11-30,333.33\n'
        'Installment 2,2026-12-10,333.33\n'
        'Installment 3,2026-12-20,333.34',
      );
      expect(saved.values['frequency'], 'custom');
      expect(saved.values['intervalDays'], '10');
      expect(saved.values['splitMode'], 'divide');
      expect(saved.values['installmentAmount'], '333.33');
      expect(saved.values['verified'], 'true');
      expect(saved.values.containsKey('installmentCount'), isFalse);
      expect(tester.takeException(), isNull);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      controller.dispose();
      await closeWithWidgetClock(tester, f.close);
    }
  });

  testWidgets('dividing evenly uses what is still owed after payments', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1000, 4000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final f = (await tester.runAsync(LocalFixture.open))!;
    late LocalFinancialController controller;
    late String debt;
    await tester.runAsync(() async {
      final account = await f.account('Wallet', '5000.00');
      debt = await f.post('debtImport', {
        'name': 'Part paid loan',
        'lender': 'Synthetic lender',
        'debtType': 'installment_loan',
        'amount': '1000.00',
        'principal': '',
      });
      await f.post('debtPayment', {
        'name': 'Earlier payment',
        'debt': debt,
        'account': account,
        'amount': '400.00',
        'externalFee': '0.00',
        'reduction': '400.00',
        'interest': '0.00',
        'fee': '0.00',
        'clearing': '0.00',
        'certainty': 'confirmed_total',
        'allocations': '',
        'unapplied': '400.00',
      });
      controller = LocalFinancialController(f.store, await f.store.snapshot());
    });
    try {
      await tester.pumpWidget(
        editor(
          controller,
          'debtSchedule',
          'Set schedule',
          initial: {'debt': debt},
        ),
      );
      await localSettle(tester);
      await choose(tester, 'Weekly');
      await enter(tester, 'firstDue', '2026-11-30');
      await enter(tester, 'installmentCount', '3');
      expect(
        find.text(
          'Your debt of 600.00 PHP will be paid in 3 equal payments of 200.00 PHP.',
        ),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      controller.dispose();
      await closeWithWidgetClock(tester, f.close);
    }
  });

  testWidgets(
    'add existing debt can set its payment schedule in the same form',
    (tester) async {
      tester.view.physicalSize = const Size(1000, 5000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final (f, controller, _) = await _open(tester);
      try {
        await tester.pumpWidget(
          editor(controller, 'debtImport', 'Add existing debt'),
        );
        await localSettle(tester);
        expect(find.byKey(const ValueKey('native-firstDue')), findsNothing);
        await enter(tester, 'name', 'Motorcycle loan');
        await enter(tester, 'lender', 'Synthetic lender');
        await choose(tester, 'Monthly');
        await enter(tester, 'firstDue', '2026-01-31');
        await enter(tester, 'installmentCount', '3');
        expect(
          find.text('Enter the debt amount above first.'),
          findsOneWidget,
          reason: 'the split depends on the debt amount',
        );
        await enter(tester, 'amount', '6000.00');
        await tester.pump();
        expect(
          find.text(
            'Your debt of 6000.00 PHP will be paid in 3 equal payments of 2000.00 PHP.',
          ),
          findsOneWidget,
        );
        await localTap(tester, find.widgetWithText(FilledButton, 'Review'));
        expect(
          find.textContaining('3 payments of 2000.00 PHP'),
          findsOneWidget,
        );
        await localTap(tester, find.text('Save reviewed values'));
        expect(find.text('Add existing debt saved'), findsOneWidget);
        expect(find.text('Schedule saved'), findsOneWidget);

        final s = controller.snapshot;
        final debt = s.current.firstWhere((r) => r.title == 'Motorcycle loan');
        expect(debt.values.containsKey('frequency'), isFalse);
        expect(debt.values.containsKey('installmentCount'), isFalse);
        final schedule = s.current.firstWhere(
          (r) =>
              financeType(r) == 'debtSchedule' &&
              r.values['debt'] == debt.actionId,
        );
        expect(
          schedule.values['schedule'],
          'Installment 1,2026-01-31,2000.00\n'
          'Installment 2,2026-02-28,2000.00\n'
          'Installment 3,2026-03-31,2000.00',
        );
        expect(schedule.values['splitMode'], 'divide');
        expect(schedule.values['installmentAmount'], '2000.00');
        expect(
          debtDueSummary(s, debt, '2026-01-20').status,
          DebtDueStatus.upcoming,
        );
        expect(tester.takeException(), isNull);
      } finally {
        await tester.pumpWidget(const SizedBox.shrink());
        controller.dispose();
        await closeWithWidgetClock(tester, f.close);
      }
    },
  );

  testWidgets('add existing debt still works without a schedule', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1000, 5000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final (f, controller, _) = await _open(tester);
    try {
      await tester.pumpWidget(
        editor(controller, 'debtImport', 'Add existing debt'),
      );
      await localSettle(tester);
      await enter(tester, 'name', 'Plain loan');
      await enter(tester, 'lender', 'Synthetic lender');
      await enter(tester, 'amount', '100.00');
      await localTap(tester, find.widgetWithText(FilledButton, 'Review'));
      await localTap(tester, find.text('Save reviewed values'));
      expect(find.text('Add existing debt saved'), findsOneWidget);
      expect(find.text('Schedule saved'), findsNothing);
      final debt = controller.snapshot.current.firstWhere(
        (r) => r.title == 'Plain loan',
      );
      expect(
        debtDueSummary(controller.snapshot, debt, civilToday()).status,
        DebtDueStatus.scheduleNotSet,
      );
      expect(tester.takeException(), isNull);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      controller.dispose();
      await closeWithWidgetClock(tester, f.close);
    }
  });

  testWidgets('a missing debt amount opens a popup and marks that field red', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1000, 5000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final (f, controller, _) = await _open(tester);
    try {
      await tester.pumpWidget(
        editor(controller, 'debtImport', 'Add existing debt'),
      );
      await localSettle(tester);
      await enter(tester, 'name', 'Forgot the amount');
      await enter(tester, 'lender', 'Synthetic lender');
      await localTap(tester, find.widgetWithText(FilledButton, 'Review'));
      await dismissProblem(tester, 'This amount is required.');
      expect(find.text('Could not save'), findsNothing);
      expect(find.text('This amount is required.'), findsOneWidget);
      final decoration = tester
          .widget<TextField>(find.byKey(const ValueKey('native-amount')))
          .decoration!;
      expect(decoration.errorText, 'This amount is required.');
      expect(
        tester
            .widget<TextField>(find.byKey(const ValueKey('native-name')))
            .decoration!
            .errorText,
        isNull,
      );

      await enter(tester, 'amount', '100.00');
      expect(find.text('This amount is required.'), findsNothing);
      await localTap(tester, find.widgetWithText(FilledButton, 'Review'));
      expect(find.text('Save reviewed values'), findsOneWidget);
      expect(tester.takeException(), isNull);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      controller.dispose();
      await closeWithWidgetClock(tester, f.close);
    }
  });

  testWidgets('different amounts must add up to the whole debt', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1000, 6000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final (f, controller, _) = await _open(tester);
    try {
      await tester.pumpWidget(
        editor(controller, 'debtImport', 'Add existing debt'),
      );
      await localSettle(tester);
      await enter(tester, 'name', 'Tuition loan');
      await enter(tester, 'lender', 'Synthetic lender');
      await enter(tester, 'amount', '3000.00');
      await choose(tester, 'Monthly');
      await enter(tester, 'firstDue', '2026-01-31');
      expect(splitEnabled(tester), isFalse);
      await enter(tester, 'installmentCount', '3');
      await chooseSplit(tester, 'Different amount each time');
      expect(find.byKey(const ValueKey('native-payment-2')), findsOneWidget);
      expect(find.textContaining('Payment 2 · due 2026-02-28'), findsOneWidget);
      expect(
        find.textContaining('add up to the whole debt of 3000.00 PHP'),
        findsOneWidget,
      );

      await enter(tester, 'payment-0', '2000.00');
      await enter(tester, 'payment-1', '400.00');
      await localTap(tester, find.widgetWithText(FilledButton, 'Review'));
      await dismissProblem(tester, 'Enter the amount for payment 3');
      expect(
        tester
            .widget<TextField>(find.byKey(const ValueKey('native-payment-2')))
            .decoration!
            .errorText,
        contains('payment 3'),
      );

      await enter(tester, 'payment-2', '500.00');
      expect(
        find.textContaining('3 of 3 amounts entered · total 2900.00 PHP'),
        findsOneWidget,
      );
      expect(find.textContaining('100.00 PHP still to assign'), findsOneWidget);
      await localTap(tester, find.widgetWithText(FilledButton, 'Review'));
      await dismissProblem(
        tester,
        'add up to 2900.00 PHP, but the debt is 3000.00 PHP',
      );
      expect(
        find.textContaining('The payments must add up to the debt exactly.'),
        findsOneWidget,
        reason: 'the total line is marked',
      );

      await enter(tester, 'payment-1', '500.00');
      expect(find.textContaining('adds up to the debt'), findsOneWidget);
      await localTap(tester, find.widgetWithText(FilledButton, 'Review'));
      expect(
        find.textContaining(
          '3 payments totaling 3000.00 PHP (500.00 to 2000.00 each)',
        ),
        findsOneWidget,
      );
      await localTap(tester, find.text('Save reviewed values'));
      expect(find.text('Schedule saved'), findsOneWidget);

      final s = controller.snapshot;
      final debt = s.current.firstWhere((r) => r.title == 'Tuition loan');
      final schedule = s.current.firstWhere(
        (r) =>
            financeType(r) == 'debtSchedule' &&
            r.values['debt'] == debt.actionId,
      );
      expect(
        schedule.values['schedule'],
        'Installment 1,2026-01-31,2000.00\n'
        'Installment 2,2026-02-28,500.00\n'
        'Installment 3,2026-03-31,500.00',
      );
      expect(schedule.values['splitMode'], 'varied');
      expect(schedule.values['installmentAmount'], '');
      expect(schedule.values.containsKey('paymentAmounts'), isFalse);
      expect(debt.values.containsKey('splitMode'), isFalse);
      expect(tester.takeException(), isNull);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      controller.dispose();
      await closeWithWidgetClock(tester, f.close);
    }
  });

  testWidgets('updating amounts must still add up to what is owed', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1000, 4000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final f = (await tester.runAsync(LocalFixture.open))!;
    late LocalFinancialController controller;
    late String debt, scheduleId, account;
    await tester.runAsync(() async {
      account = await f.account('Wallet', '5000.00');
      debt = await f.post('debtImport', {
        'name': 'Varied loan',
        'lender': 'Synthetic lender',
        'debtType': 'installment_loan',
        'amount': '3000.00',
        'principal': '',
      });
      scheduleId = await f.post('debtSchedule', {
        'name': 'Varied schedule',
        'debt': debt,
        'schedule':
            'Installment 1,${_offset(2)},2000.00\n'
            'Installment 2,${_offset(32)},500.00\n'
            'Installment 3,${_offset(62)},500.00',
        'verified': 'true',
        'reference': 'note',
        'frequency': 'monthly',
        'firstDue': _offset(2),
        'splitMode': 'varied',
        'installmentAmount': '',
      });
      await f.post('debtPayment', {
        'name': 'First part',
        'debt': debt,
        'account': account,
        'amount': '2000.00',
        'externalFee': '0.00',
        'reduction': '2000.00',
        'interest': '0.00',
        'fee': '0.00',
        'clearing': '0.00',
        'certainty': 'confirmed_total',
        'scheduleSource': scheduleId,
        'allocations': 'Installment 1,2000.00',
        'unapplied': '0.00',
      });
      controller = LocalFinancialController(f.store, await f.store.snapshot());
    });
    try {
      await tester.pumpWidget(
        _app(
          Scaffold(
            body: SingleChildScrollView(
              child: NativeDebtsScreen(controller: controller),
            ),
          ),
        ),
      );
      await localSettle(tester);
      // Installment 1 is paid, so the next one is 32 days out: no prompt yet.
      expect(
        find.textContaining('different amount for each payment'),
        findsNothing,
      );

      await tester.pumpWidget(
        _app(
          NativeScheduleAmounts(controller: controller, scheduleId: scheduleId),
        ),
      );
      await localSettle(tester);
      expect(find.text('Installment 1'), findsOneWidget);
      expect(find.byKey(const ValueKey('amount-0')), findsNothing);
      expect(
        find.textContaining('Still owed: 1000.00 PHP · scheduled: 1000.00 PHP'),
        findsOneWidget,
      );
      await tester.enterText(find.byKey(const ValueKey('amount-1')), '700.00');
      await tester.pump();
      await localTap(tester, find.widgetWithText(FilledButton, 'Save amounts'));
      await dismissProblem(
        tester,
        'add up to 1200.00 PHP, but you still owe 1000.00 PHP',
      );
      expect(find.text('Amounts saved'), findsNothing);

      await tester.enterText(find.byKey(const ValueKey('amount-2')), '300.00');
      await tester.pump();
      await localTap(tester, find.widgetWithText(FilledButton, 'Save amounts'));
      expect(find.text('Amounts saved'), findsOneWidget);

      final current = controller.snapshot.current.firstWhere(
        (r) => financeType(r) == 'debtSchedule',
      );
      expect(current.number, 2);
      expect(
        current.values['schedule'],
        'Installment 1,${_offset(2)},2000.00\n'
        'Installment 2,${_offset(32)},700.00\n'
        'Installment 3,${_offset(62)},300.00',
      );
      expect(current.values['splitMode'], 'varied');
      expect(
        financeBalance(controller.snapshot, 'debt_liability', 'debt', debt),
        BigInt.from(-100000),
      );
      expect(tester.takeException(), isNull);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      controller.dispose();
      await closeWithWidgetClock(tester, f.close);
    }
  });

  testWidgets(
    'the next varying payment prompts for confirmation once it is due soon',
    (tester) async {
      tester.view.physicalSize = const Size(1000, 4000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final f = (await tester.runAsync(LocalFixture.open))!;
      late LocalFinancialController controller;
      await tester.runAsync(() async {
        final debt = await f.post('debtImport', {
          'name': 'Soon varied loan',
          'lender': 'Synthetic lender',
          'debtType': 'installment_loan',
          'amount': '1000.00',
          'principal': '',
        });
        await f.post('debtSchedule', {
          'name': 'Soon schedule',
          'debt': debt,
          'schedule':
              'Installment 1,${_offset(3)},600.00\nInstallment 2,${_offset(33)},400.00',
          'verified': 'true',
          'reference': 'note',
          'frequency': 'monthly',
          'firstDue': _offset(3),
          'splitMode': 'varied',
          'installmentAmount': '',
        });
        controller = LocalFinancialController(
          f.store,
          await f.store.snapshot(),
        );
      });
      try {
        await tester.pumpWidget(
          _app(
            Scaffold(
              body: SingleChildScrollView(
                child: NativeDebtsScreen(controller: controller),
              ),
            ),
          ),
        );
        await localSettle(tester);
        expect(
          find.textContaining(
            'Check that 600.00 PHP is right for ${_offset(3)}',
          ),
          findsOneWidget,
        );
        expect(find.text('Update amounts'), findsOneWidget);
        expect(tester.takeException(), isNull);
      } finally {
        await tester.pumpWidget(const SizedBox.shrink());
        controller.dispose();
        await closeWithWidgetClock(tester, f.close);
      }
    },
  );

  testWidgets('editing a schedule preloads its saved cadence', (tester) async {
    tester.view.physicalSize = const Size(1000, 4000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final (f, controller, _) = await _open(tester);
    try {
      final schedule = controller.snapshot.current.firstWhere(
        (r) =>
            financeType(r) == 'debtSchedule' &&
            r.values['frequency'] == 'monthly',
      );
      await tester.pumpWidget(
        _app(
          NativeFinanceEditor(
            controller: controller,
            operation: 'financeCorrection',
            title: 'Edit schedule',
            replacing: schedule,
          ),
        ),
      );
      await localSettle(tester);
      expect(
        tester
            .widget<TextField>(find.byKey(const ValueKey('native-firstDue')))
            .controller!
            .text,
        _offset(-5),
      );
      expect(find.text('Monthly'), findsOneWidget);
      expect(find.byKey(const ValueKey('native-intervalDays')), findsNothing);
      expect(tester.takeException(), isNull);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      controller.dispose();
      await closeWithWidgetClock(tester, f.close);
    }
  });
}
