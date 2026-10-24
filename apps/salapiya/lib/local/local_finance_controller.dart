import '../features/finance/application/financial_controller.dart';
import '../features/finance/contracts/financial_models.dart';
import 'finance_domain.dart';
import 'local_store.dart';

// Adapter into the approved preview/editor/query models. Cached display lists
// are rebuilt only from committed facts; financial calculations stay in domain.
class LocalFinancialController extends FinancialController {
  LocalFinancialController(this.store, this.snapshot) : super(demo: false) {
    super.reset(empty: true, notify: false);
    groups.clear();
    memberSets.clear();
    groupOwners.clear();
    _publish();
  }
  final LocalStore store;
  LocalSnapshot snapshot;
  String? lastError;
  @override
  bool get production => true;
  @override
  String nextCommand() => newLocalId();
  Map<String, String> categoryChoices(String kind) => {
    for (final c in snapshot.categories.where((c) => c.kind == kind))
      c.id: c.name,
  };
  String categoryName(String? id) =>
      snapshot.categories.where((c) => c.id == id).firstOrNull?.name ??
      'No category';
  String operation(FinancialAction action, String? source) =>
      '${action.name}:${source ?? ''}';
  @override
  Future<Map<String, dynamic>?> restoreDraft(String operation) =>
      store.draft(operation);
  @override
  Future<void> retainDraft(
    String operation,
    String id,
    Map<String, String> values,
  ) => store.saveDraft(operation, id, values);
  @override
  Future<void> discardDraft(String operation) => store.discardDraft(operation);

  @override
  Map<String, String> defaults(FinancialAction action, {String? sourceId}) {
    final date = civilToday();
    final yesterday = DateTime.parse(date)
        .subtract(const Duration(days: 1))
        .toIso8601String()
        .substring(0, 10);
    final source = snapshot.revisions
        .where((r) => r.id == sourceId)
        .firstOrNull;
    final income =
        action == FinancialAction.income ||
        (action == FinancialAction.correction && source?.kind == 'income');
    final expenseCategories = categoryChoices('expense').keys.toList();
    final result = <String, String>{
      'amount': '',
      'name': '',
      'fee': '0.00',
      'date': date,
      'cutoff': yesterday,
      'kind': 'Cash',
      'account': activeAccounts.firstOrNull?.id ?? '',
      'destination': activeAccounts.skip(1).firstOrNull?.id ?? '',
      'category':
          categoryChoices(income ? 'income' : 'expense').keys.firstOrNull ?? '',
      'splitCategory': expenseCategories.skip(1).firstOrNull ?? '',
      'splitAmount': '',
      'split': 'false',
      'splitCount': '2',
      'classification': 'expense',
      'incomeClass': 'other',
      'source': sourceId ?? '',
      'reason': '',
      'acknowledge': 'false',
      'notes': '',
      'reference': '',
      'institution': '',
      'sender': '',
      'feeTreatment': 'source_additional',
      'feeCategory': 'category-fees',
      'feeAccount': activeAccounts.firstOrNull?.id ?? '',
      'feeDate': '',
      'mode': 'compare',
    };
    if (action == FinancialAction.account) result['amount'] = '0.00';
    if (source != null) {
      if (action == FinancialAction.correction ||
          action == FinancialAction.reversal) {
        result.addAll(source.values);
        result['amount'] = phpDecimal(source.amount);
        result['reason'] = '';
        result['acknowledge'] = 'false';
        if (source.kind == 'opening') {
          result['account'] = source.postings
              .firstWhere((p) => p.ledger == 'cash')
              .account!;
        }
      } else if (action == FinancialAction.refund) {
        final first = source.postings.indexWhere((p) => p.ledger == 'expense');
        result['refundPosting'] = first < 0 ? '' : '${source.id}-p${first + 1}';
        result['account'] = source.values['account'] ?? result['account']!;
        result['refundCategory'] =
            source.postings
                .where((p) => p.ledger == 'expense')
                .firstOrNull
                ?.category ??
            '';
      } else if (action == FinancialAction.reconcile &&
          source.kind == 'reconcile') {
        result.addAll({
          'mode': 'adjustment',
          'account': source.values['account']!,
          'date': source.date,
          'amount': phpDecimal(source.amount),
        });
      }
      result['source'] = source.id;
      result['sourceVersion'] = '${source.number}';
    }
    return result;
  }

  LocalCommand command(
    FinancialAction action,
    Map<String, String> values,
    String id,
    int expected,
  ) => LocalCommand(
    id: id,
    owner: store.owner,
    expectedVersion: expected,
    kind: action == FinancialAction.reconcile && values['mode'] == 'adjustment'
        ? 'adjustment'
        : action.name,
    values: Map.unmodifiable(values),
  );

  @override
  FinancialPreview preview(
    FinancialAction action,
    Map<String, String> input,
    String commandId,
  ) {
    final errors = <String>[], effects = <String>[];
    var cash = <String, BigInt>{}, spending = BigInt.zero, amount = BigInt.zero;
    try {
      final p = planLocal(
        snapshot,
        command(action, input, commandId, snapshot.version),
      );
      effects.addAll(p.effects);
      if (p.revision case final r?) {
        amount = r.amount;
        for (final posting in r.postings) {
          if (posting.account case final a?) {
            cash[a] = (cash[a] ?? BigInt.zero) + posting.amount;
          }
          if (posting.ledger == 'expense') spending += posting.amount;
        }
      }
    } catch (e) {
      errors.add(
        e is LocalRuleException
            ? e.message
            : e is FormatException
            ? e.message
            : 'The financial values are invalid. Review the amount and source.',
      );
    }
    return FinancialPreview(
      commandId: commandId,
      version: snapshot.version,
      action: action,
      values: Map.unmodifiable(input),
      effects: List.unmodifiable(effects),
      errors: List.unmodifiable(errors),
      cash: Map.unmodifiable(cash),
      card: BigInt.zero,
      spending: spending,
      amount: amount,
    );
  }

