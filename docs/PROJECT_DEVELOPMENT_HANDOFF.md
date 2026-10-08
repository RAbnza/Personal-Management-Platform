# Project Development Handoff

**Project:** Personal Management Platform

**Repository:** `RAbnza/Personal-Management-Platform`

**Repository name status:** Tentative; do not treat it as the final product name.

**Handoff date:** October 8, 2026

**Current verified implementation `main` HEAD:** `038d387e1cab8096c5c6dcd729d1e6481dd59b40` — `feat(money): add versioned debt schedule revisions`

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

The repository is progressing through **Financial Core Completion**. D6a debt integrity, D6b existing-debt import, D7 borrowing/net proceeds, D8a debt-payment database foundation, D8b payment workflow, and D9 schedule revisions are complete. D10 early debt settlement is the next milestone.

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

There is no D9 blocker. User-facing payment correction/reclassification, early settlement, reconciliation, Dashboard/Reports, V2 and V3 remain separate assignments. **Next: D10 — Early Debt Settlement.**

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
- Dashboard/home foundation
- Money:
  - accounts
  - account history
  - transaction entry
  - transfer entry
  - debt list and detail
  - existing-debt import
  - new borrowing
  - debt payment entry and payment/audit history
  - debt schedule revision review and immutable schedule history
- Career:
  - application list
  - create application
  - application detail
- Calendar:
  - agenda/calendar
  - personal event detail

Major V1 routes/workflows still to be added include settlement, payment correction/reclassification entry, reconciliation, full reporting, and other coherent-V1 support/settings/lifecycle surfaces.

---

## 7. Immediate next step

### Next milestone: D10 — Early Debt Settlement

Continue with the separately assigned D10 settlement workflow. Consult authoritative §9.4 System Architecture and §7.4 Database Architecture for confirmed payoff, recognized charge/waiver versus avoided unrecognized future charges, exact zero residual, clearing/unapplied resolution, immutable closing schedule and future Agenda cancellation. D9's schedule revision and explicit noncash-charge primitives do not themselves settle a debt.

Verify D9 before continuing. Do not rebuild D6b/D7/D8a/D8b/D9, guess provider payoff/waiver classification, or include reconciliation, Dashboard/Reports, V2 or V3. D9 stopped without settlement implementation.

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

Continue in small reviewed milestones. D6b, D7, D8a, D8b, and D9 are complete; D10 is next.

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

The clearing/reclassification database foundation is complete in D8a. D8b can record explicit unresolved clearing and display its coverage; user-facing clearing resolution/reclassification remains future work and must avoid another cash deduction.

Rules:

- unknown does not become guessed accuracy;
- unresolved allocation remains visible;
- reconciliation is required to resolve uncertainty;
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

Implement explicit early settlement behavior:

- payment action;
- recognized liability resolution;
- recognized waiver where applicable;
- avoided future unrecognized charges as metadata rather than fake expense reversal;
- zero verified residual before closure;
- preserve prior schedule/history;
- cancel future unpaid schedule/reminder projections appropriately.

Do not implement an automatic loan settlement calculator that guesses provider math.

### G. Reconciliation and balance adjustment

Implement explicit reconciliation rather than silently changing balances.

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

Implement the core refund/correction rules that the V1 documentation requires for released workflows.

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

Implement shared server-side definitions for:

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

Implement V1 CSV export coverage with clear scope.

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

Before V1 release, verify the architecture requirement for explicit acknowledgement when a manual transaction would create a negative account balance.

D8b debt payments now require and retain negative-balance acknowledgement evidence. Review the other manual financial transaction types before V1 release; a UI warning alone may not satisfy the requirement if their backend does not record acknowledgement.

### 14.2 Agenda source links for hidden modules

Re-check whether Agenda items from a hidden module should remain source-linkable while displaying the hidden-module cue. Preserve the authoritative architecture/design behavior.

### 14.3 Remaining debt workflows

D6b import/read, D7 borrowing, D8b payment entry/history and D9 schedule revisions/history are released workflows. Payment correction/reclassification entry and settlement remain future work. D9 allocation correction maps contractual satisfaction only; it does not correct financial payment evidence or classify clearing.

The immediate continuation is **D10 — Early Debt Settlement**. No D9 blocker remains; the separate release review items above remain applicable before V1 completion.

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
- Financial Core Completion: in progress.
- Debt database/integrity foundation D6a: complete.
- Existing-debt import/read D6b: complete.
- Borrowing/net proceeds D7: complete.
- Debt-payment database/security/integrity foundation D8a: complete and verified; test and development migrations applied.
- Debt Payment Workflow D8b: complete and verified; current dues/Agenda, payment/audit history, and test/development migration applied.
- Debt Schedule Revisions D9: complete and verified; immutable history, exhaustive payment mapping, explicit noncash charge and current Agenda projections.
- **Next task: D10 — Early Debt Settlement.**
- Coherent V1 dashboard/reports/reminders/exports/lifecycle: still ahead.
- V2 financial maturity/shared expenses: not started.
- V3 adaptable trackers: not started.

Continue from the repository itself, not from assumptions.
