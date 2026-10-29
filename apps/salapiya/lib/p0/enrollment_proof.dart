import 'dart:convert';

import 'package:powersync/powersync.dart';

const proofCallback = 'dev.salapiya.p0://auth/callback';
bool isProofCallback(Uri uri) =>
    uri.scheme == 'dev.salapiya.p0' &&
    uri.host == 'auth' &&
    uri.userInfo.isEmpty &&
    !uri.hasPort &&
    uri.path == '/callback' &&
    uri.fragment.isEmpty &&
    (uri.queryParameters.containsKey('code') ||
        uri.queryParameters.containsKey('error'));

// Freeze a bounded synthetic local graph; do not mutate the approved UI profile.
class EnrollmentProof {
  EnrollmentProof(this.db);
  final PowerSyncDatabase db;
  Future<void> createLocal(String localId) => db.writeTransaction((tx) async {
    await tx.execute(
      '''CREATE TABLE IF NOT EXISTS proof_enrollment_state(
      id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER NOT NULL CHECK(version=1),
      local_id TEXT NOT NULL, enrollment_id TEXT, remote_owner TEXT,
      snapshot TEXT, phase TEXT NOT NULL CHECK(phase IN ('local','staged','collision','published'))) STRICT''',
    );
    await tx.execute(
      "INSERT INTO proof_enrollment_state(id,version,local_id,phase) VALUES(1,1,?,'local') ON CONFLICT DO NOTHING",
      [localId],
    );
    final state = await tx.get('SELECT * FROM proof_enrollment_state');
    if (state['version'] != 1 || state['local_id'] != localId) {
      throw StateError('One local profile per proof database');
    }
  });

  Future<String> stage(String enrollmentId, String authenticatedOwner) =>
      db.writeTransaction((tx) async {
        final state = await tx.get('SELECT * FROM proof_enrollment_state');
        if (state['phase'] != 'local') {
          if (state['enrollment_id'] != enrollmentId ||
              state['remote_owner'] != authenticatedOwner) {
            throw StateError('Different enrollment in progress');
          }
          return state['snapshot'] as String;
        }
        final rows = await tx.getAll(
          'SELECT id,CAST(amount_minor AS TEXT) AS amount_minor FROM proof_intent WHERE owner_id=? AND state=? ORDER BY id',
          [state['local_id'], 'local'],
        );
        if (rows.length > 100) {
          throw StateError('Proof graph exceeds bounded enrollment');
        }
        final snapshot = jsonEncode(
          rows
              .map(
                (row) => {'id': row['id'], 'amount_minor': row['amount_minor']},
              )
              .toList(),
        );
        await tx.execute(
          "UPDATE proof_enrollment_state SET enrollment_id=?,remote_owner=?,snapshot=?,phase='staged' WHERE id=1",
          [enrollmentId, authenticatedOwner, snapshot],
        );
        return snapshot;
      });

  Future<void> collision() => db.execute(
    "UPDATE proof_enrollment_state SET phase='collision' WHERE phase='staged'",
  );

  // Only the bounded graph verified through authenticated server reads can
  // complete publication. No file/profile activation or implicit merge here.
  Future<void> completePublication(
    String owner,
    String profileId,
    List<Map<String, dynamic>> accepted,
  ) => db.writeTransaction((tx) async {
    final state = await tx.get('SELECT * FROM proof_enrollment_state');
    if (state['remote_owner'] != owner ||
        state['local_id'] != profileId ||
        !['staged', 'published'].contains(state['phase'])) {
      throw StateError('Enrollment identity mismatch');
    }
    if (state['phase'] == 'published') return;
    final snapshot = jsonDecode(state['snapshot'] as String) as List;
    for (final source in snapshot) {
      final matches = accepted
          .where(
            (row) =>
                row['id'] == source['id'] &&
                row['owner_id'] == owner &&
                row['amount_minor'] == source['amount_minor'],
          )
          .toList();
      if (matches.length != 1) {
        throw StateError('Incomplete accepted enrollment graph');
      }
      final row = matches.single;
      final payload = jsonDecode(row['payload'] as String) as Map;
      if (payload['owner_id'] != owner ||
          payload['amount_minor'] != source['amount_minor'] ||
          payload['kind'] != 'expense' ||
          payload['expected_revision'] != 0 ||
          payload['version'] != 1) {
        throw StateError('Accepted enrollment payload mismatch');
      }
      await tx.execute(
        "UPDATE proof_intent SET owner_id=?,payload=?,state='accepted' WHERE id=?",
        [owner, row['payload'], source['id']],
      );
    }
    await tx.execute(
      "UPDATE proof_enrollment_state SET phase='published' WHERE id=1",
    );
  });
  // Cancelling preserves every record. No implicit merge, overwrite or account transfer.
  Future<void> cancel() => db.execute(
    "UPDATE proof_enrollment_state SET phase='local',enrollment_id=NULL,remote_owner=NULL,snapshot=NULL WHERE phase IN ('staged','collision')",
  );
}
