// Port of src/shared/money.ts; shared-bill ordering follows sharing.ts.
final maxComponent = BigInt.from(100000000000);
final maxSqliteInteger = (BigInt.one << 63) - BigInt.one;
final minSqliteInteger = -(BigInt.one << 63);

BigInt parseMinor(String value) {
  if (!RegExp(r'^(0|-?[1-9][0-9]*)$').hasMatch(value)) {
    throw const FormatException('Noncanonical minor units');
  }
  return BigInt.parse(value);
}

BigInt parsePhp(String value) {
  if (!RegExp(r'^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$').hasMatch(value)) {
    throw const FormatException('Invalid PHP decimal');
  }
  final parts = value.split('.');
  return BigInt.parse(parts.first) * BigInt.from(100) +
      BigInt.parse(parts.length == 1 ? '0' : parts[1].padRight(2, '0'));
}

BigInt component(BigInt amount, {bool positive = false}) {
  if (amount == BigInt.zero ||
      amount.abs() > maxComponent ||
      (positive && amount.isNegative)) {
    throw RangeError('Financial component outside contract');
  }
  return amount;
}

int sqliteInteger(BigInt amount) {
  if (amount < minSqliteInteger || amount > maxSqliteInteger) {
    throw RangeError('SQLite integer overflow');
  }
  return amount.toInt();
}

List<BigInt> allocateEvenly(BigInt amount, int count) {
  if (count <= 0 || count > 100)
    throw RangeError('Invalid proof participant count');
  final divisor = BigInt.from(count);
  final base = amount ~/ divisor;
  final remainder = amount.remainder(divisor);
  return List.generate(
    count,
    (i) =>
        base +
        (BigInt.from(i) < remainder.abs()
            ? BigInt.from(remainder.sign)
            : BigInt.zero),
  );
}

Map<String, String> equalBill(String total, List<String> participants) {
  final amount = parseMinor(total);
  if (amount <= BigInt.zero ||
      amount > maxSqliteInteger ||
      participants.toSet().length != participants.length) {
    throw RangeError('Invalid bill');
  }
  final sorted = [...participants]..sort();
  final parts = allocateEvenly(amount, sorted.length);
  return {
    for (var i = 0; i < sorted.length; i++) sorted[i]: parts[i].toString(),
  };
}
