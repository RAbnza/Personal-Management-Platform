import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/connected/environment.dart';

void main() {
  test(
    'development and pilot require explicit distinct paired public identities',
    () {
      bool check(
        String environment,
        String project,
        String instance, {
        String? endpoint,
      }) => allowedConnectionEnvironment(
        environment: environment,
        project: project,
        syncInstance: instance,
        url: 'https://$project.supabase.co',
        endpoint: endpoint ?? 'https://$instance.powersync.journeyapps.com',
      );
      expect(
        check('development', developmentProject, developmentSyncInstance),
        true,
      );
      expect(
        check('pilot', developmentProject, developmentSyncInstance),
        false,
      );
      const pilot = 'abcdefghijklmnopqrst',
          instance = '1234567890abcdef12345678';
      expect(check('development', pilot, instance), false);
      expect(check('pilot', pilot, instance), true);
      expect(check('pilot', pilot, developmentSyncInstance), false);
      expect(
        check(
          'pilot',
          pilot,
          instance,
          endpoint:
              'https://$developmentSyncInstance.powersync.journeyapps.com',
        ),
        false,
      );
      expect(check('unknown', pilot, instance), false);
    },
  );
}
