import 'package:flutter/foundation.dart';

import '../../../prototype/fixtures.dart';
import '../contracts/financial_models.dart';
import 'financial_controller.dart';

class ImportRow {
  ImportRow(
    this.id,
    this.date,
    this.title,
    this.minor, {
    this.duplicate = false,
    this.error,
  });
  final String id, date, title, minor;
  final bool duplicate;
  final String? error;
  bool selected = true;
  String status = 'Ready';
  BigInt get amount => BigInt.parse(minor);
}

class ImportController extends ChangeNotifier {
  ImportController(this.finance) : batch = finance.nextCommand() {
    accountId = finance.activeAccounts.firstOrNull?.id ?? '';
  }
  final FinancialController finance;
  final String batch;
  bool _disposed = false;
  @override
  void notifyListeners() {
    if (!_disposed) super.notifyListeners();
  }

  @override
  void dispose() {
    cancelled = true;
    _disposed = true;
    super.dispose();
  }

  late String accountId;
  final rows = [
    ImportRow('1', '2026-10-16', 'Project milestone', '250000'),
    ImportRow('2', '2026-10-17', 'Market groceries', '-38500', duplicate: true),
    ImportRow('3', '2026-10-18', 'Bus fare', '-6500'),
    ImportRow(
      '4',
      '2026-10-19',
      'Malformed amount',
      '0',
      error: 'Three decimal places are unsupported.',
    )..selected = false,
  ];
  bool duplicateAcknowledged = false,
      rebase = false,
      reviewed = false,
      running = false,
      cancelled = false,
      uncertain = false,
      partial = false;
  String earlierOpening = '', error = '', simulation = 'Complete';
  int? reviewedVersion;
  BigInt get selectedNet => ExactFinance.sum(
    rows.where((r) => r.selected && r.error == null).map((r) => r.amount),
  );
  BigInt get derivedOpening =>
      finance.activeAccounts.any((a) => a.id == accountId)
      ? finance.account(accountId).openingBalance - selectedNet
      : BigInt.zero;
  void chooseSimulation(String value) {
    simulation = value;
    notifyListeners();
  }

  int get accepted => rows
      .where((r) => r.status == 'Accepted demo' || r.status == 'Uncertain')
      .length;
  void refresh() {
    reviewed = false;
    notifyListeners();
  }

  bool validate() {
    error = '';
    if (!finance.activeAccounts.any((a) => a.id == accountId)) {
      error = 'Select an active liquid account.';
    }
    if (!rows.any((r) => r.selected)) error = 'Select at least one row.';
    if (rows.any((r) => r.selected && r.error != null)) {
      error = 'Exclude invalid rows before review.';
    }
    if (rows.any((r) => r.selected && r.duplicate) && !duplicateAcknowledged) {
      error = 'Acknowledge the duplicate warning or exclude that row.';
    }
    if (rebase && DemoMoney.parse(earlierOpening) != derivedOpening) error = 'Opening equation does not match: earlier opening + selected history net must equal the existing baseline.';
    if (rebase && derivedOpening < BigInt.zero) error = 'This example needs a nonnegative earlier opening. Select another account or exclude the income row.';
    if (error.isNotEmpty) {
      notifyListeners();
      return false;
    }
    reviewed = true;
    reviewedVersion = finance.version;
    notifyListeners();
    return true;
  }

  Future<void> process() async {
    if (running || uncertain || cancelled) return;
    if (accepted == 0 && reviewedVersion != finance.version) {
      error = 'Account snapshot changed. Review again; no rows applied.';
      reviewed = false;
      notifyListeners();
      return;
    }
    running = true;
    partial = false;
    error = '';
    notifyListeners();
    if (rebase) {
      await Future<void>.delayed(const Duration(milliseconds: 400));
      if (!cancelled) {
        final selected = rows.where((r) => r.selected).toList();
        finance.applyHistoricalImport(
          batch,
          accountId,
          DemoMoney.parse(earlierOpening)!,
          selectedNet,
          [for (final r in selected) (r.id, r.title, r.amount)],
        );
        for (final r in selected) {
          r.status = 'Accepted demo';
        }
      }
    } else {
      for (final row in rows.where(
        (r) => r.selected && r.status != 'Accepted demo',
      )) {
        if (cancelled) break;
        await Future<void>.delayed(const Duration(milliseconds: 350));
        if (cancelled) break;
        final action = row.amount > BigInt.zero
            ? FinancialAction.income
            : FinancialAction.expense;
        final v = finance.defaults(action)
          ..addAll({
            'name': row.title,
            'amount': ExactFinance.decimal(row.amount.abs()),
            'account': accountId,
            'date': row.date,
            'category': row.amount > BigInt.zero ? 'Income' : 'Other',
          });
        final p = finance.preview(action, v, '$batch-row-${row.id}');
        if (!p.valid) {
          row.status = 'Needs review';
          error = p.errors.join('\n');
          break;
        }
        final result = finance.execute(
          p,
          simulation == 'Uncertain result'
              ? DemoOutcome.unknown
              : DemoOutcome.accepted,
        );
        row.status = result == DemoOutcome.unknown
            ? 'Uncertain'
            : 'Accepted demo';
        notifyListeners();
        if (result == DemoOutcome.unknown) {
          uncertain = true;
          break;
        }
        if (simulation == 'Partial success') {
          partial = true;
          break;
        }
      }
    }
    running = false;
    notifyListeners();
  }

  void checkOriginal() {
    for (final r in rows.where((r) => r.status == 'Uncertain')) {
      if (finance.checkResult('$batch-row-${r.id}') == DemoOutcome.accepted) {
        r.status = 'Accepted demo';
      }
    }
    uncertain = false;
    simulation = 'Complete';
    notifyListeners();
  }

  void cancel() {
    cancelled = true;
    notifyListeners();
  }
}
