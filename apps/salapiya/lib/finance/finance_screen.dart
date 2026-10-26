import 'source_list.dart';

import 'dart:async';

import 'package:flutter/material.dart';

import '../app/demo_routes.dart';
import '../design_system/editorial.dart';
import '../features/finance/presentation/financial_widgets.dart';
import '../local/finance_domain.dart';
import '../local/local_finance_controller.dart';
import '../features/finance/presentation/financial_editor.dart';
import '../features/finance/contracts/financial_models.dart';

class FinanceInput {
  const FinanceInput(
    this.key,
    this.label, {
    this.value = '',
    this.options,
    this.lines = 1,
  });
  final String key, label, value;
  final Map<String, String>? options;
  final int lines;
}

Map<String, String> financeChoices(LocalSnapshot s, Set<String> types) => {
  for (final r in s.current.where((r) => types.contains(financeType(r))))
    r.id: '${r.title} · ${r.date} · v${r.number}',
};

List<FinanceInput> financeInputs(LocalSnapshot s, String op) {
  FinanceInput ref(String key, String label, Set<String> types) =>
      FinanceInput(key, label, options: financeChoices(s, types));
  final card = ref('card', 'Credit card', {'creditCard'});
  final debt = ref('debt', 'Debt source', {'debtImport', 'borrowing'});
  final goal = ref('goal', 'Savings goal', {'savingsGoal'});
  final rule = FinanceInput(
    'rule',
    'Immutable recurring rule',
    options: {
      for (final r in s.revisions.where((r) => financeType(r) == 'recurrence'))
        r.id: '${r.title} · v${r.number} · ${r.values['start']}',
    },
  );
  const amount = FinanceInput('amount', 'Amount PHP');
  final category = FinanceInput(
    'category',
    'Expense category',
    value: 'category-food',
    options: {
      for (final c in s.categories.where((c) => c.kind == 'expense'))
        c.id: c.name,
    },
  );
  final account = FinanceInput(
    'account',
    'Actual cash account',
    options: {
      for (final a in s.accounts.where((a) => !a.archived)) a.id: a.name,
    },
  );
  const verified = FinanceInput(
    'verified',
    'Provider evidence confirmation',
    value: 'false',
    options: {
      'false': 'Not yet confirmed',
      'true': 'I confirm these provider facts',
    },
  );
  final fields = switch (op) {
    'fileDetach' => [
      ref('file', 'Private attachment link', {'financialFile'}),
      const FinanceInput('reason', 'Reason for archiving this link'),
    ],
    'budget' => [
      amount,
      category,
      const FinanceInput('start', 'Period start · YYYY-MM-DD'),
      const FinanceInput('endExclusive', 'Exclusive period end · YYYY-MM-DD'),
      const FinanceInput(
        'basis',
        'Recognized spending basis',
        value: 'net',
        options: {
          'net': 'Net spending after actual offsets',
          'gross': 'Gross recognized spending',
        },
      ),
      const FinanceInput(
        'status',
        'Budget lifecycle',
        value: 'active',
        options: {
          'active': 'Active',
          'archived': 'Archived; period remains reserved',
        },
      ),
    ],
    'savingsGoal' => [
      const FinanceInput('amount', 'Target PHP'),
      const FinanceInput('targetDate', 'Target date (optional) · YYYY-MM-DD'),
      const FinanceInput(
        'status',
        'Goal state',
        value: 'active',
        options: {
          'active': 'Active',
          'completed': 'Completed; reservations retained',
          'archived': 'Archived after explicit release',
        },
      ),
    ],
    'reservation' => [
      goal,
      account,
      const FinanceInput(
        'amount',
        'New absolute reserved amount PHP (zero releases)',
      ),
    ],
    'savingsReallocation' => [
      ref('fromGoal', 'Source savings goal', {'savingsGoal'}),
      FinanceInput(
        'fromAccount',
        'Source reserved account',
        options: {for (final a in s.accounts) a.id: a.name},
      ),
      goal,
      account,
      amount,
    ],
    'recurrence' => [
      amount,
      const FinanceInput(
        'recurringKind',
        'Expected activity',
        value: 'bill',
        options: {
          'income': 'Expected income',
          'bill': 'Bill',
          'subscription': 'Subscription',
        },
      ),
      const FinanceInput(
        'frequency',
        'Recurrence',
        value: 'monthly',
        options: {
          'daily': 'Daily',
          'weekly': 'Selected weekdays',
          'monthly': 'Monthly',
        },
      ),
      const FinanceInput('interval', 'Interval', value: '1'),
      const FinanceInput(
        'weekdays',
        'ISO weekdays (Monday=1): e.g. 1,3,5',
        value: '1',
      ),
      const FinanceInput('monthDay', 'Monthly day 1–31', value: '1'),
      const FinanceInput(
        'monthPolicy',
        'Short month policy',
        value: 'last_valid_day',
        options: {
          'last_valid_day': 'Last valid day',
          'skip': 'Skip short months',
        },
      ),
      FinanceInput(
        'start',
        'Effective start · YYYY-MM-DD',
        value: civilToday(),
      ),
      const FinanceInput('end', 'Inclusive end (optional) · YYYY-MM-DD'),
      const FinanceInput('count', 'Emitted occurrence count (optional)'),
      const FinanceInput(
        'timezone',
        'Named IANA timezone',
        value: 'Asia/Manila',
      ),
      FinanceInput(
        'account',
        'Suggested actual cash account (optional)',
        options: {'': 'Unassigned', ...?account.options},
      ),
      const FinanceInput(
        'status',
        'Definition state',
        value: 'active',
        options: {
          'active': 'Active',
          'archived': 'Archived; retained commitments remain visible',
        },
      ),
    ],
    'recurrenceGenerate' => [
      rule,
      FinanceInput(
        'from',
        'Generation start · YYYY-MM-DD',
        value: civilToday(),
      ),
      FinanceInput(
        'through',
        'Inclusive generation end · YYYY-MM-DD',
        value: DateTime.parse(civilToday())
            .add(const Duration(days: 89))
            .toIso8601String()
            .substring(0, 10),
      ),
    ],
    'occurrenceOverride' || 'recurrenceLink' => [
      rule,
      const FinanceInput(
        'logicalDate',
        'Original logical occurrence date · YYYY-MM-DD',
      ),
      amount,
      if (op == 'occurrenceOverride') ...[
        const FinanceInput('due', 'Override due date · YYYY-MM-DD'),
        const FinanceInput(
          'state',
          'Occurrence decision',
          value: 'planned',
          options: {
            'planned': 'Expected / partial',
            'skipped': 'Skipped',
            'cancelled': 'Cancelled',
          },
        ),
        const FinanceInput('reason', 'Occurrence change reason'),
      ] else
        ref('actual', 'Existing actual income or purchase', {
          'income',
          'expense',
          'cardPurchase',
        }),
    ],
    'recurrenceUnlink' => [
      ref('link', 'Exact actual link to reverse', {'recurrenceLink'}),
      const FinanceInput('reason', 'Link reversal reason'),
    ],
    'debtImport' || 'borrowing' => [
      const FinanceInput('lender', 'Lender / provider'),
      const FinanceInput(
        'debtType',
        'Debt type',
        value: 'personal_loan',
        options: {
          'personal_loan': 'Personal loan',
          'installment_loan': 'Installment loan',
          'bnpl': 'Buy now pay later',
          'flexible_manual': 'Flexible credit',
        },
      ),
      amount,
      const FinanceInput(
        'principal',
        'Original principal PHP (optional / unknown)',
      ),
      if (op == 'borrowing') ...[
        const FinanceInput(
          'fundingUse',
          'Borrowing use',
          value: 'cash',
          options: {
            'cash': 'Actual cash proceeds',
            'purchase': 'Financed purchase',
          },
        ),
        account,
        category,
        const FinanceInput(
          'withheld',
          'Confirmed withheld fee PHP',
          value: '0.00',
        ),
        const FinanceInput(
          'financedFee',
          'Confirmed financed fee PHP',
          value: '0.00',
        ),
        FinanceInput(
          'feeCategory',
          'Fee category',
          value: 'category-fees',
          options: category.options,
        ),
      ],
    ],
    'debtPayment' || 'debtClassification' || 'debtPayoff' => [
      debt,
      if (op != 'debtClassification') ...[account, amount],
      if (op == 'debtClassification')
        ref('payment', 'Actual unresolved payment', {'debtPayment'}),
      const FinanceInput(
        'reduction',
        'Confirmed recognized liability reduction PHP',
        value: '0.00',
      ),
      const FinanceInput(
        'interest',
        'New recognized interest PHP',
        value: '0.00',
      ),
      const FinanceInput(
        'fee',
        'New recognized contractual fee PHP',
        value: '0.00',
      ),
      FinanceInput(
        'interestCategory',
        'Interest expense category',
        value: 'category-fees',
        options: category.options,
      ),
      FinanceInput(
        'feeCategory',
        'Fee expense category',
        value: 'category-fees',
        options: category.options,
      ),
      if (op == 'debtPayment') ...[
        const FinanceInput(
          'certainty',
          'Classification evidence',
          value: 'unresolved',
          options: {
            'unresolved': 'Unknown breakdown / clearing',
            'confirmed_total':
                'Provider-confirmed reduction of recognized total',
            'known_components': 'Confirmed individual components',
          },
        ),
        const FinanceInput(
          'externalFee',
          'External payment fee PHP',
          value: '0.00',
        ),
        const FinanceInput(
          'clearing',
          'Unresolved actual payment PHP',
          value: '0.00',
        ),
        ref(
          'scheduleSource',
          'Current schedule (optional without allocations)',
          {'debtSchedule'},
        ),
        const FinanceInput(
          'allocations',
          'Due allocations: installment-label,PHP amount (one per line)',
          lines: 4,
        ),
        const FinanceInput(
          'unapplied',
          'Unapplied contractual payment PHP',
          value: '0.00',
        ),
      ],
      if (op == 'debtPayoff') ...[
        const FinanceInput('providerPayoff', 'Provider-confirmed payoff PHP'),
        const FinanceInput(
          'waiver',
          'Waiver of recognized liability PHP',
          value: '0.00',
        ),
        const FinanceInput(
          'avoided',
          'Avoided future unposted charges PHP',
          value: '0.00',
        ),
        const FinanceInput(
          'waiverBasis',
          'Waiver evidence basis',
          value: 'imported_unknown',
          options: {
            'imported_unknown':
                'Imported liability with unknown cost breakdown',
          },
        ),
        verified,
      ],
      const FinanceInput(
        'reason',
        'Payment / classification / payoff evidence reason',
      ),
    ],
    'debtSchedule' => [
      debt,
      const FinanceInput(
        'schedule',
        'Provider rows: label,YYYY-MM-DD,PHP amount[,historically paid PHP]',
        lines: 6,
      ),
      verified,
    ],
    'creditCard' => [
      const FinanceInput('issuer', 'Issuer'),
      const FinanceInput('limit', 'Credit limit PHP (optional)'),
      const FinanceInput(
        'amount',
        'Signed opening posted liability PHP',
        value: '0.00',
      ),
    ],
    'cardAuthorization' => [card, amount],
    'cardPurchase' || 'cardFee' || 'cardInterest' => [
      card,
      amount,
      category,
      FinanceInput(
        'postingDate',
        'Provider posting date · YYYY-MM-DD',
        value: civilToday(),
      ),
    ],
    'cardPayment' => [card, account, amount],
    'cardRefund' => [
      card,
      ref('purchase', 'Original purchase', {'cardPurchase'}),
      amount,
      category,
      const FinanceInput('reason', 'Refund reason'),
    ],
    'statement' => [
      card,
      const FinanceInput('start', 'Cycle start · YYYY-MM-DD'),
      const FinanceInput('end', 'Cycle end · YYYY-MM-DD'),
      const FinanceInput('issued', 'Statement date · YYYY-MM-DD'),
      const FinanceInput('due', 'Due date · YYYY-MM-DD'),
      amount,
      const FinanceInput('minimum', 'Minimum due PHP (optional)'),
      verified,
    ],
    'statementLink' => [
      card,
      ref('statement', 'Statement', {'statement'}),
      ref('activity', 'Provider-confirmed activity', {
        'cardPurchase',
        'cardPayment',
        'cardRefund',
        'cardFee',
        'cardInterest',
      }),
      verified,
    ],
    'cardAllocation' => [
      card,
      ref('statement', 'Statement', {'statement'}),
      ref('payment', 'Actual payment or credit', {'cardPayment', 'cardRefund'}),
      amount,
      verified,
    ],
    'installment' => [
      card,
      ref('purchase', 'Already recognized purchase', {'cardPurchase'}),
      const FinanceInput(
        'schedule',
        'Provider schedule: label,YYYY-MM-DD,PHP amount (one per line)',
        lines: 5,
      ),
      const FinanceInput(
        'principal',
        'Confirmed total principal PHP (optional)',
      ),
      const FinanceInput('interest', 'Confirmed total interest PHP (optional)'),
      const FinanceInput('fee', 'Confirmed total fee PHP (optional)'),
      verified,
    ],
    'installmentApplication' => [
      card,
      ref('plan', 'Installment plan', {'installment'}),
      const FinanceInput('row', 'Exact installment label'),
      ref('payment', 'Actual statement allocation', {'cardAllocation'}),
      amount,
      verified,
    ],
    _ => <FinanceInput>[],
  };
  return [
    const FinanceInput('name', 'Description'),
    ...fields,
    FinanceInput(
      'date',
      'Economic / evidence date · YYYY-MM-DD',
      value: civilToday(),
    ),
    const FinanceInput(
      'reference',
      'Provider reference (required for provider evidence)',
    ),
    const FinanceInput('notes', 'Notes (optional)', lines: 3),
    const FinanceInput(
      'acknowledge',
      'Negative cash balance consent',
      value: 'false',
      options: {
        'false': 'No negative balance acknowledged',
        'true': 'I acknowledge the resulting negative cash balance',
      },
    ),
  ];
}

