import 'package:flutter/material.dart';

class SalapiyaApp extends StatelessWidget {
  const SalapiyaApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Salapiya',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF6750A4)),
      ),
      darkTheme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF6750A4),
          brightness: Brightness.dark,
        ),
      ),
      home: const StartupPage(),
    );
  }
}

/// A transient interaction for verifying rendering, input, and hot reload.
/// No profile, financial records, persistence, or network services exist yet.
class StartupPage extends StatefulWidget {
  const StartupPage({super.key});

  @override
  State<StartupPage> createState() => _StartupPageState();
}

class _StartupPageState extends State<StartupPage> {
  int _checks = 0;

  void _runCheck() {
    setState(() => _checks += 1);
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;

    return Scaffold(
      appBar: AppBar(title: const Text('Salapiya')),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 560),
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Semantics(
                    header: true,
                    child: Text(
                      'Your money, on your terms.',
                      style: textTheme.headlineMedium,
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'Native development foundation',
                    style: textTheme.titleLarge,
                  ),
                  const SizedBox(height: 12),
                  const Text(
                    'This startup screen works offline on Windows and Android. '
                    'Product features are still to come.',
                  ),
                  const SizedBox(height: 24),
                  Semantics(
                    liveRegion: true,
                    child: Text('Startup checks: $_checks'),
                  ),
                  const SizedBox(height: 12),
                  FilledButton(
                    onPressed: _runCheck,
                    child: const Text('Run startup check'),
                  ),
                  const SizedBox(height: 12),
                  const Text('The check count resets when the app restarts.'),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
