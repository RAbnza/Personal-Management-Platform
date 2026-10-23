import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/app.dart';
import 'package:salapiya/app/activity_view.dart';
import 'package:salapiya/app/overview_wallet.dart';
import 'package:salapiya/prototype/activity.dart';
import 'package:salapiya/prototype/fixtures.dart';
import 'package:salapiya/prototype/scenarios.dart';

import 'shell_journey.dart';

void main() {
  testWidgets(
    'wallet swipe and bounded activity pages preserve the dashboard cap',
    (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(412, 900);
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(const SalapiyaApp());
      await tester.pumpAndSettle();
      final wallet = find.descendant(
        of: find.byType(AccountWallet),
        matching: find.byType(PageView),
      );
      await tester.ensureVisible(wallet);
      await tester.drag(wallet, const Offset(-330, 0));
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<ChoiceChip>(find.widgetWithText(ChoiceChip, 'Mobile'))
            .selected,
        isTrue,
      );
      final activity = find.byType(ActivityView);
      expect(
        find.descendant(
          of: activity,
          matching: find.byWidgetPredicate(
            (w) => w is TextButton && w.key.toString().contains('entry-'),
          ),
        ),
        findsNWidgets(4),
      );
      await tapVisible(tester, find.text('See all'));
      expect(find.text('Money / Activity'), findsOneWidget);
      expect(find.text('Page 1 of 2'), findsOneWidget);
      final history = find.descendant(
        of: find.byType(ActivityView),
        matching: find.byType(PageView),
      );
      await tester.ensureVisible(history);
      await tester.drag(history, const Offset(-330, 0));
      await tester.pumpAndSettle();
      expect(find.text('Page 2 of 2'), findsOneWidget);
      await tapVisible(
        tester,
        find.byKey(const ValueKey('activity-filter-Money in')),
      );
      expect(find.text('Page 1 of 1'), findsOneWidget);
      expect(find.text('Project payment'), findsOneWidget);
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      expect(find.text('See all'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
  test('synthetic weekly activity reconciles to liquid balances exactly', () {
    expect(DemoActivity.incoming, BigInt.from(1800000));
    expect(DemoActivity.outgoing, BigInt.from(474600));
    expect(DemoActivity.opening, BigInt.from(1604675));
    expect(
      DemoActivity.opening + DemoActivity.incoming - DemoActivity.outgoing,
      DemoMoney.liquid,
    );
    expect(
      DemoActivity.categories.fold(
        BigInt.zero,
        (sum, name) => sum + DemoActivity.categoryTotal(name),
      ),
      DemoActivity.outgoing,
    );
    expect(
      [for (var d = 15; d <= 21; d++) DemoActivity.spentOn(d)]
          .reduce((a, b) => a + b),
      DemoActivity.outgoing,
    );
  });

  testWidgets(
    'wallets, chart, activity filtering and agenda keep their source meaning',
    (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(412, 900);
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final session = PrototypeSession();
      await tester.pumpWidget(SalapiyaApp(session: session));
      await tester.pumpAndSettle();
      await tapVisible(tester, find.text('Explore spending rhythm'));
      await tapVisible(tester, find.byKey(const ValueKey('spending-day-19')));
      expect(find.text('19 Oct · ₱1,584.00 out'), findsOneWidget);
      await tapVisible(tester, find.text('Cash'));
      expect(find.text('₱1,250.00'), findsOneWidget);
      await tapVisible(
        tester,
        find.byKey(const ValueKey('activity-filter-Money in')),
      );
      expect(find.text('Project payment'), findsOneWidget);
      expect(find.byKey(const ValueKey('entry-Morning coffee')), findsNothing);
      await tapVisible(
        tester,
        find.byKey(const ValueKey('entry-Project payment')),
      );
      expect(find.text('SYNTHETIC / ACCEPTED ACTIVITY'), findsOneWidget);
      await tapVisible(tester, find.text('Close'));
      await tapVisible(tester, find.byKey(const ValueKey('agenda-day-25')));
      await tapVisible(tester, find.text('Electricity'));
      expect(find.text('Money / Electricity bill'), findsOneWidget);
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      session.togglePrivacy();
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('spending-day-19')), findsNothing);
      expect(
        find.text('Category amounts and proportions are hidden.'),
        findsOneWidget,
      );
      session.select(OverviewScenario.incomplete);
      await tester.pumpAndSettle();
      expect(find.text('Project payment'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );
}
