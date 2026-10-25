import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:path_provider/path_provider.dart';
import 'package:powersync/powersync.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:salapiya/app.dart';
import 'package:salapiya/connected/command_connector.dart';
import 'package:salapiya/gallery/settings.dart';
import 'package:salapiya/local/finance_domain.dart';
import 'package:salapiya/local/local_profiles.dart';
import 'package:salapiya/local/local_runtime.dart';
import 'package:salapiya/local/local_store.dart';
import 'package:salapiya/p0/auth_runtime.dart';
import 'package:salapiya/p0/google_auth_proof.dart';

import '../test/local_money_journey.dart';

class PrivateDownload extends PowerSyncBackendConnector {
  PrivateDownload(this.session, this.endpoint);
  final Session session;
  final String endpoint;
  @override
  Future<PowerSyncCredentials?> fetchCredentials() async =>
      PowerSyncCredentials(
        endpoint: endpoint,
        token: session.accessToken,
        userId: session.user.id,
      );
  @override
  Future<void> uploadData(PowerSyncDatabase database) async {
    if (await database.getNextCrudTransaction() != null) {
      throw StateError('Read-only isolation fixture');
    }
  }
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets(
    'P2 production UI, encrypted process reopen, hosted receipt and real private CDC',
    (tester) async {
      const stage = String.fromEnvironment('P2_STAGE', defaultValue: 'offline');
      const configPath = String.fromEnvironment('P2_NATIVE_CONFIG_PATH');
      const endpoint = String.fromEnvironment('SALAPIYA_POWERSYNC_URL');
      final support = await getApplicationSupportDirectory();
      final file = File(
        Platform.isWindows
            ? configPath
            : '${support.path}/p2-native-config.json',
      );
      final config =
          jsonDecode(await file.readAsString()) as Map<String, dynamic>;
      await file.delete(); // Only the explicitly staged, consumed synthetic secret file.
      final role = config['role'] as String;
      final profiles = LocalProfiles(
        Directory('${support.path}/p2-native-$role'),
        OsProfileVault(slot: 'salapiya.p2.native.$role'),
      );
      final settings = GallerySettings();
      final runtime = LocalRuntime(profiles, settings);
      try {
        final auth = await initializeProofAuth(
          config['url'] as String,
          config['publicKey'] as String,
          scope: 'salapiya.p2.native.auth.$role',
          detectSessionInUri: false,
        );
        await auth.client.auth.setSession(config['refreshToken'] as String);
        runtime.connected.flow = GoogleAuthProof(
          auth,
          'salapiya.p2.native.auth.$role',
          const FlutterSecureStorage(),
        );
        await runtime.reopen();
        await tester.pumpWidget(
          SalapiyaApp(
            production: true,
            settings: settings,
            localRuntime: runtime,
          ),
        );
        await localSettle(tester);
        if (runtime.session == null) {
          await localTap(tester, find.text('Continue with Google'));
          await localTap(tester, find.text('Review connection'));
          await localTap(tester, find.text('Confirm connection'));
          await localWait(
            tester,
            () => runtime.session != null && !runtime.connected.busy,
          );
          expect(runtime.connected.error, isNull);
          expect(runtime.session!.localFinance.store.owner, config['profile']);
          await localTap(tester, find.byType(BackButton));
        } else {
          await tester.runAsync(runtime.connected.syncNow);
          expect(runtime.connected.error, isNull);
        }
        final store = runtime.session!.localFinance.store;
        await tester.runAsync(runtime.connected.refresh);
        expect(runtime.connected.complete, isTrue);
        final before = await store.snapshot();
        expect(before.accounts.length, greaterThanOrEqualTo(2));
        expect(before.revisions.length, greaterThanOrEqualTo(11));
        if (stage == 'offline') {
          await tester.runAsync(() => runtime.connected.pause(true));
          await localTap(tester, find.byKey(const ValueKey('nav-money')));
          await localTap(tester, find.text('Add expense'));
          await localEnter(tester, 'name', 'P2 offline $role');
          await localEnter(
            tester,
            'amount',
            role == 'windows' ? '1.01' : '2.02',
          );
          await localEnter(tester, 'date', '2026-10-25');
          await localConfirm(tester);
          expect(await store.db.getNextCrudTransaction(), isNotNull);
          expect(
            runtime.session!.localFinance.records
                .where((r) => r.title == 'P2 offline $role')
                .length,
            1,
          );
          // Windows exits with durable pending work. Android uploads while Windows
          // is no longer running; the later Windows stage converges independently.
          if (role == 'android') {
            await tester.runAsync(() => runtime.connected.pause(false));
            await tester.runAsync(runtime.connected.syncNow);
          }
        } else {
          await tester.runAsync(() => runtime.connected.pause(false));
          await tester.runAsync(runtime.connected.syncNow);
          await tester.runAsync(
            () => Future<void>.delayed(const Duration(seconds: 3)),
          );
          await tester.runAsync(runtime.connected.syncNow);
          expect(runtime.connected.error, isNull);
          await tester.runAsync(runtime.connected.refresh);
          final snap = await store.snapshot();
          expect(
            snap.revisions.where((r) => r.title == 'P2 offline windows').length,
            1,
          );
          expect(
            snap.revisions.where((r) => r.title == 'P2 offline android').length,
            1,
          );
          if (role == 'windows' && stage == 'online') {
            await tester.runAsync(() => runtime.connected.pause(true));
            final id = newLocalId(), account = snap.accounts.last.id;
            final c = LocalCommand(
              id: id,
              owner: store.owner,
              expectedVersion: (await store.snapshot()).version,
              kind: 'income',
              values: {
                'date': '2026-10-25',
                'name': 'P2 actual lost response',
                'amount': '3.03',
                'account': account,
                'category': 'category-income',
                'incomeClass': 'gift',
              },
            );
            await store.commit(c);
            await store.db.execute('UPDATE connected_profile SET paused=0');
            final lost = FinancialConnector(
              store: store,
              actor: auth.client.auth.currentUser!.id,
              credentials: () async => null,
              submit: (id, envelope) async {
                await auth.client.rpc(
                  'p2_submit_command',
                  params: {'command_id': id, 'command_payload': envelope},
                );
                throw const SocketException(
                  'Deliberately lost actual committed response',
                );
              },
            );
            await expectLater(
              lost.uploadData(store.db),
              throwsA(isA<SocketException>()),
            );
            expect(await store.db.getNextCrudTransaction(), isNotNull);
            await tester.runAsync(runtime.connected.syncNow);
            await tester.runAsync(
              () => Future<void>.delayed(const Duration(seconds: 3)),
            );
            await tester.runAsync(runtime.connected.syncNow);
            expect(runtime.connected.error, isNull);
            final receipt = await auth.client.rpc(
              'p2_review_command',
              params: {'command_id': id, 'command_payload': c.payload},
            ) as Map;
            expect(receipt['outcome'], 'accepted');
            expect(
              (await store.snapshot()).revisions
                  .where((r) => r.id == id)
                  .length,
              1,
            );
          }
          final other = SupabaseClient(
            config['url'] as String,
            config['publicKey'] as String,
          );
          final otherSession = (await other.auth.setSession(
            config['otherRefreshToken'] as String,
          )).session!;
          final replica = openLocalDatabase(
            '${support.path}/p2-isolation-${newLocalId()}.sqlite',
            'synthetic-isolation-key',
          );
          try {
            await replica.initialize();
            await replica.connect(
              connector: PrivateDownload(otherSession, endpoint),
              params: {'owner_id': auth.client.auth.currentUser!.id},
            );
            await replica.waitForFirstSync().timeout(
              const Duration(seconds: 45),
            );
            expect(
              await replica.getAll('SELECT id FROM p2_profile WHERE id=?', [
                store.owner,
              ]),
              isEmpty,
            );
            expect(
              await replica.getAll(
                'SELECT id FROM p2_command WHERE profile_id=?',
                [store.owner],
              ),
              isEmpty,
            );
          } finally {
            await replica.close();
            await other.dispose();
          }
          if (['recover', 'all'].contains(stage)) {
            await tester.runAsync(
              () => verifyConnectedRecovery(runtime, auth, role, support),
            );
          }
        }
        if (['domain', 'all'].contains(stage)) {
          await tester.runAsync(() => verifyConnectedMoney(runtime, role));
          await tester.runAsync(
            () => measureFreshDownload(auth, endpoint, support, role),
          );
        }
        if (const bool.fromEnvironment('P2_VERIFY_OUTAGE')) {
          await tester.runAsync(
            () => verifyTransportOutage(runtime, auth, role),
          );
        }
        await tester.runAsync(runtime.connected.refresh);
        final finalSnapshot = await store.snapshot();
        final evidence = {
          'role': role,
          'stage': stage,
          'acceptedCommands': (await store.db.get(
            'SELECT count(*) n FROM local_command',
          ))['n'],
          'pending': runtime.connected.pendingCount,
          'review': runtime.connected.reviewCount,
          'balances': {
            for (final a in finalSnapshot.accounts)
              a.id: '${finalSnapshot.balance(a.id)}',
          },
          'status': runtime.connected.label,
          'realHosted': true,
          'googleOAuthCertifiedByThisTest': false,
        };
        await File('${support.path}/p2-$role-$stage-evidence.json')
            .writeAsString(jsonEncode(evidence));
        // Synthetic IDs/exact totals only; no session, notes or actual user data.
        debugPrint('P2_NATIVE_EVIDENCE ${jsonEncode(evidence)}');
        await store.integrity();
      } finally {
        await tester.pumpWidget(const SizedBox.shrink());
        await runtime.close();
        runtime.dispose();
        settings.dispose();
      }
    },
    timeout: const Timeout(Duration(minutes: 6)),
  );
}

