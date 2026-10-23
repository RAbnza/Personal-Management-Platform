import 'package:flutter/material.dart';

import '../design_system/craft.dart';
import '../design_system/editorial.dart';
import '../design_system/floating_actions.dart';
import '../design_system/navigation.dart';
import '../design_system/theme.dart';
import '../prototype/scenarios.dart';

IconData destinationIcon(AppDestination destination) => switch (destination) {
  AppDestination.overview => Icons.grid_view_rounded,
  AppDestination.money => Icons.account_balance_wallet_outlined,
  AppDestination.debts => Icons.receipt_long_outlined,
  AppDestination.shared => Icons.people_outline,
  AppDestination.life => Icons.spa_outlined,
};

class ShellSidebar extends StatelessWidget {
  const ShellSidebar({
    super.key,
    required this.selected,
    required this.expanded,
    required this.select,
    required this.toggle,
    required this.utilities,
  });
  final AppDestination selected;
  final bool expanded;
  final ValueChanged<AppDestination> select;
  final VoidCallback toggle, utilities;
  @override
  Widget build(BuildContext context) => Theme(
    data: SalapiyaTheme.build(Brightness.dark),
    child: Container(
      width: expanded ? 220 : 84,
      color: Palette.ink,
      padding: const EdgeInsets.fromLTRB(12, 24, 12, 12),
      child: Column(
        children: [
          if (expanded)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 4, 12, 26),
              child: Image.asset(
                'assets/branding/display/salapiya_horizontal_on_dark.png',
                width: 170,
                semanticLabel: 'Salapiya',
              ),
            )
          else
            const Padding(
              padding: EdgeInsets.only(bottom: 24),
              child: BrandMark(size: 40),
            ),
          Expanded(
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (expanded)
                    const Padding(
                      padding: EdgeInsets.fromLTRB(16, 4, 0, 16),
                      child: Eyebrow('YOUR SPACE', color: Color(0xFFBDB9C5)),
                    ),
                  for (final destination in AppDestination.values)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: _NavItem(
                        key: ValueKey('nav-${destination.name}'),
                        destination: destination,
                        selected: selected == destination,
                        compact: !expanded,
                        onPressed: () => select(destination),
                      ),
                    ),
                ],
              ),
            ),
          ),
          if (expanded &&
              MediaQuery.sizeOf(context).height >= 800 &&
              MediaQuery.textScalerOf(context).scale(14) <= 17)
            const Padding(
              padding: EdgeInsets.fromLTRB(16, 16, 16, 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.wb_sunny_outlined, color: Palette.mint, size: 24),
                  SizedBox(height: 12),
                  Text(
                    'A little clarity.\nA lot more freedom.',
                    style: TextStyle(
                      fontFamily: 'Geist',
                      color: Palette.lilac,
                      fontSize: 19,
                      height: 1.35,
                    ),
                  ),
                  SizedBox(height: 12),
                  Text(
                    'Your money, on your terms.',
                    style: TextStyle(color: Color(0xFFBDB9C5), fontSize: 11),
                  ),
                ],
              ),
            ),
          const Divider(color: Color(0xFF46414E)),
          if (expanded)
            TextButton(
              onPressed: utilities,
              child: const Row(
                children: [
                  CircleAvatar(
                    radius: 17,
                    backgroundColor: Palette.mint,
                    child: Text(
                      'A',
                      style: TextStyle(color: Palette.ink, fontSize: 12),
                    ),
                  ),
                  SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Amihan', style: TextStyle(color: Colors.white)),
                        Text(
                          'Demo profile',
                          style: TextStyle(color: Palette.lilac, fontSize: 11),
                        ),
                      ],
                    ),
                  ),
                  Icon(Icons.tune, size: 17),
                ],
              ),
            )
          else
            IconButton(
              tooltip: 'Profile & utilities',
              onPressed: utilities,
              icon: const Icon(Icons.tune),
            ),
          IconButton(
            tooltip: expanded ? 'Collapse sidebar' : 'Expand sidebar',
            onPressed: toggle,
            icon: Icon(
              expanded
                  ? Icons.keyboard_double_arrow_left
                  : Icons.keyboard_double_arrow_right,
              size: 18,
            ),
          ),
        ],
      ),
    ),
  );
}

