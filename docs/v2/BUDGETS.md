# V2-C — Budgets

## Authority and scope

Consolidates Database Architecture §12, System Architecture §15.2 and the Blueprint's planning/reporting requirements. Uses `planning.budget`; budgets are mutable audited spending limits, never financial actions or reservations. No rollover, replenishment, transfers, savings goals or forecasts.

## Internal milestones

1. C1: category/period/amount validation, protected database model, audited replayable management and transactional overlap prevention.
2. C2: repeatable snapshot comparisons from the existing immutable posting facts and net/gross definitions; historical corrections and refund dates remain authoritative.
3. C3: accessible responsive Money management, Reports comparisons, Dashboard preview and consolidated acceptance.

Implement sequentially with focused checks, then one consolidated verification and accepted domain commit/push. Retain V2-B's optimized workflow.

## Domain decisions

- Explicit expense category and PHP limit. Nonnegative integer minor units through PostgreSQL bigint maximum `9223372036854775807`; zero is a valid no-spending limit. No floating-point monetary arithmetic.
- Stored periods are `[start_date,end_date_exclusive)`. UI presents inclusive end dates and converts exactly once. Support 1900–2199, with `2200-01-01` permitted only as an exclusive boundary; periods contain 1–366 days, matching existing Reports limits. Adjacent periods are valid.
- Reject every overlap for the same owned category, including exact duplicates and archived definitions. Archive hides a budget from active summaries but preserves its period/history; update or restore that existing budget to reuse its period. This retains the approved unconditional overlap rule. Different categories may overlap.
- Save supports explicit category/period/limit/basis/notes changes. Updates, archive and restore require expected version and reason; permanent before/after audit history preserves earlier definitions. No ordinary deletion. New category assignments require active owned expense categories; retained archived categories remain readable/manageable without silently changing classification.
- Net is default; gross is selectable per budget. Use the existing Reports posting grain and signed classification: gross purchase/recognized-charge expense activity net of correction reversals; spending offsets on their actual refund/rebate/waiver date; net = gross − offsets. Include card/cash/financed purchases and recognized fees/interest without counting principal payments again. Uncategorised activity has no category budget; no guessed classification or category hierarchy aggregation.
- Remaining allowance = limit − selected recognized spending, including negative net spending. Overspending = max(spending − limit,0). Progress uses exact integer basis points; zero limits show explicit zero-limit status and no percentage denominator. Expected recurring activity never enters these calculations.
- Comparisons always query current immutable financial evidence. Backdating, corrections/reversals/refunds and posting category changes update the applicable period/category; category renames affect labels only. Budget audit history is definition evidence, not frozen financial totals.
- Management serializes on the existing active workspace financial lock. The database write guard advances read-revision metadata before checking overlap, ensuring competing writes serialize even under repeatable-read snapshots; this creates no ledger movement. Database-assigned `write_revision` binds the exact completed command result to that mutation. Commands retain normalized permanent receipts and exact attributed audit evidence. Category kind/name/archive changes take the same lock and advance metadata; referenced categories cannot change to income. Forced RLS, concrete scoped category/receipt FKs and restricted roles apply.
- Money lists/details expose whole-budget-period comparisons and paged history/contributions. Reports/Dashboard previews include budgets intersecting their selected period, explicitly label each budget's full period, and never compare a whole limit with a clipped spending window. Preview bounds disclose additional results; full management remains paginated. No cross-category grand total across mixed bases/periods.

## Acceptance

Verify exact/zero/large limits, leap/day/end boundaries, adjacency/overlaps, lifecycle and immutable audit history, source/category ownership, RLS/runtime grants, SQL bypass/forged receipts, concurrent saves/period moves/version races, permanent replay, ledger nonduplication, net/gross actual-period refunds and corrections, recurring exclusion, snapshot consistency, Money/Reports/Dashboard integration, browser keyboard/review/retry/Axe/320px/themes, migration upgrades, lifecycle/restore and unchanged V1/V2-A/B regressions. Record actual executed results and V2-D prerequisites in the handoff after acceptance.

## Accepted implementation

C1–C3 are implemented and locally accepted. Seven forward migrations add one protected audited table, bringing the chain to 111 migrations / 75 tables with all prior definitions preserved. No dependencies or financial recipes changed.

Consolidated verification covers 901 passing unit/component/API tests, all 549 integration scenarios across the full run and affected reruns, all 44 browser scenarios across the full run and affected rerun, ten fresh/upgrade migration proofs, schema/runtime checks, production builds, dependency audit, isolated encrypted restore and restricted runtime artifacts. Guarded capacity with 100 budgets / 1,000 actual classified postings passed existing timing thresholds and financial nonduplication assertions. Exact commands, initial failures/resolutions, measured results and V2-D prerequisites are recorded in [handoff section 23](../V2_DEVELOPMENT_HANDOFF.md#23-v2-c--budgets).

V2-D requires a separate explicit assignment. Budget remaining allowance is a spending-limit comparison and cannot become eligible savings cash or a reservation.
