# Native design system — D1R refinement

**Status:** D1R-R01/R03 refine the P03 baseline in `lib/design_system/`.
Luminous Lattice is primary; Woven Calm softness and Nunito Sans remain.
The [current implementation record](D1R_IMPLEMENTATION.md) maps actual reusable components
and records measured proof and limitations. Rendered refinements await owner review. Read the
[creative alternatives](CREATIVE_DIRECTION.md) and [decision register](README.md).
Use one shared semantic system across Windows and Android; adapt layout/input.

## Implemented D1R craft and navigation roles

The existing `CraftTheme` remains the single theme extension. Added semantic roles:
`pearlEdge` (white / #73658E), `latticeEdge` (divider blended 28% toward primary),
and `modalScrim` (black 44% / 64%). These are decorative/modal roles, never money
or status colors. `Space.floatingRadius` is 28 and `menuDuration` is 160ms.

`CraftMotif` defaults to the original bounded lattice. `LatticeFrame` owns one
soft frame, optional static stepped pearl edge and optional raised shadow or focal
gradient. `CraftPanel(focal: true)` delegates to it; ordinary cards are unchanged.
Rail/capsule and the action list reuse it. Selected `DestinationControl` has an
explicit outline as well as fill and selected semantics, including effects-off.

`FloatingActionMenu` owns a single modal route and compact + control. Callers pass
`FloatingQuickAction` labels, icons and callbacks. See [platform UX](PLATFORM_UX.md)
for anchoring, bounded sheet fallback, focus, Back and input-inset contracts.
No dependency, palette overhaul, font change, finance logic or parallel theme.

## Token architecture

Three layers: named primitives → semantic roles → component aliases. Flutter's
ThemeData/ColorScheme should supply standard controls; a small ThemeExtension
can carry craft, financial coverage, density and motion roles. Components consume
roles, never choose random hex colors. Explicit mappings override generic seeded
defaults where required; a violet seed alone is not the Salapiya design system.

Proposed aliases include `amount.primary`, `field.border`, `field.error`,
`nav.selected`, `dock.surface`, `review.surface`, `coverage.warning`,
`craft.seam` and `craft.highlight`. Do not bind an account category, a success
state and a decorative motif to the same semantic token just because hues match.

### Core opaque colors

Retain M1's approved canvases and core surfaces. “Proposed” applies to their native
mapping and new roles, not to a claimed reapproval of historical web screens.

| Token                            | Porcelain light       | Midnight Spectrum dark | Contract                                                      |
| -------------------------------- | --------------------- | ---------------------- | ------------------------------------------------------------- |
| `canvas`                         | `#F7F8FC`             | `#0D1020`              | Application background                                        |
| `surface`                        | `#FFFFFF`             | `#171B31`              | Forms, table/list data, money                                 |
| `surfaceRaised`                  | `#FFFFFF`             | `#20253F`              | Dock, menus, dialogs                                          |
| `surfaceSubtle`                  | `#EEF0F8`             | `#202440`              | Grouping, headers, read-only field background                 |
| `textPrimary`                    | `#22252B`             | `#F3F5FF`              | Main text and exact numbers                                   |
| `textSecondary`                  | `#5E6570`             | `#B7C2DE`              | Supporting labels, units, coverage                            |
| `primary` / `onPrimary`          | `#6B469C` / `#FFFFFF` | `#C8B6F2` / `#1B1B22`  | Principal action                                              |
| `primaryHover`                   | `#5D3D88`             | `#BCA5EE`              | Pointer hover, unchanged geometry                             |
| `primaryPressed`                 | `#503474`             | `#B09AE0`              | Press feedback                                                |
| `selection` / `onSelection`      | `#EEEAF5` / `#6B469C` | `#332A45` / `#C8B6F2`  | Selection plus marker/weight                                  |
| `controlBorder`                  | `#7A8197`             | `#929CBA`              | Essential field/control outline                               |
| `divider`                        | `#DCE0EC`             | `#363D5B`              | Nonessential separator; not a field boundary                  |
| `focus`                          | `#6B469C`             | `#C8B6F2`              | 2-unit ring, 3-unit offset, opaque gap                        |
| `disabledFill` / `disabledText`  | `#EEF0F8` / `#5E6570` | `#202440` / `#B7C2DE`  | Explicit readable disabled state; explain unavailable action  |
| `craftWarm` / `craftWarmSurface` | `#82603A` / `#F5EEE5` | `#D9BE97` / `#30291F`  | New bounded material accent; never pending/success            |
| `craftPlum` / `craftPlumSurface` | `#80456F` / `#F4E5EE` | `#F3B6EF` / `#38203F`  | Decorative composition                                        |
| `craftBlue` / `craftBlueSurface` | `#245E87` / `#E5F1FA` | `#8BDCFF` / `#132C45`  | Decorative composition                                        |
| `focalStart` → `focalEnd`        | `#EEE8FF` → `#E1EFFF` | `#302153` → `#142C49`  | Static outer focal region; values use an opaque inner surface |

Warm tint never replaces the Porcelain canvas. Pattern colors may be subtle
because they convey no information; text and functional boundaries never inherit
their opacity. Theme changes select existing logo variants, not recolored images.

### Business feedback and charts

| Role          | Light foreground / surface        | Dark foreground / surface | Meaning                                                       |
| ------------- | --------------------------------- | ------------------------- | ------------------------------------------------------------- |
| `success`     | `#146C43` / `#EDF8F1`             | `#75D5A5` / `#142B22`     | A specific completed step with evidence; label what completed |
| `warning`     | `#8A4B0F` / `#FFF4DF`             | `#F3C16B` / `#312716`     | Needs review, uncertainty, incomplete coverage                |
| `error`       | `#B42318` / `#FFF0ED`             | `#FDA29B` / `#371D22`     | Validation failure or destructive consequence                 |
| `information` | `#235EA7` / `#EDF4FF`             | `#9AC5FF` / `#19283B`     | Explanation, planned information                              |
| `neutral`     | `textSecondary` / `surfaceSubtle` | Same semantic roles       | Draft, waiting, archived; wording distinguishes               |

A transfer is not “income” because money entered one account. Expenses are not
automatically red failures. Overdue copy is factual, never shame-based. A synced
settlement can still be awaiting recipient confirmation: transport and business
state require separate labels. Prototype success always says it was simulated.

Chart series use separate stable tokens: violet `#6B469C/#C8B6F2`, teal
`#266C80/#79C4D2`, plum `#9A4C72/#E6BCD4`, ochre `#80631B/#E4C572`,
blue `#395EB2/#A9BCFF`, neutral `#59616F/#B9B9C6` (light/dark).
Start with four or fewer simultaneous series; encode with labels, distinct point
shapes, dashed lines or small multiples. Provide an exact table and period/
coverage summary. Chart coordinates may use approximate display numbers only
after an exact read model supplies values; totals, tooltips and exports never
derive money from plotted doubles. No signed-value pie chart or rolling balances.

### Calculated contrast evidence

Calculated in D0 with WCAG sRGB relative luminance:
linear channel = c/12.92 for c≤0.04045, otherwise ((c+0.055)/1.055)^2.4;
L=0.2126R+0.7152G+0.0722B; contrast=(lighter L+0.05)/(darker L+0.05).
Hex channels are normalized to 0–1. Ratios below are rounded for display only.

| Foreground/background pair                     | Light ratio | Dark ratio |
| ---------------------------------------------- | ----------- | ---------- |
| Main text / surface                            | 15.36:1     | 15.61:1    |
| Secondary / subtle (light), raised (dark)      | 5.17:1      | 8.43:1     |
| Primary label / primary                        | 7.04:1      | 9.32:1     |
| Control border / subtle (light), raised (dark) | 3.41:1      | 5.50:1     |
| Selection label / selection                    | 5.94:1      | 7.34:1     |
| Warm accent / warm surface                     | 4.95:1      | 8.04:1     |
| Success pair                                   | 5.93:1      | 8.45:1     |
| Warning pair                                   | 6.22:1      | 8.83:1     |
| Error pair                                     | 5.93:1      | 7.95:1     |
| Information pair                               | 5.88:1      | 8.38:1     |

Target ≥4.5:1 ordinary text, ≥3:1 essential nontext indicators. Aim for 4.5:1
even for normal display labels. [W3C text contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
is the arithmetic reference; this is not native accessibility certification.
D1 checks every actual background, hover, pressed, selected, error, focus,
disabled and high-contrast rendering. Gradients/translucency are not certified
by endpoint arithmetic; no text relies on them in this baseline.

## Type, spacing and density

Nunito Sans is the P02-approved primary family; Geist and Source Sans 3 are
controlled comparisons only. Sizes below are logical pixels before OS
text scaling, with line heights as ratios, and are minimum role defaults rather
than fixed-height boxes.

| Role            | Size / weight / line height | Use                                                               |
| --------------- | --------------------------- | ----------------------------------------------------------------- |
| Display         | 32 / 600 / 1.20             | One focal figure or welcome title; no all-screen oversized labels |
| Screen heading  | 26 / 700 / 1.25             | Main title                                                        |
| Section heading | 20 / 600 / 1.30             | Meaningful regions                                                |
| Body / input    | 16 / 400 / 1.50             | Android and Windows comfortable mode                              |
| Label / action  | 14 / 600 / 1.40             | Persistent field labels and controls                              |
| Supporting      | 14 / 400 / 1.45             | Dates, scope, coverage; not essential 10px footnotes              |
| Dense data      | 14 / 400 or 600 / 1.40      | Optional Windows table mode, still scales                         |
| Navigation      | 14 / 600 / 1.30             | Allows wrapped “Shared Expenses”; no forced ellipsis              |

Use tabular lining numerals for amounts, quantities and aligned dates. Right-align
financial columns and keep sign/currency/value together. Show exact centavos:
`₱1,200.00`, with semantic reading “1,200 Philippine pesos.” Unknown is “Not yet
available,” not `₱0.00`; no `1.2K` replacement in critical balances or reviews.
Enlarge/wrap the value region before shrinking text; offer a labeled horizontal
table region only for genuine two-dimensional comparisons.

Spacing scale: **4, 8, 12, 16, 24, 32, 48**. Screen margins start at 16 compact,
24 medium, 32 wide. Form content width generally 480–640. Cards use 20 radius,
fields/buttons 12, menus 16, dialogs 24; the selected Android capsule uses 28; Windows dock geometry remains D2 proof. These few shared values prevent arbitrary per-screen rounding.

Touch targets are at least **48×48** on both platforms when touch is possible.
Mouse-oriented dense Windows rows may be 40 high only in an explicit comfortable/
compact preference with adequate focus/activation spacing; touch mode restores
48 minimum. Financial text never becomes smaller to fit the dock. Scaled labels
increase control height and may trigger a different layout.

## Surfaces and motion

| Treatment                     | Proposed budget                                                                                                                                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Working plane                 | Opaque fill, optional 1-unit divider; no shadow on every row                                                                                                                                                       |
| Floating dock / raised region | One shadow: light black 8%, y=4, blur=16; dark black 20%, y=4, blur=16, plus visible outline                                                                                                                       |
| Modal                         | One stronger shadow: light black 14% / dark 28%, y=8, blur=24; opaque content and bounded scrim                                                                                                                    |
| Pearl highlight               | One static upper-edge line/gradient in a branded focal region; no glow around text or figures                                                                                                                      |
| Capiz-like effect             | Prefer opaque layered color. Optional genuinely translucent decoration may occupy ≤15% of a welcome/header region, never a control/data background; no blur by default. Remove if readability or frame cost fails. |
| Hover/press                   | 100–120ms color change, stable target; focus ring immediate                                                                                                                                                        |
| Menu/disclosure               | 120–160ms; at most 4-unit translation; no animated long-list relayout                                                                                                                                              |
| Side panel / navigation       | 180–220ms ease-out, contained; no bounce                                                                                                                                                                           |
| Optional welcome transition   | Up to 240ms for a user-initiated next step; entry choices usable immediately                                                                                                                                       |
| Reduced motion                | Zero translation, scale, chart interpolation or animated size; immediate state changes. Loading remains labeled; no shimmer required.                                                                              |

No decorative launch sequence, delayed input, continuously animated background,
animated monetary value or congratulatory financial confetti. Platform navigation
transitions must be checked with reduced-motion settings; custom transitions
must not suppress system Back behavior.

## Reusable component contracts and D1 gallery

The gallery is the first implementation, not an unrelated demo page. It contains
the following reusable components with stable state controls and synthetic data.
Names below are proposed contracts, not required class names.

| Family                  | Functional primitive to reuse                     | Salapiya composition / contract                                                                                | Gallery states                                                                |
| ----------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Buttons / icon actions  | Flutter semantic buttons, tooltips, Focus/Actions | Primary, secondary, text, destructive; stable busy width; explicit icon label; no double activation            | Rest, hover, pressed, focus, disabled with reason, busy                       |
| Fields / amount entry   | TextFormField, Form, selection/IME behavior       | Persistent label, PHP context, exact text-to-minor-unit adapter, hint/error association; never silent rounding | Empty, valid, malformed, excess precision, zero, maximum, read-only, disabled |
| Choice/date controls    | SDK radio, checkbox, menu and date picker         | Own account/card/scope labels; date is a civil date, not silently shifted by timezone                          | Keyboard selection, long label, missing source, unavailable archived source   |
| Financial summary       | Text, layout primitives                           | Exact value + definition, period/as-of, coverage and source action; null != zero                               | Complete, partial snapshot, pending overlay, hidden value                     |
| Cards/section framing   | Container/Card composition                        | One emphasis level, named regions, optional external seam; avoid card-within-card nesting                      | Plain, focal, selected, small width, 200%                                     |
| Primary rail/mobile nav | SDK navigation semantics and focus                | Five stable destinations; identity, marker and labels; no custom gesture recognizer replacing buttons          | Expanded/collapsed, active, focused, selected B, historical A, long text                           |
| Quick-action dock       | Standard buttons plus menu/sheet primitives       | Context actions, distinct from destinations; measured content clearance; no icon magnification                 | Windows tool tray; Android +, modal list/sheet, safe dismissal                 |
| Sheets/dialogs/review   | SDK modal routes, focus scopes, safe areas        | Named heading, safe initial focus, input retention, Escape/Back policy and trigger restoration                 | Short, long/IME, invalid, unknown result, dirty close                         |
| Financial table/list    | SDK bounded DataTable/list first                  | Domain-supplied exact strings; row identity and explicit Details action; no whole-row-only interaction         | Empty, sorted, filtered, selected, long amount, bounded large fixture         |
| Disclosure/detail       | Expansion/control semantics                       | Expanded state announced; source details and history retained, keyboard accessible                             | Collapsed, expanded, changing content, retained input                         |
| Chart/report            | Mature chart candidate plus exact table           | Period/coverage, non-color series, keyboard/touch selection; derived data only                                 | Zero, negative, missing, pending, dense labels                                |
| Status/coverage         | Icon + text + optional action                     | Domain adapter supplies business state; sync state separately; no badge-only color meaning                     | Draft, local, waiting, accepted, review, unknown, confirmed receipt           |
| Empty/error             | Standard text/action controls                     | Distinguish first use, no matches, offline unavailable, unauthorized, incomplete download                      | Each with appropriate recovery; motif optional and decorative                 |
| Loading/sync            | SDK progress indicators                           | Immediate honest label; measured progress only if denominator known; no false 100%                             | Initial snapshot, files missing, retry, paused/expired session                |
| Confirmation            | Review rows + explicit actions                    | Amount/date/source/private/group effects, warning and evidence; safe Cancel focus                              | Edit/review, consequential ack, invalid, stale, simulated outcome             |
| Theme/effects           | SDK theme and media preferences                   | System/Light/Dark, reduced effects, reduced motion; in-memory gallery controls                                 | Both themes, system change, effects off                                       |
| Craft primitives        | Small owned painter/layout helper                 | Grammar in CREATIVE_DIRECTION; never paints text or hit targets                                                | A/B, off, narrow, high contrast                                               |

A library provides dependable input/focus/layout behavior. Salapiya owns the
composition, spacing, theme, cultural geometry, financial labels and status
mapping. Avoid adding a UI suite just to obtain a rounded button or allowing a
theme package to dictate the overall application layout.

## Accessibility acceptance contract

Follow [Flutter accessibility guidance](https://docs.flutter.dev/ui/accessibility)
and verify the final composition; a semantic primitive is not sufficient alone.

- One current screen heading; logical reading and Tab order; inactive layouts
  excluded from focus and semantics. Do not render duplicate mobile/desktop forms.
- All navigation, row actions, chart details and dock commands work with keyboard,
  touch and screen reader. Tooltips supplement visible labels; no hover-only data.
- Modal focus stays contained and returns to the trigger; nonmodal inspector
  does not trap focus. Announce meaningful result/error changes once.
- Error summary links/focus to fields. Read-only data remains selectable where
  appropriate. Clipboard/edit shortcuts retain platform behavior.
- Test 100%, 150%, 200% text and the OS maximum on supported devices. Do not cap
  text scale or use forced single-line labels to pass screenshots.
- Test Windows high-contrast preferences; if theme adaptation needs an adapter,
  record and prove it. High-contrast mode removes decoration and uses explicit
  boundaries without changing the protected logo.
- Test Narrator on Windows and TalkBack on Android with actual task completion,
  not just semantics snapshots. Follow all reduced-motion preferences.
- Insets, dock, panel and IME must never cover the current focus or final action.
  Width and usable height both affect layout. Preserve features at narrow sizes.

G6 remains open after D1/D5 UI checks; representative physical-device and release
acceptance require their own evidence.
