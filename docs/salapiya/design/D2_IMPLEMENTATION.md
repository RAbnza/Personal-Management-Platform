# D2 — native shell and interactive Overview

Date: October 22, 2026 (Asia/Manila). Branch: `feat/salapiya-d2-shell-overview`.
Base: `2093d4b419562923a4ee59ebd6b8992f79933cfa`, verified against refreshed
`origin/feat/salapiya-d1r-design-refinement`; not merged into `origin/main`
(`7662ce9cb22d6aa1ca5d18ca6604b7bdb416fc66`). Initial working tree clean.

## D2-F0 completion gate

Owner approved D1R after live review, except its repeated long stepped top line.
`LatticeFrame` attached `_PaneEdge` as its foreground painter. It drew a 1.5-unit
horizontal stroke at y=4 followed by two stepped segments near the right corner.
Removed that wrapper/painter and the now-unused `pearlEdge` token centrally.
Rounded borders, selected/focus outlines, motifs, gradients and shadows remain.
No per-consumer hiding flag or automatic replacement corner ornament was added.

Audited all consumers: `CraftPanel(focal: true)` including Foundations and both
craft comparisons; `NavigationStudy` Windows rail/Android capsule; and the raised
`FloatingActionMenu`. Ordinary panels, dialogs and review surfaces use standard
boundaries. `_WeavePainter` is the only remaining custom painter: its bounded
lattice outlines/historical weave do not draw a panel-wide top line.

Before starting D2 implementation:

- Locked dependency resolution passed; no dependency changes.
- `flutter analyze --no-pub`: no issues.
- `flutter test --no-pub`: 41 tests passed, including shared-frame boundaries,
  all gallery sections at eight viewport sizes and 100/200% text, and menu
  focus, modal dismissal, duplicate activation, keyboard insets and themes.
- `flutter test integration_test/refinement_test.dart --no-pub -d windows`:
  passed, 46s runtime; Android `emulator-5554`: passed, 53s runtime.
  Each runs 32 theme/size/scale menu configurations, reduced motion, effects-off
  Foundations and exact finance labels, plus menu open/close cycles.
- `flutter test integration_test/decoration_test.dart --no-pub -d windows`:
  passed, 13s runtime; Android emulator: passed, 13s runtime. All eight gallery
  sections rendered in both themes, effects on/off; comparison cards scrolled
  into view and shared frame structure/boundaries asserted.
- Native debug build/install/render succeeded as part of both integration runs.
- No screenshots, contact sheets or videos generated. Automated native rendering
  is not owner visual approval or spoken screen-reader certification.

Initial regression assumption that every descendant painter was decoration was
corrected: Material controls have functional painters. Tests now inspect the
shared frame boundary directly and preserve those functional indicators.

D2-F0 gate passed on both platforms; D2 implementation may now begin.
