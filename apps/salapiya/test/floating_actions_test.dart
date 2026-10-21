import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/app.dart';
import 'package:salapiya/design_system/craft.dart';
import 'package:salapiya/design_system/floating_actions.dart';
import 'package:salapiya/design_system/theme.dart';
import 'package:salapiya/gallery/settings.dart';

Widget harness({
  VoidCallback? action,
  VoidCallback? background,
  bool reduced = false,
  double scale = 1,
  double keyboard = 0,
  Brightness brightness = Brightness.light,
}) => MaterialApp(
  theme: SalapiyaTheme.build(brightness),
  builder: (context, child) => MediaQuery(
    data: MediaQuery.of(context).copyWith(
      disableAnimations: reduced,
      textScaler: TextScaler.linear(scale),
      padding: const EdgeInsets.only(top: 24, bottom: 24),
      viewInsets: EdgeInsets.only(bottom: keyboard),
    ),
    child: child!,
  ),
  home: Scaffold(
    body: SafeArea(
      child: Stack(
        children: [
          Align(
            alignment: Alignment.topLeft,
            child: TextButton(
              onPressed: background ?? () {},
              child: const Text('Background destination'),
            ),
          ),
          Positioned(
            right: 16,
            bottom: 24,
            child: FloatingActionMenu(
              actions: [
                for (final label in [
                  'Add expense',
                  'Record income',
                  'Transfer money',
                  'Record debt payment',
                  'Add shared expense',
                  'Add task',
                ])
                  FloatingQuickAction(
                    label: label,
                    icon: Icons.add_circle_outline,
                    onSelected: action ?? () {},
                  ),
              ],
            ),
          ),
        ],
      ),
    ),
  ),
);

