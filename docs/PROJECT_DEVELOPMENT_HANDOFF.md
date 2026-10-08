# Project Development Handoff

**Project:** Personal Management Platform

**Repository:** `RAbnza/Personal-Management-Platform`

**Repository name status:** Tentative; do not treat it as the final product name.

**Handoff date:** October 9, 2026

**Current verified implementation `main` HEAD:** `4ac6e14d383dabedc5821b633150426123fd895d` — `fix(time): renew reminders when corrected payments reopen dues`

**HEAD continuity:** This document is committed immediately after that implementation commit in a documentation-only commit. Run `git rev-parse main` for the final branch tip; the implementation hash above is the exact code state verified by the gates recorded below.

---

## 1. Purpose of this handoff

This document is a continuation guide for future development chats/agents.

It records:

- the current implementation state of the repository;
- completed milestones and important invariants;
- the immediate next step;
- the remaining V1 plan;
- the planned V2 scope;
- the planned V3 scope;
- phase boundaries and quality gates;
- implementation rules that must remain consistent across future work.

This document **does not replace the authoritative project documentation**. Before making important product, architecture, database, or design decisions, inspect the current repository and the relevant authoritative files:

- `docs/PROJECT_VISION_AND_FEATURE_BLUEPRINT.md`
- `docs/SYSTEM_ARCHITECTURE.md`
- `docs/DATABASE_ARCHITECTURE.md`
- `docs/DESIGN_SYSTEM_AND_VISUAL_GUIDELINES.md`

Each document remains authoritative within its own domain. If this handoff conflicts with a current authoritative document, follow the authoritative document and update this handoff to match.

This handoff describes V1, V2, and V3 so future phase-specific chats can understand the full direction. **A chat assigned to one release phase must implement only that phase unless a narrowly required dependency is explicitly justified by the authoritative documentation.**

---

## 2. Development mode and non-negotiable working rules

Act as a senior full-stack engineer, software architect, database engineer, security reviewer, and technical mentor.

For every substantial task:

1. Inspect the current repository state first.
2. Read the relevant authoritative documentation before changing behavior.
3. Preserve established module boundaries, naming, database invariants, and UI conventions.
4. Preserve strict multi-user data isolation and server-owned authorization.
5. Preserve exact financial arithmetic and the balanced-journal model.
6. Prefer mature documented libraries already selected for the project.
7. Avoid premature microservices, needless abstractions, dependency bloat, or speculative future systems.
8. Implement complete vertical behavior: schema/invariants, repository/service/API, UI, validation, authorization, error handling, and tests as appropriate.
9. Do not mark a milestone complete from code inspection alone. Run the applicable verification.
10. Keep this handoff updated as milestones complete so the next phase chat can continue from the actual repository state.

### Phase isolation rule

When working on:

- **V1:** do not begin V2 or V3 features.
- **V2:** do not begin V3 features.
- **V3:** implement V3 only after verifying the actual V1/V2 state in the repository.

Later/selective ideas are not automatically in scope.

### UI rule during V1–V3 functional development

Preserve and extend the current documented design system and existing component conventions. Build new screens to a professional, usable, responsive standard, but **do not undertake a broad project-wide visual overhaul during these phase implementation chats**. Functional correctness, completeness, consistency, accessibility, and maintainability are the priority.

---

## 3. Current technology stack

Current documented/implemented stack includes:

- Next.js 16.3.8
- React 19.2.8
- TypeScript
- Tailwind CSS 4
- PostgreSQL 17
- Drizzle ORM 0.45.3
- Better Auth 1.7.7
- Zod 4.6.5
- React Hook Form 7.89.0
- `@hookform/resolvers` 5.9.1
- Vitest 4.1.11
- Testing Library
- jsdom
- Resend
- Radix primitives where required
- CVA
- clsx
- tailwind-merge
- Lucide React 1.52.0
- next-themes 0.4.6
- `@date-fns/tz` 1.5.0
- pnpm 12.9.1

Use the current `package.json`, lockfile, and `SYSTEM_ARCHITECTURE.md` as the real dependency authority.

Do not upgrade or replace sensitive dependencies merely because a newer version exists. Change a pinned architectural dependency only for a concrete project need and after checking migration/runtime impact.

---

## 4. Established architectural contracts

### 4.1 Application shape

- One Next.js application.
- Modular monolith.
- One transactional PostgreSQL database.
- PostgreSQL schemas are organizational/security boundaries, not microservices.
- Server Components for initial authenticated reads where appropriate.
- Client Components for interaction.
- React Hook Form + Zod for forms.
- Local component state for dialogs and transient UI state.
- Remote interactive state may use TanStack Query when the feature justifies it.
- Do not use localStorage as another authority for private business records or duplicated query state.

### 4.2 Authentication and ownership

- Better Auth owns authentication records.
- Every person has a separate sign-in identity.
- Every private workspace belongs to one authenticated owner.
- `ActorContext`/trusted server context owns `userId`, `workspaceId`, `sessionId`, and request identity.
- Browser input never supplies trusted ownership identifiers.
- Every private query/write must be scoped to the authenticated owner.
- RLS is defense-in-depth and must be tested through runtime roles.
- Cross-user references must fail without leaking the existence of another user's private record.

### 4.3 Financial invariants

These remain non-negotiable:

1. User, workspace, financial account, debt, group, and later card identities are distinct concepts.
2. Financial balances derive from immutable journal postings; there is no independently editable authoritative balance.
3. Financial writes are workspace-serialized and idempotent.
4. Every actual financial command must commit its journal/evidence atomically.
5. Planned/future records do not automatically create actual cash movement, expense, income, or liability.
6. Every actual cash receipt must identify the owned receiving financial account.
7. Money uses exact integer minor units/centavos and `bigint` semantics.
8. Income, spending, cash flow, principal repayment, recognized liability, and scheduled payable are separate meanings.
9. Corrections preserve evidence rather than silently rewriting posted economic history.
10. Generated agenda/calendar entries are projections of authoritative source records.
11. Provider names are data, not provider-specific schemas.
12. Account/workspace lifecycle behavior must preserve or deliberately purge evidence through reviewed procedures.

### 4.4 Financial command/retry behavior

- Financial commands use canonical client command IDs.
- Same command ID + same payload may safely replay.
- Same command ID + different payload must fail.
- An uncertain network/save outcome must not be represented as confirmed success.
- Retry the same unconfirmed financial command rather than creating a new economic action.

### 4.5 Date/time rules

- Financial effective dates are user-selected local accounting dates.
- Opening cutoff D means the baseline is through the end of D; normal activity begins after D.
- All-day dates remain calendar dates rather than UTC timestamps.
- Timed events preserve UTC instant plus the entered IANA timezone.
- DST ambiguity/nonexistence must be handled explicitly.

---

## 5. Current implementation status

The repository has completed **Financial Core Completion** within the documented V1 dependent-record restrictions. D6a debt integrity, D6b existing-debt import, D7 borrowing/net proceeds, D8a debt-payment database foundation, D8b payment workflow, D9 schedule revisions, D10 early debt settlement, D11 reconciliation and balance adjustments, and D12 financial corrections and V1 accounting cleanup are complete. **V1-C1 — Connected Dashboard** and **V1-C2 — Reports, Drilldowns, and CSV Exports** are complete. **V1-C3 — In-App Due and Reminder Controls** is the next milestone.

### 5.1 Completed foundation/UI infrastructure

Completed:

- Next.js frontend foundation and application shell.
- Theme support and documented design-system implementation.
- Authentication UI and flows.
- Email verification.
- Password reset/recovery.
- Workspace bootstrap.
- User/workspace preference APIs.
- Module preferences.
- Multi-user private workspace isolation.
- Progressive/resumable onboarding.
- Functional responsive UI for currently released modules.

Important commits:

- `db3030a00b2d42bf3ecf8b64bf8cc8124411e3f4` — `feat(ui): add frontend foundation and app shell`
- `81445dfa17d12c576529bc7a97ec4d79f800ddfe` — `feat(auth): add frontend authentication and workspace bootstrap`
- `d4dcd711846429da0851a8eefec15575849d8eeb` — `feat(onboarding): add resumable guided setup`

### 5.2 Completed Money first usable slice

Completed:

- financial accounts;
- opening balances;
- exact ledger-derived balances;
- income;
- expenses;
- exact category splits;
- completed internal transfers;
- transfer fees;
- account history;
- cursor pagination;
- ownership/isolation tests;
- financial idempotency/retry behavior.

Important commits:

- `c32752f0dfece2a642228ced91f4c619d4448f3c` — `feat(money): add financial account workflow`
- `b9811da498d8df7ab849db62189c775a748a318d` — `feat(money): add transaction entry workflow`
- `18b73e399edbaf29c9980bfd0dad59743316fdd7` — `feat(money): add split expense categories`
- `d7a90ed9930a1c2593bc2876e2d526bd6c958812` — `feat(money): add completed transfer workflow`
- `79efa7433a1d740648fd89bb13c6102c64e596cf` — `feat(money): add account history workflow`

Recent stability fix:

- `29599d79299270e55d48ecfe5a4d1beb70388bee` — `fix(money): stabilize expense split validation`

### 5.3 Completed Career and Agenda stage

Completed:

- job application attempts;
- application stages and outcomes;
- immutable/resolved stage history;
- application details;
- career events;
- actionable next-action semantics;
- reschedule/complete/cancel lifecycle;
- onboarding evidence for a real application plus a real scheduled next action;
- personal calendar events;
- source-driven Agenda projection;
- personal event detail/lifecycle;
- ownership/isolation;
- relevant tests.

Important commits:

- `7126c794f5500c3171c244d2e5d295399f762aa6` — `feat(career): add application tracking workflow`
- `e2301efe4c5844e8d97ea07d562ec17747787db1` — `feat(career): add application detail and event scheduling`
- `5dd2cb92cdaabd60ab6693a1778c51483b901ee9` — `feat(career): add event lifecycle and onboarding evidence`
- `78d59583787bda0ede72753d29d91f6b4b3ee8a6` — `feat(calendar): add agenda and personal events`
- `a46ea91ee5132468feaeabc1d9b124282445cd89` — `feat(calendar): add personal event lifecycle`

Career/Agenda is considered functionally complete for the current release stage.

### 5.4 Current Debt foundation — D6a complete

D6a milestone commit:

- `e01a375d51b5bca19db21b8013b92fd3c0d6d8aa` — `feat(money): add debt integrity foundation`

D6a introduced the database/integrity foundation for coherent-V1 debts.

Current debt structures include:

- `finance.debt`
- `finance.debt_action_link`
- `finance.debt_obligation`
- `finance.debt_schedule_version`
- `finance.scheduled_installment`

The finance ledger now recognizes the coherent-V1 debt ledger kinds needed by this foundation:

- `debt_liability`
- `payment_clearing_asset`

The initial debt financial action kind now enabled is:

- `opening_debt`

Important D6a behavior/invariants include:

- debt is an aggregate, not an editable balance;
- recognized debt is derived from liability postings;
- existing-debt import uses an opening cutoff;
- imported opening liability posts against opening equity;
- imported opening debt creates no present-period borrowing receipt, spending, or historical payment;
- debt liability ledger binding is validated;
- optional future clearing ledger binding is validated;
- finalized schedule versions and installments are immutable evidence;
- current schedule pointer is validated;
- `opening_satisfied_minor` represents historical schedule satisfaction only;
- newly originated debts cannot begin with opening-satisfied amounts;
- a debt cannot close while recognized liability remains;
- only one logical opening financial action may establish a debt's baseline;
- RLS and runtime-role tests cover the new debt structures.

Relevant migrations:

- `src/platform/db/migrations/0017_complex_marauders.sql`
- `src/platform/db/migrations/0018_d6a_debt_integrity.sql`
- `src/platform/db/migrations/0019_d6a_opening_baseline_identity.sql`

Relevant integration test:

- `tests/integration/debt-integrity.test.ts`

D6a and Finance regression tests were reported passing before the commit.

### 5.5 Existing-debt import and read model — D6b complete

Milestone commit: `9d9604ab2d459c7110aaff3ed99763346c36c137` — `feat(money): import existing debts with manual schedules`.

The import/read vertical slice is present in the repository:

- `src/modules/finance/services/import-existing-debt.ts` and `read-debts.ts`;
- `src/modules/finance/repositories/debt-import-repository.ts` and `debt-read-repository.ts`;
- `/api/v1/debts`, `/api/v1/debts/[debtId]`, `/money/debts`, `/money/debts/import`, and `/money/debts/[debtId]`;
- `src/components/money/debt-import-form.tsx`;
- migrations `0020_d6b_optional_manual_schedule.sql` and `0021_d6b_debt_agenda.sql`.

Existing debt import preserves the opening-cutoff recipe, historical manual schedules, separate recognized-liability/scheduled-payable read values, and active-schedule Agenda behavior. An empty manual schedule is valid when the provider supplies no due dates; do not invent dates.

### 5.6 New borrowing and net proceeds — D7 complete

Milestone commit: `8c0875298e6995c7a1cf0d302db179aafeae82c4` — `feat(money): add borrowing and net proceeds workflow`.

