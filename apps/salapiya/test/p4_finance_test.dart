import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/local/finance_domain.dart';
import 'package:salapiya/connected/financial_contract.dart';

import 'local_test_support.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late LocalFixture f;
  setUp(() async {
    f = await LocalFixture.open(owner: '40000000-0000-4000-8000-000000000000');
  });
  tearDown(() => f.close());
  Future<String> card() => f.post('creditCard', {
    'name': 'Synthetic card',
    'issuer': 'Synthetic issuer',
    'amount': '0.00',
    'limit': '10000.00',
  });
  Future<String> purchase(String card, [String amount = '1200.00']) =>
      f.post('cardPurchase', {
        'name': 'Shared dinner',
        'card': card,
        'amount': amount,
        'postingDate': '2026-10-22',
        'category': 'category-food',
      });
  test('card spending, repayments, refund and credit remain separate from liquid cash', () async {
    final account = await f.account('Wallet', '5000.00'), id = await card();
    final buy = await purchase(id);
    var s = await f.store.snapshot();
    expect(s.balance(account), BigInt.from(500000));
    expect(
      financeBalance(s, 'card_liability', 'card', id),
      BigInt.from(-120000),
    );
    final payment = await f.command('cardPayment', {
      'name': 'Payment',
      'card': id,
      'account': account,
      'amount': '1500.00',
    });
    await f.store.commit(payment);
    await f.store.commit(payment);
    await f.post('cardRefund', {
      'name': 'Partial refund',
      'card': id,
      'purchase': buy,
      'amount': '100.00',
      'category': 'category-food',
      'reason': 'Provider refund',
    });
    s = await f.store.snapshot();
    expect(s.balance(account), BigInt.from(350000));
    expect(financeBalance(s, 'card_liability', 'card', id), BigInt.from(40000));
    expect(
      sumMinor(
        s.current
            .expand((r) => r.postings)
            .where((p) => p.ledger == 'expense')
            .map((p) => p.amount),
      ),
      BigInt.from(110000),
    );
    await f.store.integrity();
  });
  test('provider statements and allocations never post and enforce shared capacities', () async {
    final account = await f.account('Wallet', '5000.00'), id = await card();
    await purchase(id);
    final statement = await f.post('statement', {
      'name': 'October',
      'card': id,
      'start': '2026-10-01',
      'end': '2026-10-21',
      'issued': '2026-10-21',
      'due': '2026-11-10',
      'amount': '1200.00',
      'minimum': '100.00',
      'reference': 'Synthetic statement',
      'verified': 'true',
    });
    final payment = await f.post('cardPayment', {
      'name': 'Partial',
      'card': id,
      'account': account,
      'amount': '500.00',
    });
    final allocation = {
      'name': 'Confirmed coverage',
      'card': id,
      'statement': statement,
      'payment': payment,
      'amount': '300.00',
      'verified': 'true',
    };
    await f.post('cardAllocation', allocation);
    await expectLater(
      f.post('cardAllocation', allocation),
      throwsA(isA<LocalRuleException>()),
    );
    expect((await f.store.snapshot()).revision(statement).postings, isEmpty);
    final correction = await f.command('financeCorrection', {
      'replace': statement,
      'replaceVersion': '1',
      'reason': 'Provider correction',
      'amount': '1300.00',
    });
    await expectLater(
      f.store.commit(correction),
      throwsA(isA<LocalRuleException>()),
    );
    await f.store.integrity();
  });
  test(
    'installments retain explicit schedule evidence without another expense',
    () async {
      final id = await card(), buy = await purchase(id);
      final plan = await f.post('installment', {
        'name': 'Three installments',
        'card': id,
        'purchase': buy,
        'schedule': 'one,2026-11-01,400.00\ntwo,2026-12-01,400.00\nthree,2027-01-01,400.00',
        'principal': '1200.00',
        'interest': '0.00',
        'fee': '0.00',
        'reference': 'Confirmed plan',
        'verified': 'true',
      });
      expect((await f.store.snapshot()).revision(plan).postings, isEmpty);
      expect(
        financeSchedule('leap,2028-02-29,1.01').single.amount,
        BigInt.from(101),
      );
      expect(
        () => financeSchedule('bad,2026-02-30,1.00'),
        throwsFormatException,
      );
      await expectLater(
        f.post('financeReversal', {
          'replace': buy,
          'replaceVersion': '1',
          'reason': 'Dependent plan',
        }),
        throwsA(isA<LocalRuleException>()),
      );
    },
  );
  test('failed card write rolls back all evidence; authorization and stale/foreign sources fail closed', () async {
    final id = await card();
    final command = await f.command('cardPurchase', {
      'name': 'Interrupted',
      'card': id,
      'amount': '1.00',
      'postingDate': '2026-10-21',
      'category': 'category-food',
    });
    await expectLater(
      f.store.commit(command, interrupt: true),
      throwsStateError,
    );
    expect(await f.store.hasReceipt(command.id), false);
    await f.store.commit(command);
    await expectLater(
      f.post('cardRefund', {
        'name': 'Foreign',
        'card': newLocalId(),
        'purchase': command.id,
        'amount': '0.01',
        'category': 'category-food',
        'reason': 'Invalid',
      }),
      throwsA(isA<LocalRuleException>()),
    );
    final auth = await f.post('cardAuthorization', {
      'name': 'Pending',
      'card': id,
      'amount': '100.00',
      'reference': 'auth-1',
    });
    expect((await f.store.snapshot()).revision(auth).postings, isEmpty);
  });
  test('export the same canonical card command plans for independent PostgreSQL parity', () async {
    final commands = <Map<String, dynamic>>[];
    Future<String> post(String kind, Map<String, String> values) async {
      final c = await f.command(
            kind,
            {'date': '2026-10-21', ...values},
            id: '40000000-0000-4000-8000-${(commands.length + 1).toString().padLeft(12, '0')}',
          ),
          snap = await f.store.snapshot();
      final plan = planLocal(snap, c);
      commands.add({
        'id': c.id,
        'payload': c.payload,
        'plan': financialPlanJson(plan),
      });
      await f.store.commit(c, recordedAt: '2026-10-26T00:00:00.000Z');
      return c.id;
    }

    final account = await post('account', {
      'name': 'Parity wallet',
      'kind': 'Cash',
      'cutoff': '2026-10-01',
      'amount': '10000.00',
    });
    final id = await post('creditCard', {
      'name': 'Parity card',
      'issuer': 'Test',
      'amount': '200.00',
      'limit': '10000.00',
    });
    final buy = await post('expense', {
      'name': 'Card through expense',
      'funding': 'card',
      'card': id,
      'amount': '1200.00',
      'postingDate': '2026-10-23',
      'category': 'category-food',
    });
    final statement = await post('statement', {
      'name': 'October',
      'card': id,
      'start': '2026-10-01',
      'end': '2026-10-21',
      'issued': '2026-10-21',
      'due': '2026-11-10',
      'amount': '1400.00',
      'minimum': '100.00',
      'reference': 'fixture',
      'verified': 'true',
    });
    final payment = await post('cardPayment', {
      'name': 'Repayment',
      'card': id,
      'account': account,
      'amount': '500.00',
    });
    final allocation = await post('cardAllocation', {
      'name': 'Allocated',
      'card': id,
      'payment': payment,
      'statement': statement,
      'amount': '500.00',
      'verified': 'true',
    });
    final plan = await post('installment', {
      'name': 'Plan',
      'card': id,
      'purchase': buy,
      'schedule': 'one,2026-11-10,400.00\ntwo,2026-12-10,800.00',
      'reference': 'provider',
      'verified': 'true',
    });
    await post('installmentApplication', {
      'name': 'Applied',
      'card': id,
      'plan': plan,
      'row': 'one',
      'payment': allocation,
      'amount': '400.00',
      'verified': 'true',
    });
    await post('cardFee', {
      'name': 'Fee',
      'card': id,
      'amount': '10.01',
      'postingDate': '2026-10-22',
      'category': 'category-fees',
    });
    await post('cardInterest', {
      'name': 'Interest',
      'card': id,
      'amount': '20.02',
      'postingDate': '2026-10-22',
      'category': 'category-fees',
    });
    await post('cardRefund', {
      'name': 'Refund',
      'card': id,
      'purchase': buy,
      'amount': '100.01',
      'category': 'category-food',
      'reason': 'Partial return',
    });
    await post('cardAuthorization', {
      'name': 'Pending',
      'card': id,
      'amount': '200.00',
      'reference': 'auth-1',
    });
    final imported = await post('debtImport', {
      'name': 'Imported provider debt',
      'lender': 'Synthetic lender',
      'debtType': 'installment_loan',
      'amount': '6400.00',
      'principal': '',
    });
    final schedule = await post('debtSchedule', {
      'name': 'Known provider schedule',
      'debt': imported,
      'schedule': 'first,2026-11-01,3200.00,1000.00\nsecond,2026-12-01,3200.00',
      'verified': 'true',
      'reference': 'schedule',
    });
    final unresolved = await post('debtPayment', {
      'name': 'Unknown breakdown',
      'debt': imported,
      'account': account,
      'amount': '1000.00',
      'externalFee': '0.00',
      'reduction': '0.00',
      'interest': '0.00',
      'fee': '0.00',
      'clearing': '1000.00',
      'certainty': 'unresolved',
      'allocations': '',
      'unapplied': '1000.00',
    });
    await post('debtClassification', {
      'name': 'Provider classified payment',
      'debt': imported,
      'payment': unresolved,
      'reduction': '900.00',
      'interest': '100.00',
      'fee': '0.00',
      'interestCategory': 'category-fees',
      'reason': 'Provider breakdown received',
    });
    await post('debtPayment', {
      'name': 'Partial installment',
      'debt': imported,
      'account': account,
      'amount': '100.00',
      'externalFee': '0.00',
      'reduction': '100.00',
      'interest': '0.00',
      'fee': '0.00',
      'clearing': '0.00',
      'certainty': 'confirmed_total',
      'scheduleSource': schedule,
      'allocations': 'first,100.00',
      'unapplied': '0.00',
    });
    await post('financeCorrection', {
      'replace': schedule,
      'replaceVersion': '1',
      'reason': 'Retain allocation mapping under revised due dates',
      'schedule': 'first,2026-11-05,3200.00,1000.00\nsecond,2026-12-05,3200.00',
    });
    await post('debtPayoff', {
      'name': 'Confirmed early payoff',
      'debt': imported,
      'account': account,
      'amount': '5000.00',
      'providerPayoff': '5000.00',
      'reduction': '5000.00',
      'interest': '0.00',
      'fee': '0.00',
      'waiver': '400.00',
      'waiverBasis': 'imported_unknown',
      'avoided': '200.00',
      'verified': 'true',
      'reference': 'payoff',
      'reason': 'Provider closes obligation',
    });
    await post('borrowing', {
      'name': 'Net proceeds',
      'lender': 'Synthetic lender',
      'debtType': 'personal_loan',
      'amount': '10000.00',
      'principal': '10000.00',
      'fundingUse': 'cash',
      'account': account,
      'withheld': '200.00',
      'financedFee': '0.00',
      'feeCategory': 'category-fees',
    });
    await post('budget', {
      'name': 'October food allowance',
      'amount': '0.00',
      'category': 'category-food',
      'start': '2026-10-01',
      'endExclusive': '2026-11-01',
      'basis': 'net',
      'status': 'active',
    });
    final goalA = await post('savingsGoal', {
      'name': 'Safety buffer',
      'amount': '6000.00',
      'status': 'active',
    });
    final goalB = await post('savingsGoal', {
      'name': 'Equipment',
      'amount': '4000.00',
      'status': 'active',
    });
    await post('reservation', {
      'name': 'Reserve buffer',
      'goal': goalA,
      'account': account,
      'amount': '6000.00',
    });
    await post('reservation', {
      'name': 'Reserve equipment',
      'goal': goalB,
      'account': account,
      'amount': '4000.00',
    });
    await post('savingsReallocation', {
      'name': 'Explicit reallocation',
      'fromGoal': goalA,
      'fromAccount': account,
      'goal': goalB,
      'account': account,
      'amount': '1000.00',
    });
    await post('financeCorrection', {
      'replace': goalA,
      'replaceVersion': '1',
      'reason': 'Explicit management completion',
      'status': 'completed',
    });
    await post('reservation', {
      'name': 'Release part of completed goal',
      'goal': goalA,
      'account': account,
      'amount': '4000.00',
    });
    final recurring = await post('recurrence', {
      'name': 'Monthly utility',
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
    });
    await post('recurrenceGenerate', {
      'name': 'Explicit two-month window',
      'rule': recurring,
      'from': '2026-10-21',
      'through': '2026-11-21',
    });
    final recurringLink = await post('recurrenceLink', {
      'name': 'Partial actual purchase evidence',
      'rule': recurring,
      'logicalDate': '2026-10-21',
      'actual': buy,
      'amount': '50.00',
    });
    await post('recurrenceUnlink', {
      'name': 'Reverse exact actual link',
      'link': recurringLink,
      'reason': 'Wrong occurrence',
    });
    await post('occurrenceOverride', {
      'name': 'One due-date change',
      'rule': recurring,
      'logicalDate': '2026-11-21',
      'amount': '200.00',
      'due': '2026-11-22',
      'state': 'planned',
      'reason': 'Provider changed this due only',
    });
    final file = File('../../contracts/salapiya/p4_finance.json');
    final fixture = {'profile': f.store.owner, 'commands': commands};
    if (const bool.fromEnvironment('P4_WRITE_FIXTURES')) {
      await file.writeAsString(
        '${const JsonEncoder.withIndent('  ').convert(fixture)}\n',
      );
    } else {
      expect(jsonDecode(await file.readAsString()), fixture);
    }
  });
}
