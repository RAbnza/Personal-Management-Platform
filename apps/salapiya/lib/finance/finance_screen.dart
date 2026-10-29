import 'source_list.dart';
import '../design_system/theme.dart';
import '../features/finance/presentation/financial_review.dart';

import 'dart:async';

import 'package:flutter/material.dart';

import '../app/demo_routes.dart';
import '../design_system/editorial.dart';
import '../features/finance/presentation/financial_widgets.dart';
import '../local/finance_domain.dart';
import '../local/local_finance_controller.dart';
import '../p0/exact_money.dart';
import '../features/finance/presentation/financial_editor.dart';
import '../features/finance/contracts/financial_models.dart';

class FinanceInput {
  const FinanceInput(
    this.key,
    this.label, {
    this.value = '',
    this.options,
    this.lines = 1,
    this.help,
  });
  final String key, label, value;
  final Map<String, String>? options;
  final int lines;
  final String? help;
}

/// A popup for a form problem. The caller marks the offending input.
Future<void> showFormError(
  BuildContext context,
  String message, {
  String? fieldLabel,
}) => showDialog<void>(
  context: context,
  builder: (context) => AlertDialog(
    icon: const Icon(Icons.error_outline),
    title: const Text('Please check the form'),
    content: Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(message),
        if (fieldLabel != null) ...[
          const SizedBox(height: 12),
          Text('Check “$fieldLabel”. It is marked in red.'),
        ],
      ],
    ),
    actions: [
      FilledButton(
        autofocus: true,
        onPressed: () => Navigator.pop(context),
        child: const Text('OK'),
      ),
    ],
  ),
);

/// Plain-language payment schedule questions. [editing] revises the dates of
/// an existing schedule; amounts are set while creating it, or later through
/// Update amounts. The payments always add up to the debt.
List<FinanceInput> debtCadenceInputs({
  required bool editing,
  required bool embedded,
}) => [
  FinanceInput(
    'frequency',
    'How often do you pay?',
    help: embedded
        ? 'Optional. Skip it and add the schedule later from Debts.'
        : null,
    options: {
      if (embedded) '': 'Not now · I will set it later',
      if (editing) '': 'No repeating pattern · dates listed below',
      'weekly': 'Weekly',
      'monthly': 'Monthly',
      'yearly': 'Yearly',
      'custom': 'Custom',
    },
  ),
  const FinanceInput(
    'intervalDays',
    'Pay every how many days?',
    help: 'For example, type 14 for every two weeks.',
  ),
  const FinanceInput(
    'firstDue',
    'When is your next payment due?',
    help: 'Tap the calendar, or type it like 2026-11-30 (year-month-day).',
  ),
  if (!editing) ...[
    const FinanceInput(
      'installmentCount',
      'How many payments are left?',
      help: 'Count from the next payment, for example 12. Up to 120.',
    ),
    const FinanceInput(
      'splitMode',
      'How are the payments split?',
      value: 'divide',
      options: {
        'divide': 'Divide the debt evenly',
        'varied': 'Different amount each time',
      },
    ),
  ],
];

Map<String, String> financeChoices(LocalSnapshot s, Set<String> types) => {
  for (final r in s.current.where((r) => types.contains(financeType(r))))
    r.id: '${r.title} · ${r.date} · v${r.number}',
};

