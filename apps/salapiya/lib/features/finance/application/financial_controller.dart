import 'package:flutter/foundation.dart';

import '../../../prototype/activity.dart';
import '../../../prototype/fixtures.dart';
import '../contracts/financial_models.dart';
import '../../supporting/application/supporting_controller.dart';
import 'import_controller.dart';
import '../contracts/card_evidence_models.dart';

part 'shared_controller.dart';
part 'card_evidence_controller.dart';

/// Memory-only command/preview boundary. No storage, auth, network or posting.
class FinancialController extends ChangeNotifier {
  FinancialController({bool demo = true}) {
    if (demo) reset(notify: false);
    files.addListener(changed);
  }
  bool get production => false;
  Future<DemoOutcome> commitPreview(
    FinancialPreview preview,
    DemoOutcome outcome,
  ) async => execute(preview, outcome);
  Future<Map<String, dynamic>?> restoreDraft(String operation) async => null;
  Future<void> retainDraft(
    String operation,
    String id,
    Map<String, String> values,
  ) async {}
  Future<void> discardDraft(String operation) async {}
  final files = SupportingController();
  ImportController? _importSession;
  ImportController get importSession =>
      _importSession ??= ImportController(this);
  @override
  void dispose() {
    _importSession?.dispose();
    files.removeListener(changed);
    files.dispose();
    super.dispose();
  }

  final List<FinancialAccount> accounts = [];
  final List<FinancialRecord> records = [];
  final List<DebtRecord> debts = [];
  final List<String> categories = [];
  final List<SharedBill> bills = [];
  final List<SharedSettlement> settlements = [];
  final Map<String, PrivateAdoption> adoptions = {};
  final Map<String, String> retainedReviews = {};
  final Map<String, String> groups = {};
  final Map<String, String> groupOwners = {};
  final Set<String> unavailableOwners = {}, archivedGroups = {};
  final Map<String, Set<String>> exitEntitlements = {};
  final Map<String, List<String>> exitHistories = {};
  bool get isGroupOwner =>
      actor == (groupOwners[activeGroup] ?? 'Amihan') && !formerMember;
  bool get groupAdministrationAvailable =>
      isGroupOwner &&
      !unavailableOwners.contains(activeGroup) &&
      !archivedGroups.contains(activeGroup);
  final Map<String, Map<String, String>> memberSets = {};
  Map<String, String> get members =>
      memberSets.putIfAbsent(activeGroup, () => {});
  final Map<String, List<String>> _groupHistories = {};
  List<String> get groupHistory =>
      _groupHistories.putIfAbsent(activeGroup, () => []);
  final List<String> statementHistory = [], installmentHistory = [];
  final Map<String, FinancialPreview> _submitted = {};
  final Map<String, DemoOutcome> _receipts = {};
  final Set<String> _applied = {};
  final Map<String, String> unresolvedPayments = {};
  final Set<String> planningDependencies = {};
  final List<CardStatementEvidence> statementDefinitions = [];
  final List<CardPlanEvidence> planDefinitions = [];
  final Set<String> suspendedPlans = {};
  final Map<String, BigInt> statementCoverage = {};
  final Map<String, Map<String, BigInt>> cardPaymentCoverage = {};
  final Map<String, Map<int, (String, BigInt)>> allInstallmentApplications = {};
  String activeStatementId = 'statement-oct', activePlanId = 'provider-plan';
  Map<int, (String, BigInt)> get installmentApplications =>
      allInstallmentApplications.putIfAbsent(activePlanId, () => {});
  final Set<String> privateSettlements = {};
  final Map<String, String> privateSettlementReviews = {};
  void changed() => notifyListeners();
  String activeGroup = 'household', actor = 'Amihan';
  bool formerMember = false;
  bool available = true;
  BigInt cardBalance = BigInt.from(480000), cardLimit = BigInt.from(5000000);
  BigInt statementBalance = BigInt.from(480000),
      statementAllocated = BigInt.zero;
  BigInt installmentAmount = BigInt.from(100000);
  int installmentCount = 6, statementVersion = 1, installmentVersion = 1;
  String statementDue = '2026-10-27', installmentDue = '2026-10-27';
  int version = 0, _serial = 0;
  BigInt get liquid => ExactFinance.sum(accounts.map((a) => a.balance));
  BigInt get debtTotal =>
      ExactFinance.sum(debts.map((d) => d.principal + d.charges));
  List<FinancialAccount> get activeAccounts =>
      accounts.where((a) => !a.archived).toList();
  BigInt get pendingOutflow => ExactFinance.sum(
    _submitted.entries
        .where((e) => _receipts[e.key] == DemoOutcome.pending)
        .map((e) => ExactFinance.sum(e.value.cash.values)),
  );
  FinancialAccount account(String id) => accounts.firstWhere((a) => a.id == id);
  DebtRecord debt(String id) => debts.firstWhere((d) => d.id == id);
  String nextCommand() => 'demo-${++_serial}';
  String amount(BigInt value) => DemoMoney.format(value);
  List<FinancialPreview> get waitingCommands => _submitted.values
      .where(
        (p) =>
            _receipts[p.commandId] == DemoOutcome.pending ||
            _receipts[p.commandId] == DemoOutcome.unknown,
      )
      .toList();

