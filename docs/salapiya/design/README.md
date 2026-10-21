# Salapiya native design — D0 decisions and D1 review

**Date:** October 21, 2026 (Asia/Manila).

**Status:** D0 approved for D1 implementation on October 21, 2026 (Asia/Manila). D1 rendered refinements remain subject to owner visual review.

**Scope:** Approved design contracts and the D1 synthetic Flutter component gallery. Full screens and production services remain future work.

Salapiya's approved expression is **Contemporary Filipino Craftsmanship — Soft,
Premium, Expressive and Purposeful**. The selected direction is **Woven Calm**:
interlaced structural accents, generous working surfaces, precise financial
typography and restrained pearl-like light. **Luminous Lattice** is a distinct,
more architectural comparison, bounded to a single specimen. Both preserve the existing logo and the
Porcelain / Midnight Spectrum foundations.

## Read and review in this order

Start with [D1 implementation and verification](D1_IMPLEMENTATION.md) and the
[native screenshot review](review/d1/README.md). The documents below remain the
authoritative design contracts; D1 implementation details do not approve D2.

| Document                                                | Purpose                                                                                  |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [Creative direction](CREATIVE_DIRECTION.md)             | Two alternatives, cultural provenance, original geometry rules and typography comparison |
| [Branding register](BRANDING_ASSETS.md)                 | Six existing files, usage, integrity, spacing and renderer risks                         |
| [Design system](DESIGN_SYSTEM.md)                       | Proposed tokens, component contracts, accessibility and motion                           |
| [Platform experience](PLATFORM_UX.md)                   | Windows rail/dock, Android A/B comparison, Overview, onboarding and task interaction     |
| [Screen and state inventory](SCREEN_STATE_INVENTORY.md) | Blueprint coverage, representative finance journeys and synthetic fixtures               |
| [Prototype roadmap](PROTOTYPE_ROADMAP.md)               | D1–D5 scope, architecture, packages, checks, review artifacts and D1 prompt              |

These documents are one proposal. Token values live in DESIGN_SYSTEM; screen
coverage lives in SCREEN_STATE_INVENTORY; milestone evidence lives in
PROTOTYPE_ROADMAP. Future sessions should update those sources rather than create
competing theme or navigation specifications.

## Authority and decision register

The [Salapiya blueprint](../../SALAPIYA_PRODUCT_AND_PLATFORM_BLUEPRINT.md) governs
scope, financial meaning, identity, synchronization and platform parity. The
owner's D0 assignment supplies the new visual preferences recorded below.
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
| D0-R05 | Compare Android A and B before selection                                                                      | Required; neither alternative is finalized                                                                                            |
| D0-R06 | Violet/lavender, Porcelain/Midnight Spectrum, Filipino craftsmanship, soft premium personality                | Owner-selected starting direction; precise composition remains proposed                                                               |
| D0-R07 | Local profile / Continue with Google / Restore from backup are distinct                                       | Approved product requirement; prototype simulates each                                                                                |
| D0-R08 | No real authentication, storage, sync or ledger during D milestones                                           | Assignment boundary; G0–G4 remain open                                                                                                |
| D0-P01 | Woven Calm selected primary direction                                                                         | Approved October 21, 2026; bounded Luminous Lattice details/comparison allowed, no second complete system                             |
| D0-P02 | Nunito Sans selected primary typeface                                                                         | Approved baseline subject to actual license, glyph, numeric, rendering and performance proof; Geist/Source Sans 3 comparison retained |
| D0-P03 | Proposed tokens, woven geometry, highlights, layers and craft accents                                         | Approved starting implementation baseline; rendered refinements remain subject to visual review                                       |
| D0-P04 | Android A/B comparison in D2                                                                                  | No final selection; D1 isolated specimens only, no application shell                                                                  |
| D0-P05 | Windows rail, action dock and adaptive breakpoints                                                            | Approved initial prototype parameters; final geometry/behavior tested in D2                                                           |
| D0-P06 | Selective maintained Flutter dependency evaluation                                                            | Approved per specific need and exercised Windows/Android proof; not blanket package or G0 acceptance                                  |
| D0-P07 | D1–D5 sequence and review checkpoints                                                                         | Approved; D1 assigned, stop at owner visual review; no automatic D2/P1 progression                                                    |

### Proposed revisions to earlier visual decisions

| Earlier source / decision                                          | D0 treatment                                                                                                                                               | Approval status                                                   |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Blueprint §14.3 / D19: logo deferred                               | Existing branding was subsequently committed at `aea133e`; owner now explicitly directs its preservation. Launcher exports remain later work.              | Later owner instruction recorded here; blueprint not rewritten    |
| Blueprint §14.2: Geist where suitable                              | Compare Nunito Sans, Geist and Source Sans 3; implement Nunito Sans as the approved D1 baseline.                                                           | P02 approved D1 baseline; native proof required                   |
| Web M1 D06: bottom-centered primary dock on desktop/mobile         | Native Windows uses rail for destinations and dock for actions; Android remains an A/B proof.                                                              | R04 is owner-selected; exact geometry P05; Android P04 unresolved |
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
