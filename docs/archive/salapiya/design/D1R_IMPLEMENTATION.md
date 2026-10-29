# D1R — Luminous Lattice and floating quick actions

> **Historical record:** preserved development evidence. Current summary: [Development history](../../../DEVELOPMENT_HISTORY.md).

Date: October 21, 2026 (Asia/Manila).
Branch: `feat/salapiya-d1r-design-refinement`.
Base: `e34056e7c6861f6cedc73be0d5accefdc91eaf2b`.

The starting tree was clean. `git fetch origin` verified that the D1 branch still
pointed to the supplied commit and `origin/main` remained
`7662ce9cb22d6aa1ca5d18ca6604b7bdb416fc66`. D1 was not merged into main, so D1R
branches from verified `origin/feat/salapiya-d1-design-system`. No merge or force
push is part of this assignment.

**Status:** Implemented for live visual review; verification results below.
No D2 shell or production feature has begun. G0–G4 and G6 remain open.

## Current design and implementation

The [decision register](README.md#d1r-hands-on-review-decisions-october-21-2026)
records D1R-R01–R07. Woven Calm was approved during planning; hands-on D1 review
subsequently selected Luminous Lattice. This chronology is preserved.

- `CraftMotif` defaults to the existing original lattice: three soft rectangular
  outlines stepping diagonally within a bounded 96-unit drawing. Explicit woven
  interlacing is retained in the small historical motif comparison.
- `LatticeFrame` supplies a shared soft frame and static two-step pearl edge for
  focal panels, rail/capsule frames and the raised action list. The optional edge
  occupies the top margin, away from text and controls. `CraftPanel(focal: true)`
  delegates to this primitive; ordinary financial cards stay opaque and plain.
- The existing `CraftTheme` gains pearl-edge, lattice-edge and modal-scrim roles;
  `Space` records capsule radius and menu duration. There is one theme system.
  Selected destinations have an outline, fill and selection semantics.
- The gallery's identity labels now name Luminous Lattice. Nunito Sans, soft
  corners, comfortable spacing, the Porcelain/Midnight Spectrum palette, warm/
  plum/blue accents, exact `BigInt` fixtures and all D1 gallery sections remain.
- Windows retains its collapsible rail specimen and separate contextual tool
  dock. Android B is selected; A lives in a collapsed historical comparison.
  These gallery arrangements do not prescribe D2's application layout.

All six original SVGs parse and match their recorded SHA-256 values. All six PNG
display derivatives also match the D1 manifest. No branding or font file changed.
Existing D1 media and dated implementation/review records remain unchanged.
The old startup test's comparison-label finder is updated to the new selected label.

## Reusable floating-action contract

`FloatingActionMenu` receives immutable label/icon/callback definitions through
`FloatingQuickAction`. Its collapsed 56×56 control shows only +, with the name
“Quick actions,” tooltip and collapsed semantics. It remains separate from the
five navigation destinations.

Opening creates one SDK modal route with a visibly dimmed viewport, an opaque
vertical list above the trigger and an expanded close control in the trigger's
position. Actions are expense, income, transfer, debt payment, shared expense and
task. Selection closes the route before invoking the caller once. The gallery
announces an inline demo-only outcome; it creates no record and opens no feature
route. Feedback stays in the specimen so a snackbar cannot cover the trigger.

The list measures labels with actual text scaling. Insufficient space, an invalid
anchor after resize, or a docked keyboard inset selects the bounded action-sheet
fallback. The list scrolls; the separate close control remains reachable above
system/keyboard insets. The same semantics and callbacks apply. Gallery navigation
keeps the inherited fully labeled vertical fallback at narrow/large-text sizes;
the final compact shell arrangement still needs D2 validation.

The SDK route provides modal semantics, closed-loop traversal and Back handling.
Close receives initial keyboard focus; Tab visits actions and wraps within the
route. Outside tap, close, Back, Escape and action selection all dismiss. The
opener stays locked through reverse motion; duplicate callbacks are suppressed.
A pointer shield also blocks background taps during the reverse transition.
Focus returns to the still-mounted trigger after removal. Labels and explicit
selected/expanded states supplement color; all targets are at least 48×48.

The scrim fades and content rises at most four logical pixels over 160ms with
ease-out motion; dismissal reverses the transition. System/gallery reduced motion
makes both immediate. There is no continuous animation, blur or shader. Effects
off removes optional motif/edge/gradient/shadow treatments without removing content
or functional state. Geometry uses bounded painters and simple vector primitives.

## Run and review live

From the repository root, Windows:

```powershell
cd apps/salapiya
flutter pub get --enforce-lockfile
flutter run -d windows
```

Android, from the repository root (the verified current serial is `emulator-5554`):

```powershell
.\scripts\salapiya\start-emulator.cmd
cd apps/salapiya
flutter devices
flutter run -d emulator-5554
```

If a future emulator session uses another serial, substitute the ID shown by
`flutter devices`. No transient serial is stored in launch configuration.

Use the gallery sidebar or narrow-window section selector:

1. **Foundations:** default lattice motif, focal framing and retained palette.
2. **Navigation studies:** Windows rail/dock, then **Android B · floating · selected**.
   Scroll to +, open it, choose any action and read the inline demo result. Reopen
   and try outside tap, close, Escape or Android Back. Background destinations
   remain inactive during the modal. A is historical and initially collapsed.
3. **Brand & craft:** unchanged branding and small selected/historical motif comparison.
4. **Money specimens:** unchanged exact accepted/pending/projected examples.
5. **Viewing preferences** (tune icon): switch System/Light/Dark, Craft effects,
   Reduce motion, Compact specimens and 100/150/200% text previews. Ordinary mode
   respects system text scaling; the switches reset when the app closes.

Live application review replaces mandatory screenshot/contact-sheet/video
deliverables for this and subsequent design milestones. No new media capture is
required for completion. Targeted diagnostics or explicitly requested captures
remain allowed; existing historical evidence is preserved.

## Verification record

Toolchain: Flutter 3.47.7 / Dart 3.13.5; Windows 11 x64 build 26200.9711;
existing Pixel 9 API 37 Android x86_64 emulator. No dependency or lockfile change.

| Check | Actual outcome |
| --- | --- |
| Locked dependency resolution | Passed; no dependency/lock changes. |
| Dart format / analyzer | Passed; no analyzer findings. |
| Widget regression suite | 40 distinct tests passed: 39-test consolidated run (24 D1 + 15 D1R), then the additional focused rapid-outside-dismissal regression. |
| Windows release / Android debug builds | Passed again after final application fixes, using the normal `lib/main.dart` entry point. |
| Native debug integration | Passed on Windows and Android, including menu selection/dismissal, theme/effects, exact accepted value and constrained layouts. |
| Native profile integration | Passed on Windows and Android; same native layout/interaction suite, with frame samples below. |
| Branding integrity | Six source SVG and six display PNG hashes match the D1 manifest. |
| Historical evidence / web scope | No changes to D1 media, dated D1 implementation record, web code, migrations or pnpm tooling. |

The widget suite covers modal semantics-tree isolation, collapsed/expanded states,
keyboard focus trapping/restoration, labeled 48px targets, visible scrim, outside/
close/Back/Escape dismissal, duplicate taps/actions, reverse-transition blocking,
zero-duration reduced motion, theme/effects, section revisit and menu bounds at
320×568, 800×360, 640×480 and 1600×900 with 100%/200% text and simulated docked
keyboard insets. Existing tests continue to cover all eight gallery sections in
both themes at eight Windows/Android sizes, exact money and validation/review.

Native debug matrices cover Windows 640×480 / 900×600 / 1280×800 / 1600×900 and
Android 320×568 / 360×640 / 412×800 / 800×360, each with both themes and 100%/200%
text. The native suite dispatches framework Back/Escape, selects actions and
checks their inline outcomes on the actual Flutter engines. Windows drive emits
an integration-plugin warning, but the VM-service driver connects, reports
success and writes the complete result JSON; this is not Android instrumentation
or a claim that a Windows integration-test plugin exists.

One profile run per platform measured 12 menu open/close cycles after the layout
checks, with one second to drain timing delivery before each one-second idle sample:

| Platform | Frames sampled | Build p95 | Raster p95 | Closed / open idle frames |
| --- | ---: | ---: | ---: | ---: |
| Windows | 127 | 2.440ms | 3.473ms | 0 / 0 |
| Android emulator | 147 | 1.953ms | 5.621ms | 0 / 0 |

Both measured p95 values are below the 16.7ms starting frame budget in this sample.
This is not a guaranteed frame rate or a cold-start benchmark. The earlier Android
debug run logged startup skipped frames while attaching the driver; debug timings
are retained for diagnosis, not used as release-performance evidence. Reports:
[Windows debug](../../../salapiya/design/review/d1r/windows-debug.json),
[Android debug](../../../salapiya/design/review/d1r/android-debug.json),
[Windows profile](../../../salapiya/design/review/d1r/windows-profile.json),
[Android profile](../../../salapiya/design/review/d1r/android-profile.json).

Commands from `apps/salapiya`:

```powershell
flutter pub get --enforce-lockfile
dart format --output=none --set-exit-if-changed lib test integration_test test_driver
flutter analyze --no-pub
flutter test --no-pub --reporter expanded
flutter build windows --no-pub
flutter build apk --debug --no-pub
flutter drive -d windows --no-pub --driver=test_driver/refinement_driver.dart --target=integration_test/refinement_test.dart
flutter drive -d emulator-5554 --no-pub --driver=test_driver/refinement_driver.dart --target=integration_test/refinement_test.dart
flutter drive --profile -d windows --no-pub --driver=test_driver/refinement_driver.dart --target=integration_test/refinement_test.dart
flutter drive --profile -d emulator-5554 --no-pub --driver=test_driver/refinement_driver.dart --target=integration_test/refinement_test.dart
```

The new driver writes only small JSON verification reports, with no screenshot or
video code. The native layout matrix constrains logical test surfaces on actual
engines; it does not claim physical OS resizing or emulator rotation at each size.

Issues found and corrected during verification:

- A screen-reader assertion initially inspected retained widgets, not the exposed
  semantics tree. The corrected test traverses the tree and verifies modal isolation.
- Native short-window testing exposed snackbar overlap with the trigger; menu
  outcomes now use inline live feedback.
- Returning to a scrolled navigation study exposed a PageStorage type collision.
  The historical expander now has a distinct storage key and a regression test.
- Closing SDK barriers stop hit testing during their reverse transition. A tested
  full-viewport pointer shield prevents a second tap reaching background controls.
- Profile tests initially used a debug-name lookup for synthetic Escape input.
  Supplying `PhysicalKeyboardKey.escape` explicitly removes that test-only issue.

## Limitations and owner checkpoint

Automated semantic/focus/target checks are not manual Narrator/TalkBack acceptance.
Spoken navigation, accessibility-focus restoration with those tools, physical
Android touch, gesture versus three-button navigation, predictive-back animation,
floating keyboards that report no inset, OS maximum scaling and physical-device
performance remain unaccepted. Back dispatch is tested through the framework's
native integration binding; this is not a claim of an OS gesture review.

Profile frame samples are diagnostic emulator/development-host results, not a
production startup/memory/input-latency benchmark or G6 closure. No real financial
workflow, persistence, profile, authentication, sync, backup, launcher icon,
distribution or production router has been added. The web reference is unchanged.

Review should decide whether the lattice/softness balance, pearl-edge
intensity in both themes, and + menu proportions, action order and motion feel
right. Android B itself is already selected. After visual approval and a new
assignment, bounded D2 should assemble the Windows rail/dock and Android B shell,
five destination placeholders and synthetic Overview; validate route/Back/focus
state, measured navigation clearance, IME and compact/large-text layouts. Do not
reopen A/B selection or begin real services. D1R stops here for review.

## Complete source and file inventory

[D1R_SOURCE_SNAPSHOT.md](https://github.com/RAbnza/Personal-Management-Platform/blob/294c6d0/docs/salapiya/design/D1R_SOURCE_SNAPSHOT.md) contains the complete final bodies
of all modified/new code files, not patches or snippets. Source files remain
authoritative. [D1R_FILES.json](../../../salapiya/design/D1R_FILES.json) lists every repository-relative
changed path and local-byte hash; it excludes its own recursive hash. There are
no changed configuration files or new binary assets.
