import 'package:flutter/material.dart';

import '../../../design_system/form_presentation.dart';
import '../../../design_system/editorial.dart';
import '../../../local/finance_domain.dart';

/// Reads the validated plan. Never parses prose or recalculates a command.
class FinancialReview extends StatelessWidget {
  const FinancialReview({
    super.key,
    required this.plan,
    required this.snapshot,
    required this.amount,
    this.hidden = false,
    this.commandId,
    this.details = const {},
  });
  final LocalPlan plan;
  final LocalSnapshot snapshot;
  final String Function(BigInt) amount;
  final bool hidden;
  final String? commandId;
  final Map<String, String> details;

  static const labels = {
    'cash': 'Cash movement',
    'expense': 'Recognized expense',
    'income': 'Recognized income',
    'card_liability': 'Card liability',
    'debt_liability': 'Debt liability',
    'receivable': 'Receivable',
    'shared_receivable': 'Private shared receivable',
    'shared_payable': 'Private shared payable',
    'payable': 'Payable',
    'equity': 'Opening / adjustment equity',
    'private_clearing': 'Private clearing',
  };
  static const credits = {
    'income',
    'card_liability',
    'debt_liability',
    'payable',
    'shared_payable',
    'equity',
  };

  String accountName(String id) => plan.account?.id == id
      ? plan.account!.name
      : snapshot.accounts.where((a) => a.id == id).firstOrNull?.name ?? id;

  Widget posting(LocalPosting p) {
    final known = labels.containsKey(p.ledger);
    final value = credits.contains(p.ledger) ? -p.amount : p.amount;
    final category = snapshot.categories
        .where((c) => c.id == p.category)
        .firstOrNull
        ?.name;
    return ReviewRow(
      labels[p.ledger] ?? p.ledger.replaceAll('_', ' '),
      hidden
          ? 'Amounts hidden'
          : known
          ? '${value.isNegative ? 'Decreases by' : 'Increases by'} ${amount(value.abs())}'
          : '${amount(p.amount)} · signed posting',
      detail: [
        if (p.account != null) accountName(p.account!),
        ?category,
        p.date,
      ].join(' · '),
    );
  }

  @override
  Widget build(BuildContext context) {
    final r = plan.revision;
    final prior = r?.previous == null
        ? null
        : snapshot.revisions.where((x) => x.id == r!.previous).firstOrNull;
    final generated = <String>{
      for (final p in r?.postings ?? <LocalPosting>[]) ...[
        '${p.ledger.replaceAll('_', ' ')}: ${phpDecimal(p.amount)} PHP on ${p.date}.',
        if (p.account != null)
          '${accountName(p.account!)}: ${phpDecimal(p.amount)} PHP on ${p.date}.',
        if (p.category != null)
          '${p.ledger == 'income' ? 'Recognized income' : 'Recognized spending'} · ${snapshot.categories.where((c) => c.id == p.category).firstOrNull?.name}: ${phpDecimal(p.ledger == 'income' ? -p.amount : p.amount)} PHP on ${p.date}.',
      ],
    };
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (r != null) ...[
          ReviewRow(
            r.title,
            hidden
                ? 'Amounts hidden'
                : r.postings.isEmpty && r.amount == BigInt.zero
                ? 'Evidence / plan'
                : amount(r.amount),
            emphasis: true,
            detail: 'Transaction date · ${r.date}',
          ),
          for (final key in ['card', 'debt', 'destination'])
            if (r.values[key] case final String id when id.isNotEmpty)
              ReviewRow(
                switch (key) {
                  'card' => 'Card',
                  'debt' => 'Debt',
                  _ => 'Destination',
                },
                snapshot.revisions
                        .where((x) => x.actionId == id || x.id == id)
                        .lastOrNull
                        ?.title ??
                    snapshot.accounts
                        .where((x) => x.id == id)
                        .firstOrNull
                        ?.name ??
                    id,
              ),
          const Divider(height: 24),
          SectionHeading(
            r.change == 'replace'
                ? 'Replacement effects'
                : r.change == 'reverse'
                ? 'Effects being removed'
                : 'Financial effects',
          ),
          if (prior != null) ...[
            Text(
              r.change == 'reverse'
                  ? 'The original effects below are removed at their original dates. Every revision stays in history.'
                  : 'These values replace the previous effects; they are not an additional transaction.',
            ),
            if (r.change == 'replace') ...[
              const SizedBox(height: 12),
              const SectionHeading('Previous effects'),
            ],
            for (final p in prior.postings) posting(p),
            if (r.change == 'replace') const SectionHeading('New effects'),
          ],
          for (final p in r.postings) posting(p),
          if (prior == null && !r.postings.any((p) => p.ledger == 'cash'))
            const ReviewRow('Cash movement', 'None'),
        ],
        if (!hidden && details.isNotEmpty) ...[
          const SectionHeading('Reviewed details'),
          for (final entry in details.entries)
            ReviewRow(entry.key, entry.value),
        ],
        if (hidden)
          const Text('Financial review amounts hidden.')
        else
          ReviewNotes(plan.effects.where((e) => !generated.contains(e))),
        FormEvidence(
          title: 'View financial evidence',
          children: [
            if (commandId != null)
              SelectableText('Original command: $commandId'),
            if (r != null)
              SelectableText(
                'Revision: ${r.number}\nPrevious: ${r.previous ?? 'None'}\nSource: ${r.source ?? 'None'}',
              ),
            if (!hidden)
              for (final effect in plan.effects) SelectableText(effect),
          ],
        ),
      ],
    );
  }
}
