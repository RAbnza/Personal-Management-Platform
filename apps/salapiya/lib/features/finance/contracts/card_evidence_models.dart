class CardStatementEvidence {
  const CardStatementEvidence({
    required this.id,
    required this.start,
    required this.end,
    required this.issued,
    required this.due,
    required this.balance,
    required this.reference,
    this.minimum,
    this.version = 1,
    this.previous,
  });
  final String id, start, end, issued, due, reference;
  final BigInt balance;
  final BigInt? minimum;
  final int version;
  final CardStatementEvidence? previous;
}

class CardPlanEvidence {
  const CardPlanEvidence({
    required this.id,
    required this.name,
    required this.source,
    required this.amount,
    required this.count,
    required this.due,
    required this.reference,
    this.principal,
    this.interest,
    this.fee,
    this.version = 1,
    this.previous,
  });
  final String id, name, source, due, reference;
  final BigInt amount;
  final BigInt? principal, interest, fee;
  final int count, version;
  final CardPlanEvidence? previous;
}