  void reset({bool empty = false, bool notify = true}) {
    _importSession?.dispose();
    _importSession = null;
    files.reset(empty: empty);
    available = true;
    unresolvedPayments.clear();
    planningDependencies.clear();
    installmentApplications.clear();
    privateSettlements.clear();
    privateSettlementReviews.clear();
    accounts.clear();
    records.clear();
    debts.clear();
    categories.clear();
    bills.clear();
    settlements.clear();
    adoptions.clear();
    retainedReviews.clear();
    groups.clear();
    groupOwners.clear();
    unavailableOwners.clear();
    archivedGroups.clear();
    exitEntitlements.clear();
    exitHistories.clear();
    memberSets.clear();
    _groupHistories.clear();
    statementHistory.clear();
    installmentHistory.clear();
    _submitted.clear();
    _receipts.clear();
    _applied.clear();
    categories.addAll([
      'Food & drink',
      'Transport',
      'Groceries',
      'Bills',
      'Income',
      'Other',
    ]);
    cardBalance = empty ? BigInt.zero : BigInt.from(480000);
    statementBalance = cardBalance;
    statementAllocated = BigInt.zero;
    statementVersion = 1;
    installmentVersion = 1;
    installmentAmount = empty ? BigInt.zero : BigInt.from(100000);
    installmentCount = empty ? 0 : 6;
    statementDue = installmentDue = '2026-10-27';
    resetCardEvidence(empty: empty);
    actor = 'Amihan';
    formerMember = false;
    activeGroup = 'household';
    groups['household'] = 'Demo household';
    groupOwners['household'] = 'Amihan';
    members.addAll({
      'Amihan': 'Registered · owner',
      'Tala': 'Registered · member',
      'Nico': 'Manual · no login',
    });
    if (!empty) {
      for (var i = 0; i < demoAccounts.length; i++) {
        accounts.add(
          FinancialAccount(
            'account-$i',
            demoAccounts[i].$1,
            BigInt.parse(demoAccounts[i].$2),
            kind: ['Cash', 'Bank', 'Mobile wallet'][i],
          ),
        );
      }
      var n = 0;
      for (final e in DemoActivity.entries) {
        final a = accounts.firstWhere((a) => a.name == e.account);
        records.add(
          FinancialRecord(
            id: 'seed-${n++}',
            title: e.title,
            kind: e.income ? 'income' : 'expense',
            amount: e.amount.abs(),
            date: '2026-10-${e.day}',
            accountId: a.id,
            category: e.category,
            cash: {a.id: e.amount},
            spending: e.income ? BigInt.zero : -e.amount,
          ),
        );
      }
      for (final a in accounts) {
        a.openingBalance =
            a.balance -
            ExactFinance.sum(records.map((r) => r.cash[a.id] ?? BigInt.zero));
      }
      debts.add(
        DebtRecord('debt-1', 'Home essentials loan', BigInt.from(1800000))
          ..history.add(
            'Opening principal ₱18,000.00 · supplied evidence, no historical cash created',
          ),
      );
      bills.add(
        SharedBill(
          id: 'bill-1',
          title: 'Dinner at the weekend market',
          total: BigInt.from(120000),
          paid: {'Amihan': BigInt.from(120000)},
          shares: {for (final p in members.keys) p: BigInt.from(40000)},
        ),
      );
      settlements.add(
        SharedSettlement(
          id: 'settlement-1',
          sender: 'Tala',
          recipient: 'Amihan',
          amount: BigInt.from(15000),
          allocations: {'bill-1': BigInt.from(15000)},
          versions: {'bill-1': 1},
        ),
      );
    }
    version++;
    if (notify) notifyListeners();
  }

