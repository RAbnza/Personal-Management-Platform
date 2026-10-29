import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:path_provider/path_provider.dart';
import 'package:salapiya/app.dart';
import 'package:salapiya/gallery/settings.dart';
import 'package:salapiya/local/finance_domain.dart';
import 'package:salapiya/local/local_profiles.dart';
import 'package:salapiya/local/local_runtime.dart';
import 'package:salapiya/local/local_store.dart';
import 'package:salapiya/life/life_controller.dart';
import 'package:salapiya/life/life_domain.dart';
import 'package:salapiya/p0/auth_runtime.dart';
import 'package:salapiya/p0/google_auth_proof.dart';

import '../test/local_money_journey.dart';
import 'p5_life_native_test.dart' show lifeEnter, lifeSave;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets(
    'P5 actual native authenticated private CDC, offline intent and peer convergence',
    (tester) async {
      final support = await getApplicationSupportDirectory();
      final configFile = File(
        Platform.isWindows
            ? const String.fromEnvironment('P5_NATIVE_CONFIG_PATH')
            : '${support.path}/p5-native-config.json',
      );
      final config = jsonDecode(await configFile.readAsString()) as Map;
      await configFile.delete();
      final role = config['role'] as String,
          settings = GallerySettings(),
          directory = Directory('${support.path}/p5-connected-$role');
      final runtime = LocalRuntime(
        LocalProfiles(
          directory,
          OsProfileVault(slot: 'salapiya.p5.connected.$role'),
        ),
        settings,
      );
      try {
        final scope = 'salapiya.p5.connected.auth.$role.${newLocalId()}',
            auth = await initializeProofAuth(
              config['url'] as String,
              config['publicKey'] as String,
              scope: scope,
              detectSessionInUri: false,
            );
        await auth.client.auth.setSession(config['refreshToken'] as String);
        runtime.connected.flow = GoogleAuthProof(
          auth,
          scope,
          const FlutterSecureStorage(),
        );
        await runtime.reopen();
        if (runtime.session == null) {
          final store = await runtime.profiles.retrieveConnected(
            config['profile'] as String,
            'P5 native connected',
            auth.client.auth.currentUser!.id,
            auth.client.auth.currentUser!.email!,
          );
          await runtime.activate(store);
        }
        if (runtime.connected.binding?['paused'] == 1) {
          await runtime.connected.pause(false);
        }
        await tester.pumpWidget(
          SalapiyaApp(
            production: true,
            settings: settings,
            localRuntime: runtime,
          ),
        );
        await tester.runAsync(runtime.connected.syncNow);
        await localSettle(tester);
        final c = runtime.session!.life as DurableLifeController,
            store = c.store;
        await tester.runAsync(c.reload);
        expect(c.initialComplete, isTrue);
        expect(c.records, isNotEmpty);
        final financialVersion = (await store.snapshot()).version;
        const stage = String.fromEnvironment('P5_STAGE', defaultValue: 'full');
        Future<void> settled() async {
          await tester.runAsync(runtime.connected.syncNow);
          for (var n = 0; n < 180; n++) {
            await tester.runAsync(runtime.connected.refresh);
            await tester.runAsync(c.reload);
            if (c.waiting == 0) return;
            await tester.runAsync(
              () => Future<void>.delayed(const Duration(milliseconds: 200)),
            );
            await tester.pump();
          }
          expect(
            c.waiting,
            0,
            reason: 'Original Life commands must reconcile before this native stage completes.',
          );
        }

        if (stage == 'reconnect') {
          await settled();
          expect(
            c.entries.where(
              (e) => e.title.startsWith('P5 $role staged offline task'),
            ),
            isNotEmpty,
          );
          expect((await store.snapshot()).version, financialVersion);
          debugPrint(
            'P5_NATIVE_STAGED: $role reopened its durable offline intent and reconciled accepted source IDs through CDC.',
          );
          if (!const bool.fromEnvironment('P5_VERIFY_PEER')) return;
        }

        if (const bool.fromEnvironment('P5_VERIFY_PEER')) {
          final peer = role == 'windows' ? 'android' : 'windows';
          expect(
            c.entries.where((e) => e.title.startsWith('P5 $peer offline task')),
            isNotEmpty,
          );
          expect(
            c.entries.where(
              (e) =>
                  e.title.startsWith('P5 $peer offline task') &&
                  e.version >= 3 &&
                  e.status == 'In progress',
            ),
            isNotEmpty,
          );
          expect(
            c.entries.where(
              (e) => e.title.startsWith('P5 $peer staged offline task'),
            ),
            isNotEmpty,
          );
          debugPrint(
            'P5_NATIVE_CDC: $role retrieved accepted $peer source IDs/history via actual owner-filtered PowerSync.',
          );
          return;
        }
        await tester.runAsync(() => runtime.connected.pause(true));
        await localTap(tester, find.byKey(const ValueKey('nav-life')));
        await localTap(tester, find.text('Tasks').first);
        await localTap(tester, find.text('New task'));
        final title =
            'P5 $role ${stage == 'seed' ? 'staged offline task' : 'offline task'} ${newLocalId().substring(0, 8)}';
        await lifeEnter(tester, 'title', title);
        await lifeEnter(tester, 'due', LifeTime.today());
        await lifeSave(tester);
        expect(c.waiting, greaterThan(0));
        final task = c.entries.singleWhere((e) => e.title == title),
            id = task.id;
        final intent = (await store.lifeIntents()).last;
        expect(intent['state'], 'pending');
        if (stage == 'seed') {
          debugPrint(
            'P5_NATIVE_STAGED: $role durable offline create retained before either peer uploads.',
          );
          return;
        }
        await tester.runAsync(() => runtime.connected.pause(false));
        for (var n = 0; n < 150 && c.waiting > 0; n++) {
          await tester.runAsync(runtime.connected.refresh);
          await tester.runAsync(c.reload);
          await tester.runAsync(
            () => Future<void>.delayed(const Duration(milliseconds: 200)),
          );
          await tester.pump();
        }
        expect(c.waiting, 0);
        expect(c.entries.singleWhere((e) => e.id == id).title, title);
        expect(
          (await store.lifeIntents()).singleWhere(
            (r) => r['id'] == intent['id'],
          )['state'],
          'reconciled',
        );
        expect((await store.snapshot()).version, financialVersion);
        // An ordinary correction is offline-capable and checks this record only.
        await tester.runAsync(() => runtime.connected.pause(true));
        await tester.runAsync(
          () => c.progress(task, 1, 'P5 native completion'),
        );
        expect(c.entries.singleWhere((e) => e.id == id).status, 'Completed');
        await tester.runAsync(() => runtime.connected.pause(false));
        for (var n = 0; n < 150 && c.waiting > 0; n++) {
          await tester.runAsync(runtime.connected.refresh);
          await tester.runAsync(c.reload);
          await tester.runAsync(
            () => Future<void>.delayed(const Duration(milliseconds: 200)),
          );
          await tester.pump();
        }
        expect(c.waiting, 0);
        expect(c.entries.where((e) => e.id == id).length, 1);
        await tester.runAsync(() => c.progress(task, 0, 'P5 native reopening'));
        await settled();
        expect((await store.snapshot()).version, financialVersion);
        debugPrint(
          'P5_NATIVE_CDC: $role offline create, exact original intent, acceptance/download, completion and reopening passed; financial revision unchanged.',
        );
      } finally {
        await tester.pumpWidget(const SizedBox());
        await localSettle(tester);
        await runtime.close();
        runtime.dispose();
        settings.dispose();
      }
    },
  );
}
