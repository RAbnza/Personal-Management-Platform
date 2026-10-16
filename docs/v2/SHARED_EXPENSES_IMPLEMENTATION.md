# V2-I - Shared Expenses and Settlements implementation

Implementation: October 15-16, 2026 (Asia/Manila). Accepted baseline: V2-H `f81260cffd0cb225936631deed6bbafea0723e54`. Work continues on `feat/v2-i1-i3-shared-expenses`; I1-I3 checkpoint implementation `756f35d913741b69da1b2e4b8fe57bd4f1c23ed8`, checkpoint head `e7db233ed44f8be603ddecd008db971e595597cc`.

**Status: locally accepted. I1-I7 are complete and all 40 approved scenarios passed.** The consolidated gates below passed. Production configuration and operational release gates remain separate. No production deployment, external invitation email or V3 work is included.

## Delivered milestones

| Milestone | Delivered behavior |
| --- | --- |
| I1 | Separate group authority; manual/registered/deleted identities; verified invitations and explicit claims; membership intervals/roles; recent authentication for administration; exit entitlements; archive/restore; pseudonymized identity deletion; permanent commands and immutable audits; bounded invitation maintenance. |
| I2 | Single/multiple payers; independent selected participants; equal/exact shares including zero shares; deterministic centavo evidence; immutable finalized bill revisions; creator-only correction; bill/person/group historical and current views. |
| I3 | Independent private cash/card/unpaid adoption; receivable/payable buckets; conversion of an existing purchase as the same logical action; integrated Add Expense; atomic rollback/replay; accepted source revision/hash; private evidence links. |
| I4 | Full/custom/selected payments, partial one-bill and multi-bill allocations; pending sender/recipient summaries; recipient-authenticated or explicitly limited owner-entered manual confirmation; dispute/cancel/reverse events; exact advance/reverse preview; private funding/clearing independent of confirmation. |
| I5 | Reciprocal pairwise netting with source explanations; whole-group net-zero positions; per-person/per-expense breakdowns; canonical deterministic suggestions; disputed groups pause suggestions; projections never post money or redirect source obligations. |
| I6 | Immutable refunds with independently exact received/share-credit axes; versioned corrections including settled bills; retained settlement/reversal history; stale private source detection; explicit private reclassification/funding correction or attributed retained-evidence review; Dashboard and distinct group/private reporting. |
| I7 | Existing Finance/card/Add Expense/files evidence; private settlement/refund linking and clearing; personal Calendar follow-ups with existing opted-in reminders; authorized group export; trusted private export/recovery; H bundle compatibility; lifecycle/history/revocation; responsive native keyboard workflows. |

## Authority, history and security

- Group data is independent of private workspace ownership. **116 declarative tables / 200 migrations**, through `0199`. I adds 22 forced-RLS tables: 16 in sharing, one audit, four private Finance and one operational provenance table. Published H migrations `0000`-`0155` are unchanged. Migration metadata for the earlier checkpoint remains intact.
- Runtime roles remain non-superuser/non-bypass/non-inheriting. Authentication, queue and worker roles have no shared-table access. Operators use narrow lifecycle/retention commands. Fixed-search-path predicates avoid recursive RLS. Group owners receive no private account/card, ledger, workspace or Career authority.
- Group commands serialize on the group row, recheck active identity, then lock the acting owner's profile/workspace when private posting is needed. Lifecycle and restore lock visible groups in ascending order before private scope. Rejected foreign uploaded bundles cannot acquire an invisible group's mutex; a restricted-role concurrent-lock regression verifies this boundary. The opaque historical private mutex returns no group data or write authority; former members can independently correct/review private evidence while group writes remain forbidden.
- Joining requires consent to history policy version 1. Exit captures bills visible then, including their future corrections and authorized settlement resolution. Unrelated later records stay hidden. Settlement timestamps use the actual database clock, preventing a transaction begun before exit from exposing a newly created unrelated record. Rejoining creates another interval and does not restore an owner role automatically.
- A manual identity never grants login authority. Claims require owner nomination, a verified target email, a random 256-bit token, explicit review/consent and unchanged group version. Review includes bill sources, refunds and settlement confirmation limitations. A later claim never upgrades historical manual evidence into authenticated receipt.
- Tokens are fragment-delivered, hash-only at rest, seven-day, single-use and bound to the verified recipient. Revocation, expiry and inviter removal prevent acceptance. Contacts/tokens are absent from group command results, audit metadata and authorized history exports. Secure manual link handoff is operational; an automated invitation-email workflow is not advertised.
- Every group mutation requires fresh permanent command/audit evidence and aggregate version advance. Changed payloads cannot reuse keys. Replays return compact original results after later changes. Deferred constraints independently validate finalized totals, immutable identities, state/authority and source allocation integrity.
- Approved account deletion locks groups first, purges only owned private data/proofs, detaches/pseudonymizes shared structured identity and retains immutable shared facts. Ownerless groups archive automatically. Free-text shared descriptions/reasons can still identify people; production policy review remains necessary.

