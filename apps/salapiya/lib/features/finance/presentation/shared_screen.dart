import 'package:flutter/material.dart';

import '../../../app/demo_routes.dart';
import '../../../design_system/editorial.dart';
import '../../../design_system/theme.dart';
import '../../../prototype/scenarios.dart';
import '../application/financial_controller.dart';
import '../contracts/financial_models.dart';
import 'financial_editor.dart';
import 'financial_widgets.dart';

class SharedScreen extends StatefulWidget {
  const SharedScreen({
    super.key,
    required this.session,
    this.initial = 'Bills',
  });
  final PrototypeSession session;
  final String initial;
  @override
  State<SharedScreen> createState() => _SharedScreenState();
}

class _SharedScreenState extends State<SharedScreen> {
  late String tab = widget.initial;
  bool projected = false;
  FinancialController get c => widget.session.finance;
  String money(BigInt v) => widget.session.amount(v);
  void edit(FinancialAction a, {String? source}) =>
      openFinancialEditor(context, c, a, sourceId: source);
  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: c,
    builder: (context, _) {
      final positions = c.groupPositions(projected: projected);
      final total = ExactFinance.sum(
        c.groupBills.map((b) => b.total - b.refunded),
      );
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          FinanceHeading(
            'SHARED EXPENSES / TOGETHER, CLEARLY',
            'Good company.\nClear money.',
            'Group facts out in the open. Your private finances stay yours.',
            actions: [
              FilledButton.icon(
                onPressed: () => edit(FinancialAction.sharedBill),
                icon: const Icon(Icons.add),
                label: const Text('Add shared expense'),
              ),
              OutlinedButton(
                onPressed: () => edit(FinancialAction.settlement),
                child: const Text('Report payment'),
              ),
              TextButton(
                onPressed: () => edit(FinancialAction.group),
                child: const Text('Create group'),
              ),
            ],
          ),
          if (widget.session.local)
            const FinanceNotice(
              'Explore a fictional household while local-only. These are illustrative shared records, not live membership. Production group participation requires connection.',
            ),
          DropdownButtonFormField<String>(
            key: ValueKey('active-group-${c.activeGroup}'),
            initialValue: c.activeGroup,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Group'),
            items: [
              for (final g in c.groups.entries)
                DropdownMenuItem(value: g.key, child: Text(g.value)),
            ],
            onChanged: (v) => c.selectGroup(v!),
          ),
          const SizedBox(height: 20),
          FinanceColumns(
            main: EditorialSurface(
              color: CraftTheme.of(context).dark
                  ? const Color(0xFF332D29)
                  : const Color(0xFFF5E7DD),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final m in c.members.keys)
                        Tooltip(
                          message: '$m · ${c.members[m]}',
                          child: CircleAvatar(
                            backgroundColor: Palette.peach,
                            foregroundColor: Palette.ink,
                            child: Text(m.substring(0, 1)),
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 24),
                  Text(
                    c.groups[c.activeGroup]!,
                    style: Theme.of(context).textTheme.headlineMedium,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    '${c.members.length} people · ${c.groupBills.length} bills · complete demo snapshot',
                  ),
                  const SizedBox(height: 24),
                  Text(
                    money(total),
                    style: Theme.of(context).textTheme.displaySmall,
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    'Group spending after refunds · not your private expense',
                  ),
                  const SizedBox(height: 20),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      ChoiceChip(
                        label: const Text('Confirmed'),
                        selected: !projected,
                        onSelected: (_) => setState(() => projected = false),
                      ),
                      ChoiceChip(
                        label: const Text('Projected incl. pending'),
                        selected: projected,
                        onSelected: (_) => setState(() => projected = true),
                      ),
                    ],
                  ),
                  for (final p in positions.entries)
                    FinancialLine(
                      p.key,
                      p.value >= BigInt.zero
                          ? 'Net receivable / advance'
                          : 'Net payable',
                      value: money(p.value.abs()),
                      icon: p.value >= BigInt.zero
                          ? Icons.south_west
                          : Icons.north_east,
                      color: Palette.mint,
                    ),
                  Text(
                    'Position sum: ${money(ExactFinance.sum(positions.values))} · ${projected ? 'pending reports included' : 'pending and disputed reports excluded'}',
                    style: const TextStyle(fontSize: 12),
                  ),
                ],
              ),
            ),
            aside: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const SectionHeading('Needs a little attention'),
                for (final s in c.groupSettlements.where(
                  (s) => s.status == SettlementStatus.pending,
                ))
                  FinancialLine(
                    '${s.sender} reported a payment',
                    '${s.recipient} to confirm · ${money(s.amount)}',
                    icon: Icons.mark_email_unread_outlined,
                    color: Palette.peach,
                    onTap: () =>
                        edit(FinancialAction.confirmation, source: s.id),
                  ),
                if (!c.groupSettlements.any(
                  (s) => s.status == SettlementStatus.pending,
                ))
                  const FinanceNotice('No receipts waiting for confirmation.'),
                const SizedBox(height: 20),
                const SectionHeading('Your perspective'),
                DropdownButtonFormField<String>(
                  initialValue: c.actor,
                  isExpanded: true,
                  decoration: const InputDecoration(
                    labelText: 'Demo acting identity',
                  ),
                  items: [
                    for (final m in c.members.keys)
                      DropdownMenuItem(value: m, child: Text(m)),
                  ],
                  onChanged: (v) => c.setActor(v!, c.formerMember),
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Former-member scenario'),
                  subtitle: const Text(
                    'Retained history; no new group writes.',
                  ),
                  value: c.formerMember,
                  onChanged: (v) => c.setActor(c.actor, v),
                ),
                const FinanceNotice(
                  'These controls demonstrate permissions. They do not provide authentication or backend security.',
                ),
              ],
            ),
          ),
          const SizedBox(height: 28),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final t in [
                'Bills',
                'Payments',
                'Balances',
                'People',
                'Private review',
                'History',
              ])
                ChoiceChip(
                  label: Text(t),
                  selected: tab == t,
                  showCheckmark: false,
                  onSelected: (_) => setState(() => tab = t),
                ),
            ],
          ),
          const SizedBox(height: 24),
          ...switch (tab) {
            'Payments' => payments(),
            'Balances' => balances(),
            'People' => people(),
            'Private review' => privateReview(),
            'History' => [
              const SectionHeading('Group history'),
              for (final h in c.groupHistory)
                FinancialLine('Immutable demo event', h, icon: Icons.history),
              if (c.groupHistory.isEmpty)
                const FinanceNotice(
                  'Opening dinner and pending payment are independent synthetic fixtures. New actions appear here.',
                ),
            ],
            _ => [
              const SectionHeading('Shared bills'),
              if (c.groupBills.isEmpty)
                const FinanceNotice(
                  'No bills in this group yet. Create one to explore payer and participant splits.',
                ),
              for (final b in c.groupBills)
                FinancialLine(
                  b.title,
                  'Created by ${b.creator} · v${b.revision} · ${b.shares.length} participants${c.adoptions.containsKey(b.id) ? ' · private adoption linked' : ''}',
                  value: money(b.total - b.refunded),
                  icon: Icons.restaurant_outlined,
                  color: Palette.peach,
                  onTap: () => openDemoPage<void>(
                    context,
                    SharedBillDetail(session: widget.session, id: b.id),
                    'shared/bill/${b.id}',
                  ),
                ),
            ],
          },
        ],
      );
    },
  );

  List<Widget> payments() => [
    const SectionHeading('Payments & receipts'),
    OutlinedButton(
      onPressed: () => edit(FinancialAction.settlementPrivate),
      child: const Text('Link my actual payment / receipt'),
    ),
    for (final s in c.groupSettlements)
      FinancialLine(
        '${s.sender} → ${s.recipient}',
        '${s.status.name} · ${s.allocations.length} bill allocations · advance ${money(s.advance)}',
        value: money(s.amount),
        icon: Icons.compare_arrows,
        color: s.confirmed ? Palette.mint : Palette.peach,
        onTap: () => openDemoPage<void>(
          context,
          FinancePage(
            title: 'Payment evidence',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                FinanceHeading(
                  'SHARED / ${s.status.name.toUpperCase()}',
                  '${s.sender} → ${s.recipient}',
                  money(s.amount),
                ),
                for (final e in s.allocations.entries)
                  FinancialLine(
                    c.bill(e.key).title,
                    'Source revision ${s.versions[e.key]}',
                    value: money(e.value),
                  ),
                FinancialLine(
                  'Advance',
                  'Unallocated; no forced source redistribution',
                  value: money(s.advance),
                ),
                const SizedBox(height: 24),
                for (final h in s.history)
                  FinancialLine('Event', h, icon: Icons.history),
                const FinanceNotice(
                  'Confirmation/reversal changes group coverage, not cash. Your actual payment or receipt needs its own private authorization.',
                ),
                FilledButton(
                  onPressed: () =>
                      edit(FinancialAction.confirmation, source: s.id),
                  child: const Text('Review receipt decision'),
                ),
              ],
            ),
          ),
          'shared/payment/${s.id}',
        ),
      ),
    if (c.groupSettlements.isEmpty)
      const FinanceNotice(
        'No reports yet. A report will stay pending until the recipient confirms.',
      ),
  ];

  List<Widget> balances() {
    final names = c.members.keys.toList()..sort();
    final disputed = c.groupSettlements.any(
      (s) => s.status == SettlementStatus.disputed,
    );
    return [
      const SectionHeading('Where each position comes from'),
      const FinanceNotice(
        'Pairwise sources offset reciprocal obligations. Suggestions are explanations requiring agreement; they never post money or redirect original bills.',
      ),
      for (var i = 0; i < names.length; i++)
        for (var j = i + 1; j < names.length; j++)
          Builder(
            builder: (context) {
              final left = names[i], right = names[j];
              final forward = ExactFinance.sum(
                c.groupBills.map((b) => c.billObligation(b, left, right)),
              );
              final backward = ExactFinance.sum(
                c.groupBills.map((b) => c.billObligation(b, right, left)),
              );
              final net = forward - backward;
              return ExpansionTile(
                title: Text('$left ↔ $right'),
                subtitle: Text(
                  'Reciprocal net ${money(net.abs())} · ${net >= BigInt.zero ? '$left owes $right' : '$right owes $left'}',
                ),
                children: [
                  for (final b in c.groupBills)
                    FinancialLine(
                      b.title,
                      'v${b.revision} · source attribution retained',
                      value:
                          '${money(c.billObligation(b, left, right))} / ${money(c.billObligation(b, right, left))}',
                    ),
                ],
              );
            },
          ),
      const SizedBox(height: 24),
      SectionHeading(disputed ? 'Suggestions paused' : 'A suggested next step'),
      if (disputed)
        const FinanceNotice(
          'Resolve the disputed payment before using group settlement suggestions.',
          warning: true,
        )
      else ...[
        for (final p in c.groupPositions().entries.where(
          (p) => p.value < BigInt.zero,
        ))
          FinancialLine(
            '${p.key} can review a payment',
            'Net payable ${money(-p.value)}. Inspect the original bills and recipient before reporting.',
            icon: Icons.lightbulb_outline,
            color: Palette.mint,
            onTap: () => openFinancialEditor(
              context,
              c,
              FinancialAction.settlement,
              initial: {'sender': p.key},
            ),
          ),
      ],
    ];
  }

  List<Widget> people() => [
    const SectionHeading('People & membership'),
    Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        OutlinedButton(
          onPressed: () => edit(FinancialAction.member),
          child: const Text('Add participant'),
        ),
        OutlinedButton(
          onPressed: () => edit(FinancialAction.invitation),
          child: const Text('Review invitation / claim'),
        ),
      ],
    ),
    const SizedBox(height: 16),
    for (final m in c.members.entries)
      FinancialLine(
        m.key,
        m.value,
        icon: Icons.person_outline,
        color: Palette.peach,
      ),
    const FinanceNotice(
      'Group owners administer membership; they cannot inspect private funding. Former-member access retains entitled history only. Full lifecycle and history export are assigned to D4.',
    ),
  ];

  List<Widget> privateReview() => c.actor != 'Amihan'
      ? [
          const FinanceNotice(
            'This identity cannot view Amihan’s private funding or review decisions. Switch back to Amihan to inspect your own private records.',
            warning: true,
          ),
        ]
      : [
          const SectionHeading('Only your private records'),
          const FinanceNotice(
            'Amihan’s private accounts and classifications are visible only in this local private view. They are not part of the group record.',
          ),
          for (final s in c.groupSettlements.where(
            (s) => c.privateSettlements.contains(s.id),
          ))
            FinancialLine(
              'Private payment / receipt',
              '${s.sender} → ${s.recipient} · actual movement already recorded\nGroup state: ${s.status.name} · ${c.privateSettlementReviews[s.id] ?? 'Clearing coverage needs review'}',
              icon: Icons.lock_outline,
              onTap: () => openFinancialEditor(
                context,
                c,
                FinancialAction.settlementPrivate,
                sourceId: s.id,
                initial: {'decision': 'Review clearing coverage'},
              ),
            ),
          for (final b in c.groupBills)
            Builder(
              builder: (context) {
                final a = c.adoptions[b.id];
                return FinancialLine(
                  b.title,
                  a == null
                      ? 'Not adopted · no private effect'
                      : 'Accepted v${a.revision} / group v${b.revision} · funding ${money(a.funding)} · own share ${money(a.share)}${c.retainedReviews[b.id] == null ? '' : '\nRetained evidence review: ${c.retainedReviews[b.id]}'}',
                  icon: Icons.lock_outline,
                  color: Palette.mint,
                  onTap: () => edit(
                    a == null
                        ? FinancialAction.adoption
                        : FinancialAction.privateReview,
                    source: b.id,
                  ),
                );
              },
            ),
        ];
}

