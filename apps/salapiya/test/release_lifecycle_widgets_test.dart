import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/connected/lifecycle_view.dart';
import 'package:salapiya/design_system/theme.dart';
import 'package:salapiya/gallery/settings.dart';
import 'package:salapiya/local/local_profiles.dart';
import 'package:salapiya/local/local_runtime.dart';

import 'local_test_support.dart';
import 'local_money_journey.dart';
import 'p1_widgets_test.dart' show closeWithWidgetClock;

void main() {
  testWidgets(
    'reviewed offline local removal requires exact confirmation and keeps cancellation safe',
    releaseRemovalJourney,
  );
  testWidgets(
    'local removal remains reachable at 200 percent text',
    (tester) => releaseRemovalJourney(tester, scale: 2),
  );
}

Future<void> releaseRemovalJourney(
  WidgetTester tester, {
  double scale = 1,
}) async {
  final directory = (await tester.runAsync(
    () => Directory.systemTemp.createTemp('salapiya-removal-ui-'),
  ))!;
  final settings = GallerySettings();
  final runtime = LocalRuntime(
    LocalProfiles(directory, MemoryProfileVault()),
    settings,
  );
  await tester.runAsync(
    () => runtime.create('Synthetic local removal', ThemeMode.dark),
  );
  final owner = runtime.session!.localFinance.store.owner;
  try {
    await tester.pumpWidget(
      MaterialApp(
        theme: SalapiyaTheme.build(Brightness.dark),
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context)
              .copyWith(textScaler: TextScaler.linear(scale)),
          child: child!,
        ),
        home: Scaffold(
          body: SingleChildScrollView(
            child: ListenableBuilder(
              listenable: runtime,
              builder: (context, _) => runtime.session == null
                  ? const Text('Local profile removed')
                  : DeviceLifecycleView(runtime: runtime),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Remove local profile'));
    await localTap(tester, find.text('Remove local profile'));
    await tester.pumpAndSettle();
    expect(
      find.descendant(
        of: find.byType(AlertDialog),
        matching: find.textContaining('local-only profile'),
      ),
      findsOneWidget,
    );
    expect(find.textContaining('Waiting work will be lost'), findsOneWidget);
    expect(
      tester
          .widget<FilledButton>(
            find.widgetWithText(FilledButton, 'Confirm removal'),
          )
          .onPressed,
      isNull,
    );
    await localTap(tester, find.text('Keep profile'));
    await tester.pumpAndSettle();
    expect(
      await tester.runAsync(
        () => File('${directory.path}/$owner.sqlite').exists(),
      ),
      true,
    );
    await localTap(tester, find.text('Remove local profile'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'REMOVE LOCAL');
    FocusManager.instance.primaryFocus?.unfocus();
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Confirm removal'));
    await localTap(tester, find.text('Confirm removal'));
    await tester.pump();
    final deadline = DateTime.now().add(const Duration(seconds: 30));
    while (runtime.session != null && DateTime.now().isBefore(deadline)) {
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 100)),
      );
      await tester.pump();
    }
    await tester.pumpAndSettle();
    expect(find.text('Local profile removed'), findsOneWidget);
    expect(
      await tester.runAsync(
        () => File('${directory.path}/$owner.sqlite').exists(),
      ),
      false,
    );
    expect(tester.takeException(), isNull);
  } finally {
    await tester.pumpWidget(const SizedBox.shrink());
    await closeWithWidgetClock(tester, runtime.close);
    runtime.dispose();
    settings.dispose();
    await tester.runAsync(() => directory.delete(recursive: true));
  }
}
