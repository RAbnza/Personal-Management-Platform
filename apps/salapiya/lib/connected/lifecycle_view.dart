import 'package:flutter/material.dart';

import '../features/finance/presentation/financial_widgets.dart';
import '../local/finance_domain.dart';
import '../local/local_store.dart';
import '../local/local_runtime.dart';

Future<bool> _confirm(
  BuildContext context,
  String title,
  String consequences,
  String phrase,
) async {
  final text = TextEditingController();
  try {
    return await showDialog<bool>(
          context: context,
          builder: (context) => StatefulBuilder(
            builder: (context, update) => AlertDialog(
              title: Text(title),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(consequences),
                    const SizedBox(height: 16),
                    TextField(
                      controller: text,
                      onChanged: (_) => update(() {}),
                      decoration: InputDecoration(labelText: 'Type $phrase'),
                      autofocus: true,
                    ),
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(context, false),
                  child: const Text('Keep profile'),
                ),
                FilledButton(
                  onPressed: text.text == phrase
                      ? () => Navigator.pop(context, true)
                      : null,
                  child: const Text('Confirm removal'),
                ),
              ],
            ),
          ),
        ) ??
        false;
  } finally {
    text.dispose();
  }
}

class LocalRemovalButton extends StatefulWidget {
  const LocalRemovalButton({super.key, required this.runtime});
  final LocalRuntime runtime;
  @override
  State<LocalRemovalButton> createState() => _LocalRemovalButtonState();
}

class _LocalRemovalButtonState extends State<LocalRemovalButton> {
  bool busy = false;
  String? error;
  Future<void> remove() async {
    final r = widget.runtime, s = widget.runtime.session!;
    final owner = s.localFinance.store.owner;
    final connected = await s.localFinance.store.connection() != null;
    if (!mounted) return;
    if (!await _confirm(
      context,
      'Remove this local profile?',
      '${connected ? 'This connected profile has cloud data. Local removal does not delete its cloud account, group membership or other devices.' : 'This is a local-only profile. There is no cloud copy to recover.'}\n\n'
          'All records, drafts, waiting unsynchronized work and encrypted attachment copies in this local profile will be removed. '
          'Waiting work will be lost. Save an encrypted archive and test recovery first; archives exclude original files. '
          'Existing external backups and other preserved profiles are kept. This works offline and does not remotely revoke this device.',
      'REMOVE LOCAL',
    )) {
      return;
    }
    if (!mounted) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await r.removeLocalProfile(owner);
    } catch (e) {
      if (mounted) {
        setState(() {
          error = e is LocalRuleException ? e.message : 'Removal did not finish. Restart to resume the protected removal checkpoint; do not reset other profiles.';
        });
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      OutlinedButton(
        onPressed: busy ? null : remove,
        child: Text(busy ? 'Removing local profile…' : 'Remove local profile'),
      ),
      if (error != null)
        Semantics(
          liveRegion: true,
          child: FinanceNotice(error!, warning: true),
        ),
    ],
  );
}

class DeviceLifecycleView extends StatefulWidget {
  const DeviceLifecycleView({super.key, required this.runtime});
  final LocalRuntime runtime;
  @override
  State<DeviceLifecycleView> createState() => _DeviceLifecycleViewState();
}

class _DeviceLifecycleViewState extends State<DeviceLifecycleView> {
  List<Map<String, dynamic>> devices = [];
  bool busy = false;
  String? message;
  Future<void> run(Future<void> Function() work) async {
    setState(() {
      busy = true;
      message = null;
    });
    try {
      await work();
    } catch (e) {
      message = e is LocalRuleException ? e.message : 'Online authorization did not complete. Reconnect with Google and retry. Local records and original waiting work are preserved.';
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.runtime.connected;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const FinanceNotice(
          'Devices are authenticated sign-in sessions. A device can have several sessions after signing in again. Labels identify the platform, not verified hardware. Revocation blocks cloud commands and subsequent authorized sync after server replication catches up. Already-downloaded offline copies cannot be remotely erased.',
        ),
        if (c.connected) ...[
          OutlinedButton(
            onPressed: busy
                ? null
                : () => run(() async {
                    devices = await c.authorizedDevices();
                  }),
            child: const Text('Refresh authorized sessions'),
          ),
          for (final d in devices)
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(
                '${d['label']}${d['current'] == true ? ' · this session' : ''}',
              ),
              subtitle: Text(
                d['active'] == true
                    ? 'Active · last seen ${d['last_seen_at']}'
                    : 'Revoked or signed out',
              ),
              trailing: d['active'] != true
                  ? null
                  : TextButton(
                      onPressed: busy
                          ? null
                          : () async {
                              final yes = await _confirm(
                                context,
                                'Revoke this session?',
                                'The selected session loses cloud authorization. Its unsynchronized work and offline data remain on that device. Other authorized sessions stay connected. A fresh Google sign-in is separate authorization.',
                                'REVOKE',
                              );
                              if (!yes || !mounted) return;
                              await run(() async {
                                await c.revokeDevice(d['session_id'] as String);
                                if (d['current'] == true) {
                                  await c.signOut();
                                  devices = [];
                                } else {
                                  devices = await c.authorizedDevices();
                                }
                                message = 'Session revoked. Offline copies were not erased.';
                              });
                            },
                      child: const Text('Revoke'),
                    ),
            ),
          const SizedBox(height: 24),
          const FinanceNotice(
            'Connected account deletion permanently removes private cloud financial and Life records. Shared bills, settlements and minimum audit evidence belonging to other participants remain. Deleted participants lose access; a sole-owner group is archived without automatic takeover. Local copies and retained encrypted backups are separate. Transfer group ownership first when continued administration is needed.',
          ),
          TextButton(
            onPressed: busy ? null : c.signIn,
            child: const Text('Reauthenticate with Google before deletion'),
          ),
          OutlinedButton(
            onPressed: busy
                ? null
                : () async {
                    if (!await _confirm(
                      context,
                      'Delete connected account?',
                      'This requires a new Google authentication within five minutes. Private cloud history will be erased and all sessions revoked. '
                          'Waiting local work will never be uploaded to this deleted account. Back it up first if you need a personal copy. '
                          'Necessary group evidence remains with other participants. Original devices and encrypted backups are not remotely erased. '
                          'This local copy stays available until separately removed. Deletion does not delete your Google account.',
                      'DELETE CONNECTED ACCOUNT',
                    )) {
                      return;
                    }
                    if (!mounted) return;
                    await run(() async {
                      final pending = await c.deleteConnectedAccount();
                      devices = [];
                      message = pending
                          ? 'Private cloud data deleted; provider identity cleanup needs operator retry. All Salapiya authorization is blocked. This local copy remains.'
                          : 'Connected account deleted. This local copy remains until separately removed.';
                    });
                  },
            child: const Text('Delete connected account'),
          ),
        ] else
          const Text(
            'A local-only profile has no connected account or cloud sessions to revoke.',
          ),
        if (message != null)
          Semantics(liveRegion: true, child: FinanceNotice(message!)),
        const SizedBox(height: 24),
        LocalRemovalButton(runtime: widget.runtime),
      ],
    );
  }
}
