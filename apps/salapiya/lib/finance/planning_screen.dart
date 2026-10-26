import 'source_list.dart';

import 'package:flutter/material.dart';

import '../design_system/editorial.dart';
import '../features/finance/presentation/financial_widgets.dart';
import '../local/finance_domain.dart';
import '../local/local_finance_controller.dart';
import 'finance_screen.dart';
import 'reports_screen.dart';

class NativePlanningScreen extends StatelessWidget {
  const NativePlanningScreen({super.key, required this.controller});
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
            'Expected recurring activity, category limits and savings reservations never create money. Actual transactions remain authoritative.',
          ),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final action in const {
                'recurrence': 'Recurring definition',
                'recurrenceGenerate': 'Generate occurrences',
                'occurrenceOverride': 'Change / skip occurrence',
                'recurrenceLink': 'Link actual evidence',
                'recurrenceUnlink': 'Reverse actual link',
                'budget': 'Category budget',
                'savingsGoal': 'Savings goal',
                'reservation': 'Reserve / release cash',
                'savingsReallocation': 'Reallocate reservation',
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
          OutlinedButton(
            onPressed: () => openNativeForecast(context, controller),
            child: const Text('Read-only cash forecast'),
          ),
          const SizedBox(height: 24),
          const SectionHeading('Recurring expectations'),
          for (final rule in s.current.where(
            (r) => financeType(r) == 'recurrence',
          )) ...[
            FinancialLine(
              rule.title,
              '${rule.values['frequency']} · ${rule.values['timezone']} · ${rule.values['status']} · v${rule.number}',
              value: '${controller.decimal(rule.amount)} PHP',
              icon: Icons.repeat,
              onTap: () => openFinanceDetail(context, controller, rule.id),
            ),
          ],
          for (final generation
              in s.current
                  .where((r) => financeType(r) == 'recurrenceGenerate')
                  .take(50))
            FinancialLine(
              generation.title,
              'Explicit window ${generation.values['from']} through ${generation.values['through']}. Generated expectations are not payments.',
              icon: Icons.calendar_month,
              onTap: () =>
                  openFinanceDetail(context, controller, generation.id),
            ),
          FinancialDueList(
            controller: controller,
            from: civilToday(),
            through: DateTime.parse('${civilToday()}T00:00:00Z')
                .add(const Duration(days: 90))
                .toIso8601String()
                .substring(0, 10),
          ),
          const SectionHeading('Whole-period budget comparisons'),
          for (final budget in s.current.where(
            (r) => financeType(r) == 'budget',
          ))
            Builder(
              builder: (context) {
                final spent = budgetSpending(s, budget),
                    remaining = budget.amount - spent;
                return FinancialLine(
                  budget.title,
                  '[${budget.values['start']}, ${budget.values['endExclusive']}) · ${budget.values['basis']} · ${budget.values['status']}\n'
                  'Recognized spending ${controller.decimal(spent)} PHP; remaining ${controller.decimal(remaining)} PHP. ${budget.amount == BigInt.zero ? 'Zero-limit budget; no percentage denominator.' : ''}',
                  value: '${controller.decimal(budget.amount)} PHP',
                  icon: Icons.pie_chart_outline,
                  onTap: () =>
                      openFinanceDetail(context, controller, budget.id),
                );
              },
            ),
          const SectionHeading('Savings reservations & support'),
          for (final goal in s.current.where(
            (r) => financeType(r) == 'savingsGoal',
          ))
            Builder(
              builder: (context) {
                final reserved = savingsReserved(s, goal: goal.actionId),
                    supported = supportedSavings(
                      s,
                      goal.actionId,
                      civilToday(),
                    );
                return FinancialLine(
                  goal.title,
                  '${goal.values['status']} · reserved ${controller.decimal(reserved)} PHP\n'
                  'Supported actual funding range ${controller.decimal(supported.$1)}–${controller.decimal(supported.$2)} PHP through ${civilToday()}. Shared underfunding never assigns a winning goal.',
                  value: 'Target ${controller.decimal(goal.amount)} PHP',
                  icon: Icons.savings_outlined,
                  onTap: () => openFinanceDetail(context, controller, goal.id),
                );
              },
            ),
          const SectionHeading('Planning decisions & source history'),
          FinancialSourceList(
            controller: controller,
            records: s.revisions.reversed
                .where(
                  (r) =>
                      nativePlanningCommands.contains(financeType(r)) ||
                      nativeRecurrenceCommands.contains(financeType(r)),
                )
                .toList(),
          ),
        ],
      );
    },
  );
}
