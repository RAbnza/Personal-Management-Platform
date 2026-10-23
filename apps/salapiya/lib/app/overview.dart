import 'package:flutter/material.dart';

import '../design_system/components.dart';
import '../design_system/editorial.dart';
import '../design_system/theme.dart';
import '../prototype/fixtures.dart';
import '../prototype/scenarios.dart';
import 'activity_view.dart';
import 'overview_agenda.dart';
import 'overview_wallet.dart';

class SourceLink extends StatelessWidget {
  const SourceLink({
    super.key,
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.onTap,
    this.trailing,
  });
  final String title, subtitle;
  final IconData icon;
  final VoidCallback onTap;
  final String? trailing;
  @override
  Widget build(BuildContext context) => Column(
    children: [
      TextButton(
        style: TextButton.styleFrom(
          alignment: Alignment.centerLeft,
          foregroundColor: CraftTheme.of(context).text,
          padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 4),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
        onPressed: onTap,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            IconTile(
              icon,
              color: CraftTheme.of(context).dark ? Palette.lilac : Palette.mint,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 4),
                  Text(
                    subtitle,
                    style: TextStyle(
                      fontSize: 12,
                      color: CraftTheme.of(context).secondary,
                    ),
                  ),
                  if (trailing != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: AmountText(trailing!),
                    ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            const Icon(Icons.north_east, size: 16),
          ],
        ),
      ),
      Divider(height: 1, color: CraftTheme.of(context).divider),
    ],
  );
}

class Overview extends StatelessWidget {
  const Overview({super.key, required this.session, required this.open});
  final PrototypeSession session;
  final ValueChanged<PreviewSource> open;