Future<void> verifyTransportOutage(
  LocalRuntime runtime,
  Supabase auth,
  String role,
) async {
  final store = runtime.session!.localFinance.store;
  await runtime.connected.pause(true);
  final before = await store.snapshot();
  final account = before.accounts.last.id;
  final id = newLocalId(),
      command = LocalCommand(
        id: id,
        owner: store.owner,
        expectedVersion: before.version,
        kind: 'income',
        values: {
          'name': 'P2 service outage $role',
          'date': '2026-10-25',
          'account': account,
          'amount': '0.01',
          'category': 'category-income',
          'incomeClass': 'gift',
        },
      );
  await store.commit(command);
  await store.db.execute('UPDATE connected_profile SET paused=0');
  var requests = 0, uploadAttempts = 0;
  final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
  final subscription = server.listen((request) async {
    requests++;
    await request.drain<void>();
    request.response.statusCode = 503;
    request.response.write('Synthetic unavailable service');
    await request.response.close();
  });
  final endpoint = 'http://127.0.0.1:${server.port}';
  final http = HttpClient();
  try {
    final connector = FinancialConnector(
      store: store,
      actor: auth.client.auth.currentUser!.id,
      credentials: () async => PowerSyncCredentials(
        endpoint: endpoint,
        token: auth.client.auth.currentSession!.accessToken,
        userId: auth.client.auth.currentUser!.id,
      ),
      submit: (_, __) async {
        uploadAttempts++;
        final request = await http.postUrl(Uri.parse('$endpoint/p2-upload'));
        final response = await request.close();
        await response.drain<void>();
        throw HttpException('Synthetic upload HTTP ${response.statusCode}');
      },
    );
    await expectLater(
      connector.uploadData(store.db),
      throwsA(isA<HttpException>()),
    );
    await store.db.connect(connector: connector);
    for (
      var i = 0;
      i < 100 && store.db.currentStatus.downloadError == null;
      i++
    ) {
      await Future<void>.delayed(const Duration(milliseconds: 100));
    }
    expect(requests, greaterThan(0));
    expect(uploadAttempts, greaterThan(0));
    expect(store.db.currentStatus.downloadError, isNotNull);
    expect(await store.db.getNextCrudTransaction(), isNotNull);
    expect(
      (await store.snapshot()).balance(account),
      before.balance(account) + BigInt.one,
    );
    expect(
      (await store.db.get('SELECT state FROM connected_intent WHERE id=?', [
        command.id,
      ]))['state'],
      'pending',
    );
  } finally {
    await store.db.disconnect();
    http.close(force: true);
    await subscription.cancel();
    await server.close(force: true);
  }
  await runtime.connected.syncNow();
  for (var i = 0; i < 200; i++) {
    await runtime.connected.refresh();
    if (runtime.connected.pendingCount == 0) break;
    await Future<void>.delayed(const Duration(milliseconds: 200));
  }
  expect(runtime.connected.error, isNull);
  expect(runtime.connected.pendingCount, 0);
  expect(
    (await store.snapshot()).balance(account),
    before.balance(account) + BigInt.one,
  );
  expect(
    (await store.db.get('SELECT state FROM connected_intent WHERE id=?', [
      command.id,
    ]))['state'],
    'reconciled',
  );
  debugPrint(
    'P2_OUTAGE_EVIDENCE ${jsonEncode({'role': role, 'requests503': requests, 'uploadAttempts': uploadAttempts, 'pendingPreserved': true, 'hostedRecoveryOnce': true, 'fixture': id})}',
  );
}

