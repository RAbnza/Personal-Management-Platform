# V2-I implementation checkpoint — Assignment 1

Implementation date: October 15, 2026 (Asia/Manila). Baseline: accepted V2-H `f81260cffd0cb225936631deed6bbafea0723e54`. Branch: `feat/v2-i1-i3-shared-expenses`.

Verified remote implementation commit: `756f35d913741b69da1b2e4b8fe57bd4f1c23ed8`. The feature branch was pushed and its SHA matched `git ls-remote`; `main` was unchanged.

I1, I2 and I3 are implemented for focused checkpoint acceptance. **V2-I remains incomplete and unaccepted as a whole.** I4–I7, deployment and V3 are outside this assignment. The preview defaults off and is forcibly unavailable in staging/production, even when its flag is true.

## Completed workflows

| Milestone | Delivered behavior |
| --- | --- |
| I1 | Lightweight groups; manual participants; verified-email invitations and explicit acceptance; manual identity claims with balance and bill-history review; owner/member administration with recent password verification; membership intervals and rejoining; exit/removal entitlements; archive/restore; pseudonymized account deletion; permanent commands and immutable group audits; bounded invitation expiry/contact retention maintenance. |
| I2 | One/multiple payers; independent selected participants; equal/exact shares, including zero exact shares; deterministic extra-centavo evidence; immutable finalized revisions and creator-only replacement; bill positions/history, person source breakdowns and current group positions. |
| I3 | Independent private approval; group receivable/payable buckets; cash/card funding; unpaid-share adoption; conversion of an existing unencumbered purchase; integrated Add Expense; atomic rollback/replay; source hashes/revisions and derived “needs private correction” status; private financial evidence links. |

The ordinary Add Expense form can switch to “Split with people” before posting. Group bill entry can optionally adopt the current person's allocation in the same transaction. A participant can instead adopt later from bill detail. Nobody else's ledger is posted automatically.

## Authority and history decisions

- Group data lives in `sharing`, independently of private workspace ownership. Eleven sharing tables, one group audit table and three private Finance tables have forced RLS. The declarative graph contains 109 tables; forward migrations `0156`–`0169` extend the chain to 170. Published migrations `0000`–`0155` are unchanged.
- Narrow fixed-search-path predicates avoid recursive membership RLS. Authentication, queue and notification-worker roles receive no group table access. The lifecycle operator can invoke narrow maintenance/deletion commands without enumerating group tables. Runtime roles remain non-superuser/non-bypass/non-inheriting.
- Current owners administer membership/settings; current members record bills. Only the bill creator can revise it. Owner status never grants private account, ledger or Career access. Membership administration requires the existing five-minute password assurance, checked again in PostgreSQL.
- History policy version 1: joining explicitly accepts visibility to existing bills. Exit captures full record entitlements to every bill visible then. Those bills' later revisions remain readable; unrelated later bills, invitation contacts and private records remain hidden. Former-member totals are labeled as totals of visible historical bills. Rejoining creates another membership interval and does not automatically restore an owner role. Runtime callers cannot fabricate entitlements.
- Manual identities have no login membership. Claims require owner nomination, a random 256-bit invitation, the matching verified email, explicit consent and an unchanged group version. The review includes recorded paid/share/net amounts and underlying bill revisions. Names never establish identity.
- Tokens are generated using browser Web Crypto (Node crypto in tests), stored only as constrained SHA-256 hex digests, expire after seven days and are single-use. Contact/bearer data is excluded from command results/audits; links use URL fragments. Changed commands cannot reuse an idempotency key. Revocation/expiry and loss of inviter authority prevent acceptance. Accepted identity consent cannot be edited by owners.
- Deletion locks affected groups in ascending order before the existing profile/workspace locks. Private evidence is purged through the established operator path. Shared facts remain; the registered identity is detached/pseudonymized, contacts and claim identity references are redacted, and an ownerless group is archived. Retained shared descriptions/reasons may still identify people; this limitation is explicit in deletion preview and remains subject to production policy review.
- Group mutations require an aggregate version advance and fresh completed receipt/audit in the same transaction. Audit snapshots contain only allowed group metadata. Financial uniqueness evidence and finalized bills are immutable. Activity is presented from the audit stream rather than an additional mutable activity store.

## Accounting and concurrency decisions

