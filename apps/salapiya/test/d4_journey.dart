import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/app.dart';
import 'package:salapiya/prototype/scenarios.dart';
import 'package:salapiya/features/finance/presentation/financial_widgets.dart';
import 'package:salapiya/features/planning/presentation/planning_screen.dart';
import 'package:salapiya/features/planning/presentation/reports_screen.dart';
import 'package:salapiya/design_system/theme.dart';
import 'package:salapiya/features/life/presentation/life_screen.dart';
import 'package:salapiya/features/profile/presentation/profile_experience.dart';
import 'package:salapiya/gallery/settings.dart';
import 'package:salapiya/features/finance/presentation/group_lifecycle.dart';
import 'package:salapiya/features/supporting/presentation/files_screen.dart';
import 'package:salapiya/features/finance/presentation/credit_screen.dart';
import 'package:salapiya/features/finance/application/financial_controller.dart';

Future<void> d4PlanningJourney(WidgetTester tester) async {
  final s = PrototypeSession();
  Future<void> mount(Widget child) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: SalapiyaTheme.build(Brightness.light),
        home: FinancePage(title: 'D4 journey', child: child),
      ),
    );
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  }

  await mount(PlanningScreen(session: s));
  await tester.tap(find.text('New plan'));
  await tester.pumpAndSettle();
  final name = find.widgetWithText(TextField, 'Name');
  await tester.enterText(name, 'Water bill');
  final review = find.text('Review changes');
  await tester.ensureVisible(review);
  await tester.tap(review);
  await tester.pumpAndSettle();
  final apply = find.text('Apply simulation');
  await tester.ensureVisible(apply);
  await tester.tap(apply);
  await tester.pumpAndSettle();
  expect(s.planning.rules.any((r) => r.name == 'Water bill'), isTrue);
  await tester.tap(find.text('Done'));
  await tester.pumpAndSettle();
  for (final t in ['Budgets', 'Savings', 'Forecast']) {
    await tester.ensureVisible(find.text(t));
    await tester.tap(find.text(t));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  }
  await mount(ReportsScreen(session: s));
  await tester.ensureVisible(find.text('Gross spending'));
  await tester.tap(find.text('Gross spending'));
  await tester.pumpAndSettle();
  expect(tester.takeException(), isNull);
  final cashBefore = s.finance.liquid, cardBefore = s.finance.cardBalance;
  await mount(CreditScreen(session: s));
  await tester.ensureVisible(find.text('New statement'));
  await tester.tap(find.text('New statement'));
  await tester.pumpAndSettle();
  final reference = find.widgetWithText(TextField, 'Provider reference');
  await tester.ensureVisible(reference);
  tester
      .state<EditableTextState>(
        find.descendant(of: reference, matching: find.byType(EditableText)),
      )
      .updateEditingValue(const TextEditingValue(text: 'NOV-NATIVE-DEMO'));
  FocusManager.instance.primaryFocus?.unfocus();
  await tester.ensureVisible(find.text('Review changes'));
  await tester.tap(find.text('Review changes'));
  await tester.pumpAndSettle();
  await tester.ensureVisible(find.text('Apply simulation'));
  await tester.tap(find.text('Apply simulation'));
  await tester.pumpAndSettle();
  expect(s.finance.activeStatement.reference, 'NOV-NATIVE-DEMO');
  expect(s.finance.liquid, cashBefore);
  expect(s.finance.cardBalance, cardBefore);
  expect(
    s.life.agenda(s.planning, s.finance).where((e) => e.kind == 'Cards'),
    hasLength(2),
  );
  await tester.tap(find.text('Done'));
  await tester.pumpAndSettle();
  await tester.pumpWidget(SalapiyaApp(session: s));
  await tester.pumpAndSettle();
  expect(tester.takeException(), isNull);
  await tester.pumpWidget(const SizedBox());
  s.dispose();
}

Future<void> d4LifeJourney(WidgetTester tester) async {
  final s = PrototypeSession();
  await tester.pumpWidget(
    MaterialApp(
      theme: SalapiyaTheme.build(Brightness.light),
      home: FinancePage(
        title: 'Life',
        child: LifeScreen(session: s),
      ),
    ),
  );
  await tester.pumpAndSettle();
  for (final tab in ['Tasks', 'Learning', 'Books', 'Career', 'Calendar']) {
    await tester.ensureVisible(find.text(tab).first);
    await tester.tap(find.text(tab).first);
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  }
  await tester.ensureVisible(find.text('Tasks').first);
  await tester.tap(find.text('Tasks').first);
  await tester.pumpAndSettle();
  final check = find.byType(Checkbox).first;
  await tester.ensureVisible(check);
  await tester.tap(check);
  await tester.pumpAndSettle();
  expect(s.life.entries.where((e) => e.status == 'Completed').length, 1);
  expect(
    s.life.agenda(s.planning, s.finance).any((e) => e.sourceId == 'portfolio'),
    isFalse,
  );
  await tester.ensureVisible(find.text('Books').first);
  await tester.tap(find.text('Books').first);
  await tester.pumpAndSettle();
  await tester.ensureVisible(find.text('The Art of Noticing'));
  await tester.tap(find.text('The Art of Noticing'));
  await tester.pumpAndSettle();
  final log = find.text('Log progress');
  await tester.ensureVisible(log);
  await tester.tap(log);
  await tester.pumpAndSettle();
  final field = find.widgetWithText(TextField, 'Pages read');
  await tester.ensureVisible(field);
  tester
      .state<EditableTextState>(
        find.descendant(of: field, matching: find.byType(EditableText)),
      )
      .updateEditingValue(const TextEditingValue(text: '120'));
  FocusManager.instance.primaryFocus?.unfocus();
  await tester.ensureVisible(find.text('Review changes'));
  await tester.tap(find.text('Review changes'));
  await tester.pumpAndSettle();
  await tester.ensureVisible(find.text('Apply simulation'));
  await tester.tap(find.text('Apply simulation'));
  await tester.pumpAndSettle();
  expect(s.life.entries.firstWhere((e) => e.id == 'book-1').progress, 120);
  expect(tester.takeException(), isNull);
  await tester.pumpWidget(const SizedBox());
  s.dispose();
}

