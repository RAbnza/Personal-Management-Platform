part of '../local/finance_domain.dart';

// P3 extends the established private command, immutable revision and journal
// contract. It never accepts a client-supplied posting plan or another owner.
LocalPlan planSharedPrivate(LocalSnapshot s, LocalCommand cmd) {
  final v = Map<String, String>.from(cmd.values);
  String value(String k) => v[k] ?? '';
  final mode = value('sharedMode'), date = civilDate(value('date'));
  final group = value('sharedGroup'), sourceKey = value('sharedKey');
  if (!RegExp(r'^[0-9a-f-]{36}$').hasMatch(group) ||
      !RegExp(r'^[0-9a-f-]{36}$').hasMatch(sourceKey) ||
      value('sharedRevision').isEmpty) {
    reject('A versioned group source is required.');
  }
  final cardFunded = value('funding') == 'card';
  if (cardFunded && !['bill', 'refund'].contains(mode)) {
    reject('Group settlement payments require actual cash evidence.');
  }
  BigInt amount(String k) {
    final n = parsePhp(value(k));
    return n == BigInt.zero ? n : component(n, positive: false);
  }

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
    final dependencies = s.current
        .where((r) => r.source == oldId && financeType(r) != 'financialFile')
        .toList();
    final restoredPayment =
        mode == 'payment' &&
        dependencies.every(
          (r) =>
              r.values['sharedMode'] == 'clear' &&
              s.current.any(
                (u) => u.source == r.id && u.values['sharedMode'] == 'unclear',
              ),
        );
    if (dependencies.isNotEmpty && !restoredPayment) {
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

  void offsetPosition(BigInt n) {
    if (value('sharedAccounting') != '2') {
      position(n);
      return;
    }
    final existing = s.current
        .where((r) => r.id != oldId && r.values['sharedGroup'] == group)
        .expand((r) => r.postings);
    final payable = sumMinor(
      existing.where((p) => p.ledger == 'shared_payable').map((p) => p.amount),
    );
    final receivable = sumMinor(
      existing
          .where((p) => p.ledger == 'shared_receivable')
          .map((p) => p.amount),
    );
    final payableAvailable = payable < BigInt.zero ? -payable : BigInt.zero,
        receivableAvailable = receivable > BigInt.zero
            ? receivable
            : BigInt.zero;
    final payableDelta = n > BigInt.zero
        ? (n < payableAvailable ? n : payableAvailable)
        : n < BigInt.zero
        ? n + (-n < receivableAvailable ? -n : receivableAvailable)
        : BigInt.zero;
    post('shared_payable', payableDelta);
    post('shared_receivable', n - payableDelta);
  }

  var kind = 'expense', total = paid;
  if (cardFunded) {
    if (old == null ||
        !['cardPurchase', 'cardRefund'].contains(financeType(old))) {
      reject(
        'First record the actual card purchase or refund in Money, then adopt its immutable evidence.',
      );
    }
    final card = financeSource(s, old.values['card'] ?? '', {'creditCard'});
    final recognizedCardMovement = sumMinor(
      old.postings
          .where((p) => p.ledger == 'card_liability')
          .map((p) => p.amount),
    );
    if (recognizedCardMovement != (mode == 'bill' ? -paid : paid)) {
      reject(
        'Immutable card liability evidence does not match the actual funded amount.',
      );
    }
    if (value('card') != card.actionId ||
        old.date != date ||
        (mode == 'bill' &&
            (financeType(old) != 'cardPurchase' ||
                (old.values['sharedGroup'] == null
                    ? old.amount != paid
                    : parsePhp(old.values['fundingAmount']!) != paid))) ||
        (mode == 'refund' &&
            (financeType(old) != 'cardRefund' ||
                (old.values['sharedGroup'] == null
                    ? old.amount != paid
                    : parsePhp(old.values['fundingAmount']!) != paid)))) {
      reject('Retain the exact owned card funding, amount and date.');
    }
    v.addAll({
      'card': card.actionId,
      'financeType': financeType(old),
      'financeContract': '1',
      'postingDate': old.values['postingDate'] ?? old.date,
    });
    v['account'] = old.values['account'] ?? '';
    if (mode == 'refund') v['purchase'] = old.values['purchase']!;
  }
  if (mode == 'bill') {
    if (old != null) {
      if (old.values['sharedGroup'] == null) {
        if (old.kind != 'expense' ||
            old.amount != paid ||
            old.date != date ||
            old.values['split'] == 'true' ||
            (!cardFunded && old.values['account'] != value('account'))) {
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
    if (cardFunded) {
      post('card_liability', -paid);
    } else {
      cash(-paid);
    }
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
    if (old != null &&
        (old.values['sharedMode'] != 'payment' ||
            old.values['sharedGroup'] != group ||
            old.values['sharedKey'] == sourceKey ||
            old.values['fundingAmount'] != value('fundingAmount') ||
            old.values['direction'] != value('direction') ||
            old.values['account'] != value('account') ||
            old.date != date)) {
      reject(
        'Reusing actual money requires the same group, parties, date, account and amount.',
      );
    }
    cash(outgoing ? -paid : paid);
    post('shared_clearing', outgoing ? paid : -paid);
    kind = 'adjustment';
  } else if (mode == 'refund') {
    if (cardFunded) {
      post('card_liability', paid);
    } else {
      cash(paid);
    }
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
      offsetPosition(share - paid);
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
    if (value('sharedAccounting') == '2') {
      for (final p in clearing.postings) {
        post(p.ledger, -p.amount);
      }
    } else {
      post('shared_clearing', outgoing ? paid : -paid);
      post(
        outgoing ? 'shared_payable' : 'shared_receivable',
        outgoing ? -paid : paid,
      );
    }
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
    if (value('sharedAccounting') == '2') {
      offsetPosition(outgoing ? paid : -paid);
    } else {
      post(
        outgoing ? 'shared_payable' : 'shared_receivable',
        outgoing ? paid : -paid,
      );
    }
    kind = 'adjustment';
  }
  if (old != null &&
      mode == 'refund' &&
      !(cardFunded && old.values['sharedGroup'] == null) &&
      (old.values['sharedGroup'] != group ||
          old.values['sharedKey'] != sourceKey ||
          old.values['fundingAmount'] != value('fundingAmount') ||
          old.values['account'] != value('account'))) {
    reject('Refund reclassification retains actual accepted money.');
  }
  if (old != null && !['bill', 'refund', 'payment'].contains(mode)) {
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
      source: cardFunded && mode == 'refund'
          ? old?.source
          : ['clear', 'unclear'].contains(mode)
          ? value('paymentSource')
          : null,
    ),
  );
}
