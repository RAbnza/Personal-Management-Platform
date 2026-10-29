import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../design_system/theme.dart';

/// Native caption styling only. Windows continues to own the entire frame.
class WindowChrome extends StatefulWidget {
  const WindowChrome({super.key, required this.child});
  final Widget child;
  @override
  State<WindowChrome> createState() => _WindowChromeState();
}

class _WindowChromeState extends State<WindowChrome> {
  static const channel = MethodChannel('dev.salapiya/window_chrome');
  List<Object>? last;
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (kIsWeb || defaultTargetPlatform != TargetPlatform.windows) return;
    final c = CraftTheme.of(context);
    final args = <Object>[
      c.dark,
      (c.dark ? Palette.midnight : Palette.porcelain).toARGB32() & 0xffffff,
      c.text.toARGB32() & 0xffffff,
      c.divider.toARGB32() & 0xffffff,
    ];
    if (listEquals(last, args)) return;
    last = args;
    unawaited(apply(args));
  }

  Future<void> apply(List<Object> args) async {
    try {
      await channel.invokeMethod<void>('theme', args);
    } on MissingPluginException {
      // Widget tests and older runners retain the ordinary OS frame.
    } on PlatformException {
      // Unsupported DWM color attributes must not prevent app startup.
    }
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