Future<void> d4ProfileJourney(WidgetTester tester) async {
  final s = PrototypeSession(), settings = GallerySettings();
  final old = s.finance;
  await tester.pumpWidget(
    MaterialApp(
      theme: SalapiyaTheme.build(Brightness.light),
      home: ProfileExperience(
        session: s,
        settings: settings,
        initial: 'Welcome',
      ),
    ),
  );
  await tester.pumpAndSettle();
  await tester.ensureVisible(find.text('Create a local offline profile'));
  await tester.tap(find.text('Create a local offline profile'));
  await tester.pumpAndSettle();
  final confirm = find.widgetWithText(
    TextField,
    'Type START LOCAL to activate the empty demo profile',
  );
  await tester.ensureVisible(confirm);
  tester
      .state<EditableTextState>(
        find.descendant(of: confirm, matching: find.byType(EditableText)),
      )
      .updateEditingValue(const TextEditingValue(text: 'START LOCAL'));
  FocusManager.instance.primaryFocus?.unfocus();
  await tester.ensureVisible(find.text('Review changes'));
  await tester.tap(find.text('Review changes'));
  await tester.pumpAndSettle();
  await tester.ensureVisible(find.text('Apply simulation'));
  await tester.tap(find.text('Apply simulation'));
  await tester.pumpAndSettle();
  expect(s.finance.accounts, isEmpty);
  expect(s.recoveryCopies.single.$1, same(old));
  await tester.tap(find.text('Done'));
  await tester.pumpAndSettle();
  for (final tab in [
    'Connection',
    'Devices',
    'Backup & recovery',
    'Privacy & lifecycle',
    'Help',
  ]) {
    await tester.ensureVisible(find.text(tab).first);
    await tester.tap(find.text(tab).first);
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  }
  s.recoverPreviousProfile();
  expect(s.finance, same(old));
  expect(s.finance.liquid, BigInt.from(2930075));
  await tester.pumpWidget(const SizedBox());
  s.dispose();
  settings.dispose();
}

Future<void> d4SupportingJourney(WidgetTester tester) async {
  final s = PrototypeSession();
  await tester.pumpWidget(
    MaterialApp(
      theme: SalapiyaTheme.build(Brightness.light),
      home: FinancePage(
        title: 'Group lifecycle',
        child: ListenableBuilder(
          listenable: s,
          builder: (_, _) => GroupLifecycle(session: s),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  await tester.ensureVisible(find.text('Transfer ownership'));
  await tester.tap(find.text('Transfer ownership'));
  await tester.pumpAndSettle();
  final field = find.widgetWithText(TextField, 'Reason');
  await tester.ensureVisible(field);
  tester
      .state<EditableTextState>(
        find.descendant(of: field, matching: find.byType(EditableText)),
      )
      .updateEditingValue(
        const TextEditingValue(text: 'Tala will administer the household.'),
      );
  FocusManager.instance.primaryFocus?.unfocus();
  await tester.ensureVisible(find.text('Review changes'));
  await tester.tap(find.text('Review changes'));
  await tester.pumpAndSettle();
  await tester.ensureVisible(find.text('Apply simulation'));
  await tester.tap(find.text('Apply simulation'));
  await tester.pumpAndSettle();
  expect(s.finance.groupOwners['household'], 'Tala');
  expect(s.finance.isGroupOwner, isFalse);
  await tester.tap(find.text('Done'));
  await tester.pumpAndSettle();
  await tester.pumpWidget(
    MaterialApp(
      theme: SalapiyaTheme.build(Brightness.light),
      home: FinancePage(
        title: 'Files',
        child: FilesScreen(session: s),
      ),
    ),
  );
  await tester.pumpAndSettle();
  await tester.ensureVisible(find.text('Loan evidence.pdf'));
  await tester.tap(find.text('Loan evidence.pdf'));
  await tester.pumpAndSettle();
  expect(find.text('Inspect safe preview specimen'), findsNothing);
  await tester.ensureVisible(find.text('Simulate scan passed'));
  await tester.tap(find.text('Simulate scan passed'));
  await tester.pumpAndSettle();
  await tester.ensureVisible(find.text('Review changes'));
  await tester.tap(find.text('Review changes'));
  await tester.pumpAndSettle();
  await tester.ensureVisible(find.text('Apply simulation'));
  await tester.tap(find.text('Apply simulation'));
  await tester.pumpAndSettle();
  expect(
    s.finance.files.files.firstWhere((f) => f.id == 'loan').state,
    'Local only',
  );
  expect(tester.takeException(), isNull);
  await tester.pumpWidget(const SizedBox());
  s.dispose();
}