void main() {
  testWidgets(
    'lattice default, both themes and optional effects preserve content',
    (tester) async {
      final settings = GallerySettings();
      await tester.pumpWidget(SalapiyaApp(settings: settings));
      await tester.pumpAndSettle();
      expect(find.text('Luminous Lattice'), findsOneWidget);
      expect(
        tester
            .widgetList<CraftMotif>(find.byType(CraftMotif))
            .every((m) => m.lattice),
        isTrue,
      );
      for (final mode in [ThemeMode.dark, ThemeMode.light]) {
        settings.change(() {
          settings.themeMode = mode;
          settings.effects = false;
        });
        await tester.pumpAndSettle();
        final frame = find.byType(LatticeFrame).first;
        final surface = tester.widget<Container>(
          find.descendant(of: frame, matching: find.byType(Container)).first,
        );
        expect(surface.child, isA<Padding>());
        expect(find.text('Made with care.\nClear by design.'), findsOneWidget);
        expect(tester.takeException(), isNull);
      }
    },
  );

  testWidgets(
    'plus opens one modal, outside blocks destination then restores focus',
    (tester) async {
      var background = 0;
      await tester.pumpWidget(harness(background: () => background++));
      final trigger = find.byTooltip('Quick actions');
      final origin = tester
          .widget<IconButton>(find.byType(IconButton))
          .focusNode!;
      origin.requestFocus();
      final point = tester.getCenter(trigger);
      await tester.tap(trigger);
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('quick-actions-menu')), findsOneWidget);
      expect(find.text('Add expense'), findsOneWidget);
      expect(find.byType(ModalBarrier), findsWidgets);
      final barrier = tester.widget<ModalBarrier>(
        find.byType(ModalBarrier).last,
      );
      expect(barrier.color!.a, greaterThan(0));
      await tester.tapAt(
        tester.getCenter(
          find.text('Background destination', skipOffstage: false),
        ),
      );
      await tester.pumpAndSettle();
      expect(background, 0);
      expect(find.text('Add expense'), findsNothing);
      expect(origin.hasFocus, isTrue);
      await tester.tapAt(point);
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Close quick actions'));
      await tester.pumpAndSettle();
      expect(origin.hasFocus, isTrue);
    },
  );

  testWidgets(
    'Back, Escape, repeated trigger and duplicate selection are safe',
    (tester) async {
      var selected = 0;
      await tester.pumpWidget(harness(action: () => selected++));
      for (final back in [true, false]) {
        await tester.tap(find.byTooltip('Quick actions'));
        await tester.pumpAndSettle();
        if (back) {
          await tester.binding.handlePopRoute();
        } else {
          await tester.sendKeyEvent(LogicalKeyboardKey.escape);
        }
        await tester.pumpAndSettle();
        expect(find.text('Add expense'), findsNothing);
        expect(find.byTooltip('Quick actions'), findsOneWidget);
      }
      final point = tester.getCenter(find.byTooltip('Quick actions'));
      await tester.tapAt(point);
      await tester.tapAt(point);
      await tester.pumpAndSettle();
      expect(find.text('Add expense'), findsOneWidget);
      final actionPoint = tester.getCenter(find.text('Add expense'));
      await tester.tapAt(actionPoint);
      await tester.tapAt(actionPoint);
      await tester.pumpAndSettle();
      expect(selected, 1);
      expect(find.text('Add expense'), findsNothing);
    },
  );

  testWidgets('modal focus traversal, semantics and labeled 48px targets', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    await tester.pumpWidget(harness());
    expect(
      tester
          .getSemantics(find.byType(FloatingActionMenu))
          .getSemanticsData()
          .flagsCollection
          .isExpanded
          .toBoolOrNull(),
      isFalse,
    );
    await tester.tap(find.byTooltip('Quick actions'));
    await tester.pumpAndSettle();
    final labels = <String>[];
    void collect(SemanticsNode node) {
      labels.add(node.label);
      if (node.label == 'Close quick actions') {
        expect(
          node.getSemanticsData().flagsCollection.isExpanded.toBoolOrNull(),
          isTrue,
        );
      }
      node.visitChildren((child) {
        collect(child);
        return true;
      });
    }

    collect(
      tester
          .binding
          .renderViews
          .first
          .owner!
          .semanticsOwner!
          .rootSemanticsNode!,
    );
    expect(labels.join(' '), isNot(contains('Background destination')));
    expect(labels.join(' '), contains('Add expense'));
    for (var i = 0; i < 16; i++) {
      await tester.sendKeyEvent(LogicalKeyboardKey.tab);
      await tester.pump();
      final focusContext = FocusManager.instance.primaryFocus!.context!;
      expect(
        ModalRoute.of(focusContext)!.settings.name,
        'floating-quick-actions',
      );
    }
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
    await tester.sendKeyEvent(LogicalKeyboardKey.escape);
    await tester.pumpAndSettle();
    semantics.dispose();
  });

  testWidgets('reverse dismissal consumes taps until the scrim is gone', (
    tester,
  ) async {
    var background = 0;
    await tester.pumpWidget(harness(background: () => background++));
    final point = tester.getCenter(find.text('Background destination'));
    await tester.tap(find.byTooltip('Quick actions'));
    await tester.pumpAndSettle();
    await tester.tapAt(point);
    await tester.pump(const Duration(milliseconds: 30));
    await tester.tapAt(point);
    await tester.pumpAndSettle();
    expect(background, 0);
    await tester.tapAt(point);
    await tester.pumpAndSettle();
    expect(background, 1);
  });

  testWidgets('rapid outside dismissal does not pop the underlying page', (
    tester,
  ) async {
    await tester.pumpWidget(harness());
    final nav = Navigator.of(tester.element(find.byType(FloatingActionMenu)));
    nav.push(
      MaterialPageRoute<void>(
        builder: (context) => Scaffold(
          body: Column(
            children: [
              const Text('Second page'),
              FloatingActionMenu(
                actions: [
                  FloatingQuickAction(
                    label: 'Add task',
                    icon: Icons.add,
                    onSelected: () {},
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Quick actions'));
    await tester.pumpAndSettle();
    await tester.tapAt(const Offset(10, 300));
    await tester.tapAt(const Offset(10, 300));
    await tester.pumpAndSettle();
    expect(find.text('Second page'), findsOneWidget);
    expect(find.text('Add task'), findsNothing);
  });

  testWidgets('scrolled navigation comparison survives section revisit', (
    tester,
  ) async {
    final settings = GallerySettings()..section = GallerySection.navigation;
    await tester.pumpWidget(SalapiyaApp(settings: settings));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Android A · historical comparison'));
    await tester.tap(find.text('Android A · historical comparison'));
    await tester.pumpAndSettle();
    settings.change(() => settings.section = GallerySection.finance);
    await tester.pumpAndSettle();
    settings.change(() => settings.section = GallerySection.navigation);
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'reduced motion opens and dismisses immediately without translation',
    (tester) async {
      await tester.pumpWidget(harness(reduced: true));
      await tester.tap(find.byTooltip('Quick actions'));
      await tester.pump();
      final route = ModalRoute.of(tester.element(find.text('Add expense')))!;
      expect(route.animation!.value, 1);
      expect(route.transitionDuration, Duration.zero);
      await tester.tap(find.byTooltip('Close quick actions'));
      await tester.pump();
      expect(find.text('Add expense'), findsNothing);
    },
  );

  for (final size in [
    const Size(320, 568),
    const Size(800, 360),
    const Size(640, 480),
    const Size(1600, 900),
  ]) {
    for (final scale in [1.0, 2.0]) {
      testWidgets('menu reachable $size text $scale, keyboard and themes', (
        tester,
      ) async {
        tester.view.physicalSize = size;
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        for (final brightness in Brightness.values) {
          for (final keyboard in [0.0, size.height * .4]) {
            await tester.pumpWidget(
              harness(scale: scale, keyboard: keyboard, brightness: brightness),
            );
            await tester.tap(find.byTooltip('Quick actions'));
            await tester.pumpAndSettle();
            final close = tester.getRect(find.byTooltip('Close quick actions'));
            expect(close.bottom, lessThanOrEqualTo(size.height - keyboard));
            expect(close.top, greaterThanOrEqualTo(24));
            await tester.ensureVisible(find.text('Add task'));
            await tester.pumpAndSettle();
            final last = tester.getRect(find.text('Add task'));
            expect(last.top, greaterThanOrEqualTo(24));
            expect(last.bottom, lessThanOrEqualTo(close.top));
            expect(tester.takeException(), isNull);
            await tester.tap(find.text('Add task'));
            await tester.pumpAndSettle();
          }
        }
      });
    }
  }
}
