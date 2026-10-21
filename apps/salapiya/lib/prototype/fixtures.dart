/// Synthetic presentation fixtures only. No production ledger or persistence.
abstract final class DemoMoney {
  static final liquid = BigInt.from(2930075);
  static final expense = BigInt.from(18550);
  static final card = BigInt.from(480000);
  static final maximumInput = BigInt.from(100000000000);

  static BigInt? parse(String input) {
    if (!RegExp(r'^(0|[1-9]\d*)(\.\d{1,2})?$').hasMatch(input)) return null;
    final parts = input.split('.');
    return BigInt.parse(parts[0]) * BigInt.from(100) +
        BigInt.parse(parts.length == 1 ? '0' : parts[1].padRight(2, '0'));
  }

  static String? validate(String? input) {
    final value = parse(input ?? '');
    if (value == null) {
      return 'Enter pesos with up to two decimals, without commas.';
    }
    if (value <= BigInt.zero) return 'Enter an amount greater than zero.';
    if (value > maximumInput) return 'Amount exceeds the demonstration limit.';
    return null;
  }

  static String format(BigInt value) {
    final digits = (value.abs() ~/ BigInt.from(100)).toString();
    final grouped = digits.replaceAllMapped(
      RegExp(r'(\d)(?=(\d{3})+$)'),
      (m) => '${m[1]},',
    );
    final cents = (value.abs() % BigInt.from(100)).toString().padLeft(2, '0');
    return '${value.isNegative ? '−' : ''}₱$grouped.$cents';
  }
}

enum DemoCoverage { complete, pending, incomplete, empty, loading, error }

enum DemoSync { localOnly, offline, waiting, pending, reconciled }

enum DemoReceipt { awaiting, confirmed, manual }

const demoAccounts = <(String, String)>[
  ('Cash wallet', '125000'),
  ('Everyday bank', '2485050'),
  ('Mobile wallet', '320025'),
];
