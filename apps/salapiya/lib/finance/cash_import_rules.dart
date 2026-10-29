part of '../local/finance_domain.dart';

const nativeCashImportCommands = {
  'cashImport',
  'cashImportChunk',
  'cashImportPreview',
  'cashImportDecision',
  'cashImportProcess',
  'cashImportCancel',
  'cashOpeningRebase',
};
String cashImportJson(Object? value) {
  Object? ordered(Object? v) {
    if (v is Map) {
      final keys = v.keys.cast<String>().toList()..sort();
      return {for (final k in keys) k: ordered(v[k])};
    }
    if (v is List) return v.map(ordered).toList();
    return v;
  }

  return jsonEncode(ordered(value));
}

String importStableId(String owner, String batch, Object row) {
  final bytes = crypto.sha256
      .convert(utf8.encode('pmp/import/v1/$owner/$batch/$row'))
      .bytes
      .take(16)
      .toList();
  bytes[6] = (bytes[6] & 15) | 80;
  bytes[8] = (bytes[8] & 63) | 128;
  final h = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  return '${h.substring(0, 8)}-${h.substring(8, 12)}-${h.substring(12, 16)}-${h.substring(16, 20)}-${h.substring(20)}';
}

void validateCashCsvSyntax(List<int> bytes) {
  if (bytes.isEmpty || bytes.length > 1024 * 1024) {
    reject('Choose UTF-8 cash CSV up to 1 MiB.');
  }
  var state = 0, size = 0; // start, unquoted, quoted, after quote
  var start =
      bytes.length >= 3 && bytes[0] == 239 && bytes[1] == 187 && bytes[2] == 191
      ? 3
      : 0;
  for (var i = start; i < bytes.length; i++) {
    final b = bytes[i];
    if (b == 0) reject('CSV cannot contain NUL bytes.');
    if (++size > 16 * 1024) reject('A CSV record exceeds 16 KiB.');
    if (state != 2 && (b == 10 || b == 13)) {
      if (b == 13 && i + 1 < bytes.length && bytes[i + 1] == 10) i++;
      state = 0;
      size = 0;
      continue;
    }
    if (state == 0) {
      if (b == 34) {
        state = 2;
      } else if (b != 44) {
        state = 1;
      }
    } else if (state == 1) {
      if (b == 34) reject('Unexpected quote in an unquoted CSV field.');
      if (b == 44) state = 0;
    } else if (state == 2) {
      if (b == 34) state = 3;
    } else {
      if (b == 34) {
        state = 2;
      } else if (b == 44) {
        state = 0;
      } else {
        reject('Unexpected characters after a quoted CSV field.');
      }
    }
  }
  if (state == 2) reject('CSV has an unterminated quoted field.');
}

List<List<String>> parseCashCsv(List<int> bytes) {
  validateCashCsvSyntax(bytes);
  final text = utf8
      .decode(bytes, allowMalformed: false)
      .replaceFirst(RegExp('^\uFEFF'), '');
  final rows = csv.Csv(fieldDelimiter: ',', dynamicTyping: false)
      .decode(text)
      .map((r) => r.map((v) => v.toString()).toList())
      .where((r) => !(r.length == 1 && r.single.isEmpty))
      .toList();
  if (rows.length < 2 ||
      rows.length > 501 ||
      rows.first.length != 6 ||
      rows.first.toSet().length != 6 ||
      rows.any((r) => r.length != 6)) {
    reject(
      'The version-1 cash contract requires six distinct mapped columns and 1–500 rows.',
    );
  }
  return rows;
}

String cashImportSourceStamp(LocalSnapshot s, String account) {
  final a = s.account(account),
      ids =
          s.current
              .where(
                (r) =>
                    r.postings.any((p) => p.account == account) ||
                    r.kind == 'opening' && r.actionId == account,
              )
              .map((r) => r.id)
              .toList()
            ..sort();
  return crypto.sha256
      .convert(utf8.encode('${a.cutoff}|${ids.join('|')}'))
      .toString();
}

LocalRevision cashImportHead(LocalSnapshot s, String batch) =>
    financeSource(s, batch, {'cashImport'});
Map<String, dynamic> cashImportAssumptions(LocalRevision head) =>
    Map<String, dynamic>.from(jsonDecode(head.values['assumptions']!) as Map);
List<Map<String, dynamic>> cashImportRows(LocalRevision preview) =>
    List.generate(
      int.parse(preview.values['rowCount']!),
      (i) => Map<String, dynamic>.from(
        jsonDecode(preview.values['row$i']!) as Map,
      ),
    );
