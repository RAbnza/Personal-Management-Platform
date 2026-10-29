import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/local/finance_domain.dart';

import 'local_test_support.dart';

final rejected = throwsA(isA<LocalRuleException>());

void main() {
  group('cadence occurrences', () {
    test('weekly, custom and calendar monthly/yearly dates', () {
      expect(debtOccurrence('2026-10-29', 'weekly', 0), '2026-10-29');
      expect(debtOccurrence('2026-10-29', 'weekly', 1), '2026-11-05');
      expect(debtOccurrence('2026-12-29', 'weekly', 1), '2027-01-05');
      expect(
        debtOccurrence('2026-10-29', 'custom', 3, intervalDays: '10'),
        '2026-11-28',
      );
      expect(debtOccurrence('2026-10-15', 'monthly', 1), '2026-11-15');
      expect(debtOccurrence('2026-10-15', 'monthly', 3), '2027-01-15');
      expect(debtOccurrence('2026-03-10', 'yearly', 2), '2028-03-10');
    });

    test('month-end clamps from the anchor without drift', () {
      expect(
        [
          for (var i = 0; i < 4; i++)
            debtOccurrence('2026-01-31', 'monthly', i),
        ],
        ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'],
      );
      expect(debtOccurrence('2026-01-31', 'monthly', 13), '2027-02-28');
      expect(debtOccurrence('2026-05-31', 'monthly', 1), '2026-06-30');
    });

    test('leap years', () {
      expect(debtOccurrence('2028-01-31', 'monthly', 1), '2028-02-29');
      expect(debtOccurrence('2027-12-31', 'monthly', 2), '2028-02-29');
      expect(debtOccurrence('2024-02-29', 'yearly', 1), '2025-02-28');
      expect(debtOccurrence('2024-02-29', 'yearly', 4), '2028-02-29');
      expect(debtOccurrence('2028-02-01', 'weekly', 4), '2028-02-29');
    });

    test('invalid intervals, frequencies and dates are rejected', () {
      for (final days in ['', '0', '-1', '1.5', 'abc', ' 3', '3661']) {
        expect(
          () => debtOccurrence('2026-10-29', 'custom', 1, intervalDays: days),
          rejected,
        );
      }
      expect(debtIntervalDays('1'), 1);
      expect(debtIntervalDays('3660'), 3660);
      expect(() => debtOccurrence('2026-10-29', 'daily', 1), rejected);
      expect(() => debtOccurrence('2026-10-29', 'weekly', -1), rejected);
      expect(
        () => debtOccurrence('2026-02-30', 'monthly', 1),
        throwsFormatException,
      );
    });

    test('generated rows are explicit provider rows', () {
      final rows = financeSchedule(
        debtCadenceRows(
          firstDue: '2026-10-31',
          frequency: 'monthly',
          installmentAmount: '3200.00',
          count: 3,
        ),
      );
      expect(rows.map((r) => (r.id, r.date, r.amount)), [
        ('Installment 1', '2026-10-31', BigInt.from(320000)),
        ('Installment 2', '2026-11-30', BigInt.from(320000)),
        ('Installment 3', '2026-12-31', BigInt.from(320000)),
      ]);
      expect(
        () => debtCadenceRows(
          firstDue: '2026-10-31',
          frequency: 'monthly',
          installmentAmount: '0.00',
          count: 3,
        ),
        rejected,
      );
      expect(
        () => debtCadenceRows(
          firstDue: '2026-10-31',
          frequency: 'weekly',
          installmentAmount: '1.00',
          count: 121,
        ),
        rejected,
      );
    });
  });

  test('status boundaries use calendar days from the given local date', () {
    const today = '2026-10-29';
    expect(debtDueStatus('2026-10-28', today), DebtDueStatus.overdue);
    expect(debtDueStatus('2026-10-29', today), DebtDueStatus.dueToday);
    expect(debtDueStatus('2026-10-30', today), DebtDueStatus.dueSoon);
    expect(debtDueStatus('2026-11-05', today), DebtDueStatus.dueSoon);
    expect(debtDueStatus('2026-11-06', today), DebtDueStatus.upcoming);
    expect(debtDueStatus(null, today), DebtDueStatus.scheduleNotSet);
    expect(
      debtDueStatus('2026-11-02', today, soonDays: 3),
      DebtDueStatus.upcoming,
    );
    expect(debtDueStatus('2027-01-07', '2026-12-31'), DebtDueStatus.dueSoon);
    expect(DebtDueStatus.scheduleNotSet.label, 'Schedule not set');
  });

  test(
    'totals divide evenly with leftover centavos last; amounts may differ',
    () {
      expect(
        debtSplitAmounts(BigInt.from(1000000), 10),
        List.filled(10, BigInt.from(100000)),
      );
      expect(debtSplitAmounts(BigInt.from(1000000), 3), [
        BigInt.from(333333),
        BigInt.from(333333),
        BigInt.from(333334),
      ]);
      expect(() => debtSplitAmounts(BigInt.from(2), 3), rejected);
      expect(() => debtSplitAmounts(BigInt.from(100), 0), rejected);
      expect(() => debtSplitAmounts(BigInt.from(100), 121), rejected);

      final rows = financeSchedule(
        debtScheduleRows(
          firstDue: '2026-01-31',
          frequency: 'monthly',
          amounts: [200000, 50000, 50000].map(BigInt.from).toList(),
        ),
      );
      expect(rows.map((r) => (r.date, r.amount)), [
        ('2026-01-31', BigInt.from(200000)),
        ('2026-02-28', BigInt.from(50000)),
        ('2026-03-31', BigInt.from(50000)),
      ]);
      for (final amounts in [
        <BigInt>[],
        [BigInt.zero],
        [-BigInt.one],
      ]) {
        expect(
          () => debtScheduleRows(
            firstDue: '2026-01-31',
            frequency: 'monthly',
            amounts: amounts,
          ),
          rejected,
        );
      }
    },
  );

  group('schedule persistence and installment settlement', () {
    late LocalFixture f;
    late String account, debt, legacy;
    setUp(() async {
      f = await LocalFixture.open();
      account = await f.account('Wallet', '20000.00');
      debt = await f.post('debtImport', {
        'name': 'Phone loan',
        'lender': 'Synthetic lender',
        'debtType': 'installment_loan',
        'amount': '9600.00',
        'principal': '',
      });
      legacy = await f.post('debtImport', {
        'name': 'Family loan',
        'lender': 'Synthetic relative',
        'debtType': 'flexible_manual',
        'amount': '500.00',
        'principal': '',
      });
    });
    tearDown(() => f.close());

    Map<String, String> schedule([Map<String, String> extra = const {}]) => {
      'name': 'Phone loan schedule',
      'debt': debt,
      'schedule': debtCadenceRows(
        firstDue: '2026-10-31',
        frequency: 'monthly',
        installmentAmount: '3200.00',
        count: 3,
      ),
      'verified': 'true',
      'reference': 'provider letter',
      'frequency': 'monthly',
      'firstDue': '2026-10-31',
      'installmentAmount': '3200.00',
      ...extra,
    };
    Future<String> pay(
      String amount,
      String scheduleId,
      String allocations,
      String unapplied,
    ) => f.post('debtPayment', {
      'name': 'Payment',
      'debt': debt,
      'account': account,
      'amount': amount,
      'externalFee': '0.00',
      'reduction': amount,
      'interest': '0.00',
      'fee': '0.00',
      'clearing': '0.00',
      'certainty': 'confirmed_total',
      'scheduleSource': scheduleId,
      'allocations': allocations,
      'unapplied': unapplied,
    });
    Future<DebtDueSummary> summary(String today) async {
      final s = await f.store.snapshot();
      return debtDueSummary(s, s.revision(debt), today);
    }

    test('cadence validation at the schedule boundary', () async {
      final s = await f.store.snapshot();
      Future<void> invalid(Map<String, String> extra) async {
        final c = await f.command('debtSchedule', schedule(extra));
        expect(() => planLocal(s, c), rejected);
      }

      await invalid({'frequency': 'daily'});
      await invalid({'frequency': 'custom', 'intervalDays': ''});
      await invalid({'frequency': 'custom', 'intervalDays': '0'});
      await invalid({'frequency': 'custom', 'intervalDays': '2.5'});
      await invalid({'intervalDays': '14'});
      await invalid({'firstDue': '2026-11-01'});
      await invalid({'firstDue': ''});
      await invalid({'installmentAmount': '0.00'});
      await invalid({'frequency': ''});
      planLocal(
        s,
        await f.command(
          'debtSchedule',
          schedule({'frequency': 'custom', 'intervalDays': '14'}),
        ),
      );
    });

    test('payment split is validated and stored with the cadence', () async {
      final s = await f.store.snapshot();
      Future<void> bad(Map<String, String> extra) async {
        final c = await f.command('debtSchedule', schedule(extra));
        expect(() => planLocal(s, c), rejected);
      }

      await bad({'splitMode': 'random'});
      await bad({'splitMode': 'varied'});
      await bad({'frequency': '', 'splitMode': 'equal'});
      for (final mode in ['equal', 'divide']) {
        final plan = planLocal(
          s,
          await f.command('debtSchedule', schedule({'splitMode': mode})),
        );
        expect(plan.revision!.values['splitMode'], mode);
      }
      final varied = planLocal(
        s,
        await f.command(
          'debtSchedule',
          schedule({'splitMode': 'varied', 'installmentAmount': ''}),
        ),
      );
      expect(varied.revision!.values['splitMode'], 'varied');
    });

    test(
      'schedule saves and loads; unscheduled and legacy debts stay valid',
      () async {
        final before = await f.store.snapshot();
        final liability = financeBalance(
          before,
          'debt_liability',
          'debt',
          debt,
        );
        final id = await f.post('debtSchedule', schedule());
        await f.post('debtSchedule', {
          'name': 'Legacy explicit rows',
          'debt': legacy,
          'schedule': 'only,2026-11-15,500.00',
          'verified': 'true',
          'reference': 'note',
        });
        final s = await f.store.snapshot();
        final saved = s.revision(id);
        expect(saved.values['frequency'], 'monthly');
        expect(saved.values['firstDue'], '2026-10-31');
        expect(saved.values['installmentAmount'], '3200.00');
        expect(saved.postings, isEmpty);
        expect(financeBalance(s, 'debt_liability', 'debt', debt), liability);
        final legacySummary = debtDueSummary(
          s,
          s.revision(legacy),
          '2026-11-10',
        );
        expect(legacySummary.status, DebtDueStatus.dueSoon);
        expect(legacySummary.next!.$1.id, 'only');
        final phone = debtDueSummary(s, s.revision(debt), '2026-10-29');
        expect(phone.status, DebtDueStatus.dueSoon);
        expect(phone.finalScheduledDue, '2026-12-31');

        final other = await LocalFixture.open();
        addTearDown(other.close);
        final unscheduled = await other.post('debtImport', {
          'name': 'No schedule',
          'lender': 'Synthetic lender',
          'debtType': 'personal_loan',
          'amount': '100.00',
          'principal': '',
        });
        final o = await other.store.snapshot();
        final none = debtDueSummary(o, o.revision(unscheduled), '2026-10-29');
        expect(none.status, DebtDueStatus.scheduleNotSet);
        expect(none.next, isNull);
        expect(none.finalScheduledDue, isNull);
      },
    );

    test(
      'only full explicit allocation settles and advances an installment',
      () async {
        final id = await f.post('debtSchedule', schedule());
        await f.post('expense', {
          'name': 'Unrelated purchase',
          'account': account,
          'amount': '3200.00',
          'category': 'category-food',
        });
        var due = await summary('2026-10-29');
        expect(due.next!.$1.id, 'Installment 1');

        await pay('1000.00', id, 'Installment 1,1000.00', '0.00');
        due = await summary('2026-10-29');
        expect(due.next!.$1.id, 'Installment 1');
        expect(due.next!.$2, BigInt.from(220000));

        await pay('5000.00', id, '', '5000.00');
        due = await summary('2026-10-29');
        expect(due.next!.$1.id, 'Installment 1');
        expect(due.open.map((o) => o.$2), [
          BigInt.from(220000),
          BigInt.from(320000),
          BigInt.from(320000),
        ]);

        await pay('2200.00', id, 'Installment 1,2200.00', '0.00');
        due = await summary('2026-10-29');
        expect(due.next!.$1.id, 'Installment 2');
        expect(due.next!.$1.date, '2026-11-30');
        expect(due.status, DebtDueStatus.upcoming);
      },
    );

    test('one payment never clears several overdue installments', () async {
      final id = await f.post('debtSchedule', schedule());
      await pay('3200.00', id, 'Installment 2,3200.00', '0.00');
      var due = await summary('2026-12-15');
      expect(due.status, DebtDueStatus.overdue);
      expect(due.next!.$1.id, 'Installment 1');
      expect(due.overdue.map((o) => o.$1.id), ['Installment 1']);

      await pay('6400.00', id, 'Installment 1,3200.00', '3200.00');
      due = await summary('2027-01-15');
      expect(due.overdue.map((o) => o.$1.id), ['Installment 3']);
      expect(due.overdueAmount, BigInt.from(320000));
    });

    test('schedule edit keeps payment history and balances intact', () async {
      final id = await f.post('debtSchedule', schedule());
      await pay('1000.00', id, 'Installment 1,1000.00', '0.00');
      final before = await f.store.snapshot();
      String ledger(LocalSnapshot s) => [
        for (final r in s.current.where(
          (r) => financeType(r) != 'debtSchedule',
        ))
          for (final p in r.postings)
            '${r.id}:${p.ledger}:${p.amount}:${p.date}',
      ].join('|');
      final payments = before.current
          .where((r) => financeType(r) == 'debtPayment')
          .map((r) => '${r.id}:${r.values}')
          .toList();

      await expectLater(
        f.post('financeCorrection', {
          'replace': id,
          'replaceVersion': '1',
          'reason': 'Provider moved dates',
          'schedule': 'Installment 1,2026-11-05,3200.00\nInstallment 2,2026-12-05,3200.00',
        }),
        rejected,
      );
      await f.post('financeCorrection', {
        'replace': id,
        'replaceVersion': '1',
        'reason': 'Provider moved dates',
        'schedule': 'Installment 1,2026-11-05,3200.00\nInstallment 2,2026-12-05,3200.00\nInstallment 3,2027-01-05,3200.00',
        'firstDue': '2026-11-05',
      });
      final after = await f.store.snapshot();
      expect(ledger(after), ledger(before));
      expect(
        after.current
            .where((r) => financeType(r) == 'debtPayment')
            .map((r) => '${r.id}:${r.values}')
            .toList(),
        payments,
      );
      final due = debtDueSummary(after, after.revision(debt), '2026-10-29');
      expect(due.schedule!.number, 2);
      expect(due.next!.$1.date, '2026-11-05');
      expect(due.next!.$2, BigInt.from(220000));
    });
  });
}