class _NavItem extends StatelessWidget {
  const _NavItem({
    super.key,
    required this.destination,
    required this.selected,
    required this.onPressed,
    this.compact = false,
  });
  final AppDestination destination;
  final bool selected, compact;
  final VoidCallback onPressed;
  @override
  Widget build(BuildContext context) => Semantics(
    selected: selected,
    child: Tooltip(
      message: destination.label,
      child: TextButton(
        onPressed: onPressed,
        style: TextButton.styleFrom(
          minimumSize: const Size(48, 52),
          alignment: compact ? Alignment.center : Alignment.centerLeft,
          padding: EdgeInsets.symmetric(
            horizontal: compact ? 0 : 16,
            vertical: 14,
          ),
          backgroundColor: selected ? Palette.lilac : Colors.transparent,
          foregroundColor: selected ? Palette.ink : const Color(0xFFCAC7D0),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
        ),
        child: compact
            ? Icon(
                destinationIcon(destination),
                semanticLabel: destination.label,
                size: 21,
              )
            : Row(
                children: [
                  Icon(destinationIcon(destination), size: 20),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      destination.label,
                      style: const TextStyle(fontSize: 13),
                    ),
                  ),
                  if (selected) const Icon(Icons.north_east, size: 14),
                ],
              ),
      ),
    ),
  );
}

Future<AppDestination?> chooseDestination(
  BuildContext context,
  AppDestination selected,
) => showDialog<AppDestination>(
  context: context,
  animationStyle: MediaQuery.disableAnimationsOf(context)
      ? AnimationStyle.noAnimation
      : null,
  builder: (context) => AlertDialog(
    scrollable: true,
    title: const Text('Navigation'),
    content: SizedBox(
      width: 320,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          for (final destination in AppDestination.values)
            DestinationControl(
              label: destination.label,
              icon: destinationIcon(destination),
              selected: destination == selected,
              onPressed: () => Navigator.pop(context, destination),
            ),
        ],
      ),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: const Text('Close'),
      ),
    ],
  ),
);

class ShellBottomBar extends StatelessWidget {
  const ShellBottomBar({
    super.key,
    required this.mobile,
    required this.selected,
    required this.select,
    required this.actions,
    required this.constrained,
  });
  final bool mobile, constrained;
  final AppDestination selected;
  final ValueChanged<AppDestination> select;
  final List<FloatingQuickAction> actions;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, box) {
      final compact =
          constrained ||
          box.maxWidth < 360 ||
          MediaQuery.textScalerOf(context).scale(14) >= 21;
      final colors = CraftTheme.of(context);
      if (!mobile) {
        final labels = box.maxWidth >= 700 && !compact;
        return Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
          child: Center(
            child: Material(
              key: const ValueKey('floating-dock-surface'),
              color: colors.raised,
              elevation: CraftPreferences.effectsOf(context) ? 8 : 0,
              shadowColor: Colors.black.withValues(alpha: .22),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(36),
                side: BorderSide(color: colors.divider),
              ),
              child: Padding(
                padding: const EdgeInsets.all(6),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    for (final action in actions.take(
                      box.maxWidth >= 280 ? 2 : 0,
                    ))
                      if (labels)
                        TextButton.icon(
                          onPressed: action.onSelected,
                          icon: Icon(action.icon, size: 18),
                          label: Text(action.label),
                        )
                      else
                        IconButton(
                          tooltip: action.label,
                          onPressed: action.onSelected,
                          icon: Icon(action.icon, size: 20),
                        ),
                    if (box.maxWidth >= 280)
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 6),
                        child: SizedBox(
                          height: 24,
                          child: VerticalDivider(
                            width: 1,
                            color: colors.divider,
                          ),
                        ),
                      ),
                    FloatingActionMenu(actions: actions),
                  ],
                ),
              ),
            ),
          ),
        );
      }
      return Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 16),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 480),
            child: Container(
              key: const ValueKey('floating-dock-surface'),
              padding: const EdgeInsets.all(4),
              decoration: BoxDecoration(
                color: Palette.ink,
                borderRadius: BorderRadius.circular(30),
                boxShadow: CraftPreferences.effectsOf(context)
                    ? [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: .18),
                          blurRadius: 20,
                          offset: const Offset(0, 6),
                        ),
                      ]
                    : null,
              ),
              child: Theme(
                data: SalapiyaTheme.build(Brightness.dark),
                child: compact
                    ? Row(
                        children: [
                          Expanded(
                            child: TextButton.icon(
                              key: const ValueKey('navigation-fallback'),
                              onPressed: () async {
                                final next = await chooseDestination(
                                  context,
                                  selected,
                                );
                                if (next != null) select(next);
                              },
                              icon: const Icon(Icons.menu),
                              label: const Text('Navigation'),
                            ),
                          ),
                          FloatingActionMenu(actions: actions),
                        ],
                      )
                    : Row(
                        children: [
                          for (final destination in AppDestination.values)
                            Expanded(
                              child: _NavItem(
                                key: ValueKey('nav-${destination.name}'),
                                destination: destination,
                                selected: selected == destination,
                                compact: true,
                                onPressed: () => select(destination),
                              ),
                            ),
                          FloatingActionMenu(actions: actions),
                        ],
                      ),
              ),
            ),
          ),
        ),
      );
    },
  );
}