Future<void> openNativeFinance(
  BuildContext context,
  LocalFinancialController controller,
  String op,
  String title, {
  LocalRevision? replacing,
}) => openDemoPage<void>(
  context,
  NativeFinanceEditor(
    controller: controller,
    operation: op,
    title: title,
    replacing: replacing,
  ),
  'finance/$op',
);

class NativeFinanceEditor extends StatefulWidget {
  const NativeFinanceEditor({
    super.key,
    required this.controller,
    required this.operation,
    required this.title,
    this.replacing,
  });
  final LocalFinancialController controller;
  final String operation, title;
  final LocalRevision? replacing;
  @override
  State<NativeFinanceEditor> createState() => _NativeFinanceEditorState();
}

class _NativeFinanceEditorState extends State<NativeFinanceEditor> {
  late final inputs = financeInputs(
    widget.controller.snapshot,
    widget.replacing == null
        ? widget.operation
        : financeType(widget.replacing!),
  );
  late final values = {
    for (final f in inputs) f.key: f.value,
    ...?widget.replacing?.values,
    if (widget.replacing != null &&
        [
          'budget',
          'savingsGoal',
          'recurrence',
        ].contains(financeType(widget.replacing!)))
      'date': civilToday(),
    if (widget.replacing != null) ...{
      'replace': widget.replacing!.id,
      'replaceVersion': '${widget.replacing!.number}',
      'reason': '',
    },
  };
  final fields = <String, TextEditingController>{};
  late String id = newLocalId();
  late final draftKey =
      'finance:${widget.operation}:${widget.replacing?.id ?? ''}';
  Future<void> writes = Future.value();
  LocalCommand? reviewed;
  LocalPlan? plan;
  String? error, result;
  bool loading = true, busy = false, draftFailed = false, unknown = false;
  LocalFinancialController get c => widget.controller;
  @override
  void initState() {
    super.initState();
    unawaited(restore());
  }

