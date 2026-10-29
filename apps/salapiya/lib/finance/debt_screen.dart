import 'source_list.dart';

import 'package:flutter/material.dart';

import '../app/demo_routes.dart';
import '../design_system/editorial.dart';
import '../design_system/theme.dart';
import '../design_system/components.dart' show StatusNotice;
import '../features/finance/presentation/financial_widgets.dart';
import '../local/finance_domain.dart';
import '../local/local_finance_controller.dart';
import '../p0/exact_money.dart';
import 'finance_screen.dart';

String _principalEvidence(
  LocalFinancialController c,
  LocalSnapshot s,
  LocalRevision debt,
) {
  final range = debtPrincipalRange(s, debt, civilToday());
  return range == null
      ? 'Outstanding principal: unknown; original principal is separate historical evidence.'
      : 'Outstanding principal supported range: ${c.decimal(range.$1)}–${c.decimal(range.$2)} PHP.';
}

String _days(int n) => '$n day${n == 1 ? '' : 's'}';

String _relativeDue(int days) => days < 0
    ? '${_days(-days)} overdue'
    : days == 0
    ? 'due today'
    : 'in ${_days(days)}';

String _frequencyLabel(LocalRevision? schedule) {
  final v = schedule?.values ?? const <String, String>{};
  return switch (v['frequency']) {
    'weekly' => 'Weekly',
    'monthly' => 'Monthly',
    'yearly' => 'Yearly',
    'custom' => 'Every ${_days(int.tryParse(v['intervalDays'] ?? '') ?? 0)}',
    _ => 'Not set',
  };
}

/// Text plus icon and tone, so status never depends on color alone.
(String, IconData, NoticeTone) _badge(DebtDueSummary due) =>
    switch (due.status) {
      DebtDueStatus.overdue => (
        DebtDueStatus.overdue.label,
        Icons.error_outline,
        NoticeTone.error,
      ),
      DebtDueStatus.dueToday => (
        DebtDueStatus.dueToday.label,
        Icons.today_outlined,
        NoticeTone.warning,
      ),
      DebtDueStatus.dueSoon => (
        DebtDueStatus.dueSoon.label,
        Icons.hourglass_bottom_outlined,
        NoticeTone.warning,
      ),
      DebtDueStatus.upcoming => (
        DebtDueStatus.upcoming.label,
        Icons.event_outlined,
        NoticeTone.information,
      ),
      DebtDueStatus.scheduleNotSet => (
        DebtDueStatus.scheduleNotSet.label,
        Icons.event_busy_outlined,
        NoticeTone.neutral,
      ),
      null => (
        due.closed ? 'Closed' : 'Settled',
        Icons.check_circle_outline,
        NoticeTone.success,
      ),
    };

class DebtStatusBadge extends StatelessWidget {
  const DebtStatusBadge(this.due, {super.key});
  final DebtDueSummary due;
  @override
  Widget build(BuildContext context) {
    final (label, icon, tone) = _badge(due);
    final (ink, fill) = CraftTheme.of(context).tone(tone);
    return Semantics(
      label: 'Payment status: $label',
      excludeSemantics: true,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          color: fill,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: ink),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 16, color: ink),
            const SizedBox(width: 6),
            Text(
              label,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: ink,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The payment deadline, the most prominent element of a debt.
class _DueHeadline extends StatelessWidget {
  const _DueHeadline(this.controller, this.due, {this.onUpdateAmounts});
  final LocalFinancialController controller;
  final DebtDueSummary due;
  final VoidCallback? onUpdateAmounts;
  @override
  Widget build(BuildContext context) {
    final next = due.next;
    final style = Theme.of(context).textTheme;
    if (next == null) {
      return Text(
        due.schedule == null
            ? 'Schedule not set'
            : due.closed
            ? 'Closed · future installments cancelled'
            : 'All scheduled installments are settled',
        style: style.titleMedium,
      );
    }
    final overdue = due.overdue.toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Next due ${next.$1.date} · ${_relativeDue(due.daysUntilNext!)}',
          style: style.titleMedium,
        ),
        const SizedBox(height: 2),
        Text(
          'Prepare ${controller.decimal(next.$2)} PHP · ${next.$1.id}',
          style: TextStyle(color: CraftTheme.of(context).secondary),
        ),
        if (due.amountsVary &&
            onUpdateAmounts != null &&
            const {
              DebtDueStatus.overdue,
              DebtDueStatus.dueToday,
              DebtDueStatus.dueSoon,
            }.contains(due.status))
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: StatusNotice(
              'This debt has a different amount for each payment. Check that ${controller.decimal(next.$2)} PHP is right for ${next.$1.date}, and update it if your lender changed it.',
              tone: NoticeTone.warning,
              action: TextButton(
                onPressed: onUpdateAmounts,
                child: const Text('Update amounts'),
              ),
            ),
          ),
        if (overdue.length > 1)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              '${overdue.length} installments overdue · ${controller.decimal(due.overdueAmount)} PHP in total. Each is settled separately.',
              style: TextStyle(color: CraftTheme.of(context).secondary),
            ),
          ),
      ],
    );
  }
}

