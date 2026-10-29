import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../design_system/components.dart';
import '../design_system/theme.dart';
import '../prototype/fixtures.dart';

enum ReviewPresentation { dialog, sheet, panel }

Future<void> openReview(
  BuildContext context,
  ReviewPresentation presentation,
) async {
  final focus = FocusManager.instance.primaryFocus;
  final reduce = MediaQuery.disableAnimationsOf(context);
  final editor = DemoReviewEditor(presentation: presentation);
  if (presentation == ReviewPresentation.sheet) {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      isDismissible: false,
      enableDrag: false,
      sheetAnimationStyle: reduce
          ? AnimationStyle.noAnimation
          : const AnimationStyle(duration: Duration(milliseconds: 200)),
      builder: (_) => editor,
    );
  } else {
    await showGeneralDialog<void>(
      context: context,
      barrierDismissible: false,
      barrierLabel: 'Review specimen',
      transitionDuration: reduce
          ? Duration.zero
          : const Duration(milliseconds: 160),
      pageBuilder: (context, _, _) => SafeArea(
        child: presentation == ReviewPresentation.panel
            ? Align(
                alignment: Alignment.centerRight,
                child: SizedBox(
                  width: 520,
                  child: Material(
                    color: CraftTheme.of(context).raised,
                    child: editor,
                  ),
                ),
              )
            : Dialog(
                insetPadding: const EdgeInsets.all(16),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 520),
                  child: editor,
                ),
              ),
      ),
    );
  }
  if (focus?.context != null) focus!.requestFocus();
}

/// Entirely synthetic draft; intentionally no persistence/application service.
class DemoReviewEditor extends StatefulWidget {
  const DemoReviewEditor({super.key, required this.presentation});
  final ReviewPresentation presentation;
  @override
  State<DemoReviewEditor> createState() => _DemoReviewEditorState();
}

class _DemoReviewEditorState extends State<DemoReviewEditor> {
  final amount = TextEditingController(text: '185.50');
  final form = GlobalKey<FormState>();
  final editorFocus = FocusNode(debugLabel: 'Review editor');
  bool dirty = false, review = false, unknown = false, closed = false;
  @override
  void dispose() {
    editorFocus.dispose();
    amount.dispose();
    super.dispose();
  }

  Future<void> dismiss() async {
    if (closed) return;
    if (dirty) {
      final discard = await showDialog<bool>(
        context: context,
        animationStyle: MediaQuery.disableAnimationsOf(context)
            ? AnimationStyle.noAnimation
            : null,
        barrierDismissible: false,
        builder: (context) => AlertDialog(
          title: const Text('Discard demo changes?'),
          content: const Text(
            'This draft only exists in memory. You can keep editing or discard it.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Keep editing'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Discard draft'),
            ),
          ],
        ),
      );
      if (discard != true || !mounted) return;
    }
    setState(() => closed = true);
    // PopScope must rebuild before programmatic dismissal.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) Navigator.pop(context);
    });
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: closed,
    onPopInvokedWithResult: (didPop, _) {
      if (!didPop) dismiss();
    },
    child: CallbackShortcuts(
      bindings: {const SingleActivator(LogicalKeyboardKey.escape): dismiss},
      child: Focus(
        focusNode: editorFocus,
        autofocus: true,
        child: SingleChildScrollView(
          padding: EdgeInsets.fromLTRB(
            24,
            8,
            24,
            24 + MediaQuery.viewInsetsOf(context).bottom,
          ),
          child: Form(
            key: form,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const SizedBox(height: 16),
                SectionTitle(
                  unknown
                      ? 'Outcome unknown'
                      : review
                      ? 'Review demo expense'
                      : 'Edit demo expense',
                  caption: 'Private · Cash wallet · Demonstration only',
                ),
                if (unknown)
                  const StatusNotice(
                    'We cannot confirm the simulated outcome. No record was saved. In a real workflow, check status before retrying.',
                    tone: NoticeTone.warning,
                    live: true,
                  )
                else if (review)
                  ReviewRows(
                    rows: [
                      ('Account', 'Cash wallet'),
                      (
                        'Amount',
                        DemoMoney.format(DemoMoney.parse(amount.text)!),
                      ),
                      ('Date', '21 Oct 2026'),
                      ('Coverage', 'This isolated example only'),
                    ],
                  )
                else ...[
                  TextFormField(
                    key: const ValueKey('review-amount'),
                    controller: amount,
                    autofocus: true,
                    keyboardType: const TextInputType.numberWithOptions(
                      decimal: true,
                    ),
                    decoration: const InputDecoration(
                      labelText: 'Amount in Philippine pesos',
                      prefixText: '₱ ',
                      helperText: 'Use up to two decimals. Example: 185.50',
                    ),
                    validator: DemoMoney.validate,
                    onChanged: (_) => setState(() => dirty = true),
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'Changing this example does not change any account balance.',
                  ),
                ],
                const SizedBox(height: 24),
                Wrap(
                  spacing: 12,
                  runSpacing: 12,
                  children: [
                    OutlinedButton(
                      onPressed: dismiss,
                      child: const Text('Close draft'),
                    ),
                    if (review && !unknown)
                      TextButton(
                        onPressed: () => setState(() => review = false),
                        child: const Text('Edit'),
                      ),
                    if (!review && !unknown)
                      FilledButton(
                        onPressed: () {
                          if (form.currentState!.validate()) {
                            editorFocus.requestFocus();
                            setState(() => review = true);
                          }
                        },
                        child: const Text('Review'),
                      ),
                    if (review && !unknown)
                      FilledButton(
                        onPressed: () => setState(() {
                          unknown = true;
                          dirty = true;
                        }),
                        child: const Text('Simulate unknown outcome'),
                      ),
                    if (unknown)
                      TextButton(
                        onPressed: () => setState(() {
                          unknown = false;
                          review = true;
                        }),
                        child: const Text('Inspect draft'),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    ),
  );
}
