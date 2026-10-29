import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'craft.dart';
import 'theme.dart';

/// Caller-owned actions: this component knows nothing about finance or routing.
@immutable
class FloatingQuickAction {
  const FloatingQuickAction({
    required this.label,
    required this.icon,
    required this.onSelected,
  });
  final String label;
  final IconData icon;
  final VoidCallback onSelected;
}

/// The caller reserves space for the trigger in a dock or command bar.
/// The menu owns only its transient modal route.
class FloatingActionMenu extends StatefulWidget {
  const FloatingActionMenu({super.key, required this.actions});
  final List<FloatingQuickAction> actions;

  @override
  State<FloatingActionMenu> createState() => _FloatingActionMenuState();
}

class _FloatingActionMenuState extends State<FloatingActionMenu> {
  final _trigger = GlobalKey();
  final _focus = FocusNode(debugLabel: 'Quick actions trigger');
  bool _open = false;

  @override
  void dispose() {
    _focus.dispose();
    super.dispose();
  }

  Future<void> _show() async {
    if (_open || widget.actions.isEmpty) return;
    final navigator = Navigator.of(context, rootNavigator: true);
    final overlay = navigator.overlay!.context.findRenderObject()! as RenderBox;
    final box = _trigger.currentContext!.findRenderObject()! as RenderBox;
    final anchor = box.localToGlobal(Offset.zero, ancestor: overlay) & box.size;
    final actions = List<FloatingQuickAction>.unmodifiable(widget.actions);
    final route = _ActionRoute(
      anchor: anchor,
      actions: actions,
      reduceMotion: MediaQuery.disableAnimationsOf(context),
      scrim: CraftTheme.of(context).modalScrim,
      barrierText: MaterialLocalizations.of(context).modalBarrierDismissLabel,
    );
    setState(() => _open = true);
    final selected = await navigator.push<int>(route);
    // Wait for reverse motion and barrier removal before restoring focus or
    // invoking the caller. A fast second tap cannot open another route meanwhile.
    await route.completed;
    if (!mounted) return;
    setState(() => _open = false);
    _focus.requestFocus();
    if (selected != null) actions[selected].onSelected();
  }

  @override
  Widget build(BuildContext context) => Semantics(
    expanded: _open,
    child: IconButton.filled(
      key: _trigger,
      focusNode: _focus,
      tooltip: 'Quick actions',
      style: _triggerStyle(context),
      onPressed: widget.actions.isEmpty ? null : _show,
      icon: const Icon(Icons.add),
    ),
  );
}

ButtonStyle _triggerStyle(BuildContext context) {
  final c = CraftTheme.of(context);
  return IconButton.styleFrom(
    minimumSize: const Size(56, 56),
    backgroundColor: c.primary,
    foregroundColor: c.onPrimary,
    shape: const CircleBorder(),
  ).copyWith(
    side: WidgetStateProperty.resolveWith(
      (states) => states.contains(WidgetState.focused)
          ? BorderSide(color: c.onPrimary, width: 3)
          : BorderSide(color: c.primary),
    ),
  );
}

class _ActionRoute extends PopupRoute<int> {
  _ActionRoute({
    required this.anchor,
    required this.actions,
    required this.reduceMotion,
    required this.scrim,
    required this.barrierText,
  }) : super(
         requestFocus: true,
         traversalEdgeBehavior: TraversalEdgeBehavior.closedLoop,
         settings: const RouteSettings(name: 'floating-quick-actions'),
       );

  final Rect anchor;
  final List<FloatingQuickAction> actions;
  final bool reduceMotion;
  final Color scrim;
  final String barrierText;
  bool _closing = false;

  @override
  Duration get transitionDuration =>
      reduceMotion ? Duration.zero : Space.menuDuration;
  @override
  Color get barrierColor => scrim;
  @override
  bool get barrierDismissible => true;
  @override
  String get barrierLabel => barrierText;

  void close([int? index]) {
    if (_closing || !isCurrent) return;
    navigator!.pop(index);
  }

  @override
  bool didPop(int? result) {
    _closing = true;
    return super.didPop(result);
  }

