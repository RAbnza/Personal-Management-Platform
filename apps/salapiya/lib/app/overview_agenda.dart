import 'package:flutter/material.dart';

import '../design_system/components.dart';
import '../design_system/editorial.dart';
import '../design_system/theme.dart';
import '../prototype/scenarios.dart';

class OverviewAgenda extends StatefulWidget {
  const OverviewAgenda({super.key, required this.session, required this.open});
  final PrototypeSession session;
  final ValueChanged<PreviewSource> open;
  @override
  State<OverviewAgenda> createState() => _OverviewAgendaState();
}

class _OverviewAgendaState extends State<OverviewAgenda> {
  int day = 23;
  static const events = <int, (String, String, IconData, PreviewSource)>{
    23: (
      'Interview',
      '10:00 · Career',
      Icons.work_outline,
      PreviewSource.career,
    ),
    24: (
      'A chapter for yourself',
      'Reading · Personal task',
      Icons.auto_stories_outlined,
      PreviewSource.task,
    ),
    25: (
      'Electricity',
      'Expected bill · not paid',
      Icons.bolt_outlined,
      PreviewSource.electricity,
    ),
    27: (
      'Card obligation',
      'Amount due not yet available',
      Icons.credit_card_outlined,
      PreviewSource.cards,
    ),
    28: (
      'Debt commitment',
      'Expected · not a payment',
      Icons.event_note_outlined,
      PreviewSource.debt,
    ),
  };

  @override
  Widget build(BuildContext context) {
    final session = widget.session;
    final event = session.empty ? null : events[day];
    return EditorialSurface(
      padding: 20,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SectionHeading(
            'On the horizon',
            trailing: IconButton(
              tooltip: 'Open agenda',
              onPressed: () => widget.open(PreviewSource.agenda),
              icon: const Icon(Icons.north_east, size: 20),
            ),
          ),
          const Eyebrow('OCTOBER 2026 / DEMO WEEK'),
          const SizedBox(height: 12),
          LayoutBuilder(
            builder: (context, box) {
              // A wrapping week strip keeps real 48px targets at large text sizes.
              final scale = MediaQuery.textScalerOf(context).scale(14) / 14;
              final width = scale > 1.5 ? 64.0 : 48.0;
              return Wrap(
                spacing: 2,
                runSpacing: 6,
                children: [
                  for (var date = 22; date <= 28; date++)
                    SizedBox(
                      width: width,
                      child: Semantics(
                        selected: date == day,
                        child: TextButton(
                          key: ValueKey('agenda-day-$date'),
                          style: TextButton.styleFrom(
                            padding: const EdgeInsets.symmetric(
                              vertical: 10,
                              horizontal: 2,
                            ),
                            backgroundColor: date == day
                                ? CraftTheme.of(context).text
                                : null,
                            foregroundColor: date == day
                                ? CraftTheme.of(context).surface
                                : CraftTheme.of(context).text,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(24),
                            ),
                          ),
                          onPressed: () => setState(() => day = date),
                          child: Column(
                            children: [
                              Text(
                                [
                                  'TH',
                                  'FR',
                                  'SA',
                                  'SU',
                                  'MO',
                                  'TU',
                                  'WE',
                                ][date - 22],
                                style: const TextStyle(fontSize: 9),
                              ),
                              const SizedBox(height: 7),
                              Text('$date'),
                              const SizedBox(height: 7),
                              Container(
                                width: 4,
                                height: 4,
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  color:
                                      !session.empty && events.containsKey(date)
                                      ? date == day
                                            ? Palette.mint
                                            : CraftTheme.of(context).primary
                                      : Colors.transparent,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                ],
              );
            },
          ),
          const SizedBox(height: 20),
          Text(
            '$day OCT',
            style: TextStyle(
              fontSize: 11,
              letterSpacing: 1,
              color: CraftTheme.of(context).secondary,
            ),
          ),
          const SizedBox(height: 12),
          if (event == null)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 20),
              child: Text(
                session.empty
                    ? 'Your agenda is clear. Start with something that matters.'
                    : 'A little breathing room. No commitments on this date.',
              ),
            )
          else
            TextButton(
              onPressed: () => widget.open(event.$4),
              style: TextButton.styleFrom(
                padding: EdgeInsets.zero,
                foregroundColor: CraftTheme.of(context).text,
                alignment: Alignment.centerLeft,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  IconTile(event.$3, color: Palette.peach),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          event.$1,
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                        const SizedBox(height: 6),
                        Text(
                          event.$2,
                          style: TextStyle(
                            fontSize: 12,
                            color: CraftTheme.of(context).secondary,
                          ),
                        ),
                        if ((day == 25 || day == 28) && session.complete)
                          Padding(
                            padding: const EdgeInsets.only(top: 8),
                            child: AmountText(
                              session.amount(
                                BigInt.from(day == 25 ? 185000 : 200000),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                  const Icon(Icons.north_east, size: 16),
                ],
              ),
            ),
          const Divider(height: 32),
          const Eyebrow('AHEAD THIS WEEK'),
          const SizedBox(height: 8),
          if (!session.empty) ...[
            TextButton(
              onPressed: () => widget.open(PreviewSource.electricity),
              style: TextButton.styleFrom(
                alignment: Alignment.centerLeft,
                padding: const EdgeInsets.symmetric(vertical: 12),
              ),
              child: const Text('25 Oct  /  Electricity due'),
            ),
            TextButton(
              onPressed: () => widget.open(PreviewSource.debt),
              style: TextButton.styleFrom(
                alignment: Alignment.centerLeft,
                padding: const EdgeInsets.symmetric(vertical: 12),
              ),
              child: const Text('28 Oct  /  Debt commitment'),
            ),
          ],
          const SizedBox(height: 8),
          Text(
            'Expected obligations are not actual expenses.',
            style: TextStyle(
              fontSize: 11,
              color: CraftTheme.of(context).secondary,
            ),
          ),
        ],
      ),
    );
  }
}
