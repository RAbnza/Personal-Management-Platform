import 'package:flutter/material.dart';

import 'theme.dart';

/// Shared page sections: compact desktop panels, naturally stacked on phones.
class WorkspacePanel extends StatelessWidget {
  const WorkspacePanel({
    super.key,
    required this.child,
    this.title,
    this.caption,
    this.trailing,
  });
  final Widget child;
  final String? title, caption;
  final Widget? trailing;
  @override
  Widget build(BuildContext context) {
    final c = CraftTheme.of(context);
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: c.divider),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (title != null) ...[
            Wrap(
              alignment: WrapAlignment.spaceBetween,
              crossAxisAlignment: WrapCrossAlignment.center,
              spacing: 12,
              runSpacing: 8,
              children: [
                Text(title!, style: Theme.of(context).textTheme.titleMedium),
                ?trailing,
              ],
            ),
            if (caption != null)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(caption!, style: TextStyle(color: c.secondary)),
              ),
            const SizedBox(height: 16),
          ],
          child,
        ],
      ),
    );
  }
}

class WorkspaceTabs extends StatelessWidget {
  const WorkspaceTabs({
    super.key,
    required this.items,
    required this.selected,
    required this.onSelected,
  });
  final List<String> items;
  final String selected;
  final ValueChanged<String> onSelected;
  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.only(bottom: 20),
    decoration: BoxDecoration(
      border: Border(bottom: BorderSide(color: CraftTheme.of(context).divider)),
    ),
    child: Wrap(
      spacing: 4,
      runSpacing: 4,
      children: [
        for (final item in items)
          Semantics(
            selected: selected == item,
            child: TextButton(
              style: TextButton.styleFrom(
                foregroundColor: selected == item
                    ? CraftTheme.of(context).primary
                    : CraftTheme.of(context).secondary,
                backgroundColor: selected == item
                    ? CraftTheme.of(context).selection
                    : null,
              ),
              onPressed: () => onSelected(item),
              child: Text(item),
            ),
          ),
      ],
    ),
  );
}

class WorkspaceEmpty extends StatelessWidget {
  const WorkspaceEmpty({
    super.key,
    required this.title,
    required this.message,
    this.icon = Icons.inbox_outlined,
    this.action,
  });
  final String title, message;
  final IconData icon;
  final Widget? action;
  @override
  Widget build(BuildContext context) => WorkspacePanel(
    child: Padding(
      padding: const EdgeInsets.symmetric(vertical: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 28, color: CraftTheme.of(context).primary),
          const SizedBox(height: 14),
          Text(title, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 6),
          Text(
            message,
            style: TextStyle(color: CraftTheme.of(context).secondary),
          ),
          if (action != null) ...[const SizedBox(height: 16), action!],
        ],
      ),
    ),
  );
}

class WorkspaceHelp extends StatelessWidget {
  const WorkspaceHelp({super.key, required this.title, required this.text});
  final String title, text;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 8),
    child: ExpansionTile(
      key: PageStorageKey('workspace-help-$title'),
      tilePadding: EdgeInsets.zero,
      childrenPadding: const EdgeInsets.fromLTRB(0, 4, 0, 16),
      shape: const Border(),
      collapsedShape: const Border(),
      leading: Icon(
        Icons.info_outline,
        size: 18,
        color: CraftTheme.of(context).secondary,
      ),
      title: Text(title, style: Theme.of(context).textTheme.bodyMedium),
      children: [
        Align(
          alignment: Alignment.centerLeft,
          child: Text(
            text,
            style: TextStyle(color: CraftTheme.of(context).secondary),
          ),
        ),
      ],
    ),
  );
}

class WorkspaceActionGroup extends StatelessWidget {
  const WorkspaceActionGroup({
    super.key,
    required this.title,
    required this.description,
    required this.icon,
    required this.actions,
    required this.onSelected,
  });
  final String title, description;
  final IconData icon;
  final Map<String, String> actions;
  final ValueChanged<String> onSelected;
  @override
  Widget build(BuildContext context) => WorkspacePanel(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, color: CraftTheme.of(context).primary, size: 22),
        const SizedBox(height: 12),
        Text(title, style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 6),
        ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 44),
          child: Text(
            description,
            style: TextStyle(color: CraftTheme.of(context).secondary),
          ),
        ),
        const SizedBox(height: 14),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            FilledButton.tonal(
              onPressed: () => onSelected(actions.keys.first),
              child: Text(actions.values.first),
            ),
            if (actions.length > 1)
              PopupMenuButton<String>(
                tooltip: '$title actions',
                onSelected: onSelected,
                itemBuilder: (_) => [
                  for (final a in actions.entries.skip(1))
                    PopupMenuItem(value: a.key, child: Text(a.value)),
                ],
                child: const Padding(
                  padding: EdgeInsets.all(12),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text('More'),
                      SizedBox(width: 6),
                      Icon(Icons.expand_more, size: 18),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ],
    ),
  );
}

class WorkspaceGrid extends StatelessWidget {
  const WorkspaceGrid({
    super.key,
    required this.children,
    this.minWidth = 260,
    this.matchRowHeights = false,
  });
  final List<Widget> children;
  final double minWidth;

