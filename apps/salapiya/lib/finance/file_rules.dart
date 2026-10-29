part of '../local/finance_domain.dart';

const nativeFileCommands = {'financialFile', 'fileDetach'};
bool financialFileDetached(LocalSnapshot s, String id) => s.current.any(
  (r) => financeType(r) == 'fileDetach' && r.values['file'] == id,
);
LocalPlan planFinancialFile(LocalSnapshot s, LocalCommand command) {
  final v = Map<String, String>.from(command.values),
      op = command.kind,
      date = civilDate(v['date'] ?? '');
  final title = (v['name'] ?? '').trim();
  if (title.isEmpty || title.length > 200) {
    reject('Enter a private attachment name up to 200 characters.');
  }
  String? source;
  if (op == 'financialFile') {
    if (!['application/pdf', 'image/jpeg', 'image/png'].contains(v['mime']) ||
        !RegExp(r'^[a-f0-9]{64}$').hasMatch(v['checksum'] ?? '')) {
      reject('Choose a bounded PDF, JPEG or PNG with exact checksum metadata.');
    }
    final size = parseMinor(v['size'] ?? '');
    if (size <= BigInt.zero ||
        size > BigInt.from(10 * 1024 * 1024) ||
        RegExp(r'[\\/:\x00-\x1f\x7f]').hasMatch(title)) {
      reject('Attachment name or 10 MiB size bound is invalid.');
    }
    final original = s.revision(v['sourceRevision'] ?? '');
    if (nativeFileCommands.contains(financeType(original)) ||
        [
          'cashImport',
          'cashImportChunk',
          'cashImportPreview',
          'cashImportDecision',
          'cashImportProcess',
          'cashImportCancel',
        ].contains(financeType(original))) {
      reject(
        'Link supporting files to a concrete financial source or exact provider revision.',
      );
    }
    final files = s.current.where(
      (r) =>
          financeType(r) == 'financialFile' && !financialFileDetached(s, r.id),
    );
    if (files.length >= 1000 ||
        sumMinor(files.map((r) => parseMinor(r.values['size']!))) + size >
            BigInt.from(1024 * 1024 * 1024)) {
      reject(
        'Private supporting-file metadata exceeds the 1,000-object / 1 GiB bound.',
      );
    }
    source = original.id;
    v.addAll({
      'cloudState': 'unavailable_unscanned',
      'byteCoverage': 'device-local-only',
      'sourceKind': financeType(original),
    });
  } else if (op == 'fileDetach') {
    final file = financeSource(s, v['file'] ?? '', {'financialFile'});
    if (financialFileDetached(s, file.id) ||
        (v['reason'] ?? '').trim().isEmpty) {
      reject('Choose an attached file and explain archiving its link.');
    }
    source = file.id;
  } else {
    reject('Unsupported supporting-file command.');
  }
  v.addAll({'financeType': op, 'financeContract': '1'});
  return LocalPlan(
    revision: LocalRevision(
      id: command.id,
      actionId: command.id,
      kind: 'adjustment',
      change: 'create',
      date: date,
      title: title,
      amount: BigInt.zero,
      values: v,
      postings: const [],
      number: 1,
      source: source,
    ),
    effects: [
      'Private supporting metadata only. No cash, spending, liability or group records change.',
      'Cloud bytes remain unavailable: production storage/scanning is not verified. Local presence and byte integrity are checked separately.',
    ],
  );
}
