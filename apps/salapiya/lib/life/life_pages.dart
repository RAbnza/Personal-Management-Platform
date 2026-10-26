import 'package:flutter/material.dart';

class LifePages extends StatefulWidget {
  const LifePages({super.key, required this.count, required this.itemBuilder});
  final int count;
  final IndexedWidgetBuilder itemBuilder;
  @override
  State<LifePages> createState() => _LifePagesState();
}

class _LifePagesState extends State<LifePages> {
  int page = 0;
  @override
  Widget build(BuildContext context) {
    final pages = ((widget.count + 24) ~/ 25).clamp(1, 100000),
        current = page.clamp(0, pages - 1);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (
          var i = current * 25;
          i < widget.count && i < (current + 1) * 25;
          i++
        )
          widget.itemBuilder(context, i),
        if (widget.count > 25)
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              TextButton(
                onPressed: current == 0
                    ? null
                    : () => setState(() => page = current - 1),
                child: const Text('Previous records'),
              ),
              Text('Page ${current + 1} / $pages'),
              TextButton(
                onPressed: current + 1 >= pages
                    ? null
                    : () => setState(() => page = current + 1),
                child: const Text('Next records'),
              ),
            ],
          ),
      ],
    );
  }
}
