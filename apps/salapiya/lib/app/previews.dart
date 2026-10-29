import 'package:flutter/material.dart';

import '../design_system/components.dart';
import '../design_system/craft.dart';
import '../design_system/theme.dart';
import '../prototype/fixtures.dart';
import '../prototype/scenarios.dart';
import 'demo_routes.dart';
import 'overview.dart';
import 'activity_view.dart';
import '../design_system/editorial.dart';

const destinationSources = {
  AppDestination.money: [
    PreviewSource.activity,
    PreviewSource.accounts,
    PreviewSource.cards,
    PreviewSource.planning,
    PreviewSource.reports,
  ],
  AppDestination.debts: [PreviewSource.debt, PreviewSource.debtHistory],
  AppDestination.shared: [
    PreviewSource.group,
    PreviewSource.settlement,
    PreviewSource.privateReview,
  ],
  AppDestination.life: [
    PreviewSource.agenda,
    PreviewSource.task,
    PreviewSource.learning,
    PreviewSource.books,
    PreviewSource.career,
  ],
};

class DestinationPreview extends StatelessWidget {
  const DestinationPreview({
    super.key,
    required this.destination,
    required this.session,
    required this.open,
  });
  final AppDestination destination;
  final PrototypeSession session;
  final ValueChanged<PreviewSource> open;
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      SectionTitle(
        destination.label,
        caption: switch (destination) {
          AppDestination.money =>
            'Everyday money, with the context that matters.',
          AppDestination.debts => 'Keep commitments clear and evidence close.',
          AppDestination.shared =>
            'Settle together. Keep your private records yours.',
          AppDestination.life => 'Your time, interests and next steps.',
          AppDestination.overview => '',
        },
      ),
      EditorialSurface(
        color: CraftTheme.of(context).dark
            ? const Color(0xFF302D39)
            : const Color(0xFFE8E1F2),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            IconTile(
              switch (destination) {
                AppDestination.money => Icons.account_balance_wallet_outlined,
                AppDestination.debts => Icons.receipt_long_outlined,
                AppDestination.shared => Icons.people_outline,
                _ => Icons.spa_outlined,
              },
              color: Palette.mint,
              size: 56,
            ),
            const SizedBox(height: 16),
            Text(switch (destination) {
              AppDestination.money =>
                session.complete
                    ? 'A place for accounts, activity and plans'
                    : 'Your money summary is still downloading',
              AppDestination.debts =>
                session.empty
                    ? 'No debt commitments yet'
                    : 'Next commitment · 28 Oct',
              AppDestination.shared =>
                session.local
                    ? 'Explore a fictional group'
                    : 'Demo household · 1 confirmation to review',
              AppDestination.life =>
                session.empty
                    ? 'Start with something that matters to you'
                    : 'Interview on Friday. A chapter on Saturday.',
              AppDestination.overview => '',
            }, style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 12),
            const Text(
              'Interactive destination preview. Full workflows are not available yet; no records are created here.',
            ),
          ],
        ),
      ),
      const SizedBox(height: 24),
      for (final source in destinationSources[destination] ?? <PreviewSource>[])
        SourceLink(
          title: source.label,
          subtitle: source.title,
          icon: Icons.arrow_outward,
          onTap: () => open(source),
        ),
    ],
  );
}

