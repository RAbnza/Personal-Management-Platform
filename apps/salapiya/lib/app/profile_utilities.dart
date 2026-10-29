import 'package:flutter/material.dart';

import '../design_system/components.dart';
import '../gallery/gallery.dart';
import '../gallery/settings.dart';
import '../prototype/scenarios.dart';
import 'demo_routes.dart';
import '../features/profile/presentation/profile_experience.dart';
import '../features/finance/presentation/financial_widgets.dart';
import '../local/local_profile_view.dart';
import '../local/local_runtime.dart';

class ProfileUtilities extends StatelessWidget {
  const ProfileUtilities({
    super.key,
    required this.settings,
    required this.session,
  });
  final GallerySettings settings;
  final PrototypeSession session;
  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: Listenable.merge([settings, session]),
    builder: (context, _) => session is LocalSession
        ? LocalProfileView(session: session as LocalSession, settings: settings)
        : DemoPage(
            title: 'Profile & utilities',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SectionTitle(
                  '${session.profile.name} · Demo profile',
                  caption: 'Fictional profile. All preferences and scenarios reset when the application closes.',
                ),
                StatusNotice('${session.syncLabel}\n${session.coverage}'),
                FinancialLine(
                  'Profile, connection & recovery',
                  'Onboarding · Google simulation · devices · backups · lifecycle · help',
                  icon: Icons.manage_accounts_outlined,
                  onTap: () => openDemoPage<void>(
                    context,
                    ProfileExperience(session: session, settings: settings),
                    'profile/experience',
                  ),
                ),
                const SizedBox(height: 24),
                DropdownButtonFormField<OverviewScenario>(
                  key: ValueKey(session.scenario),
                  initialValue: session.scenario,
                  isExpanded: true,
                  decoration: const InputDecoration(
                    labelText: 'Overview scenario',
                  ),
                  items: [
                    for (final scenario in OverviewScenario.values)
                      DropdownMenuItem(
                        value: scenario,
                        child: Text(scenario.label),
                      ),
                  ],
                  onChanged: (value) {
                    if (value != null) session.select(value);
                  },
                ),
                const SizedBox(height: 24),
                const SectionTitle('Make yourself comfortable'),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final mode in ThemeMode.values)
                      ChoiceChip(
                        label: Text(
                          '${mode.name[0].toUpperCase()}${mode.name.substring(1)}',
                        ),
                        selected: settings.themeMode == mode,
                        onSelected: (_) =>
                            settings.change(() => settings.themeMode = mode),
                      ),
                  ],
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Hide amounts'),
                  subtitle: const Text(
                    'Masks figures in the product preview and its source details.',
                  ),
                  value: session.hideAmounts,
                  onChanged: (_) => session.togglePrivacy(),
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Craft effects'),
                  subtitle: const Text(
                    'Optional motifs, gradients and shadows',
                  ),
                  value: settings.effects,
                  onChanged: (v) => settings.change(() => settings.effects = v),
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Reduce motion'),
                  subtitle: const Text(
                    'System reduced motion is always respected',
                  ),
                  value: settings.reduceMotion,
                  onChanged: (v) =>
                      settings.change(() => settings.reduceMotion = v),
                ),
                DropdownButtonFormField<double>(
                  initialValue: settings.textScale ?? 0,
                  isExpanded: true,
                  decoration: const InputDecoration(
                    labelText: 'Text size preview',
                  ),
                  items: const [
                    DropdownMenuItem(value: 0, child: Text('System text size')),
                    DropdownMenuItem(value: 1, child: Text('100%')),
                    DropdownMenuItem(value: 1.5, child: Text('150%')),
                    DropdownMenuItem(value: 2, child: Text('200%')),
                  ],
                  onChanged: (v) => settings.change(
                    () => settings.textScale = v == 0 ? null : v,
                  ),
                ),
                const SizedBox(height: 24),
                const SectionTitle('Explore the prototype'),
                OutlinedButton.icon(
                  onPressed: () => openDemoPage<void>(
                    context,
                    ProfileExperience(
                      session: session,
                      settings: settings,
                      initial: 'Welcome',
                    ),
                    'first-run',
                  ),
                  icon: const Icon(Icons.waving_hand_outlined),
                  label: const Text('First-run preview'),
                ),
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  onPressed: () => openDemoPage<void>(
                    context,
                    GalleryUtility(settings: settings),
                    'design-gallery',
                  ),
                  icon: const Icon(Icons.palette_outlined),
                  label: const Text('Design Gallery'),
                ),
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 12),
                  child: Text(
                    'Development / design utility. Gallery specimens use their own synthetic amounts and are not covered by the product privacy toggle.',
                  ),
                ),
                TextButton(
                  onPressed: session.reset,
                  child: const Text('Reset demo scenario'),
                ),
                TextButton(
                  onPressed: () => showLicensePage(
                    context: context,
                    applicationName: 'Salapiya',
                  ),
                  child: const Text('Licenses'),
                ),
              ],
            ),
          ),
  );
}

class GalleryUtility extends StatelessWidget {
  const GalleryUtility({super.key, required this.settings});
  final GallerySettings settings;
  @override
  Widget build(BuildContext context) => RouteEscape(
    child: Scaffold(
      appBar: AppBar(title: const Text('Design Gallery · utility')),
      body: ListenableBuilder(
        listenable: settings,
        builder: (_, _) => GalleryHome(settings: settings),
      ),
    ),
  );
}
