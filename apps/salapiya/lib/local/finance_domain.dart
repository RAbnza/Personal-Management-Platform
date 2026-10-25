import 'dart:convert';
import 'dart:math';

import '../p0/exact_money.dart';

// Native M01–M03 rules. The UI and SQLite writer use this same planner.
// Signed postings: cash/expense are debits, income/equity are credits.
String newLocalId() {
  final r = Random.secure();
  final b = List<int>.generate(16, (_) => r.nextInt(256));
  b[6] = (b[6] & 15) | 64;
  b[8] = (b[8] & 63) | 128;
  final h = b.map((x) => x.toRadixString(16).padLeft(2, '0')).join();
  return '${h.substring(0, 8)}-${h.substring(8, 12)}-${h.substring(12, 16)}-${h.substring(16, 20)}-${h.substring(20)}';
}

String civilToday() => DateTime.now()
    .toUtc()
    .add(const Duration(hours: 8))
    .toIso8601String()
    .substring(0, 10);
String civilDate(String value) {
  final d = DateTime.tryParse(value);
  if (!RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(value) ||
      d == null ||
      d.toIso8601String().substring(0, 10) != value ||
      d.year < 1900 ||
      d.year > 9999) {
    throw const FormatException(
      'Enter a valid date as YYYY-MM-DD (1900–9999).',
    );
  }
  return value;
}

String phpDecimal(BigInt value) =>
    '${value.isNegative ? '-' : ''}${value.abs() ~/ BigInt.from(100)}.${(value.abs() % BigInt.from(100)).toString().padLeft(2, '0')}';
BigInt signedPhp(String value) =>
    value.startsWith('-') ? -parsePhp(value.substring(1)) : parsePhp(value);
BigInt sumMinor(Iterable<BigInt> values) =>
    values.fold(BigInt.zero, (a, b) => a + b);

class LocalRuleException implements Exception {
  const LocalRuleException(this.message);
  final String message;
  @override
  String toString() => message;
}

Never reject(String message) => throw LocalRuleException(message);

class LocalAccount {
  const LocalAccount(
    this.id,
    this.name,
    this.kind,
    this.cutoff,
    this.archived,
    this.institution,
    this.notes,
  );
  final String id, name, kind, cutoff, institution, notes;
  final bool archived;
}

class LocalCategory {
  const LocalCategory(this.id, this.name, this.kind);
  final String id, name, kind;
}

class LocalPosting {
  const LocalPosting(
    this.ledger,
    this.amount,
    this.date, {
    this.account,
    this.category,
  });
  final String ledger, date;
  final String? account, category;
  final BigInt amount;
}

class LocalRevision {
  const LocalRevision({
    required this.id,
    required this.actionId,
    required this.kind,
    required this.change,
    required this.date,
    required this.title,
    required this.amount,
    required this.values,
    required this.postings,
    required this.number,
    this.previous,
    this.source,
  });
  final String id, actionId, kind, change, date, title;
  final String? previous, source;
  final BigInt amount;
  final int number;
  final Map<String, String> values;
  final List<LocalPosting> postings;
}

class LocalSnapshot {
  const LocalSnapshot({
    required this.owner,
    required this.version,
    required this.accounts,
    required this.categories,
    required this.revisions,
    this.projectionConflicts = const {},
  });
  final String owner;
  final int version;
  final List<LocalAccount> accounts;
  final List<LocalCategory> categories;
  final List<LocalRevision> revisions;
  final Set<String> projectionConflicts;
  Set<String> get superseded =>
      revisions.map((r) => r.previous).nonNulls.toSet();
  List<LocalRevision> get current {
    final old = superseded;
    return revisions
        .where((r) => !old.contains(r.id) && r.change != 'reverse')
        .toList();
  }

  BigInt balance(String id, {String? through, String? excluding}) => sumMinor(
    current
        .where((r) => r.id != excluding)
        .expand((r) => r.postings)
        .where(
          (p) =>
              p.account == id &&
              (through == null || p.date.compareTo(through) <= 0),
        )
        .map((p) => p.amount),
  );
  LocalRevision revision(String id) =>
      revisions.where((r) => r.id == id).firstOrNull ??
      (reject('The source is unavailable in this profile.'));
  LocalAccount account(String id) =>
      accounts.where((a) => a.id == id).firstOrNull ??
      (reject('Choose an account in this profile.'));
  LocalCategory category(String id, String kind) {
    final c = categories.where((c) => c.id == id && c.kind == kind).firstOrNull;
    return c ?? (reject('Choose an appropriate $kind category.'));
  }
}