The borrowing vertical slice is present and was verified before continuing D8a:

- `src/modules/finance/domain/borrowing.ts`;
- `src/modules/finance/services/record-borrowing.ts`;
- `src/modules/finance/repositories/borrowing-repository.ts`;
- the existing debt API and `/money/debts/borrow`;
- `src/components/money/borrowing-create-form.tsx`;
- migrations `0022_d7_borrowing_integrity.sql` and `0023_d7_borrowing_action_kind.sql`.

The documented fee/net-proceeds recipes, debt liability posting, actual cash receipt, zero borrowing income, exact arithmetic, audit/idempotency, and workspace locking remain in place. D8a regression verification exposed malformed amount strings reaching `BigInt` inside Zod refinement. A narrow guard now lets schema validation reject those strings without throwing; seven unit regressions cover principal, cash, fee, contractual, and known-component amounts. D7 was not rebuilt.

### 5.7 Debt-payment database foundation — D8a complete

Verified implementation commit: `dc451c51374620198df0ad6befe366e3c2a09698` — `feat(money): add debt payment database foundation`.

D8a adds `src/platform/db/schema/debt-payments.ts`, exported through the existing schema index, with these six finance tables:

- `debt_payment`;
- `debt_payment_revision`;
- `payment_component`;
- `payment_due_allocation`;
- `schedule_allocation_map`;
- `payment_reclassification`.

The existing financial-action contract now includes `debt_payment` and `payment_reclassification`. Dedicated deferred validators preserve the existing opening-debt and borrowing recipes and the established action-revision/journal/audit/receipt protocol.

Verified database contracts:

- A logical payment has one financial action; revisions retain payment/action identity and same-debt ownership references.
- Accounting components and contractual due allocations are independent axes. Exact minor-unit sums enforce actual paid = contractual portion + external fee, component totals = actual paid, external-fee components = external fee, and due allocations + explicit unapplied = contractual portion.
- Payment creation validates the owned, active paying account, currency, cutoff, active debt, current finalized schedule context, and matching journal evidence. Corrections preserve historical context and use the existing replacement/void reversal model.
- Known liability reduction with unknown composition uses recognized unclassified liability. Unknown liability reduction uses the debt's clearing asset. New expenses require their documented classification/fee evidence; scheduled interest does not imply recognized liability.
- Reclassification consumes current clearing/advance evidence, cannot exceed its remaining amount, and cannot create another cash deduction. Replacement/void and payment corrections cannot leave stale effective classifications.
- Missing due dates remain compatible through an empty manual schedule and explicit unapplied contractual allocation.
- Schedule maps exhaust each original allocation/unapplied pool, retain stable obligation identity, and prevent duplicate, direct-plus-mapped, stale, cancelled, or excess satisfaction. Current effective unapplied amounts govern closure. Later schedule versions cannot hide actual payments in opening satisfaction.
- All six tables use FORCE RLS and the established owner/lifecycle scope. Runtime grants exclude evidence UPDATE/DELETE; append-only evidence, restricted invoker functions, and financial workspace locks are verified under direct SQL.

Migrations, in order:

1. `0024_d8a_payment_model.sql`: generated structural model.
2. `0025_d8a_payment_integrity.sql`: reviewed RLS, grants, append-only rules, locking, action recipes, and deferred aggregate validation.
3. `0026_d8a_payment_state_validation.sql`: follow-up correction of a PL/pgSQL record/alias collision exposed by PostgreSQL tests, effective-unapplied closure handling, and opening-satisfaction carry validation.
4. `0027_d8a_payment_context.sql`: active-debt creation and reclassification effective-date validation.

Applied migration files were preserved; fixes were added as follow-up migrations. All four were applied to the test database first. Development migrations were applied only after focused integrity tests, financial regressions, and the final verification gates passed.

Verification on October 8, 2026:

- `pnpm check`: passed ESLint, TypeScript, and formatting checks.
- `pnpm build`: passed.
- `pnpm test --maxWorkers=1`: 65 files / 339 tests passed. The initial default-concurrency run had resource-contention timeouts; the bounded-worker run passed without increasing test timeouts. The genuine borrowing validation defect was reproduced and fixed separately.
- `pnpm test:integration`: 42 files / 233 PostgreSQL tests passed, including 66 D8a integrity tests and affected debt/borrowing regressions.
- `pnpm db:verify:chain`: all 28 migrations passed on a fresh disposable database, including a repeat no-op migration run and D6b/D7/D8a smoke fixtures.
- `pnpm db:generate --name=d8a_schema_review`: no schema drift; no further migration generated.
- `pnpm db:migrate`: completed successfully against the development database after verification.

Direct SQL fixtures are in `tests/integration/helpers/debt-payment-fixture.ts`; D8a tests are in `tests/integration/debt-payment-integrity.test.ts`. `scripts/db/verify-migration-chain.ts` now includes a clearing payment, an external fee, reclassification without more cash, and exhaustive schedule mapping.

No unresolved D8a blocker remains. D8a left the payment service/API/UI for D8b, now completed below. User-facing reclassification, schedule-revision workflow, settlement, reconciliation, Dashboard/Reports, V2, and V3 remain later work. The schedule-map database foundation and tests do not constitute a released schedule-revision workflow.

### 5.8 Debt Payment Workflow — D8b complete

Verified implementation commit: `5f69a0e054705e8fc40dd7b572e3e26189a4eba0` — `feat(money): add debt payment workflow`.

D8a was verified before implementation: the working tree was clean at `47d24c524aa423b75859c6e431ddfb2b0146b888`, and 81 D8a/borrowing integrity and service tests passed. D7 and the D8a model/validators were preserved.

Released layers and routes:

- `src/modules/finance/domain/debt-payment.ts`: strict normalized payment intent, exact arithmetic, confirmation requirements, accounting certainty, and shared review calculations.
- `src/modules/finance/repositories/debt-payment-repository.ts`: owned account/debt resolution, current recognized component balances, lazy clearing binding, and one logical payment with its economic journal and typed evidence.
- `src/modules/finance/services/record-debt-payment.ts`: workspace lock, receipt/hash replay, current-snapshot and schedule checks, ownership/cutoff/currency validation, mandatory audit, finalization, and atomic receipt/revision completion.
- `src/modules/finance/services/get-debt-payment-setup.ts`: read-only REPEATABLE READ setup containing debt, due residuals, accounts, and categories from the same snapshot.
- `POST /api/v1/debts/[debtId]/payments`: authenticated same-origin mutation. The route supplies the debt ID; the body cannot inject debt/actor/workspace/request ownership or ledger IDs. `GET` on the same route supplies bounded retained payment revision history.
- `/money/debts/[debtId]/pay`, its loading state, and `src/components/money/debt-payment-form.tsx`: editable accounting/due sections, visible optional oldest-due-first proposal, explicit user/provider confirmation, exact review, negative-balance acknowledgement, definite rejection/stale refresh, and locked same-command recovery after an uncertain save.
- `src/components/money/debt-payment-history.tsx` and the existing debt detail page: current/superseded/void evidence, original accounting and due allocation details, provider/user confirmation metadata, recorded time in workspace timezone, and safe history pagination.
- Existing debt domain/repository/read services now expose current payment satisfaction, remaining dues, recognized liability components, clearing, and effective unapplied amounts. Account history labels the cash activity as a debt payment, separately from spending.
- `src/platform/http/debt-problem.ts` translates stale preview, financial reference, and business-rule failures into safe API problems using the existing conventions.

Payment behavior:

- Partial/full payments create one logical cash payment. Contractual and external-fee cash reporting legs belong to the same economic journal and sum to actual paid; they do not duplicate cash. Principal and previously recognized interest/fees reduce their existing liability component without a new expense.
- Known new interest, provider fees, penalties, and external fees are expensed exactly once. External fees are excluded from contractual satisfaction.
- Confirmed reduction with unknown composition reduces recognized unclassified liability. Partially known breakdowns retain their explicit known portions; unknown recognized reduction goes to clearing, never a guessed principal/interest percentage.
- Due allocation is independent of accounting. Its proposal is visible and unconfirmed until the user explicitly confirms the installment allocation and unapplied amount. Changing allocations or the reviewed snapshot revokes that confirmation. Provider confirmation is recorded as reported by the user, with confirmation details.
- No supplied dates means an empty schedule and an explicit unapplied contractual payment. No due date is invented. Extra amounts do not silently over-satisfy installments or force recognized debt below zero.
- The command binds the reviewed workspace financial revision and current schedule context. Commit rechecks residuals under the workspace lock. A competing new command conflicts on a stale review; same-key replay returns the original committed result before mutable-reference checks. Changed-payload key reuse conflicts.
- Negative tracked account balances require explicit acknowledgement of the actual payment; the audit stores the warning, acknowledgement, and before/after account balance evidence. An uncertain outcome keeps the exact command/payload in memory with fields locked for safe retry. No financial drafts or offline durability are claimed.

Migration `0028_d8b_current_payment_dues.sql` adds the invoker-security `finance.current_installment_due_v` and updates `time.agenda_v`. Remaining dues use opening satisfaction plus current direct allocations plus current mapped allocations, with each effective payment counted once. Replaced/void payment revisions are excluded from current dues; finalized original evidence remains in history. Paid/cancelled obligations stop appearing in Agenda. Payments never update `opening_satisfied_minor`.

Migration discipline was followed: generate/review custom migration and snapshot, apply to test first, focused integrity/workflow tests, affected/full regressions and gates, then development migration. Existing applied migration files were not edited.

Verification on October 8, 2026:

- `pnpm check`: ESLint, TypeScript and formatting passed.
- `pnpm build`: passed, including the new payment page and API route.
- `pnpm test --maxWorkers=1`: 69 files / 387 tests passed, including payment domain/API/form/history and account-history classification coverage.
- `pnpm test:integration`: 43 files / 252 PostgreSQL tests passed, including 19 D8b workflow tests and existing D8a/D7/D6b/Finance/Agenda regressions.
- `pnpm db:verify:chain`: all 29 migrations and a repeat no-op run passed on a fresh disposable database. D8b smoke commits a real payment, verifies one account-history cash effect, concurrent same-key replay, changed-payload conflict, competing stale previews, liability/dues/history, and Agenda.
- `pnpm db:generate --name=d8b_schema_review`: no schema drift; no additional migration generated.
- `pnpm db:migrate`: development migration applied successfully only after verification.
- `git diff --cached --check`: passed before the implementation commit.

`tests/integration/record-debt-payment.test.ts` covers the required PHP 1,000 principal + PHP 100 new interest + PHP 10 external fee recipe; already recognized PHP 1,100 + PHP 10 fee; partial/full/no-date payments; confirmed unclassified reduction; partial/fully unresolved clearing; new fees/penalties; exact replay/conflicts; real foreign debt/account/installment isolation; rollback with safe retry; negative-balance acknowledgement; 55-record history pagination; and current direct/mapped dues after replacement/void without changing opening satisfaction. The existing 66 D8a integrity tests remain passing.

No unresolved D8b blocker remains. User-facing payment correction/reclassification entry, D9 schedule revisions, early settlement, reconciliation, Dashboard/Reports, V2, and V3 remain outside this milestone. D8b reads already supported revision evidence correctly; it does not release a schedule-revision or settlement workflow.

### 5.9 Debt Schedule Revisions — D9 complete

Verified implementation commit: `038d387e1cab8096c5c6dcd729d1e6481dd59b40` — `feat(money): add versioned debt schedule revisions`.

Continuation verified clean `main` at `dcd53269e1caa2cd50351a72df89c64336c58aa9` and all 85 focused D8b workflow/D8a integrity tests before implementation. D9 reuses the immutable schedule/payment tables, workspace serialization, scoped transactions, command receipts, private audit, and current due/Agenda views.

Released behavior:

- `date_correction`, `renegotiation`, and `allocation_correction` commands create a new finalized immutable version with its immediate predecessor retained. Initial versions and settlement are not accepted revision commands.
- Surviving entries keep their `debt_obligation` identity and exact opening satisfaction. Genuine replacements receive new identities and explicit predecessor-obligation evidence in the command audit. An obligation cannot both survive and be replaced. Opening satisfaction cannot disappear into a replacement; later payments never change the opening baseline.
- Setup reads a single repeatable snapshot of debt versions, current terms, original payment allocation sources/unapplied pools, and their current targets. Each current nonvoid payment source must be mapped exactly once and in full to the new schedule or explicit unapplied funds. Historical allocations/maps remain immutable; mappings never use another mapping as their source.
- Shared exact preview validates same-debt identities, supported terms, exhaustive mappings, no duplicate paths, no oversatisfaction, and fully satisfied surviving obligations. Date correction preserves amounts and each source's target by stable obligation; allocation correction preserves dates/terms; renegotiation explicitly changes agreed terms.
- Atomic command claims/replays its receipt before stale/reference checks, checks expected **debt version**, schedule pointer and workspace financial revision, assembles entries/maps, finalizes the schedule, switches the debt pointer, advances aggregate/workspace versions, writes before/after audit and completes the receipt. Constraints and COMMIT must succeed before success is returned.
- Pure schedule/date changes create no financial posting. An explicitly provider-confirmed newly recognized interest/fee/penalty is a separate `debt_charge` action in the same transaction: expense debit, matching debt-liability credit, no cash. Fee charges include one capitalized `fee_component`. Scheduled future charges and already recognized amounts are not recognized again.
- Current satisfaction remains opening + current direct allocations + mapped older current payments through `current_installment_due_v`. Agenda automatically reads only the active finalized schedule and positive remaining dues. Stable source identities survive date changes; source debt version and schedule notification generation advance atomically. Paid/cancelled dues disappear from projections. External reminder dispatch remains a later Coherent V1 capability.

