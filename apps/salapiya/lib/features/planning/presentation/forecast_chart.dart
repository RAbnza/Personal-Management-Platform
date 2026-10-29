import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../design_system/theme.dart';
import '../../finance/contracts/financial_models.dart';
import '../../finance/presentation/financial_widgets.dart';
import '../application/planning_controller.dart';

class ForecastChart extends StatefulWidget {
  const ForecastChart({
    super.key,
    required this.opening,
    required this.end,
    required this.recorded,
    required this.expected,
    required this.hypothetical,
  });
  final BigInt opening;
  final String end;
  final List<(String, BigInt)> recorded, expected, hypothetical;
  @override
  State<ForecastChart> createState() => _ForecastChartState();
}

class _ForecastChartState extends State<ForecastChart> {
  int selected = 0;
  @override
  Widget build(BuildContext context) {
    final count = dateValue(widget.end)
        .difference(DateTime(2026, 10, 21))
        .inDays;
    final dates = [
      for (var i = 0; i <= count; i++)
        civil(DateTime(2026, 10, 21).add(Duration(days: i))),
    ];
    final actual = <BigInt>[], expected = <BigInt>[], hypothetical = <BigInt>[];
    for (final d in dates) {
      final a =
          widget.opening +
          ExactFinance.sum(
            widget.recorded
                .where((e) => e.$1.compareTo(d) <= 0)
                .map((e) => e.$2),
          );
      final e =
          a +
          ExactFinance.sum(
            widget.expected
                .where((e) => e.$1.compareTo(d) <= 0)
                .map((e) => e.$2),
          );
      actual.add(a);
      expected.add(e);
      hypothetical.add(
        e +
            ExactFinance.sum(
              widget.hypothetical
                  .where((e) => e.$1.compareTo(d) <= 0)
                  .map((e) => e.$2),
            ),
      );
    }
    selected = selected.clamp(0, count);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 20),
        Wrap(
          spacing: 16,
          runSpacing: 8,
          children: [
            Text(
              'Recorded cash',
              style: TextStyle(color: CraftTheme.of(context).secondary),
            ),
            const Text('Expected', style: TextStyle(color: Palette.violet)),
            const Text(
              'Hypothetical · dashed',
              style: TextStyle(color: Color(0xFF966539)),
            ),
          ],
        ),
        SizedBox(
          height: 220,
          child: CustomPaint(
            painter: _ForecastPainter(
              [actual, expected, hypothetical],
              selected,
              CraftTheme.of(context).secondary,
            ),
          ),
        ),
        Slider(
          label: dates[selected],
          value: selected.toDouble(),
          min: 0,
          max: count.toDouble(),
          divisions: count,
          onChanged: (v) => setState(() => selected = v.round()),
        ),
        FinancialLine(
          dates[selected],
          selected == 0
              ? 'Actual opening'
              : 'Recorded cash / expected closing / hypothetical closing',
          value:
              '${ExactFinance.money(actual[selected])}\n${ExactFinance.money(expected[selected])}\n${ExactFinance.money(hypothetical[selected])}',
        ),
        ExpansionTile(
          key: const PageStorageKey('forecast-exact-daily-table'),
          title: const Text('Exact daily forecast table'),
          children: [
            for (var i = 0; i < dates.length; i++)
              FinancialLine(
                dates[i],
                'Recorded ${ExactFinance.money(actual[i])} · expected ${ExactFinance.money(expected[i])}',
                value: 'Hypothetical ${ExactFinance.money(hypothetical[i])}',
              ),
          ],
        ),
      ],
    );
  }
}

class _ForecastPainter extends CustomPainter {
  _ForecastPainter(this.series, this.selected, this.recordedColor);
  final List<List<BigInt>> series;
  final int selected;
  final Color recordedColor;
  @override
  void paint(Canvas canvas, Size size) {
    final all = series.expand((s) => s).map((x) => x.toDouble());
    final low = all.reduce(math.min),
        high = all.reduce(math.max),
        range = math.max(1.0, high - low);
    double x(int i) => 12 + i * (size.width - 24) / (series.first.length - 1);
    double y(BigInt v) =>
        size.height - 20 - (v.toDouble() - low) / range * (size.height - 40);
    final colors = [recordedColor, Palette.violet, const Color(0xFF966539)];
    canvas.drawLine(
      Offset(x(selected), 10),
      Offset(x(selected), size.height - 10),
      Paint()..color = recordedColor.withValues(alpha: .2),
    );
    for (var n = 0; n < series.length; n++) {
      final paint = Paint()
        ..color = colors[n]
        ..strokeWidth = 2.5
        ..style = PaintingStyle.stroke;
      for (var i = 1; i < series[n].length; i++) {
        final from = Offset(x(i - 1), y(series[n][i - 1])),
            to = Offset(x(i), y(series[n][i]));
        if (n == 2) {
          canvas.drawLine(from, Offset.lerp(from, to, .6)!, paint);
        } else {
          canvas.drawLine(from, to, paint);
        }
      }
      canvas.drawCircle(
        Offset(x(selected), y(series[n][selected])),
        4,
        Paint()..color = colors[n],
      );
    }
  }

  @override
  bool shouldRepaint(covariant _ForecastPainter old) =>
      old.series != series || old.selected != selected;
}