  Map<String, String> defaults(FinancialAction action, {String? sourceId}) {
    final a = activeAccounts;
    final v = <String, String>{
      'amount': '185.50',
      'fee': '0.00',
      'charges': '0.00',
      'waiver': '0.00',
      'avoided': '0.00',
      'date': '2026-10-21',
      'name': '',
      'reason': '',
      'account': a.isEmpty ? '' : a.first.id,
      'destination': a.length > 1 ? a[1].id : '',
      'category': categories.first,
      'source': sourceId ?? '',
      'acknowledge': 'false',
      'split': 'false',
      'splitAmount': '150.00',
      'splitCategory': 'Transport',
      'debt': debts.isEmpty ? '' : debts.first.id,
      'principal': '1800.00',
      'interest': '200.00',
      'classification': 'Unresolved',
      'allocation': '2000.00',
      'count': '10',
      'due': '2026-10-28',
      'evidence': '',
      'group': activeGroup,
      'sender': 'Tala',
      'recipient': 'Amihan',
      'mode': 'Equal',
      'funding': 'New cash',
      'decision': 'Confirm receipt',
      'cutoff': '2026-10-14',
    };
    switch (action) {
      case FinancialAction.account:
        v.addAll({'amount': '0.00', 'kind': 'Cash'});
      case FinancialAction.income:
        v.addAll({'amount': '18000.00', 'category': 'Income'});
      case FinancialAction.transfer:
        v.addAll({'amount': '1000.00', 'fee': '10.00'});
        if (a.length > 2) {
          v['account'] = a[1].id;
          v['destination'] = a[2].id;
        }
      case FinancialAction.debtImport:
        v.addAll({'name': 'Appliance loan', 'amount': '18000.00'});
      case FinancialAction.borrowing:
        v.addAll({
          'name': 'Personal loan',
          'amount': '10000.00',
          'fee': '500.00',
        });
      case FinancialAction.debtPayment:
        v.addAll({'amount': '2000.00', 'fee': '50.00'});
        if (a.length > 1) v['account'] = a[1].id;
      case FinancialAction.debtClassification:
        v['source'] = sourceId ?? unresolvedPayments.keys.firstOrNull ?? '';
        v['amount'] = '2000.00';
      case FinancialAction.settlementPrivate:
        v['source'] = sourceId ?? groupSettlements.firstOrNull?.id ?? '';
        v['decision'] = 'Link actual movement';
      case FinancialAction.schedule:
        v['amount'] = '2000.00';
      case FinancialAction.payoff:
        v.addAll({
          'amount': debts.isEmpty
              ? '18000.00'
              : ExactFinance.decimal(debts.first.principal),
          'interest': '0.00',
          'fee': '0.00',
        });
      case FinancialAction.cardPurchase:
        v.addAll({'amount': '1200.00', 'name': 'Home supplies'});
      case FinancialAction.cardPayment:
        v.addAll({'amount': '1000.00', 'allocation': '0.00'});
        if (a.length > 1) v['account'] = a[1].id;
      case FinancialAction.cardFee || FinancialAction.cardInterest:
        v['amount'] = '150.00';
      case FinancialAction.statement:
        v.addAll({
          'amount': ExactFinance.decimal(statementBalance),
          'allocation': '500.00',
          'due': statementDue,
        });
      case FinancialAction.installment:
        v.addAll({
          'amount': ExactFinance.decimal(installmentAmount),
          'count': '$installmentCount',
          'due': installmentDue,
        });
      case FinancialAction.reconcile:
        v['amount'] = a.isEmpty
            ? '0.00'
            : ExactFinance.decimal(a.first.balance);
      case FinancialAction.sharedBill ||
          FinancialAction.sharedCorrection ||
          FinancialAction.sharedRefund ||
          FinancialAction.settlement ||
          FinancialAction.confirmation ||
          FinancialAction.adoption ||
          FinancialAction.privateReview ||
          FinancialAction.group ||
          FinancialAction.member ||
          FinancialAction.invitation:
        sharedDefaults(action, v, sourceId);
      default:
        break;
    }
    if (sourceId != null && records.any((r) => r.id == sourceId)) {
      final r = records.firstWhere((r) => r.id == sourceId);
      v.addAll({
        'amount': ExactFinance.decimal(r.amount),
        'account': r.accountId,
        'name': r.title,
        'category': r.category,
      });
    }
    return v;
  }

