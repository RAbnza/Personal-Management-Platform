import 'package:flutter/material.dart';

import '../design_system/theme.dart';
import '../features/finance/contracts/financial_models.dart';
import '../features/finance/presentation/financial_editor.dart';
import '../features/finance/presentation/financial_widgets.dart';
import '../local/finance_domain.dart';
import '../local/local_runtime.dart';
import '../prototype/scenarios.dart';
import 'activity_view.dart';
import 'overview_agenda.dart';

/// Production dashboard: all metrics use the accepted journal and civil dates.
/// Pending activity remains separately labelled by the existing controller.
class WorkspaceOverview extends StatelessWidget {
  const WorkspaceOverview({
    super.key,
    required this.session,
    required this.open,
    required this.attention,
  });
  final LocalSession session;
  final ValueChanged<PreviewSource> open;
  final Widget attention;
  @override
  Widget build(BuildContext context) {
    final c = session.localFinance, s = c.acceptedSnapshot;
    final today = civilToday(), start = '${civilToday().substring(0, 7)}-01';
    final postings = s.current
        .expand((r) => r.postings)
        .where(
          (p) => p.date.compareTo(start) >= 0 && p.date.compareTo(today) <= 0,
        );
    final spent = sumMinor(
      postings.where((p) => p.ledger == 'expense').map((p) => p.amount),
    );
    final income = -sumMinor(
      postings.where((p) => p.ledger == 'income').map((p) => p.amount),
    );
    final debt = -sumMinor(
      s.current
          .expand((r) => r.postings)
          .where(
            (p) => p.ledger == 'debt_liability' && p.date.compareTo(today) <= 0,
          )
          .map((p) => p.amount),
    );
    final categories = <String, BigInt>{};
    for (final p in postings.where((p) => p.ledger == 'expense')) {
      final label = c.categoryName(p.category);
      categories[label] = (categories[label] ?? BigInt.zero) + p.amount;
    }
    final sorted = categories.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    String amount(BigInt value) =>
        session.complete ? session.amount(value) : 'Unavailable';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        FinanceHeading(
          'OVERVIEW',
          'Your day, in balance.',
          'Welcome back, ${session.profile.name}. Here is your money and what is ahead.',
          actions: [
            FilledButton.icon(
              onPressed: session.complete
                  ? () =>
                        openFinancialEditor(context, c, FinancialAction.expense)
                  : null,
              icon: const Icon(Icons.add, size: 18),
              label: const Text('Add expense'),
            ),
          ],
        ),
        WorkspaceGrid(
          minWidth: 150,
          children: [
            ValueBlock(
              'LIQUID MONEY',
              session.accepted == null
                  ? 'Unavailable'
                  : session.amount(session.accepted!),
              'Accepted history · card credit excluded',
            ),
            ValueBlock(
              'MONTH SPENDING',
              amount(spent),
              '$start – $today · net recognized',
            ),
            ValueBlock(
              'MONTH INCOME',
              amount(income),
              'Recognized income · borrowing excluded',
            ),
            ValueBlock(
              'DEBT LIABILITY',
              amount(debt),
              'Through today · schedules are separate',
            ),
          ],
        ),
        const SizedBox(height: 16),
        if (session.pending)
          FinanceNotice(
            '${session.syncLabel}. Projected liquid money ${session.projected == null ? 'unavailable' : session.amount(session.projected!)} includes waiting work once; the metrics above use accepted history.',
            warning: true,
          ),
        if (!session.complete)
          const FinanceNotice(
            'Initial download incomplete. Complete financial metrics are unavailable until accepted history is verified.',
            warning: true,
          ),
        FinanceColumns(
          ratio: 2,
          main: WorkspacePanel(
            title: 'Spending this month',
            caption: 'Accepted expenses, net of offsets · PHP',
            trailing: TextButton(
              onPressed: () => open(PreviewSource.reports),
              child: const Text('View report'),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (!session.complete)
                  const Text('Waiting for verified history.')
                else if (session.hideAmounts)
                  const Text(
                    'Amounts hidden. Use the visibility control to show your breakdown.',
                  )
                else if (sorted.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 28),
                    child: Text(
                      'No spending recorded this month. Your category breakdown will appear here.',
                    ),
                  )
                else ...[
                  for (final e in sorted.take(6))
                    ExactBar(
                      label: e.key,
                      value: session.amount(e.value),
                      amount: e.value,
                      total: sumMinor(
                        sorted
                            .where((e) => e.value > BigInt.zero)
                            .map((e) => e.value),
                      ),
                      color: Palette.violet,
                      onTap: () => open(PreviewSource.reports),
                    ),
                  if (sorted.length > 6)
                    TextButton(
                      onPressed: () => open(PreviewSource.reports),
                      child: Text('View all ${sorted.length} categories'),
                    ),
                ],
              ],
            ),
          ),
          aside: WorkspacePanel(
            title: 'Your accounts',
            trailing: TextButton(
              onPressed: session.complete
                  ? () =>
                        openFinancialEditor(context, c, FinancialAction.account)
                  : null,
              child: const Text('Add account'),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (!session.complete)
                  const Text('Waiting for verified accounts.')
                else if (s.accounts.isEmpty)
                  const Text(
                    'Start with a cash wallet or bank account and its opening balance.',
                  )
                else
                  for (final a in s.accounts.take(4))
                    FinancialLine(
                      a.name,
                      a.kind,
                      value: session.amount(s.balance(a.id, through: today)),
                      icon: Icons.account_balance_wallet_outlined,
                      onTap: () => open(PreviewSource.accounts),
                    ),
                if (session.complete &&
                    c.snapshot.current.any(
                      (r) => financeType(r) == 'creditCard',
                    ))
                  FinancialLine(
                    'Credit cards',
                    'Current local view; credit is not cash',
                    value:
                        '${session.amount(c.cardLiabilityAndCredit.$1)} liability / ${session.amount(c.cardLiabilityAndCredit.$2)} credit',
                    icon: Icons.credit_card_outlined,
                    onTap: () => open(PreviewSource.cards),
                  ),
                if (s.accounts.isNotEmpty)
                  TextButton(
                    onPressed: () => open(PreviewSource.accounts),
                    child: Text('View all ${s.accounts.length} accounts'),
                  ),
              ],
            ),
          ),
        ),
        attention,
        const SizedBox(height: 16),
        FinanceColumns(
          ratio: 2,
          main: WorkspacePanel(
            child: ActivityView(
              session: session,
              onViewAll: () => open(PreviewSource.activity),
            ),
          ),
          aside: WorkspacePanel(
            child: OverviewAgenda(session: session, open: open),
          ),
        ),
        WorkspaceGrid(
          children: [
            WorkspacePanel(
              title: 'Shared Expenses',
              caption: 'Group facts stay separate from your private money.',
              child: TextButton.icon(
                onPressed: () => open(PreviewSource.group),
                icon: const Icon(Icons.people_outline, size: 18),
                label: const Text('Open your groups'),
              ),
            ),
            WorkspacePanel(
              title: 'A little room for life',
              caption: 'Tasks, learning, books and your next chapter.',
              child: TextButton.icon(
                onPressed: () => open(PreviewSource.agenda),
                icon: const Icon(Icons.event_outlined, size: 18),
                label: const Text('Open Life'),
              ),
            ),
          ],
        ),
      ],
    );
  }
}
