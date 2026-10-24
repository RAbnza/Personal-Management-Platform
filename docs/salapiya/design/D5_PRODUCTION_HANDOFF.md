# D5 — Prototype finalization and production handoff

**Finalized:** October 24, 2026 (Asia/Manila).

**Branch:** `feat/salapiya-d5-prototype-handoff`.

**Inspected baseline:** `6e22466d8036aedba09103a6caf95f083ac011e5`, matching the
refreshed `origin/feat/salapiya-d4-remaining-prototype`; starting tree clean.

The owner explicitly approved the complete Windows/Android UI/UX through D4 in
the D5 assignment. **D0–D4 are complete and owner-approved; D5 is finalized under
the owner's replacement scope: focused inspection and technical handoff.** The
original testing-heavy D5 plan is superseded, not claimed as executed. The current
UI is the accepted production visual baseline. Preserve its layouts, branding,
Geist typography, themes, navigation, floating controls and interactive workflows.
Earlier implementation/review records remain historical evidence.

All prototype records, preferences and operations remain synthetic/in-memory.
Production engineering and G0–G8 acceptance remain open; visual approval does not
certify financial correctness, security, accessibility, performance or sync.
The [blueprint](../../SALAPIYA_PRODUCT_AND_PLATFORM_BLUEPRINT.md) governs domain
and platform decisions; this handoff does not replace it.

## Existing implementation to retain

Paths below are relative to `apps/salapiya/lib/`. This is one Flutter application,
not separate platform products. `main.dart` starts `SalapiyaApp` in `app.dart`;
`gallery: true` remains a design utility. `SalapiyaShell` owns an injected or
locally created `PrototypeSession`. SDK `Navigator`/`PageRouteBuilder` handles
detail routes; an `IndexedStack` and per-destination scroll controllers retain
the five primary destinations. ChangeNotifier/ListenableBuilder coordinates
presentation. No Riverpod, go_router or chart package is currently installed;
the older roadmap shortlist is not an adopted dependency list.

| Area / source | Responsibility and retained frontend |
| --- | --- |
| `design_system/`, `gallery/`, bundled `assets/` | Theme/token roles, editorial surfaces, semantic controls, branding, exact amount display, measured floating clearance, reusable quick-action menu; retain gallery/type/craft studies as development utilities. Daylight D2 and D3/D4 are the accepted application composition, not the older gallery navigation studies. |
| `app/shell.dart`, `shell_navigation.dart`, `demo_routes.dart` | Adaptive Windows sidebar/action tray and Android capsule, source navigation, Back/Escape, focus restoration, safe insets and keyboard clearance. Preserve geometry and input behavior while connecting services. |
| `app/overview*.dart`, `activity_view.dart` | Wallet selection, bounded recent activity, daily/category chart interaction, attention and source-linked agenda. Retain presentation, exact labels, pagination and coverage disclosures. |
| `features/finance/presentation/` | Money accounts/activity, reusable `FinancialEditor` entry → preview → Edit → result, debt/payment/closure, card evidence/library, group bills/payments/private review/lifecycle, CSV review. Retain screens, disclosure and evidence relationships. |
| `features/finance/application/`, `contracts/` | `FinancialController` holds synthetic commands/receipts and money/debt/card/group state. Shared/card behavior is implemented as Dart parts/extensions of this same controller, not independent services. `ImportController` is lazily owned by `finance.importSession`. Preserve intent/effect vocabulary and representative scenarios; adapt implementation boundaries below. |
| `features/planning/` | `PlanningController(finance)` and planning/report screens: recurrence, actual links, budgets, reservations, forecast/table, filters/comparisons and source drilldown. Retain presentation and actual/expected/hypothetical distinctions. |
| `features/life/` | `LifeController`, Calendar/Agenda, Tasks, Learning, Books, Career and reminder specimens. Agenda projects authoritative source identities/versions rather than maintaining another financial ledger. Retain preset workflows and history views. |
| `features/profile/`, `app/profile_utilities.dart` | `ProfileExperience` and `ProfileController`: three onboarding paths, connection/collision, devices, backup/restore, lifecycle, help; theme/accessibility settings use `GallerySettings`. Retain reviewed choices, failure/recovery states and disclosures. |
| `features/supporting/` | `SupportingController` is owned by `finance.files`, with changes forwarded through finance/session. Files screens, source links and backup availability counts share its metadata. Retain those states and private source context. |
| `features/common/prototype_form.dart` | Shared reviewed forms, draft retention, simulated stale/unavailable results and `DemoViewState` specimens. Retain form composition and review/Edit behavior; replace demo outcomes and draft storage for production. |

Complete feature coverage and entry points are maintained in the
[screen inventory](SCREEN_STATE_INVENTORY.md), [D3 record](D3_IMPLEMENTATION.md)
and [D4 record](D4_IMPLEMENTATION.md); do not duplicate their scenario matrices.

