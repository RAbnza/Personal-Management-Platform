import 'package:flutter/material.dart';

import '../design_system/components.dart';
import '../design_system/measured_layout.dart';
import '../design_system/editorial.dart';
import '../design_system/theme.dart';
import '../prototype/activity.dart';
import '../prototype/fixtures.dart';
import '../prototype/scenarios.dart';
import '../local/local_finance_controller.dart';
import '../local/finance_domain.dart';

class BalanceFeature extends StatefulWidget {
  const BalanceFeature({super.key, required this.session, required this.open});
  final PrototypeSession session;
  final ValueChanged<PreviewSource> open;
  @override
  State<BalanceFeature> createState() => _BalanceFeatureState();
}

class _BalanceFeatureState extends State<BalanceFeature> {
  int selectedDay = 21;
  bool values = false;
  bool rhythmExpanded = false;
  @override
  Widget build(BuildContext context) {
    final session = widget.session;
    final available = session.complete && !session.empty;
    final visible = available && !session.hideAmounts;
    final mobile = Theme.of(context).platform == TargetPlatform.android;
    final darkTheme = SalapiyaTheme.build(Brightness.dark);
    return Theme(
      data: darkTheme,
      child: Builder(
        builder: (context) => Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            color: Palette.ink,
            gradient: CraftPreferences.effectsOf(context)
                ? const LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [
                      Color(0xFF242229),
                      Color(0xFF373040),
                      Color(0xFF514162),
                    ],
                  )
                : null,
            borderRadius: BorderRadius.circular(26),
          ),
          child: DefaultTextStyle.merge(
            style: const TextStyle(color: Palette.white),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    const Expanded(
                      child: Eyebrow('Money Today', color: Palette.lilac),
                    ),
                    const Icon(
                      Icons.account_balance_wallet_outlined,
                      color: Palette.lilac,
                      size: 20,
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                if (session.accepted != null)
                  AmountText(session.amount(session.accepted!), large: true)
                else
                  Text(
                    'Not yet available',
                    style: Theme.of(context).textTheme.headlineMedium,
                  ),
                const SizedBox(height: 6),
                Text(
                  session.local
                      ? 'Liquid balance · on this device'
                      : 'Liquid balance · accepted records',
                  style: const TextStyle(
                    color: Color(0xFFD4CDD9),
                    fontSize: 12,
                  ),
                ),
                const SizedBox(height: 12),
                if (mobile && visible)
                  TextButton.icon(
                    onPressed: () =>
                        setState(() => rhythmExpanded = !rhythmExpanded),
                    icon: Icon(
                      rhythmExpanded
                          ? Icons.expand_less
                          : Icons.bar_chart_rounded,
                      size: 18,
                    ),
                    label: Text(
                      rhythmExpanded
                          ? 'Close spending rhythm'
                          : 'Explore spending rhythm',
                    ),
                  ),
                if (visible &&
                    session.production &&
                    (!mobile || rhythmExpanded))
                  LocalSpendingRhythm(session: session)
                else if (visible &&
                    !session.production &&
                    (!mobile || rhythmExpanded)) ...[
                  Row(
                    children: [
                      const Expanded(
                        child: Text(
                          'Spending rhythm',
                          style: TextStyle(fontSize: 13),
                        ),
                      ),
                      Text(
                        '15–21 OCT',
                        style: const TextStyle(
                          color: Palette.lilac,
                          fontSize: 11,
                          letterSpacing: 1,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    '$selectedDay Oct · ${session.amount(DemoActivity.spentOn(selectedDay))} out',
                    key: const ValueKey('chart-day-value'),
                    style: const TextStyle(color: Palette.mint, fontSize: 12),
                  ),
                  const SizedBox(height: 12),
                  // Each column is a native focusable control. The exact-value list below
                  // is the nonvisual alternative; no currency is computed in doubles.
                  LayoutBuilder(
                    builder: (context, box) => SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: SizedBox(
                        width: box.maxWidth < 336 ? 336 : box.maxWidth,
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            for (var day = 15; day <= 21; day++)
                              Expanded(
                                child: Semantics(
                                  selected: day == selectedDay,
                                  child: Tooltip(
                                    message:
                                        '$day Oct · ${session.amount(DemoActivity.spentOn(day))}',
                                    child: TextButton(
                                      key: ValueKey('spending-day-$day'),
                                      style: TextButton.styleFrom(
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 7,
                                          vertical: 6,
                                        ),
                                        minimumSize: const Size(48, 48),
                                        foregroundColor: Palette.white,
                                        shape: RoundedRectangleBorder(
                                          borderRadius: BorderRadius.circular(
                                            10,
                                          ),
                                        ),
                                      ),
                                      onPressed: () =>
                                          setState(() => selectedDay = day),
                                      child: Column(
                                        children: [
                                          SizedBox(
                                            height: 64,
                                            child: Align(
                                              alignment: Alignment.bottomCenter,
                                              child: Container(
                                                width: double.infinity,
                                                height:
                                                    6 +
                                                    58 *
                                                        DemoActivity.spentOn(
                                                          day,
                                                        ).toDouble() /
                                                        DemoActivity.spentOn(19)
                                                            .toDouble(),
                                                decoration: BoxDecoration(
                                                  borderRadius:
                                                      BorderRadius.circular(7),
                                                  color: day == selectedDay
                                                      ? Palette.mint
                                                      : Palette.lilac
                                                            .withValues(
                                                              alpha: .35,
                                                            ),
                                                  border: Border.all(
                                                    color: day == selectedDay
                                                        ? Palette.mint
                                                        : Palette.lilac
                                                              .withValues(
                                                                alpha: .5,
                                                              ),
                                                  ),
                                                ),
                                              ),
                                            ),
                                          ),
                                          const SizedBox(height: 8),
                                          Text(
                                            '$day',
                                            style: TextStyle(
                                              fontSize: 11,
                                              color: day == selectedDay
                                                  ? Palette.mint
                                                  : Palette.lilac,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  Wrap(
                    alignment: WrapAlignment.spaceBetween,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      Text(
                        'Week outflow  ${session.amount(DemoActivity.outgoing)}',
                        style: const TextStyle(fontSize: 12),
                      ),
                      TextButton(
                        onPressed: () => setState(() => values = !values),
                        child: Text(
                          values ? 'Hide values' : 'View values',
                          style: const TextStyle(fontSize: 12),
                        ),
                      ),
                    ],
                  ),
                  if (values) ...[
                    for (var day = 15; day <= 21; day++)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 4),
                        child: Text(
                          '$day Oct  ·  ${session.amount(DemoActivity.spentOn(day))}',
                        ),
                      ),
                    Text(
                      'Opening liquid balance: ${session.amount(DemoActivity.opening)}\nIncome: ${session.amount(DemoActivity.incoming)}\nOutflows: ${session.amount(DemoActivity.outgoing)}',
                      style: const TextStyle(fontSize: 12),
                    ),
                  ],
                ] else if (!visible)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 24),
                    child: Text(
                      session.hideAmounts
                          ? 'Your balances and charts are hidden.'
                          : session.empty
                          ? 'Your next chapter starts with an account.'
                          : 'Your history is still downloading.',
                      style: const TextStyle(color: Palette.lilac),
                    ),
                  ),
                const Divider(color: Color(0xFF746780), height: 24),
                Text(
                  session.coverage,
                  style: const TextStyle(
                    fontSize: 11,
                    color: Color(0xFFD4CDD9),
                  ),
                ),
                const SizedBox(height: 6),
                const Text(
                  'Cash, bank & mobile wallets. Credit limits and liabilities excluded.',
                  style: TextStyle(fontSize: 11, color: Color(0xFFD4CDD9)),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class AccountWallet extends StatefulWidget {
  const AccountWallet({super.key, required this.session, required this.open});
  final PrototypeSession session;
  final ValueChanged<PreviewSource> open;
  @override
  State<AccountWallet> createState() => _AccountWalletState();
}

class _AccountWalletState extends State<AccountWallet> {
  late int selected = widget.session.production ? 0 : 1;
  late final pages = PageController(
    initialPage: widget.session.production ? 0 : 1,
  );
  @override
  void dispose() {
    pages.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final session = widget.session;

    if (session.production && session.finance.accounts.isEmpty) {
      return EditorialSurface(
        color: Palette.mint,
        child: DefaultTextStyle.merge(
          style: const TextStyle(color: Palette.ink),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SectionHeading('Your first wallet'),
              const SizedBox(height: 16),
              const Text(
                'Start with a confirmed opening balance. Your money stays on this device.',
              ),
              const SizedBox(height: 20),
              OutlinedButton(
                onPressed: () => widget.open(PreviewSource.accounts),
                child: const Text('Set up your accounts'),
              ),
            ],
          ),
        ),
      );
    }

    final mobile = Theme.of(context).platform == TargetPlatform.android;
    final wallets = session.finance.accounts.isEmpty
        ? demoAccounts
        : [
            for (final a in session.finance.accounts)
              (a.name, a.balance.toString()),
          ];
    final indexNow = selected.clamp(0, wallets.length - 1);
    Widget wallet(int index) {
      final account = wallets[index];
      return Container(
        padding: const EdgeInsets.all(22),
        decoration: BoxDecoration(
          color: Palette.mint,
          gradient: CraftPreferences.effectsOf(context)
              ? const LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [Color(0xFFE5EDCF), Color(0xFFC9DAAC)],
                )
              : null,
          borderRadius: BorderRadius.circular(22),
        ),
        child: DefaultTextStyle(
          style: const TextStyle(
            fontFamily: 'Geist',
            color: Palette.ink,
            height: 1.4,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      session.empty ? 'Your first wallet' : account.$1,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  const Icon(
                    Icons.account_balance_outlined,
                    color: Palette.ink,
                    size: 24,
                  ),
                ],
              ),
              SizedBox(height: mobile ? 12 : 24),
              Text(
                !session.complete
                    ? 'Awaiting history'
                    : session.empty
                    ? 'No account yet'
                    : session.amount(BigInt.parse(account.$2)),
                style: const TextStyle(
                  fontSize: 26,
                  letterSpacing: -.8,
                  fontFeatures: [FontFeature.tabularFigures()],
                ),
              ),
              SizedBox(height: mobile ? 12 : 20),
              Row(
                children: [
                  const Expanded(
                    child: Text(
                      'PHP / LIQUID ACCOUNT',
                      style: TextStyle(fontSize: 10, letterSpacing: 1),
                    ),
                  ),
                  const Icon(Icons.blur_on, size: 28, color: Palette.ink),
                ],
              ),
            ],
          ),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionHeading(
          'Your wallets',
          trailing: IconButton(
            tooltip: 'View accounts',
            onPressed: () => widget.open(PreviewSource.accounts),
            icon: const Icon(Icons.north_east, size: 20),
          ),
        ),
        if (session.empty)
          wallet(indexNow)
        else
          MeasuredPageView(
            key: const ValueKey('wallet-pages'),
            controller: pages,
            index: indexNow,
            itemCount: wallets.length,
            itemBuilder: (context, index) => wallet(index),
            onPageChanged: (index) => setState(() => selected = index),
          ),
        if (!session.empty)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Wrap(
              spacing: 4,
              children: [
                for (var i = 0; i < wallets.length; i++)
                  Tooltip(
                    message: wallets[i].$1,
                    child: ChoiceChip(
                      label: Text(
                        !session.production &&
                                i < 3 &&
                                wallets[i].$1 == demoAccounts[i].$1
                            ? ['Cash', 'Bank', 'Mobile'][i]
                            : wallets[i].$1,
                      ),
                      selected: indexNow == i,
                      showCheckmark: false,
                      onSelected: (_) => selectPage(context, pages, i),
                    ),
                  ),
              ],
            ),
          ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 4,
          children: [
            TextButton.icon(
              onPressed: () => widget.open(PreviewSource.accounts),
              icon: const Icon(Icons.wallet_outlined, size: 18),
              label: const Text('View accounts'),
            ),
            TextButton(
              onPressed: () => widget.open(PreviewSource.activity),
              child: const Text('View activity'),
            ),
          ],
        ),
        const SizedBox(height: 8),
        if (!mobile)
          Text(
            'A home for everyday money.',
            style: Theme.of(context).textTheme.titleMedium,
          ),
        const SizedBox(height: 6),
        if (!mobile)
          Text(
            'Switch wallets to see each balance. Your credit obligations stay separate.',
            style: TextStyle(
              fontSize: 12,
              color: CraftTheme.of(context).secondary,
            ),
          ),
      ],
    );
  }
}

class LocalSpendingRhythm extends StatefulWidget {
  const LocalSpendingRhythm({super.key, required this.session});
  final PrototypeSession session;
  @override
  State<LocalSpendingRhythm> createState() => _LocalSpendingRhythmState();
}

class _LocalSpendingRhythmState extends State<LocalSpendingRhythm> {
  int selected = 6;
  bool values = false;
  @override
  Widget build(BuildContext context) {
    final c = widget.session.finance as LocalFinancialController;
    final today = DateTime.parse(civilToday());
    final days = List.generate(
      7,
      (i) => today
          .subtract(Duration(days: 6 - i))
          .toIso8601String()
          .substring(0, 10),
    );
    final amounts = days.map(c.spendingOn).toList();
    final max = amounts.fold<BigInt>(
      BigInt.one,
      (a, b) => a > b.abs() ? a : b.abs(),
    );
    final net = sumMinor(amounts);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text('Spending rhythm', style: TextStyle(fontSize: 13)),
        const SizedBox(height: 8),
        Text(
          '${days[selected]} · ${widget.session.amount(amounts[selected])}',
          style: const TextStyle(color: Palette.mint, fontSize: 12),
        ),
        const SizedBox(height: 12),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              for (var i = 0; i < days.length; i++)
                Semantics(
                  selected: i == selected,
                  child: Tooltip(
                    message:
                        '${days[i]} · ${widget.session.amount(amounts[i])}',
                    child: TextButton(
                      onPressed: () => setState(() => selected = i),
                      child: Column(
                        children: [
                          SizedBox(
                            height: 64,
                            width: 28,
                            child: Align(
                              alignment: Alignment.bottomCenter,
                              child: Container(
                                width: 28,
                                // Approximate display geometry only. All values/totals remain BigInt.
                                height:
                                    6 +
                                    58 *
                                        (amounts[i].abs() *
                                                BigInt.from(10000) ~/
                                                max)
                                            .toInt() /
                                        10000,
                                decoration: BoxDecoration(
                                  color: selected == i
                                      ? Palette.mint
                                      : Palette.lilac.withValues(alpha: .35),
                                  borderRadius: BorderRadius.circular(7),
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            days[i].substring(8),
                            style: const TextStyle(
                              color: Palette.lilac,
                              fontSize: 11,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
        Wrap(
          alignment: WrapAlignment.spaceBetween,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            Text(
              '7-day net spending ${widget.session.amount(net)}',
              style: const TextStyle(fontSize: 12),
            ),
            TextButton(
              onPressed: () => setState(() => values = !values),
              child: Text(values ? 'Hide values' : 'View values'),
            ),
          ],
        ),
        if (values) ...[
          for (var i = 0; i < days.length; i++)
            Text('${days[i]} · ${widget.session.amount(amounts[i])}'),
          const SizedBox(height: 8),
          const Text(
            'Current revisions only. Refunds reduce spending on their recorded date. Transfer principal, openings and adjustments excluded.',
            style: TextStyle(fontSize: 12),
          ),
        ],
      ],
    );
  }
}
