# Salapiya native design — approved prototype

> **Presentation baseline superseded - 27 October 2026.** The [final UI/UX redesign handoff](../FINAL_UI_UX_REDESIGN_HANDOFF.md) is the current implementation baseline for owner review and subsequent P6 work. Its neutral workspace, compact Windows sidebar/toolbar, Android navigation and shared form system replace D0-D5 presentation choices. Historical approvals and screenshots below remain context, not instructions to restore the former design. P0-P5 financial, identity, privacy, persistence and synchronization contracts remain authoritative. This change does not start or certify P6.

**Current status — October 24, 2026 (Asia/Manila):** D0–D4 are complete and
owner-approved, including the full Windows/Android UI/UX reviewed for D5.
D5 is finalized under the owner's streamlined finalization/handoff assignment,
which intentionally replaces the original testing-heavy D5 scope. The current
Daylight D2 composition, floating controls and D3/D4 workflows are the accepted
production visual baseline. Preserve this design.

Start with the single [D5 production handoff](D5_PRODUCTION_HANDOFF.md) for
architecture, retained frontend, synthetic replacements, inspection findings and
integration boundaries. [D3](D3_IMPLEMENTATION.md), [D4](D4_IMPLEMENTATION.md) and
the [screen inventory](SCREEN_STATE_INVENTORY.md) retain feature/scenario coverage.
All prototype data and operations remain synthetic/in-memory. Production,
security, accessibility, performance and synchronization acceptance are not
complete; G0–G8 remain open. Next is bounded remaining P0 G0 compatibility and
early G7 cost proof, per [P0 next assignments](../P0_NEXT_ASSIGNMENTS.md), not P1.

## Historical D2 introduction and review record

The dated status/review instructions below describe earlier milestones; the D5
approval above supersedes their pending-review language and earlier visual choices.

**Current:** [D2 reimagined](D2_REIMAGINED.md), a complete owner-authorized visual replacement of earlier D0-D2 selections. Implemented for review; not yet owner-approved. Historical decisions and evidence below remain available.

**Updated:** October 23, 2026 (Asia/Manila).

**Status:** D1R direction authorized by the owner's hands-on D1 review on
October 21, 2026 (Asia/Manila). Owner approved D1R on October 22, 2026 except for the repeated decorative
top line. D2-F0 is authorized first, followed by D2 shell/Overview; G0–G4 and G6 remain open.

**Scope:** Native application shell and interactive Overview, with the preserved
Design Gallery. All data remains synthetic and memory-only. D2 awaits owner live
visual approval before D3.

**Luminous Lattice is primary. Woven Calm contributes softness. Android floating
navigation B is selected. The “+” modal action menu is the intended interaction.**
Nunito Sans, Porcelain / Midnight Spectrum and the supplied branding remain.

## Read and review in this order

Start with [D2 implementation and live review](D2_IMPLEMENTATION.md).
[D1R implementation](D1R_IMPLEMENTATION.md),
[D1 implementation](D1_IMPLEMENTATION.md) and its [media](review/d1/README.md)
remain historical evidence; live application review is now the default. The
documents below remain authoritative; the October 22 D2 assignment authorizes
the shell after the D2-F0 verification gate, now passed on both platforms.

| Document                                                | Purpose                                                                                  |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [Creative direction](CREATIVE_DIRECTION.md)             | Lattice-led grammar, historical choices, cultural provenance and retained typography |
| [Branding register](BRANDING_ASSETS.md)                 | Six existing files, usage, integrity, spacing and renderer risks                         |
| [Design system](DESIGN_SYSTEM.md)                       | Proposed tokens, component contracts, accessibility and motion                           |
| [Platform experience](PLATFORM_UX.md)                   | Windows rail/dock, Selected Android B, Overview, onboarding and task interaction     |
| [Screen and state inventory](SCREEN_STATE_INVENTORY.md) | Blueprint coverage, representative finance journeys and synthetic fixtures               |
| [Prototype roadmap](PROTOTYPE_ROADMAP.md)               | D1–D5 scope, architecture, packages, checks, review artifacts and D1 prompt              |