class SharedBillDetail extends StatelessWidget {
  const SharedBillDetail({super.key, required this.session, required this.id});
  final PrototypeSession session;
  final String id;
  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: session.finance,
    builder: (context, _) {
      final c = session.finance, b = c.bill(id);
      final history = <SharedBill>[];
      SharedBill? previous = b.previous;
      while (previous != null) {
        history.add(previous);
        previous = previous.previous;
      }
      return FinancePage(
        title: 'Shared expense',
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            FinanceHeading(
              'GROUP RECORD / REVISION ${b.revision}',
              b.title,
              'Created by ${b.creator} · private funding details are not shared.',
              actions: [
                for (final a in [
                  FinancialAction.sharedCorrection,
                  FinancialAction.sharedRefund,
                  c.adoptions.containsKey(id)
                      ? FinancialAction.privateReview
                      : FinancialAction.adoption,
                ])
                  OutlinedButton(
                    onPressed: () =>
                        openFinancialEditor(context, c, a, sourceId: id),
                    child: Text(a.label),
                  ),
              ],
            ),
            ValueBlock(
              'BILL AFTER REFUNDS',
              session.amount(b.total - b.refunded),
              'Gross ${session.amount(b.total)} · refunds ${session.amount(b.refunded)}',
              color: Palette.peach,
            ),
            const SizedBox(height: 24),
            FinanceColumns(
              main: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const SectionHeading('Payers & participants'),
                  for (final m in c.members.keys)
                    FinancialLine(
                      m,
                      'Paid ${session.amount(b.paid[m] ?? BigInt.zero)} · consumed ${session.amount(b.shares[m] ?? BigInt.zero)}',
                      value: session.amount(
                        (b.paid[m] ?? BigInt.zero) -
                            (b.shares[m] ?? BigInt.zero),
                      ),
                      icon: Icons.person_outline,
                      color: Palette.peach,
                    ),
                  if (b.refunded > BigInt.zero) ...[
                    const SectionHeading('Independent refund axes'),
                    for (final m in c.members.keys)
                      FinancialLine(
                        m,
                        'Received ${session.amount(b.receivedRefunds[m] ?? BigInt.zero)} · share credit ${session.amount(b.shareRefunds[m] ?? BigInt.zero)}',
                      ),
                  ],
                ],
              ),
              aside: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const SectionHeading('Revision trail'),
                  FinancialLine(
                    'Current v${b.revision}',
                    b.reason.isEmpty
                        ? 'Original accepted group fact'
                        : b.reason,
                    icon: Icons.history,
                  ),
                  for (final old in history)
                    FinancialLine(
                      'Previous v${old.revision}',
                      '${old.title} · ${session.amount(old.total)}',
                      icon: Icons.history,
                    ),
                  const FinanceNotice(
                    'Corrections retain earlier bills, refunds and settlements. Private accepted pointers do not change automatically.',
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