List<FinanceInput> financeInputs(
  LocalSnapshot s,
  String op, {
  bool editing = false,
}) {
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
        value: DateTime.parse('${civilToday()}T00:00:00Z')
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
      if (op == 'debtImport')
        const FinanceInput(
          'outstandingPrincipal',
          'Provider-confirmed outstanding principal PHP (optional; distinct from original principal)',
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
      if (!editing) ...debtCadenceInputs(editing: false, embedded: true),
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
        'principalReduction',
        'Provider-confirmed principal within liability reduction PHP (optional; unknown if blank)',
      ),
      const FinanceInput(
        'reductionSources',
        'Recognized charge reductions: exact charge revision ID,PHP amount (optional, one per line)',
        lines: 4,
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
      ...debtCadenceInputs(editing: editing, embedded: false),
      const FinanceInput(
        'schedule',
        'Payment dates, one per line: name,YYYY-MM-DD,PHP amount[,already paid PHP]',
        lines: 6,
      ),
      verified,
    ],
    'debtAdjustment' => [
      debt,
      amount,
      const FinanceInput(
        'adjustmentKind',
        'Provider adjustment',
        value: 'recognized_charge',
        options: {
          'recognized_charge': 'New recognized charge',
          'recognized_waiver': 'Waive existing recognized liability',
          'rounding_charge': 'Provider-confirmed residual charge',
          'rounding_waiver': 'Provider-confirmed residual waiver',
          'avoided_future': 'Avoided future unposted charge (no money)',
        },
      ),
      const FinanceInput(
        'chargeType',
        'Recognized charge classification',
        value: 'interest',
        options: {'interest': 'Interest', 'fee': 'Fee', 'penalty': 'Penalty'},
      ),
      category,
      const FinanceInput(
        'waiverBasis',
        'Original waiver basis',
        value: 'recognized_charge',
        options: {
          'recognized_charge': 'Original recognized charge source',
          'imported_unknown': 'Imported opening with unknown cost basis',
        },
      ),
      ref(
        'chargeSource',
        'Exact original recognized charge (required for charge waiver)',
        {'debtAdjustment', 'borrowing'},
      ),
      const FinanceInput(
        'reason',
        'Provider adjustment / residual explanation',
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
  Map<String, String> initial = const {},
}) => openDemoPage<void>(
  context,
  NativeFinanceEditor(
    controller: controller,
    operation: op,
    title: title,
    replacing: replacing,
    initial: initial,
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
    this.initial = const {},
  });
  final LocalFinancialController controller;
  final String operation, title;
  final LocalRevision? replacing;
  final Map<String, String> initial;
  @override
  State<NativeFinanceEditor> createState() => _NativeFinanceEditorState();
}

