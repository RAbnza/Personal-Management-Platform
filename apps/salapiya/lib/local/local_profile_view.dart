import 'dart:async';

import '../connected/connection_view.dart';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';

import '../app/demo_routes.dart';
import '../app/shell.dart';
import '../design_system/craft.dart';
import '../design_system/editorial.dart';
import '../design_system/theme.dart';
import '../features/finance/presentation/financial_widgets.dart';
import '../gallery/settings.dart';
import '../p0/portable_recovery.dart';
import 'finance_domain.dart';
import 'local_profiles.dart';
import 'local_runtime.dart';

class LocalBootstrap extends StatefulWidget {
  const LocalBootstrap({super.key, required this.settings, this.runtime});
  final GallerySettings settings;
  final LocalRuntime? runtime;
  @override
  State<LocalBootstrap> createState() => _LocalBootstrapState();
}

class _LocalBootstrapState extends State<LocalBootstrap>
    with WidgetsBindingObserver {
  LocalRuntime? runtime;
  bool loading = true;
  String? failure;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(start());
  }

  Future<void> start() async {
    setState(() {
      loading = true;
      failure = null;
    });
    try {
      final next = widget.runtime ?? await LocalRuntime.open(widget.settings);
      if (!mounted) {
        if (widget.runtime == null) {
          await next.close();
          next.dispose();
        }
        return;
      }
      setState(() {
        runtime = next;
        loading = false;
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          loading = false;
          failure = e is LocalRuleException ? e.message : 'The protected local profile could not be opened. Existing files have been preserved. Check OS credentials and available storage, then retry.';
        });
      }
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed &&
        runtime?.connected.connected == true) {
      unawaited(runtime!.connected.syncNow());
    }
    if (state == AppLifecycleState.inactive ||
        state == AppLifecycleState.paused) {
      unawaited(runtime?.flushPreferences());
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    final r = runtime;
    if (r != null && widget.runtime == null) {
      unawaited(r.close().whenComplete(r.dispose));
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (loading) {
      return const Scaffold(
        body: SafeArea(
          child: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                BrandMark(size: 80),
                SizedBox(height: 24),
                CircularProgressIndicator(),
                SizedBox(height: 20),
                Text('Opening your private space…'),
              ],
            ),
          ),
        ),
      );
    }
    if (failure != null) {
      return FinancePage(
        title: 'Your private space',
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const FinanceHeading(
              'SALAPIYA / RECOVERY',
              'Your data stays yours.',
              'Startup stopped safely; no existing profile was reset.',
            ),
            FinanceNotice(failure!, warning: true),
            const SizedBox(height: 20),
            FilledButton(
              onPressed: start,
              child: const Text('Retry opening profile'),
            ),
          ],
        ),
      );
    }
    return ListenableBuilder(
      listenable: runtime!,
      builder: (context, _) => runtime!.session == null
          ? LocalWelcome(runtime: runtime!)
          : SalapiyaShell(
              key: ValueKey(runtime!.session),
              settings: widget.settings,
              session: runtime!.session,
            ),
    );
  }
}

class LocalWelcome extends StatefulWidget {
  const LocalWelcome({super.key, required this.runtime});
  final LocalRuntime runtime;
  @override
  State<LocalWelcome> createState() => _LocalWelcomeState();
}

