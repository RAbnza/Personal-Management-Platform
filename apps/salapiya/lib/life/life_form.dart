import 'dart:async';

import 'package:flutter/material.dart';

import '../app/demo_routes.dart';
import '../features/common/prototype_form.dart';
import '../features/finance/presentation/financial_widgets.dart';
import '../local/finance_domain.dart' show newLocalId;
import '../prototype/scenarios.dart';
import 'life_controller.dart';
import '../design_system/theme.dart';

Future<void> lifeReviewForm(
  BuildContext context,
  PrototypeSession session, {
  required String title,
  required List<DemoField> fields,
  required FutureOr<void> Function(Map<String, String>) save,
  String explanation =
      'Private source record. Review the details before saving.',
  int Function()? revision,
  String? draftKey,
  String? sourceId,
}) {
  final c = session.life;
  if (c is! DurableLifeController) {
    return reviewForm(
      context,
      title: title,
      fields: fields,
      save: save,
      explanation: explanation,
      revision: revision,
      draftKey: draftKey,
    );
  }
  final source =
      sourceId ?? (c.records.containsKey(draftKey) ? draftKey : null);
  return openDemoPage<void>(
    Navigator.of(context).overlay!.context,
    LifeForm(
      controller: c,
      title: title,
      fields: fields,
      save: save,
      explanation: explanation,
      operation: 'life:${draftKey ?? title}',
      source: source,
    ),
    'life/editor',
  );
}

Future<void> lifeAction(
  BuildContext context,
  FutureOr<void> Function() action,
) async {
  try {
    await action();
  } catch (e) {
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            e is FormatException ? e.message : 'The change could not be saved. Your records are preserved; check storage and retry.',
          ),
        ),
      );
    }
  }
}

class LifeForm extends StatefulWidget {
  const LifeForm({
    super.key,
    required this.controller,
    required this.title,
    required this.fields,
    required this.save,
    required this.explanation,
    required this.operation,
    this.source,
  });
  final DurableLifeController controller;
  final String title, explanation, operation;
  final String? source;
  final List<DemoField> fields;
  final FutureOr<void> Function(Map<String, String>) save;
  @override
  State<LifeForm> createState() => _LifeFormState();
}

class _LifeFormState extends State<LifeForm> {
  final values = <String, String>{};
  final controllers = <String, TextEditingController>{};
  bool loading = true, reviewing = false, saving = false, done = false;
  String? error;
  bool dirty = false;
  Future<void> writes = Future.value();
  @override
  void initState() {
    super.initState();
    unawaited(load());
  }

  Future<void> load() async {
    try {
      final draft = await widget.controller.store.draft(widget.operation);
      if (!mounted) return;
      dirty = draft != null;
      values.addAll({
        for (final f in widget.fields) f.id: f.value,
        '__command': newLocalId(),
        '__record': widget.source ?? newLocalId(),
        '__version':
            '${widget.controller.records[widget.source]?.version ?? 0}',
        '__recordedAt': DateTime.now().toUtc().toIso8601String(),
        '__draft': widget.operation,
        ...?draft?['values'] as Map<String, String>?,
      });
      for (final f in widget.fields.where((f) => f.options == null)) {
        controllers[f.id] = TextEditingController(text: values[f.id]);
      }
      setState(() => loading = false);
    } catch (_) {
      if (mounted) {
        setState(() {
          loading = false;
          error = 'Protected draft could not be opened. Back preserves existing data.';
        });
      }
    }
  }

  void update(String key, String value) {
    setState(() => dirty = true);
    values[key] = value;
    final frozen = Map<String, String>.of(values);
    writes = writes
        .catchError((Object _) {})
        .then(
          (_) => widget.controller.store.saveDraft(
            widget.operation,
            frozen['__command']!,
            frozen,
          ),
        );
    unawaited(
      writes.catchError((Object _) {
        if (mounted) {
          setState(
            () => error = 'Draft could not be saved. Keep this screen open and check storage.',
          );
        }
      }),
    );
  }

  Future<void> submit() async {
    if (saving) return;
    try {
      await writes;
      final missing = widget.fields.where(
        (f) => f.required && (values[f.id] ?? '').trim().isEmpty,
      );
      if (missing.isNotEmpty) {
        throw FormatException('Complete ${missing.first.label}.');
      }
      if (widget.source != null &&
          '${widget.controller.records[widget.source]?.version}' !=
              values['__version']) {
        throw const FormatException(
          'This source changed since this draft began. Keep the draft for reference, then discard it and review the current record.',
        );
      }
      if (!reviewing) {
        setState(() {
          reviewing = true;
          error = null;
        });
        return;
      }
      setState(() => saving = true);
      await widget.save(Map.unmodifiable(values));
      await widget.controller.store.discardDraft(widget.operation);
      if (mounted) {
        setState(() {
          done = true;
          saving = false;
          error = null;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          saving = false;
          reviewing = false;
          error = e is FormatException ? e.message : 'Save could not be confirmed. Your original draft and command ID are retained. Retry this same form.';
        });
      }
    }
  }

