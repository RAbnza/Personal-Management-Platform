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

V2-A5 is implemented and locally accepted. Its scope and actual verification evidence are recorded in section 20; sections 16–19 preserve the A1 through A4 milestone records.

After accepted V2-A5, the next assignment is:

> **V2-A6 — Integrated V2 Card Surface and Acceptance**

Start it only when explicitly assigned. No later milestone is authorized by this handoff.

---

## 16. V2-A1 — Card Integrity Foundation

**Implementation date:** October 11, 2026 (Asia/Manila).

**Baseline:** clean `main`, `be160e934945e08f1a66e3b0d5a908c46eb71130`.

**Acceptance:** completed and locally accepted; no A1 acceptance blocker remains. Production release is still deferred.

**Commit lookup:** the milestone commit is `feat(finance): add v2-a1 card integrity foundation` on `main`; resolve its SHA with `git log -1 --format=%H -- src/platform/db/schema/credit-cards.ts`. The completion report records the actual SHA and verified push result. Hosted CI for this new commit is not claimed by the local evidence below.

Implemented scope:

- `finance.credit_card` stores name/issuer, optional exact provider limit and verification date, notes, archive state, immutable creation attribution and an optimistic version. Every card binds one dedicated, same-workspace, same-currency `card_liability` ledger. The binding, currency, scope and attribution cannot be repurposed even before any posting exists. Names/providers may repeat.
- Trusted-server services create cards and update complete metadata/archive/restore intent. These commands use the existing profile/workspace locks, permanent command receipts, normalized intent hashes, audit revisions, workspace financial revision advancement and deferred constraint enforcement. Identical commands replay their original result, including a metadata command with an old expected version; changed intent conflicts. Request attribution is excluded from hashing. Creation does not record an opening amount or create an action, journal or posting.
- Card metadata changes require matching versioned audit evidence and a completed permanent receipt at database commit. The metadata update contract replaces the full metadata payload; omitted optional values normalize to null. Currency and ledger binding are server controlled. These are internal services, not browser input contracts or publicly exposed card routes.
- Scoped, bounded list/detail read models derive the credit-normal position from all posted original/reversal/replacement postings, without filtering to current action revisions. Outstanding liability and card credit are separate exact integer strings. Card credit and limits are never liquid cash. Missing/foreign card references share the same unavailable error. Archived cards retain identity/history and can be read explicitly.
- `finance.card_activity` is reserved revision-scoped evidence with separate transaction/posting dates, nonzero signed liability, same-card identity and scoped action/revision FKs. App access is SELECT only; inserts/updates are additionally blocked by a database gate. There is no posted activity in A1.
- Reserved action kinds are `opening_card`, `card_purchase`, `card_payment`, `card_fee`, `card_interest`, `card_refund`, `card_adjustment`; reserved activity kinds are purchase/payment/fee/interest/refund/opening/adjustment. Reservation does not enable financial execution. All seven action kinds and all card-liability postings are explicitly rejected by additional triggers; existing recipe/classification/finalization validators are unchanged.
- Both new private tables have forced RLS with active owned profile/workspace predicates and scope-first relationships. Auth/queue/worker roles gain no card access. The separate lifecycle operator receives only the established approved-request SELECT/DELETE policy. Existing catalog-driven deletion previews and ordered graph purge include the new tables without widening runtime privileges.

Database decisions:

- Forward-only Drizzle structural migration `0076_blue_maddog.sql` and reviewed custom integrity migration `0077_v2_a1_card_integrity.sql`, with journal/snapshots. The numbered chain now contains **78 migrations / 60 declarative tables**; pinned auth/queue migrations retain their existing ownership.
- Credit limits are nonnegative provider metadata, not journal components. They accept the full signed PostgreSQL bigint positive range, including zero/null, without Number conversion; actual posting limits remain unchanged. No utilization/provider allocation/minimum-payment formula is introduced.
- Metadata creation/edit services are the narrow foundation dependency for independently exercising identity, versioning, audit, retry and lifecycle acceptance. There is no card-management UI/API or change to expense entry. Opening/import financial commands remain blocked until their own reviewed recipes exist.
- The newer V2 transition and current assignment supersede the old C5 continuation text in the project handoff. Public production release remains deferred until after V3.

Actual verification:

- `pnpm db:migrate:test`: passed; existing V1 test database upgraded before database tests.
- `pnpm exec vitest run tests/unit/credit-card.test.ts`: **21 passed**.
- `pnpm exec vitest run --config=vitest.integration.config.ts tests/integration/credit-card-foundation.test.ts`: **19 passed**, including runtime SQL, exact metadata, no money movement, audit/rollback, absent/foreign/spoofed scope, restricted-role catalog/FKs, replay/conflict, independent-connection races, profile/workspace lock contention against deletion/raw card roots, and approved operator purge with another owner preserved. The added lock fixture initially used an inconsistent SQL parameter cast; that test-only query was corrected and all nineteen passed.
- `pnpm db:verify:chain`: passed fresh/no-op **78-migration** chain and committed D6b–C4 financial/report/reminder/lifecycle smokes plus A1 card checks and actual card purge.
- `pnpm db:verify:chain --upgrade-v1`: passed committed **76 → 78** upgrade, preserved V1 cash/history/report totals, then the complete fresh-chain smokes and card/lifecycle acceptance.
- The existing acceptance workflow retains its V1 checks and C4 upgrade proof, and now also runs `--upgrade-v1` on future pushes/PRs.
- `pnpm db:generate`: no schema drift.
- `pnpm test --maxWorkers=2`: **695 unit/component tests / 102 files passed**. An unrestricted `pnpm test` attempt was interrupted after existing component timeout failures under many simultaneous workers; the bounded run preserves every original assertion/timeout.
- `pnpm test:integration`: final run **419 integration/database tests / 58 files passed**, including the added lock test and all existing financial/security/lifecycle regressions. The preceding 418-test full run and final focused nineteen-test card run also passed.
- `pnpm check`: lint, generated route types/TypeScript and full formatting passed. Final documentation formatting is rechecked before commit.
- `pnpm build`: passed on Windows; the existing Windows standalone symlink warnings remain. `docker build --target web --tag pmp-v2-a1-web .` also passed on Linux, followed by a nonroot standalone-artifact check that loads `pg` and verifies no environment files/development test tooling. No public deployment occurred.
- `pnpm db:migrate` and `pnpm db:check:runtime`: passed after test migration, financial regression and isolated chain verification. Development is now migrated through `0077`; restricted runtime connections and transaction-local scope cleanup are verified.
- `$env:PMP_BROWSER_CHANNEL='chrome'; pnpm test:browser`: **27 production-browser tests passed**, including 320px reflow/axe, dark-theme contrast, keyboard focus, financial corrections/refunds/debt/reconciliation, private API inventory, reminders/reports/CSV, account switching, deletion and real one-time recovery. Card UI remains outside A1.
- Structured snapshot review confirms only the two new card tables and two kind CHECK expansions differ from `0075`; the custom snapshot matches the structural schema. Complete diff review, full formatting and `git diff --check` pass. Only milestone implementation/tests/documentation/CI changes are included; no dependency, environment-secret, V1 UI or unrelated changes are included.