class _LocalWelcomeState extends State<LocalWelcome> {
  Future<void> create() async {
    final name = TextEditingController();
    ThemeMode mode = ThemeMode.system;
    bool busy = false;
    String? error;
    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (context) => StatefulBuilder(
        builder: (context, update) => PopScope(
          canPop: !busy,
          child: AlertDialog(
            scrollable: true,
            title: const Text('Create local offline profile'),
            content: SizedBox(
              width: 440,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text(
                    'PHP · Asia/Manila. Your profile is encrypted on this device. No account or internet is required.',
                  ),
                  const SizedBox(height: 20),
                  TextField(
                    controller: name,
                    autofocus: true,
                    maxLength: 200,
                    decoration: const InputDecoration(
                      labelText: 'Display name',
                    ),
                  ),
                  DropdownButtonFormField<ThemeMode>(
                    initialValue: mode,
                    decoration: const InputDecoration(labelText: 'Appearance'),
                    items: [
                      for (final m in ThemeMode.values)
                        DropdownMenuItem(value: m, child: Text(m.name)),
                    ],
                    onChanged: busy ? null : (v) => update(() => mode = v!),
                  ),
                  if (error != null) FinanceNotice(error!, warning: true),
                ],
              ),
            ),
            actions: [
              TextButton(
                onPressed: busy ? null : () => Navigator.pop(context),
                child: const Text('Cancel'),
              ),
              FilledButton(
                onPressed: busy
                    ? null
                    : () async {
                        update(() {
                          busy = true;
                          error = null;
                        });
                        try {
                          await widget.runtime.create(name.text, mode);
                          if (context.mounted) Navigator.pop(context);
                        } catch (e) {
                          if (context.mounted) {
                            update(() {
                              busy = false;
                              error = e is LocalRuleException ? e.message : 'Profile creation could not finish. Close this dialog and retry opening the app; initialized files are retained.';
                            });
                          }
                        }
                      },
                child: Text(busy ? 'Creating…' : 'Create local profile'),
              ),
            ],
          ),
        ),
      ),
    );
    // A dialog route can still be animating out; dispose after its transition.
    await Future<void>.delayed(const Duration(milliseconds: 250));
    name.dispose();
  }

  @override
  Widget build(BuildContext context) => FinancePage(
    title: 'Welcome to Salapiya',
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const FinanceHeading(
          'SALAPIYA / YOUR PRIVATE SPACE',
          'Your money, on your terms.',
          'One active local profile. Optional Google identity. Your financial accounts live inside your private profile.',
        ),
        FinanceColumns(
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
                onTap: create,
              ),
              FinancialLine(
                'Continue with Google',
                'Connect privately or retrieve your existing profile.',
                icon: Icons.cloud_outlined,
                onTap: () => openDemoPage<void>(
                  context,
                  ConnectionPage(runtime: widget.runtime),
                  'profile/connection',
                ),
              ),
              FinancialLine(
                'Restore from backup',
                'Review a local encrypted archive before activation.',
                icon: Icons.restore_outlined,
                onTap: () => openDemoPage<void>(
                  context,
                  LocalRecoveryView(runtime: widget.runtime),
                  'profile/recovery',
                ),
              ),
            ],
          ),
          aside: const ValueBlock(
            'PRIVATE BY DEFAULT',
            'Begin locally.',
            'Your data stays encrypted on this device. Keep a portable backup and its recovery secret separately for independent recovery.',
            color: Palette.mint,
          ),
        ),
      ],
    ),
  );
}

void showUpcoming(BuildContext context, String workflow) => showDialog<void>(
  context: context,
  builder: (context) => AlertDialog(
    title: Text(workflow),
    content: const Text(
      'This workflow is planned for a later milestone. Your local profile remains available offline.',
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: const Text('Done'),
      ),
    ],
  ),
);

class UpcomingView extends StatelessWidget {
  const UpcomingView(this.title, {super.key});
  final String title;
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      FinanceHeading(
        'SALAPIYA / COMING LATER',
        title,
        'A little more room for what comes next.',
      ),
      const ValueBlock(
        'PLANNED WORKFLOW',
        'Your space is ready to grow.',
        'This feature will become available in a later milestone. Your everyday Money records remain available offline.',
        color: Palette.lilac,
      ),
    ],
  );
}

class LocalProfileView extends StatefulWidget {
  const LocalProfileView({
    super.key,
    required this.session,
    required this.settings,
  });
  final LocalSession session;
  final GallerySettings settings;
  @override
  State<LocalProfileView> createState() => _LocalProfileViewState();
}