## Synthetic implementation to replace or adapt

- `prototype/fixtures.dart`, `activity.dart` and `scenarios.dart`, controller
  `reset` seeds, fictional names/IDs, serial command IDs and fixed October 2026
  dates are demo inputs. Introduce validated identity/date/clock sources when
  their engineering slice needs them. Never seed real profiles by fallback.
- `PrototypeSession` is the current composition/reset point. It creates concrete
  controllers; screens also access their mutable lists/records and invoke them
  directly. The roadmap's fully injectable query/repository interfaces are
  **not implemented**. Retain the frontend and introduce bounded application
  command/query seams as each feature becomes real, following blueprint §7;
  simply attaching a database to this mutable state is insufficient.
- `FinancialController.preview/execute/checkResult`, `_submitted`, `_receipts`
  and `_applied` demonstrate frozen review, retry and outcomes only in memory.
  Replace demo counters, global version assumptions and simulated outcomes with
  durable commands, source-specific versions, transactional rules and receipts.
  Contracts contain useful exact values/effects but also mutable records and
  string identifiers; they are not a completed immutable production domain API.
- `ImportController` uses fixed rows and delayed loops; reports/exports show
  previews. Connect real bounded parsing, provenance, formula-safe exports,
  transactional cutoff rebasing and restart-safe batch progress later.
- Planning/Life controllers combine read derivation, validation and mutation.
  Preserve reviewed behavior while moving validated rules and persisted writes
  behind application services. Do not treat illustrative validations as the full
  inherited financial acceptance set.
- `ProfileController` strings, acting-identity controls, enrollment/restore
  selectors, lock/deletion flags and `recoveryCopies` simulate outcomes. They
  provide no authentication, access control, encryption or durable recovery.
  Preferences and the global `prototypeDrafts` map are transient; production
  drafts must be scoped to profile/source/version, protected and recovered safely.
- `SupportingController` stores metadata only, even for a state named Downloaded.
  There are no attachment bytes, scanner, filesystem picker, OS notifications,
  actual archives or network adapters. Never turn a selected specimen state into
  a real success indication.

## Connecting real services without rewriting the UI

Proceed only in separately assigned engineering slices. Keep the approved
presentation and substitute the behavior it calls; do not add empty layers or
change provider choices during handoff.

| Integration | Required connection and gate |
| --- | --- |
| Domain commands and queries | Port canonical web semantics/examples into pure Dart rules with backend parity fixtures. Return bounded read models with source IDs, versions, coverage, freshness and pending inclusion. Preserve review snapshots and structured failures. Validate exact ranges and concurrency in G3. |
| Local persistence | SQLite through the G0-validated compatible stack owns records, protected durable drafts and pending intent. Local-only actions commit the whole action/evidence atomically. Reactive queries feed the existing screens; balances and Calendar remain derived. Define fresh local migrations and upgrade recovery, never replay web migrations in SQLite. |
| Identity | Supabase Auth/Google remains the gated selection. Connect reviewed onboarding/connection intents to supported callbacks and resumable enrollment. Stable profile/device/participant identities replace names. Initial retrieval must expose complete relevant coverage before financial totals; a populated-local/cloud collision preserves/exports local data and offers explicit switch/cancel, without merging. G2 proves this. |
| Sync and financial acceptance | PowerSync remains the gated transport, with independently authorized Supabase PostgreSQL commands. Persist pending intent atomically; authenticate and validate a whole command on the server; record action/evidence and receipt in one transaction. Reuse original ID/payload on retry; reject ID/payload mismatch. Reconcile receipt plus downloaded checkpoint before removing an overlay, without duplicate money. G1/G3 must prove the exact adapter/queue arrangement and per-command offline policy. |
| Recovery and lifecycle | Connect backup/restore reviews to versioned encrypted archives and explicit attachment coverage, protected credentials and independent recovery secrets. Reconcile original receipts, current identity, tombstones and membership before restoring pending work. Preserve cancel/failure paths; do not reactivate authority from a cached backup. G4/G8 remain open. |
| Files and native integration | Keep private metadata/status separate from authorized storage and actual byte availability. Isolate picker/cache/preview/scanning and credential/notification/background adapters. Persist reminder intent by source generation; device-local permissions/scheduling remain distinct from synced records. G0/G5/G8 supply platform evidence. |

Local-only private data is locally authoritative. Connected private/group accepted
state is server-authoritative with explicit pending local work. Expired tokens
pause sync without blocking initialized private offline access. UI saved/synced/
recipient-confirmed labels must reflect distinct real states. No mock success
fallback may remain in a production service path. Keep demo composition explicitly
separate when a real entry point is introduced; the current default entry point
always launches the demo.

## Correctness, privacy and ownership boundaries

