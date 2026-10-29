import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/design_system/theme.dart';
import 'package:salapiya/prototype/scenarios.dart';
import 'package:salapiya/gallery/settings.dart';
import 'package:salapiya/features/finance/presentation/financial_widgets.dart';
import 'package:salapiya/features/finance/presentation/group_lifecycle.dart';
import 'package:salapiya/features/life/presentation/life_screen.dart';
import 'package:salapiya/features/planning/presentation/planning_screen.dart';
import 'package:salapiya/features/planning/presentation/reports_screen.dart';
import 'package:salapiya/features/profile/presentation/profile_experience.dart';
import 'package:salapiya/features/supporting/presentation/files_screen.dart';
import 'package:salapiya/features/finance/presentation/credit_screen.dart';

void main() {
  testWidgets('D4 responsive content at 320/200% dark and 1280/light', (
    tester,
  ) async {
    final s = PrototypeSession(), settings = GallerySettings();
    addTearDown(s.dispose);
    addTearDown(settings.dispose);
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    tester.view.devicePixelRatio = 1;
    for (final size in [const Size(320, 640), const Size(1280, 800)]) {
      tester.view.physicalSize = size;
      final screens = <Widget>[
        for (final tab in ['Recurring', 'Budgets', 'Savings', 'Forecast'])
          PlanningScreen(session: s, initial: tab),
        ReportsScreen(session: s),
        CreditScreen(session: s),
        for (final tab in ['Calendar', 'Tasks', 'Learning', 'Books', 'Career'])
          LifeScreen(session: s, initial: tab),
        GroupLifecycle(session: s),
        FilesScreen(session: s),
      ];
      for (final screen in screens) {
        await tester.pumpWidget(
          MaterialApp(
            theme: SalapiyaTheme.build(
              size.width < 400 ? Brightness.dark : Brightness.light,
            ),
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(context).copyWith(
                textScaler: TextScaler.linear(size.width < 400 ? 2 : 1),
              ),
              child: child!,
            ),
            home: FinancePage(key: UniqueKey(), title: 'D4', child: screen),
          ),
        );
        await tester.pumpAndSettle();
        expect(
          tester.takeException(),
          isNull,
          reason: '${screen.runtimeType} at $size',
        );
      }
      await tester.pumpWidget(
        MaterialApp(
          theme: SalapiyaTheme.build(Brightness.dark),
          home: ProfileExperience(
            session: s,
            settings: settings,
            initial: 'Backup & recovery',
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    }
    await tester.pumpWidget(const SizedBox());
  });
}
