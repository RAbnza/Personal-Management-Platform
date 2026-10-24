import 'package:integration_test/integration_test.dart';

import '../test/p0_persistence_test.dart' as persistence;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  persistence.main();
}