class SourcePreviewPage extends StatelessWidget {
  const SourcePreviewPage({
    super.key,
    required this.source,
    required this.session,
  });
  final PreviewSource source;
  final PrototypeSession session;
  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: session,
    builder: (context, _) => DemoPage(
      title: source.label,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            '${source.destination.label} / ${source.label}',
            style: TextStyle(color: CraftTheme.of(context).primary),
          ),
          const SizedBox(height: 16),
          SectionTitle(source.title, caption: source.description),
          if (session.empty)
            const StatusNotice(
              'Empty profile preview. No source record exists yet.',
            )
          else if (!session.complete &&
              source.destination != AppDestination.life)
            const StatusNotice(
              'Financial source coverage is incomplete. Amounts are not yet available.',
              tone: NoticeTone.warning,
            )
          else ...[
            if (source == PreviewSource.activity)
              ActivityView(session: session, full: true),
            if (source == PreviewSource.accounts) ...[
              for (final account in demoAccounts)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(account.$1),
                      AmountText(session.amount(BigInt.parse(account.$2))),
                    ],
                  ),
                ),
              const Divider(),
              Text(session.coverage),
              if (session.pending)
                Text(
                  'Pending outflow ${session.amount(DemoMoney.expense)} is excluded from these balances.',
                ),
            ],
            if (source == PreviewSource.cards) ...[
              const Text(
                'Accepted card liability · separate from liquid money',
              ),
              AmountText(session.amount(DemoMoney.card), large: true),
              const SizedBox(height: 16),
              const Text(
                'Obligation preview: 27 Oct 2026. Amount due and provider statement are not yet available. Liability is not a minimum-payment quote.',
              ),
            ],
            if (source == PreviewSource.electricity ||
                source == PreviewSource.debt)
              AmountText(
                session.amount(
                  BigInt.from(source == PreviewSource.debt ? 200000 : 185000),
                ),
                large: true,
              ),
            if (source == PreviewSource.group) ...[
              Text(
                'Dinner ${session.amount(BigInt.from(120000))} · each share ${session.amount(BigInt.from(40000))}',
              ),
              const SizedBox(height: 16),
              Text(
                'Group position: Amihan +${session.amount(BigInt.from(80000))}; Tala ${session.amount(BigInt.from(-40000))}; Nico ${session.amount(BigInt.from(-40000))}.',
              ),
              const SizedBox(height: 16),
              const Text(
                'This fixture is independent of Money Today. It has not been posted into the account totals.',
              ),
              TextButton(
                onPressed: () => openDemoPage<void>(
                  context,
                  SourcePreviewPage(
                    source: PreviewSource.settlement,
                    session: session,
                  ),
                  'shared/settlement',
                ),
                child: const Text('View settlement example'),
              ),
            ],
            if (source == PreviewSource.settlement) ...[
              StatusNotice(
                'Awaiting recipient confirmation · ${session.amount(BigInt.from(15000))} reported by Tala.',
                tone: NoticeTone.information,
              ),
              const SizedBox(height: 16),
              Text(
                'Accepted Tala amount owed: ${session.amount(BigInt.from(40000))}. Projected after confirmation: ${session.amount(BigInt.from(25000))}.',
              ),
              const Text(
                'No confirmation action is performed in this preview.',
              ),
            ],
            if (source == PreviewSource.agenda)
              for (final item in [PreviewSource.career, PreviewSource.task])
                SourceLink(
                  title: item.title,
                  subtitle: 'Life / ${item.label}',
                  icon: Icons.event_outlined,
                  onTap: () => openDemoPage<void>(
                    context,
                    SourcePreviewPage(source: item, session: session),
                    'life/${item.name}',
                  ),
                ),
          ],
          const SizedBox(height: 24),
          const StatusNotice(
            'Read-only demonstration. No payment, save, sync or private-account change has occurred.',
          ),
        ],
      ),
    ),
  );
}

class DemoActionPage extends StatefulWidget {
  const DemoActionPage({super.key, required this.label});
  final String label;
  @override
  State<DemoActionPage> createState() => _DemoActionPageState();
}

class _DemoActionPageState extends State<DemoActionPage> {
  final note = TextEditingController();
  bool asking = false, completed = false;
  bool get dirty => note.text.isNotEmpty;
  @override
  void dispose() {
    note.dispose();
    super.dispose();
  }

