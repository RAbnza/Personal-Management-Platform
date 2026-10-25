import 'dart:convert';

import 'package:powersync/powersync.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../local/local_store.dart';

typedef SubmitFinancialCommand = Future<Map<String, dynamic>> Function(
  String id,
  String envelope,
);

class FinancialConnector extends PowerSyncBackendConnector {
  FinancialConnector({
    required this.store,
    required this.actor,
    required this.credentials,
    required this.submit,
    this.changed,
  });
  final LocalStore store;
  final String actor;
  final Future<PowerSyncCredentials?> Function() credentials;
  final SubmitFinancialCommand submit;
  final void Function()? changed;

  factory FinancialConnector.supabase(
    LocalStore store,
    SupabaseClient client,
    String endpoint, {
    void Function()? changed,
  }) {
    final actor = client.auth.currentUser!.id;
    return FinancialConnector(
      store: store,
      actor: actor,
      changed: changed,
      credentials: () async {
        var s = client.auth.currentSession;
        if (s == null || s.user.id != actor) return null;
        if (s.isExpired) s = (await client.auth.refreshSession()).session;
        if (s == null || s.user.id != actor) return null;
        return PowerSyncCredentials(
          endpoint: endpoint,
          token: s.accessToken,
          userId: actor,
        );
      },
      submit: (id, envelope) async {
        if (client.auth.currentUser?.id != actor) {
          throw StateError('Reauthentication required');
        }
        try {
          return Map<String, dynamic>.from(
            await client.rpc(
              'p2_submit_command',
              params: {'command_id': id, 'command_payload': envelope},
            ) as Map,
          );
        } on PostgrestException catch (e) {
          if (!(e.code?.startsWith('22') ?? false)) rethrow;
          return {
            'id': id,
            'owner_id': actor,
            'profile_id': store.owner,
            'outcome': 'rejected',
            'reason': 'Command identity or payload requires review.',
          };
        }
      },
    );
  }

  @override
  Future<PowerSyncCredentials?> fetchCredentials() => credentials();

  @override
  Future<void> uploadData(PowerSyncDatabase database) async {
    final transaction = await database.getNextCrudTransaction();
    if (transaction == null) return;
    final state = await store.connection();
    if (state == null ||
        state['remote_owner'] != actor ||
        state['phase'] != 'connected' ||
        state['paused'] == 1) {
      throw StateError('Synchronization is paused pending connection review');
    }
    for (final entry in transaction.crud) {
      if (entry.table != 'p2_transport' || entry.op != UpdateType.put) {
        throw StateError('Unexpected transport operation');
      }
      final envelope = entry.opData?['payload'] as String;
      final body = jsonDecode(envelope) as Map;
      final intent = await database.get(
        'SELECT * FROM connected_intent WHERE id=?',
        [entry.id],
      );
      if (body['profile_id'] != store.owner ||
          intent['envelope'] != envelope ||
          intent['payload'] != body['payload']) {
        throw StateError('Transport and durable financial intent differ');
      }
      if (['review', 'restored'].contains(intent['state'])) {
        // A restored queue never confers authority; recovery explicitly queues
        // only missing commands after authenticated review.
        continue;
      }
      final receipt = await submit(entry.id, envelope);
      if (receipt['id'] != entry.id ||
          receipt['owner_id'] != actor ||
          receipt['profile_id'] != store.owner ||
          !['accepted', 'rejected'].contains(receipt['outcome'])) {
        throw StateError('Invalid authenticated receipt');
      }
      await database.execute(
        "UPDATE connected_intent SET state=?,reason=? WHERE id=? AND state IN ('pending','accepted')",
        [
          receipt['outcome'] == 'accepted' ? 'accepted' : 'review',
          receipt['reason'],
          entry.id,
        ],
      );
    }
    await transaction.complete();
    changed?.call();
  }
}
