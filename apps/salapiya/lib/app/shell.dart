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
import '../features/finance/contracts/financial_models.dart';
import '../features/finance/presentation/financial_editor.dart';
import '../features/finance/presentation/financial_widgets.dart';
import '../features/finance/presentation/money_screen.dart';
import '../features/finance/presentation/debts_screen.dart';
import '../features/finance/presentation/shared_screen.dart';
import '../features/life/presentation/life_screen.dart';
import '../features/life/application/life_controller.dart';
import '../local/local_profile_view.dart';
import '../local/local_finance_controller.dart';
import '../finance/finance_screen.dart';
import '../finance/debt_screen.dart';
import '../life/life_controller.dart';

class SalapiyaShell extends StatefulWidget {
  const SalapiyaShell({super.key, required this.settings, this.session});
  final GallerySettings settings;
  final PrototypeSession? session;
  @override
  State<SalapiyaShell> createState() => _SalapiyaShellState();
}

class _SalapiyaShellState extends State<SalapiyaShell> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final life = session.life;
      if (life is DurableLifeController && life.device != null) {
        life.device!.navigate = (item) {
          if (!mounted) return;
          if (item == null) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text(
                  'This reminder source changed or is no longer available. Open Life to review current commitments.',
                ),
              ),
            );
            return;
          }
          openLifeSource(context, session, item);
        };
        life.device!.openPendingTap();
      }
    });
  }

  late final PrototypeSession session = widget.session ?? PrototypeSession();
  final scrolls = [for (final _ in AppDestination.values) ScrollController()];
  AppDestination selected = AppDestination.overview;
  bool? expanded;
  bool opening = false;
  double dockHeight = 112;
  @override
  void dispose() {
    final life = session.life;
    if (life is DurableLifeController) life.device?.navigate = null;
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

  void source(PreviewSource source) {
    if (session.production &&
        ![
          PreviewSource.accounts,
          PreviewSource.activity,
          PreviewSource.cards,
          PreviewSource.planning,
          PreviewSource.reports,
          PreviewSource.electricity,
          PreviewSource.debt,
          PreviewSource.debtHistory,
          PreviewSource.group,
          PreviewSource.settlement,
          PreviewSource.privateReview,
          PreviewSource.agenda,
          PreviewSource.task,
          PreviewSource.learning,
          PreviewSource.books,
          PreviewSource.career,
        ].contains(source)) {
      open(
        FinancePage(title: source.label, child: UpcomingView(source.label)),
        'upcoming/${source.name}',
      );
      return;
    }
    open(switch (source) {
      PreviewSource.accounts ||
      PreviewSource.activity ||
      PreviewSource.cards ||
      PreviewSource.planning ||
      PreviewSource.reports ||
      PreviewSource.electricity => FinancePage(
        title: source.label,
        child: MoneyScreen(
          session: session,
          initial:
              source == PreviewSource.planning ||
                  source == PreviewSource.electricity
              ? 'Planning'
              : source == PreviewSource.reports
              ? 'Reports'
              : source == PreviewSource.cards
              ? 'Cards'
              : source == PreviewSource.activity
              ? 'Activity'
              : 'Accounts',
        ),
      ),
      PreviewSource.debt || PreviewSource.debtHistory => FinancePage(
        title: 'Debts',
        child: DebtsScreen(session: session),
      ),
      PreviewSource.group ||
      PreviewSource.settlement ||
      PreviewSource.privateReview => FinancePage(
        title: source.label,
        child: SharedScreen(
          session: session,
          initial: source == PreviewSource.settlement
              ? 'Payments'
              : source == PreviewSource.privateReview
              ? 'Private review'
              : 'Bills',
        ),
      ),
      _ => FinancePage(
        title: source.label,
        child: LifeScreen(
          session: session,
          initial: switch (source) {
            PreviewSource.task => 'Tasks',
            PreviewSource.learning => 'Learning',
            PreviewSource.books => 'Books',
            PreviewSource.career => 'Career',
            _ => 'Calendar',
          },
        ),
      ),
    }, '${source.destination.name}/${source.name}');
  }

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
      for (final definition in definitions.where(
        (d) =>
            !session.production ||
            [
              'Add expense',
              'Record income',
              'Transfer money',
              'Record payment',
              'Record debt payment',
              'Add existing debt',
              'Record borrowing',
              'Add task',
              'Add event',
            ].contains(d.$1),
      ))
        FloatingQuickAction(
          label: definition.$1,
          icon: definition.$2,
          onSelected: () {
            if (definition.$1 == 'Add task') {
              editLifeEntry(context, session, LifeKind.task);
            } else if (definition.$1 == 'Add event') {
              editPersonalEvent(context, session);
            } else {
              open(actionPage(definition.$1), 'action/${definition.$1}');
            }
          },
        ),
    ];
  }

  Widget actionPage(String label) {
    if (session.production &&
        [
          'Record payment',
          'Record debt payment',
          'Add existing debt',
          'Record borrowing',
        ].contains(label)) {
      return NativeFinanceEditor(
        controller: session.finance as LocalFinancialController,
        operation: switch (label) {
          'Add existing debt' => 'debtImport',
          'Record borrowing' => 'borrowing',
          _ => 'debtPayment',
        },
        title: label,
      );
    }
    final action = switch (label) {
      'Add expense' => FinancialAction.expense,
      'Record income' => FinancialAction.income,
      'Transfer money' => FinancialAction.transfer,
      'Record payment' || 'Record debt payment' => FinancialAction.debtPayment,
      'Add existing debt' => FinancialAction.debtImport,
      'Record borrowing' => FinancialAction.borrowing,
      'Add shared expense' => FinancialAction.sharedBill,
      'Report payment' => FinancialAction.settlement,
      _ => null,
    };
    if (action == null) return DemoActionPage(label: label);
    if (!session.complete) {
      return const DemoPage(
        title: 'History unavailable',
        child: Text(
          'Complete the demo snapshot before recording financial actions. Your balances are not known yet.',
        ),
      );
    }
    return FinancialEditor(controller: session.finance, action: action);
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
        final canExpand = bounds.maxWidth >= 1000;
        final isExpanded = canExpand && (expanded ?? !widget.settings.compact);
        final showDock = mobile && MediaQuery.viewInsetsOf(context).bottom == 0;
        return Scaffold(
          body: SafeArea(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Stable Row/Expanded ancestry preserves destination controllers on resize.
                if (rail)
                  ShellSidebar(
                    profileName: session.profile.name,
                    production: session.production,
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
                            if (!mobile)
                              PopupMenuButton<int>(
                                tooltip: 'Quick actions',
                                onSelected: (i) => actions[i].onSelected(),
                                itemBuilder: (_) => [
                                  for (var i = 0; i < actions.length; i++)
                                    PopupMenuItem(
                                      value: i,
                                      child: ListTile(
                                        leading: Icon(actions[i].icon),
                                        title: Text(actions[i].label),
                                      ),
                                    ),
                                ],
                                child: const Padding(
                                  padding: EdgeInsets.symmetric(
                                    horizontal: 12,
                                    vertical: 10,
                                  ),
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Icon(Icons.add, size: 18),
                                      SizedBox(width: 6),
                                      Text('Create'),
                                      Icon(Icons.expand_more, size: 18),
                                    ],
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
                            session.production
                                ? session.local
                                      ? 'LOCAL ONLY · encrypted on this device · available offline'
                                      : '${session.syncLabel} · encrypted on this device'
                                : 'DEMO · synthetic data · ${session.syncLabel}',
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
                                        bounds.maxWidth >= 1200 ? 24 : 16,
                                        bounds.maxWidth >= 1200 ? 24 : 16,
                                        bounds.maxWidth >= 1200 ? 24 : 16,
                                        (showDock ? dockHeight : 0) + 24,
                                      ),
                                      child:
                                          destination == AppDestination.overview
                                          ? Overview(
                                              session: session,
                                              open: source,
                                            )
                                          : destination == AppDestination.money
                                          ? MoneyScreen(
                                              key: ObjectKey(session.finance),
                                              session: session,
                                            )
                                          : destination == AppDestination.shared
                                          ? SharedScreen(session: session)
                                          : session.production &&
                                                destination ==
                                                    AppDestination.debts
                                          ? NativeDebtsScreen(
                                              controller:
                                                  session.finance
                                                      as LocalFinancialController,
                                            )
                                          : session.production &&
                                                destination ==
                                                    AppDestination.life
                                          ? LifeScreen(session: session)
                                          : destination == AppDestination.debts
                                          ? DebtsScreen(session: session)
                                          : destination == AppDestination.shared
                                          ? SharedScreen(session: session)
                                          : LifeScreen(session: session),
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
