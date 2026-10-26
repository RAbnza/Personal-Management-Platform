part of '../local/finance_domain.dart';

const nativeFinanceCommands = {
  ...nativeDebtCommands,
  ...nativePlanningCommands,
  ...nativeRecurrenceCommands,
  'creditCard',
  'cardAuthorization',
  'cardPurchase',
  'cardPayment',
  'cardFee',
  'cardInterest',
  'cardRefund',
  'statement',
  'statementLink',
  'cardAllocation',
  'installment',
  'installmentApplication',
  'financeCorrection',
  'financeReversal',
};

String financeType(LocalRevision r) => r.values['financeType'] ?? r.kind;

LocalRevision financeSource(LocalSnapshot s, String id, Set<String> types) {
  final r = s.current
      .where(
        (r) =>
            (r.id == id || r.actionId == id) && types.contains(financeType(r)),
      )
      .firstOrNull;
  return r ?? reject('The current owned financial source is unavailable.');
}

BigInt financeBalance(
  LocalSnapshot s,
  String ledger,
  String key,
  String id, {
  String? through,
  String? excluding,
}) => sumMinor(
  s.current
      .where((r) => r.id != excluding && r.values[key] == id)
      .expand((r) => r.postings)
      .where(
        (p) =>
            p.ledger == ledger &&
            (through == null || p.date.compareTo(through) <= 0),
      )
      .map((p) => p.amount),
);

bool financeDependsOn(LocalRevision r, LocalRevision source) =>
    r.source == source.id ||
    [
      'purchase',
      'payment',
      'statement',
      'plan',
      'activity',
      'authorization',
    ].any((k) => r.values[k] == source.id) ||
    (r.values['card'] == source.actionId &&
        financeType(source) == 'creditCard') ||
    (r.values['debt'] == source.actionId &&
        ['debtImport', 'borrowing'].contains(financeType(source))) ||
    r.values['scheduleSource'] == source.id;

LocalPlan planNativeFinance(LocalSnapshot s, LocalCommand command) {
  final values = Map<String, String>.from(command.values);
  var operation = command.kind == 'expense' ? 'cardPurchase' : command.kind;
  LocalRevision? replaced;
  if (['financeCorrection', 'financeReversal'].contains(operation)) {
    replaced = s.revision(values['replace'] ?? '');
    if (!s.current.contains(replaced) ||
        values['replaceVersion'] != '${replaced.number}' ||
        !nativeFinanceCommands.contains(financeType(replaced)) ||
        replaced.values.containsKey('sharedGroup')) {
      reject('Review the current financial source in its own workflow.');
    }
    if ((values['reason'] ?? '').trim().isEmpty) {
      reject('Explain the correction.');
    }
    if ([
          'reservation',
          'savingsReallocation',
          'recurrenceGenerate',
          'occurrenceOverride',
          'recurrenceLink',
          'recurrenceUnlink',
        ].contains(financeType(replaced)) ||
        operation == 'financeReversal' &&
            [
              'budget',
              'savingsGoal',
              'recurrence',
            ].contains(financeType(replaced))) {
      reject(
        'Use the explicit management, occurrence decision or link-reversal workflow. Preserve its history.',
      );
    }
    if (!(operation == 'financeCorrection' &&
            ['debtSchedule', 'recurrence'].contains(financeType(replaced))) &&
        s.current.any(
          (r) =>
              r.id != replaced!.id &&
              financeType(r) != 'financialFile' &&
              financeDependsOn(r, replaced),
        )) {
      reject('Resolve dependent financial evidence first.');
    }
    if (operation == 'financeReversal') {
      FinanceRuleContext(
        s,
        command,
        {...replaced.values, ...values, 'date': replaced.date},
        financeType(replaced),
        replaced,
      ).finish();
      return LocalPlan(
        revision: LocalRevision(
          id: command.id,
          actionId: replaced.actionId,
          kind: replaced.kind,
          change: 'reverse',
          date: replaced.date,
          title: 'Reversal · ${replaced.title}',
          amount: replaced.amount,
          values: {...replaced.values, ...values},
          postings: const [],
          number: replaced.number + 1,
          previous: replaced.id,
          source: replaced.source,
        ),
        effects: [
          'Void the current effect at its original dates. Retain every revision.',
        ],
      );
    }
    operation = financeType(replaced);
    values.addAll({...replaced.values, ...values});
  }
  values['financeType'] = operation;
  values['financeContract'] = '1';
  final context = FinanceRuleContext(s, command, values, operation, replaced);
  if (nativeDebtCommands.contains(operation)) {
    planDebt(context);
  } else if (nativePlanningCommands.contains(operation)) {
    planPlanning(context);
  } else if (nativeRecurrenceCommands.contains(operation)) {
    planRecurrence(context);
  } else {
    planCard(context);
  }
  if (operation == 'recurrenceUnlink') {
    final link = financeSource(s, values['link']!, {'recurrenceLink'});
    return LocalPlan(
      revision: LocalRevision(
        id: command.id,
        actionId: link.actionId,
        kind: link.kind,
        change: 'reverse',
        date: link.date,
        title: 'Reversal · ${link.title}',
        amount: link.amount,
        values: context.v,
        postings: const [],
        number: link.number + 1,
        previous: link.id,
        source: link.source,
      ),
      effects: [
        'Reverse this exact planning link. Actual money stays unchanged.',
      ],
    );
  }
  return context.finish();
}