  @override
  Widget buildPage(
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
  ) => Shortcuts(
    shortcuts: const {
      SingleActivator(LogicalKeyboardKey.escape): DismissIntent(),
    },
    child: Actions(
      actions: {
        DismissIntent: CallbackAction<DismissIntent>(
          onInvoke: (_) {
            close();
            return null;
          },
        ),
      },
      child: Semantics(
        scopesRoute: true,
        namesRoute: true,
        explicitChildNodes: true,
        label: 'Quick actions',
        child: LayoutBuilder(
          builder: (context, bounds) {
            final media = MediaQuery.of(context);
            final left = media.padding.left + 12;
            final right = bounds.maxWidth - media.padding.right - 12;
            final top = media.padding.top + 12;
            final bottom =
                bounds.maxHeight -
                math.max(media.padding.bottom, media.viewInsets.bottom) -
                12;
            final width = math.min(360.0, math.max(0.0, right - left));
            // Measure labels with the actual text scale; no fixed row heights or
            // clipped labels. Allow a header and frame padding in the estimate.
            var listHeight = 64.0 + media.textScaler.scale(20) * 1.4;
            for (final action in actions) {
              final text = TextPainter(
                text: TextSpan(
                  text: action.label,
                  style: Theme.of(context).textTheme.labelLarge,
                ),
                textDirection: Directionality.of(context),
                textScaler: media.textScaler,
              )..layout(maxWidth: math.max(1, width - 88));
              listHeight += math.max(48, text.height + 24) + 4;
              text.dispose();
            }
            final anchored =
                media.viewInsets.bottom == 0 &&
                anchor.bottom <= bottom &&
                anchor.left >= left &&
                anchor.right - left >= width &&
                anchor.right <= right &&
                anchor.top - top >= listHeight + 12;
            final menuRight = anchored ? right - anchor.right : 0.0;
            final menuBottom = anchored ? bottom - anchor.top + 12 : 68.0;
            final available = math.max(0.0, bottom - top - menuBottom);
            return Stack(
              children: [
                Positioned(
                  left: left,
                  right: bounds.maxWidth - right,
                  top: top,
                  bottom: bounds.maxHeight - bottom,
                  child: Stack(
                    children: [
                      Positioned(
                        right: menuRight,
                        bottom: menuBottom,
                        width: width,
                        child: ConstrainedBox(
                          constraints: BoxConstraints(maxHeight: available),
                          child: LatticeFrame(
                            key: ValueKey(
                              anchored
                                  ? 'quick-actions-menu'
                                  : 'quick-actions-sheet',
                            ),
                            raised: true,
                            padding: const EdgeInsets.all(12),
                            child: Material(
                              type: MaterialType.transparency,
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  Flexible(
                                    child: SingleChildScrollView(
                                      primary: false,
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.stretch,
                                        children: [
                                          Padding(
                                            padding: const EdgeInsets.all(8),
                                            child: Text(
                                              'Quick actions',
                                              style: Theme.of(context)
                                                  .textTheme
                                                  .titleMedium,
                                            ),
                                          ),
                                          for (
                                            var i = 0;
                                            i < actions.length;
                                            i++
                                          )
                                            Padding(
                                              padding: const EdgeInsets.only(
                                                bottom: 4,
                                              ),
                                              child: TextButton(
                                                onPressed: () => close(i),
                                                style: TextButton.styleFrom(
                                                  alignment:
                                                      Alignment.centerLeft,
                                                  padding: const EdgeInsets.all(
                                                    12,
                                                  ),
                                                  backgroundColor:
                                                      CraftTheme.of(context)
                                                          .subtle,
                                                ),
                                                child: Row(
                                                  children: [
                                                    Icon(
                                                      actions[i].icon,
                                                      size: 24,
                                                    ),
                                                    const SizedBox(width: 12),
                                                    Expanded(
                                                      child: Text(
                                                        actions[i].label,
                                                      ),
                                                    ),
                                                  ],
                                                ),
                                              ),
                                            ),
                                        ],
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
                      Positioned(
                        right: menuRight,
                        bottom: anchored ? bottom - anchor.bottom : 0,
                        child: Semantics(
                          expanded: true,
                          child: IconButton.filled(
                            autofocus: true,
                            tooltip: 'Close quick actions',
                            style: _triggerStyle(context),
                            onPressed: close,
                            icon: const Icon(Icons.close),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            );
          },
        ),
      ),
    ),
  );

  @override
  Widget buildTransitions(
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child,
  ) {
    if (reduceMotion) return child;
    return AnimatedBuilder(
      animation: animation,
      child: child,
      builder: (context, child) {
        final value = Curves.easeOutCubic.transform(animation.value);
        // SDK barriers stop hit testing during reverse transitions. Keep this
        // full-viewport shield outside the route's IgnorePointer until removal.
        return AbsorbPointer(
          absorbing: _closing,
          child: Opacity(
            opacity: value,
            child: Transform.translate(
              offset: Offset(0, 4 * (1 - value)),
              child: child,
            ),
          ),
        );
      },
    );
  }
}