List<Map<String, dynamic>> cashImportDecisions(LocalRevision decision) =>
    List.generate(
      int.parse(decision.values['rowCount']!),
      (i) => Map<String, dynamic>.from(
        jsonDecode(decision.values['row$i']!) as Map,
      ),
    );
String cashRowDate(String raw, String interpretation) {
  if (interpretation == 'YYYY-MM-DD') return civilDate(raw);
  final match = RegExp(r'^(\d{2})/(\d{2})/(\d{4})$').firstMatch(raw);
  if (match == null || !['DD/MM/YYYY', 'MM/DD/YYYY'].contains(interpretation)) {
    reject('CSV date interpretation mismatch.');
  }
  return civilDate(
    '${match[3]}-${interpretation == 'DD/MM/YYYY' ? match[2] : match[1]}-${interpretation == 'DD/MM/YYYY' ? match[1] : match[2]}',
  );
}

Map<String, dynamic> normalizeCashRow(
  List<String> cells,
  List<String> header,
  Map<String, dynamic> a,
  String cutoff,
  String today,
) {
  final errors = <String>[], row = <String, dynamic>{};
  try {
    final mapping = Map<String, dynamic>.from(a['mapping'] as Map);
    String value(String key) => cells[header.indexOf(mapping[key] as String)];
    final date = cashRowDate(value('date'), a['dateInterpretation'] as String),
        kind = value('kind'),
        classification = value('classification');
    final amount = component(parseMinor(value('amountMinor')), positive: true);
    final name = value('description').trim(),
        reference = value('reference').trim();
    if (!['income', 'expense'].contains(kind) ||
        !(kind == 'expense'
            ? classification == 'expense'
            : ['earned', 'gift', 'reward', 'other'].contains(classification)) ||
        name.isEmpty ||
        name.length > 2000 ||
        reference.length > 200) {
      reject('Invalid cash row classification, description or reference.');
    }
    row.addAll({
      'date': date,
      'kind': kind,
      'amountMinor': '$amount',
      'classification': classification,
      'name': name,
      'reference': reference,
    });
    if (date.compareTo(cutoff) <= 0) {
      errors.add('Date must follow the confirmed opening cutoff.');
    }
    if (date.compareTo(today) > 0) {
      errors.add('Future cash history is unsupported.');
    }
    row['fingerprint'] = crypto.sha256
        .convert(
          utf8.encode(
            jsonEncode([
              date,
              kind,
              '$amount',
              classification,
              name,
              reference.isEmpty ? null : reference,
            ]),
          ),
        )
        .toString();
  } catch (_) {
    errors.add('Mapping or row values are invalid.');
  }
  return {...row, 'errors': errors};
}

List<int> selectedCashImportRows(LocalRevision decision) =>
    cashImportDecisions(decision)
        .asMap()
        .entries
        .where((e) => e.value['include'] == true)
        .map((e) => e.key)
        .toList();
List<int> nextCashImportRows(LocalSnapshot s, LocalRevision decision) {
  final preview = financeSource(s, decision.values['preview']!, {
        'cashImportPreview',
      }),
      head = cashImportHead(s, preview.values['batch']!);
  final a = cashImportAssumptions(head), rows = cashImportRows(preview);
  final selected = selectedCashImportRows(decision)
      .where(
        (i) => !s.revisions.any(
          (r) => r.id == importStableId(s.owner, head.id, i + 1),
        ),
      )
      .toList();
  if (a['cutoffStrategy'] == 'rebase_history' &&
      !s.revisions.any(
        (r) => r.id == importStableId(s.owner, head.id, 'rebase'),
      )) {
    return selected
        .where(
          (i) =>
              (rows[i]['date'] as String).compareTo(
                preview.values['cutoff']!,
              ) <=
              0,
        )
        .toList();
  }
  return selected.take(50).toList();
}

