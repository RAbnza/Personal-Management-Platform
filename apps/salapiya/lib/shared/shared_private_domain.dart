part of '../local/finance_domain.dart';

// P3 extends the established private command, immutable revision and journal
// contract. It never accepts a client-supplied posting plan or another owner.
LocalPlan planSharedPrivate(LocalSnapshot s, LocalCommand cmd) {
  final v = cmd.values;
  String value(String k) => v[k] ?? '';
  final mode = value('sharedMode'), date = civilDate(value('date'));
  final group = value('sharedGroup'), sourceKey = value('sharedKey');
  if (!RegExp(r'^[0-9a-f-]{36}$').hasMatch(group) ||
      !RegExp(r'^[0-9a-f-]{36}$').hasMatch(sourceKey) ||
      value('sharedRevision').isEmpty) {
    reject('A versioned group source is required.');
  }
  if (value('funding') == 'card') {
    reject(
      'Card-backed posting requires the P4 card domain; no cash or liability was posted.',
    );
  }
  BigInt amount(String k) => component(parsePhp(value(k)), positive: false);
  final paid = amount('fundingAmount'), share = amount('shareAmount');
  final oldId = value('source');
  LocalRevision? old;
  if (oldId.isNotEmpty) {
    old = s.revision(oldId);
    if (!s.current.contains(old) || value('sourceVersion') != '${old.number}') {
      reject('Private source changed.');
    }
    if (value('reason').trim().isEmpty) {
      reject('Explain the private source reconciliation.');
    }
    if (s.current.any((r) => r.source == oldId)) {
      reject('Resolve dependent private evidence first.');
    }
  }
  if (s.current.any(
    (r) =>
        r.id != oldId &&
        r.values['sharedGroup'] == group &&
        r.values['sharedKey'] == sourceKey &&
        r.values['sharedMode'] == mode,
  )) {
    reject(
      'This private source is already linked. Review its current revision.',
    );
  }
  if (!['bill', 'payment', 'refund', 'clear', 'unclear'].contains(mode)) {
    reject('Unsupported private group effect.');
  }
  final posts = <LocalPosting>[];
  void post(String ledger, BigInt n, {String? account, String? category}) {
    if (n != BigInt.zero) {
      component(n);
      posts.add(
        LocalPosting(ledger, n, date, account: account, category: category),
      );
    }
  }

  void cash(BigInt n) {
    if (n == BigInt.zero) return;
    final account = s.account(value('account'));
    if (account.archived || date.compareTo(account.cutoff) <= 0) {
      reject('Choose an active funding account after its cutoff.');
    }
    post('cash', n, account: account.id);
  }

  void expense(BigInt n) {
    if (n != BigInt.zero) {
      s.category(value('category'), 'expense');
      post('expense', n, category: value('category'));
    }
  }

  void position(BigInt n) {
    post(n >= BigInt.zero ? 'shared_receivable' : 'shared_payable', n);
  }

  var kind = 'expense', total = paid;
  if (mode == 'bill') {
    if (old != null) {
      if (old.values['sharedGroup'] == null) {
        if (old.kind != 'expense' ||
            old.amount != paid ||
            old.date != date ||
            old.values['split'] == 'true' ||
            old.values['account'] != value('account')) {
          reject(
            'Existing purchase adoption must retain its exact cash funding, date and account.',
          );
        }
      } else if (old.values['sharedGroup'] != group ||
          old.values['sharedKey'] != sourceKey) {
        reject('Private linkage cannot switch source.');
      } else if (value('acknowledgeFunding') != 'true' &&
          (old.values['fundingAmount'] != value('fundingAmount') ||
              old.values['account'] != value('account'))) {
        reject('Acknowledge an actual funding correction explicitly.');
      }
    }
    cash(-paid);
    expense(share);
    position(paid - share);
    total = share;
  } else if (mode == 'payment') {
    if (paid == BigInt.zero || share != BigInt.zero) {
      reject('Payment records actual money with no spending.');
    }
    final outgoing = value('direction') == 'out';
    if (!outgoing && value('direction') != 'in') {
      reject('Choose actual payment direction.');
    }
    cash(outgoing ? -paid : paid);
    post('shared_clearing', outgoing ? paid : -paid);
    kind = 'adjustment';
  } else if (mode == 'refund') {
    cash(paid);
    final adopted = s.current.any(
      (r) =>
          r.values['sharedMode'] == 'bill' &&
          r.values['sharedGroup'] == group &&
          r.values['sharedKey'] == value('billSource') &&
          r.values['sharedRevision'] == value('billRevision'),
    );
    if (value('coverage') != (adopted ? 'adopted' : 'clearing')) {
      reject('Private refund coverage changed.');
    }
    if (adopted) {
      expense(-share);
      position(share - paid);
    } else {
      post('shared_clearing', -paid);
    }
    kind = 'refund';
    total = adopted ? share : BigInt.zero;
  } else if (mode == 'unclear') {
    if (old != null || paid == BigInt.zero || share != BigInt.zero) {
      reject('Restoring clearing is a new noncash classification.');
    }
    final clearing = s.revision(value('paymentSource'));
    if (!s.current.contains(clearing) ||
        clearing.values['sharedMode'] != 'clear' ||
        clearing.values['sharedGroup'] != group ||
        clearing.values['sharedKey'] != sourceKey ||
        clearing.values['fundingAmount'] != value('fundingAmount') ||
        s.current.any((r) => r.source == clearing.id)) {
      reject('Private clearing source changed or was already restored.');
    }
    final outgoing = clearing.values['direction'] == 'out';
    post('shared_clearing', outgoing ? paid : -paid);
    post(
      outgoing ? 'shared_payable' : 'shared_receivable',
      outgoing ? -paid : paid,
    );
    kind = 'adjustment';
  } else {
    if (old != null || paid == BigInt.zero || share != BigInt.zero) {
      reject('Clearing is a new noncash classification.');
    }
    final payment = s.revision(value('paymentSource'));
    if (!s.current.contains(payment) ||
        payment.values['sharedMode'] != 'payment' ||
        payment.values['sharedGroup'] != group ||
        payment.values['sharedKey'] != sourceKey ||
        payment.values['fundingAmount'] != value('fundingAmount') ||
        s.current.any((r) => r.source == payment.id)) {
      reject('Private payment coverage changed or already cleared.');
    }
    final outgoing = payment.values['direction'] == 'out';
    post('shared_clearing', outgoing ? -paid : paid);
    post(
      outgoing ? 'shared_payable' : 'shared_receivable',
      outgoing ? paid : -paid,
    );
    kind = 'adjustment';
  }
  if (old != null &&
      mode == 'refund' &&
      (old.values['sharedGroup'] != group ||
          old.values['sharedKey'] != sourceKey ||
          old.values['fundingAmount'] != value('fundingAmount') ||
          old.values['account'] != value('account'))) {
    reject('Refund reclassification retains actual accepted money.');
  }
  if (old != null && !['bill', 'refund'].contains(mode)) {
    reject(
      'Payment/refund cash corrections require their separate retained-evidence review.',
    );
  }
  final affected = posts
      .where((p) => p.account != null)
      .map((p) => p.account!)
      .toSet();
  for (final a in affected) {
    final proposed = [
      ...s.current
          .where((r) => r.id != oldId)
          .expand((r) => r.postings)
          .where((p) => p.account == a),
      ...posts.where((p) => p.account == a),
    ];
    var running = BigInt.zero;
    for (final day in proposed.map((p) => p.date).toSet().toList()..sort()) {
      running += sumMinor(
        proposed.where((p) => p.date == day).map((p) => p.amount),
      );
      sqliteInteger(running);
      if (day.compareTo(date) >= 0 &&
          running < BigInt.zero &&
          value('acknowledge') != 'true') {
        reject('Negative balance requires explicit acknowledgement.');
      }
    }
  }
  if (sumMinor(posts.map((p) => p.amount)) != BigInt.zero) {
    reject('Unbalanced private group effect.');
  }
  return LocalPlan(
    effects: [
      'Private cash ${phpDecimal(sumMinor(posts.where((p) => p.ledger == 'cash').map((p) => p.amount)))} PHP; personal expense ${phpDecimal(sumMinor(posts.where((p) => p.ledger == 'expense').map((p) => p.amount)))} PHP.',
      'Only this private profile is affected. Group acceptance and recipient confirmation remain independent.',
    ],
    revision: LocalRevision(
      id: cmd.id,
      actionId: old?.actionId ?? cmd.id,
      kind: kind,
      change: old == null ? 'create' : 'replace',
      date: date,
      title: value('name'),
      amount: total,
      values: Map.of(v),
      postings: posts,
      number: (old?.number ?? 0) + 1,
      previous: old?.id,
      source: ['clear', 'unclear'].contains(mode)
          ? value('paymentSource')
          : null,
    ),
  );
}
