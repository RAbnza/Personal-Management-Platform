import 'package:integration_test/integration_test.dart';

import 'p0_compatibility_test.dart' as compatibility;
import 'p0_portability_test.dart' as portability;

import '../test/p0_persistence_test.dart' as persistence;
import '../test/p0_command_test.dart' as commands;
import '../test/p0_enrollment_test.dart' as enrollment;
import '../test/p0_recovery_test.dart' as recovery;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  compatibility.main();
  persistence.main();
  commands.main();
  enrollment.main();
  recovery.main();
  portability.main();
}
