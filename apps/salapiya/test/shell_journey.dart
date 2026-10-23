import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/app.dart';
import 'package:salapiya/app/previews.dart';
import 'package:salapiya/app/shell.dart';
import 'package:salapiya/gallery/settings.dart';
import 'package:salapiya/prototype/scenarios.dart';

Future<void> tapVisible(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder.first);
  await tester.pumpAndSettle();
  await tester.tap(finder.first);
  await tester.pumpAndSettle();
}

/// Shared native/widget acceptance journey; never captures screenshots.
Future<void> shellJourney(WidgetTester tester) async {
  final settings = GallerySettings();
  final session = PrototypeSession();
  await tester.pumpWidget(SalapiyaApp(settings: settings, session: session));
  await tester.pumpAndSettle();
  expect(find.byType(SalapiyaShell), findsOneWidget);
  expect(find.text('Money Today'), findsOneWidget);
  expect(find.text('₱29,300.75'), findsOneWidget);

  for (final destination in AppDestination.values) {
    final control = find.byKey(ValueKey('nav-${destination.name}'));
    if (control.evaluate().isEmpty) {
      final navigation = find.byWidgetPredicate(
        (w) => w is Text && w.data?.startsWith('Navigation ·') == true,
      );
      if (navigation.evaluate().isNotEmpty) {
        await tapVisible(tester, navigation);
      } else {
        await tester.tap(find.byTooltip('Navigation · 5 destinations'));
        await tester.pumpAndSettle();
      }
      await tapVisible(tester, find.text(destination.label).last);
    } else {
      await tapVisible(tester, control);
    }
    expect(tester.takeException(), isNull);
  }
  await tester.tap(find.byKey(const ValueKey('nav-overview')));
  await tester.pumpAndSettle();
  if (find.byTooltip('Collapse sidebar').evaluate().isNotEmpty) {
    await tester.tap(find.byTooltip('Collapse sidebar'));
    await tester.pumpAndSettle();
    expect(find.byTooltip('Expand sidebar'), findsOneWidget);
    await tester.tap(find.byTooltip('Expand sidebar'));
    await tester.pumpAndSettle();
  }
  await tapVisible(tester, find.text('View accounts'));
  expect(find.text('Money / Accounts'), findsOneWidget);
  expect(find.text('Cash wallet'), findsOneWidget);
  await tester.binding.handlePopRoute();
  await tester.pumpAndSettle();
  expect(find.text('Money Today'), findsOneWidget);

  await tester.tap(find.byTooltip('Quick actions'));
  await tester.pumpAndSettle();
  expect(find.byKey(const ValueKey('quick-actions-menu')), findsOneWidget);
  await tester.binding.handlePopRoute();
  await tester.pumpAndSettle();
  expect(find.byKey(const ValueKey('quick-actions-menu')), findsNothing);
  await tester.tap(find.byTooltip('Quick actions'));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Add expense').last);
  await tester.pumpAndSettle();
  expect(find.byType(DemoActionPage), findsOneWidget);
  expect(find.byTooltip('Quick actions'), findsNothing);
  final field = find.byKey(const ValueKey('demo-task-note'));
  if (kProfileMode) {
    final editable = find.descendant(
      of: field,
      matching: find.byType(EditableText),
    );
    tester
        .state<EditableTextState>(editable)
        .updateEditingValue(const TextEditingValue(text: 'Invented note'));
    await tester.pumpAndSettle();
  } else {
    await tester.enterText(field, 'Invented note');
    await tester.pumpAndSettle();
  }
  FocusManager.instance.primaryFocus?.unfocus();
  await tester.pumpAndSettle();
  await tester.binding.handlePopRoute();
  await tester.pumpAndSettle();
  expect(find.text('Discard demo draft?'), findsOneWidget);
  await tester.tap(find.text('Keep editing'));
  await tester.pumpAndSettle();
  expect(tester.widget<TextField>(field).controller!.text, 'Invented note');
  await tester.sendKeyEvent(LogicalKeyboardKey.escape);
  await tester.pumpAndSettle();
  await tester.tap(find.text('Discard demo draft'));
  await tester.pumpAndSettle();
  expect(find.byType(DemoActionPage), findsNothing);

  for (final scenario in OverviewScenario.values) {
    session.select(scenario);
    await tester.pumpAndSettle();
    if (scenario == OverviewScenario.incomplete) {
      expect(find.text('Not yet available'), findsOneWidget);
      expect(find.text('₱29,300.75'), findsNothing);
    }
    if (scenario == OverviewScenario.empty) {
      expect(find.text('₱0.00'), findsOneWidget);
    }
    if (scenario == OverviewScenario.pending) {
      expect(find.textContaining('₱29,115.25'), findsOneWidget);
    }
    expect(tester.takeException(), isNull);
  }
  session.reset();
  await tester.tap(find.byTooltip('Hide amounts'));
  await tester.pumpAndSettle();
  expect(find.text('₱29,300.75'), findsNothing);
  await tester.tap(find.byTooltip('Show amounts'));
  await tester.pumpAndSettle();
  await tester.tap(find.byTooltip('Profile & utilities').last);
  await tester.pumpAndSettle();
  await tapVisible(tester, find.text('Dark'));
  expect(settings.themeMode, ThemeMode.dark);
  await tapVisible(tester, find.text('Reduce motion'));
  expect(settings.reduceMotion, isTrue);
  await tapVisible(tester, find.text('Craft effects'));
  expect(settings.effects, isFalse);
  await tapVisible(tester, find.text('First-run preview'));
  expect(find.text('Create a local offline profile'), findsOneWidget);
  expect(find.text('Continue with Google'), findsOneWidget);
  expect(find.text('Restore from backup'), findsOneWidget);
  await tapVisible(tester, find.text('Continue with Google'));
  await tester.tap(find.text('Explore simulated result'));
  await tester.pumpAndSettle();
  expect(session.scenario, OverviewScenario.incomplete);
  await tapVisible(tester, find.text('Design Gallery'));
  expect(find.text('Made with care.\nClear by design.'), findsOneWidget);
  await tester.binding.handlePopRoute();
  await tester.pumpAndSettle();
  await tester.binding.handlePopRoute();
  await tester.pumpAndSettle();
  expect(find.byType(SalapiyaShell), findsOneWidget);
  expect(tester.takeException(), isNull);
}
