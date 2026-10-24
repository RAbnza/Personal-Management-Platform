import 'package:flutter/material.dart';

import '../../app/demo_routes.dart';
import '../finance/presentation/financial_widgets.dart';

class DemoField {
  const DemoField(
    this.id,
    this.label, {
    this.value = '',
    this.options,
    this.required = true,
    this.lines = 1,
  });
  final String id, label, value;
  final Map<String, String>? options;
  final bool required;
  final int lines;
}

/// Drafts survive route dismissal within the session. Reviews freeze a copy.
final Map<String, Map<String, String>> prototypeDrafts = {};
Future<void> reviewForm(
  BuildContext context, {
  required String title,
  required List<DemoField> fields,
  required void Function(Map<String, String>) save,
  String explanation = 'This changes only the synthetic prototype in memory.',
  int Function()? revision,
  String? draftKey,
}) => openDemoPage<void>(
  Navigator.of(context).overlay!.context,
  PrototypeForm(
    title: title,
    fields: fields,
    save: save,
    explanation: explanation,
    revision: revision,
    draftKey: draftKey ?? title,
  ),
  'demo/form/$title',
);

class PrototypeForm extends StatefulWidget {
  const PrototypeForm({
    super.key,
    required this.title,
    required this.fields,
    required this.save,
    required this.explanation,
    required this.draftKey,
    this.revision,
  });
  final String title, explanation, draftKey;
  final List<DemoField> fields;
  final void Function(Map<String, String>) save;
  final int Function()? revision;
  @override
  State<PrototypeForm> createState() => _PrototypeFormState();
}

class _PrototypeFormState extends State<PrototypeForm> {
  late final values = <String, String>{
    for (final f in widget.fields) f.id: f.value,
    ...?prototypeDrafts[widget.draftKey],
  };
  late final controllers = {
    for (final f in widget.fields.where((f) => f.options == null))
      f.id: TextEditingController(text: values[f.id]),
  };
  String? error;
  String outcome = 'Apply demo';
  bool reviewing = false, done = false;
  int? version;
  @override
  void dispose() {
    for (final c in controllers.values) {
      c.dispose();
    }
    super.dispose();
  }

  void update(String key, String value) {
    values[key] = value;
    prototypeDrafts[widget.draftKey] = Map.of(values);
  }

  void submit() {
    if (!reviewing) {
      final missing = widget.fields.where(
        (f) => f.required && (values[f.id] ?? '').trim().isEmpty,
      );
      if (missing.isNotEmpty) {
        setState(() => error = 'Complete ${missing.first.label}.');
        return;
      }
      version = widget.revision?.call();
      setState(() {
        reviewing = true;
        error = null;
      });
      return;
    }
    if (outcome != 'Apply demo') {
      setState(
        () => error = outcome == 'Stale review'
            ? 'Source changed. Edit and review again; your draft is retained.'
            : 'Demo unavailable. Your draft is retained; choose Apply demo to retry.',
      );
      return;
    }
    if (version != widget.revision?.call()) {
      setState(() {
        error = 'Source changed. Edit and review again.';
      });
      return;
    }
    try {
      widget.save(Map.unmodifiable(values));
      prototypeDrafts.remove(widget.draftKey);
      setState(() {
        done = true;
        error = null;
      });
    } on FormatException catch (e) {
      setState(() {
        error = e.message;
        reviewing = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) => FinancePage(
    title: widget.title,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        FinanceHeading(
          done
              ? 'DEMO / COMPLETE'
              : reviewing
              ? 'REVIEW / BEFORE YOU CONTINUE'
              : 'DETAILS / YOUR DRAFT',
          done
              ? 'Ready in this session.'
              : reviewing
              ? 'Does everything look right?'
              : widget.title,
          widget.explanation,
        ),
        if (done) ...[
          const FinanceNotice(
            'Simulated change applied in memory. Nothing was sent, stored on disk, or completed externally.',
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
                  ? FinancialLine(
                      f.label,
                      f.options?[values[f.id]] ?? values[f.id] ?? '',
                    )
                  : f.options != null
                  ? DropdownButtonFormField<String>(
                      initialValue: f.options!.containsKey(values[f.id])
                          ? values[f.id]
                          : null,
                      isExpanded: true,
                      decoration: InputDecoration(labelText: f.label),
                      items: [
                        for (final e in f.options!.entries)
                          DropdownMenuItem(value: e.key, child: Text(e.value)),
                      ],
                      onChanged: (v) {
                        if (v != null) update(f.id, v);
                      },
                    )
                  : TextField(
                      controller: controllers[f.id],
                      minLines: f.lines,
                      maxLines: f.lines,
                      decoration: InputDecoration(labelText: f.label),
                      onChanged: (v) => update(f.id, v),
                    ),
            ),
          if (reviewing)
            DropdownButtonFormField<String>(
              initialValue: outcome,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Simulated outcome'),
              items: [
                for (final s in ['Apply demo', 'Stale review', 'Unavailable'])
                  DropdownMenuItem(value: s, child: Text(s)),
              ],
              onChanged: (v) => setState(() => outcome = v!),
            ),
          if (error != null) FinanceNotice(error!, warning: true),
          const SizedBox(height: 20),
          Wrap(
            spacing: 12,
            runSpacing: 12,
            children: [
              if (reviewing)
                OutlinedButton(
                  onPressed: () => setState(() => reviewing = false),
                  child: const Text('Edit details'),
                ),
              FilledButton(
                onPressed: submit,
                child: Text(reviewing ? 'Apply simulation' : 'Review changes'),
              ),
            ],
          ),
          const SizedBox(height: 16),
          const Text(
            'Back keeps this draft for this session. Closing the app resets all demo data.',
          ),
        ],
      ],
    ),
  );
}

class DemoViewState extends StatefulWidget {
  const DemoViewState({super.key, required this.child});
  final Widget child;
  @override
  State<DemoViewState> createState() => _DemoViewStateState();
}

class _DemoViewStateState extends State<DemoViewState> {
  String state = 'Complete';
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Align(
        alignment: Alignment.centerRight,
        child: PopupMenuButton<String>(
          tooltip: 'Explore presentation states',
          onSelected: (v) => setState(() => state = v),
          itemBuilder: (_) => [
            for (final s in [
              'Complete',
              'Loading',
              'Empty',
              'Unavailable',
              'Permission denied',
              'Stale',
            ])
              PopupMenuItem(value: s, child: Text(s)),
          ],
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Text('View state: $state ▾'),
          ),
        ),
      ),
      if (state == 'Complete')
        widget.child
      else ...[
        FinanceNotice(switch (state) {
          'Loading' => 'Loading simulation. Amounts remain unavailable until a complete snapshot is selected.',
          'Empty' => 'No records in this preview. Return to Complete to create and explore synthetic records.',
          'Permission denied' => 'Access unavailable for this identity. Private records are never shared by group membership.',
          'Stale' => 'This snapshot needs review. Refresh the demo before continuing; drafts are retained.',
          _ => 'This source is unavailable. Existing records and drafts are retained. Retry when ready.',
        }, warning: true),
        OutlinedButton(
          onPressed: () => setState(() => state = 'Complete'),
          child: const Text('Return to complete demo'),
        ),
      ],
    ],
  );
}