class FinanceRuleContext {
  FinanceRuleContext(this.s, this.command, this.v, this.operation, this.old)
    : date = civilDate(v['date'] ?? ''),
      title = (v['name'] ?? '').trim();
  final LocalSnapshot s;
  final LocalCommand command;
  final Map<String, String> v;
  final String operation;
  final LocalRevision? old;
  final List<LocalPosting> posts = [];
  final List<String> effects = [];
  String date, title, kind = 'adjustment';
  String? source;
  BigInt total = BigInt.zero;
  String value(String key) => (v[key] ?? '').trim();
  String text(String key, {int max = 2000}) {
    final x = value(key);
    if (x.isEmpty || x.length > max) reject('Enter $key (1–$max characters).');
    return x;
  }

  BigInt money(
    String key, {
    bool zero = false,
    bool signed = false,
    bool wide = false,
  }) {
    final n = signed ? signedPhp(value(key)) : parsePhp(value(key));
    if ((!zero && n == BigInt.zero) ||
        (!signed && n.isNegative) ||
        n.abs() > (wide ? maxSqliteInteger : maxComponent)) {
      reject('The $key amount is outside the supported exact range.');
    }
    return n;
  }

  LocalRevision ref(String key, Set<String> types) =>
      financeSource(s, text(key), types);
  void post(String ledger, BigInt n, {String? account, String? category}) {
    if (n == BigInt.zero) return;
    component(n);
    posts.add(
      LocalPosting(ledger, n, date, account: account, category: category),
    );
  }

  void cash(BigInt n) {
    final a = s.account(text('account'));
    if (a.archived || date.compareTo(a.cutoff) <= 0) {
      reject('Choose an active cash account after its cutoff.');
    }
    post('cash', n, account: a.id);
  }

  void expense(BigInt n, {String key = 'category'}) {
    final c = s.category(text(key), 'expense');
    post('expense', n, category: c.id);
  }

  BigInt used(
    String type,
    String key,
    String id, {
    String amountKey = 'amount',
  }) => sumMinor(
    s.current
        .where(
          (r) =>
              r.id != old?.id && financeType(r) == type && r.values[key] == id,
        )
        .map(
          (r) =>
              amountKey == 'amount' ? r.amount : parsePhp(r.values[amountKey]!),
        ),
  );
  LocalPlan finish() {
    if (title.isEmpty || title.length > 2000) {
      reject('Enter a financial description.');
    }
    if (sumMinor(posts.map((p) => p.amount)) != BigInt.zero) {
      reject('The financial evidence is unbalanced.');
    }
    final accounts = [
      ...posts,
      ...?old?.postings,
    ].where((p) => p.ledger == 'cash').map((p) => p.account!).toSet();
    for (final a in accounts) {
      final dates = {
        date,
        ...?old?.postings.where((p) => p.account == a).map((p) => p.date),
        ...s.current
            .expand((r) => r.postings)
            .where((p) => p.account == a)
            .map((p) => p.date),
      };
      for (final day in dates) {
        if (s.balance(a, through: day, excluding: old?.id) +
                    sumMinor(
                      posts
                          .where(
                            (p) => p.account == a && p.date.compareTo(day) <= 0,
                          )
                          .map((p) => p.amount),
                    ) <
                BigInt.zero &&
            value('acknowledge') != 'true') {
          reject('Acknowledge the resulting negative cash balance.');
        }
      }
    }
    return LocalPlan(
      revision: LocalRevision(
        id: command.id,
        actionId: old?.actionId ?? command.id,
        kind: kind,
        change: old == null ? 'create' : 'replace',
        date: date,
        title: title,
        amount: total,
        values: Map.unmodifiable(v),
        postings: List.unmodifiable(posts),
        number: (old?.number ?? 0) + 1,
        previous: old?.id,
        source: source,
      ),
      effects: [
        ...effects,
        for (final p in posts)
          '${p.ledger.replaceAll('_', ' ')}: ${phpDecimal(p.amount)} PHP on ${p.date}.',
        if (posts.isEmpty)
          'Evidence only. Cash, spending and liability are unchanged.',
      ],
    );
  }
}