Remaining boundary and next prerequisites:

- No V2-A2 purchases, unified expense-entry changes, statement/reconciliation, payments/fees/interest/refunds, installments, shared expenses, other V2 domains, V3 or broad redesign.
- A2 must implement and prove the purchase recipe, exact activity-to-revision liability movement, category/funding validation, immutable parent guards, posted dates, correction behavior and reporting semantics before selectively replacing any A1 gate or granting activity INSERT. It must preserve the gates for unreleased card commands. SQL balance projections beyond zero require acceptance fixtures posted through those complete recipes; A1 tests the sign/credit arithmetic in the domain and zero-only database position.
- Full card browser/accessibility workflows belong to later assigned UI milestones. A1 introduces no UI surface; existing V1 browser/accessibility regression remains applicable. Production hosting/sender/PITR/retention/monitoring acceptance remains deferred, not waived.

---

## 17. V2-A2 — Card Purchases and Unified Expense Entry

**Implementation date:** October 11, 2026 (Asia/Manila).

**Baseline:** clean `main`, `fe91c6f94f9b702a23eb38dec662029bebcd3df7`; committed and remotely confirmed V2-A1 foundation.

**Acceptance:** completed and locally accepted; no A2 acceptance blocker remains. Production release is still deferred. A3 has not been started.

**Commit lookup:** `feat(finance): add v2-a2 card purchases and expense funding` on `main`; resolve the milestone SHA with `git log -1 --format=%H -- src/modules/finance/domain/card-purchase.ts`. The completion report records the actual SHA and verified remote push. Hosted CI for this commit is not claimed by the local results below.

Implemented scope and decisions:

- Ordinary Add Expense offers active cash accounts and credit cards together, including card-only workspaces. Income retains cash funding. A posted card purchase requires an explicit provider-confirmed posting date; transaction date determines spending periods. Provider reference is optional. Pending authorizations are unsupported and cannot post money. Card creation exposes the completed A1 metadata command through a private API and a minimal name/issuer form; it creates no opening financial entry.
- The shared expense service retains the existing cash command/hash/receipt behavior and strictly separates the new `card_purchase` input. One posted transaction-date journal debits gross category expense and credits exactly the selected dedicated card liability. It changes neither cash nor income. Exact minor-unit strings, category splits, same currency, active references, profile/workspace locks, permanent receipts, attributed audit evidence, financial revision advancement and commit-time constraints remain mandatory. Identical retries return the original result before checking subsequently archived references; changed intent conflicts.
- Immutable purchase detail retains posting date/reference independently of liability movement. `card_activity` records exactly one nonzero signed net movement per revision/card, including reversals and replacements. Provider-only or category-only corrections can have zero net liability and therefore create no zero-valued activity row; the new purchase evidence still preserves that revision in card history. Card-to-card corrections reverse the original card and charge the replacement without recognizing an extra expense. A correction may retain its original archived card/category; newly selected references must be active. Correction/reversal remains within the existing immutable review, reason, version and retry workflow.
- Private card pages expose exact recorded outstanding/card-credit positions and bounded activity history, with separate transaction/provider dates and preserved correction reasons. Financial activity supports card, category, cash/card and transaction/posting-date filters without multiplying logical actions. The correction picker retains its bound historical card even beyond its first bounded page.
- Reports, spending/category contributions, dashboard liability/net position and transaction CSVs include the same signed posting facts. Card metadata joins retain one posting per row, including source classification/provider evidence on reversals. Card limits/credits never increase liquid cash. Unknown provider history, statements and scheduled dues are not invented. Updating existing dashboard totals is required for A2 accounting consistency; later integrated card surfaces remain deferred.
- Financial calculation definitions advance to `v2-a2-posted-signed-cards-1` and `v2-a2-reports-signed-card-purchases-1`; CSV schema advances to **2**, adding card identity/name, provider posting date and reference. The export contract documents the change; existing export provenance retains its original versions.

Database and prerequisite resolution:

- Forward-only structural migration `0078_damp_stranger.sql` adds two nullable provider-evidence columns to purchase detail. Custom migration `0079_v2_a2_card_purchase_integrity.sql` selectively releases the purchase recipe/card postings and grants activity INSERT only to `app_domain`. All other reserved card commands remain gated. Existing V1 recipe validators, journal balancing, posting classification and reversal contracts remain installed; the classifier adds one card-liability branch. A universal deferred revision validator rejects missing/mismatched purchase, posting, activity and attributed audit evidence, unrelated recipes and cash movement, even for balanced raw runtime SQL.
- Forced RLS, scoped FKs, financial-root locks, building-parent guards, append-only protections and the separate approved lifecycle purge policy remain enforced. Runtime activity UPDATE/DELETE and privilege/bypass attempts fail. Actual operator purge removes the complete card graph while preserving another owner.
- Structured snapshot comparison confirms only `finance.purchase_detail` changes, with `card_posting_date` and `card_provider_reference`; the custom snapshot matches the structural schema. The chain contains **80 migrations / 60 declarative tables**. No dependency changes were needed.
- A1's hosted workflow completed with one browser failure despite its recorded local success: a strict `locator("main")` matched the visible route plus Next.js's hidden retained route. Accessibility regression now uses the visible accessible main role, preserving the existing axe/reflow assertions. This is an A2 acceptance prerequisite fix, not a product authorization change.

