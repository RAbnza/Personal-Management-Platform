import '../design_system/theme.dart';

import 'dart:convert';
import 'dart:async';

import 'package:crypto/crypto.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';

import '../design_system/editorial.dart';
import '../features/finance/presentation/financial_widgets.dart';
import '../local/finance_domain.dart';
import '../local/local_finance_controller.dart';
import '../p0/exact_money.dart';
import 'bounded_file_read.dart';

Future<void> submitCashImport(
  LocalFinancialController c,
  String kind,
  Map<String, String> values,
  String id,
  Future<void> Function()? synchronize,
) async {
  final old = await c.store.db.getAll(
    'SELECT payload FROM local_command WHERE id=? UNION ALL SELECT payload FROM connected_intent WHERE id=?',
    [id, id],
  );
  final command = old.isEmpty
      ? LocalCommand(
          id: id,
          owner: c.store.owner,
          expectedVersion: c.snapshot.version,
          kind: kind,
          values: values,
        )
      : LocalCommand.decode(id, old.first['payload'] as String);
  if (command.kind != kind ||
      command.values.length != values.length ||
      values.entries.any((e) => command.values[e.key] != e.value)) {
    reject(
      'Original import intent differs. Resolve its retained receipt before making a separately reviewed operation.',
    );
  }
  await c.store.commit(command);
  await c.reload();
  if (c.connected) {
    if (synchronize == null) {
      reject(
        'Reconnect to finalize this reviewed import. Your original input is retained.',
      );
    }
    await synchronize();
    await c.reload();
  }
  if ((await c.store.db.getAll('SELECT id FROM local_command WHERE id=?', [
    id,
  ])).isEmpty) {
    final state = await c.store.db.getAll(
      'SELECT state,reason FROM connected_intent WHERE id=?',
      [id],
    );
    reject(
      state.firstOrNull?['state'] == 'review'
          ? 'Import rejected: ${state.first['reason']}. Original input is retained for review.'
          : 'Import remains saved on this device, awaiting accepted downloaded evidence.',
    );
  }
}

class NativeImportScreen extends StatefulWidget {
  const NativeImportScreen({
    super.key,
    required this.controller,
    this.synchronize,
  });
  final LocalFinancialController controller;
  final Future<void> Function()? synchronize;
  @override
  State<NativeImportScreen> createState() => _NativeImportScreenState();
}

class _NativeImportScreenState extends State<NativeImportScreen> {
  static const operation = 'cash-import:review';
  Map<String, String> draft = {};
  String draftId = newLocalId();
  final earlierDate = TextEditingController(),
      earlierAmount = TextEditingController(text: '0.00');
  bool busy = false, loading = true;
  String? error, message;
  int page = 0;
  LocalFinancialController get c => widget.controller;
  LocalRevision? get head => c.snapshot.current
      .where((r) => r.id == draft['batch'] && financeType(r) == 'cashImport')
      .firstOrNull;
  LocalRevision? get preview => c.snapshot.current
      .where(
        (r) =>
            r.id == draft['preview'] && financeType(r) == 'cashImportPreview',
      )
      .firstOrNull;
  LocalRevision? get decision => c.snapshot.current
      .where(
        (r) =>
            r.id == draft['decision'] && financeType(r) == 'cashImportDecision',
      )
      .firstOrNull;
  @override
  void initState() {
    super.initState();
    restore();
  }

  Future<void> restore() async {
    try {
      final saved = await c.store.draft(operation);
      if (saved != null) {
        draft = Map<String, String>.from(saved['values'] as Map);
        draftId = saved['command'] as String;
        earlierDate.text = draft['earlierDate'] ?? '';
        earlierAmount.text = draft['earlierAmount'] ?? '0.00';
        if (preview != null) {
          final rows = cashImportRows(preview!);
          draft.removeWhere((key, _) => key.startsWith('raw'));
          for (var i = 0; i < rows.length; i++) {
            draft.putIfAbsent(
              'choice$i',
              () => jsonEncode({
                'include': (rows[i]['errors'] as List).isEmpty,
                'acknowledgeDuplicates': false,
                'category': rows[i]['kind'] == 'income'
                    ? 'category-income'
                    : 'category-food',
              }),
            );
          }
          await persist();
        }
      }
    } catch (_) {
      error = 'The protected CSV draft could not be read. Reopen this profile.';
    }
    if (mounted) setState(() => loading = false);
  }