class _Fact extends StatelessWidget {
  const _Fact(this.label, this.value);
  final String label, value;
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        label,
        style: TextStyle(fontSize: 12, color: CraftTheme.of(context).secondary),
      ),
      Text(value, style: const TextStyle(fontWeight: FontWeight.w600)),
    ],
  );
}

BigInt _outstanding(LocalSnapshot s, LocalRevision debt) => -financeBalance(
  s,
  'debt_liability',
  'debt',
  debt.actionId,
  through: civilToday(),
);

List<Widget> _facts(
  LocalFinancialController c,
  LocalSnapshot s,
  LocalRevision debt,
  DebtDueSummary due, {
  required bool detail,
}) {
  final amount = due.schedule?.values['installmentAmount'] ?? '';
  final finalDue = due.finalScheduledDue;
  return [
    _Fact('Outstanding balance', '${c.decimal(_outstanding(s, debt))} PHP'),
    if (due.schedule != null &&
        (detail || _frequencyLabel(due.schedule) != 'Not set'))
      _Fact('Frequency', _frequencyLabel(due.schedule)),
    if (amount.isNotEmpty)
      _Fact('Scheduled installment', '${c.decimal(parsePhp(amount))} PHP'),
    if (detail && due.schedule?.values['splitMode'] == 'varied')
      const _Fact('Payment amounts', 'Different each time'),
    if (detail && due.schedule?.values['splitMode'] == 'divide')
      const _Fact('Payment amounts', 'A total divided evenly'),
    if (finalDue != null && (detail || due.open.length > 1))
      _Fact('Final scheduled installment', finalDue),
  ];
}

Future<void> _editSchedule(
  BuildContext context,
  LocalFinancialController c,
  LocalRevision debt,
  DebtDueSummary due,
) => due.schedule == null
    ? openNativeFinance(
        context,
        c,
        'debtSchedule',
        'Set schedule',
        initial: {'debt': debt.id},
      )
    : openNativeFinance(
        context,
        c,
        'financeCorrection',
        'Edit schedule',
        replacing: due.schedule,
      );

Future<void> _updateAmounts(
  BuildContext context,
  LocalFinancialController c,
  DebtDueSummary due,
) => openDemoPage<void>(
  context,
  NativeScheduleAmounts(controller: c, scheduleId: due.schedule!.id),
  'debt/amounts/${due.schedule!.id}',
);

class NativeDebtsScreen extends StatefulWidget {
  const NativeDebtsScreen({super.key, required this.controller});
  final LocalFinancialController controller;
  @override
  State<NativeDebtsScreen> createState() => _NativeDebtsScreenState();
}

class _NativeDebtsScreenState extends State<NativeDebtsScreen> {
  LocalFinancialController get controller => widget.controller;
  int page = 0;
  String filter = 'All';
  static const filters = ['All', 'Overdue', 'Upcoming', 'Unscheduled'];