Layers released:

- Domain: `debt-schedule-revision.ts`, `debt-schedule-history.ts`; installment reads now include stable obligation identity and cancellation reason.
- Repository/service: `debt-schedule-repository.ts`, `get-debt-schedule-setup.ts`, `revise-debt-schedule.ts`, `read-debt-schedules.ts`; debt detail/history share one repeatable snapshot.
- API: authenticated same-origin `POST /api/v1/debts/:debtId/schedule-revisions`, owned paginated `GET` at the same path, typed stale-preview 409. The revision route uses a server-owned bounded 8 MiB transport allowance for up to 360 complete entries and 10,000 source maps; other APIs retain the existing 64 KiB default. Shared transport checks both declared and actual bytes.
- UI: `/money/debts/[debtId]/revise-schedule`, loading/error/reload behavior, review form and paginated immutable history. Review shows old/new dates, contractual/known terms, opening/payment carry, remaining, obligation replacements/cancellations, exact pool mappings, explicit unapplied total, Agenda impact and any separate noncash charge.
- Save stages retain a frozen reviewed snapshot and exact in-memory command. Lost/malformed responses keep editing locked and offer same-command retry; stale previews require a refreshed snapshot and renewed confirmation. No private payload is persisted in browser storage.

Migrations (test first, development only after verification):

- `0029_d9_schedule_charge_kind.sql`: generated structural release of the documented `debt_charge` action kind.
- `0030_d9_schedule_integrity.sql`: correction-term/identity checks, historical-opening retention, dedicated confirmed noncash-charge recipe and routing; existing FORCE RLS and immutable evidence guards continue to apply.
- `0031_d9_charge_fee_evidence.sql`: reviewed follow-up requiring affirmative provider evidence even for missing JSON fields and exact typed capitalized fee evidence. Applied migrations were not rewritten.

Verification:

- Focused D8b/D8a continuation baseline: 85 tests passed before implementation. Final affected D9/D8b/D8a run: 110 tests passed (25 D9 workflow/database tests).
- `pnpm test:integration`: 44 files / 277 real PostgreSQL tests passed. D9 covers due correction, renegotiated amounts/new identities, partial/full payment carry, opening baseline retention, current direct + older mapped satisfaction, no-date/unapplied mapping, mapping exhaustiveness/conflicts, stale versions, exact replay, immutable history/pagination, actual foreign-owner references, explicit interest/fee/penalty recognition without cash, and complete late-failure rollback.
- `pnpm test --maxWorkers=1`: 73 files / 428 tests passed, including 38 D9 contract/API/form/history tests (the supported 10,000 original pools included) and three shared bounded-transport regressions. The existing transaction-form test timed out once with simultaneous heavy gate jobs, then passed in isolation and in the complete suite without changing its timeout or implementation.
- `pnpm check`: lint, TypeScript and repository formatting passed. `pnpm build`: passed with the revision API/page and history read surface.
- `pnpm db:verify:chain`: 32 migrations and a no-op repeat passed on a fresh disposable database, including committed D9 same-key concurrent replay, competing stale previews, exact mappings, unchanged cash, preserved history and stable Agenda projections. Existing D6b/D7/D8a/D8b committed smoke remains passing.
- `pnpm db:generate --name=d9_drift_check`: no schema drift; no extra migration generated.
- Test migrations applied first; development migrations applied after focused/full PostgreSQL regressions and fresh-chain verification.
- Browser verification could not run because no browser surface was available (`iab` unavailable). Component tests verify the complete review/save/error/stale/safe-retry flow, frozen uncertain-save snapshot, explicit handling of removed mapping targets, and paginated history. No browser verification is claimed.
- `git diff --cached --check` passed before commit.

There is no D9 blocker. D9 stopped with D10 as the next assignment; D10 is completed below. User-facing financial payment correction/reclassification, reconciliation, Dashboard/Reports, V2 and V3 remain separate assignments.


### 5.10 D10 — Early Debt Settlement

D10 is complete and verified. Test migrations were applied first; development migrations were applied only after focused/full regressions and final verification.

The debt workflow now records explicit normal/early settlement through one financial action. Its optional payoff payment shares that action; noncash charges and waivers share its journal. It never forces a ledger balance to zero. Server preview and save both require zero residual in every recognized liability component, zero clearing, and complete confirmed contractual treatment.

Released behavior:

- Cash payoff, provider-confirmed payoff, recognized liability repayment, newly recognized interest/fee/penalty, eligible recognized-cost waiver, disclosed imported-opening waiver and avoided future unrecognized charges remain separate. Principal repayment creates no spending; an already recognized charge is not expensed again. External fees are separate expense/cash reporting legs within one actual account deduction and do not satisfy dues.
- Known-cost waivers use identified eligible current charge evidence and the same expense ledger/category with `waiver_offset`. Imported opening components without a recorded eligible cost use explicitly disclosed `adjustment_equity`; opening source capacity is verified. No income or fictional cash receipt is created.
- Explicit rounding corrections require a confirmed charge/waiver treatment and source/explanation; there is no automatic residual plug. Avoided future charges have no postings, including when no due dates were supplied. An already fully paid debt can close normally without another payment or zero-value journal.
- A new immutable settlement schedule retains all obligations, dates, contractual components, notes, opening satisfaction and historical payment satisfaction. Only unpaid remainders are cancelled. Original payment source pools map exhaustively exactly once into the closing version; no payment is counted twice. Old schedules, mappings and payments remain unchanged.
- Closing unapplied pools accepted as final payoff require an explicit resolution note and exact typed resolved total. This supports debts without supplied dates and preserves original unapplied evidence without manufacturing dates. It cannot resolve accounting clearing/advances. Current unresolved-unapplied totals subtract only the verified current settlement disposition.
- Debt pointer/lifecycle/closed timestamp/version, financial revision, one command receipt, action/payment/adjustment evidence, closing version and before/after schedule audit commit atomically. Confirmed normal/early kind maps to `settled`/`settled_early`; no provider payoff calculator or date heuristic is introduced. Current Agenda excludes the settled debt's unpaid projections while history remains available.
- Expected debt version, schedule pointer and workspace financial revision reject stale previews. Replay occurs before mutable checks and recovers the original result. Changed payload conflicts, foreign-owner references, unmatched source evidence, negative balance without acknowledgement and late failures cannot commit partial effects.

Modules and routes:

- `domain/debt-settlement.ts`, `schema/debt-settlements.ts`, `repositories/debt-settlement-repository.ts`, `services/settle-debt.ts`; the payment repository reuses its existing one-action recipe for the settlement kind. Current debt/schedule reads include the settlement disposition/history.
- `POST /api/v1/debts/[debtId]/settlement/preview` is a read-only server validation of the exact proposed command. `POST .../settlement` saves atomically; `GET .../settlement` reads the owned settlement with its financial snapshot. Strict owner-bound inputs, same-origin mutation guard, no-store responses and bounded full-pool transport remain in force.
- `/money/debts/[debtId]/settle`, loading/setup error states, `DebtSettlementForm`, `DebtSettlementHistory`, debt detail action and cancellation reasons. Review shows account balances, actual cash, all financial components, contractual allocations, source-pool mappings, old/closing schedule and reminder cancellation before final save.
- Editing revokes contractual/negative-balance confirmation. Oldest-due-first is a visible proposal requiring explicit confirmation. Review retains a copied setup snapshot and frozen exact command; uncertain responses lock editing and permit identical retry, even if page props refresh. Navigation/unload guards protect the retained in-memory retry. No private command is stored in browser storage. A stale snapshot requires reload/review.

Migrations, applied to test first:

- `0032_d10_settlement_model.sql`: generated settlement/component tables, scoped same-action/debt/payment/schedule/posting FKs and release of `debt_settlement`.
- `0033_d10_settlement_integrity.sql`: FORCE owner RLS, append-only evidence, workspace serialization, shared payment routing, exact settlement recipe, closing history, zero-residual/clearing and resolved-pool guards, narrow journal-free closure support.
- `0034_d10_settlement_final_state.sql` and `0035_d10_settlement_component_scope.sql`: follow-up fixes for implicit trigger-record/SQL-alias collisions exposed by focused PostgreSQL tests; applied SQL was not rewritten.
- `0036_d10_rounding_treatment.sql`, `0037_d10_settlement_evidence.sql`, `0038_d10_settlement_checks.sql`: explicit supported rounding, affirmative exact audit intent, eligible source capacities, retained payment satisfaction, and NULL-safe evidence/amount checks.
- `0039_d10_confirmed_avoided_charges.sql`: confirmed avoided-charge metadata also works without supplied dates; it creates no postings or liability resolution.

Verification:

- D9 continuation baseline: all 25 schedule-revision integration tests passed before implementation.
- Focused settlement integration: 29 tests passed, including both canonical 6,400/6,000 cases, previously recognized costs, new interest/fee/penalty, external fee exclusion, partial/full/zero cash payoff, no dates, historical unapplied pools, opening satisfaction, normal/early lifecycle, clearing/residual rejection, source/owner isolation, replay/conflicts, rollback, immutable history, duplicate cash rejection, provider-audit evidence and NULL-safe pool disposition.
- D8b/D9 affected regressions passed during implementation. Settlement domain/API/component checks cover explicit confirmation, exact arithmetic, clearing/mismatch rejection, server validation, safe problems, review, uncertain retry/navigation, frozen refreshed-prop behavior and history rendering.
- `pnpm test --maxWorkers=1`: 76 files / 488 unit/component tests passed, including 60 new settlement contract/API/form/history checks. The review snapshot remains unchanged through refreshed props and uncertain-save retry.
- `pnpm test:integration`: 45 files / 306 real PostgreSQL tests passed, including all D8a/D8b/D9 regressions and 29 D10 tests.
- `pnpm check`: lint, TypeScript and repository formatting passed. `pnpm build`: passed with settlement API/preview/page and debt detail/history.
- `pnpm db:verify:chain`: 40 migrations and a no-op repeat passed on an empty disposable database, retaining all committed D6b/D7/D8a/D8b/D9 smoke and adding D10 committed preview/closure, exactly one account entry/deduction, retained payment/schedule history, Agenda cleanup, resolved unapplied pools, concurrent same-command replay and competing stale-version commands.
- `pnpm db:generate --name=d10_drift_check`: no schema changes; no extra migration generated.
- `pnpm db:migrate`: development migration applied after the complete verified test sequence.
- Browser surface remained unavailable from the D9 environment check; no browser verification is claimed. Component tests cover the settlement review, stale/error/loading, uncertain response, navigation/unload protection, frozen snapshot, identical retry and history flows.
- `git diff --cached --check` passed before the implementation commit. One trailing blank line was normalized during final whitespace review without changing SQL behavior; integrity fixes remain follow-up migrations.

D10 stopped with D11 as the next assignment; D11 and D12 are completed below. Dashboard/Reports, V2/V3 and broad redesign remain separate work.

---

### 5.11 D11 — Reconciliation and Balance Adjustments

D11 is complete and verified. D10 was verified before implementation. Test migrations were applied first; development migrations were applied only after the focused tests, full regressions, repository gates, and fresh-chain verification passed.

Released behavior:

- An immutable comparison records the owned financial account, end-of-day cutoff, signed observed/provider balance, exact calculated tracked balance, derived observed-minus-calculated difference, workspace financial revision, cutoff source version, optional provider/statement reference, notes, actor/request attribution and optional same-account predecessor. A new comparison supersedes evidence without editing it. Matches and differences create only a command receipt and audit evidence; they create no financial action/posting and do not advance the financial revision.
- `source_journal_count` is an additional exact temporal source version. The account's posted journal identities and their postings are immutable and cannot disappear; the existing account/history binding preserves its cash ledger. All posted original, reversal and replacement legs count at or before the cutoff. This detects even a net-zero backdated correction. Current status is derived as `verified`, `difference`, `needs_review` or `superseded`, with a separate review flag. Later-dated or other-account activity does not falsely invalidate an unchanged cutoff comparison. No mutable verified flag or background invalidation job is required.
- Balance adjustments are explicit financial actions. A bounded nonzero signed cash movement has exactly one cash posting (`adjustment` flow/direction) and an equal opposite adjustment-equity posting; neither is income or spending. Reason/date are required. The optional reconciliation link is constrained to the same workspace/account, must be current rather than superseded/stale, and must have a cutoff affected by the chosen date. A partial adjustment is allowed and the remaining comparison difference is previewed exactly. A standalone explicit adjustment is also supported.
- The original comparison becomes needing review after an affected adjustment; saving an adjustment does not silently manufacture a new verified observation. The user compares again to verify the result. Archived accounts can be compared/read, but reject ordinary adjustments until restored. Adjustments are after the opening cutoff; changing opening evidence remains a correction workflow. Negative balances at the effective date or currently require retained explicit acknowledgement.
- Workspace serialization, expected financial revision/account version, scoped references, immutable typed evidence, exact deferred posting/audit validation, mandatory command receipts, and one atomic financial revision increment protect adjustment saves. Same-command replay recovers the original immutable result before mutable checks; changed payload conflicts. Foreign references, stale comparisons and late failures cannot commit partial effects.