  Future<void> writes = Future.value();
  Future<void> persist() {
    final captured = Map<String, String>.from(draft), id = draftId;
    writes = writes
        .catchError((Object _) {})
        .then((_) => c.store.saveDraft(operation, id, captured));
    return writes;
  }

  void change(String key, String value) {
    draft[key] = value;
    unawaited(
      persist().catchError((Object _) {
        if (mounted) {
          setState(
            () => error = 'CSV input could not be saved. Keep this screen open and check storage.',
          );
        }
      }),
    );
  }

  Future<void> run(Future<void> Function() action) async {
    setState(() {
      busy = true;
      error = null;
      message = null;
    });
    try {
      await action();
    } catch (e) {
      if (mounted) {
        error = e is LocalRuleException
            ? e.message
            : e is FormatException
            ? e.message
            : 'Import could not complete. The original input and any committed prior chunks are retained.';
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> choose() async {
    if (draft['process'] != null) {
      reject(
        'Check the original import process result before replacing this retained input.',
      );
    }
    if (draft.isNotEmpty) {
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Start a new CSV review?'),
          content: const Text(
            'This replaces the current unsubmitted input draft. Accepted history, original commands and already staged evidence remain retained.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Keep current review'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Replace this input draft'),
            ),
          ],
        ),
      );
      if (confirmed != true) return;
    }
    final file = await FilePicker.pickFile();
    if (file == null) return;
    final length = await file.length();
    if (length == null || length > 1024 * 1024) {
      reject('Select a UTF-8 cash-history CSV up to 1 MiB.');
    }
    final bytes = await readBoundedFinancialFile(file, 1024 * 1024),
        rows = parseCashCsv(bytes);
    draftId = newLocalId();
    draft = {
      'batch': newLocalId(),
      'preview': newLocalId(),
      'decision': newLocalId(),
      'headDate': civilToday(),
      'checksum': sha256.convert(bytes).toString(),
      'header': jsonEncode(rows.first),
      'rowCount': '${rows.length - 1}',
      'account':
          c.snapshot.accounts.where((a) => !a.archived).firstOrNull?.id ?? '',
      'dateInterpretation': 'YYYY-MM-DD',
      'cutoffStrategy': 'after_opening',
      'earlierDate': '',
      'earlierAmount': '0.00',
      for (final e in const {
        'date': 'date',
        'kind': 'kind',
        'amountMinor': 'amount_minor',
        'classification': 'classification',
        'description': 'description',
        'reference': 'reference',
      }.entries)
        'mapping:${e.key}': rows.first.contains(e.value) ? e.value : '',
      for (var i = 1; i < rows.length; i++) 'raw${i - 1}': jsonEncode(rows[i]),
    };
    earlierDate.clear();
    earlierAmount.text = '0.00';
    await persist();
    message =
        '${rows.length - 1} original rows retained in encrypted local storage. No cash has been posted.';
  }

  Map<String, String> headValues() {
    final assumptions = {
      'sourceFormat': 'pmp-cash-activity',
      'formatVersion': 1,
      'currency': 'PHP',
      'account': draft['account'],
      'mapping': {
        for (final key in [
          'date',
          'kind',
          'amountMinor',
          'classification',
          'description',
          'reference',
        ])
          key: draft['mapping:$key'],
      },
      'dateInterpretation': draft['dateInterpretation'],
      'cutoffStrategy': draft['cutoffStrategy'],
      'earlierDate': draft['cutoffStrategy'] == 'rebase_history'
          ? draft['earlierDate']
          : null,
      'earlierMinor': draft['cutoffStrategy'] == 'rebase_history'
          ? '${parsePhp(draft['earlierAmount'] ?? '')}'
          : null,
    };
    return {
      'name': 'Reviewed pmp-cash-activity version-1 CSV',
      'date': draft['headDate']!,
      'header': draft['header']!,
      'rowCount': draft['rowCount']!,
      'checksum': draft['checksum']!,
      'assumptions': jsonEncode(assumptions),
    };
  }

