import 'package:flutter/material.dart';

import '../design_system/components.dart';
import '../design_system/theme.dart';
import '../design_system/navigation.dart';
import '../design_system/craft.dart';
import '../design_system/floating_actions.dart';

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
  String quickResult = 'Choose an action to preview its demo-only outcome.';
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
          return LatticeFrame(
            raised: capsule,
            radius: capsule ? Space.floatingRadius : Space.cardRadius,
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
        'Component studies only. Android B is selected; final application-shell validation belongs to D2.',
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
              'Android B · floating · selected',
              caption: 'Five destinations, with a separate + for quick actions. Demo only.',
            ),
            StatusNotice(quickResult, live: true),
            const SizedBox(height: 12),
            Align(
              alignment: Alignment.centerRight,
              child: FloatingActionMenu(
                actions: [
                  for (final item in const [
                    ('Add expense', Icons.remove_circle_outline),
                    ('Record income', Icons.add_circle_outline),
                    ('Transfer money', Icons.swap_horiz_outlined),
                    ('Record debt payment', Icons.handshake_outlined),
                    ('Add shared expense', Icons.people_outline),
                    ('Add task', Icons.check_circle_outline),
                  ])
                    FloatingQuickAction(
                      label: item.$1,
                      icon: item.$2,
                      onSelected: () => setState(() {
                        quickResult =
                            '${item.$1} specimen only — no record created.';
                      }),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            destinations(capsule: true),
          ],
        ),
      ),
      const SizedBox(height: 24),
      ExpansionTile(
        key: const PageStorageKey('historical-android-a'),
        title: const Text('Android A · historical comparison'),
        subtitle: const Text(
          'Superseded by the owner’s D1 review. No second production navigation.',
        ),
        children: [
          CraftPanel(
            padding: 12,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
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
        ],
      ),
    ],
  );
}
