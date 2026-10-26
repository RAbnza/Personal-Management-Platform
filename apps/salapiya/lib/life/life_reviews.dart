import 'package:flutter/material.dart';

import '../features/common/prototype_form.dart';
import '../features/finance/presentation/financial_widgets.dart';
import '../local/local_store.dart';
import '../prototype/scenarios.dart';
import 'life_controller.dart';
import 'life_domain.dart';
import 'life_form.dart';

class LifeReviews extends StatelessWidget {
  const LifeReviews({super.key, required this.session});
  final PrototypeSession session;
  @override
  Widget build(BuildContext context) {
    final c = session.life as DurableLifeController;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final row in c.intents.where(
          (r) => r['resolved_at'] == null && r['state'] == 'review',
        ))
          Builder(
            builder: (context) {
              final original = LifeCommand.decode(
                    row['id'] as String,
                    row['payload'] as String,
                  ),
                  current =
                      c.records[LifeCommand.decode(
                        row['id'] as String,
                        row['payload'] as String,
                      ).recordId];
              return ExpansionTile(
                key: PageStorageKey('life-review-${original.id}'),
                title: Text('Review retained ${original.type.name} edit'),
                subtitle: Text(row['reason'] as String? ?? 'Sources changed'),
                children: [
                  const FinanceNotice(
                    'The original command and rejected receipt remain unchanged. Review both versions before creating a separate command. Unrelated records can continue synchronizing.',
                  ),
                  for (final value in original.fields.entries)
                    FinancialLine(
                      value.key,
                      session.hideAmounts &&
                              ['salaryMin', 'salaryMax'].contains(value.key)
                          ? 'Current: Hidden\nRetained edit: Hidden'
                          : 'Current: ${current?.fields[value.key] ?? 'unavailable'}\nRetained edit: ${value.value}',
                    ),
                  if (current != null || original.expectedVersion == 0)
                    TextButton(
                      onPressed: () => lifeReviewForm(
                        context,
                        session,
                        title: 'Review retained Life edit',
                        draftKey: 'review:${original.id}',
                        sourceId: current?.id,
                        fields: [
                          for (final value in original.fields.entries)
                            DemoField(
                              value.key,
                              value.key,
                              value: value.value,
                              required: false,
                              lines:
                                  ['notes', 'description'].contains(value.key)
                                  ? 3
                                  : 1,
                            ),
                          const DemoField(
                            'reason',
                            'Reason for applying this reviewed edit',
                          ),
                        ],
                        save: (values) async {
                          final command = LifeCommand(
                            id: values['__command'],
                            owner: c.store.owner,
                            recordId: original.recordId,
                            type: original.type,
                            expectedVersion: int.parse(
                              values['__version'] ?? '0',
                            ),
                            fields: {
                              for (final key in original.fields.keys)
                                key: values[key]!,
                            },
                            reason: values['reason']!,
                            recordedAt: DateTime.parse(values['__recordedAt']!),
                          );
                          await c.store.commitLife(
                            command,
                            draft: values['__draft'],
                          );
                          await c.store.resolveLifeReview(
                            original.id,
                            command.id,
                          );
                          await c.reload();
                        },
                      ),
                      child: const Text('Review as a separate edit'),
                    ),
                  TextButton(
                    onPressed: () => lifeAction(context, () async {
                      await c.store.resolveLifeReview(original.id, null);
                      await c.reload();
                    }),
                    child: const Text(
                      'Keep current record; retain rejected evidence',
                    ),
                  ),
                ],
              );
            },
          ),
      ],
    );
  }
}
