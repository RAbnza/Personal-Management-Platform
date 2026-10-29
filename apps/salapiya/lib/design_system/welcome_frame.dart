import 'package:flutter/material.dart';

import '../app/demo_routes.dart';
import 'craft.dart';
import 'theme.dart';
import 'workspace.dart';

/// First-use frame. Returning profiles bypass it without timers or intro routes.
class WelcomeFrame extends StatelessWidget {
  const WelcomeFrame({
    super.key,
    required this.child,
    this.step = 'Welcome',
    this.back = true,
  });
  final Widget child;
  final String step;
  final bool back;
  @override
  Widget build(BuildContext context) => RouteEscape(
    child: Scaffold(
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, b) {
            final c = CraftTheme.of(context);
            final wide =
                b.maxWidth >= 940 &&
                MediaQuery.textScalerOf(context).scale(14) < 21;
            final content = Padding(
              padding: EdgeInsets.all(wide ? 40 : 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      if (back) const BackButton(),
                      const BrandMark(size: 32),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          'Salapiya',
                          style: Theme.of(context).textTheme.titleLarge,
                        ),
                      ),
                      Text(
                        step,
                        style: TextStyle(color: c.secondary, fontSize: 12),
                      ),
                    ],
                  ),
                  const SizedBox(height: 36),
                  child,
                ],
              ),
            );
            return SingleChildScrollView(
              padding: EdgeInsets.all(wide ? 40 : 0),
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 1120),
                  child: Container(
                    decoration: BoxDecoration(
                      color: c.surface,
                      borderRadius: BorderRadius.circular(wide ? 20 : 0),
                      border: wide ? Border.all(color: c.divider) : null,
                    ),
                    child: wide
                        ? Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Expanded(
                                flex: 4,
                                child: Padding(
                                  padding: const EdgeInsets.all(32),
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      const SizedBox(height: 30),
                                      const BrandMark(size: 92),
                                      const SizedBox(height: 32),
                                      Text(
                                        'A little clarity.\nA lot more freedom.',
                                        style: Theme.of(context)
                                            .textTheme
                                            .displaySmall
                                            ?.copyWith(
                                              fontSize: 34,
                                              height: 1.2,
                                            ),
                                      ),
                                      const SizedBox(height: 16),
                                      Text(
                                        'One calm place for your money, your plans, and what comes next.',
                                        style: TextStyle(
                                          color: c.secondary,
                                          height: 1.6,
                                        ),
                                      ),
                                      const SizedBox(height: 44),
                                      WorkspacePanel(
                                        child: Column(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.start,
                                          children: [
                                            Icon(
                                              Icons.lock_outline,
                                              color: c.primary,
                                              size: 22,
                                            ),
                                            const SizedBox(height: 12),
                                            const Text(
                                              'Private from the start',
                                              style: TextStyle(
                                                fontWeight: FontWeight.w600,
                                              ),
                                            ),
                                            const SizedBox(height: 8),
                                            Text(
                                              'Your local profile is encrypted on this device. Connect Google only when you choose.',
                                              style: TextStyle(
                                                color: c.secondary,
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                      const Text(
                                        'Your money, on your terms.',
                                        style: TextStyle(fontSize: 12),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                              Expanded(flex: 6, child: content),
                            ],
                          )
                        : content,
                  ),
                ),
              ),
            );
          },
        ),
      ),
    ),
  );
}
