# V2 Development Handoff

**Project:** Personal Management Platform  
**Repository:** `RAbnza/Personal-Management-Platform`  
**Repository name status:** Tentative; do not treat it as the final product name.  
**Phase:** V2 — Financial Maturity and Shared Expenses  
**Transition date:** October 10, 2026

---

## 1. Purpose

This document is the lightweight development handoff from the functionally complete V1 phase into V2.

It intentionally does **not** duplicate every V2 requirement.

Detailed requirements belong in separate domain documents so future development work can load only the context relevant to the feature being implemented.

The V2 documentation structure begins with:

- `docs/V2_DEVELOPMENT_HANDOFF.md`
- `docs/v2/CREDIT_CARDS_AND_STATEMENTS.md`
- `docs/v2/SHARED_EXPENSES_AND_SETTLEMENTS.md`

Additional V2 domain documents should be created only when their implementation phase begins if the authoritative project documentation is not already sufficient.

---

## 2. Authority and source-of-truth rules

The primary authoritative project documents remain:

- `docs/PROJECT_VISION_AND_FEATURE_BLUEPRINT.md`
- `docs/SYSTEM_ARCHITECTURE.md`
- `docs/DATABASE_ARCHITECTURE.md`
- `docs/DESIGN_SYSTEM_AND_VISUAL_GUIDELINES.md`

`docs/PROJECT_DEVELOPMENT_HANDOFF.md` remains the detailed implementation history and continuing repository handoff.

The V2 domain documents are later, more specific decisions for their V2 subject areas.

Where a V2 domain document explicitly states that it supersedes an earlier V2-specific decision, follow the newer V2 decision for that scope while preserving all unaffected architecture, security, accounting, database, and design rules.

Do not use a V2 domain document as permission to silently change unrelated V1 behavior.

---

## 3. V1 transition state

V1 functional development is complete and locally accepted.

Completed V1 scope includes:

- authentication and private workspaces;
- progressive onboarding and replayable help;
- financial accounts and ledger-derived balances;
- opening balances;
- income and expenses;
- category splits;
- transfers and fees;
- account history;
- borrowing;
- existing-debt import;
- debt payments;
- debt schedule revisions;
- debt settlement;
- reconciliation;
- balance adjustments;
- financial corrections and refunds;
- clearing/reclassification behavior required by V1;
- Career application tracking;
- source-driven Agenda and personal events;
- Dashboard;
- reports and drilldowns;
- CSV exports;
- in-app reminders;
- settings and module preferences;
- session management;
- account/data lifecycle;
- multi-user isolation;
- V1 automated/browser acceptance;
- migration-chain verification;
- local capacity verification;
- local encrypted restore verification;
- hosted CI verification.

The eighteen coherent-V1 acceptance scenarios have been verified through the applicable repository evidence.

V1 should therefore be described during continued development as:

> **Functionally complete and locally accepted, but not yet production-released.**

---

## 4. Deferred final production acceptance

The application is intended to be released only after V3.

Infrastructure-dependent production acceptance is therefore intentionally deferred until completion of V2 and V3.

This is a sequencing decision only.

The following remain mandatory before public release:

- approved production infrastructure;
- paid hosting/database plan where required by the architecture;
- production migrations and restricted roles;
- verified production email sender;
- deployed worker and maintenance verification;
- production monitoring;
- independent encrypted backups;
- independent deletion-register/checkpoint storage;
- enforced retention;
- hosted PITR;
- hosted restore and deletion reapplication;
- production support/contact destination;
- measured hosted capacity;
- staging/promotion verification;
- final security/isolation review;
- final full acceptance;
- release documentation.

Do not claim production readiness before those gates pass.

---

## 5. Engineering quality during V2 and V3

Deferring final production deployment does not defer engineering quality.

Every V2 milestone must continue to use the applicable repository gates:

- unit/domain tests;
- component tests;
- API tests;
- service/repository integration tests;
- PostgreSQL integrity tests;
- RLS/runtime-role tests;
- foreign-ID and ownership tests;
- exact-money assertions;
- idempotency/replay tests;
- concurrency tests where appropriate;
- migration-chain verification;
- schema-drift verification where relevant;
- lint;
- TypeScript;
- formatting;
- production build;
- browser/manual workflow acceptance;
- accessibility and responsive checks;
- documentation updates.

Financial changes must continue to preserve immutable evidence, exact integer minor units, balanced journals, workspace serialization, safe retries, server-owned authorization, and existing V1 financial invariants.

---

## 6. V2 product principles

V2 should increase capability without making ordinary workflows unnecessarily complex.

The primary UX principle is:

> **Domain separation does not require duplicate user-entry workflows.**

One real-world event should normally be entered once.

Examples:

- A purchase paid from cash is still an expense.
- A purchase paid using a credit card is still an expense.
- A purchase split with friends is still one real-world purchase.
- A purchase paid using a credit card and split with friends must not require three duplicate entries.

Internally, specialized financial and sharing domains may create distinct linked evidence.

Externally, the user should experience one coherent workflow wherever practical.

Advanced information should use progressive disclosure rather than forcing every user through the most complex form.

---

## 7. V2 development organization

V2 currently consists of:

### V2-A — Credit Cards and Statements

Detailed specification:

`docs/v2/CREDIT_CARDS_AND_STATEMENTS.md`

Credit cards extend the existing expense and financial-action system without becoming a duplicate expense tracker.

V2-A is the first V2 implementation area.

### V2-B — Recurring Obligations

Implement planned recurring income, bills and subscriptions using versioned recurrence definitions.

A planned occurrence never posts actual money merely because its date arrives.

