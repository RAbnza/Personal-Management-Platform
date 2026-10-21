import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/design_system/craft.dart';
import 'package:salapiya/design_system/theme.dart';

void main() {
  testWidgets(
    'shared frames retain boundaries without decorative foregrounds',
    (tester) async {
      for (final brightness in Brightness.values) {
        for (final effects in [true, false]) {
          for (final width in [180.0, 320.0, 700.0]) {
            await tester.pumpWidget(
              MaterialApp(
                theme: SalapiyaTheme.build(brightness),
                home: CraftPreferences(
                  effects: effects,
                  child: Center(
                    child: SizedBox(
                      width: width,
                      child: const LatticeFrame(
                        focal: true,
                        raised: true,
                        child: Text('Working surface'),
                      ),
                    ),
                  ),
                ),
              ),
            );
            final frame = find.byType(LatticeFrame);
            expect(
              find.descendant(of: frame, matching: find.byType(CustomPaint)),
              findsNothing,
            );
            final container = tester.widget<Container>(
              find
                  .descendant(of: frame, matching: find.byType(Container))
                  .first,
            );
            final decoration = container.decoration! as BoxDecoration;
            expect(decoration.border, isNotNull);
            expect(
              decoration.borderRadius,
              BorderRadius.circular(Space.cardRadius),
            );
            expect(decoration.gradient != null, effects);
            expect(tester.takeException(), isNull);
          }
        }
      }
    },
  );
}
