# Prototype architecture, milestones and review gates

**Status:** D1–D5 sequence approved. D1 implemented for owner visual review;
see [implementation and verification](D1_IMPLEMENTATION.md) and
[review artifacts](review/d1/README.md). D1–D5 are design milestones, separate
from P0–P6 engineering. D2 requires the next owner assignment; it has not started.

## Architecture for reusable presentation

Start with a small gallery, then introduce layers when their first consumer
exists. Keep one Flutter application with platform adaptations, not separate
Windows and Android feature trees. Proposed future paths under `apps/salapiya/`:

| Boundary                | Proposed location                      | Responsibility                                                                                       |
| ----------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Design system           | `lib/design_system/`                   | Themes, tokens, reusable semantic controls, craft primitives                                         |
| Gallery                 | `lib/gallery/`                         | Navigable specimens, state/theme/scale comparison controls                                           |
| App shell/routing       | `lib/app/`                             | Route composition, navigation and accessibility preferences                                          |
| Feature presentation    | `lib/features/<feature>/presentation/` | Screens/adaptive composition; renders read models and emits intents                                  |
| Application state       | `lib/features/<feature>/application/`  | Draft, review and result state transitions; coordinates interfaces                                   |
| Domain-facing contracts | `lib/features/<feature>/contracts/`    | Immutable read models, exact money values, query/preview/command interfaces; no Flutter dependencies |
| Synthetic adapters      | `lib/prototype/`                       | Seeded fixtures, scenario clock, in-memory data sources, fault scripting and reset                   |
| Platform adaptation     | `lib/platform/` only when needed       | Input/system preferences or scoped plugin adapters, not duplicated business logic                    |
| Checks                  | `test/`, `integration_test/`           | Widget/state/fixture tests and both-platform runtime journeys                                        |

Dependencies point inward: screens → application controller → interfaces.
Synthetic adapters implement those interfaces and are injected at the composition
root. Components never import mock repositories, parse money or directly mutate
lists. Keep feature business rules out of the gallery.

Proposed interface shapes (concepts, not implemented Dart signatures):

- **Queries** return bounded immutable records, explicit coverage/as-of and
  pending inclusion; a visible page cannot masquerade as a total.
- **Preview commands** accept exact amounts, source IDs, dates, versions and
  scope; return labeled effects, warnings and validation issues.
- **Execute intents** accept a reviewed snapshot plus stable demo command ID;
  return simulated accepted/rejected/unknown/stale outcomes. The prototype
  controller maintains idempotent in-session scenario behavior.
- **Profile/recovery services** expose scenario states and synthetic manifests,
  never actual credentials, local file paths or OAuth/browser side effects.

Use separate types for profile, financial account, group participant and source
record IDs; separate `SyncState`, `SettlementState`, `Coverage` and
`CommandOutcome`. Monetary fixtures use exact integer minor units/lossless
strings. A UI draft retains entered decimal text until validated. A chart gets
exact labels separately from approximate plot coordinates.

D1 can use local widget state for specimen toggles. D2 chooses one application
state/routing approach after the bounded compatibility review; do not introduce
multiple frameworks. In D3 onward, screens call application interfaces once,
so validated persistence/services can later replace mocks without rewriting the
presentation. A synthetic preview is illustrative, not the production domain
validator; future integration must reconcile it against G3 fixtures.

Prototype mode is explicit in the entry point/build configuration introduced by
the assigned implementation, with a persistent “Demo — synthetic data” banner
and reset action. All state is memory-only; process termination intentionally
resets it. Keep real adapters absent, rather than relying on a UI switch to
prevent accidental real writes. Later production work must verify no mock
fallback can silently return a financial success. Do not build empty layer
scaffolding in D1 just to match this proposed tree.

## Package evaluation shortlist

Official package pages checked October 21, 2026. Versions below are observed
research snapshots, **not selected pins**. Recheck exact SDK constraints, source
license, changelog and transitive graph at implementation. Each added direct
dependency needs a bounded exercised Windows/Android proof and a lockfile entry.
Package listings and downloads are not G0 acceptance.

