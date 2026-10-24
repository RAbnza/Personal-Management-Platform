import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import '../test/d4_journey.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets('D4 supporting native journey', d4SupportingJourney);
  testWidgets('D4 profile native journey', d4ProfileJourney);
  testWidgets('D4 shared native journeys', d4PlanningJourney);
  testWidgets('D4 Life native journey', d4LifeJourney);
}