Actual verification:

- `pnpm test --maxWorkers=1`: **731 unit/component tests / 105 files passed**. New coverage includes strict posted-purchase inputs, API trusted attribution/origin handling, missing/foreign cards, card-only expense entry, mandatory posting date, unchanged income funding and identical uncertain retries. Dashboard tests cover exact card liabilities/credits beyond Number precision. An earlier concurrent run exposed stale dashboard mocks/fixtures, which were corrected; a Windows threads-pool attempt was interrupted without claiming a pass.
- `pnpm test:integration`: **439 integration/database tests / 59 files passed**. Two existing heavy tests timed out when running alongside other suites; the complete isolated rerun passed without changing their timeouts or assertions.
- Focused A2/A1 database suites: **39 passed**. Final `pnpm test:integration tests/integration/card-purchases.test.ts`: **21 passed**, including additional actual dashboard/CSV agreement assertions. Coverage includes exact splits, unchanged cash, transaction-date reporting, independent-connection concurrent retries/distinct commands, rollback of receipts/audit/financial evidence, archived-reference replay, zero-money/provider corrections, amount/date/card replacements, reversal, missing/foreign/spoofed ownership, pending deletion, actual operator purge, runtime permissions and twelve independently built malformed balanced recipes.
- `pnpm db:verify:chain`, `--upgrade`, `--upgrade-v1`, and `--upgrade-a1`: all passed fresh/no-op **80-migration** chains, **67/76/78 → 80** committed upgrades, preserved V1 account/history/report totals and A1 exact card metadata, plus complete D6b–C4 and A1/A2 accounting/lifecycle smokes. The acceptance workflow retains its existing checks and adds the A1 upgrade proof.
- `pnpm db:generate`: no schema drift. `pnpm db:migrate:test`, `pnpm db:migrate`, and `pnpm db:check:runtime`: passed; development/test schemas now include A2 and restricted runtime scope installs/clears correctly.
- `pnpm check`: lint, generated route types/TypeScript and full formatting passed. `pnpm build`: production build passed on Windows.
- `$env:PMP_BROWSER_CHANNEL='chrome'; pnpm test:browser`: final full run **29 production-browser tests passed**, including both A2 workflows, all existing V1 financial/correction/debt/report/CSV workflows, dynamically inventoried private APIs, cross-owner isolation, account switching, reminders, deletion/recovery, keyboard focus, 320px reflow and axe/dark contrast. The focused A2 rerun also passed **2/2**. New entry/history/dark-card screenshots were visually inspected.
- Browser failures found and resolved: the installed Next.js docs specify HTTP 200 for streamed not-found responses, so the isolation test verifies rendered not-found UI and absent private details while API rejection still requires HTTP 404. The first full run passed 28/29 and exposed an obsolete CSV-version-1 assertion; the updated test requires version 2/the A2 definition and blank card evidence on cash rows. The final complete 29-test rerun passed, including A1's previously failing hosted dark-theme locator.
- `docker build --target web --tag pmp-v2-a2-web .`: passed on Linux. A separate standalone-artifact check passed: nonroot UID 1000, server/static assets and `pg` present, no environment files or development test tooling. This was artifact verification, not a public deployment.
- `pnpm audit --prod --audit-level high`: passed; no known vulnerabilities found. Final `pnpm check` passed again after the added dashboard/CSV assertions and browser contract correction. Documentation-only final updates are formatted and checked before commit.

Remaining boundary:

- No statements/reconciliation, card payments/fees/interest/refunds/adjustments, installments, shared expenses, other V2 domains, V3 or broad redesign. Unreleased card commands retain database gates. Production hosting/sender/PITR/retention/monitoring acceptance remains deferred, not waived.
- After A2 acceptance, the next milestone is **V2-A3 — Statements and Reconciliation**, only when explicitly assigned. It must build on preserved transaction/provider evidence and immutable card corrections; it may not repeat purchase spending or derive unknown provider statement facts. Do not start A3 automatically.

---

## 18. V2-A3 — Statements and Reconciliation

**Implementation date:** October 12, 2026 (Asia/Manila).

**Baseline:** clean `main`, `a21a7a8c32c1a0c126aac54a8bc11117258ec458`, fetched and confirmed equal to `origin/main`. A1 and A2 remain committed foundations.

**Acceptance:** completed and locally accepted. No A3 acceptance blocker remains. Production deployment remains deferred; no A4 command has been enabled.

### Implemented scope and decisions

- Added `finance.card_statement`, `card_statement_revision` and `card_statement_entry`. Each statement retains an immutable card identity, sequential current revision, billing cycle, statement/due dates, signed historical provider balance, minimum due, optional provider opening balance/reference, explicit verification source/date, server attribution/time and correction reason. Building evidence must finalize atomically; historical snapshots and entries cannot be extended or edited.
- Corrections create new snapshots with exact before/after private audit evidence and permanent completed command receipts. Workspace/profile locks serialize commands with financial corrections and lifecycle changes. Identical retries replay before mutable reference validation; changed intent and stale correction versions conflict.
- Accepted UUID references normalize to PostgreSQL's lowercase representation before intent hashing, duplicate-link checks and immutable audit comparison. Equivalent uppercase/lowercase identifiers preserve identical retry behavior, including historical reads and revisions; provider descriptions/references retain their original case.
- Entry associations bind the exact posted purchase revision and its same-card recognized purchase amount/provider posting date. They deliberately reference `purchase_detail` and `action_revision`, rather than treating a correction's net `card_activity` delta as a second provider purchase. Zero-money posting-date corrections remain linkable. A new association requires current recognized evidence; a correction may explicitly retain its previous preserved association.
- Membership requires explicit provider confirmation. Out-of-cycle provider membership is accepted and preserved. One logical purchase can belong to at most one current statement in the workspace, including after a card correction; historical revisions retain earlier associations. Exact duplicate provider cycles require correction of the existing statement. Other cycle membership is not inferred from dates.
- Unknown provider lines retain nullable amounts/dates and remain visibly unresolved. Known provider amounts are signed historical evidence, including provider payments/credits that have no supported application action yet. They do not create postings or allocations. Provider balance comparison is exact only when the opening balance and every line amount are supplied; otherwise the difference remains unknown. Linked purchases corrected after association are separately flagged without rewriting statement history.
- Recorded remaining due is `max(verified statement balance, 0)` less **zero effective recorded allocations in A3**. A4 allocation/payment recipes remain blocked. The UI explicitly describes this as recorded evidence and does not infer provider payments, allocation order, current cash or current card liability from statement balances. Positive due and negative provider credit evidence remain exact beyond JavaScript's safe integer range.
- Added private collection/detail/revision APIs under `/api/v1/credit-cards/[cardId]/statements`, strict trusted ownership boundaries, mutation-origin checks, safe missing/foreign errors and `no-store` responses. A local 3 MiB statement-body limit accommodates 100 bounded provider lines and correction evidence; other commands retain the existing 64 KiB limit. Added statement list, entry/review, reconciliation, historical revision and correction pages under the existing card surface. Forms preserve an uncertain command for identical retry and guard navigation while its outcome is unresolved; review headings and errors receive meaningful focus.
- Statement commands make no financial actions, journals, postings, purchase recognition or liability movement. The database also rejects financial revisions using a statement command receipt. V1/A1/A2 recipes and unreleased A4 gates remain installed.