class _NativeFinanceEditorState extends State<NativeFinanceEditor> {
  late final inputs = financeInputs(
    widget.controller.snapshot,
    widget.replacing == null
        ? widget.operation
        : financeType(widget.replacing!),
    editing: widget.replacing != null,
  );
  late final values = {
    for (final f in inputs) f.key: f.value,
    ...widget.initial,
    ...?widget.replacing?.values,
    if (nativeDebtCommands.contains(
      widget.replacing == null
          ? widget.operation
          : financeType(widget.replacing!),
    ))
      'debtComponentContract': '1',
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
  String? schedulePreview, scheduleNote, embeddedRows;
  String? errorField, errorMessage;
  final anchors = <String, GlobalKey>{};
  bool scheduleFailed = false;
  late String id = newLocalId();
  late final draftKey =
      'finance:${widget.operation}:${widget.replacing?.id ?? ''}';
  Future<void> writes = Future.value();
  LocalCommand? reviewed;
  LocalPlan? plan;
  LocalSnapshot? reviewSnapshot;
  String? error, result;
  bool loading = true,
      busy = false,
      draftFailed = false,
      unknown = false,
      dirty = false;
  LocalFinancialController get c => widget.controller;
  Map<String, String> get reviewDetails => {
    for (final input in inputs)
      if (!['name', 'amount', 'date', 'acknowledge'].contains(input.key) &&
          (values[input.key] ?? '').isNotEmpty)
        input.label: input.options?[values[input.key]] ?? values[input.key]!,
    if ((values['reason'] ?? '').isNotEmpty) 'Reason': values['reason']!,
  };
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
        dirty = true;
      }
    } catch (_) {
      error = 'Saved input could not be read. Reopen this profile.';
      draftFailed = true;
    }
    if (mounted) setState(() => loading = false);
  }

  void retain() {
    setState(() => dirty = true);
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
      errorField = errorMessage = null;
    });
    String? problem, problemField;
    try {
      await writes;
      if (draftFailed) reject('Save the retained input before submitting.');
      if (reviewed == null) {
        await c.reload();
        schedulePreview = embeddedRows = null;
        final rows = simpleSchedule || embeddedSchedule ? cadenceRows() : null;
        if (rows != null) schedulePreview = previewRows(rows);
        if (embeddedSchedule) embeddedRows = rows;
        reviewed = LocalCommand(
          id: id,
          owner: c.store.owner,
          expectedVersion: c.snapshot.version,
          kind: widget.operation,
          values: Map.unmodifiable(commandValues(rows)),
        );
        reviewSnapshot = c.snapshot;
        plan = planLocal(reviewSnapshot!, reviewed!);
      } else {
        await c.store.commit(reviewed!);
        await c.reload();
        await c.store.discardDraft(draftKey);
        await saveEmbeddedSchedule();
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
        if (e is LocalRuleException) {
          problem = e.message;
          problemField = e.field;
        } else if (e is FormatException) {
          problem = e.message;
        } else {
          error = 'The save could not be verified. Input and original command identity are retained.';
        }
      }
    }
    if (mounted) {
      setState(() {
        busy = false;
        errorField = problemField;
        errorMessage = problem;
      });
    }
    if (problem != null && mounted) await showProblem(problem, problemField);
  }

  /// A popup with the message, then the offending input is marked in red and
  /// scrolled into view.
  Future<void> showProblem(String message, String? field) async {
    await showFormError(
      context,
      message,
      fieldLabel: field == null ? null : labelFor(field),
    );
    final target = field == null ? null : anchors[field]?.currentContext;
    if (target != null && target.mounted) {
      await Scrollable.ensureVisible(
        target,
        alignment: .15,
        duration: const Duration(milliseconds: 250),
      );
    }
  }

  String? labelFor(String field) {
    if (field == 'paymentTotal') return 'Payment amounts';
    if (field.startsWith('payment-')) {
      return 'Payment ${(int.tryParse(field.substring(8)) ?? 0) + 1}';
    }
    for (final input in inputs) {
      if (input.key == field) return input.label;
    }
    return null;
  }

  String? problemFor(String key) => errorField == key ? errorMessage : null;

  GlobalKey anchor(String key) => anchors.putIfAbsent(key, () => GlobalKey());

  static const cadenceKeys = [
    'frequency',
    'intervalDays',
    'firstDue',
    'installmentCount',
    'splitMode',
    'installmentAmount',
    'totalAmount',
    'paymentAmounts',
  ];

  /// A new schedule is created from plain answers; the dates are built at
  /// Review and the Review step is the confirmation.
  bool get simpleSchedule =>
      widget.operation == 'debtSchedule' && widget.replacing == null;
  bool get embeddedSchedule =>
      widget.replacing == null &&
      ['debtImport', 'borrowing'].contains(widget.operation) &&
      (values['frequency'] ?? '').isNotEmpty;

  /// How many payments are left, once a usable number has been entered.
  int? get paymentCount {
    final n = int.tryParse(answer('installmentCount'));
    return n != null && n >= 1 && n <= 120 ? n : null;
  }

  /// Cadence inputs appear only when they apply to the answers so far.
  bool visible(FinanceInput input) {
    if (simpleSchedule &&
        const {
          'name',
          'schedule',
          'verified',
          'reference',
          'notes',
          'acknowledge',
          'date',
        }.contains(input.key)) {
      return false;
    }
    return switch (input.key) {
      'intervalDays' => values['frequency'] == 'custom',
      'firstDue' ||
      'installmentCount' ||
      'splitMode' => (values['frequency'] ?? '').isNotEmpty,
      _ => true,
    };
  }

  void clearCadence(Iterable<String> keys) {
    for (final key in keys) {
      values[key] = '';
      fields[key]?.text = '';
    }
    if (keys.contains('paymentAmounts')) {
      for (final entry in fields.entries) {
        if (entry.key.startsWith('payment-')) entry.value.text = '';
      }
    }
  }

  String answer(String key) => (values[key] ?? '').trim();

  List<String> get payments => (values['paymentAmounts'] ?? '').split('\n');

  BigInt amountOf(String text, String message, {String? field}) {
    try {
      return parsePhp(text.trim());
    } on FormatException {
      reject(message, field: field);
    }
  }

  LocalRevision? debtFor(String? ref) => ref == null || ref.isEmpty
      ? null
      : c.snapshot.current
            .where((r) => r.id == ref || r.actionId == ref)
            .firstOrNull;

  /// The exact amount the schedule must add up to: what is still owed on an
  /// existing debt, or the recognized liability being entered right now.
  BigInt debtTarget() {
    if (simpleSchedule) {
      final debt = debtFor(values['debt']);
      if (debt == null) {
        reject('Choose the debt this schedule belongs to.', field: 'debt');
      }
      final owed = -financeBalance(
        c.snapshot,
        'debt_liability',
        'debt',
        debt.actionId,
        through: civilToday(),
      );
      if (owed <= BigInt.zero) {
        reject(
          'This debt has nothing left to pay, so there is nothing to schedule.',
          field: 'debt',
        );
      }
      return owed;
    }
    final amount = amountOf(
      answer('amount'),
      'Enter the debt amount above first.',
      field: 'amount',
    );
    if (amount <= BigInt.zero) {
      reject('Enter the debt amount above first.', field: 'amount');
    }
    final fee = answer('financedFee').isEmpty
        ? BigInt.zero
        : amountOf(
            answer('financedFee'),
            'Enter the financed fee like 0.00.',
            field: 'financedFee',
          );
    return widget.operation == 'borrowing' ? amount + fee : amount;
  }

  /// Installment rows from the plain answers, with plain-language errors.
  String cadenceRows() {
    if (answer('frequency').isEmpty) {
      reject('Choose how often you pay.', field: 'frequency');
    }
    if (answer('frequency') == 'custom') {
      try {
        debtIntervalDays(answer('intervalDays'));
      } on LocalRuleException catch (e) {
        reject(e.message, field: 'intervalDays');
      }
    }
    if (answer('firstDue').isEmpty) {
      reject('Enter the date of your next payment.', field: 'firstDue');
    }
    try {
      civilDate(answer('firstDue'));
    } on FormatException catch (e) {
      reject(e.message, field: 'firstDue');
    }
    final count = paymentCount;
    if (count == null) {
      reject(
        'Enter how many payments are left, a whole number from 1 to 120.',
        field: 'installmentCount',
      );
    }
    final split = answer('splitMode');
    if (split.isEmpty) {
      reject('Choose how the payments are split.', field: 'splitMode');
    }
    final target = debtTarget();
    List<BigInt> amounts;
    if (split == 'varied') {
      final entered = payments;
      amounts = [
        for (var i = 0; i < count; i++)
          amountOf(
            i < entered.length ? entered[i] : '',
            'Enter the amount for payment ${i + 1}, like 2000.00.',
            field: 'payment-$i',
          ),
      ];
      for (var i = 0; i < count; i++) {
        if (amounts[i] <= BigInt.zero) {
          reject(
            'Payment ${i + 1} must be more than zero.',
            field: 'payment-$i',
          );
        }
      }
      final sum = sumMinor(amounts);
      if (sum != target) {
        reject(
          'The payments add up to ${c.decimal(sum)} PHP, but the debt is ${c.decimal(target)} PHP. The payments must add up to the debt exactly.',
          field: 'paymentTotal',
        );
      }
    } else {
      try {
        amounts = debtSplitAmounts(target, count);
      } on LocalRuleException catch (e) {
        reject(e.message, field: 'installmentCount');
      }
    }
    try {
      return debtScheduleRows(
        firstDue: answer('firstDue'),
        frequency: answer('frequency'),
        amounts: amounts,
        intervalDays: answer('intervalDays'),
      );
    } on FormatException catch (e) {
      reject(e.message, field: 'firstDue');
    }
  }

  String previewRows(String rows) {
    final list = financeSchedule(rows);
    final amounts = list.map((r) => r.amount).toList();
    final total = sumMinor(amounts);
    final same = amounts.every((a) => a == amounts.first);
    final lo = amounts.reduce((a, b) => a < b ? a : b);
    final hi = amounts.reduce((a, b) => a > b ? a : b);
    final every = switch (answer('frequency')) {
      'custom' => 'every ${answer('intervalDays')} days',
      final f => f,
    };
    final money = same
        ? '${list.length} payments of ${c.decimal(amounts.first)} PHP'
        : '${list.length} payments totaling ${c.decimal(total)} PHP (${c.decimal(lo)} to ${c.decimal(hi)} each)';
    return '$money · $every · first ${list.first.date} · last ${list.last.date}';
  }

  /// Only the cadence facts worth keeping on the schedule record.
  Map<String, String> cadenceStored(String rows) {
    final split = answer('splitMode');
    return {
      'frequency': answer('frequency'),
      'firstDue': answer('firstDue'),
      'splitMode': split,
      'installmentAmount': split == 'divide'
          ? phpDecimal(financeSchedule(rows).first.amount)
          : '',
      if (answer('frequency') == 'custom')
        'intervalDays': answer('intervalDays'),
    };
  }

  Map<String, String> commandValues(String? rows) {
    final v = Map<String, String>.from(values)
      ..remove('installmentCount')
      ..remove('totalAmount')
      ..remove('paymentAmounts');
    if (widget.replacing == null &&
        ['debtImport', 'borrowing'].contains(widget.operation)) {
      v.removeWhere((k, _) => cadenceKeys.contains(k));
    } else if (simpleSchedule) {
      final debt = debtFor(values['debt']);
      if (debt == null) {
        reject('Choose the debt this schedule belongs to.', field: 'debt');
      }
      final today = civilToday();
      v['schedule'] = rows!;
      v['verified'] = 'true';
      v['reference'] = 'Entered by me';
      v['name'] = '${debt.title} payment schedule';
      v['date'] = debt.date.compareTo(today) > 0 ? debt.date : today;
      v['acknowledge'] = 'false';
      v.addAll(cadenceStored(rows));
    } else if (answer('frequency').isNotEmpty &&
        answer('splitMode').isNotEmpty &&
        answer('splitMode') != 'equal') {
      v['installmentAmount'] = '';
    }
    return v;
  }

  /// The schedule is its own immutable record, saved right after the debt.
  Future<void> saveEmbeddedSchedule() async {
    final rows = embeddedRows;
    if (rows == null) return;
    scheduleFailed = false;
    try {
      final schedule = LocalCommand(
        id: newLocalId(),
        owner: c.store.owner,
        expectedVersion: c.snapshot.version,
        kind: 'debtSchedule',
        values: {
          'name': '${values['name']} payment schedule',
          'debt': id,
          'schedule': rows,
          'verified': 'true',
          'reference': 'Entered by me',
          'date': answer('date'),
          'acknowledge': 'false',
          'debtComponentContract': '1',
          ...cadenceStored(rows),
        },
      );
      planLocal(c.snapshot, schedule);
      await c.store.commit(schedule);
      await c.reload();
      scheduleNote = 'Payment schedule saved: $schedulePreview.';
    } catch (e) {
      scheduleFailed = true;
      final why = e is LocalRuleException
          ? e.message
          : e is FormatException
          ? e.message
          : 'it could not be verified';
      scheduleNote =
          'The debt was saved, but its payment schedule was not: $why '
          'Open the debt in Debts and choose Set schedule.';
    }
  }

  Future<void> pickDate(String key) async {
    final typed = DateTime.tryParse(answer(key));
    final today = DateTime.parse('${civilToday()}T00:00:00');
    final picked = await showDatePicker(
      context: context,
      initialDate: typed != null && typed.year >= 2000 && typed.year <= 2100
          ? typed
          : today,
      firstDate: DateTime(2000),
      lastDate: DateTime(2100),
    );
    if (picked == null || !mounted) return;
    final text =
        '${picked.year.toString().padLeft(4, '0')}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}';
    values[key] = text;
    fields[key]?.text = text;
    retain();
  }

  /// One amount per payment, labeled with the date it falls on.
  Widget paymentAmountFields() {
    final count = paymentCount;
    List<String>? dates;
    if (count != null) {
      try {
        dates = [
          for (var i = 0; i < count; i++)
            debtOccurrence(
              answer('firstDue'),
              answer('frequency'),
              i,
              intervalDays: answer('intervalDays'),
            ),
        ];
      } on FormatException {
        dates = null;
      } on LocalRuleException {
        dates = null;
      }
    }
    if (count == null || dates == null) {
      return const Padding(
        padding: EdgeInsets.only(bottom: 18),
        child: Text(
          'Enter the next payment date and how many payments are left, and a box for each payment will appear here.',
        ),
      );
    }
    BigInt? target;
    try {
      target = debtTarget();
    } on LocalRuleException {
      target = null;
    }
    final entered = payments;
    var total = BigInt.zero, filled = 0;
    for (var i = 0; i < count; i++) {
      final amount = i < entered.length ? entered[i].trim() : '';
      try {
        total += parsePhp(amount);
        filled++;
      } on FormatException {
        // Counted as not yet entered.
      }
    }
    final totalProblem = problemFor('paymentTotal');
    final error = Theme.of(context).colorScheme.error;
    return Padding(
      padding: const EdgeInsets.only(bottom: 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            target == null
                ? 'Enter the amount for each payment. Together they must add up to the whole debt.'
                : 'Enter the amount for each payment. Together they must add up to the whole debt of ${c.decimal(target)} PHP.',
          ),
          const SizedBox(height: 12),
          for (var i = 0; i < count; i++)
            Padding(
              key: anchor('payment-$i'),
              padding: const EdgeInsets.only(bottom: 10),
              child: TextField(
                key: ValueKey('native-payment-$i'),
                controller: fields.putIfAbsent(
                  'payment-$i',
                  () => TextEditingController(
                    text: i < entered.length ? entered[i] : '',
                  ),
                ),
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                decoration: InputDecoration(
                  labelText: 'Payment ${i + 1} · due ${dates[i]} (PHP)',
                  errorText: problemFor('payment-$i'),
                ),
                onChanged: (x) {
                  final list = payments.toList();
                  while (list.length <= i) {
                    list.add('');
                  }
                  list[i] = x.trim();
                  values['paymentAmounts'] = list.join('\n');
                  if (errorField == 'payment-$i' ||
                      errorField == 'paymentTotal') {
                    errorField = null;
                  }
                  retain();
                },
              ),
            ),
          Text(
            key: anchor('paymentTotal'),
            '$filled of $count amounts entered · total ${c.decimal(total)} PHP'
            '${target == null
                ? ''
                : total == target
                ? ' · adds up to the debt'
                : total < target
                ? ' · ${c.decimal(target - total)} PHP still to assign'
                : ' · ${c.decimal(total - target)} PHP over the debt'}',
            style: TextStyle(
              fontWeight: FontWeight.w600,
              color: totalProblem != null ? error : null,
            ),
          ),
          if (totalProblem != null)
            Text(totalProblem, style: TextStyle(color: error)),
        ],
      ),
    );
  }

  /// What "divide the debt evenly" will do, from the debt's own amount.
  Widget divideSummary() {
    final count = paymentCount;
    String text;
    try {
      final target = debtTarget();
      final parts = debtSplitAmounts(target, count!);
      text = parts.first == parts.last
          ? 'Your debt of ${c.decimal(target)} PHP will be paid in ${parts.length} equal payments of ${c.decimal(parts.first)} PHP.'
          : 'Your debt of ${c.decimal(target)} PHP will be paid in ${parts.length} payments of ${c.decimal(parts.first)} PHP, with the last payment ${c.decimal(parts.last)} PHP so the total is exact.';
    } on LocalRuleException catch (e) {
      text = e.message;
    }
    return Padding(
      padding: const EdgeInsets.only(bottom: 18),
      child: Text(text),
    );
  }

  @override
  void dispose() {
    for (final field in fields.values) {
      field.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FormExitGuard(
    dirty: dirty && result == null,
    busy: busy || loading || unknown,
    keepDraft: () async {
      await writes;
      if (draftFailed) throw StateError('Draft not saved');
    },
    child: FinancePage(
      title: widget.title,
      child: WorkspaceForm(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (!loading && result == null) ...[
              WorkspaceSteps(active: reviewed == null ? 0 : 1),
              FinanceHeading(
                'FINANCIAL WORKFLOW',
                widget.title,
                'Review the exact effects before saving.',
              ),
              const Text(
                'Back keeps your encrypted draft. Nothing posts until you save reviewed values.',
              ),
              const SizedBox(height: 20),
            ],
            if (loading)
              const LinearProgressIndicator()
            else if (result != null) ...[
              const WorkspaceSteps(active: 2),
              FormStatus(
                title: '${widget.title} saved',
                message: 'Saved securely on this device.',
                tone: NoticeTone.success,
              ),
              if (scheduleNote != null)
                FormStatus(
                  title: scheduleFailed
                      ? 'Schedule not saved'
                      : 'Schedule saved',
                  message: scheduleNote!,
                  tone: scheduleFailed
                      ? NoticeTone.warning
                      : NoticeTone.success,
                ),
              if (c.connected)
                FormSyncStatus(state: c.synchronizationStates[id]),
              if (plan != null)
                FinancialReview(
                  plan: plan!,
                  snapshot: reviewSnapshot!,
                  amount: c.amount,
                  hidden: c.amountsHidden,
                  commandId: id,
                  details: reviewDetails,
                ),
              if (plan == null)
                FormEvidence(
                  children: [SelectableText('Original command: $id')],
                ),
              FilledButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Done'),
              ),
            ] else ...[
              if (error != null)
                FormStatus(
                  title: unknown
                      ? 'The result is uncertain'
                      : draftFailed
                      ? 'Draft needs attention'
                      : 'Could not save',
                  message: unknown
                      ? '$error Reopen this profile to inspect the original command before submitting changed values.'
                      : error!,
                  tone: unknown || draftFailed
                      ? NoticeTone.warning
                      : NoticeTone.error,
                ),
              if (busy)
                const FormStatus(
                  title: 'Saving\u2026',
                  message: 'Keep this form open while the operation completes.',
                  busy: true,
                ),
              if (reviewed == null) ...[
                for (final input in [
                  if (widget.operation != 'financeReversal')
                    ...inputs.where(visible),
                  if (widget.replacing != null)
                    const FinanceInput(
                      'reason',
                      'Correction / reversal reason',
                    ),
                ]) ...[
                  Padding(
                    key: anchor(input.key),
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
                            decoration: InputDecoration(
                              labelText: input.label,
                              helperText: input.help,
                              helperMaxLines: 3,
                              errorText: problemFor(input.key),
                              errorMaxLines: 3,
                              suffixIcon: input.key == 'firstDue'
                                  ? IconButton(
                                      tooltip: 'Pick a date',
                                      icon: const Icon(
                                        Icons.calendar_today_outlined,
                                      ),
                                      onPressed: () => pickDate(input.key),
                                    )
                                  : null,
                            ),
                            onChanged: (x) {
                              values[input.key] = x;
                              if (errorField == input.key) errorField = null;
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
                            decoration: InputDecoration(
                              labelText: input.label,
                              helperText:
                                  input.key == 'splitMode' &&
                                      paymentCount == null
                                  ? 'Enter how many payments are left first.'
                                  : input.help,
                              helperMaxLines: 3,
                              errorText: problemFor(input.key),
                              errorMaxLines: 3,
                            ),
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
                            onChanged:
                                input.key == 'splitMode' && paymentCount == null
                                ? null
                                : (x) {
                                    values[input.key] = x ?? '';
                                    if (errorField == input.key) {
                                      errorField = null;
                                    }
                                    if (input.key == 'frequency') {
                                      if (values['frequency'] == '') {
                                        clearCadence([
                                          'firstDue',
                                          'intervalDays',
                                          'installmentAmount',
                                          'installmentCount',
                                          'totalAmount',
                                          'paymentAmounts',
                                        ]);
                                        values['splitMode'] =
                                            widget.replacing == null
                                            ? 'divide'
                                            : '';
                                      } else if (values['frequency'] !=
                                          'custom') {
                                        clearCadence(['intervalDays']);
                                      }
                                    }
                                    retain();
                                  },
                          ),
                  ),
                  if (input.key == 'splitMode' &&
                      answer('frequency').isNotEmpty &&
                      paymentCount != null)
                    answer('splitMode') == 'varied'
                        ? paymentAmountFields()
                        : divideSummary(),
                ],
              ] else ...[
                FinancialReview(
                  plan: plan!,
                  snapshot: reviewSnapshot!,
                  amount: c.amount,
                  hidden: c.amountsHidden,
                  commandId: id,
                  details: reviewDetails,
                ),
                if (schedulePreview != null)
                  FinanceNotice(
                    'Payment schedule to save: $schedulePreview.\nCheck these dates and amounts match your loan agreement or lender statement. A payment only counts toward a due date when you record it against that date.',
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
                FormEvidence(
                  children: [SelectableText('Original command: $id')],
                ),
            ],
          ],
        ),
      ),
    ),
  );
}

