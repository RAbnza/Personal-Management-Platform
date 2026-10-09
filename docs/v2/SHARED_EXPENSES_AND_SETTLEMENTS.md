# V2 Shared Expenses and Settlements

**Phase:** V2-I  
**Domain:** Sharing + private Finance integration  
**Status:** Approved product direction before implementation  
**Product references:** Splitwise / Settle Up style shared-expense management without requiring feature parity

---

## 1. Purpose

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

## 2. Core principle

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

## 3. Groups

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

## 4. Lightweight group UX

Although groups are required internally, group creation should remain lightweight.

When creating a shared expense, the user may:

- choose an existing group;
- create a new group if needed.

Do not force the user through unnecessary administration for a simple temporary group.

A future Quick Split workflow may create/reuse a lightweight group internally, but it must preserve the same authorization and history rules.

---

## 5. Participants

A group may contain:

- registered users;
- manual/nonregistered participants;
- historical/deleted participant identities.

Manual participants are explicitly labeled, for example:

> Not registered · recorded manually

Do not silently match a manual participant to a newly registered user based only on display name.

Linking/claiming a manual participant requires verified identity, consent and balance/history review.

---

## 6. Privacy boundary

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

## 7. Shared expense record

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

## 8. One or multiple payers

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

## 9. Payer contribution invariant

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

## 10. Participant shares

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

## 11. Share invariant

For every finalized shared expense:

```text
sum(participant shares) = expense total
```

Payer contributions and participant shares must each independently equal the total.

They do not need to match person-by-person.

---

## 12. Multiple-payer example

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

## 13. Participants may differ by expense

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

## 14. Current group balance source

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

## 15. Expenses are not isolated debts

Shared Expense 1 and Shared Expense 2 must not behave as completely unrelated balances that each require independent repayment.

All current applicable expenses participate in the current group calculation.

Source expenses remain inspectable for history and explanation.

---

## 16. Reciprocal netting

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

## 17. Pairwise relationship visibility

Where source allocations support it, the group UI should answer:

- how much you currently owe each participant;
- how much each participant currently owes you;
- how much other participants owe one another where group visibility permits;
- which expenses/refunds/settlements explain that relationship.

Pairwise presentation must derive from the authoritative group records rather than becoming another mutable source of truth.

---

## 18. Explainable relationship breakdown

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

## 19. Whole-group net positions

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

## 20. Suggested settlements

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

## 21. No false optimality claim

The application does not need to guarantee the mathematically smallest possible number of payments unless an implemented algorithm formally guarantees that property.

Use language such as:

> Suggested way to settle

rather than:

> Minimum possible payments

unless correctness is proven.

---

## 22. Redirected/indirect settlement

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

## 23. Settlement modes

The settlement workflow must support at least:

### Full balance

Pay the entire amount currently due to the selected recipient under the chosen settlement scope.

### Custom amount

Pay only part of the current amount.

Example:

```text
You owe Brother 1        PHP 2,000
Pay now                  PHP 1,000
Expected remaining       PHP 1,000
```

### Selected expenses

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

## 24. Partial settlement of one expense

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

## 25. One settlement across multiple expenses

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

## 26. Recipient correctness

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

## 27. Overpayment

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

## 28. Reported versus confirmed settlement

For registered participants, reporting that money was sent is not equivalent to recipient confirmation.

A reported settlement remains pending until the recipient confirms receipt.

Pending settlements:

- remain visible;
- preserve allocations;
- do not reduce confirmed group balances;
- may affect a separately labeled projected balance.

---

## 29. Sender view for pending settlement

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

## 30. Recipient confirmation view

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

## 31. Pending settlement reporting

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

## 32. Group-level pending summary

The group page should distinguish:

- confirmed current balances;
- pending outgoing settlements;
- pending incoming settlements;
- projected balances if pending settlements are confirmed.

Do not combine projected and confirmed numbers without labels.

---

## 33. Dashboard attention

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

## 34. Pending settlement aging

The UI may display:

> Awaiting confirmation · 3 days

