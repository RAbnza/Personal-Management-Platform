import 'package:flutter/material.dart';

import '../design_system/components.dart';
import '../design_system/theme.dart';
import '../design_system/navigation.dart';

const specimenDestinations = <(String, IconData)>[
  ('Overview', Icons.dashboard_outlined),
  ('Money', Icons.account_balance_wallet_outlined),
  ('Debts', Icons.handshake_outlined),
  ('Shared Expenses', Icons.people_outline),
  ('Life', Icons.calendar_today_outlined),
];

class NavigationStudy extends StatefulWidget {
  const NavigationStudy({super.key, required this.compact});
  final bool compact;
  @override
  State<NavigationStudy> createState() => _NavigationStudyState();
}

class _NavigationStudyState extends State<NavigationStudy> {
  int selected = 0;
  bool shelf = false;
  void select(int i) => setState(() => selected = i);
  Widget destinations({bool rail = false, bool capsule = false}) =>
      LayoutBuilder(
        builder: (context, box) {
          // Labels remain available at narrow widths and enlarged text; never squeeze five labels.
          final stacked =
              rail ||
              box.maxWidth < 296 ||
              MediaQuery.textScalerOf(context).scale(14) > 18;
          final children = [
            for (var i = 0; i < specimenDestinations.length; i++)
              DestinationControl(
                label: specimenDestinations[i].$1,
                icon: specimenDestinations[i].$2,
                selected: selected == i,
                compact: rail && widget.compact,
                vertical: !stacked,
                onPressed: () => select(i),
              ),
          ];
          return Container(
            decoration: BoxDecoration(
              color: CraftTheme.of(context).surface,
              border: Border.all(color: CraftTheme.of(context).divider),
              borderRadius: BorderRadius.circular(capsule ? 28 : 12),
            ),
            padding: const EdgeInsets.all(8),
            child: stacked
                ? Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: children,
                  )
                : Row(
                    children: [
                      for (final child in children) Expanded(child: child),
                    ],
                  ),
          );
        },
      );
  void action(String name) => ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(content: Text('$name specimen only — no record created.')),
  );
  Widget dock() => Wrap(
    spacing: 8,
    runSpacing: 8,
    children: [
      OutlinedButton.icon(
        onPressed: () => action('Expense'),
        icon: const Icon(Icons.remove),
        label: const Text('Expense'),
      ),
      OutlinedButton.icon(
        onPressed: () => action('Transfer'),
        icon: const Icon(Icons.swap_horiz),
        label: const Text('Transfer'),
      ),
      const OutlinedButton(onPressed: null, child: Text('Unavailable action')),
    ],
  );
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      const StatusNotice(
        'Component studies only. Both Android concepts remain open for D2 interaction testing.',
        tone: NoticeTone.information,
      ),
      const SizedBox(height: 24),
      AdaptivePair(
        children: [
          CraftPanel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const SectionTitle(
                  'Windows rail',
                  caption: 'Use Compact specimens in viewing preferences to compare icon mode.',
                ),
                Align(
                  alignment: Alignment.centerLeft,
                  child: SizedBox(
                    width: widget.compact ? 80 : 240,
                    child: destinations(rail: true),
                  ),
                ),
              ],
            ),
          ),
          CraftPanel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SectionTitle(
                  'Contextual action dock',
                  caption: 'A bounded tool tray, separate from destination navigation.',
                ),
                dock(),
                const SizedBox(height: 16),
                Text(
                  'Selected destination: ${specimenDestinations[selected].$1}',
                ),
              ],
            ),
          ),
        ],
      ),
      const SizedBox(height: 24),
      CraftPanel(
        padding: 12,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const SectionTitle(
              'Android A · anchored',
              caption: 'Five destinations; Add occupies its own row. Narrow/large-text study uses the labeled fallback list.',
            ),
            Center(
              child: FilledButton.icon(
                onPressed: () => action('Add'),
                icon: const Icon(Icons.add),
                label: const Text('Add'),
              ),
            ),
            const SizedBox(height: 12),
            destinations(),
          ],
        ),
      ),
      const SizedBox(height: 24),
      CraftPanel(
        padding: 12,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const SectionTitle(
              'Android B · floating',
              caption:
                  'Inset navigation with a separate, expandable action shelf.',
            ),
            Align(
              alignment: Alignment.centerRight,
              child: OutlinedButton.icon(
                onPressed: () => setState(() => shelf = !shelf),
                icon: Icon(shelf ? Icons.expand_less : Icons.expand_more),
                label: const Text('Quick actions'),
              ),
            ),
            if (shelf)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: dock(),
              ),
            const SizedBox(height: 12),
            destinations(capsule: true),
          ],
        ),
      ),
    ],
  );
}
