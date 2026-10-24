import 'package:flutter/material.dart';

import '../../../prototype/scenarios.dart';
import '../../common/prototype_form.dart';
import '../application/financial_controller.dart';
import '../contracts/card_evidence_models.dart';
import '../contracts/financial_models.dart';
import 'financial_widgets.dart';

class CardLibrary extends StatelessWidget {
  const CardLibrary({super.key, required this.session});
  final PrototypeSession session;
  @override
  Widget build(BuildContext context) {
    final c = session.finance;
    void statement([CardStatementEvidence? old]) => reviewForm(
      context,
      title: old == null ? 'New card statement' : 'Revise full statement',
      revision: () => c.version,
      fields: [
        DemoField('start', 'Cycle start', value: old?.start ?? '2026-10-15'),
        DemoField('end', 'Cycle end', value: old?.end ?? '2026-11-14'),
        DemoField(
          'issued',
          'Statement date',
          value: old?.issued ?? '2026-11-15',
        ),
        DemoField('due', 'Due date', value: old?.due ?? '2026-11-27'),
        DemoField(
          'amount',
          'Provider balance PHP',
          value: ExactFinance.decimal(old?.balance ?? BigInt.from(480000)),
        ),
        DemoField(
          'minimum',
          'Provider minimum due PHP (optional)',
          value: old?.minimum == null
              ? ''
              : ExactFinance.decimal(old!.minimum!),
          required: false,
        ),
        DemoField(
          'reference',
          'Provider reference',
          value: old?.reference ?? '',
        ),
        if (old != null) const DemoField('reason', 'Reason'),
      ],
      save: (v) => c.saveStatementEvidence(v, old: old),
      explanation: 'Versioned provider evidence. A new statement does not recognize purchases or liability again; verified payment coverage stays separate.',
    );
    void plan([CardPlanEvidence? old]) => reviewForm(
      context,
      title: old == null
          ? 'Create installment plan'
          : 'Revise full installment plan',
      revision: () => c.version,
      fields: [
        DemoField('name', 'Plan name', value: old?.name ?? ''),
        DemoField(
          'source',
          'Already recognized source',
          value: old?.source ?? 'Opening evidence',
          options: {
            'Opening evidence':
                'Imported opening provider evidence · no new purchase',
            for (final r in c.records.where((r) => r.kind == 'cardPurchase'))
              r.id: '${r.title} · ${session.amount(r.amount)}',
          },
        ),
        DemoField(
          'amount',
          'Expected PHP per installment',
          value: ExactFinance.decimal(old?.amount ?? BigInt.from(100000)),
        ),
        DemoField('count', 'Installment count', value: '${old?.count ?? 6}'),
        DemoField('due', 'First due', value: old?.due ?? '2026-10-27'),
        DemoField(
          'principal',
          'Expected principal total PHP (optional)',
          value: old?.principal == null
              ? ''
              : ExactFinance.decimal(old!.principal!),
          required: false,
        ),
        DemoField(
          'interest',
          'Expected interest total PHP (optional)',
          value: old?.interest == null
              ? ''
              : ExactFinance.decimal(old!.interest!),
          required: false,
        ),
        DemoField(
          'fee',
          'Expected fee total PHP (optional)',
          value: old?.fee == null ? '' : ExactFinance.decimal(old!.fee!),
          required: false,
        ),
        DemoField(
          'reference',
          'Provider plan reference',
          value: old?.reference ?? '',
        ),
        if (old != null) const DemoField('reason', 'Reason'),
      ],
      save: (v) => c.savePlanEvidence(v, old: old),
      explanation: 'Scheduling evidence only. Supply all expected components or keep them unknown. Count alone never invents interest. Existing purchase spending is not repeated.',
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            OutlinedButton.icon(
              onPressed: () => statement(),
              icon: const Icon(Icons.add),
              label: const Text('New statement'),
            ),
            OutlinedButton.icon(
              onPressed: () => plan(),
              icon: const Icon(Icons.add),
              label: const Text('New installment plan'),
            ),
          ],
        ),
        const SizedBox(height: 16),
        FinanceColumns(
          main: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              DropdownButtonFormField<String>(
                key: ValueKey(c.activeStatementId),
                initialValue: c.activeStatementId,
                isExpanded: true,
                decoration: const InputDecoration(
                  labelText: 'Statement evidence',
                ),
                items: [
                  for (final e in c.statementDefinitions)
                    DropdownMenuItem(
                      value: e.id,
                      child: Text(
                        '${e.issued} · ${e.reference} · v${e.version}',
                      ),
                    ),
                ],
                onChanged: (v) => c.selectStatement(v!),
              ),
              TextButton(
                onPressed: () => statement(c.activeStatement),
                child: const Text('Edit cycle, minimum & evidence'),
              ),
            ],
          ),
          aside: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              DropdownButtonFormField<String>(
                key: ValueKey(c.activePlanId),
                initialValue: c.activePlanId,
                isExpanded: true,
                decoration: const InputDecoration(
                  labelText: 'Installment plan',
                ),
                items: [
                  for (final e in c.planDefinitions)
                    DropdownMenuItem(
                      value: e.id,
                      child: Text('${e.name} · v${e.version}'),
                    ),
                ],
                onChanged: (v) => c.selectPlan(v!),
              ),
              TextButton(
                onPressed: () => plan(c.activePlan),
                child: const Text('Edit source & expected terms'),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
      ],
    );
  }
}