class NativeCardsScreen extends StatefulWidget {
  const NativeCardsScreen({super.key, required this.controller});
  final LocalFinancialController controller;
  @override
  State<NativeCardsScreen> createState() => _NativeCardsScreenState();
}

class _NativeCardsScreenState extends State<NativeCardsScreen> {
  LocalFinancialController get controller => widget.controller;
  int page = 0;
  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: controller,
    builder: (context, _) {
      final s = controller.snapshot;
      final records = s.current
          .where((r) => financeType(r) == 'creditCard')
          .toList();
      final currentPage = page.clamp(
        0,
        ((records.length + 11) ~/ 12 - 1).clamp(0, 100000),
      );
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SectionHeading('Credit cards'),
          const Text(
            'Keep purchases, payments and provider statements together.',
          ),
          const SizedBox(height: 20),
          NativeWorkflowGroups(
            controller: controller,
            groups: const [
              (
                'Cards & payments',
                'Manage a card and record money paid to its provider.',
                Icons.credit_card_outlined,
                {
                  'creditCard': 'Add credit card',
                  'cardPayment': 'Pay credit card',
                  'cardAuthorization': 'Pending authorization',
                  'cardRefund': 'Card refund',
                  'cardFee': 'Card fee',
                  'cardInterest': 'Card interest',
                },
              ),
              (
                'Statements',
                'Compare provider evidence with recorded activity.',
                Icons.description_outlined,
                {
                  'statement': 'Record statement',
                  'statementLink': 'Link statement activity',
                  'cardAllocation': 'Allocate payment / credit',
                },
              ),
              (
                'Installments',
                'Keep scheduled amounts separate from actual payments.',
                Icons.calendar_month_outlined,
                {
                  'installment': 'Installment plan',
                  'installmentApplication': 'Apply installment payment',
                },
              ),
            ],
          ),
          const WorkspaceHelp(
            title: 'How card balances work',
            text: 'Posted liability, provider statements and cash payments have separate meanings. Card credit and available credit are not liquid money.',
          ),
          if (!s.current.any((r) => financeType(r) == 'creditCard'))
            const WorkspaceEmpty(
              title: 'Your cards, clearly accounted for',
              message: 'Add a credit card above to track its outstanding balance, statements and payments.',
              icon: Icons.credit_card_outlined,
            ),
          for (final card in records.skip(currentPage * 12).take(12)) ...[
            SectionHeading(card.title),
            Builder(
              builder: (context) {
                final liability = -financeBalance(
                  s,
                  'card_liability',
                  'card',
                  card.actionId,
                  through: civilToday(),
                );
                final limit = card.values['limit']!.isEmpty
                    ? null
                    : signedPhp(card.values['limit']!);
                final used = liability > BigInt.zero ? liability : BigInt.zero;
                return WorkspacePanel(
                  title: card.values['issuer'],
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      WorkspaceGrid(
                        children: [
                          ValueBlock(
                            liability < BigInt.zero
                                ? 'CARD CREDIT'
                                : 'POSTED OUTSTANDING',
                            '${controller.decimal(liability.abs())} PHP',
                            'Through today - separate from liquid money',
                          ),
                          ValueBlock(
                            'AVAILABLE CREDIT',
                            limit == null
                                ? 'Not recorded'
                                : '${controller.decimal(limit - liability)} PHP',
                            'Estimate based on recorded limit and liability',
                          ),
                        ],
                      ),
                      WorkspaceHelp(
                        title: 'Credit utilization',
                        text: limit == null
                            ? 'No credit limit recorded.'
                            : 'Utilization: ${limit == BigInt.zero ? 'undefined for zero limit' : '${controller.amountsHidden ? 'hidden' : used * BigInt.from(10000) ~/ limit} basis points'}. Available credit is not cash.',
                      ),
                    ],
                  ),
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
                'Remaining due ${controller.decimal(statement.amount - sumMinor(s.current.where((r) => financeType(r) == 'cardAllocation' && r.date.compareTo(civilToday()) <= 0 && r.values['statement'] == statement.id).map((r) => r.amount)))} PHP. Minimum satisfaction / allocation order not inferred.\n'
                'Recorded balance by provider posting date through ${statement.values['end']}: ${controller.decimal(statementRecordedBalance(s, statement))} PHP; provider difference ${controller.decimal(statement.amount - statementRecordedBalance(s, statement))} PHP. '
                '${s.current.where((r) => financeType(r) == 'statementLink' && r.values['statement'] == statement.id).length} explicitly confirmed activity links; dates do not infer membership. Differences require reviewed source evidence.',
                icon: Icons.description_outlined,
                onTap: () =>
                    openFinanceDetail(context, controller, statement.id),
              ),
          ],
          WorkspacePager(
            count: records.length,
            page: currentPage,
            onPage: (p) => setState(() => page = p),
          ),
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
            WorkspacePanel(
              title: 'Recorded details',
              child: Column(
                children: [
                  for (final item in r.values.entries)
                    if (!['financeContract', 'financeType'].contains(item.key))
                      FinancialLine(
                        item.key
                            .replaceAllMapped(
                              RegExp(r'([a-z])([A-Z])'),
                              (m) => '${m[1]} ${m[2]}',
                            )
                            .replaceAll('_', ' '),
                        c.amountsHidden ? 'Hidden' : item.value,
                        icon: Icons.notes_outlined,
                      ),
                ],
              ),
            ),
            if (r.postings.isNotEmpty)
              WorkspacePanel(
                title: 'Ledger effects',
                child: Column(
                  children: [
                    for (final p in r.postings)
                      FinancialLine(
                        p.ledger.replaceAll('_', ' '),
                        p.date,
                        value: '${c.decimal(p.amount)} PHP',
                      ),
                  ],
                ),
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

class NativeWorkflowGroups extends StatelessWidget {
  const NativeWorkflowGroups({
    super.key,
    required this.controller,
    required this.groups,
  });
  final LocalFinancialController controller;
  final List<(String, String, IconData, Map<String, String>)> groups;
  @override
  Widget build(BuildContext context) => WorkspaceGrid(
    children: [
      for (final group in groups)
        WorkspaceActionGroup(
          title: group.$1,
          description: group.$2,
          icon: group.$3,
          actions: group.$4,
          onSelected: (key) =>
              openNativeFinance(context, controller, key, group.$4[key]!),
        ),
    ],
  );
}
