import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/app.dart';
import 'package:salapiya/app/shell_navigation.dart';

void main() {
  for (final platform in [TargetPlatform.windows, TargetPlatform.android]) {
    testWidgets(
      'overlay keeps a full scroll viewport and final-item clearance: $platform',
      (tester) async {
        debugDefaultTargetPlatformOverride = platform;
        addTearDown(() => debugDefaultTargetPlatformOverride = null);
        tester.view.devicePixelRatio = 1;
        tester.view.physicalSize = platform == TargetPlatform.windows
            ? const Size(1440, 900)
            : const Size(412, 900);
        tester.view.padding = const FakeViewPadding(bottom: 24);
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        addTearDown(tester.view.resetPadding);
        await tester.pumpWidget(const SalapiyaApp());
        await tester.pumpAndSettle();
        final scroll = find.byKey(const PageStorageKey('destination-overview'));
        final dock = find.byKey(const ValueKey('floating-dock-surface'));
        final dockRect = platform == TargetPlatform.android
            ? tester.getRect(dock)
            : null;
        if (platform == TargetPlatform.windows) {
          expect(dock, findsNothing);
          expect(find.byType(ShellSidebar), findsOneWidget);
          expect(find.text('Create'), findsOneWidget);
        } else {
          expect(
            tester.getBottomLeft(scroll).dy,
            greaterThan(dockRect!.bottom),
          );
          expect(dockRect.bottom, lessThanOrEqualTo(900 - 24 - 16));
        }
        final controller = tester
            .widget<SingleChildScrollView>(scroll)
            .controller!;
        controller.jumpTo(controller.position.maxScrollExtent);
        await tester.pumpAndSettle();
        if (dockRect != null) expect(tester.getRect(dock), dockRect);
        expect(
          tester
              .getBottomLeft(find.textContaining('Next: interview on 23 Oct'))
              .dy,
          lessThan(dockRect?.top ?? tester.getBottomLeft(scroll).dy),
        );
        if (platform == TargetPlatform.android) {
          tester.view.viewInsets = const FakeViewPadding(bottom: 280);
          await tester.pumpAndSettle();
          expect(dock, findsNothing);
          tester.view.resetViewInsets();
          await tester.pumpAndSettle();
          expect(tester.getRect(dock), dockRect);
        }
        expect(tester.takeException(), isNull);
        debugDefaultTargetPlatformOverride = null;
      },
    );
  }
}
