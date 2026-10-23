import 'package:flutter/material.dart';

import '../design_system/floating_actions.dart';
import '../design_system/measured_layout.dart';
import '../design_system/theme.dart';
import '../gallery/settings.dart';
import '../prototype/scenarios.dart';
import 'demo_routes.dart';
import 'overview.dart';
import 'previews.dart';
import 'profile_utilities.dart';
import 'shell_navigation.dart';

class SalapiyaShell extends StatefulWidget {
  const SalapiyaShell({super.key, required this.settings, this.session});
  final GallerySettings settings;
  final PrototypeSession? session;
  @override
  State<SalapiyaShell> createState() => _SalapiyaShellState();
}

class _SalapiyaShellState extends State<SalapiyaShell> {
  late final PrototypeSession session = widget.session ?? PrototypeSession();
  final scrolls = [for (final _ in AppDestination.values) ScrollController()];
  AppDestination selected = AppDestination.overview;
  bool? expanded;
  bool opening = false;
  double dockHeight = 112;
  @override
  void dispose() {
    for (final controller in scrolls) {
      controller.dispose();
    }
    if (widget.session == null) session.dispose();
    super.dispose();
  }

  void select(AppDestination destination) =>
      setState(() => selected = destination);
  Future<void> open(Widget page, String name) async {
    if (opening) return;
    opening = true;
    try {
      await openDemoPage<void>(context, page, name);
    } finally {
      opening = false;
    }
  }

  void source(PreviewSource source) => open(
    SourcePreviewPage(source: source, session: session),
    '${source.destination.name}/${source.name}',
  );
  void utilities() => open(
    ProfileUtilities(settings: widget.settings, session: session),
    'profile',
  );
  Future<void> navigation() async {
    final next = await chooseDestination(context, selected);
    if (next != null && mounted) select(next);
  }

  List<FloatingQuickAction> get actions {
    final definitions = switch (selected) {
      AppDestination.overview || AppDestination.money => [
        ('Add expense', Icons.remove_circle_outline),
        ('Record income', Icons.add_circle_outline),
        ('Transfer money', Icons.swap_horiz),
        ('Record debt payment', Icons.event_note_outlined),
        ('Add shared expense', Icons.people_outline),
        ('Add task', Icons.check_circle_outline),
      ],
      AppDestination.debts => [
        ('Record payment', Icons.event_note_outlined),
        ('Add existing debt', Icons.add),
        ('Record borrowing', Icons.account_balance_outlined),
      ],
      AppDestination.shared => [
        ('Add shared expense', Icons.people_outline),
        ('Report payment', Icons.payments_outlined),
      ],
      AppDestination.life => [
        ('Add task', Icons.check_circle_outline),
        ('Add event', Icons.event_outlined),
      ],
    };
    return [
      for (final definition in definitions)
        FloatingQuickAction(
          label: definition.$1,
          icon: definition.$2,
          onSelected: () => open(
            DemoActionPage(label: definition.$1),
            'action/${definition.$1}',
          ),
        ),
    ];
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: session,
    builder: (context, _) => LayoutBuilder(
      builder: (context, bounds) {
        final mobile = Theme.of(context).platform == TargetPlatform.android;
        final scale = MediaQuery.textScalerOf(context).scale(14) / 14;
        final short = bounds.maxHeight < 500;
        final rail =
            !mobile &&
            bounds.maxWidth >= 600 &&
            bounds.maxHeight >= 400 &&
            scale <= 1.5;
        final canExpand = bounds.maxWidth >= 1200;
        final isExpanded = canExpand && (expanded ?? true);
        final showDock =
            !mobile || MediaQuery.viewInsetsOf(context).bottom == 0;
        return Scaffold(
          body: SafeArea(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Stable Row/Expanded ancestry preserves destination controllers on resize.
                if (rail)
                  ShellSidebar(
                    selected: selected,
                    expanded: isExpanded,
                    select: select,
                    toggle: () {
                      if (canExpand) {
                        setState(() => expanded = !isExpanded);
                      } else {
                        navigation();
                      }
                    },
                    utilities: utilities,
                  )
                else
                  const SizedBox.shrink(),
                Expanded(
                  child: Column(
                    children: [
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 8, 12, 0),
                        child: Row(
                          children: [
                            if (!mobile && !rail)
                              IconButton(
                                tooltip: 'Navigation · 5 destinations',
                                onPressed: navigation,
                                icon: const Icon(Icons.menu),
                              ),
                            Expanded(
                              child: Semantics(
                                header: true,
                                child: mobile
                                    ? Align(
                                        alignment: Alignment.centerLeft,
                                        child: Image.asset(
                                          'assets/branding/display/salapiya_horizontal_on_${CraftTheme.of(context).dark ? 'dark' : 'light'}.png',
                                          width: 128,
                                          semanticLabel:
                                              'Salapiya · ${selected.label}',
                                        ),
                                      )
                                    : Text(
                                        'My space / ${selected.label}',
                                        style: TextStyle(
                                          fontSize: 13,
                                          color: CraftTheme.of(context)
                                              .secondary,
                                        ),
                                      ),
                              ),
                            ),
                            IconButton(
                              tooltip: session.hideAmounts
                                  ? 'Show amounts'
                                  : 'Hide amounts',
                              onPressed: session.togglePrivacy,
                              icon: Icon(
                                session.hideAmounts
                                    ? Icons.visibility_off_outlined
                                    : Icons.visibility_outlined,
                              ),
                            ),
                            IconButton(
                              tooltip: 'Profile & utilities',
                              onPressed: utilities,
                              icon: const Icon(Icons.account_circle_outlined),
                            ),
                          ],
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                        child: Align(
                          alignment: Alignment.centerLeft,
                          child: Text(
                            'DEMO · synthetic data · ${session.syncLabel}',
                            style: TextStyle(
                              fontSize: 11,
                              color: CraftTheme.of(context).secondary,
                            ),
                          ),
                        ),
                      ),
                      Expanded(
                        child: Stack(
                          fit: StackFit.expand,
                          children: [
                            IndexedStack(
                              index: selected.index,
                              sizing: StackFit.expand,
                              children: [
                                for (final destination in AppDestination.values)
                                  Scrollbar(
                                    controller: scrolls[destination.index],
                                    child: SingleChildScrollView(
                                      key: PageStorageKey(
                                        'destination-${destination.name}',
                                      ),
                                      controller: scrolls[destination.index],
                                      padding: EdgeInsets.fromLTRB(
                                        bounds.maxWidth >= 1200 ? 32 : 16,
                                        bounds.maxWidth >= 1200 ? 32 : 16,
                                        bounds.maxWidth >= 1200 ? 32 : 16,
                                        (showDock ? dockHeight : 0) + 24,
                                      ),
                                      child:
                                          destination == AppDestination.overview
                                          ? Overview(
                                              session: session,
                                              open: source,
                                            )
                                          : DestinationPreview(
                                              destination: destination,
                                              session: session,
                                              open: source,
                                            ),
                                    ),
                                  ),
                              ],
                            ),
                            // The scroll viewport extends behind the dock. Only its
                            // trailing content padding reserves final-item clearance.
                            if (showDock)
                              Positioned(
                                left: 0,
                                right: 0,
                                bottom: 0,
                                child: MeasureSize(
                                  onChanged: (size) {
                                    if (mounted && dockHeight != size.height) {
                                      setState(() => dockHeight = size.height);
                                    }
                                  },
                                  child: ShellBottomBar(
                                    mobile: mobile,
                                    selected: selected,
                                    select: select,
                                    actions: actions,
                                    constrained: short,
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        );
      },
    ),
  );
}
