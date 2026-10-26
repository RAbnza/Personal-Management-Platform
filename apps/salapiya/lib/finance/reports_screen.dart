import 'dart:convert';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';

import '../app/demo_routes.dart';
import '../design_system/editorial.dart';
import '../features/finance/presentation/financial_widgets.dart';
import '../local/finance_domain.dart';
import '../local/local_finance_controller.dart';
import 'finance_screen.dart';

String financialCsvCell(String value) {
  final unsafe =
      RegExp(r'^[\s\uFEFF]*[=+\-@]').hasMatch(value) ||
      RegExp(r'^[\t\r\n]').hasMatch(value);
  final safe = unsafe ? "'$value" : value;
  return '"${safe.replaceAll('"', '""')}"';
}

String financialCsv(
  LocalSnapshot s,
  String from,
  String endExclusive, {
  String? account,
  String? category,
}) {
  final rows = <List<String>>[
    [
      'salapiya-financial-postings',
      'version',
      '1',
      'owner',
      s.owner,
      'basis',
      'current immutable revisions; economic posting dates',
    ],
    [
      'source_revision',
      'original_action',
      'revision',
      'economic_date',
      'description',
      'ledger',
      'account',
      'category',
      'amount_minor_exact',
      'status',
    ],
  ];
  for (final r in s.current) {
    for (final p in r.postings.where(
      (p) =>
          p.date.compareTo(from) >= 0 &&
          p.date.compareTo(endExclusive) < 0 &&
          (account == null || p.account == account) &&
          (category == null || p.category == category),
    )) {
      rows.add([
        r.id,
        r.actionId,
        '${r.number}',
        p.date,
        r.title,
        p.ledger,
        p.account ?? '',
        p.category ?? '',
        '${p.amount}',
        'Current evidence; see sync coverage',
      ]);
    }
  }
  return '${rows.map((r) => r.map(financialCsvCell).join(',')).join('\r\n')}\r\n';
}

class NativeReportsScreen extends StatefulWidget {
  const NativeReportsScreen({super.key, required this.controller});
  final LocalFinancialController controller;
  @override
  State<NativeReportsScreen> createState() => _NativeReportsScreenState();
}

