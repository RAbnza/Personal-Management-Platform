import 'package:flutter/material.dart';

import '../../../design_system/editorial.dart';
import '../../../design_system/theme.dart';
import '../application/financial_controller.dart';
import 'financial_widgets.dart';
import '../../common/prototype_form.dart';

class ImportScreen extends StatefulWidget {
  const ImportScreen({super.key, required this.controller});
  final FinancialController controller;
  @override
  State<ImportScreen> createState() => _ImportScreenState();
}

class _ImportScreenState extends State<ImportScreen> {
  late final c = widget.controller.importSession;
  late final opening = TextEditingController(text: c.earlierOpening);
  @override
  void dispose() {
    opening.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: c,
    builder: (context, _) => Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const FinanceHeading(
          'IMPORT / A CAREFUL ARRIVAL',
          'Bring the story with you.',
          'A simulated CSV review. No file is read, uploaded or stored.',
        ),
        ExpansionTile(
          key: const PageStorageKey('csv-format-details'),
          title: const Text('Supported format & column mapping'),
          children: [
            const FinanceNotice(
              'pmp-cash-activity v1 · UTF-8 · PHP · at most 1 MiB / 500 rows / 16 KiB per row. Only cash income and expenses. No provider, card, debt, transfer or refund inference.',
            ),
            for (final e in {
              'date': 'Civil date with explicit interpretation',
              'kind': 'income or expense',
              'amount_minor': 'Canonical integer minor units',
              'classification':
                  'Expense category or earned/gift/reward/other income',
              'description': 'Source description',
              'reference': 'Duplicate review reference',
            }.entries)
              FinancialLine(e.key, e.value),
            DropdownButtonFormField<String>(
              initialValue: c.dateFormat,
              isExpanded: true,
              decoration: const InputDecoration(
                labelText: 'Date interpretation',
              ),
              items: [
                for (final d in ['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY'])
                  DropdownMenuItem(value: d, child: Text(d)),
              ],
              onChanged: c.accepted > 0
                  ? null
                  : (v) {
                      c.dateFormat = v!;
                      c.refresh();
                    },
            ),
            const FinanceNotice(
              'Changing interpretation changes the setup specimen. Normalized synthetic preview rows below always display ISO dates.',
            ),
            OutlinedButton(
              onPressed: () => reviewForm(
                context,
                title: 'Import validation scenario',
                fields: [
                  DemoField(
                    'scenario',
                    'Input scenario',
                    value: 'Supported sample',
                    options: {
                      for (final x in [
                        'Supported sample',
                        'Unsupported provider format',
                        'Wrong currency',
                        'Oversized file',
                        'Invalid encoding',
                        'Duplicate file',
                      ])
                        x: x,
                    },
                  ),
                ],
                save: (v) {
                  c.inputScenario = v['scenario']!;
                  c.refresh();
                },
              ),
              child: const Text('Explore file validation'),
            ),
            if (c.inputScenario != 'Supported sample')
              FinanceNotice(
                c.inputScenario == 'Duplicate file'
                    ? 'Duplicate file specimen: inspect row fingerprints and acknowledge duplicate rows before processing.'
                    : '${c.inputScenario}: unsupported source is blocked. Return to Supported sample to continue.',
                warning: true,
              ),
          ],
        ),
        FinanceColumns(
          main: EditorialSurface(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const SectionHeading('01 · Choose the destination'),
                DropdownButtonFormField<String>(
                  initialValue: c.accountId.isEmpty ? null : c.accountId,
                  decoration: const InputDecoration(
                    labelText: 'Liquid account',
                  ),
                  isExpanded: true,
                  items: [
                    for (final a in widget.controller.activeAccounts)
                      DropdownMenuItem(value: a.id, child: Text(a.name)),
                  ],
                  onChanged: c.reviewed || c.accepted > 0
                      ? null
                      : (v) {
                          c.accountId = v!;
                          c.refresh();
                        },
                ),
                const SizedBox(height: 16),
                const FinanceNotice(
                  'Sample: pmp-cash-activity v1 · PHP · YYYY-MM-DD · integer minor units. Only expenses and income; no inferred debt, transfer or card data.',
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Rebase opening with earlier history'),
                  subtitle: const Text(
                    'Atomic opening change + selected history; preserves the baseline.',
                  ),
                  value: c.rebase,
                  onChanged: c.reviewed || c.accepted > 0
                      ? null
                      : (v) {
                          c.rebase = v;
                          c.refresh();
                        },
                ),
                if (c.rebase) ...[
                  TextField(
                    controller: opening,
                    decoration: const InputDecoration(
                      labelText: 'Earlier opening · 2026-10-10',
                      prefixText: '₱ ',
                    ),
                    keyboardType: const TextInputType.numberWithOptions(
                      decimal: true,
                    ),
                    onChanged: (v) {
                      c.earlierOpening = v;
                      c.refresh();
                    },
                  ),
                  FinanceNotice(
                    'Earlier opening + ${widget.controller.amount(c.selectedNet)} selected historical net = current baseline. Required earlier opening: ${widget.controller.amount(c.derivedOpening)}. Sample rows become 11–13 October in this mode.',
                  ),
                ],
                const SizedBox(height: 24),
                const SectionHeading('02 · Inspect the rows'),
                for (final r in c.rows)
                  Column(
                    children: [
                      CheckboxListTile(
                        contentPadding: EdgeInsets.zero,
                        value: r.selected,
                        title: Text(r.title),
                        subtitle: Text(
                          '${c.rebase ? 'Historical 11–13 Oct' : r.date} · ${widget.controller.amount(r.amount)}\n${r.error ?? (r.duplicate ? 'Possible duplicate · matching prior fingerprint' : r.status)}',
                        ),
                        controlAffinity: ListTileControlAffinity.leading,
                        onChanged: c.reviewed || c.accepted > 0
                            ? null
                            : (v) {
                                r.selected = v!;
                                c.refresh();
                              },
                      ),
                      const Divider(height: 1),
                    ],
                  ),
                CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text(
                    'I reviewed the possible duplicate and intend to include it',
                  ),
                  value: c.duplicateAcknowledged,
                  onChanged: c.reviewed || c.accepted > 0
                      ? null
                      : (v) {
                          c.duplicateAcknowledged = v!;
                          c.refresh();
                        },
                ),
                if (c.error.isNotEmpty) FinanceNotice(c.error, warning: true),
                const SizedBox(height: 16),
                if (!c.reviewed && c.accepted == 0)
                  FilledButton(
                    onPressed: c.validate,
                    child: const Text('Review selected records'),
                  ),
                if (c.reviewed || c.accepted > 0) ...[
                  const SectionHeading('03 · Confirm & simulate'),
                  FinanceNotice(
                    '${c.rows.where((r) => r.selected).length} selected · net ${widget.controller.amount(c.selectedNet)}. ${c.rebase ? 'Opening transition and all historical rows are one atomic simulated batch.' : 'Each accepted row is retained if later processing stops.'}',
                  ),
                  if (!c.rebase)
                    DropdownButtonFormField<String>(
                      initialValue: c.simulation,
                      decoration: const InputDecoration(
                        labelText: 'Processing scenario',
                      ),
                      items: [
                        for (final x in [
                          'Complete',
                          'Partial success',
                          'Uncertain result',
                        ])
                          DropdownMenuItem(value: x, child: Text(x)),
                      ],
                      onChanged: c.running
                          ? null
                          : (v) {
                              c.chooseSimulation(v!);
                            },
                    ),
                  const SizedBox(height: 16),
                  if (c.running) const LinearProgressIndicator(),
                  Text(
                    '${c.accepted} accepted demo rows${c.cancelled
                        ? ' · cancelled; remaining rows excluded'
                        : c.uncertain
                        ? ' · check the original result'
                        : c.partial
                        ? ' · partial success; retry remaining rows'
                        : ''}',
                  ),
                  const SizedBox(height: 16),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      if (c.uncertain)
                        FilledButton(
                          onPressed: c.checkOriginal,
                          child: const Text('Check original result'),
                        )
                      else if (!c.cancelled &&
                          c.accepted < c.rows.where((r) => r.selected).length)
                        FilledButton(
                          onPressed: c.running ? null : c.process,
                          child: Text(
                            c.accepted > 0
                                ? 'Retry remaining rows'
                                : 'Simulate import',
                          ),
                        ),
                      if (!c.cancelled)
                        OutlinedButton(
                          onPressed: c.cancel,
                          child: const Text('Cancel remaining'),
                        ),
                      if (c.accepted == 0 && !c.running)
                        TextButton(
                          onPressed: () {
                            c.reviewed = false;
                            c.refresh();
                          },
                          child: const Text('Edit preview'),
                        ),
                    ],
                  ),
                ],
              ],
            ),
          ),
          aside: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const ValueBlock(
                'IMPORT REVIEW',
                'Small steps.\nClear evidence.',
                'Selected rows, duplicate decisions and stable command IDs stay together.',
                color: Palette.mint,
              ),
              const SizedBox(height: 20),
              const FinancialLine(
                'Validate',
                'Malformed amounts stay excluded.',
                icon: Icons.fact_check_outlined,
              ),
              const FinancialLine(
                'Preview',
                'Opening cutoff and exact cash effects.',
                icon: Icons.preview_outlined,
              ),
              const FinancialLine(
                'Process',
                'A partial result is never called complete.',
                icon: Icons.sync,
              ),
              const FinancialLine(
                'Recover',
                'Retry checks the same row commands.',
                icon: Icons.history,
              ),
              SelectableText('Demo batch ${c.batch}'),
            ],
          ),
        ),
      ],
    ),
  );
}