  FinancialPreview preview(
    FinancialAction action,
    Map<String, String> input,
    String commandId,
  ) {
    final v = Map<String, String>.unmodifiable(input);
    final errors = <String>[], effects = <String>[];
    if (!available) {
      errors.add(
        'Financial history is unavailable. Complete the initial snapshot before reviewing this action. Your draft is retained.',
      );
    }
    final cash = <String, BigInt>{};
    var card = BigInt.zero, spending = BigInt.zero;
    BigInt parse(String key, {bool zero = false}) {
      final x = DemoMoney.parse(v[key] ?? '');
      if (x == null ||
          x < BigInt.zero ||
          (!zero && x == BigInt.zero) ||
          x > DemoMoney.maximumInput) {
        errors.add(
          '${fieldName(key)}: enter ${zero ? 'zero or ' : ''}a positive amount with at most two decimals.',
        );
        return BigInt.zero;
      }
      return x;
    }

    void requireText(String key, String message) {
      if ((v[key] ?? '').trim().isEmpty) errors.add(message);
    }

    void move(String id, BigInt change) {
      if (!activeAccounts.any((a) => a.id == id)) {
        errors.add('Select an active financial account.');
        return;
      }
      cash[id] = (cash[id] ?? BigInt.zero) + change;
    }

    final nonAmount = {
      FinancialAction.category,
      FinancialAction.archive,
      FinancialAction.group,
      FinancialAction.member,
      FinancialAction.invitation,
      FinancialAction.confirmation,
      FinancialAction.adoption,
      FinancialAction.privateReview,
    };
    final amount = action == FinancialAction.settlementPrivate
        ? settlements.where((s) => s.id == v['source']).firstOrNull?.amount ??
              BigInt.zero
        : action == FinancialAction.debtClassification
        ? records.where((r) => r.id == v['source']).firstOrNull?.amount ??
              BigInt.zero
        : nonAmount.contains(action)
        ? BigInt.zero
        : parse(
            'amount',
            zero: {
              FinancialAction.account,
              FinancialAction.reconcile,
            }.contains(action),
          );
    final source = v['account'] ?? '';
    final date = DateTime.tryParse(v['date'] ?? '');
    if (date == null ||
        !RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(v['date'] ?? '') ||
        date.toIso8601String().substring(0, 10) != v['date']) {
      errors.add('Use a valid YYYY-MM-DD date.');
    }
    if ([
      FinancialAction.statement,
      FinancialAction.installment,
    ].contains(action)) {
      final due = DateTime.tryParse(v['due'] ?? '');
      if (due == null ||
          !RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(v['due'] ?? '') ||
          due.toIso8601String().substring(0, 10) != v['due']) {
        errors.add('Use a valid YYYY-MM-DD due date.');
      }
    }
    switch (action) {
      case FinancialAction.debtClassification:
        final payment = records.where((r) => r.id == v['source']).firstOrNull;
        if (payment == null || !unresolvedPayments.containsKey(payment.id)) {
          errors.add('Choose an unresolved payment.');
          break;
        }
        final d = debt(unresolvedPayments[payment.id]!);
        final principal = parse('principal', zero: true),
            interest = parse('interest', zero: true);
        final charges = parse('charges', zero: true);
        if (charges > d.charges) {
          errors.add('Charge repayment exceeds recognized unpaid charges.');
        }
        if (principal + interest + charges != payment.amount) {
          errors.add(
            'Principal, new interest and previously recognized charges must equal the original contractual payment.',
          );
        }
        if (principal > d.principal) {
          errors.add(
            'Principal classification exceeds the recognized balance.',
          );
        }
        requireText('evidence', 'Supply classification evidence.');
        spending += interest;
        effects.add(
          'Reclassify ${this.amount(payment.amount)} clearing: principal ${this.amount(principal)}, interest ${this.amount(interest)}. No second cash movement. Original payment retained.',
        );
      case FinancialAction.settlementPrivate:
        final s = settlements.where((s) => s.id == v['source']).firstOrNull;
        if (s == null) {
          errors.add('Select a group payment.');
          break;
        }
        if (actor != 'Amihan' ||
            (s.sender != 'Amihan' && s.recipient != 'Amihan')) {
          errors.add('Only your own actual payment or receipt can be linked.');
        }
        if (v['decision'] == 'Review clearing coverage') {
          if (!privateSettlements.contains(s.id)) {
            errors.add('Link your actual payment or receipt first.');
          }
          requireText('reason', 'Explain the private clearing review.');
          final covered =
              s.confirmed &&
              s.allocations.keys.every(
                (id) => adoptions[id]?.revision == bill(id).revision,
              );
          effects.add(
            covered
                ? 'Reclassify allocated ${this.amount(s.amount - s.advance)} clearing against adopted receivable/payable; advance ${this.amount(s.advance)} stays separate. No cash replay.'
                : 'Retain actual cash evidence and unresolved clearing: confirmation or current adopted source coverage is incomplete. No cash replay.',
          );
          break;
        }
        if (privateSettlements.contains(s.id)) {
          errors.add(
            'This actual movement is already linked. Confirmation or reversal never posts it twice.',
          );
        }
        if (s.status == SettlementStatus.cancelled ||
            s.status == SettlementStatus.reversed) {
          errors.add(
            'Link a current report. Reversed evidence requires an explicit new funding review.',
          );
        }
        requireText('evidence', 'Describe evidence of actual money movement.');
        move(source, s.sender == 'Amihan' ? -s.amount : s.amount);
        effects.add(
          'Actual private ${s.sender == 'Amihan' ? 'payment' : 'receipt'} ${this.amount(s.amount)} against clearing. No income or spending. Group receipt state remains ${s.status.name}; incomplete adopted coverage stays in clearing.',
        );
      case FinancialAction.account:
        requireText('name', 'Name your account.');
        if (accounts.any(
          (a) => a.name.toLowerCase() == v['name']!.trim().toLowerCase(),
        )) {
          errors.add('Choose a unique account name.');
        }
        if (DateTime.tryParse(v['cutoff'] ?? '') == null) {
          errors.add('Enter an opening cutoff date.');
        }
        effects.add(
          'Opening balance ${this.amount(amount)} at ${v['cutoff']}; no income recognized.',
        );
      case FinancialAction.expense ||
          FinancialAction.income ||
          FinancialAction.cardPurchase:
        requireText('name', 'Add a description.');
        if (action == FinancialAction.cardPurchase || v['account'] == 'card') {
          if (action == FinancialAction.income) {
            errors.add('Income requires a liquid account.');
          }
          card += amount;
          spending += amount;
        } else {
          move(source, action == FinancialAction.income ? amount : -amount);
          if (action != FinancialAction.income) spending += amount;
        }
        if (v['split'] == 'true') {
          final first = parse('splitAmount');
          if (first >= amount) {
            errors.add(
              'The first category share must be smaller than the total.',
            );
          }
          if (v['splitCategory'] == v['category']) {
            errors.add('Choose two different categories.');
          }
          effects.add(
            '${v['category']}: ${this.amount(first)} · ${v['splitCategory']}: ${this.amount(amount - first)}',
          );
        }
      case FinancialAction.transfer:
        final fee = parse('fee', zero: true);
        if (source == v['destination']) {
          errors.add('Choose two different accounts.');
        }
        move(source, -amount - fee);
        move(v['destination'] ?? '', amount);
        spending += fee;
        effects.add(
          'Transfer is neither income nor spending. Only the ${this.amount(fee)} fee is spending.',
        );
      case FinancialAction.correction ||
          FinancialAction.refund ||
          FinancialAction.reversal ||
          FinancialAction.cardRefund:
        final originals = records.where((r) => r.id == v['source']).toList();
        if (originals.isEmpty) {
          errors.add('The original transaction is unavailable.');
          break;
        }
        final r = originals.first;
        if (!['expense', 'income', 'cardPurchase'].contains(r.kind)) {
          errors.add(
            'This linked action needs its source workflow; ordinary corrections are restricted.',
          );
        }
        if (adoptions.values.any((a) => a.existingId == r.id)) {
          errors.add(
            'Shared adoption depends on this record. Use private-effect review.',
          );
        }
        if (planningDependencies.contains(r.id) &&
            (action == FinancialAction.correction ||
                action == FinancialAction.reversal)) {
          errors.add(
            'Reverse the recurring actual link before correcting this source.',
          );
        }
        if (planDefinitions.any(
              (p) => p.source == r.id && !suspendedPlans.contains(p.id),
            ) &&
            [
              FinancialAction.correction,
              FinancialAction.reversal,
            ].contains(action)) {
          errors.add(
            'Suspend the attached installment plan before replacing its purchase evidence.',
          );
        }
        final children = records.where((x) => x.sourceId == r.id).toList();
        if (children.any(
          (x) => x.kind == 'reversal' || x.kind == 'correction',
        )) {
          errors.add(
            'This revision is already replaced or reversed. Open the latest evidence.',
          );
        }
        requireText('reason', 'Explain the correction or refund.');
        if (action == FinancialAction.refund ||
            action == FinancialAction.cardRefund) {
          if (r.kind == 'income') {
            errors.add(
              'Income cannot receive a purchase refund. Use correction or reversal.',
            );
          }
          final refunded = ExactFinance.sum(
            children
                .where((x) => x.kind == 'refund' || x.kind == 'cardRefund')
                .map((x) => x.amount),
          );
          if (amount + refunded > r.amount) {
            errors.add('Refund exceeds the remaining refundable amount.');
          }
          if (r.card != BigInt.zero) {
            card -= amount;
          } else {
            move(r.accountId, amount);
          }
          spending -= amount;
          effects.add(
            'Linked refund; not ordinary income. Original evidence remains.',
          );
        } else {
          if (children.isNotEmpty) {
            errors.add(
              'Dependent refunds block this replacement. Review linked evidence first.',
            );
          }
          for (final e in r.cash.entries) {
            move(e.key, -e.value);
          }
          card -= r.card;
          spending -= r.spending;
          if (action == FinancialAction.correction) {
            if (r.card != BigInt.zero) {
              card += amount;
            } else {
              move(r.accountId, r.kind == 'income' ? amount : -amount);
            }
            if (r.kind != 'income') spending += amount;
          }
          effects.add(
            'Original ${this.amount(r.amount)} → ${action == FinancialAction.reversal ? 'reversed' : this.amount(amount)}. Immutable source ${r.id}.',
          );
        }
      case FinancialAction.reconcile:
        if (!activeAccounts.any((a) => a.id == source)) {
          errors.add('Select an active account.');
          break;
        }
        requireText('reason', 'Explain the observed difference.');
        final difference = amount - account(source).balance;
        effects.add(
          'Recorded ${this.amount(account(source).balance)} · observed ${this.amount(amount)} · adjustment ${this.amount(difference)}. Adjustment is not ordinary income/spending.',
        );
        if (difference != BigInt.zero && v['acknowledge'] != 'true') {
          errors.add('Acknowledge the explicit balance adjustment.');
        }
        move(source, difference);
      case FinancialAction.category:
        requireText('name', 'Name the category.');
        if (categories.contains(v['name']?.trim())) {
          errors.add('This category already exists.');
        }
        effects.add('New category; no money movement.');
      case FinancialAction.archive:
        if (!activeAccounts.any((a) => a.id == source)) {
          errors.add('Choose an active account.');
        }
        effects.add(
          'History and balance retained; new entries disabled for this account.',
        );
      case FinancialAction.debtImport || FinancialAction.borrowing:
        requireText('name', 'Name the lender or debt.');
        final charges = parse('charges', zero: true);
        effects.add(
          'Separately recognized unpaid charge ${this.amount(charges)}; included in liability, never inferred from the schedule.',
        );
        if (action == FinancialAction.borrowing) {
          final fee = parse('fee', zero: true);
          if (fee >= amount) {
            errors.add(
              'Withheld fee must be less than the recognized borrowing.',
            );
          }
          move(source, amount - fee);
          spending += fee;
          spending += charges;
          effects.add(
            'Recognized principal ${this.amount(amount)}; net proceeds ${this.amount(amount - fee)}; withheld fee ${this.amount(fee)}. Borrowing is not income.',
          );
        } else {
          effects.add(
            'Opening liability ${this.amount(amount)}. No past cash movement, expense or payment invented.',
          );
        }
      case FinancialAction.debtPayment ||
          FinancialAction.schedule ||
          FinancialAction.payoff:
        if (!debts.any((d) => d.id == v['debt'])) {
          errors.add('Choose a debt first.');
          break;
        }
        final d = debt(v['debt']!);
        if (action == FinancialAction.schedule) {
          final count = int.tryParse(v['count'] ?? '') ?? 0;
          if (count < 1 || count > 120) errors.add('Use 1–120 installments.');
          if (DateTime.tryParse(v['due'] ?? '') == null) {
            errors.add('Enter a valid first due date.');
          }
          requireText('reason', 'Explain the schedule revision.');
          if (amount * BigInt.from(count) < d.contractualPaid) {
            errors.add(
              'The revised schedule cannot undercut retained paid coverage.',
            );
          }
          effects.add(
            'Carry ${this.amount(d.contractualPaid)} paid coverage into the revised schedule as a projection of the same payments, never a second payment. Old ${d.installments} × ${this.amount(d.expected)} → $count × ${this.amount(amount)}.',
          );
          effects.add(
            'Schedule v${d.scheduleVersion} → v${d.scheduleVersion + 1}. $count expected installments of ${this.amount(amount)}. Historical paid allocations stay on their original schedule; no money posted.',
          );
        } else if (action == FinancialAction.payoff) {
          final interest = parse('interest', zero: true),
              fee = parse('fee', zero: true);
          final waiver = parse('waiver', zero: true),
              avoided = parse('avoided', zero: true);
          if (waiver > d.charges) {
            errors.add(
              'Waiver exceeds recognized unpaid charges. Avoided future charges belong in the separate field.',
            );
          }
          if (waiver > BigInt.zero) {
            requireText(
              'reason',
              'Explain the provider-confirmed recognized-charge waiver.',
            );
          }
          requireText('evidence', 'Enter the provider payoff reference.');
          if (d.unresolved > BigInt.zero) {
            errors.add(
              'Unresolved payment classification blocks closure. Resolve the payment first.',
            );
          }
          if (amount != d.principal) {
            errors.add(
              'Stale or residual principal: provider principal must equal the current recognized principal. A waiver requires separate supported evidence.',
            );
          }
          if (v['acknowledge'] != 'true') {
            errors.add('Confirm the provider quote and closure.');
          }
          move(source, -amount - d.charges + waiver - interest - fee);
          spending +=
              interest + fee - (d.importedCharges ? BigInt.zero : waiver);
          effects.add(
            'Unpaid recognized charges ${this.amount(d.charges)} less waiver ${this.amount(waiver)}. ${d.importedCharges ? 'Imported-charge waiver uses opening adjustment, not an invented historic expense reversal.' : 'Waiver offsets only the charge previously recognized in this demo.'} Avoided future charges ${this.amount(avoided)} are schedule evidence only.',
          );
          effects.add(
            'Principal cleared ${this.amount(amount)}; interest ${this.amount(interest)}; fee ${this.amount(fee)}. Future scheduled charges are not expense reversals.',
          );
        } else {
          final fee = parse('fee', zero: true),
              allocation = parse('allocation', zero: true);
          if (allocation > amount ||
              allocation >
                  d.expected * BigInt.from(d.installments) -
                      d.contractualPaid) {
            errors.add(
              'Due allocation exceeds contractual payment or remaining schedule coverage.',
            );
          }
          move(source, -amount - fee);
          spending += fee;
          if (v['classification'] == 'Known') {
            final principal = parse('principal', zero: true),
                interest = parse('interest', zero: true);
            final charges = parse('charges', zero: true);
            if (charges > d.charges) {
              errors.add('Charge repayment exceeds recognized unpaid charges.');
            }
            if (principal + interest + charges != amount) {
              errors.add(
                'Principal, new interest and previously recognized charges must equal the contractual payment.',
              );
            }
            if (principal > d.principal) {
              errors.add(
                'Principal exceeds the remaining recognized liability.',
              );
            }
            spending += interest;
            effects.add(
              'Principal ${this.amount(principal)}; interest ${this.amount(interest)}; external fee ${this.amount(fee)}.',
            );
          } else {
            effects.add(
              'Contractual payment ${this.amount(amount)} stays in unresolved clearing. Principal/interest are unknown; recognized principal is not guessed.',
            );
          }
          effects.add(
            'Due coverage ${this.amount(allocation)} · unallocated ${this.amount(amount - allocation)} · external fees never satisfy installments.',
          );
        }
      case FinancialAction.cardPayment:
        final allocation = parse('allocation', zero: true);
        if (allocation > amount ||
            allocation > statementBalance - statementAllocated) {
          errors.add(
            'Allocation exceeds the payment or remaining statement due.',
          );
        }
        if (allocation > BigInt.zero) {
          requireText(
            'evidence',
            'Provide the statement allocation reference.',
          );
        }
        move(source, -amount);
        card -= amount;
        effects.add(
          'No additional purchase spending. Statement allocation ${this.amount(allocation)}; unallocated ${this.amount(amount - allocation)}.',
        );
      case FinancialAction.cardFee || FinancialAction.cardInterest:
        requireText('evidence', 'Enter provider charge evidence.');
        card += amount;
        spending += amount;
      case FinancialAction.statement:
        requireText('evidence', 'Enter the statement reference.');
        if (activeStatement.minimum != null &&
            amount < activeStatement.minimum!) {
          errors.add(
            'Review the statement minimum due before lowering its balance.',
          );
        }
        if (amount < statementAllocated) {
          errors.add(
            'Statement revision cannot undercut retained payment allocations.',
          );
        }
        effects.add(
          'Provider statement ${this.amount(amount)}; recorded card balance ${this.amount(cardBalance)}; difference ${this.amount(amount - cardBalance)} remains explicit. No fabricated adjustment. Statement v${statementVersion + 1}.',
        );
      case FinancialAction.installment:
        requireText('evidence', 'Enter the provider plan reference.');
        final count = int.tryParse(v['count'] ?? '') ?? 0;
        if (count < 1 || count > 120) errors.add('Use 1–120 installments.');
        if (installmentApplications.entries.any(
          (e) => e.key >= count || e.value.$2 > amount,
        )) {
          errors.add(
            'Reverse incompatible installment applications before revising the schedule.',
          );
        }
        effects.add(
          '$count expected payments of ${this.amount(amount)}. Applying this plan changes schedule evidence only; no repeat purchase or inferred interest.',
        );
      case FinancialAction.group ||
          FinancialAction.member ||
          FinancialAction.invitation ||
          FinancialAction.sharedBill ||
          FinancialAction.sharedCorrection ||
          FinancialAction.sharedRefund ||
          FinancialAction.settlement ||
          FinancialAction.confirmation ||
          FinancialAction.adoption ||
          FinancialAction.privateReview:
        final result = previewShared(action, v, amount, parse, errors, effects);
        for (final e in result.$1.entries) {
          move(e.key, e.value);
        }
        card += result.$2;
        spending += result.$3;
    }
    for (final e in cash.entries) {
      final a = account(e.key);
      if (e.value < BigInt.zero &&
          a.balance + e.value < BigInt.zero &&
          v['acknowledge'] != 'true') {
        errors.add(
          '${a.name} would be negative. Explicitly acknowledge the shortfall to proceed in this demo.',
        );
      }
      if ((v['date'] ?? '').compareTo(a.cutoff) <= 0) {
        errors.add('Date must be after ${a.name} opening cutoff ${a.cutoff}.');
      }
      effects.add(
        '${a.name}: ${this.amount(e.value)} → ${this.amount(a.balance + e.value)}',
      );
    }
    if (card != BigInt.zero) {
      effects.add(
        'Card liability change ${this.amount(card)} → ${this.amount(cardBalance + card)}${cardBalance + card < BigInt.zero ? ' (card credit; excluded from liquid funds)' : ''}',
      );
    }
    effects.add('Recognized spending change: ${this.amount(spending)}');
    return FinancialPreview(
      commandId: commandId,
      version: version,
      action: action,
      values: v,
      effects: List.unmodifiable(effects),
      errors: List.unmodifiable(errors.toSet()),
      cash: Map.unmodifiable(cash),
      card: card,
      spending: spending,
      amount: amount,
    );
  }