- Use exact integer minor units/lossless serialization. Chart coordinates may be
  approximate; totals/labels/allocations may not. BigInt demo arithmetic does not
  prove SQLite/driver/server ranges or aggregate overflow safety.
- Preserve immutable correction/reversal evidence, source relationships, expected
  revisions and dependency rejection. Never directly edit balances or use
  last-write-wins for financial facts. Cutoffs/imports must not repeat openings.
- Keep cash, recognized expense, debt/card liability, provider evidence, unresolved
  allocations and expected plans distinct. Card payments do not repeat spending;
  plans/reservations/forecasts do not post money or manufacture assets.
- Group payers and shares each equal the exact bill total; positions sum to zero.
  Preserve deterministic remainders, selected-source caps and advances. Recipient
  confirmation and group reversal do not repeat or invent private cash movements;
  received refunds and consumed-share credits are independent axes.
- Active members create bills; creators correct their bills; registered recipients
  confirm receipts. Owner membership powers never grant private-ledger authority.
  Authenticate/authorize commands, files and replication scopes independently;
  display restrictions and client IDs prove no permission. Removed members retain
  only entitled history/relevant corrections, not unrelated future bills.
- Preserve genuine private spending if shared acceptance fails or group facts
  change. Require explicit own-private adoption/follow-up. Keep private funding,
  attachments, notes and exports out of group access. Do not log records/secrets or
  ship service credentials. Hiding amounts and locking the demo are not encryption.
- Civil dates remain dates; timed events need UTC plus IANA timezone context.
  Calendar/reminders project one authoritative source and cancel obsolete
  generations. Production timezone/DST and restart behavior remain engineering work.

Authoritative examples remain in the blueprint and linked domain references;
preserve the executable web application, tests, migrations and pnpm tooling.

## Focused inspection, limits and outstanding decisions

Source inspection traced the five shell destinations, quick-action mappings,
Overview source dispatch, Money subviews, Life editors, first-run/profile entry,
shared lifecycle and contextual files through existing controllers. No clearly
identifiable critical navigation blocker or unfinished active destination required
an application change. This is a focused source inspection, not a fresh runtime
or exhaustive correctness certification.

| Finding / gap | Production disposition |
| --- | --- |
| Older `DestinationPreview`, `SourcePreviewPage` and `FirstRunPage` in `app/previews.dart` have no active external callers; `DemoActionPage` remains the shell's fallback for unmapped labels. | Current known quick actions map to real prototype editors. Leave historical code in D5; remove obsolete previews/fallback deliberately when composing real routes so they cannot mask a missing integration. |
| Overview's 15–21 October chart/category/activity study remains a fixed fixture; wallet balances and Money Today follow session finance. Some source links open a workspace/tab rather than a selected record. | Preserve appearance; feed coherent queries and stable source navigation when integrating actual data. Never label fixture charts as live analytics. |
| Direct controller/mutable-model coupling, process-global drafts and in-session profile recovery copies. | Introduce feature-sized interfaces, scoped durable drafts and atomic profile activation/recovery with disposal/version checks. No large D5 refactor. |
| Storage/auth/sync/recovery stack and server command enforcement are absent. | G0–G4 remain open. Resolve SDK compatibility, local-only storage, encryption/key recovery, command offline matrix and parity/receipt/checkpoint mechanisms through evidence, not package assumptions. |
| Distribution, physical devices, accessibility/performance and operations unaccepted. | G5–G8 remain open: stable IDs/signing/upgrades/callbacks, real notifications, Narrator/TalkBack and representative capacity/device proof, measured cost/quotas, file safety/retention and owner-loss/deletion policies. |

No critical blocker to this D5 handoff was identified. The open gates block
claims of production readiness and substantial P1 work. Exact compatible packages,
supported devices, production state/routing approach, cloud configuration/cost
ceiling and operational recovery policies remain decisions to validate, not
decisions closed by the approved screens. L05–L07 remain deferred scope.

## Verification and next assignment

D5 changes documentation only. Relative links/source paths, Git whitespace and
change scope were checked. No Flutter suite, analyzer, builds, native campaigns,
screenshots, accessibility or performance reports were rerun. Historical D1–D4
verification stays in its original records; no new acceptance is inferred.

Next: assign **remaining P0 item 1 — dependency/device compatibility (G0) plus
early cost feasibility (G7)** from [P0 next assignments](../P0_NEXT_ASSIGNMENTS.md).
Prove the minimal SQLite/PowerSync/Supabase/credential stack together on Windows
and Android; retain the approved frontend while doing that bounded proof. Follow
the remaining exact-money, receipts, enrollment and protected-recovery proofs
and consolidate G0–G4 before substantial P1 local Money implementation. P2–P6
remain the blueprint sequence, not work started by D5. No merge into main,
deployment or production implementation is part of this finalization.
