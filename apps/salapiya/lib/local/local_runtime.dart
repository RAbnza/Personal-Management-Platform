import 'dart:io';
import 'dart:async';

import '../connected/connected_runtime.dart';

import 'package:flutter/material.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../gallery/settings.dart';
import '../prototype/scenarios.dart';
import 'local_finance_controller.dart';
import 'local_profiles.dart';
import 'local_store.dart';
import '../life/life_controller.dart';

class LocalRuntime extends ChangeNotifier {
  LocalRuntime(this.profiles, this.settings);
  final LocalProfiles profiles;
  final GallerySettings settings;
  LocalSession? session;
  late final connected = ConnectedRuntime(this);
  String? preferenceError;
  Future<void> _preferences = Future.value();
  bool _disposed = false;
  static Future<LocalRuntime> open(GallerySettings settings) async {
    final support = await getApplicationSupportDirectory();
    final runtime = LocalRuntime(
      LocalProfiles(
        Directory(p.join(support.path, 'local-v1')),
        const OsProfileVault(),
      ),
      settings,
    );
    try {
      await runtime.reopen();
      unawaited(runtime.connected.restore());
      return runtime;
    } catch (_) {
      await runtime.profiles.close();
      runtime.dispose();
      rethrow;
    }
  }

  Future<void> reopen() async {
    final store = await profiles.reopen();
    if (store != null) await activate(store);
  }

  Future<void> create(String name, ThemeMode mode) async {
    final store = await profiles.create(name, {'theme': mode.name});
    await activate(store);
  }

  Future<void> activate(LocalStore store) async {
    settings.removeListener(_persist);
    final previousSession = session;
    final preferences = await store.preferences();
    settings.themeMode =
        ThemeMode.values
            .where((m) => m.name == preferences['theme'])
            .firstOrNull ??
        ThemeMode.system;
    settings.effects = preferences['effects'] != 'false';
    settings.reduceMotion = preferences['reduceMotion'] == 'true';
    settings.compact = preferences['compact'] == 'true';
    settings.textScale = [
      1.0,
      1.5,
      2.0,
    ].where((v) => '$v' == preferences['textScale']).firstOrNull;
    final life = DurableLifeController(store);
    await life.initialize();
    session = LocalSession(
      LocalFinancialController(store, await store.snapshot()),
      this,
      life,
    );
    previousSession?.dispose();
    session!.profile.name = await store.displayName();
    session!.profile.profileId = store.owner;
    session!.profile.devices.clear();
    session!.profile.devices['This installation'] =
        'Local only · encrypted storage';
    session!.hideAmounts = preferences['hideAmounts'] == 'true';
    await life.startReminders(
      session!.finance,
      complete: () => session?.complete ?? false,
    );
    settings.addListener(_persist);
    settings.change(() {});
    await connected.attach();
    notifyListeners();
  }

  void _persist() {
    final s = session;
    if (s == null || _disposed) return;
    final values = {
      'theme': settings.themeMode.name,
      'effects': '${settings.effects}',
      'reduceMotion': '${settings.reduceMotion}',
      'compact': '${settings.compact}',
      'textScale': '${settings.textScale}',
      'hideAmounts': '${s.hideAmounts}',
    };
    final name = s.profile.name;
    _preferences = _preferences
        .then((_) => s.localFinance.store.savePreferences(name, values))
        .then((_) {
          preferenceError = null;
          if (!_disposed) notifyListeners();
        })
        .catchError((Object _) {
          preferenceError =
              'Preferences could not be saved. Check free storage and retry.';
          if (!_disposed) notifyListeners();
        });
  }

  Future<void> flushPreferences() => _preferences;
  Future<void> rename(String name) async {
    await flushPreferences();
    final store = session!.localFinance.store;
    await store.savePreferences(name, await store.preferences());
    session!.profile.name = name.trim();
    session!.profile.changed();
  }

  Future<void> close() async {
    await flushPreferences();
    await (session?.life as DurableLifeController?)?.close();
    await connected.close();
    await profiles.close();
  }

  @override
  void dispose() {
    _disposed = true;
    settings.removeListener(_persist);
    session?.dispose();
    super.dispose();
  }
}

class LocalSession extends PrototypeSession {
  LocalSession(
    LocalFinancialController controller,
    this.runtime,
    DurableLifeController life,
  ) : super(financial: controller, lifeController: life, production: true) {
    controller.privacyHidden = () => hideAmounts;
    runtime.connected.addListener(notifyListeners);
  }
  final LocalRuntime runtime;
  LocalFinancialController get localFinance =>
      finance as LocalFinancialController;
  @override
  bool get empty => finance.accounts.isEmpty;
  @override
  bool get local => !runtime.connected.connected;
  @override
  bool get complete => runtime.connected.complete;
  @override
  bool get pending => runtime.connected.pendingCount > 0;
  @override
  BigInt? get accepted => !complete
      ? null
      : local
      ? finance.liquid
      : localFinance.acceptedLiquid;
  @override
  BigInt? get projected => pending && complete ? finance.liquid : null;
  @override
  bool get needsReview => runtime.connected.reviewCount > 0;
  @override
  String get syncLabel => runtime.connected.label;
  @override
  String get coverage => runtime.connected.connected
      ? !complete
            ? 'Initial download incomplete. Complete balances are unavailable.'
            : '${finance.accounts.length} accounts · accepted history and $pendingCount waiting commands · PHP · Asia/Manila'
      : super.coverage;
  int get pendingCount => runtime.connected.pendingCount;
  @override
  void dispose() {
    runtime.connected.removeListener(notifyListeners);
    super.dispose();
  }

  @override
  void togglePrivacy() {
    super.togglePrivacy();
    localFinance.changed();
    runtime._persist();
  }

  @override
  void reset() =>
      throw StateError('A production profile cannot be reset as a demo.');
  @override
  void select(OverviewScenario value) =>
      throw StateError('Production does not use synthetic scenarios.');
}