  String fieldName(String key) =>
      {
        'amount': 'Amount',
        'fee': 'Fee',
        'principal': 'Principal',
        'interest': 'Interest',
        'allocation': 'Allocation',
        'splitAmount': 'First split',
      }[key] ??
      key;

  DemoOutcome execute(FinancialPreview p, DemoOutcome requested) {
    if (_receipts.containsKey(p.commandId)) return _receipts[p.commandId]!;
    if (!p.valid || p.version != version) return DemoOutcome.stale;
    if (requested == DemoOutcome.stale ||
        requested == DemoOutcome.unavailable) {
      return requested;
    }
    _submitted[p.commandId] = p;
    _receipts[p.commandId] = requested;
    // Unknown intentionally models response loss after an accepted action.
    if (requested == DemoOutcome.accepted || requested == DemoOutcome.unknown) {
      _apply(p);
    }
    notifyListeners();
    return requested;
  }

  DemoOutcome checkResult(String id) {
    if (!_submitted.containsKey(id)) return DemoOutcome.unavailable;
    if (_receipts[id] == DemoOutcome.unknown) {
      _receipts[id] = DemoOutcome.accepted;
    }
    if (_receipts[id] == DemoOutcome.pending) {
      final p = _submitted[id]!;
      if (p.version != version) {
        _receipts[id] = DemoOutcome.stale;
      } else {
        _apply(p);
        _receipts[id] = DemoOutcome.accepted;
      }
    }
    notifyListeners();
    return _receipts[id]!;
  }