Layers and routes:

- `domain/reconciliation.ts`, `schema/reconciliation.ts`, `repositories/reconciliation-repository.ts`, `services/reconcile-account.ts`, and `platform/http/account-reconciliation.ts` implement contracts, cutoff balances, immutable comparisons, current history/statuses, adjustment history, previews, and commands. The existing settlement adjustment-equity resolver was extracted unchanged into `adjustment-equity-repository.ts` and reused; D10 behavior remains verified.
- `GET /api/v1/accounts/[accountId]/reconciliations` reads one owned account/source/history snapshot. `POST .../reconciliations/preview` and `POST .../adjustments/preview` validate read-only snapshots. `POST .../reconciliations` records evidence; `POST .../adjustments` posts an explicit action. Same-origin guards, server-bound actor/account scope, strict bodies, bounded JSON, no-store responses and masked problems remain in force.
- `/money/accounts/[accountId]/reconcile`, loading/setup error states, account-list navigation, account-history adjustment labels, `AccountReconciliationForm` and `ReconciliationHistory` provide the workflow. Review shows exact balances/difference/date/reference/notes or cash/equity effects, linked comparison, residual difference, reason and negative-balance acknowledgement before final confirmation. History includes investigation links, immutable supersession and linked/standalone adjustments.
- The form freezes the complete setup and exact command in memory. Uncertain network/server/malformed-success outcomes lock editing and retain identical retry even through refreshed props. Request timeout and navigation/unload protection preserve the retry path. Freshness conflicts require reload/review. Potentially outdated history badges are hidden after a save, uncertain outcome or changed source snapshot until current history loads. No private command is stored in browser storage. Command-result previews are original reviewed evidence; current reconciliation status comes from the history read model.

Migrations:

- `0040_d11_reconciliation.sql`: generated comparison and adjustment tables, signed/bounded values, scoped account/receipt/action/revision/reconciliation FKs, indexes/uniqueness, and release of `balance_adjustment`.
- `0041_d11_reconciliation_integrity.sql`: FORCE owner RLS, append-only grants/triggers, same-account predecessor binding, serialized exact snapshot capture, immutable audit requirements, linked-comparison validation and the dedicated exact two-posting cash/equity recipe. Previously applied SQL was not rewritten.

Verification:

- D10 continuation baseline: all 29 settlement integration tests passed before implementation.
- Focused D11 integration: 20 PostgreSQL tests passed, covering matched/positive/negative comparisons, no automatic posting, positive/negative and partial explicit adjustments, source/cutoff accuracy, later-dated/other-account immunity, backdated and net-zero reversal/replacement invalidation, immutable/superseded evidence, stale versions/links, foreign-owner RLS isolation, replay/changed payload, rollback/retry, forged snapshot rejection, duplicate cash rejection, and account-list/history/report-classification consistency.
- New domain/API/component coverage: 48 tests passed, including exact signed integer/decimal validation, ownership/origin boundaries, masked problems, exact review, matched evidence without a transaction, explicit equity effects, loading/errors/stale state, frozen refreshed props, uncertain response, identical retry and navigation/unload protection.
- `pnpm test --maxWorkers=1`: 79 files / 536 unit/component tests passed.
- `pnpm test:integration`: 46 files / 326 PostgreSQL tests passed, retaining D8a/D8b/D9/D10 and account-history regressions.
- `pnpm check`: lint, TypeScript and repository formatting passed. `pnpm build`: passed with all reconciliation/adjustment API, preview and page routes.
- `pnpm db:verify:chain`: 42 migrations and a no-op repeat passed on an empty disposable database. All D6b through D10 committed smoke remains; D11 adds committed preview/comparison, no automatic adjustment, cash/equity effect, cutoff invalidation, history consistency, concurrent same-command replay and competing stale-version commands.
- `pnpm db:generate --name=d11_drift_check`: no schema changes or extra migration. `pnpm db:migrate`: development migrations applied after verification.
- `git diff --cached --check` passed before the implementation commit. Browser surface remains unavailable; no browser QA is claimed. Component tests and production build verify the released UI behavior.

D11 stopped with D12 as the next assignment; D12 is completed below. Full Dashboard/Reports, V2/V3 and broad redesign remain separate work. No D11 blocker remains.

---

### 5.12 D12 — Financial Corrections and V1 Accounting Cleanup

D12 is complete and verified within the documented V1 dependent-record restrictions. D11 was verified first with its 20 PostgreSQL tests from the clean, synchronized `main` continuation (`bdc6199640df72e26f813c64fd07d3e636470c32`, D11 implementation `aea675049cc5dc246b97d5a099b66e4ccfa68dd2`). Test migrations preceded focused tests, financial regressions and repository gates; development migrations were applied only after the final verification below.

Released accounting behavior:

- Explicit economic corrections retain one logical financial action, require a reason and expected action/workspace financial revisions, reverse only the immediately previous economic journals at their original effective dates, and post replacement economics at the corrected dates. Original evidence, typed details, exact reversal links and reporting classifications remain immutable. Reversals preserve each expense/income/cash-flow/liability class and direction while negating the signed amount. Original plus reversal plus replacement postings determine balances and historical periods; current logical-action views count a correction as a revision rather than another purchase/payment.
- Supported replacement contracts cover income, cash expense/category splits, transfer/fees, active-debt borrowing, debt opening components, provider-confirmed debt charges, debt payments/accounting and contractual allocation, refunds, payment reclassification, opening cash amount and balance adjustments. Archived accounts remain usable for historical corrections. A previously used archived category can be retained; ordinary new activity still rejects it. Opening corrections retain the same account/debt and coverage cutoff; no command silently rebases coverage or writes later payments into `opening_satisfied_minor`.
- Payment corrections retain the stable `debt_payment` identity with a new payment revision. A correction or reversal of a payment already mapped into a newer schedule creates a new immutable allocation-correction version with unchanged obligation identities, dates, terms and opening satisfaction, rebuilt original-pool maps, atomic pointer/version/audit changes and current Agenda projections. Old schedules/maps and payment evidence remain intact. Replayed commands return the same response and create neither another schedule nor another cash deduction. Metadata-only mapped-payment edits are rejected as unnecessary financial corrections.
- Provider-confirmed later clearing/advance classification creates a separate linked `payment_reclassification` action on its actual confirmation date. It debits confirmed recognized liability and/or newly recognized costs and credits the original clearing component, with **zero cash postings**. Known newly recognized fees retain typed fee evidence and the original payment-account provenance. Erroneous classification can itself use reversal/replacement; active linked classifications must be explicitly resolved before correcting the source payment.
- Genuine refunds are released for current cash purchases and explicitly recognized fee portions of released actions. They preserve the purchase, use the actual refund date and selected owned receiving account, and credit `refund_offset` expense rather than income. Purchase and fee refunds are separately allocated to immutable original postings. Limits cover each original posting and the current corrected purchase/category/fee budget; workspace serialization prevents cumulative over-refunds. Compatible source corrections preserve original refund references. Incompatible amount/category changes are rejected until dependent refunds are explicitly reversed/corrected, as permitted by DATABASE_ARCHITECTURE sections 5.2 and 6.1. No financed-purchase/card/cashback feature was introduced.
- Income, expense and transfer commands now carry durable `acknowledgeNegativeBalance`, complementing debt payment, settlement and adjustment evidence. Default/missing acknowledgement is false; a negative projection requires explicit true. Service review checks all affected historical dates, including removed accounts and the gap when an earlier receipt moves later. Immutable audit evidence records acknowledgement and exact warning facts; a deferred database guard also requires acknowledgement for negative results. Signed negative balances remain allowed. Pre-D12 manual-command replay remains compatible when acknowledgement was absent; changing acknowledgement to true changes command intent.
- Backdated corrections invalidate affected D11 comparisons through the existing immutable source-count design, including net-zero reversal/replacement. Adjustment corrections retain an original same-account reconciliation link when appropriate; moving accounts explicitly detaches it without erasing the historical link. Unexplained adjustment equity never becomes income.
- An owned Career application reached through Agenda remains accessible when Career is hidden and displays the hidden-module cue. Authentication, owned-source lookup and unavailable/foreign-source rejection remain active. Agenda links and Personal/Money source behavior already satisfied the contract and were preserved.

Layers and routes:

- `domain/manual-financial-action.ts` shares the existing manual-action schemas with the durable acknowledgement field; `domain/financial-correction.ts` defines strict replacement, reversal, refund, clearing-resolution, expected-version and result contracts. Existing typed writers are reused through an internal correction context that cannot come from an HTTP body.
- `financial-correction-repository.ts`, `negative-balance-repository.ts`, `refund-repository.ts`, `correct-financial-action.ts`, `record-refund.ts`, `resolve-payment-clearing.ts` and `list-financial-actions.ts` implement transactional commands, exact cash/date reviews, immutable revisions/audits, current source capacities and logical/history reads. Existing income/expense/transfer/borrowing/payment/adjustment writers and account-history queries were extended rather than replaced by an arbitrary journal writer.
- `GET /api/v1/financial-actions/[actionId]`, `POST .../corrections`, `POST .../reversals`, `POST /api/v1/refunds`, and `POST /api/v1/payment-reclassifications` use server-owned actors, same-origin writes, strict scoped schemas, no-store responses, stale/idempotency conflicts, definite business-rule rejections and masked unexpected errors. The existing financial-actions create route also accepts refund and manual acknowledgement contracts.
- `/money/actions` lists the latest 100 logical actions; `/money/actions/[actionId]` exposes current evidence, correction/refund/clearing review and retained revision history. Account and payment history link to the owned action. Account history uses each revision's audit description/reference, preserving historical presentation after a correction.
- `FinancialActionReviewForm` uses structured account/date/category/fee/component/due/refund fields, before-and-after accounting/current allocations, exact cash effects, required reasons and separate final confirmation. Negative-balance acknowledgement is explicit and revoked on intent edits. Original allocations can be proposed into the current schedule but remain visible and require confirmation. Provider facts for charge/classification are disclosed for confirmation.
- Review snapshots and commands stay copied in memory, including account/category setup. Saving, uncertain network/server/malformed-success outcomes and refreshed props retain an identical retry; editing/navigation is guarded, with a 20-second request bound and duplicate-click protection. Stale previews require reload. Manual transaction/transfer forms also persist acknowledgement and retain safe retry. No private command is written to browser storage. Loading, unavailable and error states are included; broad visual redesign was not undertaken.

Migrations:

- `0042_d12_refunds.sql`: generated refund evidence, revision/source/destination/posting scoped FKs, exact positive bounds and uniqueness.
- `0043_d12_correction_refund_integrity.sql`: FORCE owner RLS and append-only grants/triggers, exact refund recipes/cumulative capacities, correction-compatible borrowing/adjustment/charge recipes, durable negative acknowledgement and liability over-repayment rejection. Existing exact signed reversal validators remain active.
- `0044_d12_refund_action_kind.sql` activates the refund kind; `0045_d12_baseline_corrections.sql` permits exact opening-debt replacements; `0046_d12_historical_negative_review.sql` checks affected historical periods.
- `0047_d12_resolution_evidence.sql` is an applied no-op placeholder retained unchanged. `0048_d12_clearing_fee_and_linked_correction.sql` implements the intended clearing fee evidence and original linked-adjustment correction behavior. Applied migrations were not rewritten; follow-ups carried fixes.
- `0049_d12_refund_portion_limits.sql` adds immutable original-posting cumulative refund limits and resolved-fee original-account provenance. `0050_d12_refund_evidence_indexes.sql` adds immutable timestamps, scoped allocation identity and source/destination lookup indexes. The final chain has **51 migrations / 49 tables**.

Verification:

- D11 continuation baseline: 20 PostgreSQL reconciliation tests passed before implementation.
- Focused D12 integration: 18 tests passed, covering backdated correction/negative historical gap, category splits, retained archived category/new-use rejection, corrected transfer/borrowing fees, later purchase/fee refunds and limits, compatible refund/source correction, dependency rollback, stable payment identity, post-D9 map rebuilding/reversal/replay, explicit reversal, opening-balance invalidation, adjustment equity, clearing resolution and corrected fee with zero additional cash, stale/changed-payload replay and real foreign-owner isolation. The final account-history companion run passed 20 tests across two files.
- `pnpm test --maxWorkers=2 --testTimeout=20000`: **82 files / 554 unit/component tests passed**. The first unconstrained run suffered widespread worker-contention timeouts; two workers removed those failures except the existing expensive borrowing-form cases, which passed with the bounded per-test allowance. No timeout was changed in repository configuration. After the final preview/snapshot edits, the four affected component files passed all 20 tests.
- `pnpm test:integration`: final **47 files / 344 PostgreSQL tests passed**, including D8a/D8b/D9/D10/D11, recipes, RLS, rollback, account/history and reporting-classification regressions.
- `pnpm check`: lint, TypeScript and repository formatting passed. `pnpm build`: passed with all new correction/refund/classification API and page routes.
- `pnpm db:generate --name=d12_verified_drift`: no schema changes or extra migration. `pnpm db:verify:chain`: **51 migrations and a no-op repeat** passed on an empty disposable database, retaining all D6b-D11 committed smoke and adding committed D12 correction/refund signed history, current logical identity, concurrent replay, changed-payload conflicts and owner isolation.
- `pnpm db:migrate`: verified development migrations applied after the gates. `git -c core.whitespace=-blank-at-eof diff --cached --check` passed; the already-applied 0048 migration's extra final blank line was retained rather than changing its checksum. No interactive browser QA is claimed; component tests and the production build verified the UI.

Documented dependent-record restrictions remain visible in the read model/UI and reject commands before changing evidence: borrowing-origin reversal, corrections/reversals under a finalized debt settlement/closing schedule, incompatible refund source/category changes, and source payments with active linked clearing resolutions. This milestone does not introduce grouped multi-action dependent settlement reopening or a coverage-rebaselining workflow. These restrictions preserve released immutable accounting and closure rather than automatically reopening or forcing a balance to zero.

D12 stopped with V1-C1 as its next assignment; V1-C1 is completed below. Full Reports, V2/V3 and broad visual redesign remain separate assignments.

### 5.13 V1-C1 — Connected Dashboard

Verified implementation commit: `91624010767254461297f55eff238aa260ab07df` — `feat(dashboard): connect source-backed attention and summaries`.

V1-C1 is complete. Work continued from clean, synchronized `main` at `c92ab018f7b4c6bbf4f1de83c57744937b7cbc22` (D12 implementation `f536c019622d25a239098286e7fb81e343a932bb`). D12 was verified first with all 18 financial-correction PostgreSQL tests. Review was limited to the authoritative Dashboard, reporting, snapshot, coverage and design sections needed for this milestone.

Released behavior:

- `/` is now the connected, attention-first Dashboard. It reads tracked liquid accounts, outstanding recognized liabilities, selected-period gross/offset/net spending, current contractual dues, active Career applications, upcoming interviews/assessments/follow-ups, mixed Agenda, reconciliation/incomplete-information attention, current logical activity and useful quick actions from authoritative server records.
- `src/modules/dashboard` owns the Dashboard service/repository and `GET /api/v1/dashboard` exposes the same trusted-actor query. Browser ownership identifiers, duplicate parameters and unsupported filters are rejected. Authentication, source failures and unavailable data never become invented zero totals; responses are private/no-store.
- Dashboard queries run in one read-only `REPEATABLE READ` domain transaction. `src/modules/reporting` contains shared period/context/spending definitions for later reuse: workspace week start, week/month/calendar-quarter/year/custom periods, half-open effective-date boundaries, currency, timezone, definition version, financial revision, generation time and coverage. Custom ranges are inclusive in the UI and limited to 366 days. Timed Career/Agenda sources use workspace-timezone UTC boundaries. Agenda's transaction-local date now uses `transaction_timestamp()` so it shares the snapshot date.
- Exact sums use posted signed evidence, retaining original/reversal/replacement legs in the correct effective periods. Refund/rebate/waiver offsets are separate from gross spending. Opening cash is baseline evidence; transfers, principal, available credit, clearing and adjustments are not spending. Financial activity counts each current logical action once. Clearing is excluded from liquid funds and tracked net position; recognized debt credit balances, incomplete breakdowns, missing schedules and opening cutoffs remain explicit. Negative and archived cash accounts remain in balances.
- Current due totals use `finance.current_installment_due_v`, including opening satisfaction, direct payments and mapped payments. Contractual payable is displayed separately from recognized liability. Missing active schedules remain unknown even when recognized liability is zero. Overdue debts, unresolved clearing, unapplied contractual pools, negative cash, stale/difference reconciliations and scheduled Career/Time attention link to their supporting sources.
- `DashboardView` uses existing shell, panels, tokens and Agenda components. `DashboardFilters` only navigates server-owned period/source filters; client components contain no money formulas. Responsive layouts include loading, empty, invalid-filter, source-error and pending states. Supporting account/debt/application/event lists and metric links expose source evidence. Hidden modules remain navigation preferences; owned account history now opens from Dashboard with a hidden-module cue, consistent with D12 source-link behavior.
- `/dashboard/spending` is a narrowly required signed-contribution drilldown for the exact selected dates. It preserves correction/refund classification, category splits, revision evidence, source links, coverage and deterministic 100-row pagination while its summary covers the entire period. This does not release the complete Reports module or CSV exports.

Verification:

- Full unit/component/API gate: **86 files, 581 tests passed** (`pnpm test --maxWorkers=2 --testTimeout=20000`). The 27 new tests cover calendar boundaries/invalid inputs, trusted ownership, snapshot options, exact values beyond JavaScript number precision, separate liability credit/clearing, attention order, supporting navigation, hidden modules, filters, loading and safe source errors.
- Full PostgreSQL/runtime-role integration gate: **48 files, 353 tests passed** (`pnpm test:integration`). The nine Dashboard cases cover the documented PHP 36,915 closing-cash / PHP 13,085 recognized-liability fixture, fee/principal/transfer semantics, actual current due allocations, correction/category/refund periods, current logical activity, unknown schedule/clearing coverage, backdated reconciliation invalidation, Career/Agenda source filters, timed timezone boundaries, pagination and foreign-workspace isolation.
- Production browser gate: **3 tests passed** (`$env:PMP_BROWSER_CHANNEL='msedge'; pnpm test:browser`) against an isolated production server on localhost:3100 and guarded test database. Tests exercise real verified synthetic-owner login, mobile empty/unknown coverage and quick-action navigation, custom-date/source filtering, signed spending/source drilldown, hidden-module account history, invalid filters, another owner's empty snapshot/foreign history rejection and anonymous API rejection. Desktop/mobile screenshots were inspected and mobile horizontal overflow was checked.
- Playwright `1.63.0` is a pinned development-only addition; existing architectural dependency versions remain unchanged. `pnpm exec playwright install chromium` timed out against its CDN in this environment, so verification used installed Edge. Default browser execution uses installed Playwright Chromium; alternatively set `PMP_BROWSER_CHANNEL` to an installed compatible channel. Build first, provide the guarded `.env.test` database/roles, then run `pnpm test:browser`. The harness never reuses a user server; synthetic committed fixtures are removed through guarded test-only administrator cleanup. Multiple synthetic logins share localhost; the test honors the existing authentication limiter's explicit 429 retry interval without weakening production settings. Next logged a nonfatal destination-stream cancellation during browser teardown/navigation; all asserted pages and responses passed.
- `pnpm check` and `pnpm build`: passed. `git diff --cached --check`: passed before the implementation commit.
- `pnpm db:generate --name=v1_c1_verified_drift`: **no schema changes**. No migration or development database change was required. `pnpm db:verify:chain`: **51 migrations and a no-op repeat passed** on an empty disposable database, retaining D6b–D12 committed smoke and adding Dashboard/spending equality, signed correction/refund contributions, account-history consistency, current logical activity and owner isolation.

No unresolved V1-C1 blocker remains. V1-C1 stopped with V1-C2 as its next assignment; V1-C2 is completed below. Reminder controls, other remaining coherent-V1 lifecycle surfaces, V2/V3 and broad redesign remain separate assignments.

### 5.14 V1-C2 — Reports, Drilldowns, and CSV Exports

Verified implementation commit: `d1e94142ceb56586d36072551dbe7f077672de0f` — `feat(reports): add exact period reports and scoped CSV exports`.

V1-C2 is complete. Continuation began on clean synchronized `main` at `b6d16bc16a8636679850b0726082d37a8da19aff`. V1-C1 was verified first with all nine Dashboard PostgreSQL cases and 27 focused period/service/API/component cases. Review stayed within the authoritative reporting, period, financial classification, Career history/cohort, CSV/provenance and report-design sections.

Released behavior:

- `/reports` redirects to Financial; `/reports/financial`, `/reports/career` and `/reports/financial/detail` expose coherent server-derived reports and supporting records. Shared `PeriodFilterBar` uses C1's existing period service for configurable weeks, months, calendar quarters/years and inclusive custom ranges (maximum 366 days). Standard periods optionally accept an anchor date; Career accepts an explicit effective-observation cutoff through workspace today. All views retain currency, timezone, filters, definition version, generation time, coverage and financial source revision. Module hiding does not remove retained sources from reporting.
- `GET /api/v1/reports/{financial|career|contributions}` uses the trusted server actor and one scoped read-only REPEATABLE READ snapshot. Unknown/duplicate/client-ownership parameters are rejected; private source failures do not become invented zero values. The definition version is `v1-reports-signed-cohort-1`. Dashboard spending reuses the same signed classification expressions and remains regression verified.
- Financial query grain is one immutable posted posting, retaining every original/reversal/replacement leg. Many-side payment/settlement metadata is independently reduced before joining; tags and contractual allocations do not multiply financial evidence. Reversal classifications reference original posting/revision evidence. SQL numeric sums and server BigInt identities preserve exact values; principal and own transfers are not spending, borrowing/refunds/adjustments are not income, and previously recognized charges are not expensed again. Gross spending, eligible offsets/net, fees/interest/penalties/debt charges, external cash movement, transfer principal, baseline changes, explicit adjustments, recognized liability roll-forwards/waivers, uncertain clearing and limited tracked net position remain separate lenses.
- Financial views include exact category/daily/cash-meaning tables, liability components and per-debt opening/closing balances including credit states. Every metric/table amount links to the same signed contribution predicate or its source record. Contributions have stable 100-row pagination while totals cover all matching rows. Owned category/uncategorized, cash-meaning, liability-component and balance-ledger filters remain explicit; ledger filtering is limited to balances so it cannot silently change the consolidated transfer boundary. Current scheduled payable is separate from recognized liability and uses current opening + direct + mapped payment satisfaction; opening satisfaction is never rewritten. Unknown schedules, component coverage and opening cutoffs stay disclosed.
- Career cohorts count distinct attempts by actual submission date, include archived submitted attempts and exclude Saved opportunities. Resolved nonsuperseded history through the as-of date supplies reached stages/outcomes and full calendar-day stage durations, including repeated/open visits. Response conversion requires explicit dated noncancelled response evidence and one common cohort denominator; empty denominators are null/not applicable. Interview/assessment/event-date activity across all cohorts is independent of applications reaching a stage. Timed event boundaries use workspace timezone; cancelled events and superseded history remain supporting evidence. As-of is an effective observation cutoff under current corrected snapshot knowledge, not historical database knowledge reconstruction.
- A narrowly required Career reporting dependency releases dated response/offer/no-response/note observations on application detail and `POST /api/v1/applications/[applicationId]/observations`. The old event creation contract only allowed scheduled interview/assessment/follow-up, so stage changes could not supply actual response evidence. Observation saves are owner/version checked, auditable and idempotent; changed payloads, stale/foreign applications and future actual dates reject. They create no stage transition, next action, financial write or reminder. Fields wait for hydration before accepting input; uncertain-save retry retains the exact command/body. Existing Career workflows remain unchanged.
- Reports use the established shell/panels/tokens with accessible loading, empty, invalid-filter, error and pending states. Lazy Recharts trend/category charts use approximate display coordinates, explicit zero baselines, no entrance animation and adjacent exact-value tables; chart coordinates never calculate financial totals. No broad visual redesign was introduced.
- `GET /api/v1/exports/{transactions|debt-schedules|debt-payments|applications|report}.csv` prepares an owner-scoped consistent snapshot and streams bounded CSV. Exact integer centavos/signed decimals, UTF-8/quoted multiline text, formula-safe untrusted text, schema/definition versions, source IDs/classifications, periods/date semantics, filters, coverage and revision metadata are preserved. A first manifest row and repeated metadata describe contents even for an empty export. Accounting components, contractual due allocations and historical mapping remain separate JSON columns. Historical payment/schedule/application revisions are evidence, not extra business actions. Exports expressly are not a complete workspace backup or an import/restore format. See [V1 CSV export contract](V1_CSV_EXPORTS.md) for column/grain/date/retention definitions.
- New `ops.export_run` stores completed synchronous preparation provenance linked to a completed command receipt, with owner/workspace FKs, forced RLS, immutable metadata and guarded expiration pruning. Exports do not post money or increment financial revision. The visible history window is 30 days; the next prepared export prunes expired metadata, so inactive workspaces may retain older provenance until then. CSV files are not retained for redownload. Prepared means generation completed, not browser receipt. Caps are 10,000 data rows, 10 MiB, 366-day periods, 10-second SQL statements and a 30-second CSV-generation check before provenance/response. Later requests produce fresh snapshots, not immutable published accounting reports.