  @override
  void dispose() {
    for (final c in controllers.values) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FormExitGuard(
    dirty: dirty && !done,
    busy: saving || loading,
    keepDraft: () => writes,
    child: FinancePage(
      title: widget.title,
      child: loading
          ? const Center(child: CircularProgressIndicator())
          : WorkspaceForm(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  WorkspaceSteps(
                    active: done
                        ? 2
                        : reviewing
                        ? 1
                        : 0,
                  ),
                  FinanceHeading(
                    done
                        ? 'LIFE / SAVED'
                        : reviewing
                        ? 'REVIEW / BEFORE YOU CONTINUE'
                        : 'DETAILS / PROTECTED DRAFT',
                    widget.title,
                    widget.explanation,
                  ),
                  if (done) ...[
                    const FormStatus(
                      title: 'Saved on this device',
                      message: 'Your private record is saved in encrypted local storage.',
                      tone: NoticeTone.success,
                    ),
                    if (widget.controller.intents.any(
                      (i) => i['id'] == values['__command'],
                    ))
                      FormSyncStatus(
                        state:
                            widget.controller.intents.firstWhere(
                                  (i) => i['id'] == values['__command'],
                                )['state']
                                as String?,
                      ),
                    for (final f in widget.fields)
                      ReviewRow(
                        f.label,
                        f.options?[values[f.id]] ?? values[f.id] ?? '',
                      ),
                    FormEvidence(
                      children: [
                        SelectableText(
                          'Original command: ${values['__command']}\nRecord: ${values['__record']}\nSource version: ${values['__version']}',
                        ),
                      ],
                    ),
                    FilledButton(
                      onPressed: () => Navigator.pop(context),
                      child: const Text('Done'),
                    ),
                  ] else ...[
                    for (final f in widget.fields)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 18),
                        child: reviewing
                            ? ReviewRow(
                                f.label,
                                f.options?[values[f.id]] ?? values[f.id] ?? '',
                              )
                            : f.options != null
                            ? DropdownButtonFormField<String>(
                                key: ValueKey('life-field-${f.id}'),
                                initialValue:
                                    f.options!.containsKey(values[f.id])
                                    ? values[f.id]
                                    : null,
                                isExpanded: true,
                                decoration: InputDecoration(labelText: f.label),
                                items: [
                                  for (final item in f.options!.entries)
                                    DropdownMenuItem(
                                      value: item.key,
                                      child: Text(item.value),
                                    ),
                                ],
                                onChanged: saving
                                    ? null
                                    : (v) {
                                        if (v != null) update(f.id, v);
                                      },
                              )
                            : TextField(
                                key: ValueKey('life-field-${f.id}'),
                                controller: controllers[f.id],
                                enabled: !saving,
                                minLines: f.lines,
                                maxLines: f.lines,
                                decoration: InputDecoration(labelText: f.label),
                                onChanged: (v) => update(f.id, v),
                              ),
                      ),
                    if (error != null)
                      FormStatus(
                        title: 'Needs attention',
                        message: error!,
                        tone: NoticeTone.warning,
                      ),
                    if (error != null)
                      FormEvidence(
                        children: [
                          SelectableText(
                            'Original command: ${values['__command']}\nRecord: ${values['__record']}',
                          ),
                        ],
                      ),
                    if (saving)
                      const FormStatus(
                        title: 'Saving\u2026',
                        message: 'Your private record is being saved.',
                        busy: true,
                      ),
                    Wrap(
                      spacing: 12,
                      runSpacing: 12,
                      children: [
                        if (reviewing)
                          OutlinedButton(
                            onPressed: saving
                                ? null
                                : () => setState(() => reviewing = false),
                            child: const Text('Edit details'),
                          ),
                        FilledButton(
                          onPressed: saving ? null : submit,
                          child: Text(
                            saving
                                ? 'Saving…'
                                : reviewing
                                ? 'Confirm & save'
                                : 'Review changes',
                          ),
                        ),
                        TextButton(
                          onPressed: saving
                              ? null
                              : () async {
                                  if (!await confirmDiscard(context)) return;
                                  await writes;
                                  await widget.controller.store.discardDraft(
                                    widget.operation,
                                  );
                                  if (context.mounted) Navigator.pop(context);
                                },
                          child: const Text('Discard draft'),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    const Text(
                      'Back keeps this protected draft. Manual dates remain field values; recorded history uses the actual save timestamp.',
                    ),
                  ],
                ],
              ),
            ),
    ),
  );
}
