import 'package:flutter/material.dart';

import 'theme.dart';
import 'craft.dart';

class CraftPanel extends StatelessWidget {
  const CraftPanel({
    super.key,
    required this.child,
    this.focal = false,
    this.padding = 24,
  });
  final Widget child;
  final bool focal;
  final double padding;
  @override
  Widget build(BuildContext context) {
    final c = CraftTheme.of(context);
    if (focal) {
      return LatticeFrame(
        focal: true,
        padding: EdgeInsets.all(padding),
        child: Material(type: MaterialType.transparency, child: child),
      );
    }
    return Container(
      padding: EdgeInsets.all(padding),
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(Space.cardRadius),
        border: Border.all(color: c.divider),
      ),
      child: Material(type: MaterialType.transparency, child: child),
    );
  }
}

class SectionTitle extends StatelessWidget {
  const SectionTitle(this.title, {super.key, this.caption});
  final String title;
  final String? caption;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 16),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Semantics(
          header: true,
          child: Text(title, style: Theme.of(context).textTheme.titleLarge),
        ),
        if (caption != null)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              caption!,
              style: TextStyle(color: CraftTheme.of(context).secondary),
            ),
          ),
      ],
    ),
  );
}

class StatusNotice extends StatelessWidget {
  const StatusNotice(
    this.text, {
    super.key,
    this.tone = NoticeTone.neutral,
    this.live = false,
    this.action,
  });
  final String text;
  final NoticeTone tone;
  final bool live;
  final Widget? action;
  @override
  Widget build(BuildContext context) {
    final (ink, fill) = CraftTheme.of(context).tone(tone);
    final icon = switch (tone) {
      NoticeTone.success => Icons.check_circle_outline,
      NoticeTone.warning => Icons.error_outline,
      NoticeTone.error => Icons.cancel_outlined,
      NoticeTone.information => Icons.info_outline,
      NoticeTone.neutral => Icons.schedule,
    };
    return Semantics(
      liveRegion: live,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: fill,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(icon, color: ink, size: 20),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(text, style: TextStyle(color: ink)),
                ),
              ],
            ),
            if (action != null)
              Padding(padding: const EdgeInsets.only(top: 8), child: action!),
          ],
        ),
      ),
    );
  }
}

/// Exact formatted strings are supplied by the application, never calculated here.
class AmountText extends StatelessWidget {
  const AmountText(
    this.value, {
    super.key,
    this.large = false,
    this.semanticLabel,
  });
  final String value;
  final bool large;
  final String? semanticLabel;
  @override
  Widget build(BuildContext context) {
    if (!large) {
      return Text(
        value,
        semanticsLabel:
            semanticLabel ??
            value
                .replaceAll('₱', 'Philippine pesos ')
                .replaceAll('−', 'minus '),
        style: Theme.of(context).textTheme.titleMedium!
            .copyWith(fontFeatures: const [FontFeature.tabularFigures()]),
      );
    }
    return LayoutBuilder(
      builder: (context, box) {
        final base = Theme.of(context).textTheme.displaySmall!
            .copyWith(fontFeatures: const [FontFeature.tabularFigures()]);
        var style = base;
        var fits = true;
        if (box.hasBoundedWidth) {
          // The parent first gives amounts a full-width row. Only then adapt the
          // display role, retaining OS scaling and the 14px minimum text role.
          for (final size in [44.0, 38.0, 32.0, 26.0, 20.0, 16.0, 14.0]) {
            style = base.copyWith(fontSize: size);
            final measure = TextPainter(
              text: TextSpan(text: value, style: style),
              textDirection: Directionality.of(context),
              textScaler: MediaQuery.textScalerOf(context),
              maxLines: 1,
            )..layout();
            fits = measure.width <= box.maxWidth;
            measure.dispose();
            if (fits) break;
          }
        }
        final text = Text(
          value,
          softWrap: false,
          semanticsLabel:
              semanticLabel ??
              value
                  .replaceAll('₱', 'Philippine pesos ')
                  .replaceAll('−', 'minus '),
          style: style,
        );
        return fits ? text : _ScrollableAmount(child: text);
      },
    );
  }
}

class _ScrollableAmount extends StatefulWidget {
  const _ScrollableAmount({required this.child});
  final Widget child;
  @override
  State<_ScrollableAmount> createState() => _ScrollableAmountState();
}

class _ScrollableAmountState extends State<_ScrollableAmount> {
  final controller = ScrollController(keepScrollOffset: false);
  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scrollbar(
    controller: controller,
    thumbVisibility: true,
    child: SingleChildScrollView(
      controller: controller,
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.only(bottom: 12),
      child: widget.child,
    ),
  );
}