class LocalCommand {
  const LocalCommand({
    required this.id,
    required this.owner,
    required this.expectedVersion,
    required this.kind,
    required this.values,
  });
  final String id, owner, kind;
  final int expectedVersion;
  final Map<String, String> values;
  String get payload {
    final keys = values.keys.toList()..sort();
    return jsonEncode({
      'contract': 1,
      'authority': 'local',
      'owner': owner,
      'expectedVersion': expectedVersion,
      'kind': kind,
      'values': {for (final k in keys) k: values[k]},
    });
  }

  factory LocalCommand.decode(String id, String payload) {
    final v = jsonDecode(payload) as Map<String, dynamic>;
    if (v['contract'] != 1 || v['authority'] != 'local') {
      reject('Unsupported command contract.');
    }
    return LocalCommand(
      id: id,
      owner: v['owner'] as String,
      expectedVersion: v['expectedVersion'] as int,
      kind: v['kind'] as String,
      values: Map<String, String>.from(v['values'] as Map),
    );
  }
}

class LocalPlan {
  LocalPlan({
    this.revision,
    this.account,
    this.category,
    this.archiveId,
    this.comparison,
    required this.effects,
  });
  final LocalRevision? revision;
  final LocalAccount? account;
  final LocalCategory? category;
  final String? archiveId;
  final Map<String, String>? comparison;
  final List<String> effects;
}