  @override
  Future<DemoOutcome> commitPreview(
    FinancialPreview preview,
    DemoOutcome outcome,
  ) async {
    if (!preview.valid) reject('Review valid financial values before saving.');
    lastError = null;
    try {
      await store.commit(
        command(
          preview.action,
          preview.values,
          preview.commandId,
          preview.version,
        ),
      );
      await reload();
      return DemoOutcome.accepted;
    } catch (e) {
      // A commit may have succeeded before a subsequent query failed. Resolve
      // the original durable ID before allowing any new command.
      try {
        if (await store.hasReceipt(preview.commandId)) {
          await reload();
          return DemoOutcome.accepted;
        }
        await reload();
        lastError = e is LocalRuleException ? e.message : 'The save failed. Your draft is retained. Check available storage and retry.';
        return e is LocalRuleException && e.message.contains('changed')
            ? DemoOutcome.stale
            : DemoOutcome.unavailable;
      } catch (_) {
        lastError = 'The result could not be read. Reopen this profile to check the original command before trying again.';
        return DemoOutcome.unknown;
      }
    }
  }

  Future<DemoOutcome> resolveReceipt(String id) async {
    try {
      if (await store.hasReceipt(id)) {
        await reload();
        return DemoOutcome.accepted;
      }
      return DemoOutcome.unavailable;
    } catch (_) {
      return DemoOutcome.unknown;
    }
  }

  @override
  DemoOutcome execute(FinancialPreview p, DemoOutcome requested) =>
      throw StateError('Use the durable asynchronous command boundary.');
  @override
  void reset({bool empty = false, bool notify = true}) => throw StateError(
    'Production profiles cannot be reset through demo controls.',
  );
  Future<void> reload() async {
    snapshot = await store.snapshot();
    _publish();
    notifyListeners();
  }

  void _publish() {
    version = snapshot.version;
    accounts.clear();
    categories.clear();
    records.clear();
    categories.addAll(snapshot.categories.map((c) => c.name));
    for (final a in snapshot.accounts) {
      final opening = sumMinor(
        snapshot.current
            .where((r) => r.kind == 'opening')
            .expand((r) => r.postings)
            .where((p) => p.account == a.id)
            .map((p) => p.amount),
      );
      accounts.add(
        FinancialAccount(
          a.id,
          a.name,
          snapshot.balance(a.id),
          cutoff: a.cutoff,
          kind: a.kind,
          archived: a.archived,
        )..openingBalance = opening,
      );
    }
    final old = snapshot.superseded;
    for (final r in snapshot.revisions.reversed) {
      final cash = <String, BigInt>{}, spending = <String, BigInt>{};
      for (final p in r.postings) {
        if (p.account case final id?) {
          cash[id] = (cash[id] ?? BigInt.zero) + p.amount;
        }
        if (p.ledger == 'expense') {
          final name = categoryName(p.category);
          spending[name] = (spending[name] ?? BigInt.zero) + p.amount;
        }
      }
      records.add(
        FinancialRecord(
          id: r.id,
          title: r.title,
          kind: r.kind,
          amount: r.amount,
          date: r.date,
          accountId: r.values['account'] ?? cash.keys.firstOrNull ?? '',
          category: spending.isNotEmpty
              ? spending.keys.join(' / ')
              : categoryName(r.values['category']),
          cash: cash,
          affectedAccounts: {
            ...cash.keys,
            if (r.values['account'] case final String id) id,
            if (r.previous != null)
              ...snapshot
                  .revision(r.previous!)
                  .postings
                  .where((p) => p.account != null)
                  .map((p) => p.account!),
          },
          spending: sumMinor(spending.values),
          categorySpending: spending,
          sourceId: r.previous ?? r.source,
          revision: r.number,
          status: old.contains(r.id)
              ? 'Superseded · evidence retained'
              : r.change == 'reverse'
              ? 'Reversed · evidence retained'
              : 'Saved locally',
          note: [
            r.values['reason'] ?? '',
            r.values['reference'] ?? '',
            r.values['notes'] ?? '',
          ].where((v) => v.isNotEmpty).join('\n'),
        ),
      );
    }
    // Stable date ordering, newest accepted sequence first for ties.
    records.sort((a, b) => b.date.compareTo(a.date));
  }

  bool isCurrent(String id) => snapshot.current.any((r) => r.id == id);
  String comparisonStatus(String id) {
    final r = snapshot.revision(id), account = r.values['account']!;
    final now = snapshot.balance(account, through: r.date);
    final count = snapshot.current
        .expand((r) => r.postings)
        .where((p) => p.account == account && p.date.compareTo(r.date) <= 0)
        .length;
    if ('$now' != r.values['calculated'] ||
        '$count' != r.values['sourceCount']) {
      return 'Sources changed · compare again';
    }
    return r.amount == BigInt.zero ? 'Verified' : 'Difference requires review';
  }

  BigInt get recognizedSpending => sumMinor(
    snapshot.current
        .expand((r) => r.postings)
        .where((p) => p.ledger == 'expense')
        .map((p) => p.amount),
  );
  BigInt get recognizedIncome => -sumMinor(
    snapshot.current
        .expand((r) => r.postings)
        .where((p) => p.ledger == 'income')
        .map((p) => p.amount),
  );
  BigInt spendingOn(String date) => sumMinor(
    snapshot.current
        .expand((r) => r.postings)
        .where((p) => p.ledger == 'expense' && p.date == date)
        .map((p) => p.amount),
  );
}