  Future<void> stage() async {
    await persist();
    if (head == null) {
      await submitCashImport(
        c,
        'cashImport',
        headValues(),
        draft['batch']!,
        widget.synchronize,
      );
    }
    final count = int.parse(draft['rowCount']!);
    for (var offset = 0; offset < count; offset += 16) {
      final size = (count - offset).clamp(0, 16);
      final id = importStableId(
        c.store.owner,
        draft['batch']!,
        'stage/$offset',
      );
      final existing = c.snapshot.revisions.any((r) => r.id == id);
      if (!existing) {
        await submitCashImport(
          c,
          'cashImportChunk',
          {
            'name': 'Original CSV staging rows',
            'date': draft['headDate']!,
            'batch': draft['batch']!,
            'offset': '$offset',
            'rowCount': '$size',
            for (var i = 0; i < size; i++)
              'row$i':
                  draft['raw${offset + i}'] ??
                  reject(
                    'Original staging rows are missing. Restore this retained draft before continuing.',
                  ),
          },
          id,
          widget.synchronize,
        );
      }
      if (mounted) {
        setState(
          () => message =
              'Staged ${(offset + size)} of $count original rows. Financial balances are unchanged.',
        );
      }
    }
    final existing = await c.store.db.getAll(
      'SELECT payload FROM local_command WHERE id=? UNION ALL SELECT payload FROM connected_intent WHERE id=?',
      [draft['preview'], draft['preview']],
    );
    final values = existing.isEmpty
        ? {
            'name': 'Immutable cash CSV preview',
            'date': civilToday(),
            'batch': draft['batch']!,
          }
        : LocalCommand.decode(
            draft['preview']!,
            existing.first['payload'] as String,
          ).values;
    await submitCashImport(
      c,
      'cashImportPreview',
      values,
      draft['preview']!,
      widget.synchronize,
    );
    final rows = cashImportRows(preview!);
    draft.removeWhere((key, _) => key.startsWith('raw'));
    for (var i = 0; i < rows.length; i++) {
      draft.putIfAbsent(
        'choice$i',
        () => jsonEncode({
          'include': (rows[i]['errors'] as List).isEmpty,
          'acknowledgeDuplicates': false,
          'category': rows[i]['kind'] == 'income'
              ? 'category-income'
              : 'category-food',
        }),
      );
    }
    await persist();
    message = 'Preview ready. Review every row, inclusion, category and duplicate warning before confirming.';
  }

  Map<String, dynamic> choice(int i) =>
      Map<String, dynamic>.from(jsonDecode(draft['choice$i']!) as Map);
  Future<void> updateChoice(int i, String key, Object value) async {
    final updated = choice(i)..[key] = value;
    draft['choice$i'] = jsonEncode(updated);
    await persist();
    if (mounted) setState(() {});
  }

  Future<void> confirm() async {
    final rows = cashImportRows(preview!);
    draft.putIfAbsent('decisionDate', civilToday);
    await persist();
    await submitCashImport(
      c,
      'cashImportDecision',
      {
        'name': 'Reviewed CSV row decisions',
        'date': draft['decisionDate']!,
        'preview': preview!.id,
        'rowCount': '${rows.length}',
        'acknowledge': draft['acknowledge'] ?? 'false',
        for (var i = 0; i < rows.length; i++) 'row$i': draft['choice$i']!,
      },
      draft['decision']!,
      widget.synchronize,
    );
    message = 'Row decisions confirmed. No cash has posted yet. Process the next bounded chunk explicitly.';
    await persist();
  }

