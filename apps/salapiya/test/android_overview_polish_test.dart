import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/app.dart';
import 'package:salapiya/app/workspace_overview.dart';
import 'package:salapiya/design_system/editorial.dart';
import 'package:salapiya/features/finance/presentation/financial_editor.dart';
import 'package:salapiya/features/finance/presentation/financial_widgets.dart';
import 'package:salapiya/gallery/settings.dart';
import 'package:salapiya/local/finance_domain.dart';
import 'package:salapiya/local/local_profiles.dart';
import 'package:salapiya/local/local_runtime.dart';

import 'local_money_journey.dart' show localSettle, localTap, localWait;
import 'local_test_support.dart';
import 'p1_widgets_test.dart' show closeWithWidgetClock;

void main() {
  setUpAll(() async {
    await (FontLoader(
      'Geist',
    )..addFont(rootBundle.load('assets/fonts/geist/regular.ttf'))).load();
  });
  test('compact reporting periods preserve month and year boundaries', () {
    const l = DefaultMaterialLocalizations();
    for (final (start, end, expected) in const [
      ('2026-10-01', '2026-10-28', 'Oct 1–28'),
      ('2027-01-01', '2027-01-01', 'Jan 1–1'),
      ('2028-02-01', '2028-02-29', 'Feb 1–29'),
      ('2026-10-31', '2026-11-02', 'Oct 31–Nov 2'),
      ('2026-12-31', '2027-01-02', 'Dec 31, 2026–Jan 2, 2027'),
    ]) {
      expect(overviewPeriodLabel(l, start, end), expected);
    }
  });
  for (final android in [true, false]) {
    testWidgets(
      '${android ? 'Android' : 'Windows'} Overview presentation and expense access',
      (tester) async {
        debugDefaultTargetPlatformOverride = android
            ? TargetPlatform.android
            : TargetPlatform.windows;
        addTearDown(() => debugDefaultTargetPlatformOverride = null);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetDevicePixelRatio);
        addTearDown(tester.view.resetPhysicalSize);
        try {
          await overviewPolishJourney(
            tester,
            android: android,
            sweepLayouts: true,
          );
        } finally {
          debugDefaultTargetPlatformOverride = null;
        }
      },
    );
  }
}

