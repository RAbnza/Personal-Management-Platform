import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/local/finance_domain.dart';
import 'package:salapiya/connected/financial_contract.dart';

import 'local_test_support.dart';

void main() {
  test('versioned debt component evidence, recognized charge waiver, residual and exact closure retain independent SQL fixture', () async {
    final f = await LocalFixture.open(
      owner: '60000000-0000-4000-8000-000000000000',
    );
    addTearDown(f.close);
    var sequence = 0;
    final commands = <Map<String, dynamic>>[];
    Future<String> post(String kind, Map<String, String> values) async {
      final c = await f.command(
        kind,
        {'debtComponentContract': '1', ...values},
        id: '60000000-0000-4000-8000-${(++sequence).toString().padLeft(12, '0')}',
      );
      final plan = planLocal(await f.store.snapshot(), c);
      await f.store.commit(c, recordedAt: '2026-10-26T00:00:00.000Z');
      commands.add({
        'id': c.id,
        'payload': c.payload,
        'plan': financialPlanJson(plan),
      });
      return c.id;
    }

    final account = await post('account', {
      'name': 'Component wallet',
      'kind': 'Cash',
      'cutoff': '2026-10-01',
      'amount': '5000.00',
    });
    final debt = await post('debtImport', {
      'name': 'Known imported components',
      'lender': 'Provider',
      'debtType': 'personal_loan',
      'amount': '1000.00',
      'principal': '2000.00',
      'outstandingPrincipal': '800.00',
    });
    final charge = await post('debtAdjustment', {
      'name': 'Recognized provider interest',
      'debt': debt,
      'amount': '100.00',
      'adjustmentKind': 'recognized_charge',
      'chargeType': 'interest',
      'category': 'category-fees',
      'reason': 'Confirmed separately recognized interest',
      'reference': 'charge-1',
      'verified': 'true',
    });
    final payment = await post('debtPayment', {
      'name': 'Known component payment',
      'debt': debt,
      'account': account,
      'amount': '300.00',
      'reduction': '250.00',
      'principalReduction': '200.00',
      'reductionSources': '$charge,50.00',
      'interest': '50.00',
      'fee': '0.00',
      'externalFee': '0.00',
      'clearing': '0.00',
      'certainty': 'known_components',
      'interestCategory': 'category-fees',
      'feeCategory': 'category-fees',
      'unapplied': '300.00',
    });
    var s = await f.store.snapshot();
    expect(debtPrincipalRange(s, s.revision(debt), '2026-10-21'), (
      BigInt.from(60000),
      BigInt.from(60000),
    ));
    expect(debtChargeRemaining(s, s.revision(charge)), BigInt.from(5000));
    await expectLater(
      f.post('debtAdjustment', {
        'name': 'Opening waiver cannot offset separate charges',
        'debt': debt,
        'amount': '800.01',
        'adjustmentKind': 'recognized_waiver',
        'waiverBasis': 'imported_unknown',
        'reason': 'Above retained opening capacity',
        'reference': 'bad-opening',
        'verified': 'true',
      }),
      throwsA(isA<LocalRuleException>()),
    );
    await expectLater(
      f.post('debtAdjustment', {
        'name': 'Unsupported source waiver',
        'debt': debt,
        'amount': '50.01',
        'adjustmentKind': 'recognized_waiver',
        'waiverBasis': 'recognized_charge',
        'chargeSource': charge,
        'reason': 'Over remaining source',
        'reference': 'bad',
        'verified': 'true',
      }),
      throwsA(isA<LocalRuleException>()),
    );
    await post('debtAdjustment', {
      'name': 'Recognized interest waiver',
      'debt': debt,
      'amount': '50.00',
      'adjustmentKind': 'recognized_waiver',
      'waiverBasis': 'recognized_charge',
      'chargeSource': charge,
      'reason': 'Provider waived remaining recognized interest',
      'reference': 'waiver-1',
      'verified': 'true',
    });
    await post('debtAdjustment', {
      'name': 'Avoided unposted interest',
      'debt': debt,
      'amount': '200.00',
      'adjustmentKind': 'avoided_future',
      'reason': 'Future interest is not recognized',
      'reference': 'avoided-1',
      'verified': 'true',
    });
    final residual = await post('debtAdjustment', {
      'name': 'Confirmed residual charge',
      'debt': debt,
      'amount': '0.01',
      'adjustmentKind': 'rounding_charge',
      'chargeType': 'fee',
      'category': 'category-fees',
      'reason': 'Provider confirmed one-cent residual',
      'reference': 'residual-1',
      'verified': 'true',
    });
    await post('debtAdjustment', {
      'name': 'Confirmed residual waiver',
      'debt': debt,
      'amount': '0.01',
      'adjustmentKind': 'rounding_waiver',
      'waiverBasis': 'recognized_charge',
      'chargeSource': residual,
      'reason': 'Provider waived exact residual',
      'reference': 'residual-waiver-1',
      'verified': 'true',
    });
    final payoff = {
      'name': 'Reconciled payoff',
      'debt': debt,
      'account': account,
      'amount': '800.00',
      'providerPayoff': '800.00',
      'reduction': '800.00',
      'interest': '0.00',
      'fee': '0.00',
      'waiver': '0.00',
      'avoided': '0.00',
      'waiverBasis': 'imported_unknown',
      'reason': 'Exact confirmed provider payoff',
      'reference': 'payoff-1',
      'verified': 'true',
    };
    await expectLater(
      f.post('debtPayoff', {...payoff, 'providerPayoff': '799.99'}),
      throwsA(isA<LocalRuleException>()),
    );
    await post('debtPayoff', payoff);
    await expectLater(
      f.post('financeReversal', {
        'replace': payment,
        'replaceVersion': '1',
        'reason': 'Must not reopen retained reconciled payoff',
        'debtComponentContract': '1',
      }),
      throwsA(isA<LocalRuleException>()),
    );
    s = await f.store.snapshot();
    expect(s.balance(account), BigInt.from(390000));
    expect(financeBalance(s, 'debt_liability', 'debt', debt), BigInt.zero);
    expect(debtPrincipalRange(s, s.revision(debt), '2026-10-21'), (
      BigInt.zero,
      BigInt.zero,
    ));
    expect(
      sumMinor(
        s.current
            .expand((r) => r.postings)
            .where((p) => p.ledger == 'expense')
            .map((p) => p.amount),
      ),
      BigInt.from(10000),
    );
    final borrowing = await post('borrowing', {
      'name': 'Financed fee source',
      'lender': 'Provider',
      'debtType': 'personal_loan',
      'amount': '1000.00',
      'withheld': '50.00',
      'financedFee': '100.00',
      'fundingUse': 'cash',
      'account': account,
      'feeCategory': 'category-fees',
    });
    await post('debtAdjustment', {
      'name': 'Waive unpaid financed fee only',
      'debt': borrowing,
      'amount': '100.00',
      'adjustmentKind': 'recognized_waiver',
      'waiverBasis': 'recognized_charge',
      'chargeSource': borrowing,
      'reason':
          'Original financed fee source, excluding already paid withheld fee',
      'reference': 'financed-waiver',
      'verified': 'true',
    });
    await post('debtPayoff', {
      'name': 'Close borrowing principal',
      'debt': borrowing,
      'account': account,
      'amount': '1000.00',
      'providerPayoff': '1000.00',
      'reduction': '1000.00',
      'interest': '0.00',
      'fee': '0.00',
      'waiver': '0.00',
      'avoided': '0.00',
      'reason': 'Exact remaining principal',
      'reference': 'principal-payoff',
      'verified': 'true',
    });
    s = await f.store.snapshot();
    expect(s.balance(account), BigInt.from(385000));
    expect(
      sumMinor(
        s.current
            .expand((r) => r.postings)
            .where((p) => p.ledger == 'expense')
            .map((p) => p.amount),
      ),
      BigInt.from(15000),
    );
    final fixture = {'profile': f.store.owner, 'commands': commands},
        file = File('../../contracts/salapiya/p4_debt_components.json');
    if (const bool.fromEnvironment('P4_WRITE_FIXTURES')) {
      await file.writeAsString(
        '${const JsonEncoder.withIndent('  ').convert(fixture)}\n',
      );
    } else {
      expect(jsonDecode(await file.readAsString()), fixture);
    }
    await f.store.integrity();
  });
  test('unknown reductions preserve principal ranges and block unsupported charge expense offsets', () async {
    final f = await LocalFixture.open();
    addTearDown(f.close);
    final account = await f.account('Wallet', '5000.00');
    final debt = await f.post('debtImport', {
      'debtComponentContract': '1',
      'name': 'Imported',
      'lender': 'Provider',
      'debtType': 'personal_loan',
      'amount': '1000.00',
      'outstandingPrincipal': '800.00',
    });
    final charge = await f.post('debtAdjustment', {
      'name': 'Charge',
      'debt': debt,
      'amount': '100.00',
      'adjustmentKind': 'recognized_charge',
      'chargeType': 'fee',
      'category': 'category-fees',
      'reason': 'Confirmed',
      'reference': 'charge',
      'verified': 'true',
    });
    await f.post('debtPayment', {
      'name': 'Unknown component reduction',
      'debt': debt,
      'account': account,
      'amount': '200.00',
      'reduction': '200.00',
      'interest': '0.00',
      'fee': '0.00',
      'externalFee': '0.00',
      'clearing': '0.00',
      'certainty': 'confirmed_total',
      'unapplied': '200.00',
    });
    final s = await f.store.snapshot();
    expect(debtPrincipalRange(s, s.revision(debt), '2026-10-21'), (
      BigInt.from(60000),
      BigInt.from(80000),
    ));
    expect(debtChargeRemaining(s, s.revision(charge)), isNull);
    await expectLater(
      f.post('debtAdjustment', {
        'name': 'Guessing source remains unpaid',
        'debt': debt,
        'amount': '1.00',
        'adjustmentKind': 'recognized_waiver',
        'waiverBasis': 'recognized_charge',
        'chargeSource': charge,
        'reason': 'Unsupported offset',
        'reference': 'bad',
        'verified': 'true',
      }),
      throwsA(isA<LocalRuleException>()),
    );
  });
}
