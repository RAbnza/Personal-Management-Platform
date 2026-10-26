import 'package:flutter/material.dart';

import '../features/finance/presentation/financial_widgets.dart';
import 'life_controller.dart';
import 'life_domain.dart';

class LifeHistory extends StatefulWidget {
  const LifeHistory({
    super.key,
    required this.controller,
    required this.record,
    this.hideAmounts = false,
  });
  final DurableLifeController controller;
  final String record;
  final bool hideAmounts;
  @override
  State<LifeHistory> createState() => _LifeHistoryState();
}

class _LifeHistoryState extends State<LifeHistory> {
  int page = 0;
  @override
  Widget build(BuildContext context) => FutureBuilder(
    future: widget.controller.store.db.getAll(
      'SELECT id,payload,recorded_at FROM life_revision WHERE owner_id=? AND record_id=? ORDER BY version DESC LIMIT 26 OFFSET ?',
      [widget.controller.store.owner, widget.record, page * 25],
    ),
    builder: (context, snapshot) {
      if (snapshot.hasError) {
        return const FinanceNotice(
          'History could not be loaded. Existing evidence is preserved.',
        );
      }
      if (!snapshot.hasData) return const LinearProgressIndicator();
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final row in snapshot.data!.take(25))
            Builder(
              builder: (context) {
                final c = LifeCommand.decode(
                  row['id'] as String,
                  row['payload'] as String,
                );
                return ExpansionTile(
                  key: PageStorageKey('life-history-${c.id}'),
                  title: Text('v${c.expectedVersion + 1} · ${c.reason}'),
                  subtitle: Text(
                    'Recorded ${row['recorded_at']} · preset version 1',
                  ),
                  children: [
                    FinancialLine('Original command', c.id),
                    FinancialLine(
                      'Recorded on originating device',
                      c.recordedAt.toIso8601String(),
                    ),
                    for (final value in c.fields.entries)
                      FinancialLine(
                        value.key,
                        widget.hideAmounts &&
                                ['salaryMin', 'salaryMax'].contains(value.key)
                            ? 'Hidden'
                            : value.value.isEmpty
                            ? '—'
                            : value.value,
                      ),
                  ],
                );
              },
            ),
          Wrap(
            spacing: 8,
            children: [
              TextButton(
                onPressed: page == 0 ? null : () => setState(() => page--),
                child: const Text('Newer history'),
              ),
              TextButton(
                onPressed: snapshot.data!.length < 26
                    ? null
                    : () => setState(() => page++),
                child: const Text('Older history'),
              ),
            ],
          ),
        ],
      );
    },
  );
}