These documents are one evolving design contract. Token values live in DESIGN_SYSTEM; screen
coverage lives in SCREEN_STATE_INVENTORY; milestone evidence lives in
PROTOTYPE_ROADMAP. Future sessions should update those sources rather than create
competing theme or navigation specifications.

## Authority and decision register

**D5-R01 — October 24, 2026:** The owner approved all UI/UX through D4, including
Windows/Android layouts, financial and Life workflows, onboarding and supporting
screens, as the production visual baseline. The owner replaced original D5
testing/refinement requirements with lightweight inspection and one technical
handoff. D5 is finalized on that basis; no production engineering gates are
accepted or waived. Earlier decisions and evidence below remain historical.

The [Salapiya blueprint](../../SALAPIYA_PRODUCT_AND_PLATFORM_BLUEPRINT.md) governs
scope, financial meaning, identity, synchronization and platform parity. The
owner's D0 and subsequent D1R assignments supply the dated decisions below.
Historical [visual guidance](../../reference/DESIGN_SYSTEM_AND_VISUAL_GUIDELINES.md),
[redesign plan](../../reference/COMPREHENSIVE_UI_UX_REDESIGN_PLAN.md) and
[M1 guide](../../reference/REDESIGN_M1_COMPONENT_GUIDE.md) remain evidence, not
instructions to recreate the web shell.

| ID     | Decision                                                                                                      | Standing and review boundary                                                                                                          |
| ------ | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| D0-R01 | Salapiya; “Your money, on your terms.”                                                                        | Approved requirement; exact spelling and punctuation                                                                                  |
| D0-R02 | One Flutter application for Windows/Android; five destinations: Overview, Money, Debts, Shared Expenses, Life | Approved requirement; full capability and financial meaning on both                                                                   |
| D0-R03 | Preserve all six branding files, transparent backgrounds and original symbol                                  | Owner requirement; no recoloring, monochrome, redraw, simplification or changed composition                                           |
| D0-R04 | Windows collapsible primary rail/sidebar plus contextual quick-action dock                                    | Owner-selected direction; detailed geometry and behavior proposed here                                                                |
| D0-R05 | Compare Android A and B before selection                                                                      | Historical D0 requirement; superseded by D1R-R02                                                                                            |
| D0-R06 | Violet/lavender, Porcelain/Midnight Spectrum, Filipino craftsmanship, soft premium personality                | Owner-selected starting direction; precise composition remains proposed                                                               |
| D0-R07 | Local profile / Continue with Google / Restore from backup are distinct                                       | Approved product requirement; prototype simulates each                                                                                |
| D0-R08 | No real authentication, storage, sync or ledger during D milestones                                           | Assignment boundary; G0–G4 remain open                                                                                                |
| D0-P01 | Woven Calm selected primary direction                                                                         | Genuinely approved during D0/D1 planning; superseded by subsequent hands-on review D1R-R01                             |
| D0-P02 | Nunito Sans selected primary typeface                                                                         | Approved baseline subject to actual license, glyph, numeric, rendering and performance proof; Geist/Source Sans 3 comparison retained |
| D0-P03 | Proposed tokens, woven geometry, highlights, layers and craft accents                                         | Approved starting implementation baseline; rendered refinements remain subject to visual review                                       |
| D0-P04 | Android A/B comparison in D2                                                                                  | Historical D0 position; superseded by D1R-R02, no D1R application shell                                                                  |
| D0-P05 | Windows rail, action dock and adaptive breakpoints                                                            | Approved initial prototype parameters; final geometry/behavior tested in D2                                                           |
| D0-P06 | Selective maintained Flutter dependency evaluation                                                            | Approved per specific need and exercised Windows/Android proof; not blanket package or G0 acceptance                                  |
| D0-P07 | D1–D5 sequence and review checkpoints                                                                         | Approved; D1 assigned, stop at owner visual review; no automatic D2/P1 progression                                                    |

### D1R hands-on review decisions (October 21, 2026)

These later owner decisions supersede the historical choices above; D0's approval
of Woven Calm is preserved, not retroactively relabeled as a mistake.

