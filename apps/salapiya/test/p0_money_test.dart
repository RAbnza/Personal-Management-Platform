import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/p0/exact_money.dart';

void main() {
  final fixture = jsonDecode(
    File('../../contracts/salapiya/p0_money.json').readAsStringSync(),
  ) as Map<String, dynamic>;
  test('canonical web money fixtures and signed deterministic remainder', () {
    for (final entry in (fixture['php'] as Map).entries) {
      expect(parsePhp(entry.key as String).toString(), entry.value);
    }
    for (final value in fixture['invalidPhp'] as List) {
      expect(() => parsePhp(value as String), throwsFormatException);
    }
    for (final value in fixture['invalidMinor'] as List) {
      expect(() => parseMinor(value as String), throwsFormatException);
    }
    for (final row in fixture['allocations'] as List) {
      final total = parseMinor(row['total'] as String);
      final parts = allocateEvenly(total, row['count'] as int);
      expect(parts.map((x) => x.toString()).toList(), row['parts']);
      expect(parts.fold(BigInt.zero, (a, b) => a + b), total);
    }
    expect(equalBill('10000', ['c', 'a', 'b']), {
      'a': '3334',
      'b': '3333',
      'c': '3333',
    });
    expect(() => equalBill('1', ['a', 'a']), throwsRangeError);
  });
  test(
    'component and SQLite aggregate boundaries reject before conversion',
    () {
      expect(component(maxComponent), maxComponent);
      expect(component(-maxComponent), -maxComponent);
      for (final value in [BigInt.zero, maxComponent + BigInt.one]) {
        expect(() => component(value), throwsRangeError);
      }
      expect(() => component(-BigInt.one, positive: true), throwsRangeError);
      expect(sqliteInteger(maxSqliteInteger).toString(), '9223372036854775807');
      expect(
        sqliteInteger(minSqliteInteger).toString(),
        '-9223372036854775808',
      );
      expect(
        () => sqliteInteger(maxSqliteInteger + BigInt.one),
        throwsRangeError,
      );
      expect(
        () => sqliteInteger(minSqliteInteger - BigInt.one),
        throwsRangeError,
      );
    },
  );
}
