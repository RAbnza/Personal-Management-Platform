import 'dart:convert';
import 'dart:io';

import 'package:integration_test/integration_test_driver.dart';

Future<void> main() async {
  await integrationDriver(
    writeResponseOnFailure: true,
    responseDataCallback: (data) async {
      if (data == null) return;
      final directory = Directory('../../docs/salapiya/design/review/d1r')
        ..createSync(recursive: true);
      File('${directory.path}/${data['platform']}-${data['mode']}.json')
          .writeAsStringSync(
            '${const JsonEncoder.withIndent('  ').convert(data)}\n',
          );
    },
  );
}
