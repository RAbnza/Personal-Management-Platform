import 'dart:convert';
import 'dart:io';

import 'package:salapiya/local/finance_domain.dart';
import 'package:salapiya/local/local_store.dart' show defaultLocalCategories;
import 'package:salapiya/connected/financial_contract.dart';

// Explicit fixture regeneration only; tests independently compare stored plans.
void main() {
  final file = File('../../contracts/salapiya/p2_finance.json');
  final f = jsonDecode(file.readAsStringSync()) as Map<String, dynamic>;
  var s = LocalSnapshot(
    owner: f['profile'] as String,
    version: 0,
    accounts: [],
    categories: [
      for (final c in defaultLocalCategories)
        LocalCategory('category-${c.$1}', c.$2, c.$3),
    ],
    revisions: [],
  );
  for (final raw in f['commands'] as List) {
    final row = raw as Map<String, dynamic>;
    final c = LocalCommand(
      id: row['id'] as String,
      owner: s.owner,
      expectedVersion: s.version,
      kind: row['kind'] as String,
      values: Map<String, String>.from(row['values'] as Map),
    );
    final plan = planLocal(s, c);
    row['payload'] = c.payload;
    row['plan'] = financialPlanJson(plan);
    s = applyFinancialPlan(s, plan);
    row['balances'] = {for (final a in s.accounts) a.id: '${s.balance(a.id)}'};
  }
  file.writeAsStringSync('${const JsonEncoder.withIndent('  ').convert(f)}\n');
}
