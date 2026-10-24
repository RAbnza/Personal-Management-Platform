import 'package:flutter/material.dart';

import '../../../app/demo_routes.dart';
import '../../../design_system/editorial.dart';
import '../../../design_system/theme.dart';
import '../../../prototype/scenarios.dart';
import '../../common/prototype_form.dart';
import '../../finance/presentation/financial_widgets.dart';
import '../../finance/presentation/debts_screen.dart';
import '../../finance/presentation/credit_screen.dart';
import '../../planning/application/planning_controller.dart';
import '../../planning/presentation/planning_screen.dart';
import '../application/life_controller.dart';
import '../../supporting/presentation/files_screen.dart';
import '../../finance/application/financial_controller.dart';

Future<void> editLifeEntry(
  BuildContext context,
  PrototypeSession s,
  LifeKind kind, {
  LifeEntry? entry,
}) => reviewForm(
  context,
  title: entry == null ? 'New ${kind.name}' : 'Edit ${entry.title}',
  draftKey: entry?.id ?? 'new-${kind.name}',
  revision: () => s.life.revision,
  explanation:
      'A private ${kind.name} preset. Deadlines and reminders follow this source; no custom template is created.',
  fields: [
    DemoField('title', 'Title', value: entry?.title ?? ''),
    DemoField(
      'detail',
      kind == LifeKind.book
          ? 'Author'
          : kind == LifeKind.learning
          ? 'Course or learning resource'
          : 'Context',
      value: entry?.detail ?? '',
      required: false,
    ),
    DemoField(
      'due',
      'Deadline (optional YYYY-MM-DD)',
      value: entry?.due ?? '2026-10-24',
      required: false,
    ),
    if (kind == LifeKind.task)
      DemoField(
        'priority',
        'Priority',
        value: entry?.priority ?? 'Normal',
        options: options(['High', 'Normal', 'Low']),
      ),
    if (kind != LifeKind.task) ...[
      DemoField(
        'total',
        kind == LifeKind.book ? 'Total pages' : 'Goal units / lessons',
        value: '${entry?.total ?? (kind == LifeKind.book ? 240 : 12)}',
      ),
      DemoField(
        'progress',
        kind == LifeKind.book ? 'Pages read' : 'Units completed',
        value: '${entry?.progress ?? 0}',
      ),
    ],
    DemoField(
      'notes',
      'Notes',
      value: entry?.notes ?? '',
      required: false,
      lines: 3,
    ),
    if (entry != null) const DemoField('reason', 'Reason for change'),
  ],
  save: (v) => s.life.saveEntry(kind, v, old: entry),
);
Future<void> editPersonalEvent(
  BuildContext context,
  PrototypeSession s, {
  PersonalEvent? event,
}) => reviewForm(
  context,
  title: event == null ? 'New personal event' : 'Edit ${event.title}',
  draftKey: event?.id ?? 'new-event',
  revision: () => s.life.revision,
  fields: [
    DemoField('title', 'Event title', value: event?.title ?? ''),
    DemoField('date', 'Date', value: event?.date ?? '2026-10-24'),
    DemoField('time', 'Time · Asia/Manila', value: event?.time ?? '09:00'),
    DemoField(
      'location',
      'Location',
      value: event?.location ?? '',
      required: false,
    ),
    DemoField(
      'notes',
      'Notes',
      value: event?.notes ?? '',
      required: false,
      lines: 3,
    ),
    if (event != null) const DemoField('reason', 'Reason'),
  ],
  save: (v) => s.life.saveEvent(v, old: event),
);

class LifeScreen extends StatefulWidget {
  const LifeScreen({
    super.key,
    required this.session,
    this.initial = 'Calendar',
  });
  final PrototypeSession session;
  final String initial;
  @override
  State<LifeScreen> createState() => _LifeScreenState();
}

