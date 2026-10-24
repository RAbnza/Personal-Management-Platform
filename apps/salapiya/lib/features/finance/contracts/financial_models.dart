import '../../../prototype/fixtures.dart';

enum FinancialAction {
  account('Create account', 'Give everyday money a home'),
  expense('Add expense', 'A little detail. A clearer picture.'),
  income('Record income', 'Money coming your way'),
  transfer('Transfer money', 'Move money with intention'),
  correction('Correct transaction', 'Keep the original. Explain the change.'),
  refund('Record refund', 'Return money to its source'),
  reversal('Reverse transaction', 'Preserve the complete story'),
  reconcile('Reconcile account', 'Compare your records with reality'),
  category('Create category', 'Make your spending meaningful'),
  archive('Archive account', 'Keep history, close new activity'),
  debtImport('Add existing debt', 'Start from what you know'),
  borrowing('Record borrowing', 'Proceeds and promises, separately'),
  debtPayment('Record debt payment', 'Know what this payment covers'),
  debtClassification(
    'Resolve payment classification',
    'Evidence replaces uncertainty',
  ),
  schedule('Revise schedule', 'A new plan, with the old one intact'),
  payoff('Review early settlement', 'Close a chapter with evidence'),
  cardPurchase('Record card purchase', 'Credit is a commitment'),
  cardPayment('Pay credit card', 'One purchase. One spending effect.'),
  cardRefund('Refund card purchase', 'A credit, not new income'),
  cardFee('Record card fee', 'Recognize a provider charge'),
  cardInterest('Record card interest', 'Keep borrowing costs visible'),
  statement('Review statement', 'Provider evidence beside your records'),
  installment('Review installment plan', 'Expected payments, clearly marked'),
  group('Create group', 'Good company. Clear money.'),
  member('Add participant', 'A person, with their own boundaries'),
  invitation('Review invitation', 'Consent comes before membership'),
  sharedBill('Add shared expense', 'Everyone’s part, down to the centavo'),
  sharedCorrection(
    'Correct shared expense',
    'A new revision, never erased history',
  ),
  sharedRefund(
    'Refund shared expense',
    'Who received it? Whose share changed?',
  ),
  settlement('Report payment', 'A report today. A confirmed receipt next.'),
  settlementPrivate('Link private payment', 'Record actual money exactly once'),
  confirmation(
    'Review payment confirmation',
    'Receipt is separate from synchronization',
  ),
  adoption('Adopt private effect', 'Your records. Your permission.'),
  privateReview(
    'Review private difference',
    'Keep genuine evidence in your hands',
  );

  const FinancialAction(this.label, this.caption);
  final String label, caption;
}

class FinancialAccount {
  FinancialAccount(
    this.id,
    this.name,
    this.balance, {
    this.cutoff = '2026-10-14',
    this.kind = 'Cash',
    this.archived = false,
  }) : openingBalance = balance;
  final String id, name, kind;
  String cutoff;
  BigInt openingBalance;
  BigInt balance;
  bool archived;
}

class FinancialRecord {
  FinancialRecord({
    required this.id,
    required this.title,
    required this.kind,
    required this.amount,
    required this.date,
    required this.accountId,
    required this.category,
    required Map<String, BigInt> cash,
    BigInt? card,
    BigInt? spending,
    Map<String, BigInt>? categorySpending,
    this.sourceId,
    this.note = '',
    this.status = 'Accepted demo',
    this.revision = 1,
  }) : cash = Map.unmodifiable(cash),
       card = card ?? BigInt.zero,
       spending = spending ?? BigInt.zero,
       categorySpending = Map.unmodifiable(
         categorySpending ?? {category: spending ?? BigInt.zero},
       );
  final String id, title, kind, date, accountId, category, note, status;
  final String? sourceId;
  final BigInt amount, card, spending;
  final Map<String, BigInt> cash;
  final Map<String, BigInt> categorySpending;
  final int revision;
  bool get sharedOnly =>
      cash.isEmpty &&
      card == BigInt.zero &&
      spending == BigInt.zero &&
      [
        'group',
        'member',
        'invitation',
        'sharedBill',
        'sharedCorrection',
        'sharedRefund',
        'settlement',
        'confirmation',
      ].contains(kind);
}

