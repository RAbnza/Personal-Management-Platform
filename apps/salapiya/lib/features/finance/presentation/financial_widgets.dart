import 'package:flutter/material.dart';

import '../../../app/demo_routes.dart';
import '../../../design_system/editorial.dart';
import '../../../design_system/theme.dart';
export '../../../design_system/workspace.dart';
export '../../../design_system/form_presentation.dart';

class FinancialEnvironment extends InheritedWidget {
  const FinancialEnvironment({
    super.key,
    required this.production,
    required super.child,
  });
  final bool production;
  static bool isProduction(BuildContext context) =>
      context
          .dependOnInheritedWidgetOfExactType<FinancialEnvironment>()
          ?.production ??
      false;
  @override
  bool updateShouldNotify(FinancialEnvironment oldWidget) =>
      production != oldWidget.production;
}

class FinancePage extends StatelessWidget {
  const FinancePage({super.key, required this.title, required this.child});
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
                    child: Text(
                      title,
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(20),
                child: Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 1200),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Eyebrow(
                          FinancialEnvironment.isProduction(context)
                              ? 'LOCAL ONLY · PRIVATE ON THIS DEVICE'
                              : 'DEMO · SYNTHETIC DATA · RESETS WHEN CLOSED',
                        ),
                        const SizedBox(height: 16),
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

class FinanceHeading extends StatelessWidget {
  const FinanceHeading(
    this.kicker,
    this.title,
    this.caption, {
    super.key,
    this.actions = const [],
  });
  final String kicker, title, caption;
  final List<Widget> actions;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 24),
    child: LayoutBuilder(
      builder: (context, b) {
        final heading = Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: Theme.of(context).textTheme.displaySmall),
            const SizedBox(height: 6),
            Text(
              caption,
              style: TextStyle(color: CraftTheme.of(context).secondary),
            ),
          ],
        );
        final commands = Wrap(spacing: 8, runSpacing: 8, children: actions);
        if (b.maxWidth > 1000 &&
            actions.length <= 3 &&
            MediaQuery.textScalerOf(context).scale(14) < 20) {
          return Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(child: heading),
              const SizedBox(width: 24),
              commands,
            ],
          );
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            heading,
            if (actions.isNotEmpty) ...[const SizedBox(height: 16), commands],
          ],
        );
      },
    ),
  );
}

class FinanceColumns extends StatelessWidget {
  const FinanceColumns({
    super.key,
    required this.main,
    required this.aside,
    this.ratio = 2,
  });
  final Widget main, aside;
  final int ratio;
  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, b) {
      if (b.maxWidth < 850 || MediaQuery.textScalerOf(context).scale(14) > 21) {
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [main, const SizedBox(height: 24), aside],
        );
      }
      return Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(flex: ratio, child: main),
          const SizedBox(width: 28),
          Expanded(child: aside),
        ],
      );
    },
  );
}

class FinanceNotice extends StatelessWidget {
  const FinanceNotice(this.text, {super.key, this.warning = false});
  final String text;
  final bool warning;
  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.symmetric(vertical: 8),
    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
    decoration: BoxDecoration(
      color: warning
          ? CraftTheme.of(context).warmSurface
          : CraftTheme.of(context).surface,
      borderRadius: BorderRadius.circular(10),
      border: Border.all(color: CraftTheme.of(context).divider),
    ),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(
          warning ? Icons.info_outline : Icons.info_outline,
          size: 20,
          color: warning
              ? CraftTheme.of(context).warm
              : CraftTheme.of(context).primary,
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Text(
            text,
            style: TextStyle(
              fontSize: 13,
              color: CraftTheme.of(context).secondary,
            ),
          ),
        ),
      ],
    ),
  );
}