## Exact accounting and settlement decisions

- All components use bigint/decimal strings; aggregates use PostgreSQL numeric. No monetary Number conversion. Both payer and share sums equal every finalized bill independently. Canonical participant UUID order determines equal-split remainder recipients; prior revisions do not enter current totals twice.
- Attribution policy version 1 offsets own paid/share, then matches remaining debtors/creditors in UUID order per bill after refunds. Pairwise reciprocal edges net across bills with explanations intact. Whole-group suggestions match net debtors/creditors deterministically. There is no unproven minimal-payment-count claim.
- Indirect discharge/agreement automation is unsupported. The UI labels suggestions requiring agreement and does not turn them into authorized redirection. A real payment to a different person requires explicit advance acknowledgement and does not erase original source obligations. Suggestions and previews do not write financial actions or journals. Disputes pause group suggestions.
- Reported payments are pending and affect only explicitly labeled projected views. Recipient confirmation alone changes confirmed group positions. Manual/deleted recipients require owner-entered confirmation with explicit unavailable-authentication evidence. Dispute/cancel/reverse events preserve actor, reason, previous/next state and immutable allocation/source revisions.
- Each payment allocation must be positive, unique per bill, refer to a current visible revision and fit that recipient's remaining per-bill obligation at report and confirmation. Full/custom allocation is deterministic; selected mode permits partial and multiple bills. Changed pending sources require cancellation and a reviewed report. Unallocated/over-net money requires explicit acknowledgement and creates a visible advance/reverse position. Component limits remain PostgreSQL bigint.
- Full settlement validation under caller RLS checks all source caps, relationship-wide advance acknowledgement and exact receipt evidence. Each child allocation's trigger checks its sealed total separately; the existing fresh-report guard, positive immutable allocations and immutable payment terms preserve integrity even after forced immediate parent validation. This trigger-only, fixed-search-path definer reads only its concrete group/payment aggregate and has no caller-executable grant. It avoids repeating all source validation for every child in a large full payment.
- Refund received and consumed-share-credit axes independently equal the refund total; cumulative per-person allocations cannot exceed current paid/share. Prior payments remain historical. Current group spending is gross bills less shared refunds. Corrections contradicting retained refund caps fail closed. Refund records are immutable append evidence.

## Independent private reconciliation

- Private funding equals the person's contribution, spending their consumed share, and the difference their group receivable/payable. An unpaid share creates spending/payable without cash/card. Existing cash/card purchases are replaced as the same logical action with reversal/replacement history, retaining actual funding. Dependencies are checked before conversion. Other participants never post automatically.
- A pending private settlement records actual money once against clearing. Confirmed/current adopted coverage permits group classification; incomplete coverage retains clearing. Confirmation/reversal does not repeat or return cash. Exact closed-report reassignment may reuse the same private movement only for identical parties/date/amount after cancellation/reversal; old accepted revisions remain immutable.
- Refunds may credit actual cash/card independently from consumed spending. Incomplete adopted bill coverage stays in clearing until reviewed. Card activity follows actual revision/card movements, including zero-net corrections, without duplicating liability.
- Bill corrections leave private accepted pointers untouched. A private owner can keep actual funding while correcting their share, or explicitly acknowledge an actual funding correction. The correction form has one private category control; funding controls appear only with explicit consent bound to the current source hash and accepted pointer. A changed preview requires fresh consent. Removing their entire allocation supports a zero-source private void with full prior reversals. Linked ordinary correction/refund routes remain guarded; explicit group reconciliation is required.
- An owner may instead record `retain_private_evidence` with a reason, exact current source hash and accepted link pointer. This creates permanent attributed metadata/audit/receipt only: no posting, action or financial revision advance. It remains a reviewed difference, not synchronized evidence. A new source/hash or accepted pointer requires another review. Another group owner cannot read or approve it.
- Existing private component limits remain 100,000,000,000 minor units. Larger valid group allocations remain unposted privately. Existing tracked-net/report definitions are preserved; private group receivable/payable/clearing appear separately with coverage labels. Group totals are never presented as a private ledger reconciliation.

## Cross-domain boundaries and portability

Dashboard shows pending confirmation, unlinked own settlement/refund coverage, changed private evidence and recent bills affecting the current person. Group pages show confirmed/pending/projected values distinctly. Personal follow-ups create ordinary private Calendar events on a user-chosen date; existing event reminders/email require opt-in and manual completion/cancellation. No shared due date or automatic other-member notification is invented. Private Finance action links retain existing Files support; file bytes are never shared by group membership.