  Future<void> restore() async {
    try {
      final draft = await c.store.draft(draftKey);
      if (draft != null) {
        values.addAll(Map<String, String>.from(draft['values'] as Map));
        id = draft['command'] as String;
      }
    } catch (_) {
      error = 'Saved input could not be read. Reopen this profile.';
      draftFailed = true;
    }
    if (mounted) setState(() => loading = false);
  }

  void retain() {
    final frozen = Map<String, String>.from(values), command = id;
    writes = writes
        .then((_) => c.store.saveDraft(draftKey, command, frozen))
        .then((_) {
          if (mounted) setState(() => draftFailed = false);
        })
        .catchError((Object _) {
          if (mounted) {
            setState(() {
              draftFailed = true;
              error = 'Input could not be saved. Check storage before leaving.';
            });
          }
        });
  }

  Future<void> save() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await writes;
      if (draftFailed) reject('Save the retained input before submitting.');
      if (reviewed == null) {
        await c.reload();
        reviewed = LocalCommand(
          id: id,
          owner: c.store.owner,
          expectedVersion: c.snapshot.version,
          kind: widget.operation,
          values: Map.unmodifiable(values),
        );
        plan = planLocal(c.snapshot, reviewed!);
      } else {
        await c.store.commit(reviewed!);
        await c.reload();
        await c.store.discardDraft(draftKey);
        result = c.connected
            ? 'Saved on this device. Server acceptance and downloaded reconciliation are still required.'
            : 'Saved locally.';
      }
    } catch (e) {
      if (reviewed != null) {
        try {
          if (await c.store.hasReceipt(id)) {
            await c.reload();
            result = 'The original command is saved. Check synchronization status for connected records.';
          } else {
            reviewed = null;
            plan = null;
          }
        } catch (_) {
          unknown = true;
        }
      }
      if (result == null) {
        error = e is LocalRuleException
            ? e.message
            : e is FormatException
            ? e.message
            : 'The save could not be verified. Input and original command identity are retained.';
      }
    }
    if (mounted) setState(() => busy = false);
  }

  @override
  void dispose() {
    for (final field in fields.values) {
      field.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FinancePage(
    title: widget.title,
    child: EditorialSurface(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (loading)
            const LinearProgressIndicator()
          else if (result != null) ...[
            FinanceNotice(result!),
            Text('Original command: $id'),
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Done'),
            ),
          ] else ...[
            if (error != null) FinanceNotice(error!),
            if (reviewed == null) ...[
              for (final input in [
                if (widget.operation != 'financeReversal') ...inputs,
                if (widget.replacing != null)
                  const FinanceInput('reason', 'Correction / reversal reason'),
              ])
                Padding(
                  padding: const EdgeInsets.only(bottom: 18),
                  child: input.options == null
                      ? TextField(
                          key: ValueKey('native-${input.key}'),
                          controller: fields.putIfAbsent(
                            input.key,
                            () => TextEditingController(
                              text: values[input.key] ?? '',
                            ),
                          ),
                          minLines: input.lines,
                          maxLines: input.lines,
                          decoration: InputDecoration(labelText: input.label),
                          onChanged: (x) {
                            values[input.key] = x;
                            retain();
                          },
                        )
                      : DropdownButtonFormField<String>(
                          key: ValueKey('native-select-${input.key}'),
                          initialValue:
                              input.options!.containsKey(values[input.key])
                              ? values[input.key]
                              : null,
                          isExpanded: true,
                          decoration: InputDecoration(labelText: input.label),
                          items: [
                            for (final item in input.options!.entries)
                              DropdownMenuItem(
                                value: item.key,
                                child: Text(
                                  item.value,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                          ],
                          onChanged: (x) {
                            values[input.key] = x ?? '';
                            retain();
                          },
                        ),
                ),
            ] else ...[
              const SectionHeading('Review financial effects'),
              for (final effect in plan!.effects)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Text(
                    c.amountsHidden
                        ? 'Financial review amounts hidden.'
                        : effect,
                  ),
                ),
              if (c.connected)
                const FinanceNotice(
                  'Connected changes remain pending until server acceptance and complete downloaded reconciliation.',
                ),
              TextButton(
                onPressed: busy || unknown
                    ? null
                    : () => setState(() {
                        reviewed = null;
                        plan = null;
                      }),
                child: const Text('Edit'),
              ),
            ],
            FilledButton(
              onPressed: busy || draftFailed || unknown ? null : save,
              child: Text(
                busy
                    ? 'Saving…'
                    : reviewed == null
                    ? 'Review'
                    : 'Save reviewed values',
              ),
            ),
            if (unknown)
              const FinanceNotice(
                'Result unknown. Reopen this profile to inspect the original command before submitting any changed values.',
              ),
          ],
        ],
      ),
    ),
  );
}