class MoneySummary extends StatelessWidget {
  const MoneySummary({
    super.key,
    required this.label,
    required this.value,
    required this.coverage,
    this.detail,
    this.onDetails,
  });
  final String label, coverage;
  final String? value, detail;
  final VoidCallback? onDetails;
  @override
  Widget build(BuildContext context) => CraftPanel(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: TextStyle(color: CraftTheme.of(context).secondary)),
        const SizedBox(height: 8),
        if (value == null)
          const Text('Not yet available')
        else
          AmountText(value!, large: true),
        const SizedBox(height: 12),
        Text(coverage),
        if (detail != null)
          Padding(padding: const EdgeInsets.only(top: 8), child: Text(detail!)),
        if (onDetails != null)
          TextButton(
            onPressed: onDetails,
            child: const Text('View source details'),
          ),
      ],
    ),
  );
}

class RecordRow extends StatelessWidget {
  const RecordRow({
    super.key,
    required this.title,
    required this.subtitle,
    required this.amount,
    required this.icon,
    required this.onDetails,
  });
  final String title, subtitle, amount;
  final IconData icon;
  final VoidCallback onDetails;
  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, box) {
      final narrow =
          box.maxWidth < 500 || MediaQuery.textScalerOf(context).scale(14) > 21;
      final text = Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: Theme.of(context).textTheme.titleMedium),
          Text(
            subtitle,
            style: TextStyle(color: CraftTheme.of(context).secondary),
          ),
        ],
      );
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: CraftTheme.of(context).selection,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(icon, color: CraftTheme.of(context).primary),
                ),
                const SizedBox(width: 12),
                Expanded(child: text),
                if (!narrow)
                  Padding(
                    padding: const EdgeInsets.only(left: 16),
                    child: AmountText(amount),
                  ),
              ],
            ),
            if (narrow)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: AmountText(amount),
              ),
            TextButton(onPressed: onDetails, child: Text('Details · $title')),
          ],
        ),
      );
    },
  );
}

class ReviewRows extends StatelessWidget {
  const ReviewRows({super.key, required this.rows});
  final List<(String, String)> rows;
  @override
  Widget build(BuildContext context) => Column(
    children: [
      for (final row in rows)
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: LayoutBuilder(
            builder: (context, box) {
              final label = Text(
                row.$1,
                style: TextStyle(color: CraftTheme.of(context).secondary),
              );
              final value = Text(
                row.$2,
                style: const TextStyle(
                  fontWeight: FontWeight.w600,
                  fontFeatures: [FontFeature.tabularFigures()],
                ),
              );
              return box.maxWidth < 460 ||
                      MediaQuery.textScalerOf(context).scale(14) > 21
                  ? Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [label, value],
                    )
                  : Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(child: label),
                        const SizedBox(width: 24),
                        Expanded(child: value),
                      ],
                    );
            },
          ),
        ),
    ],
  );
}

class EmptyPanel extends StatelessWidget {
  const EmptyPanel({
    super.key,
    required this.title,
    required this.message,
    this.action,
  });
  final String title, message;
  final Widget? action;
  @override
  Widget build(BuildContext context) => CraftPanel(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const CraftMotif(size: 64),
        const SizedBox(height: 16),
        SectionTitle(title, caption: message),
        ?action,
      ],
    ),
  );
}

class BusyAction extends StatelessWidget {
  const BusyAction({
    super.key,
    required this.busy,
    required this.label,
    required this.onPressed,
  });
  final bool busy;
  final String label;
  final VoidCallback onPressed;
  @override
  Widget build(BuildContext context) => Semantics(
    liveRegion: busy,
    child: FilledButton.icon(
      onPressed: busy ? null : onPressed,
      icon: busy
          ? const Icon(Icons.hourglass_top_rounded)
          : const Icon(Icons.check_rounded),
      label: Text(busy ? 'Demo processing…' : label),
    ),
  );
}

class AdaptivePair extends StatelessWidget {
  const AdaptivePair({super.key, required this.children, this.minWidth = 400});
  final List<Widget> children;
  final double minWidth;
  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, box) {
      final columns =
          box.maxWidth >= minWidth * 2 + 24 &&
              MediaQuery.textScalerOf(context).scale(14) <= 21
          ? 2
          : 1;
      final width = (box.maxWidth - 24 * (columns - 1)) / columns;
      return Wrap(
        spacing: 24,
        runSpacing: 24,
        children: children
            .map((child) => SizedBox(width: width, child: child))
            .toList(),
      );
    },
  );
}
