import 'package:flutter_test/flutter_test.dart';

import '../test/p6_capacity_journey.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
    'P6 isolated 10,000-action encrypted capacity and independent restore',
    () => capacityJourney(
      '../../contracts/salapiya',
      'build/p6-capacity-host.json',
    ),
    timeout: const Timeout(Duration(hours: 2)),
  );
}