Future<void> verifyConnectedMoney(LocalRuntime runtime, String role) async {
  final store = runtime.session!.localFinance.store;
  final queueTimes = <int>[], reconcileTimes = <int>[];
  Future<void> drained() async {
    await runtime.connected.syncNow();
    for (var i = 0; i < 200; i++) {
      await runtime.connected.refresh();
      if (runtime.connected.pendingCount == 0) break;
      await Future<void>.delayed(const Duration(milliseconds: 200));
    }
    expect(runtime.connected.error, isNull);
    expect(runtime.connected.pendingCount, 0);
    expect(runtime.connected.reviewCount, 0);
  }

  Future<String> post(String kind, Map<String, String> values) async {
    await drained();
    final id = newLocalId();
    final queued = Stopwatch()..start();
    await store.commit(
      LocalCommand(
        id: id,
        owner: store.owner,
        expectedVersion: (await store.snapshot()).version,
        kind: kind,
        values: {'date': '2026-10-25', ...values},
      ),
    );
    queued.stop();
    queueTimes.add(queued.elapsedMilliseconds);
    final reconciled = Stopwatch()..start();
    await drained();
    reconciled.stop();
    reconcileTimes.add(reconciled.elapsedMilliseconds);
    expect(
      (await store.db.get('SELECT state FROM connected_intent WHERE id=?', [
        id,
      ]))['state'],
      'reconciled',
    );
    return id;
  }

  final suffix = newLocalId().substring(0, 8);
  final cash = await post('account', {
    'name': 'P2 $role cash $suffix',
    'kind': 'Cash',
    'cutoff': '2026-10-01',
    'amount': '1000.00',
  });
  final bank = await post('account', {
    'name': 'P2 $role bank $suffix',
    'kind': 'Bank',
    'cutoff': '2026-10-01',
    'amount': '100.00',
    'institution': 'Synthetic native',
  });
  final category = await post('category', {
    'name': 'P2 $role category $suffix',
    'classification': 'expense',
  });
  final values = {
    'name': 'P2 native split $role',
    'account': cash,
    'amount': '10.01',
    'category': category,
    'split': 'true',
    'splitCount': '3',
    'splitAmount': '3.34',
    'split2Amount': '3.33',
    'split2Category': 'category-groceries',
    'splitCategory': 'category-food',
  };
  final purchase = await post('expense', values);
  await post('transfer', {
    'name': 'P2 native transfer $role',
    'account': cash,
    'destination': bank,
    'amount': '100.00',
    'fee': '1.00',
    'feeTreatment': 'withheld',
    'feeCategory': 'category-fees',
    'feeCount': '2',
    'extraFee1Amount': '0.50',
    'extraFee1Treatment': 'separate',
    'extraFee1Account': bank,
    'extraFee1Category': 'category-fees',
  });
  final correction = await post('correction', {
    ...values,
    'source': purchase,
    'sourceVersion': '1',
    'reason': 'Native corrected receipt',
    'amount': '9.99',
    'splitAmount': '3.33',
  });
  final refund = await post('refund', {
    'source': correction,
    'sourceVersion': '2',
    'account': cash,
    'amount': '0.33',
    'reason': 'Partial return',
    'refundPosting': '$correction-p2',
  });
  await post('reversal', {
    'source': refund,
    'sourceVersion': '1',
    'reason': 'Refund withdrawn',
  });
  final comparison = await post('reconcile', {
    'account': cash,
    'amount': '890.00',
  });
  await post('adjustment', {
    'source': comparison,
    'sourceVersion': '1',
    'account': cash,
    'reason': 'Observed cash',
    'mode': 'adjustment',
  });
  final adjustment = await post('adjustment', {
    'account': bank,
    'amount': '-0.50',
    'reason': 'Explicit equity adjustment',
    'mode': 'manual',
  });
  await post('correction', {
    'source': adjustment,
    'sourceVersion': '1',
    'account': bank,
    'amount': '-0.25',
    'reason': 'Correct equity evidence',
    'mode': 'manual',
  });
  await post('archive', {
    'account': cash,
    'reason': 'Retain historical wallet',
  });
  final snap = await store.snapshot();
  expect(snap.balance(cash), BigInt.from(89000));
  expect(snap.balance(bank), BigInt.from(19925));
  expect(snap.account(cash).archived, isTrue);
  expect(snap.revisions.where((r) => r.actionId == purchase).length, 2);
  final evidence = {
    'role': role,
    'cash': cash,
    'bank': bank,
    'cash_minor': '89000',
    'bank_minor': '19925',
    'receiptAndActualDownloadForEveryCommand': true,
    'sourceRevisionsPreserved': true,
    'localQueueMs': timingSummary(queueTimes),
    'reconciliationMs': timingSummary(reconcileTimes),
  };
  debugPrint('P2_DOMAIN_EVIDENCE ${jsonEncode(evidence)}');
}

