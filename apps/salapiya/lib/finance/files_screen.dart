import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:crypto/crypto.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:path/path.dart' as p;

import '../design_system/editorial.dart';
import '../features/finance/presentation/financial_widgets.dart';
import '../local/finance_domain.dart';
import '../local/local_runtime.dart';
import 'file_store.dart';
import 'finance_screen.dart';
import 'bounded_file_read.dart';

class NativeFilesScreen extends StatefulWidget {
  const NativeFilesScreen({super.key, required this.session});
  final LocalSession session;
  @override
  State<NativeFilesScreen> createState() => _NativeFilesScreenState();
}

class _NativeFilesScreenState extends State<NativeFilesScreen> {
  bool busy = false;
  String? source, message, error;
  int page = 0;
  Map<String, dynamic>? retained;
  late final c = widget.session.localFinance;
  late final files = FinancialFileStore(
    c.store,
    Directory(
      p.join(
        widget.session.runtime.profiles.directory.path,
        '${c.store.owner}.attachments',
      ),
    ),
    () async {
      final raw = await widget.session.runtime.profiles.vault.read();
      if (raw == null) {
        reject(
          'Protected profile key is unavailable. Existing files are preserved.',
        );
      }
      final descriptor = jsonDecode(raw) as Map;
      if (descriptor['id'] != c.store.owner) {
        reject('Attachment/profile key identity mismatch.');
      }
      return descriptor['key'] as String;
    },
  );
  @override
  void initState() {
    super.initState();
    loadRetained();
  }

  Future<void> loadRetained() async {
    try {
      retained = await c.store.draft('files:attach');
    } catch (_) {
      error = 'The retained file selection could not be read.';
    }
    if (mounted) setState(() {});
  }

