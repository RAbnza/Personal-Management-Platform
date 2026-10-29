import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/app.dart';
import 'package:salapiya/design_system/theme.dart';
import 'package:salapiya/design_system/workspace.dart';

void main() {
  testWidgets(
    'desktop commands replace the floating dock and remain keyboard accessible',
    (tester) async {
      debugDefaultTargetPlatformOverride = TargetPlatform.windows;

      tester.view.physicalSize = const Size(1440, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(const SalapiyaApp());
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('floating-dock-surface')), findsNothing);
      await tester.tap(find.byTooltip('Quick actions'));
      await tester.pumpAndSettle();
      expect(find.text('Transfer money'), findsOneWidget);
      await tester.sendKeyEvent(LogicalKeyboardKey.escape);
      await tester.pumpAndSettle();
      expect(find.text('Transfer money'), findsNothing);
      expect(tester.takeException(), isNull);
      debugDefaultTargetPlatformOverride = null;
    },
  );

  testWidgets(
    'help expansion never reads the parent scroll offset as its state',
    (tester) async {
      final scroll = ScrollController();
      addTearDown(scroll.dispose);
      Widget page(bool show) => MaterialApp(
        theme: SalapiyaTheme.build(Brightness.light),
        home: Scaffold(
          body: SingleChildScrollView(
            key: const PageStorageKey('destination-regression'),
            controller: scroll,
            child: Column(
              children: [
                const SizedBox(height: 600),
                if (show)
                  const WorkspaceHelp(
                    title: 'Card accounting',
                    text: 'Card credit is not cash.',
                  ),
                const SizedBox(height: 600),
              ],
            ),
          ),
        ),
      );
      await tester.pumpWidget(page(false));
      scroll.jumpTo(300);
      await tester.pumpAndSettle();
      await tester.pumpWidget(page(true));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      debugDefaultTargetPlatformOverride = null;
    },
  );

  testWidgets(
    'failed protected draft save prevents exit; successful retry closes without posting',
    (tester) async {
      var fail = true, writes = 0;
      final nav = GlobalKey<NavigatorState>();
      await tester.pumpWidget(
        MaterialApp(
          navigatorKey: nav,
          theme: SalapiyaTheme.build(Brightness.light),
          home: const Scaffold(body: Text('Home')),
        ),
      );
      nav.currentState!.push(
        MaterialPageRoute<void>(
          builder: (_) => FormExitGuard(
            dirty: true,
            busy: false,
            keepDraft: () async {
              writes++;
              if (fail) throw StateError('Synthetic storage failure');
            },
            child: const Scaffold(body: Text('Unposted form')),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await nav.currentState!.maybePop();
      await tester.pumpAndSettle();
      await tester.tap(find.text('Keep editing'));
      await tester.pumpAndSettle();
      expect(writes, 0);
      await nav.currentState!.maybePop();
      await tester.pumpAndSettle();
      await tester.tap(find.text('Keep draft & close'));
      await tester.pumpAndSettle();
      expect(find.text('Unposted form'), findsOneWidget);
      expect(writes, 1);
      fail = false;
      await nav.currentState!.maybePop();
      await tester.pumpAndSettle();
      await tester.tap(find.text('Keep draft & close'));
      await tester.pumpAndSettle();
      expect(find.text('Home'), findsOneWidget);
      expect(writes, 2);
      expect(tester.takeException(), isNull);
      debugDefaultTargetPlatformOverride = null;
    },
  );

  testWidgets(
    'task menus retain secondary commands at narrow width and 200 percent text',
    (tester) async {
      debugDefaultTargetPlatformOverride = TargetPlatform.android;

      tester.view.physicalSize = const Size(320, 800);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      String? chosen;
      await tester.pumpWidget(
        MaterialApp(
          theme: SalapiyaTheme.build(Brightness.dark),
          home: MediaQuery(
            data: const MediaQueryData(textScaler: TextScaler.linear(2)),
            child: Scaffold(
              body: SingleChildScrollView(
                child: WorkspaceActionGroup(
                  title: 'Statements',
                  description: 'Provider evidence for your card.',
                  icon: Icons.description_outlined,
                  actions: const {
                    'statement': 'Record statement',
                    'link': 'Link activity',
                    'allocate': 'Allocate payment',
                  },
                  onSelected: (v) => chosen = v,
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Statements actions'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Allocate payment'));
      await tester.pumpAndSettle();
      expect(chosen, 'allocate');
      expect(tester.takeException(), isNull);
      debugDefaultTargetPlatformOverride = null;
    },
  );
}
