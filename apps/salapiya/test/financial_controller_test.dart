import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/features/finance/application/financial_controller.dart';
import 'package:salapiya/features/finance/application/import_controller.dart';
import 'package:salapiya/features/finance/contracts/financial_models.dart';
import 'package:salapiya/prototype/fixtures.dart';

void main() {
  late FinancialController c;
  setUp(() => c = FinancialController());
  FinancialPreview preview(
    FinancialAction a, [
    Map<String, String> values = const {},
  ]) => c.preview(a, c.defaults(a)..addAll(values), c.nextCommand());
  FinancialPreview apply(
    FinancialAction a, [
    Map<String, String> values = const {},
  ]) {
    final p = preview(a, values);
    expect(p.errors, isEmpty, reason: '${a.name}: ${p.errors}');
    expect(c.execute(p, DemoOutcome.accepted), DemoOutcome.accepted);
    return p;
  }

  test('group history stays scoped and excludes private review notes', () {
    apply(FinancialAction.adoption, {'funding': 'New cash'});
    apply(FinancialAction.privateReview, {
      'decision': 'Retain private evidence',
      'reason': 'Private owner note',
    });
    expect(c.groupHistory, isEmpty);
    apply(FinancialAction.group, {'name': 'Weekend group'});
    expect(c.groupHistory, hasLength(1));
    c.activeGroup = 'household';
    expect(c.groupHistory, isEmpty);
  });

  test('exact parsing, deterministic remainder and large values', () {
    expect(DemoMoney.parse('1.001'), isNull);
    expect(DemoMoney.parse('999999999.99'), BigInt.parse('99999999999'));
    expect(ExactFinance.equal(BigInt.from(10000), ['Tala', 'Nico', 'Amihan']), {
      'Amihan': BigInt.from(3334),
      'Nico': BigInt.from(3333),
      'Tala': BigInt.from(3333),
    });
  });
  test('expense split deducts once and rejects invalid input', () {
    expect(
      preview(FinancialAction.expense, {
        'name': 'Lunch',
        'amount': '1.001',
      }).valid,
      isFalse,
    );
    final p = apply(FinancialAction.expense, {
      'name': 'Lunch & fare',
      'split': 'true',
    });
    expect(c.account('account-0').balance, BigInt.from(106450));
    expect(c.liquid, BigInt.from(2911525));
    expect(p.spending, BigInt.from(18550));
  });
  test('transfer nets to only fee, requires separate accounts and shortfall consent', () {
    expect(
      preview(FinancialAction.transfer, {
        'account': 'account-0',
        'destination': 'account-0',
      }).valid,
      isFalse,
    );
    expect(
      preview(FinancialAction.transfer, {
        'account': 'account-0',
        'amount': '2000.00',
      }).valid,
      isFalse,
    );
    final p = apply(FinancialAction.transfer, {
      'account': 'account-1',
      'destination': 'account-2',
    });
    expect(c.liquid, BigInt.from(2929075));
    expect(p.spending, BigInt.from(1000));
  });
  test(
    'unknown response, pending and stale never duplicate or invent effects',
    () {
      final p = preview(FinancialAction.expense, {'name': 'Lunch'});
      expect(c.execute(p, DemoOutcome.unknown), DemoOutcome.unknown);
      final balance = c.liquid;
      expect(c.checkResult(p.commandId), DemoOutcome.accepted);
      c.execute(p, DemoOutcome.accepted);
      c.checkResult(p.commandId);
      expect(c.liquid, balance);
      final pending = preview(FinancialAction.income, {'name': 'Gift'});
      c.execute(pending, DemoOutcome.pending);
      expect(c.liquid, balance);
      apply(FinancialAction.category, {'name': 'Learning'});
      expect(c.checkResult(pending.commandId), DemoOutcome.stale);
      expect(c.liquid, balance);
    },
  );
  test('refund caps and immutable replacement dependencies', () {
    final r = apply(FinancialAction.expense, {'name': 'Dinner'});
    apply(FinancialAction.refund, {
      'source': r.commandId,
      'amount': '85.50',
      'reason': 'Returned portion',
    });
    expect(c.liquid, DemoMoney.liquid - BigInt.from(10000));
    expect(
      preview(FinancialAction.refund, {
        'source': r.commandId,
        'amount': '100.01',
        'reason': 'Too much',
      }).valid,
      isFalse,
    );
    expect(
      preview(FinancialAction.correction, {
        'source': r.commandId,
        'reason': 'Change',
      }).valid,
      isFalse,
    );
    expect(c.records.where((r) => r.id == r.sourceId), isEmpty);
  });
  test('borrowing has net proceeds; imported liability has no cash effect', () {
    apply(FinancialAction.debtImport);
    expect(c.liquid, DemoMoney.liquid);
    apply(FinancialAction.borrowing);
    expect(c.liquid, DemoMoney.liquid + BigInt.from(950000));
    expect(c.records.first.spending, BigInt.from(50000));
  });
  test(
    'payoff distinguishes recognized waiver from avoided future charges',
    () {
      final loan = apply(FinancialAction.borrowing, {'charges': '200.00'});
      final before = c.liquid;
      final payoff = apply(FinancialAction.payoff, {
        'debt': loan.commandId,
        'amount': '10000.00',
        'waiver': '200.00',
        'avoided': '500.00',
        'evidence': 'Provider quote',
        'reason': 'Recognized fee waived',
        'acknowledge': 'true',
      });
      expect(c.liquid, before - BigInt.from(1000000));
      expect(payoff.spending, BigInt.from(-20000));
      expect(c.debt(loan.commandId).charges, BigInt.zero);
      expect(c.debt(loan.commandId).principal, BigInt.zero);
    },
  );
  test('unresolved payment classification is resolved without cash replay', () {
    final p = apply(FinancialAction.debtPayment, {'account': 'account-1'});
    final balance = c.liquid;
    expect(c.debts.first.principal, BigInt.from(1800000));
    expect(c.debts.first.unresolved, BigInt.from(200000));
    expect(
      preview(FinancialAction.payoff, {
        'evidence': 'Quote',
        'acknowledge': 'true',
      }).valid,
      isFalse,
    );
    apply(FinancialAction.debtClassification, {
      'source': p.commandId,
      'evidence': 'Provider split',
    });
    expect(c.liquid, balance);
    expect(c.debts.first.principal, BigInt.from(1620000));
    expect(c.debts.first.unresolved, BigInt.zero);
    expect(
      preview(FinancialAction.debtClassification, {
        'source': p.commandId,
        'evidence': 'Repeat',
      }).valid,
      isFalse,
    );
  });
  test('card purchase payment refund and statement are different effects', () {
    final p = apply(FinancialAction.cardPurchase);
    expect(c.cardBalance, BigInt.from(600000));
    expect(c.liquid, DemoMoney.liquid);
    apply(FinancialAction.cardPayment, {'account': 'account-1'});
    expect(c.cardBalance, BigInt.from(500000));
    expect(c.records.first.spending, BigInt.zero);
    apply(FinancialAction.cardRefund, {
      'source': p.commandId,
      'amount': '200.00',
      'reason': 'Return',
    });
    expect(c.cardBalance, BigInt.from(480000));
    final cash = c.liquid;
    apply(FinancialAction.statement, {'evidence': 'OCT-DEMO'});
    apply(FinancialAction.installment, {'evidence': 'PLAN-DEMO'});
    expect(c.cardBalance, BigInt.from(480000));
    expect(c.liquid, cash);
  });
  test('shared exact axes validate and positions remain net zero', () {
    expect(
      preview(FinancialAction.sharedBill, {'paid:Tala': '100.00'}).valid,
      isFalse,
    );
    expect(
      preview(FinancialAction.sharedBill, {
        'mode': 'Exact',
        'share:Tala': '399.99',
      }).valid,
      isFalse,
    );
    apply(FinancialAction.sharedBill, {
      'paid:Amihan': '600.00',
      'paid:Tala': '600.00',
    });
    expect(ExactFinance.sum(c.groupPositions().values), BigInt.zero);
    expect(c.liquid, DemoMoney.liquid);
  });
  test(
    'pending receipt, advance, confirmation and reversal do not repeat cash',
    () {
      final before = c.groupPositions();
      expect(c.groupPositions(projected: true)['Tala'], BigInt.from(-25000));
      apply(FinancialAction.settlementPrivate, {
        'source': 'settlement-1',
        'evidence': 'Received demo transfer',
      });
      final cash = c.liquid;
      apply(FinancialAction.confirmation, {'source': 'settlement-1'});
      expect(c.groupPositions()['Tala'], BigInt.from(-25000));
      expect(c.liquid, cash);
      apply(FinancialAction.confirmation, {
        'source': 'settlement-1',
        'decision': 'Reverse confirmation',
        'reason': 'Receipt disputed',
      });
      expect(c.groupPositions(), before);
      expect(c.liquid, cash);
      final payment = apply(FinancialAction.settlement, {
        'amount': '450.00',
        'allocate:bill-1': '400.00',
        'acknowledge': 'true',
      });
      apply(FinancialAction.confirmation, {'source': payment.commandId});
      expect(c.groupPositions()['Amihan'], BigInt.from(35000));
      expect(c.groupPositions()['Tala'], BigInt.from(5000));
    },
  );
  test('creator authority, stale source and private funding boundaries', () {
    c.setActor('Tala', false);
    expect(
      preview(FinancialAction.sharedCorrection, {'reason': 'Correction'}).valid,
      isFalse,
    );
    expect(preview(FinancialAction.adoption).valid, isFalse);
    c.setActor('Amihan', false);
    apply(FinancialAction.sharedCorrection, {'reason': 'Rename dinner'});
    expect(
      preview(FinancialAction.confirmation, {'source': 'settlement-1'}).valid,
      isFalse,
    );
    c.setActor('Amihan', true);
    expect(preview(FinancialAction.sharedBill).valid, isFalse);
    expect(preview(FinancialAction.adoption).valid, isTrue);
  });
  test(
    'cash/card adoption preserves funding, own expense and refund review',
    () {
      final p = apply(FinancialAction.cardPurchase);
      apply(FinancialAction.adoption, {
        'funding': 'Existing purchase',
        'existing': p.commandId,
      });
      expect(c.cardBalance, BigInt.from(600000));
      expect(c.records.first.spending, BigInt.from(-80000));
      apply(FinancialAction.sharedRefund, {'reason': 'Returned shared item'});
      expect(c.bill('bill-1').previous!.refunded, BigInt.zero);
      expect(c.cardBalance, BigInt.from(600000));
      apply(FinancialAction.privateReview, {
        'decision': 'Correct actual funding',
        'reason': 'Actual refund to card',
        'acknowledge': 'true',
      });
      expect(c.cardBalance, BigInt.from(570000));
      expect(c.adoptions['bill-1']!.share, BigInt.from(30000));
    },
  );
  test(
    'partial CSV retry is idempotent and cancellation preserves accepted rows',
    () async {
      final i = ImportController(c)
        ..duplicateAcknowledged = true
        ..simulation = 'Partial success';
      expect(i.validate(), isTrue);
      await i.process();
      expect(i.accepted, 1);
      i.simulation = 'Complete';
      await i.process();
      expect(i.accepted, 3);
      final balance = c.liquid;
      await i.process();
      expect(c.liquid, balance);
      final cancelled = ImportController(c)
        ..duplicateAcknowledged = true
        ..simulation = 'Partial success';
      cancelled.validate();
      await cancelled.process();
      cancelled.cancel();
      final retained = c.liquid;
      await cancelled.process();
      expect(c.liquid, retained);
      expect(cancelled.accepted, 1);
    },
  );
  test(
    'import uncertain result uses original row and exact historical rebase',
    () async {
      final i = ImportController(c)
        ..duplicateAcknowledged = true
        ..simulation = 'Uncertain result';
      i.validate();
      await i.process();
      final balance = c.liquid;
      i.checkOriginal();
      expect(c.liquid, balance);
      final rebase = ImportController(c)
        ..accountId = 'account-1'
        ..rebase = true
        ..duplicateAcknowledged = true;
      rebase.earlierOpening = ExactFinance.decimal(rebase.derivedOpening);
      expect(rebase.validate(), isTrue);
      final before = c.liquid;
      await rebase.process();
      expect(c.liquid, before);
      expect(c.account('account-1').cutoff, '2026-10-10');
    },
  );
}
