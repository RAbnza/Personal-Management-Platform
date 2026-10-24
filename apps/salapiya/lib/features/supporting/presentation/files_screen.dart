import 'package:flutter/material.dart';

import '../../../app/demo_routes.dart';
import '../../../design_system/editorial.dart';
import '../../../design_system/theme.dart';
import '../../../prototype/scenarios.dart';
import '../../common/prototype_form.dart';
import '../../finance/presentation/financial_widgets.dart';
import '../application/supporting_controller.dart';

class FilesScreen extends StatefulWidget {
  const FilesScreen({super.key, required this.session, this.source});
  final PrototypeSession session;
  final String? source;
  @override
  State<FilesScreen> createState() => _FilesScreenState();
}

class _FilesScreenState extends State<FilesScreen> {
  String filter = 'All', query = '';
  PrototypeSession get s => widget.session;
  SupportingController get c => s.finance.files;
  Map<String, String> get sources => {
    for (final r in s.finance.records.where((r) => !r.sharedOnly))
      'action:${r.id}': 'Transaction · ${r.title}',
    for (final d in s.finance.debts) 'debt:${d.id}': 'Debt · ${d.name}',
    for (final p in s.finance.settlements.where(
      (p) => p.sender == 'Amihan' || p.recipient == 'Amihan',
    ))
      'settlement:${p.id}': 'Own settlement evidence · ${p.id}',
    for (final e in s.finance.statementDefinitions)
      'statement:${e.id}:v${e.version}':
          'Statement · ${e.reference} · exact revision ${e.version}',
    'reconciliation:account-1': 'Account reconciliation · Everyday bank',
    for (final a in s.life.applications)
      'career:${a.id}': 'Application · ${a.company}',
    for (final a in s.life.applications)
      for (final e in a.events)
        'career-event:${e.id}': 'Career event · ${a.company} · ${e.kind}',
    'resume:2': 'Resume · exact version 2',
    if (widget.source != null) widget.source!: widget.source!,
  };
  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: s,
    builder: (context, _) {
      final files = c.files
          .where(
            (f) =>
                (widget.source == null || f.source == widget.source) &&
                (filter == 'All' || f.state == filter) &&
                f.name.toLowerCase().contains(query),
          )
          .toList();
      return DemoViewState(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            FinanceHeading(
              'PRIVATE FILES / SOURCE EVIDENCE',
              'Keep the context close.',
              'Metadata can be present when file bytes are not. No real file is opened, uploaded, downloaded or scanned.',
              actions: [
                FilledButton.icon(
                  onPressed: () => reviewForm(
                    context,
                    title: 'Add supporting metadata',
                    fields: [
                      const DemoField('name', 'Filename', value: 'Receipt.pdf'),
                      const DemoField('size', 'Size in KiB', value: '240'),
                      DemoField(
                        'source',
                        'Private source',
                        value: widget.source ?? sources.keys.firstOrNull ?? '',
                        options: sources,
                      ),
                    ],
                    save: c.add,
                  ),
                  icon: const Icon(Icons.attach_file),
                  label: const Text('Add demo attachment'),
                ),
              ],
            ),
            FinanceColumns(
              main: TextField(
                decoration: const InputDecoration(
                  labelText: 'Search private files',
                  prefixIcon: Icon(Icons.search),
                ),
                onChanged: (v) => setState(() => query = v.toLowerCase()),
              ),
              aside: DropdownButtonFormField<String>(
                initialValue: filter,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Availability'),
                items: [
                  for (final x in [
                    'All',
                    'Local only',
                    'Online only',
                    'Downloaded',
                    'Uploading',
                    'Upload failed',
                    'Unscanned',
                    'Rejected',
                    'Missing',
                    'Metadata only',
                    'Deleted',
                  ])
                    DropdownMenuItem(value: x, child: Text(x)),
                ],
                onChanged: (v) => setState(() => filter = v!),
              ),
            ),
            const SizedBox(height: 20),
            for (final f in files)
              FinancialLine(
                f.name,
                '${sources[f.source] ?? f.source}\n${f.state} · ${f.sizeKiB} KiB · private',
                icon: Icons.description_outlined,
                color: f.state == 'Missing' || f.state == 'Rejected'
                    ? Palette.peach
                    : Palette.lilac,
                onTap: () => detail(f),
              ),
            if (files.isEmpty)
              const FinanceNotice(
                'No matching attachments. Source records remain usable without file bytes.',
              ),
            const SizedBox(height: 24),
            const FinanceNotice(
              'Supporting files stay private even when their financial source has a Shared Expenses effect. PDF/JPEG/PNG · 10 MiB per object. A scan label here is a synthetic state, not a safety certification.',
            ),
          ],
        ),
      );
    },
  );
  void detail(DemoAttachment f) => openDemoPage<void>(
    context,
    FinancePage(
      title: f.name,
      child: ListenableBuilder(
        listenable: c,
        builder: (context, _) => Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            FinanceHeading(
              'ATTACHMENT / ${f.state.toUpperCase()}',
              f.name,
              '${sources[f.source] ?? f.source} · private source metadata',
            ),
            ValueBlock('AVAILABILITY', f.state, switch (f.state) {
              'Missing' => 'The recorded file is unavailable. Keep the source; replace metadata explicitly.',
              'Unscanned' => 'Quarantined in this specimen. No preview or transfer until a successful simulated validation.',
              'Rejected' =>
                'Unsafe or invalid specimen. Preview and transfer are blocked.',
              'Online only' =>
                'Metadata is cached. Offline viewing is unavailable.',
              'Uploading' => 'Simulated transfer in progress; structured financial records are independent.',
              'Upload failed' => 'Original metadata retained. Retry uses the same file identity.',
              _ => 'Synthetic file state only. No actual bytes are stored.',
            }, color: Palette.lilac),
            const SizedBox(height: 20),
            if (['Local only', 'Downloaded'].contains(f.state))
              OutlinedButton(
                onPressed: () => showDialog<void>(
                  context: context,
                  builder: (context) => AlertDialog(
                    title: const Text('Synthetic attachment preview'),
                    content: Text(
                      '${f.name}\nPrivate source ${f.source}\nThis is a placeholder, not a rendered document. No file bytes exist.',
                    ),
                    actions: [
                      TextButton(
                        onPressed: () => Navigator.pop(context),
                        child: const Text('Close'),
                      ),
                    ],
                  ),
                ),
                child: const Text('Inspect safe preview specimen'),
              ),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final action in switch (f.state) {
                  'Unscanned' => ['Simulate scan passed', 'Reject unsafe file'],
                  'Online only' => ['Simulate download'],
                  'Upload failed' => ['Retry upload'],
                  'Uploading' => [
                    'Simulate transfer complete',
                    'Upload failed',
                  ],
                  'Local only' => ['Retry upload'],
                  'Downloaded' => ['Remove local copy'],
                  _ => <String>[],
                })
                  OutlinedButton(
                    onPressed: () => reviewForm(
                      context,
                      title: action,
                      fields: [
                        const DemoField(
                          'reason',
                          'Review note',
                          value: 'Explore this synthetic file state',
                        ),
                      ],
                      save: (_) => c.transition(f, action),
                    ),
                    child: Text(action),
                  ),
              ],
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Keep offline · preference'),
              value: f.keepOffline,
              onChanged: (v) {
                f.keepOffline = v;
                c.changed();
              },
            ),
            const SizedBox(height: 16),
            DropdownButtonFormField<String>(
              key: ValueKey(f.state),
              initialValue: f.state,
              isExpanded: true,
              decoration: const InputDecoration(
                labelText: 'Explore file availability specimen',
              ),
              items: [
                for (final x in [
                  'Local only',
                  'Online only',
                  'Downloaded',
                  'Uploading',
                  'Upload failed',
                  'Unscanned',
                  'Rejected',
                  'Missing',
                  'Metadata only',
                  'Deleted',
                ])
                  DropdownMenuItem(value: x, child: Text(x)),
              ],
              onChanged: (v) {
                f.state = v!;
                c.changed();
              },
            ),
            const SizedBox(height: 12),
            TextButton(
              onPressed: () => reviewForm(
                context,
                title: 'Delete supporting metadata',
                fields: [const DemoField('reason', 'Reason')],
                save: (_) => c.transition(f, 'Delete metadata'),
              ),
              child: const Text('Remove attachment metadata'),
            ),
            const SectionHeading('File history'),
            for (final h in f.history) FinancialLine('Evidence', h),
          ],
        ),
      ),
    ),
    'files/${f.id}',
  );
}

class SupportingFilesLink extends StatelessWidget {
  const SupportingFilesLink({
    super.key,
    required this.session,
    required this.source,
  });
  final PrototypeSession session;
  final String source;
  @override
  Widget build(BuildContext context) => FinancialLine(
    'Supporting files',
    'Private source-linked evidence · availability & missing-file states',
    icon: Icons.attach_file,
    onTap: () => openDemoPage<void>(
      context,
      FinancePage(
        title: 'Supporting files',
        child: FilesScreen(session: session, source: source),
      ),
      'files/source',
    ),
  );
}
