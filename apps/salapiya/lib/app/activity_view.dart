import 'package:flutter/material.dart';

import '../design_system/editorial.dart';
import '../design_system/theme.dart';
import '../prototype/activity.dart';
import '../prototype/scenarios.dart';

IconData categoryIcon(String category) => switch (category) {
  'Groceries' => Icons.shopping_basket_outlined,
  'Bills' => Icons.wifi_rounded,
  'Transport' => Icons.directions_transit_outlined,
  'Income' => Icons.south_west,
  _ => Icons.local_cafe_outlined,
};

Color categoryColor(String category) => switch (category) {
  'Groceries' => Palette.mint,
  'Bills' => Palette.lilac,
  'Transport' => const Color(0xFFC7DDEB),
  'Income' => Palette.mint,
  _ => Palette.peach,
};

class ActivityView extends StatefulWidget {
  const ActivityView({super.key, required this.session, this.full = false});
  final PrototypeSession session;
  final bool full;
  @override
  State<ActivityView> createState() => _ActivityViewState();
}

class _ActivityViewState extends State<ActivityView> {
  String filter = 'All';
  bool all = false;

  Future<void> detail(DemoEntry entry) => showDialog<void>(
    context: context,
    animationStyle: MediaQuery.disableAnimationsOf(context)
        ? AnimationStyle.noAnimation
        : null,
    builder: (context) => AlertDialog(
      scrollable: true,
      title: Text(entry.title),
      content: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Eyebrow('SYNTHETIC / ACCEPTED ACTIVITY'),
          const SizedBox(height: 20),
          Text(
            widget.session.amount(entry.amount),
            style: Theme.of(context).textTheme.headlineMedium,
          ),
          const SizedBox(height: 20),
          for (final row in [
            ('Date', '${entry.day} Oct 2026'),
            ('Account', entry.account),
            ('Category', entry.category),
            ('Status', 'Accepted example'),
          ])
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Text('${row.$1}\n${row.$2}'),
            ),
          const SizedBox(height: 12),
          const Text(
            'Included once in the demo liquid balance and weekly activity. This is a read-only example.',
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Close'),
        ),
      ],
    ),
  );

  @override
  Widget build(BuildContext context) {
    final session = widget.session;
    final records = DemoActivity.entries
        .where(
          (e) =>
              filter == 'All' || (filter == 'Money in' ? e.income : !e.income),
        )
        .toList();
    final shown = all || widget.full ? records : records.take(4).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionHeading(
          'The latest movements',
          trailing: !widget.full && session.complete && !session.empty
              ? TextButton(
                  onPressed: () => setState(() => all = !all),
                  child: Text(all ? 'Show less' : 'See all'),
                )
              : null,
        ),
        if (!session.complete || session.empty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 24),
            child: Text(
              session.empty
                  ? 'A fresh start. Your activity will find a home here.'
                  : 'Activity is unavailable until history is complete.',
            ),
          )
        else ...[
          Wrap(
            spacing: 8,
            children: [
              for (final label in ['All', 'Money out', 'Money in'])
                ChoiceChip(
                  key: ValueKey('activity-filter-$label'),
                  label: Text(label),
                  showCheckmark: false,
                  selected: filter == label,
                  onSelected: (_) => setState(() => filter = label),
                ),
            ],
          ),
          const SizedBox(height: 12),
          for (final entry in shown)
            LayoutBuilder(
              builder: (context, box) {
                final narrow =
                    box.maxWidth < 420 ||
                    MediaQuery.textScalerOf(context).scale(14) > 21;
                final amount = Text(
                  session.amount(entry.amount),
                  style: TextStyle(
                    fontWeight: FontWeight.w600,
                    fontFeatures: const [FontFeature.tabularFigures()],
                    color: entry.income
                        ? CraftTheme.of(context).tone(NoticeTone.success).$1
                        : CraftTheme.of(context).text,
                  ),
                );
                return Column(
                  children: [
                    TextButton(
                      key: ValueKey('entry-${entry.title}'),
                      onPressed: () => detail(entry),
                      style: TextButton.styleFrom(
                        padding: const EdgeInsets.symmetric(
                          vertical: 14,
                          horizontal: 4,
                        ),
                        foregroundColor: CraftTheme.of(context).text,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                      child: Row(
                        children: [
                          IconTile(
                            categoryIcon(entry.category),
                            color: categoryColor(entry.category),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  entry.title,
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w500,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  '${entry.day} Oct · ${entry.account}',
                                  style: TextStyle(
                                    fontSize: 11,
                                    color: CraftTheme.of(context).secondary,
                                  ),
                                ),
                                if (narrow)
                                  Padding(
                                    padding: const EdgeInsets.only(top: 6),
                                    child: amount,
                                  ),
                              ],
                            ),
                          ),
                          if (!narrow) ...[const SizedBox(width: 12), amount],
                          const SizedBox(width: 8),
                          const Icon(Icons.chevron_right, size: 16),
                        ],
                      ),
                    ),
                    Divider(height: 1, color: CraftTheme.of(context).divider),
                  ],
                );
              },
            ),
          const SizedBox(height: 12),
          Text(
            '${shown.length} of ${records.length} ${filter == 'All' ? 'movements' : '${filter.toLowerCase()} records'} · 15–21 Oct · synthetic, accepted history',
            style: TextStyle(
              fontSize: 11,
              color: CraftTheme.of(context).secondary,
            ),
          ),
          const SizedBox(height: 28),
          const SectionHeading('Where it went'),
          if (session.hideAmounts)
            const Text('Category amounts and proportions are hidden.')
          else ...[
            Semantics(
              label: 'Weekly spending by category. Exact amounts follow.',
              child: ClipRRect(
                borderRadius: BorderRadius.circular(6),
                child: SizedBox(
                  height: 12,
                  child: Row(
                    children: [
                      for (final category in DemoActivity.categories)
                        Expanded(
                          flex: DemoActivity.categoryTotal(category).toInt(),
                          child: ColoredBox(
                            color: categoryColor(category),
                            child: const SizedBox.expand(),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(height: 16),
            LayoutBuilder(
              builder: (context, box) {
                final columns =
                    box.maxWidth >= 460 &&
                        MediaQuery.textScalerOf(context).scale(14) <= 21
                    ? 2
                    : 1;
                return Wrap(
                  spacing: 16,
                  runSpacing: 12,
                  children: [
                    for (final category in DemoActivity.categories)
                      SizedBox(
                        width: (box.maxWidth - 16 * (columns - 1)) / columns,
                        child: Row(
                          children: [
                            Container(
                              width: 8,
                              height: 8,
                              decoration: BoxDecoration(
                                color: categoryColor(category),
                                shape: BoxShape.circle,
                              ),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                category,
                                style: const TextStyle(fontSize: 12),
                              ),
                            ),
                            Text(
                              session.amount(
                                DemoActivity.categoryTotal(category),
                              ),
                              style: const TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ),
                  ],
                );
              },
            ),
          ],
        ],
      ],
    );
  }
}
