import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';

import '../local/finance_domain.dart';

/// Enforce the limit while reading, even if a provider's reported size is stale.
Future<Uint8List> readBoundedFinancialFile(
  PlatformFile file,
  int maximum,
) async {
  final reported = await file.length();
  if (reported == null || reported < 1 || reported > maximum) {
    reject(
      'Selected file exceeds the supported size or has no readable length.',
    );
  }
  final buffer = BytesBuilder(copy: false);
  var count = 0;
  await for (final bytes in file.readAsByteStream()) {
    count += bytes.length;
    if (count > maximum) {
      reject(
        'File changed or exceeds the supported size. No financial evidence was saved.',
      );
    }
    buffer.add(bytes);
  }
  if (count != reported) {
    reject('File size changed during selection. Choose the original again.');
  }
  return buffer.takeBytes();
}
