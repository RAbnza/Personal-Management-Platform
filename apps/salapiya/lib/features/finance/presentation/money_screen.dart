import 'package:flutter/material.dart';

import '../../../app/demo_routes.dart';
import '../../../design_system/editorial.dart';
import '../../../design_system/theme.dart';
import '../../../prototype/scenarios.dart';
import '../application/financial_controller.dart';
import '../contracts/financial_models.dart';
import 'financial_editor.dart';
import 'financial_widgets.dart';
import 'credit_screen.dart';
import 'import_screen.dart';
import '../../planning/presentation/planning_screen.dart';
import '../../planning/presentation/reports_screen.dart';
import '../../supporting/presentation/files_screen.dart';

class MoneyScreen extends StatefulWidget {
  const MoneyScreen({
    super.key,
    required this.session,
    this.initial = 'Accounts',
  });
  final PrototypeSession session;
  final String initial;
  @override
  State<MoneyScreen> createState() => _MoneyScreenState();
}

class _MoneyScreenState extends State<MoneyScreen> {
  late String tab = widget.initial;
  FinancialController get c => widget.session.finance;
  String money(BigInt x) => widget.session.amount(x);
  void edit(FinancialAction action, {String? source}) =>
      openFinancialEditor(context, c, action, sourceId: source);
  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: c,
    builder: (context, _) => Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        FinanceHeading(
          'MONEY / EVERYDAY FINANCES',
          'Make room for living.',
          'A clear view of what you have, where it goes, and the choices ahead.',
          actions: [
            FilledButton.icon(
              onPressed: () => edit(FinancialAction.expense),
              icon: const Icon(Icons.add),
              label: const Text('Add expense'),
            ),
            OutlinedButton.icon(
              onPressed: () => edit(FinancialAction.transfer),
              icon: const Icon(Icons.swap_horiz),
              label: const Text('Transfer'),
            ),
            TextButton(
              onPressed: () => edit(FinancialAction.income),
              child: const Text('Record income'),
            ),
          ],
        ),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final t in [
              'Accounts',
              'Activity',
              'Cards',
              'Planning',
              'Reports',
              'Import',
              'Files',
            ])
              ChoiceChip(
                label: Text(t),
                selected: t == tab,
                showCheckmark: false,
                onSelected: (_) => setState(() => tab = t),
              ),
          ],
        ),
        const SizedBox(height: 24),
        if (!widget.session.complete)
          const FinanceNotice(
            'Financial history is incomplete. Balances and financial actions are unavailable until the demo snapshot is complete.',
            warning: true,
          )
        else if (tab == 'Files')
          FilesScreen(session: widget.session)
        else if (tab == 'Planning')
          PlanningScreen(session: widget.session)
        else if (tab == 'Reports')
          ReportsScreen(session: widget.session)
        else if (tab == 'Cards')
          CreditScreen(session: widget.session)
        else if (tab == 'Import')
          ImportScreen(controller: c)
        else if (tab == 'Activity')
          MoneyLedger(session: widget.session)
        else ...[
          FinanceColumns(
            main: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        'Your accounts',
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                    ),
                    IconButton(
                      tooltip: 'Create account',
                      onPressed: () => edit(FinancialAction.account),
                      icon: const Icon(Icons.add_circle_outline),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                if (c.accounts.isEmpty)
                  FinanceNotice(
                    'Start with a cash wallet or bank account and a confirmed opening balance.',
                  )
                else
                  LayoutBuilder(
                    builder: (context, b) => Wrap(
                      spacing: 16,
                      runSpacing: 16,
                      children: [
                        for (var i = 0; i < c.accounts.length; i++)
                          SizedBox(
                            width:
                                b.maxWidth >= 560 &&
                                    MediaQuery.textScalerOf(context)
                                            .scale(14) <=
                                        21
                                ? (b.maxWidth - 16) / 2
                                : b.maxWidth,
                            child: accountTile(c.accounts[i], i),
                          ),
                      ],
                    ),
                  ),
              ],
            ),
            aside: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                ValueBlock(
                  'LIQUID MONEY',
                  money(c.liquid),
                  '${c.accounts.length} accounts · current demo balances\nCard liabilities excluded.',
                  dark: true,
                ),
                if (c.pendingOutflow != BigInt.zero)
                  FinanceNotice(
                    'Pending net cash effect ${money(c.pendingOutflow)} · projected ${money(c.liquid + c.pendingOutflow)}',
                  ),
                for (final p in c.waitingCommands)
                  FinancialLine(
                    'Check original result',
                    '${p.action.label} · ${p.commandId}',
                    icon: Icons.pending_outlined,
                    onTap: () => openDemoPage<void>(
                      context,
                      FinancePage(
                        title: 'Pending / uncertain command',
                        child: ListenableBuilder(
                          listenable: c,
                          builder: (context, _) => Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              const FinanceNotice(
                                'This lookup uses the original command. It never submits a second financial action.',
                              ),
                              for (final e in p.effects)
                                Padding(
                                  padding: const EdgeInsets.symmetric(
                                    vertical: 8,
                                  ),
                                  child: Text(
                                    widget.session.hideAmounts
                                        ? 'Amounts hidden'
                                        : e,
                                  ),
                                ),
                              FilledButton(
                                onPressed: () {
                                  final result = c.checkResult(p.commandId);
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    SnackBar(
                                      content: Text(
                                        'Demo command: ${result.name}',
                                      ),
                                    ),
                                  );
                                },
                                child: const Text('Check original result'),
                              ),
                            ],
                          ),
                        ),
                      ),
                      'money/command',
                    ),
                  ),
                const SizedBox(height: 20),
                const SectionHeading('Where money lives'),
                if (!widget.session.hideAmounts)
                  for (final a in c.accounts)
                    ExactBar(
                      label: a.name,
                      value: money(a.balance),
                      amount: a.balance,
                      total: c.liquid,
                      color: Palette.violet,
                      onTap: () => openDemoPage<void>(
                        context,
                        AccountDetail(session: widget.session, id: a.id),
                        'money/account/${a.id}',
                      ),
                    ),
                const SizedBox(height: 20),
                const SectionHeading('A little structure'),
                FinancialLine(
                  'Categories & splits',
                  '${c.categories.length} categories · exact allocation',
                  icon: Icons.category_outlined,
                  onTap: () => openDemoPage<void>(
                    context,
                    FinancePage(
                      title: 'Categories',
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          for (final category in c.categories)
                            FinancialLine(
                              category,
                              'Available for transaction splits',
                            ),
                          const SizedBox(height: 16),
                          FilledButton(
                            onPressed: () => edit(FinancialAction.category),
                            child: const Text('Create category'),
                          ),
                        ],
                      ),
                    ),
                    'money/categories',
                  ),
                ),
                FinancialLine(
                  'Review imported history',
                  'CSV preview · duplicates · opening cutoff',
                  icon: Icons.upload_file_outlined,
                  onTap: () => setState(() => tab = 'Import'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 32),
          MoneyLedger(session: widget.session, compact: true),
        ],
      ],
    ),
  );

  Widget accountTile(FinancialAccount a, int index) => Semantics(
    button: true,
    label: '${a.name}, ${money(a.balance)}',
    child: InkWell(
      borderRadius: BorderRadius.circular(24),
      onTap: () => openDemoPage<void>(
        context,
        AccountDetail(session: widget.session, id: a.id),
        'money/account/${a.id}',
      ),
      child: Container(
        padding: const EdgeInsets.all(22),
        decoration: BoxDecoration(
          color: [Palette.mint, Palette.lilac, Palette.peach][index % 3],
          borderRadius: BorderRadius.circular(24),
        ),
        child: DefaultTextStyle.merge(
          style: const TextStyle(color: Palette.ink),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Icon(
                    [
                      Icons.wallet_outlined,
                      Icons.account_balance_outlined,
                      Icons.phone_android,
                    ][index % 3],
                    color: Palette.ink,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      a.archived ? 'ARCHIVED' : 'PHP / ${a.kind.toUpperCase()}',
                      textAlign: TextAlign.end,
                      style: const TextStyle(fontSize: 10, letterSpacing: 1),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 26),
              Text(
                a.name,
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                money(a.balance),
                style: const TextStyle(fontSize: 28, letterSpacing: -.8),
              ),
              const SizedBox(height: 22),
              const Row(
                children: [
                  Expanded(
                    child: Text(
                      'Balance & history',
                      style: TextStyle(fontSize: 12),
                    ),
                  ),
                  Icon(Icons.north_east, color: Palette.ink, size: 20),
                ],
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

class MoneyLedger extends StatefulWidget {
  const MoneyLedger({
    super.key,
    required this.session,
    this.accountId,
    this.compact = false,
  });
  final PrototypeSession session;
  final String? accountId;
  final bool compact;
  @override
  State<MoneyLedger> createState() => _MoneyLedgerState();
}

class _MoneyLedgerState extends State<MoneyLedger> {
  String query = '', kind = 'All', category = 'All';
  int page = 0;
  @override
  Widget build(BuildContext context) {
    final c = widget.session.finance;
    final records = c.records
        .where(
          (r) =>
              !r.sharedOnly &&
              (widget.accountId == null ||
                  r.cash.containsKey(widget.accountId)) &&
              ('${r.title} ${r.note} ${r.date}'.toLowerCase().contains(
                query.toLowerCase(),
              )) &&
              (kind == 'All' || r.kind == kind) &&
              (category == 'All' || r.category == category),
        )
        .toList();
    final size = widget.compact ? 5 : 8;
    final pages = (records.length / size).ceil().clamp(1, 10000);
    final current = page.clamp(0, pages - 1);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionHeading(
          widget.compact ? 'Latest movements' : 'Your activity',
          trailing: widget.compact
              ? TextButton(
                  onPressed: () => openDemoPage<void>(
                    context,
                    FinancePage(
                      title: 'Activity',
                      child: ListenableBuilder(
                        listenable: c,
                        builder: (_, _) => MoneyLedger(session: widget.session),
                      ),
                    ),
                    'money/activity',
                  ),
                  child: const Text('See all'),
                )
              : null,
        ),
        if (!widget.compact) ...[
          TextField(
            decoration: const InputDecoration(
              labelText: 'Search description, date or evidence',
              prefixIcon: Icon(Icons.search),
            ),
            onChanged: (x) => setState(() {
              query = x;
              page = 0;
            }),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final f in [
                'All',
                'expense',
                'income',
                'transfer',
                'cardPurchase',
              ])
                ChoiceChip(
                  label: Text(f == 'cardPurchase' ? 'Card purchase' : f),
                  selected: kind == f,
                  onSelected: (_) => setState(() {
                    kind = f;
                    page = 0;
                  }),
                ),
            ],
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: category,
            decoration: const InputDecoration(labelText: 'Category'),
            isExpanded: true,
            items: [
              for (final cat in ['All', ...c.categories])
                DropdownMenuItem(value: cat, child: Text(cat)),
            ],
            onChanged: (x) => setState(() {
              category = x!;
              page = 0;
            }),
          ),
          const SizedBox(height: 16),
        ],
        if (records.isEmpty)
          const FinanceNotice(
            'No activity matches. Try another search or record a new transaction.',
          ),
        for (final r in records.skip(current * size).take(size))
          FinancialLine(
            r.title,
            '${r.date} · ${r.category} · ${r.status}',
            value: widget.session.amount(r.amount),
            icon: r.kind == 'income'
                ? Icons.south_west
                : r.kind == 'transfer'
                ? Icons.swap_horiz
                : Icons.north_east,
            color: r.kind == 'income' ? Palette.mint : Palette.lilac,
            onTap: () => openDemoPage<void>(
              context,
              TransactionDetail(session: widget.session, id: r.id),
              'money/transaction/${r.id}',
            ),
          ),
        if (!widget.compact)
          Padding(
            padding: const EdgeInsets.only(top: 16),
            child: Wrap(
              spacing: 12,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                Text(
                  '${records.length} records · page ${current + 1} / $pages',
                ),
                IconButton(
                  tooltip: 'Previous page',
                  onPressed: current > 0
                      ? () => setState(() => page = current - 1)
                      : null,
                  icon: const Icon(Icons.chevron_left),
                ),
                IconButton(
                  tooltip: 'Next page',
                  onPressed: current + 1 < pages
                      ? () => setState(() => page = current + 1)
                      : null,
                  icon: const Icon(Icons.chevron_right),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class AccountDetail extends StatelessWidget {
  const AccountDetail({super.key, required this.session, required this.id});
  final PrototypeSession session;
  final String id;
  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: session.finance,
    builder: (context, _) {
      final c = session.finance, a = c.account(id);
      return FinancePage(
        title: a.name,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            FinanceHeading(
              'ACCOUNT / ${a.kind.toUpperCase()}',
              a.name,
              'Opening cutoff ${a.cutoff} · ${a.archived ? 'Archived, history retained' : 'Active private account'}',
              actions: [
                for (final action in [
                  FinancialAction.expense,
                  FinancialAction.income,
                  FinancialAction.reconcile,
                  FinancialAction.archive,
                ])
                  OutlinedButton(
                    onPressed: a.archived
                        ? null
                        : () => openFinancialEditor(
                            context,
                            c,
                            action,
                            initial: {'account': a.id},
                          ),
                    child: Text(action.label),
                  ),
              ],
            ),
            ValueBlock(
              'CURRENT BALANCE',
              session.amount(a.balance),
              'Derived from opening evidence and accepted demo actions. No independent balance edit.',
              color: Palette.mint,
            ),
            const SizedBox(height: 28),
            MoneyLedger(session: session, accountId: id),
          ],
        ),
      );
    },
  );
}

class TransactionDetail extends StatelessWidget {
  const TransactionDetail({super.key, required this.session, required this.id});
  final PrototypeSession session;
  final String id;
  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: session.finance,
    builder: (context, _) {
      final c = session.finance, r = c.records.firstWhere((r) => r.id == id);
      return FinancePage(
        title: 'Transaction detail',
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            FinanceHeading(
              'ACTIVITY / ${r.kind.toUpperCase()}',
              r.title,
              '${r.date} · ${r.category} · ${r.status}',
            ),
            FinanceColumns(
              main: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  ValueBlock(
                    'ORIGINAL AMOUNT',
                    session.amount(r.amount),
                    'Evidence $id · immutable record',
                    color: Palette.lilac,
                  ),
                  const SizedBox(height: 24),
                  const SectionHeading('Financial meaning'),
                  for (final e in r.cash.entries)
                    FinancialLine(
                      c.account(e.key).name,
                      'Actual cash movement',
                      value: session.amount(e.value),
                    ),
                  FinancialLine(
                    'Card liability',
                    'Separate from liquid funds',
                    value: session.amount(r.card),
                  ),
                  FinancialLine(
                    'Recognized spending',
                    'Transfer principal and card repayments excluded',
                    value: session.amount(r.spending),
                  ),
                  if (r.note.trim().isNotEmpty)
                    FinanceNotice(
                      session.hideAmounts ? 'Evidence amounts hidden.' : r.note,
                    ),
                ],
              ),
              aside: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const SectionHeading('Contextual actions'),
                  if ([
                    'expense',
                    'income',
                    'cardPurchase',
                  ].contains(r.kind)) ...[
                    for (final a in [
                      FinancialAction.correction,
                      if (r.kind != 'income') FinancialAction.refund,
                      FinancialAction.reversal,
                    ])
                      Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: OutlinedButton(
                          onPressed: () => openFinancialEditor(
                            context,
                            c,
                            a,
                            sourceId: r.id,
                          ),
                          child: Text(a.label),
                        ),
                      ),
                    if (r.kind != 'income')
                      OutlinedButton(
                        onPressed: () => openFinancialEditor(
                          context,
                          c,
                          FinancialAction.adoption,
                          initial: {
                            'funding': 'Existing purchase',
                            'existing': r.id,
                          },
                        ),
                        child: const Text('Share this purchase'),
                      ),
                  ] else
                    const FinanceNotice(
                      'This action belongs to its source workflow. Linked financial evidence cannot be changed through an ordinary expense form.',
                    ),
                  const SizedBox(height: 24),
                  const SectionHeading('Evidence trail'),
                  SupportingFilesLink(
                    session: session,
                    source: 'action:${r.id}',
                  ),
                  if (r.sourceId != null)
                    FinancialLine(
                      'Original source',
                      r.sourceId!,
                      onTap: c.records.any((x) => x.id == r.sourceId)
                          ? () => openDemoPage<void>(
                              context,
                              TransactionDetail(
                                session: session,
                                id: r.sourceId!,
                              ),
                              'money/source',
                            )
                          : null,
                    ),
                  for (final child in c.records.where(
                    (x) => x.sourceId == r.id,
                  ))
                    FinancialLine(
                      child.kind,
                      '${child.date} · ${session.amount(child.amount)}',
                      onTap: () => openDemoPage<void>(
                        context,
                        TransactionDetail(session: session, id: child.id),
                        'money/evidence',
                      ),
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