| ID | Owner decision | Rationale / boundary |
| --- | --- | --- |
| D1R-R01 | Luminous Lattice primary, Woven Calm softness retained | Owner preferred lattice after comparing the running D1 gallery. Original stepped frames, luminous edges and layered surfaces; friendly corners, spacing and clear money remain. |
| D1R-R02 | Android B floating selected | A is historical comparison only. Final shell dimensions, reachability and behavior require D2 proof. |
| D1R-R03 | Compact “+” opens modal vertical quick actions | Dimmed background, labeled icon rows, short reversible motion, Back/Escape/outside/close/action dismissal; reusable caller-defined actions, demo-only results. |
| D1R-R04 | Keep Nunito Sans | No new typography research; preserve comparison specimens. |
| D1R-R05 | Keep Porcelain / Midnight Spectrum and violet/lavender | Warm, plum and blue remain supporting accents; refine placement, not palette. |
| D1R-R06 | Gallery is a testing environment | Its sidebar and specimen arrangements are not final product shell decisions; D2 assembles shell and Overview. |
| D1R-R07 | Live application review by default for this and later milestones | No mandatory screenshot collections, contact sheets, videos or new media merely to prove appearance. Retain tests, measurements and concise reports; targeted failure diagnostics or explicitly requested captures only. Preserve existing D1 evidence. |

### Proposed revisions to earlier visual decisions

| Earlier source / decision                                          | D0 treatment                                                                                                                                               | Approval status                                                   |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Blueprint §14.3 / D19: logo deferred                               | Existing branding was subsequently committed at `aea133e`; owner now explicitly directs its preservation. Launcher exports remain later work.              | Later owner instruction recorded here; blueprint not rewritten    |
| Blueprint §14.2: Geist where suitable                              | Compare Nunito Sans, Geist and Source Sans 3; implement Nunito Sans as the approved D1 baseline.                                                           | P02 approved D1 baseline; native proof required                   |
| Web M1 D06: bottom-centered primary dock on desktop/mobile         | Native Windows uses rail for destinations and dock for actions; Android B selected by D1R-R02; shell proof remains D2.                                                              | R04 is owner-selected; exact geometry P05; Android superseded by D1R-R02 |
| Web M1 D06: Porcelain, Midnight Spectrum; ivory/cream rejected     | Preserve exact canvas/surface roles. Introduce warmth only in bounded accent regions.                                                                      | Foundation retained; accent P03 approved baseline                 |
| Web M1: one focal blend, opaque surfaces, limited active-icon glow | Keep opaque financial surfaces; propose no glow and a static capiz-like header highlight. Genuine translucency is optional, tightly bounded and removable. | P03 approved native baseline; web approval unchanged              |
| Blueprint §5: Overview may show recent money activity              | Use a Money summary and “View activity” link; detailed recent history belongs in Money → Activity.                                                         | Current owner direction; no sixth destination                     |
| Blueprint §18: P0 proof precedes substantial P1                    | D1–D5 are separately authorized presentation experiments using synthetic state; do not graduate them to production services.                               | Engineering sequence and gates unchanged                          |

No historical document is edited by D0. Acceptance of this proposal should record
the decision IDs, selected alternative, exceptions and date here. “Looks good”
must not be interpreted as acceptance of untested financial, sync or security
behavior. Approval of one direction does not approve both navigation concepts.

## D1 approval record

The owner explicitly approved P01–P07 with the boundaries above in the D1
assignment on October 21, 2026. D0 commit `7914b72310d2979b9d7d80885c587b0437585194`
and native foundation `aea133e` are ancestors of the dedicated D1 branch.
D0 is not merged into refreshed `origin/main`. Implementation remains synthetic
and memory-only. No unimplemented screen or G0–G4/G6 gate is accepted by these
visual approvals. Historical D0 inspection below is retained as dated evidence.

## Repository inspection

Inspection date: October 21, 2026. Repository:
`RAbnza/Personal-Management-Platform`.