  Future<void> resumeBatch(LocalRevision batch) async {
    if (draft['process'] != null) {
      reject(
        'Resolve the original in-flight process result before switching batches.',
      );
    }
    final previous = c.snapshot.current
        .where(
          (r) =>
              financeType(r) == 'cashImportPreview' &&
              r.values['batch'] == batch.id,
        )
        .lastOrNull;
    if (previous == null) {
      reject(
        'This batch has incomplete staging. Resume its retained original input draft; no unstaged bytes are invented.',
      );
    }
    final frozen = c.snapshot.current
        .where(
          (r) =>
              financeType(r) == 'cashImportDecision' &&
              r.values['preview'] == previous.id,
        )
        .lastOrNull;
    final assumptions = cashImportAssumptions(batch),
        mapping = assumptions['mapping'] as Map;
    draftId = newLocalId();
    draft = {
      'batch': batch.id,
      'preview': previous.id,
      'decision': frozen?.id ?? newLocalId(),
      'headDate': batch.date,
      'header': batch.values['header']!,
      'checksum': batch.values['checksum']!,
      'rowCount': batch.values['rowCount']!,
      'account': assumptions['account'] as String,
      'dateInterpretation': assumptions['dateInterpretation'] as String,
      'cutoffStrategy': assumptions['cutoffStrategy'] as String,
      'earlierDate': assumptions['earlierDate'] as String? ?? '',
      'earlierAmount': assumptions['earlierMinor'] == null
          ? '0.00'
          : phpDecimal(parseMinor(assumptions['earlierMinor'] as String)),
      'acknowledge': frozen?.values['acknowledge'] ?? 'false',
      for (final e in mapping.entries) 'mapping:${e.key}': e.value as String,
    };
    final rows = cashImportRows(previous);
    for (var i = 0; i < rows.length; i++) {
      draft['choice$i'] =
          frozen?.values['row$i'] ??
          jsonEncode({
            'include': (rows[i]['errors'] as List).isEmpty,
            'acknowledgeDuplicates': false,
            'category': rows[i]['kind'] == 'income'
                ? 'category-income'
                : 'category-food',
          });
    }
    earlierDate.text = draft['earlierDate']!;
    earlierAmount.text = draft['earlierAmount']!;
    page = 0;
    await persist();
    message = 'Retained batch resumed with its original row IDs and committed history.';
  }

  Future<void> refreshPreview() async {
    if (draft['process'] != null) {
      reject('Resolve the original process receipt before a new preview.');
    }
    if (decision != null &&
        selectedCashImportRows(decision!).any(
          (i) => c.snapshot.revisions.any(
            (r) => r.id == cashImportRows(preview!)[i]['rowCommand'],
          ),
        )) {
      reject(
        'A partially processed decision must be resumed or cancelled. Its reviewed batch cannot be reinterpreted.',
      );
    }
    draft['preview'] = newLocalId();
    draft['decision'] = newLocalId();
    draft.remove('decisionDate');
    draft.removeWhere((k, _) => k.startsWith('choice'));
    await persist();
    await stage();
  }

  Future<void> process() async {
    draft.putIfAbsent('process', newLocalId);
    draft.putIfAbsent('processDate', civilToday);
    draft.putIfAbsent(
      'processRows',
      () => jsonEncode(nextCashImportRows(c.snapshot, decision!)),
    );
    await persist();
    await submitCashImport(
      c,
      'cashImportProcess',
      {
        'name': 'Reviewed bounded cash-history import',
        'date': draft['processDate']!,
        'decision': decision!.id,
        'rowNumbers': draft['processRows']!,
      },
      draft['process']!,
      widget.synchronize,
    );
    draft.remove('process');
    draft.remove('processDate');
    draft.remove('processRows');
    await persist();
    message = 'This chunk committed atomically. Original row commands and provenance are retained. Remaining rows can be processed or cancelled.';
  }

  @override
  void dispose() {
    earlierDate.dispose();
    earlierAmount.dispose();
    super.dispose();
  }