### Database and lifecycle evidence

- Migrations `0080_milky_viper.sql` and `0081_v2_a3_statement_integrity.sql` add three scoped tables and reviewed integrity guards: same-root current/previous revision foreign keys, exact audit/receipt proofs, sequential versions and provider line ordering, provider link validation, cycle/membership uniqueness, immutable snapshots/entries and immutable card binding.
- All three tables use enabled/forced owner RLS with active-workspace/profile checks. Application deletion is denied; lifecycle operator access is limited to the existing approved purge scope. No runtime role bypass, unrelated grant broadening or dependency change was introduced.
- The catalog-driven deletion graph includes statements and their historical associations. The focused operator test purges a two-revision statement linked to posted card activity and preserves another owner's statement. Deletion-pending reads/writes and spoofed owner/workspace settings are rejected.
- Updated migration-chain verification and hosted acceptance to include an **80-migration A2-to-A3 upgrade** with preexisting card purchases preserved, alongside fresh/no-op, older V1, final V1 and A1 upgrades. The common smoke proof now records/revises/replays statements, checks exact due/membership and unchanged ledger totals, purges the resulting graph and confirms another owner's statement survives.

### Prerequisite resolved

- The pushed A2 hosted run `38141084507` finished with 28/29 browser checks passing; the dark Settings check failed because Next.js retained route forms with duplicate static control/title IDs. Workspace preference controls now use React `useId` for labels, descriptions, errors and datalist/title references. A focused two-form regression proves unique IDs and accessible labels. This fixes the observed A2 prerequisite without changing financial behavior.
- The first A3 hosted run `38158572111` passed its accounting, migration and statement browser checks, but finished 30/31 browser checks with a remaining Settings skip-link landmark violation. Retained pages also shared the shell's static `main-content` target. Skip links now belong to a named navigation landmark. The follow-up hosted run `38160966935` exposed that route-based targets still collide for retained debt pages sharing a navigation path; shell targets now use React `useId` per rendered instance. Component/browser assertions require the current skip link to resolve to its own visible, focusable main, including two shells sharing a navigation path. The presentational shell is a client boundary accepting server-rendered children; data loading and ownership checks remain in the server pages/layouts. No accessibility rule is excluded.
- Post-push review reproduced a statement insert failure for valid uppercase UUIDs: PostgreSQL canonicalized persisted identifiers while the audit intent retained uppercase strings. Domain/read/HTTP parsing now canonicalizes accepted identifiers. The database regression covers initial recording, an equivalent-case replay, historical reads and a revision retaining the recognized purchase; existing SQL integrity checks remain unchanged.

### Actual verification

- `pnpm check`: passed lint, Next route generation, TypeScript and whole-repository formatting.
- `pnpm test --maxWorkers=1`: **770 tests / 108 files passed**, including **38** statement domain/API/component checks, the workspace-preference label regression and statement request-size boundaries. The final three shell component checks also passed with the retained-route target regression.
- `pnpm test:integration`: final isolated run **465 tests / 60 files passed**, including all V1/A1/A2 regressions and A3. The preceding run passed 464/465 and hit the existing 55-payment pagination fixture's five-second timeout; its isolated 19-test suite and the complete rerun passed without changing timeouts or assertions.
- `pnpm test:integration tests/integration/card-statements.test.ts`: **26 passed**, including direct invalid/valid application-role SQL, immutable history, ownership/RLS, independent connection retries/races, equivalent-case UUID replay/revision, unknown evidence, exact bigint credit balances, archived cards, out-of-cycle membership, corrected-card associations, rollback, deletion blocking and actual approved purge.
- `pnpm db:verify:chain` and `--upgrade`, `--upgrade-v1`, `--upgrade-a1`, `--upgrade-a2`: all passed **82 migrations**, no-op repeats and the complete existing financial/lifecycle smoke proof plus A3.
- `pnpm db:generate`: no schema drift. Test/development migrations and restricted runtime connection/scope checks passed. Production dependency audit reports no known vulnerabilities.
- `pnpm verify:restore`: isolated encrypted restore passed exact counts/balances, reporting, RLS, revoked credentials, independently approved scoped deletion and other-owner preservation.
- `pnpm build`: passed on Windows, including TypeScript and all new private routes. Existing Windows standalone symlink `EPERM` warnings remain; the Linux artifact proof below verifies the production output.
- `PMP_BROWSER_CHANNEL=chrome pnpm test:browser`: final production suite **31 passed**, including the A2 dark Settings regression, statement verification/reconciliation/correction history, a genuinely committed first response lost in transit, identical retry, missing/foreign owner rejection, dark/light 320px reflow and automated accessibility. Statement form, reconciliation and dark screenshots were visually inspected. The first full browser run passed 30/31; the new retry test's generic alert locator also matched Next.js's route announcer. The final assertion targets the form's save error specifically.
- `docker build --target web --tag pmp-v2-a3-web .`: Linux production build passed. Container assertions confirm nonroot UID 1000, compiled statement collection/revision routes, static assets and PostgreSQL driver, with private environment files and test/migration tooling absent.
- Generated-snapshot comparison proves exactly three new statement tables, all prior 60 declarative tables unchanged and the custom integrity snapshot matching the structural snapshot. Staged diff checks passed; no dependency, lockfile, secret/environment, generated runtime artifact or unrelated change is included.
- Git procedure: milestone commit `7ddaa822f5c8236d014c0271ffe94835fecca363` (`feat(finance): add v2-a3 statements and reconciliation`) was automatically pushed on the established `main` branch and its exact remote head verified. Follow-up commit `ee8f695bdda0991af9290e6ae53ef05807558695` (`fix(finance): normalize statement references and skip targets`) fixes UUID intent and initial skip navigation evidence. The shared-path retained-shell correction uses Conventional Commit `fix(ui): isolate retained shell skip targets`, followed by a non-force push and exact remote-head verification. Resolve the final SHA through `git log -- src/components/shell/app-shell.tsx`; final hosted acceptance is reported separately from the completed local checks above.

