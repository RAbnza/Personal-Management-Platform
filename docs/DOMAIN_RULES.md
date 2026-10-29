# Domain rules

## Contents

- [Debt payment scheduling and urgency](#debt-payment-scheduling-and-urgency) (from `docs/salapiya/DEBT_SCHEDULE_URGENCY_HANDOFF.md`)
- [V2 Credit Cards and Statements](#v2-credit-cards-and-statements) (formerly `docs/reference/v2/CREDIT_CARDS_AND_STATEMENTS.md`)
- [V2 Shared Expenses and Settlements](#v2-shared-expenses-and-settlements) (formerly `docs/reference/v2/SHARED_EXPENSES_AND_SETTLEMENTS.md`)
- [V2-B — Recurring Obligations](#v2-b--recurring-obligations) (formerly `docs/reference/v2/RECURRING_OBLIGATIONS.md`)
- [V2-C — Budgets](#v2-c--budgets) (formerly `docs/reference/v2/BUDGETS.md`)
- [V2-D — Savings Goals](#v2-d--savings-goals) (formerly `docs/reference/v2/SAVINGS_GOALS.md`)
- [V2-E — Forecasts](#v2-e--forecasts) (formerly `docs/reference/v2/FORECASTS.md`)
- [V2-F — Richer Career Analytics](#v2-f--richer-career-analytics) (formerly `docs/reference/v2/CAREER_ANALYTICS.md`)
- [V2-G — Scheduled Opted-In Notifications](#v2-g--scheduled-opted-in-notifications) (formerly `docs/reference/v2/SCHEDULED_NOTIFICATIONS.md`)
- [V2-H — Supporting Files, Imports and Portability](#v2-h--supporting-files-imports-and-portability) (formerly `docs/reference/v2/FILES_IMPORTS_AND_PORTABILITY.md`)

## Debt payment scheduling and urgency
### 1. Feature Overview

Debts previously recorded how much was owed but not when to pay. A debt can now
carry a payment schedule (how often, when the next payment is due, how many
payments, and how much each one is). The Debts screen computes from it which
debt to pay first, when it is due and how much to prepare.

Debts may stay unscheduled. They show "Schedule not set", get no invented date
and no default frequency.

### 2. Implementation Details

All logic is in `apps/salapiya/lib/finance/debt_rules.dart` (pure functions; the
screens only format their results).

**Frequencies and recurrence**
- Weekly: every 7 calendar days. Custom: every N days, N a whole number from
  1 to 3660.
- Monthly and Yearly: the same calendar date. When the month is shorter, the
  last valid day is used (31st → 30th or 28th/29th; Feb 29 → Feb 28 in
  non-leap years).
- Every occurrence is computed from the first due date, never from the previous
  result, so there is no drift (Jan 31 → Feb 28 → Mar 31 → Apr 30). Date-only
  arithmetic, no time zones; "today" is the app's existing `civilToday()`
  (Asia/Manila).

**Statuses** (`DebtDueStatus`, computed on every call, never stored):
Overdue, Due today, Due soon, Upcoming, Schedule not set. The repo has no
existing due-soon setting (the Overview's 30-day range is a display window), so
Due soon is 1 to 7 calendar days ahead (`debtDueSoonDays = 7`, a constant, not a
user setting). The UI also shows "Settled" or "Closed" for a debt with nothing
left to pay; these are display labels, not statuses.

**Payment handling** (no change to balance, interest, fee, cashback,
early-repayment or settlement logic; nothing posts money)
- An installment is settled only by an explicit allocation of a payment to it
  (the existing `allocations` field), and only when allocations plus any
  historical paid amount cover its full amount.
- Partial payments leave it as the next installment with a smaller remaining
  amount. Extra money recorded as "unapplied" and unrelated transactions
  satisfy no installment.
- Nothing is allocated automatically, so one payment cannot clear several
  overdue installments. Overdue installments stay listed until each is settled.
- Allocating to a later installment is still allowed (existing workflow); the
  earlier unpaid one stays next and Overdue.

**Schedule editing**
- Dates, frequency and first date: edited with the existing schedule correction.
  The existing rules keep historical paid amounts and every recorded allocation;
  tests confirm postings and payment records are unchanged after an edit.
- Amounts: "Update amounts" (`NativeScheduleAmounts`) changes unpaid payments
  through the same correction. Paid payments are read-only.

**Schedule creation rules (as built)**
- Frequency, next due date and number of payments are required; the "how are
  payments split" choice is disabled until a valid payment count (1 to 120) is
  entered.
- "Divide the debt evenly" takes the total from the debt itself: what is still
  owed on an existing debt, or the amount entered in the same form (borrowing
  includes a financed fee). Leftover centavos go on the last payment.
- "Different amount each time" needs one amount per payment, and the payments
  must add up to the debt exactly. A fixed "same amount each time" option was
  removed; older schedules using it still load.
- The Update amounts page requires the unpaid payments to add up to what is
  still owed.
- A debt and its first schedule are created in one form but saved as two
  records (debt first, then schedule).

**Incomplete or not done**
- Notifications and sync were out of scope and are not touched.
- There is no loan maturity or final-payoff date field in the app. The last row
  of the schedule is shown as "Final scheduled installment", labeled separately
  from the next installment and as not a provider payoff date.
- No "amount to be decided later" state: every payment needs an amount when
  saved. An estimate can be corrected later with Update amounts.
- The exact-total rule does not allow schedules whose total exceeds the debt
  (for example lender interest). There is no opt-in for that.

## V2 Credit Cards and Statements

**Phase:** V2-A  
**Domain:** Finance  
**Status:** Approved product direction before implementation

---

### 1. Purpose

This document defines the V2 credit-card product and workflow requirements.

It supplements the existing credit-card sections of:

- `PROJECT_VISION_AND_FEATURE_BLUEPRINT.md`
- `SYSTEM_ARCHITECTURE.md`
- `DATABASE_ARCHITECTURE.md`
- `DESIGN_SYSTEM_AND_VISUAL_GUIDELINES.md`

All existing financial integrity, ownership, audit, idempotency and exact-money rules remain applicable.

Where this document is more specific about V2 user experience, follow this document.

---

### 2. Product principle

A credit card is a liability with a billing lifecycle.

It is **not** a cash account.

However, a credit-card purchase is still fundamentally a purchase.

Therefore:

> **Credit-card purchases must integrate with the ordinary expense-entry experience instead of forcing users to enter the same purchase into a separate card tracker.**

The system may use a card-specific financial command internally.

The UI should still present one coherent purchase workflow.

---

### 3. User mental model

The application should distinguish:

#### Purchase

The user buys something using the credit card.

Result:

- spending is recognized;
- card liability increases;
- cash does not move.

#### Card installment plan

A purchase is subject to a provider installment arrangement.

The purchase expense must not be recognized repeatedly every month.

#### Card payment

The user transfers real money from a bank/wallet/cash account to the card provider.

Result:

- paying cash decreases;
- card liability decreases;
- spending is not recognized again.

These concepts must never be presented as interchangeable.

---

### 4. Unified expense-entry workflow

The existing Add Expense experience should evolve so the user chooses a funding source.

Conceptually:

```text
Add Expense

Amount
PHP 3,000

Category
Groceries

Paid with
BPI Visa

Purchase date
October 10, 2026

Description
Weekly groceries
```

If the selected funding source is:

- cash/bank/wallet → use the existing cash expense behavior;
- credit card → use the card-purchase behavior.

The user must not separately re-enter the same transaction in the Cards module.

---

### 5. Progressive card options

Selecting a credit card may expose a collapsed section such as:

> Card details

Normal purchases should not require unnecessary provider fields.

Optional/applicable card fields may include:

- transaction date;
- posting date;
- posted/pending state where supported;
- provider reference;
- regular purchase versus installment purchase;
- statement association when known.

Advanced details use progressive disclosure.

---

### 6. Pending authorizations

A pending authorization is not the same thing as posted card activity.

A pending authorization:

- does not create recognized posted card liability;
- must not be included in posted statement totals;
- must not be presented as a finalized purchase;
- may be shown informationally if later supported.

When an authorization becomes posted, the recognized card activity is recorded according to the provider-confirmed posting information.

Do not guess posting dates.

---

### 7. Card purchase accounting

A normal posted card purchase:

- increases the applicable spending category;
- increases card liability;
- does not reduce a liquid account.

Illustrative example:

```text
Groceries expense     +PHP 3,000
Card liability        +PHP 3,000
Cash movement              PHP 0
```

The financial journal remains authoritative.

The card activity is linked evidence/read structure, not an independently editable balance.

---

### 8. Dedicated Credit Cards surface

Credit cards still require a dedicated management surface.

The dedicated page is **not another expense tracker**.

It answers card-specific questions such as:

- What is my current posted outstanding balance?
- What was the most recent verified statement balance?
- How much of that statement remains due?
- What is the minimum due?
- When is payment due?
- What payments have been made?
- Which transactions belong to this statement?
- What fees and interest have been recognized?
- Do I have a card credit from overpayment/refunds?
- What installment plans exist?
- What is my utilization estimate?

---

### 9. Card detail terminology

Do not collapse all card numbers into one ambiguous "Balance."

Show separate concepts:

- posted outstanding balance;
- statement balance;
- remaining statement due;
- minimum due;
- due date;
- available credit estimate;
- utilization;
- card credit/overpayment where applicable.

Each value should identify its basis/date where necessary.

---

### 10. Transaction date and posting date

Store and display transaction date and posting date separately.

Recommended meaning:

- **Transaction date:** when the user made the purchase.
- **Posting date:** when the provider recognized/posted it.

Spending reports should preserve the documented transaction-date basis for recognized purchases unless an authoritative decision changes that basis.

Statement membership follows verified provider posting/cycle information.

Do not infer statement membership solely from a guessed cycle calculation when the provider evidence differs.

---

### 11. Statements

A statement is provider evidence.

Closing/recording a statement must not create another purchase or another liability.

A statement should retain:

- card;
- cycle start;
- cycle end;
- statement date;
- due date;
- statement balance;
- minimum due;
- provider reference where supplied;
- verification metadata;
- linked recognized statement activity where known.

Statement values are immutable/versioned evidence.

Corrections create a new statement revision rather than editing historical evidence in place.

---

### 12. Statement reconciliation

A provider statement may expose missing or incorrect application records.

The application must not fabricate financial actions merely to force the statement to match.

Differences should remain explicit until resolved through:

- missing purchase entry;
- missing fee/interest;
- refund;
- payment allocation;
- opening/import evidence;
- correction;
- other supported reconciliation action.

Unknown provider lines remain visibly unresolved.

---

### 13. Remaining statement due

Remaining statement due derives from the verified statement and applicable effective allocations.

It is not independently editable.

A payment must not alter the original historical statement balance.

Example:

```text
Statement balance              PHP 20,000
Confirmed applicable payment   PHP  8,000
Remaining statement due        PHP 12,000
```

The original statement continues to show PHP 20,000.

---

### 14. Card payments

A card payment records real cash movement from a selected owned financial account.

Example:

```text
BDO cash                  -PHP 10,000
Card liability            -PHP 10,000
Additional spending             PHP 0
```

The original purchase has already created the spending effect.

Do not classify principal card repayment as another expense.

---

### 15. Payment allocations

Where provider allocation is known, card payments/credits may be allocated to applicable statement balances.

Do not invent allocation order where provider rules are unknown.

If allocation is manually/provider-confirmed, retain that evidence.

Any unallocated/uncertain portion must remain visible rather than being silently guessed.

---

### 16. Fees and interest

Recognized card fees and interest are separate expenses.

Examples include:

- annual fee;
- late fee;
- finance charge;
- installment fee;
- provider-confirmed interest;
- other card fees.

Do not create a fee/interest expense merely because a future installment schedule implies one.

Recognize the charge when supported by actual provider evidence or user-confirmed records.

---

### 17. Refunds

A card purchase refund should:

- reduce the applicable card liability or create/increase card credit;
- offset the relevant spending classification according to the established refund rules;
- link to the original purchase when possible;
- preserve original purchase history.

A refund is not ordinary income.

---

### 18. Card overpayment

If payments/credits exceed recognized card liability, show the result as a **card credit**.

Do not display this as negative debt.

Do not include card credit in liquid funds.

The application must not imply that card credit is cash available in the user's bank account.

---

### 19. Credit limit and utilization

Credit limit is optional provider metadata.

Credit limit is not cash.

Utilization may be calculated as:

```text
eligible posted outstanding balance / eligible credit limit
```

Handle missing and zero limits safely.

For multiple cards, aggregate utilization uses:

```text
sum of eligible used credit / sum of eligible credit limits
```

Do not average individual card percentages.

Exclude card-credit balances from the used-credit numerator.

---

### 20. Installment purchases

A credit-card purchase may optionally be identified as a provider installment purchase.

Regular purchase remains the default simple workflow.

The user may expand:

> Installment details

where appropriate.

Potential provider-confirmed fields include:

- installment count;
- expected installment amounts;
- first due date;
- expected principal;
- expected interest;
- expected fee;
- provider plan reference;
- notes.

Do not infer provider interest or total repayment from installment count alone.

---

### 21. Installment accounting

Creating an installment plan does not recognize the purchase expense again.

Example:

```text
Laptop purchase
PHP 30,000 spending recognized once

Installment plan
12 provider installments

Future installment records
Scheduling/evidence only

Monthly card payment
Cash/liability movement only,
except newly recognized interest/fees
```

Scheduled amounts do not automatically create financial postings.

---

### 22. Integration with ordinary expense history

Card purchases should appear in ordinary expense/history/reporting views alongside other purchases.

Relevant filters may include:

- payment source;
- card;
- category;
- transaction date;
- posting date where appropriate.

The user should not need to visit the Cards page to discover what they purchased.

---

### 23. Integration with shared expenses

When Shared Expenses is released, one real-world purchase may involve both:

- a card-funded purchase;
- a shared bill.

Example:

```text
Restaurant bill
PHP 4,000

Paid using
BPI Visa

Split with
You + three brothers
```

The user should not enter this twice.

The linked domains must preserve:

- card liability for the amount actually charged to that user's card;
- the user's own spending share;
- the user's group receivable/payable position;
- group participant shares;
- no duplicate purchase expense;
- no duplicate card liability.

Other registered participants' private funding sources remain private.

---

### 24. UI simplicity requirements

Ordinary purchase entry should remain simple.

Do not require every user to understand:

- journal entries;
- statement allocations;
- liability ledgers;
- provider reconciliation;
- allocation formulas.

Expose advanced concepts only where necessary.

The backend can remain rigorous without making the normal form intimidating.

---

### 25. Card reporting

Card reporting should support, as applicable:

- spending by category;
- spending by card;
- posted outstanding liability;
- statement balances;
- remaining statement due;
- payments;
- interest;
- fees;
- refunds;
- card credits;
- installment obligations;
- utilization.

Cash-flow reporting must distinguish card purchases from later card payments.

---

### 26. Security and ownership

Cards are private workspace data.

All card reads/writes must preserve:

- server-owned actor/workspace context;
- strict workspace ownership;
- RLS/runtime-role enforcement;
- foreign-reference rejection;
- safe unavailable/authorization responses;
- no browser-supplied trusted ownership identifiers.

---

### 27. Corrections

Posted card financial actions follow the existing immutable correction/reversal/replacement model.

Statement evidence uses statement revisions.

Do not silently rewrite:

- original purchases;
- historical statements;
- allocations;
- payments.

Corrections retain reason and before/after evidence.

---

### 28. Required acceptance scenarios

Before V2-A is considered complete, verify at minimum:

1. Create a credit card.
2. Record a normal purchase through the ordinary Add Expense workflow.
3. Confirm spending increases and cash does not move.
4. Confirm card liability increases exactly once.
5. Record provider posting information.
6. Record/verify a statement.
7. Link recognized activity to the statement.
8. Record a partial card payment from a selected cash account.
9. Confirm the payment decreases cash and liability without increasing spending.
10. Confirm remaining statement due updates without changing original statement balance.
11. Record a card fee.
12. Record provider-confirmed interest.
13. Record a refund linked to a purchase.
14. Handle an overpayment/card credit.
15. Record an installment purchase without repeating the purchase expense.
16. Correct card activity while preserving history.
17. Reconcile a statement with missing/unknown provider information.
18. Reject foreign-card/reference access.
19. Verify same-command retry/idempotency behavior.
20. Verify reports do not double-count purchases and payments.
21. Verify responsive/browser/accessibility behavior.
22. Verify interaction with Shared Expenses once V2-I integration exists.

---

### 29. Suggested implementation milestones

Do not treat these milestone names as immutable if repository inspection reveals a better boundary.

#### V2-A1 — Card Integrity Foundation

Focus on:

- schema;
- liability binding;
- ownership;
- RLS;
- action kinds;
- database invariants;
- read model foundation.

#### V2-A2 — Card Purchases and Unified Expense Entry

Focus on:

- purchase financial recipe;
- card activity;
- expense-entry funding-source integration;
- card activity history;
- reporting classification.

#### V2-A3 — Statements and Reconciliation

Focus on:

- statement snapshots;
- revisions;
- statement entries;
- remaining-due derivation;
- reconciliation.

#### V2-A4 — Payments, Fees, Interest and Refunds

Focus on:

- card payments;
- allocations;
- fees;
- interest;
- refunds;
- overpayment/card credit.

#### V2-A5 — Installment Plans

Focus on:

- provider-confirmed installment schedules;
- no duplicate spending;
- future due projections;
- revisions where required.

#### V2-A6 — Integrated V2 Card Surface and Acceptance

Focus on:

- Dashboard;
- Reports;
- Agenda/reminders where applicable;
- full browser acceptance;
- Shared Expenses integration when that module exists;
- regression/hardening.

---

### 30. Out of scope unless later approved

Do not automatically add:

- bank/card account aggregation;
- direct payment execution;
- card-number storage beyond safe user-defined metadata;
- full PAN/CVV storage;
- provider-specific interest calculators;
- automatic minimum-payment calculators;
- automatic credit scoring;
- provider login credentials;
- guessed statement allocation rules;
- universal rewards optimization.

Continue from actual provider/user evidence rather than assumptions.

## V2 Shared Expenses and Settlements

**Phase:** V2-I  
**Domain:** Sharing + private Finance integration  
**Status:** Approved product direction before implementation  
**Product references:** Splitwise / Settle Up style shared-expense management without requiring feature parity

---

### 1. Purpose

This document defines V2 Shared Expenses and Settlements.

The module supports shared real-world spending among:

- family;
- siblings;
- friends;
- couples;
- roommates;
- travel groups;
- temporary groups;
- other invited participants;
- manually recorded nonregistered participants.

It is **not family-only**.

Earlier development wording such as:

> Family shared expenses

is superseded for V2 by:

> **Shared Expenses and Settlements**

---

### 2. Core principle

Shared Expenses answers:

- Who paid?
- Who participated?
- What share belongs to each person?
- How much has each person contributed overall?
- How much expense has each person consumed overall?
- Who currently owes money?
- Who should receive money?
- What payments have been reported?
- Which reported payments are awaiting confirmation?
- What remains after confirmed settlements?
- Which original expenses explain the current balance?

Individual bills remain preserved.

Current balances are derived across all effective group activity.

---

### 3. Groups

Shared expenses operate within an `ExpenseGroup`.

Examples:

- Brothers
- Family Household
- Weekend Friends
- Boracay Trip
- Apartment
- Couple Expenses
- Office Lunch Group

A two-person group supports one-to-one shared expenses.

Groups provide the authorization/history boundary.

Do not replace the group model with unscoped arbitrary person-to-person records.

---

### 4. Lightweight group UX

Although groups are required internally, group creation should remain lightweight.

When creating a shared expense, the user may:

- choose an existing group;
- create a new group if needed.

Do not force the user through unnecessary administration for a simple temporary group.

A future Quick Split workflow may create/reuse a lightweight group internally, but it must preserve the same authorization and history rules.

---

### 5. Participants

A group may contain:

- registered users;
- manual/nonregistered participants;
- historical/deleted participant identities.

Manual participants are explicitly labeled, for example:

> Not registered · recorded manually

Do not silently match a manual participant to a newly registered user based only on display name.

Linking/claiming a manual participant requires verified identity, consent and balance/history review.

---

### 6. Privacy boundary

Group membership grants access only to group-owned records.

It does not grant access to another participant's:

- bank accounts;
- wallet balances;
- card balances;
- debts;
- salary;
- Career records;
- private notes;
- unrelated transactions;
- private workspace.

Private account selections remain visible only to the account owner.

Group owners are not administrators of another user's private workspace.

---

### 7. Shared expense record

A shared expense records at minimum:

- group;
- description;
- expense date;
- currency;
- total amount;
- payer contribution(s);
- selected participants;
- participant share amounts;
- split method;
- category/label where applicable;
- notes;
- optional supporting evidence when file support exists;
- creator;
- version/history evidence.

A shared expense is one logical bill.

Corrections create retained revisions rather than silently editing historical evidence.

---

### 8. One or multiple payers

V2 must support:

- one payer;
- multiple payers for the same bill.

This supersedes earlier wording that deferred multiple payers beyond the initial shared-expense release.

Single payer remains the default simple experience.

Suggested UI:

```text
Who paid?

Brother 1       PHP 4,000

[ Add another payer ]
```

If another payer is added:

```text
Who paid?

You             PHP 1,500
Brother 1       PHP 2,500

Total paid      PHP 4,000
Bill total      PHP 4,000
```

The user does not need to choose a separate "multiple payer expense type."

---

### 9. Payer contribution invariant

For every finalized shared expense:

```text
sum(payer contributions) = expense total
```

No unexplained amount is permitted.

Example:

```text
Expense total       PHP 4,000

You                 PHP 1,500
Brother 1           PHP 2,500
                    ---------
Total paid          PHP 4,000
```

Valid.

This is invalid:

```text
Expense total       PHP 4,000
Total contributions PHP 3,500
```

The missing PHP 500 must be resolved before save.

---

### 10. Participant shares

Payers and participants are independent concepts.

A participant may:

- pay and consume a share;
- pay more than their share;
- pay less than their share;
- pay but consume no share;
- consume a share without paying.

Initial required split methods:

- equal;
- exact/custom amounts.

Later methods such as percentages, weights and detailed itemized allocation may be added separately.

---

### 11. Share invariant

For every finalized shared expense:

```text
sum(participant shares) = expense total
```

Payer contributions and participant shares must each independently equal the total.

They do not need to match person-by-person.

---

### 12. Multiple-payer example

Four participants buy a meal costing PHP 4,000.

Payment:

```text
You             PHP 1,500
Brother 1       PHP 2,500
Brother 2       PHP     0
Brother 3       PHP     0
```

Equal consumption:

```text
You             PHP 1,000
Brother 1       PHP 1,000
Brother 2       PHP 1,000
Brother 3       PHP 1,000
```

Bill-level positions:

| Participant | Paid | Share | Position |
| --- | ---: | ---: | ---: |
| You | PHP 1,500 | PHP 1,000 | +PHP 500 |
| Brother 1 | PHP 2,500 | PHP 1,000 | +PHP 1,500 |
| Brother 2 | PHP 0 | PHP 1,000 | -PHP 1,000 |
| Brother 3 | PHP 0 | PHP 1,000 | -PHP 1,000 |

Positive means the participant advanced money for others.

Negative means the participant consumed more than they contributed.

---

### 13. Participants may differ by expense

Not every group member must participate in every expense.

Example:

```text
Brothers group

Grab
PHP 900

Participants:
You             PHP 300
Brother 1       PHP 300
Brother 2       PHP 300

Brother 3 was not included.
```

Brother 3 receives no share from that expense.

---

### 14. Current group balance source

Current group balances derive from authoritative group records.

Conceptually:

```text
participant current net position
 =
 current payer contributions
 - current consumed shares
 - effective refund-to-payer amounts
 + effective refund-of-share amounts
 + confirmed settlements paid
 - confirmed settlements received
```

The exact database/report implementation must preserve the established accounting conventions.

Current group participant positions must always sum to exactly:

```text
0
```

for each currency/group.

---

### 15. Expenses are not isolated debts

Shared Expense 1 and Shared Expense 2 must not behave as completely unrelated balances that each require independent repayment.

All current applicable expenses participate in the current group calculation.

Source expenses remain inspectable for history and explanation.

---

### 16. Reciprocal netting

Reciprocal obligations between the same participants cancel in the current relationship balance.

Example:

```text
Expense 1:
You owe Brother 1        PHP 1,000

Expense 2:
Brother 1 owes you       PHP   800
```

Current relationship:

```text
You owe Brother 1        PHP 200
```

Do not delete or rewrite Expense 1 or Expense 2.

The PHP 200 balance is a derived current result.

---

### 17. Pairwise relationship visibility

Where source allocations support it, the group UI should answer:

- how much you currently owe each participant;
- how much each participant currently owes you;
- how much other participants owe one another where group visibility permits;
- which expenses/refunds/settlements explain that relationship.

Pairwise presentation must derive from the authoritative group records rather than becoming another mutable source of truth.

---

### 18. Explainable relationship breakdown

Example:

```text
You ↔ Brother 1

Dinner                     -PHP 1,000
Groceries                  +PHP   800
Confirmed settlement       +PHP   100
--------------------------------------
Current net                -PHP   100

You owe Brother 1           PHP   100
```

The user must be able to inspect the source records behind the result.

---

### 19. Whole-group net positions

The primary authoritative settlement basis is each participant's whole-group current net position.

Example:

| Person | Current position |
| --- | ---: |
| You | +PHP 100 |
| Brother 1 | +PHP 300 |
| Brother 2 | -PHP 400 |
| Brother 3 | PHP 0 |

The group is balanced because:

```text
+100 + 300 - 400 + 0 = 0
```

---

### 20. Suggested settlements

V2 must provide an explainable **Suggested settlements** view.

It may reduce the number of payments by matching group debtors with group creditors.

Example:

```text
Brother 2 → You
PHP 100

Brother 2 → Brother 1
PHP 300
```

A settlement suggestion:

- does not move money;
- does not change group balances;
- does not rewrite original bills;
- does not mark anything as paid.

It is a proposed way to resolve the current net positions.

---

### 21. No false optimality claim

The application does not need to guarantee the mathematically smallest possible number of payments unless an implemented algorithm formally guarantees that property.

Use language such as:

> Suggested way to settle

rather than:

> Minimum possible payments

unless correctness is proven.

---

### 22. Redirected/indirect settlement

Example:

```text
A owes B PHP 300
B owes C PHP 300
```

A possible suggestion is:

```text
A → C PHP 300
```

Such redirection must preserve all participants' net positions.

Original bills remain unchanged.

Where redirected settlement discharges indirect obligations, affected participants must explicitly agree/confirm according to the finalized settlement model.

Do not silently redirect obligations.

---

### 23. Settlement modes

The settlement workflow must support at least:

#### Full balance

Pay the entire amount currently due to the selected recipient under the chosen settlement scope.

#### Custom amount

Pay only part of the current amount.

Example:

```text
You owe Brother 1        PHP 2,000
Pay now                  PHP 1,000
Expected remaining       PHP 1,000
```

#### Selected expenses

Pay only obligations connected to specific shared expenses.

Example:

```text
Dinner                    PHP 800
Groceries                 PHP 600
Gas                       PHP 600

Selected:
Dinner                    PHP 800
Groceries                 PHP 600

Settlement                PHP 1,400
Gas remains               PHP 600
```

---

### 24. Partial settlement of one expense

A selected shared expense may itself be only partially settled.

Example:

```text
Dinner outstanding        PHP 1,000
Pay now                   PHP   400
Remaining                 PHP   600
```

The original bill remains unchanged.

The settlement allocation explains the PHP 400 discharge.

---

### 25. One settlement across multiple expenses

A single settlement may allocate its amount across multiple source expenses.

Example:

```text
Settlement to Brother 1
PHP 1,000

Applied to:

Dinner                    PHP 600
Groceries                 PHP 400
```

Allocation totals must equal the applicable settlement amount except for an explicitly modeled advance/overpayment component.

---

### 26. Recipient correctness

A settlement must not silently clear an obligation owed to a different participant.

Example:

If the user owes:

```text
Brother 1        PHP 1,000
Brother 2        PHP   500
```

a payment to Brother 1 does not automatically discharge Brother 2's balance.

Cross-recipient redirection requires an explicitly supported/accepted settlement-simplification path.

---

### 27. Overpayment

If a user attempts to settle more than the valid current obligation, do not silently truncate the payment or force balances to zero.

Preview the consequence.

Example:

```text
Current amount owed       PHP 1,000
Payment                   PHP 1,200
Advance/reverse balance   PHP   200
```

Require explicit acknowledgement of the resulting advance/reverse position.

---

### 28. Reported versus confirmed settlement

For registered participants, reporting that money was sent is not equivalent to recipient confirmation.

A reported settlement remains pending until the recipient confirms receipt.

Pending settlements:

- remain visible;
- preserve allocations;
- do not reduce confirmed group balances;
- may affect a separately labeled projected balance.

---

### 29. Sender view for pending settlement

Example:

```text
Brother 1

Confirmed amount owed
PHP 2,000

You reported sending
PHP 1,000

Status
Awaiting Brother 1 confirmation

Projected remaining if confirmed
PHP 1,000
```

Do not simply show PHP 1,000 as the confirmed balance before confirmation.

---

### 30. Recipient confirmation view

The recipient should see:

```text
Rendel reports sending you PHP 1,000

Group
Brothers

Date
October 10, 2026

Applied to:
Dinner                    PHP 600
Groceries                 PHP 400

[ Confirm receipt ]
[ Dispute ]
```

Confirmation changes the applicable current confirmed balance.

---

### 31. Pending settlement reporting

Pending settlement visibility is a first-class requirement.

Provide a settlement view with statuses/filters similar to:

- Needs my confirmation
- Waiting for others
- Confirmed
- Disputed
- Reversed/Cancelled
- All

Example:

| Participant | Amount | Status |
| --- | ---: | --- |
| Brother 1 | PHP 1,000 | Waiting for Brother 1 |
| Brother 2 | PHP 500 | Needs your confirmation |
| Brother 3 | PHP 700 | Confirmed |

---

### 32. Group-level pending summary

The group page should distinguish:

- confirmed current balances;
- pending outgoing settlements;
- pending incoming settlements;
- projected balances if pending settlements are confirmed.

Do not combine projected and confirmed numbers without labels.

---

### 33. Dashboard attention

Pending settlements may appear in the global Dashboard attention surface.

Examples:

```text
PHP 500 from Brother 2
Needs your confirmation

PHP 1,000 sent to Brother 1
Waiting for confirmation
```

Dashboard presentation must not expose group-sensitive information outside an authorized user's view.

---

### 34. Pending settlement aging

The UI may display:

> Awaiting confirmation · 3 days

This is informational.

When reminder delivery exists, the user may be offered an in-app or opted-in external reminder.

Do not automatically harass participants or expose sensitive financial content through notification channels.

---

### 35. Disputes

A recipient who disagrees with a reported settlement can dispute it.

A disputed settlement:

- remains visible;
- does not reduce confirmed group balances;
- retains the original reported details;
- records reason/evidence where supported;
- must be resolved through an explicit correction/transition.

Do not silently edit the payment amount after a dispute.

---

### 36. Manual/nonregistered settlement confirmation

A manual participant cannot perform authenticated confirmation.

Manual confirmation must record:

- who entered the confirmation;
- confirmation type;
- the fact that recipient-authenticated confirmation was unavailable.

Present this limitation clearly.

---

### 37. Private ledger integration

Group records do not automatically mutate every participant's private financial ledger.

Each registered participant controls adoption into their own workspace.

A group bill can exist independently of private ledger adoption.

This preserves privacy and prevents another participant from changing someone's private finances.

---

### 38. Integrated Add Expense experience

If the current user is recording a real purchase they paid for, the ordinary Add Expense flow should be capable of expanding into a shared expense.

Conceptually:

```text
Add Expense

Amount
PHP 2,400

Category
Dining

Paid with
GCash

Split this expense?
[ ] Just me
[x] Split with people

Group
Weekend Friends

Participants
[x] You
[x] John
[x] Mark
[x] Sarah
```

The user should not need to enter the PHP 2,400 purchase once in Expenses and again in Shared Expenses.

---

### 39. Private accounting for payer's own share

Example:

You pay PHP 1,200 from GCash for dinner with two brothers, equally split.

Your private linked result:

```text
GCash cash movement        -PHP 1,200
Your spending                PHP   400
Group receivable             PHP   800
```

The other participants' private accounts remain untouched.

---

### 40. Private accounting with multiple payers

Suppose:

```text
Bill total            PHP 4,000

You paid              PHP 1,500
Brother 1 paid        PHP 2,500

Your share            PHP 1,000
Brother 1 share       PHP 1,000
Brother 2 share       PHP 1,000
Brother 3 share       PHP 1,000
```

Your private adoption may represent:

```text
Your actual funding movement      PHP 1,500
Your own spending                 PHP 1,000
Your group receivable             PHP   500
```

Brother 1 independently controls their own private adoption.

No participant sees another participant's selected private account.

---

### 41. Existing private purchase linking

If a purchase has already been entered privately, converting/linking it to Shared Expenses must not create another cash/card deduction.

Use the existing correction/reclassification/private-link model.

Preview the result before applying.

---

### 42. Credit-card integration

A registered payer may privately fund their contribution using a credit card.

Example:

```text
Restaurant bill
PHP 4,000

Your contribution
PHP 4,000

Funding source
BPI Visa

Your own share
PHP 1,000

Group receivable
PHP 3,000
```

Private result:

- card liability increases by PHP 4,000;
- personal spending reflects the user's PHP 1,000 share;
- group receivable reflects PHP 3,000 advanced for others;
- no duplicate purchase is created.

Other participants cannot see the user's card details.

---

### 43. Funding privacy with multiple payers

At group level, users only need to see contribution meaning:

```text
Rendel paid           PHP 1,500
Brother 1 paid        PHP 2,500
```

They do not need to see:

```text
Rendel used BPI Visa
Brother 1 used BDO account
```

Private funding sources remain private unless the owner deliberately exposes permitted metadata later.

---

### 44. Refunds

A refund linked to a shared purchase must preserve the original bill and settlements.

Refunds adjust applicable payer contribution/share effects.

If participants already settled, a refund may create a new reverse amount owed.

Do not delete historical settlements merely because the merchant refunded the purchase later.

---

### 45. Corrections

Shared expenses use versioned immutable corrections.

Changing:

- total;
- payers;
- payer contribution amounts;
- participants;
- participant shares;
- date;
- other financial meaning

creates a new reviewed revision.

Previously accepted private ledger links may become:

> Needs private correction

rather than being silently rewritten.

---

### 46. Group summary/reporting

Group reporting should show at minimum:

- total group spending;
- current effective bills;
- each participant's amount paid;
- each participant's shares consumed;
- each participant's confirmed settlements sent;
- each participant's confirmed settlements received;
- current net position;
- pending outgoing settlements;
- pending incoming settlements;
- projected position if pending payments confirm;
- refunds;
- disputed amounts;
- recent activity.

---

### 47. Per-person detail

Selecting a participant should allow an explainable breakdown.

Example:

```text
Brother 1

Paid across bills           PHP 9,000
Own shares                  PHP 4,200
Confirmed settlements       PHP 2,000
Pending settlements         PHP   500
Refund effects              PHP   300

Current confirmed position
Gets back                   PHP 2,500
```

The detail must link back to source bills and settlements.

---

### 48. Per-expense detail

Every bill should display:

- who paid;
- each payer contribution;
- who participated;
- each participant share;
- split method;
- current revision;
- previous revisions where applicable;
- settlements allocated to the bill;
- pending allocations;
- remaining unsettled source amounts where meaningful;
- refund/correction history.

---

### 49. Equal-split rounding

Use exact centavos.

Example:

```text
PHP 100 / 3

PHP 33.34
PHP 33.33
PHP 33.33
```

Persist/explain who receives the extra centavo.

Do not silently lose or create money through rounding.

---

### 50. Security rules

Shared-expense security must verify:

- active group membership;
- participant role;
- group-scoped foreign references;
- invitation authority;
- settlement authority;
- correction authority;
- historical former-member access;
- no private workspace leakage.

Group tables require group-scoped RLS.

Private adoption tables remain private workspace records.

---

### 51. Leaving a group

Leaving/removing a member:

- does not erase history;
- does not forgive balances;
- prevents unauthorized new activity;
- retains approved historical visibility;
- preserves settlement evidence.

An active group should not accidentally become ownerless.

---

### 52. Archive behavior

Completed/inactive groups should normally be archived rather than deleting financial/shared history.

Archive does not zero balances or remove settlement evidence.

---

### 53. Required acceptance scenarios

Before Shared Expenses is considered functionally complete, verify at minimum:

1. Create a group with registered participants.
2. Add a manual/nonregistered participant.
3. Record a single-payer equal-split expense.
4. Record a multiple-payer expense.
5. Verify payer contributions exactly equal the bill.
6. Verify participant shares exactly equal the bill.
7. Record an expense involving only a subset of group members.
8. Record exact/custom participant shares.
9. Verify reciprocal obligations across expenses net correctly.
10. Verify current participant net positions sum to zero.
11. Verify source expenses remain intact after netting.
12. Display pairwise relationship explanations where applicable.
13. Produce whole-group suggested settlements.
14. Verify suggestions do not change balances.
15. Record a full settlement.
16. Record a custom partial settlement.
17. Settle only selected expenses.
18. Partially settle one selected expense.
19. Allocate one settlement across multiple expenses.
20. Record an overpayment and preview the resulting advance/reverse position.
21. Verify a reported settlement remains pending before recipient confirmation.
22. Show `Waiting for others`.
23. Show `Needs my confirmation`.
24. Confirm a settlement and verify current balances update.
25. Dispute a settlement without changing confirmed balances.
26. Record manual-participant confirmation with limitation evidence.
27. Correct a bill while retaining previous history.
28. Process a refund after settlement.
29. Link a group expense to an existing private cash purchase without deducting cash twice.
30. Create a group expense through the integrated Add Expense flow.
31. Link a card-funded shared expense without duplicating card liability or spending.
32. Verify another group member cannot see the payer's private account/card.
33. Verify group owners cannot access participant private workspaces.
34. Verify a former member retains only allowed historical access.
35. Verify pending settlement attention on group/global surfaces.
36. Verify rounding is exact.
37. Verify replay/idempotency behavior for group writes.
38. Verify concurrent group writes preserve balances/invariants.
39. Verify responsive/mobile behavior.
40. Verify keyboard/accessibility behavior.

---

### 54. Suggested implementation milestones

Milestone names may be adjusted after inspecting the repository.

#### V2-I1 — Group Identity and Authorization Foundation

Focus on:

- groups;
- participants;
- invitations;
- membership;
- manual participants;
- roles;
- group RLS;
- command receipts;
- historical-access foundation.

#### V2-I2 — Shared Bills and Multiple Payers

Focus on:

- expense revisions;
- one/multiple payer contributions;
- equal/exact participant shares;
- exact rounding;
- current group balance derivation;
- per-person/per-expense reads.

#### V2-I3 — Private Ledger Adoption

Focus on:

- private group bindings;
- existing-purchase linking;
- new private postings;
- receivable/payable treatment;
- privacy boundary;
- Add Expense integration.

#### V2-I4 — Settlements and Pending Confirmation

Focus on:

- full settlement;
- custom partial settlement;
- selected-expense allocations;
- partial bill settlement;
- pending confirmation;
- recipient confirmation;
- disputes;
- overpayment;
- pending reports.

#### V2-I5 — Netting and Settlement Suggestions

Focus on:

- reciprocal netting;
- relationship views;
- whole-group net positions;
- deterministic explainable settlement suggestions;
- redirected settlement agreement where supported.

#### V2-I6 — Refunds, Corrections and Reporting

Focus on:

- shared refunds;
- bill corrections;
- settled-bill corrections;
- private-link review;
- group reports;
- Dashboard attention.

#### V2-I7 — Cross-Domain Integration and Acceptance

Focus on:

- card-funded shared purchases;
- reminders/notifications where applicable;
- imports/files where applicable;
- browser acceptance;
- security review;
- accessibility;
- full regressions.

---

### 55. Explicit V2 boundaries

The following do not need to be implemented merely because Shared Expenses exists:

- general personal lending;
- interest-bearing peer loans;
- multiple currencies within one group;
- payment execution through banks/wallets;
- mathematically guaranteed minimum settlement transfer count;
- automatic identity matching by name;
- silent settlement redirection without consent;
- exposing private financial accounts to group members;
- arbitrary deletion of settled history.

Percentage, weighted and detailed item-level split methods may be added later unless separately promoted into V2 scope.

---

### 56. Final product rule

The Shared Expenses experience should make this statement true:

> A user can record real shared purchases exactly once, regardless of who paid or how many people paid, see everyone's explainable current position across all group activity, settle all or part of what is owed, understand pending confirmations, and preserve complete history without exposing anyone's private finances.

## V2-B — Recurring Obligations

### Authority and boundary

This domain consolidates Blueprint §6.9, System Architecture §12.4 and Database Architecture §12. The ledger remains the sole financial authority. V2-B implements planning only; Budgets, forecasts, external delivery, other domains and production deployment remain outside this assignment.

### Internal milestones

1. B1: private definitions, immutable recurrence versions, exact deterministic date generation, bounded preview and persisted occurrences.
2. B2: one-occurrence overrides/skips/cancellation, future supersession/archive, explicit partial financial links and immutable link reversals, correction conflicts and existing transaction creation workflows.
3. B3: accessible responsive management/review, Agenda and in-app reminders, consolidated domain/regression/database/browser acceptance.

Implementation proceeds sequentially. Focused checks protect intermediate contracts; one consolidated acceptance phase and one accepted domain commit/push supersede the earlier per-milestone full-suite/push workflow. This is the default for subsequent domains unless reassigned.

### Rules and dates

- Income, bill and subscription definitions have a name, PHP expected amount, optional owned category/account suggestions and named IANA timezone. Suggestions never override actual transaction choices.
- Supported grammar: daily intervals 1–365; weekly intervals 1–52 and selected ISO weekdays 1–7 (Monday first); monthly intervals 1–120 and day 1–31, with explicitly selected `last_valid_day` or `skip`. Weeks anchor to Monday of the effective start week; days before the effective start are excluded. Monthly intervals anchor to the effective start month. No weekend/holiday adjustments.
- An inclusive end date and/or emitted-occurrence count (1–10,000) may bound each immutable rule version. A count includes valid dates from that version's effective start, including historical dates outside a requested horizon; skipped short months do not consume the count. A replacement starts its own explicitly reviewed count.
- Calendar dates remain date-only. Calendar arithmetic uses date-fns in an explicit UTC calendar context; the definition's timezone determines local today and reminder instants. DST cannot move a logical all-day date. Existing timezone conversion handles reminder times.
- Supported dates span 1900–2199. Creation previews and records the next 90 days from the later of local today or the rule boundary; explicit generation can extend/review any supported window. Agenda retains the civil date, discloses the definition timezone and calculates its timing state in that timezone.
- Every generation command covers an explicit inclusive window of at most 366 days and at most 500 emitted dates. No read inserts occurrences, infinite schedules or nightly jobs. Generation is explicit and replayable; deterministic identities use obligation/logical date/generation, with one noncancelled generation per logical date. Repeated windows preserve existing overrides and terminal history.

### Occurrences and actual evidence

- `planned` has no links; `linked` has partial supported links; `completed` has linked amounts exactly equal to expected amount. `skipped` and `cancelled` have no effective links. Remaining = expected − effective links, using integer minor units.
- One-occurrence changes require an expected record version and reason; due date/expected amount overrides preserve original logical date and rule association, with exact before/after audit history. Completion cannot be asserted without actual evidence. Unlink uses one exact append-only reversal; a reversal cannot be reversed.
- Eligible actual actions are finalized current income for income plans, or cash expenses/card purchases for bills/subscriptions. Transfers, debt/card payments, fees, refunds and opening balances are not ordinary recurring receipts/purchases. Category/account suggestions are not eligibility restrictions. No inferred payment/date/provider allocation.
- A link captures the exact current action revision and explicit positive amount. Across all occurrences, unreversed links cannot exceed that action's recorded eligible amount; links cannot exceed expected amount. Duplicate/excess/foreign/stale links fail atomically under workspace serialization.
- Financial correction/reversal with effective occurrence links fails with an explicit dependency conflict. Reverse those planning links, perform the existing correction, then explicitly relink eligible corrected evidence. Link reversal history remains immutable. No silent reassignment or duplicate posting.
- Financial action detail lists effective occurrence confirmations with scoped links for resolving correction dependencies. Actual entry returns the committed action as a preferred eligible candidate; the separate link still requires review/confirmation. Candidate priority and pagination share a stable ordering.
- Actual creation uses the existing reviewed income/expense workflows, then explicit linking of their committed action. It is deliberately two confirmed steps: an interrupted link does not recreate a transaction; select the existing action. Command replay protects both workflows independently.
- Future changes create immutable rule versions at a future boundary in the definition's local calendar. Preserve completed, skipped, linked and historical occurrences. Cancel/regenerate only unlinked outstanding occurrences at/after that boundary; partial linked exceptions remain visible under their original rule. Archive stops generation and cancels only unlinked future plans; history and partially linked commitments remain reviewable.
- Both original logical date and current due date must be at/after a change/archive boundary before an unlinked plan is cancelled. Earlier due overrides remain historical commitments. Individual skipped/cancelled states are terminal history; generation never silently restores them. Historical unlinked expectations are labelled separately from active remaining obligations.

### Security and acceptance

Four documented `planning` tables use concrete scoped FKs, forced active-owner RLS, restricted runtime grants, immutable rule/link evidence, permanent command replay, private audit evidence, workspace locks and approved lifecycle purge. Expected activity cannot create financial revisions/journals. Agenda/reminders use concrete occurrence references; resolution/date changes invalidate obsolete reminder generations without financial effects. Actual reports exclude planning tables.

Nullable SQL rule/reversal checks explicitly reject NULL when a selected grammar or correction requires evidence. Runtime SQL tests verify this independently of API validation. The source view emits its own calendar context; bounded reminder reads materialize the requested source projection once, avoiding repeated RLS joins without relaxing ownership or transaction isolation. Planning commands advance the existing workspace read revision as A5 evidence commands do; this is cache/review metadata, not a financial posting.

Acceptance covers grammar/count/horizon/month-end/leap/DST, exact amounts, repeat/overlap generation, version boundaries/history, overrides/state/link reversal, partial/excess/duplicate/corrected/foreign actual evidence, same-command and competing capacity/version races, SQL/audit/receipt rejection, RLS/roles/lifecycle, financial nonduplication, reminder lifecycle/preferences, browser keyboard/Axe/320px/themes and unchanged V1/V2-A regressions. B1–B3 are locally accepted as of October 13, 2026 (Asia/Manila). Actual commands/results, bounded limits, deliberately omitted unrelated checks and V2-C prerequisites are recorded in handoff §22. No later domain is authorized.

## V2-C — Budgets

### Authority and scope

Consolidates Database Architecture §12, System Architecture §15.2 and the Blueprint's planning/reporting requirements. Uses `planning.budget`; budgets are mutable audited spending limits, never financial actions or reservations. No rollover, replenishment, transfers, savings goals or forecasts.

### Internal milestones

1. C1: category/period/amount validation, protected database model, audited replayable management and transactional overlap prevention.
2. C2: repeatable snapshot comparisons from the existing immutable posting facts and net/gross definitions; historical corrections and refund dates remain authoritative.
3. C3: accessible responsive Money management, Reports comparisons, Dashboard preview and consolidated acceptance.

Implement sequentially with focused checks, then one consolidated verification and accepted domain commit/push. Retain V2-B's optimized workflow.

### Domain decisions

- Explicit expense category and PHP limit. Nonnegative integer minor units through PostgreSQL bigint maximum `9223372036854775807`; zero is a valid no-spending limit. No floating-point monetary arithmetic.
- Stored periods are `[start_date,end_date_exclusive)`. UI presents inclusive end dates and converts exactly once. Support 1900–2199, with `2200-01-01` permitted only as an exclusive boundary; periods contain 1–366 days, matching existing Reports limits. Adjacent periods are valid.
- Reject every overlap for the same owned category, including exact duplicates and archived definitions. Archive hides a budget from active summaries but preserves its period/history; update or restore that existing budget to reuse its period. This retains the approved unconditional overlap rule. Different categories may overlap.
- Save supports explicit category/period/limit/basis/notes changes. Updates, archive and restore require expected version and reason; permanent before/after audit history preserves earlier definitions. No ordinary deletion. New category assignments require active owned expense categories; retained archived categories remain readable/manageable without silently changing classification.
- Net is default; gross is selectable per budget. Use the existing Reports posting grain and signed classification: gross purchase/recognized-charge expense activity net of correction reversals; spending offsets on their actual refund/rebate/waiver date; net = gross − offsets. Include card/cash/financed purchases and recognized fees/interest without counting principal payments again. Uncategorised activity has no category budget; no guessed classification or category hierarchy aggregation.
- Remaining allowance = limit − selected recognized spending, including negative net spending. Overspending = max(spending − limit,0). Progress uses exact integer basis points; zero limits show explicit zero-limit status and no percentage denominator. Expected recurring activity never enters these calculations.
- Comparisons always query current immutable financial evidence. Backdating, corrections/reversals/refunds and posting category changes update the applicable period/category; category renames affect labels only. Budget audit history is definition evidence, not frozen financial totals.
- Management serializes on the existing active workspace financial lock. The database write guard advances read-revision metadata before checking overlap, ensuring competing writes serialize even under repeatable-read snapshots; this creates no ledger movement. Database-assigned `write_revision` binds the exact completed command result to that mutation. Commands retain normalized permanent receipts and exact attributed audit evidence. Category kind/name/archive changes take the same lock and advance metadata; referenced categories cannot change to income. Forced RLS, concrete scoped category/receipt FKs and restricted roles apply.
- Money lists/details expose whole-budget-period comparisons and paged history/contributions. Reports/Dashboard previews include budgets intersecting their selected period, explicitly label each budget's full period, and never compare a whole limit with a clipped spending window. Preview bounds disclose additional results; full management remains paginated. No cross-category grand total across mixed bases/periods.

### Acceptance

Verify exact/zero/large limits, leap/day/end boundaries, adjacency/overlaps, lifecycle and immutable audit history, source/category ownership, RLS/runtime grants, SQL bypass/forged receipts, concurrent saves/period moves/version races, permanent replay, ledger nonduplication, net/gross actual-period refunds and corrections, recurring exclusion, snapshot consistency, Money/Reports/Dashboard integration, browser keyboard/review/retry/Axe/320px/themes, migration upgrades, lifecycle/restore and unchanged V1/V2-A/B regressions. Record actual executed results and V2-D prerequisites in the handoff after acceptance.

### Accepted implementation

C1–C3 are implemented and accepted locally and in hosted CI. Seven forward migrations add one protected audited table, bringing the chain to 111 migrations / 75 tables with all prior definitions preserved. No dependencies or financial recipes changed.

Consolidated verification covers 901 passing unit/component/API tests, all 549 integration scenarios across the full run and affected reruns, all 44 browser scenarios across the full run and affected rerun, ten fresh/upgrade migration proofs, schema/runtime checks, production builds, dependency audit, isolated encrypted restore and restricted runtime artifacts. Guarded capacity with 100 budgets / 1,000 actual classified postings passed existing timing thresholds and financial nonduplication assertions. Exact commands, initial failures/resolutions, measured results and V2-D prerequisites are recorded in [handoff section 23](archive/web/V2_DEVELOPMENT_HANDOFF.md#23-v2-c--budgets).

V2-D requires a separate explicit assignment. Budget remaining allowance is a spending-limit comparison and cannot become eligible savings cash or a reservation.

## V2-D — Savings Goals

### Authority and internal milestones

Consolidates Database Architecture §12 and System Architecture §15.2. D1 implements private goal management, protected reservations, audit/replay and atomic availability validation. D2 derives current funding health from finalized cash evidence. D3 integrates accessible Money management, Dashboard/Reports previews and consolidated acceptance. Implement sequentially; one consolidated verification, documentation and authorized commit/push. Stop before V2-E.

### Decisions

- `planning.savings_goal` and `planning.goal_reservation` are mutable audited management records. Names (1–200 characters), positive exact targets through PostgreSQL bigint maximum, optional dates (1900–2199), notes and active/completed/archived status. No new assets, money movements, financial journals or automatic completion.
- Reservations identify a concrete owned PHP cash/e-wallet/checking/savings account and an owned goal. Eligible capacity is its nonnegative finalized signed cash balance through workspace-local today; future-dated postings, future opening cutoffs and expected activity are excluded. Both account and cash ledger must be active. Card credit/limits, debt/loan balances, budgets and forecasts never enter this pool. Recorded cash remains fungible; no invented cash-provenance restrictions or net-position substitution.
- Availability is validated per account across **all goals**, including completed goals. Workspace totals sum these explicitly labelled positive eligible account pools; negative balances are disclosed separately, never described as net liquid funds. Reserves are not subtracted from ledger balances or asset totals.
- Reviewed absolute reservation changes support increases, decreases and full release. Explicit reallocation can change goal, account or both atomically; it never transfers money. New/increased reservations require an active goal and an eligible destination whose final aggregate reservations fit current capacity. Releases/decreases remain possible when underfunded or archived. Reallocating unsupported reservations cannot create available cash; the increased destination must be supported after the complete command.
- Completion is explicit management evidence and retains reservations. Reopen supports completed/archived goals. Archive requires reservations to be explicitly released first; no lifecycle action silently frees funds. Completed goals remain in current reservation totals. Targets may be revised below reservations; disclose excess instead of rewriting allocations.
- Financial and metadata changes never rewrite reservations. If several goals share an underfunded account, do not invent which goal gets the remaining cash. For reservation R, account total T and eligible capacity C, supported funding lies in `[max(0,min(R,C-(T-R))),min(R,C)]`. Sum these exact bounds per goal; disclose shared shortfalls, exact reserved target progress and supported funding range. Fully funded requires the lower supported bound to meet target; unfunded means the upper bound is zero; otherwise distinguish partial funding and uncertain shared support.
- Commands use active workspace locking, permanent normalized receipts, expected goal versions and current financial revision for reservation/reallocation review. Database guards, final aggregate validation and exact attributed audit/receipt result binding independently enforce integrity. Account/ledger eligibility metadata changes invalidate read revision metadata without posting money. Preserve approved lifecycle purge and all forced-RLS/restricted-role protections.
- Reservation writes require the platform's normal read-committed write transaction. This independently protects against stale repeatable-read financial evidence even when a raw Finance SQL command omits the service-owned revision advance. Read-only comparisons retain repeatable snapshots; authorized lifecycle deletion is unchanged.
- Database command graphs match the API: one goal for management, one goal/account for a reservation change, and two distinct reservation records for reallocation. Reallocation conserves the exact total with one decrease and one increase. One audit per changed record is required; orphan, extra and late goal history under completed or unrelated receipts is rejected.
- All comparisons use a repeatable read snapshot with generation time, local as-of date, revision and definition version. Reports/Dashboard show **current** reservations separately from period-end financial metrics, without pretending to reconstruct historical reservation states. Bounded previews, management/history/reservation/account/target pages disclose additional records. No savings projections, recurring replenishment, automatic transfers/freezing, reminders or investment interest.

### Acceptance

Verify exact/large/zero reservation amounts, target/date validation, owned eligible accounts, future/archived/noncash exclusion, same funds across goals, atomic reallocation, partial/full release, completion/archive/reopen history, excess targets, shared shortfalls and supported bounds. Test real spending, transfers, backdating, corrections/reversals and refunds without vetoing financial commands or altering reservations. Independently prove SQL finalization/audit/result binding, rollback, concurrency/replay/stale snapshots, RLS/restricted roles and complete scoped lifecycle deletion. Run focused domain/API/component tests, consolidated V1/V2-A–C regressions, fresh/upgrades/schema/runtime, checks/build, production browser/keyboard/retry/Axe/320px/themes, isolated restore/runtime artifacts and guarded new-query capacity. Record actual outcomes and V2-E prerequisites in the handoff.

D1–D3 are implemented and locally accepted. Actual consolidated results, important boundary fixes, verification-harness decisions and V2-E prerequisites are recorded in [the development handoff](archive/web/V2_DEVELOPMENT_HANDOFF.md#24-v2-d--savings-goals). Savings Goals add no financial recipe; the targeted 100-goal/100-reservation/1,000-posting workload replaces an unnecessary repeat of the unchanged A6 financial benchmark. Hosted acceptance and exact verified remote commit accompany the completion report. Stop before V2-E.

## V2-E — Forecasts

Consolidates System Architecture §15.2 and Database Architecture §12. E1 establishes read-only source coverage and calculations; E2 integrates explicit scenarios and private APIs; E3 delivers accessible Money management/navigation and consolidated acceptance. Stop before V2-F.

### Calculation and source decisions

- No forecast table, saved scenario, receipt, mutation, posting, allocation or reservation write. Every projection uses one active-owner read-only REPEATABLE READ snapshot, local today, generation time, financial revision, source versions and calculation version.
- Opening actual liquid funds are the shared Reports signed cash-asset posting grain through workspace-local today, including negative and archived tracked cash. Card credit/limits, liabilities, clearing, budgets, expected income and reservations do not enter opening cash. Future-dated finalized cash journals are separately labelled recorded future cash evidence and included once at their recorded effective dates, with correction/reversal signs retained.
- Default horizon is tomorrow through 30 days from today. Configurable inclusive ranges must start after today and end within 366 days of today, in 1900–2199. A later window includes a disclosed bridge from tomorrow to its start; window opening is projected, never relabelled actual. Daily closing balances and totals use exact integer minor units and preserve negatives.
- Recurring sources reuse B's calendar generator and immutable rule windows without materializing occurrences. Existing generations, due/amount overrides, effective partial links and terminal states take precedence. Cancelled evidence suppresses the same rule's occurrence; a replacement rule may supply a new projection. Archived definitions generate nothing, but retained partial commitments remain visible. Overdue sources are disclosed without inventing new dates. Default cash assumptions require an active owned cash suggestion and matching workspace/source calendar; explicitly optional assumptions can treat unassigned sources as cash or use a different source calendar's date labels without pretending to convert an unknown time.
- Card payment policy is unknown by default. Provider-verified statement balances and installment schedules are candidates, not automatically another cash outflow. A user may explicitly select **one verified statement per card**, or that card's eligible installment schedule, assuming payment on recorded due dates. The same card cannot use both bases. No minimum-payment satisfaction formula, oldest-first allocation or interest calculation is inferred. Effective A4/A5 allocation/application views supply exact remaining amounts. Missing dates/totals, suspended plans, unresolved allocations, card credit and unapplied payment/credit evidence block unsupported card projections and remain explicit.
- Recurring bills have no established card/statement relationship. When card projections are selected, recurring outflows require the user's explicit confirmation that they are independent; otherwise they remain excluded for overlap review. Likewise, unlinked recorded future cash pauses compatible recurring expectations until supported links or explicit independence resolve possible duplication. Effective links to currently eligible actions deduct the recognized amount once; names, dates and amounts never establish a guessed match. Individual expected sources can be excluded explicitly. Recorded future cash cannot be excluded to simulate cancelling a real posting. Multiple unpaid statements and provider reconciliation gaps remain coverage warnings.
- Optional dated what-if adjustments are signed by explicit inflow/outflow choice, exact positive amounts and user labels. They are visibly separate from recorded evidence and expected sources, held only in the current client/request. No scenario is saved or changes source records. Unknown/foreign/stale selection IDs fail safely.
- Savings show current reservations and supported funding separately. Projected closing minus current reservations is a labelled aggregate comparison, not an account-level availability guarantee or another cash balance. Budgets remain category allowances and never expected spending. Loan schedules, benefits/receivables, unrecorded living costs, unknown future card charges and provider rules are outside the supported automatic source set and are disclosed; users may add explicit assumptions.
- Bounded source inventories fail closed rather than silently truncate: 500 recurring definitions, 1,000 rule revisions, 10,000 relevant stored occurrences/active cash-account suggestions, 100 cards, and 5,000 forecast candidates; at most 20 adjustments, 100 exclusions and 100 card selections. A conservative 100,000-step calendar-history work guard also bounds old rule anchors. Superseded/ended rules are skipped for new generation while retained commitments remain visible. UI contribution and daily views page locally from the complete bounded snapshot. Totals always use every included source. Cross-currency expectations are excluded without inventing conversion rates.

### Acceptance

Prove exact/large/negative arithmetic, local dates/leap years/horizon/bridge, source ordering and nonduplication, unmaterialized rules and terminal overrides, partial actual links, provider revisions and effective allocations, mutually exclusive card bases, unsupported dates/amounts/credits/overlaps, explicit scenarios, current reservations/budgets without new cash, correction/reversal refresh and consistent read snapshots. Test strict actor/origin/query/body validation, no-cache reads, foreign IDs/RLS, read-only nonmutation, response races, private browser navigation, keyboard/Axe/320px/themes and bounded performance. Run applicable regressions and checks/build/runtime security. Since persistence is unchanged, no new migration/upgrade path is required. Record actual acceptance and V2-F prerequisites in the handoff.

E1–E3 are implemented and accepted locally on October 14, 2026 (Asia/Manila). Exact source, overlap, correction, isolation, nonmutation and scenario cases pass; full regressions and affected final reruns cover 929 unit/component/API tests, 573 integration tests and 50 browser scenarios. Production builds, check, dependency audit, restricted containers and targeted capacity acceptance pass. See [V2-E handoff](archive/web/V2_DEVELOPMENT_HANDOFF.md#25-v2-e--forecasts) for actual run details, bounds, deliberately skipped unchanged-persistence checks and V2-F prerequisites. The completion report supplies the exact pushed commit and hosted workflow outcome.

## V2-F — Richer Career Analytics

Extends the existing Career report, reporting periods, scoped repositories and CSV infrastructure. System Architecture §11 and Database Architecture §14 remain authoritative. F1 establishes evidence/metrics; F2 integrates filters, comparisons, Dashboard and exports; F3 delivers accessible views and consolidated acceptance. Stop before V2-G.

### Evidence and metric definitions

- One application ID is one attempt. Cohorts use current corrected `applied_date` within the inclusive selected Reports period and through the effective as-of date. Saved records without a submission date are excluded; archived submitted attempts are retained. Company/role equality never merges attempts. No submission is inferred from a current stage or submission event alone.
- All reads use the established owner-scoped READ ONLY REPEATABLE READ snapshot. As-of is an inclusive workspace-local civil date, no later than local today. Current corrected history/events/source metadata are observed through that effective date; this is **not** a reconstruction of what was known then. Superseded stage observations and cancelled events remain historical evidence but do not establish milestones. Versions, current generation time and calculation version identify provenance; the financial revision is not a Career change counter.
- Response requires an explicitly dated noncancelled response event, preserving the existing definition. Interview/assessment progression requires a resolved interview/final-interview/technical-assessment observation or a completed corresponding event. A scheduled event alone is not achieved progression. Offer requires an explicit resolved offer observation or noncancelled offer event; accepted alone does not invent an offer or response. Milestones before submission are excluded and disclosed. Repeated events/visits remain separate evidence while each application counts once per milestone.
- Current accepted/rejected/withdrawn/offer-declined/offer-expired/employer-cancelled outcomes use the last resolved observation through cutoff, ordered by effective date, effective order and history ID. Earlier terminal outcomes remain reached-outcome evidence; a later reopening does not remain a current rejection. No response never means rejection. Explicit no-response events are separately reported evidence.
- Each headline conversion has the submitted cohort as its denominator. Conditional response-to-interview and interview-to-offer numerators are intersections with those denominator applications. Stages may be skipped, so the visualization is independent milestone reach, not an assumed monotonic hiring pipeline. Empty denominators return null / not applicable, never NaN or an invented zero rate.
- First-response/interview/offer timing uses the earliest eligible recorded milestone and full calendar days since submission. Timing summaries disclose samples, missing evidence and exact median (including half days); missing responses are excluded from medians. Follow-up age through cutoff discloses cohort maturity. Stage durations retain repeated visits and same-day zero durations; completed and still-open nonterminal visits are summarized separately. Saved/terminal observations are excluded from active-stage aggregates. Open duration is censored at cutoff, not a completed-stage estimate. No timestamp precision beyond recorded civil-day evidence is implied.
- Dated event activity remains a separate selected event-date period, including other cohorts. Completed, scheduled and cancelled counts are separate; past scheduled events are not treated as completed. Cohort milestone evidence may occur after the submission period but must meet cutoff. Event-date activity is visibly independent of cohort conversions and may include future scheduled reference entries.
- Source effectiveness groups exact current source labels, with null separately identified; no case/name normalization merges evidence. Source filtering applies to Career cohorts, period events and comparisons. It does not change financial scope. Weekly/monthly/quarterly/yearly cohort buckets use existing workspace week start/calendar boundaries, clipped to the selected range, and the same as-of cutoff. Optional comparison uses the immediately preceding equal-length inclusive period; differing follow-up ages and incomplete observation windows are explicit, with no maturity-adjusted predictions or causal claims.

### Interfaces, limits and privacy

- Extend `/reports/career` and its existing API. Career-only filters select cohort interval, exact recorded source (or missing source) and optional previous-period comparison. Shared period/date contracts remain intact; Financial APIs reject Career-only filters. Career list/detail and Dashboard link to the same calculations; operational active/upcoming summaries retain their distinct labelled scope.
- Derived on demand; no new table, migration, privilege, dependency, ledger operation, audit mutation or saved analytics state. Fail closed above 10,000 combined application/event/stage evidence rows across selected/comparison reads; queries request one sentinel beyond their bounds. Supporting UI lists paginate from complete bounded results and never change totals. Existing CSV 10,000-row / 10 MiB guards, scoped provenance and formula escaping remain intact.
- Analytics select only application identity/company/role/source/submission, resolved stage evidence and minimal dated event identity/title/status/version. Contact details, salary expectations, private notes, preparation/location details and private revision JSON are never loaded into analytics. Authorized Application History CSV keeps its existing explicit historical-evidence scope; aggregate exports include the same definitions/rates/timing/source/trend/comparison values without private notes or contacts.

### Acceptance

Prove compatible cohort denominators/intersections, repeated attempts/events, cancelled versus scheduled/completed activity, stage correction/supersession/reopening/same-day ordering, archived/saved/missing evidence, pre-submission exclusions, response/progression timing, open-stage censoring, empty rates, source labels/filters, bucket/date/timezone/cutoff boundaries, unequal cohort maturity, stable snapshots/nonmutation, RLS/foreign/spoof rejection and private field exclusion. Verify shared Reports/Dashboard/detail/export consistency, strict API errors, keyboard/320px/both themes/Axe, bounded rendering and targeted query capacity. Run applicable V1/A–E regression, check/build/security/container gates once stable, then affected reruns only. Persistence is unchanged, so new migration/schema/restore fixtures are unnecessary; established hosted gates remain. Record actual outcomes and V2-G prerequisites in the handoff.

F1–F3 are implemented on October 14, 2026 (Asia/Manila). Full regressions and affected final checks cover 942 unit/component/API tests, 583 integration tests and 53 browser scenarios. Calculation, privacy, isolation, consistent snapshots and nonmutation checks pass; check, production builds, audit and targeted capacity pass. Runtime-artifact acceptance is recorded separately in the [V2-F handoff](archive/web/V2_DEVELOPMENT_HANDOFF.md#26-v2-f--richer-career-analytics). CSV schema 4 adds explicit Career calculation provenance, source/trend/comparison summaries and timing/rate fields; financial definitions and recipes are unchanged. Local Chrome 155 uses the existing configured channel after the bundled-browser download timed out; hosted CI retains bundled Chromium. The handoff/completion report records actual acceptance, justified omissions and the exact pushed commit.

## V2-G — Scheduled Opted-In Notifications

### Authority and sequence

This domain implements the notification boundaries in SYSTEM_ARCHITECTURE and
DATABASE_ARCHITECTURE using existing V1 reminders and V2 A–F sources. G1 adds
explicit consent, forced-RLS evidence and lifecycle protections. G2 adds durable
pg-boss scheduling, current-source revalidation and authenticated provider evidence.
G3 adds Settings/status workflows and consolidated acceptance. No V2-H is authorized.

### Product contract

Email is the only channel. Missing preferences mean disabled. Enabling requires a
current verified owned sign-in identity; there is no editable destination. In-app
reminder offsets, local times, overrides, dismissal, snooze and module switches
remain authoritative. Navigation hiding and Agenda visibility do not revoke
reminder consent; the module's separate reminder switch controls eligibility.
Sources are Calendar appointments, Career scheduled events,
Debt installments, verified card statements, eligible projected card installments
and materialized Recurring occurrences. Unmaterialized projections do not invent
notification sources. Statement and installment messages describe separate source
evidence, never a sum or financial instruction.

One logical delivery identifies the occurrence, source/rule generations and email
channel. Source version checks freshness but never creates another delivery for an
unrelated edit. No repeated overdue cadence is offered. Schedules predating the
current opt-in are suppressed; restoring consent does not replay already terminal
logical deliveries. Relevant due/rule changes use existing reminder generations.

Workspace timezone remains the scheduling timezone of date-only sources; timed
sources retain their recorded timezone. Optional quiet hours use a selected IANA
timezone or the current workspace timezone and defer delivery without changing
deadlines. Both endpoints must be supplied together and differ. DST transitions
follow PostgreSQL civil-time conversion. Quiet windows may cross midnight.

Default messages contain only a generic reminder and a link to authenticated
Agenda. An explicit preference may include the recorded due date. No amount,
company, title, recipient, private notes or provider payload enters queue data or
operational logs. Security/verification/recovery email is independent of consent.

### Durable processing and safety

Preferences and authoritative source rows are durable scan intent. The worker
discovers consenting scopes every minute and scans bounded current Agenda sources;
this also recovers edits committed while it was stopped. This is polling over
authoritative evidence, not a second queue or a post-commit best-effort hook.
Delivery insertion and the ID-only pg-boss job share the proven Drizzle transaction
adapter. Missing queue setup fails the transaction. Current-source validity is
checked again immediately before sending. Pending cancellation/rescheduling becomes
visible within a healthy scan interval; provider-boundary checks protect against
stale jobs between scans. Already accepted mail cannot be recalled.

Attempt evidence is committed before provider I/O. Racing workers can claim once.
An abandoned attempt becomes uncertain and is never automatically resent, including
Resend after its provider deduplication window. Definitively rejected attempts may
retry under the same logical key with a bounded count. Provider acceptance is not
delivery/read evidence. Signed, replay-deduplicated Resend events are resolved by
stored provider message ID, never by caller-supplied scope IDs. Conflicting or
unmatched events cannot fabricate acceptance or delivery.

Runtime financial tables remain read-only for notification work. Owner RLS,
workspace locking, command receipts and attributed preference audit are preserved.
Lifecycle purge removes deliveries/attempts/provider evidence before occurrences.
Restore keeps workers paused and requires external-effect reconciliation. Compact
delivery keys remain with the live workspace to prevent replay; operational
attempt/event evidence remains with the live workspace as compact audit evidence.
Queue metadata expires within seven days; operational logs have a recommended
30-day infrastructure retention gate. No raw body is kept.

### Operational gates and acceptance

Optional delivery requires NOTIFICATIONS_ENABLED=true independently of WORKER_PAUSED.
Real Resend delivery additionally requires NOTIFICATIONS_EXTERNAL_ENABLED=true,
reviewed sender/domain/quota configuration and authenticated webhook setup. These
gates remain off in this implementation's real environments. Acceptance uses mock
providers and local Mailpit. No deployment or real external send is authorized.

Acceptance covers consent/defaults/timezones/quiet hours, all source eligibility,
transaction rollback, replay/concurrency, current verified recipient, generations,
source resolution/corrections, opt-out, durable attempts/crash uncertainty, provider
events, forced RLS/roles, deletion, exact unchanged financial evidence, settings
origin/scope enforcement, accessibility, migration upgrades/schema drift, regression,
restore, container and bounded scan performance. Actual results belong in the V2
handoff; unexecuted infrastructure acceptance is never labelled passed.

## V2-H — Supporting Files, Imports and Portability

Authority: SYSTEM_ARCHITECTURE §18 and DATABASE_ARCHITECTURE §15. H covers one owned private workspace. No V2-I, shared history, V3, provider ingestion or redesign is authorized.

### H1 — Private supporting files

Eight concrete scoped relationships support financial actions, debts, settlements, reconciliations, exact statement revisions, applications, application events and exact resume versions. PDF/JPEG/PNG only; 10 MiB per object, 1 GiB reserved and at most 1,000 live objects per workspace. Forced RLS protects persisted pending, quarantined, available, rejected, deleting and deleted states. Sources are authorized before transfer. Quota reservations and command/audit evidence are serialized; retries retain their original commands.

Authenticated bounded uploads use opaque immutable keys and a four-minute operational lease to prevent expiry cleanup during bounded provider I/O. Actual size, signature, checksum and a fresh successful scan precede availability. Signatures are format hints, not guarantees of harmless content. Images retain original metadata; no document renders inline. Downloads reauthorize and validate exact readback, with attachment-only, no-store, nosniff and sandbox headers.

Production S3 uses explicit separate credentials, conditional writes, encryption/checksum evidence and private-policy probes. Enabled or suspended versioning is unsupported. Persisted namespaces bind bucket, region and endpoint; configuration changes fail closed instead of forgetting old objects. Clamd exchanges/responses are bounded, UTC-configured, and require signatures within 48 hours. Synthetic adapters verify the actual test database and are forbidden outside local testing.

Scan/cleanup intent survives crashes and provider failures. Discovery is bounded with UUID cursors; file I/O runs independently of security mail and supports cancellation. Reservations expire after 15 minutes. Unlinked files are inaccessible and retained for up to 30 days, with explicit deletion controls. Account purge acknowledges one object deletion per step before removing metadata. Storage/namespace failures retain retryable keys. Independent provider inventory, backups and real storage/scanner acceptance remain operating gates.

### H2 — Durable CSV cash history

Format `pmp-cash-activity`, version 1, requires explicit mapping of date, kind, amount minor units, classification, description and reference. PHP, an owned active cash account, date interpretation (YYYY-MM-DD, DD/MM/YYYY or MM/DD/YYYY), and opening-cutoff strategy are explicit. UTF-8 CSV is bounded to 1 MiB, 500 rows and 16 KiB per record. Positive canonical integer amounts use existing component bounds. Supported kinds are expense and income; income classes are earned, gift, reward and other. Card/debt/transfer/refund/Career/provider formats are unsupported and are not inferred.

Persistent batches retain hashes, account/source snapshots, immutable previews, decisions, stable row commands and posting provenance. Duplicate file, fingerprint and reference warnings require acknowledgement. Confirmation reads the server preview and rechecks revision/version; initial processing rejects stale snapshots. After-opening commands process at most 50 rows with existing financial services and per-row savepoints. Concurrent retries serialize without duplicate postings. Cancellation stops future chunks and preserves committed rows; corrections use existing finance correction/reversal commands.

Rebase-history requires an earlier date/amount and exact coverage equation: earlier opening plus selected historical net movement equals the original baseline. The opening transition and all selected historical rows commit atomically. Positive/zero transitions preserve reversals and immutable journals; no zero journal or guessed adjustment is invented. Ordinary opening corrections cannot move cutoffs. Imports do not infer paid installments, links, reminders or allocations.

Normalized staging and preview rows expire after 30 days. Compact hashes, row commands, receipts and recognized-action links remain as provenance. Recognized descriptions/references remain legitimate financial history.

### H3 — Private portability and recovery

Runtime format `pmp-private-workspace-graph`, manifest version 2, uses a reviewed static graph registry/fingerprint, repeatable snapshot, canonical checksum, exact values/dates, financial revision, definitions and coverage. Bounds are 10 MiB and 10,000 total graph rows, including relationships/audits; this is not a promise of 10,000 financial actions. Authentication/profile identity, lifecycle/tombstones, queue/operator records, temporary artifacts, external-effect retirement records and attachment bytes are excluded. Receiving account identity remains intact. Currency must match; timezone/week start are restored.

Exports have owned command/audit provenance and authenticated 24-hour downloads. Raw previews accept `application/vnd.pmp.private-workspace-graph+json` with a preview command in the query, rejecting duplicate keys, excessive nesting and invalid UTF-8 before parsing. JSON command envelopes remain supported. Unsupported tables/columns, incomplete coverage, duplicate identities, invalid references, ambiguous dates and wrong fingerprints/checksums block activation.

Preview reports counts, exact cash/spending/income and ledger positions, mapping, exclusions and blockers. Replacement requires the exact preview hash, current revision and typed confirmation. Lifecycle/workspace locks suspend writes. A bounded recovery snapshot precedes deletion. The narrow database bridge reconstructs the registered graph atomically; FK/check and INSERT/UPDATE constraint validators remain enabled. Failed validation preserves the prior workspace. Evidence IDs remain stable within a workspace; foreign copies remap typed UUIDs and registered internal JSON references, preserving literal provider references/notes. Previous financial receipts remain retired against replay.

Live file bytes require explicit deletion or separately supported byte recovery before replacement. Incoming file metadata is unavailable/deleted; JSON never recreates bytes. Pending imports are cancelled and notification consent is reset. In-flight external delivery blocks replacement. Provider delivery/attempt/event evidence must match trusted owned current, recovery or immutable retired evidence; fabricated/foreign provider history is blocked. Executed notification generations and actual provider evidence remain in protected operational command records, preventing replay after restoration or timezone changes. User-controlled bundles cannot inject those records.

Recovery bodies expire after 24 hours. Download the owned recovery bundle and reapply through the same preview/confirmation workflow. Operational retirement survives expiry. Infrastructure recovery uses a separate trusted backup/deletion-register procedure; portability never restores authentication or erases tombstones.

### H4 — Interfaces and acceptance

Settings provides owned source selection, files/unlinked cleanup, CSV review/resumption, exports, replacement preview and recovery links. Financial action, debt, application and statement pages expose files directly; all eight sources are available centrally. Labelled native controls, progressive disclosure, bounded pages and status feedback support keyboard/mobile use. Unconfirmed requests retain exact commands; confirmed rejections allow a new reviewed operation.

Actual verification, decisions and remaining gates are in `docs/reference/V2_DEVELOPMENT_HANDOFF.md`. Production setup is tracked in `docs/reference/V2_H_MANUAL_SETUP_AND_PRODUCTION_CHECKLIST.md`. Local acceptance does not imply production configuration, a real malware scan or deployment.
Local H1–H4 acceptance completed October 15, 2026. Household capacity verification defaults to 10,000 actions at the explicit request of the user; original latency, integrity and concurrent-load assertions remain unchanged. The 50,000-action stress profile remains optional. Production file integrations remain disabled pending the documented operating gates.