| Evidence                    | Observed state                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------ |
| Starting branch / HEAD      | `feat/salapiya-p0-foundation` / `aea133e940f96918eae888ece372ab5c3abc9689`                 |
| Starting working tree       | Clean                                                                                      |
| Remote                      | `https://github.com/RAbnza/Personal-Management-Platform.git`                               |
| Ref refresh                 | `git fetch origin --prune` succeeded after sandbox denied writing `.git/FETCH_HEAD`        |
| Refreshed `origin/main`     | `7662ce9cb22d6aa1ca5d18ca6604b7bdb416fc66`                                                 |
| Refreshed foundation branch | `aea133e940f96918eae888ece372ab5c3abc9689`                                                 |
| Merge check                 | `git merge-base --is-ancestor aea133e origin/main` returned 1: not merged                  |
| Commits absent from main    | `77d2175` Flutter foundation; `aea133e` branding                                           |
| D0 branch                   | `feat/salapiya-d0-design-plan`, created from verified `origin/feat/salapiya-p0-foundation` |

Read the complete blueprint and the [foundation guide](../P0_FOUNDATION.md),
[verification](../P0_VERIFICATION.md) and [remaining P0 assignments](../P0_NEXT_ASSIGNMENTS.md).
Foundation build/runtime evidence is historical: D0 does not rerun or claim
those tests. Manual Windows visual/Narrator acceptance and physical Android
acceptance were not established by P0.

Inspected native `AGENTS.md`, `lib/app.dart`, `pubspec.yaml` and branding:
the application remains a transient startup counter with generated seed themes,
SDK widgets, no product routes, no bundled custom font declaration and no branding
asset declaration in pubspec. Those files need deliberate D1 changes; the
foundation screen is not the approved visual design.

Reviewed representative web implementation sources:

| Repository path                                                | What carries into the native proposal                                                                                                     |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/shell/app-shell.tsx` and `navigation-model.ts` | Private/group context, task framing, source destinations; native IA differs deliberately                                                  |
| `src/components/money/transaction-create-form.tsx`             | Separate entry/review, exact amount validation, cash/card funding, splits, shared mode, negative-balance acknowledgement, unknown outcome |
| `src/components/money/debt-payment-form.tsx`                   | Guided unresolved classification; explicit allocations, revision checks and review                                                        |
| `src/components/sharing/settlements.tsx`                       | Confirmed versus projected positions, selected allocations, advances, recipient/manual confirmation and private follow-up                 |
| `src/shared/money.ts`                                          | Integer minor-unit arithmetic and lossless strings; never use floating-point money                                                        |
| M1 component guide and redesign plan                           | Coverage notices, exact tables, safe focus/dismissal, honest command states and contextual details                                        |

This is source review, not a claim that D0 launched or visually reaccepted the web
application. Historical financial semantics are preserved; source code and domain
references remain the implementation authority.

## D0 verification and limits

Validation is documentation-focused: relative-link resolution, blueprint-row
coverage, token contrast arithmetic, SVG structure/hash inspection, browser
render inspection of unchanged branding, formatting and Git whitespace/scope
checks. The detailed verification record is at the end of
[PROTOTYPE_ROADMAP](PROTOTYPE_ROADMAP.md).

For the historical D0 commit, only the seven Markdown files in this directory were assignment changes. No
application code, configuration, dependency, migration, logo or authoritative
product document changes. No full prototype, external design publication or cloud
service is created. The final task report records the resulting commit SHA and
push verification so this document does not contain a self-referential commit ID.

## D2 owner decisions (October 22, 2026)

- D2-R01: D1R visual identity, typography, themes, components and Android B/+
  approved following live review, except the repetitive stepped top-line treatment.
- D2-R02: Remove `_PaneEdge` centrally and its unused `pearlEdge` role; preserve
  functional outlines, focus/selection, gradients, shadows and bounded motifs.
  No automatic replacement corner ornament on shared surfaces.
- D2-R03: After verifying D2-F0 on Windows/Android, implement the memory-only
  native shell and interactive Overview, then stop for live approval before D3.

Historical D1/D1R implementation records retain the prior styling as dated evidence.

D2 implementation continues these decisions on October 23. Its shell geometry,
Overview composition and fallback navigation await live owner approval. No D3
work or production engineering gate is approved by automated checks.