// All accepted financial changes go through this function again under the write lock.
LocalPlan planLocal(LocalSnapshot s, LocalCommand cmd) {
  if (cmd.owner != s.owner) reject('This command belongs to another profile.');
  if (cmd.expectedVersion != s.version) {
    reject('Financial sources changed. Review a fresh preview.');
  }
  if (!RegExp(r'^[0-9a-f-]{36}$').hasMatch(cmd.id)) {
    reject('Invalid command identity.');
  }
  final v = cmd.values;
  String value(String key) => (v[key] ?? '').trim();
  String requiredText(String key, {int max = 2000}) {
    final x = value(key);
    if (x.isEmpty || x.length > max) reject('Enter $key (1–$max characters).');
    return x;
  }

  if (v.values.any((x) => x.length > 20000) || v.length > 512) {
    reject('The form exceeds the supported size.');
  }
  BigInt amount(String key, {bool zero = false, bool signed = false}) {
    try {
      final x = signed ? signedPhp(value(key)) : parsePhp(value(key));
      if (zero && x == BigInt.zero) return x;
      return component(x, positive: !signed);
    } on FormatException {
      reject('Enter $key as an exact PHP amount with at most two decimals.');
    } on RangeError {
      reject(
        '$key must be ${zero ? 'zero or ' : ''}${signed ? 'a signed' : 'a positive'} amount within PHP 1 billion.',
      );
    }
  }

  // Omitted economic dates must not turn into the recovery day's clock.
  String date = value('date').isNotEmpty
      ? civilDate(value('date'))
      : cmd.kind == 'account'
      ? civilDate(value('cutoff'))
      : ['category', 'archive', 'reversal'].contains(cmd.kind)
      ? civilToday()
      : civilDate('');
  var kind = cmd.kind, change = 'create', actionId = cmd.id;
  String? previous, source;
  var number = 1;
  Map<String, String> data = Map.of(v);
  final postings = <LocalPosting>[];
  final effects = <String>[];
  var total = BigInt.zero;
  String title = value('name');
  LocalAccount? opening;
  Map<String, String>? comparison;

  if (kind == 'category') {
    final name = requiredText('name', max: 200);
    final classification = value('classification');
    if (!['expense', 'income'].contains(classification)) {
      reject('Choose income or expense classification.');
    }
    if (s.categories.any((c) => c.name.toLowerCase() == name.toLowerCase())) {
      reject('That category name already exists.');
    }
    return LocalPlan(
      category: LocalCategory(cmd.id, name, classification),
      effects: ['Create $classification category “$name”.'],
    );
  }
  if (kind == 'archive') {
    final a = s.account(value('account'));
    if (a.archived) reject('This account is already archived.');
    requiredText('reason');
    return LocalPlan(
      archiveId: a.id,
      effects: ['Archive ${a.name}. Retain all financial evidence.'],
    );
  }

  LocalRevision? replaced;
  if (['correction', 'reversal'].contains(kind)) {
    replaced = s.revision(value('source'));
    if (!s.current.any((r) => r.id == replaced!.id)) {
      reject('Choose the current source revision.');
    }
    if (value('sourceVersion') != '${replaced.number}') {
      reject('The source version changed. Review the current record.');
    }
    if (![
      'expense',
      'income',
      'transfer',
      'refund',
      'adjustment',
      'opening',
    ].contains(replaced.kind)) {
      reject('This source requires its own workflow.');
    }
    requiredText('reason');
    if (s.current.any(
      (r) =>
          r.source != null &&
          s.revision(r.source!).actionId == replaced!.actionId,
    )) {
      reject(
        'Resolve dependent refund/adjustment evidence before changing this source.',
      );
    }
    previous = replaced.id;
    actionId = replaced.actionId;
    number = replaced.number + 1;
    change = kind == 'reversal' ? 'reverse' : 'replace';
    kind = replaced.kind;
    if (change == 'reverse') {
      // A revision voids the current economic evidence at its original dates.
      date = replaced.date;
      title = 'Reversal · ${replaced.title}';
      total = replaced.amount;
      source = replaced.source;
      data = {...replaced.values, ...v};
    } else {
      // Editable replacement form starts from the original complete intent.
      source = replaced.source;
      data = {...replaced.values, ...v};
      title = value('name');
    }
  }

  void cash(String id, BigInt x, String on, {bool opening = false}) {
    final a = s.account(id);
    if (a.archived && replaced == null) {
      reject('New activity requires an active account.');
    }
    if (!opening && on.compareTo(a.cutoff) <= 0) {
      reject(
        'Activity must occur after ${a.name}’s opening cutoff ${a.cutoff}.',
      );
    }
    if (x != BigInt.zero) {
      postings.add(LocalPosting('cash', x, on, account: id));
    }
  }

  void classified(String ledger, String category, BigInt x, String on) {
    s.category(category, ledger);
    if (x != BigInt.zero) {
      postings.add(LocalPosting(ledger, x, on, category: category));
    }
  }

  // Correction form sends all original fields and the replacement values.
  if (change != 'reverse') {
    switch (kind) {
      case 'account':
        final name = requiredText('name', max: 200), type = value('kind');
        if (![
          'Cash',
          'Bank',
          'Mobile wallet',
          'Checking',
          'Savings',
        ].contains(type)) {
          reject('Choose a supported account type.');
        }
        if (s.accounts.any((a) => a.name.toLowerCase() == name.toLowerCase())) {
          reject('That account name already exists.');
        }
        date = civilDate(value('cutoff'));
        total = amount('amount', zero: true);
        opening = LocalAccount(
          cmd.id,
          name,
          type,
          date,
          false,
          value('institution'),
          value('notes'),
        );
        title = 'Opening balance · $name';
        kind = 'opening';
        if (total != BigInt.zero) {
          postings.add(LocalPosting('cash', total, date, account: cmd.id));
          postings.add(LocalPosting('equity', -total, date));
        }
        effects.add(
          'Create $type account “$name”, opening ${phpDecimal(total)} PHP at $date. Opening is not income.',
        );
      case 'income':
      case 'expense':
        total = amount('amount');
        title = requiredText('name');
        cash(value('account'), kind == 'income' ? total : -total, date);
        if (kind == 'income') {
          if (![
            'earned',
            'gift',
            'reward',
            'other',
          ].contains(value('incomeClass'))) {
            reject('Choose an income classification.');
          }
          classified('income', value('category'), -total, date);
        } else if (value('split') == 'true') {
          final count = int.tryParse(value('splitCount')) ?? 2;
          if (count < 2 || count > 100) {
            reject('Use 2–100 positive category splits.');
          }
          final first = amount('splitAmount');
          classified('expense', value('category'), first, date);
          var allocated = first;
          for (var i = 2; i < count; i++) {
            final part = amount('split${i}Amount');
            allocated += part;
            classified('expense', value('split${i}Category'), part, date);
          }
          if (allocated >= total) {
            reject(
              'Every split must be positive and the exact parts must equal the total. Leave a positive remainder.',
            );
          }
          classified(
            'expense',
            value('splitCategory'),
            total - allocated,
            date,
          );
        } else {
          classified('expense', value('category'), total, date);
        }
      case 'transfer':
        total = amount('amount');
        title = value('name').isEmpty
            ? 'Account transfer'
            : requiredText('name');
        if (value('account') == value('destination')) {
          reject('Choose different source and destination accounts.');
        }
        // Entered principal is the amount arriving, per the web transfer contract.
        cash(value('account'), -total, date);
        cash(value('destination'), total, date);
        final feeCount = int.tryParse(value('feeCount')) ?? 1;
        if (feeCount < 1 || feeCount > 20) {
          reject('A transfer supports at most 20 explicit fees.');
        }
        var withheld = BigInt.zero;
        for (var i = 0; i < feeCount; i++) {
          String key(String suffix) => i == 0
              ? (suffix == 'Amount' ? 'fee' : 'fee$suffix')
              : 'extraFee$i$suffix';
          final fee = amount(key('Amount'), zero: i == 0);
          if (fee == BigInt.zero) continue;
          final treatment = value(key('Treatment'));
          if (![
            'source_additional',
            'withheld',
            'separate',
          ].contains(treatment)) {
            reject('Choose how each fee is paid.');
          }
          final feeDate = value(key('Date')).isEmpty
              ? date
              : civilDate(value(key('Date')));
          if (treatment == 'withheld' && feeDate != date) {
            reject('A withheld fee must use the transfer date.');
          }
          if (treatment == 'withheld') withheld += fee;
          final bearing = treatment == 'separate'
              ? value(key('Account'))
              : value('account');
          cash(bearing, -fee, feeDate);
          classified('expense', value(key('Category')), fee, feeDate);
          effects.add(
            '${value(key('Label')).isEmpty ? 'Transfer fee' : value(key('Label'))}: ${phpDecimal(fee)} PHP, recognized once as spending on $feeDate.',
          );
        }
        if (total + withheld > maxComponent) {
          reject(
            'Transfer principal plus withheld fees exceeds the component limit.',
          );
        }
        effects.add(
          'Transfer principal ${phpDecimal(total)} PHP creates no income or spending.',
        );
      case 'refund':
        final original = s.revision(replaced?.source ?? value('source'));
        if (!s.current.contains(original) ||
            !['expense', 'transfer'].contains(original.kind)) {
          reject('Refunds require a current purchase or transfer fee source.');
        }
        if (replaced == null &&
            value('sourceVersion') != '${original.number}') {
          reject('The purchase changed. Review its current version.');
        }
        if (date.compareTo(original.date) < 0) {
          reject('A refund cannot precede its source.');
        }
        source = original.id;
        total = amount('amount');
        requiredText('reason');
        title = value('name').isEmpty
            ? 'Refund · ${original.title}'
            : value('name');
        final multiple = value('refundMultiple') == 'true';
        final count = multiple ? int.tryParse(value('refundCount')) ?? 2 : 1;
        if (count < 1 || count > 100) {
          reject('Allocate 1–100 original purchase/fee portions.');
        }
        final allocations = <Map<String, String>>[];
        final selected = <String>{};
        var allocated = BigInt.zero;
        for (var i = 0; i < count; i++) {
          final selection = value(
            i == 0 ? 'refundPosting' : 'refund${i}Posting',
          );
          final eligible = original.postings
              .asMap()
              .entries
              .where(
                (e) =>
                    e.value.ledger == 'expense' &&
                    e.value.date.compareTo(date) <= 0 &&
                    (selection.isEmpty && !multiple
                        ? e.value.category == value('refundCategory')
                        : '${original.id}-p${e.key + 1}' == selection),
              )
              .toList();
          if (eligible.length != 1) {
            reject('Choose an eligible original purchase or fee portion.');
          }
          final portion = eligible.single, category = portion.value.category!;
          final postingId = '${original.id}-p${portion.key + 1}';
          if (!selected.add(postingId)) {
            reject('Allocate each original purchase or fee portion once.');
          }
          final part = multiple
              ? amount(i == 0 ? 'refundFirstAmount' : 'refund${i}Amount')
              : total;
          var refunded = BigInt.zero;
          for (final r in s.current.where(
            (r) =>
                r.kind == 'refund' &&
                r.source == original.id &&
                r.id != replaced?.id,
          )) {
            if (r.values['refundAllocations'] case final String json) {
              for (final raw in jsonDecode(json) as List) {
                final a = raw as Map;
                if (a['posting'] == postingId) {
                  refunded += parseMinor(a['amount_minor'] as String);
                }
              }
            } else if (r.values['refundPosting'] == postingId) {
              refunded += r.amount;
            }
          }
          final available = portion.value.amount - refunded;
          if (part > available) {
            reject(
              'Refund exceeds the remaining original purchase/fee portion (${phpDecimal(available)} PHP).',
            );
          }
          allocations.add({
            'posting': postingId,
            'category': category,
            'amount_minor': '$part',
          });
          allocated += part;
          classified('expense', category, -part, date);
        }
        if (allocated != total) {
          reject('Refund allocations must equal the exact total received.');
        }
        data['refundPosting'] = allocations.first['posting']!;
        data['refundCategory'] = allocations.first['category']!;
        data['refundAllocations'] = jsonEncode(allocations);
        cash(value('account'), total, date);
        effects.add(
          'Refund reduces the original category spending; it is not income.',
        );
      case 'reconcile':
        final a = s.account(value('account'));
        if (date.compareTo(a.cutoff) < 0) {
          reject('A comparison cannot precede the opening cutoff.');
        }
        final BigInt observed;
        try {
          observed = signedPhp(value('amount'));
          sqliteInteger(observed);
        } catch (_) {
          reject(
            'Enter an exact signed PHP balance within the supported 64-bit minor-unit range.',
          );
        }
        final calculated = s.balance(a.id, through: date);
        total = observed - calculated;
        comparison = {
          'account': a.id,
          'date': date,
          'observed': '$observed',
          'calculated': '$calculated',
          'difference': '$total',
          'version': '${s.version}',
          'sourceCount':
              '${s.current.expand((r) => r.postings).where((p) => p.account == a.id && p.date.compareTo(date) <= 0).length}',
        };
        title = 'Reconciliation · ${a.name}';
        effects.add(
          'As of $date: tracked ${phpDecimal(calculated)}, observed ${phpDecimal(observed)}, difference ${phpDecimal(total)} PHP. No money is posted.',
        );
      case 'adjustment':
        if (replaced != null
            ? replaced.source == null
            : value('source').isEmpty) {
          total = amount('amount', signed: true);
          requiredText('reason');
          cash(value('account'), total, date);
          postings.add(LocalPosting('equity', -total, date));
          title = 'Balance adjustment';
          source = null;
          data['mode'] = 'manual';
          effects.add(
            'Explicit adjustment ${phpDecimal(total)} PHP against equity. No income or spending.',
          );
          break;
        }
        final original = s.revision(replaced?.source ?? value('source'));
        if (original.kind != 'reconcile' ||
            original.values['account'] != value('account')) {
          reject('Choose a reconciliation for this account.');
        }
        if (s.current.any(
          (r) =>
              r.kind == 'adjustment' &&
              r.source == original.id &&
              r.id != replaced?.id,
        )) {
          reject('This comparison already has an adjustment.');
        }
        final observed = signedPhp(original.values['amount']!);
        final calculated = s.balance(
          value('account'),
          through: original.date,
          excluding: replaced?.id,
        );
        final expected = parseMinor(original.values['calculated']!);
        final count = s.current
            .where((r) => r.id != replaced?.id)
            .expand((r) => r.postings)
            .where(
              (p) =>
                  p.account == value('account') &&
                  p.date.compareTo(original.date) <= 0,
            )
            .length;
        if (calculated != expected ||
            '$count' != original.values['sourceCount']) {
          reject('Reconciliation sources changed. Record a fresh comparison.');
        }
        if (date != original.date) {
          reject('A linked adjustment must use the comparison date.');
        }
        source = original.id;
        total = observed - calculated;
        component(total);
        requiredText('reason');
        cash(value('account'), total, date);
        postings.add(LocalPosting('equity', -total, date));
        title = 'Balance adjustment';
        effects.add(
          'Explicit adjustment ${phpDecimal(total)} PHP against equity. No income or spending.',
        );
      case 'opening':
        if (replaced == null) {
          reject('Opening evidence belongs to account creation.');
        }
        final originalAccount = replaced.postings
            .firstWhere((p) => p.ledger == 'cash')
            .account!;
        if (value('account') != originalAccount ||
            date != replaced.date ||
            date != s.account(originalAccount).cutoff) {
          reject(
            'Opening corrections retain their original account and cutoff. Coverage changes require rebaselining.',
          );
        }
        total = amount('amount');
        cash(originalAccount, total, date, opening: true);
        postings.add(LocalPosting('equity', -total, date));
        title = replaced.title;
        effects.add(
          'Correct the opening baseline to ${phpDecimal(total)} PHP. It is not income.',
        );
      default:
        reject('This workflow is available in a later milestone.');
    }
  }

  // Validate complete balanced journals by date without SQL SUM or floating point.
  for (final on in postings.map((p) => p.date).toSet()) {
    if (sumMinor(postings.where((p) => p.date == on).map((p) => p.amount)) !=
        BigInt.zero) {
      reject('The financial evidence does not balance.');
    }
  }
  for (final p in postings) {
    component(p.amount);
  }
  // Port reviewCashChanges: inspect every impacted historical balance boundary,
  // including dates removed by a replacement, not just the final balance.
  final affected = {
    ...postings.where((p) => p.account != null).map((p) => p.account!),
    ...?replaced?.postings
        .where((p) => p.account != null)
        .map((p) => p.account!),
  };
  for (final id in affected) {
    if (opening?.id == id) continue;
    final proposed = postings.where((p) => p.account == id).toList();
    final removed =
        replaced?.postings.where((p) => p.account == id).toList() ?? [];
    final changedDates = [...proposed, ...removed].map((p) => p.date).toList()
      ..sort();
    if (changedDates.isEmpty) continue;
    final tracked = <String, BigInt>{};
    for (final p
        in s.current
            .where((r) => r.id != replaced?.id)
            .expand((r) => r.postings)
            .where((p) => p.account == id)) {
      tracked[p.date] = (tracked[p.date] ?? BigInt.zero) + p.amount;
    }
    for (final p in proposed) {
      tracked[p.date] = (tracked[p.date] ?? BigInt.zero) + p.amount;
    }
    final boundaries = {...tracked.keys, ...changedDates}.toList()..sort();
    var running = BigInt.zero;
    for (final on in boundaries) {
      running += tracked[on] ?? BigInt.zero;
      if (on.compareTo(changedDates.first) < 0) continue;
      final after = running;
      sqliteInteger(after);
      if (after.isNegative) {
        effects.add(
          'Negative balance: ${s.account(id).name}, $on, ${phpDecimal(after)} PHP.',
        );
        if (value('acknowledge') != 'true') {
          reject(
            'This action produces a negative tracked balance on $on. Explicitly acknowledge it before saving.',
          );
        }
      }
    }
  }
  for (final p in postings.where((p) => p.account != null)) {
    effects.add(
      '${opening?.id == p.account ? opening!.name : s.account(p.account!).name}: ${phpDecimal(p.amount)} PHP on ${p.date}.',
    );
  }
  for (final p in postings.where((p) => p.category != null)) {
    effects.add(
      '${p.ledger == 'income' ? 'Recognized income' : 'Recognized spending'} · ${s.category(p.category!, p.ledger).name}: ${phpDecimal(p.ledger == 'income' ? -p.amount : p.amount)} PHP on ${p.date}.',
    );
  }
  if (change == 'replace') {
    effects.add(
      'Revision $number replaces revision ${replaced!.number} (${phpDecimal(replaced.amount)} PHP). All original evidence remains.',
    );
  }
  if (change == 'reverse') {
    effects.add(
      'Reverse original economic effect. Preserve every revision and the reason.',
    );
  }
  data.addAll({'name': title, 'date': date});
  if (comparison != null) data.addAll(comparison);
  return LocalPlan(
    account: opening,
    comparison: comparison,
    effects: effects,
    revision: kind == 'opening' && total == BigInt.zero
        ? null
        : LocalRevision(
            id: cmd.id,
            actionId: actionId,
            kind: kind,
            change: change,
            date: date,
            title: title,
            amount: total,
            values: data,
            postings: postings,
            number: number,
            previous: previous,
            source: source,
          ),
  );
}
