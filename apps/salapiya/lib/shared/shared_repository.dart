import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';

import '../local/finance_domain.dart';
import '../local/local_runtime.dart';
import '../local/local_store.dart';
import 'shared_domain.dart';

class SharedRepository extends ChangeNotifier {
  SharedRepository(this.runtime, this.store);
  final LocalRuntime runtime;
  final LocalStore store;
  StreamSubscription<dynamic>? _records, _intents;
  bool _closed = false;
  List<SharedGroup> groups = [];
  List<SharedJson> intents = [];
  List<SharedJson> drafts = [];
  StreamSubscription<dynamic>? _drafts;
  StreamSubscription<dynamic>? _resources;
  StreamSubscription<dynamic>? _reviews;
  List<SharedJson> reviews = [];
  String? error;
  String? get actor => runtime.connected.binding?['remote_owner'] as String?;
  bool get online =>
      runtime.connected.flow?.client.auth.currentUser?.id == actor &&
      store.db.currentStatus.connected &&
      runtime.connected.binding?['paused'] == 0 &&
      runtime.connected.binding?['phase'] == 'connected';
  Future<void> open() async {
    _reviews = store.db
        .watch('SELECT id FROM p3_private_review')
        .distinct((a, b) => jsonEncode(a) == jsonEncode(b))
        .listen((_) => unawaited(reload()));
    _resources = store.db
        .watch('SELECT id,version FROM p3_resource')
        .distinct((a, b) => jsonEncode(a) == jsonEncode(b))
        .listen((_) => unawaited(reload()));
    _drafts = store.db
        .watch('SELECT id,updated_at FROM shared_draft')
        .distinct((a, b) => jsonEncode(a) == jsonEncode(b))
        .listen((_) => unawaited(reload()));
    _records = store.db
        .watch('SELECT id,version FROM p3_group')
        .distinct((a, b) => jsonEncode(a) == jsonEncode(b))
        .listen((_) => unawaited(reload()));
    _intents = store.db
        .watch('SELECT id,state FROM shared_intent')
        .distinct((a, b) => jsonEncode(a) == jsonEncode(b))
        .listen((_) => unawaited(reload()));
    await reload();
  }

  Future<void> reload() async {
    try {
      await store.reconcileShared();
      final user = actor;
      final rows = await store.db.getAll(
        'SELECT document FROM shared_snapshot_cache WHERE owner_id=? ORDER BY group_id',
        [user],
      );
      groups = rows
          .map((r) => SharedGroup(object(jsonDecode(r['document'] as String))))
          .toList();
      intents = (await store.db.getAll(
        'SELECT * FROM shared_intent WHERE actor=? ORDER BY recorded_at DESC',
        [user],
      )).map(object).toList();
      error = null;
      drafts = (await store.db.getAll(
        'SELECT * FROM shared_draft ORDER BY updated_at DESC',
      )).map(object).toList();
      reviews = [
        ...(await store.db.getAll(
          'SELECT * FROM p3_private_review WHERE owner_id=? ORDER BY recorded_at DESC',
          [user],
        )).map(object),
        ...(await store.db.getAll('SELECT payload FROM shared_review_history'))
            .map(
              (r) => {
                ...object(jsonDecode(r['payload'] as String)),
                'historicalOnly': true,
              },
            )
            .where((r) => r['owner_id'] == user),
      ];
    } catch (_) {
      error = 'Shared records could not be read. Your stored evidence is preserved; reopen or retry.';
    }
    if (!_closed) notifyListeners();
  }

  SharedJson command(
    String group,
    String op,
    SharedJson values, {
    int version = 0,
  }) => {
    'contract': 3,
    'group': group,
    'op': op,
    'version': version,
    'values': values,
  };
  Future<String> submit(
    String group,
    String op,
    SharedJson values, {
    int version = 0,
    String? id,
  }) async {
    final user = actor;
    if (user == null) {
      reject('Connect your profile with Google before joining a group.');
    }
    final queued = ['bill', 'report'].contains(op);
    if (!queued && !online) {
      reject('Connect and synchronize before reviewing this operation.');
    }
    final cid = id ?? newLocalId();
    final payload = jsonEncode(command(group, op, values, version: version));
    // Accept tokens are ephemeral online requests. Store their digest rather than
    // invitation secrets; lost responses resolve by original authenticated ID.
    if (op == 'accept') {
      final prior = await runtime.connected.flow!.client.rpc(
        'p3_submit_command',
        params: {'command_id': cid, 'command_payload': payload},
      );
      if (prior['outcome'] != 'accepted') {
        reject(prior['reason'] as String? ?? 'Invitation requires review.');
      }
      return cid;
    }
    await store.saveSharedIntent(cid, user, group, payload, queued: queued);
    if (!queued) await retry(cid);
    await reload();
    return cid;
  }

  Future<void> retry(String id) async {
    if (!online) reject('A current online identity is required.');
    final row = await store.db.get('SELECT * FROM shared_intent WHERE id=?', [
      id,
    ]);
    if (row['actor'] != actor || row['state'] == 'review') {
      reject('Review the original intent before creating a corrected command.');
    }
    if (row['state'] == 'restored') {
      final original = object(
        await runtime.connected.flow!.client.rpc(
          'p3_review_command',
          params: {'command_id': id},
        ),
      );
      if (original['outcome'] != 'missing') {
        await store.recordSharedReceipt(id, actor!, original);
        await reload();
        return;
      }
      // Explicit same-ID resume after current identity validation. The server
      // independently rechecks membership; no archived authority is restored.
    }
    final receipt = object(
      await runtime.connected.flow!.client.rpc(
        'p3_submit_command',
        params: {'command_id': id, 'command_payload': row['payload']},
      ),
    );
    await store.recordSharedReceipt(id, actor!, receipt);
    await reload();
    if (receipt['outcome'] != 'accepted') {
      reject(receipt['reason'] as String? ?? 'Group submission needs review.');
    }
  }

  Future<SharedJson> reviewInvitation(String code) async {
    if (!online) reject('Connect with the intended Google identity first.');
    final parts = code.trim().split('.');
    if (parts.length != 2) reject('Paste the complete group.code invitation.');
    return object(
      await runtime.connected.flow!.client.rpc(
        'p3_review_invitation',
        params: {'group_id': parts[0], 'token': parts[1]},
      ),
    );
  }

  static String invitationToken() => List.generate(
    32,
    (_) => Random.secure().nextInt(256),
  ).map((n) => n.toRadixString(16).padLeft(2, '0')).join();
  static String tokenHash(String token) =>
      sha256.convert(utf8.encode(token)).toString();
  Future<void> draft(String id, String group, SharedJson values) =>
      store.db.execute(
        'INSERT INTO shared_draft VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at',
        [
          id,
          group,
          jsonEncode(values),
          DateTime.now().toUtc().toIso8601String(),
        ],
      );
  @override
  void dispose() {
    _closed = true;
    unawaited(_records?.cancel());
    unawaited(_intents?.cancel());
    unawaited(_drafts?.cancel());
    unawaited(_resources?.cancel());
    unawaited(_reviews?.cancel());
    super.dispose();
  }
}
