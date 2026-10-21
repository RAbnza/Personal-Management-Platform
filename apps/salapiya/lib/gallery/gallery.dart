import 'package:flutter/material.dart';

import '../design_system/components.dart';
import '../design_system/craft.dart';
import '../design_system/theme.dart';
import 'settings.dart';
import 'specimens.dart';

class GalleryHome extends StatelessWidget {
  const GalleryHome({super.key, required this.settings});
  final GallerySettings settings;

  void controls(BuildContext context) => showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    sheetAnimationStyle: MediaQuery.disableAnimationsOf(context)
        ? AnimationStyle.noAnimation
        : null,
    builder: (context) => ListenableBuilder(
      listenable: settings,
      builder: (context, _) => SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SectionTitle(
              'Your viewing preferences',
              caption: 'Demo only. Closing the app resets every change.',
            ),
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
              title: const Text('Craft effects'),
              subtitle: const Text(
                'Lattice motifs, focal gradients and shadows',
              ),
              value: settings.effects,
              onChanged: (v) => settings.change(() => settings.effects = v),
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Reduce motion'),
              subtitle: const Text('System reduced motion is always respected'),
              value: settings.reduceMotion,
              onChanged: (v) =>
                  settings.change(() => settings.reduceMotion = v),
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Compact specimens'),
              value: settings.compact,
              onChanged: (v) => settings.change(() => settings.compact = v),
            ),
            DropdownButtonFormField<double>(
              initialValue: settings.textScale ?? 0,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Text size preview'),
              items: const [
                DropdownMenuItem(value: 0, child: Text('System text size')),
                DropdownMenuItem(value: 1, child: Text('100%')),
                DropdownMenuItem(value: 1.5, child: Text('150%')),
                DropdownMenuItem(value: 2, child: Text('200%')),
              ],
              onChanged: (v) =>
                  settings.change(() => settings.textScale = v == 0 ? null : v),
            ),
            const SizedBox(height: 24),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                OutlinedButton(
                  onPressed: () {
                    settings.reset();
                    Navigator.pop(context);
                  },
                  child: const Text('Reset gallery'),
                ),
                FilledButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text('Done'),
                ),
                TextButton(
                  onPressed: () => showLicensePage(
                    context: context,
                    applicationName: 'Salapiya design gallery',
                  ),
                  child: const Text('Licenses'),
                ),
              ],
            ),
          ],
        ),
      ),
    ),
  );

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, bounds) {
      final wide =
          bounds.maxWidth >= 1050 &&
          MediaQuery.textScalerOf(context).scale(14) <= 21;
      final c = CraftTheme.of(context);
      return Scaffold(
        body: SafeArea(
          child: Row(
            children: [
              if (wide)
                Container(
                  width: 248,
                  decoration: BoxDecoration(
                    color: c.surface,
                    border: Border(right: BorderSide(color: c.divider)),
                  ),
                  child: ListView(
                    padding: const EdgeInsets.all(24),
                    children: [
                      const Row(
                        children: [
                          BrandMark(size: 40),
                          SizedBox(width: 12),
                          Expanded(
                            child: Text(
                              'Salapiya',
                              style: TextStyle(
                                fontSize: 24,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 36),
                      Text(
                        'DESIGN ATELIER',
                        style: TextStyle(
                          color: c.secondary,
                          fontSize: 12,
                          letterSpacing: 1.6,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 16),
                      for (final section in GallerySection.values)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: Material(
                            type: MaterialType.transparency,
                            child: ListTile(
                              contentPadding: const EdgeInsets.symmetric(
                                horizontal: 12,
                              ),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                              selected: settings.section == section,
                              selectedTileColor: c.selection,
                              selectedColor: c.primary,
                              leading: Icon(section.icon, size: 20),
                              title: Text(section.label),
                              onTap: () => settings.change(
                                () => settings.section = section,
                              ),
                            ),
                          ),
                        ),
                      const SizedBox(height: 40),
                      const CraftMotif(size: 72),
                      const SizedBox(height: 16),
                      Text(
                        'A little craft.\nA clearer everyday.',
                        style: TextStyle(color: c.secondary),
                      ),
                    ],
                  ),
                ),
              Expanded(
                child: Column(
                  children: [
                    Container(
                      decoration: BoxDecoration(
                        color: c.surface,
                        border: Border(bottom: BorderSide(color: c.divider)),
                      ),
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 8,
                      ),
                      child: Row(
                        children: [
                          if (!wide)
                            const Padding(
                              padding: EdgeInsets.only(right: 12),
                              child: BrandMark(size: 32),
                            ),
                          Expanded(
                            child: wide
                                ? Text(
                                    'Luminous Lattice / Component collection',
                                    style: TextStyle(color: c.secondary),
                                  )
                                : DropdownButtonHideUnderline(
                                    child: DropdownButton<GallerySection>(
                                      isExpanded: true,
                                      value: settings.section,
                                      items: [
                                        for (final s in GallerySection.values)
                                          DropdownMenuItem(
                                            value: s,
                                            child: Text(
                                              s.label,
                                              overflow: TextOverflow.ellipsis,
                                            ),
                                          ),
                                      ],
                                      onChanged: (v) => settings.change(
                                        () => settings.section = v!,
                                      ),
                                    ),
                                  ),
                          ),
                          const Tooltip(
                            message: 'Demonstration mode. Synthetic data; changes reset on close.',
                            child: Padding(
                              padding: EdgeInsets.symmetric(horizontal: 8),
                              child: Text(
                                'DEMO',
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                          ),
                          IconButton(
                            tooltip: 'Viewing preferences',
                            onPressed: () => controls(context),
                            icon: const Icon(Icons.tune_rounded),
                          ),
                        ],
                      ),
                    ),
                    Expanded(
                      child: SingleChildScrollView(
                        key: PageStorageKey(settings.section),
                        padding: EdgeInsets.all(
                          bounds.maxWidth < 600 ? 16 : 32,
                        ),
                        child: Align(
                          alignment: Alignment.topCenter,
                          child: ConstrainedBox(
                            constraints: const BoxConstraints(maxWidth: 1280),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                Text(
                                  'D1R  /  INTERACTIVE DESIGN STUDY',
                                  style: TextStyle(
                                    fontSize: 12,
                                    letterSpacing: 1.3,
                                    fontWeight: FontWeight.w700,
                                    color: c.primary,
                                  ),
                                ),
                                const SizedBox(height: 12),
                                Text(
                                  settings.section.label,
                                  style: Theme.of(context)
                                      .textTheme
                                      .headlineMedium,
                                ),
                                const SizedBox(height: 12),
                                Text(
                                  'Demonstration · Synthetic data only. Changes reset when you close the app.',
                                  style: TextStyle(color: c.secondary),
                                ),
                                const SizedBox(height: 28),
                                GallerySpecimens(
                                  key: ValueKey(
                                    '${settings.section.name}-${settings.resetRevision}',
                                  ),
                                  section: settings.section,
                                  compact: settings.compact,
                                ),
                                const SizedBox(height: 32),
                                Text(
                                  'SALAPIYA  /  LUMINOUS LATTICE  /  OWNER REVIEW',
                                  style: TextStyle(
                                    color: c.secondary,
                                    fontSize: 12,
                                    letterSpacing: 1,
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
            ],
          ),
        ),
      );
    },
  );
}