### A4 prerequisites and milestone boundary

- A4 must introduce supported card payment/fee/interest/refund financial recipes and effective allocation evidence before changing remaining due. Allocations must bind verified statement/card/workspace evidence, preserve original statement balance and correction history, account for effective financial reversals/replacements, reject excess or foreign allocations and leave uncertain/unallocated provider amounts visible. Do not substitute provider line amounts for recognized financial actions or allocations.
- Entry guards currently accept the released card purchase recipe only. Extend associations to new A4 activity kinds together with their validated source amount/date evidence and correction rules. Preserve unresolved A3 provider lines until explicitly linked to those supported records.
- A4 must replace A3's zero-allocation due derivation with exact effective supported allocation totals, preserve separate cash/spending/liability classifications and continue safe retry, version, lifecycle and database integrity checks. Reconciliation must continue exposing unsupported or corrected evidence.
- Agenda/reminder integration, installment plans and the complete Dashboard/Reports card surface remain their later approved milestones. No deployment or A4 implementation is performed as part of A3.

---

## 19. V2-A4 — Payments, Fees, Interest and Refunds

**Implementation date:** October 12, 2026 (Asia/Manila).

**Baseline:** clean `main`, `e81ca81b27965291fcdf7d1769604ef24a6f5e1a`, fetched and verified equal to `origin/main`. The committed A1/A2/A3 foundations and successful A3 hosted acceptance were confirmed before implementation.

**Acceptance:** completed and locally accepted; no A4 acceptance blocker remains. Production deployment remains deferred. A5 has not been started.

**Commit lookup:** `feat(finance): add v2-a4 card payments and allocations` on the established `main` branch; resolve its SHA with `git log -1 --format=%H -- src/modules/finance/domain/card-command.ts`. The completion report records the actual SHA, verified remote push and hosted acceptance separately from the local evidence below.

### Implemented scope and decisions

- Added actual card payment, fee, interest and refund commands using the existing profile/workspace locks, permanent normalized command receipts, immutable balanced journals, attributed private audit revisions, financial revision advancement and deferred database constraints. Identical retries replay before mutable-reference checks. Card commands require an actual evidence source, explicit provider confirmation and separate transaction/provider posting dates. Pending or speculative provider activity cannot be inferred from statement lines.
- A payment debits the selected card liability and credits one owned, same-currency cash/bank/wallet account with transfer classification. It creates no expense or income. Actual provider fees and interest debit gross expense and credit the card liability. Refunds debit the card liability and credit `refund_offset` expense; they never become ordinary income. Linked refund portions retain the original purchase postings/categories, bounded by both original posting capacity and the effective current purchase classification. Unlinked actual refunds require explicit classification rather than invented purchase links.
- Overpayment/refund credits derive from the existing credit-normal card ledger and are shown separately from positive outstanding liability. Card credits never increase liquid cash. Card activity records each nonzero net liability movement per revision/card; immutable typed detail separately preserves full provider evidence, including zero-money corrections. Existing financial review/correction/reversal flows support the new commands, including changes of paying account/card and retained archived references.
- Statement allocations bind one exact current verified statement revision to one exact current same-card payment/refund revision, with explicit user/provider confirmation, amount, date and evidence source. Partial allocations across statements and unapplied credits are supported. Global effective allocations cannot exceed their financial source or a positive statement balance. Allocation and reversal commands create no financial actions, journals or postings.
- Allocation history is append-only. One exact full reversal references the original allocation, preserves its original confirmation in the private before audit, and records a correction reason. Duplicate reversal, reversal of a reversal, foreign-card, unsupported, superseded and excess allocations are rejected. Financial or statement corrections invalidate allocations tied to superseded revisions without rewriting history; a fresh allocation requires fresh confirmation. The current statement page includes unresolved allocations from earlier statement revisions. No provider ordering or automatic reassignment is introduced.
- Remaining due uses exact effective supported allocation totals against the unchanged historical verified statement balance. Provider credit, excess credit and unresolved allocation amounts remain separate. A3 statement membership now accepts full signed recognized payment/fee/interest/refund evidence, preserving provider posting dates and exact historical revision associations. Unknown provider lines remain unresolved and never create financial commands. Recognized financial activity and allocation evidence remain distinct.
- Added strict, private, origin-checked `no-store` command/setup and allocation/reversal APIs under `/api/v1/credit-cards/[cardId]`, plus minimal accessible card-command and statement-allocation pages. Reviews show cash, spending, liability/card-credit effects and exact evidence. Forms freeze an uncertain command for identical retry, including subsequent authentication failures, prevent double submission and guard navigation. Ownership stays server controlled; missing/foreign evidence shares safe errors.
- The shared correction page retains the original card beyond its first 100 choices for all released card commands. Five real-form regressions cover purchases and every A4 kind with an original archived card outside that bounded list. This extends A2's existing reference-retention guarantee without broadening financial permissions.
- Expense history, provider-date filtering and signed posting reports include A4 classifications without multiplying posting facts. Reporting definitions advance to `v2-a4-posted-signed-cards-1` and `v2-a4-reports-signed-card-commands-1`; CSV schema remains 2. Payments remain outside spending and refunds offset their applicable category. No broad card-surface or visual redesign was added.