class _NativeReportsScreenState extends State<NativeReportsScreen> {
  late final from = TextEditingController(
    text: '${civilToday().substring(0, 7)}-01',
  );
  late final through = TextEditingController(text: civilToday());
  String? account, category, error, message;
  int page = 0;
  bool exporting = false;
  @override
  void dispose() {
    from.dispose();
    through.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: widget.controller,
    builder: (context, _) {
      final c = widget.controller, s = c.snapshot;
      var start = '', end = '';
      List<(LocalRevision, LocalPosting)> rows = [];
      try {
        start = planningDate(from.text);
        final last = planningDate(through.text);
        end = DateTime.parse('${last}T00:00:00Z')
            .add(const Duration(days: 1))
            .toIso8601String()
            .substring(0, 10);
        final days = DateTime.parse('${end}T00:00:00Z')
            .difference(DateTime.parse('${start}T00:00:00Z'))
            .inDays;
        if (days < 1 || days > 366) {
          reject('Choose an inclusive report period of 1–366 days.');
        }
        rows = [
          for (final r in s.current)
            for (final p in r.postings)
              if (p.date.compareTo(start) >= 0 &&
                  p.date.compareTo(end) < 0 &&
                  (account == null || p.account == account) &&
                  (category == null || p.category == category))
                (r, p),
        ];
        error = null;
      } catch (e) {
        error = e is LocalRuleException
            ? e.message
            : 'Enter valid dates as YYYY-MM-DD.';
      }
      BigInt ledger(String name) => sumMinor(
        rows.where((r) => r.$2.ledger == name).map((r) => r.$2.amount),
      );
      final spending = ledger('expense'),
          income = -ledger('income'),
          cash = ledger('cash');
      final categoryTotals = <String, BigInt>{};
      for (final row in rows.where(
        (r) => r.$2.ledger == 'expense' || r.$2.ledger == 'income',
      )) {
        final name = '${row.$2.ledger}: ${c.categoryName(row.$2.category)}';
        categoryTotals[name] =
            (categoryTotals[name] ?? BigInt.zero) + row.$2.amount;
      }
      final pending = c.synchronizationStates.values
          .where((v) => ['pending', 'accepted'].contains(v))
          .length;
      final previousDays = error == null
          ? DateTime.parse('${end}T00:00:00Z')
                .difference(DateTime.parse('${start}T00:00:00Z'))
                .inDays
          : 0;
      final previousStart = error == null
          ? DateTime.parse('${start}T00:00:00Z')
                .subtract(Duration(days: previousDays))
                .toIso8601String()
                .substring(0, 10)
          : '';
      final previousSpending = error == null
          ? sumMinor(
              s.current
                  .expand((r) => r.postings)
                  .where(
                    (p) =>
                        p.ledger == 'expense' &&
                        p.date.compareTo(previousStart) >= 0 &&
                        p.date.compareTo(start) < 0 &&
                        (account == null || p.account == account) &&
                        (category == null || p.category == category),
                  )
                  .map((p) => p.amount),
            )
          : BigInt.zero;
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SectionHeading('Financial reports'),
          FinanceNotice(
            'Complete applicable local snapshot · financial view ${s.version}\n'
            '${c.connected ? 'Accepted local history plus $pending pending/accepted-awaiting-download commands. Cached data may be older than another device.' : 'Local-only authoritative history.'}\n'
            'Current effective immutable revisions; economic posting dates; PHP. All matching sources contribute to totals before pagination. ${s.projectionConflicts.isEmpty ? '' : 'Some incompatible pending effects are excluded and require review.'}',
          ),
          Wrap(
            spacing: 12,
            runSpacing: 12,
            children: [
              SizedBox(
                width: 240,
                child: TextField(
                  controller: from,
                  decoration: const InputDecoration(
                    labelText: 'Inclusive start · YYYY-MM-DD',
                  ),
                  onChanged: (_) => setState(() => page = 0),
                ),
              ),
              SizedBox(
                width: 240,
                child: TextField(
                  controller: through,
                  decoration: const InputDecoration(
                    labelText: 'Inclusive end · YYYY-MM-DD',
                  ),
                  onChanged: (_) => setState(() => page = 0),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: account ?? '',
            isExpanded: true,
            decoration: const InputDecoration(
              labelText: 'Exact cash-account posting filter',
            ),
            items: [
              const DropdownMenuItem(
                value: '',
                child: Text('All postings / all sources'),
              ),
              for (final a in s.accounts)
                DropdownMenuItem(value: a.id, child: Text(a.name)),
            ],
            onChanged: (v) => setState(() {
              account = v == '' ? null : v;
              page = 0;
            }),
          ),
          const FinanceNotice(
            'An account filter selects cash posting rows only; category spending and income postings have their own classification. Use All postings for comprehensive expense/liability totals.',
          ),
          DropdownButtonFormField<String>(
            initialValue: category ?? '',
            isExpanded: true,
            decoration: const InputDecoration(
              labelText: 'Exact category posting filter',
            ),
            items: [
              const DropdownMenuItem(
                value: '',
                child: Text('All categories / unclassified postings'),
              ),
              for (final cat in s.categories)
                DropdownMenuItem(value: cat.id, child: Text(cat.name)),
            ],
            onChanged: (v) => setState(() {
              category = v == '' ? null : v;
              page = 0;
            }),
          ),
          if (error != null)
            FinanceNotice(error!)
          else ...[
            const SizedBox(height: 20),
            FinanceNotice(
              'Net recognized spending ${widget.controller.decimal(spending)} PHP\nRecognized income ${widget.controller.decimal(income)} PHP\nNet cash movement ${widget.controller.decimal(cash)} PHP\n'
              'Debt liability movement ${widget.controller.decimal(-ledger('debt_liability'))} PHP\nCard liability movement ${widget.controller.decimal(-ledger('card_liability'))} PHP\n'
              'Shared receivable movement ${widget.controller.decimal(ledger('shared_receivable'))} PHP; payable movement ${widget.controller.decimal(-ledger('shared_payable'))} PHP\n'
              'Uncertain debt payment clearing movement ${widget.controller.decimal(ledger('debt_clearing'))} PHP\n'
              'Previous equal-length period [$previousStart, $start): net spending ${widget.controller.decimal(previousSpending)} PHP; difference ${widget.controller.decimal(spending - previousSpending)} PHP.',
            ),
            for (final value in categoryTotals.entries)
              FinancialLine(
                value.key,
                'Actual classified postings',
                value: '${widget.controller.decimal(value.value)} PHP',
              ),
            const SectionHeading('Source-linked exact posting detail'),
            for (final row in rows.skip(page * 50).take(50))
              FinancialLine(
                row.$1.title,
                '${row.$2.date} · ${row.$2.ledger} · v${row.$1.number}',
                value: '${widget.controller.decimal(row.$2.amount)} PHP',
                icon: Icons.receipt_long,
                onTap: () => openFinanceDetail(context, c, row.$1.id),
              ),
            Text(
              '${rows.length} matching posting rows; showing ${rows.isEmpty ? 0 : page * 50 + 1}–${(page * 50 + 50).clamp(0, rows.length)}. Totals include every match.',
            ),
            Wrap(
              spacing: 8,
              children: [
                TextButton(
                  onPressed: page == 0 ? null : () => setState(() => page--),
                  child: const Text('Previous'),
                ),
                TextButton(
                  onPressed: (page + 1) * 50 >= rows.length
                      ? null
                      : () => setState(() => page++),
                  child: const Text('Next'),
                ),
              ],
            ),
            FilledButton.icon(
              onPressed: exporting
                  ? null
                  : () async {
                      setState(() {
                        exporting = true;
                        message = null;
                      });
                      try {
                        final bytes = Uint8List.fromList(
                          utf8.encode(
                            financialCsv(
                              s,
                              start,
                              end,
                              account: account,
                              category: category,
                            ),
                          ),
                        );
                        final uri = await FilePicker.saveFile(
                          fileName:
                              'salapiya-report-${from.text}-${through.text}.csv',
                          bytes: bytes,
                        );
                        if (mounted) {
                          setState(
                            () => message = uri == null ? 'Export cancelled.' : 'Financial CSV saved with the displayed filters and pending inclusion.',
                          );
                        }
                      } catch (_) {
                        if (mounted) {
                          setState(
                            () => message = 'Export failed. No successful file save is claimed.',
                          );
                        }
                      } finally {
                        if (mounted) setState(() => exporting = false);
                      }
                    },
              icon: const Icon(Icons.download_outlined),
              label: const Text('Export filtered financial CSV'),
            ),
          ],
          if (message != null) FinanceNotice(message!),
        ],
      );
    },
  );
}

class NativeForecastScreen extends StatefulWidget {
  const NativeForecastScreen({super.key, required this.controller});
  final LocalFinancialController controller;
  @override
  State<NativeForecastScreen> createState() => _NativeForecastScreenState();
}

class _NativeForecastScreenState extends State<NativeForecastScreen> {
  late final from = TextEditingController(
    text: DateTime.parse('${civilToday()}T00:00:00Z')
        .add(const Duration(days: 1))
        .toIso8601String()
        .substring(0, 10),
  );
  late final through = TextEditingController(
    text: DateTime.parse('${civilToday()}T00:00:00Z')
        .add(const Duration(days: 30))
        .toIso8601String()
        .substring(0, 10),
  );
  final hypothetical = TextEditingController();
  bool independent = false;
  final cards = <String>{};
  final installmentCards = <String>{}, exclusions = <String>{};
  int dailyPage = 0, sourcePage = 0;
  @override
  void dispose() {
    from.dispose();
    through.dispose();
    hypothetical.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    FinanceForecast? projection;
    String? error;
    try {
      final changes = <ForecastContribution>[];
      for (final line
          in hypothetical.text.trim().isEmpty
              ? <String>[]
              : hypothetical.text.trim().split('\n')) {
        final parts = line.split(',');
        if (parts.length < 3) {
          reject('Use date,signed PHP amount,label for each hypothetical.');
        }
        changes.add(
          ForecastContribution(
            'hypothetical-${changes.length}',
            parts.skip(2).join(',').trim(),
            parts[0].trim(),
            signedPhp(parts[1].trim()),
            'Hypothetical',
          ),
        );
      }
      projection = financialForecast(
        widget.controller.snapshot,
        today: civilToday(),
        from: from.text,
        through: through.text,
        independentRecurring: independent,
        cardStatements: cards.toList(),
        cardInstallments: installmentCards.toList(),
        excludedSources: exclusions,
        adjustments: changes,
      );
    } catch (e) {
      error = e is LocalRuleException
          ? e.message
          : 'Review exact dates and signed PHP hypothetical amounts.';
    }
    return FinancePage(
      title: 'Cash forecast',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const FinanceNotice(
            'Read-only estimates. Expected and hypothetical money never change an actual balance. Card policy is unknown unless explicitly selected. No source is silently materialized or posted.',
          ),
          TextField(
            controller: from,
            decoration: const InputDecoration(
              labelText: 'First projected day · YYYY-MM-DD',
            ),
            onChanged: (_) => setState(() {}),
          ),
          TextField(
            controller: through,
            decoration: const InputDecoration(
              labelText: 'Last projected day · YYYY-MM-DD',
            ),
            onChanged: (_) => setState(() {}),
          ),
          CheckboxListTile(
            value: independent,
            title: const Text(
              'I reviewed recurring expectations as independent from recorded future cash and selected card payments',
            ),
            onChanged: (v) => setState(() => independent = v ?? false),
          ),
          for (final r in widget.controller.snapshot.current.where(
            (r) => financeType(r) == 'statement',
          ))
            CheckboxListTile(
              value: cards.contains(r.id),
              title: Text(
                'Assume statement payment: ${r.title} · due ${r.values['due']}',
              ),
              onChanged: (v) => setState(() {
                if (v == true) {
                  cards.add(r.id);
                } else {
                  cards.remove(r.id);
                }
              }),
            ),
          TextField(
            controller: hypothetical,
            minLines: 3,
            maxLines: 6,
            decoration: const InputDecoration(
              labelText:
                  'Optional what-if rows: YYYY-MM-DD,signed PHP amount,label',
            ),
            onChanged: (_) => setState(() {}),
          ),
          for (final r in widget.controller.snapshot.current.where(
            (r) => financeType(r) == 'creditCard',
          ))
            CheckboxListTile(
              value: installmentCards.contains(r.actionId),
              title: Text(
                'Assume eligible installment schedule payments: ${r.title}',
              ),
              onChanged: (v) => setState(() {
                if (v == true) {
                  installmentCards.add(r.actionId);
                } else {
                  installmentCards.remove(r.actionId);
                }
              }),
            ),
          for (final id in exclusions)
            TextButton(
              onPressed: () => setState(() => exclusions.remove(id)),
              child: Text('Restore expected source $id'),
            ),
          if (error != null) FinanceNotice(error),
          if (projection case final p?) ...[
            FinanceNotice(
              'Actual signed liquid opening through ${civilToday()}: ${widget.controller.decimal(p.opening)} PHP\n'
              'Projected opening of selected window: ${widget.controller.decimal(p.windowOpening)} PHP (includes any bridge).\n'
              'Current reservations: ${widget.controller.decimal(p.reserved)} PHP, shown separately; no account-level guarantee.\n'
              'Financial view ${widget.controller.snapshot.version}; cached sources include pending effects. No future salary, credit limit or debt schedule is current cash.',
            ),
            for (final exclusion in p.exclusions) FinanceNotice(exclusion),
            const SectionHeading('Exact daily closing projection'),
            for (final row
                in p.daily.entries
                    .skip(
                      dailyPage.clamp(
                            0,
                            (p.daily.length - 1).clamp(0, 366) ~/ 31,
                          ) *
                          31,
                    )
                    .take(31))
              FinancialLine(
                row.key,
                'Projected; not actual money',
                value: '${widget.controller.decimal(row.value)} PHP',
              ),
            Text('${p.daily.length} days; all dates contribute to totals.'),
            Wrap(
              spacing: 8,
              children: [
                TextButton(
                  onPressed: dailyPage == 0
                      ? null
                      : () => setState(() => dailyPage--),
                  child: const Text('Previous days'),
                ),
                TextButton(
                  onPressed: (dailyPage + 1) * 31 >= p.daily.length
                      ? null
                      : () => setState(() => dailyPage++),
                  child: const Text('Next days'),
                ),
              ],
            ),
            const SectionHeading('Included source contributions'),
            for (final row
                in p.contributions
                    .skip(
                      sourcePage.clamp(
                            0,
                            (p.contributions.length - 1).clamp(0, 5000) ~/ 25,
                          ) *
                          25,
                    )
                    .take(25))
              FinancialLine(
                row.label,
                '${row.date} · ${row.basis}',
                value: '${widget.controller.decimal(row.amount)} PHP',
                onTap:
                    row.basis == 'Recurring expected cash' ||
                        row.basis.startsWith('Explicit')
                    ? () => setState(() => exclusions.add(row.source))
                    : null,
              ),
            Text(
              '${p.contributions.length} complete included contributions. Tap an expected source to exclude it; actual future cash remains authoritative.',
            ),
            Wrap(
              spacing: 8,
              children: [
                TextButton(
                  onPressed: sourcePage == 0
                      ? null
                      : () => setState(() => sourcePage--),
                  child: const Text('Previous contributions'),
                ),
                TextButton(
                  onPressed: (sourcePage + 1) * 25 >= p.contributions.length
                      ? null
                      : () => setState(() => sourcePage++),
                  child: const Text('Next contributions'),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

Future<void> openNativeForecast(
  BuildContext context,
  LocalFinancialController c,
) => openDemoPage<void>(
  context,
  NativeForecastScreen(controller: c),
  'finance/forecast',
);
