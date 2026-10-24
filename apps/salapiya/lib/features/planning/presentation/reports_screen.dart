import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../app/demo_routes.dart';
import '../../../design_system/editorial.dart';
import '../../../design_system/theme.dart';
import '../../../prototype/scenarios.dart';
import '../../common/prototype_form.dart';
import '../../finance/contracts/financial_models.dart';
import '../../finance/presentation/financial_widgets.dart';
import '../../finance/presentation/money_screen.dart';
import '../application/planning_controller.dart';

class ReportsScreen extends StatefulWidget {
  const ReportsScreen({super.key, required this.session});
  final PrototypeSession session;
  @override
  State<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends State<ReportsScreen> {
  String from = '2026-10-15',
      to = '2026-10-21',
      basis = 'Net',
      category = 'All',
      account = 'All';
  int selected = 6;
  bool pending = false;
  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: widget.session,
    builder: (context, _) {
      final c = widget.session.planning;
      final records = c.contributions(
        from,
        to,
        category: category,
        account: account,
      );
      BigInt spent(Iterable<FinancialRecord> rs, {String? allocation}) =>
          ExactFinance.sum(
            rs.map(
              (r) =>
                  basis == 'Gross' &&
                      ['refund', 'cardRefund', 'sharedRefund'].contains(r.kind)
                  ? BigInt.zero
                  : (allocation ?? category) == 'All'
                  ? r.spending
                  : r.categorySpending[allocation ?? category] ?? BigInt.zero,
            ),
          );
      final total = spent(records);
      final length = dateValue(to).difference(dateValue(from)).inDays + 1;
      final priorTo = dateValue(from).subtract(const Duration(days: 1));
      final priorFrom = priorTo.subtract(Duration(days: length - 1));
      final prior = spent(
        c.contributions(
          civil(priorFrom),
          civil(priorTo),
          category: category,
          account: account,
        ),
      );
      final days = [
        for (var i = 0; i < length; i++)
          civil(dateValue(from).add(Duration(days: i))),
      ];
      final values = [
        for (final d in days) spent(records.where((r) => r.date == d)),
      ];
      selected = selected.clamp(0, days.length - 1);
      String money(BigInt x) => widget.session.amount(x);
      return DemoViewState(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const FinanceHeading(
              'MONEY / REPORTS',
              'See the story behind the numbers.',
              'Follow a category, compare a period, or trace a number back to its source.',
            ),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                OutlinedButton.icon(
                  onPressed: () => reviewForm(
                    context,
                    title: 'Report period',
                    fields: [
                      DemoField('from', 'From', value: from),
                      DemoField('to', 'Through', value: to),
                    ],
                    save: (v) {
                      final a = dateValue(v['from']!), b = dateValue(v['to']!);
                      if (b.isBefore(a) || b.difference(a).inDays > 365) {
                        throw const FormatException('Choose 1–366 days.');
                      }
                      setState(() {
                        from = v['from']!;
                        to = v['to']!;
                        selected = 0;
                      });
                    },
                  ),
                  icon: const Icon(Icons.date_range),
                  label: Text('$from – $to'),
                ),
                for (final b in ['Net', 'Gross'])
                  ChoiceChip(
                    label: Text('$b spending'),
                    selected: basis == b,
                    onSelected: (_) => setState(() => basis = b),
                  ),
                OutlinedButton.icon(
                  onPressed: () => openDemoPage<void>(
                    context,
                    FinancePage(
                      title: 'Report export preview',
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          const FinanceNotice(
                            'Synthetic export preview only. No file is created. Private report; group membership grants no access.',
                          ),
                          Text('$from – $to · $basis · $category · $account'),
                          if (widget.session.complete) ...[
                            Text('Actual spending: ${money(total)}'),
                            for (final r in records)
                              FinancialLine(
                                r.date,
                                r.title,
                                value: money(spent([r])),
                              ),
                          ] else
                            const Text(
                              'Export unavailable: incomplete history.',
                            ),
                        ],
                      ),
                    ),
                    'reports/export',
                  ),
                  icon: const Icon(Icons.ios_share),
                  label: const Text('Export preview'),
                ),
              ],
            ),
            const SizedBox(height: 16),
            FinanceColumns(
              main: DropdownButtonFormField<String>(
                initialValue: category,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Category'),
                items: [
                  for (final s in ['All', ...widget.session.finance.categories])
                    DropdownMenuItem(value: s, child: Text(s)),
                ],
                onChanged: (v) => setState(() => category = v!),
              ),
              aside: DropdownButtonFormField<String>(
                initialValue: account,
                isExpanded: true,
                decoration: const InputDecoration(
                  labelText: 'Financial account',
                ),
                items: [
                  const DropdownMenuItem(
                    value: 'All',
                    child: Text('All accounts'),
                  ),
                  for (final a in widget.session.finance.accounts)
                    DropdownMenuItem(value: a.id, child: Text(a.name)),
                ],
                onChanged: (v) => setState(() => account = v!),
              ),
            ),
            const SizedBox(height: 24),
            if (!widget.session.complete)
              const FinanceNotice(
                'Report unavailable: initial download is incomplete. Missing history is not a zero balance.',
                warning: true,
              )
            else ...[
              FinanceColumns(
                main: ValueBlock(
                  '$basis ACTUAL SPENDING',
                  money(total),
                  '${records.length} source records · complete bounded demo snapshot\nAccepted evidence only; plans and reservations excluded.',
                  dark: true,
                ),
                aside: ValueBlock(
                  'PREVIOUS EQUAL PERIOD',
                  money(prior),
                  '${civil(priorFrom)} – ${civil(priorTo)}\nChange ${money(total - prior)} · zero may mean no demo records.',
                  color: Palette.lilac,
                ),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Show pending cash separately'),
                subtitle: const Text(
                  'Pending effects never enter accepted spending.',
                ),
                value: pending,
                onChanged: (v) => setState(() => pending = v),
              ),
              if (pending)
                FinanceNotice(
                  'Pending net cash effect ${money(widget.session.finance.pendingOutflow)} · awaiting acceptance, excluded above.',
                ),
              const SizedBox(height: 20),
              SectionHeading(
                'Your daily rhythm',
                trailing: Text(
                  '${days[selected]} · ${money(values[selected])}',
                ),
              ),
              if (!widget.session.hideAmounts)
                SizedBox(
                  height: 220,
                  child: Semantics(
                    label: 'Daily spending chart. Select a day below for exact source records.',
                    child: CustomPaint(
                      painter: SpendingPlot(
                        values,
                        selected,
                        Palette.violet,
                        CraftTheme.of(context).subtle,
                      ),
                    ),
                  ),
                ),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    for (var i = 0; i < days.length; i++)
                      Padding(
                        padding: const EdgeInsets.all(4),
                        child: ChoiceChip(
                          label: Text(days[i].substring(5)),
                          selected: selected == i,
                          onSelected: (_) => setState(() => selected = i),
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 24),
              FinanceColumns(
                main: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const SectionHeading('Where it went'),
                    for (final cat
                        in category == 'All'
                            ? records
                                  .expand((r) => r.categorySpending.keys)
                                  .toSet()
                            : {category})
                      ExactBar(
                        label: cat,
                        value: money(spent(records, allocation: cat)),
                        amount: widget.session.hideAmounts
                            ? BigInt.zero
                            : spent(records, allocation: cat),
                        total: total,
                        color: Palette.violet,
                        onTap: () => setState(() => category = cat),
                      ),
                  ],
                ),
                aside: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const SectionHeading('More context'),
                    FinancialLine(
                      'Cash movement',
                      'Transfers net to zero except fees',
                      value: money(
                        ExactFinance.sum(records.expand((r) => r.cash.values)),
                      ),
                    ),
                    FinancialLine(
                      'Card liability effect',
                      'Card payments are not purchase spending',
                      value: money(
                        ExactFinance.sum(records.map((r) => r.card)),
                      ),
                    ),
                    FinancialLine(
                      'Income',
                      'Actual income records only',
                      value: money(
                        ExactFinance.sum(
                          records
                              .where(
                                (r) =>
                                    r.kind == 'income' ||
                                    ([
                                          'correction',
                                          'reversal',
                                        ].contains(r.kind) &&
                                        widget.session.finance.records.any(
                                          (source) =>
                                              source.id == r.sourceId &&
                                              source.kind == 'income',
                                        )),
                              )
                              .map(
                                (r) => r.kind == 'income'
                                    ? r.amount
                                    : ExactFinance.sum(r.cash.values),
                              ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),
              SectionHeading('Sources · ${days[selected]}'),
              if (!records.any((r) => r.date == days[selected]))
                const FinanceNotice(
                  'No actual records for this date in the selected filters.',
                ),
              for (final r in records.where((r) => r.date == days[selected]))
                FinancialLine(
                  r.title,
                  '${r.date} · ${r.category} · ${r.kind}',
                  value: money(spent([r])),
                  onTap: () => openDemoPage<void>(
                    context,
                    TransactionDetail(session: widget.session, id: r.id),
                    'report/source',
                  ),
                ),
              ExpansionTile(
                key: const PageStorageKey('report-exact-daily-table'),
                title: const Text('Exact daily table'),
                children: [
                  for (var i = 0; i < days.length; i++)
                    FinancialLine(
                      days[i],
                      basis,
                      value: money(values[i]),
                      onTap: () => setState(() => selected = i),
                    ),
                ],
              ),
            ],
          ],
        ),
      );
    },
  );
}