### Database and prerequisite decisions

- Forward-only migrations `0082_glamorous_gamma_corps.sql`, `0083_v2_a4_card_integrity.sql`, `0084_v2_a4_confirmation_guards.sql` and `0085_v2_a4_allocation_audit.sql` add `finance.card_action_detail`, `card_refund_part` and `card_statement_allocation`, scoped foreign keys, immutable parent guards, exact financial/receipt/audit/refund/allocation recipes and two security-invoker read views. The chain contains **86 migrations / 66 declarative tables**. All published migrations remain unchanged; applied local integrity fixes are new forward migrations.
- All three tables have enabled/forced owner RLS and active-profile/workspace predicates. `app_domain` receives SELECT/INSERT only; the separate lifecycle operator retains approved-scope SELECT/DELETE. Auth/queue/worker roles gain no card access. Catalog-driven approved purge includes the complete financial/allocation graph and preserves other owners.
- Only the four A4 recipes are released. Existing V1/A1/A2 balancing, classification, correction, authorization, command replay and root locking remain enforced; `opening_card` and `card_adjustment` remain gated. No dependency or lockfile change was needed.
- Extending signed statement links exposed an existing PL/pgSQL `OLD` alias collision. A forward migration replaces the SQL alias without weakening membership checks. Review also tightened original refund-posting capacity, current-or-explicitly-retained refund evidence, exact completed receipt/result proof and full allocation-reversal before audit.
- Structured snapshot comparison passed: exactly the three A4 tables are new, all previous 63 table definitions remain unchanged, and all four new snapshots agree. Malformed linked-refund amounts now produce validation issues before any `BigInt` calculation; focused regressions cover decimal, nonnumeric and oversized input.

### Actual verification

- Full unit/component regression: final **815 tests / 112 files passed** with `docker run --rm pmp-v2-a4-build pnpm test --maxWorkers=1 --pool=threads` in the pinned Linux build image, including the five bounded historical-card correction regressions. The preceding complete Linux run passed 810/810. New coverage includes strict exact card/refund inputs, canonical identifiers, safe validation of malformed linked amounts, origin/ownership/body-size/API boundaries, accessible review/focus and identical retries after uncertain/authentication failures. The initial Windows run passed 792/804 and timed out in twelve unchanged borrowing/job-application/transfer/debt-payment form tests; an isolated Windows retry was interrupted after repeat timeouts. All those original assertions and five-second limits passed unchanged in Linux. No acceptance assertion or timeout was weakened.
- `pnpm test:integration`: **493 tests / 61 files passed**, including all V1/A1/A2/A3 regressions. Focused A4 acceptance separately passed **32 tests**, including independently constructed valid/malformed runtime SQL recipes, exact reports, partial allocations across statements, global source capacity, full reversal audit, correction-safe refunds and allocations, linked/unknown signed statement evidence, independent connection replay/capacity races, RLS/spoofed scope, archive replay and actual approved graph purge preserving another owner. The earlier focused A2/A3/A4 run passed **61 tests** before additional A4 cases were added.
- `pnpm db:verify:chain`, `--upgrade`, `--upgrade-v1`, `--upgrade-a1`, `--upgrade-a2`, `--upgrade-a3`: all passed the **86-migration** fresh/no-op chain and **67/76/78/80/82 → 86** upgrades, preserving prior cash/history/report totals, A1 metadata, A2 purchase recognition and A3 verified statement evidence. Each common smoke records/replays a real payment, confirms/reverses a partial allocation, proves unchanged provider balance/exact due/cash reduction and purges the full evidence graph. The initial A4 smoke reused earlier V1 fixtures' acknowledged negative account; it now uses a dedicated funded account and asserts its exact remaining cash without bypassing the negative-balance guard. Hosted acceptance adds the A3 upgrade step.
- `pnpm db:generate`: no schema drift. `pnpm db:migrate:test`, `pnpm db:migrate` and `pnpm db:check:runtime`: passed; test/development now include all 86 migrations, restricted application/auth roles and transaction-local scope installation/cleanup remain verified.
- `pnpm check`: lint, generated Next route types, TypeScript and full-repository formatting passed. `pnpm audit --prod --audit-level high`: no known vulnerabilities found. Final documentation formatting and staged diff checks are performed before commit.
- `pnpm verify:restore`: isolated encrypted restore passed exact counts/balances, reporting, RLS, revoked credentials, independently approved scoped deletion and other-owner preservation.
- `pnpm build`: Windows production build passed, including TypeScript and all new private routes. Existing Windows standalone symlink `EPERM` warnings remain; the latest Linux production builds below verify the restricted production output.
- `PMP_BROWSER_CHANNEL=chrome pnpm test:browser`: final full production suite **33 passed**, covering actual committed payment response loss/identical retry, partial allocation and immutable reversal, exact unchanged statement balance/due, actual fee/interest/linked refund/overpayment, foreign-owner and spoofed-scope rejection, dark/light 320px reflow and axe, plus every existing V1/A1/A2/A3 browser regression. Both new dark mobile screenshots were visually inspected. The first full run passed 31/33: the new test tried to select a hidden desktop theme control at mobile width, and another ran axe before streamed main content was ready. Tests now use the actual mobile navigation theme control, wait for saved dark theme and visible page headings, and preserve all accessibility assertions and timeouts.
- `docker build --target build/web/worker/backup` with the corresponding `pmp-v2-a4-*` tags: all latest Linux images passed. A separate web artifact proof passed nonroot UID 1000, PostgreSQL driver/static assets and all three new API routes, with private environment files, migration scripts and development test tooling absent. `PMP_TEST_IMAGE_PREFIX=pmp-v2-a4 pnpm verify:containers`: passed restricted runtime roles, nonroot artifacts, health/private API boundaries, worker shutdown and fail-closed backup tooling. These are isolated verification artifacts, not a public deployment.
- Final whole-repository lint/type/format checks passed after the browser-test and bounded-picker changes. Structured snapshot and complete milestone diff review confirm the published migration chain, dependency/lockfile and unrelated surfaces remain unchanged. Documentation-only final edits are formatted and staged diff/secret checks run before the authorized Conventional Commit and non-force push.

