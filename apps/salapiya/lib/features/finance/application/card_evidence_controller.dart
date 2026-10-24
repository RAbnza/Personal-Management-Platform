part of 'financial_controller.dart';

extension CardEvidenceCommands on FinancialController {
  CardStatementEvidence get activeStatement =>
      statementDefinitions.firstWhere((x) => x.id == activeStatementId);
  CardPlanEvidence get activePlan =>
      planDefinitions.firstWhere((x) => x.id == activePlanId);
  void resetCardEvidence({bool empty = false}) {
    statementDefinitions.clear();
    planDefinitions.clear();
    suspendedPlans.clear();
    statementCoverage.clear();
    cardPaymentCoverage.clear();
    allInstallmentApplications.clear();
    activeStatementId = 'statement-oct';
    activePlanId = 'provider-plan';
    statementDefinitions.add(
      CardStatementEvidence(
        id: activeStatementId,
        start: '2026-09-15',
        end: '2026-10-14',
        issued: '2026-10-15',
        due: statementDue,
        balance: statementBalance,
        reference: empty ? 'Empty demo evidence' : 'DEMO-OCT-001',
      ),
    );
    planDefinitions.add(
      CardPlanEvidence(
        id: activePlanId,
        name: 'Home essentials provider plan',
        source: 'Opening evidence',
        amount: installmentAmount,
        count: installmentCount,
        due: installmentDue,
        reference: 'DEMO-PLAN-001',
      ),
    );
  }

  void selectStatement(String id) {
    final item = statementDefinitions.firstWhere((x) => x.id == id);
    activeStatementId = id;
    statementBalance = item.balance;
    statementDue = item.due;
    statementVersion = item.version;
    statementAllocated = statementCoverage[id] ?? BigInt.zero;
    version++;
    changed();
  }

  void selectPlan(String id) {
    final item = planDefinitions.firstWhere((x) => x.id == id);
    activePlanId = id;
    installmentAmount = item.amount;
    installmentDue = item.due;
    installmentCount = item.count;
    installmentVersion = item.version;
    version++;
    changed();
  }

  DateTime evidenceDate(String text) {
    final d = DateTime.tryParse(text);
    if (d == null ||
        d.toIso8601String().substring(0, 10) != text ||
        d.year < 1900 ||
        d.year > 2199) {
      throw const FormatException(
        'Use a valid YYYY-MM-DD date from 1900–2199.',
      );
    }
    return d;
  }

  BigInt evidenceAmount(String text) {
    final v = DemoMoney.parse(text);
    if (v == null || v < BigInt.zero) {
      throw const FormatException(
        'Use a nonnegative PHP amount with at most two decimals.',
      );
    }
    return v;
  }

  void saveStatementEvidence(
    Map<String, String> v, {
    CardStatementEvidence? old,
  }) {
    final start = evidenceDate(v['start']!),
        end = evidenceDate(v['end']!),
        issued = evidenceDate(v['issued']!),
        due = evidenceDate(v['due']!);
    final amount = evidenceAmount(v['amount']!),
        minimum = (v['minimum'] ?? '').isEmpty
            ? null
            : evidenceAmount(v['minimum']!);
    if (end.isBefore(start) || issued.isBefore(end) || due.isBefore(issued)) {
      throw const FormatException(
        'Review cycle, statement and due-date order.',
      );
    }
    if (minimum != null && minimum > amount) {
      throw const FormatException(
        'Minimum due exceeds the provider statement balance.',
      );
    }
    if (amount < (statementCoverage[old?.id] ?? BigInt.zero)) {
      throw const FormatException(
        'Reverse incompatible allocations before revising the balance.',
      );
    }
    if (statementDefinitions.any(
      (x) => x.id != old?.id && x.reference == v['reference'],
    )) {
      throw const FormatException(
        'Provider reference already exists. Open and revise its evidence.',
      );
    }
    final item = CardStatementEvidence(
      id: old?.id ?? nextCommand(),
      start: v['start']!,
      end: v['end']!,
      issued: v['issued']!,
      due: v['due']!,
      balance: amount,
      minimum: minimum,
      reference: v['reference']!,
      version: (old?.version ?? 0) + 1,
      previous: old,
    );
    statementDefinitions.removeWhere((x) => x.id == item.id);
    statementDefinitions.add(item);
    statementHistory.add(
      '${item.reference} v${item.version} · ${v['reason'] ?? 'Created'} · no posting',
    );
    selectStatement(item.id);
  }

