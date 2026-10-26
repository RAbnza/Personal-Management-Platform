import 'package:flutter/material.dart';

import '../design_system/editorial.dart';

import '../features/common/prototype_form.dart';
import '../features/finance/presentation/financial_widgets.dart';
import '../features/life/application/life_controller.dart';
import '../prototype/scenarios.dart';
import 'device_reminders.dart';
import 'life_controller.dart';
import 'life_form.dart';
import 'native_notifications.dart';

class NativeReminderCenter extends StatelessWidget {
  const NativeReminderCenter({super.key, required this.session});
  final PrototypeSession session;
  @override
  Widget build(BuildContext context) {
    final c = session.life as DurableLifeController, d = c.device;
    return FinancePage(
      title: 'Reminders',
      child: ListenableBuilder(
        listenable: c,
        builder: (context, _) => Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const FinanceHeading(
              'THIS DEVICE / REMINDERS',
              'A useful nudge.',
              'Notifications are optional and private. Dismissing, snoozing or receiving a reminder never completes a task, attends an interview or posts money.',
            ),
            if (d == null)
              const FinanceNotice(
                'Native registration unavailable. Your in-app commitments remain usable.',
              )
            else ...[
              FinanceNotice(d.status),
              if (d.ready &&
                  d.preferences['enabled'] == true &&
                  d.device is NativeNotificationDevice)
                TextButton(
                  onPressed: () => lifeAction(context, () async {
                    await (d.device as NativeNotificationDevice).showTest();
                    await d.reconcile();
                  }),
                  child: const Text('Send private test notification'),
                ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Enable notifications on this device'),
                subtitle: const Text(
                  'Android requests OS permission. Windows uses its system notification settings.',
                ),
                value: d.preferences['enabled'] == true,
                onChanged: (v) => lifeAction(
                  context,
                  () => d.configure({'enabled': v}, request: v),
                ),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Quiet hours'),
                subtitle: Text(
                  '${d.preferences['start']}–${d.preferences['end']} · ${d.preferences['timezone']}',
                ),
                value: d.preferences['quiet'] == true,
                onChanged: (v) =>
                    lifeAction(context, () => d.configure({'quiet': v})),
              ),
              TextButton(
                onPressed: () => lifeReviewForm(
                  context,
                  session,
                  title: 'Reminder timing',
                  draftKey: 'reminder-timing',
                  fields: [
                    DemoField(
                      'start',
                      'Quiet start HH:MM',
                      value: d.preferences['start'] as String,
                    ),
                    DemoField(
                      'end',
                      'Quiet end HH:MM',
                      value: d.preferences['end'] as String,
                    ),
                    DemoField(
                      'timezone',
                      'IANA timezone or Device',
                      value: d.preferences['timezone'] as String,
                    ),
                  ],
                  save: (v) => d.configure({
                    'start': v['start'],
                    'end': v['end'],
                    'timezone': v['timezone'],
                  }),
                ),
                child: const Text('Edit timing and timezone'),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Include due date in notification'),
                subtitle: const Text(
                  'Titles, amounts, company names, contacts and notes remain private.',
                ),
                value: d.preferences['showDate'] == true,
                onChanged: (v) =>
                    lifeAction(context, () => d.configure({'showDate': v})),
              ),
              const SectionHeading('Modules on this device'),
              for (final module in reminderModules)
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(module),
                  value: (d.preferences['modules'] as Map)[module] == true,
                  onChanged: (v) => lifeAction(
                    context,
                    () => d.configure({
                      'modules': {
                        ...d.preferences['modules'] as Map,
                        module: v,
                      },
                    }),
                  ),
                ),
              OutlinedButton(
                onPressed: () => lifeAction(context, d.reconcile),
                child: const Text('Recheck permission and schedules'),
              ),
              const FinanceNotice(
                'Only the nearest 128 eligible reminders within 90 days are registered. Date-only deadlines use 09:00 in the selected timezone. Android uses inexact alarms. App launch/resume revalidates sources; a closed device cannot learn another device’s changes. Windows uses a per-user development shortcut and activator; signed upgrade and closed-app relaunch remain separate acceptance gates.',
              ),
              for (final item in d.sources().take(25))
                ExpansionTile(
                  key: PageStorageKey('native-reminder-${item.id}'),
                  title: Text(item.title),
                  subtitle: Text('${item.date} · ${d.state(item)}'),
                  children: [
                    NativeReminderControls(session: session, item: item),
                  ],
                ),
              const SectionHeading('Device scheduling evidence'),
              const Text(
                'Scheduled means registered with the OS, not displayed or read. Elapsed reminders are never automatically resent.',
              ),
              FutureBuilder(
                future: d.history(),
                builder: (context, snapshot) => Column(
                  children: [
                    for (final row in snapshot.data ?? <Map<String, dynamic>>[])
                      FinancialLine(
                        row['state'] as String,
                        '${row['due_utc']} · ${row['source_id']}',
                      ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class NativeReminderControls extends StatelessWidget {
  const NativeReminderControls({
    super.key,
    required this.session,
    required this.item,
  });
  final PrototypeSession session;
  final AgendaItem item;
  @override
  Widget build(BuildContext context) {
    final c = session.life as DurableLifeController, d = c.device;
    final current = d
        ?.sources()
        .where((r) => r.id == item.id || r.id == 'life:${item.id}')
        .firstOrNull;
    if (d == null || current == null) {
      return const FinanceNotice(
        'This source is outside the 90-day reminder horizon or is no longer eligible. Calendar and source history remain available.',
      );
    }
    final mode = (d.choices[current.id] as Map?)?['mode'] ?? 'Inherited';
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Reminder · ${d.state(current)}'),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final choice in reminderModes)
                ChoiceChip(
                  label: Text(choice),
                  selected: mode == choice,
                  onSelected: (_) => lifeAction(
                    context,
                    () => c.reminder(current, choice, 'Planned'),
                  ),
                ),
            ],
          ),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final action in ['Snoozed 1 hour', 'Dismissed', 'Restored'])
                TextButton(
                  onPressed: () => lifeAction(
                    context,
                    () => c.reminder(current, mode as String, action),
                  ),
                  child: Text(action),
                ),
            ],
          ),
          const Text(
            'This controls only the reminder on this device. Use the source workflow to complete, cancel, or pay.',
          ),
        ],
      ),
    );
  }
}