### A5 prerequisites and milestone boundary

- The next milestone is **V2-A5 — Installment Plans**, only when explicitly assigned. It must use actual provider-confirmed schedules and immutable purchase/activity evidence, preserve original purchase recognition, and distinguish monthly installment due from new spending. Reuse the confirmed payment/refund allocation model; do not infer provider ordering or fabricate payment satisfaction.
- A5 must specify correction/replacement dependencies, exact remaining principal and schedule evidence before releasing any additional recipe. Preserve current-or-retained reference validation, RLS, lifecycle purge, workspace serialization, concurrent replay and reporting regression coverage.
- A6 comprehensive card integration, Shared Expenses, other V2 domains, V3 and the broad visual redesign remain outside A4. No A5 work or production deployment is included. Production infrastructure/sender/PITR/retention/monitoring acceptance remains deferred, not waived.

---

## 20. V2-A5 — Installment Plans

**Implementation date:** October 12, 2026 (Asia/Manila).

**Baseline:** clean `main`, `4cd15f5b32f69f9679bc528ceb60da616b673b2f`, fetched and verified equal to `origin/main`. The committed A1–A4 foundations and successful A4 hosted acceptance (run `38179195013`) were confirmed before implementation. Only the A5 requirements, A4 handoff, affected dependencies and installed Next route guide were reviewed.

**Acceptance:** completed and locally accepted; no A5 acceptance blocker remains. No A6 work or production deployment is included.

**Commit lookup:** the authorized milestone commit is `feat(finance): add v2-a5 provider installment plans` on `main`; resolve its SHA with `git log -1 --format=%H -- src/modules/finance/domain/card-installment.ts`. The completion report records the actual SHA, exact remote-head verification and hosted acceptance separately from local evidence.

### Implemented scope and decisions

- Provider installment arrangements attach to an existing recognized same-card purchase and its exact immutable revision. Regular purchases remain the simple default. Purchase history and card details expose optional expandable installment details; dedicated scoped pages support creation, provider revisions/cancellation, full schedule/history and explicit satisfaction confirmations. No purchase, payment, fee, interest or refund financial operation was rebuilt.
- A complete provider snapshot records 1–360 explicit lines, financed principal, optional due dates, principal/interest/fee/total amounts, provider references, verification source/date and notes. Line principal sums exactly to financed principal, which cannot exceed the originating recognized purchase. The full schedule includes already settled portions; entering only an unpaid balance and then subtracting confirmations again is unsupported. Partial financing is explicit, not inferred from the purchase amount or count.
- Unknown future dates, interest and fees remain null. Known dates follow provider order and cannot precede the purchase transaction. Provider totals agree with all known components, and exact totals are derived only when supported. Individual projected amounts use bounded PostgreSQL bigint and all calculations/sums use integer `BigInt`/SQL numeric, including amounts beyond JavaScript Number precision. Changing a count does not synthesize amounts or dates. The scoped plan endpoint permits up to 8 MiB for the bounded full UTF-8 schedule; other command body limits remain unchanged.
- Plans are scheduling/provider evidence, not another ledger. Plan/revision/application/reversal commands use active profile/workspace serialization, permanent normalized command replay, private before/after audit evidence, trusted attribution and deferred integrity constraints. They advance the existing workspace revision to invalidate stale read evidence, but create no financial actions, action revisions, journals or postings. A dedicated SQL gate forbids financial revisions under installment command receipts. Due dates never trigger financial commands or charges.
- One current provider-active arrangement is allowed per logical purchase. Finalized snapshots and lines are immutable. A provider revision/cancellation creates a new sequential snapshot with expected version, reason and full historical before/after evidence. Cancellation can preserve the prior purchase revision after its reversal or move to another card; the UI requires an explicit provider status rather than guessing cancellation. Original purchase corrections, reversals or card changes suspend projections until reconciled; a different card requires cancellation of the old arrangement and actual provider evidence for a new one.
- Each snapshot captures the immutable current heads of every refund ever linked to its purchase, including corrected-away or void heads. Any subsequent refund correction/reversal requires a fresh provider revision. This prevents old plans/applications from silently reactivating when a refund is reversed and restoring allocation capacity already reused elsewhere. These checkpoints are correction evidence, not fabricated provider transactions or refund allocations.
- Installment satisfaction is an append-only, explicitly provider/user-confirmed annotation of an existing effective A4 statement allocation. A payment or unapplied refund alone never satisfies a schedule automatically. Partial component splits are allowed; global applications cannot exceed the confirmed A4 allocation, target schedule principal/interest/fee/total or actual current A4 fee/interest charge evidence. Confirmation dates cannot precede source/allocation/charge evidence. Positive interest/fee portions require the exact recognized A4 charge; unknown future charges cannot be marked paid.
- One exact full reversal references an original application and preserves its immutable component/source/date evidence. Reversals of reversals and duplicate/excess/foreign-card applications are rejected. Superseded plans or corrected/reversed statements, allocations, payments and charges invalidate affected confirmations without rewriting history or automatically reassigning sources; fresh confirmations are required. Unresolved previous confirmations and unapplied actual credits remain explicit.
- Read models use scoped repeatable-read snapshots and bounded history/source pagination. Remaining principal and obligations subtract only currently eligible effective confirmations. Current workspace calendar date drives upcoming/overdue projections. Historical, cancelled or reconciliation-required snapshots expose no current remaining amounts/upcoming projections; full provider history remains readable. Actual card outstanding/credit and verified statement balances remain separate and unchanged by schedule management.
- Reused A4 review/frozen retry/navigation protection in a shared helper, with command-specific success identifiers. Accessible labels remain unique for retained forms; provider drafts are keyed to the purchase/provider revision so client navigation cannot carry another source's schedule fields. Review/error focus, uncertain identical retry after authentication failures, native progressive disclosure and responsive dark/light pages preserve the existing interaction standards.

### Database and security