This is informational.

When reminder delivery exists, the user may be offered an in-app or opted-in external reminder.

Do not automatically harass participants or expose sensitive financial content through notification channels.

---

## 35. Disputes

A recipient who disagrees with a reported settlement can dispute it.

A disputed settlement:

- remains visible;
- does not reduce confirmed group balances;
- retains the original reported details;
- records reason/evidence where supported;
- must be resolved through an explicit correction/transition.

Do not silently edit the payment amount after a dispute.

---

## 36. Manual/nonregistered settlement confirmation

A manual participant cannot perform authenticated confirmation.

Manual confirmation must record:

- who entered the confirmation;
- confirmation type;
- the fact that recipient-authenticated confirmation was unavailable.

Present this limitation clearly.

---

## 37. Private ledger integration

Group records do not automatically mutate every participant's private financial ledger.

Each registered participant controls adoption into their own workspace.

A group bill can exist independently of private ledger adoption.

This preserves privacy and prevents another participant from changing someone's private finances.

---

## 38. Integrated Add Expense experience

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

## 39. Private accounting for payer's own share

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

## 40. Private accounting with multiple payers

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

## 41. Existing private purchase linking

If a purchase has already been entered privately, converting/linking it to Shared Expenses must not create another cash/card deduction.

Use the existing correction/reclassification/private-link model.

Preview the result before applying.

---

## 42. Credit-card integration

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

## 43. Funding privacy with multiple payers

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

## 44. Refunds

A refund linked to a shared purchase must preserve the original bill and settlements.

Refunds adjust applicable payer contribution/share effects.

If participants already settled, a refund may create a new reverse amount owed.

Do not delete historical settlements merely because the merchant refunded the purchase later.

---

## 45. Corrections

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

## 46. Group summary/reporting

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

## 47. Per-person detail

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

## 48. Per-expense detail

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

## 49. Equal-split rounding

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

## 50. Security rules

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

## 51. Leaving a group

Leaving/removing a member:

- does not erase history;
- does not forgive balances;
- prevents unauthorized new activity;
- retains approved historical visibility;
- preserves settlement evidence.

An active group should not accidentally become ownerless.

---

## 52. Archive behavior

Completed/inactive groups should normally be archived rather than deleting financial/shared history.

Archive does not zero balances or remove settlement evidence.

---

## 53. Required acceptance scenarios

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

## 54. Suggested implementation milestones

Milestone names may be adjusted after inspecting the repository.

### V2-I1 — Group Identity and Authorization Foundation

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

### V2-I2 — Shared Bills and Multiple Payers

Focus on:

- expense revisions;
- one/multiple payer contributions;
- equal/exact participant shares;
- exact rounding;
- current group balance derivation;
- per-person/per-expense reads.

### V2-I3 — Private Ledger Adoption

Focus on:

- private group bindings;
- existing-purchase linking;
- new private postings;
- receivable/payable treatment;
- privacy boundary;
- Add Expense integration.

### V2-I4 — Settlements and Pending Confirmation

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

### V2-I5 — Netting and Settlement Suggestions

Focus on:

- reciprocal netting;
- relationship views;
- whole-group net positions;
- deterministic explainable settlement suggestions;
- redirected settlement agreement where supported.

### V2-I6 — Refunds, Corrections and Reporting

Focus on:

- shared refunds;
- bill corrections;
- settled-bill corrections;
- private-link review;
- group reports;
- Dashboard attention.

### V2-I7 — Cross-Domain Integration and Acceptance

Focus on:

- card-funded shared purchases;
- reminders/notifications where applicable;
- imports/files where applicable;
- browser acceptance;
- security review;
- accessibility;
- full regressions.

---

## 55. Explicit V2 boundaries

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

## 56. Final product rule

The Shared Expenses experience should make this statement true:

> A user can record real shared purchases exactly once, regardless of who paid or how many people paid, see everyone's explainable current position across all group activity, settle all or part of what is owed, understand pending confirmations, and preserve complete history without exposing anyone's private finances.