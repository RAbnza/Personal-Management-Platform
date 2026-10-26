import 'package:flutter/material.dart';

import '../features/finance/presentation/financial_widgets.dart';
import '../local/finance_domain.dart';
import '../local/local_finance_controller.dart';
import 'finance_screen.dart';

class FinancialSourceList extends StatefulWidget {
  const FinancialSourceList({
    super.key,
    required this.controller,
    required this.records,
  });
  final LocalFinancialController controller;
  final List<LocalRevision> records;
  @override
  State<FinancialSourceList> createState() => _FinancialSourceListState();
}

class _FinancialSourceListState extends State<FinancialSourceList> {
  int page = 0;
  @override
  Widget build(BuildContext context) {
    final rows = widget.records,
        pages = ((rows.length + 24) ~/ 25).clamp(1, 1000000),
        current = page.clamp(0, pages - 1),
        c = widget.controller;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final r in rows.skip(current * 25).take(25))
          FinancialLine(
            r.title,
            '${financeType(r)} · ${r.date} · v${r.number}${c.snapshot.current.contains(r) ? '' : ' · historical'}',
            value: '${c.decimal(r.amount)} PHP',
            icon: Icons.history,
            onTap: () => openFinanceDetail(context, c, r.id),
          ),
        Text('${rows.length} retained sources · page ${current + 1} / $pages'),
        Wrap(
          spacing: 8,
          children: [
            TextButton(
              onPressed: current == 0
                  ? null
                  : () => setState(() => page = current - 1),
              child: const Text('Previous sources'),
            ),
            TextButton(
              onPressed: current + 1 >= pages
                  ? null
                  : () => setState(() => page = current + 1),
              child: const Text('Next sources'),
            ),
          ],
        ),
      ],
    );
  }
}

class FinancialDueList extends StatefulWidget {
  const FinancialDueList({
    super.key,
    required this.controller,
    required this.from,
    required this.through,
  });
  final LocalFinancialController controller;
  final String from, through;
  @override
  State<FinancialDueList> createState() => _FinancialDueListState();
}

class _FinancialDueListState extends State<FinancialDueList> {
  int page = 0;
  @override
  Widget build(BuildContext context) {
    try {
      final rows = financialReminderSources(
            widget.controller.snapshot,
            widget.from,
            widget.through,
          ),
          pages = ((rows.length + 24) ~/ 25).clamp(1, 1000000),
          current = page.clamp(0, pages - 1);
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Financial expectations ${widget.from} through ${widget.through}. Completion requires actual linked financial evidence. No scheduled date posts money.',
          ),
          for (final r in rows.skip(current * 25).take(25))
            FinancialLine(
              r.title,
              '${r.date} · ${r.kind}',
              value: '${widget.controller.decimal(r.amount)} PHP',
              icon: Icons.event_note,
              onTap: () =>
                  openFinanceDetail(context, widget.controller, r.source),
            ),
          Text('${rows.length} due sources · page ${current + 1} / $pages'),
          Wrap(
            spacing: 8,
            children: [
              TextButton(
                onPressed: current == 0
                    ? null
                    : () => setState(() => page = current - 1),
                child: const Text('Previous dues'),
              ),
              TextButton(
                onPressed: current + 1 >= pages
                    ? null
                    : () => setState(() => page = current + 1),
                child: const Text('Next dues'),
              ),
            ],
          ),
        ],
      );
    } on LocalRuleException catch (e) {
      return FinanceNotice('Financial due coverage unavailable: ${e.message}');
    }
  }
}