  Future<void> leave() async {
    if (asking) return;
    asking = true;
    final discard = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      animationStyle: MediaQuery.disableAnimationsOf(context)
          ? AnimationStyle.noAnimation
          : null,
      builder: (context) => AlertDialog(
        title: const Text('Discard demo draft?'),
        content: const Text(
          'Your note exists only in this session. No financial operation has occurred.',
        ),
        actions: [
          TextButton(
            autofocus: true,
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Keep editing'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Discard demo draft'),
          ),
        ],
      ),
    );
    asking = false;
    if (discard == true && mounted) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) => PopScope<void>(
    canPop: !dirty,
    onPopInvokedWithResult: (didPop, _) {
      if (!didPop) leave();
    },
    child: DemoPage(
      title: widget.label,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SectionTitle(
            '${widget.label} · preview',
            caption: 'This is a bounded task preview. Amount entry, validation and financial review are not available yet.',
          ),
          const StatusNotice(
            'No financial record will be created. You can try a temporary note and Back behavior.',
          ),
          const SizedBox(height: 24),
          TextField(
            controller: note,
            key: const ValueKey('demo-task-note'),
            minLines: 2,
            maxLines: 4,
            decoration: const InputDecoration(
              labelText: 'Temporary demo note',
              helperText: 'Use invented information only.',
            ),
            onChanged: (_) => setState(() => completed = false),
          ),
          const SizedBox(height: 24),
          FilledButton(
            onPressed: () {
              FocusScope.of(context).unfocus();
              setState(() => completed = true);
            },
            child: const Text('Preview outcome'),
          ),
          if (completed)
            const Padding(
              padding: EdgeInsets.only(top: 16),
              child: StatusNotice(
                'Preview complete — no record created. Your note remains in memory until you leave.',
                live: true,
              ),
            ),
        ],
      ),
    ),
  );
}

class FirstRunPage extends StatelessWidget {
  const FirstRunPage({super.key, required this.session});
  final PrototypeSession session;
  @override
  Widget build(BuildContext context) => DemoPage(
    title: 'First-run preview',
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Align(
          alignment: Alignment.centerLeft,
          child: BrandMark(size: 72),
        ),
        const SizedBox(height: 16),
        const SectionTitle(
          'Your money, on your terms.',
          caption: 'Three distinct ways to begin. This preview uses only synthetic information.',
        ),
        for (final entry in [
          (
            'Create a local offline profile',
            Icons.devices_outlined,
            'Start without internet, Google or email. The fictional Amihan profile begins empty.',
            OverviewScenario.empty,
          ),
          (
            'Continue with Google',
            Icons.cloud_outlined,
            'Simulated account: Amihan. Retrieve an existing profile without first creating a disposable local one. No credentials requested.',
            OverviewScenario.incomplete,
          ),
          (
            'Restore from backup',
            Icons.restore_outlined,
            'Synthetic manifest: Amihan · 20 Oct 2026 · schema preview v1 · 3 accounts. Attachment bytes omitted. Group access still needs online identity. No file or secret requested.',
            OverviewScenario.local,
          ),
        ])
          SourceLink(
            title: entry.$1,
            subtitle: entry.$3,
            icon: entry.$2,
            onTap: () async {
              final confirm = await showDialog<bool>(
                context: context,
                animationStyle: MediaQuery.disableAnimationsOf(context)
                    ? AnimationStyle.noAnimation
                    : null,
                builder: (context) => AlertDialog(
                  scrollable: true,
                  title: Text(entry.$1),
                  content: Text(
                    '${entry.$3}\n\nSwitch only the in-memory scenario? No real profile, authentication or restore will occur.',
                  ),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.pop(context, false),
                      child: const Text('Cancel'),
                    ),
                    FilledButton(
                      onPressed: () => Navigator.pop(context, true),
                      child: const Text('Explore simulated result'),
                    ),
                  ],
                ),
              );
              if (confirm == true && context.mounted) {
                session.select(entry.$4);
                Navigator.pop(context);
              }
            },
          ),
        const SizedBox(height: 24),
        FilledButton(
          onPressed: () {
            session.select(OverviewScenario.local);
            Navigator.pop(context);
          },
          child: const Text('Skip to populated demo'),
        ),
      ],
    ),
  );
}