class _LocalProfileViewState extends State<LocalProfileView> {
  String section = 'Profile';
  Future<void> rename() async {
    final text = TextEditingController(text: widget.session.profile.name);
    String? error;
    bool busy = false;
    await showDialog<void>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, update) => AlertDialog(
          title: const Text('Edit profile'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: text,
                maxLength: 200,
                decoration: const InputDecoration(labelText: 'Display name'),
              ),
              if (error != null) Text(error!),
            ],
          ),
          actions: [
            TextButton(
              onPressed: busy ? null : () => Navigator.pop(context),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: busy
                  ? null
                  : () async {
                      update(() => busy = true);
                      try {
                        await widget.session.runtime.rename(text.text);
                        if (context.mounted) Navigator.pop(context);
                      } catch (e) {
                        if (context.mounted) {
                          update(() {
                            busy = false;
                            error = e is LocalRuleException
                                ? e.message
                                : 'The profile could not be saved. Try again.';
                          });
                        }
                      }
                    },
              child: Text(busy ? 'Saving…' : 'Save profile'),
            ),
          ],
        ),
      ),
    );
    await Future<void>.delayed(const Duration(milliseconds: 250));
    text.dispose();
  }

  @override
  Widget build(BuildContext context) => FinancePage(
    title: 'Your space',
    child: ListenableBuilder(
      listenable: Listenable.merge([
        widget.settings,
        widget.session,
        widget.session.runtime,
      ]),
      builder: (context, _) {
        final s = widget.session, settings = widget.settings;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const FinanceHeading(
              'SALAPIYA / PROFILE & PREFERENCES',
              'Make this space your own.',
              'One active local profile. Private and available offline.',
            ),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final tab in [
                  'Profile',
                  'Connection',
                  'Devices',
                  'Backup & recovery',
                  'Help',
                ])
                  ChoiceChip(
                    label: Text(tab),
                    selected: section == tab,
                    onSelected: (_) => setState(() => section = tab),
                  ),
              ],
            ),
            const SizedBox(height: 28),
            if (section == 'Backup & recovery')
              LocalRecoveryBody(runtime: s.runtime)
            else if (section == 'Connection')
              ConnectionBody(runtime: s.runtime)
            else if (section == 'Devices')
              ValueBlock(
                'THIS INSTALLATION',
                s.runtime.connected.connected
                    ? 'Connected installation'
                    : 'Local only.',
                'The database key is protected by your operating system. Synchronization is scoped to your bound private profile. Remote device removal is not available in this milestone.',
                color: Palette.mint,
              )
            else if (section == 'Help') ...[
              const SectionHeading('Financial evidence and planning'),
              const FinanceNotice(
                'Use accounts to establish opening balances, then record activity after each opening cutoff. Review every financial effect before confirming. Back up before changing devices. Private data uploads only after you explicitly connect Google.',
              ),
              const FinanceNotice(
                'Card purchases record spending and liability once. Card payments reduce cash and liability; available credit and overpayments are not liquid cash. Provider statements and installment schedules are evidence, not new spending. Review unknown allocations before relying on projected dues.',
              ),
              const FinanceNotice(
                'Debt proceeds are borrowing, not income. Separate recognized liability, principal evidence, contractual dues, actual payments and uncertain clearing. A payoff must reconcile provider evidence; avoided future charges do not reverse expenses that were never posted.',
              ),
              const FinanceNotice(
                'Recurring expectations never post money when a date arrives. Link actual transactions explicitly. Budgets and savings reservations do not protect cash from real spending. Forecasts are read-only estimates and disclose excluded or incomplete evidence.',
              ),
              const SectionHeading('Imports, files and recovery'),
              const FinanceNotice(
                'CSV imports support only the documented PHP cash-activity contract. Review mapping, duplicates and every included row. Historical imports require an exact earlier opening and atomic rebase. Cancellation retains already committed chunks; resolve an uncertain original command before retrying.',
              ),
              const FinanceNotice(
                'Supporting files remain unscanned and encrypted on this device. Cloud bytes are unavailable. Standard encrypted financial backups contain attachment metadata but zero file-byte objects. Keep original files and the separate recovery secret. A fresh restore validates command recipes and cannot roll back accepted cloud history or revive revoked shared authority.',
              ),
              const FinanceNotice(
                'Archiving a financial definition preserves history. Signing out ends this device’s connected session; it does not delete financial records or leave a group. Account deletion, retention certification and distribution safeguards remain separate release work. Financial due sources appear in Overview; device notifications and the broader Calendar await the native scheduling milestone.',
              ),
              TextButton(
                onPressed: () => showLicensePage(
                  context: context,
                  applicationName: 'Salapiya',
                ),
                child: const Text('Licenses'),
              ),
            ] else ...[
              FinanceColumns(
                main: ValueBlock(
                  'LOCAL PROFILE',
                  s.profile.name,
                  '${s.profile.profileId}\nPHP · Asia/Manila · encrypted on this installation',
                  color: Palette.lilac,
                ),
                aside: ValueBlock(
                  'CONNECTED IDENTITY',
                  s.runtime.connected.identity,
                  s.runtime.connected.label,
                  color: Palette.mint,
                ),
              ),
              const SizedBox(height: 20),
              Align(
                alignment: Alignment.centerLeft,
                child: OutlinedButton(
                  onPressed: rename,
                  child: const Text('Edit display name'),
                ),
              ),
              const SizedBox(height: 24),
              const SectionHeading('Appearance & accessibility'),
              Wrap(
                spacing: 8,
                children: [
                  for (final mode in ThemeMode.values)
                    ChoiceChip(
                      label: Text(mode.name),
                      selected: settings.themeMode == mode,
                      onSelected: (_) =>
                          settings.change(() => settings.themeMode = mode),
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
                value: settings.reduceMotion,
                onChanged: (v) =>
                    settings.change(() => settings.reduceMotion = v),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Decorative craft effects'),
                value: settings.effects,
                onChanged: (v) => settings.change(() => settings.effects = v),
              ),
              DropdownButtonFormField<double>(
                isExpanded: true,
                initialValue: settings.textScale ?? 0,
                decoration: const InputDecoration(labelText: 'Text size'),
                items: [
                  for (final v in [0.0, 1.0, 1.5, 2.0])
                    DropdownMenuItem(
                      value: v,
                      child: Text(
                        v == 0 ? 'System text size' : '${(v * 100).round()}%',
                      ),
                    ),
                ],
                onChanged: (v) => settings.change(
                  () => settings.textScale = v == 0 ? null : v,
                ),
              ),
              if (s.runtime.preferenceError != null)
                FinanceNotice(s.runtime.preferenceError!, warning: true),
            ],
          ],
        );
      },
    ),
  );
}

