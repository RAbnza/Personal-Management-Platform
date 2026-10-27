import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:path_provider/path_provider.dart';
import 'package:salapiya/app.dart';
import 'package:salapiya/gallery/settings.dart';
import 'package:salapiya/local/finance_domain.dart';
import 'package:salapiya/local/local_profiles.dart';
import 'package:salapiya/local/local_runtime.dart';
import 'package:salapiya/life/life_controller.dart';
import 'package:salapiya/life/native_notifications.dart';

import '../test/local_money_journey.dart';

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  if (const bool.fromEnvironment('P5_TEST_TAP')) {
    binding.platformDispatcher.semanticsEnabledTestValue = true;
    tearDownAll(binding.platformDispatcher.clearSemanticsEnabledTestValue);
  }
  testWidgets(
    'P5 real native scheduled notification, correction and cancellation from a durable source',
    (tester) async {
      final support = await getApplicationSupportDirectory(),
          settings = GallerySettings();
      final runtime = LocalRuntime(
        LocalProfiles(
          Directory('${support.path}/p5-notifications-${newLocalId()}'),
          OsProfileVault(slot: 'salapiya.p5.notifications.${newLocalId()}'),
        ),
        settings,
      );
      try {
        await runtime.create(
          'P5 notification synthetic owner',
          ThemeMode.light,
        );
        await tester.pumpWidget(
          SalapiyaApp(
            production: true,
            settings: settings,
            localRuntime: runtime,
          ),
        );
        await localSettle(tester);
        final c = runtime.session!.life as DurableLifeController, d = c.device!;
        var sourceTapped = false;
        final openSource = d.navigate;
        d.navigate = (item) {
          sourceTapped = item != null && item.kind == 'Personal';
          openSource?.call(item);
        };
        expect(d.ready, isTrue, reason: d.status);
        if (Platform.isAndroid &&
            const bool.fromEnvironment('P5_TEST_DENIAL')) {
          debugPrint('P5_NATIVE_PERMISSION: deny the first Android OS prompt.');
          await tester.runAsync(
            () => d.configure({'enabled': true, 'quiet': false}, request: true),
          );
          expect(d.allowed, isFalse);
          expect(await d.device.pending(), isEmpty);
          debugPrint(
            'P5_NATIVE_PERMISSION_DENIED: in-app source access remains available; allow the next OS prompt.',
          );
          await tester.runAsync(
            () => Future<void>.delayed(const Duration(seconds: 3)),
          );
        }
        await tester.runAsync(
          () => d.configure({'enabled': true, 'quiet': false}, request: true),
        );
        expect(d.allowed, isTrue, reason: d.status);
        if (Platform.isWindows) {
          await tester.runAsync(
            () => (d.device as NativeNotificationDevice).showTest(),
          );
        }
        DateTime minute(int ahead) {
          final now = DateTime.now().toUtc();
          return DateTime.utc(
            now.year,
            now.month,
            now.day,
            now.hour,
            now.minute + ahead,
          );
        }

        Map<String, String> event(DateTime at) => {
          'title': 'P5 private synthetic appointment',
          'date': at.toIso8601String().substring(0, 10),
          'time': at.toIso8601String().substring(11, 16),
          'timezone': 'UTC',
          'notes': 'Never include this synthetic private note in a toast',
        };
        await tester.runAsync(() => c.saveEvent(event(minute(3))));
        await tester.runAsync(d.reconcile);
        var rows = await c.store.db.getAll(
          "SELECT * FROM device_reminder WHERE state='scheduled'",
        );
        expect(rows.length, 1);
        final firstId = rows.single['os_id'] as int;
        expect(await d.device.pending(), contains(firstId));

        final source = c.events.single;
        await tester.runAsync(
          () => c.saveEvent({
            ...event(minute(4)),
            'reason': 'Rescheduled native source',
          }, old: source),
        );
        await tester.runAsync(d.reconcile);
        rows = await c.store.db.getAll(
          "SELECT * FROM device_reminder WHERE state='scheduled'",
        );
        expect(rows.length, 1);
        expect(await d.device.pending(), isNot(contains(firstId)));
        await tester.runAsync(
          () => c.cancelEvent(source, 'Cancel current appointment'),
        );
        await tester.runAsync(d.reconcile);
        expect(await d.device.pending(), isEmpty);
        // Reopen and schedule the actual source at the next minute boundary.
        await tester.runAsync(
          () => c.cancelEvent(source, 'Restore appointment'),
        );
        final at = minute(2);
        await tester.runAsync(
          () => c.saveEvent({
            ...event(at),
            'reason': 'Near-term native delivery check',
          }, old: source),
        );
        await tester.runAsync(d.reconcile);
        rows = await c.store.db.getAll(
          "SELECT * FROM device_reminder WHERE state='scheduled'",
        );
        expect(rows.length, 1);
        final notificationId = rows.single['os_id'] as int;
        debugPrint(
          'P5_DEVICE_STATUS: ${d.status}; pending=${await d.device.pending()}; rows=${(await c.store.db.getAll("SELECT os_id,state,due_utc FROM device_reminder ORDER BY os_id"))}',
        );
        expect(
          await d.device.pending(),
          contains(notificationId),
          reason: 'The OS must retain the actual scheduled source before delivery is claimed.',
        );
        debugPrint(
          'P5_NATIVE_SCHEDULED: id=$notificationId dueUtc=${at.toIso8601String()} platform=${Platform.operatingSystem}; awaiting genuine OS delivery.',
        );
        final until = at.add(Duration(seconds: Platform.isWindows ? 25 : 75));
        var delivered = false;
        final adapter = d.device as NativeNotificationDevice;
        while (DateTime.now().toUtc().isBefore(until)) {
          await tester.runAsync(
            () => Future<void>.delayed(const Duration(milliseconds: 500)),
          );
          await tester.pump();
          if ((await adapter.presented()).contains(notificationId)) {
            delivered = true;
            break;
          }
        }
        expect(
          delivered,
          isTrue,
          reason: 'No actual OS-presented notification observed within the bounded delivery window.',
        );
        if (Platform.isAndroid) {
          final shown = (await adapter.plugin.getActiveNotifications())
              .singleWhere((n) => n.id == notificationId);
          expect(shown.title, 'Salapiya reminder');
          expect(shown.body, isNot(contains('private note')));
        }
        expect((await c.store.snapshot()).version, 0);
        expect(source.cancelled, isFalse);
        debugPrint(
          'P5_NATIVE_NOTIFICATION: genuine ${Platform.isAndroid ? 'Android active delivery' : 'Windows presented notification'} observed; no source completion or financial effect.',
        );
        if (const bool.fromEnvironment('P5_TEST_TAP')) {
          debugPrint(
            'P5_NATIVE_TAP: open the delivered synthetic Salapiya notification.',
          );
          for (var i = 0; i < 150 && !sourceTapped; i++) {
            await tester.runAsync(
              () => Future<void>.delayed(const Duration(milliseconds: 500)),
            );
            await tester.pump();
          }
          expect(
            sourceTapped,
            isTrue,
            reason: 'The actual OS notification must route to its current authoritative source.',
          );
          await localSettle(tester);
          expect(find.text('P5 private synthetic appointment'), findsWidgets);
          debugPrint(
            'P5_NATIVE_TAP: native activation opened the current authoritative personal source.',
          );
          await localTap(tester, find.byType(BackButton).first);
          await localTap(tester, find.byType(BackButton).first);
          expect(
            find.byKey(const PageStorageKey('destination-overview')),
            findsOneWidget,
          );
          debugPrint(
            'P5_NATIVE_TAP: Back returned through Life to the original Overview.',
          );
        }
        if (Platform.isAndroid) {
          await tester.runAsync(adapter.showTest);
          expect(await adapter.presented(), contains(999));
        }
        await tester.runAsync(() => d.configure({'enabled': false}));
        expect(
          await adapter.presented(),
          isNot(contains(notificationId)),
          reason: 'Opt-out must remove the already displayed owned reminder.',
        );
        if (Platform.isAndroid) {
          expect(await adapter.presented(), isNot(contains(999)));
        }
      } finally {
        await tester.pumpWidget(const SizedBox());
        await localSettle(tester);
        await runtime.close();
        runtime.dispose();
        settings.dispose();
      }
    },
    timeout: const Timeout(Duration(minutes: 5)),
  );
}
