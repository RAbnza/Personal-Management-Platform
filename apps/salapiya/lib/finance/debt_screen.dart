import 'source_list.dart';

import 'package:flutter/material.dart';

import '../design_system/editorial.dart';
import '../features/finance/presentation/financial_widgets.dart';
import '../local/finance_domain.dart';
import '../local/local_finance_controller.dart';
import 'finance_screen.dart';

String _principalEvidence(
  LocalFinancialController c,
  LocalSnapshot s,
  LocalRevision debt,
) {
  final range = debtPrincipalRange(s, debt, civilToday());
  return range == null
      ? 'Outstanding principal: unknown; original principal is separate historical evidence.'
      : 'Outstanding principal supported range: ${c.decimal(range.$1)}–${c.decimal(range.$2)} PHP.';
}

class NativeDebtsScreen extends StatelessWidget {
  const NativeDebtsScreen({super.key, required this.controller});
  final LocalFinancialController controller;
  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: controller,
    builder: (context, _) {
      final s = controller.snapshot;
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          FinanceHeading(
            'DEBTS / A CLEARER WAY FORWARD',
            'One step closer.',
            'Recognized liability, contractual dues and actual payments stay separate.',
            actions: [
              for (final action in const {
                'debtImport': 'Add existing debt',
                'borrowing': 'Record borrowing',
                'debtPayment': 'Record debt payment',
                'debtClassification': 'Classify payment',
                'debtSchedule': 'Provider schedule',
                'debtPayoff': 'Early settlement',
                'debtAdjustment': 'Provider charge / waiver / residual',
              }.entries)
                OutlinedButton(
                  onPressed: () => openNativeFinance(
                    context,
                    controller,
                    action.key,
                    action.value,
                  ),
                  child: Text(action.value),
                ),
            ],
          ),
          for (final debt in s.current.where(
            (r) => ['debtImport', 'borrowing'].contains(financeType(r)),
          )) ...[
            SectionHeading(debt.title),
            FinanceNotice(
              'Recognized liability: ${controller.decimal(-financeBalance(s, 'debt_liability', 'debt', debt.actionId, through: civilToday()))} PHP\n'
              'Unresolved payment clearing: ${controller.decimal(financeBalance(s, 'debt_clearing', 'debt', debt.actionId, through: civilToday()))} PHP\n'
              '${_principalEvidence(controller, s, debt)}\n'
              '${s.current.any((r) => financeType(r) == 'debtPayoff' && r.date.compareTo(civilToday()) <= 0 && r.values['debt'] == debt.actionId) ? 'Closed with reconciled payoff evidence. Future dues are cancelled; history is retained.' : 'Active. Schedules never create a liability or prove payment.'}',
            ),
            for (final schedule in s.current.where(
              (r) =>
                  financeType(r) == 'debtSchedule' &&
                  r.values['debt'] == debt.actionId,
            )) ...[
              FinancialLine(
                schedule.title,
                'Provider schedule revision ${schedule.number} · ${controller.decimal(schedule.amount)} PHP contractual total',
                icon: Icons.calendar_month,
                onTap: () =>
                    openFinanceDetail(context, controller, schedule.id),
              ),
              for (final row in financeSchedule(schedule.values['schedule']!))
                Builder(
                  builder: (context) {
                    final paid =
                        row.paid +
                        sumMinor(
                          s.current
                              .where(
                                (r) =>
                                    financeType(r) == 'debtPayment' &&
                                    r.date.compareTo(civilToday()) <= 0 &&
                                    (r.values['scheduleSource'] ?? '')
                                        .isNotEmpty &&
                                    s
                                            .revision(
                                              r.values['scheduleSource']!,
                                            )
                                            .actionId ==
                                        schedule.actionId,
                              )
                              .map(
                                (r) =>
                                    debtAllocations(
                                      r.values['allocations'] ?? '',
                                    )[row.id] ??
                                    BigInt.zero,
                              ),
                        );
                    final closed = s.current.any(
                      (r) =>
                          financeType(r) == 'debtPayoff' &&
                          r.date.compareTo(civilToday()) <= 0 &&
                          r.values['debt'] == debt.actionId,
                    );
                    final remaining = row.amount - paid;
                    return FinancialLine(
                      row.id,
                      '${row.date} · ${closed && remaining > BigInt.zero
                          ? 'Cancelled by payoff'
                          : remaining == BigInt.zero
                          ? 'Satisfied'
                          : row.date.compareTo(civilToday()) < 0
                          ? 'Overdue'
                          : 'Scheduled'}',
                      value: '${controller.decimal(remaining)} PHP',
                      icon: Icons.event_note,
                    );
                  },
                ),
            ],
          ],
          const SectionHeading('Debt source detail & payment history'),
          FinancialSourceList(
            controller: controller,
            records: s.revisions.reversed
                .where((r) => nativeDebtCommands.contains(financeType(r)))
                .toList(),
          ),
        ],
      );
    },
  );
}
