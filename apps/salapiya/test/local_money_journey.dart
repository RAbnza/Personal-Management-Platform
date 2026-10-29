import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/app.dart';
import 'package:salapiya/features/finance/presentation/financial_widgets.dart';
import 'package:salapiya/local/local_runtime.dart';
import 'package:salapiya/local/local_profiles.dart';
import 'package:salapiya/gallery/settings.dart';

/// Follow the approved task group's visible action or its real More menu.
/// This never invokes a controller or bypasses review/confirmation.
Future<void> localAction(WidgetTester tester, String label) async {
  final target = find.text(label);
  if (target.evaluate().isEmpty) {
    final groups = find.byWidgetPredicate(
      (widget) =>
          widget is WorkspaceActionGroup &&
          widget.actions.values.contains(label),
    );
    if (groups.evaluate().isNotEmpty) {
      await localTap(
        tester,
        find.descendant(
          of: groups.first,
          matching: find.byWidgetPredicate(
            (widget) => widget is PopupMenuButton<String>,
          ),
        ),
      );
    } else {
      await localTap(tester, find.byTooltip('Quick actions'));
    }
  }
  await localTap(tester, target.first);
}

Future<void> localSettle(WidgetTester tester) async {
  bool loading() =>
      tester
          .widgetList<CircularProgressIndicator>(
            find.byType(CircularProgressIndicator),
          )
          .any((w) => w.value == null) ||
      tester
          .widgetList<LinearProgressIndicator>(
            find.byType(LinearProgressIndicator),
          )
          .any((w) => w.value == null);
  await tester.pump();
  await tester.runAsync(
    () => Future<void>.delayed(const Duration(milliseconds: 80)),
  );
  for (var i = 0; i < 300 && loading(); i++) {
    await tester.pump(const Duration(milliseconds: 50));
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 40)),
    );
  }
  await tester.pumpAndSettle(
    const Duration(milliseconds: 30),
    EnginePhase.sendSemanticsUpdate,
    const Duration(seconds: 15),
  );
}

Future<void> localWait(WidgetTester tester, bool Function() ready) async {
  for (var i = 0; i < 200 && !ready(); i++) {
    await tester.pump(const Duration(milliseconds: 20));
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 40)),
    );
  }
  expect(ready(), isTrue, reason: 'Local operation did not complete');
  await localSettle(tester);
}

Future<void> localTap(WidgetTester tester, Finder finder) async {
  expect(finder, findsWidgets);
  if (tester
      .widgetList<EditableText>(find.byType(EditableText))
      .any((field) => field.focusNode.hasFocus)) {
    FocusManager.instance.primaryFocus?.unfocus();
    // The real Android IME closes asynchronously outside Flutter's frame clock.
    // Scroll/tap only after its viewport transition, rather than tapping behind it.
    if (Platform.isAndroid) {
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 300)),
      );
    }
    await localSettle(tester);
  }
  await tester.ensureVisible(finder.first);
  await tester.pumpAndSettle();
  await tester.runAsync(() => tester.tap(finder.first));
  await localSettle(tester);
}

Future<void> localEnter(WidgetTester tester, String key, String value) async {
  final finder = find.byKey(ValueKey('field-$key'));
  await tester.ensureVisible(finder);
  await tester.pumpAndSettle();
  final editable = find.descendant(
    of: finder,
    matching: find.byType(EditableText),
  );
  await tester.runAsync(() async {
    tester
        .state<EditableTextState>(editable)
        .updateEditingValue(
          TextEditingValue(
            text: value,
            selection: TextSelection.collapsed(offset: value.length),
          ),
        );
  });
  await localSettle(tester);
}

Future<void> localConfirm(WidgetTester tester) async {
  FocusManager.instance.primaryFocus?.unfocus();
  await localTap(tester, find.byKey(const ValueKey('review-action')));
  expect(
    find.text('Confirm & save'),
    findsOneWidget,
    reason: tester
        .widgetList<FinanceNotice>(find.byType(FinanceNotice))
        .map((n) => n.text)
        .join('\n'),
  );
  expect(find.text('Demo result scenario'), findsNothing);
  await localTap(tester, find.text('Confirm & save'));
  await localWait(
    tester,
    () => find.text('Saved on this device').evaluate().isNotEmpty,
  );
  await localTap(tester, find.text('Done'));
}