  Widget select(String key, String label, Map<String, String> choices) =>
      Padding(
        padding: const EdgeInsets.only(bottom: 14),
        child: DropdownButtonFormField<String>(
          key: ValueKey('csv-$key-${draft[key]}'),
          initialValue: choices.containsKey(draft[key]) ? draft[key] : null,
          isExpanded: true,
          decoration: InputDecoration(labelText: label),
          items: [
            for (final e in choices.entries)
              DropdownMenuItem(
                value: e.key,
                child: Text(e.value, overflow: TextOverflow.ellipsis),
              ),
          ],
          onChanged: busy || head != null
              ? null
              : (v) => run(() async {
                  draft[key] = v ?? '';
                  await persist();
                }),
        ),
      );
  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: c,
    builder: (context, _) {
      final rows = preview == null
          ? <Map<String, dynamic>>[]
          : cashImportRows(preview!);
      final processed = decision == null
          ? 0
          : selectedCashImportRows(decision!)
                .where(
                  (i) => c.snapshot.revisions.any(
                    (r) => r.id == rows[i]['rowCommand'],
                  ),
                )
                .length;
      final cancelled =
          decision != null &&
          c.snapshot.current.any(
            (r) =>
                financeType(r) == 'cashImportCancel' &&
                r.values['decision'] == decision!.id,
          );
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SectionHeading('Import cash activity'),
          const Text(
            'Choose a supported CSV, review its mapping and duplicates, then confirm the rows to import. Cards, debts, transfers and arbitrary bank files are not supported.',
          ),
          const SizedBox(height: 12),
          const WorkspaceHelp(
            title: 'Supported CSV format & limits',
            text: 'Only pmp-cash-activity version 1: PHP income/expense cash history, six explicitly mapped columns, 1 MiB / 500 rows / 16 KiB per record. Cards, debts, transfers, arbitrary bank-provider files and future history are unsupported.',
          ),
          if (c.connected)
            const FinanceNotice(
              'File selection, mapping and retained input work offline. Connected staging, capacity review and atomic processing require current online finalization. Pending metadata is not posted cash.',
            ),
          if (error != null)
            FormStatus(
              title: 'Needs attention',
              message: error!,
              tone: NoticeTone.warning,
            ),
          if (message != null)
            FormStatus(title: 'Import status', message: message!),
          if (loading)
            const LinearProgressIndicator()
          else ...[
            OutlinedButton.icon(
              onPressed: busy ? null : () => run(choose),
              icon: const Icon(Icons.folder_open_outlined),
              label: const Text('Choose CSV & review'),
            ),
            if (draft.isNotEmpty) ...[
              ReviewRow(
                'Original rows',
                draft['rowCount']!,
                detail: head == null ? 'Mapping is editable until staging.' : 'Staged assumptions are immutable. A new file review preserves earlier staged evidence.',
              ),
              FormEvidence(
                children: [
                  SelectableText(
                    'SHA256 ${draft['checksum']}\nOriginal batch: ${draft['batch']}',
                  ),
                ],
              ),
              select('account', 'Owned PHP cash account', {
                for (final a in c.snapshot.accounts.where((a) => !a.archived))
                  a.id: a.name,
              }),
              select('dateInterpretation', 'Explicit CSV date interpretation', {
                'YYYY-MM-DD': 'YYYY-MM-DD',
                'DD/MM/YYYY': 'DD/MM/YYYY',
                'MM/DD/YYYY': 'MM/DD/YYYY',
              }),
              select('cutoffStrategy', 'Opening coverage strategy', {
                'after_opening': 'Only history after the existing opening',
                'rebase_history': 'Rebase opening and all selected historical rows atomically',
              }),
              if (draft['cutoffStrategy'] == 'rebase_history') ...[
                TextField(
                  controller: earlierDate,
                  enabled: !busy && head == null,
                  decoration: const InputDecoration(
                    labelText: 'Earlier opening date · YYYY-MM-DD',
                  ),
                  onChanged: (v) => change('earlierDate', v),
                ),
                TextField(
                  controller: earlierAmount,
                  enabled: !busy && head == null,
                  decoration: const InputDecoration(
                    labelText: 'Earlier opening PHP',
                  ),
                  onChanged: (v) => change('earlierAmount', v),
                ),
                const FinanceNotice(
                  'Coverage equation: earlier opening + selected historical income − selected historical expenses = current opening. No guessed adjustment. Every selected historical row and the opening transition commit together.',
                ),
              ],
              for (final key in [
                'date',
                'kind',
                'amountMinor',
                'classification',
                'description',
                'reference',
              ])
                select('mapping:$key', 'CSV column for $key', {
                  for (final h
                      in (jsonDecode(draft['header']!) as List).cast<String>())
                    h: h,
                }),
              if (preview == null)
                FilledButton(
                  onPressed: busy ? null : () => run(stage),
                  child: Text(
                    busy
                        ? 'Staging original rows…'
                        : 'Stage & generate immutable preview',
                  ),
                ),
              if (preview != null) ...[
                OutlinedButton(
                  onPressed: busy ? null : () => run(refreshPreview),
                  child: const Text(
                    'Refresh stale preview from current sources',
                  ),
                ),
                Text(
                  'Preview ${preview!.id} · as of ${preview!.date} · opening cutoff ${preview!.values['cutoff']}',
                ),
                for (
                  var i = page * 25;
                  i < rows.length && i < (page + 1) * 25;
                  i++
                )
                  EditorialSurface(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(
                          c.amountsHidden
                              ? 'Row ${i + 1}: financial values hidden'
                              : 'Row ${i + 1}: ${rows[i]['name'] ?? 'Invalid row'} · ${rows[i]['date'] ?? ''} · ${rows[i]['amountMinor'] ?? '?'} minor units · ${rows[i]['kind'] ?? ''}',
                        ),
                        for (final e in [
                          ...rows[i]['errors'] as List,
                          ...rows[i]['warnings'] as List,
                        ])
                          Text(e.toString()),
                        CheckboxListTile(
                          value: choice(i)['include'] as bool,
                          title: const Text('Include this reviewed row'),
                          onChanged: busy || decision != null
                              ? null
                              : (v) => run(
                                  () => updateChoice(i, 'include', v ?? false),
                                ),
                        ),
                        if ((rows[i]['warnings'] as List).isNotEmpty)
                          CheckboxListTile(
                            value: choice(i)['acknowledgeDuplicates'] as bool,
                            title: const Text(
                              'I reviewed and acknowledge these duplicate warnings',
                            ),
                            onChanged: busy || decision != null
                                ? null
                                : (v) => run(
                                    () => updateChoice(
                                      i,
                                      'acknowledgeDuplicates',
                                      v ?? false,
                                    ),
                                  ),
                          ),
                        DropdownButtonFormField<String>(
                          initialValue: choice(i)['category'] as String,
                          isExpanded: true,
                          decoration: const InputDecoration(
                            labelText: 'Explicit row category',
                          ),
                          items: [
                            for (final cat in c.snapshot.categories.where(
                              (cat) =>
                                  cat.kind ==
                                  (rows[i]['kind'] == 'income'
                                      ? 'income'
                                      : 'expense'),
                            ))
                              DropdownMenuItem(
                                value: cat.id,
                                child: Text(cat.name),
                              ),
                          ],
                          onChanged: busy || decision != null
                              ? null
                              : (v) => run(
                                  () => updateChoice(i, 'category', v ?? ''),
                                ),
                        ),
                      ],
                    ),
                  ),
                Wrap(
                  spacing: 8,
                  children: [
                    TextButton(
                      onPressed: page == 0
                          ? null
                          : () => setState(() => page--),
                      child: const Text('Previous rows'),
                    ),
                    TextButton(
                      onPressed: (page + 1) * 25 >= rows.length
                          ? null
                          : () => setState(() => page++),
                      child: const Text('Next rows'),
                    ),
                  ],
                ),
                if (decision == null) ...[
                  CheckboxListTile(
                    value: draft['acknowledge'] == 'true',
                    title: const Text(
                      'I acknowledge any reviewed negative cash balance',
                    ),
                    onChanged: busy
                        ? null
                        : (v) => run(() async {
                            draft['acknowledge'] = '${v ?? false}';
                            await persist();
                          }),
                  ),
                  FilledButton(
                    onPressed: busy ? null : () => run(confirm),
                    child: const Text('Confirm exact row decisions'),
                  ),
                ] else ...[
                  FinanceNotice(
                    '$processed of ${selectedCashImportRows(decision!).length} selected rows committed. ${cancelled ? 'Cancelled; earlier committed chunks remain intact.' : 'Processing is bounded and restart safe.'}',
                  ),
                  if (!cancelled &&
                      (processed < selectedCashImportRows(decision!).length ||
                          draft['process'] != null))
                    FilledButton(
                      onPressed: busy ? null : () => run(process),
                      child: const Text('Process next reviewed chunk'),
                    ),
                  if (!cancelled)
                    OutlinedButton(
                      onPressed: busy
                          ? null
                          : () => run(() async {
                              await submitCashImport(
                                c,
                                'cashImportCancel',
                                {
                                  'name': 'Cancel future CSV chunks',
                                  'date': civilToday(),
                                  'decision': decision!.id,
                                },
                                newLocalId(),
                                widget.synchronize,
                              );
                              message = 'Remaining chunks cancelled. Already committed history was retained.';
                            }),
                      child: const Text(
                        'Cancel remaining rows; keep committed history',
                      ),
                    ),
                ],
              ],
            ],
          ],
          const SizedBox(height: 24),
          const SectionHeading('Import history'),
          for (final batch in c.snapshot.current.where(
            (r) => financeType(r) == 'cashImport',
          ))
            TextButton(
              onPressed: busy ? null : () => run(() => resumeBatch(batch)),
              child: Text(
                '${batch.title} · ${batch.date} · ${batch.values['rowCount']} original rows · resume review',
              ),
            ),
        ],
      );
    },
  );
}
