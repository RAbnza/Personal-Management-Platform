# D2 — native shell and interactive Overview

**Historical D2 record:** The owner requested a complete visual replacement on 23 October 2026. [D2 reimagined](D2_REIMAGINED.md) describes the current UI and checks. Measurements and review files below belong to the earlier implementation and do not certify the redesign.

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

## D2 implementation (October 23, 2026)

The ordinary app launch now opens Salapiya's product shell and Overview. The
preserved gallery is reachable at Profile & utilities > Design Gallery, with a
Back control. `SalapiyaApp(gallery: true)` is an explicit gallery test harness;
old startup coverage is retained as `gallery_startup_test.dart`. No dependencies
were added, and the resolved lockfile is unchanged. Flutter 3.47.7 / Dart 3.13.5
remain the exercised toolchain.

### Architecture and state

- `lib/app/shell.dart`: five primary destinations, contextual actions, per-tab
  scroll controllers and duplicate task-route guard. `IndexedStack` retains the
  bounded destination views. Primary selections never add Back-stack entries.
- `lib/app/demo_routes.dart`: one SDK Navigator stack for source details, tasks
  and utilities, short reduced-motion-aware transitions, return focus, and source
  context. Routes can nest (group > settlement; Life agenda > Career/Tasks).
- `lib/prototype/scenarios.dart`: one `PrototypeSession` ChangeNotifier for seven
  scenarios and privacy. Exact amounts reuse `BigInt` and the existing fixtures.
  Coverage, transport and receipt meaning remain separate. No repositories,
  storage, OAuth, network calls, database migrations or ledger writes were added.
- `lib/app/shell_navigation.dart`: Windows sidebar/rail plus separate action dock;
  Android selected floating B plus the existing D1R FloatingActionMenu. A measured
  footer reserves its full actual height, safe area and gap. No covered last rows.
- `lib/app/overview.dart`: focal Money Today and attention region, chronological
  commitments, Shared Expenses and meaningful Life glance. At >=860 workspace
  width and ordinary text, related regions share two columns. Smaller views
  present the same priority vertically and link to bounded details.
- `lib/app/previews.dart`: module landings, source-linked detail pages, temporary
  demo-note task preview and three distinct first-run choices. PopScope protects
  a nonempty note; cancel retains input, discard exits, and no action claims save.
- `lib/app/profile_utilities.dart`: scenario/preferences/privacy, first run,
  gallery and licenses. Preferences and scenarios are shared across product
  routes and reset on process close; gallery specimen state remains isolated.