Map<String, int> timingSummary(List<int> values) {
  final sorted = [...values]..sort();
  return {
    'count': sorted.length,
    'min': sorted.first,
    'median': sorted[sorted.length ~/ 2],
    'p95': sorted[((sorted.length * 95 + 99) ~/ 100) - 1],
    'max': sorted.last,
  };
}

Future<void> measureFreshDownload(
  Supabase auth,
  String endpoint,
  Directory support,
  String role,
) async {
  final boundary = Map<String, dynamic>.from(
    await auth.client.rpc('p2_profile_boundary') as Map,
  );
  final profile = boundary['id'] as String;
  final database = openLocalDatabase(
    '${support.path}/p2-download-measure-${newLocalId()}.sqlite',
    'synthetic-download-measure-key',
  );
  final watch = Stopwatch()..start();
  try {
    await database.initialize();
    await database.connect(
      connector: PrivateDownload(auth.client.auth.currentSession!, endpoint),
    );
    await database.waitForFirstSync().timeout(const Duration(seconds: 45));
    final rows = await database.getAll(
      'SELECT id,sequence_no,payload,plan FROM p2_command WHERE profile_id=? ORDER BY sequence_no',
      [profile],
    );
    expect(rows.length, greaterThanOrEqualTo(boundary['revision'] as int));
    for (var i = 0; i < rows.length; i++) {
      expect(rows[i]['sequence_no'], i + 1);
    }
    watch.stop();
    final logical = rows.fold<int>(
      0,
      (n, r) =>
          n +
          utf8.encode(r['payload'] as String).length +
          utf8.encode(r['plan'] as String).length,
    );
    debugPrint(
      'P2_DOWNLOAD_EVIDENCE ${jsonEncode({'role': role, 'rows': rows.length, 'initialDownloadMs': watch.elapsedMilliseconds, 'logicalRecipeAndPlanBytes': logical, 'includesProtocolOverhead': false})}',
    );
  } finally {
    await database.close();
  }
}

