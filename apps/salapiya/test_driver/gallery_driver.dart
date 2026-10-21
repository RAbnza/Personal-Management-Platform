import 'dart:convert';
import 'dart:io';

import 'package:integration_test/integration_test_driver.dart';

Future<void> main() async {
  await integrationDriver(
    writeResponseOnFailure: true,
    responseDataCallback: (data) async {
      if (data == null) return;
      final directory = Directory('../../docs/salapiya/design/review/d1')
        ..createSync(recursive: true);
      final shots = data.remove('screenshots') as Map<String, dynamic>? ?? {};
      for (final entry in shots.entries) {
        File('${directory.path}/${entry.key}.png')
            .writeAsBytesSync(base64Decode(entry.value as String));
      }
      final mode =
          data['kind'] ??
          (data['performance'] as Map<String, dynamic>?)?['mode'] ??
          'incomplete';
      File('${directory.path}/${data['platform']}-runtime-$mode.json')
          .writeAsStringSync(const JsonEncoder.withIndent('  ').convert(data));
    },
  );
}