Private bundles include four own group-evidence tables, related Finance/audit/receipt history and no shared authority. Server-owned permanent checksum provenance is excluded from user bundles. Only unmodified same-workspace trusted exports/recovery can restore adopted history. Exact-row deferred restoration guards and composite FKs remain active; predecessor links are checked at commit to permit canonical row ordering. Recovery comparison uses the stored recovery snapshot, not the current graph. Review decisions include approval audit/receipt completeness. Restoring older private evidence leaves current shared sources untouched and can correctly require review.

Accepted H format-2 bundles are checksum-verified before normalization, using the exact H registry fingerprint. Four absent private-group descriptors become empty collections; H bundles containing group actions/accounts are rejected. Unknown schemas fail. Original downloaded export bytes/checksum are preserved. Modified/foreign adopted bundles fail closed. Separate group-history JSON is authorized by current RLS, excludes private funding/invitation secrets and is explicitly non-restorable.

## Reviewed bounds

100 participant identities/group; 100 revisions/bill; 100 explicitly selected bill allocations/payment; 1,000 bills/refunds/settlements/group; 10,000 current source positions; 100 source revisions per manual-claim review. Bill pages paginate 50, person source presentation 100, group selection 100, activity/invitations 50. All balance totals derive from the complete bounded source snapshot, not the visible bill page. Private/group exports are 10 MiB/10,000 rows. Existing H CSV/file limits remain. Larger capacity requires separately profiled support.

## Consolidated verification evidence

One comprehensive phase began after implementation and critical boundary checks stabilized. All required local gates passed. Affected failures were fixed and rerun without reducing assertions. Synthetic privileged setup/teardown is scoped and guarded; acceptance uses restricted runtime roles.

| Gate | Result |
| --- | --- |
| Lint / TypeScript / formatting | Final full `pnpm check` passed; the later browser-only loading-boundary wait passed affected lint/format checks |
| Full unit/API/component regressions | 1,062 tests / 146 files passed; a further correction-form regression and affected component rerun passed 13 tests / 3 files, covering 1,063 distinct tests overall |
| Full integration regressions | 657 tests / 71 files passed; final affected sharing/portability checks passed 55 tests plus one new forced-immediate allocation regression, covering 658 distinct tests overall |
| Fresh/upgrade/replay/schema/role proofs | All 13 chain modes passed at 200 migrations. Dedicated H-to-I upgrade preserves exact bigint sentinel, replay changes nothing, all 22 tables force RLS, predecessor FK is initially deferred; schema generation reports no drift across 116 tables |
| Complete production Linux build | Final supported pinned Linux artifact passed TypeScript and standalone generation with all 200 migrations/current queries. Request-time release gate remains dynamic when built disabled and enabled at runtime; existing H dynamic-filesystem tracing warning remains |
| Full browser/mobile/keyboard/Axe | All 59 distinct scenarios passed across the full 58/59 run and affected reruns. All 5 sharing/accessibility cases passed after localized fixes; both sharing workflows also passed against the final backend/artifact, including a focused rerun waiting for streamed group content before Tab. Chrome 155, 320px, long names, light/dark Axe, keyboard and 4x CPU interaction checks; mobile screenshots visually inspected |
| Encrypted backup/actual restore/deletion | Passed: actual pg_restore, shared history/private clearing/review provenance, exact balances, revoked credentials, approved scoped deletion and other-owner preservation |
| Restricted web/worker/backup containers | Final current web/worker/backup images passed non-root artifacts, restricted roles, health/private API, worker shutdown and fail-closed backup tooling |
| Production dependency audit | Passed: no known vulnerabilities |
| Household and sharing performance | Passed. Household: 10,000 actions / 60,042 postings, 1,000 applications/events, ten debt schedules, 100 users / 20 active. Command max 248.27 ms, history p95 173.08 ms, Dashboard 518.75 ms, financial report 569 ms, concurrent reads/commands 41.25/488.58 ms. Sharing: 200 bills / 800 positions / four people, 51 confirmed and 57 pending reports; warmed group/Dashboard/private-report/command p95 628.72/148.46/248.24/486.48 ms. Full 180-bill report/confirmation 1,846.63/1,574.66 ms, each below its 5,000 ms large-allocation guard. Net-zero and unchanged private money/action/revision evidence hold; original routine budgets unchanged |

Browser QA corrected request-time feature gating for builds created with the feature disabled, explicit accessible selectors for native controls, fresh funding consent, duplicate private category controls, and focused skip-link contrast in dark mode. Assertions and contrast thresholds remain unchanged. The supported final production artifact was built on Linux; no native Windows standalone packaging acceptance is claimed.