Verification:

- Full unit/component/API gate: **89 files / 610 tests passed** (`pnpm test --maxWorkers=1 --testTimeout=20000`). New C2 cases cover exact amounts beyond JavaScript precision, quoted/formula-safe CSV, size rejection, strict actor/filters, private attachments/errors, period navigation, export loading/error scope and identical observation retries. Initial parallel execution hit existing form timeouts; serial execution passed. The hidden-Career page test now isolates the added observation form like its other forms. The final hydration fix was separately verified with all seven affected report-control/hidden-source component cases.
- Full PostgreSQL/runtime-role integration gate: **49 files / 367 tests passed** (`pnpm test:integration`). Fourteen C2 cases cover the PHP 36,915 cash / PHP 13,085 spending example with multiple splits/tags and every metric's exact drilldown sum, all period types, maximum valid monetary components, backdated category/fee corrections, actual later refunds, transfer principal/fees, adjustment equity, clearing and corrected later classification without another cash movement, Career submission/as-of/timezone/repeated/corrected history, cancelled events, foreign/stale/future observation rejection, export grains/provenance/nonfinancial revision and rollback. Settlement regressions now also assert eligible recognized waiver, avoided-charge and newly recognized cost/fee reporting. After the final CSV classification columns were added, all 23 focused C2/Dashboard PostgreSQL cases passed again.
- Production browser gate: **six tests passed** (`$env:PMP_BROWSER_CHANNEL='msedge'; pnpm test:browser`) on isolated localhost:3100 with the guarded test database, preserving all three C1 browser regressions. C2 tests cover mobile period/report/drilldown behavior, an actual CSV download parsed for exact signed postings and manifest/provenance, the explicit dated-response form/cohort/source drilldown, invalid/ambiguous filters, real foreign-owner ledger isolation and anonymous export rejection. Mobile overflow was checked; mobile and Career screenshots were inspected. The first Career run caught an input-before-hydration date reset; fields now remain disabled until handlers are ready, and the full browser suite passes. Next's existing nonfatal destination-stream cancellation on navigation/teardown was still logged without assertion failures.
- `pnpm check` and `pnpm build`: passed, rerun after the final form fix. `git diff --cached --check`: passed before the implementation commit. Added pinned architecture-selected `csv-stringify@6.9.0`, lazy `recharts@3.10.1`, and test-only `csv-parse@7.0.3`; existing dependency pins were unchanged.
- Drizzle generated `0051_v1_c2_export_provenance.sql`; reviewed custom `0052_v1_c2_export_security.sql` supplies privileges, forced ownership RLS, immutability/retention and completed-command integrity. Both were applied to the test database first, then to development after focused/full regressions and fresh-chain verification. `pnpm db:generate`: no schema drift. `pnpm db:verify:chain`: **53 migrations plus a no-op repeat passed** on an empty disposable database, preserving D6b–C1 smoke and adding committed C2 reports/drilldown/export provenance, ownership, unchanged financial revision and a concurrent financial write that does not alter the in-progress repeatable report snapshot.

No unresolved V1-C2 blocker remains within the documented coverage/bounds. Reminder controls, lifecycle/settings/help completion, V2/V3 and broad redesign were not begun. Future lifecycle purge must include `ops.export_run` and its restricted owner/receipt links through the reviewed privileged purge path; ordinary runtime deletion remains forbidden. Next milestone: **V1-C3 — In-App Due and Reminder Controls**.

---

### 5.15 V1-C3 — In-App Due and Reminder Controls

Completed and verified on current `main`, after verifying V1-C2 with its 14 report integration tests and 29 reporting unit/component tests. Only the authoritative Calendar/Agenda/reminder and source-lifecycle contracts were needed. No previous financial workflow was reimplemented.

Released behavior:

- Owner-scoped `time.reminder_rule`, `time.source_reminder_setting` and `time.reminder_occurrence` implement the documented closed union of concrete personal-event, Career-event and stable debt-obligation references. Composite source/rule FKs, logical uniqueness including nulls, source/module relation checks, immutable occurrence identity/generation, lifecycle guards, restricted runtime grants and forced ownership RLS protect these records. V1 channel is strictly `in_app`.
- Reads compute reminders without inserts or updates. The initial inherited rule is a virtual due-day reminder at 09:00; its physical rule is materialized only when a command needs it. Source mode is explicitly inherit/override/off, including an empty override. Module defaults and source overrides support up to eight distinct 0–365-day/local-time rules; the UI offers comma-separated offsets such as 7, 1, 0. Rule time/offset changes use new identities; disabling/re-enabling advances rule generation. Module/navigation hiding, Agenda inclusion and reminder enablement remain independent.
- Dismiss, snooze, restore and settings commands use the existing lifecycle lock, owner scope, canonical command receipt, source locks, reminder-write serialization and immutable private audit revisions. A snapshot hash covers the expected source version/occurrence/generation, timezone, preferences, rules, settings and occurrence versions. Replay resolves before stale-source checks; changed payloads conflict. A source resolved or changed during review must be reloaded. Snooze accepts a future explicit instant within one year and preserves the source deadline. Debt resolution advances a notification epoch in reminder settings, preserving mode; a financial correction that makes the same obligation due again within the same schedule gets a fresh generation instead of inheriting a cancellation. The effective generation is schedule version number + reminder epoch − 1. Personal/Career event generations remain source-owned. No financial or immutable schedule evidence is changed by this metadata.
- Source-driven Agenda still contains no duplicate editable domain appointments. Debt items retain `debt_obligation` IDs and now encode the current immutable schedule ID in `occurrence_key`, as required by the reminder contract. Current residuals use the existing opening + direct + mapped allocation view; later payments never rewrite opening satisfaction. Partial payment updates the displayed exact residual while preserving dismissal. A satisfied obligation, settlement, replaced schedule, Career reschedule/cancel/archive or personal-event reschedule/cancel suppresses obsolete reminders. Deferred cancellation runs in the source transaction after mappings/payment evidence finalize; reads independently recheck current eligibility/generation. Irrelevant event-note edits preserve notification generation and acknowledgement.
- Calendar has an in-app attention area independent of its selected date range, so older overdue sources remain reachable. It aggregates source/rule rows to one source before counting, shows the first 25 due sources with its full source count and an explicit bound, and excludes dismissed, future-snoozed and disabled reminders. Agenda retains textual Overdue/Today/Upcoming indicators and adds textual Due/dismissed/snoozed/off reminder state. Hidden sources retain authorized links. Amount display reuses exact PHP minor-unit formatting.
- `GET /api/v1/reminders` reads a source or module-default target; same-origin `POST` accepts strict reminder commands with authenticated ownership. Calendar and personal/Career/debt detail records link to `/calendar/reminders/[sourceKind]/[sourceId]`. Controls provide explicit review/confirmation, pending/error/empty/resolved states, source navigation, latest occurrence generations/cancellation reasons and immutable user-action history. An uncertain save locks editing and retries the identical command; confirmed save plus failed follow-up read requires reloading rather than presenting an uncertain financial/source outcome. Accessible loading/error boundaries and hydration-safe controls follow the existing shell and design tokens.
- Reminder commands never pay a debt, complete an event, change a source deadline, insert a financial action or increment financial revision. Source acknowledgement is distinct from the authoritative scheduled commitment. Completed response/no-response/offer/note Career observations remain history, not actionable reminders. External delivery, queue/delivery records, quiet-hour controls, recurrence, unreleased card/bill/tracker sources, V2/V3 and broad redesign remain outside C3.

Verification:

- Focused reminder integration: **15 tests**, covering pure GET/default scheduling, three Career source kinds, rescheduling/cancellation/archive, partial/full due satisfaction, corrected-payment reactivation in the same schedule, schedule replacement, hidden-module preferences, rule inheritance/override/off, attention grain/suppression, source/module relation rejection, immutable generations, replay/conflict, rollback and missing/foreign references. The real settlement regression also verifies persisted reminder cancellation and retained history. Final source-lifecycle review exposed the same-schedule reactivation gap; its regression first reproduced the cancelled-state error and then passed after the notification-epoch fix.
- Complete unit/component regression: **91 files / 625 tests passed**; the final reminder API/control/Agenda subset passed again (**17 tests**) after the metadata fix. Complete integration regression: **50 files / 382 tests passed**, rerun after that fix. `pnpm check` and production `pnpm build` passed again on the final code state. Staged whitespace checks passed.
- Real Edge production-browser suite: **9 tests passed**, including Dashboard/Reports regressions plus mobile overdue attention, exact reviewed controls, source navigation, snooze, stale-preview reload, module hide/restore, cancellation, a deliberately lost committed response followed by exact-command replay, and foreign-owner isolation. The new tests initially needed punctuation/Next route-announcer selector corrections; the final full suite passed. The 390px reminder screenshot was visually inspected and the horizontal-overflow assertion passed. Existing nonfatal Next destination-stream-closed messages appeared during navigation; assertions and final gates passed.
- Generated `0053_exotic_silk_fever.sql` creates the three reminder tables. Reviewed `0054_v1_c3_reminder_integrity.sql` adds security, immutability/relation/source-cancellation triggers and debt occurrence keys; `0055_v1_c3_reminder_suppression.sql` preserves acknowledgement during preference suppression independently of source lifecycle. Generated `0056_legal_cargill.sql` and reviewed `0057_v1_c3_debt_reminder_reactivation.sql` add the debt reminder epoch, transactional advancement and same-schedule reactivation generation, including repair of already-cancelled current identities. Test migrations were applied first and development migrations only after verification. Drizzle reports no schema drift. Fresh disposable database: **58 migrations / 53 tables plus no-op repeat passed**, retaining D6b–C2 committed smoke and adding C3 committed replay/conflict, owner isolation, source cancellation, attention and unchanged financial revision.

No unresolved C3 blocker remains within the released source types and documented bounds. Future reviewed lifecycle purge must include all three reminder tables, their restricted source/rule links and immutable audit/receipt evidence, alongside `ops.export_run`; ordinary runtime deletion is not enabled. Next milestone: **V1-C4 — Settings, Help, Session, and Data Lifecycle**.

---

## 6. Current functional route surface

At the current handoff point, the repository includes functional page routes for:

- authentication:
  - forgot password
  - reset password
  - sign in
  - sign up
  - verify email
- onboarding
- Connected Dashboard, source-backed attention/summaries and exact-period spending drilldown
- Reports:
  - Financial and Career period reports
  - exact financial contribution/category/flow/component/balance drilldowns
  - scoped transactions, debt schedule/payment, application history and report CSV exports
- Money:
  - accounts
  - account history
  - account reconciliation, immutable comparison history and explicit balance adjustment review
  - current logical financial activity, economic correction/reversal, genuine refund and payment-clearing review
  - transaction entry
  - transfer entry
  - debt list and detail
  - existing-debt import
  - new borrowing
  - debt payment entry and payment/audit history
  - debt schedule revision review and immutable schedule history
  - explicit settlement review, verified closure and settlement history
- Career:
  - application list
  - create application
  - application detail
  - explicit dated provider response/offer/no-response/note observations
- Calendar:
  - agenda/calendar
  - personal event detail
  - source-specific in-app reminder controls and history
  - Calendar attention and module reminder defaults

Major V1 routes/workflows still to be added include remaining coherent-V1 support/settings/session/lifecycle surfaces.

---

## 7. Immediate next step

### Next milestone: V1-C4 — Settings, Help, Session, and Data Lifecycle

Continue from the verified V1-C3 state. Inspect current `main`, this handoff and only the authoritative settings, Help, session and data-lifecycle sections required for C4. Verify C3 before building on it; preserve its source/reminder separation, stable occurrence identities, ownership, generation checks and safe command replay, along with shared report/CSV definitions and read-only snapshots.

Implement C4 only. Preserve existing financial/Career evidence, explicit adjustments/corrections, current due mappings, coverage disclosures, hidden-module links and reminder-state independence. Complete the documented V1 support/settings/session/lifecycle surfaces through their reviewed ownership and lifecycle paths. Include `ops.export_run` and the three reminder tables in lifecycle planning without weakening ordinary runtime guards. Do not rebuild D6b–D12/Dashboard/Reports/reminders or begin external scheduled delivery, V2/V3 or broad redesign.

---

# 8. V1 continuation plan

## 8.1 V1 definition for future work

For development purposes, "finish V1" means completing:

1. the remainder of **Financial Core Completion**;
2. the **Coherent V1** product surface;
3. the applicable **Production Readiness** work needed to make V1 genuinely releasable.

Do not declare V1 complete merely because feature pages exist.

The authoritative V1 acceptance scenarios in the blueprint must be satisfied.

---

## 8.2 V1-A — Finish Financial Core Completion

Continue in small reviewed milestones. D6b, D7, D8a, D8b, D9, D10, D11, D12, V1-C1, V1-C2 and V1-C3 are complete; V1-C4 — Settings, Help, Session, and Data Lifecycle is next.

