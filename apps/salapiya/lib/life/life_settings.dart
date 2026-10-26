import 'package:flutter/material.dart';

import '../features/common/prototype_form.dart';
import '../features/finance/presentation/financial_widgets.dart';
import '../prototype/scenarios.dart';
import 'device_reminders.dart';
import 'life_controller.dart';
import 'life_form.dart';

class LifeSettings extends StatelessWidget {
  const LifeSettings({super.key, required this.session});
  final PrototypeSession session;
  @override
  Widget build(BuildContext context) {
    final c = session.life as DurableLifeController;
    return FinancePage(
      title: 'Life preferences & help',
      child: ListenableBuilder(
        listenable: c,
        builder: (context, _) => Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const FinanceHeading(
              'LIFE / YOUR SPACE',
              'Make room for what matters.',
              'Visibility changes the navigation or Calendar view on this device. It never deletes records or turns off reminders.',
            ),
            for (final tab in ['Tasks', 'Learning', 'Books', 'Career'])
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: Text('Show $tab in Life navigation'),
                value: c.tabVisible(tab),
                onChanged: (v) => lifeAction(
                  context,
                  () => c.saveViewPreferences({
                    ...c.viewPreferences,
                    'tabs': {...c.viewPreferences['tabs'] as Map, tab: v},
                  }),
                ),
              ),
            const SizedBox(height: 16),
            const Text('Calendar source visibility'),
            for (final module in reminderModules)
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(module),
                value: c.calendarVisible(module),
                onChanged: (v) => lifeAction(
                  context,
                  () => c.saveViewPreferences({
                    ...c.viewPreferences,
                    'calendar': {
                      ...c.viewPreferences['calendar'] as Map,
                      module: v,
                    },
                  }),
                ),
              ),
            TextButton(
              onPressed: () => lifeReviewForm(
                context,
                session,
                title: 'Calendar display timezone',
                draftKey: 'calendar-timezone',
                fields: [
                  DemoField(
                    'timezone',
                    'IANA display timezone',
                    value: c.displayTimezone,
                  ),
                ],
                save: (v) => c.saveViewPreferences({
                  ...c.viewPreferences,
                  'timezone': v['timezone'],
                }),
              ),
              child: Text('Display timezone: ${c.displayTimezone}'),
            ),
            const FinanceNotice(
              'Calendar entries open their authoritative sources. Dates without a time stay civil dates. Timed appointments retain UTC and their original IANA timezone; ambiguous local times require an explicit occurrence. Calendar visibility and notification preferences are independent.',
            ),
            const FinanceNotice(
              'Tasks have explicit statuses. A manual completion date is a field value, not a history timestamp. Progress actions explicitly map reaching the total to Completed; editing totals or page counts alone does not complete a record. Archive retains history, and restore uses the current source generation.',
            ),
            const FinanceNotice(
              'Career attempts are independent, including repeated applications to one employer. Stages may repeat or skip. No response is dated observation evidence, never an inferred rejection. Salary is private Career information and never income. Supporting bytes stay on the device until cloud storage and scanning are verified.',
            ),
            const FinanceNotice(
              'Saved on device, waiting for acceptance, and synchronized are different states. A conflicting edit remains in review with its original command. Back retains protected drafts. Native notification permission, quiet hours and schedules belong to this device and are rebuilt after recovery with consent off.',
            ),
          ],
        ),
      ),
    );
  }
}