  Future<void> run(Future<void> Function() work) async {
    setState(() {
      busy = true;
      error = null;
      message = null;
    });
    try {
      await work();
    } catch (e) {
      if (mounted) error = e is LocalRuleException ? e.message : 'File operation failed. No successful transfer, preview or deletion is claimed; retained originals are preserved.';
    } finally {
      await loadRetained();
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> choose() async {
    if (source == null) {
      reject('Choose a concrete private financial source first.');
    }
    if (retained != null) {
      reject('Resume the retained selection before choosing another file.');
    }
    final picked = await FilePicker.pickFile();
    if (picked == null) return;
    final length = await picked.length();
    if (length == null || length < 1 || length > FinancialFileStore.maxBytes) {
      reject('Choose PDF, JPEG or PNG up to 10 MiB.');
    }
    final bytes = await readBoundedFinancialFile(
          picked,
          FinancialFileStore.maxBytes,
        ),
        name = p.basename(picked.name),
        mime = FinancialFileStore.validateFormat(name, bytes),
        id = newLocalId();
    final values = {
      'name': name,
      'date': civilToday(),
      'sourceRevision': source!,
      'mime': mime,
      'size': '${bytes.length}',
      'checksum': sha256.convert(bytes).toString(),
    };
    await c.store.saveDraft('files:attach', id, values);
    await files.write(id, values, bytes);
    await finish(id, values);
  }

  Future<void> finish(String id, Map<String, String> values) async {
    await files.readMetadata(id, values);
    await c.reload();
    final old = await c.store.db.getAll(
      'SELECT payload FROM local_command WHERE id=? UNION ALL SELECT payload FROM connected_intent WHERE id=?',
      [id, id],
    );
    final command = old.isEmpty
        ? LocalCommand(
            id: id,
            owner: c.store.owner,
            expectedVersion: c.snapshot.version,
            kind: 'financialFile',
            values: values,
          )
        : LocalCommand.decode(id, old.first['payload'] as String);
    final plan = planLocal(
      c.snapshot,
      LocalCommand(
        id: command.id,
        owner: command.owner,
        expectedVersion: c.snapshot.version,
        kind: command.kind,
        values: command.values,
      ),
    );
    if (!mounted) return;
    final accepted = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Review private supporting file'),
        content: SingleChildScrollView(
          child: Text(
            '${values['name']}\n${values['mime']} · ${values['size']} bytes\nSHA256 ${values['checksum']}\nSource revision ${values['sourceRevision']}\n\n'
            'Encrypted local bytes were written and verified. This file is unscanned. Format hints do not prove safety. No cloud bytes will be uploaded.\n\n${plan.effects.join('\n')}',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Keep as retained selection'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Attach private file'),
          ),
        ],
      ),
    );
    if (accepted != true) {
      message = 'Selection and encrypted bytes retained. No attachment metadata was posted.';
      return;
    }
    await c.store.commit(command);
    await c.reload();
    message = c.connected
        ? 'Private metadata saved on this device pending server reconciliation. Actual bytes remain device-local and unscanned.'
        : 'Private metadata saved locally; encrypted file bytes verified. The file remains unscanned.';
  }

  Future<void> recoverBytes() async {
    if (retained == null) reject('There is no retained selection.');
    final picked = await FilePicker.pickFile();
    if (picked == null) return;
    final length = await picked.length();
    if (length == null || length > FinancialFileStore.maxBytes) {
      reject('Select the same original, at most 10 MiB.');
    }
    final values = Map<String, String>.from(retained!['values'] as Map),
        id = retained!['command'] as String;
    final bytes = await readBoundedFinancialFile(
      picked,
      FinancialFileStore.maxBytes,
    );
    await files.write(id, values, bytes);
    await finish(id, values);
  }

  Future<void> preview(LocalRevision r) async {
    final bytes = await files.read(r.id);
    if (r.values['mime'] == 'application/pdf') {
      reject(
        'PDF is not rendered inline. Save a verified copy for external viewing; its content remains unscanned.',
      );
    }
    final buffer = await ui.ImmutableBuffer.fromUint8List(bytes);
    ui.ImageDescriptor? descriptor;
    try {
      descriptor = await ui.ImageDescriptor.encoded(buffer);
      if (descriptor.width > 20000 ||
          descriptor.height > 20000 ||
          descriptor.width * descriptor.height > 40000000) {
        reject(
          'Image dimensions exceed the safe in-app preview bound. Retain or export the original.',
        );
      }
    } finally {
      descriptor?.dispose();
      buffer.dispose();
    }
    if (!mounted) return;
    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(r.title),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text(
                'Unscanned private image. Integrity verification is not a safety scan.',
              ),
              Image.memory(
                bytes,
                cacheWidth: 1024,
                errorBuilder: (context, error, stack) => const Text(
                  'The image decoder rejected this content. No safe/scanned status is claimed.',
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }

  Future<void> restoreOriginal(LocalRevision r) async {
    if (financialFileDetached(c.snapshot, r.id)) {
      reject(
        'This source link is archived. Create a new reviewed attachment link instead.',
      );
    }
    final picked = await FilePicker.pickFile();
    if (picked == null) return;
    final bytes = await readBoundedFinancialFile(
      picked,
      FinancialFileStore.maxBytes,
    );
    await files.write(r.id, r.values, bytes);
    message = 'Original bytes match the immutable checksum and are encrypted with this profile’s current protected key. No new financial source or cloud transfer was created.';
  }

  Future<void> export(LocalRevision r) async {
    final bytes = await files.read(r.id);
    final uri = await FilePicker.saveFile(fileName: r.title, bytes: bytes);
    message = uri == null ? 'Copy cancelled.' : 'Verified original bytes saved for external viewing. Content remains unscanned; choose a trusted viewer.';
  }

  Future<void> removeCopy(LocalRevision r) async {
    final accepted = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Remove this device’s encrypted copy?'),
        content: const Text(
          'Cloud file storage is unavailable, and the financial archive currently excludes attachment bytes. Keep another copy first. Metadata and financial history remain retained.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Keep local copy'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Remove local copy'),
          ),
        ],
      ),
    );
    if (accepted != true) return;
    await files.removeLocalCopy(r.id);
    message = 'Device-local bytes removed. Metadata is retained and will show absent bytes.';
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: c,
    builder: (context, _) {
      final records = c.snapshot.current
          .where((r) => financeType(r) == 'financialFile')
          .toList();
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SectionHeading('Private financial supporting files'),
          const FinanceNotice(
            'PDF, JPEG and PNG, at most 10 MiB each / 1,000 live objects / 1 GiB declared capacity. Files are encrypted locally. Extensions and signatures are format hints only; they do not prove harmless content.',
          ),
          const FinanceNotice(
            'Cloud upload/download is unavailable: a production private object-storage and malware-scanning boundary has not been verified on the current free infrastructure. No available/scanned status is fabricated; binary files never enter PowerSync.',
          ),
          if (error != null) FinanceNotice(error!),
          if (message != null) FinanceNotice(message!),
          DropdownButtonFormField<String>(
            initialValue: source,
            isExpanded: true,
            decoration: const InputDecoration(
              labelText:
                  'Concrete financial source / exact historical revision',
            ),
            items: [
              for (final r in c.snapshot.revisions.where(
                (r) =>
                    !nativeFileCommands.contains(financeType(r)) &&
                    !nativeCashImportCommands.contains(financeType(r)),
              ))
                DropdownMenuItem(
                  value: r.id,
                  child: Text(
                    '${r.title} · ${r.date} · v${r.number}',
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
            ],
            onChanged: busy ? null : (v) => setState(() => source = v),
          ),
          FilledButton.icon(
            onPressed: busy ? null : () => run(choose),
            icon: const Icon(Icons.attach_file),
            label: const Text('Choose private supporting file'),
          ),
          if (retained != null) ...[
            OutlinedButton(
              onPressed: busy
                  ? null
                  : () => run(
                      () => finish(
                        retained!['command'] as String,
                        Map<String, String>.from(retained!['values'] as Map),
                      ),
                    ),
              child: const Text('Resume retained attachment selection'),
            ),
            TextButton(
              onPressed: busy ? null : () => run(recoverBytes),
              child: const Text(
                'Reselect identical original if staged bytes are missing',
              ),
            ),
            TextButton(
              onPressed: busy
                  ? null
                  : () => run(() async {
                      await c.store.discardDraft('files:attach');
                      message = 'Selection draft released. Any encrypted staged bytes are retained in the object inventory; no original was deleted.';
                    }),
              child: const Text('Release selection draft; retain staged bytes'),
            ),
          ],
          FinanceNotice(
            'Backup coverage: ${records.length} attachment metadata records; 0 attachment byte objects included in the standard financial archive. Keep originals separately. Restored metadata never claims that bytes were recovered.',
          ),
          for (final r in records.skip(page * 25).take(25))
            EditorialSurface(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  FinancialLine(
                    r.title,
                    '${r.values['mime']} · ${r.values['size']} bytes · ${financialFileDetached(c.snapshot, r.id) ? 'Archived link' : 'Attached'}',
                    icon: Icons.description_outlined,
                    onTap: () => openFinanceDetail(
                      context,
                      c,
                      r.values['sourceRevision']!,
                    ),
                  ),
                  FutureBuilder<bool>(
                    future: files.present(r.id),
                    builder: (context, result) => Text(
                      result.hasError
                          ? 'Local availability could not be checked.'
                          : result.data == true
                          ? 'Encrypted local bytes present; authentication/checksum are verified on every preview/export.'
                          : result.data == false
                          ? 'Actual bytes absent on this device. Cloud download is unavailable.'
                          : 'Checking actual local bytes…',
                    ),
                  ),
                  Wrap(
                    spacing: 8,
                    children: [
                      TextButton(
                        onPressed: busy
                            ? null
                            : () => run(() => restoreOriginal(r)),
                        child: const Text(
                          'Restore local bytes from identical original',
                        ),
                      ),
                      if (r.values['mime'] != 'application/pdf')
                        TextButton(
                          onPressed: busy ? null : () => run(() => preview(r)),
                          child: const Text('Preview unscanned image'),
                        ),
                      TextButton(
                        onPressed: busy ? null : () => run(() => export(r)),
                        child: const Text('Save original for external viewing'),
                      ),
                      TextButton(
                        onPressed: busy ? null : () => run(() => removeCopy(r)),
                        child: const Text('Remove device-local copy'),
                      ),
                      TextButton(
                        onPressed: busy
                            ? null
                            : () => openNativeFinance(
                                context,
                                c,
                                'fileDetach',
                                'Archive attachment link',
                              ),
                        child: const Text('Archive link with reason'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          Text(
            '${records.length} private metadata records; page ${page + 1}. Binary availability is separate.',
          ),
          Wrap(
            spacing: 8,
            children: [
              TextButton(
                onPressed: page == 0 ? null : () => setState(() => page--),
                child: const Text('Previous files'),
              ),
              TextButton(
                onPressed: (page + 1) * 25 >= records.length
                    ? null
                    : () => setState(() => page++),
                child: const Text('Next files'),
              ),
            ],
          ),
          FutureBuilder<List<String>>(
            future: files.orphans(),
            builder: (context, result) => Text(
              result.hasError
                  ? 'Retained-object inventory unavailable. No automatic cleanup was performed.'
                  : '${result.data?.length ?? 0} encrypted staged/orphan objects retained. Resume a retained selection or inspect synchronization review; unknown originals are not automatically deleted.',
            ),
          ),
        ],
      );
    },
  );
}
