import 'package:flutter/foundation.dart';

import 'fixtures.dart';

enum AppDestination {
  overview('Overview'),
  money('Money'),
  debts('Debts'),
  shared('Shared Expenses'),
  life('Life');

  const AppDestination(this.label);
  final String label;
}

enum OverviewScenario {
  local('Populated local-only'),
  current('Connected · current'),
  waiting('Waiting for synchronization'),
  pending('Pending financial effect'),
  incomplete('Incomplete initial download'),
  empty('Empty / first use'),
  review('Activity requiring review');

  const OverviewScenario(this.label);
  final String label;
}

/// One memory-only scenario controller; no persistence or network adapters.
/// Coverage, transport and receipt state stay separate from display scenarios.
class PrototypeSession extends ChangeNotifier {
  OverviewScenario scenario = OverviewScenario.local;
  bool hideAmounts = false;

  bool get empty => scenario == OverviewScenario.empty;
  bool get complete => scenario != OverviewScenario.incomplete;
  bool get local => scenario == OverviewScenario.local || empty;
  bool get pending => scenario == OverviewScenario.pending;
  bool get needsReview => scenario == OverviewScenario.review;
  DemoReceipt get receipt => DemoReceipt.awaiting;
  BigInt? get accepted => !complete
      ? null
      : empty
      ? BigInt.zero
      : DemoMoney.liquid;
  BigInt? get projected =>
      pending ? DemoMoney.liquid - DemoMoney.expense : null;
  String get syncLabel => switch (scenario) {
    OverviewScenario.local || OverviewScenario.empty => 'Local only',
    OverviewScenario.current => 'Synced · 21 Oct, 09:00',
    OverviewScenario.waiting => 'Waiting for connection',
    OverviewScenario.pending => '1 effect awaiting acceptance',
    OverviewScenario.incomplete => 'Initial download · incomplete',
    OverviewScenario.review => 'Review needed · 1 private effect',
  };
  String get coverage => !complete
      ? 'Money summary not ready — history is still downloading.'
      : empty
      ? 'No accounts yet. Complete empty local profile.'
      : local
      ? '3 local accounts · complete through 21 Oct 2026, 09:00.'
      : '3 accepted accounts · snapshot at 21 Oct 2026, 09:00. Pending effects excluded.';

  String amount(BigInt value) =>
      hideAmounts ? 'Amount hidden' : DemoMoney.format(value);
  void select(OverviewScenario value) {
    scenario = value;
    notifyListeners();
  }

  void togglePrivacy() {
    hideAmounts = !hideAmounts;
    notifyListeners();
  }

  void reset() {
    scenario = OverviewScenario.local;
    hideAmounts = false;
    notifyListeners();
  }
}

/// Source-linked read-only examples. Dates are fixed civil scenario dates.
enum PreviewSource {
  accounts(
    AppDestination.money,
    'Accounts',
    'Your liquid money',
    'Cash wallet, Everyday bank and Mobile wallet. Only complete accepted balances contribute to Money Today.',
  ),
  activity(
    AppDestination.money,
    'Activity',
    'Your money activity',
    'Synthetic accepted history for the demo week. Recording and corrections are not available yet.',
  ),
  cards(
    AppDestination.money,
    'Cards',
    'Card obligations',
    'Card liability is separate from liquid accounts. Available credit is not cash; paying a card does not count purchase spending twice.',
  ),
  planning(
    AppDestination.money,
    'Planning',
    'Plan with context',
    'Recurring bills, budgets, savings goals and forecasts. Expected obligations do not post expenses; reservations do not create extra assets.',
  ),
  reports(
    AppDestination.money,
    'Reports',
    'Understand the whole picture',
    'Reports must disclose source coverage, freshness and pending inclusion. An incomplete download cannot produce a complete financial report.',
  ),
  electricity(
    AppDestination.money,
    'Electricity bill',
    'Electricity · 25 Oct',
    'Expected bill, not an actual expense. No payment or account movement has been recorded by this preview.',
  ),
  debt(
    AppDestination.debts,
    'Debt commitment',
    'Debt payment · 28 Oct',
    'Contractual amount expected. This is not a payment record or payoff quote. Principal, interest and fees require source evidence.',
  ),
  debtHistory(
    AppDestination.debts,
    'Payment history',
    'Evidence stays with each payment',
    'Payment evidence, allocation and correction history are not available in this preview yet. No liability is cleared by viewing this page.',
  ),
  group(
    AppDestination.shared,
    'Demo household',
    'Dinner with Tala and Nico',
    'Independent dinner example: Amihan paid for dinner; three equal shares. Group positions do not grant access to anyone else’s private accounts.',
  ),
  settlement(
    AppDestination.shared,
    'Recipient confirmation',
    'Tala’s reported payment',
    'Independent settlement example: awaiting Amihan’s receipt confirmation. Synchronization is not confirmation. Confirmation must never deduct cash a second time.',
  ),
  privateReview(
    AppDestination.shared,
    'Private-effect review',
    'Review your private effect',
    'A changed group source needs your review. Genuine private evidence is retained. Group owners cannot overwrite a member’s private ledger.',
  ),
  agenda(
    AppDestination.life,
    'Agenda',
    'Make room for your day',
    'Personal tasks and events appear alongside source-linked commitments. Financial reminders open their authoritative source.',
  ),
  task(
    AppDestination.life,
    'Tasks',
    'Finish a reading chapter · 24 Oct',
    'A fictional personal task. Completion, reminders and history are bounded future Life workflows.',
  ),
  learning(
    AppDestination.life,
    'Learning',
    'A little progress each day',
    'Learning entries and basic progress belong here. D2 previews the destination without building a custom tracker designer.',
  ),
  books(
    AppDestination.life,
    'Books',
    'Your reading shelf',
    'Reading entries, progress and notes. This synthetic preview does not change a real library.',
  ),
  career(
    AppDestination.life,
    'Career',
    'Interview · 23 Oct, 10:00',
    'Fictional interview, sourced from Career. One source creates one agenda item; this is not a second event record.',
  );

  const PreviewSource(
    this.destination,
    this.label,
    this.title,
    this.description,
  );
  final AppDestination destination;
  final String label, title, description;
}
