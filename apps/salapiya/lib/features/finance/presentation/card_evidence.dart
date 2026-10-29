import 'package:flutter/material.dart';

import '../../../app/demo_routes.dart';
import '../../../design_system/editorial.dart';
import '../../../prototype/scenarios.dart';
import '../../common/prototype_form.dart';
import '../../planning/application/planning_controller.dart';
import '../contracts/financial_models.dart';
import 'financial_editor.dart';
import 'financial_widgets.dart';
import '../../supporting/presentation/files_screen.dart';
import '../application/financial_controller.dart';
import 'card_library.dart';

class CardEvidence extends StatelessWidget {
  const CardEvidence({super.key, required this.session});
  final PrototypeSession session;
  @override
  Widget build(BuildContext context) {
    final c = session.finance;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SectionHeading('Provider evidence workspace'),
        CardLibrary(session: session),
        FinancialLine(
          'Statements, allocations & reconciliation',
          'Cycle coverage, unresolved lines and retained evidence',
          icon: Icons.fact_check_outlined,
          onTap: () => openDemoPage<void>(
            context,
            FinancePage(
              title: 'Statement workspace',
              child: ListenableBuilder(
                listenable: c,
                builder: (context, _) => Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    FinanceHeading(
                      'CARD / STATEMENT CYCLE',
                      'Reconcile with evidence.',
                      '${c.activeStatement.start} – ${c.activeStatement.end} · issued ${c.activeStatement.issued} · due ${c.statementDue}. Provider evidence never posts a purchase.',
                    ),
                    ValueBlock(
                      'REMAINING DUE',
                      session.amount(c.statementBalance - c.statementAllocated),
                      'Original statement ${session.amount(c.statementBalance)} · verified allocations ${session.amount(c.statementAllocated)}',
                    ),
                    FinanceNotice(
                      'Minimum due: ${c.activeStatement.minimum == null ? 'not supplied' : session.amount(c.activeStatement.minimum!)}. Unknown provider lines and unmatched cycle coverage remain unresolved; no balancing transaction is invented.',
                      warning: true,
                    ),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        OutlinedButton(
                          onPressed: () => openFinancialEditor(
                            context,
                            c,
                            FinancialAction.statement,
                          ),
                          child: const Text('Revise statement evidence'),
                        ),
                        FilledButton(
                          onPressed: () => openFinancialEditor(
                            context,
                            c,
                            FinancialAction.cardPayment,
                          ),
                          child: const Text('Record payment & allocation'),
                        ),
                        for (final a in [
                          FinancialAction.cardPurchase,
                          FinancialAction.cardFee,
                          FinancialAction.cardInterest,
                          FinancialAction.cardRefund,
                        ])
                          OutlinedButton(
                            onPressed: () => openFinancialEditor(context, c, a),
                            child: Text(a.label),
                          ),
                        OutlinedButton(
                          onPressed: () => reviewForm(
                            context,
                            title: 'Reconciliation evidence',
                            fields: [
                              const DemoField(
                                'reference',
                                'Provider reference',
                              ),
                              const DemoField(
                                'note',
                                'Explanation of unresolved difference',
                                lines: 3,
                              ),
                            ],
                            save: (v) {
                              c.statementHistory.add(
                                'Review ${v['reference']} · ${v['note']} · no adjustment',
                              );
                              c.changed();
                            },
                          ),
                          child: const Text('Add reconciliation note'),
                        ),
                      ],
                    ),
                    const SizedBox(height: 20),
                    SupportingFilesLink(
                      session: session,
                      source:
                          'statement:${c.activeStatementId}:v${c.statementVersion}',
                    ),
                    const SectionHeading('Payment and credit evidence'),
                    OutlinedButton(
                      onPressed: () => reviewForm(
                        context,
                        title: 'Allocate existing payment or credit',
                        revision: () => c.version,
                        fields: [
                          DemoField(
                            'record',
                            'Actual source',
                            value:
                                c.records
                                    .where(
                                      (r) => [
                                        'cardPayment',
                                        'cardRefund',
                                      ].contains(r.kind),
                                    )
                                    .firstOrNull
                                    ?.id ??
                                '',
                            options: {
                              for (final r in c.records.where(
                                (r) => [
                                  'cardPayment',
                                  'cardRefund',
                                ].contains(r.kind),
                              ))
                                r.id:
                                    '${r.title} · ${session.amount(r.amount)}',
                            },
                          ),
                          const DemoField(
                            'amount',
                            'Allocation PHP',
                            value: '100.00',
                          ),
                          const DemoField(
                            'reference',
                            'Provider coverage reference',
                          ),
                        ],
                        save: (v) => c.allocateCardEvidence(
                          v['record']!,
                          minor(v['amount']!, zero: false),
                          reference: v['reference']!,
                        ),
                      ),
                      child: const Text('Allocate existing evidence'),
                    ),
                    for (final allocation
                        in c.cardPaymentCoverage.entries.where(
                          (e) =>
                              (e.value[c.activeStatementId] ?? BigInt.zero) >
                              BigInt.zero,
                        ))
                      FinancialLine(
                        'Confirmed coverage',
                        allocation.key,
                        value: session.amount(
                          allocation.value[c.activeStatementId]!,
                        ),
                        onTap: () => reviewForm(
                          context,
                          title: 'Reverse statement allocation',
                          fields: [const DemoField('reason', 'Reason')],
                          save: (v) => c.allocateCardEvidence(
                            allocation.key,
                            BigInt.zero,
                            reverse: true,
                            reference: v['reason']!,
                          ),
                        ),
                      ),
                    for (final r in c.records.where(
                      (r) => ['cardPayment', 'cardRefund'].contains(r.kind),
                    ))
                      FinancialLine(
                        r.title,
                        '${r.date} · ${r.note}',
                        value: session.amount(r.amount),
                      ),
                    const SectionHeading('Statement versions & review history'),
                    for (
                      var evidence = c.activeStatement.previous;
                      evidence != null;
                      evidence = evidence.previous
                    )
                      FinancialLine(
                        'Statement v${evidence.version}',
                        '${evidence.start}–${evidence.end} · due ${evidence.due} · ${evidence.reference}',
                        value: session.amount(evidence.balance),
                      ),
                    for (final h in c.statementHistory)
                      FinancialLine(
                        'Retained evidence',
                        session.hideAmounts ? 'Amounts hidden' : h,
                      ),
                  ],
                ),
              ),
            ),
            'card/statements',
          ),
        ),
        FinancialLine(
          'Installment schedule',
          'Source purchase, due amounts, application and revision history',
          icon: Icons.calendar_view_month,
          onTap: () => openDemoPage<void>(
            context,
            FinancePage(
              title: 'Installment schedule',
              child: ListenableBuilder(
                listenable: c,
                builder: (context, _) => Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    FinanceHeading(
                      'CARD / PROVIDER PLAN',
                      'One purchase. A considered plan.',
                      'v${c.installmentVersion} · expected schedule only. Principal, interest and fees require supplied evidence.',
                      actions: [
                        OutlinedButton(
                          onPressed: () => openFinancialEditor(
                            context,
                            c,
                            FinancialAction.installment,
                          ),
                          child: const Text('Revise provider schedule'),
                        ),
                        OutlinedButton(
                          onPressed: () => reviewForm(
                            context,
                            title: c.suspendedPlans.contains(c.activePlanId)
                                ? 'Resume installment plan'
                                : 'Suspend installment plan',
                            fields: [const DemoField('reason', 'Reason')],
                            revision: () => c.version,
                            save: (v) {
                              final resume = c.suspendedPlans.contains(
                                c.activePlanId,
                              );
                              if (resume &&
                                  c.records.any(
                                    (r) =>
                                        r.sourceId == c.activePlan.source &&
                                        [
                                          'correction',
                                          'reversal',
                                        ].contains(r.kind),
                                  )) {
                                throw const FormatException(
                                  'Revise the plan source before resuming; its original purchase was replaced.',
                                );
                              }
                              resume
                                  ? c.suspendedPlans.remove(c.activePlanId)
                                  : c.suspendedPlans.add(c.activePlanId);
                              c.installmentHistory.add(
                                '${resume ? 'Resumed' : 'Suspended'} ${c.activePlanId} · ${v['reason']}',
                              );
                              c.version++;
                              c.changed();
                            },
                          ),
                          child: Text(
                            c.suspendedPlans.contains(c.activePlanId)
                                ? 'Resume plan'
                                : 'Suspend plan',
                          ),
                        ),
                      ],
                    ),
                    const FinanceNotice(
                      'Purchase spending is recognized once. Applying provider coverage below only links an existing card payment; it does not move cash or count spending again.',
                    ),
                    FinanceNotice(
                      'Source: ${c.activePlan.source}\n${c.activePlan.principal == null ? 'Expected principal / interest / fees: unknown, not inferred.' : 'Expected principal ${session.amount(c.activePlan.principal!)} · interest ${session.amount(c.activePlan.interest!)} · fees ${session.amount(c.activePlan.fee!)}'}',
                    ),
                    for (
                      var evidence = c.activePlan.previous;
                      evidence != null;
                      evidence = evidence.previous
                    )
                      FinancialLine(
                        'Plan v${evidence.version}',
                        '${evidence.count} installments from ${evidence.due} · ${evidence.reference}',
                        value: session.amount(evidence.amount),
                      ),
                    for (var i = 0; i < c.installmentCount; i++)
                      FinancialLine(
                        'Installment ${i + 1}',
                        civil(
                          DateTime(
                            dateValue(c.installmentDue).year,
                            dateValue(c.installmentDue).month + i,
                            dateValue(c.installmentDue).day.clamp(
                              1,
                              DateTime(
                                dateValue(c.installmentDue).year,
                                dateValue(c.installmentDue).month + i + 1,
                                0,
                              ).day,
                            ),
                          ),
                        ),
                        value: session.amount(c.installmentAmount),
                        onTap: c.suspendedPlans.contains(c.activePlanId)
                            ? null
                            : () => reviewForm(
                                context,
                                title: 'Apply installment ${i + 1}',
                                fields: [
                                  DemoField(
                                    'payment',
                                    'Existing card payment',
                                    value:
                                        c.records
                                            .where(
                                              (r) => r.kind == 'cardPayment',
                                            )
                                            .firstOrNull
                                            ?.id ??
                                        '',
                                    options: {
                                      for (final r in c.records.where(
                                        (r) => r.kind == 'cardPayment',
                                      ))
                                        r.id:
                                            '${r.date} · ${session.amount(r.amount)}',
                                    },
                                  ),
                                  DemoField(
                                    'amount',
                                    'Provider-confirmed coverage PHP',
                                    value: ExactFinance.decimal(
                                      c.installmentAmount,
                                    ),
                                  ),
                                  const DemoField(
                                    'reference',
                                    'Provider allocation reference',
                                  ),
                                ],
                                revision: () => c.version,
                                save: (v) {
                                  final r = c.records.firstWhere(
                                    (r) => r.id == v['payment'],
                                  );
                                  final amount = minor(
                                    v['amount']!,
                                    zero: false,
                                  );
                                  final used = ExactFinance.sum(
                                    c.allInstallmentApplications.values
                                        .expand((items) => items.values)
                                        .where((x) => x.$1 == r.id)
                                        .map((x) => x.$2),
                                  );
                                  if (c.installmentApplications.containsKey(
                                        i,
                                      ) ||
                                      amount > c.installmentAmount ||
                                      used + amount > r.amount) {
                                    throw const FormatException(
                                      'Coverage exceeds the source or this installment already has an application. Reverse its evidence first.',
                                    );
                                  }
                                  c.installmentApplications[i] = (r.id, amount);
                                  c.installmentHistory.add(
                                    'Installment ${i + 1}: ${c.amount(amount)} from ${r.id} · ${v['reference']}',
                                  );
                                  c.version++;
                                  c.changed();
                                },
                              ),
                      ),
                    const SectionHeading('Applied coverage'),
                    for (final e in c.installmentApplications.entries)
                      FinancialLine(
                        'Installment ${e.key + 1}',
                        e.value.$1,
                        value: session.amount(e.value.$2),
                        onTap: () => reviewForm(
                          context,
                          title: 'Reverse installment coverage',
                          fields: [const DemoField('reason', 'Reason')],
                          save: (v) {
                            c.installmentHistory.add(
                              'Reversed application ${e.key + 1} · ${v['reason']} · payment unchanged',
                            );
                            c.installmentApplications.remove(e.key);
                            c.version++;
                            c.changed();
                          },
                        ),
                      ),
                    for (final h in c.installmentHistory)
                      FinancialLine(
                        'Plan history',
                        session.hideAmounts ? 'Amounts hidden' : h,
                      ),
                  ],
                ),
              ),
            ),
            'card/installments',
          ),
        ),
      ],
    );
  }
}
