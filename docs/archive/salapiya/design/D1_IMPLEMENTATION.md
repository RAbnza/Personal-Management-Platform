# D1 — Woven Calm implementation and review record

> **Historical record:** preserved development evidence. Current summary: [Development history](../../../DEVELOPMENT_HISTORY.md).

Date: October 21, 2026, Asia/Manila. Branch: `feat/salapiya-d1-design-system`.
Base: approved D0 `7914b72310d2979b9d7d80885c587b0437585194`, which includes the
Flutter foundation and supplied branding. D0 was not assumed to be on main.

**Delivery status:** interactive native design foundation for visual review.
The approved direction is implemented; the rendered result is not accepted
yet. D2 and P1 have not started. G0–G4 and G6 remain open.

## Review and run

- [Screenshot and evidence index](../../../salapiya/design/review/d1/README.md).
- [Complete authored code/configuration snapshot](https://github.com/RAbnza/Personal-Management-Platform/blob/294c6d0/docs/salapiya/design/D1_SOURCE_SNAPSHOT.md).
- [Exact added/modified file inventory](../../../salapiya/design/D1_FILES.json).
- [Approved decisions and boundaries](README.md#authority-and-decision-register).

From `apps/salapiya`, use `flutter run -d windows` or
`flutter run -d emulator-5554`. The existing root helper
`scripts/salapiya/start-emulator.cmd` starts the P0 Android emulator without
changing global SDK paths. The app opens in the system theme.

Use the gallery sidebar on wide windows, or the section selector on narrow
windows. This is a **gallery interface**, not the D2 application shell. The
persistent DEMO label identifies the mode; the section introduction explains
that data is synthetic and changes reset on close. Preferences provide system,
light and dark themes, effects, reduced motion, compact specimens, system/100%/
150%/200% text preview, reset and offline license notices. Specimen-local state
also resets when leaving its section. No state is written to disk or a service.

## Approval record

The D0 register was updated before implementation: P01 selects Woven Calm,
P02 selects Nunito Sans, P03 approves the token/craft starting baseline,
P04 keeps Android A/B undecided, P05 approves initial rail/dock measurements,
P06 permits selective dependency evaluation and P07 approves the milestone
sequence with a stop after D1. These approvals do not imply engineering-gate
acceptance or permission to begin D2.

## Structure and reusable contracts

| Path under `apps/salapiya`                   | Responsibility                                                                                                                                                |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/design_system/theme.dart`               | Named palette, spacing/geometry, semantic `CraftTheme`, `ThemeData`/`ColorScheme`, control states                                                             |
| `lib/design_system/components.dart`          | Opaque/focal panels, section headings, status notices, exact amount display, financial summaries, record rows, review rows, empty/busy states, adaptive pairs |
| `lib/design_system/craft.dart`               | Original static interlacing and bounded lattice comparison painter; unchanged brand display mark                                                              |
| `lib/design_system/navigation.dart`          | Labeled, selected/disabled/compact destination control; callbacks owned by the caller                                                                         |
| `lib/gallery/`                               | Gallery navigation/preferences, isolated specimen state, navigation studies, synthetic review editor                                                          |
| `lib/prototype/fixtures.dart`                | Exact `BigInt` centavos, strict decimal input adapter and synthetic scenarios; no production ledger                                                           |
| `lib/app.dart`                               | One Windows/Android app, theme/settings composition and offline license registration                                                                          |
| `test/`, `integration_test/`, `test_driver/` | Widget contracts, native interactions, native layout matrix, source-logo comparison and host-side artifact capture                                            |

Presentation components receive strings/read values and callbacks. They do not
parse amounts, mutate accounts or import a mock repository. Standard Material
controls handle input and semantics; custom code supplies composition and
identity. No router, state-management, chart, persistence, authentication or sync
package was added. No empty feature architecture was created.

### Theme and craft

Porcelain `#F7F8FC` and Midnight Spectrum `#0D1020` remain the canvases. The
approved violet/lavender primary roles, opaque surfaces, subdued secondary ink,
essential borders, selection, information/success/warning/error pairs and warm,
plum and blue accents are centralized in `CraftTheme`. Field, button, focus,
dialog, sheet and feedback themes consume those roles.

Spacing uses 4/8/12/16/24/32 logical pixels; controls begin at 48, control corners
at 12, cards at 20 and dialogs at 24. Nunito roles use 14/16/20/26/32 with explicit
line heights and 400/600/700 weights. Compact mode reduces specimen padding and
compares the collapsed 80px rail; it does not clamp system text scaling. Dense
tables remain horizontally scrollable with full exact values.

Summary amounts first receive a full-width row, then select the largest fitting
32/26/20/16/14 typography role while retaining the OS text scaler. Values too
wide even at the minimum role remain one line in a horizontal scroller with a
visible scrollbar; they are never truncated or silently reduced below that role.
The bundled Nunito regression covers ordinary, negative and billion-peso values
at 240px available width and 200% scaling. Independent page, table and expandable
detail storage keys prevent scroll offsets from colliding with expansion state.

The opening focal surface combines a bounded lavender/blue highlight with one
interlaced motif. Mobile receives a small motif rather than losing the craft
identity. Reading/financial surfaces stay opaque. The painter is isolated by a
repaint boundary, excludes semantics and ignores pointers. There is no blur,
animated background, shimmer, continuous decorative controller or raster texture.
The Luminous Lattice alternative is one same-content card, not a second theme.

System reduced motion is combined with the gallery switch. Theme changes are
immediate; custom review/sheet transitions and button state transitions become
immediate when reduced motion applies. Busy feedback uses a static labeled icon.
Framework controls retain their own focus, caret and essential input behavior.
Turning effects off removes motifs, focal gradients and optional shadows.
High-contrast media also disables decoration; a separately tuned OS high-contrast
palette has not been accepted.

### Implemented gallery coverage

| Section            | Interactive proof                                                                                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Foundations        | Both themes, semantic palette, surfaces, geometry, spacing, focal framing and effects controls                                                                                                                |
| Typography         | Identical headings, navigation, body, long account name, labels/errors, peso/minus, dates, diacritics and dense aligned digits in three offline families                                                      |
| Actions & forms    | Primary/secondary/text/destructive confirmation, tooltip icon, disabled/busy states, persistent labels, exact peso validation, account selector, date picker, radio/checkbox, read-only/disabled fields       |
| Money specimens    | Complete/pending/incomplete/empty/loading/error coverage, accepted versus projected total, card liability, incoming/outgoing/transfer context, expandable source/allocation, obligations/debt and exact table |
| Navigation studies | Expanded/collapsed Windows rail, independent action dock, Android anchored A and capsule/shelf B, selection and disabled action                                                                               |
| Overlays & review  | Dialog, bottom sheet and side panel; edit/validation/review, unknown outcome, dirty dismissal, keep/discard, Escape/Back and focus restoration                                                                |
| Feedback & status  | Empty/loading/error, local-only/offline/waiting/pending/reconciled transport state, independent recipient/manual confirmation, incomplete download and unavailable information                                |
| Brand & craft      | Six source/export comparisons, realistic mark sizes/clear space, same-content Woven Calm/Luminous Lattice comparison                                                                                          |

Navigation destinations remain Overview, Money, Debts, Shared Expenses and Life.
Android specimens use icon-over-label destinations where they fit, and a fully
labeled fallback list at very narrow widths or enlarged text. They do not prove
reachability, route state or D2 product-navigation selection.

### Synthetic financial meaning

Fixtures preserve D0 examples: liquid `2930075`, expense `18550`, separate card
liability `480000` centavos. A pending expense projects `2911525`, separately from
the accepted total. Own-account transfer principal is not income. Debt paid
`205000` remains distinct from contractual `200000` and external fee `5000`.
Expected electricity/debt obligations are not actual expenses. Null/incomplete
coverage is not zero; sync is not receipt confirmation.

The input adapter accepts plain nonnegative decimal pesos with at most two
fractional digits, then applies a positive-value and demonstration-limit check.
It rejects commas, exponent notation, signs, excess precision and silent rounding.
`BigInt` is used throughout monetary parsing/formatting. Geometry and typography
use doubles; financial calculations do not. These are bounded presentation
fixtures, not production financial business rules or G3 proof.

## Fonts and dependencies

All normal variable TTF files are unmodified downloads from pinned Google Fonts
repository commits. Local filenames are `regular.ttf`; internal font metadata is
unchanged. The repository carries each OFL 1.1 notice and upstream `METADATA.pb`.
There is no runtime font/network fetch. Nunito Sans is the only application font;
the other families are loaded only for D1 comparison.

| Family        | Exact version                          |   Bytes | Pinned Google Fonts commit                 |
| ------------- | -------------------------------------- | ------: | ------------------------------------------ |
| Nunito Sans   | 3.101; gftools 0.9.27                  | 571,240 | `8b0a1d0f5983c89bc2b93f1b5fb55f9e252744b5` |
| Geist         | 1.800                                  | 169,056 | `718e1db4deb9e4d9d85a0ead1b9f5fde2761ccfd` |
| Source Sans 3 | 3.052; hotconv 1.1.0; makeotfexe 2.6.0 | 646,340 | `914ec116571b1162d886aa402e715552221f0b77` |

Origins are `https://github.com/google/fonts/tree/<commit>/ofl/<family>`.
`assets/fonts/manifest.json` records exact filenames, versions, axes, hashes,
sizes, glyph coverage and feature inspection. All three contain U+20B1 peso,
U+2212 minus and the tested Filipino/Latin diacritics. Nunito Sans and Source Sans
3 have equal-width digits by default; Geist has `tnum`. Native `TextPainter`
checks on **both platforms**, at 400/600/700 and 24px with tabular figures enabled,
confirm each family's 0–9 advance spread is below 0.01 logical pixels. Exact
advances are in the runtime JSON files. This proves alignment, not subjective
legibility or screen-reader pronunciation.

`flutter_svg: 2.3.0` is the sole new direct Flutter package, MIT, copyright 2018
Dan Field. It is retained for the source-comparison specimen. Its new locked
dependencies are `path_parsing 1.1.0`, `petitparser 7.0.2`, `xml 7.0.1` (MIT), and
`args 2.7.0`, `http 1.6.0`, `http_parser 4.1.2`, `typed_data 1.4.0`,
`vector_graphics 1.2.4`, `vector_graphics_codec 1.1.13`,
`vector_graphics_compiler 1.3.2` (BSD-3-Clause). Flutter/Dart SDK license notices
and package notices are collected by Flutter's license mechanism; the app adds
the three bundled font notices once. Preferences → Licenses opens the notices.
HTTP is transitive; this app invokes local assets only.

## Branding proof

See the authoritative [branding register](../../../DESIGN_SYSTEM.md#d1-rendering-decision).
All six original SVGs are byte-identical to D0. Both native renderers report an
unsupported filter element. Authorized transparent browser exports are the
default display path; no launcher resources were exported or changed. All six
export images have RGBA alpha spanning 0–255. Source/output hashes, dimensions
and Edge version are committed in the display manifest. Native transparent
source/export pairs and diagnostic differences are retained for all six assets
on each platform. Source lockups below the conservative minimum width remain
stress specimens; tiny tagline readability is not approved.

## Verification method and limits

Toolchain: Flutter 3.47.7 stable (`abaf9c5237`), Dart 3.13.5, Windows 11 x64
build 26200.9711, existing Pixel 9 API 37 Android x86_64 emulator. Native default
review sizes are Windows 1582×853 physical at 1.25 DPR (1265.6×682.4 logical),
Android 1080×2424 at 2.625 DPR (411.43×923.43 logical). OS safe insets remain in
the Flutter capture, but OS chrome/keyboard are not drawn by its repaint boundary.

| Check                                           | Execution/result                                                                                                                                                                                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `flutter pub get`                               | Passed; exact direct package pin and committed lockfile                                                                                                                                                                                          |
| Dart format / `flutter analyze`                 | Passed; no analyzer findings                                                                                                                                                                                                                     |
| `flutter test --reporter expanded`              | 24 passed: exact money, contrast, all sections in both themes, layout/scaling, validation, unknown outcome, dirty dismissal, keyboard focus restoration, labeled Android targets, scroll/expansion state isolation and native-font amount layout |
| Windows / Android builds                        | Windows release and Android debug APK built successfully                                                                                                                                                                                         |
| Native `startup_test.dart`, Windows and Android | Passed in debug and profile; theme changes, fonts, source SVG switch, validation, sheet review, Back/dirty recovery and reduced-effects/text preview                                                                                             |
| Native `layout_test.dart`, Windows              | 640×480, 900×600, 1280×800, 1600×900; 100%/200%; both themes × eight sections passed                                                                                                                                                             |
| Native `layout_test.dart`, Android              | 320×568, 360×640, 412×800, 800×360; 100%/200%; both themes × eight sections passed                                                                                                                                                               |
| Native `branding_test.dart`, both               | Six source/export pairs rendered and captured; unsupported filter documented; all originals unchanged                                                                                                                                            |
| Real Windows input                              | Tab reached preferences with visible focus, Enter opened it, Escape dismissed and restored focus; real OS window resized to compact width, gallery adapted                                                                                       |
| Android OS input                                | ADB-injected touch/key input opened preferences, changed theme, navigated, edited and validated a sheet; actual OS Back opened keep/discard confirmation. OS screenshots and a short screen recording are retained.                              |

Run native checks from the app directory:

The staged whitespace check is clean for authored files. The three unmodified
upstream OFL notices retain the source's trailing space on line 21; those notices
are deliberately excluded from the authored-file whitespace check.

```powershell
flutter drive -d windows --driver=test_driver/gallery_driver.dart --target=integration_test/startup_test.dart
flutter drive -d emulator-5554 --driver=test_driver/gallery_driver.dart --target=integration_test/startup_test.dart
flutter drive --profile -d windows --driver=test_driver/gallery_driver.dart --target=integration_test/startup_test.dart
flutter drive --profile -d emulator-5554 --driver=test_driver/gallery_driver.dart --target=integration_test/startup_test.dart
# Repeat the debug commands with layout_test.dart or branding_test.dart.
flutter build windows
flutter build apk --debug
dart format --output=none --set-exit-if-changed lib test integration_test test_driver
flutter analyze
flutter test
```

`layout_test.dart` runs on each **native engine**, using constrained logical test
surfaces; it is not a claim that the OS window or emulator density was resized to
every width. The real Windows resize capture separately proves native adaptation.
The shared widget matrix is additional deterministic evidence, not a substitute
for Android execution. Table scrolling and long page scrolling are intentional.

The host driver writes actual native raster captures to this review directory.
The Windows integration plugin prints its missing native-plugin warning; the
Flutter driver transport nevertheless receives test results and artifacts and
exits successfully. No Android instrumentation/XCTest result forwarding is claimed.
Profile mode bypasses debug-only synthetic text-client delivery by updating the
editable state through its public edit callback. Debug uses `tester.enterText`;
profile therefore proves editing/rendering, not physical keyboard delivery.

### Accessibility and performance boundaries

Semantic foreground pairs pass WCAG normal-text arithmetic at ≥4.5:1, essential
borders ≥3:1. Status text/icons carry meaning in addition to color. Buttons and
icons have labels/tooltips; visible Android action targets pass Flutter's 48px
and labeled-target guidelines. Financial display has an explicit Philippine-peso
semantic label. Large-text tests cover every section and both themes. Modal
focus restoration, Escape, Back, keep/edit/discard and unknown-outcome behavior
have executed tests. Windows UI Automation exposes named controls.

Narrator and TalkBack spoken navigation have **not** been manually accepted;
neither have physical Android touch, OEM keyboard variants, high-contrast OS
themes, all locale/IME combinations or every platform text-scaling curve. The
gallery's 200% preview is linear; ordinary mode respects the OS text scaler.
These limits must remain visible at the D2 review checkpoint.

The API 37 emulator has a hardware keyboard and Gboard's floating physical-keyboard
toolbar. Its on-screen numeric keyboard was opened and captured, but the floating
window can cover the amount field without reporting a docked bottom inset. Moving
or dismissing that keyboard remains necessary in this configuration. Docked-IME
avoidance is not manually accepted by this run. The temporary
`show_ime_with_hard_keyboard` setting was restored to its original `0` afterward.

Profile measurements are stored in `windows-runtime-profile.json` and
`android-runtime-profile.json`. The scenario performs 16 section/theme changes,
drains timing delivery for one second, then observes one second idle. Build/raster
p95 and sample counts are diagnostic, not a guaranteed frame-rate benchmark.
There is no focused caret during the idle sample. Emulator/host contention and
cold asset decoding affect the result. Debug timings are retained as debug only;
they are not used as release-performance evidence. No G6 acceptance follows.

The final profile run measured Windows: 57 frames, build p95 7.171ms, raster p95
3.912ms; Android: 58 frames, build p95 5.657ms, raster p95 3.936ms. Both observed
zero frames during the one-second idle sample.

## Review checkpoint and bounded D2 recommendation

Review the actual light/dark compositions, mobile motif, craft intensity, Nunito
readability versus the two alternatives, focus/state legibility, logo display
fallback and density before accepting refinements. Woven Calm/Nunito remain the
approved baseline until revised; Android A/B is still an open D2 decision.

Recommended D2: build only the shared five-destination shell and synthetic
Overview, with the Windows collapsible rail/contextual dock and an interactive
Android A/B comparison. Carry these components forward, test real route/focus/
Back state, safe areas, narrow/large-text fallback, missing/pending coverage and
the accessibility gaps above. Select Android navigation only after review.
Continue to exclude production storage, authentication, synchronization, ledger
mutations, launcher exports, installers and deployment. Do not begin D2 automatically.
