# V1-C5 acceptance record

Scope: final V1 verification, following C4 code `84e989e72b90bbd4175ed497101c14f5b7f1555d` and handoff `b71bf98`. V2/V3 and visual redesign remain excluded. This record distinguishes local evidence from production deployment evidence. A pending row is not a pass.

## Coherent V1 matrix

Source references below are under `src/`; bare financial `services/*` references mean `modules/finance/services/*`. Automated references are under `tests/`. Browser evidence comes from the production build on isolated port 3100, using synthetic owners and `personal_management_test`. Browser assertions verify source APIs as well as visible review/history; they do not substitute client-side calculations for server authority.

| # | Workflow and implemented sources | Automated evidence | Browser/manual evidence | Final C5 status |
| --- | --- | --- | --- | --- |
| 1 | Transfer with fee: `modules/finance/services/record-transfer.ts`, `components/money/transfer-create-form.tsx` | `integration/record-transfer.test.ts`, `integration/financial-recipes.test.ts` | Financial acceptance browser suite; exact fee-only spending | Local pass |
| 2 | Income/expense and explicit reconciliation: finance services `record-income`, `record-expense`, `reconcile-account`; reconciliation form/history | `integration/record-income.test.ts`, `integration/record-expense.test.ts`, `integration/reconcile-account.test.ts` | Account history and reconciliation review | Local pass |
| 3 | Existing debt import: `services/import-existing-debt.ts`, `components/money/debt-import-form.tsx`, debt read models | `integration/import-existing-debt.test.ts`, `unit/debt-import-form.component.test.tsx` | `browser/financial-acceptance.spec.ts`: paid, overdue, future and unknown dues, exact review at 320px; retained [review](assets/v1-c5/d6b-review-320.png) and [detail](assets/v1-c5/d6b-detail-320.png) captures visually inspected | Local pass; D6b browser gate closed |
| 4 | Partial/full payment: `services/record-debt-payment.ts`, payment form/history; actual allocation remaining | `integration/record-debt-payment.test.ts`, `integration/debt-payment-integrity.test.ts`, payment component tests | Payment review and resulting history/Agenda | Local pass |
| 5 | Early settlement: `services/settle-debt.ts`, settlement form/history and immutable disposition version | `integration/settle-debt.test.ts`, settlement component tests | Settlement review and Agenda cleanup | Local pass |
| 6 | Repeated Career interviews/calendar: Career event services, source-driven Agenda | `integration/create-application-event.test.ts`, `integration/mutate-application-event.test.ts`, `integration/s2-career-agenda.test.ts` | `browser/reminders.spec.ts`, Dashboard mixed Agenda | Local pass |
| 7 | Shared weekly/monthly/quarterly/yearly/custom periods, exact reports/drilldowns/exports: reporting module | `integration/reports.test.ts`, reporting/CSV unit tests | `browser/reports.spec.ts` | Local pass |
| 8 | Onboarding skip/resume/replay: core onboarding services, `components/onboarding/onboarding-step-controls.tsx`, getting-started panel, Help | `integration/onboarding-progress.test.ts`, `unit/onboarding-step-controls.component.test.tsx`, financial/Career onboarding evidence | `browser/onboarding.spec.ts` persisted skip/resume and twice-replayed Help without business writes; Settings Help | Local pass |
| 9 | Backdated reversal/replacement: `services/correct-financial-action.ts`, action-revision evidence | `integration/financial-corrections.test.ts`, report correction tests | Corrected action history/report drilldown | Local pass |
| 10 | Trusted actor context, scoped transactions, forced RLS, restricted runtime roles, private APIs | All reference-boundary, ownership and API tests; C5 catalog/route inventory | Cross-owner browser API substitution and navigation | Local pass; private catalog/API inventory |
| 11 | Category splits, one cash movement: `services/record-expense.ts`, immutable posting allocation | `integration/record-expense.test.ts`, `integration/financial-recipes.test.ts` | `browser/financial-acceptance.spec.ts` split purchase and account history | Local pass |
| 12 | Net loan proceeds/upfront fee: `services/record-borrowing.ts`, borrowing form | `integration/record-borrowing.test.ts`, `integration/borrowing-integrity.test.ts` | Borrowing review shows proceeds, charges and liability separately | Local pass |
| 13 | Immutable schedule revision and allocation mapping: `services/revise-debt-schedule.ts`, schedule form/history | `integration/revise-debt-schedule.test.ts`, schedule component tests | Revised due dates and current Agenda; preserved schedule history | Local pass |
| 14 | Password recovery, current/other session review and revocation: auth/session services and Settings | Auth/session unit tests, auth housekeeping integration | `browser/settings-lifecycle.spec.ts`; queued security mail/recovery acceptance | Local pass; recovery/session revocation |
| 15 | Module hide/restore and exact deletion scope: core module/lifecycle services and Settings | `integration/module-preferences.test.ts`, `integration/workspace-lifecycle.test.ts` | `browser/settings-lifecycle.spec.ts`, `browser/reminders.spec.ts` | Local pass; C4 recheck and final suite |
| 16 | Unknown committed save/retry: command receipts, transactional finance services and form states | Concurrency/replay/rollback integration tests and uncertain-save component tests | `browser/financial-acceptance.spec.ts` loses committed import response and replays identical payload | Local pass |
| 17 | PHP 10,000 salary into BDO opening PHP 2,000 → PHP 12,000, other accounts unchanged | `integration/record-income.test.ts`, income reference boundaries | `browser/financial-acceptance.spec.ts` selected account balances | Local pass |
| 18 | PHP 500 gift into GCash opening PHP 200 → PHP 700; borrowing increases cash/liability, not income | Income/borrowing integration and financial recipe tests | `browser/financial-acceptance.spec.ts` gift and borrowing classification | Local pass |

