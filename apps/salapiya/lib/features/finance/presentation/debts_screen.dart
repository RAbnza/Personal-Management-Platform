import 'package:flutter/material.dart';

import '../../../app/demo_routes.dart';
import '../../../design_system/editorial.dart';
import '../../../design_system/theme.dart';
import '../../../prototype/scenarios.dart';
import '../contracts/financial_models.dart';
import 'financial_editor.dart';
import 'financial_widgets.dart';
import '../../supporting/presentation/files_screen.dart';
import '../../../local/local_finance_controller.dart';
import '../../../finance/debt_screen.dart';

class DebtsScreen extends StatelessWidget {
  const DebtsScreen({super.key, required this.session});
  final PrototypeSession session;
  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: session.finance,
    builder: (context, _) {
      final c = session.finance;
      if (c is LocalFinancialController) {
        return NativeDebtsScreen(controller: c);
      }
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          FinanceHeading(
            'DEBTS / A CLEARER WAY FORWARD',
            'One step closer.',
            'Separate what you owe, what you expect to pay, and what has actually moved.',
            actions: [
              FilledButton.icon(
                onPressed: () => openFinancialEditor(
                  context,
                  c,
                  FinancialAction.debtPayment,
                ),
                icon: const Icon(Icons.add),
                label: const Text('Record payment'),
              ),
              OutlinedButton(
                onPressed: () =>
                    openFinancialEditor(context, c, FinancialAction.debtImport),
                child: const Text('Add existing debt'),
              ),
              TextButton(
                onPressed: () =>
                    openFinancialEditor(context, c, FinancialAction.borrowing),
                child: const Text('Record borrowing'),
              ),
            ],
          ),
          if (!session.complete)
            const FinanceNotice(
              'Debt history is unavailable while the initial snapshot is incomplete.',
              warning: true,
            )
          else
            FinanceColumns(
              main: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  ValueBlock(
                    'RECOGNIZED LIABILITY',
                    session.amount(c.debtTotal),
                    'Cash and credit cards shown separately. Expected interest is not a recognized charge.',
                    color: Palette.peach,
                  ),
                  const SizedBox(height: 28),
                  const SectionHeading('Your commitments'),
                  if (c.debts.isEmpty)
                    const FinanceNotice(
                      'No debts in this demo profile. Import supplied opening evidence or record new borrowing.',
                    ),
                  for (final d in c.debts)
                    FinancialLine(
                      d.name,
                      '${d.principal == BigInt.zero ? 'Settled · evidence retained' : 'Next due ${d.firstDue}'} · schedule v${d.scheduleVersion}',
                      value: session.amount(d.principal),
                      icon: Icons.receipt_long_outlined,
                      color: Palette.peach,
                      onTap: () => openDemoPage<void>(
                        context,
                        DebtDetail(session: session, id: d.id),
                        'debt/${d.id}',
                      ),
                    ),
                ],
              ),
              aside: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const SectionHeading('The next few steps'),
                  for (final d
                      in c.debts
                          .where((d) => d.principal > BigInt.zero)
                          .take(3))
                    FinancialLine(
                      d.firstDue,
                      '${d.name}\nExpected ${session.amount(d.expected)} · not a payment',
                      icon: Icons.event_outlined,
                      color: Palette.mint,
                      onTap: () => openFinancialEditor(
                        context,
                        c,
                        FinancialAction.debtPayment,
                        initial: {'debt': d.id},
                      ),
                    ),
                  const SizedBox(height: 24),
                  const FinanceNotice(
                    'An unknown principal/interest split stays unresolved. Paying a contractual amount is different from knowing its accounting allocation.',
                  ),
                  for (final d in c.debts.where(
                    (d) => d.unresolved > BigInt.zero,
                  ))
                    FinancialLine(
                      'Classification needs attention',
                      d.name,
                      value: session.amount(d.unresolved),
                      icon: Icons.help_outline,
                    ),
                ],
              ),
            ),
        ],
      );
    },
  );
}

class DebtDetail extends StatelessWidget {
  const DebtDetail({super.key, required this.session, required this.id});
  final PrototypeSession session;
  final String id;
  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: session.finance,
    builder: (context, _) {
      final c = session.finance, d = c.debt(id);
      return FinancePage(
        title: d.name,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            FinanceHeading(
              'DEBT / EVIDENCE & PROGRESS',
              d.name,
              'Expected amounts guide you. Actual payments tell the story.',
              actions: [
                for (final a in [
                  FinancialAction.debtPayment,
                  FinancialAction.schedule,
                  FinancialAction.debtClassification,
                  FinancialAction.payoff,
                ])
                  OutlinedButton(
                    onPressed: () => openFinancialEditor(
                      context,
                      c,
                      a,
                      initial: {
                        'debt': id,
                        if (a == FinancialAction.payoff)
                          'amount': ExactFinance.decimal(d.principal),
                      },
                    ),
                    child: Text(a.label),
                  ),
              ],
            ),
            FinanceColumns(
              main: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  ValueBlock(
                    'PRINCIPAL REMAINING',
                    session.amount(d.principal),
                    'Recognized unpaid charges: ${session.amount(d.charges)}\nUnresolved payment clearing: ${session.amount(d.unresolved)}',
                    color: Palette.peach,
                  ),
                  const SizedBox(height: 24),
                  const SectionHeading('Payment & revision history'),
                  SupportingFilesLink(session: session, source: 'debt:${d.id}'),
                  for (final h in d.history.reversed)
                    FinancialLine(
                      'Retained evidence',
                      session.hideAmounts ? 'Amounts hidden' : h,
                      icon: Icons.history,
                    ),
                  if (d.unresolved > BigInt.zero)
                    const FinanceNotice(
                      'Unresolved classification blocks payoff. Cash has moved; recognized principal remains unchanged until evidence supports its allocation.',
                      warning: true,
                    ),
                ],
              ),
              aside: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  SectionHeading('Schedule v${d.scheduleVersion}'),
                  Text(
                    '${d.installments} installments · first due ${d.firstDue}',
                  ),
                  const SizedBox(height: 12),
                  if (!session.hideAmounts)
                    ExactBar(
                      label: 'Contractual coverage',
                      value: session.amount(d.contractualPaid),
                      amount: d.contractualPaid,
                      total: d.expected * BigInt.from(d.installments),
                      color: Palette.violet,
                    ),
                  for (var i = 0; i < d.installments.clamp(0, 6); i++)
                    FinancialLine(
                      'Installment ${i + 1}',
                      i == 0
                          ? d.firstDue
                          : 'Expected month +$i · schedule evidence',
                      value: session.amount(d.expected),
                      icon: Icons.radio_button_unchecked,
                      color: Palette.mint,
                    ),
                  if (d.installments > 6)
                    Text(
                      '${d.installments - 6} more installments in the reviewed plan',
                    ),
                  const FinanceNotice(
                    'Historical payment allocations retain their original schedule version when a plan is revised.',
                  ),
                ],
              ),
            ),
          ],
        ),
      );
    },
  );
}
