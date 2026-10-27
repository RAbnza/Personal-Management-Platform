import 'source_list.dart';

import 'package:flutter/material.dart';

import '../design_system/editorial.dart';
import '../features/finance/presentation/financial_widgets.dart';
import '../local/finance_domain.dart';
import '../local/local_finance_controller.dart';
import 'finance_screen.dart';
import 'reports_screen.dart';

class NativePlanningScreen extends StatefulWidget {
  const NativePlanningScreen({super.key, required this.controller});
  final LocalFinancialController controller;
  @override
  State<NativePlanningScreen> createState() => _NativePlanningScreenState();
}

class _NativePlanningScreenState extends State<NativePlanningScreen> {
  LocalFinancialController get controller => widget.controller;
  String section = 'Recurring';
  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: controller,
    builder: (context, _) {
      final s = controller.snapshot;
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SectionHeading('Plans for your money'),
          const Text(
            'Set intentions, make room for goals, and see what is coming.',
          ),
          const SizedBox(height: 20),
          NativeWorkflowGroups(
            controller: controller,
            groups: const [
              (
                'Recurring activity',
                'Bills, subscriptions and expected income.',
                Icons.repeat,
                {
                  'recurrence': 'Add recurring activity',
                  'recurrenceGenerate': 'Generate occurrences',
                  'occurrenceOverride': 'Change / skip occurrence',
                  'recurrenceLink': 'Link actual evidence',
                  'recurrenceUnlink': 'Reverse actual link',
                },
              ),
              (
                'Budgets',
                'Compare category limits with actual spending.',
                Icons.pie_chart_outline,
                {'budget': 'Create budget'},
              ),
              (
                'Savings',
                'Reserve existing cash toward something that matters.',
                Icons.savings_outlined,
                {
                  'savingsGoal': 'Create savings goal',
                  'reservation': 'Reserve / release cash',
                  'savingsReallocation': 'Reallocate reservation',
                },
              ),
            ],
          ),
          Wrap(
            alignment: WrapAlignment.spaceBetween,
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: 16,
            runSpacing: 8,
            children: [
              const Text(
                'Plans never post money. Link actual activity to mark progress.',
              ),
              OutlinedButton.icon(
                onPressed: () => openNativeForecast(context, controller),
                icon: const Icon(Icons.insights_outlined),
                label: const Text('Open cash forecast'),
              ),
            ],
          ),
          const SizedBox(height: 24),
          WorkspaceTabs(
            items: const ['Recurring', 'Budgets', 'Savings', 'History'],
            selected: section,
            onSelected: (value) => setState(() => section = value),
          ),
          if (section == 'Recurring') ...[
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
            const SizedBox(height: 20),
          ],
          if (section == 'Budgets') ...[
            const SectionHeading('Budgets'),
            if (!s.current.any((r) => financeType(r) == 'budget'))
              const WorkspaceEmpty(
                title: 'Give your spending a plan',
                message: 'Create a category budget above to compare actual spending with your limit.',
                icon: Icons.pie_chart_outline,
              ),
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
            const SizedBox(height: 20),
          ],
          if (section == 'Savings') ...[
            const SectionHeading('Savings goals'),
            if (!s.current.any((r) => financeType(r) == 'savingsGoal'))
              const WorkspaceEmpty(
                title: 'Make room for your next goal',
                message: 'A savings reservation sets aside existing cash; it does not create another asset.',
                icon: Icons.savings_outlined,
              ),
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
                    onTap: () =>
                        openFinanceDetail(context, controller, goal.id),
                  );
                },
              ),
          ],
          if (section == 'History') ...[
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
        ],
      );
    },
  );
}
