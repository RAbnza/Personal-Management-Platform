import '../local/finance_domain.dart';
import '../p0/exact_money.dart';

typedef SharedJson = Map<String, dynamic>;
bool privateBillNeedsSharedReview(
  SharedGroup group,
  String participant,
  LocalRevision adopted,
  Iterable<LocalRevision> current,
  Iterable<SharedJson> reviews,
) {
  final key = adopted.values['sharedKey'];
  if (group.bills[key] == null) return true;
  final bill = object(group.bills[key]);
  if (reviews.any(
    (r) =>
        r['historicalOnly'] != true &&
        r['group_id'] == group.id &&
        r['bill_id'] == key &&
        r['private_revision'] == adopted.id &&
        r['source_stamp'] == sharedSourceStamp(bill),
  )) {
    return false;
  }
  if (adopted.values['sharedRevision'] != group.revision(key!)['id']) {
    return true;
  }
  for (final f in bill['refunds'] as List) {
    if (sharedMinor(f['received'][participant] ?? '0') == BigInt.zero &&
        sharedMinor(f['credits'][participant] ?? '0') == BigInt.zero) {
      continue;
    }
    if (!current.any(
      (r) =>
          r.values['sharedGroup'] == group.id &&
          r.values['sharedMode'] == 'refund' &&
          r.values['sharedKey'] == f['id'] &&
          r.values['coverage'] == 'adopted' &&
          r.values['billRevision'] == group.revision(key)['id'],
    )) {
      return true;
    }
  }
  return false;
}

String sharedSourceStamp(SharedJson bill) {
  final refunds =
      (bill['refunds'] as List).map((f) => f['id'] as String).toList()..sort();
  return '${(bill['revisions'] as List).last['id']}:${refunds.join(',')}';
}

SharedJson object(dynamic value) => Map<String, dynamic>.from(value as Map);
BigInt sharedMinor(dynamic value, {bool positive = false}) {
  if (value is! String || !RegExp(r'^(0|[1-9][0-9]{0,18})$').hasMatch(value)) {
    reject('Use exact integer minor-unit strings.');
  }
  final n = BigInt.parse(value);
  sqliteInteger(n);
  if (positive && n == BigInt.zero) {
    reject('Enter an amount greater than zero.');
  }
  return n;
}

Map<String, String> equalShares(BigInt total, Iterable<String> participants) {
  final ids = participants.toSet().toList()..sort();
  if (ids.isEmpty || ids.length > 100) reject('Select 1–100 participants.');
  final count = BigInt.from(ids.length);
  return {
    for (var i = 0; i < ids.length; i++)
      ids[i]:
          '${total ~/ count + (BigInt.from(i) < total % count ? BigInt.one : BigInt.zero)}',
  };
}

void validateSharedAxis(dynamic raw, SharedJson people, BigInt total) {
  final axis = object(raw);
  if (axis.isEmpty ||
      axis.length > 100 ||
      axis.keys.any((k) => !people.containsKey(k))) {
    reject('Choose 1–100 known participants.');
  }
  if (sumMinor(axis.values.map(sharedMinor)) != total) {
    reject('Each allocation axis must independently equal the total.');
  }
}

class SharedEdge {
  const SharedEdge(
    this.sender,
    this.recipient,
    this.amount, {
    this.bill,
    required this.source,
  });
  final String sender, recipient, source;
  final String? bill;
  final BigInt amount;
}

List<SharedEdge> matchSharedPositions(
  Map<String, BigInt> positions, {
  String? bill,
  String source = 'suggestion',
}) {
  if (sumMinor(positions.values) != BigInt.zero) {
    reject('Positions do not sum to zero.');
  }
  final ids = positions.keys.toList()..sort();
  final debtors = {
    for (final id in ids)
      if (positions[id]! < BigInt.zero) id: -positions[id]!,
  };
  final creditors = {
    for (final id in ids)
      if (positions[id]! > BigInt.zero) id: positions[id]!,
  };
  final out = <SharedEdge>[];
  for (final d in debtors.keys) {
    for (final c in creditors.keys) {
      final use = debtors[d]! < creditors[c]! ? debtors[d]! : creditors[c]!;
      if (use > BigInt.zero) {
        out.add(SharedEdge(d, c, use, bill: bill, source: source));
      }
      debtors[d] = debtors[d]! - use;
      creditors[c] = creditors[c]! - use;
    }
  }
  return out;
}

