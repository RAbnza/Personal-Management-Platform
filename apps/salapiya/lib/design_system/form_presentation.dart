import 'package:flutter/material.dart';

import 'theme.dart';

/// Transport state is supplied separately from the local-save outcome.
class FormSyncStatus extends StatelessWidget {
  const FormSyncStatus({super.key, required this.state});
  final String? state;
  @override
  Widget build(BuildContext context) => FormStatus(
    title: switch (state) {
      'pending' => 'Waiting for synchronization',
      'accepted' => 'Accepted by the service',
      'reconciled' => 'Synchronized',
      'review' => 'Server change needs review',
      'restored' => 'Current authority needs review',
      _ => 'Check synchronization status',
    },
    message: switch (state) {
      'pending' => 'Saved locally. Server acceptance is still pending.',
      'accepted' => 'Awaiting current download and reconciliation.',
      'reconciled' => 'Accepted evidence has been downloaded and reconciled.',
      'review' => 'The requested change was not accepted. Original intent is retained; review current history.',
      'restored' => 'Original intent is retained. Current receipts and authority must be checked before resuming.',
      _ => 'A local save alone does not confirm server acceptance or current download.',
    },
    tone: state == 'reconciled' ? NoticeTone.success : NoticeTone.warning,
  );
}

/// Presentation only: callers supply the authoritative outcome and recovery.
class FormStatus extends StatelessWidget {
  const FormStatus({
    super.key,
    required this.title,
    required this.message,
    this.tone = NoticeTone.information,
    this.busy = false,
  });
  final String title, message;
  final NoticeTone tone;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final (ink, surface) = CraftTheme.of(context).tone(tone);
    return Semantics(
      liveRegion: true,
      child: Container(
        margin: const EdgeInsets.only(bottom: 20),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: surface,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 40,
              height: 40,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: ink.withValues(alpha: .10),
                shape: BoxShape.circle,
              ),
              child: busy
                  ? SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: ink,
                      ),
                    )
                  : Icon(
                      switch (tone) {
                        NoticeTone.success => Icons.check_rounded,
                        NoticeTone.error => Icons.error_outline,
                        NoticeTone.warning => Icons.pending_actions_outlined,
                        _ => Icons.info_outline,
                      },
                      color: ink,
                      size: 26,
                    ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: Theme.of(context).textTheme.titleLarge
                        ?.copyWith(color: ink),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    message,
                    style: TextStyle(color: CraftTheme.of(context).text),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Label/value rhythm that stacks before either column becomes hard to read.
class ReviewRow extends StatelessWidget {
  const ReviewRow(
    this.label,
    this.value, {
    super.key,
    this.detail,
    this.emphasis = false,
  });
  final String label, value;
  final String? detail;
  final bool emphasis;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 10),
    child: LayoutBuilder(
      builder: (context, bounds) {
        final labelWidget = Text(
          label,
          style: TextStyle(color: CraftTheme.of(context).secondary),
        );
        final valueWidget = Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              value.isEmpty ? 'Not provided' : value,
              style: emphasis
                  ? Theme.of(context).textTheme.titleLarge
                  : const TextStyle(fontWeight: FontWeight.w600),
            ),
            if (detail != null) ...[
              const SizedBox(height: 4),
              Text(
                detail!,
                style: Theme.of(context).textTheme.bodySmall
                    ?.copyWith(color: CraftTheme.of(context).secondary),
              ),
            ],
          ],
        );
        if (bounds.maxWidth < 460 ||
            MediaQuery.textScalerOf(context).scale(14) > 21) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [labelWidget, const SizedBox(height: 4), valueWidget],
          );
        }
        return Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(flex: 2, child: labelWidget),
            const SizedBox(width: 20),
            Expanded(flex: 3, child: valueWidget),
          ],
        );
      },
    ),
  );
}

class FormEvidence extends StatelessWidget {
  const FormEvidence({
    super.key,
    required this.children,
    this.title = 'Technical details',
  });
  final List<Widget> children;
  final String title;
  @override
  Widget build(BuildContext context) => ExpansionTile(
    key: PageStorageKey('form-evidence-$title'),
    tilePadding: EdgeInsets.zero,
    childrenPadding: const EdgeInsets.only(bottom: 16),
    shape: const Border(),
    collapsedShape: const Border(),
    leading: Icon(
      Icons.receipt_long_outlined,
      size: 20,
      color: CraftTheme.of(context).secondary,
    ),
    title: Text(title, style: Theme.of(context).textTheme.bodyMedium),
    children: [
      for (final (index, child) in children.indexed)
        Padding(
          key: PageStorageKey('evidence-item-$index'),
          padding: const EdgeInsets.only(bottom: 8),
          child: Align(alignment: Alignment.centerLeft, child: child),
        ),
    ],
  );
}

class ReviewNotes extends StatelessWidget {
  const ReviewNotes(this.notes, {super.key});
  final Iterable<String> notes;
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      for (final note in notes)
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(
                Icons.info_outline,
                size: 18,
                color: CraftTheme.of(context).secondary,
              ),
              const SizedBox(width: 10),
              Expanded(child: Text(note)),
            ],
          ),
        ),
    ],
  );
}