class _LifeScreenState extends State<LifeScreen> {
  late String tab = widget.initial;
  String query = '', filter = 'Active', stage = 'All', source = 'All';
  DateTime month = DateTime(2026, 10), selected = DateTime(2026, 10, 23);
  bool agendaView = false;
  PrototypeSession get s => widget.session;
  LifeController get c => s.life;
  List<AgendaItem> get agenda =>
      c.agenda(s.planning, s.finance, financial: s.complete);
  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: s,
    builder: (context, _) => DemoViewState(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          FinanceHeading(
            'LIFE / A LITTLE ROOM FOR YOU',
            switch (tab) {
              'Tasks' => 'One thing at a time.',
              'Learning' => 'Stay curious.',
              'Books' => 'A shelf of possibilities.',
              'Career' => 'Your next chapter starts here.',
              _ => 'Make room for your day.',
            },
            'Your plans, progress and everyday commitments, together.',
            actions: [
              FilledButton.icon(
                onPressed: () => tab == 'Calendar'
                    ? editPersonalEvent(context, s)
                    : tab == 'Career'
                    ? applicationForm()
                    : editLifeEntry(
                        context,
                        s,
                        tab == 'Books'
                            ? LifeKind.book
                            : tab == 'Learning'
                            ? LifeKind.learning
                            : LifeKind.task,
                      ),
                icon: const Icon(Icons.add),
                label: Text(switch (tab) {
                  'Calendar' => 'New event',
                  'Career' => 'New application',
                  'Books' => 'Add book',
                  'Learning' => 'New learning goal',
                  _ => 'New task',
                }),
              ),
              OutlinedButton.icon(
                onPressed: () => openDemoPage<void>(
                  context,
                  ReminderCenter(session: s),
                  'life/reminders',
                ),
                icon: const Icon(Icons.notifications_none),
                label: const Text('Reminders'),
              ),
            ],
          ),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final t in [
                'Calendar',
                'Tasks',
                'Learning',
                'Books',
                'Career',
              ])
                ChoiceChip(
                  label: Text(t),
                  selected: tab == t,
                  onSelected: (_) => setState(() {
                    tab = t;
                    query = '';
                    filter = 'Active';
                  }),
                ),
            ],
          ),
          const SizedBox(height: 24),
          if (tab == 'Calendar')
            calendar()
          else ...[
            TextField(
              key: ValueKey('search-$tab'),
              decoration: InputDecoration(
                labelText: 'Search ${tab.toLowerCase()}',
                prefixIcon: const Icon(Icons.search),
              ),
              onChanged: (v) => setState(() => query = v.toLowerCase()),
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final f in ['Active', 'Completed', 'Archived', 'All'])
                  ChoiceChip(
                    label: Text(f),
                    selected: filter == f,
                    onSelected: (_) => setState(() => filter = f),
                  ),
              ],
            ),
            const SizedBox(height: 24),
            if (tab == 'Career')
              career()
            else
              entries(
                tab == 'Tasks'
                    ? LifeKind.task
                    : tab == 'Books'
                    ? LifeKind.book
                    : LifeKind.learning,
              ),
          ],
        ],
      ),
    ),
  );

  Widget calendar() {
    final filtered = agenda
        .where((e) => source == 'All' || e.kind == source)
        .toList();
    final monthItems = filtered
        .where((e) => e.date.startsWith(civil(month).substring(0, 7)))
        .toList();
    final firstOffset = (month.weekday - 1) % 7,
        days = DateTime(month.year, month.month + 1, 0).day;
    final dayItems = filtered.where((e) => e.date == civil(selected)).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Wrap(
          spacing: 8,
          runSpacing: 8,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            IconButton(
              tooltip: 'Previous month',
              onPressed: () =>
                  setState(() => month = DateTime(month.year, month.month - 1)),
              icon: const Icon(Icons.chevron_left),
            ),
            Text(
              '${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][month.month - 1]} ${month.year}',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            IconButton(
              tooltip: 'Next month',
              onPressed: () =>
                  setState(() => month = DateTime(month.year, month.month + 1)),
              icon: const Icon(Icons.chevron_right),
            ),
            TextButton(
              onPressed: () => setState(() {
                month = DateTime(2026, 10);
                selected = DateTime(2026, 10, 21);
              }),
              child: const Text('Demo today'),
            ),
            ChoiceChip(
              label: const Text('Month'),
              selected: !agendaView,
              onSelected: (_) => setState(() => agendaView = false),
            ),
            ChoiceChip(
              label: const Text('Agenda'),
              selected: agendaView,
              onSelected: (_) => setState(() => agendaView = true),
            ),
          ],
        ),
        const SizedBox(height: 12),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              for (final f in [
                'All',
                'Personal',
                'Tasks',
                'Learning',
                'Books',
                'Career',
                'Recurring',
                'Cards',
                'Debts',
              ])
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: FilterChip(
                    label: Text(f),
                    selected: source == f,
                    onSelected: (_) => setState(() => source = f),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 20),
        if (agendaView) ...[
          if (monthItems.isEmpty)
            const FinanceNotice(
              'A clear month. Add a personal event, or choose another source filter.',
            ),
          for (final e in monthItems) agendaRow(e),
        ] else
          FinanceColumns(
            ratio: 2,
            main: LayoutBuilder(
              builder: (context, b) => Column(
                children: [
                  Row(
                    children: [
                      for (final d in ['M', 'T', 'W', 'T', 'F', 'S', 'S'])
                        Expanded(
                          child: Padding(
                            padding: const EdgeInsets.all(8),
                            child: Text(
                              d,
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                color: CraftTheme.of(context).secondary,
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                  for (var row = 0; row < (firstOffset + days + 6) ~/ 7; row++)
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        for (var col = 0; col < 7; col++)
                          Expanded(
                            child: dayCell(
                              row * 7 + col - firstOffset + 1,
                              days,
                              filtered,
                              b.maxWidth,
                            ),
                          ),
                      ],
                    ),
                ],
              ),
            ),
            aside: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                ValueBlock(
                  'YOUR DAY',
                  '${selected.day} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][selected.month - 1]}',
                  '${dayItems.length} commitments · Asia/Manila',
                  color: Palette.peach,
                ),
                for (final e in dayItems) agendaRow(e),
                if (dayItems.isEmpty)
                  const FinanceNotice(
                    'A little breathing room. No commitments on this date.',
                  ),
              ],
            ),
          ),
        const SizedBox(height: 20),
        const FinanceNotice(
          'Generated commitments open their source. Moving a Career interview or completing a task updates this calendar once; it never creates a duplicate event.',
        ),
        ExpansionTile(
          key: const PageStorageKey('cancelled-personal-events'),
          title: const Text('Cancelled personal events'),
          children: [
            for (final e in c.events.where((e) => e.cancelled))
              FinancialLine(e.title, e.date, onTap: () => personalDetail(e)),
          ],
        ),
      ],
    );
  }

  Widget dayCell(int day, int total, List<AgendaItem> items, double width) {
    if (day < 1 || day > total) return const SizedBox(height: 64);
    final date = DateTime(month.year, month.month, day),
        active = civil(date) == civil(selected);
    final count = items.where((e) => e.date == civil(date)).length;
    return Semantics(
      button: true,
      selected: active,
      label: '${civil(date)}, $count commitments',
      child: Padding(
        padding: const EdgeInsets.all(2),
        child: InkWell(
          onTap: () => setState(() => selected = date),
          borderRadius: BorderRadius.circular(12),
          child: Container(
            constraints: BoxConstraints(minHeight: width > 650 ? 84 : 60),
            padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 2),
            decoration: BoxDecoration(
              color: active ? Palette.violet : CraftTheme.of(context).subtle,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Column(
              children: [
                Text(
                  '$day',
                  style: TextStyle(
                    color: active ? Colors.white : CraftTheme.of(context).text,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 7),
                if (count > 0)
                  Text(
                    '• ${count > 1 ? count : ''}',
                    style: TextStyle(
                      fontSize: 11,
                      color: active ? Colors.white : Palette.violet,
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget agendaRow(AgendaItem e) => FinancialLine(
    e.title,
    '${e.date} · ${e.time} · ${e.kind}',
    value: e.amount == null ? null : s.amount(e.amount!),
    icon: switch (e.kind) {
      'Career' => Icons.work_outline,
      'Personal' => Icons.event_outlined,
      'Books' => Icons.auto_stories_outlined,
      'Recurring' => Icons.event_repeat,
      _ => Icons.check_circle_outline,
    },
    onTap: () => openAgenda(e),
  );
  void openAgenda(AgendaItem e) {
    if (e.kind == 'Cards') s.finance.selectStatement(e.sourceId);
    if (e.kind == 'Personal') {
      personalDetail(c.events.firstWhere((x) => x.id == e.sourceId));
      return;
    }
    if (e.kind == 'Career') {
      applicationDetail(c.applications.firstWhere((x) => x.id == e.sourceId));
      return;
    }
    if (['Tasks', 'Learning', 'Books'].contains(e.kind)) {
      entryDetail(c.entries.firstWhere((x) => x.id == e.sourceId));
      return;
    }
    openDemoPage<void>(
      context,
      FinancePage(
        title: e.title,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            FinanceNotice(
              'Authoritative ${e.kind.toLowerCase()} source · ${e.date}. Expected commitment, not a recorded payment.',
            ),
            ReminderControls(session: s, item: e),
            if (e.kind == 'Recurring')
              PlanningScreen(session: s)
            else if (e.kind == 'Cards')
              CreditScreen(session: s)
            else
              DebtsScreen(session: s),
          ],
        ),
      ),
      'life/source/${e.id}',
    );
  }

  void personalDetail(PersonalEvent e) => openDemoPage<void>(
    context,
    FinancePage(
      title: e.title,
      child: ListenableBuilder(
        listenable: c,
        builder: (context, _) => Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            FinanceHeading(
              'PERSONAL EVENT',
              e.title,
              '${e.date} · ${e.time} · Asia/Manila\n${e.location}',
              actions: [
                OutlinedButton(
                  onPressed: () => editPersonalEvent(context, s, event: e),
                  child: const Text('Edit event'),
                ),
                TextButton(
                  onPressed: () => reviewForm(
                    context,
                    title: e.cancelled ? 'Restore event' : 'Cancel event',
                    fields: [const DemoField('reason', 'Reason')],
                    save: (v) {
                      e.cancelled = !e.cancelled;
                      e.version++;
                      e.history.add(
                        '${e.cancelled ? 'Cancelled' : 'Restored'} · ${v['reason']}',
                      );
                      c.changed();
                    },
                  ),
                  child: Text(e.cancelled ? 'Restore' : 'Cancel event'),
                ),
              ],
            ),
            Text(e.notes),
            if (!e.cancelled)
              ReminderControls(
                session: s,
                item: AgendaItem(
                  e.id,
                  e.id,
                  'Personal',
                  e.title,
                  e.date,
                  e.time,
                  e.version,
                ),
              ),
            for (final h in e.history) FinancialLine('Event history', h),
          ],
        ),
      ),
    ),
    'life/event',
  );
  Widget entries(LifeKind kind) {
    final all = c.entries.where((e) => e.kind == kind).toList();
    final visible = all
        .where(
          (e) =>
              '${e.title} ${e.detail}'.toLowerCase().contains(query) &&
              (filter == 'All' ||
                  filter == 'Archived' && e.archived ||
                  filter == 'Completed' &&
                      !e.archived &&
                      e.status == 'Completed' ||
                  filter == 'Active' && !e.archived && e.status != 'Completed'),
        )
        .toList();
    if (visible.isEmpty) {
      return const FinanceNotice(
        'Nothing here yet. Try another filter or add something you want to make time for.',
      );
    }
    if (kind == LifeKind.task) {
      return FinanceColumns(
        main: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (final priority in ['High', 'Normal', 'Low']) ...[
              if (visible.any((e) => e.priority == priority))
                SectionHeading('$priority priority'),
              for (final e in visible.where((e) => e.priority == priority))
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Checkbox(
                      value: e.status == 'Completed',
                      onChanged: e.archived
                          ? null
                          : (v) => c.progress(
                              e,
                              v! ? 1 : 0,
                              v ? 'Completed' : 'Reopened',
                            ),
                    ),
                    Expanded(
                      child: FinancialLine(
                        e.title,
                        '${e.due.isEmpty ? 'No deadline' : e.due} · ${e.status}',
                        onTap: () => entryDetail(e),
                      ),
                    ),
                  ],
                ),
            ],
          ],
        ),
        aside: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ValueBlock(
              'A LITTLE PROGRESS',
              '${all.where((e) => e.status == 'Completed').length} / ${all.length}',
              'Tasks completed · current demo snapshot',
              color: Palette.mint,
            ),
            const SizedBox(height: 20),
            const Text(
              'Make the next step small enough to start. Your history stays with you when you complete, reopen, or archive a task.',
            ),
          ],
        ),
      );
    }
    if (kind == LifeKind.book) {
      return LayoutBuilder(
        builder: (context, b) => Wrap(
          spacing: 20,
          runSpacing: 28,
          children: [
            for (var i = 0; i < visible.length; i++)
              SizedBox(
                width: b.maxWidth >= 900
                    ? (b.maxWidth - 40) / 3
                    : b.maxWidth >= 580
                    ? (b.maxWidth - 20) / 2
                    : b.maxWidth,
                child: bookTile(visible[i], i),
              ),
          ],
        ),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final e in visible)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 14),
            child: FinanceColumns(
              main: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    e.title,
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                  const SizedBox(height: 8),
                  Text(e.detail),
                  const SizedBox(height: 18),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      for (var n = 1; n <= e.total.clamp(1, 60); n++)
                        Tooltip(
                          message: 'Unit $n',
                          child: Container(
                            width: 26,
                            height: 12,
                            decoration: BoxDecoration(
                              color: n <= e.progress
                                  ? Palette.violet
                                  : CraftTheme.of(context).subtle,
                              borderRadius: BorderRadius.circular(3),
                            ),
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Text('${e.progress} of ${e.total} units · ${e.status}'),
                  TextButton(
                    onPressed: () => entryDetail(e),
                    child: const Text('Open learning journal →'),
                  ),
                ],
              ),
              aside: ValueBlock(
                'NEXT MILESTONE',
                e.due.isEmpty ? 'At your pace' : e.due,
                '${e.total - e.progress} units to go. Record your progress and what you learned.',
                color: Palette.lilac,
              ),
            ),
          ),
      ],
    );
  }

  Widget bookTile(LifeEntry e, int index) => InkWell(
    onTap: () => entryDetail(e),
    borderRadius: BorderRadius.circular(20),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          constraints: const BoxConstraints(minHeight: 220),
          padding: const EdgeInsets.fromLTRB(28, 28, 24, 24),
          decoration: BoxDecoration(
            color: [Palette.lilac, Palette.peach, Palette.mint][index % 3],
            borderRadius: BorderRadius.circular(12),
            border: const Border(
              left: BorderSide(color: Palette.ink, width: 7),
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'THE READING ROOM',
                style: TextStyle(
                  fontSize: 10,
                  letterSpacing: 2,
                  color: Palette.ink,
                ),
              ),
              const SizedBox(height: 28),
              Text(
                e.title,
                style: const TextStyle(
                  fontSize: 27,
                  height: 1.1,
                  color: Palette.ink,
                ),
              ),
              const SizedBox(height: 20),
              Text(e.detail, style: const TextStyle(color: Palette.ink)),
              const SizedBox(height: 22),
              const Icon(Icons.auto_stories_outlined, color: Palette.ink),
            ],
          ),
        ),
        const SizedBox(height: 12),
        ExactBar(
          label: '${e.progress} / ${e.total} pages',
          value: '${e.progress * 100 ~/ e.total}%',
          amount: BigInt.from(e.progress),
          total: BigInt.from(e.total),
          color: Palette.violet,
        ),
        Text('${e.status} · ${e.due}'),
      ],
    ),
  );
  void entryDetail(LifeEntry e) => openDemoPage<void>(
    context,
    FinancePage(
      title: e.title,
      child: ListenableBuilder(
        listenable: c,
        builder: (context, _) => Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            FinanceHeading(
              'LIFE / ${e.kind.name.toUpperCase()} PRESET',
              e.title,
              '${e.detail}\n${e.status}${e.archived ? ' · archived' : ''} · ${e.due.isEmpty ? 'No deadline' : e.due}',
              actions: [
                OutlinedButton(
                  onPressed: () => editLifeEntry(context, s, e.kind, entry: e),
                  child: const Text('Edit details'),
                ),
                TextButton(
                  onPressed: () => c.archive(e),
                  child: Text(e.archived ? 'Restore' : 'Archive'),
                ),
              ],
            ),
            if (e.kind != LifeKind.task)
              ExactBar(
                label: 'Progress',
                value: '${e.progress} / ${e.total}',
                amount: BigInt.from(e.progress),
                total: BigInt.from(e.total),
                color: Palette.violet,
              ),
            Text(e.notes),
            const SizedBox(height: 16),
            if (!e.archived)
              FilledButton(
                onPressed: () => e.kind == LifeKind.task
                    ? c.progress(
                        e,
                        e.status == 'Completed' ? 0 : 1,
                        e.status == 'Completed' ? 'Reopened' : 'Completed',
                      )
                    : reviewForm(
                        context,
                        title: 'Log progress · ${e.title}',
                        fields: [
                          DemoField(
                            'progress',
                            e.kind == LifeKind.book
                                ? 'Pages read'
                                : 'Completed units',
                            value: '${e.progress}',
                          ),
                          const DemoField(
                            'note',
                            'Progress note',
                            required: false,
                            lines: 3,
                          ),
                        ],
                        save: (v) => c.progress(
                          e,
                          int.tryParse(v['progress']!) ?? -1,
                          v['note']!,
                        ),
                      ),
                child: Text(
                  e.kind == LifeKind.task
                      ? (e.status == 'Completed'
                            ? 'Reopen task'
                            : 'Complete task')
                      : 'Log progress',
                ),
              ),
            if (!e.archived && e.status != 'Completed' && e.due.isNotEmpty)
              ReminderControls(
                session: s,
                item: AgendaItem(
                  e.id,
                  e.id,
                  e.kind.name,
                  e.title,
                  e.due,
                  'All day',
                  e.version,
                ),
              ),
            const SizedBox(height: 24),
            const SectionHeading('Your progress history'),
            for (final h in e.history.reversed)
              FinancialLine('Retained revision', h, icon: Icons.history),
          ],
        ),
      ),
    ),
    'life/entry/${e.id}',
  );
  void applicationForm([CareerApplication? a]) => reviewForm(
    context,
    title: a == null ? 'New application' : 'Edit application',
    draftKey: a?.id ?? 'new-career',
    revision: () => c.revision,
    fields: [
      DemoField('company', 'Company', value: a?.company ?? ''),
      DemoField('position', 'Position', value: a?.position ?? ''),
      DemoField('date', 'Application date', value: a?.date ?? '2026-10-21'),
      DemoField(
        'stage',
        'Stage',
        value: a?.stage ?? 'Saved',
        options: options([
          'Saved',
          'Applied',
          'Screening',
          'Assessment',
          'Interview',
          'Offer',
          'Accepted',
          'Rejected',
          'Withdrawn',
        ]),
      ),
      DemoField(
        'location',
        'Location / work arrangement',
        value: a?.location ?? '',
        required: false,
      ),
      DemoField(
        'notes',
        'Notes',
        value: a?.notes ?? '',
        required: false,
        lines: 3,
      ),
      if (a != null) const DemoField('reason', 'Reason'),
    ],
    save: (v) => c.saveApplication(v, old: a),
  );
  Widget career() {
    final all = c.applications
        .where(
          (a) =>
              '${a.company} ${a.position}'.toLowerCase().contains(query) &&
              (filter == 'All' ||
                  filter == 'Archived' && a.archived ||
                  filter == 'Completed' &&
                      !a.archived &&
                      ['Accepted', 'Rejected', 'Withdrawn'].contains(a.stage) ||
                  filter == 'Active' &&
                      !a.archived &&
                      !['Accepted', 'Rejected', 'Withdrawn'].contains(a.stage)),
        )
        .toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final t in [
              'All',
              'Saved',
              'Applied',
              'Screening',
              'Assessment',
              'Interview',
              'Offer',
              'Accepted',
              'Rejected',
              'Withdrawn',
            ])
              ChoiceChip(
                label: Text(t),
                selected: stage == t,
                onSelected: (_) => setState(() => stage = t),
              ),
          ],
        ),
        const SizedBox(height: 24),
        FinanceColumns(
          main: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (final a in all.where(
                (a) => stage == 'All' || a.stage == stage,
              ))
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  child: InkWell(
                    onTap: () => applicationDetail(a),
                    child: Container(
                      padding: const EdgeInsets.fromLTRB(18, 8, 8, 16),
                      decoration: BoxDecoration(
                        border: Border(
                          left: BorderSide(
                            width: 4,
                            color: a.stage == 'Interview'
                                ? Palette.violet
                                : Palette.mint,
                          ),
                        ),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text(
                            a.company,
                            style: Theme.of(context).textTheme.headlineSmall,
                          ),
                          const SizedBox(height: 8),
                          Text(a.position),
                          const SizedBox(height: 12),
                          Wrap(
                            spacing: 12,
                            runSpacing: 8,
                            children: [
                              Chip(label: Text(a.stage)),
                              Text('${a.date} · ${a.location}'),
                            ],
                          ),
                          TextButton(
                            onPressed: () => applicationDetail(a),
                            child: const Text('Application story →'),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              if (!all.any((a) => stage == 'All' || a.stage == stage))
                const FinanceNotice(
                  'No applications match. Keep a role here when you find a good possibility.',
                ),
            ],
          ),
          aside: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ValueBlock(
                'IN MOTION',
                '${all.length}',
                'Applications in this view. Stages are your records, never inferred employer decisions.',
                color: Palette.peach,
              ),
              const SizedBox(height: 20),
              const SectionHeading('Next conversations'),
              for (final a in all)
                for (final e in a.events.where((e) => !e.complete))
                  FinancialLine(
                    a.company,
                    '${e.kind} · ${e.date} ${e.time}',
                    icon: Icons.work_outline,
                    onTap: () => applicationDetail(a),
                  ),
            ],
          ),
        ),
      ],
    );
  }

  void careerEventForm(CareerApplication a, [CareerEvent? e]) => reviewForm(
    context,
    title: e == null ? 'Add career event' : 'Edit career event',
    draftKey: e?.id ?? 'new-career-event-${a.id}',
    revision: () => c.revision,
    fields: [
      DemoField(
        'kind',
        'Type',
        value: e?.kind ?? 'Interview',
        options: options(['Interview', 'Assessment', 'Follow-up']),
      ),
      DemoField('date', 'Date', value: e?.date ?? '2026-10-23'),
      DemoField('time', 'Time · Asia/Manila', value: e?.time ?? '10:00'),
      DemoField(
        'notes',
        'Location, preparation and notes',
        value: e?.notes ?? '',
        required: false,
        lines: 3,
      ),
    ],
    save: (v) => c.saveCareerEvent(a, v, old: e),
  );
  void applicationDetail(CareerApplication a) => openDemoPage<void>(
    context,
    FinancePage(
      title: a.company,
      child: ListenableBuilder(
        listenable: c,
        builder: (context, _) => Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            FinanceHeading(
              'CAREER / ${a.stage.toUpperCase()}',
              a.position,
              '${a.company} · ${a.location}\nApplied ${a.date}${a.archived ? ' · archived' : ''}',
              actions: [
                OutlinedButton(
                  onPressed: () => applicationForm(a),
                  child: const Text('Edit / change stage'),
                ),
                FilledButton(
                  onPressed: a.archived ? null : () => careerEventForm(a),
                  child: const Text('Add interview / follow-up'),
                ),
                TextButton(
                  onPressed: () {
                    a.archived = !a.archived;
                    a.version++;
                    a.history.add(
                      a.archived
                          ? 'Archived; future reminders cancelled'
                          : 'Restored',
                    );
                    c.changed();
                  },
                  child: Text(a.archived ? 'Restore' : 'Archive'),
                ),
              ],
            ),
            Text(a.notes),
            const SizedBox(height: 24),
            const SectionHeading('Conversations & milestones'),
            for (final e in a.events)
              Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  FinancialLine(
                    e.kind,
                    '${e.date} · ${e.time} · ${e.complete ? 'Completed' : 'Planned'}\n${e.notes}',
                    icon: Icons.event_note,
                    onTap: () => careerEventForm(a, e),
                  ),
                  TextButton(
                    onPressed: () {
                      e.complete = !e.complete;
                      e.version++;
                      a.history.add(
                        '${e.kind} ${e.complete ? 'completed' : 'reopened'}',
                      );
                      c.changed();
                    },
                    child: Text(
                      e.complete ? 'Reopen event' : 'Mark event complete',
                    ),
                  ),
                  if (!e.complete && !a.archived)
                    ReminderControls(
                      session: s,
                      item: AgendaItem(
                        e.id,
                        a.id,
                        'Career',
                        '${e.kind} · ${a.company}',
                        e.date,
                        e.time,
                        e.version + a.version,
                      ),
                    ),
                ],
              ),
            const SectionHeading('Documents'),
            SupportingFilesLink(session: s, source: 'career:${a.id}'),
            for (final file in s.finance.files.files.where(
              (f) => f.source == 'career:${a.id}',
            ))
              FinancialLine(
                file.name,
                file.state,
                icon: Icons.description_outlined,
              ),
            const SectionHeading('Application history'),
            for (final h in a.history.reversed)
              FinancialLine('History', h, icon: Icons.history),
          ],
        ),
      ),
    ),
    'life/career/${a.id}',
  );
}