class SharedGroup {
  SharedGroup(this.data);
  final SharedJson data;
  String get id => data['id'] as String;
  String get name => data['name'] as String;
  int get version => data['version'] as int? ?? 0;
  bool get complete => data['complete'] == true;
  bool get archived => data['archived'] == true;
  SharedJson get people => object(data['people']);
  SharedJson get bills => object(data['bills']);
  SharedJson get settlements => object(data['settlements']);
  String? participant(String user) =>
      people.entries.where((p) => p.value['user'] == user).firstOrNull?.key;
  bool active(String? person) =>
      person != null && people[person]?['active'] == true;
  String personName(String id) =>
      people[id]?['name'] as String? ?? 'Historical participant';
  SharedJson revision(String bill) =>
      object((bills[bill]['revisions'] as List).last);
  Map<String, BigInt> billPositions(String bill) {
    final b = object(bills[bill]), r = revision(bill);
    final result = <String, BigInt>{};
    for (final id in people.keys) {
      var n =
          sharedMinor(r['paid'][id] ?? '0') -
          sharedMinor(r['shares'][id] ?? '0');
      for (final f in b['refunds'] as List) {
        n +=
            sharedMinor(f['credits'][id] ?? '0') -
            sharedMinor(f['received'][id] ?? '0');
      }
      result[id] = n;
    }
    return result;
  }

  List<SharedEdge> edges({bool projected = false}) {
    final out = <SharedEdge>[];
    for (final id in bills.keys.toList()..sort()) {
      out.addAll(matchSharedPositions(billPositions(id), bill: id, source: id));
    }
    for (final entry in settlements.entries) {
      final s = object(entry.value);
      if (s['state'] != 'confirmed' &&
          !(projected && s['state'] == 'pending')) {
        continue;
      }
      for (final a in object(s['allocations']).entries) {
        out.add(
          SharedEdge(
            s['recipient'],
            s['sender'],
            sharedMinor(a.value['amount']),
            bill: a.key,
            source: entry.key,
          ),
        );
      }
      final advance = sharedMinor(s['advance']);
      if (advance > BigInt.zero) {
        out.add(
          SharedEdge(s['recipient'], s['sender'], advance, source: entry.key),
        );
      }
    }
    return out;
  }

  BigInt due(String sender, String recipient, {String? bill}) => sumMinor(
    edges()
        .where((e) => bill == null || e.bill == bill)
        .map(
          (e) => e.sender == sender && e.recipient == recipient
              ? e.amount
              : e.sender == recipient && e.recipient == sender
              ? -e.amount
              : BigInt.zero,
        ),
  );
  Map<String, BigInt> positions({bool projected = false}) {
    final out = {for (final p in people.keys) p: BigInt.zero};
    for (final e in edges(projected: projected)) {
      out[e.sender] = out[e.sender]! - e.amount;
      out[e.recipient] = out[e.recipient]! + e.amount;
    }
    return out;
  }

  List<SharedEdge> get reciprocalPairs {
    final pairs = <(String, String), BigInt>{};
    for (final e in edges()) {
      final forward = e.sender.compareTo(e.recipient) < 0;
      final key = forward ? (e.sender, e.recipient) : (e.recipient, e.sender);
      pairs[key] =
          (pairs[key] ?? BigInt.zero) + (forward ? e.amount : -e.amount);
    }
    final keys = pairs.keys.toList()
      ..sort((a, b) {
        final first = a.$1.compareTo(b.$1);
        return first == 0 ? a.$2.compareTo(b.$2) : first;
      });
    return [
      for (final key in keys)
        if (pairs[key] != BigInt.zero)
          SharedEdge(
            pairs[key]! > BigInt.zero ? key.$1 : key.$2,
            pairs[key]! > BigInt.zero ? key.$2 : key.$1,
            pairs[key]!.abs(),
            source: 'reciprocal',
          ),
    ];
  }

  List<SharedEdge> get suggestions =>
      !complete || settlements.values.any((s) => s['state'] == 'disputed')
      ? []
      : matchSharedPositions(positions());
  BigInt get spending => sumMinor(
    bills.keys.map(
      (id) =>
          sharedMinor(revision(id)['total']) -
          sumMinor(
            (bills[id]['refunds'] as List).map((f) => sharedMinor(f['total'])),
          ),
    ),
  );
  SharedJson settlementAllocation(
    String sender,
    String recipient,
    BigInt amount, {
    SharedJson? selected,
  }) {
    final allocations = <String, dynamic>{};
    var left = amount;
    if (selected != null) {
      if (selected.length > 100) reject('Select up to 100 bills.');
      for (final a in selected.entries) {
        final r = revision(a.key),
            n = sharedMinor(a.value['amount'], positive: true);
        if (a.value['revision'] != r['id'] ||
            n > due(sender, recipient, bill: a.key)) {
          reject('Selected source changed or exceeds remaining capacity.');
        }
        allocations[a.key] = a.value;
        left -= n;
      }
    } else {
      var applicable = due(sender, recipient);
      if (applicable < BigInt.zero) applicable = BigInt.zero;
      if (applicable > amount) applicable = amount;
      for (final id in bills.keys.toList()..sort()) {
        final cap = due(sender, recipient, bill: id);
        final use = cap < applicable ? cap : applicable;
        if (use <= BigInt.zero) continue;
        allocations[id] = {'revision': revision(id)['id'], 'amount': '$use'};
        left -= use;
        applicable -= use;
      }
    }
    if (left < BigInt.zero) reject('Allocations exceed payment.');
    return {
      'allocations': allocations,
      'advance': '$left',
      'overNet': amount > due(sender, recipient),
    };
  }
}
