import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'design_system/theme.dart';
import 'gallery/gallery.dart';
import 'gallery/settings.dart';
import 'app/shell.dart';
import 'app/window_chrome.dart';
import 'prototype/scenarios.dart';
import 'local/local_profile_view.dart';
import 'local/local_runtime.dart';
import 'features/finance/presentation/financial_widgets.dart';

class SalapiyaApp extends StatefulWidget {
  const SalapiyaApp({
    super.key,
    this.settings,
    this.gallery = false,
    this.session,
    this.production = false,
    this.localRuntime,
  });
  final GallerySettings? settings;
  final bool gallery;
  final PrototypeSession? session;
  final bool production;
  final LocalRuntime? localRuntime;
  @override
  State<SalapiyaApp> createState() => _SalapiyaAppState();
}

class _SalapiyaAppState extends State<SalapiyaApp> {
  final navigator = GlobalKey<NavigatorState>();
  static bool licensesRegistered = false;
  late final GallerySettings settings = widget.settings ?? GallerySettings();
  @override
  void initState() {
    super.initState();
    if (licensesRegistered) return;
    licensesRegistered = true;
    for (final family in ['nunitosans', 'geist', 'sourcesans3']) {
      LicenseRegistry.addLicense(() async* {
        yield LicenseEntryWithLineBreaks([
          'Salapiya font: $family',
        ], await rootBundle.loadString('assets/fonts/$family/OFL.txt'));
      });
    }
  }

  @override
  void dispose() {
    if (widget.settings == null) settings.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: settings,
    builder: (context, _) => MaterialApp(
      navigatorKey: navigator,
      title: widget.production ? 'Salapiya' : 'Salapiya · Demo',
      debugShowCheckedModeBanner: false,
      theme: SalapiyaTheme.build(Brightness.light),
      darkTheme: SalapiyaTheme.build(Brightness.dark),
      themeMode: settings.themeMode,
      themeAnimationDuration: Duration.zero,
      builder: (context, child) {
        final media = MediaQuery.of(context);
        return MediaQuery(
          data: media.copyWith(
            disableAnimations: media.disableAnimations || settings.reduceMotion,
            textScaler: settings.textScale == null
                ? media.textScaler
                : TextScaler.linear(settings.textScale!),
          ),
          child: CraftPreferences(
            effects: settings.effects && !media.highContrast,
            child: Theme(
              data: Theme.of(context).copyWith(
                filledButtonTheme: FilledButtonThemeData(
                  style: Theme.of(context).filledButtonTheme.style?.copyWith(
                    animationDuration:
                        settings.reduceMotion || media.disableAnimations
                        ? Duration.zero
                        : const Duration(milliseconds: 120),
                  ),
                ),
                outlinedButtonTheme: OutlinedButtonThemeData(
                  style: Theme.of(context).outlinedButtonTheme.style?.copyWith(
                    animationDuration:
                        settings.reduceMotion || media.disableAnimations
                        ? Duration.zero
                        : const Duration(milliseconds: 120),
                  ),
                ),
                textButtonTheme: TextButtonThemeData(
                  style: Theme.of(context).textButtonTheme.style?.copyWith(
                    animationDuration:
                        settings.reduceMotion || media.disableAnimations
                        ? Duration.zero
                        : const Duration(milliseconds: 120),
                  ),
                ),
              ),
              child: CallbackShortcuts(
                bindings: {
                  const SingleActivator(LogicalKeyboardKey.escape): () =>
                      navigator.currentState?.maybePop(),
                  const SingleActivator(
                    LogicalKeyboardKey.arrowLeft,
                    alt: true,
                  ): () =>
                      navigator.currentState?.maybePop(),
                },
                child: FinancialEnvironment(
                  production:
                      widget.production ||
                      (widget.session?.production ?? false),
                  child: WindowChrome(child: child!),
                ),
              ),
            ),
          ),
        );
      },
      home: widget.gallery
          ? GalleryHome(settings: settings)
          : widget.production
          ? LocalBootstrap(settings: settings, runtime: widget.localRuntime)
          : SalapiyaShell(settings: settings, session: widget.session),
    ),
  );
}