// Shared real persistence/widget journey, executed on Windows and Android too.
Future<void> localMoneyJourney(
  WidgetTester tester,
  LocalProfiles profiles,
) async {
  final settings = GallerySettings();
  var runtime = LocalRuntime(profiles, settings);
  await tester.runAsync(runtime.reopen);
  await tester.pumpWidget(
    SalapiyaApp(production: true, settings: settings, localRuntime: runtime),
  );
  await localSettle(tester);
  expect(find.text('Continue with Google'), findsOneWidget);
  await localTap(tester, find.text('Create a local offline profile'));
  await tester.enterText(find.byType(TextField), 'Everyday owner');
  await localTap(tester, find.text('Create local profile'));
  await localWait(tester, () => runtime.session != null);
  expect(find.textContaining('Tala reported'), findsNothing);
  expect(find.textContaining('DEMO ·'), findsNothing);
  await localTap(tester, find.byKey(const ValueKey('nav-money')));
  await localTap(tester, find.text('Add account'));
  await localEnter(tester, 'name', 'Cash wallet');
  await localEnter(tester, 'amount', '1250.00');
  await localEnter(tester, 'cutoff', '2026-10-14');
  await localConfirm(tester);
  final cash = runtime.session!.finance.accounts.single.id;
  await localTap(tester, find.text('Add account'));
  await localEnter(tester, 'name', 'Bank');
  await localEnter(tester, 'amount', '1000.00');
  await localEnter(tester, 'cutoff', '2026-10-14');
  await localConfirm(tester);
  await localTap(tester, find.text('Categories & splits'));
  await localTap(tester, find.text('Create category'));
  await localEnter(tester, 'name', 'Everyday extras');
  await localConfirm(tester);
  expect(find.text('Everyday extras'), findsOneWidget);
  await localTap(tester, find.byType(BackButton));
  await localTap(tester, find.text('Add expense'));
  await localEnter(tester, 'name', 'Lunch');
  await localEnter(tester, 'amount', '185.501');
  await localEnter(tester, 'date', '2026-10-21');
  FocusManager.instance.primaryFocus?.unfocus();
  await localTap(tester, find.byKey(const ValueKey('review-action')));
  expect(find.textContaining('at most two decimals'), findsOneWidget);
  await localEnter(tester, 'amount', '185.50');
  await localTap(tester, find.text('Split across categories'));
  await localEnter(tester, 'splitAmount', '150.00');
  // Navigation retains an encrypted unposted draft, then the same editor restores it.
  await localTap(tester, find.byType(BackButton));
  await localTap(tester, find.text('Save draft & leave'));
  await localTap(tester, find.text('Add expense'));
  await localWait(
    tester,
    () => find.textContaining('Restored encrypted draft').evaluate().isNotEmpty,
  );
  expect(
    tester
        .widget<TextField>(find.byKey(const ValueKey('field-amount')))
        .controller!
        .text,
    '185.50',
  );
  await localConfirm(tester);
  expect(runtime.session!.finance.account(cash).balance, BigInt.from(106450));
  await localTap(tester, find.text('Record income'));
  await localEnter(tester, 'name', 'Gift');
  await localEnter(tester, 'amount', '100.01');
  await localEnter(tester, 'date', '2026-10-21');
  await localConfirm(tester);
  await localTap(tester, find.text('Transfer').first);
  await localEnter(tester, 'amount', '100.00');
  await localEnter(tester, 'fee', '10.00');
  await localTap(tester, find.text('Add transfer fee'));
  await localEnter(tester, 'fee', '9.99');
  await localEnter(tester, 'extraFee1Amount', '0.01');
  await localEnter(tester, 'date', '2026-10-21');
  await localConfirm(tester);
  expect(runtime.session!.finance.account(cash).balance, BigInt.from(105451));
  expect(runtime.session!.finance.liquid, BigInt.from(215451));
  await localTap(tester, find.text('Activity').first);
  await localTap(tester, find.text('Lunch'));
  await localTap(tester, find.text('Correct transaction'));
  await localEnter(tester, 'amount', '180.50');
  await localEnter(tester, 'reason', 'Correct receipt');
  await localConfirm(tester);
  // Original detail remains source-linked; return to refreshed activity list.
  final correctedId = runtime.session!.localFinance.snapshot.current
      .firstWhere((r) => r.kind == 'expense')
      .id;
  await localTap(tester, find.byKey(ValueKey('evidence-$correctedId')));
  await localTap(tester, find.text('Record refund'));
  await localEnter(tester, 'amount', '5.00');
  await localTap(tester, find.text('Allocate refund across original portions'));
  await localEnter(tester, 'refundFirstAmount', '3.00');
  await localEnter(tester, 'refund1Amount', '2.00');
  await localTap(tester, find.byKey(const ValueKey('select-refund1Posting')));
  await localTap(tester, find.textContaining('Transport ·').last);
  await localEnter(tester, 'date', '2026-10-21');
  await localEnter(tester, 'reason', 'Partial returned purchase');
  await localConfirm(tester);
  final refundId = runtime.session!.localFinance.snapshot.current
      .firstWhere((r) => r.kind == 'refund')
      .id;
  await localTap(tester, find.byKey(ValueKey('evidence-$refundId')));
  await localTap(tester, find.text('Reverse transaction'));
  await localEnter(tester, 'reason', 'Refund was recorded in error');
  await localConfirm(tester);
  await localTap(tester, find.byType(BackButton)); // current expense detail
  await localTap(tester, find.byType(BackButton)); // original expense detail
  await localTap(tester, find.byType(BackButton));
  expect(runtime.session!.finance.account(cash).balance, BigInt.from(105951));
  await localTap(tester, find.text('Accounts').first);
  await localTap(tester, find.text('Cash wallet').first);
  await localTap(tester, find.text('Reconcile account'));
  await localEnter(tester, 'amount', '1050.00');
  await localEnter(tester, 'date', '2026-10-21');
  await localConfirm(tester);
  await localTap(tester, find.text('Reconciliation · Cash wallet'));
  await localTap(tester, find.text('Review explicit adjustment'));
  await localEnter(tester, 'reason', 'Counted wallet');
  await localConfirm(tester);
  await localTap(tester, find.byType(BackButton));
  expect(runtime.session!.finance.account(cash).balance, BigInt.from(105000));
  await localTap(tester, find.text('Record adjustment'));
  await localEnter(tester, 'amount', '-0.01');
  await localEnter(tester, 'date', '2026-10-21');
  await localEnter(tester, 'reason', 'One cent cash evidence');
  await localConfirm(tester);
  final manual = runtime.session!.localFinance.snapshot.current.firstWhere(
    (r) => r.kind == 'adjustment' && r.values['mode'] == 'manual',
  );
  await localTap(tester, find.byKey(ValueKey('record-${manual.id}')));
  await localTap(tester, find.text('Reverse transaction'));
  await localEnter(tester, 'reason', 'Void adjustment evidence');
  await localConfirm(tester);
  await localTap(tester, find.byType(BackButton));
  expect(runtime.session!.finance.account(cash).balance, BigInt.from(105000));
  settings.change(() {
    settings.themeMode = ThemeMode.dark;
    settings.reduceMotion = true;
  });
  await tester.runAsync(runtime.flushPreferences);
  final owner = runtime.session!.profile.profileId;
  final commands = runtime.session!.finance.version;
  await tester.pumpWidget(const SizedBox.shrink());
  await localSettle(tester);
  await tester.runAsync(runtime.close);
  runtime.dispose();
  runtime = LocalRuntime(profiles, settings);
  await tester.runAsync(runtime.reopen);
  expect(runtime.session!.profile.profileId, owner);
  expect(runtime.session!.profile.name, 'Everyday owner');
  expect(runtime.session!.finance.version, commands);
  expect(runtime.session!.finance.account(cash).balance, BigInt.from(105000));
  expect(settings.themeMode, ThemeMode.dark);
  expect(settings.reduceMotion, isTrue);
  await tester.pumpWidget(
    SalapiyaApp(production: true, settings: settings, localRuntime: runtime),
  );
  await localSettle(tester);
  expect(find.text('Your day, in balance.'), findsOneWidget);
  expect(find.text('Create a local offline profile'), findsNothing);
  await localTap(tester, find.byKey(const ValueKey('nav-debts')));
  expect(find.text('A clear view of what you owe'), findsOneWidget);
  expect(find.text('Home essentials loan'), findsNothing);
  expect(tester.takeException(), isNull);
  await tester.pumpWidget(const SizedBox.shrink());
  await localSettle(tester);
  await tester.runAsync(runtime.close);
  runtime.dispose();
  settings.dispose();
}
