import 'package:flutter/material.dart';

import '../../../app/demo_routes.dart';
import '../../../design_system/craft.dart';
import '../../../design_system/editorial.dart';
import '../../../design_system/theme.dart';
import '../../../gallery/settings.dart';
import '../../../prototype/scenarios.dart';
import '../../common/prototype_form.dart';
import '../../finance/presentation/financial_widgets.dart';
import '../../life/presentation/life_screen.dart';
import '../../planning/presentation/planning_screen.dart';

class ProfileExperience extends StatefulWidget {
  const ProfileExperience({
    super.key,
    required this.session,
    required this.settings,
    this.initial = 'Profile',
  });
  final PrototypeSession session;
  final GallerySettings settings;
  final String initial;
  @override
  State<ProfileExperience> createState() => _ProfileExperienceState();
}

class _ProfileExperienceState extends State<ProfileExperience> {
  late String section = widget.initial;
  String connectScenario = 'New cloud profile',
      restoreScenario = 'Valid archive',
      restoreMode = 'Local recovery';
  bool includeFiles = true, backupReviewed = false;
  PrototypeSession get s => widget.session;
  void review(
    String title,
    List<DemoField> fields,
    void Function(Map<String, String>) save, {
    String? explanation,
  }) => reviewForm(
    context,
    title: title,
    fields: fields,
    save: save,
    explanation: explanation ?? 'Simulation only. No authentication, connectivity, encryption, storage or deletion occurs.',
  );
  @override
  Widget build(BuildContext context) => FinancePage(
    title: 'Your space',
    child: ListenableBuilder(
      listenable: Listenable.merge([s, widget.settings]),
      builder: (context, _) => DemoViewState(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            FinanceHeading(
              'SALAPIYA / PROFILE & PREFERENCES',
              section == 'Welcome'
                  ? 'Your money, on your terms.'
                  : 'Make this space your own.',
              'One active local profile. Optional Google identity. Your financial accounts live inside your private profile.',
            ),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final t in [
                  'Welcome',
                  'Profile',
                  'Connection',
                  'Devices',
                  'Backup & recovery',
                  'Privacy & lifecycle',
                  'Help',
                ])
                  ChoiceChip(
                    label: Text(t),
                    selected: section == t,
                    onSelected: (_) => setState(() => section = t),
                  ),
              ],
            ),
            const SizedBox(height: 28),
            if (section == 'Welcome')
              welcome()
            else if (section == 'Profile')
              profile()
            else if (section == 'Connection')
              connection()
            else if (section == 'Devices')
              devices()
            else if (section == 'Backup & recovery')
              recovery()
            else if (section == 'Privacy & lifecycle')
              privacy()
            else
              help(),
          ],
        ),
      ),
    ),
  );
  Widget welcome() => FinanceColumns(
    main: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Align(
          alignment: Alignment.centerLeft,
          child: BrandMark(size: 80),
        ),
        const SizedBox(height: 24),
        Text(
          'A calmer relationship\nwith your everyday.',
          style: Theme.of(context).textTheme.headlineLarge,
        ),
        const SizedBox(height: 16),
        const Text(
          'Start where you are. There is no account requirement to manage your own money and plans.',
        ),
        const SizedBox(height: 28),
        FinancialLine(
          'Create a local offline profile',
          'No internet, Google account or email required.',
          icon: Icons.devices_outlined,
          onTap: () => review(
            'Create local offline profile',
            [
              const DemoField('name', 'Display name', value: 'Amihan'),
              DemoField(
                'theme',
                'Appearance',
                value: 'System',
                options: options(['System', 'Light', 'Dark']),
              ),
              const DemoField(
                'confirm',
                'Type START LOCAL to activate the empty demo profile',
              ),
            ],
            (v) {
              if (v['confirm'] != 'START LOCAL') {
                throw const FormatException('Type START LOCAL to confirm.');
              }
              s.replaceProfile(empty: true, name: v['name']!);
              s.profile.connection = 'Local only';
              s.profile.identity = 'Not connected';
              widget.settings.change(
                () => widget.settings.themeMode = v['theme'] == 'Light'
                    ? ThemeMode.light
                    : v['theme'] == 'Dark'
                    ? ThemeMode.dark
                    : ThemeMode.system,
              );
              setState(() => section = 'Profile');
            },
            explanation: 'Activate one empty memory-only profile. The previous demo is retained in this session as a recovery copy. PHP · Asia/Manila. No disk writes.',
          ),
        ),
        FinancialLine(
          'Continue with Google',
          'Retrieve an existing profile directly, or enroll a new one. Fictional identity only.',
          icon: Icons.cloud_outlined,
          onTap: () => setState(() => section = 'Connection'),
        ),
        FinancialLine(
          'Restore from backup',
          'Inspect identity, coverage and recovery limits before activation.',
          icon: Icons.restore_outlined,
          onTap: () => setState(() => section = 'Backup & recovery'),
        ),
      ],
    ),
    aside: ValueBlock(
      'PRIVATE BY DEFAULT',
      'Begin locally.',
      'All records here are synthetic. Closing the app resets this demo. No real profile, Google session, backup, or cloud resource is created.',
      color: Palette.mint,
    ),
  );
  Widget profile() => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      FinanceColumns(
        main: ValueBlock(
          'LOCAL PROFILE',
          s.profile.name,
          '${s.profile.profileId}\nPHP · Asia/Manila · one active profile on this installation',
          color: Palette.lilac,
        ),
        aside: ValueBlock(
          'CONNECTED IDENTITY',
          s.profile.identity == 'Not connected' ? 'Optional' : 'Google demo',
          s.profile.connection,
          color: Palette.mint,
        ),
      ),
      const SizedBox(height: 20),
      OutlinedButton(
        onPressed: () => review(
          'Edit profile',
          [DemoField('name', 'Display name', value: s.profile.name)],
          (v) {
            s.profile.name = v['name']!;
            s.profile.changed();
          },
        ),
        child: const Text('Edit display name'),
      ),
      const SizedBox(height: 24),
      const SectionHeading('Appearance & accessibility'),
      Wrap(
        spacing: 8,
        children: [
          for (final mode in ThemeMode.values)
            ChoiceChip(
              label: Text(mode.name),
              selected: widget.settings.themeMode == mode,
              onSelected: (_) => widget.settings.change(
                () => widget.settings.themeMode = mode,
              ),
            ),
        ],
      ),
      SwitchListTile(
        contentPadding: EdgeInsets.zero,
        title: const Text('Hide monetary amounts'),
        value: s.hideAmounts,
        onChanged: (_) => s.togglePrivacy(),
      ),
      SwitchListTile(
        contentPadding: EdgeInsets.zero,
        title: const Text('Reduce motion'),
        value: widget.settings.reduceMotion,
        onChanged: (v) =>
            widget.settings.change(() => widget.settings.reduceMotion = v),
      ),
      SwitchListTile(
        contentPadding: EdgeInsets.zero,
        title: const Text('Decorative craft effects'),
        value: widget.settings.effects,
        onChanged: (v) =>
            widget.settings.change(() => widget.settings.effects = v),
      ),
      DropdownButtonFormField<double>(
        initialValue: widget.settings.textScale ?? 0,
        isExpanded: true,
        decoration: const InputDecoration(labelText: 'Text size'),
        items: [
          for (final scale in [0.0, 1.0, 1.5, 2.0])
            DropdownMenuItem(
              value: scale,
              child: Text(
                scale == 0 ? 'System size' : '${(scale * 100).toInt()}%',
              ),
            ),
        ],
        onChanged: (v) => widget.settings.change(
          () => widget.settings.textScale = v == 0 ? null : v,
        ),
      ),
      SwitchListTile(
        contentPadding: EdgeInsets.zero,
        title: const Text('Prefer compact Windows rail'),
        subtitle: const Text(
          'The five destinations remain reachable on both platforms.',
        ),
        value: widget.settings.compact,
        onChanged: (v) =>
            widget.settings.change(() => widget.settings.compact = v),
      ),
      FinancialLine(
        'Device reminder settings',
        'Quiet hours, permission and lock-screen privacy',
        icon: Icons.notifications_none,
        onTap: () => openDemoPage<void>(
          context,
          ReminderCenter(session: s),
          'profile/reminders',
        ),
      ),
      const FinanceNotice(
        'Display name is profile information; it does not change Google ownership. Financial accounts are cash wallets, banks and cards, not sign-in accounts.',
      ),
    ],
  );
  Widget connection() => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      ValueBlock(
        'CONNECTION',
        s.profile.connection,
        'Identity: ${s.profile.identity}\nEnrollment: ${s.profile.enrollment}',
        color: Palette.mint,
      ),
      const FinanceNotice(
        'Connecting uploads private data to Salapiya services in the intended product. Google supplies identity, not backup storage. Group members cannot access private records. Authorized service administrators may technically access cloud data; this is not end-to-end encryption.',
      ),
      DropdownButtonFormField<String>(
        initialValue: connectScenario,
        isExpanded: true,
        decoration: const InputDecoration(labelText: 'Connection scenario'),
        items: [
          for (final x in [
            'New cloud profile',
            'Existing cloud / populated local collision',
            'Retrieve existing cloud directly',
            'Interrupted enrollment',
            'Session expired',
            'Revoked installation',
            'Service unavailable',
          ])
            DropdownMenuItem(value: x, child: Text(x)),
        ],
        onChanged: (v) => setState(() => connectScenario = v!),
      ),
      const SizedBox(height: 16),
      FilledButton(
        onPressed: () => review(
          'Review Google connection',
          [
            DemoField(
              'identity',
              'Fictional identity',
              value: 'Amihan · Google demo',
              options: options(['Amihan · Google demo']),
            ),
            DemoField(
              'consent',
              'Private dataset upload disclosure',
              value: 'Review first',
              options: options([
                'Review first',
                'I understand this is a simulation',
              ]),
            ),
          ],
          (v) {
            if (v['consent'] != 'I understand this is a simulation') {
              throw const FormatException(
                'Acknowledge the simulated private-data connection.',
              );
            }
            if (connectScenario.contains('collision')) {
              s.profile.enrollmentStep('Collision · both profiles preserved');
            } else if (connectScenario == 'Session expired') {
              s.profile.connection = 'Session expired · local data available';
              s.select(OverviewScenario.waiting);
            } else if (connectScenario == 'Revoked installation') {
              s.profile.connection = 'Revoked · remote access blocked';
              s.profile.devices['This installation'] = 'Revoked';
              s.select(OverviewScenario.waiting);
            } else if (connectScenario == 'Service unavailable') {
              s.profile.connection =
                  'Service unavailable · local data retained';
              s.select(OverviewScenario.waiting);
            } else {
              s.profile.enrollmentStep(
                connectScenario == 'Interrupted enrollment'
                    ? 'Interrupted at validation checkpoint'
                    : 'Identity simulated · snapshot not published',
              );
              if (connectScenario == 'Retrieve existing cloud directly') {
                s.select(OverviewScenario.incomplete);
              }
            }
            s.profile.changed();
          },
        ),
        child: const Text('Explore connection scenario'),
      ),
      const SizedBox(height: 20),
      if (s.profile.enrollment.startsWith('Collision')) ...[
        const FinanceNotice(
          'This Google identity already owns a different cloud profile. No automatic merge or overwrite. Cancel keeps your current local records intact.',
          warning: true,
        ),
        OutlinedButton(
          onPressed: () => review(
            'Preserve local & use cloud',
            [
              const DemoField(
                'confirm',
                'Type USE CLOUD after reviewing the separate profiles',
              ),
            ],
            (v) {
              if (v['confirm'] != 'USE CLOUD') {
                throw const FormatException('Type USE CLOUD to continue.');
              }
              s.replaceProfile(empty: false, name: 'Amihan · cloud demo');
              s.profile.connect();
              s.select(OverviewScenario.incomplete);
            },
            explanation: 'Retain the populated local demo as an in-session recovery copy, then activate a separate fictional cloud snapshot. This is not a real backup; no financial merge occurs. A real implementation must export local data first.',
          ),
          child: const Text('Review safe cloud choice'),
        ),
        TextButton(
          onPressed: () =>
              s.profile.enrollmentStep('Cancelled · local profile unchanged'),
          child: const Text('Cancel enrollment'),
        ),
      ] else if (s.profile.enrollment != 'Not started' &&
          s.profile.enrollment != 'Published demo snapshot') ...[
        const FinanceNotice(
          'Checkpoint 1 · identity → 2 · validate graph → 3 · publish snapshot. Retry uses this enrollment; it never repeats opening balances.',
        ),
        OutlinedButton(
          onPressed: () {
            s.profile.enrollmentStep('Validated · awaiting publication');
          },
          child: const Text('Resume validation'),
        ),
        FilledButton(
          onPressed: s.profile.enrollment == 'Validated · awaiting publication'
              ? () {
                  s.profile.connect();
                  s.select(OverviewScenario.current);
                }
              : null,
          child: const Text('Publish demo snapshot'),
        ),
      ],
      if (!s.complete)
        FilledButton(
          onPressed: () {
            s.profile.connect();
            s.select(OverviewScenario.current);
          },
          child: const Text('Complete synthetic snapshot retrieval'),
        ),
      const SizedBox(height: 20),
      const SectionHeading('Synchronization is not confirmation'),
      FinancialLine('Accepted snapshot', s.coverage),
      FinancialLine(
        'Pending local commands',
        '${s.finance.waitingCommands.length} · original command IDs retained',
      ),
      FinancialLine(
        'Group receipt',
        'Recipient confirmation remains independent of sync status',
      ),
      Wrap(
        spacing: 8,
        children: [
          OutlinedButton(
            onPressed: () {
              s.profile.lifecycle(
                s.profile.paused ? 'Resume sync' : 'Pause sync',
              );
              s.select(
                s.profile.paused
                    ? OverviewScenario.waiting
                    : s.profile.identity == 'Not connected'
                    ? OverviewScenario.local
                    : OverviewScenario.current,
              );
            },
            child: Text(s.profile.paused ? 'Resume sync' : 'Pause sync'),
          ),
          OutlinedButton(
            onPressed: () {
              if (s.profile.identity == 'Not connected' ||
                  s.profile.connection.startsWith('Revoked')) {
                s.profile.connection = 'Sign-in required · no remote refresh';
                s.profile.changed();
              } else {
                s.select(OverviewScenario.current);
                s.profile.history.add(
                  'Sync now simulated · no network request',
                );
              }
            },
            child: const Text('Sync now · demo'),
          ),
        ],
      ),
    ],
  );
  Widget devices() => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      const FinanceHeading(
        'DEVICES / INSTALLATIONS',
        'The same you, across devices.',
        'Identity recovery downloads only accepted data. Unsynced work needs a surviving device or backup.',
      ),
      for (final e in s.profile.devices.entries)
        FinancialLine(
          e.key,
          e.value,
          icon: e.key.contains('Android')
              ? Icons.phone_android
              : Icons.desktop_windows,
          onTap: () => review(
            'Device access · ${e.key}',
            [
              DemoField(
                'action',
                'Action',
                value: 'Inspect',
                options: options([
                  'Inspect',
                  'Simulate enrollment',
                  'Revoke remote access',
                ]),
              ),
              const DemoField('ack', 'Type DEMO to confirm', value: 'DEMO'),
            ],
            (v) {
              if (v['ack'] != 'DEMO') throw const FormatException('Type DEMO.');
              if (v['action'] == 'Inspect') return;
              s.profile.devices[e.key] = v['action'] == 'Simulate enrollment'
                  ? 'Enrolled demo · awaiting snapshot'
                  : 'Revoked in simulation';
              s.profile.history.add('${e.key} · ${v['action']}');
              s.profile.changed();
            },
            explanation: 'Revocation blocks future remote authorization. It cannot erase an offline or copied device. No real device is enrolled or revoked.',
          ),
        ),
      const FinanceNotice(
        'A backup cannot restore revoked authority. Reauthenticate online in the real product before accessing current group records.',
        warning: true,
      ),
    ],
  );
  int get availableFiles => s.finance.files.files
      .where((f) => ['Local only', 'Downloaded'].contains(f.state))
      .length;
  String get manifestCoverage => includeFiles
      ? 'Private records + $availableFiles locally available file specimens; ${s.finance.files.files.length - availableFiles} omitted'
      : 'Private records only; all ${s.finance.files.files.length} file specimens omitted';
  Widget recovery() => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      FinanceColumns(
        main: ValueBlock(
          'PORTABLE BACKUP',
          'A separate safety net.',
          s.profile.backup,
          color: Palette.lilac,
        ),
        aside: ValueBlock(
          'RECOVERY COPIES',
          '${s.recoveryCopies.length}',
          'Memory-only prior demo profiles. These disappear when the app closes.',
          color: Palette.peach,
        ),
      ),
      const SizedBox(height: 20),
      const FinanceNotice(
        'Sync can propagate mistakes; it is not backup. A portable encrypted archive must be recoverable on another device with a user-controlled recovery secret. This prototype neither encrypts nor creates archives.',
      ),
      SwitchListTile(
        contentPadding: EdgeInsets.zero,
        title: const Text('Include available attachment bytes'),
        subtitle: Text(
          '$manifestCoverage. No actual bytes exist in this prototype.',
        ),
        value: includeFiles,
        onChanged: (v) => setState(() => includeFiles = v),
      ),
      OutlinedButton(
        onPressed: () => review(
          'Backup manifest review',
          [
            DemoField(
              'coverage',
              'Coverage',
              value: manifestCoverage,
              options: options([manifestCoverage]),
            ),
            const DemoField(
              'recovery',
              'Recovery disclosure',
              value: 'A separate compatible device needs the recovery secret. No secret is requested here.',
            ),
            const DemoField(
              'ack',
              'Type PREVIEW to acknowledge no archive will be written',
            ),
          ],
          (v) {
            if (v['ack'] != 'PREVIEW') {
              throw const FormatException('Type PREVIEW.');
            }
            s.profile.backup =
                'Manifest reviewed · 21 Oct 2026 · no file created';
            s.profile.history.add(
              'Backup manifest reviewed; credentials excluded, original command IDs retained.',
            );
            s.profile.changed();
            setState(() => backupReviewed = true);
          },
        ),
        child: const Text('Review portable backup manifest'),
      ),
      const SizedBox(height: 28),
      const SectionHeading('Restore deliberately'),
      DropdownButtonFormField<String>(
        initialValue: restoreMode,
        isExpanded: true,
        decoration: const InputDecoration(labelText: 'Restore mode'),
        items: [
          for (final x in [
            'Local recovery',
            'Connected-device reconciliation',
            'Historical inspection',
          ])
            DropdownMenuItem(value: x, child: Text(x)),
        ],
        onChanged: (v) => setState(() => restoreMode = v!),
      ),
      const SizedBox(height: 16),
      DropdownButtonFormField<String>(
        initialValue: restoreScenario,
        isExpanded: true,
        decoration: const InputDecoration(labelText: 'Archive scenario'),
        items: [
          for (final x in [
            'Valid archive',
            'Wrong recovery key',
            'Corrupt archive',
            'Incompatible schema',
            'Wrong owner',
            'Interrupted restore',
            'Old backup / accepted receipts',
            'Revoked group access',
          ])
            DropdownMenuItem(value: x, child: Text(x)),
        ],
        onChanged: (v) => setState(() => restoreScenario = v!),
      ),
      const SizedBox(height: 16),
      FilledButton(
        onPressed: () => review(
          'Restore preview',
          [
            const DemoField(
              'manifest',
              'Synthetic manifest',
              value: 'Amihan · 20 Oct 2026 · PHP · schema demo-v1 · 3 accounts · private history; attachment omissions disclosed',
            ),
            DemoField(
              'mode',
              'Mode',
              value: restoreMode,
              options: options([restoreMode]),
            ),
            const DemoField('confirm', 'Type RESTORE DEMO to confirm'),
          ],
          (v) {
            if (v['confirm'] != 'RESTORE DEMO') {
              throw const FormatException('Type RESTORE DEMO.');
            }
            if ([
              'Wrong recovery key',
              'Corrupt archive',
              'Incompatible schema',
              'Wrong owner',
            ].contains(restoreScenario)) {
              throw FormatException(
                '$restoreScenario: validation blocked activation. Current profile and draft are untouched.',
              );
            }
            if (restoreScenario == 'Interrupted restore') {
              s.profile.restore = 'Interrupted · current profile untouched · resume the original preview';
              s.profile.changed();
              return;
            }
            if (restoreMode == 'Historical inspection') {
              s.profile.restore =
                  'Historical snapshot inspected · active profile unchanged';
            } else if (restoreMode == 'Connected-device reconciliation' ||
                restoreScenario == 'Old backup / accepted receipts' ||
                restoreScenario == 'Revoked group access') {
              s.profile.restore = 'Reconciliation preview · accepted receipts will not replay; current revocations win. No cloud rollback.';
            } else {
              s.replaceProfile(empty: false, name: 'Amihan · restored demo');
              s.profile.restore = 'Synthetic private snapshot activated · missing bytes remain unavailable';
              s.life.permission = false;
            }
            s.profile.history.add(s.profile.restore);
            s.profile.changed();
          },
          explanation: 'No credentials restored. Original command IDs prevent replay. Historical group records grant no current membership. Local recovery retains the prior in-memory profile; connected mode does not overwrite newer cloud data.',
        ),
        child: const Text('Validate & review restore'),
      ),
      FinanceNotice(
        s.profile.restore,
        warning: s.profile.restore.startsWith('Interrupted'),
      ),
      if (s.profile.restore.startsWith('Interrupted'))
        TextButton(
          onPressed: () {
            setState(() => restoreScenario = 'Valid archive');
            s.profile.restore =
                'Ready to resume validation · same source archive';
            s.profile.changed();
          },
          child: const Text('Resume original restore'),
        ),
      if (s.recoveryCopies.isNotEmpty)
        OutlinedButton(
          onPressed: () => review(
            'Recover previous demo profile',
            [const DemoField('confirm', 'Type RECOVER')],
            (v) {
              if (v['confirm'] != 'RECOVER') {
                throw const FormatException('Type RECOVER.');
              }
              s.recoverPreviousProfile();
            },
          ),
          child: const Text('Recover previous in-session profile'),
        ),
      if (backupReviewed)
        const FinanceNotice(
          'Backup review complete. No archive exists on disk; keep this distinction when exploring removal scenarios.',
        ),
    ],
  );
  Widget privacy() => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      const FinanceHeading(
        'PRIVACY / YOUR CHOICES',
        'Know what stays. Know what leaves.',
        'Local access, device authority, group history and cloud account lifecycle are separate decisions.',
      ),
      SwitchListTile(
        contentPadding: EdgeInsets.zero,
        title: const Text('Optional redacted diagnostics · preference only'),
        value: s.profile.diagnostics,
        onChanged: (v) {
          s.profile.diagnostics = v;
          s.profile.changed();
        },
      ),
      const FinanceNotice(
        'No real local lock or encryption is implemented. OS lock, encrypted storage and portable key recovery are separate engineering work. Do not enter real secrets.',
      ),
      Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          for (final action in [
            s.profile.locked ? 'Unlock preview' : 'Lock preview',
            'Sign out',
            'Remove local profile',
            'Request cloud deletion',
            'Cancel cloud deletion',
          ])
            OutlinedButton(
              onPressed: () => review(
                action,
                [
                  DemoField(
                    'scope',
                    'Scope',
                    value: action == 'Remove local profile'
                        ? 'Only this synthetic local profile; prior in-session copy retained'
                        : action.contains('cloud')
                        ? 'Simulated cloud lifecycle request; shared evidence and backup retention remain separate'
                        : 'This installation only; private local records retained',
                  ),
                  const DemoField(
                    'pending',
                    'Unsynced work acknowledgement',
                    value: 'Unsynced work may not exist on another device. Review backup first.',
                  ),
                  const DemoField('confirm', 'Type SIMULATE'),
                ],
                (v) {
                  if (v['confirm'] != 'SIMULATE') {
                    throw const FormatException('Type SIMULATE.');
                  }
                  if (action == 'Request cloud deletion') {
                    if (s.profile.identity == 'Not connected' ||
                        s.profile.paused ||
                        s.profile.connection.contains('expired') ||
                        s.profile.connection.contains('Revoked')) {
                      throw const FormatException(
                        'Cloud deletion requires a current online identity. Local removal is a separate action.',
                      );
                    }
                    if (s.finance.groupOwners.entries.any(
                      (e) =>
                          e.value == 'Amihan' &&
                          !s.finance.archivedGroups.contains(e.key),
                    )) {
                      throw const FormatException(
                        'Transfer ownership or archive owned groups before requesting account deletion.',
                      );
                    }
                  }
                  if (action == 'Remove local profile') {
                    s.replaceProfile(empty: true, name: 'New local demo');
                    s.profile.connection = 'Local only';
                    s.profile.identity = 'Not connected';
                  } else {
                    s.profile.lifecycle(action);
                    if (action == 'Sign out') s.select(OverviewScenario.local);
                  }
                },
                explanation: 'Simulated action only. No data is deleted from disk or services. Revocation cannot remote-wipe offline copies; deletion cannot promise immediate erasure from retained backups or other members’ shared evidence.',
              ),
              child: Text(action),
            ),
        ],
      ),
      if (s.profile.locked)
        const FinanceNotice(
          'Lock preview active. This is a presentation specimen, not access protection. Unlock preview to clear it.',
        ),
      FinanceNotice('Cloud deletion: ${s.profile.deletion}'),
      const SectionHeading('Lifecycle evidence'),
      for (final h in s.profile.history.reversed)
        FinancialLine('Demo history', h, icon: Icons.history),
    ],
  );
  Widget help() => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      const FinanceHeading(
        'HELP / A GOOD PLACE TO START',
        'A little guidance.',
        'Salapiya · Your money, on your terms. Windows and Android synthetic prototype.',
      ),
      for (final e in {
        'Where do I start?': 'Create a cash wallet in Money. Record actual income and expenses there. Planning expectations never post money.',
        'Why is a total unavailable?': 'An incomplete initial snapshot is not zero. Complete the synthetic retrieval in Connection or change the Overview scenario.',
        'What does a savings reservation do?': 'It labels cash already in an eligible financial account. It is not a transfer, extra asset or guarantee against future spending.',
        'Why did my reminder disappear?': 'Source completion or archival cancels its current projection. Reopen or restore the source to create its current reminder generation.',
        'Can a group owner see my money?': 'No. Group facts and your private funding evidence have separate authority. Shared exports omit private accounts and attachments.',
        'Are my changes saved?': 'Only in memory for this session. Closing the application resets the prototype. No real authentication, synchronization, backup or notification occurs.',
        'Update information': 'Demo 0.1.0 · no updater. Incompatible schemas must preserve recoverable local data; a build alone is not distribution acceptance.',
        'Support & feedback': 'Record the screen and steps for the project owner. No support message or diagnostics is sent by this prototype.',
      }.entries)
        ExpansionTile(
          key: PageStorageKey('help-${e.key}'),
          title: Text(e.key),
          children: [
            Padding(padding: const EdgeInsets.all(16), child: Text(e.value)),
          ],
        ),
      TextButton(
        onPressed: () =>
            showLicensePage(context: context, applicationName: 'Salapiya'),
        child: const Text('Bundled licenses'),
      ),
    ],
  );
}