class DebtRecord {
  DebtRecord(this.id, this.name, this.principal, {this.openingKnown = true});
  final String id, name;
  BigInt principal;
  final bool openingKnown;
  BigInt unresolved = BigInt.zero;
  BigInt charges = BigInt.zero;
  bool importedCharges = false;
  BigInt contractualPaid = BigInt.zero;
  int scheduleVersion = 1;
  String firstDue = '2026-10-28';
  int installments = 10;
  BigInt expected = BigInt.from(200000);
  final List<String> history = [];
}

class SharedBill {
  SharedBill({
    required this.id,
    required this.title,
    required this.total,
    required Map<String, BigInt> paid,
    required Map<String, BigInt> shares,
    this.creator = 'Amihan',
    this.revision = 1,
    this.previous,
    this.reason = '',
    this.groupId = 'household',
  }) : paid = Map.unmodifiable(paid),
       shares = Map.unmodifiable(shares);
  final String id, title, creator, reason, groupId;
  final int revision;
  final BigInt total;
  final Map<String, BigInt> paid, shares;
  final SharedBill? previous;
  final Map<String, BigInt> receivedRefunds = {}, shareRefunds = {};
  BigInt get refunded =>
      receivedRefunds.values.fold(BigInt.zero, (a, b) => a + b);
}

enum SettlementStatus {
  pending,
  confirmed,
  manual,
  disputed,
  cancelled,
  reversed,
}

class SharedSettlement {
  SharedSettlement({
    required this.id,
    required this.sender,
    required this.recipient,
    required this.amount,
    required this.allocations,
    required this.versions,
    this.status = SettlementStatus.pending,
    this.groupId = 'household',
  });
  final String id, sender, recipient, groupId;
  final BigInt amount;
  final Map<String, BigInt> allocations;
  final Map<String, int> versions;
  SettlementStatus status;
  final List<String> history = ['Reported · awaiting receipt'];
  bool get confirmed =>
      status == SettlementStatus.confirmed || status == SettlementStatus.manual;
  bool get projected => confirmed || status == SettlementStatus.pending;
  BigInt get advance =>
      amount - allocations.values.fold(BigInt.zero, (a, b) => a + b);
}

class PrivateAdoption {
  PrivateAdoption(
    this.billId,
    this.revision,
    this.funding,
    this.share,
    this.source,
    this.existingId,
  );
  final String billId, source;
  final String? existingId;
  final int revision;
  final BigInt funding, share;
}

enum DemoOutcome { accepted, pending, stale, unavailable, unknown }

/// Frozen reviewed payload. Execution and uncertain-result lookup use the same ID.
class FinancialPreview {
  FinancialPreview({
    required this.commandId,
    required this.version,
    required this.action,
    required this.values,
    required this.effects,
    required this.errors,
    required this.cash,
    required this.card,
    required this.spending,
    required this.amount,
  });
  final String commandId;
  final int version;
  final FinancialAction action;
  final Map<String, String> values;
  final List<String> effects, errors;
  final Map<String, BigInt> cash;
  final BigInt card, spending, amount;
  bool get valid => errors.isEmpty;
}

abstract final class ExactFinance {
  static BigInt sum(Iterable<BigInt> values) =>
      values.fold(BigInt.zero, (a, b) => a + b);
  static Map<String, BigInt> equal(
    BigInt total,
    Iterable<String> participants,
  ) {
    final names = participants.toList()..sort();
    if (names.isEmpty) return {};
    final count = BigInt.from(names.length);
    final base = total ~/ count;
    final remainder = (total % count).toInt();
    return {
      for (var i = 0; i < names.length; i++)
        names[i]: base + (i < remainder ? BigInt.one : BigInt.zero),
    };
  }

  static String decimal(BigInt value) =>
      '${value ~/ BigInt.from(100)}.${(value.abs() % BigInt.from(100)).toString().padLeft(2, '0')}';
  static String money(BigInt value) => DemoMoney.format(value);
}
