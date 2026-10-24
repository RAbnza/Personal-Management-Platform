import 'package:flutter/material.dart';

import '../../../app/demo_routes.dart';
import '../../../design_system/editorial.dart';
import '../../../design_system/theme.dart';
import '../../../prototype/scenarios.dart';
import '../../common/prototype_form.dart';
import '../../finance/contracts/financial_models.dart';
import '../../finance/application/financial_controller.dart';
import '../../finance/presentation/financial_editor.dart';
import '../../finance/presentation/financial_widgets.dart';
import '../../finance/presentation/money_screen.dart';
import '../application/planning_controller.dart';
import 'forecast_chart.dart';

Map<String, String> options(Iterable<String> values) => {
  for (final v in values) v: v,
};

class PlanningScreen extends StatefulWidget {
  const PlanningScreen({
    super.key,
    required this.session,
    this.initial = 'Recurring',
  });
  final PrototypeSession session;
  final String initial;
  @override
  State<PlanningScreen> createState() => _PlanningScreenState();
}

class _PlanningScreenState extends State<PlanningScreen> {
  late String tab = widget.initial;
  PlanningController get c => widget.session.planning;
  String money(BigInt x) => widget.session.amount(x);
  void form(
    String title,
    List<DemoField> fields,
    void Function(Map<String, String>) save, {
    String? explanation,
  }) => reviewForm(
    context,
    title: title,
    fields: fields,
    save: save,
    revision: () => c.revision + widget.session.finance.version,
    explanation:
        explanation ??
        'A private plan, held only in this demo. It never posts a transaction.',
  );
  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: widget.session,
    builder: (context, _) => DemoViewState(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const FinanceHeading(
            'MONEY / LOOKING AHEAD',
            'Give your money direction.',
            'A little structure for the things that matter. Actual money stays separate from your plans.',
          ),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final t in ['Recurring', 'Budgets', 'Savings', 'Forecast'])
                ChoiceChip(
                  label: Text(t),
                  selected: tab == t,
                  onSelected: (_) => setState(() => tab = t),
                ),
            ],
          ),
          const SizedBox(height: 24),
          if (!widget.session.complete)
            const FinanceNotice(
              'Planning comparisons are unavailable until financial history is complete.',
              warning: true,
            )
          else if (tab == 'Recurring')
            recurring()
          else if (tab == 'Budgets')
            budgetList()
          else if (tab == 'Savings')
            savings()
          else
            ForecastView(session: widget.session),
        ],
      ),
    ),
  );

  void ruleForm([PlanRule? r]) => form(
    r == null ? 'New recurring plan' : 'Revise ${r.name}',
    [
      DemoField('name', 'Name', value: r?.name ?? ''),
      DemoField(
        'kind',
        'Type',
        value: r?.kind ?? 'Bill',
        options: options(['Bill', 'Income', 'Subscription']),
      ),
      DemoField(
        'amount',
        'Expected PHP',
        value: ExactFinance.decimal(r?.amount ?? BigInt.from(185000)),
      ),
      DemoField(
        'start',
        'Effective start',
        value: r == null ? '2026-10-25' : '2026-11-01',
      ),
      DemoField(
        'frequency',
        'Frequency',
        value: r?.frequency ?? 'Monthly',
        options: options(['Daily', 'Weekly', 'Monthly']),
      ),
      DemoField('interval', 'Every N periods', value: '${r?.interval ?? 1}'),
      DemoField('day', 'Day of month (1–31)', value: '${r?.day ?? 25}'),
      DemoField(
        'weekdays',
        'ISO weekdays, comma-separated (Monday = 1)',
        value: r?.weekdays.join(',') ?? '1,5',
      ),
      DemoField(
        'monthEnd',
        'Short-month policy',
        value: r?.monthEnd ?? 'Last valid day',
        options: options(['Last valid day', 'Skip']),
      ),
      DemoField(
        'count',
        'Maximum occurrences (0 = no count limit)',
        value: '${r?.count ?? 12}',
      ),
      DemoField(
        'end',
        'Inclusive end (optional)',
        value: r?.end ?? '',
        required: false,
      ),
      DemoField(
        'account',
        'Suggested cash account',
        value:
            r?.account ??
            widget.session.finance.activeAccounts.firstOrNull?.id ??
            '',
        options: {
          '': 'Unassigned',
          for (final a in widget.session.finance.activeAccounts) a.id: a.name,
        },
        required: false,
      ),
      if (r != null) const DemoField('reason', 'Reason for revision'),
    ],
    (v) => c.saveRule(v, previous: r),
    explanation: 'Asia/Manila · 90-day initial preview. Revisions retain past and linked occurrences. Expected amounts never move money.',
  );
  Widget recurring() => FinanceColumns(
    main: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionHeading(
          'The rhythm of your month',
          trailing: TextButton.icon(
            onPressed: () => ruleForm(),
            icon: const Icon(Icons.add),
            label: const Text('New plan'),
          ),
        ),
        for (final r in c.rules)
          FinancialLine(
            r.name,
            '${r.kind} · every ${r.interval} ${r.frequency.toLowerCase()} period(s) · v${r.version}${r.archived ? ' · archived' : ''}',
            value: money(r.amount),
            icon: r.kind == 'Income' ? Icons.south_west : Icons.event_repeat,
            color: r.kind == 'Income' ? Palette.mint : Palette.lilac,
            onTap: () => openDemoPage<void>(
              context,
              FinancePage(
                title: r.name,
                child: ListenableBuilder(
                  listenable: c,
                  builder: (context, _) => Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      FinanceHeading(
                        'RECURRING / ${r.kind.toUpperCase()}',
                        r.name,
                        '${r.frequency} · Asia/Manila · ${r.monthEnd} · v${r.version}',
                        actions: [
                          if (!r.archived)
                            OutlinedButton(
                              onPressed: () => ruleForm(r),
                              child: const Text('Revise future rule'),
                            ),
                          if (!r.archived)
                            OutlinedButton(
                              onPressed: () => form('Archive ${r.name}', [
                                const DemoField('reason', 'Reason'),
                              ], (_) => c.archiveRule(r)),
                              child: const Text('Archive'),
                            ),
                          if (!r.archived)
                            OutlinedButton(
                              onPressed: () => form('Generate occurrences', [
                                const DemoField(
                                  'from',
                                  'From',
                                  value: '2027-01-01',
                                ),
                                const DemoField(
                                  'to',
                                  'Through',
                                  value: '2027-03-31',
                                ),
                              ], (v) => c.generate(r, v['from']!, v['to']!)),
                              child: const Text('Extend schedule'),
                            ),
                        ],
                      ),
                      for (final o in c.occurrences.where(
                        (o) => o.ruleId == r.id,
                      ))
                        FinancialLine(
                          o.due,
                          '${o.state} · logical ${o.logical}',
                          value: money(o.remaining),
                          onTap: () => occurrence(o),
                        ),
                      const SectionHeading('Rule history'),
                      for (final h in r.history)
                        FinancialLine('Retained evidence', h),
                    ],
                  ),
                ),
              ),
              'planning/rule',
            ),
          ),
        if (c.rules.isEmpty)
          const FinanceNotice(
            'Create your first income, bill or subscription plan.',
          ),
      ],
    ),
    aside: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ValueBlock(
          'UP NEXT',
          'October',
          'Your commitments, at a human pace. These are expectations, not recorded expenses.',
          color: Palette.mint,
        ),
        for (final o
            in (c.occurrences
                .where(
                  (o) =>
                      o.active &&
                      o.remaining > BigInt.zero &&
                      o.due.compareTo('2026-10-31') <= 0,
                )
                .toList()
              ..sort((a, b) => a.due.compareTo(b.due))))
          FinancialLine(
            c.rules.firstWhere((r) => r.id == o.ruleId).name,
            o.due,
            value: money(o.remaining),
            onTap: () => occurrence(o),
          ),
      ],
    ),
  );
  void occurrence(Occurrence o) => openDemoPage<void>(
    Navigator.of(context).overlay!.context,
    FinancePage(
      title: 'Occurrence · ${o.due}',
      child: ListenableBuilder(
        listenable: c,
        builder: (context, _) {
          final r = c.rules.firstWhere((r) => r.id == o.ruleId);
          final candidates = widget.session.finance.records.where(
            (x) => r.kind == 'Income'
                ? x.kind == 'income'
                : ['expense', 'cardPurchase'].contains(x.kind),
          );
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              FinanceHeading(
                'EXPECTED / ${o.state.toUpperCase()}',
                r.name,
                'Logical date ${o.logical} · due ${o.due} · Asia/Manila',
              ),
              ValueBlock(
                'REMAINING EXPECTATION',
                money(o.remaining),
                'Expected ${money(o.expected)} · linked actual ${money(o.linked)}',
                color: Palette.peach,
              ),
              const SizedBox(height: 20),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  if (o.active)
                    OutlinedButton(
                      onPressed: () => form(
                        'Occurrence exception',
                        [
                          DemoField(
                            'action',
                            'Action',
                            value: 'Override',
                            options: options(['Override', 'Skip']),
                          ),
                          DemoField('due', 'Due date', value: o.due),
                          DemoField(
                            'amount',
                            'Expected PHP',
                            value: ExactFinance.decimal(o.expected),
                          ),
                          const DemoField('reason', 'Reason'),
                        ],
                        (v) => c.exception(
                          o,
                          v['action']!,
                          v['due']!,
                          v['amount']!,
                          v['reason']!,
                        ),
                      ),
                      child: const Text('Skip or override'),
                    ),
                  if (o.active && o.remaining > BigInt.zero)
                    FilledButton(
                      onPressed: () => form(
                        'Link actual evidence',
                        [
                          DemoField(
                            'record',
                            'Existing actual transaction',
                            value: candidates.firstOrNull?.id ?? '',
                            options: {
                              for (final x in candidates)
                                x.id: '${x.title} · ${money(x.amount)}',
                            },
                          ),
                          DemoField(
                            'amount',
                            'Amount to link (PHP)',
                            value: ExactFinance.decimal(o.remaining),
                          ),
                        ],
                        (v) => c.link(
                          o,
                          widget.session.finance.records.firstWhere(
                            (x) => x.id == v['record'],
                          ),
                          minor(v['amount']!, zero: false),
                        ),
                      ),
                      child: const Text('Link existing actual'),
                    ),
                  if (o.active)
                    OutlinedButton(
                      onPressed: () => openFinancialEditor(
                        context,
                        widget.session.finance,
                        r.kind == 'Income'
                            ? FinancialAction.income
                            : FinancialAction.expense,
                      ),
                      child: const Text('Record actual first'),
                    ),
                ],
              ),
              const FinanceNotice(
                'Recording actual money and linking it are two reviewed steps. Returning here never creates another transaction. Full linked coverage resolves the reminder.',
              ),
              for (final e in o.links.entries)
                FinancialLine(
                  'Actual ${e.key}',
                  money(e.value),
                  onTap: () => form('Reverse recurring link', [
                    const DemoField('reason', 'Reason'),
                  ], (_) => c.unlink(o, e.key)),
                ),
              const SectionHeading('Occurrence history'),
              for (final h in o.history)
                FinancialLine(
                  'Evidence',
                  widget.session.hideAmounts ? 'Amounts hidden' : h,
                ),
            ],
          );
        },
      ),
    ),
    'planning/occurrence',
  );
  void budgetForm([BudgetPlan? b]) =>
      form(b == null ? 'Create budget' : 'Edit budget ${b.category}', [
        DemoField(
          'category',
          'Expense category',
          value: b?.category ?? 'Food & drink',
          options: options(
            widget.session.finance.categories.where((x) => x != 'Income'),
          ),
        ),
        DemoField('start', 'Start date', value: b?.start ?? '2026-11-01'),
        DemoField('end', 'Inclusive end', value: b?.end ?? '2026-11-30'),
        DemoField(
          'amount',
          'Limit (PHP)',
          value: ExactFinance.decimal(b?.limit ?? BigInt.from(500000)),
        ),
        DemoField(
          'basis',
          'Spending basis',
          value: b?.basis ?? 'Net',
          options: options(['Net', 'Gross']),
        ),
        if (b != null) const DemoField('reason', 'Reason'),
      ], (v) => c.saveBudget(v, old: b));
  Widget budgetList() => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      SectionHeading(
        'Spend with intention',
        trailing: TextButton.icon(
          onPressed: () => budgetForm(),
          icon: const Icon(Icons.add),
          label: const Text('New budget'),
        ),
      ),
      const FinanceNotice(
        'Whole-period actual spending. Net includes offsets on their actual dates; gross excludes refund offsets. No rollover or expected bills.',
      ),
      for (final b in c.budgets)
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 12),
          child: FinanceColumns(
            main: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  b.category,
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                Text(
                  '${b.start} – ${b.end} · ${b.basis}${b.archived ? ' · archived' : ''}',
                ),
                if (!widget.session.hideAmounts)
                  ExactBar(
                    label: b.limit == BigInt.zero
                        ? 'Zero spending limit'
                        : 'Actual / limit',
                    value:
                        '${money(c.spending(b.start, b.end, b.category, b.basis))} / ${money(b.limit)}',
                    amount: c.spending(b.start, b.end, b.category, b.basis),
                    total: b.limit,
                    color: Palette.violet,
                  ),
                Wrap(
                  spacing: 8,
                  children: [
                    TextButton(
                      onPressed: () => budgetForm(b),
                      child: const Text('Edit allocation'),
                    ),
                    TextButton(
                      onPressed: () => form(
                        '${b.archived ? 'Restore' : 'Archive'} budget',
                        [const DemoField('reason', 'Reason')],
                        (v) {
                          b.archived = !b.archived;
                          b.history.add(
                            '${b.archived ? 'Archived' : 'Restored'} · ${v['reason']}',
                          );
                          c.changed();
                        },
                      ),
                      child: Text(b.archived ? 'Restore' : 'Archive'),
                    ),
                    TextButton(
                      onPressed: () => openDemoPage<void>(
                        context,
                        FinancePage(
                          title: 'Budget evidence',
                          child: Column(
                            children: [
                              for (final r in c.contributions(
                                b.start,
                                b.end,
                                category: b.category,
                              ))
                                FinancialLine(
                                  r.title,
                                  r.date,
                                  value: money(r.spending),
                                  onTap: () => openDemoPage<void>(
                                    context,
                                    TransactionDetail(
                                      session: widget.session,
                                      id: r.id,
                                    ),
                                    'money/source',
                                  ),
                                ),
                              for (final h in b.history)
                                FinancialLine(
                                  'Definition history',
                                  widget.session.hideAmounts
                                      ? 'Amounts hidden'
                                      : h,
                                ),
                            ],
                          ),
                        ),
                        'budget/evidence',
                      ),
                      child: const Text('Spending & history'),
                    ),
                  ],
                ),
              ],
            ),
            aside: ValueBlock(
              'REMAINING ALLOWANCE',
              money(b.limit - c.spending(b.start, b.end, b.category, b.basis)),
              'Negative means over budget. Allowance is not cash or savings.',
              color: Palette.lilac,
            ),
          ),
        ),
      if (c.budgets.isEmpty)
        const FinanceNotice(
          'No category budgets yet. Create an allocation to begin.',
        ),
    ],
  );
  void goalForm([SavingsPlan? g]) =>
      form(g == null ? 'New savings goal' : 'Edit ${g.name}', [
        DemoField('name', 'Goal name', value: g?.name ?? ''),
        DemoField(
          'amount',
          'Target PHP',
          value: ExactFinance.decimal(g?.target ?? BigInt.from(2500000)),
        ),
        DemoField('due', 'Target date', value: g?.due ?? '2027-06-01'),
        if (g != null) const DemoField('reason', 'Reason'),
      ], (v) => c.saveGoal(v, old: g));
  Widget savings() => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      SectionHeading(
        'Make space for something good',
        trailing: TextButton.icon(
          onPressed: () => goalForm(),
          icon: const Icon(Icons.add),
          label: const Text('New goal'),
        ),
      ),
      const FinanceNotice(
        'Reservations label existing cash. They do not add assets, freeze an account, or move money. Spending can create a shortfall.',
      ),
      for (final g in c.goals)
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 12),
          child: FinanceColumns(
            main: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(g.name, style: Theme.of(context).textTheme.headlineMedium),
                Text('${g.status} · target ${g.due}'),
                if (!widget.session.hideAmounts)
                  ExactBar(
                    label: 'Reserved toward target',
                    value: '${money(g.reserved)} / ${money(g.target)}',
                    amount: g.reserved,
                    total: g.target,
                    color: Palette.violet,
                  ),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    FilledButton(
                      onPressed: () => form('Reserve or release · ${g.name}', [
                        DemoField(
                          'account',
                          'Account',
                          value:
                              widget.session.finance.accounts.firstOrNull?.id ??
                              '',
                          options: {
                            for (final a in widget.session.finance.accounts)
                              a.id:
                                  '${a.name} · current reserved ${money(g.reservations[a.id] ?? BigInt.zero)}',
                          },
                        ),
                        const DemoField(
                          'amount',
                          'New absolute reservation (PHP; 0 releases)',
                          value: '0.00',
                        ),
                      ], (v) => c.reserve(g, v['account']!, minor(v['amount']!))),
                      child: const Text('Reserve / release'),
                    ),
                    OutlinedButton(
                      onPressed: () => form(
                        'Reallocate reservation',
                        [
                          DemoField(
                            'source',
                            'From account',
                            value: g.reservations.keys.firstOrNull ?? '',
                            options: {
                              for (final id in g.reservations.keys)
                                id: widget.session.finance.account(id).name,
                            },
                          ),
                          DemoField(
                            'goal',
                            'To goal',
                            value:
                                c.goals.where((x) => x != g).firstOrNull?.id ??
                                g.id,
                            options: {for (final x in c.goals) x.id: x.name},
                          ),
                          DemoField(
                            'destination',
                            'To account',
                            value:
                                widget
                                    .session
                                    .finance
                                    .activeAccounts
                                    .firstOrNull
                                    ?.id ??
                                '',
                            options: {
                              for (final a
                                  in widget.session.finance.activeAccounts)
                                a.id: a.name,
                            },
                          ),
                          const DemoField(
                            'amount',
                            'PHP to reallocate',
                            value: '100.00',
                          ),
                        ],
                        (v) => c.reallocate(
                          g,
                          v['source']!,
                          c.goals.firstWhere((x) => x.id == v['goal']),
                          v['destination']!,
                          minor(v['amount']!, zero: false),
                        ),
                      ),
                      child: const Text('Reallocate'),
                    ),
                    TextButton(
                      onPressed: () => goalForm(g),
                      child: const Text('Edit goal'),
                    ),
                    TextButton(
                      onPressed: () => form('Manage ${g.name}', [
                        DemoField(
                          'status',
                          'Status',
                          value: g.status,
                          options: options(['Active', 'Completed', 'Archived']),
                        ),
                        const DemoField('reason', 'Reason'),
                      ], (v) => c.goalStatus(g, v['status']!)),
                      child: const Text('Complete / reopen / archive'),
                    ),
                    TextButton(
                      onPressed: () => openDemoPage<void>(
                        context,
                        FinancePage(
                          title: g.name,
                          child: Column(
                            children: [
                              for (final e in g.reservations.entries)
                                FinancialLine(
                                  widget.session.finance.account(e.key).name,
                                  'Eligible capacity ${money(c.capacity(e.key))} · all-goal reservations ${money(c.reservedIn(e.key))}',
                                  value: money(e.value),
                                ),
                              for (final h in g.history)
                                FinancialLine(
                                  'History',
                                  widget.session.hideAmounts
                                      ? 'Amounts hidden'
                                      : h,
                                ),
                            ],
                          ),
                        ),
                        'savings/history',
                      ),
                      child: const Text('Funding history'),
                    ),
                  ],
                ),
              ],
            ),
            aside: ValueBlock(
              'SUPPORTED FUNDING',
              c.support(g).$1 == c.support(g).$2
                  ? money(c.support(g).$1)
                  : '${money(c.support(g).$1)} – ${money(c.support(g).$2)}',
              c.support(g).$1 >= g.target
                  ? 'Target supported by eligible cash.'
                  : g.reserved > c.support(g).$1
                  ? 'Shared cash shortfall. No arbitrary priority assigned between goals.'
                  : 'Still growing · remaining target ${money(g.target - c.support(g).$1)}',
              color: Palette.mint,
            ),
          ),
        ),
    ],
  );
}