class ReminderControls extends StatelessWidget {
  const ReminderControls({
    super.key,
    required this.session,
    required this.item,
  });
  final PrototypeSession session;
  final AgendaItem item;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 16),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Reminder · ${session.life.reminderState(item)}'),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final mode in [
              'Inherited',
              '1 day before',
              '1 hour before',
              'Off',
            ])
              ChoiceChip(
                label: Text(mode),
                selected:
                    (session.life.reminders[item.id]?.mode ?? 'Inherited') ==
                    mode,
                onSelected: (_) => session.life.reminder(
                  item,
                  mode,
                  'Planned on this device · demo only',
                ),
              ),
          ],
        ),
        Wrap(
          spacing: 8,
          children: [
            for (final action in ['Snoozed 1 hour', 'Dismissed', 'Restored'])
              TextButton(
                onPressed: () => session.life.reminder(
                  item,
                  session.life.reminders[item.id]?.mode ?? 'Inherited',
                  action,
                ),
                child: Text(action),
              ),
          ],
        ),
        const Text(
          'Device-local simulation. Dismissing is not completion or payment. No notification is delivered.',
          style: TextStyle(fontSize: 12),
        ),
      ],
    ),
  );
}

class ReminderCenter extends StatelessWidget {
  const ReminderCenter({super.key, required this.session});
  final PrototypeSession session;
  @override
  Widget build(BuildContext context) => FinancePage(
    title: 'Reminders',
    child: ListenableBuilder(
      listenable: session,
      builder: (context, _) {
        final c = session.life,
            items = session.life.agenda(
              session.planning,
              session.finance,
              financial: session.complete,
            );
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const FinanceHeading(
              'THIS DEVICE / REMINDERS',
              'A useful nudge.',
              'In-app and local notification presentation only. Delivery is best effort and can differ between devices.',
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Notification permission · simulated'),
              value: c.permission,
              onChanged: (v) {
                c.permission = v;
                c.changed();
              },
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Quiet hours'),
              subtitle: Text('${c.quietStart}–${c.quietEnd} · Asia/Manila'),
              value: c.quietHours,
              onChanged: (v) {
                c.quietHours = v;
                c.changed();
              },
            ),
            TextButton(
              onPressed: () => reviewForm(
                context,
                title: 'Quiet hours',
                fields: [
                  DemoField('start', 'Start HH:MM', value: c.quietStart),
                  DemoField('end', 'End HH:MM', value: c.quietEnd),
                ],
                save: (v) {
                  LifeController.validateTime(v['start']!);
                  LifeController.validateTime(v['end']!);
                  c.quietStart = v['start']!;
                  c.quietEnd = v['end']!;
                  c.changed();
                },
              ),
              child: const Text('Edit quiet hours'),
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Show sensitive content on lock screen'),
              subtitle: const Text(
                'Hidden by default. This changes the demo preference only.',
              ),
              value: c.sensitiveContent,
              onChanged: (v) {
                c.sensitiveContent = v;
                c.changed();
              },
            ),
            const FinanceNotice(
              'Android battery restrictions and Windows background availability may delay reminders. Each device has separate consent; global exactly-once delivery is not promised.',
            ),
            for (final item in items.take(20))
              ExpansionTile(
                key: PageStorageKey('reminder-${item.id}'),
                title: Text(item.title),
                subtitle: Text('${item.date} · ${c.reminderState(item)}'),
                children: [ReminderControls(session: session, item: item)],
              ),
            if (items.length > 20)
              Text(
                'Showing next 20 of ${items.length}; full sources are in Calendar.',
              ),
            const SectionHeading('Retained reminder history'),
            for (final h in c.reminderHistory.reversed)
              FinancialLine('Source generation', h),
            for (final e in c.reminders.entries.where(
              (e) => !items.any((i) => i.id == e.key),
            ))
              FinancialLine('Cancelled stale reminder', e.key),
          ],
        );
      },
    ),
  );
}
