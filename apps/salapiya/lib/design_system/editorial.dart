import 'package:flutter/material.dart';

import 'theme.dart';

/// Flat editorial surfaces share spacing and color without framing every section.
class EditorialSurface extends StatelessWidget {
  const EditorialSurface({
    super.key,
    required this.child,
    this.color,
    this.padding = 24,
  });
  final Widget child;
  final Color? color;
  final double padding;
  @override
  Widget build(BuildContext context) => Material(
    color: color ?? CraftTheme.of(context).surface,
    borderRadius: BorderRadius.circular(24),
    child: Padding(padding: EdgeInsets.all(padding), child: child),
  );
}

class Eyebrow extends StatelessWidget {
  const Eyebrow(this.text, {super.key, this.color});
  final String text;
  final Color? color;
  @override
  Widget build(BuildContext context) => Text(
    text,
    style: TextStyle(
      fontSize: 11,
      fontWeight: FontWeight.w600,
      letterSpacing: 1.6,
      color: color ?? CraftTheme.of(context).secondary,
    ),
  );
}

class SectionHeading extends StatelessWidget {
  const SectionHeading(this.title, {super.key, this.trailing});
  final String title;
  final Widget? trailing;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: LayoutBuilder(
      builder: (context, bounds) {
        final heading = Semantics(
          header: true,
          child: Text(title, style: Theme.of(context).textTheme.titleLarge),
        );
        if (trailing != null &&
            bounds.maxWidth < 460 &&
            MediaQuery.textScalerOf(context).scale(14) > 18) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [heading, const SizedBox(height: 8), trailing!],
          );
        }
        return Row(
          children: [
            Expanded(child: heading),
            ?trailing,
          ],
        );
      },
    ),
  );
}

class IconTile extends StatelessWidget {
  const IconTile(
    this.icon, {
    super.key,
    this.color = Palette.lilac,
    this.size = 42,
  });
  final IconData icon;
  final Color color;
  final double size;
  @override
  Widget build(BuildContext context) => Container(
    width: size,
    height: size,
    decoration: BoxDecoration(
      color: color,
      borderRadius: BorderRadius.circular(14),
    ),
    child: Icon(icon, color: Palette.ink, size: 20),
  );
}
