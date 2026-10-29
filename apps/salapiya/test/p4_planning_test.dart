import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/local/finance_domain.dart';

import 'local_test_support.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late LocalFixture f;
  setUp(() async {
    f = await LocalFixture.open();
  });
  tearDown(() => f.close());
  test('monthly last-valid-day, skip, leap year, historical counts and selected weekdays are exact', () {
    final rule = {
      'start': '2024-01-31',
      'frequency': 'monthly',
      'interval': '1',
      'monthDay': '31',
      'monthPolicy': 'last_valid_day',
      'timezone': 'America/New_York',
      'count': '',
    };
    expect(recurringDates(rule, '2024-01-01', '2024-04-30'), [
      '2024-01-31',
      '2024-02-29',
      '2024-03-31',
      '2024-04-30',
    ]);
    expect(
      recurringDates(
        {...rule, 'monthPolicy': 'skip'},
        '2024-02-01',
        '2024-04-30',
      ),
      ['2024-03-31'],
    );
    expect(
      recurringDates({...rule, 'count': '2'}, '2024-03-01', '2024-04-30'),
      isEmpty,
    );
    expect(
      recurringDates(
        {
          ...rule,
          'start': '2024-01-03',
          'frequency': 'weekly',
          'weekdays': '1,5',
          'interval': '2',
        },
        '2024-01-01',
        '2024-01-31',
      ),
      ['2024-01-05', '2024-01-15', '2024-01-19', '2024-01-29'],
    );
    expect(
      () => recurringDates(
        {...rule, 'timezone': 'Invented/Zone'},
        '2024-01-01',
        '2024-02-01',
      ),
      throwsA(isA<LocalRuleException>()),
    );
  });
  test('partial actual links, exact reversal and correction dependencies never post planning money', () async {
    final account = await f.account('Wallet', '1000.00');
    final actual = await f.post('expense', {
      'name': 'Actual utility',
      'amount': '100.00',
      'account': account,
      'category': 'category-bills',
    });
    final rule = await f.post('recurrence', {
      'name': 'Utility',
      'amount': '200.00',
      'recurringKind': 'bill',
      'frequency': 'monthly',
      'interval': '1',
      'start': '2026-10-21',
      'monthDay': '21',
      'monthPolicy': 'last_valid_day',
      'timezone': 'Asia/Manila',
      'status': 'active',
      'account': account,
      'category': 'category-bills',
    });
    await f.post('recurrenceGenerate', {
      'name': 'Explicit generation',
      'rule': rule,
      'from': '2026-10-21',
      'through': '2026-11-21',
    });
    final link = await f.post('recurrenceLink', {
      'name': 'Partial evidence',
      'rule': rule,
      'logicalDate': '2026-10-21',
      'actual': actual,
      'amount': '100.00',
    });
    expect((await f.store.snapshot()).balance(account), BigInt.from(90000));
    await expectLater(
      f.post('reversal', {
        'source': actual,
        'sourceVersion': '1',
        'reason': 'Dependent link',
      }),
      throwsA(isA<LocalRuleException>()),
    );
    await f.post('recurrenceUnlink', {
      'name': 'Reverse exact link',
      'link': link,
      'reason': 'Wrong planned occurrence',
    });
    await f.post('reversal', {
      'source': actual,
      'sourceVersion': '1',
      'reason': 'Now unlinked',
    });
    expect((await f.store.snapshot()).balance(account), BigInt.from(100000));
    await f.store.integrity();
  });
  test('budget zero, adjacency, archived overlap, net/gross and refunds use economic dates', () async {
    final account = await f.account('Wallet', '1000.00');
    final budget = await f.post('budget', {
      'name': 'Food October',
      'amount': '0.00',
      'category': 'category-food',
      'start': '2026-10-01',
      'endExclusive': '2026-11-01',
      'basis': 'net',
      'status': 'active',
    });
    final expense = await f.post('expense', {
      'name': 'Food',
      'amount': '100.00',
      'account': account,
      'category': 'category-food',
    });
    await f.post('refund', {
      'source': expense,
      'sourceVersion': '1',
      'amount': '25.00',
      'account': account,
      'refundCategory': 'category-food',
      'reason': 'Returned',
    });
    var s = await f.store.snapshot();
    expect(budgetSpending(s, s.revision(budget)), BigInt.from(7500));
    final archived = await f.post('financeCorrection', {
      'replace': budget,
      'replaceVersion': '1',
      'reason': 'Retain old period',
      'status': 'archived',
      'basis': 'gross',
    });
    s = await f.store.snapshot();
    expect(budgetSpending(s, s.revision(archived)), BigInt.from(10000));
    await expectLater(
      f.post('budget', {
        'name': 'Overlap',
        'amount': '100.00',
        'category': 'category-food',
        'start': '2026-10-31',
        'endExclusive': '2026-11-30',
        'basis': 'net',
        'status': 'active',
      }),
      throwsA(isA<LocalRuleException>()),
    );
    await f.post('budget', {
      'name': 'Adjacent',
      'amount': '100.00',
      'category': 'category-food',
      'start': '2026-11-01',
      'endExclusive': '2026-12-01',
      'basis': 'net',
      'status': 'active',
    });
  });
  test('shared savings reservations show supported ranges after real spending; future cash is excluded', () async {
    final account = await f.account('Wallet', '1000.00');
    final a = await f.post('savingsGoal', {
          'name': 'A',
          'amount': '600.00',
          'status': 'active',
        }),
        b = await f.post('savingsGoal', {
          'name': 'B',
          'amount': '400.00',
          'status': 'active',
        });
    await f.post('reservation', {
      'name': 'Reserve A',
      'goal': a,
      'account': account,
      'amount': '600.00',
    });
    await f.post('reservation', {
      'name': 'Reserve B',
      'goal': b,
      'account': account,
      'amount': '400.00',
    });
    await f.post('expense', {
      'name': 'Actual spend',
      'account': account,
      'amount': '500.00',
      'category': 'category-food',
    });
    var s = await f.store.snapshot();
    expect(s.balance(account), BigInt.from(50000));
    expect(supportedSavings(s, a, '2026-10-21'), (
      BigInt.from(10000),
      BigInt.from(50000),
    ));
    expect(supportedSavings(s, b, '2026-10-21'), (
      BigInt.zero,
      BigInt.from(40000),
    ));
    await expectLater(
      f.post('reservation', {
        'name': 'Unsupported increase',
        'goal': a,
        'account': account,
        'amount': '700.00',
      }),
      throwsA(isA<LocalRuleException>()),
    );
    await f.post('reservation', {
      'name': 'Release while underfunded',
      'goal': a,
      'account': account,
      'amount': '0.00',
    });
    await f.post('income', {
      'name': 'Future income',
      'account': account,
      'amount': '10000.00',
      'date': '2027-01-01',
      'category': 'category-income',
      'incomeClass': 'earned',
    });
    s = await f.store.snapshot();
    expect(eligibleSavings(s, account, '2026-10-21'), BigInt.from(50000));
    expect(savingsReserved(s), BigInt.from(40000));
    await f.store.integrity();
  });
}