  bool _shown(DebtDueSummary due) => switch (filter) {
    'Overdue' => due.urgencyRank == 0,
    'Upcoming' => due.urgencyRank == 1 || due.urgencyRank == 2,
    'Unscheduled' => due.urgencyRank == 3,
    _ => true,
  };

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: controller,
    builder: (context, _) {
      final s = controller.snapshot;
      final today = civilToday();
      final all = [
        for (final r in s.current.where(
          (r) => ['debtImport', 'borrowing'].contains(financeType(r)),
        ))
          (r, debtDueSummary(s, r, today)),
      ];
      final records =
          [
            for (final (i, e) in all.indexed)
              if (_shown(e.$2)) (i, e.$1, e.$2),
          ]..sort((a, b) {
            final byUrgency = compareDebtUrgency(a.$3, b.$3);
            return byUrgency != 0 ? byUrgency : a.$1.compareTo(b.$1);
          });
      final currentPage = page.clamp(
        0,
        ((records.length + 11) ~/ 12 - 1).clamp(0, 100000),
      );
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          FinanceHeading(
            'DEBTS / A CLEARER WAY FORWARD',
            'Debts',
            'Recognized liability, contractual dues and actual payments stay separate.',
          ),
          NativeWorkflowGroups(
            controller: controller,
            groups: const [
              (
                'Your debts',
                'Bring existing obligations into one clear view.',
                Icons.account_balance_outlined,
                {
                  'debtImport': 'Add existing debt',
                  'borrowing': 'Record borrowing',
                },
              ),
              (
                'Payments',
                'Record actual payments and resolve their allocation.',
                Icons.payments_outlined,
                {
                  'debtPayment': 'Record debt payment',
                  'debtClassification': 'Classify payment',
                },
              ),
              (
                'Provider evidence',
                'Keep schedules, charges and settlement evidence.',
                Icons.description_outlined,
                {
                  'debtSchedule': 'Provider schedule',
                  'debtPayoff': 'Early settlement',
                  'debtAdjustment': 'Provider charge / waiver / residual',
                },
              ),
            ],
          ),
          if (all.isEmpty)
            const WorkspaceEmpty(
              title: 'A clear view of what you owe',
              message: 'Add an existing debt or record new borrowing to see balances and payment history here.',
              icon: Icons.account_balance_outlined,
            )
          else
            WorkspaceTabs(
              items: filters,
              selected: filter,
              onSelected: (f) => setState(() {
                filter = f;
                page = 0;
              }),
            ),
          if (all.isNotEmpty && records.isEmpty)
            const FinanceNotice('No debts match this filter.'),
          for (final (_, debt, due) in records.skip(currentPage * 12).take(12))
            WorkspacePanel(
              title: debt.title,
              caption: debt.values['lender'],
              trailing: DebtStatusBadge(due),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _DueHeadline(
                    controller,
                    due,
                    onUpdateAmounts: () =>
                        _updateAmounts(context, controller, due),
                  ),
                  const SizedBox(height: 14),
                  Wrap(
                    spacing: 24,
                    runSpacing: 10,
                    children: _facts(controller, s, debt, due, detail: false),
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    children: [
                      OutlinedButton(
                        onPressed: () => openDemoPage<void>(
                          context,
                          NativeDebtDetail(
                            controller: controller,
                            debtId: debt.id,
                          ),
                          'debt/${debt.id}',
                        ),
                        child: const Text('Details'),
                      ),
                      if (due.schedule == null)
                        TextButton(
                          onPressed: () =>
                              _editSchedule(context, controller, debt, due),
                          child: const Text('Set schedule'),
                        ),
                    ],
                  ),
                ],
              ),
            ),
          WorkspacePager(
            count: records.length,
            page: currentPage,
            onPage: (p) => setState(() => page = p),
          ),
          const SectionHeading('Debt source detail & payment history'),
          FinancialSourceList(
            controller: controller,
            records: s.revisions.reversed
                .where((r) => nativeDebtCommands.contains(financeType(r)))
                .toList(),
          ),
        ],
      );
    },
  );
}