class NativeCardsScreen extends StatelessWidget {
  const NativeCardsScreen({super.key, required this.controller});
  final LocalFinancialController controller;
  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: controller,
    builder: (context, _) {
      final s = controller.snapshot;
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const FinanceNotice(
            'Posted liability, provider statements and cash payments have separate meanings. Card credit and available credit are not liquid money.',
          ),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final action in const {
                'creditCard': 'Add credit card',
                'cardAuthorization': 'Pending authorization',
                'cardPayment': 'Pay credit card',
                'cardRefund': 'Card refund',
                'cardFee': 'Card fee',
                'cardInterest': 'Card interest',
                'statement': 'Record statement',
                'statementLink': 'Link statement activity',
                'cardAllocation': 'Allocate payment / credit',
                'installment': 'Installment plan',
                'installmentApplication': 'Apply installment payment',
              }.entries)
                OutlinedButton(
                  onPressed: () => openNativeFinance(
                    context,
                    controller,
                    action.key,
                    action.value,
                  ),
                  child: Text(action.value),
                ),
            ],
          ),
          const SizedBox(height: 24),
          for (final card in s.current.where(
            (r) => financeType(r) == 'creditCard',
          )) ...[
            SectionHeading(card.title),
            Builder(
              builder: (context) {
                final liability = -financeBalance(
                  s,
                  'card_liability',
                  'card',
                  card.actionId,
                );
                final limit = card.values['limit']!.isEmpty
                    ? null
                    : signedPhp(card.values['limit']!);
                final used = liability > BigInt.zero ? liability : BigInt.zero;
                return FinanceNotice(
                  '${liability < BigInt.zero ? 'Card credit' : 'Posted outstanding'}: ${controller.decimal(liability.abs())} PHP\n'
                  'Issuer: ${card.values['issuer']}\n'
                  '${limit == null ? 'No credit limit recorded.' : 'Available credit estimate: ${controller.decimal(limit - liability)} PHP. Utilization: ${limit == BigInt.zero ? 'undefined for zero limit' : '${controller.amountsHidden ? 'hidden' : used * BigInt.from(10000) ~/ limit} basis points'}.'}',
                );
              },
            ),
            for (final statement in s.current.where(
              (r) =>
                  financeType(r) == 'statement' &&
                  r.values['card'] == card.actionId,
            ))
              FinancialLine(
                statement.title,
                'Due ${statement.values['due']} · historical balance ${controller.decimal(statement.amount)} PHP · minimum ${statement.values['minimum']?.isNotEmpty == true ? '${controller.decimal(signedPhp(statement.values['minimum']!))} PHP' : 'unknown'}\n'
                'Remaining due ${controller.decimal(statement.amount - sumMinor(s.current.where((r) => financeType(r) == 'cardAllocation' && r.values['statement'] == statement.id).map((r) => r.amount)))} PHP. Minimum satisfaction / allocation order not inferred.',
                icon: Icons.description_outlined,
                onTap: () =>
                    openFinanceDetail(context, controller, statement.id),
              ),
          ],
          const SectionHeading('Source detail & immutable history'),
          FinancialSourceList(
            controller: controller,
            records: s.revisions.reversed
                .where(
                  (r) =>
                      nativeFinanceCommands.contains(financeType(r)) &&
                      !nativeDebtCommands.contains(financeType(r)) &&
                      !nativePlanningCommands.contains(financeType(r)) &&
                      !nativeRecurrenceCommands.contains(financeType(r)),
                )
                .toList(),
          ),
        ],
      );
    },
  );
}