Performance QA added the current-revision lookup index, reuses materialized visible bill snapshots, and filters pair output after complete canonical attribution. The 180-bill check caught quadratic child validation (251,747 ms); sealed totals reduced the final report to 1,847 ms while preserving the full parent validator and explicit advance acknowledgement in every mode. A restricted-role regression forces parent checks before an extra child insert and verifies exact constraint rejection plus rollback. These measurements establish local evidence at the recorded fixture sizes, not a production capacity guarantee.

## Required scenario evidence index

**All 40 approved scenarios passed.** This index maps each to executable evidence. `sharing` means `tests/integration/sharing.test.ts`; balances/components/API names refer to `tests/unit/sharing-*`; browser means `tests/browser/sharing.spec.ts`.

| # | Required scenario | Evidence |
| --- | --- | --- |
| 1 | Registered group | sharing verified invitation/claim; registered browser |
| 2 | Manual participant | sharing identity/claim; manual browser |
| 3 | Single payer equal split | sharing bill/private adoption; registered browser |
| 4 | Multiple payers | sharing multi-payer/partial funding; manual browser |
| 5 | Exact payer total | domain validation; raw deferred SQL totals |
| 6 | Exact share total | domain validation; raw deferred SQL totals |
| 7 | Selected members | sharing exact/subset sources and removed allocation |
| 8 | Exact custom shares | sharing corrected exact-share revisions |
| 9 | Reciprocal netting | balances; sharing reciprocal/full/concurrent report |
| 10 | Net-zero positions | balances; sharing all confirmed/refund/correction paths |
| 11 | Sources intact | balances explanations; sharing immutable revision history |
| 12 | Pairwise explanations | balances; settlement components/group browser |
| 13 | Group suggestions | balances canonical matching |
| 14 | Nonposting suggestions | pure engine; sharing performance financial-evidence invariant |
| 15 | Full settlement | sharing reciprocal full payment; performance full 180-bill report/confirmation |
| 16 | Custom partial | sharing clearing; registered browser |
| 17 | Selected expenses | sharing multi-bill; manual browser |
| 18 | Partial selected bill | sharing multi-bill; components/manual browser |
| 19 | Multi-bill payment | sharing selected multi-bill confirmation/reversal |
| 20 | Overpayment/reverse | balances; sharing acknowledged overpayment/dispute |
| 21 | Pending before confirmation | sharing exact group/private clearing; registered browser |
| 22 | Waiting for others | settlement components; registered browser |
| 23 | Needs my confirmation | settlement components; registered browser/manual controls |
| 24 | Confirmed updates | sharing authenticated/manual paths; registered browser |
| 25 | Dispute unchanged | sharing overpayment/dispute/cancel; balances |
| 26 | Manual limitation | sharing receipt/claim history; components/manual browser |
| 27 | Versioned correction | sharing settled correction/private stale history |
| 28 | Refund after settlement | sharing manual confirmation/refund/claim; manual browser |
| 29 | Existing cash nonduplication | sharing existing purchase conversion |
| 30 | Integrated Add Expense | sharing atomic/replay; form components; registered browser |
| 31 | Card nonduplication | sharing existing/new card, correction and card refund |
| 32 | Private funding hidden | sharing foreign/private reads; registered browser DTO |
| 33 | Owner private isolation | sharing owned preview/RLS/review; foreign browser |
| 34 | Former history only | sharing removal/later corrections/long-started transaction |
| 35 | Global/group attention | sharing Dashboard; settlement components/browser summaries |
| 36 | Exact rounding | domain/balances; sharing bigint/equal; manual browser |
| 37 | Idempotent writes | sharing command/accept/adoption/effect/review replays |
| 38 | Concurrent invariants | sharing bill race, stale versions and report/confirm replay |
| 39 | Mobile/reflow | manual browser 320px, long names, themes and CPU throttle |
| 40 | Keyboard/accessibility | components; browser native keyboard + light/dark Axe |

## Operational gates and final integration

See `../V2_I_MANUAL_SETUP_AND_PRODUCTION_CHECKLIST.md` for exact setup, flags, role/TLS secrets, personal reminder provider, invitation maintenance, retention/legal policy, backup provenance/deletion recovery, capacity, monitoring and staging/human accessibility checks. These are production gates; missing external credentials do not invalidate independently tested local behavior. No automatic invitation transport, redirected-discharge automation, byte-inclusive bundle, production deployment or human screen-reader certification is claimed.

Completion commit: `feat(sharing): complete V2-I shared expenses and settlements`. Resolve its accepted identity through Git history; the final completion report records the verified remote main SHA and integration result. The I1-I3 checkpoint references above remain historical. No force push is permitted.
