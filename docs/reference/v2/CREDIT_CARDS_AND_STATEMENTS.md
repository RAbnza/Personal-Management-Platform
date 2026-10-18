# V2 Credit Cards and Statements

**Phase:** V2-A  
**Domain:** Finance  
**Status:** Approved product direction before implementation

---

## 1. Purpose

This document defines the V2 credit-card product and workflow requirements.

It supplements the existing credit-card sections of:

- `PROJECT_VISION_AND_FEATURE_BLUEPRINT.md`
- `SYSTEM_ARCHITECTURE.md`
- `DATABASE_ARCHITECTURE.md`
- `DESIGN_SYSTEM_AND_VISUAL_GUIDELINES.md`

All existing financial integrity, ownership, audit, idempotency and exact-money rules remain applicable.

Where this document is more specific about V2 user experience, follow this document.

---

## 2. Product principle

A credit card is a liability with a billing lifecycle.

It is **not** a cash account.

However, a credit-card purchase is still fundamentally a purchase.

Therefore:

> **Credit-card purchases must integrate with the ordinary expense-entry experience instead of forcing users to enter the same purchase into a separate card tracker.**

The system may use a card-specific financial command internally.

The UI should still present one coherent purchase workflow.

---

## 3. User mental model

The application should distinguish:

### Purchase

The user buys something using the credit card.

Result:

- spending is recognized;
- card liability increases;
- cash does not move.

### Card installment plan

A purchase is subject to a provider installment arrangement.

The purchase expense must not be recognized repeatedly every month.

### Card payment

The user transfers real money from a bank/wallet/cash account to the card provider.

Result:

- paying cash decreases;
- card liability decreases;
- spending is not recognized again.

These concepts must never be presented as interchangeable.

---

## 4. Unified expense-entry workflow

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

## 5. Progressive card options

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

## 6. Pending authorizations

A pending authorization is not the same thing as posted card activity.

A pending authorization:

- does not create recognized posted card liability;
- must not be included in posted statement totals;
- must not be presented as a finalized purchase;
- may be shown informationally if later supported.

When an authorization becomes posted, the recognized card activity is recorded according to the provider-confirmed posting information.

Do not guess posting dates.

---

## 7. Card purchase accounting

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

## 8. Dedicated Credit Cards surface

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

## 9. Card detail terminology

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

## 10. Transaction date and posting date

Store and display transaction date and posting date separately.

Recommended meaning:

- **Transaction date:** when the user made the purchase.
- **Posting date:** when the provider recognized/posted it.

Spending reports should preserve the documented transaction-date basis for recognized purchases unless an authoritative decision changes that basis.

Statement membership follows verified provider posting/cycle information.

Do not infer statement membership solely from a guessed cycle calculation when the provider evidence differs.

---

## 11. Statements

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

## 12. Statement reconciliation

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

## 13. Remaining statement due

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

## 14. Card payments

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

## 15. Payment allocations

Where provider allocation is known, card payments/credits may be allocated to applicable statement balances.

Do not invent allocation order where provider rules are unknown.

If allocation is manually/provider-confirmed, retain that evidence.

Any unallocated/uncertain portion must remain visible rather than being silently guessed.

---

## 16. Fees and interest

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

## 17. Refunds

A card purchase refund should:

- reduce the applicable card liability or create/increase card credit;
- offset the relevant spending classification according to the established refund rules;
- link to the original purchase when possible;
- preserve original purchase history.

A refund is not ordinary income.

---

## 18. Card overpayment

If payments/credits exceed recognized card liability, show the result as a **card credit**.

Do not display this as negative debt.

Do not include card credit in liquid funds.

The application must not imply that card credit is cash available in the user's bank account.

---

## 19. Credit limit and utilization

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

## 20. Installment purchases

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

## 21. Installment accounting

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

## 22. Integration with ordinary expense history

Card purchases should appear in ordinary expense/history/reporting views alongside other purchases.

Relevant filters may include:

- payment source;
- card;
- category;
- transaction date;
- posting date where appropriate.

The user should not need to visit the Cards page to discover what they purchased.

---

## 23. Integration with shared expenses

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

## 24. UI simplicity requirements

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

## 25. Card reporting

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

## 26. Security and ownership

Cards are private workspace data.

All card reads/writes must preserve:

- server-owned actor/workspace context;
- strict workspace ownership;
- RLS/runtime-role enforcement;
- foreign-reference rejection;
- safe unavailable/authorization responses;
- no browser-supplied trusted ownership identifiers.

---

## 27. Corrections

Posted card financial actions follow the existing immutable correction/reversal/replacement model.

Statement evidence uses statement revisions.

Do not silently rewrite:

- original purchases;
- historical statements;
- allocations;
- payments.

Corrections retain reason and before/after evidence.

---

## 28. Required acceptance scenarios

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

## 29. Suggested implementation milestones

Do not treat these milestone names as immutable if repository inspection reveals a better boundary.

### V2-A1 — Card Integrity Foundation

Focus on:

- schema;
- liability binding;
- ownership;
- RLS;
- action kinds;
- database invariants;
- read model foundation.

### V2-A2 — Card Purchases and Unified Expense Entry

Focus on:

- purchase financial recipe;
- card activity;
- expense-entry funding-source integration;
- card activity history;
- reporting classification.

### V2-A3 — Statements and Reconciliation

Focus on:

- statement snapshots;
- revisions;
- statement entries;
- remaining-due derivation;
- reconciliation.

### V2-A4 — Payments, Fees, Interest and Refunds

Focus on:

- card payments;
- allocations;
- fees;
- interest;
- refunds;
- overpayment/card credit.

### V2-A5 — Installment Plans

Focus on:

- provider-confirmed installment schedules;
- no duplicate spending;
- future due projections;
- revisions where required.

### V2-A6 — Integrated V2 Card Surface and Acceptance

Focus on:

- Dashboard;
- Reports;
- Agenda/reminders where applicable;
- full browser acceptance;
- Shared Expenses integration when that module exists;
- regression/hardening.

---

## 30. Out of scope unless later approved

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