- Forward migrations `0086_happy_ultimo.sql`, `0087_v2_a5_installment_integrity.sql` and `0088_v2_a5_refund_history.sql` add four tables: `card_installment_plan`, `card_installment_revision`, `card_installment`, `card_installment_application`. The chain contains **89 migrations / 70 declarative tables**. All published migrations remain unchanged; the refund-history fix is a new forward migration.
- Every new table has enabled/forced active-owner RLS, scoped foreign keys and finance root locking. Restricted application UPDATE grants apply only to protected root/snapshot finalization; lines and applications are append-only. Auth/queue/worker roles receive no new access. Both derived views use `security_invoker=true`; evidence functions retain invoker RLS and restricted grants. Approved lifecycle purge includes the complete immutable graph and preserves another owner.
- Independent runtime-role SQL tests prove valid evidence finalization and reject unfinished/forged audits, receipts/results, source attribution, counts, principal/totals/dates, duplicate active roots, snapshot rewrites, unsupported applications and inexact reversals. Failure rolls back evidence, audit, receipt and workspace revision together. No dependencies or lockfile changes were needed.

### Actual verification

- Focused A5 integration: **19 tests passed**, including exact unknown/large projections, financial/report nonduplication, independent SQL acceptance/rejection/rollback, concurrent retries/capacity/version races, purchase/card/refund corrections, explicit A4 payment/refund and actual-charge application/reversal, RLS/bypass/role checks, archive and approved owner-scoped purge. The refund reversal regression proves old confirmations cannot silently consume an allocation reused by another plan.
- Focused unit/component/API regression: **54 tests / 4 files passed**, including the existing A4 form tests, strict schedule/application inputs, exact parsing, spoofed actor/path rejection, origin/authentication, 360-line UTF-8 body limits, safe unavailable/conflict/uncertain responses, review focus and byte-identical retries. Additional projection guards reject negative or unsupported unknown-charge applications.
- `pnpm check`: lint, generated Next route types, TypeScript and full-repository formatting passed. `pnpm db:generate`: no schema drift. Test/development migrations and `pnpm db:check:runtime` passed with restricted roles and installed/cleared transaction-local scope. Production dependency audit reports no known vulnerabilities.
- Snapshot comparison proves exactly four new tables, all 66 prior declarative definitions unchanged and all three A5 snapshots identical except identity metadata. Migration/upgrade proofs are repeated against the final 89-migration chain and include A5 provider evidence, replay, manual A4 confirmation/reversal, cancellation and complete purge. Hosted acceptance adds the A4 baseline upgrade.
- Windows production build passed, including all new private routes; existing standalone symlink `EPERM` warnings remain. Focused production browser acceptance **2 passed**, covering committed response loss, identical retry, manual applications, revision history/cancellation, owner isolation, spoof rejection and reversed-purchase reconciliation. Dark/light 320px pages pass axe/reflow; both screenshots were visually inspected. The initial test's generic alert locator also matched Next's route announcer; it now targets the actual uncertain-command error.
- `PMP_BROWSER_CHANNEL=chrome pnpm test:browser`: full production regression **35 passed**, including every V1/A1–A4 browser case and the complete private API inventory. After adding purchase/provider revision keys, the final A5 browser run **2 passed** with an additional real client-link navigation assertion proving a different purchase starts a blank provider draft. The final focused unit/API/component run again passed **54/54**. Final Windows/Linux rebuilds, compiled-source artifact assertions and restricted container checks verify the current pages and validation code; documentation formatting and staged diff/secret checks precede the authorized non-force commit/push.
- Full Linux regressions passed: **863 unit/component tests / 115 files** with `docker run --rm pmp-v2-a5-build pnpm test --maxWorkers=1 --pool=threads`; **512 integration tests / 62 files** with `pnpm test:integration` inside the same pinned build image, connected directly to the isolated test database using temporary read-only credential mounts. Every V1/A1–A4 regression passed. The first Windows integration run passed 510/511; the unchanged V1 55-payment pagination test exceeded its original five-second limit and also timed out in a focused retry. Its original assertions and timeout passed unchanged in Linux. Temporary test credential files were removed and were never baked into an image.
- `pnpm db:verify:chain`, `--upgrade`, `--upgrade-v1`, `--upgrade-a1`, `--upgrade-a2`, `--upgrade-a3`, `--upgrade-a4`: all final proofs passed the **89-migration** fresh/no-op chain and **67/76/78/80/82/86 → 89** upgrades. Earlier 88-migration proofs also passed before the additional forward refund-history fix. Existing cash/history/report totals, card metadata, purchase recognition, verified statement balances and actual A4 allocation evidence are preserved.
- `pnpm verify:restore`: isolated encrypted restore passed exact counts/balances, reporting, RLS, revoked credentials, independently authorized scoped deletion and other-owner preservation. `docker build --target build/web/worker/backup` with `pmp-v2-a5-*` tags passed all pinned Linux builds. Web artifact assertions passed nonroot UID 1000, all six installment API routes, PostgreSQL/static assets and absence of private environments, test/migration tooling and temporary artifacts. `PMP_TEST_IMAGE_PREFIX=pmp-v2-a5 pnpm verify:containers` passed restricted runtime roles, health/private API boundaries, nonroot artifacts, worker shutdown and fail-closed backup tooling. These are isolated verification artifacts, not a public deployment.

### A6 prerequisites and milestone boundary

- A6 may integrate the accepted card/statement/installment read models into Dashboard, Reports, Agenda and reminder surfaces only when explicitly assigned. It must distinguish actual posted spending/liability/cash from provider schedules, current supported remaining obligations, unknown dates/charges and reconciliation-required history. Do not recognize the original purchase again or auto-post due installments/charges.
- Use `getCardInstallmentPlan` and `listCardInstallmentPlans` with trusted workspace/card scope. Preserve current-revision/source/refund checkpoints, explicit A4 confirmation dependencies, unknown amounts, pagination, owner isolation and scoped deletion. Reuse existing financial commands and statement allocations; never infer provider payment order or create allocations from statement lines.
- No A6 implementation, Shared Expenses, other V2 domains, V3 or broad redesign is included. Existing production infrastructure/sender/PITR/retention/monitoring acceptance remains deferred, not waived. Stop after accepted A5.
