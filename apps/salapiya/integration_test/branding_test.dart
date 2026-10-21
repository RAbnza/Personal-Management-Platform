import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets('all six unchanged logos: native SVG and browser export', (
    tester,
  ) async {
    const sources = {
      'mark': 'mark/salapiya_mark',
      'horizontal-light': 'horizontal/salapiya_horizontal_on_light',
      'horizontal-dark': 'horizontal/salapiya_horizontal_on_dark',
      'vertical-light': 'vertical/salapiya_vertical_on_light',
      'vertical-dark': 'vertical/salapiya_vertical_on_dark',
      'original': 'source/salapiya_original',
    };
    final shots = <String, String>{};
    final metrics = <String, Map<String, num>>{};
    await binding.setSurfaceSize(const Size(720, 400));
    for (final entry in sources.entries) {
      final key = GlobalKey();
      final raw = <List<int>>[];
      for (final svg in [false, true]) {
        await tester.pumpWidget(
          Directionality(
            textDirection: TextDirection.ltr,
            child: Center(
              child: RepaintBoundary(
                key: key,
                child: SizedBox(
                  width: 640,
                  height: 320,
                  child: svg
                      ? SvgPicture.asset(
                          'assets/branding/${entry.value}.svg',
                          fit: BoxFit.contain,
                        )
                      : Image.asset(
                          'assets/branding/display/${entry.value.split('/').last}.png',
                          fit: BoxFit.contain,
                        ),
                ),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        // Embedded source PNGs are decoded asynchronously by the SVG codec.
        await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 300)),
        );
        await tester.pumpAndSettle();
        final image =
            await (key.currentContext!.findRenderObject()!
                    as RenderRepaintBoundary)
                .toImage(pixelRatio: 1);
        final png = await image.toByteData(format: ui.ImageByteFormat.png);
        final rgba = await image.toByteData(format: ui.ImageByteFormat.rawRgba);
        raw.add(rgba!.buffer.asUint8List());
        shots['${Platform.operatingSystem}-logo-${entry.key}-${svg ? 'svg' : 'export'}'] =
            base64Encode(png!.buffer.asUint8List());
        image.dispose();
        expect(tester.takeException(), isNull);
      }
      var sum = 0, changed = 0;
      for (var pixel = 0; pixel < raw[0].length; pixel += 4) {
        var max = 0;
        for (var channel = 0; channel < 4; channel++) {
          final difference = (raw[0][pixel + channel] - raw[1][pixel + channel])
              .abs();
          sum += difference;
          if (difference > max) max = difference;
        }
        if (max > 16) changed++;
      }
      metrics[entry.key] = {
        'meanAbsoluteChannelDifference': sum / raw[0].length,
        'pixelsWithAnyChannelDifferenceAbove16': changed,
        'pixels': 640 * 320,
      };
    }
    await binding.setSurfaceSize(null);
    binding.reportData = {
      'platform': Platform.operatingSystem,
      'kind': 'branding',
      'screenshots': shots,
      'metrics': metrics,
      'note': 'Identical 640x320 transparent contain rectangles on each native renderer. Pixel differences include normal resampling/antialiasing; inspect shape/gradient differences visually.',
    };
  });
}