## Final release gates

| Gate | Evidence/status |
| --- | --- |
| C4 predecessor | Local PostgreSQL restored; lifecycle/auth-housekeeping focused recheck: 12 tests passed |
| Durable security email | Actual queue intent/job transaction, replay, ciphertext, restricted-role rollback and lifecycle tests pass; browser recovery consumes queued Mailpit email and revokes prior sessions. Actual deployed sender/monitoring remains blocked. |
| Full repository gates | Latest complete unit/component: 101 files / 674 passed. Integration: 57 files / 400 passed with original assertions/timeouts, after separate capacity/restore proof and guarded fixture cleanup. Final Chrome production browser: 27 passed, plus two focused inventory checks including workspace bootstrap. Formatting/lint/types, Windows production build, dependency audit, runtime role/context, capacity, restore and final Linux runtime checks passed. Hosted CI remains pending. |
| Accessibility | Chrome browser passes: eleven critical routes at 320px with no horizontal page overflow/axe violations; dark contrast/error cues on Dashboard, Reports, debt import and Settings; keyboard modal trap/Escape/focus restoration; financial validation/review focus; populated schedule comparison. Status labels accompany color. Retained D6b captures visually inspected. |
| Multi-year performance | Full 100-user / 20-active / ten-year synthetic capacity check passed at 50,000 seeded actions, 300,142 postings, 5,000 applications/events and 11 retained debt schedule versions. Exact measurements and query plan are retained below. Local timings do not establish paid-production capacity. |
| Migrations | 76 numbered migrations / 58 tables. Final fresh/no-op and C4 upgrade, committed D6b–C4 accounting/lifecycle smoke and Drizzle no-drift checks passed. Development applied after full regression/fresh verification; pinned queue schema/grants verified separately. Applied migrations are not rewritten. |
| Linux artifacts | Latest web/worker/backup builds and [actual restricted non-root runtime checks](assets/v1-c5/containers.json) passed, including final query/form readiness fixes. No environment files, development test tools or migration credentials in runtime artifacts. Web health/private API and worker heartbeat/graceful shutdown passed; the backup client matches PostgreSQL 17.11 and unconfigured backup fails closed. |
| CI | Added pinned, frozen-lockfile and restricted-role PostgreSQL acceptance workflow, including all Linux targets and runtime smoke; hosted run pending push. |
| Restore/purge | Latest [actual encrypted restore proof](assets/v1-c5/restore.json) passed on the 76-migration database with the capacity fixture: exact counts/balances, balanced journals, scoped report/RLS, restored credential revocation, independently authorized post-backup/pending deletion and replay, other owner retained. Isolated recovery database removed. Production PITR/cloud retention remains blocked. |
| Production | Blocked pending deployment target, verified email sender, independent backup location/retention, support contact and measured hosting evidence. No production environment has been identified in this session. |