LocalPlan planCashImport(LocalSnapshot s, LocalCommand cmd) {
  final v = Map<String, String>.from(cmd.values),
      op = cmd.kind,
      date = civilDate(v['date'] ?? ''),
      name = (v['name'] ?? '').trim();
  if (name.isEmpty || name.length > 2000) {
    reject('Enter an import description.');
  }
  v.addAll({'financeType': op, 'financeContract': '1'});
  String? source;
  LocalRevision? old;
  Map<String, String>? cutoffUpdate;
  final posts = <LocalPosting>[];
  var total = BigInt.zero;
  if (op == 'cashImport') {
    final a = Map<String, dynamic>.from(
      jsonDecode(v['assumptions'] ?? '') as Map,
    );
    if (a.keys.toSet().difference({
          'sourceFormat',
          'formatVersion',
          'currency',
          'account',
          'mapping',
          'dateInterpretation',
          'cutoffStrategy',
          'earlierDate',
          'earlierMinor',
        }).isNotEmpty ||
        a['sourceFormat'] != 'pmp-cash-activity' ||
        a['formatVersion'] != 1 ||
        a['currency'] != 'PHP' ||
        ![
          'YYYY-MM-DD',
          'DD/MM/YYYY',
          'MM/DD/YYYY',
        ].contains(a['dateInterpretation']) ||
        !['after_opening', 'rebase_history'].contains(a['cutoffStrategy'])) {
      reject('Use the explicit pmp-cash-activity version-1 PHP contract.');
    }
    final account = s.account(a['account'] as String);
    if (account.archived) reject('Choose an active cash account.');
    final header = (jsonDecode(v['header'] ?? '') as List).cast<String>(),
        mapping = Map<String, dynamic>.from(a['mapping'] as Map);
    if (header.length != 6 ||
        header.any(
          (h) =>
              h.trim().isEmpty ||
              h.length > 200 ||
              RegExp(r'[\x00-\x1f\x7f]').hasMatch(h),
        ) ||
        header.toSet().length != 6 ||
        mapping.length != 6 ||
        !mapping.keys.toSet().containsAll({
          'date',
          'kind',
          'amountMinor',
          'classification',
          'description',
          'reference',
        }) ||
        mapping.values.toSet().length != 6 ||
        mapping.values.any((x) => !header.contains(x))) {
      reject('Map all six distinct CSV columns explicitly.');
    }
    final count = int.tryParse(v['rowCount'] ?? '') ?? 0;
    if (count < 1 ||
        count > 500 ||
        !RegExp(r'^[a-f0-9]{64}$').hasMatch(v['checksum'] ?? '')) {
      reject('Invalid bounded CSV identity or row count.');
    }
    if (a['cutoffStrategy'] == 'rebase_history') {
      if (civilDate(a['earlierDate'] as String).compareTo(account.cutoff) >=
              0 ||
          parseMinor(a['earlierMinor'] as String) < BigInt.zero ||
          parseMinor(a['earlierMinor'] as String) > maxComponent) {
        reject(
          'Supply an exact earlier opening date and nonnegative baseline.',
        );
      }
    } else if (a['earlierDate'] != null || a['earlierMinor'] != null) {
      reject('An after-opening import cannot change its opening.');
    }
    v['cutoff'] = account.cutoff;
  } else if (op == 'cashImportChunk') {
    final head = cashImportHead(s, v['batch'] ?? '');
    source = head.id;
    final offset = int.tryParse(v['offset'] ?? '') ?? -1,
        count = int.tryParse(v['rowCount'] ?? '') ?? 0;
    if (offset < 0 ||
        count < 1 ||
        count > 16 ||
        offset + count > int.parse(head.values['rowCount']!)) {
      reject('Stage 1–16 bounded CSV rows within this batch.');
    }
    if (cmd.id != importStableId(s.owner, head.id, 'stage/$offset') ||
        s.current.any(
          (r) =>
              financeType(r) == op &&
              r.values['batch'] == head.id &&
              r.values['offset'] == v['offset'],
        )) {
      reject('Use the original staged chunk identity.');
    }
    for (var i = 0; i < count; i++) {
      final cells = (jsonDecode(v['row$i'] ?? '') as List).cast<String>();
      if (cells.length != 6) {
        reject('A staged row requires exactly six string cells.');
      }
    }
  } else if (op == 'cashImportPreview') {
    final head = cashImportHead(s, v['batch'] ?? '');
    source = head.id;
    final a = cashImportAssumptions(head),
        account = s.account(a['account'] as String);
    if (account.archived || account.cutoff != head.values['cutoff']) {
      reject('The account opening changed; review a new CSV batch.');
    }
    final header = (jsonDecode(head.values['header']!) as List).cast<String>(),
        count = int.parse(head.values['rowCount']!);
    final staged = <int, List<String>>{};
    for (final chunk in s.current.where(
      (r) =>
          financeType(r) == 'cashImportChunk' && r.values['batch'] == head.id,
    )) {
      for (var i = 0; i < int.parse(chunk.values['rowCount']!); i++) {
        final n = int.parse(chunk.values['offset']!) + i;
        if (staged.containsKey(n)) reject('CSV staged rows overlap.');
        staged[n] = (jsonDecode(chunk.values['row$i']!) as List).cast<String>();
      }
    }
    if (staged.length != count ||
        List.generate(count, (i) => i).any((i) => !staged.containsKey(i))) {
      reject('The CSV batch is not completely staged.');
    }
    final seen = <String>{}, refs = <String>{};
    for (final r in s.current.where(
      (r) =>
          ['expense', 'income'].contains(r.kind) &&
          r.values['account'] == account.id &&
          r.values['funding'] != 'card',
    )) {
      seen.add(
        crypto.sha256
            .convert(
              utf8.encode(
                jsonEncode([
                  r.date,
                  r.kind,
                  '${r.amount}',
                  r.kind == 'expense' ? 'expense' : r.values['incomeClass'],
                  r.title,
                  (r.values['reference'] ?? '').isEmpty
                      ? null
                      : r.values['reference'],
                ]),
              ),
            )
            .toString(),
      );
      if ((r.values['reference'] ?? '').isNotEmpty) {
        refs.add(r.values['reference']!);
      }
    }
    final identical = s.current.any(
      (r) =>
          financeType(r) == 'cashImport' &&
          r.id != head.id &&
          r.values['checksum'] == head.values['checksum'],
    );
    for (var i = 0; i < count; i++) {
      final row = normalizeCashRow(
            staged[i]!,
            header,
            a,
            a['cutoffStrategy'] == 'rebase_history'
                ? a['earlierDate'] as String
                : account.cutoff,
            date,
          ),
          warnings = <String>[];
      if (row['fingerprint'] != null) {
        if (!seen.add(row['fingerprint'] as String)) {
          warnings.add('Matching cash activity');
        }
        if ((row['reference'] as String).isNotEmpty &&
            !refs.add(row['reference'] as String)) {
          warnings.add('Matching reference');
        }
      }
      if (identical) warnings.add('Identical file checksum');
      row.addAll({
        'warnings': warnings,
        'rowCommand': importStableId(s.owner, head.id, i + 1),
        'sourceRowHash': crypto.sha256
            .convert(utf8.encode(jsonEncode(staged[i])))
            .toString(),
      });
      v['row$i'] = cashImportJson(row);
    }
    final opening = s.current
        .where((r) => r.kind == 'opening' && r.actionId == account.id)
        .single;
    v.addAll({
      'rowCount': '$count',
      'sourceStamp': cashImportSourceStamp(s, account.id),
      'cutoff': account.cutoff,
      'openingMinor': '${opening.amount}',
      'openingSource': opening.id,
    });
  } else {
    final decision = op == 'cashImportDecision'
        ? null
        : financeSource(s, v['decision'] ?? '', {'cashImportDecision'});
    final preview = financeSource(
          s,
          decision?.values['preview'] ?? v['preview'] ?? '',
          {'cashImportPreview'},
        ),
        head = cashImportHead(s, preview.values['batch']!);
    final a = cashImportAssumptions(head),
        rows = cashImportRows(preview),
        account = s.account(a['account'] as String);
    source = decision?.id ?? preview.id;
    if (op == 'cashImportDecision') {
      if (cashImportSourceStamp(s, account.id) !=
          preview.values['sourceStamp']) {
        reject('Cash sources changed after preview; generate a fresh preview.');
      }
      if (v['rowCount'] != preview.values['rowCount'] ||
          s.current.any(
            (r) => financeType(r) == op && r.values['preview'] == preview.id,
          )) {
        reject('Freeze one complete set of row decisions for this preview.');
      }
      for (var i = 0; i < rows.length; i++) {
        final choice = Map<String, dynamic>.from(
          jsonDecode(v['row$i'] ?? '') as Map,
        );
        if (choice.keys.toSet().difference({
              'include',
              'acknowledgeDuplicates',
              'category',
            }).isNotEmpty ||
            choice['include'] is! bool ||
            choice['acknowledgeDuplicates'] is! bool ||
            choice['category'] is! String) {
          reject(
            'Review an explicit inclusion and category decision for every row.',
          );
        }
        if (choice['include'] == true) {
          if ((rows[i]['errors'] as List).isNotEmpty ||
              ((rows[i]['warnings'] as List).isNotEmpty &&
                  choice['acknowledgeDuplicates'] != true)) {
            reject(
              'Fix invalid rows or acknowledge duplicate warnings before including them.',
            );
          }
          s.category(
            choice['category'] as String,
            rows[i]['kind'] == 'income' ? 'income' : 'expense',
          );
        }
      }
      if (v['acknowledge'] != 'true' && v['acknowledge'] != 'false') {
        reject('Disclose negative-balance consent explicitly.');
      }
    } else if (op == 'cashImportCancel') {
      if (s.current.any(
        (r) => financeType(r) == op && r.values['decision'] == decision!.id,
      )) {
        reject('This import is already cancelled.');
      }
    } else {
      if (s.current.any(
        (r) =>
            financeType(r) == 'cashImportCancel' &&
            r.values['decision'] == decision!.id,
      )) {
        reject(
          'This import was cancelled; committed prior batches remain retained.',
        );
      }
      final choices = cashImportDecisions(decision!),
          selected = selectedCashImportRows(decision);
      if (op == 'cashOpeningRebase') {
        final process = financeSource(s, v['importProcess'] ?? '', {
          'cashImportProcess',
        });
        if (process.values['decision'] != decision.id ||
            a['cutoffStrategy'] != 'rebase_history' ||
            cmd.id != importStableId(s.owner, head.id, 'rebase')) {
          reject('Use the authorized atomic CSV opening transition.');
        }
        old = s.current
            .where((r) => r.kind == 'opening' && r.actionId == account.id)
            .single;
        if (old.id != preview.values['openingSource'] ||
            account.cutoff != preview.values['cutoff']) {
          reject('Opening evidence changed before rebase.');
        }
        total = parseMinor(a['earlierMinor'] as String);
        final historical = selected.where(
          (i) => (rows[i]['date'] as String).compareTo(account.cutoff) <= 0,
        );
        final net = sumMinor(
          historical.map(
            (i) =>
                (rows[i]['kind'] == 'income' ? BigInt.one : -BigInt.one) *
                parseMinor(rows[i]['amountMinor'] as String),
          ),
        );
        if (total + net != old.amount) {
          reject(
            'Earlier opening plus selected historical net movement must equal the original opening exactly.',
          );
        }
        final earlier = civilDate(a['earlierDate'] as String);
        cutoffUpdate = {
          'account': account.id,
          'from': account.cutoff,
          'to': earlier,
        };
        source = process.id;
        if (total != BigInt.zero) {
          posts.add(LocalPosting('cash', total, earlier, account: account.id));
          posts.add(LocalPosting('equity', -total, earlier));
        }
      } else if (op == 'cashImportProcess') {
        final numbers = (jsonDecode(v['rowNumbers'] ?? '') as List).cast<int>(),
            expected = nextCashImportRows(s, decision);
        if (jsonEncode(numbers) != jsonEncode(expected)) {
          reject(
            'Review the next original bounded import chunk without changing its row identities.',
          );
        }
        final started = s.current.any(
          (r) => financeType(r) == op && r.values['decision'] == decision.id,
        );
        if (!started &&
            cashImportSourceStamp(s, account.id) !=
                preview.values['sourceStamp']) {
          reject('Initial cash import preview is stale.');
        }
        final rebase =
            a['cutoffStrategy'] == 'rebase_history' &&
            !s.revisions.any(
              (r) => r.id == importStableId(s.owner, head.id, 'rebase'),
            );
        if (rebase) {
          final net = sumMinor(
            selected
                .where(
                  (i) =>
                      (rows[i]['date'] as String).compareTo(account.cutoff) <=
                      0,
                )
                .map(
                  (i) =>
                      (rows[i]['kind'] == 'income' ? BigInt.one : -BigInt.one) *
                      parseMinor(rows[i]['amountMinor'] as String),
                ),
          );
          if (parseMinor(a['earlierMinor'] as String) + net !=
              parseMinor(preview.values['openingMinor']!)) {
            reject(
              'The exact historical opening coverage equation does not reconcile.',
            );
          }
        } else if (numbers.isEmpty) {
          reject('All selected rows are already committed.');
        }
        final dates = {
          ...s.current
              .expand((r) => r.postings)
              .where((p) => p.account == account.id)
              .map((p) => p.date),
          ...numbers.map((i) => rows[i]['date'] as String),
        };
        for (final on in dates) {
          var balance = s.balance(account.id, through: on);
          if (rebase) {
            if (preview.values['cutoff']!.compareTo(on) <= 0) {
              balance -= parseMinor(preview.values['openingMinor']!);
            }
            if ((a['earlierDate'] as String).compareTo(on) <= 0) {
              balance += parseMinor(a['earlierMinor'] as String);
            }
          }
          balance += sumMinor(
            numbers
                .where((i) => (rows[i]['date'] as String).compareTo(on) <= 0)
                .map(
                  (i) =>
                      (rows[i]['kind'] == 'income' ? BigInt.one : -BigInt.one) *
                      parseMinor(rows[i]['amountMinor'] as String),
                ),
          );
          if (balance < BigInt.zero &&
              decision.values['acknowledge'] != 'true') {
            reject('Reviewed import would produce a negative cash balance.');
          }
        }
        for (final i in numbers) {
          if (choices[i]['include'] != true) {
            reject('The process contains an unconfirmed row.');
          }
        }
      } else {
        reject('Unsupported cash import operation.');
      }
    }
  }
  return LocalPlan(
    cutoffUpdate: cutoffUpdate,
    revision: LocalRevision(
      id: cmd.id,
      actionId: old?.actionId ?? cmd.id,
      kind: old == null ? 'adjustment' : 'opening',
      change: old == null ? 'create' : 'replace',
      date: cutoffUpdate?['to'] ?? date,
      title: name,
      amount: total,
      values: v,
      postings: posts,
      number: (old?.number ?? 0) + 1,
      previous: old?.id,
      source: source,
    ),
    effects: [
      if (cutoffUpdate != null)
        'Rebase the opening to ${cutoffUpdate['to']}; commit every selected historical row in the same transaction.'
      else
        'Reviewed import evidence only. Rows post only in the atomic bounded processing command.',
    ],
  );
}

