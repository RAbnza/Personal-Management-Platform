import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/features/finance/presentation/debts_screen.dart';
import 'package:salapiya/design_system/theme.dart';
import 'package:salapiya/gallery/settings.dart';
import 'package:salapiya/local/local_profiles.dart';
import 'package:salapiya/local/local_runtime.dart';

import 'local_test_support.dart';
import 'p1_widgets_test.dart' show closeWithWidgetClock;

void main() {
  testWidgets(
    'production debts withhold totals/actions until initial history completes',
    (tester) async {
      final f = (await tester.runAsync(LocalFixture.open))!;
      final settings = GallerySettings();
      final runtime = LocalRuntime(
        LocalProfiles(f.directory, MemoryProfileVault()),
        settings,
      );
      try {
        await tester.runAsync(() => runtime.activate(f.store));
        runtime.connected.binding = {'phase': 'retrieving'};
        await tester.pumpWidget(
          MaterialApp(
            theme: SalapiyaTheme.build(Brightness.light),
            home: Scaffold(
              body: SingleChildScrollView(
                child: DebtsScreen(session: runtime.session!),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(
          find.text(
            'Debt history is unavailable while the initial snapshot is incomplete.',
          ),
          findsOneWidget,
        );
        expect(find.text('Add existing debt'), findsNothing);
        expect(find.textContaining('Recognized liability:'), findsNothing);
        runtime.connected.binding = null;
        runtime.connected.notifyListeners();
        await tester.pumpAndSettle();
        expect(find.text('Add existing debt'), findsOneWidget);
        expect(
          find.textContaining('initial snapshot is incomplete'),
          findsNothing,
        );
        expect(tester.takeException(), isNull);
      } finally {
        await tester.pumpWidget(const SizedBox.shrink());
        await closeWithWidgetClock(tester, runtime.close);
        runtime.dispose();
        settings.dispose();
        await closeWithWidgetClock(tester, f.close);
      }
    },
  );
}
