import 'package:flutter_test/flutter_test.dart';

import 'd4_journey.dart';

void main() {
  testWidgets('D4 ownership and safe file availability', d4SupportingJourney);
  testWidgets(
    'D4 local onboarding and recoverable profile replacement',
    d4ProfileJourney,
  );
  testWidgets('D4 planning entry, review and reports', d4PlanningJourney);
  testWidgets(
    'D4 Life calendar, task completion and reading progress',
    d4LifeJourney,
  );
}
