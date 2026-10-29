import 'package:flutter/material.dart';

enum GallerySection {
  foundations('Foundations', Icons.auto_awesome_outlined),
  typography('Typography', Icons.text_fields_rounded),
  actions('Actions & forms', Icons.tune_rounded),
  finance('Money specimens', Icons.account_balance_wallet_outlined),
  navigation('Navigation studies', Icons.space_dashboard_outlined),
  overlays('Overlays & review', Icons.layers_outlined),
  feedback('Feedback & status', Icons.chat_bubble_outline_rounded),
  branding('Brand & craft', Icons.texture_rounded);

  const GallerySection(this.label, this.icon);
  final String label;
  final IconData icon;
}

class GallerySettings extends ChangeNotifier {
  ThemeMode themeMode = ThemeMode.system;
  bool effects = true, reduceMotion = false, compact = false;
  double? textScale;
  GallerySection section = GallerySection.foundations;
  int resetRevision = 0;
  void change(VoidCallback update) {
    update();
    notifyListeners();
  }

  void reset() => change(() {
    themeMode = ThemeMode.system;
    effects = true;
    reduceMotion = false;
    compact = false;
    textScale = null;
    section = GallerySection.foundations;
    resetRevision++;
  });
}
