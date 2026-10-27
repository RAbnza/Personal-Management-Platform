import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:path_provider/path_provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:salapiya/life/life_domain.dart';
import 'package:salapiya/local/finance_domain.dart';
import 'package:salapiya/local/local_store.dart';

import 'p2_native_test.dart' show PrivateDownload;

/// Reuses the explicitly retained Google sessions from the existing P3 harness.
/// Only synthetic archived Life records are appended; financial revisions and
/// default profile selection are never changed, and no profile is replaced.
Future<void> verifyP5GoogleLife(
  WidgetTester tester,
  List<SupabaseClient> clients,
  String endpoint,
) async {
  final commands = <String, LifeCommand>{};
  final support = await getApplicationSupportDirectory();
  for (final client in clients) {
    final user = (await client.auth.getUser()).user!;
    expect(user.identities!.any((i) => i.provider == 'google'), isTrue);
    var boundary = await client.rpc('p2_profile_boundary');
    if (boundary == null) {
      final enrollment = newLocalId(), profile = newLocalId();
      await client.rpc(
        'p2_stage_enrollment',
        params: {
          'enrollment_id': enrollment,
          'profile_id': profile,
          'display_name': 'P5 synthetic Google Life verification',
          'snapshot': <Map<String, dynamic>>[],
        },
      );
      final published = await client.rpc(
        'p2_publish_enrollment',
        params: {'enrollment_id': enrollment},
      ) as Map;
      expect(published['outcome'], 'published');
      boundary = await client.rpc('p2_profile_boundary');
      debugPrint(
        'P5_GOOGLE_LIFE: created an empty synthetic private workspace for an existing Google identity with no private profile; no existing profile was replaced.',
      );
    }
    final before = boundary as Map;
    final c = LifeCommand(
      owner: before['id'] as String,
      recordId: newLocalId(),
      type: LifeType.task,
      expectedVersion: 0,
      fields: {'title': 'P5 synthetic Google private Life evidence'},
      reason: 'Native Google Life verification',
    );
    for (final command in [
      c,
      LifeCommand(
        owner: c.owner,
        recordId: c.recordId,
        type: c.type,
        expectedVersion: 1,
        fields: {...c.fields, 'archived': 'true'},
        reason: 'Archive synthetic verification record',
      ),
    ]) {
      final receipt = await client.rpc(
        'p5_submit_command',
        params: {'command_id': command.id, 'command_payload': command.payload},
      ) as Map;
      expect(
        receipt['outcome'],
        'accepted',
        reason: receipt['reason'] as String?,
      );
    }
    commands[user.id] = c;
    final after = await client.rpc('p2_profile_boundary') as Map;
    expect(after['id'], before['id']);
    expect(after['revision'], before['revision']);
  }
  for (final client in clients) {
    final actor = client.auth.currentUser!.id, c = commands[actor]!;
    for (final foreign in commands.entries.where((e) => e.key != actor)) {
      expect(
        await client.from('p5_command').select('id').eq('id', foreign.value.id),
        isEmpty,
      );
    }
    final db = openLocalDatabase(
      '${support.path}/p5-google-${newLocalId()}.sqlite',
      newLocalId(),
    );
    await db.initialize();
    try {
      await db.connect(
        connector: PrivateDownload(client.auth.currentSession!, endpoint),
      );
      await tester.runAsync(() => db.waitForFirstSync());
      final rows = await db.getAll(
        'SELECT payload FROM p5_command WHERE id=? AND owner_id=?',
        [c.id, actor],
      );
      expect(rows, hasLength(1));
      expect(rows.single['payload'], c.payload);
      expect(
        await db.getAll('SELECT id FROM p5_command WHERE owner_id<>?', [actor]),
        isEmpty,
      );
    } finally {
      await db.close();
    }
  }
  debugPrint(
    'P5_GOOGLE_LIFE: ${Platform.operatingSystem} two retained real Google identities accepted private synthetic Life revisions, retrieved exact original payloads over native CDC and excluded the other owner; financial revisions unchanged.',
  );
}
