import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/prototype/scenarios.dart';
import 'package:salapiya/features/planning/application/planning_controller.dart';
import 'package:salapiya/features/finance/application/financial_controller.dart';
import 'package:salapiya/features/finance/contracts/financial_models.dart';

void main() {
  test('empty profiles have no installment expectation; paid debt coverage is not guessed', () {
    final s = PrototypeSession();
    addTearDown(s.dispose);
    final d = s.finance.debts.first;
    d.contractualPaid = BigInt.one;
    expect(
      s.life
          .agenda(s.planning, s.finance)
          .firstWhere((e) => e.sourceId == d.id)
          .amount,
      isNull,
    );
    d.contractualPaid = d.expected * BigInt.from(d.installments);
    expect(
      s.life.agenda(s.planning, s.finance).where((e) => e.sourceId == d.id),
      isEmpty,
    );
    s.replaceProfile(empty: true, name: 'Local');
    expect(s.finance.installmentCount, 0);
    expect(s.life.agenda(s.planning, s.finance), isEmpty);
  });
  test('split category budgets and corrections preserve exact allocations', () {
    final s = PrototypeSession();
    addTearDown(s.dispose);
    final f = s.finance;
    BigInt food() =>
        s.planning.spending('2026-10-21', '2026-10-21', 'Food & drink', 'Net');
    BigInt transport() =>
        s.planning.spending('2026-10-21', '2026-10-21', 'Transport', 'Net');
    final foodBefore = food(), transportBefore = transport();
    final p = f.preview(
      FinancialAction.expense,
      f.defaults(FinancialAction.expense)..addAll({
        'name': 'Lunch and fare',
        'split': 'true',
        'splitAmount': '150.00',
        'splitCategory': 'Transport',
      }),
      f.nextCommand(),
    );
    expect(p.errors, isEmpty);
    f.execute(p, DemoOutcome.accepted);
    expect(food() - foodBefore, BigInt.from(15000));
    expect(transport() - transportBefore, BigInt.from(3550));
    final reversal = f.preview(
      FinancialAction.reversal,
      f.defaults(FinancialAction.reversal)
        ..addAll({'source': p.commandId, 'reason': 'Wrong entry'}),
      f.nextCommand(),
    );
    expect(reversal.errors, isEmpty);
    f.execute(reversal, DemoOutcome.accepted);
    expect(food(), foodBefore);
    expect(transport(), transportBefore);
  });
  test(
    'statement versions, allocations and plan creation do not post money',
    () {
      final s = PrototypeSession();
      addTearDown(s.dispose);
      final f = s.finance;
      final cash = f.liquid, card = f.cardBalance;
      f.saveStatementEvidence({
        'start': '2026-10-15',
        'end': '2026-11-14',
        'issued': '2026-11-15',
        'due': '2026-11-27',
        'amount': '2500.00',
        'minimum': '250',
        'reference': 'NOV-DEMO',
      });
      final first = f.activeStatement;
      f.saveStatementEvidence({
        'start': first.start,
        'end': first.end,
        'issued': first.issued,
        'due': first.due,
        'amount': '2600.00',
        'minimum': '250',
        'reference': first.reference,
        'reason': 'Provider revision',
      }, old: first);
      expect(f.activeStatement.previous, same(first));
      expect(f.statementBalance, BigInt.from(260000));
      f.savePlanEvidence({
        'name': 'Desk',
        'source': 'Opening evidence',
        'amount': '500',
        'count': '6',
        'due': '2026-10-31',
        'principal': '2800',
        'interest': '150',
        'fee': '50',
        'reference': 'PLAN',
      });
      expect(f.liquid, cash);
      expect(f.cardBalance, card);
      final values = f.defaults(FinancialAction.cardPayment)
        ..addAll({
          'amount': '1000',
          'allocation': '250',
          'evidence': 'Provider receipt',
        });
      final p = f.preview(FinancialAction.cardPayment, values, f.nextCommand());
      expect(p.errors, isEmpty);
      f.execute(p, DemoOutcome.accepted);
      final after = f.liquid;
      f.allocateCardEvidence(p.commandId, BigInt.from(50000));
      expect(f.statementAllocated, BigInt.from(75000));
      expect(
        () => f.allocateCardEvidence(p.commandId, BigInt.from(50000)),
        throwsFormatException,
      );
      f.allocateCardEvidence(p.commandId, BigInt.zero, reverse: true);
      expect(f.statementAllocated, BigInt.zero);
      expect(f.liquid, after);
      f.selectStatement('statement-oct');
      expect(f.statementBalance, BigInt.from(480000));
    },
  );
  test('former entitlement excludes new sources; owner role never grants private authority', () {
    final s = PrototypeSession();
    addTearDown(s.dispose);
    final f = s.finance;
    f.setActor('Tala', true);
    final entitled = f.groupBills.map((b) => b.id).toList();
    f.bills.add(
      SharedBill(
        id: 'later',
        title: 'Later bill',
        total: BigInt.from(100),
        paid: {'Amihan': BigInt.from(100)},
        shares: {'Amihan': BigInt.from(100)},
      ),
    );
    expect(f.groupBills.map((b) => b.id).toList(), entitled);
    f.setActor('Amihan', false);
    f.groupOwners['household'] = 'Tala';
    expect(
      f
          .preview(
            FinancialAction.member,
            f.defaults(FinancialAction.member),
            f.nextCommand(),
          )
          .valid,
      isFalse,
    );
    f.setActor('Tala', false);
    expect(f.isGroupOwner, isTrue);
    expect(
      f
          .preview(
            FinancialAction.adoption,
            f.defaults(FinancialAction.adoption),
            f.nextCommand(),
          )
          .valid,
      isFalse,
    );
  });
  test(
    'plans preserve cash, links cap actuals, reservations share support',
    () {
      final s = PrototypeSession();
      addTearDown(s.dispose);
      final p = s.planning;
      final before = s.finance.liquid;
      final o = p.occurrences.first;
      final r = s.finance.records.firstWhere((r) => r.kind == 'expense');
      p.link(o, r, BigInt.one);
      expect(() => p.link(o, r, r.amount), throwsFormatException);
      expect(s.finance.planningDependencies, contains(r.id));
      p.unlink(o, r.id);
      expect(s.finance.planningDependencies, isNot(contains(r.id)));
      final count = p.occurrences.length;
      p.generate(p.rules.first, '2026-10-21', '2026-12-31');
      expect(p.occurrences.length, count);
      p.exception(o, 'Skip', o.due, '1850.00', 'Already covered');
      p.generate(p.rules.first, '2026-10-21', '2026-12-31');
      expect(o.state, 'Skipped');
      expect(
        () => p.saveBudget({
          'start': '2026-10-20',
          'end': '2026-11-20',
          'category': 'Food & drink',
          'amount': '0',
          'basis': 'Net',
        }),
        throwsFormatException,
      );
      expect(s.finance.liquid, before);
      s.finance.account('account-1').balance = BigInt.from(1000000);
      final range = p.support(p.goals.first);
      expect(range.$1, BigInt.from(500000));
      expect(range.$2, BigInt.from(1000000));
      expect(
        () => p.reserve(p.goals.first, 'account-1', BigInt.from(1300000)),
        throwsFormatException,
      );
      p.reserve(p.goals.first, 'account-1', BigInt.zero);
      expect(p.goals.first.reserved, BigInt.zero);
    },
  );
  test('monthly short-month and weekly rules are deterministic', () {
    final s = PrototypeSession();
    addTearDown(s.dispose);
    final r = PlanRule(
      'test',
      'month end',
      'Bill',
      BigInt.one,
      '2026-01-31',
      'Monthly',
      1,
      31,
      'Last valid day',
      'account-1',
      '',
      3,
      {1},
    );
    expect(s.planning.dates(r, '2026-01-31', '2026-04-30'), [
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
    ]);
    expect(() => minor('1.001'), throwsFormatException);
    expect(() => dateValue('2026-02-30'), throwsFormatException);
  });
}
