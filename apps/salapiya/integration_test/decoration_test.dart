import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:salapiya/app.dart';
import 'package:salapiya/design_system/craft.dart';
import 'package:salapiya/gallery/settings.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets(
    'all gallery surface consumers render without the shared stroke',
    (tester) async {
      final settings = GallerySettings();
      await tester.pumpWidget(SalapiyaApp(settings: settings));
      for (final theme in [ThemeMode.light, ThemeMode.dark]) {
        for (final effects in [true, false]) {
          for (final section in GallerySection.values) {
            settings.change(() {
              settings.themeMode = theme;
              settings.effects = effects;
              settings.reduceMotion = !effects;
              settings.section = section;
            });
            await tester.pumpAndSettle();
            for (final frame in find.byType(LatticeFrame).evaluate()) {
              final surface = tester.widget<Container>(
                find
                    .descendant(
                      of: find.byWidget(frame.widget),
                      matching: find.byType(Container),
                    )
                    .first,
              );
              expect(surface.child, isA<Padding>());
              expect((surface.decoration! as BoxDecoration).border, isNotNull);
            }
            if (section == GallerySection.branding) {
              await tester.ensureVisible(
                find.text('Woven Calm · historical motif'),
              );
              await tester.pumpAndSettle();
            }
            expect(tester.takeException(), isNull);
          }
        }
      }
    },
  );
}
