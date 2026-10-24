import 'package:powersync/powersync.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class ConnectedRecovery {
  ConnectedRecovery(this.db, this.client);
  final PowerSyncDatabase db;
  final SupabaseClient client;

  Future<String> review(
    String id,
    String owner, {
    bool explicitlyResumeMissing = false,
  }) async {
    if (client.auth.currentUser?.id != owner) {
      throw StateError('Current owner authentication required');
    }
    final intent = await db.get('SELECT * FROM proof_intent WHERE id=?', [id]);
    if (intent['owner_id'] != owner ||
        intent['state'] != 'review' ||
        !(intent['reason'] as String? ?? '').startsWith('restored_')) {
      throw StateError('Restored review intent required');
    }
    final payload = intent['payload'] as String;
    final receipt = Map<String, dynamic>.from(
      await client.rpc(
        'p0_review_command',
        params: {'command_id': id, 'command_payload': payload},
      ) as Map,
    );
    if (receipt['owner_id'] != owner ||
        receipt['id'] != id ||
        ![
          'accepted',
          'rejected',
          'missing',
          'mismatch',
        ].contains(receipt['outcome'])) {
      throw StateError('Invalid recovery receipt');
    }
    final outcome = receipt['outcome'] as String;
    await db.writeTransaction((tx) async {
      final current = await tx.get('SELECT * FROM proof_intent WHERE id=?', [
        id,
      ]);
      if (current['owner_id'] != owner ||
          current['payload'] != payload ||
          current['state'] != 'review') {
        throw StateError('Recovery changed during review');
      }
      if (outcome == 'missing' && explicitlyResumeMissing) {
        await tx.execute(
          "UPDATE proof_intent SET state='pending',reason=NULL WHERE id=?",
          [id],
        );
        await tx.execute(
          'INSERT INTO command_transport(id,payload) VALUES(?,?)',
          [id, payload],
        );
      } else {
        // Accepted still waits for a matching actual PowerSync download. Receipt
        // review never fabricates a replicated snapshot or grants group access.
        await tx.execute('UPDATE proof_intent SET reason=? WHERE id=?', [
          'restored_${outcome}_requires_review_or_download',
          id,
        ]);
      }
    });
    return outcome;
  }
}