- All group amounts use PostgreSQL bigint inputs and exact decimal strings/JavaScript bigint. Aggregates use PostgreSQL numeric, so accumulated balances can exceed one bigint component. No monetary Number conversion is used. Each finalized revision independently reconciles payer and share totals; present balances use only effective current revisions and sum to zero.
- Equal allocation sorts canonical participant UUIDs, assigns quotient/remainder centavos and persists rank/extra-centavo evidence. Payer and share participant sets can differ. Historical revisions remain inspectable without entering present totals again.
- Commands take the group lock, stabilize/recheck the current identity, then take the owner's private workspace lock when needed. No other participant's workspace is locked or mutated. Integrated entry is one database transaction. Failed private funding rolls back its group bill and both command graphs. Concurrent replay preserves the original result, including after a later group revision.
- Private funding equals the owner's contribution; spending equals the owner's share. The difference debits a group receivable or credits a group payable. An unpaid participant records spending/payable with no cash/card movement. These buckets do not create standalone lender debts.
- Existing-purchase conversion requires matching actual contribution/date and no retained refund, recurring, statement or installment dependencies. It replaces the **same logical action**, retaining exact reversal/replacement journals and provider evidence. Net cash/card funding is unchanged. The new recipe is independently constrained; existing journal, correction, negative-balance, audit and permanent-receipt checks remain active.
- Group corrections do not update private pointers. Accepted source revision/hash and private action revision derive reconciliation state. The I1–I3 checkpoint blocks ordinary correction/reversal/refund paths for adopted actions; I6 must supply explicit group/private correction and refund reconciliation. This prevents bypass through an older financial workflow.
- Existing private posting limits remain authoritative: 100,000,000,000 minor units per component. Larger group bills remain valid and unposted privately when the owner's allocation exceeds that limit.

## Preview bounds and portability

Groups support at most 100 retained participant identities and 100 revisions per bill. Manual claims fail closed above 100 source revisions requiring review. Group bills paginate 50 at a time; person and membership histories show the latest 100; activity/invitations show 50; group selection shows up to 100 groups. These bounds are explicit preview limits, not a production capacity claim.

Private workspace export/replacement fails closed when group ledger bindings exist. A private bundle cannot reconstruct independently owned group authority or its immutable source graph. Workspaces without bindings retain the existing H path. I7 must define the versioned export/restore contract and graph-registry implications before enabling portability for adopted workspaces. No group data is silently injected into or omitted from a purported complete adopted-workspace restore.

## Focused verification

- New boundary units/API/components: 18 passing tests. Tests cover full bigint precision, deterministic allocation, invalid inputs, ownership spoofing/origin/authentication, release gates, accessible controls, exact preview and response-loss replay with frozen intent.
- Focused PostgreSQL run: 62 passing tests across `sharing.test.ts`, `card-purchases.test.ts`, `financial-recipes.test.ts` and `financial-corrections.test.ts`. The final affected sharing rerun passes 19/19 cases after the creation-race fix (63 distinct integration cases across the four focused files). The sharing cases cover role/RLS grants, verified invitations/claims, historical visibility and subsequent revisions, owner protection, raw deferred totals, receipt/audit enforcement, cross-group references, concurrency/replay, atomic integration, cash/card/existing-purchase accounting, partial payer positions, private reporting, retention and approved deletion with another owner's preservation.
- The dedicated migration verifier applies the 156-migration H baseline and I additions in a disposable database, preserves an exact bigint sentinel, validates 15 forced-RLS tables and verifies no-change migrator replay. Final chain: 170 migrations. Drizzle generation reports no schema changes.
- Route type generation, TypeScript and lint pass. The affected five-file unit/component run passes 31 tests. The compile-mode check before the final client-entry/creation-race refinements succeeded with existing tracing and Windows standalone symlink warnings; subsequent affected checks cover those refinements, and it is not complete production packaging. Formatting passes for changed source.
- Full V1–H regressions, comprehensive I acceptance, browser suites, container builds, capacity and restore drills were intentionally deferred to Assignment 2. No hosted CI, external invitation delivery or production acceptance is claimed.

## Assignment 2 prerequisites and remaining work

Start from this feature branch/checkpoint, apply migrations through `0169`, and keep the local/test gate. Preserve historical entitlement policy, group-before-workspace locking, permanent receipts and independent private consent.

1. I4: reported/pending/confirmed settlements, allocations, recipient/manual confirmation, disputes, overpayments, private clearing/linking.
2. I5: relationship explanations, whole-group suggestions and explicit redirected-settlement agreement; suggestions remain nonposting projections.
3. I6: effective refunds, settled-bill corrections and private link revision/reconciliation commands; replace the checkpoint's fail-closed mutation gates only with complete validated recipes; consolidated reporting.
4. I7: Dashboard/Time/Files/notification and portability integration; finalized retention/deletion/restoration behavior; consolidated full-domain, regression, browser/responsive/accessibility, build, container and operational acceptance. Existing external H/G infrastructure gates remain.

Do not merge this checkpoint into accepted-only `main`, enable a deployed preview, begin V3 or claim final V2-I completion before the second assignment's acceptance.

## Changed file inventory

The checkpoint inventory is listed below; migrations include their matching Drizzle snapshots and journal.