class LocalRecoveryView extends StatelessWidget {
  const LocalRecoveryView({super.key, required this.runtime});
  final LocalRuntime runtime;
  @override
  Widget build(BuildContext context) => FinancePage(
    title: 'Backup & recovery',
    child: LocalRecoveryBody(runtime: runtime),
  );
}

class LocalRecoveryBody extends StatefulWidget {
  const LocalRecoveryBody({super.key, required this.runtime, this.onExported});
  final LocalRuntime runtime;
  final VoidCallback? onExported;
  @override
  State<LocalRecoveryBody> createState() => _LocalRecoveryBodyState();
}

class _LocalRecoveryBodyState extends State<LocalRecoveryBody> {
  final secret = TextEditingController();
  bool busy = false, acknowledged = false;
  String? message;
  Map<String, dynamic>? reviewed;
  @override
  void dispose() {
    secret.dispose();
    super.dispose();
  }

  Future<void> run(Future<void> Function() work) async {
    setState(() {
      busy = true;
      message = null;
    });
    try {
      await work();
    } catch (e) {
      if (mounted) {
        setState(
          () => message = e is LocalRuleException ? e.message : 'Recovery could not complete. Check the file and recovery secret. Existing data has been preserved.',
        );
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final initialized = widget.runtime.session != null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const FinanceHeading(
          'YOUR SAFETY NET',
          'Keep a way back.',
          'Portable recovery uses a separate generated secret. The archive includes financial commands, source relationships, supporting-file metadata, preferences and drafts. Attachment bytes and cloud authority are excluded. Keep original files separately.',
        ),
        if (initialized) ...[
          OutlinedButton(
            onPressed: busy
                ? null
                : () => run(() async {
                    secret.text = await PortableRecovery.newRecoverySecret();
                    setState(() => acknowledged = false);
                  }),
            child: const Text('Generate recovery secret'),
          ),
        ],
        const SizedBox(height: 16),
        TextField(
          controller: secret,
          maxLines: 2,
          enableSuggestions: false,
          autocorrect: false,
          decoration: const InputDecoration(
            labelText: 'Recovery secret',
            helperText: 'Keep this separately from your archive. It cannot be recovered from Salapiya.',
          ),
          onChanged: (_) => setState(() {
            acknowledged = false;
            reviewed = null;
          }),
        ),
        if (initialized) ...[
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text(
              'I have saved this recovery secret in a separate safe place',
            ),
            value: acknowledged,
            onChanged: busy ? null : (v) => setState(() => acknowledged = v!),
          ),
          FilledButton.icon(
            onPressed: busy || !acknowledged
                ? null
                : () => run(() async {
                    await widget.runtime.flushPreferences();
                    final bundle = await LocalBackup.capture(
                      widget.runtime.session!.localFinance.store,
                    );
                    final bytes = await LocalBackup.seal(bundle, secret.text);
                    final uri = await FilePicker.saveFile(
                      fileName:
                          'salapiya-${civilToday()}-${newLocalId().substring(0, 8)}.salapiya',
                      bytes: bytes,
                    );
                    if (uri != null) widget.onExported?.call();
                    if (mounted) {
                      setState(
                        () => message = uri == null
                            ? 'Backup cancelled. No successful export was recorded.'
                            : 'Encrypted backup saved. Keep the archive and recovery secret separately.',
                      );
                    }
                  }),
            icon: const Icon(Icons.shield_outlined),
            label: Text(busy ? 'Working…' : 'Save encrypted backup'),
          ),
          const SizedBox(height: 20),
          const FinanceNotice(
            'Recovery activation is supported on a fresh installation. This installation’s active profile is never replaced or merged with an older archive.',
          ),
        ],
        const SizedBox(height: 20),
        OutlinedButton.icon(
          onPressed: busy
              ? null
              : () => run(() async {
                  final file = await FilePicker.pickFile();
                  if (file == null) return;
                  final length = await file.length();
                  if (length == null || length > LocalBackup.maxBytes + 128) {
                    reject('Choose a compatible archive up to 32 MiB.');
                  }
                  final bundle = await LocalBackup.unseal(
                    await file.readAsBytes(),
                    secret.text,
                  );
                  if (mounted) setState(() => reviewed = bundle);
                }),
          icon: const Icon(Icons.folder_open_outlined),
          label: const Text('Choose and inspect backup'),
        ),
        if (reviewed != null) ...[
          const SizedBox(height: 20),
          ValueBlock(
            'ARCHIVE REVIEW',
            reviewed!['name'] as String,
            '${reviewed!['owner']}\n${reviewed!['createdUtc']}\n${(reviewed!['commands'] as List).length} committed commands · ${(reviewed!['drafts'] as List).length} drafts · ${[2, 3].contains(reviewed!['format']) ? 'connected recovery requires current Google verification' : 'local only'}\nAttachment byte objects included: 0. Metadata is not proof that original bytes were recovered.',
            color: Palette.mint,
          ),
          if (!initialized)
            Padding(
              padding: const EdgeInsets.only(top: 20),
              child: FilledButton(
                onPressed: busy
                    ? null
                    : () => run(() async {
                        final store = await widget.runtime.profiles.restore(
                          reviewed!,
                        );
                        await widget.runtime.activate(store);
                        if (context.mounted) Navigator.maybePop(context);
                      }),
                child: const Text('Restore reviewed local profile'),
              ),
            ),
        ],
        if (message != null)
          Padding(
            padding: const EdgeInsets.only(top: 20),
            child: Semantics(liveRegion: true, child: FinanceNotice(message!)),
          ),
      ],
    );
  }
}
