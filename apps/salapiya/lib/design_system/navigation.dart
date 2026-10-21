import 'package:flutter/material.dart';

import 'theme.dart';

/// Presentation only. Selection and routing belong to the caller.
class DestinationControl extends StatelessWidget {
  const DestinationControl({
    super.key,
    required this.label,
    required this.icon,
    required this.selected,
    this.onPressed,
    this.compact = false,
    this.vertical = false,
  });
  final String label;
  final IconData icon;
  final bool selected, compact, vertical;
  final VoidCallback? onPressed;
  @override
  Widget build(BuildContext context) => Semantics(
    selected: selected,
    child: Tooltip(
      message: label,
      child: TextButton(
        style: TextButton.styleFrom(
          backgroundColor: selected ? CraftTheme.of(context).selection : null,
          minimumSize: const Size(48, 48),
          padding: vertical
              ? const EdgeInsets.symmetric(horizontal: 2, vertical: 12)
              : const EdgeInsets.all(12),
        ),
        onPressed: onPressed,
        child: compact
            ? Icon(icon, semanticLabel: label)
            : vertical
            ? Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(icon, size: 20),
                  const SizedBox(height: 8),
                  Text(
                    label,
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 12),
                  ),
                ],
              )
            : Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(icon, size: 20),
                  const SizedBox(width: 12),
                  Flexible(child: Text(label)),
                ],
              ),
      ),
    ),
  );
}
