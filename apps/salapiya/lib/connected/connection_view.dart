import 'package:flutter/material.dart';

import '../design_system/editorial.dart';
import '../design_system/welcome_frame.dart';
import '../features/finance/presentation/financial_widgets.dart';
import '../local/finance_domain.dart';
import '../local/local_profile_view.dart';
import '../local/local_runtime.dart';
import 'connected_runtime.dart';

class ConnectionPage extends StatelessWidget {
  const ConnectionPage({super.key, required this.runtime});
  final LocalRuntime runtime;
  @override
  Widget build(BuildContext context) => runtime.session == null
      ? WelcomeFrame(
          step: 'Google connection',
          child: ConnectionBody(runtime: runtime),
        )
      : FinancePage(
          title: 'Google connection',
          child: WorkspaceForm(child: ConnectionBody(runtime: runtime)),
        );
}

class ConnectionBody extends StatefulWidget {
  const ConnectionBody({super.key, required this.runtime});
  final LocalRuntime runtime;
  @override
  State<ConnectionBody> createState() => _ConnectionBodyState();
}

class _ConnectionBodyState extends State<ConnectionBody> {
  ConnectedRuntime get c => widget.runtime.connected;
  bool exported = false;
  int reviewPage = 0;
  Future<void> confirm() async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        scrollable: true,
        title: const Text('Enable private synchronization?'),
        content: Text(
          'Selected Google identity: ${c.identity}\n\n'
          'Connecting uploads your private Money and Life records, financial evidence, Career details and document metadata to Salapiya’s configured Supabase and PowerSync services. Document bytes remain on the device. '
          'Google supplies identity. Drafts and device preferences stay on this device. '
          'Authorized service administrators may access cloud data; this is not end-to-end encryption. '
          'Existing cloud history is downloaded before complete totals are shown.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Confirm connection'),
          ),
        ],
      ),
    );
    if (yes == true) await c.confirmConnection();
  }

  Future<void> switchProfile() async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        scrollable: true,
        title: const Text('Preserve local & use cloud'),
        content: Text(
          'Switch to ${c.cloud?['name']} for ${c.identity}? Your exported encrypted archive and its recovery secret must be kept separately. '
          'The original local database and its protected key will also be retained on this installation. '
          'No records are merged. One cloud profile becomes active; routine profile switching is unavailable.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Use reviewed cloud profile'),
          ),
        ],
      ),
    );
    if (yes == true) {
      await c.switchAfterBackup();
      if (mounted && c.error == null) {
        Navigator.of(context).popUntil((route) => route.isFirst);
      }
    }
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: c,
    builder: (context, _) {
      final signed = c.flow?.client.auth.currentUser != null;
      final collision =
          c.cloud != null &&
          widget.runtime.session != null &&
          c.cloud!['id'] != widget.runtime.session!.localFinance.store.owner;
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const FinanceHeading(
            'PRIVATE CONNECTION',
            'Your money, across devices.',
            'Google is optional. Local records remain encrypted and available through connection failures.',
          ),
          ValueBlock(
            'CONNECTION',
            c.label,
            '${c.identity}\nFinancial: ${c.pendingCount} waiting · ${c.reviewCount} for review. Life: ${c.lifePendingCount} waiting · ${c.lifeReviewCount} for review (open Life).',
          ),
          if (c.binding?['last_sync'] != null)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Text(
                'Last verified synchronization: ${DateTime.parse(c.binding!['last_sync'] as String).toUtc().add(const Duration(hours: 8))} (Asia/Manila)',
              ),
            ),
          const SizedBox(height: 20),
          if (!c.configured)
            const FinanceNotice(
              'This build supports local use. Google requires the existing development service configuration.',
              warning: true,
            ),
          if (c.error != null)
            Semantics(
              liveRegion: true,
              child: FinanceNotice(c.error!, warning: true),
            ),
          if (c.flow != null &&
              ![
                'ready',
                'google_code_exchange_verified',
              ].contains(c.flow!.outcome))
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Text(switch (c.flow!.outcome) {
                'waiting_for_google' || 'interrupted_attempt_restored' => 'Complete the account selection in your system browser, or cancel sign-in.',
                'wrong_account_local_data_preserved' => 'That is a different Google identity. Reconnect with the identity bound to this profile.',
                'cancelled_local_data_preserved' || 'provider_cancelled' =>
                  'Sign-in cancelled. Your local records are unchanged.',
                'late_callback_ignored' => 'The cancelled sign-in was ignored. Start a new attempt when ready.',
                _ => 'Sign-in could not finish. Your local records are preserved. Try again.',
              }),
            ),
          Wrap(
            spacing: 12,
            runSpacing: 12,
            children: [
              if (c.flow?.pending == true)
                OutlinedButton(
                  onPressed: c.busy ? null : () => c.flow!.cancel(),
                  child: const Text('Cancel sign-in'),
                )
              else
                FilledButton.icon(
                  onPressed: c.busy || !c.configured ? null : c.signIn,
                  icon: const Icon(Icons.login),
                  label: Text(
                    c.binding == null
                        ? 'Select Google account'
                        : 'Reconnect Google account',
                  ),
                ),
              if (signed && c.binding == null)
                OutlinedButton(
                  onPressed: c.busy ? null : c.lookup,
                  child: const Text('Review selected Google account'),
                ),
              if (signed &&
                  !collision &&
                  (c.binding == null ||
                      ['staged', 'restored'].contains(c.binding!['phase'])))
                FilledButton(
                  onPressed: c.busy ? null : confirm,
                  child: Text(
                    c.binding == null
                        ? 'Review connection'
                        : 'Resume connection',
                  ),
                ),
              if (c.binding != null && c.binding!['phase'] != 'staged') ...[
                FilledButton.icon(
                  onPressed: c.busy || c.binding!['paused'] == 1
                      ? null
                      : c.syncNow,
                  icon: const Icon(Icons.sync),
                  label: const Text('Sync now'),
                ),
                OutlinedButton(
                  onPressed: c.busy
                      ? null
                      : () => c.pause(c.binding!['paused'] != 1),
                  child: Text(
                    c.binding!['paused'] == 1 ? 'Resume sync' : 'Pause sync',
                  ),
                ),
                OutlinedButton(
                  onPressed: c.busy ? null : c.signOut,
                  child: const Text('Sign out of this session'),
                ),
              ],
              if (c.binding == null || c.binding!['phase'] == 'staged')
                TextButton(
                  onPressed: c.busy ? null : c.cancelConnection,
                  child: const Text('Cancel connection'),
                ),
            ],
          ),
          if (c.busy)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 20),
              child: LinearProgressIndicator(),
            ),
          if (collision) ...[
            const SizedBox(height: 24),
            const FinanceNotice(
              'This Google identity already owns a different cloud profile. There is no automatic merge or overwrite. Cancel keeps this local profile unchanged.',
              warning: true,
            ),
            const SizedBox(height: 16),
            Text(
              'Cloud profile: ${c.cloud!['name']} · ${c.cloud!['revision']} accepted commands',
            ),
            const SizedBox(height: 16),
            LocalRecoveryBody(
              runtime: widget.runtime,
              onExported: () => setState(() => exported = true),
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: c.busy || !exported ? null : switchProfile,
              child: const Text('Preserve local & use cloud'),
            ),
          ],
          if (c.reviews.isNotEmpty) ...[
            const SizedBox(height: 24),
            const SectionHeading('Needs review'),
            const FinanceNotice(
              'These original intents remain on this device. Rejected changes are excluded from balances. Review current history before creating a corrected action.',
            ),
            for (final row
                in c.reviews
                    .skip(
                      reviewPage * 50 < c.reviews.length ? reviewPage * 50 : 0,
                    )
                    .take(50))
              Padding(
                padding: const EdgeInsets.only(top: 16),
                child: Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(
                          LocalCommand.decode(
                                row['id'] as String,
                                row['payload'] as String,
                              ).values['name'] ??
                              'Financial change',
                        ),
                        Text('Original command: ${row['id']}'),
                        Text(switch (row['reason']) {
                          'restored_missing' => 'This work has no current server receipt. After the download is complete, explicitly resume it under its original identity.',
                          'restored_rejected' => 'The service previously rejected this change. Its original values are retained.',
                          'restored_mismatch' => 'This identity has different server evidence. Preserve the archive and review before taking further action.',
                          _ =>
                            row['reason'] as String? ??
                                'Current financial sources require review.',
                        }),
                        ExpansionTile(
                          title: const Text('Original saved values'),
                          children: [
                            for (final e in LocalCommand.decode(
                              row['id'] as String,
                              row['payload'] as String,
                            ).values.entries)
                              ListTile(
                                title: Text(e.key),
                                subtitle: Text(e.value),
                              ),
                          ],
                        ),
                        if (row['reason'] == 'restored_missing')
                          OutlinedButton(
                            onPressed: c.busy
                                ? null
                                : () => c.resumeMissing(row['id'] as String),
                            child: const Text('Resume this original command'),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
            if (c.reviews.length > 50)
              Wrap(
                spacing: 12,
                children: [
                  TextButton(
                    onPressed: reviewPage == 0
                        ? null
                        : () => setState(() => reviewPage--),
                    child: const Text('Previous review items'),
                  ),
                  TextButton(
                    onPressed: (reviewPage + 1) * 50 >= c.reviews.length
                        ? null
                        : () => setState(() => reviewPage++),
                    child: const Text('More review items'),
                  ),
                ],
              ),
          ],
          const SizedBox(height: 24),
          const FinanceNotice(
            'Pause stops synchronization. Sign out removes this installation’s online session while retaining private local data and waiting work. Neither action disconnects ownership, removes a device, or deletes local/cloud records. Device revocation and deletion are separate lifecycle work.',
          ),
        ],
      );
    },
  );
}
