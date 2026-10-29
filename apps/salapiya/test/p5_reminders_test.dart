import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/features/life/application/life_controller.dart';
import 'package:salapiya/life/device_reminders.dart';
import 'package:salapiya/life/native_notifications.dart';
import 'package:salapiya/local/local_store.dart';

import 'local_test_support.dart';

class FakeNotificationDevice implements NotificationDevice {
  bool granted = true;
  final Map<int, (DateTime, String)> scheduled = {};
  int calls = 0, cancellations = 0;
  void Function(String)? onTap;
  @override
  String get capability => 'Test double; no native delivery evidence';
  @override
  Future<void> initialize(void Function(String) callback) async {
    onTap = callback;
  }

  @override
  Future<bool> permission({bool request = false}) async => granted;
  @override
  Future<String> timezone() async => 'Asia/Manila';
  @override
  Future<Set<int>> pending() async => scheduled.keys.toSet();
  @override
  Future<void> schedule(
    int id,
    DateTime at,
    String payload, {
    bool showDate = false,
    String? date,
  }) async {
    calls++;
    scheduled[id] = (at, payload);
  }

  @override
  Future<void> cancel(int id) async {
    cancellations++;
    scheduled.remove(id);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
    'local profile removal cancels only its recorded notification IDs',
    () async {
      final f = await LocalFixture.open(), native = FakeNotificationDevice();
      final d = DeviceReminders(f.store, () => [], device: native);
      try {
        await f.store.db.execute(
          'INSERT INTO device_reminder VALUES(?,?,?,?,?,?,?)',
          [
            'owned',
            'owned-source',
            '1',
            101,
            '2026-10-30T00:00:00Z',
            'scheduled',
            'owned',
          ],
        );
        native.scheduled[101] = (DateTime.utc(2026, 10, 30), 'owned');
        native.scheduled[202] = (DateTime.utc(2026, 10, 30), 'unrelated');
        await d.removeOwnedNotifications();
        expect(native.scheduled.containsKey(101), false);
        expect(native.scheduled.containsKey(202), true);
        expect(native.cancellations, 1);
      } finally {
        d.dispose();
        await f.close();
      }
    },
  );
  test('valid delayed OS alarms survive deadline passage, and stale shown generations are explicitly cancelled', () async {
    final f = await LocalFixture.open(), native = FakeNotificationDevice();
    var now = DateTime.utc(2026, 10, 26),
        items = [
          AgendaItem(
            'one',
            'owned',
            'Personal',
            'Private',
            '2026-10-26',
            '00:01',
            1,
            utc: DateTime.utc(2026, 10, 26, 0, 1),
            sourceGeneration: '1',
          ),
        ];
    final d = DeviceReminders(
      f.store,
      () => items,
      device: native,
      clock: () => now,
    );
    await d.initialize();
    await d.configure({'enabled': true, 'quiet': false});
    final id = native.scheduled.keys.single;
    now = now.add(const Duration(minutes: 2));
    await d.reconcile();
    expect(native.scheduled.keys, contains(id));
    expect(
      native.cancellations,
      0,
      reason: 'A still-current inexact OS alarm must not be cancelled merely because it is delayed.',
    );
    native.scheduled.clear();
    items = [];
    await d.reconcile();
    expect(
      native.cancellations,
      1,
      reason: 'Source completion must cancel even a previously displayed generation.',
    );
    await d.reconcile();
    expect(native.cancellations, 1);
    await d.stop();
    d.dispose();
    await f.close();
  });
  test('permission denial, restart, source correction, dismissal and snooze retain exact logical intent without business effects', () async {
    final f = await LocalFixture.open(), native = FakeNotificationDevice();
    var now = DateTime.utc(2026, 10, 26),
        items = <AgendaItem>[
          AgendaItem(
            'task:one',
            'source',
            'Tasks',
            'Private secret title',
            '2026-10-26',
            'All day',
            1,
            sourceGeneration: '1',
          ),
        ];
    final d = DeviceReminders(
      f.store,
      () => items,
      device: native,
      clock: () => now,
    );
    await d.initialize();
    expect(native.scheduled, isEmpty);
    native.granted = false;
    await d.configure({'enabled': true, 'quiet': false}, request: true);
    expect(native.scheduled, isEmpty);
    native.granted = true;
    await d.reconcile();
    expect(native.scheduled.length, 1);
    expect(native.calls, 1);
    final original = native.scheduled.values.single;
    expect(original.$2, startsWith('p5:'));
    expect(original.$2, isNot(contains('Private secret')));
    await d.reconcile();
    expect(native.calls, 1);
    items = [
      AgendaItem(
        'task:one',
        'source',
        'Tasks',
        'Renamed private title',
        '2026-10-27',
        'All day',
        2,
        sourceGeneration: '2',
      ),
    ];
    await d.reconcile();
    expect(native.cancellations, 1);
    expect(native.scheduled.length, 1);
    expect(native.calls, 2);
    await d.choose(items.single, 'Inherited', 'Dismissed');
    expect(native.scheduled, isEmpty);
    expect((await f.store.snapshot()).version, 0);
    expect((await f.store.lifeRecords()), isEmpty);
    await d.stop();
    d.dispose();
    final reopened = DeviceReminders(
      f.store,
      () => items,
      device: native,
      clock: () => now,
    );
    await reopened.initialize();
    expect(native.scheduled, isEmpty);
    expect(native.calls, 2);
    await reopened.choose(items.single, 'Inherited', 'Snoozed 1 hour');
    expect(
      native.scheduled.values.single.$1,
      now.add(const Duration(hours: 1)),
    );
    now = now.add(const Duration(hours: 2));
    native.scheduled.clear();
    await reopened.reconcile();
    expect(native.scheduled, isEmpty);
    final calls = native.calls;
    await reopened.reconcile();
    expect(native.calls, calls);
    items = [];
    await reopened.reconcile();
    expect(native.scheduled, isEmpty);
    await reopened.stop();
    reopened.dispose();
    await f.close();
  });
  test(
    'quiet hours cross midnight and DST without moving the source deadline',
    () {
      final prefs = {'quiet': true, 'start': '22:00', 'end': '07:00'};
      expect(
        deferQuiet(DateTime.utc(2026, 10, 26, 15), prefs, 'Asia/Manila'),
        DateTime.utc(2026, 10, 26, 23),
      );
      expect(
        deferQuiet(DateTime.utc(2026, 10, 26, 2), prefs, 'Asia/Manila'),
        DateTime.utc(2026, 10, 26, 2),
      );
      final gap = {'quiet': true, 'start': '22:00', 'end': '02:30'};
      expect(
        deferQuiet(DateTime.utc(2026, 3, 8, 5), gap, 'America/New_York'),
        DateTime.utc(2026, 3, 8, 7),
      );
    },
  );
  test('source staleness is rechecked on notification tap and independent module settings cancel schedules', () async {
    final f = await LocalFixture.open(), native = FakeNotificationDevice();
    var items = [
      AgendaItem(
        'one',
        'owned-record',
        'Personal',
        'Private event',
        '2026-10-27',
        '10:00',
        1,
        utc: DateTime.utc(2026, 10, 27, 2),
        sourceGeneration: 'one',
      ),
    ];
    final d = DeviceReminders(
      f.store,
      () => items,
      device: native,
      clock: () => DateTime.utc(2026, 10, 26),
    );
    await d.initialize();
    await d.configure({'enabled': true, 'quiet': false});
    AgendaItem? navigated;
    var tapped = false;
    d.navigate = (item) {
      navigated = item;
      tapped = true;
    };
    native.onTap!(native.scheduled.values.single.$2);
    await Future<void>.delayed(const Duration(milliseconds: 100));
    expect(navigated?.sourceId, 'owned-record');
    final payload = native.scheduled.values.single.$2;
    items = [];
    tapped = false;
    native.onTap!(payload);
    await Future<void>.delayed(const Duration(milliseconds: 100));
    expect(tapped, isTrue);
    expect(navigated, isNull);
    await d.reconcile();
    expect(native.scheduled, isEmpty);
    await d.stop();
    d.dispose();
    await f.close();
  });
}