- `.env.example`
- `docs/V2_DEVELOPMENT_HANDOFF.md`
- `docs/V2_I_MANUAL_SETUP_AND_PRODUCTION_CHECKLIST.md`
- `docs/v2/SHARED_EXPENSES_IMPLEMENTATION.md`
- `scripts/db/verify-sharing-migrations.ts`
- `scripts/sharing/maintain-invitations.ts`
- `src/app/api/v1/sharing/adoption/route.ts`
- `src/app/api/v1/sharing/invitations/route.ts`
- `src/app/api/v1/sharing/route.ts`
- `src/app/money/actions/[actionId]/page.tsx`
- `src/app/money/transactions/page.tsx`
- `src/app/sharing/[groupId]/expenses/[expenseId]/page.tsx`
- `src/app/sharing/[groupId]/expenses/new/page.tsx`
- `src/app/sharing/[groupId]/page.tsx`
- `src/app/sharing/[groupId]/people/[participantId]/page.tsx`
- `src/app/sharing/_actor.ts`
- `src/app/sharing/error.tsx`
- `src/app/sharing/invitations/page.tsx`
- `src/app/sharing/layout.tsx`
- `src/app/sharing/loading.tsx`
- `src/app/sharing/page.tsx`
- `src/components/money/transaction-create-form.tsx`
- `src/components/sharing/adoption-panel.tsx`
- `src/components/sharing/bill-form.tsx`
- `src/components/sharing/forms.tsx`
- `src/components/sharing/group-admin.tsx`
- `src/components/sharing/invitation-review.tsx`
- `src/modules/core/repositories/lifecycle-repository.ts`
- `src/modules/finance/services/adopt-group-expense.ts`
- `src/modules/finance/services/correct-financial-action.ts`
- `src/modules/finance/services/private-sharing-setup.ts`
- `src/modules/portability/services/workspace-bundles.ts`
- `src/modules/sharing/domain/sharing.ts`
- `src/modules/sharing/services/groups.ts`
- `src/modules/sharing/services/invitations.ts`
- `src/modules/sharing/services/read-groups.ts`
- `src/platform/db/migrations/0156_v2_i_group_foundation.sql`
- `src/platform/db/migrations/0157_v2_i_group_security.sql`
- `src/platform/db/migrations/0158_v2_i_private_adoption.sql`
- `src/platform/db/migrations/0159_v2_i_adoption_integrity.sql`
- `src/platform/db/migrations/0160_v2_i_exit_receipt_visibility.sql`
- `src/platform/db/migrations/0161_v2_i_authority_hardening.sql`
- `src/platform/db/migrations/0162_v2_i_system_attribution.sql`
- `src/platform/db/migrations/0163_v2_i_shared_identity_lifecycle.sql`
- `src/platform/db/migrations/0164_v2_i_lifecycle_receipt_check.sql`
- `src/platform/db/migrations/0165_v2_i_invitation_maintenance.sql`
- `src/platform/db/migrations/0166_v2_i_claim_history_review.sql`
- `src/platform/db/migrations/0167_v2_i_group_audit_snapshots.sql`
- `src/platform/db/migrations/0168_v2_i_group_audit_integrity.sql`
- `src/platform/db/migrations/0169_v2_i_group_read_indexes.sql`
- `src/platform/db/migrations/meta/0156_snapshot.json`
- `src/platform/db/migrations/meta/0157_snapshot.json`
- `src/platform/db/migrations/meta/0158_snapshot.json`
- `src/platform/db/migrations/meta/0159_snapshot.json`
- `src/platform/db/migrations/meta/0160_snapshot.json`
- `src/platform/db/migrations/meta/0161_snapshot.json`
- `src/platform/db/migrations/meta/0162_snapshot.json`
- `src/platform/db/migrations/meta/0163_snapshot.json`
- `src/platform/db/migrations/meta/0164_snapshot.json`
- `src/platform/db/migrations/meta/0165_snapshot.json`
- `src/platform/db/migrations/meta/0166_snapshot.json`
- `src/platform/db/migrations/meta/0167_snapshot.json`
- `src/platform/db/migrations/meta/0168_snapshot.json`
- `src/platform/db/migrations/meta/0169_snapshot.json`
- `src/platform/db/migrations/meta/_journal.json`
- `src/platform/db/schema/finance.ts`
- `src/platform/db/schema/index.ts`
- `src/platform/db/schema/namespaces.ts`
- `src/platform/db/schema/private-group-links.ts`
- `src/platform/db/schema/sharing.ts`
- `src/platform/http/sharing.ts`
- `src/platform/lifecycle/purge.ts`
- `tests/integration/helpers/named-financial-fixture.ts`
- `tests/integration/sharing.test.ts`
- `tests/unit/sharing-api.test.ts`
- `tests/unit/sharing-forms.component.test.tsx`
- `tests/unit/sharing.test.ts`
