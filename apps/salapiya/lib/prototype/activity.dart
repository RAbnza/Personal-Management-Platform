import 'fixtures.dart';

/// Invented, accepted cash movements for 15–21 October 2026. All calculations
/// stay in integer centavos; conversion to double is only for chart geometry.
class DemoEntry {
  const DemoEntry(
    this.day,
    this.title,
    this.category,
    this.account,
    this.centavos,
  );
  final int day, centavos;
  final String title, category, account;
  BigInt get amount => BigInt.from(centavos);
  bool get income => centavos > 0;
}

abstract final class DemoActivity {
  static const entries = [
    DemoEntry(21, 'Morning coffee', 'Food & drink', 'Mobile wallet', -16500),
    DemoEntry(21, 'Jeepney & train', 'Transport', 'Cash wallet', -9600),
    DemoEntry(20, 'Weekly groceries', 'Groceries', 'Everyday bank', -128000),
    DemoEntry(
      20,
      'Lunch at the carinderia',
      'Food & drink',
      'Cash wallet',
      -12000,
    ),
    DemoEntry(19, 'Internet subscription', 'Bills', 'Everyday bank', -149900),
    DemoEntry(19, 'Afternoon merienda', 'Food & drink', 'Cash wallet', -8500),
    DemoEntry(18, 'Project payment', 'Income', 'Everyday bank', 1800000),
    DemoEntry(18, 'Market vegetables', 'Groceries', 'Cash wallet', -38500),
    DemoEntry(17, 'Train fare', 'Transport', 'Mobile wallet', -5600),
    DemoEntry(
      16,
      'Lunch with a friend',
      'Food & drink',
      'Mobile wallet',
      -42000,
    ),
    DemoEntry(15, 'Pantry essentials', 'Groceries', 'Everyday bank', -64000),
  ];
  static BigInt total(Iterable<DemoEntry> records) =>
      records.fold(BigInt.zero, (sum, entry) => sum + entry.amount);
  static BigInt get incoming => total(entries.where((e) => e.income));
  static BigInt get outgoing => -total(entries.where((e) => !e.income));
  static BigInt get opening => DemoMoney.liquid - total(entries);
  static BigInt spentOn(int day) =>
      -total(entries.where((e) => e.day == day && !e.income));
  static BigInt categoryTotal(String category) =>
      -total(entries.where((e) => e.category == category));
  static const categories = ['Groceries', 'Bills', 'Food & drink', 'Transport'];
}
