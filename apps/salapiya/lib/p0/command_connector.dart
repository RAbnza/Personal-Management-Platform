import 'dart:convert';

import 'package:powersync/powersync.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

typedef SubmitProofCommand = Future<Map<String, dynamic>> Function(
  String id,
  String payload,
);

class ProofConnector extends PowerSyncBackendConnector {
  ProofConnector({
    required this.owner,
    required this.submit,
    required this.credentials,
  });
  final String owner;
  final SubmitProofCommand submit;
  final Future<PowerSyncCredentials?> Function() credentials;

  factory ProofConnector.supabase({
    required SupabaseClient client,
    required String owner,
    required String endpoint,
  }) => ProofConnector(
    owner: owner,
    credentials: () async {
      var session = client.auth.currentSession;
      if (session == null || session.user.id != owner) return null;
      if (session.isExpired)
        session = (await client.auth.refreshSession()).session;
      if (session == null || session.user.id != owner) return null;
      return PowerSyncCredentials(
        endpoint: endpoint,
        token: session.accessToken,
        userId: owner,
      );
    },
    submit: (id, payload) async {
      if (client.auth.currentUser?.id != owner)
        throw StateError('Reauthentication required');
      try {
        final value = await client.rpc(
          'p0_submit_expense',
          params: {'command_id': id, 'command_payload': payload},
        );
        return Map<String, dynamic>.from(value as Map);
      } on PostgrestException catch (error) {
        if (error.code != '22023') rethrow;
        return {
          'id': id,
          'owner_id': owner,
          'outcome': 'rejected',
          'reason': 'payload_mismatch_or_invalid',
        };
      }
    },
  );

  @override
  Future<PowerSyncCredentials?> fetchCredentials() => credentials();

  @override
  Future<void> uploadData(PowerSyncDatabase database) async {
    final transaction = await database.getNextCrudTransaction();
    if (transaction == null) return;
    for (final entry in transaction.crud) {
      if (entry.table != 'command_transport' || entry.op != UpdateType.put) {
        throw StateError('Unexpected proof transport operation');
      }
      final payload = entry.opData?['payload'] as String;
      final data = jsonDecode(payload) as Map<String, dynamic>;
      if (data['owner_id'] != owner)
        throw StateError('Queue belongs to another identity');
      final receipt = await submit(entry.id, payload);
      if (receipt['id'] != entry.id ||
          receipt['owner_id'] != owner ||
          !['accepted', 'rejected'].contains(receipt['outcome'])) {
        throw StateError('Invalid receipt; retain queue');
      }
      await database.writeTransaction((tx) async {
        final intent = await tx.get(
          'SELECT payload,owner_id FROM proof_intent WHERE id=?',
          [entry.id],
        );
        if (intent['payload'] != payload || intent['owner_id'] != owner)
          throw StateError('Intent mismatch');
        await tx.execute(
          '''UPDATE proof_intent SET state=?,reason=?
          WHERE id=? AND state IN ('pending','accepted')''',
          [
            receipt['outcome'] == 'accepted' ? 'accepted' : 'review',
            receipt['reason'] as String?,
            entry.id,
          ],
        );
      });
    }
    // Crash before this call safely replays server receipts; after it the local
    // accepted/review state is durable. SDK owns queue checkpoints and backoff.
    await transaction.complete();
  }
}
