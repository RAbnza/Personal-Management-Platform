import 'package:integration_test/integration_test.dart';

import '../test/p0_persistence_test.dart' as persistence;
import '../test/p0_command_test.dart' as commands;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  persistence.main();
  commands.main();
}
