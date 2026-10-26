import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/finance/bounded_file_read.dart';
import 'package:salapiya/local/finance_domain.dart';

final class ChangedProviderFile extends PlatformFile {
  ChangedProviderFile(this.reported, this.chunks);
  final int reported;
  final List<List<int>> chunks;
  @override
  String get name => 'synthetic.pdf';
  @override
  Uri get uri => Uri.file('synthetic.pdf');
  @override
  Never get xFile => throw UnimplementedError();
  @override
  int? lengthSync() => reported;
  @override
  Future<int?> length() async => reported;
  @override
  Future<Uint8List> readAsBytes() =>
      throw StateError('Unbounded file reads must never be used.');
  @override
  Stream<Uint8List> readAsByteStream() async* {
    for (final c in chunks) {
      yield Uint8List.fromList(c);
    }
  }
}

void main() {
  test('native provider reads stop at the stream bound and reject changed byte lengths', () async {
    expect(
      await readBoundedFinancialFile(
        ChangedProviderFile(3, [
          [1],
          [2, 3],
        ]),
        3,
      ),
      [1, 2, 3],
    );
    await expectLater(
      readBoundedFinancialFile(
        ChangedProviderFile(2, [
          [1, 2],
          [3, 4],
        ]),
        3,
      ),
      throwsA(isA<LocalRuleException>()),
    );
    await expectLater(
      readBoundedFinancialFile(
        ChangedProviderFile(3, [
          [1, 2],
        ]),
        3,
      ),
      throwsA(isA<LocalRuleException>()),
    );
    await expectLater(
      readBoundedFinancialFile(
        ChangedProviderFile(4, [
          [1],
        ]),
        3,
      ),
      throwsA(isA<LocalRuleException>()),
    );
  });
}