  /// Opt in for small metric groups. Rows grow to their tallest content, including
  /// at larger text scales, without imposing a fixed height on any card.
  final bool matchRowHeights;
  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, b) {
      final scale = MediaQuery.textScalerOf(context).scale(14) / 14;
      final columns = (b.maxWidth / (minWidth * scale)).floor().clamp(
        1,
        children.length.clamp(1, 4),
      );
      if (matchRowHeights) {
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (var start = 0; start < children.length; start += columns) ...[
              if (start > 0) const SizedBox(height: 16),
              IntrinsicHeight(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    for (var column = 0; column < columns; column++) ...[
                      if (column > 0) const SizedBox(width: 16),
                      Expanded(
                        child: start + column < children.length
                            ? children[start + column]
                            : const SizedBox.shrink(),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ],
        );
      }
      return Wrap(
        spacing: 16,
        runSpacing: 16,
        children: [
          for (final child in children)
            SizedBox(
              width: (b.maxWidth - (columns - 1) * 16) / columns,
              child: child,
            ),
        ],
      );
    },
  );
}

/// One visual contract for the existing reviewed, durable form controllers.
class WorkspaceForm extends StatelessWidget {
  const WorkspaceForm({super.key, required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context) => Align(
    alignment: Alignment.topCenter,
    child: ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 760),
      child: WorkspacePanel(child: child),
    ),
  );
}

class WorkspaceSteps extends StatelessWidget {
  const WorkspaceSteps({super.key, required this.active});
  final int active;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 24),
    child: Wrap(
      spacing: 20,
      runSpacing: 10,
      children: [
        for (final (index, label) in const [
          'Details',
          'Review',
          'Result',
        ].indexed)
          Semantics(
            selected: active == index,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                CircleAvatar(
                  radius: 12,
                  backgroundColor: active == index
                      ? CraftTheme.of(context).selection
                      : CraftTheme.of(context).subtle,
                  child: Text(
                    '${index + 1}',
                    style: TextStyle(
                      fontSize: 11,
                      color: active == index
                          ? CraftTheme.of(context).primary
                          : CraftTheme.of(context).secondary,
                    ),
                  ),
                ),
                const SizedBox(width: 7),
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 12,
                    color: active == index
                        ? CraftTheme.of(context).text
                        : CraftTheme.of(context).secondary,
                    fontWeight: active == index
                        ? FontWeight.w600
                        : FontWeight.w400,
                  ),
                ),
              ],
            ),
          ),
      ],
    ),
  );
}

class WorkspacePager extends StatelessWidget {
  const WorkspacePager({
    super.key,
    required this.count,
    required this.page,
    required this.onPage,
    this.pageSize = 12,
  });
  final int count, page, pageSize;
  final ValueChanged<int> onPage;
  @override
  Widget build(BuildContext context) {
    if (count <= pageSize) return const SizedBox.shrink();
    final pages = (count + pageSize - 1) ~/ pageSize;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 16),
      child: Wrap(
        spacing: 12,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          Text('$count records · page ${page + 1} of $pages'),
          OutlinedButton(
            onPressed: page == 0 ? null : () => onPage(page - 1),
            child: const Text('Previous'),
          ),
          OutlinedButton(
            onPressed: page + 1 >= pages ? null : () => onPage(page + 1),
            child: const Text('Next'),
          ),
        ],
      ),
    );
  }
}

/// Routes wait for protected draft writes before leaving; failed writes keep
/// the form open. A form without draft storage requires explicit discard.
class FormExitGuard extends StatefulWidget {
  const FormExitGuard({
    super.key,
    required this.child,
    required this.dirty,
    required this.busy,
    this.keepDraft,
  });
  final Widget child;
  final bool dirty, busy;
  final Future<void> Function()? keepDraft;
  @override
  State<FormExitGuard> createState() => _FormExitGuardState();
}

class _FormExitGuardState extends State<FormExitGuard> {
  bool leaving = false, allowed = false;
  Future<void> leave() async {
    if (leaving || widget.busy) return;
    leaving = true;
    try {
      final yes = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text(
            widget.keepDraft == null
                ? 'Discard your changes?'
                : 'Keep this draft for later?',
          ),
          content: Text(
            widget.keepDraft == null
                ? 'Leaving will discard this unfinished form. Nothing has been posted.'
                : 'Your unfinished form stays encrypted on this device. It is not a posted action.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Keep editing'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: Text(
                widget.keepDraft == null
                    ? 'Discard changes'
                    : 'Keep draft & close',
              ),
            ),
          ],
        ),
      );
      if (yes != true) return;
      await widget.keepDraft?.call();
      if (!mounted) return;
      setState(() => allowed = true);
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) Navigator.of(context).pop();
      });
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Your draft could not be saved. Keep this form open and check storage.',
            ),
          ),
        );
      }
    } finally {
      leaving = false;
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !widget.busy && (allowed || !widget.dirty),
    onPopInvokedWithResult: (didPop, _) {
      if (!didPop) leave();
    },
    child: widget.child,
  );
}

Future<bool> confirmDiscard(BuildContext context) async =>
    await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Discard your changes?'),
        content: const Text(
          'This removes the unfinished form. Nothing will be posted.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Keep editing'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Discard changes'),
          ),
        ],
      ),
    ) ??
    false;