### V2-C — Budgets

Budgets use shared authoritative reporting definitions rather than owning another spending total.

### V2-D — Savings Goals

Savings reservations represent planned allocation of existing funds and do not create another asset.

### V2-E — Forecasts

Forecasts derive from actual balances, expected occurrences and explicit assumptions.

They are not another financial source of truth.

### V2-F — Richer Career Analytics

Use authoritative Career application, stage and event history.

Do not infer facts that the recorded history cannot support.

### V2-G — Scheduled Opted-In Notifications

Add external/scheduled delivery only with explicit opt-in, current-source validation, idempotency and privacy-safe delivery behavior.

### V2-H — Supporting Files, Imports and Portability

Potential scope includes private evidence files, supported CSV imports, import previews, duplicate detection, cutoff-safe historical imports and portable workspace export/restore.

Uploaded evidence must never silently change financial or Career facts.

### V2-I — Shared Expenses and Settlements

Detailed specification:

`docs/v2/SHARED_EXPENSES_AND_SETTLEMENTS.md`

This is a required V2 capability, not a family-only feature.

It supports family, friends, roommates, trips, couples, temporary groups and manual/nonregistered participants.

Implement it after the private V2 financial model is sufficiently stable.

---

## 8. Narrow V2 supersessions

The following newer V2 decisions intentionally supersede narrower wording in earlier documentation.

### 8.1 Shared expenses are not family-only

Older references to:

> Family shared expenses

should be interpreted for V2 implementation as:

> **Shared Expenses and Settlements**

Family is one use case among many.

### 8.2 Multiple payers are required in V2

Older wording that says the first shared-expense release supports exactly one payer and defers multiple payers is superseded.

V2 Shared Expenses must support:

- one payer;
- multiple payers for the same bill;
- exact contribution amounts per payer;
- payer contributions summing exactly to the bill total.

Single payer remains the default simple UI.

### 8.3 Credit-card purchases use the shared expense-entry experience

A credit-card purchase must not require duplicate entry into an ordinary expense tracker and a second card-purchase tracker.

Credit cards are selectable funding sources within the applicable expense-entry workflow.

A dedicated Credit Cards surface remains necessary for card-specific liability, statements, payments, reconciliation, utilization and installment management.

### 8.4 Current shared balances net across all relevant group activity

Shared expenses are not isolated debts that must each be settled independently.

Current balances derive across:

- effective shared expenses;
- participant contributions;
- participant shares;
- refunds;
- confirmed settlements.

Reciprocal obligations cancel in the current balance while historical source records remain intact.

### 8.5 Settlement suggestions become a required V2 experience

The group should be able to suggest an explainable way to settle current net positions.

A suggestion is not a payment.

Do not claim mathematical minimum-transfer optimality unless the implemented algorithm guarantees it.

Redirected settlement across indirect relationships requires explicit participant agreement where applicable.

---

## 9. Broad visual redesign boundary

During V2 functional implementation:

- preserve the established design system;
- improve affected feature surfaces where necessary;
- maintain responsive/accessibility quality;
- do not perform a broad application-wide visual redesign unless separately assigned.

A comprehensive visual redesign may be performed after V3 before final release.

---

## 10. Milestone discipline

Do not implement an entire major V2 domain in one giant change.

For each domain:

1. inspect current `main`;
2. inspect relevant authoritative documentation;
3. inspect current affected implementation;
4. identify database/API/UI/reporting impacts;
5. establish a small milestone boundary;
6. implement the milestone vertically;
7. verify it;
8. update relevant documentation;
9. commit before moving to the next milestone.

Do not begin a later V2 domain while the current domain has unresolved correctness blockers.

---

## 11. V2-A starting direction

The first official V2 implementation area is:

> **V2-A — Credit Cards and Statements**

Before implementation, read:

- `docs/v2/CREDIT_CARDS_AND_STATEMENTS.md`;
- relevant credit-card sections of the blueprint;
- relevant Finance sections of the system architecture;
- the card schema design in the database architecture;
- relevant design-system guidance;
- the current Finance implementation.

V2-A should then be divided into small reviewed milestones.

Do not start V2-I Shared Expenses while foundational card accounting is still unstable unless the work is explicitly separated and safe to parallelize.

---

## 12. V2 completion boundary

Before V2 is functionally complete:

- all required V2 domains are implemented;
- V2-I Shared Expenses and Settlements is implemented;
- required V2 acceptance scenarios pass;
- V1 regression behavior remains valid;
- private and group authorization boundaries are verified;
- migration chain remains valid;
- major V2 browser workflows pass;
- accessibility/responsive acceptance passes;
- documentation reflects actual implementation.

Production deployment acceptance remains deferred until after V3.

---

## 13. Transition to V3

After V2 completion:

1. update the project handoff with the verified V2 state;
2. record the verified V2 implementation SHA;
3. preserve unfinished/deferred scope explicitly;
4. begin V3 only from the verified repository;
5. do not silently carry unresolved V2 correctness issues into V3.

V3 remains focused on adaptable trackers.

---

## 14. Final release sequence

Current intended sequence:

```text
V1 functional completion
        ↓
V2 functional development
        ↓
V2 Shared Expenses & Settlements
        ↓
V3 adaptable trackers
        ↓
Optional approved comprehensive visual redesign
        ↓
Final production infrastructure and hosted acceptance
        ↓
Final regression/security/performance acceptance
        ↓
Production release
```

No production requirement is waived by this sequence.

---

## 15. Immediate next step

Create and review the V2 domain documentation.

Then officially start:

> **V2-A — Credit Cards and Statements**

Continue from the repository itself, not from assumptions.