### A. Existing debt import and read model

Status at handoff:

- database foundation complete (D6a);
- import/read service, repository, API, and UI complete (D6b).

Target:

- import existing debts without duplicating prior borrowing/payments;
- support historical manual schedules;
- expose recognized liability separately from scheduled payable.

### B. New borrowing and net proceeds

Completed in D7. Preserve the documented borrowing recipes, including:

- principal amount;
- actual cash received;
- receiving account;
- withheld/upfront fees;
- capitalized fees where supported;
- no borrowing recorded as income;
- debt liability posting;
- actual net-proceeds cash posting;
- exact fee treatment.

Canonical example to preserve:

- principal PHP 10,000;
- net cash received PHP 9,800;
- fee expense PHP 200;
- liability PHP 10,000;
- zero income.

Do not allow a fee to be counted twice.

### C. Debt payments

The database/security/integrity foundation is complete in D8a, and the recording/read/API/UI workflow is complete in D8b. Preserve one logical payment action with separate accounting and contractual allocation meaning.

Support:

- partial payments;
- full payments;
- known component allocation;
- partial breakdown;
- unresolved/unknown component allocation where documentation permits;
- paying financial account;
- external payment fees;
- recognized principal/interest/fee handling;
- no double-expensing principal;
- no automatic assumption that scheduled interest is already recognized.

Use the database architecture's debt-payment and payment-allocation model rather than inventing a simpler mutable paid flag.

### D. Unknown allocation and clearing

The clearing/reclassification database foundation is complete in D8a. D8b records explicit unresolved clearing and displays its coverage; D12 releases provider-confirmed clearing resolution and correction with zero additional cash movement.

Rules:

- unknown does not become guessed accuracy;
- unresolved allocation remains visible;
- explicit provider-confirmed accounting evidence is required to resolve uncertainty;
- clearing is not liquid cash;
- reports disclose coverage/unknown portions.

### E. Manual schedules and schedule revisions

Initial manual/empty no-date schedules are released in D6b/D7. The user-facing versioned revision and allocation-mapping workflow is complete in D9. Preserve these contracts:

Released:

- initial manual schedule;
- stable obligation identities;
- immutable finalized schedule versions;
- schedule revision through a new version;
- previous terms retained;
- date corrections;
- renegotiation;
- allocation corrections when supported;
- future reminders/Agenda based on the active schedule only;
- historical completed/satisfied evidence preserved.

Do not edit finalized contractual terms in place.

### F. Early settlement

Completed in D10. Preserve explicit settlement behavior:

- one financial action with an optional same-action payment;
- recognized liability resolution;
- recognized waiver where applicable;
- avoided future unrecognized charges as metadata rather than fake expense reversal;
- zero verified residual before closure;
- preserve prior schedule/history;
- cancel future unpaid schedule/reminder projections appropriately.

Do not implement an automatic loan settlement calculator that guesses provider math.

### G. Reconciliation and balance adjustment

Completed and verified in D11. Preserve explicit reconciliation rather than silently changing balances, including current cutoff-source invalidation and immutable evidence.

Support:

- user-entered observed balance/statement evidence where defined;
- difference detection;
- explainable adjustment command;
- correction/adjustment equity treatment;
- reason/audit evidence;
- period/report effects;
- no inferred income from unexplained positive differences;
- no hidden mutation of prior postings.

### H. Refund/correction behavior required by released transaction types

Completed in D12 for released V1 transaction types, with the documented dependent-record restrictions in section 5.12. Preserve exact reversal/replacement, refund expense-offset and clearing-resolution semantics.

Corrections must:

- preserve historical evidence;
- use revision/reversal/replacement semantics as designed;
- keep balance/report/history projections consistent;
- be idempotent;
- handle backdated corrections correctly.

---

## 8.3 V1-B — Coherent V1 product surface

After financial-core correctness is stable, complete the connected application.

### A. Connected Dashboard

Complete and verified in V1-C1; see section 5.13. Preserve the following source-backed contract when adding Reports.

The Dashboard should answer "What needs my attention?"

Implement source-backed sections for:

- tracked liquid funds;
- recognized outstanding liabilities;
- expenses in selected period;
- upcoming debt obligations;
- active Career applications;
- upcoming interviews/assessments/follow-ups;
- mixed upcoming Agenda;
- attention/reconciliation items;
- recent activity;
- useful quick actions.

Rules:

- available credit is never liquid funds;
- tracked net position must disclose coverage;
- every summary links/drills down to supporting records;
- no separate UI-side money formula.

### B. Reports

Complete and verified in V1-C2; see section 5.14 and [V1 CSV export contract](V1_CSV_EXPORTS.md). Preserve shared server-side definitions for:

- weekly;
- monthly;
- quarterly;
- yearly;
- custom range where documented.

Reports should include the documented financial and Career metrics and allow drilldown.

Financial reports must distinguish:

- income;
- spending;
- cash movement;
- transfers;
- fees;
- debt principal repayment;
- recognized liability;
- scheduled payable/coverage where relevant;
- refunds/corrections;
- reconciliation adjustments.

Do not double count joins.

Use exact financial calculations on the server.

### C. In-app due/reminder controls

V1 uses in-app due indicators first.

Implement the V1 reminder/source behavior needed for:

- debt installments;
- Career events;
- personal events;
- other V1 source deadlines where documented.

Reminder state must not mutate authoritative source completion/payment state.

External delivery belongs to V2 unless the current authoritative docs explicitly change that boundary.

### D. CSV exports

Complete and verified in V1-C2; see section 5.14 and [V1 CSV export contract](V1_CSV_EXPORTS.md). Preserve V1 CSV export coverage with clear scope.

A report CSV is not a complete workspace backup.

Export behavior must:

- respect ownership;
- preserve exact money;
- document date/range definitions;
- avoid leaking another user's data;
- be tested with representative records.

### E. Settings/help/support completion

Complete the normal V1 product surface for:

- profile/preferences;
- theme;
- module preferences;
- workspace settings;
- relevant reminder controls;
- replayable guidance/help;
- support/feedback route where documented;
- session/device management if still incomplete.

### F. Module hide/restore behavior

Verify:

- hiding does not delete module data;
- restoring returns data;
- Agenda behavior remains consistent;
- reminder behavior is stated;
- reports follow the documented module-visibility semantics.

Known review item:

- re-check the current Agenda source-link behavior for hidden modules against the architecture/design contract.

### G. Account/data lifecycle

Complete the V1 lifecycle flows defined by the docs:

- archive versus deletion;
- session revocation;
- workspace deletion scope preview;
- explicit confirmation;
- reviewed lifecycle/purge path;
- retention wording consistent with actual backup behavior;
- no ordinary runtime bypass role.

Do not promise instant deletion from backups unless the implemented retention process supports it.

---

## 8.4 V1-C — Known release issue to correct

Before V1 is considered complete, re-check and correct the currently tracked negative-balance acknowledgement issue.

The architecture requires that a manual account transaction that would result in a negative balance receives:

- a warning;
- explicit user acknowledgement;
- recorded warning outcome/evidence.

The current expense UI warns when an expense exceeds the loaded account balance, but earlier implementation did not establish an obvious backend acknowledgement field/contract.

Do not leave this as UI-only warning behavior if the authoritative architecture still requires explicit acknowledgement.

---

## 8.5 V1-D — Production readiness

After coherent V1 workflows are complete, harden them before declaring V1 done.

Required categories include:

### Security and isolation

- cross-user read/write attacks;
- foreign-ID substitution attempts;
- RLS runtime-role tests for every new private table/view;
- group scope is not yet relevant unless a V1 feature requires it;
- authorization failure sanitization.

### Financial correctness

- fixture-based canonical examples;
- balanced journal assertions;
- correction/reversal tests;
- idempotent retry tests;
- concurrency tests;
- exact centavo arithmetic;
- no duplicate economic effects;
- report/drilldown reconciliation.

### Failure handling

- uncertain save/retry;
- transaction rollback;
- stale version conflicts;
- command replay;
- source mutation after request;
- migration failure/recovery procedures where appropriate.

### Accessibility

- keyboard navigation;
- focus behavior;
- form labels/errors;
- modal/sheet focus restoration;
- non-color status cues;
- responsive layout;
- 320 CSS px support for ordinary pages;
- semantic tables/lists;
- appropriate contrast.

### Performance

Test realistic multi-year datasets for:

- account histories;
- transaction history;
- debt schedules;
- Career history;
- Agenda;
- reports.

Use pagination/indexing before considering virtualization.

### Operational readiness

Verify:

- CI;
- migration chain;
- production migration procedure;
- environment validation;
- backup configuration;
- successful restore drill;
- lifecycle/purge drill;
- logging that avoids private/sensitive payloads;
- actionable error reporting.

### Documentation

Update:

- README/setup instructions;
- environment documentation;
- migration/test procedures;
- user-facing help;
- this handoff.

---

## 8.6 V1 completion gate

Before marking V1 complete, validate all coherent-V1 acceptance scenarios from `PROJECT_VISION_AND_FEATURE_BLUEPRINT.md`, including:

1. transfer with fee;
2. income/expense plus reconciliation;
3. existing debt import;
4. partial/full debt payment;
5. early settlement;
6. repeated interviews/calendar;
7. weekly/monthly/quarterly/yearly reports;
8. onboarding skip/resume/replay;
9. backdated correction;
10. cross-user isolation;
11. category split;
12. net loan disbursement;
13. schedule revision;
14. recovery/session revocation;
15. module hide/restore and deletion scope;
16. failed/uncertain save and retry;
17. salary into a selected account;
18. gift versus borrowing classification.

Update this handoff with the final V1 state before starting the V2 chat.

---

# 9. V2 plan

A V2-specific chat should begin only after verifying the repository's current V1 state.

V2 consists of the documented financial-maturity release plus the required shared-expense companion release and other features explicitly assigned to this stage by the authoritative docs.

Do not implement V3 trackers during V2.

---

## 9.1 V2-A — Credit cards and statements

Implement the documented card model rather than treating a card as a cash account.

Core concepts include:

- `credit_card`;
- dedicated card liability ledger;
- `card_activity`;
- transaction date versus posting date;
- verified statement snapshots;
- versioned statement corrections;
- statement entries;
- statement allocations;
- overpayment/card credit;
- card fees and interest;
- refunds;
- card installment plans.

Rules:

- no independently editable card balance;
- posted card activity drives recognized liability;
- statement is provider evidence, not a second posting source;
- remaining statement due derives from the statement plus effective allocations;
- credit limit is not cash;
- pending authorization is not posted activity;
- unknown provider lines require explicit reconciliation;
- no invented minimum-payment/interest formula.

Required V2 card acceptance includes:

- purchase;
- statement closure;
- partial payment;
- refund;
- fee;
- overpayment;
- installment behavior.

---

## 9.2 V2-B — Recurring obligations

Implement planned recurring obligations with versioned recurrence rules.

Core behavior:

- income/bill/subscription recurrence definitions;
- immutable recurrence versions;
- planned expected occurrences;
- due dates;
- skip/cancel/override behavior;
- optional default category/account suggestions;
- occurrence-to-actual-action links;
- partial actual linkage if documented;
- archive behavior;
- Agenda/reminder projection.

Critical invariant:

**A planned occurrence never posts money merely because its date arrives.**

Actual money changes only through explicit financial actions.

---

## 9.3 V2-C — Budgets

Implement category-based budgets using actual report data.

Rules:

- budgets do not own spending totals;
- actual spending comes from the ledger/report definitions;
- no overlapping same-category budgets unless a documented policy permits it;
- support net/gross basis as documented;
- preserve exact date boundaries.

---

## 9.4 V2-D — Savings goals

Implement:

- savings goals;
- target amount;
- optional target date;
- active/completed/archived lifecycle;
- reservations against eligible financial accounts.

Rules:

- goal completion is not a new asset;
- reservations do not create money;
- a later real transaction may make a reservation underfunded;
- do not reject real spending merely to keep reservations artificially funded.

---

## 9.5 V2-E — Forecasts

Forecasts should normally be projections from:

- actual opening/current funds;
- expected occurrences;
- current rules;
- declared assumptions.

Do not create another financial source of truth.

Persist a forecast artifact only if the user explicitly saves a scenario and the authoritative docs support it.

---

## 9.6 V2-F — Richer Career analytics

Add Career analytics using existing authoritative application/stage/event history.

Examples include:

- application funnel;
- stage conversion;
- response/interview outcomes;
- time-in-stage;
- application cohorts/period analysis;
- follow-up behavior.

Define query grain carefully and avoid deriving facts that the recorded history does not support.

---

## 9.7 V2-G — Scheduled opted-in notifications

V2 may add external/scheduled delivery after the source/reminder model is stable.

Requirements:

- explicit opt-in;
- current-source validation before delivery;
- delivery idempotency;
- quiet-hours/channel rules where documented;
- retry without duplicate notifications;
- reminder dismissal/snooze does not mutate source completion/payment;
- no sensitive financial content leaked through inappropriate channels.

---

## 9.8 V2-H — Supporting files, imports, and portability