| Candidate                                                                                            | Snapshot / license evidence                                         | Use and decision                                                                                                                                                                                       | Required local proof                                                                                            |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Flutter SDK controls, ThemeData/ThemeExtension, Form, Focus, Shortcuts/Actions, Semantics, Navigator | Existing P0 SDK baseline                                            | **First choice** for buttons, inputs, menus, dialogs, base navigation and small tables. Own Salapiya compositions above them.                                                                          | Keyboard/touch/IME, screen-reader semantics, both themes and scaling                                            |
| [flutter_svg](https://pub.dev/packages/flutter_svg)                                                  | 2.3.0; MIT; Flutter publisher; Android/Windows listed               | Evaluate for supplied branding and future simple decorative SVGs. Do not assume existing filters/images work.                                                                                          | All six logo files, alpha/mask/filter comparisons and cold asset decode on both                                 |
| [flutter_riverpod](https://pub.dev/packages/flutter_riverpod)                                        | 3.4.3; MIT; Android/Windows listed                                  | Preferred state/adapter-injection candidate for D2 onward; no code generation needed just for the gallery                                                                                              | Scenario overrides, draft retention, disposal and no stale cross-profile state                                  |
| [go_router](https://pub.dev/packages/go_router)                                                      | 18.1.1 page observed with package analysis/license metadata pending | Preferred routing candidate, **exact version/license eligibility unresolved**; inspect release archive/license and installed-SDK fit before selection. Flutter Navigator is sufficient for D1 gallery. | Five branch stacks, source drilldown return, dirty routes, Android Back/predictive Back, window resize          |
| [fl_chart](https://pub.dev/packages/fl_chart)                                                        | 1.2.0; MIT; Android/Windows listed                                  | Evaluate only when report/chart consumers need it; no compulsory chart dependency in D1                                                                                                                | Exact table alternative, keyboard/touch points, reduced motion, signed/zero/missing values, bounded performance |
| [two_dimensional_scrollables](https://pub.dev/packages/two_dimensional_scrollables)                  | 0.5.5; BSD-3-Clause; Flutter publisher; Android/Windows listed      | Conditional for large native tables after SDK bounded-table baseline; not an automatic addition                                                                                                        | Lazy build counts, pinned headers, selected-record focus and Narrator/TalkBack reading                          |

Use existing SDK icons for the initial gallery; select a consistent outlined
functional style and accessible labels. A separately bundled icon family can be
evaluated if required to match the approved visual proof, with license and glyph
mapping recorded. Do not use the brand symbol as a generic functional icon.

The separate [go_router license page](https://pub.dev/packages/go_router/license)
returned 18.1.0 with BSD-3-Clause text and Android/Windows listings while the
package landing page returned 18.1.1 with analysis pending. This establishes
license evidence for the earlier displayed release, not a verified archive for
the newer one. Resolve that version-specific discrepancy when selecting a pin;
do not install the newest release solely because it tops the listing.

Do not install a full Fluent/Material replacement suite solely to style the
shell. Do not add a dock package for a small composition of semantic buttons.
No Lottie/Rive, blur/shader package, runtime font downloader or extra animation
engine is required. File pickers, secure storage, SQLite, PowerSync, Supabase,
Google sign-in, notifications and real backup libraries remain bounded
engineering work outside the synthetic design milestones.

## Common milestone evidence

Every D1–D5 slice is implemented/shared once and exercised on **Windows and the
Android emulator before moving to the next slice**. Do not finish the Windows
product and then port it. P0's working toolchain is the starting evidence, not
proof for newly added packages.

For each slice:

1. Record commit, Flutter/Dart/dependency versions, platform/device, logical
   viewport, text scale, theme, motion preference and fixture/scenario ID.
2. Run focused Dart formatting/analyzer/widget or state tests, then Windows and
   Android builds/runtime input checks appropriate to the actual changes.
3. Capture paired screenshots and short task recordings, including failure and
   enlarged-text states. Include an explicit pass/fail/blocked ledger; a
   screenshot alone is not interaction acceptance.
4. Manually exercise keyboard/Narrator and touch/TalkBack for the consequential
   flow introduced in that slice. Record exact failures; automated semantics
   checks do not substitute.
5. Request owner review against named decision IDs and retain rejected
   alternatives as evidence, not active competing themes. A milestone is not
   accepted until its required review is recorded.

Test widths include Android 320/360/412 logical pixels and landscape, Windows
640/900/1280/1600; include below-breakpoint resize and a short 480-high viewport.
These are layout tests, not a certified minimum-OS/device support matrix.
Test text 100/150/200% and supported OS maximum, both themes, reduced motion,
high-contrast preference, keyboard/IME and safe areas.

Performance measurements run in profile/release mode, not debugger startup.
Proposed design budgets: visible input feedback within 100ms; p95 build/raster
times within the device refresh budget (16.7ms at 60Hz); no persistent animation
while idle; ordinary list interaction does not instantiate all 10,000 rows.
Measure cold usable-screen time, memory and logo/font decode; use blueprint's
rough 2-second cold-screen target as a starting comparison, not a D0 result.
Record device, fixture, run count and percentiles. Emulator data cannot certify
representative physical Android performance or G6.

## D1 — Theme and interactive component gallery

**Prerequisites:** Owner assigns D1 and records D0 choices or explicitly
authorizes a bounded A/B visual comparison. Font choice may remain a proof
comparison, but production adoption is not inferred.

**Scope / screens:** Navigable gallery home and categories for foundations,
actions/fields, summaries/lists, navigation specimens, overlays/reviews,
feedback/charts, branding and craft. Implement the inventory in DESIGN_SYSTEM
as reusable components with synthetic state controls. Charts may begin as
bounded data/table specimens while the package is evaluated. Demonstrate both
directions only in a small comparison board; avoid two complete theme systems.

**Acceptance:**

- Theme roles replace arbitrary per-widget colors. All protected branding
  passes fidelity checks or has an explicit renderer blocker and proposed
  fallback; no silently damaged symbol.
- Compare selected font files on both platforms; verify peso/tnum/diacritics,
  scaling, licensing and offline availability. Record actual bytes.
- Buttons, inputs, labels, errors, keyboard focus, amount presentation, dialogs,
  disclosure, lists and status combinations function in the gallery.
- Both themes, large text and reduced motion retain readable controls/amounts.
  Owner reviews and selects visual direction/type/surface intensity.

**Review artifacts:** Windows/Android contact sheets; A/B components with
identical content; typography specimens; logo comparison; interaction clips;
token contrast report; dependency/license record; unresolved-issue list.

**Testing:** Widget semantics/target-size/overflow checks and focused interactions;
exact formatting fixtures; restrained golden snapshots for important
compositions, not every trivial wrapper; native keyboard/touch/modal tests.

**Exclusions:** Complete shell/Overview, full financial forms, storage/auth/sync,
launcher icons, real files, production dependency-gate closure. D1 is the first
major visual checkpoint, not an approved financial feature.

## D2 — Navigation and Overview proof

**Prerequisites:** D1 visual direction accepted, navigation primitives accessible,
bounded router/state selection recorded.

**Scope / screens:** Windows expanded/collapsed rail and contextual dock; Android
A/B navigable shell; five destination landing placeholders; Overview with money,
attention, obligations and Life; first-run three-choice stub and profile/sync
status specimens. Add in-session routing, filters and source drilldown return.

**Acceptance:**

- All five destinations discoverable in both Android concepts; no sixth
  Activity destination. Dock has actions only.
- Resize/large text/short height never covers the final item, focus or action;
  measured clearance and fallback layouts work.
- Back, dialog dismissal, context action scope and draft protection behave
  consistently. Overview communicates incomplete/pending/local-only states.
- Owner compares A/B doing the same tasks: locate debt, add an expense, review
  a group item, open a Life task and return. Record errors/hesitation/steps;
  small owner testing is qualitative evidence, not a statistical usability claim.
- Owner explicitly selects Android navigation and accepts Windows geometry.

**Review artifacts:** Both navigation clips and comparison rubric; wide/narrow/
IME screenshots; focus-order map; populated/empty/incomplete Overview; decision
record for P04/P05.

**Testing:** Route-state and Back tests; native resize and keyboard/touch journeys;
Narrator/TalkBack destination/action identification; content-clearance checks.

**Exclusions:** Production search/indexing, real onboarding, persistent
preferences, full Money/Debts/Shared implementation or backend integration.

## D3 — Core financial interaction proof

**Prerequisites:** D2 shell/navigation accepted; mock interfaces and exact fixture
catalog stable enough for task flows.

**Scope / slices:** (a) accounts/expense/income/transfer/activity and corrections;
(b) debt import/borrowing/payment/allocation/schedule/settlement and representative
card/statement/installment flow; (c) shared bills, multiple payers, deterministic
shares, settlements/advances/refunds, permission states and private adoption;
(d) import/cutoff/partial-batch review specimen. Each slice reaches both platforms
before the next. Complete the D3 rows in SCREEN_STATE_INVENTORY.

**Acceptance:**

- Entry/review/Edit/Simulate/result and validation/stale/unknown paths retain
  input and exact values. Consequential actions disclose date, source, amount,
  scope and financial effects.
- Mobile progressive disclosure retains every required advanced operation;
  Windows panels/tables offer useful context without duplicate active forms.
- Shared confirmed versus projected, sync versus recipient confirmation,
  private evidence versus group facts, and card cash/liability/spending
  distinctions are visible and correct for the fixture.
- All 40 historical Shared Expenses scenarios map to prototype interaction/
  state coverage or a specifically identified production-only check.
- Owner accepts financial interaction clarity, not financial implementation.

**Review artifacts:** J02–J08 clips; side-by-side desktop/mobile review summaries;
fixture arithmetic and scenario traceability; known versus unresolved debt
breakdown; permission/error matrix; import preview/partial result.

**Testing:** Application-state and exact-value tests; same-ID simulated retry,
stale source, retained private expense on group rejection, source caps,
split/remainder sums; keyboard/IME and screen-reader completion on both.

**Exclusions:** Production ledger/domain engine, durable draft, SQLite schema,
server authorization, actual receipts, OAuth/sync, real CSV/file import/export.

## D4 — Remaining approved product screens

**Prerequisites:** D3 core interaction patterns accepted and reusable.

**Scope / screens:** Complete remaining Money/card/installment/planning/report
screens, file/import supporting states; Life Calendar/Tasks/Learning/Books/Career
essentials; first-run/local/Google/restore simulations; sync/enrollment/collision,
backup/device/lifecycle/settings/help; group lifecycle/history/entitlement
surfaces. See all D4 inventory rows; do not add deferred L05–L07 features.

**Acceptance:**

- Every launch M01–M17, S01–S10, L01–L04 and F01–F03 row has a reachable
  presentation and relevant states, or a documented engineering-only behavior;
  no forgotten capability hidden by “remaining screens.”
- Planning/report coverage labels prevent expected, reserved and hypothetical
  values becoming actual money. Life projections point to authoritative sources.
- Three entry choices stay distinct; collision never silently merges; restore
  previews omissions/old receipts/revoked access and does not promise recovery.
- Settings distinguish pause/sign-out/removal/deletion/backup; user understands
  simulated local versus remote effects.

**Review artifacts:** Screen/state coverage ledger, J09–J12 walkthroughs,
onboarding/recovery storyboard, reports with exact tables, permission and file
availability specimens, all incomplete/error states.

**Testing:** Focused navigation/state consistency, synthetic lifecycle/failure
journeys, screen-reader labels, calendar source deduplication fixture, reports/
tables with long amounts, keyboard-safe forms on both platforms.

**Exclusions:** Real notifications, storage/scanning/encryption, account deletion,
service configuration, OAuth, portable recovery or release infrastructure.

## D5 — Refinement and design acceptance

**Prerequisites:** D1–D4 screens and review decisions recorded; unresolved issues
have severity, owner and reproducible scenario.

**Scope:** Consolidate one coherent selected visual direction; remove accidental
variants, polish both themes/resize/motion, verify accessibility and bounded
performance, and prepare presentation-to-service integration handoff.

**Acceptance:**

- No unresolved critical task blocker, hidden financial meaning, clipped money,
  color-only status or inaccessible consequential action in reviewed scenarios.
- Narrator/keyboard and TalkBack/touch complete representative tasks; all source
  links, Back and draft-retention behavior remain coherent.
- Frame/input/memory/startup evidence meets agreed budgets or documents an
  explicitly accepted limitation. Lower-capability physical-device evidence
  remains required for production G6 even if not available during design.
- Owner accepts selected design with recorded exceptions; implementation status
  remains “synthetic prototype.” Engineering gates and release scope unchanged.

**Review artifacts:** Final cross-platform/theme matrix, measured performance
report, accessibility issue ledger with retests, signed-off decision register,
component/route inventory and mock-to-real interface handoff.

**Testing:** Consolidated relevant widget/state/native suite and manual journeys;
targeted fixes trigger affected retests. No unrelated broad historical web
regression unless shared web/tooling contracts were changed.

**Exclusions:** Calling the prototype production-ready, closing G0–G4/G6 from
appearance, deployment, signed distribution, real data migration or automatic
progression into P1.

## Relationship to engineering gates

D1 can exercise a narrow UI dependency subset; G0 still covers the complete
native dependency/device stack. G1 financial transport, G2 enrollment,
G3 exact local/server parity and G4 protected storage/recovery remain unproved.
G5 distribution/platform callbacks, G6 representative accessibility/performance,
G7 costs and G8 files/lifecycle also require separate implementation evidence.
Continue the [remaining P0 assignments](../P0_NEXT_ASSIGNMENTS.md) in their own
authorized scope; neither a beautiful screen nor simulated retry closes a gate.

No calendar estimate is committed. D3 is likely the largest milestone and is
split into reviewable vertical slices above. D4 finishes the full inventory;
neither stage is permission to defer advanced finance from the approved launch.

## Recommended D1 assignment prompt

> Implement only D1 — Salapiya Theme and Interactive Component Gallery.
> Read `docs/salapiya/design/README.md` and all six linked specifications, the
> product blueprint, P0 evidence and `apps/salapiya/AGENTS.md`. Verify branch/
> merge state and base work on the reviewed D0 commit plus the native foundation.
> Record the owner's selected D0 decision IDs before implementation; where the
> owner explicitly requests comparison, keep it limited to gallery specimens.
> Build reusable tokens/components in one Flutter codebase, with synthetic
> in-memory data, both themes, protected existing logos, font comparison/proof,
> reduced motion, keyboard/touch and accessible text scaling. Evaluate only
> dependencies needed for D1 and pin tested versions/licenses. Exercise every
> slice on Windows and the Android emulator, record visual/runtime evidence and
> deliver the D1 review artifacts/limits. Stop at the gallery review checkpoint.
> Do not implement the full shell/Overview, financial features, SQLite, Google
> OAuth, Supabase, PowerSync, real backup or launcher exports; do not claim any
> engineering gate closed.

The next assignment should include the owner's creative/font choices or explicit
authorization to compare them. D0 does not presume those answers.

## D0 verification record

Performed for this documentation-only change:

- Refreshed remote refs, checked clean starting tree and merge ancestry, and
  created D0 from foundation/branding HEAD. No force push or merge requested.
- Read repository/native guidance, complete blueprint, P0 guide/results/remaining
  assignments, historical design references and representative web financial UI.
- Parsed six SVGs, recorded dimensions/bytes/embedded-image structure and SHA-256.
  Rendered unmodified assets in installed Edge and visually inspected the local
  contact sheet. No source asset edits. Native fidelity remains untested.
- Researched primary cultural, font and Flutter/package sources; kept cultural
  interpretations and package recommendations separate from factual evidence.
- Calculated 20 opaque token-pair contrast ratios; results in DESIGN_SYSTEM.
  No rendered Flutter contrast, screen-reader or performance claim.
- Documentation validation covers relative links, all blueprint feature IDs,
  synthetic fixture arithmetic, formatting and `git diff --check`. Final
  command outcomes are recorded in the completion report.

The first coverage check found F04 missing from the explicit inventory; its
out-of-scope web-operations row was added. Root Prettier ignores `docs/`, so its
initial default “pass” was not counted as formatting evidence. The actual D0
format/check uses an empty ignore file under ignored `out/salapiya-d0/` and
explicitly targets only these seven Markdown files.

Final documentation checks passed: 33 local Markdown links resolve; all 38
blueprint M/S/L/F feature IDs appear in the inventory; seven documents decode as
UTF-8 with balanced fenced blocks; ten exact fixture arithmetic assertions pass;
all six branding files match their foundation-commit bytes and registered
SHA-256 hashes. Explicit Prettier checking passes for all seven files.

No Flutter/web builds or application regression tests were run for D0 because
application behavior and configuration were untouched. No code/configuration
file has a changed final body to reproduce. Actual runtime, mock-state and
accessibility acceptance belong to D1–D5; actual finance/security acceptance
belongs to P0–P6.