Future<void> verifyConnectedRecovery(
  LocalRuntime original,
  Supabase auth,
  String role,
  Directory support,
) async {
  final store = original.session!.localFinance.store;
  await original.connected.pause(true);
  final account = (await store.snapshot()).accounts.last.id;
  final before = (await store.snapshot()).balance(account);
  final ids = <String>[];
  for (final amount in ['1.11', '2.22']) {
    final id = newLocalId();
    ids.add(id);
    await store.commit(
      LocalCommand(
        id: id,
        owner: store.owner,
        expectedVersion: (await store.snapshot()).version,
        kind: 'income',
        values: {
          'name': 'P2 recovery $role',
          'date': '2026-10-25',
          'account': account,
          'amount': amount,
          'category': 'category-income',
          'incomeClass': 'gift',
        },
      ),
    );
  }
  final bundle = await LocalBackup.capture(store);
  final first = await store.db.get(
    'SELECT envelope FROM connected_intent WHERE id=?',
    [ids.first],
  );
  await auth.client.rpc(
    'p2_submit_command',
    params: {'command_id': ids.first, 'command_payload': first['envelope']},
  );
  // The archive predates the receipt/download, and the second command is missing.
  final recoveryProfiles = LocalProfiles(
    Directory('${support.path}/p2-recovery-${newLocalId()}'),
    OsProfileVault(slot: 'salapiya.p2.recovery.${newLocalId()}'),
  );
  final recovered = LocalRuntime(recoveryProfiles, GallerySettings());
  try {
    final restored = await recoveryProfiles.restore(bundle);
    expect((await restored.snapshot()).balance(account), before);
    recovered.connected.flow = original.connected.flow;
    await recovered.activate(restored);
    await recovered.connected.syncNow();
    expect(recovered.connected.error, isNull);
    expect(
      (await restored.snapshot()).balance(account),
      before + BigInt.from(111),
    );
    expect(
      (await restored.db.get('SELECT state FROM connected_intent WHERE id=?', [
        ids.first,
      ]))['state'],
      'reconciled',
    );
    expect(
      (await restored.db.get('SELECT reason FROM connected_intent WHERE id=?', [
        ids.last,
      ]))['reason'],
      'restored_missing',
    );
    expect(await restored.db.getNextCrudTransaction(), isNull);
    await recovered.connected.resumeMissing(ids.last);
    await recovered.connected.syncNow();
    await Future<void>.delayed(const Duration(seconds: 3));
    await recovered.connected.syncNow();
    expect(recovered.connected.error, isNull);
    expect(
      (await restored.snapshot()).balance(account),
      before + BigInt.from(333),
    );
    for (final id in ids) {
      expect(
        (await restored.snapshot()).revisions.where((r) => r.id == id).length,
        1,
      );
    }
    final evidence = {
      'role': role,
      'restoredAcceptedOnce': true,
      'explicitMissingResume': true,
      'oldDeviceReplay': true,
      'before_minor': '$before',
      'after_minor': '${before + BigInt.from(333)}',
    };
    await File('${support.path}/p2-$role-recovery-evidence.json')
        .writeAsString(jsonEncode(evidence));
    debugPrint('P2_RECOVERY_EVIDENCE ${jsonEncode(evidence)}');
  } finally {
    // The original runtime owns the shared maintained auth adapter in this test.
    recovered.connected.flow = null;
    await recovered.close();
    recovered.dispose();
    recovered.settings.dispose();
  }
  await original.connected.pause(false);
  await original.connected.syncNow();
  await Future<void>.delayed(const Duration(seconds: 3));
  await original.connected.syncNow();
  expect(original.connected.error, isNull);
  expect((await store.snapshot()).balance(account), before + BigInt.from(333));
}
