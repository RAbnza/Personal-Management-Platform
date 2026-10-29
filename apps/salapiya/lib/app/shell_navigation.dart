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
    this.profileName = 'Amihan',
    this.production = false,
  });
  final AppDestination selected;
  final String profileName;
  final bool expanded, production;
  final ValueChanged<AppDestination> select;
  final VoidCallback toggle, utilities;
  @override
  Widget build(BuildContext context) {
    final c = CraftTheme.of(context);
    return Container(
      width: expanded ? 204 : 76,
      decoration: BoxDecoration(
        color: c.surface,
        border: Border(right: BorderSide(color: c.divider)),
      ),
      padding: const EdgeInsets.fromLTRB(12, 20, 12, 12),
      child: Column(
        children: [
          if (expanded)
            Padding(
              padding: const EdgeInsets.fromLTRB(10, 0, 10, 30),
              child: Image.asset(
                'assets/branding/display/salapiya_horizontal_on_${c.dark ? 'dark' : 'light'}.png',
                width: 146,
                semanticLabel: 'Salapiya',
              ),
            )
          else
            const Padding(
              padding: EdgeInsets.only(bottom: 24),
              child: BrandMark(size: 36),
            ),
          Expanded(
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (expanded)
                    const Padding(
                      padding: EdgeInsets.fromLTRB(12, 0, 0, 12),
                      child: Eyebrow('WORKSPACE'),
                    ),
                  for (final d in AppDestination.values)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 4),
                      child: _NavItem(
                        key: ValueKey('nav-${d.name}'),
                        destination: d,
                        selected: selected == d,
                        compact: !expanded,
                        onPressed: () => select(d),
                      ),
                    ),
                ],
              ),
            ),
          ),
          const Divider(),
          if (expanded)
            TextButton(
              onPressed: utilities,
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 15,
                    backgroundColor: c.selection,
                    foregroundColor: c.primary,
                    child: Text(
                      profileName.isEmpty ? '?' : profileName.substring(0, 1),
                      style: const TextStyle(fontSize: 12),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          profileName,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(color: c.text),
                        ),
                        Text(
                          production ? 'Profile & settings' : 'Demo profile',
                          style: TextStyle(color: c.secondary, fontSize: 11),
                        ),
                      ],
                    ),
                  ),
                  const Icon(Icons.tune, size: 16),
                ],
              ),
            )
          else
            IconButton(
              tooltip: 'Profile & utilities',
              onPressed: utilities,
              icon: const Icon(Icons.tune),
            ),
          Align(
            alignment: expanded ? Alignment.centerRight : Alignment.center,
            child: IconButton(
              tooltip: expanded ? 'Collapse sidebar' : 'Expand sidebar',
              onPressed: toggle,
              icon: Icon(
                expanded
                    ? Icons.keyboard_double_arrow_left
                    : Icons.keyboard_double_arrow_right,
                size: 18,
              ),
            ),
          ),
        ],
      ),
    );
  }
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
          minimumSize: const Size(48, 48),
          alignment: compact ? Alignment.center : Alignment.centerLeft,
          padding: EdgeInsets.symmetric(
            horizontal: compact ? 0 : 16,
            vertical: 10,
          ),
          backgroundColor: selected
              ? CraftTheme.of(context).selection
              : Colors.transparent,
          foregroundColor: selected
              ? CraftTheme.of(context).primary
              : CraftTheme.of(context).secondary,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
          ),
        ),
        child: compact
            ? Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    destinationIcon(destination),
                    semanticLabel: destination.label,
                    size: 21,
                  ),
                  if (Theme.of(context).platform == TargetPlatform.android) ...[
                    const SizedBox(height: 4),
                    Text(
                      destination == AppDestination.shared
                          ? 'Shared'
                          : destination.label,
                      style: const TextStyle(fontSize: 10),
                    ),
                  ],
                ],
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
      return Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 16),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 480),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Padding(
                  padding: const EdgeInsets.only(bottom: 8, right: 4),
                  child: FloatingActionMenu(actions: actions),
                ),
                Container(
                  key: const ValueKey('floating-dock-surface'),
                  padding: const EdgeInsets.all(6),
                  decoration: BoxDecoration(
                    color: colors.surface,
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
                    data: Theme.of(context),
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
                            ],
                          ),
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    },
  );
}