SDK Navigator/ChangeNotifier was selected because D2 has five transient roots
and bounded source/task routes, without deep-link parsing, persistence or service
injection. `go_router` and Riverpod were evaluated against these needs and deferred;
adding package lifecycle/version/licensing work would provide no exercised D2
benefit. This is a bounded prototype choice, not G0's final production decision.
SDK reference checks: [Navigator](https://api.flutter.dev/flutter/widgets/Navigator-class.html),
[PopScope](https://api.flutter.dev/flutter/widgets/PopScope-class.html), and
[IndexedStack](https://api.flutter.dev/flutter/widgets/IndexedStack-class.html).

Detail/task routes temporarily own the screen, so their inputs cannot overlap
global navigation or another creation flow. Returning reveals the original tab
and scroll. There is no simultaneous cross-tab draft workspace; a dirty note
must be kept or explicitly discarded before primary navigation becomes available.
At a primary root, Android Back follows the platform exit/background behavior.
Escape and Alt+Left target the top route from the app navigation boundary, including
when focus returns to the route scope after a dialog. Standard text shortcuts
are not overridden. No speculative Ctrl+number/command palette shortcuts were added.

### Product behavior and financial meaning

The fixed fictional date remains 21 October 2026, Asia/Manila; the greeting names
Amihan. Local-only is a valid state, not a synchronization failure. The profile
utility offers current, waiting, pending, incomplete, empty and review scenarios.
Accepted liquid money is 2930075 centavos. Pending 18550 outflow is shown separately
with projected 2911525. Incomplete history has no displayed total, while a complete
empty profile shows zero and no accounts. Card liability 480000 is separate from
liquid money; card amount due is deliberately unavailable.

F-SCHEDULE commitments identify Career, Tasks, Planning, Cards and Debts sources.
Expected bills/payments are not actual expenses. Group/settlement fixtures are
independent of Money Today, explicitly illustrative in local-only mode, and do
not imply access to other people's private accounts. Transport current does not
confirm Tala's reported payment; recipient-confirmation and private-effect review
remain separate. Exact amount masking also covers source details; the separate
Design Gallery explains that its fixed specimens are outside that preference.

Quick actions use caller-owned callbacks. Overview/Money prioritize expense,
income and transfer; Debts offers payment/existing debt/borrowing; Shared offers
shared expense/report payment; Life offers task/event. Each opens a truthful task
preview. A temporary note exercises focus, keyboard and dirty Back protection;
it is not partial financial logic and is never saved.

First-run preview offers local offline creation, simulated Google retrieval and
synthetic backup restoration as three distinct choices. Each explains its scope
and asks to switch the in-memory scenario. Google requests no credentials and
shows incomplete retrieval; restore reads no file/secret and discloses missing
attachment bytes and separate online group authority. Cancel preserves state;
Skip to populated demo remains available. Full lifecycle/identity stays deferred.

### Run and review live

From `apps/salapiya`:

```powershell
flutter pub get --enforce-lockfile
flutter run -d windows
# In another terminal, discover the actual Android id:
flutter devices
flutter run -d emulator-5554
```

If Android is absent, run `scripts/salapiya/start-emulator.cmd` from the repository
root first, then use the device id printed on that run. Release Windows can also
be opened at `apps/salapiya/build/windows/x64/runner/Release/salapiya.exe` with its
adjacent build files intact. No screenshot collection is needed for review.

1. Launch into Overview; inspect Money Today, attention, Coming Up, Shared and
   A Little Life. Scroll the final item above the dock/capsule.
2. On a wide Windows window collapse/expand the sidebar. At medium width Expand
   opens labeled navigation; at narrow/large-text sizes use Navigation. On Android
   inspect all five capsule labels, its 3+2 adaptation and the constrained modal
   Navigation fallback. Final dimensions/fallback economy await owner approval.
3. Choose Money, Debts, Shared Expenses and Life. Check their contextual dock/+
   commands, then return to Overview without accumulating tab-tap Back history.
4. Open +, dismiss outside/Back/Escape, then choose a task. Enter invented note
   text, use Back, Keep editing, Preview outcome, then Discard demo draft.
5. Open View accounts and View activity. Follow a group to its settlement example
   and Back twice; follow a Career/Task commitment to its Life source.
6. Profile & utilities opens the seven scenarios. Return to Overview to compare
   accepted/projected, unavailable/zero, local/current and review wording.
7. Use the eye icon for amount privacy; check account/group details as well.
8. Profile & utilities > First-run preview exercises the three paths and Skip.
9. Profile & utilities > Design Gallery preserves all original sections and
   controls. Foundations, Brand & craft and Navigation studies show corrected
   framing. Open the Android + specimen to inspect the same shared surface.
10. Switch System/Light/Dark, Craft effects, Reduce motion and text size. System
    reduced motion is always respected and high contrast suppresses decoration.
    Restart the app to reset transient state.

### D2 verification and remaining limits

Tests/builds below were performed on Windows 11 x64 and the existing Pixel 9
Android 17/API 37 x86_64 emulator. Exact final results are recorded below after
consolidated checks. Historical D1/D1R screenshots and reports remain unchanged.

- Windows and Android native startup acceptance passed, including five destinations,
  accounts drilldown/Back, menu dismissal and task selection, dirty-note keep/discard,
  seven scenario transitions, privacy, themes/effects/motion, simulated retrieval
  and preserved gallery access. Windows runtime 16s; Android runtime 32s.
- Native profile layout runs passed 24 configurations per platform: four logical
  sizes x three text scales (100/150/200%) x two themes, with effects/reduced-motion
  variants, menu selection and final-scroll-item clearance. Windows sizes:
  320x568, 640x480, 900x600, 1440x900. Android: 320x568, 360x640, 412x900, 800x360.
- Profile timing reports are in `review/d2/windows-profile.json` and
  `review/d2/android-profile.json`. Windows: 250 sampled frames, build p95 20.102ms,
  raster p95 14.153ms, zero one-second idle frames. Android: 342 frames, build p95
  5.141ms, raster p95 5.100ms, zero idle frames. Windows exceeds the provisional
  16.7ms build target. These bounded samples include navigation/scenario/menu work
  under host load; they do not certify cold startup, memory, physical performance
  or G6. No continuous animation or unbounded activity-list construction exists.
- `android_input_test.dart` passed actual emulator surface rotation to landscape
  and back, on-screen IME show with nonzero reported inset, and reachable task
  outcome. The host temporarily enabled `show_ime_with_hard_keyboard`; its original
  value 0 was restored. Runtime 12s. This is not arbitrary floating-keyboard proof.
- Windows release UI Automation exposed all five destinations, exact money text,
  dock actions and source links. A targeted capture diagnosed missing input geometry
  and showed the corrected panel boundary. Subsequent input was repeatedly rejected
  because local user input was detected; no manual OS-resize/click pass is claimed.
  Automated native Windows keyboard/navigation/constrained layout checks are separate.
- The first assembled tests exposed a narrow 200% footer overflow and an Escape
  focus-scope gap after Keep editing. The constrained navigation label was shortened
  and the global top-route handler corrected. A narrow-menu test was also corrected
  to accept the intended sheet fallback instead of requiring the anchored menu key.
- The emulator temporarily disappeared/offlined; the existing cold-start helper
  restored it without wiping data. Later native checks passed. Gradle/JDK native
  access warnings remain. Windows flutter-drive reports an integration-test plugin
  warning, but its Dart driver receives the completed passing report and timings.
- No physical Android device, spoken Narrator/TalkBack run, predictive-back gesture
  animation, gesture-vs-three-button matrix, floating keyboard without inset, OS
  high-contrast palette certification or production load/cold-start benchmark is
  claimed. Native UIA/semantics and automated target checks are narrower evidence.
- Web source/tests/migrations/pnpm tooling and all branding/font assets are preserved.
  No real auth/storage/sync/finance/privacy authority was implemented. G0-G4/G6 and
  the other production engineering gates remain open.

### Owner review boundary and bounded D3 recommendation

D2 awaits live approval of Overview density, the 860-unit two-column composition,
Windows sidebar/dock dimensions, Android capsule/3+2/constrained Navigation fallback,
profile utility discoverability and first-run preview wording. Automated success is
not visual approval. Stop here: D3 has not started.

After approval, a bounded first D3 slice should cover Accounts and Money Activity
with synthetic expense/income/transfer entry > review > simulated outcome,
correction evidence and exact shared fixtures on Windows/Android together. Plan
subsequent debt/card/shared slices with full inherited acceptance traceability;
this recommendation does not remove any financial launch capability or bypass
G0-G4 before real services.