The blueprint allows these in V2 with independent readiness gates.

Implement only according to current docs and actual readiness.

Potential V2 scope:

- private supporting-file uploads;
- provider statements;
- settlement confirmations;
- resume/assessment documents where applicable;
- supported CSV imports;
- import preview;
- explicit date/currency interpretation;
- duplicate detection;
- cutoff-safe historical import;
- portable workspace export;
- restoration preview;
- relationship/version preservation.

Do not let uploaded evidence automatically mutate balances or stages.

Report CSV export and portable workspace backup/export are different products.

---

# 10. V2 companion — Family shared expenses

Shared expenses are required by the completed product roadmap, but use a **separate group permission boundary** from private workspaces.

Implement after the private V2 financial model is stable.

Core scope includes:

- expense groups;
- registered/manual/deleted participants;
- invitations;
- accepted membership;
- owner/member roles;
- one payer initially;
- equal and exact/custom splits;
- group bills;
- participant shares;
- payer advances/receivables;
- group balances;
- partial settlements;
- settlement confirmation/history;
- disputes/reversals where documented;
- explicit private-ledger links;
- correction behavior;
- group reports.

Security rules:

- membership grants access only to group-owned records;
- a group owner cannot access another participant's private workspace;
- private salary/account/debt/application records remain private;
- invitations must not become a user directory;
- leaving/deleting identity must preserve allowed shared-history evidence under the lifecycle policy.

Accounting rule:

**Do not count one real-world expense twice in personal and group reporting.**

Required family shared-expense acceptance includes:

1. two users retain private data isolation while sharing a group;
2. the documented PHP 1,200 dinner example balances correctly;
3. pending/partial/confirmed/disputed/reversed/overpaid settlements remain explainable;
4. manual participants are not silently merged with registered users;
5. rounding/refunds/corrections/leaving preserve history and zero-sum group balances;
6. later simplification, if released, cannot apply without agreement.

Update this handoff with the actual V2 completion state before starting the V3 chat.

---

# 11. V3 plan — Adaptable trackers

A V3-specific chat should begin only after inspecting the current repository and verifying the actual V1/V2 state.

V3 focuses on adaptable trackers. Do not turn the entire application into a generic no-code database.

Financial and Career authority remains in their specialized modules.

---

## 11.1 V3-A — Preset trackers first

Start with useful preset trackers before custom schema editing.

Possible documented tracker concepts should be confirmed from the current blueprint before implementation.

Build:

- tracker identity;
- preset/template identity;
- typed field definitions;
- entries;
- status/date support;
- validation;
- archive/history behavior;
- ownership/RLS;
- responsive list/detail/create/edit UI.

Do not use trackers as substitutes for financial accounts, debts, applications, or other specialized authoritative records.

---

## 11.2 V3-B — Versioned tracker definitions

When customization is introduced, use versioned definitions.

Requirements:

- immutable/versioned template/field definitions;
- existing entries retain interpretable meaning;
- template edits do not silently corrupt old records;
- migration between definition versions is explicit;
- validation is defined per field type;
- removed/renamed fields preserve historical readability.

The required tracker acceptance scenario is that existing records survive template changes.

---

## 11.3 V3-C — User-created templates/custom fields

After presets are stable:

- create template;
- add/edit supported field definitions;
- ordering;
- required/optional semantics;
- typed validation;
- template versioning;
- create/update tracker entries;
- search/filter where justified.

Do not build a fully general no-code application builder.

---

## 11.4 V3-D — Tracker reporting

Add tracker reporting only for supported typed data.

Rules:

- do not invent cross-type numeric semantics;
- preserve date/status/filter meaning;
- keep reports tied to a specific tracker/template/version context;
- maintain ownership isolation.

---

## 11.5 V3-E — Calendar integration

Calendar integration comes only after a synchronization/source policy is explicit.

Use source-driven projections.

Do not duplicate a tracker deadline into a separately editable calendar record if the tracker remains authoritative.

Define:

- eligible date fields;
- stable source identity;
- occurrence key;
- update behavior;
- deletion/archive behavior;
- hidden-module behavior;
- reminder ownership;
- source-link navigation.

---

## 11.6 V3 completion gate

Before marking V3 functional work complete:

- preset trackers work;
- custom templates/fields work where required;
- existing entries survive definition changes;
- tracker validation is covered;
- tracker RLS/isolation is covered;
- reporting is coherent;
- Calendar/source integration is nonduplicative;
- responsive/accessibility tests pass;
- regression suite remains green;
- relevant documentation and this handoff are updated.

Do not automatically begin later/selective roadmap features after V3.

---

# 12. Explicitly deferred / later-selective scope

Do not implement these merely because they appear in the long-term vision:

- automatic provider fee lookup;
- bank connections;
- payment execution;
- automatic loan settlement calculation;
- credit scoring;
- AI financial recommendations;
- collaborative editing;
- fully general no-code builder;
- transfer-in-transit workflow;
- refinancing;
- split payment sources;
- offline synchronization/PWA behavior;
- investments;
- multiple currencies/FX;
- general shared workspaces;
- receipt OCR;
- suggested categorization;
- broad import integrations;
- annual-review exports;
- general standalone lending;
- multiple group payers;
- richer split methods;
- settlement simplification unless its release gate is explicitly reached.

A future decision may promote one of these into scope, but do not infer that promotion.

---

## 13. Current testing and verification philosophy

Use the existing test structure and add the smallest appropriate layer for each behavior.

Expected layers include:

- unit/domain tests;
- component tests;
- API route tests;
- repository/service integration tests;
- direct PostgreSQL runtime-role integrity tests;
- isolation tests;
- browser/manual verification for user workflows;
- build/type/lint/format checks.

For financial database changes:

1. generate structural migration with Drizzle where appropriate;
2. add reviewed handwritten integrity/security migration for behavior outside the declarative schema;
3. migrate the test database first;
4. run focused database/integration tests;
5. run financial regression tests;
6. only then migrate the development database;
7. run the full repository gates before commit.

Do not hide a logic/performance problem by increasing a test timeout without understanding the cause.

---

## 14. Current known caveats / review items

### 14.1 Negative balance acknowledgement

Resolved in D12. Manual income/expense/transfer and correction/refund commands now retain explicit acknowledgement and exact warning facts alongside the existing debt-payment, settlement and adjustment contracts. Missing acknowledgement rejects a negative result, including backdated historical gaps. Keep acknowledgement in command/audit evidence and revoke UI confirmation when intent changes.

### 14.2 Agenda source links for hidden modules

Resolved in D12. Authorized hidden Career application sources open with a hidden-module cue; unavailable/foreign sources remain unavailable. Existing Agenda source links and Personal/Money source behavior were preserved. V1-C1 extends the same rule to owned account-history supporting links from Dashboard. Module hiding is a navigation preference, not an ownership denial.

### 14.3 Debt correction dependencies

D6b-D11 debt workflows and D12 active-debt payment correction/provider-confirmed clearing classification are released. Financial corrections after schedule mapping rebuild an immutable allocation-correction version; classifications never deduct cash again. Borrowing-origin reversal, finalized settlement/closed-debt corrections, active linked classification dependencies and incompatible refund/source changes remain explicit dependent-resolution rejections, as documented in section 5.12. No automatic settlement reopening or balance-zeroing exists.

The immediate continuation is **V1-C4 — Settings, Help, Session, and Data Lifecycle**. No D12 accounting-release or V1-C1/C2/C3 blocker remains within the documented V1 dependent-record restrictions, report/export bounds and released reminder source types. In-app reminder controls are complete; remaining lifecycle/support completion, V2/V3 and broad redesign are not started.

---

## 15. Commit history checkpoints

Useful milestone commits currently on `main`:

| Area | Commit |
|---|---|
| Frontend foundation | `db3030a00b2d42bf3ecf8b64bf8cc8124411e3f4` |
| Auth/workspace bootstrap | `81445dfa17d12c576529bc7a97ec4d79f800ddfe` |
| Onboarding | `d4dcd711846429da0851a8eefec15575849d8eeb` |
| Financial account workflow | `c32752f0dfece2a642228ced91f4c619d4448f3c` |
| Transaction workflow | `b9811da498d8df7ab849db62189c775a748a318d` |
| Category splits | `18b73e399edbaf29c9980bfd0dad59743316fdd7` |
| Completed transfers | `d7a90ed9930a1c2593bc2876e2d526bd6c958812` |
| Account history | `79efa7433a1d740648fd89bb13c6102c64e596cf` |
| Career applications | `7126c794f5500c3171c244d2e5d295399f762aa6` |
| Career events/details | `e2301efe4c5844e8d97ea07d562ec17747787db1` |
| Career lifecycle/onboarding evidence | `5dd2cb92cdaabd60ab6693a1778c51483b901ee9` |
| Agenda/personal events | `78d59583787bda0ede72753d29d91f6b4b3ee8a6` |
| Personal event lifecycle | `a46ea91ee5132468feaeabc1d9b124282445cd89` |
| Expense split stability fix | `29599d79299270e55d48ecfe5a4d1beb70388bee` |
| Debt integrity foundation | `e01a375d51b5bca19db21b8013b92fd3c0d6d8aa` |
| Existing-debt import/manual schedules | `9d9604ab2d459c7110aaff3ed99763346c36c137` |
| Borrowing/net proceeds | `8c0875298e6995c7a1cf0d302db179aafeae82c4` |
| Debt-payment database foundation | `dc451c51374620198df0ad6befe366e3c2a09698` |
| Debt payment workflow | `5f69a0e054705e8fc40dd7b572e3e26189a4eba0` |
| Debt schedule revisions | `038d387e1cab8096c5c6dcd729d1e6481dd59b40` |
| Explicit verified debt settlement | `1960dcb607d4207797ff4476db18302d69d6ff98` |
| Reconciliation and explicit balance adjustments | `aea675049cc5dc246b97d5a099b66e4ccfa68dd2` |
| Financial corrections/refunds/accounting cleanup | `f536c019622d25a239098286e7fb81e343a932bb` |
| Connected Dashboard | `91624010767254461297f55eff238aa260ab07df` |
| Reports, drilldowns and scoped CSV exports | `d1e94142ceb56586d36072551dbe7f077672de0f` |
| In-app due/reminder controls | `69d00e0e8608b221744e9632695d087f0ee49798` |
| Reminder generation after corrected due satisfaction | `4ac6e14d383dabedc5821b633150426123fd895d` |

Always verify current `main` rather than assuming these remain the latest commits.

---

## 16. Handoff maintenance rule

At the end of every meaningful milestone:

1. update the "Current implementation status";
2. update the "Immediate next step";
3. mark completed items in the relevant V1/V2/V3 plan;
4. add important new invariants/decisions;
5. add unresolved release blockers;
6. update the verified `main` HEAD;
7. keep future phase sections intact unless authoritative documentation changes them.

At the end of each release phase, ensure the next chat can determine the real repository state from this file plus the authoritative docs without reconstructing prior conversations.

---

## 17. Starting point summary

As of this handoff:

- Foundation proof: complete enough to support continued development.
- First usable Money slice: complete.
- Career and Agenda stage: complete.
- Financial Core Completion: D6a-D12 complete within documented V1 dependent-record restrictions; Coherent V1 Dashboard and Reports/CSV are complete.
- Debt database/integrity foundation D6a: complete.
- Existing-debt import/read D6b: complete.
- Borrowing/net proceeds D7: complete.
- Debt-payment database/security/integrity foundation D8a: complete and verified; test and development migrations applied.
- Debt Payment Workflow D8b: complete and verified; current dues/Agenda, payment/audit history, and test/development migration applied.
- Debt Schedule Revisions D9: complete and verified; immutable history, exhaustive payment mapping, explicit noncash charge and current Agenda projections.
- Early Debt Settlement D10: complete and verified; one-action payoff/adjustments, exact zero-residual closure, immutable history and Agenda cleanup; test/development migrations applied.
- Reconciliation and Balance Adjustments D11: complete and verified; immutable cutoff comparisons, derived review status, explicit cash/equity actions, safe replay, and test/development migrations applied.
- Financial Corrections and V1 Accounting Cleanup D12: complete and verified; explicit immutable corrections/refunds/classification, durable negative acknowledgement and hidden Agenda links; test/development migrations applied.
- Connected Dashboard V1-C1: complete and verified; source-backed attention, exact snapshot summaries, coverage, Career/Agenda, supporting records and narrow spending drilldown; no schema changes.
- Reports, Drilldowns, and CSV Exports V1-C2: complete and verified; shared exact period/financial/Career definitions, supporting records, bounded owner-scoped exports and provenance; test/development migrations applied.
- In-App Due and Reminder Controls V1-C3: complete and verified; source-safe controls, stable generations, reminder attention/history, safe retry and test/development migrations applied.
- **Next task: V1-C4 — Settings, Help, Session, and Data Lifecycle.**
- Remaining coherent-V1 support/settings/session/lifecycle work: still ahead.
- V2 financial maturity/shared expenses: not started.
- V3 adaptable trackers: not started.

Continue from the repository itself, not from assumptions.