  void savePlanEvidence(Map<String, String> v, {CardPlanEvidence? old}) {
    evidenceDate(v['due']!);
    final amount = evidenceAmount(v['amount']!),
        count = int.tryParse(v['count']!) ?? 0;
    if (count < 1 || count > 120 || amount <= BigInt.zero) {
      throw const FormatException('Use 1–120 positive installments.');
    }
    if (v['source'] != 'Opening evidence' &&
        !records.any((r) => r.id == v['source'] && r.kind == 'cardPurchase')) {
      throw const FormatException(
        'Select an existing card purchase or explicit opening provider evidence.',
      );
    }
    final principal = (v['principal'] ?? '').isEmpty
        ? null
        : evidenceAmount(v['principal']!);
    final interest = (v['interest'] ?? '').isEmpty
        ? null
        : evidenceAmount(v['interest']!);
    final fee = (v['fee'] ?? '').isEmpty ? null : evidenceAmount(v['fee']!);
    if ([principal, interest, fee].any((x) => x != null) &&
        ([principal, interest, fee].any((x) => x == null) ||
            principal! + interest! + fee! != amount * BigInt.from(count))) {
      throw const FormatException(
        'Supply all expected components with a total equal to the schedule, or leave all unknown.',
      );
    }
    if ((allInstallmentApplications[old?.id] ?? {}).entries.any(
      (e) => e.key >= count || e.value.$2 > amount,
    )) {
      throw const FormatException(
        'Reverse incompatible applied coverage before revising this plan.',
      );
    }
    final item = CardPlanEvidence(
      id: old?.id ?? nextCommand(),
      name: v['name']!,
      source: v['source']!,
      amount: amount,
      count: count,
      due: v['due']!,
      reference: v['reference']!,
      principal: principal,
      interest: interest,
      fee: fee,
      version: (old?.version ?? 0) + 1,
      previous: old,
    );
    planDefinitions.removeWhere((x) => x.id == item.id);
    planDefinitions.add(item);
    installmentHistory.add(
      '${item.name} v${item.version} · ${v['reason'] ?? 'Created'} · no purchase repeated',
    );
    selectPlan(item.id);
  }

  void allocateCardEvidence(
    String recordId,
    BigInt amount, {
    bool reverse = false,
    String reference = 'Synthetic provider evidence',
  }) {
    final r = records.firstWhere((r) => r.id == recordId);
    if (!['cardPayment', 'cardRefund'].contains(r.kind)) {
      throw const FormatException(
        'Select existing payment or credit evidence.',
      );
    }
    final allocations = cardPaymentCoverage.putIfAbsent(recordId, () => {});
    final before = allocations[activeStatementId] ?? BigInt.zero;
    if (reverse) {
      if (before == BigInt.zero) {
        throw const FormatException('No allocation to reverse.');
      }
      allocations.remove(activeStatementId);
      statementAllocated -= before;
    } else {
      if (amount <= BigInt.zero ||
          ExactFinance.sum(allocations.values) + amount > r.amount ||
          statementAllocated + amount > statementBalance) {
        throw const FormatException(
          'Allocation exceeds source or statement remaining capacity.',
        );
      }
      allocations[activeStatementId] = before + amount;
      statementAllocated += amount;
    }
    statementCoverage[activeStatementId] = statementAllocated;
    statementHistory.add(
      '${reverse ? 'Reversed' : 'Added'} allocation · $recordId · $reference · no cash movement',
    );
    version++;
    changed();
  }

  void retainCurrentStatement() {
    final old = activeStatement;
    statementDefinitions.remove(old);
    statementDefinitions.add(
      CardStatementEvidence(
        id: old.id,
        start: old.start,
        end: old.end,
        issued: old.issued,
        due: statementDue,
        balance: statementBalance,
        minimum: old.minimum,
        reference: old.reference,
        version: statementVersion,
        previous: old,
      ),
    );
  }

  void retainCurrentPlan() {
    final old = activePlan;
    planDefinitions.remove(old);
    planDefinitions.add(
      CardPlanEvidence(
        id: old.id,
        name: old.name,
        source: old.source,
        amount: installmentAmount,
        count: installmentCount,
        due: installmentDue,
        reference: old.reference,
        version: installmentVersion,
        previous: old,
      ),
    );
  }
}
