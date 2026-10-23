import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// A single SDK stack for detail/task/utility routes. Primary tabs never push.
/// Await removal before unlocking callers and restoring their focus.
Future<T?> openDemoPage<T>(
  BuildContext context,
  Widget page,
  String name,
) async {
  if (!(ModalRoute.of(context)?.isCurrent ?? true)) return null;
  final origin = FocusManager.instance.primaryFocus;
  final reduced = MediaQuery.disableAnimationsOf(context);
  final route = PageRouteBuilder<T>(
    settings: RouteSettings(name: name),
    transitionDuration: reduced
        ? Duration.zero
        : const Duration(milliseconds: 160),
    reverseTransitionDuration: reduced
        ? Duration.zero
        : const Duration(milliseconds: 120),
    pageBuilder: (_, _, _) => page,
    transitionsBuilder: (_, animation, _, child) =>
        FadeTransition(opacity: animation, child: child),
  );
  final result = await Navigator.of(context).push<T>(route);
  await route.completed;
  if (origin?.context != null) origin!.requestFocus();
  return result;
}

/// Escape uses the current Navigator route so dialogs keep dismissal priority.
class RouteEscape extends StatelessWidget {
  const RouteEscape({super.key, required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context) => CallbackShortcuts(
    bindings: {
      const SingleActivator(LogicalKeyboardKey.escape): () =>
          Navigator.of(context).maybePop(),
      const SingleActivator(LogicalKeyboardKey.arrowLeft, alt: true): () =>
          Navigator.of(context).maybePop(),
    },
    child: Focus(autofocus: true, child: child),
  );
}

class DemoPage extends StatelessWidget {
  const DemoPage({super.key, required this.title, required this.child});
  final String title;
  final Widget child;
  @override
  Widget build(BuildContext context) => RouteEscape(
    child: Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 8, 16, 8),
              child: Row(
                children: [
                  const BackButton(),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Semantics(
                      header: true,
                      child: Text(
                        title,
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(24),
                child: Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 760),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const Text(
                          'DEMO · synthetic data · resets when closed',
                        ),
                        const SizedBox(height: 24),
                        child,
                        const SizedBox(height: 32),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}