class SpendingPlot extends CustomPainter {
  SpendingPlot(this.values, this.selected, this.color, this.grid);
  final List<BigInt> values;
  final int selected;
  final Color color, grid;
  @override
  void paint(Canvas canvas, Size size) {
    final numbers = values.map((x) => x.toDouble()).toList();
    final minValue = math.min(0.0, numbers.reduce(math.min));
    final maxValue = math.max(1.0, numbers.reduce(math.max));
    double y(double v) =>
        size.height -
        16 -
        (v - minValue) / (maxValue - minValue) * (size.height - 32);
    final gridPaint = Paint()
      ..color = grid
      ..strokeWidth = 1;
    for (var i = 0; i < 5; i++) {
      final top = 16 + (size.height - 32) * i / 4;
      canvas.drawLine(Offset(0, top), Offset(size.width, top), gridPaint);
    }
    final width = size.width / numbers.length;
    for (var i = 0; i < numbers.length; i++) {
      final top = y(numbers[i]), zero = y(0);
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromLTRB(
            i * width + width * .18,
            math.min(top, zero),
            i * width + width * .82,
            math.max(top, zero) + 1,
          ),
          const Radius.circular(5),
        ),
        Paint()..color = color.withValues(alpha: i == selected ? 1 : .35),
      );
      if (i == selected) {
        canvas.drawCircle(
          Offset((i + .5) * width, top),
          5,
          Paint()..color = color,
        );
      }
    }
  }

  @override
  bool shouldRepaint(covariant SpendingPlot old) =>
      old.values != values || old.selected != selected || old.color != color;
}