class FinancialLine extends StatelessWidget {
  const FinancialLine(
    this.title,
    this.subtitle, {
    super.key,
    this.value,
    this.icon = Icons.receipt_long_outlined,
    this.onTap,
    this.color = Palette.lilac,
  });
  final String title, subtitle;
  final String? value;
  final IconData icon;
  final VoidCallback? onTap;
  final Color color;
  @override
  Widget build(BuildContext context) => Column(
    children: [
      InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 4),
          child: LayoutBuilder(
            builder: (context, b) {
              final narrow =
                  b.maxWidth < 420 ||
                  MediaQuery.textScalerOf(context).scale(14) > 20;
              return Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  IconTile(icon, color: color),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          title,
                          style: const TextStyle(fontWeight: FontWeight.w600),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          subtitle,
                          style: TextStyle(
                            fontSize: 12,
                            color: CraftTheme.of(context).secondary,
                          ),
                        ),
                        if (narrow && value != null)
                          Padding(
                            padding: const EdgeInsets.only(top: 8),
                            child: Text(
                              value!,
                              style: const TextStyle(
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                  if (!narrow && value != null) ...[
                    const SizedBox(width: 12),
                    Flexible(
                      child: Text(
                        value!,
                        textAlign: TextAlign.end,
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                    ),
                  ],
                  if (onTap != null)
                    const Padding(
                      padding: EdgeInsets.only(left: 8),
                      child: Icon(Icons.chevron_right, size: 18),
                    ),
                ],
              );
            },
          ),
        ),
      ),
      const Divider(height: 1),
    ],
  );
}

class ValueBlock extends StatelessWidget {
  const ValueBlock(
    this.label,
    this.value,
    this.caption, {
    super.key,
    this.color,
    this.dark = false,
    this.captionSemanticsLabel,
    this.amountFontSize,
    this.scrollAmount = false,
  });
  final String label, value, caption;
  final String? captionSemanticsLabel;
  final double? amountFontSize;
  final bool scrollAmount;
  final Color? color;
  final bool dark;
  @override
  Widget build(BuildContext context) => EditorialSurface(
    color: dark ? Palette.ink : color,
    child: DefaultTextStyle.merge(
      style: TextStyle(
        color: dark
            ? Palette.white
            : color != null
            ? Palette.ink
            : CraftTheme.of(context).text,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(fontSize: 12, letterSpacing: 1)),
          const SizedBox(height: 12),
          if (amountFontSize == null)
            Text(
              value,
              style: const TextStyle(
                fontSize: 26,
                letterSpacing: -1,
                fontWeight: FontWeight.w500,
              ),
            )
          else if (scrollAmount) ...[
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Text(
                value,
                maxLines: 1,
                softWrap: false,
                style: TextStyle(
                  fontSize: amountFontSize,
                  letterSpacing: -1,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
            const SizedBox(height: 4),
            const Text(
              'Scroll amount to see all digits',
              style: TextStyle(fontSize: 12),
            ),
          ] else
            Text(
              value,
              maxLines: 1,
              softWrap: false,
              style: TextStyle(
                fontSize: amountFontSize,
                letterSpacing: -1,
                fontWeight: FontWeight.w500,
              ),
            ),
          const SizedBox(height: 12),
          Text(
            caption,
            semanticsLabel: captionSemanticsLabel,
            style: const TextStyle(fontSize: 12),
          ),
        ],
      ),
    ),
  );
}

class ExactBar extends StatelessWidget {
  const ExactBar({
    super.key,
    required this.label,
    required this.value,
    required this.amount,
    required this.total,
    this.color = Palette.lilac,
    this.onTap,
  });
  final String label, value;
  final BigInt amount, total;
  final Color color;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) => Semantics(
    label: '$label, $value',
    child: InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Wrap(
              alignment: WrapAlignment.spaceBetween,
              spacing: 12,
              children: [
                Text(label),
                Text(
                  value,
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
              ],
            ),
            const SizedBox(height: 10),
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                minHeight: 8,
                value: total <= BigInt.zero
                    ? 0
                    : (amount.toDouble() / total.toDouble()).clamp(0, 1),
                color: color,
                backgroundColor: CraftTheme.of(context).subtle,
              ),
            ),
          ],
        ),
      ),
    ),
  );
}
