// Isolated executable P0 harness. The approved product entry point is unchanged.
import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:cryptography/cryptography.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:path_provider/path_provider.dart';
import 'package:powersync/powersync.dart' show PowerSyncDatabase, uuid;
import 'package:supabase_flutter/supabase_flutter.dart';

import 'auth_runtime.dart';
import 'command_connector.dart';
import 'enrollment_proof.dart';
import 'google_auth_proof.dart';
import 'local_ledger.dart';
import 'portable_recovery.dart';
import 'proof_database.dart';
import 'reliability_proof.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final support = await getApplicationSupportDirectory();
  const configPath = String.fromEnvironment('P0_GOOGLE_CONFIG_PATH');
  final file = File(
    Platform.isWindows ? configPath : '${support.path}/p0-google-config.json',
  );
  final config = jsonDecode(await file.readAsString()) as Map<String, dynamic>;
  final directory = Directory(
    Platform.isWindows
        ? config['controlDirectory'] as String
        : '${support.path}/p0-google',
  );
  await directory.create(recursive: true);
  final controller = OAuthHarness(config, directory);
  await controller.initialize();
  runApp(MaterialApp(home: HarnessScreen(controller)));
}

class OAuthHarness extends ChangeNotifier {
  OAuthHarness(this.config, this.directory);
  final Map<String, dynamic> config;
  final Directory directory;
  static const vault = FlutterSecureStorage();
  late GoogleAuthProof flow;
  late PowerSyncDatabase db;
  late Map<String, dynamic> profile;
  bool busy = false;
  int starts = 0;
  Timer? timer;
  final events = <String>[];
  String get scope => 'salapiya.p0.google.${config['platform']}';
  String get statusPath => '${directory.path}/status.json';

  Future<void> initialize() async {
    final auth = await initializeProofAuth(
      config['url'] as String,
      config['publicKey'] as String,
      scope: scope,
      detectSessionInUri: false,
    );
    flow = GoogleAuthProof(auth, scope, vault);
    flow.addListener(() {
      notifyListeners();
      if (!busy) unawaited(status());
    });
    final saved = await vault.read(key: '$scope.profile');
    if (saved == null) {
      profile = freshProfile();
      await saveProfile();
    } else {
      profile = jsonDecode(saved) as Map<String, dynamic>;
    }
    await openProfile();
    starts = int.parse(await vault.read(key: '$scope.starts') ?? '0') + 1;
    await vault.write(key: '$scope.starts', value: '$starts');
    await flow.listen();
    events.add(
      flow.client.auth.currentSession == null
          ? 'offline_profile_ready'
          : 'secure_session_restored',
    );
    await status();
    timer = Timer.periodic(const Duration(seconds: 1), (_) {
      unawaited(poll());
    });
  }

  Map<String, dynamic> freshProfile() => {
    'id': uuid.v4(),
    'source': uuid.v4(),
    'claim': uuid.v4(),
    'command': uuid.v4(),
    'mode': 'local',
  };
  Future<void> saveProfile() async {
    await vault.write(key: '$scope.profile', value: jsonEncode(profile));
    await vault.write(
      key: '$scope.profile.${profile['id']}',
      value: jsonEncode(profile),
    );
  }

  Future<void> openProfile() async {
    final file = File('${directory.path}/${profile['id']}.sqlite');
    final slot = '$scope.database.${profile['id']}';
    var key = await vault.read(key: slot);
    if (key == null) {
      if (await file.exists()) {
        throw StateError('Missing key; preserve encrypted database');
      }
      key = await PortableRecovery.newRecoverySecret();
      await vault.write(key: slot, value: key);
    }
    db = openProofDatabase(file.path, key);
    await db.initialize();
    final ledger = LocalLedger(db);
    await ledger.migrate();
    if (profile['mode'] == 'local') {
      await EnrollmentProof(db).createLocal(profile['id'] as String);
      if ((await db.get('SELECT count(*) AS n FROM proof_intent'))['n'] == 0) {
        await ledger.expense(
          id: profile['source'] as String,
          owner: profile['id'] as String,
          amount: '500050',
        );
      }
    }
  }

