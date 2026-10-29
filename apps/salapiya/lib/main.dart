import 'package:flutter/material.dart';

import 'app.dart';

void main() {
  runApp(const SalapiyaApp(production: !bool.fromEnvironment('SALAPIYA_DEMO')));
}