/// The same focused production checks run on the native emulator and Windows.
/// No screenshot or golden-image APIs are used.
Future<void> overviewPolishJourney(
  WidgetTester tester, {
  required bool android,
  bool sweepLayouts = false,
}) async {
  final f = (await tester.runAsync(LocalFixture.open))!;
  final settings = GallerySettings();
  final runtime = LocalRuntime(
    LocalProfiles(f.directory, MemoryProfileVault()),
    settings,
  );
  final semantics = tester.ensureSemantics();
  try {
    await tester.runAsync(() async {
      final today = civilToday();
      final cutoff = DateTime.parse(today)
          .subtract(const Duration(days: 1))
          .toIso8601String()
          .substring(0, 10);
      final account = await f.account('Polish wallet', '987654321.00', cutoff);
      await f.post('expense', {
        'name': 'Polish receipt',
        'account': account,
        'date': today,
        'amount': '1234567.89',
        'category': 'category-food',
      });
      await runtime.activate(f.store);
    });
    final session = runtime.session!;
    final today = civilToday(), start = '${civilToday().substring(0, 7)}-01';
    final overview = find.byType(WorkspaceOverview);
    Finder card(String label) => find.descendant(
      of: overview,
      matching: find.byWidgetPredicate(
        (w) => w is ValueBlock && w.label == label,
      ),
    );
    final cards = [
      card('LIQUID MONEY'),
      card('MONTH SPENDING'),
      card('MONTH INCOME'),
      card('DEBT LIABILITY'),
    ];
    Future<void> checkLayout() async {
      await tester.pumpWidget(
        SalapiyaApp(session: session, settings: settings),
      );
      await localSettle(tester);
      expect(find.text('Your day, in balance.'), findsOneWidget);
      expect(
        tester.widget<ValueBlock>(cards[0]).value,
        session.amount(session.accepted!),
      );
      expect(
        tester.widget<ValueBlock>(cards[1]).value,
        session.amount(BigInt.from(123456789)),
      );
      expect(
        tester.widget<ValueBlock>(cards[2]).value,
        session.amount(BigInt.zero),
      );
      expect(
        tester.widget<ValueBlock>(cards[3]).value,
        session.amount(BigInt.zero),
      );
      if (android) {
        expect(find.text('Add expense'), findsNothing);
        expect(find.text("Your money and what's next."), findsOneWidget);
        expect(find.byTooltip('Quick actions'), findsOneWidget);
        expect(
          find.byKey(const ValueKey('floating-dock-surface')),
          findsOneWidget,
        );
        final caption = tester.widget<ValueBlock>(cards[1]).caption;
        expect(
          caption,
          '${overviewPeriodLabel(const DefaultMaterialLocalizations(), start, today)} · net spending',
        );
        // Scroll the metric into the semantics viewport before checking TalkBack detail.
        await tester.ensureVisible(cards[1]);
        await localSettle(tester);
        expect(
          find.bySemanticsLabel('$start – $today · net recognized spending'),
          findsOneWidget,
        );
        final rects = cards.map(tester.getRect).toList();
        for (var i = 1; i < rects.length; i++) {
          if ((rects[i].top - rects[i - 1].top).abs() < .1) {
            expect(rects[i].height, closeTo(rects[i - 1].height, .1));
            expect(rects[i].left - rects[i - 1].right, closeTo(16, .1));
          }
        }
        // No blank action row remains between the subtitle and the cards.
        final subtitle = tester.getRect(
          find.text("Your money and what's next."),
        );
        expect(rects.first.top - subtitle.bottom, closeTo(24, .1));
        if (settings.textScale == 1 && tester.view.physicalSize.width >= 360) {
          final paragraph = tester.renderObject<RenderParagraph>(
            find.text("Your money and what's next."),
          );
          expect(
            paragraph.getBoxesForSelection(
              TextSelection(
                baseOffset: 0,
                extentOffset: "Your money and what's next.".length,
              ),
            ),
            hasLength(1),
          );
        }
      } else {
        expect(find.text("Your money and what's next."), findsNothing);
        expect(
          find.text(
            'Welcome back, ${session.profile.name}. Here is your money and what is ahead.',
          ),
          findsOneWidget,
        );
        expect(
          find.widgetWithText(FilledButton, 'Add expense'),
          findsOneWidget,
        );
        expect(
          tester.widget<ValueBlock>(cards[1]).caption,
          '$start – $today · net recognized',
        );
        expect(
          tester.widget<ValueBlock>(cards[1]).captionSemanticsLabel,
          isNull,
        );
        final grid = tester
            .widgetList<WorkspaceGrid>(find.byType(WorkspaceGrid))
            .first;
        expect(grid.matchRowHeights, isFalse);
        expect(grid.minWidth, 150);
        expect(
          find.descendant(
            of: cards.first,
            matching: find.byType(EditorialSurface),
          ),
          findsOneWidget,
        );
        expect(
          tester
              .widget<EditorialSurface>(
                find.descendant(
                  of: cards.first,
                  matching: find.byType(EditorialSurface),
                ),
              )
              .padding,
          20,
        );
        expect(
          find.byKey(const ValueKey('floating-dock-surface')),
          findsNothing,
        );
      }
      expect(
        tester.widget<ValueBlock>(cards[0]).caption,
        'Accepted history · card credit excluded',
      );
      expect(
        tester.widget<ValueBlock>(cards[2]).caption,
        'Recognized income · borrowing excluded',
      );
      expect(
        tester.widget<ValueBlock>(cards[3]).caption,
        'Through today · schedules are separate',
      );
      for (final metric in cards) {
        final bounds = tester.getRect(metric);
        for (final text
            in find
                .descendant(of: metric, matching: find.byType(Text))
                .evaluate()) {
          final finder = find.byWidget(text.widget);
          final rect = tester.getRect(finder);
          expect(rect.left, greaterThanOrEqualTo(bounds.left));
          expect(rect.right, lessThanOrEqualTo(bounds.right + .1));
          expect(rect.bottom, lessThanOrEqualTo(bounds.bottom + .1));
          expect(
            tester
                .renderObject<RenderParagraph>(
                  find.descendant(of: finder, matching: find.byType(RichText)),
                )
                .didExceedMaxLines,
            isFalse,
          );
        }
      }
      expect(tester.takeException(), isNull);
    }

    if (sweepLayouts) {
      for (final width in android ? [320.0, 360.0, 412.0] : [412.0, 1440.0]) {
        tester.view.physicalSize = Size(width, 1000);
        for (final scale in android ? [1.0, 2.0] : [1.0]) {
          for (final mode in [ThemeMode.light, ThemeMode.dark]) {
            settings.change(() {
              settings.textScale = scale;
              settings.themeMode = mode;
            });
            await checkLayout();
          }
        }
      }
    } else {
      await checkLayout();
    }
    settings.change(() => settings.textScale = 1);
    await localSettle(tester);
    if (android) {
      await localTap(tester, find.byTooltip('Quick actions'));
      expect(find.text('Add expense'), findsOneWidget);
    }
    final addExpense = find.text('Add expense');
    await tester.ensureVisible(addExpense);
    await tester.pumpAndSettle();
    // Build the native draft reader with a real I/O clock in host widget tests.
    await tester.runAsync(() async {
      await tester.tap(addExpense);
      await tester.pump();
    });
    await localSettle(tester);
    await localWait(
      tester,
      () => find.byType(FinancialEditor).evaluate().isNotEmpty,
    );
    expect(
      find.byType(FinancialEditor),
      findsOneWidget,
      reason: tester
          .widgetList<Text>(find.byType(Text))
          .map((w) => w.data)
          .join(' | '),
    );
    expect(find.text('Amount'), findsWidgets);
    expect(tester.takeException(), isNull);
    // Opening the editor must not post or change any financial record.
    expect(session.finance.liquid, session.accepted);
  } finally {
    semantics.dispose();
    await tester.pumpWidget(const SizedBox.shrink());
    await localSettle(tester);
    await tester.runAsync(runtime.flushPreferences);
    await closeWithWidgetClock(tester, runtime.close);
    runtime.dispose();
    settings.dispose();
    await closeWithWidgetClock(tester, f.close);
  }
}