  void _apply(FinancialPreview p) {
    if (!_applied.add(p.commandId)) return;
    final v = p.values, action = p.action;
    for (final e in p.cash.entries) {
      account(e.key).balance += e.value;
    }
    cardBalance += p.card;
    switch (action) {
      case FinancialAction.debtClassification:
        final payment = records.firstWhere((r) => r.id == v['source']);
        final d = debt(unresolvedPayments.remove(payment.id)!);
        d.unresolved -= payment.amount;
        d.principal -= DemoMoney.parse(v['principal']!)!;
        d.charges -= DemoMoney.parse(v['charges']!)!;
        d.history.add(
          'Classification resolved for ${payment.id} · principal ${v['principal']} · interest ${v['interest']} · ${v['evidence']} · no cash replay',
        );
      case FinancialAction.settlementPrivate:
        privateSettlements.add(v['source']!);
        if (v['decision'] == 'Review clearing coverage') {
          privateSettlementReviews[v['source']!] =
              '${settlement(v['source']!).status.name} · ${v['reason']}';
        }
      case FinancialAction.account:
        accounts.add(
          FinancialAccount(
            p.commandId,
            v['name']!.trim(),
            p.amount,
            cutoff: v['cutoff']!,
            kind: v['kind'] ?? 'Cash',
          ),
        );
      case FinancialAction.archive:
        account(v['account']!).archived = true;
      case FinancialAction.category:
        categories.add(v['name']!.trim());
      case FinancialAction.debtImport || FinancialAction.borrowing:
        debts.add(
          DebtRecord(p.commandId, v['name']!, p.amount)
            ..charges = DemoMoney.parse(v['charges']!)!
            ..importedCharges = action == FinancialAction.debtImport
            ..history.add(
              '${action.label} · ${v['date']} · ${amount(p.amount)}',
            ),
        );
      case FinancialAction.debtPayment:
        final d = debt(v['debt']!);
        if (v['classification'] == 'Known') {
          d.principal -= DemoMoney.parse(v['principal']!)!;
          d.charges -= DemoMoney.parse(v['charges']!)!;
        } else {
          d.unresolved += p.amount;
          unresolvedPayments[p.commandId] = d.id;
        }
        d.contractualPaid += DemoMoney.parse(v['allocation']!)!;
        d.history.add(
          'Payment ${amount(p.amount)} · ${v['classification']} · schedule v${d.scheduleVersion} coverage ${v['allocation']} · ${v['date']}',
        );
      case FinancialAction.payoff:
        final d = debt(v['debt']!);
        d.principal = BigInt.zero;
        d.charges = BigInt.zero;
        d.history.add(
          'Provider payoff ${v['evidence']} · ${v['date']} · original schedule retained',
        );
      case FinancialAction.schedule:
        final d = debt(v['debt']!);
        d.history.add(
          'Schedule v${d.scheduleVersion}: ${d.installments} × ${amount(d.expected)} from ${d.firstDue} · ${v['reason']}',
        );
        d.scheduleVersion++;
        d.expected = p.amount;
        d.installments = int.parse(v['count']!);
        d.firstDue = v['due']!;
      case FinancialAction.cardPayment:
        statementAllocated += DemoMoney.parse(v['allocation']!)!;
        statementCoverage[activeStatementId] = statementAllocated;
        cardPaymentCoverage[p.commandId] = {
          activeStatementId: DemoMoney.parse(v['allocation']!)!,
        };
      case FinancialAction.statement:
        statementHistory.add(
          'v$statementVersion · ${amount(statementBalance)} · ${v['evidence']}',
        );
        statementVersion++;
        statementBalance = p.amount;
        statementDue = v['due']!;
        retainCurrentStatement();
      case FinancialAction.installment:
        installmentHistory.add(
          'v$installmentVersion · $installmentCount × ${amount(installmentAmount)} · ${v['evidence']}',
        );
        installmentVersion++;
        installmentAmount = p.amount;
        installmentCount = int.parse(v['count']!);
        installmentDue = v['due']!;
        retainCurrentPlan();
      case FinancialAction.group ||
          FinancialAction.member ||
          FinancialAction.invitation ||
          FinancialAction.sharedBill ||
          FinancialAction.sharedCorrection ||
          FinancialAction.sharedRefund ||
          FinancialAction.settlement ||
          FinancialAction.confirmation ||
          FinancialAction.adoption ||
          FinancialAction.privateReview:
        applyShared(p);
      default:
        break;
    }
    records.insert(
      0,
      FinancialRecord(
        id: p.commandId,
        title: (v['name'] ?? '').isEmpty ? action.label : v['name']!,
        kind: action.name,
        amount: p.amount,
        date: v['date']!,
        accountId: v['account'] ?? '',
        category: v['category'] ?? 'Other',
        cash: p.cash,
        card: p.card,
        spending: p.spending,
        categorySpending: classifiedSpending(p),
        sourceId: (v['source'] ?? '').isEmpty ? null : v['source'],
        note: '${v['reason'] ?? ''}\n${p.effects.join('\n')}',
      ),
    );
    version++;
  }