/// One debt: schedule facts, the next installment and every installment row.
class NativeDebtDetail extends StatelessWidget {
  const NativeDebtDetail({
    super.key,
    required this.controller,
    required this.debtId,
  });
  final LocalFinancialController controller;
  final String debtId;
  @override
  Widget build(BuildContext context) => FinancePage(
    title: 'Debt details',
    child: ListenableBuilder(
      listenable: controller,
      builder: (context, _) {
        final s = controller.snapshot;
        final today = civilToday();
        final debt = s.current.where((r) => r.id == debtId).firstOrNull;
        if (debt == null) {
          return const FinanceNotice(
            'This debt revision is no longer current. Return to Debts to open its latest revision.',
            warning: true,
          );
        }
        final due = debtDueSummary(s, debt, today);
        final schedule = due.schedule;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SectionHeading(debt.title, trailing: DebtStatusBadge(due)),
            WorkspacePanel(
              title: 'Next installment',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _DueHeadline(
                    controller,
                    due,
                    onUpdateAmounts: () =>
                        _updateAmounts(context, controller, due),
                  ),
                  const SizedBox(height: 14),
                  Wrap(
                    spacing: 24,
                    runSpacing: 10,
                    children: _facts(controller, s, debt, due, detail: true),
                  ),
                  if (due.finalScheduledDue != null)
                    const Padding(
                      padding: EdgeInsets.only(top: 10),
                      child: Text(
                        'The final scheduled installment is the last row of the schedule. It is separate from the next installment and is not a provider payoff date.',
                      ),
                    ),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      FilledButton(
                        key: const ValueKey('debt-edit-schedule'),
                        onPressed: () =>
                            _editSchedule(context, controller, debt, due),
                        child: Text(
                          schedule == null ? 'Set schedule' : 'Edit schedule',
                        ),
                      ),
                      if (schedule != null && due.next != null)
                        OutlinedButton(
                          key: const ValueKey('debt-update-amounts'),
                          onPressed: () =>
                              _updateAmounts(context, controller, due),
                          child: const Text('Update amounts'),
                        ),
                      OutlinedButton(
                        onPressed: () => openNativeFinance(
                          context,
                          controller,
                          'debtPayment',
                          'Record debt payment',
                          initial: {'debt': debt.id},
                        ),
                        child: const Text('Record payment'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            FinanceNotice(
              'Recognized liability: ${controller.decimal(_outstanding(s, debt))} PHP\n'
              'Unresolved payment clearing: ${controller.decimal(financeBalance(s, 'debt_clearing', 'debt', debt.actionId, through: today))} PHP\n'
              '${_principalEvidence(controller, s, debt)}\n'
              '${due.closed ? 'Closed with reconciled payoff evidence. Future dues are cancelled; history is retained.' : 'Active. Schedules never create a liability or prove payment.'}',
            ),
            if (schedule != null)
              WorkspacePanel(
                title: 'Installments',
                caption: 'Only an explicit allocation to an installment settles it. Partial and extra payments never advance the schedule.',
                child: Column(
                  children: [
                    FinancialLine(
                      schedule.title,
                      'Provider schedule revision ${schedule.number} · ${controller.decimal(schedule.amount)} PHP contractual total',
                      icon: Icons.calendar_month,
                      onTap: () =>
                          openFinanceDetail(context, controller, schedule.id),
                    ),
                    for (final row in financeSchedule(
                      schedule.values['schedule']!,
                    ))
                      Builder(
                        builder: (context) {
                          final remaining =
                              row.amount -
                              debtInstallmentPaid(s, schedule, row, today);
                          return FinancialLine(
                            row.id,
                            '${row.date} · ${due.closed && remaining > BigInt.zero
                                ? 'Cancelled by payoff'
                                : remaining == BigInt.zero
                                ? 'Satisfied'
                                : debtDueStatus(row.date, today).label}',
                            value: '${controller.decimal(remaining)} PHP',
                            icon: Icons.event_note,
                          );
                        },
                      ),
                  ],
                ),
              ),
          ],
        );
      },
    ),
  );
}

/// Change the amount of any payment not yet paid in full. Dates, historical
/// paid amounts and recorded allocations are kept by the schedule rules.
class NativeScheduleAmounts extends StatefulWidget {
  const NativeScheduleAmounts({
    super.key,
    required this.controller,
    required this.scheduleId,
  });
  final LocalFinancialController controller;
  final String scheduleId;
  @override
  State<NativeScheduleAmounts> createState() => _NativeScheduleAmountsState();
}

class _NativeScheduleAmountsState extends State<NativeScheduleAmounts> {
  LocalFinancialController get c => widget.controller;
  late final LocalRevision schedule = c.snapshot.revision(widget.scheduleId);
  late final rows = financeSchedule(schedule.values['schedule']!);
  late final paid = [
    for (final r in rows)
      debtInstallmentPaid(c.snapshot, schedule, r, '9999-12-31'),
  ];
  late final fields = [
    for (final r in rows) TextEditingController(text: phpDecimal(r.amount)),
  ];
  int? errorRow; // a row index, or -1 for the total
  String? errorText;
  bool busy = false, saved = false;

  /// What is still owed on this debt; the unpaid payments must add up to it.
  BigInt get owed => -financeBalance(
    c.snapshot,
    'debt_liability',
    'debt',
    schedule.values['debt']!,
    through: civilToday(),
  );

  BigInt get scheduled {
    var sum = BigInt.zero;
    for (var i = 0; i < rows.length; i++) {
      if (paid[i] >= rows[i].amount) continue;
      sum += (_amount(i) ?? BigInt.zero) - paid[i];
    }
    return sum;
  }

  BigInt? _amount(int i) {
    try {
      final v = parsePhp(fields[i].text.trim());
      return v > BigInt.zero ? v : null;
    } on FormatException {
      return null;
    }
  }

