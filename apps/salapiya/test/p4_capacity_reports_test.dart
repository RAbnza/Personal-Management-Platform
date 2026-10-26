import 'dart:convert';

import 'package:csv/csv.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/finance/reports_screen.dart';
import 'package:salapiya/local/finance_domain.dart';

import 'local_test_support.dart';
import 'p4_import_test.dart'
    show stageCashImport, decideCashImport, processCashImport;

void main() {
  test('maximum cash batch processes exactly once and full filtered export exceeds visible paging', () async {
    final f = await LocalFixture.open();
    addTearDown(f.close);
    final account = await f.account('Capacity wallet', '1000.00');
    final content =
        'date,kind,amount_minor,classification,description,reference\n'
        '${List.generate(500, (i) => '2026-10-22,income,1,earned,Bounded row $i,capacity-$i').join('\n')}';
    expect(parseCashCsv(utf8.encode(content)), hasLength(501));
    expect(
      () => parseCashCsv(
        utf8.encode('$content\n2026-10-22,income,1,earned,Over bound,over'),
      ),
      throwsA(isA<LocalRuleException>()),
    );
    final preview = await stageCashImport(f, account, content);
    final decision = await decideCashImport(f, preview);
    for (var i = 0; i < 10; i++) {
      final command = await processCashImport(f, decision);
      final receipt = await f.store.commit(command);
      expect(await f.store.commit(command), receipt);
    }
    var s = await f.store.snapshot();
    expect(s.balance(account), BigInt.from(100500));
    expect(nextCashImportRows(s, s.revision(decision)), isEmpty);
    expect(s.current.where((r) => r.kind == 'income'), hasLength(500));
    await f.post('income', {
      'name': '=SUM(1,2)',
      'date': '2026-10-23',
      'account': account,
      'amount': '1.00',
      'category': 'category-income',
      'incomeClass': 'earned',
    });
    s = await f.store.snapshot();
    final rows = Csv(dynamicTyping: false)
        .decode(financialCsv(s, '2026-10-22', '2026-10-24', account: account));
    expect(rows, hasLength(503)); // metadata/header plus every cash posting
    expect(rows.last[4], "'=SUM(1,2)");
    expect(
      rows.skip(2).every((r) => r[5] == 'cash' && r[6] == account),
      isTrue,
    );
    expect(
      sumMinor(
        rows
            .skip(2)
            .map((r) => BigInt.parse(r[8].toString().replaceFirst("'", ''))),
      ),
      BigInt.from(600),
    );
    expect(
      Csv(dynamicTyping: false).decode(
        financialCsv(
          s,
          '2026-10-22',
          '2026-10-23',
          category: 'category-income',
        ),
      ),
      hasLength(502),
    );
    await f.store.integrity();
  });
}
