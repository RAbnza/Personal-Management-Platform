import 'package:flutter/material.dart';

import '../../../app/demo_routes.dart';
import '../../../design_system/editorial.dart';
import '../../../design_system/theme.dart';
import '../../../prototype/scenarios.dart';
import '../application/financial_controller.dart';
import '../contracts/financial_models.dart';
import 'financial_editor.dart';
import 'financial_widgets.dart';
import 'money_screen.dart';
import 'card_evidence.dart';

class CreditScreen extends StatelessWidget {
  const CreditScreen({super.key, required this.session});
  final PrototypeSession session;
  @override
  Widget build(BuildContext context) {
    final c = session.finance;
    void edit(FinancialAction a) => openFinancialEditor(context, c, a);
    final used = c.cardBalance > BigInt.zero ? c.cardBalance : BigInt.zero;
    final due = c.statementBalance - c.statementAllocated;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        CardEvidence(session: session),
        const SizedBox(height: 24),
        FinanceColumns(
          main: Container(
            padding: const EdgeInsets.all(28),
            decoration: BoxDecoration(
              color: Palette.ink,
              borderRadius: BorderRadius.circular(28),
            ),
            child: DefaultTextStyle.merge(
              style: const TextStyle(color: Palette.white),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Row(
                    children: [
                      Expanded(
                        child: Text(
                          'EVERYDAY CREDIT',
                          style: TextStyle(letterSpacing: 2, fontSize: 12),
                        ),
                      ),
                      Icon(Icons.credit_card, color: Palette.lilac, size: 32),
                    ],
                  ),
                  const SizedBox(height: 32),
                  Text(
                    c.cardBalance < BigInt.zero
                        ? 'Card credit'
                        : 'Posted outstanding',
                    style: const TextStyle(color: Palette.lilac),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    session.amount(c.cardBalance.abs()),
                    style: const TextStyle(fontSize: 40, letterSpacing: -1.4),
                  ),
                  const SizedBox(height: 24),
                  const Text(
                    'DEMO  ••••  0021',
                    style: TextStyle(letterSpacing: 3),
                  ),
                  const SizedBox(height: 24),
                  const Divider(color: Color(0xFF64606A)),
                  Wrap(
                    spacing: 32,
                    runSpacing: 12,
                    children: [
                      Text('LIMIT\n${session.amount(c.cardLimit)}'),
                      Text(
                        'AVAILABLE CREDIT\n${session.amount(c.cardLimit - c.cardBalance)}',
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  const Text(
                    'Available credit and card credit are not liquid money.',
                    style: TextStyle(color: Palette.lilac, fontSize: 12),
                  ),
                ],
              ),
            ),
          ),
          aside: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ValueBlock(
                'STATEMENT DUE',
                session.amount(due),
                'Due ${c.statementDue} · provider evidence v${c.statementVersion}\nUnknown allocations stay separate.',
                color: Palette.peach,
              ),
              const SizedBox(height: 12),
              if (!session.hideAmounts)
                ExactBar(
                  label: 'Credit utilization',
                  value: '${(used * BigInt.from(100) ~/ c.cardLimit)}%',
                  amount: used,
                  total: c.cardLimit,
                  color: Palette.violet,
                ),
              FilledButton.icon(
                onPressed: () => edit(FinancialAction.cardPayment),
                icon: const Icon(Icons.south_west),
                label: const Text('Pay credit card'),
              ),
            ],
          ),
        ),
        const SizedBox(height: 24),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final a in [
              FinancialAction.cardPurchase,
              FinancialAction.cardRefund,
              FinancialAction.cardFee,
              FinancialAction.cardInterest,
            ])
              OutlinedButton(onPressed: () => edit(a), child: Text(a.label)),
          ],
        ),
        const SizedBox(height: 32),
        FinanceColumns(
          main: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SectionHeading('Card activity'),
              for (final r
                  in c.records.where((r) => r.card != BigInt.zero).take(8))
                FinancialLine(
                  r.title,
                  '${r.date} · ${r.kind}',
                  value: session.amount(r.card),
                  icon: Icons.credit_card,
                  onTap: () => openDemoPage<void>(
                    context,
                    TransactionDetail(session: session, id: r.id),
                    'card/activity',
                  ),
                ),
              if (!c.records.any((r) => r.card != BigInt.zero))
                const FinanceNotice(
                  'Opening posted liability ₱4,800.00. Record a purchase or payment to explore new card activity.',
                ),
              const SizedBox(height: 24),
              const SectionHeading('Statement & reconciliation'),
              FinancialLine(
                'Statement · ${c.activeStatement.issued}',
                'Provider balance · v${c.statementVersion} · allocations ${session.amount(c.statementAllocated)}',
                value: session.amount(c.statementBalance),
                icon: Icons.description_outlined,
                onTap: () => edit(FinancialAction.statement),
              ),
              FinanceNotice(
                'Statement vs current posted balance: ${session.amount(c.statementBalance - c.cardBalance)}. This comparison is a review signal, not a forced adjustment or a claim that cycle coverage matches.',
              ),
              for (final h in c.statementHistory)
                FinancialLine(
                  'Earlier statement evidence',
                  session.hideAmounts ? 'Amounts hidden' : h,
                  icon: Icons.history,
                ),
            ],
          ),
          aside: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SectionHeading('Installment studio'),
              EditorialSurface(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const IconTile(
                      Icons.calendar_month_outlined,
                      color: Palette.mint,
                    ),
                    const SizedBox(height: 16),
                    Text(
                      '${c.installmentCount} expected installments',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '${session.amount(c.installmentAmount)} each · plan v${c.installmentVersion}',
                    ),
                    const SizedBox(height: 16),
                    const Text(
                      'A representative provider plan. Applying or revising it does not recognize the purchase again.',
                    ),
                    const SizedBox(height: 20),
                    OutlinedButton(
                      onPressed: () => edit(FinancialAction.installment),
                      child: const Text('Review & apply plan'),
                    ),
                  ],
                ),
              ),
              for (final h in c.installmentHistory)
                FinancialLine(
                  'Previous plan',
                  session.hideAmounts ? 'Amounts hidden' : h,
                  icon: Icons.history,
                ),
            ],
          ),
        ),
      ],
    );
  }
}