  Map<String, BigInt> classifiedSpending(FinancialPreview p) {
    final v = p.values;
    if ([
          FinancialAction.expense,
          FinancialAction.cardPurchase,
        ].contains(p.action) &&
        v['split'] == 'true') {
      final first = DemoMoney.parse(v['splitAmount']!)!;
      return {v['category']!: first, v['splitCategory']!: p.spending - first};
    }
    if ([
      FinancialAction.correction,
      FinancialAction.reversal,
    ].contains(p.action)) {
      final original = records.firstWhere((r) => r.id == v['source']);
      final categories = {
        for (final e in original.categorySpending.entries) e.key: -e.value,
      };
      if (p.action == FinancialAction.correction && original.kind != 'income') {
        final category = v['category'] ?? original.category;
        categories[category] = (categories[category] ?? BigInt.zero) + p.amount;
      }
      return categories;
    }
    return {v['category'] ?? 'Other': p.spending};
  }

  void applyHistoricalImport(
    String batch,
    String accountId,
    BigInt earlierOpening,
    BigInt net,
    List<(String, String, BigInt)> rows,
  ) {
    if (_applied.contains(batch)) return;
    final a = account(accountId);
    if (earlierOpening + net != a.openingBalance) {
      throw StateError('Opening equation changed');
    }
    _applied.add(batch);
    final oldOpening = a.openingBalance;
    a.openingBalance = earlierOpening;
    a.cutoff = '2026-10-10';
    var day = 11;
    for (final row in rows) {
      records.insert(
        0,
        FinancialRecord(
          id: '$batch-row-${row.$1}',
          title: row.$2,
          kind: row.$3 > BigInt.zero ? 'income' : 'expense',
          amount: row.$3.abs(),
          date: '2026-10-${day++}',
          accountId: accountId,
          category: row.$3 > BigInt.zero ? 'Income' : 'Other',
          cash: {accountId: row.$3},
          spending: row.$3 > BigInt.zero ? BigInt.zero : -row.$3,
          note:
              'Historical rebase: ${amount(earlierOpening)} + ${amount(net)} = retained baseline ${amount(oldOpening)}. Current balance unchanged.',
        ),
      );
    }
    version++;
    notifyListeners();
  }
}