  Future<void> save() async {
    setState(() {
      busy = true;
      errorRow = errorText = null;
    });
    String? problem;
    int? problemRow;
    try {
      final lines = <String>[];
      var changed = false;
      for (var i = 0; i < rows.length; i++) {
        final r = rows[i];
        final amount = paid[i] >= r.amount ? r.amount : _amount(i);
        if (amount == null) {
          reject('Enter an amount like 2000.00 for ${r.id}.', field: '$i');
        }
        if (amount != r.amount) changed = true;
        lines.add(
          '${r.id},${r.date},${phpDecimal(amount)}${r.paid > BigInt.zero ? ',${phpDecimal(r.paid)}' : ''}',
        );
      }
      if (!changed) reject('No amounts were changed.');
      await c.reload();
      if (scheduled != owed) {
        reject(
          'The unpaid payments add up to ${c.decimal(scheduled)} PHP, but you still owe ${c.decimal(owed)} PHP. They must match exactly.',
          field: 'total',
        );
      }
      final current = c.snapshot.revision(widget.scheduleId);
      final command = LocalCommand(
        id: newLocalId(),
        owner: c.store.owner,
        expectedVersion: c.snapshot.version,
        kind: 'financeCorrection',
        values: {
          'replace': current.id,
          'replaceVersion': '${current.number}',
          'reason': 'Updated payment amounts',
          'schedule': lines.join('\n'),
          if ((current.values['frequency'] ?? '').isNotEmpty) ...{
            'splitMode': 'varied',
            'installmentAmount': '',
          },
        },
      );
      planLocal(c.snapshot, command);
      await c.store.commit(command);
      await c.reload();
      saved = true;
    } on LocalRuleException catch (e) {
      problem = e.message;
      problemRow = e.field == 'total' ? -1 : int.tryParse(e.field ?? '');
    } on FormatException catch (e) {
      problem = e.message;
    } catch (_) {
      problem = 'The amounts could not be saved. Your entries are kept.';
    }
    if (mounted) {
      setState(() {
        busy = false;
        errorRow = problemRow;
        errorText = problem;
      });
    }
    if (problem != null && mounted) {
      await showFormError(context, problem);
    }
  }

  @override
  void dispose() {
    for (final f in fields) {
      f.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FinancePage(
      title: 'Update payment amounts',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SectionHeading('Payment amounts'),
          const Text(
            'Change the amount of any payment that is not paid yet. Dates and payments already made stay as they are. The unpaid payments must add up to what you still owe.',
          ),
          const SizedBox(height: 16),
          if (saved)
            const FormStatus(
              title: 'Amounts saved',
              message: 'The payment schedule now uses the new amounts.',
              tone: NoticeTone.success,
            )
          else ...[
            for (var i = 0; i < rows.length; i++)
              paid[i] >= rows[i].amount
                  ? FinancialLine(
                      rows[i].id,
                      '${rows[i].date} · Paid',
                      value: '${c.decimal(rows[i].amount)} PHP',
                      icon: Icons.check_circle_outline,
                    )
                  : Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: TextField(
                        key: ValueKey('amount-$i'),
                        controller: fields[i],
                        keyboardType: const TextInputType.numberWithOptions(
                          decimal: true,
                        ),
                        decoration: InputDecoration(
                          labelText:
                              '${rows[i].id} · due ${rows[i].date} (PHP)',
                          helperText: paid[i] > BigInt.zero
                              ? '${c.decimal(paid[i])} PHP already paid toward this'
                              : null,
                          errorText: errorRow == i ? errorText : null,
                          errorMaxLines: 3,
                        ),
                        onChanged: (_) => setState(() => errorRow = null),
                      ),
                    ),
            Text(
              'Still owed: ${c.decimal(owed)} PHP · scheduled: ${c.decimal(scheduled)} PHP'
              '${scheduled == owed
                  ? ' · adds up'
                  : scheduled < owed
                  ? ' · ${c.decimal(owed - scheduled)} PHP still to assign'
                  : ' · ${c.decimal(scheduled - owed)} PHP too much'}',
              style: TextStyle(
                fontWeight: FontWeight.w600,
                color: errorRow == -1
                    ? Theme.of(context).colorScheme.error
                    : null,
              ),
            ),
            if (errorRow == -1 && errorText != null)
              Text(
                errorText!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: busy ? null : save,
              child: Text(busy ? 'Saving…' : 'Save amounts'),
            ),
          ],
          if (saved)
            FilledButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Done'),
            ),
        ],
      ),
    );
  }
}