  Widget attention(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(vertical: 16),
    decoration: BoxDecoration(
      border: Border(bottom: BorderSide(color: CraftTheme.of(context).divider)),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (!session.complete)
          const StatusNotice(
            'Initial download is incomplete. Financial totals are withheld; the Life preview remains accessible.',
            tone: NoticeTone.warning,
          ),
        if (session.scenario == OverviewScenario.waiting)
          const StatusNotice(
            'Waiting for connection. Complete cached money remains readable; last successful sync: 21 Oct, 09:00.',
            tone: NoticeTone.information,
          ),
        if (session.needsReview)
          SourceLink(
            title: 'Review a changed group source',
            subtitle: 'Private effect · your approval is required',
            icon: Icons.rule_outlined,
            onTap: () => open(PreviewSource.privateReview),
          ),
        if (!session.empty)
          LayoutBuilder(
            builder: (context, box) {
              final wide =
                  box.maxWidth > 780 &&
                  MediaQuery.textScalerOf(context).scale(14) <= 21;
              final label = Row(
                children: [
                  const Icon(Icons.notifications_none_rounded, size: 18),
                  const SizedBox(width: 10),
                  Flexible(
                    child: Text(
                      'A little attention',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                  ),
                ],
              );
              final action = TextButton.icon(
                onPressed: () => open(PreviewSource.settlement),
                icon: const Icon(Icons.arrow_outward, size: 16),
                label: Text(
                  session.local
                      ? 'Tala reported a payment · example'
                      : 'Tala reported a payment · review',
                ),
              );
              return wide
                  ? Row(
                      children: [
                        Expanded(child: label),
                        const SizedBox(width: 24),
                        Flexible(flex: 2, child: action),
                      ],
                    )
                  : Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [label, action],
                    );
            },
          ),
      ],
    ),
  );

  Widget shared(BuildContext context) => EditorialSurface(
    color: CraftTheme.of(context).dark
        ? const Color(0xFF302D39)
        : const Color(0xFFE8E1F2),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Eyebrow('TOGETHER, WITH CLARITY'),
        const SizedBox(height: 16),
        Row(
          children: [
            for (final (initial, color) in [
              ('A', Palette.lilac),
              ('T', Palette.mint),
              ('N', Palette.peach),
            ])
              Padding(
                padding: const EdgeInsets.only(right: 6),
                child: CircleAvatar(
                  radius: 18,
                  backgroundColor: color,
                  foregroundColor: Palette.ink,
                  child: Text(initial, style: const TextStyle(fontSize: 12)),
                ),
              ),
            const Spacer(),
            const Icon(Icons.people_outline),
          ],
        ),
        const SizedBox(height: 12),
        SourceLink(
          title: 'Demo household',
          subtitle: session.empty
              ? 'Explore Shared Expenses'
              : 'Dinner with Tala and Nico',
          icon: Icons.restaurant_outlined,
          onTap: () => open(PreviewSource.group),
        ),
        const SizedBox(height: 12),
        Text(
          session.empty
              ? 'No groups yet. Connect when you are ready to collaborate.'
              : session.local
              ? 'An independent group example. Connect to collaborate; your private money stays yours.'
              : '1 payment awaiting recipient confirmation. Synced does not mean received.',
          style: TextStyle(
            fontSize: 12,
            color: CraftTheme.of(context).secondary,
          ),
        ),
      ],
    ),
  );

  Widget life(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 12),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Eyebrow('BEYOND THE BALANCE'),
        const SizedBox(height: 12),
        Text(
          'A little room for life.',
          style: Theme.of(context).textTheme.headlineMedium,
        ),
        SourceLink(
          title: session.empty
              ? 'Make space for your first task'
              : 'Reading, learning and your next chapter',
          subtitle: 'Tasks · Learning · Books · Career',
          icon: Icons.auto_stories_outlined,
          onTap: () => open(PreviewSource.agenda),
        ),
        const SizedBox(height: 12),
        if (!session.empty)
          Text(
            'Next: interview on 23 Oct, then reading on 24 Oct. These personal items remain separate from financial commitments.',
            style: TextStyle(
              fontSize: 12,
              color: CraftTheme.of(context).secondary,
            ),
          ),
      ],
    ),
  );

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, box) {
      final wide =
          box.maxWidth >= 880 &&
          MediaQuery.textScalerOf(context).scale(14) <= 21;
      Widget pair(Widget left, Widget right) => Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(flex: 7, child: left),
          const SizedBox(width: 28),
          Expanded(flex: 4, child: right),
        ],
      );
      final heading = Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (!wide) ...[
            const Eyebrow('YOUR MONEY, ON YOUR TERMS.'),
            const SizedBox(height: 10),
          ],
          Text(
            'Your day, in balance.',
            style: Theme.of(context).textTheme.displaySmall!
                .copyWith(fontSize: wide ? 38 : 32, letterSpacing: -1.4),
          ),
          const SizedBox(height: 8),
          Text(
            'Good morning, Amihan',
            style: TextStyle(color: CraftTheme.of(context).secondary),
          ),
        ],
      );
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (wide)
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Expanded(child: heading),
                const Padding(
                  padding: EdgeInsets.only(bottom: 4),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Eyebrow('WEDNESDAY, 21 OCTOBER'),
                      SizedBox(height: 8),
                      Text('2026 / demo week · Asia/Manila'),
                    ],
                  ),
                ),
              ],
            )
          else
            heading,
          const SizedBox(height: 24),
          if (wide)
            pair(
              BalanceFeature(session: session, open: open),
              AccountWallet(session: session, open: open),
            )
          else ...[
            BalanceFeature(session: session, open: open),
            const SizedBox(height: 16),
            AccountWallet(session: session, open: open),
          ],
          if (session.pending)
            Padding(
              padding: const EdgeInsets.only(top: 16),
              child: StatusNotice(
                'Pending outflow ${session.amount(DemoMoney.expense)}. Projected liquid total ${session.amount(session.projected!)} — not accepted yet.',
                tone: NoticeTone.warning,
              ),
            ),
          attention(context),
          const SizedBox(height: 28),
          if (wide)
            pair(
              ActivityView(session: session),
              OverviewAgenda(session: session, open: open),
            )
          else ...[
            ActivityView(session: session),
            const SizedBox(height: 28),
            OverviewAgenda(session: session, open: open),
          ],
          const SizedBox(height: 28),
          if (wide)
            pair(life(context), shared(context))
          else ...[
            shared(context),
            const SizedBox(height: 24),
            life(context),
          ],
        ],
      );
    },
  );
}
