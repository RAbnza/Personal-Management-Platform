import 'package:flutter/material.dart';

import 'theme.dart';

/// Original abstract interlacing; no traditional artwork or logo is copied.
class CraftMotif extends StatelessWidget {
  const CraftMotif({super.key, this.lattice = false, this.size = 96});
  final bool lattice;
  final double size;
  @override
  Widget build(BuildContext context) {
    final c = CraftTheme.of(context);
    return ExcludeSemantics(
      child: IgnorePointer(
        child: SizedBox.square(
          dimension: size,
          child: CraftPreferences.effectsOf(context)
              ? RepaintBoundary(
                  child: CustomPaint(
                    painter: _WeavePainter(
                      c.primary,
                      c.warm,
                      c.selection,
                      lattice,
                    ),
                  ),
                )
              : null,
        ),
      ),
    );
  }
}

class _WeavePainter extends CustomPainter {
  const _WeavePainter(this.ink, this.warm, this.gap, this.lattice);
  final Color ink, warm, gap;
  final bool lattice;
  @override
  void paint(Canvas canvas, Size size) {
    canvas.scale(size.width / 96, size.height / 96);
    final p = Paint()..strokeCap = StrokeCap.round;
    if (lattice) {
      p
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3;
      for (var i = 0; i < 3; i++) {
        p.color = i == 1 ? warm : ink;
        canvas.drawRRect(
          RRect.fromRectAndRadius(
            Rect.fromLTWH(8.0 + i * 16, 8.0 + i * 16, 52, 52),
            const Radius.circular(8),
          ),
          p,
        );
      }
      return;
    }
    for (var i = 0; i < 3; i++) {
      p
        ..color = ink
        ..strokeWidth = 8;
      canvas.drawLine(Offset(16.0 + i * 28, 6), Offset(16.0 + i * 28, 90), p);
      p.color = warm;
      canvas.drawLine(Offset(6, 16.0 + i * 28), Offset(90, 16.0 + i * 28), p);
    }
    for (var x = 0; x < 3; x++) {
      for (var y = 0; y < 3; y++) {
        if ((x + y).isEven) {
          p
            ..color = gap
            ..strokeWidth = 14;
          canvas.drawLine(
            Offset(16.0 + x * 28, 8.0 + y * 28),
            Offset(16.0 + x * 28, 24.0 + y * 28),
            p,
          );
          p
            ..color = ink
            ..strokeWidth = 8;
          canvas.drawLine(
            Offset(16.0 + x * 28, 6.0 + y * 28),
            Offset(16.0 + x * 28, 26.0 + y * 28),
            p,
          );
        }
      }
    }
  }

  @override
  bool shouldRepaint(_WeavePainter old) =>
      old.ink != ink ||
      old.warm != warm ||
      old.gap != gap ||
      old.lattice != lattice;
}

class BrandMark extends StatelessWidget {
  const BrandMark({super.key, this.size = 48});
  final double size;
  @override
  Widget build(BuildContext context) => Image.asset(
    'assets/branding/display/salapiya_mark.png',
    width: size,
    height: size,
    fit: BoxFit.contain,
    excludeFromSemantics: true,
  );
}
