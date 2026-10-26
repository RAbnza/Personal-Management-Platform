import 'dart:io';

import 'package:flutter/services.dart';

import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_timezone/flutter_timezone.dart';
import 'package:timezone/timezone.dart' as tz;

import 'life_domain.dart';

abstract interface class NotificationDevice {
  Future<void> initialize(void Function(String) onTap);
  Future<bool?> permission({bool request = false});
  Future<String> timezone();
  Future<Set<int>> pending();
  Future<void> schedule(
    int id,
    DateTime at,
    String payload, {
    bool showDate = false,
    String? date,
  });
  Future<void> cancel(int id);
  String get capability;
}

class NativeNotificationDevice implements NotificationDevice {
  static NativeNotificationDevice? _active;
  void Function(String)? _onTap;
  static const statusChannel = MethodChannel(
    'dev.salapiya/native_notification_status',
  );
  void Function()? onClockChanged;
  final plugin = FlutterLocalNotificationsPlugin();
  Future<void> confirmDeviceOptIn() async {
    if (Platform.isWindows)
      await statusChannel.invokeMethod<void>('showConfirmation');
  }

  Future<void> showTest() async {
    if (Platform.isWindows) {
      await statusChannel.invokeMethod<void>('showConfirmation');
      return;
    }
    await plugin.show(
      id: 999,
      title: 'Salapiya reminder',
      body: 'Private device notification test. Open Salapiya to review.',
      notificationDetails: const NotificationDetails(
        android: AndroidNotificationDetails(
          'salapiya_private_reminders',
          'Private reminders',
          visibility: NotificationVisibility.private,
        ),
      ),
    );
  }

  @override
  String get capability => Platform.isWindows
      ? 'Windows local toast registration · OS notification settings control display'
      : Platform.isAndroid
      ? 'Android inexact alarms · OS/battery settings may delay delivery'
      : 'Native notifications unavailable on this platform';
  @override
  Future<void> initialize(void Function(String) onTap) async {
    _onTap = onTap;
    _active = this;
    LifeTime.initialize();
    if (Platform.isWindows)
      await statusChannel.invokeMethod<void>('registerDevelopmentIdentity');
    if (Platform.isWindows) {
      statusChannel.setMethodCallHandler((call) async {
        if (call.method == 'clockChanged') onClockChanged?.call();
      });
    }
    final initialized = await plugin.initialize(
      settings: const InitializationSettings(
        android: AndroidInitializationSettings('ic_notification'),
        windows: WindowsInitializationSettings(
          appName: 'Salapiya',
          appUserModelId: 'Salapiya.Private.Development',
          guid: 'a64517d4-7ea1-49e7-bad5-c3d00db31c1d',
        ),
      ),
      onDidReceiveNotificationResponse: (response) {
        if (response.payload != null) _active?._onTap?.call(response.payload!);
      },
    );
    if (initialized != true)
      throw StateError('Native notification registration failed.');
    final android = plugin
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >();
    await android?.createNotificationChannel(
      const AndroidNotificationChannel(
        'salapiya_private_reminders',
        'Private reminders',
        description:
            'Opted-in device reminders. No financial action is performed.',
        importance: Importance.defaultImportance,
      ),
    );
    final launch = await plugin.getNotificationAppLaunchDetails();
    if (launch?.didNotificationLaunchApp == true &&
        launch?.notificationResponse?.payload != null) {
      onTap(launch!.notificationResponse!.payload!);
    }
  }

  @override
  Future<bool?> permission({bool request = false}) async {
    if (Platform.isWindows) {
      try {
        return await statusChannel.invokeMethod<int>('windowsSetting') == 0;
      } on PlatformException catch (e) {
        // Unpackaged Windows can report ERROR_NOT_FOUND before first toast
        // registration. Unknown is preserved; opted-in scheduling is verified
        // through the OS pending API, never labeled as permission granted.
        if (e.code == 'status_unavailable' && e.details == -2147023728)
          return null;
        rethrow;
      }
    }
    if (!Platform.isAndroid) return false;
    final android = plugin
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >()!;
    if (request) await android.requestNotificationsPermission();
    return await android.areNotificationsEnabled() ?? false;
  }

  @override
  Future<String> timezone() async =>
      (await FlutterTimezone.getLocalTimezone()).identifier;
  @override
  Future<Set<int>> pending() async =>
      (await plugin.pendingNotificationRequests()).map((r) => r.id).toSet();
  @override
  Future<void> schedule(
    int id,
    DateTime at,
    String payload, {
    bool showDate = false,
    String? date,
  }) async {
    await plugin.zonedSchedule(
      id: id,
      title: 'Salapiya reminder',
      body: showDate
          ? 'A private commitment is due on $date. Open Salapiya to review.'
          : 'A private commitment needs your attention. Open Salapiya to review.',
      scheduledDate: tz.TZDateTime.from(at, LifeTime.zone('UTC')),
      notificationDetails: const NotificationDetails(
        android: AndroidNotificationDetails(
          'salapiya_private_reminders',
          'Private reminders',
          channelDescription: 'Private device reminders',
          visibility: NotificationVisibility.private,
          category: AndroidNotificationCategory.reminder,
        ),
        windows: WindowsNotificationDetails(),
      ),
      androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
      payload: payload,
    );
    if (Platform.isWindows)
      await statusChannel.invokeMethod<void>('groupScheduled', id);
  }

  @override
  Future<void> cancel(int id) async {
    await plugin.cancel(id: id);
    // The library removes pending unpackaged toasts. Its shown-toast path is
    // package-only; this narrow AppID overload removes our own shown toast.
    if (Platform.isWindows)
      await statusChannel.invokeMethod<void>('cancelPresented', id);
  }

  Future<Set<int>> presented() async => Platform.isWindows
      ? (await statusChannel.invokeListMethod<int>('presentedIds') ?? [])
            .toSet()
      : (await plugin.getActiveNotifications())
            .map((n) => n.id)
            .whereType<int>()
            .toSet();
  Future<void> detach() async {
    onClockChanged = null;
    _onTap = null;
    if (identical(_active, this)) {
      _active = null;
      if (Platform.isWindows) statusChannel.setMethodCallHandler(null);
    }
  }
}