  Future<void> _statusQueue = Future.value();
  Future<void> status() =>
      _statusQueue = _statusQueue.then((_) => _writeStatus());
  Future<void> _writeStatus() async {
    final session = flow.client.auth.currentSession;
    final digest = session == null
        ? null
        : (await Sha256().hash(utf8.encode(session.user.id))).bytes
              .map((b) => b.toRadixString(16).padLeft(2, '0'))
              .join()
              .substring(0, 16);
    final value = {
      'platform': config['platform'],
      'starts': starts,
      'busy': busy,
      'outcome': flow.outcome,
      'pendingOAuth': flow.pending,
      'sessionPresent': session != null,
      'googleIdentity':
          session?.user.identities?.any((i) => i.provider == 'google') ?? false,
      'ownerFingerprint': digest,
      'boundOwnerMatches':
          profile['owner'] == null || profile['owner'] == session?.user.id,
      'mode': profile['mode'],
      'localIntentCount': (await db.get(
        'SELECT count(*) AS n FROM proof_intent',
      ))['n'],
      'acceptedCount': (await db.get(
        'SELECT count(*) AS n FROM p0_accepted',
      ))['n'],
      'events': events.take(50).toList(),
    };
    await File(statusPath).writeAsString(jsonEncode(value), flush: true);
    notifyListeners();
  }

  Future<void> poll() async {
    if (busy) return;
    final file = File('${directory.path}/command.json');
    if (!await file.exists()) return;
    final value = jsonDecode(await file.readAsString()) as Map;
    await file.delete();
    await action(value['action'] as String);
  }

  Future<void> action(String name) async {
    if (busy) return;
    busy = true;
    await status();
    try {
      switch (name) {
        case 'google':
          await flow.start(expectedOwner: profile['owner'] as String?);
        case 'cancel':
          await flow.cancel();
        case 'cancel_enrollment':
          await EnrollmentProof(db).cancel();
          events.add('enrollment_cancelled_original_records_preserved');
        case 'logout':
          await db.disconnect();
          await flow.client.auth.signOut(scope: SignOutScope.local);
          events.add('test_session_signed_out_local_records_preserved');
        case 'refresh':
          final result = await flow.client.auth.refreshSession();
          if (result.user?.id != profile['owner']) {
            throw StateError('Refresh identity mismatch');
          }
          events.add('actual_refresh_verified');
        case 'revoke_probe':
          final refresh = flow.client.auth.currentSession!.refreshToken!;
          final before = (await db.get(
            'SELECT count(*) AS n FROM proof_intent',
          ))['n'];
          await db.disconnect();
          await flow.client.auth.signOut(scope: SignOutScope.local);
          try {
            await flow.client.auth.refreshSession(refresh);
            throw StateError('Revoked refresh unexpectedly accepted');
          } on AuthException {
            if ((await db.get('SELECT count(*) AS n FROM proof_intent'))['n'] !=
                before) {
              throw StateError('Local records changed');
            }
            events.add(
              'real_google_refresh_revocation_local_records_preserved',
            );
          }
        case 'reliability':
          final result = await runReliabilityProof(
            db,
            flow.client,
            config['powersyncUrl'] as String,
          );
          await File('${directory.path}/reliability.json')
              .writeAsString(jsonEncode(result));
          events.add(
            'controlled_503_restart_full_resync_connected_restore_passed',
          );
        case 'stage':
          await proof(stageOnly: true);
        case 'proof':
          await proof();
        case 'retrieve':
          final owner = (await flow.client.auth.getUser()).user!.id;
          await db.close();
          profile = {...freshProfile(), 'mode': 'retrieved', 'owner': owner};
          await saveProfile();
          await openProfile();
          events.add('explicit_retrieval_original_local_database_retained');
          await proof();
        case 'new_profile':
          await db.close();
          profile = freshProfile();
          await saveProfile();
          await openProfile();
          events.add('explicit_separate_profile_original_database_retained');
        default:
          throw StateError('Unknown harness action');
      }
      events.add('${name}_completed');
    } catch (error) {
      // Never persist exception strings: provider errors can contain credentials.
      events.add('${name}_failed_${error.runtimeType}');
    } finally {
      busy = false;
      await status();
    }
  }