## Deferred scope

External scheduled reminder delivery, V2/V3 functionality and broad redesign are excluded. CSV exports remain documented partial exports, not full workspace backups. Provider acceptance of security email is not proof of delivery. No paid PITR window or backup expiration guarantee is asserted without infrastructure evidence.

## Acceptance fixes and review boundaries

The C5 review found missing user-facing onboarding skip/resume controls even though the existing command/service supported both. The controls reuse those owner-scoped command receipts and retain identical payloads after unknown outcomes. Replay does not create accounts, debts or applications.

Foreign financial-action reads previously became a generic 500. Missing and foreign references now share the typed unavailable/404 response. The private API inventory discovers every exported method, tests anonymous/spoofed context rejection, then exercises authenticated foreign IDs with actual owned comparison records. The catalog inventory inspects every private table/view, forced RLS/invoker views and absent/foreign contexts through actual restricted roles; it also rejects runtime role escalation and schema creation.

Browser evidence exposed pre-hydration native date edits reverting to defaults or becoming blank. Corrections/refunds, payments and schedule revisions now keep controls disabled until handlers attach. Browser tests deliberately delay client scripts, verify disabled server controls, release hydration, edit dates and verify exact reviewed/persisted meaning. Scrollable schedule/report tables also expose a keyboard focus region without redesign.

The negative-balance repository now accumulates exact historical/proposed day totals once, rather than repeatedly scanning them. Migration 0072 schedules the unchanged deferred acknowledgement validator only at finalization, removing a redundant building-insert scan. Direct-runtime SQL tests still reject unacknowledged negatives. Principal/fee/income recipes and immutable economic evidence are unchanged.

The full capacity run exposed repeated financial scans. Migration 0074 aggregates direct and mapped installment satisfaction independently before joining current installments. Migration 0075 selects the exact owned liability postings before the posted-journal join. Both preserve the validator's guards, NULL components, deferred trigger coverage and forced RLS. Applied 0073 remains an unchanged no-op following a failed migration-writing helper. Debt page balances now aggregate once for the selected page, and report balance aggregation avoids period-only classification metadata across the whole history. Shared metric definitions and original signed correction/refund evidence remain authoritative. The complete accounting regressions remain a required gate for these changes.

Security-email callbacks use the pinned library's public transactional enqueue adapter; source eligibility retains forced RLS and restricts definer policy to one exact subject. Terminal secrets are wiped; logs accept fixed metadata only. Backup and lifecycle operations retain separate credentials, bounded encrypted readback and exact independently authorized restore targets. Production checks are not inferred from these local controls.

## Retained local capacity evidence

The [machine-readable benchmark](assets/v1-c5/performance.json) retains all samples and the owner-scoped date-pagination query plan, with synthetic UUIDs redacted. The fixture was resumed after an interrupted seed and retained while profiling failures; its final run duration is not the full construction time. Every seed write used the actual domain role, normal building-to-posted transitions and enabled integrity checks. No benchmark budget or database constraint was relaxed. The concurrent-command fixture was corrected to pass the strict service's documented fields.

| Query/command | Local p95 ms | Required budget ms |
| --- | ---: | ---: |
| Financial command including commit | 711.07 | 1,000 |
| Account history | 654.91 | 800 |
| Debt list | 459.94 | 800 |
| Versioned debt detail | 337.39 | 800 |
| Career list | 8.54 | 800 |
| Career history | 9.49 | 800 |
| Agenda | 99.24 | 800 |
| Dashboard | 870.08 | 2,000 |
| Financial report | 1,186.88 | 2,000 |
| Career report | 9.89 | 2,000 |
| 20 active owner-scoped reads | 31.45 | 800 |
| 20 active commands | 258.49 | 1,000 |

Individual workflows use ten measured samples after warm-up and conservatively report the maximum as p95. Concurrent reads and commands use 100 samples each. These are local PostgreSQL measurements, not HTTP page-load timings or proof of Render plan capacity.