List<LocalCommand> cashImportChildren(LocalSnapshot s, LocalCommand process) {
  final decision = financeSource(s, process.values['decision']!, {
        'cashImportDecision',
      }),
      preview = financeSource(s, decision.values['preview']!, {
        'cashImportPreview',
      }),
      head = cashImportHead(s, preview.values['batch']!);
  final a = cashImportAssumptions(head),
      rows = cashImportRows(preview),
      choices = cashImportDecisions(decision),
      numbers = (jsonDecode(process.values['rowNumbers']!) as List).cast<int>();
  final result = <LocalCommand>[];
  var version = s.version;
  if (a['cutoffStrategy'] == 'rebase_history' &&
      !s.revisions.any(
        (r) => r.id == importStableId(s.owner, head.id, 'rebase'),
      )) {
    result.add(
      LocalCommand(
        id: importStableId(s.owner, head.id, 'rebase'),
        owner: s.owner,
        expectedVersion: version++,
        kind: 'cashOpeningRebase',
        values: {
          'name': 'Confirmed historical opening rebase',
          'date': process.values['date']!,
          'decision': decision.id,
          'importProcess': process.id,
          'account': a['account'] as String,
        },
      ),
    );
  }
  for (final i in numbers) {
    final row = rows[i];
    result.add(
      LocalCommand(
        id: importStableId(s.owner, head.id, i + 1),
        owner: s.owner,
        expectedVersion: version++,
        kind: row['kind'] as String,
        values: {
          'name': row['name'] as String,
          'date': row['date'] as String,
          'amount': phpDecimal(parseMinor(row['amountMinor'] as String)),
          'account': a['account'] as String,
          'category': choices[i]['category'] as String,
          if (row['kind'] == 'income')
            'incomeClass': row['classification'] as String,
          'reference': row['reference'] as String,
          'acknowledge': 'true',
          'importProcess': process.id,
          'importBatch': head.id,
          'importRow': '${i + 1}',
          'importFingerprint': row['fingerprint'] as String,
          'importFile': head.values['checksum']!,
        },
      ),
    );
  }
  return result;
}

void validateCashImportChild(LocalSnapshot s, LocalCommand cmd) {
  final process = financeSource(s, cmd.values['importProcess'] ?? '', {
    'cashImportProcess',
  });
  final root = LocalCommand(
    id: process.id,
    owner: s.owner,
    expectedVersion: s.version,
    kind: 'cashImportProcess',
    values: process.values,
  );
  final expected = cashImportChildren(
    s,
    root,
  ).where((c) => c.id == cmd.id && c.kind == cmd.kind).firstOrNull;
  if (expected == null ||
      expected.values.length != cmd.values.length ||
      expected.values.entries.any((e) => cmd.values[e.key] != e.value)) {
    reject(
      'Imported row provenance or original command identity differs from its reviewed batch.',
    );
  }
}
