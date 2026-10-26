import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:path/path.dart' as p;

import '../finance/bounded_file_read.dart';
import '../finance/file_store.dart';
import '../features/finance/presentation/financial_widgets.dart';
import '../local/finance_domain.dart';
import '../local/local_runtime.dart';
import '../local/local_store.dart';
import 'life_controller.dart';
import 'life_domain.dart';
import 'life_form.dart';

class CareerDocuments extends StatefulWidget {
  const CareerDocuments({
    super.key,
    required this.session,
    required this.application,
  });
  final LocalSession session;
  final String application;
  @override
  State<CareerDocuments> createState() => _CareerDocumentsState();
}

class _CareerDocumentsState extends State<CareerDocuments> {
  late final c = widget.session.life as DurableLifeController;
  late final files = FinancialFileStore(
    c.store,
    Directory(
      p.join(
        widget.session.runtime.profiles.directory.path,
        '${c.store.owner}.career-attachments',
      ),
    ),
    () async {
      final raw = await widget.session.runtime.profiles.vault.read();
      if (raw == null) lifeReject('Protected file key unavailable.');
      final descriptor = jsonDecode(raw) as Map;
      if (descriptor['id'] != c.store.owner) {
        lifeReject('Private document/profile mismatch.');
      }
      return descriptor['key'] as String;
    },
  );
  bool busy = false;
  Future<void> run(Future<void> Function() action) async {
    if (busy) return;
    setState(() => busy = true);
    await lifeAction(context, action);
    if (mounted) setState(() => busy = false);
  }

  Future<void> attach() async {
    final app = c.records[widget.application];
    if (app is! ApplicationRecord) lifeReject('Owned application unavailable.');
    final picked = await FilePicker.pickFile();
    if (picked == null) return;
    final bytes = await readBoundedFinancialFile(
          picked,
          FinancialFileStore.maxBytes,
        ),
        name = p.basename(picked.name);
    final mime = FinancialFileStore.validateFormat(name, bytes),
        id = newLocalId();
    final command = LifeCommand(
      owner: c.store.owner,
      recordId: id,
      type: LifeType.document,
      expectedVersion: 0,
      fields: {
        'title': name,
        'application': app.id,
        'sourceVersion': '${app.version}',
        'mime': mime,
        'size': '${bytes.length}',
        'checksum': sha256.convert(bytes).toString(),
      },
      reason: 'Attached private Career document metadata',
    );
    final record = LifeRecord.read(
      id,
      c.store.owner,
      1,
      LifeType.document,
      command.fields,
    ) as CareerDocumentRecord;
    // Retain encrypted bytes before the metadata command. An interrupted link
    // leaves a recoverable orphan; it never claims missing bytes are available.
    await c.store.saveDraft('life-document:$id', command.id, {
      'payload': command.payload,
    });
    await files.write(id, record.fileMetadata, bytes);
    if (!mounted) return;
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Attach private document?'),
        content: Text(
          '$name · ${bytes.length} bytes. Encrypted on this device only. Unscanned; cloud transfer and backup bytes are unavailable.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Keep retained selection'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Attach'),
          ),
        ],
      ),
    );
    if (confirm != true) return;
    await c.store.commitLife(command, draft: 'life-document:$id');
    await c.reload();
  }

  Future<void> resume(Map<String, dynamic> draft) async {
    final command = LifeCommand.decode(
      draft['command_id'] as String,
      (jsonDecode(draft['values_json'] as String) as Map)['payload'] as String,
    );
    final record = LifeRecord.read(
      command.recordId,
      c.store.owner,
      1,
      LifeType.document,
      command.fields,
    ) as CareerDocumentRecord;
    await files.readMetadata(record.id, record.fileMetadata);
    await c.store.commitLife(command, draft: draft['operation'] as String);
    await c.reload();
  }

  Future<void> recover(CareerDocumentRecord r) async {
    final picked = await FilePicker.pickFile();
    if (picked == null) return;
    final bytes = await readBoundedFinancialFile(
      picked,
      FinancialFileStore.maxBytes,
    );
    await files.write(r.id, r.fileMetadata, bytes);
  }

  Future<void> export(CareerDocumentRecord r) async {
    final bytes = await files.readMetadata(r.id, r.fileMetadata);
    await FilePicker.saveFile(fileName: r.title, bytes: bytes);
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: c,
    builder: (context, _) => Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const FinanceNotice(
          'Career documents are private, encrypted device files. Only metadata synchronizes. Files remain unscanned; export opens no automatic preview. Archives contain zero document byte objects. Keep original files separately.',
        ),
        OutlinedButton.icon(
          onPressed: busy ? null : () => run(attach),
          icon: const Icon(Icons.attach_file),
          label: const Text('Select private Career document'),
        ),
        FutureBuilder(
          future: c.store.drafts(),
          builder: (context, snapshot) => Column(
            children: [
              for (final draft in snapshot.data ?? <Map<String, dynamic>>[])
                if ((draft['operation'] as String).startsWith(
                      'life-document:',
                    ) &&
                    ((jsonDecode(
                              (jsonDecode(draft['values_json'] as String)
                                      as Map)['payload']
                                  as String,
                            ) as Map)['fields']
                            as Map)['application'] ==
                        widget.application)
                  TextButton(
                    onPressed: busy ? null : () => run(() => resume(draft)),
                    child: const Text('Resume retained Career document link'),
                  ),
            ],
          ),
        ),
        for (final r
            in c.records.values.whereType<CareerDocumentRecord>().where(
              (r) => r.applicationId == widget.application,
            ))
          ExpansionTile(
            key: PageStorageKey('career-file-${r.id}'),
            title: Text(r.title),
            subtitle: Text(
              r.archived
                  ? 'Archived link · bytes retained'
                  : 'Metadata only across devices · ${r.fields['size']} bytes',
            ),
            children: [
              FutureBuilder(
                future: files.present(r.id),
                builder: (context, snapshot) => Text(
                  snapshot.data == true
                      ? 'Local encrypted object present; integrity checked on export'
                      : 'Bytes absent on this device · reselect the exact original',
                ),
              ),
              if (!r.archived)
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    TextButton(
                      onPressed: busy ? null : () => run(() => export(r)),
                      child: const Text('Export original bytes'),
                    ),
                    TextButton(
                      onPressed: busy ? null : () => run(() => recover(r)),
                      child: const Text('Recover from exact original'),
                    ),
                    TextButton(
                      onPressed: busy
                          ? null
                          : () => run(
                              () => c.change(r.id, r.version, {
                                'archived': 'true',
                              }, 'Archived private document link'),
                            ),
                      child: const Text('Archive link'),
                    ),
                  ],
                ),
              if (r.archived)
                TextButton(
                  onPressed: busy
                      ? null
                      : () => run(
                          () => c.change(r.id, r.version, {
                            'archived': 'false',
                          }, 'Restored document link; byte presence unchanged'),
                        ),
                  child: const Text('Restore link'),
                ),
            ],
          ),
      ],
    ),
  );
}
