import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';

/// Reports actual layout after the frame, including OS text scaling.
class MeasureSize extends SingleChildRenderObjectWidget {
  const MeasureSize({super.key, required this.onChanged, required super.child});
  final ValueChanged<Size> onChanged;
  @override
  RenderObject createRenderObject(BuildContext context) =>
      _MeasureSize(onChanged);
  @override
  void updateRenderObject(BuildContext context, RenderObject renderObject) =>
      (renderObject as _MeasureSize).onChanged = onChanged;
}

class _MeasureSize extends RenderProxyBox {
  _MeasureSize(this.onChanged);
  ValueChanged<Size> onChanged;
  Size? previous;
  @override
  void performLayout() {
    super.performLayout();
    if (size == previous) return;
    previous = size;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (attached) onChanged(size);
    });
  }
}

/// Native horizontal paging without fixed card/row heights at enlarged text.
class MeasuredPageView extends StatefulWidget {
  const MeasuredPageView({
    super.key,
    required this.controller,
    required this.index,
    required this.itemCount,
    required this.itemBuilder,
    required this.onPageChanged,
  });
  final PageController controller;
  final int index, itemCount;
  final IndexedWidgetBuilder itemBuilder;
  final ValueChanged<int> onPageChanged;
  @override
  State<MeasuredPageView> createState() => _MeasuredPageViewState();
}

class _MeasuredPageViewState extends State<MeasuredPageView> {
  final heights = <int, double>{};
  @override
  Widget build(BuildContext context) => SizedBox(
    height:
        heights[widget.index] ?? MediaQuery.textScalerOf(context).scale(240),
    child: PageView.builder(
      controller: widget.controller,
      itemCount: widget.itemCount,
      onPageChanged: widget.onPageChanged,
      itemBuilder: (context, index) => OverflowBox(
        alignment: Alignment.topCenter,
        minHeight: 0,
        maxHeight: double.infinity,
        child: MeasureSize(
          onChanged: (size) {
            if (mounted && heights[index] != size.height) {
              setState(() => heights[index] = size.height);
            }
          },
          child: ExcludeFocus(
            excluding: index != widget.index,
            child: widget.itemBuilder(context, index),
          ),
        ),
      ),
    ),
  );
}

void selectPage(BuildContext context, PageController controller, int index) {
  if (MediaQuery.disableAnimationsOf(context)) {
    controller.jumpToPage(index);
  } else {
    controller.animateToPage(
      index,
      duration: const Duration(milliseconds: 180),
      curve: Curves.easeOutCubic,
    );
  }
}