Future<void> openFinanceDetail(
  BuildContext context,
  LocalFinancialController c,
  String id,
) => openDemoPage<void>(
  context,
  FinancePage(
    title: 'Financial source & history',
    child: ListenableBuilder(
      listenable: c,
      builder: (context, _) {
        final r = c.snapshot.revision(id);
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SectionHeading(r.title),
            FinanceNotice(
              '${financeType(r)} · ${r.date} · revision ${r.number}\nOriginal action ${r.actionId}\n'
              '${c.connected ? c.synchronizationStates[r.id] ?? 'Downloaded accepted evidence' : 'Saved locally'}',
            ),
            for (final item in r.values.entries)
              if (!['financeContract', 'financeType'].contains(item.key))
                Text(
                  c.amountsHidden
                      ? '${item.key}: hidden'
                      : '${item.key}: ${item.value}',
                ),
            for (final p in r.postings)
              Text(
                '${p.ledger.replaceAll('_', ' ')} · ${p.date} · ${c.decimal(p.amount)} PHP',
              ),
            if (c.snapshot.current.contains(r) &&
                !r.values.containsKey('financeType') &&
                !r.values.containsKey('sharedGroup') &&
                [
                  'expense',
                  'income',
                  'transfer',
                  'refund',
                  'adjustment',
                  'opening',
                ].contains(r.kind))
              Wrap(
                spacing: 8,
                children: [
                  for (final action in [
                    FinancialAction.correction,
                    FinancialAction.reversal,
                  ])
                    TextButton(
                      onPressed: () => openFinancialEditor(
                        context,
                        c,
                        action,
                        sourceId: r.id,
                      ),
                      child: Text(action.label),
                    ),
                ],
              ),
            const SectionHeading('Private supporting-file evidence'),
            for (final file in c.snapshot.revisions.where(
              (f) =>
                  financeType(f) == 'financialFile' &&
                  f.values['sourceRevision'] == r.id,
            ))
              FinancialLine(
                file.title,
                '${file.values['mime']} · ${financialFileDetached(c.snapshot, file.id) ? 'Archived link' : 'Attached'} · original revision retained. Open Money / Files to verify or retrieve device-local bytes.',
                icon: Icons.attach_file,
              ),
            if (c.snapshot.current.contains(r) &&
                nativeFinanceCommands.contains(financeType(r)) &&
                !r.values.containsKey('sharedGroup'))
              Wrap(
                spacing: 8,
                children: [
                  TextButton(
                    onPressed: () => openNativeFinance(
                      context,
                      c,
                      'financeCorrection',
                      'Correct source',
                      replacing: r,
                    ),
                    child: const Text('Correct with reason'),
                  ),
                  TextButton(
                    onPressed: () => openNativeFinance(
                      context,
                      c,
                      'financeReversal',
                      'Reverse source',
                      replacing: r,
                    ),
                    child: const Text('Reverse with reason'),
                  ),
                ],
              ),
            const SectionHeading('Action history'),
            for (final h in c.snapshot.revisions.where(
              (h) => h.actionId == r.actionId,
            ))
              FinancialLine(
                h.title,
                'Revision ${h.number} · ${h.change} · ${h.values['reason'] ?? ''}',
                icon: Icons.history,
                onTap: h.id == id
                    ? null
                    : () => openFinanceDetail(context, c, h.id),
              ),
          ],
        );
      },
    ),
  ),
  'finance/source/$id',
);