class ForecastView extends StatefulWidget {
  const ForecastView({super.key, required this.session});
  final PrototypeSession session;
  @override
  State<ForecastView> createState() => _ForecastViewState();
}

class _ForecastViewState extends State<ForecastView> {
  String card = 'Unknown', end = '2026-11-20';
  bool independent = false;
  bool futureIndependent = false;
  final Set<String> excluded = {};
  final List<(String, String, BigInt)> adjustments = [];
  @override
  Widget build(BuildContext context) {
    final c = widget.session.planning, f = widget.session.finance;
    String money(BigInt x) => widget.session.amount(x);
    final candidates =
        c.occurrences
            .where(
              (o) =>
                  o.active &&
                  o.remaining > BigInt.zero &&
                  o.due.compareTo('2026-10-21') > 0 &&
                  o.due.compareTo(end) <= 0,
            )
            .toList()
          ..sort((a, b) => a.due.compareTo(b.due));
    final effects = <(String, String, BigInt)>[];
    final futureOpenings = f.accounts
        .where(
          (a) =>
              a.cutoff.compareTo('2026-10-21') > 0 &&
              a.cutoff.compareTo(end) <= 0,
        )
        .toList();
    final unappliedCard = f.records.any(
      (r) =>
          ['cardPayment', 'cardRefund'].contains(r.kind) &&
          (card == 'Statement'
                  ? ExactFinance.sum((f.cardPaymentCoverage[r.id] ?? {}).values)
                  : ExactFinance.sum(
                      f.allInstallmentApplications.values
                          .expand((v) => v.values)
                          .where((v) => v.$1 == r.id)
                          .map((v) => v.$2),
                    )) <
              r.amount,
    );
    final cardBlocked =
        f.cardBalance < BigInt.zero ||
        unappliedCard ||
        (card == 'Installments' && f.suspendedPlans.contains(f.activePlanId));
    final future = f.records
        .where(
          (r) =>
              !r.sharedOnly &&
              r.date.compareTo('2026-10-21') > 0 &&
              r.date.compareTo(end) <= 0 &&
              r.cash.isNotEmpty,
        )
        .toList();
    for (final o in candidates) {
      final r = c.rules.firstWhere((r) => r.id == o.ruleId);
      if (excluded.contains(o.id) ||
          !f.activeAccounts.any((a) => a.id == r.account) ||
          (card != 'Unknown' && r.kind != 'Income' && !independent)) {
        continue;
      }
      if (future.isNotEmpty && !futureIndependent) continue;
      effects.add((
        o.due,
        r.name,
        r.kind == 'Income' ? o.remaining : -o.remaining,
      ));
    }
    if (card == 'Statement' &&
        !cardBlocked &&
        f.statementBalance >= f.statementAllocated &&
        f.statementDue.compareTo('2026-10-21') > 0 &&
        f.statementDue.compareTo(end) <= 0) {
      effects.add((
        f.statementDue,
        'Statement assumption',
        -(f.statementBalance - f.statementAllocated),
      ));
    }
    if (card == 'Installments' && !cardBlocked) {
      final first = dateValue(f.installmentDue);
      for (var i = 0; i < f.installmentCount; i++) {
        final month = DateTime(first.year, first.month + i);
        final due = civil(
          DateTime(
            month.year,
            month.month,
            first.day.clamp(1, DateTime(month.year, month.month + 1, 0).day),
          ),
        );
        if (due.compareTo('2026-10-21') > 0 && due.compareTo(end) <= 0) {
          effects.add((
            due,
            'Installment ${i + 1} assumption',
            -(f.installmentAmount -
                (f.installmentApplications[i]?.$2 ?? BigInt.zero)),
          ));
        }
      }
    }
    final recorded =
        ExactFinance.sum(future.expand((r) => r.cash.values)) +
        ExactFinance.sum(futureOpenings.map((a) => a.openingBalance));
    final expected = ExactFinance.sum(effects.map((e) => e.$3));
    final whatIf = ExactFinance.sum(
      adjustments.where((e) => e.$1.compareTo(end) <= 0).map((e) => e.$3),
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        FinanceColumns(
          main: ValueBlock(
            'ACTUAL OPENING',
            money(c.actualCash),
            '21 Oct 2026 · accepted cash · ${widget.session.coverage}',
            dark: true,
          ),
          aside: ValueBlock(
            'EXPECTED CLOSING',
            money(c.actualCash + recorded + expected),
            'Through $end · hypothetical closing ${money(c.actualCash + recorded + expected + whatIf)}',
            color: Palette.mint,
          ),
        ),
        const SizedBox(height: 24),
        if (!widget.session.hideAmounts)
          ForecastChart(
            opening: c.actualCash,
            end: end,
            recorded: [
              for (final a in futureOpenings) (a.cutoff, a.openingBalance),
              for (final r in future) (r.date, ExactFinance.sum(r.cash.values)),
            ],
            expected: [for (final e in effects) (e.$1, e.$3)],
            hypothetical: [for (final a in adjustments) (a.$1, a.$3)],
          ),
        if (future.isNotEmpty)
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text(
              'Recurring expectations are independent of recorded future cash',
            ),
            subtitle: const Text(
              'Recorded future evidence is always included. Recurring sources are paused until overlap is reviewed.',
            ),
            value: futureIndependent,
            onChanged: (v) => setState(() => futureIndependent = v!),
          ),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final d in ['2026-10-31', '2026-11-20', '2026-12-31'])
              ChoiceChip(
                label: Text('Through $d'),
                selected: end == d,
                onSelected: (_) => setState(() => end = d),
              ),
          ],
        ),
        const SizedBox(height: 16),
        DropdownButtonFormField<String>(
          initialValue: card,
          isExpanded: true,
          decoration: const InputDecoration(
            labelText: 'Card cash payment assumption',
          ),
          items: [
            for (final s in ['Unknown', 'Statement', 'Installments'])
              DropdownMenuItem(value: s, child: Text(s)),
          ],
          onChanged: (v) => setState(() => card = v!),
        ),
        if (card != 'Unknown')
          FinanceNotice(
            'Selected ${card == 'Statement' ? f.activeStatement.reference : f.activePlan.name}. ${cardBlocked ? 'Projection withheld: review card credit, unapplied payment/credit evidence or suspended plan.' : 'Only this selected provider basis is projected; other statements and plans remain outside coverage.'}',
            warning: cardBlocked,
          ),
        if (card != 'Unknown')
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text(
              'Recurring outflows are independent of this card projection',
            ),
            subtitle: const Text(
              'Otherwise recurring outflows are excluded to avoid overlap. Statement and installments are mutually exclusive.',
            ),
            value: independent,
            onChanged: (v) => setState(() => independent = v!),
          ),
        const FinanceNotice(
          'Coverage: generated recurring window only; unassigned cash suggestions excluded. Card payment unknown by default. Loan schedules, living costs, future purchases and provider interest are not inferred. Savings reservations and budgets do not reduce actual cash.',
          warning: true,
        ),
        const SectionHeading('Choose the expectations'),
        for (final o in candidates)
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(c.rules.firstWhere((r) => r.id == o.ruleId).name),
            subtitle: Text('${o.due} · expected ${money(o.remaining)}'),
            value: !excluded.contains(o.id),
            onChanged: (v) =>
                setState(() => v! ? excluded.remove(o.id) : excluded.add(o.id)),
          ),
        const SectionHeading('A possibility, not a promise'),
        OutlinedButton.icon(
          onPressed: () => reviewForm(
            context,
            title: 'Add a what-if',
            fields: [
              const DemoField('name', 'Assumption'),
              const DemoField('date', 'Date', value: '2026-10-29'),
              const DemoField('amount', 'PHP', value: '1500.00'),
              DemoField(
                'direction',
                'Direction',
                value: 'Outflow',
                options: options(['Inflow', 'Outflow']),
              ),
            ],
            explanation: 'Hypothetical values change this forecast only; leaving the forecast resets them.',
            save: (v) {
              final d = dateValue(v['date']!);
              if (!d.isAfter(DateTime(2026, 10, 21)) ||
                  d.isAfter(dateValue(end))) {
                throw const FormatException(
                  'Choose a date inside this forecast.',
                );
              }
              setState(
                () => adjustments.add((
                  v['date']!,
                  v['name']!,
                  minor(v['amount']!, zero: false) *
                      (v['direction'] == 'Outflow' ? -BigInt.one : BigInt.one),
                )),
              );
            },
          ),
          icon: const Icon(Icons.add),
          label: const Text('Add hypothetical adjustment'),
        ),
        for (final a in adjustments)
          FinancialLine(
            a.$2,
            '${a.$1} · hypothetical · tap to remove',
            value: money(a.$3),
            onTap: () => setState(() => adjustments.remove(a)),
          ),
        const SizedBox(height: 24),
        const SectionHeading('Exact contribution table'),
        for (final a in futureOpenings)
          FinancialLine(
            a.name,
            '${a.cutoff} · recorded opening evidence',
            value: money(a.openingBalance),
          ),
        for (final r in future)
          FinancialLine(
            r.title,
            '${r.date} · recorded future cash evidence',
            value: money(ExactFinance.sum(r.cash.values)),
          ),
        for (final e in effects)
          FinancialLine(e.$2, '${e.$1} · expected', value: money(e.$3)),
        FinancialLine(
          'Current reservations',
          'Comparison only; not another cash deduction',
          value: money(ExactFinance.sum(c.goals.map((g) => g.reserved))),
        ),
      ],
    );
  }
}
