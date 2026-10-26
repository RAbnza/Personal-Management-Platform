import '../local/finance_domain.dart';
import '../p0/exact_money.dart';

/// P4 must supply immutable owned purchase/refund evidence. P3 only changes the
/// consumed-share classification; adopting an existing card purchase must add
/// neither cash nor card liability. Production integration is implemented by
/// planSharedPrivate using the same immutable card journal evidence.
class SharedCardEvidence {
  const SharedCardEvidence({
    required this.owner,
    required this.transaction,
    required this.revision,
    required this.fundedMinor,
    required this.liabilityMinor,
  });
  final String owner, transaction, revision;
  final BigInt fundedMinor, liabilityMinor;
}

class SharedCardClassification {
  const SharedCardClassification(this.expense, this.position);
  final BigInt expense, position;
  BigInt get additionalCash => BigInt.zero;
  BigInt get additionalCardLiability => BigInt.zero;
}

SharedCardClassification classifyExistingSharedCard({
  required String owner,
  required SharedCardEvidence evidence,
  required String expectedRevision,
  required BigInt contribution,
  required BigInt consumedShare,
}) {
  if (evidence.owner != owner ||
      evidence.transaction.isEmpty ||
      evidence.revision != expectedRevision ||
      evidence.fundedMinor != contribution ||
      evidence.liabilityMinor != contribution) {
    reject('Current owned P4 card purchase evidence is required.');
  }
  component(contribution, positive: true);
  if (consumedShare != BigInt.zero) component(consumedShare, positive: true);
  return SharedCardClassification(consumedShare, contribution - consumedShare);
}