  Future<void> proof({bool stageOnly = false}) async {
    final client = flow.client;
    final user = (await client.auth.getUser()).user!;
    if (!(user.identities?.any((i) => i.provider == 'google') ?? false)) {
      throw StateError('Actual Google account required');
    }
    final owner = user.id;
    if (profile['owner'] != null && profile['owner'] != owner) {
      throw StateError('Separate profile choice required');
    }
    if (profile['mode'] == 'local') {
      final enrollment = EnrollmentProof(db);
      final snapshot = await enrollment.stage(
        profile['claim'] as String,
        owner,
      );
      final staged = await client.rpc(
        'p0_stage_enrollment',
        params: {
          'enrollment_id': profile['claim'],
          'profile_id': profile['id'],
          'snapshot': jsonDecode(snapshot),
        },
      );
      if (staged['outcome'] == 'collision') {
        await enrollment.collision();
        events.add('existing_cloud_collision_local_graph_frozen');
        return;
      }
      profile['owner'] = owner;
      await saveProfile();
      if (stageOnly) {
        events.add('private_stage_durable_no_publication');
        return;
      }
      final published = await client.rpc(
        'p0_publish_enrollment',
        params: {'enrollment_id': profile['claim']},
      );
      if (published['outcome'] != 'published') {
        throw StateError('Publication collision');
      }
      final actions = await client
          .from('p0_accepted')
          .select()
          .eq('id', profile['source'] as String);
      await enrollment.completePublication(
        owner,
        profile['id'] as String,
        actions,
      );
      events.add('bounded_graph_publication_verified');
    }
    final connector = ProofConnector.supabase(
      client: client,
      owner: owner,
      endpoint: config['powersyncUrl'] as String,
    );
    await LocalLedger(db).expense(
      id: profile['command'] as String,
      owner: owner,
      amount: '7',
      connected: true,
    );
    await db.connect(
      connector: connector,
      params: {'owner_id': '00000000-0000-0000-0000-000000000000'},
    );
    await db.waitForFirstSync().timeout(const Duration(seconds: 60));
    await db
        .watch(
          'SELECT id FROM p0_accepted WHERE id=?',
          parameters: [profile['command']],
        )
        .firstWhere((rows) => rows.length == 1)
        .timeout(const Duration(seconds: 60));
    await LocalLedger(db).reconcile(owner);
    if ((await db.get('SELECT state FROM proof_intent WHERE id=?', [
          profile['command'],
        ]))['state'] !=
        'reconciled') {
      throw StateError('Checkpoint handoff incomplete');
    }
    if ((await db.getAll('SELECT id FROM p0_accepted WHERE owner_id!=?', [
      owner,
    ])).isNotEmpty) {
      throw StateError('Private stream violation');
    }
    final remote = await client.from('p0_accepted').select('id,amount_minor');
    final boundary = remote.map((row) => row['id']).toSet();
    // waitForFirstSync may describe an earlier cached checkpoint after reopen.
    // Wait for this authenticated immutable boundary rather than claiming it
    // complete from an old command that was already downloaded.
    await db
        .watch(
          'SELECT id FROM p0_accepted WHERE owner_id=?',
          parameters: [owner],
        )
        .firstWhere(
          (rows) => rows.map((row) => row['id']).toSet().containsAll(boundary),
        )
        .timeout(const Duration(seconds: 60));
    final local = await db.getAll('SELECT id,amount_minor FROM p0_accepted');
    if (!local.map((row) => row['id']).toSet().containsAll(boundary)) {
      throw StateError('Incomplete accepted history');
    }
    events.add('google_owner_rpc_checkpoint_complete_private_history_verified');
    await db.disconnect();
  }
}

class HarnessScreen extends StatelessWidget {
  const HarnessScreen(this.controller, {super.key});
  final OAuthHarness controller;
  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: controller,
    builder: (context, _) => Scaffold(
      appBar: AppBar(title: const Text('Salapiya P0 Google proof')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Development harness · synthetic records only'),
            Text('Authentication: ${controller.flow.outcome}'),
            Text(
              'Session: ${controller.flow.client.auth.currentSession == null ? "signed out" : "present"} · starts: ${controller.starts}',
            ),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                for (final item in {
                  'google': 'Connect Google',
                  'cancel': 'Cancel pending sign-in',
                  'proof': 'Publish / verify connected proof',
                  'retrieve': 'Retrieve cloud separately; keep local',
                  'logout': 'Sign out this test session',
                }.entries)
                  ElevatedButton(
                    onPressed: controller.busy
                        ? null
                        : () => controller.action(item.key),
                    child: Text(item.value),
                  ),
              ],
            ),
            const SizedBox(height: 16),
            for (final event in controller.events.reversed.take(12))
              Text(event),
          ],
        ),
      ),
    ),
  );
}
