# Post-P6 presentation polish

29 October 2026 (Asia/Manila). Presentation milestone; **P6 private release remains BLOCKED**.
No distribution, signing, provider changes, merge to main, or screenshot capture.

## Baseline and continuation

Fetched `origin/feat/salapiya-p6-private-release` before branching. Local and remote
both matched `c40cbb06486b99f206f27f42c675c4f695cbda8c`; the working tree was clean.
Created `feat/salapiya-post-p6-presentation-polish` from that exact commit. No reset,
history rewrite or force push was used. The blueprint, P0–P6 handoffs, private
release operations, final redesign, Android polish, design system/platform rules,
screen inventory and relevant financial/native implementation informed this work.

Implementation checkpoint: `c4031256473a9943ae2f6e8567d91d766f94350e`, following
`8db9dbd` (forms) and `1b25573` (Android amounts). The final documentation commit cannot contain its own SHA; retrieve
the exact handoff tip with `git log -1 --format=%H --
docs/salapiya/POST_P6_PRESENTATION_POLISH_HANDOFF.md` after fetching this branch.
The final chat handoff supplies the exact pushed tip as well.

## Scope and inventory

Retains Geist, neutral surfaces, restrained violet/lavender, current navigation,
Daylight/Midnight, bounded desktop forms and naturally scrolling Android forms.
Historical D0–D5 presentation is not restored. The inventory distinguishes form
families from supporting screens; they retain their existing state machines.

| Production family inspected | Workflows | Existing state contract and presentation response |
|---|---|---|
| `FinancialEditor` | Accounts/openings/categories/archive; cash/card-funded expenses, income, splits, transfers/fees, refunds, corrections/reversals, reconciliation/adjustments; private Shared adoption/clearing where routed here | Durable details, validated review, saving, local receipt, failure, stale, unknown, original-result check. Structured validated effects, local-success header, separate actual transport status, retained draft and recovery actions. |
| `NativeFinanceEditor` | Card metadata, authorizations, purchases/fees/interest/refunds/payments; statements/allocations; installment schedules/revisions/applications; debt import/borrowing/payments/components/provider schedules/mappings/payoff/adjustment; recurring obligations/generation/links; budgets; goals/reservations/reallocation; financial correction/reversal and file-link archive | Same planner and frozen command as before. Details/review/local receipt, failed draft, validation/source rejection and uncertain readback. Uses the same financial review/status/evidence components. Provider/planning evidence does not become actual cash. |
| `_SharedForm` and private-effect confirmation | Groups/participants/invitations/history consent, bills/refunds/corrections, payment reports/recipient decisions, settlements/reversal/dispute, source adoption/private funding/clearing, membership/owner/archive actions | Review/Edit/Save, optional durable draft, busy/error, then existing route close. Label/value review and visible group/private boundary retained. Private-money confirmation now uses typed financial effects. Saved group work still distinguishes pending, accepted-awaiting-entitled-download, restored and rejected; no artificial success route was added. |
| `LifeForm` | Calendar events; Tasks; Learning courses/progress; Books/reading; Career applications/events/stages/outcomes/contacts and retained-edit review | Durable draft/source version; required fields; review; saving; local completion; failed/stale/uncertain save retention. Shared status/review rows and copied command/source identifiers. Per-command transport state is separate from local save. Existing checkbox/direct actions retain their immediate navigation/feedback. |
| Life/connection review | Rejected private edits, retained/current comparisons, restored/missing/mismatched financial intents and original resume | Warning status, retained comparisons and recovery actions. Stable identifiers become selectable evidence. No new identity or permission behavior. |
| Cash CSV import | Selection/mapping, original staging, immutable preview, row/duplicate decisions, bounded processing/cancel/resume and original-process recovery | Structured row count and secondary checksum/batch evidence; neutral operation status and warning on incomplete work. Partial chunks never become a generic all-done success. Existing exact row review remains. |
| Supporting files | Retained selection, reviewed attachment, reselection, preview/export/local-copy removal | Structured file metadata and secondary checksum/source evidence. Local/unscanned/no-cloud/no-backup-bytes disclosures stay visible. Neutral result status preserves cancellation and availability distinctions. |
| Profile/connection/backup | Local creation, Google/enrollment/collision, archive inspection and activation, preference failures | Existing specialized validation/confirmation/navigation retained. Archive review is structured and keeps current-Google and missing-file-byte requirements visible; profile ID/format are secondary. Backup/recovery status is neutral because the source message can describe cancellation or an error. |
| Synthetic gallery/prototype forms | Historical in-memory demonstrations | Inspected for production reachability; not promoted to production controllers. Shared presentation primitives may affect their rendering, but simulated outcomes remain explicitly simulated. |

## Shared form presentation

`design_system/form_presentation.dart` provides small composable widgets:

- `ReviewRow`: readable label/value relationships; columns stack below 460 logical
  pixels or with enlarged text. Important amounts use the existing title style.
- `ReviewNotes`: keeps operational/financial disclosures visible without making
  every sentence a nested card or a green successful-operation indicator.
- `FormStatus`: semantic live region, labelled icon, restrained semantic surface,
  success check/error/pending treatment and genuine in-progress indicator.
- `FormSyncStatus`: consumes actual persisted transport state, separately from
  local completion. Pending, accepted-awaiting-download, reconciled, review and
  restored states remain different. An unknown/missing state makes no cloud claim.
- `FormEvidence`: expandable selectable evidence. Each selectable child has its
  own page-storage key, preventing expansion booleans from being read as text
  scroll offsets. The focused test opens, closes and reopens this disclosure.

`WorkspaceSteps` now ends in **Result**, so an uncertain or failed operation is
not labelled Saved. Existing form width, safe insets, scrolling, keyboard focus,
Back/close guards and disabled submission remain. Redundant inner form padding
was removed from the main editor and Shared form. Done is the principal completed
action; additional purchase sharing remains available as a secondary action.

### Financial review and evidence

`financial_review.dart` reads the validated `LocalPlan`, its typed revision and
postings, and the snapshot used for review. The everyday editor obtains that
presentation plan from the existing pure planner using the exact preview values,
command ID and version. No separate submission/calculation engine was introduced.

Cash/expense debits and income/liability/equity credits retain their established
sign conventions. Card/debt liability increases are shown from negative credit
postings; cash and recognized expense/income are separate rows. Private shared
receivables/payables are labelled private. Unmapped clearing ledgers deliberately
retain a signed-posting label rather than guessing a financial direction.

A card fee displays its amount, transaction date, card, liability increase,
recognized expense and **Cash movement: None**. Relevant categories/accounts and
posting dates accompany rows. Provider dates, payment allocations, schedule/input
details and planner disclosures remain visible. Evidence-only zero-valued plans
are identified as evidence/plans instead of emphasizing a fictitious payment.

Corrections show previous and replacement postings, explicitly saying the new
effects replace the old transaction. Reversals identify the effects being removed
at original dates. The original plan prose, command ID, revision, previous/source
IDs remain selectable under financial evidence. Only exact generated posting
sentences already represented by typed rows are removed from the default prose;
warnings and consequential explanations are retained. Amount privacy also applies
to the new review and its expanded monetary evidence.

### Outcomes and recovery

Green local success appears only after the existing commit/receipt path confirms
local persistence. A connected success can additionally show pending upload,
service acceptance awaiting download, or reconciled state; it never means recipient
confirmation. Shared reporting still moves no other participant's private money.

Definite main-editor failure retains the controller's no-applied-action proof.
Stale source states keep the draft/current-preview action. Unknown results retain
their warning, original identity and **Check original result** action. The native
P4 editor retains its existing protected reopen-and-inspect recovery requirement.
Life retains its original-form retry and source-version behavior. Failed draft
persistence never becomes successful navigation. No artificial operation delay,
confetti, unsupported destination or extra confirmation step was added.

No ledger arithmetic, numeric parser, schema, migration, source version,
authorization, immutable receipt, queue, OAuth, PowerSync, backup format, encryption
or notification scheduling implementation changed. Web code and tooling are intact.

## Android Overview amounts

`OverviewMetrics` opts in only for Android. It measures all four complete strings
with bundled Geist, actual text scaling and the available card width **before**
laying out the matching-height rows. It selects two columns only when every value
fits at a readable minimum. Amounts start at 26 logical pixels and can reduce to
18; otherwise cards use one column. Text scaling is not disabled.

The full peso symbol, sign, separators and centavos remain one text unit; no
abbreviation, rounding, ellipsis or fading. At extreme supported totals and 200%
text where a full-width card still cannot fit, horizontal scrolling exposes all
digits with a visible “Scroll amount to see all digits” hint and full text semantics.
Normal and multi-million values do not use that fallback at standard tested widths.
Hidden/unavailable values follow the same layout without exposing underlying money.

Windows continues through the original `WorkspaceGrid(minWidth: 150)` and default
`ValueBlock` typography. Accepted-history calculations, pending overlays, privacy,
caption/date semantics, row-height matching and spacing are unchanged.

## Windows integrated caption

Selected native DWM styling after inspecting `main.cpp`, both window classes,
plugin registration, app-links dispatch, notification identity/activation adapter,
packaging and theme ownership. No new package or custom caption/buttons were added.

`WindowChrome` sends the resolved app theme's canvas/text/divider RGB values through
`dev.salapiya/window_chrome`. The runner applies immersive dark mode and native
caption/text/border colors. Windows still draws and owns the entire non-client
frame, icon, controls, resize edges, system menu and accessibility surface. App
theme preference survives OS color/theme updates. High contrast restores system
colors. Unsupported color APIs fall back to standard OS chrome without blocking
startup. No window style, hit test, DPI geometry, creation/lifecycle, minimum size
policy, metadata, AUMID/CLSID, protocol mapping, data directory or installer changed.

The supported Windows 11 color attributes are documented by
[Microsoft's DWM attribute reference](https://learn.microsoft.com/en-us/windows/win32/api/dwmapi/ne-dwmapi-dwmwindowattribute).
The implementation checks native setter results; caption colors are not assumed
to support `DwmGetWindowAttribute`. This is integrated native styling, with standard
OS caption geometry and title font, not a borderless replica of another product.

## Validation record

All test records are synthetic and isolated. No screenshots, new goldens, screen recordings, UI image
exports or screenshot galleries were generated, saved or committed. Historical
branding/images and P6 release evidence were preserved.

The pinned Flutter 3.47.7 SDK was used. Commands below run from `apps/salapiya`;
logs are local ignored build output, not distributable artifacts.

| Check | Result and evidence |
|---|---|
| Formatting and analysis | `dart format --output=none --set-exit-if-changed lib test integration_test`: 220 files, zero changes. Final `flutter analyze --no-pub`: **No issues found**. `build/post-p6-analysis-final.log`. |
| Existing focused presentation suites | 17 passed: financial widgets, P1/P2/P3/P5 widgets and Android Overview. `build/post-p6-focused.log`. |
| Final focused presentation suite | `flutter test --no-pub test/post_p6_presentation_test.dart`: **5 passed**, including the added caption bridge test. `build/post-p6-final-focused.log`. |
| Full unit/widget regression | `flutter test --no-pub --concurrency=1`: **223 passed**. Includes the metric, real fee, lost-response and state-semantics tests; final caption bridge test was added afterwards and validated separately. `build/post-p6-regression.log`. |
| Android focused native presentation | **2 passed** on `emulator-5580`: real fee review/edit/save/evidence and existing Overview/creation journey. `build/post-p6-android-native.log`. |
| Windows final focused native presentation | **3 passed** after the final native event-handling change: fee review, Overview/creation, and native caption application/window behavior in Daylight and Midnight at 120 DPI. `build/post-p6-windows-native-final.log`. |
| Android broader native regression | **4 passed**: cards; debt/provider schedule/payoff; planning and actual links; Life authoritative events/history/encrypted restart. Life persisted 6 records and 13 revisions while financial revision stayed zero. `build/post-p6-android-regression.log`. |
| Android final cards rerun | **1 passed** after the shared test navigation adjustment. `build/post-p6-android-cards-final.log`. |
| Windows broader native regression | **All four journeys passed across the initial run and targeted rerun**: debt, planning and Life passed initially; cards passed after centering the final navigation link. `build/post-p6-windows-regression.log` (3 passed, 1 initial failure) and `build/post-p6-windows-cards-final.log` (1 passed). |
| Normal Windows development build | `flutter build windows --debug --no-pub --dart-define-from-file=build/p2-public-defines.json`: **passed**, normal `lib/main.dart` entry point. `build/post-p6-windows-build.log`. |
| Normal Android development build | `flutter build apk --debug --no-pub --dart-define-from-file=build/p2-public-defines.json`: **passed**, normal `lib/main.dart` entry point. `build/post-p6-android-build.log`. Existing Gradle native-access warnings were nonfatal; dependencies/toolchain were not upgraded. |
| Git scope/whitespace | `git diff --check` and staged diff checks passed. Domain/store, manifests/lockfiles, backend/contracts, web and release workflows remain unchanged. |

Windows invocation for the native caption test adds
`--dart-define=SALAPIYA_CHROME_PROBE=<repository>/scripts/salapiya/test-window-chrome.ps1`
to `flutter test integration_test/post_p6_presentation_test.dart -d windows`.
Android uses `-d emulator-5580` without that Windows-only define. Broader native
journeys use `integration_test/post_p6_regression_test.dart` on each target; the
targeted cards rerun uses `integration_test/p4_cards_test.dart`.

The added metric test sweeps 132 combinations (three widths, two themes, two text
scales and eleven values), measuring all four actual Geist-rendered amounts and
checking equal row heights, no line loss and the explicit extreme-value scroll
fallback. Values include zero, cents, ordinary thousands, just below a million,
millions, tens of millions, negative and maximal-range totals, hidden and
unavailable states. The real fee test proves unchanged cash and a single exact
liability/expense effect. The lost-response test commits to encrypted SQLite,
withholds receipt readback, then resolves the same original command without a
second submission. State tests inspect accessible text/live regions in both themes.
The caption bridge test checks exact light/dark RGB values and no duplicate call.
Existing P1/P2/P3/P5 fixtures also retain real persistence and transport/review
coverage, Shared long names and 200% text, keyboard/draft recovery, Life Back
behavior, and shell focus restoration. No fresh hosted-provider acceptance was
performed; transport presentation uses established local fixtures and stored
states. Human screen-reader acceptance remains open.

Earlier validation exposed and fixed a selectable-text page-storage collision
inside expanded evidence. Test-only finder ambiguity, console Unicode encoding
and unsupported native caption getter/menu probes were corrected; the final
probe asserts only supported, observable behavior. The Windows cards regression
also exposed a test navigation scroll that aligned its final link beneath the
fixed shell header. The test now centers that link before tapping; its balance,
credit, persistence and no-network assertions are retained. No financial semantics were
changed to make tests pass.

Native window evidence is deliberately bounded: the actual runner accepted the
DWM colors in both themes; a PID/path-restricted Win32 probe exercised minimize,
maximize/restore, resizing, draggable-caption hit testing and non-client double
click at 120 DPI. It also checked native icon and standard window styles. This is
not human pointer-hover, Snap-flyout, Alt+F4, Narrator, multiple-monitor, minimum-OS,
high-contrast or installed-package certification. Notification/OAuth registration
and cold activation remain unchanged source paths, not freshly certified installed
flows. Single-instance handoff is likewise source-preserved and not freshly
exercised against an installed package. Do not count these checks as closing G5/G6.

## Files changed

All paths below are under `apps/salapiya/` unless prefixed otherwise.

- Shared presentation: `lib/design_system/form_presentation.dart`,
  `lib/design_system/workspace.dart`,
  `lib/features/finance/presentation/financial_review.dart`,
  `financial_editor.dart` and `financial_widgets.dart` in that same directory.
- Production form adapters: `lib/finance/finance_screen.dart`,
  `lib/finance/import_screen.dart`, `lib/finance/files_screen.dart`,
  `lib/shared/shared_screen.dart`, `lib/life/life_form.dart`,
  `lib/life/life_reviews.dart`, `lib/connected/connection_view.dart`,
  `lib/local/local_profile_view.dart`.
- Android layout: `lib/app/workspace_overview.dart` and the opt-in amount
  rendering in `financial_widgets.dart` above.
- Windows integration: `lib/app.dart`, `lib/app/window_chrome.dart`,
  `windows/runner/flutter_window.cpp`, `flutter_window.h`, `win32_window.cpp`
  and `win32_window.h` in that same runner directory;
  repository `scripts/salapiya/test-window-chrome.ps1`.
- Validation: `test/post_p6_presentation_test.dart`,
  `integration_test/post_p6_presentation_test.dart`,
  `integration_test/post_p6_regression_test.dart`; presentation text finders and
  desktop navigation centering in
  `integration_test/p4_cards_test.dart` and `integration_test/p5_life_native_test.dart`.
- Documentation: repository `docs/salapiya/POST_P6_PRESENTATION_POLISH_HANDOFF.md`,
  `docs/salapiya/design/DESIGN_SYSTEM.md`, `docs/salapiya/design/PLATFORM_UX.md`.

## Artifacts, release boundaries and owner review

No release version, dependency or signing identity changed. Source remains
`0.6.0+7`; debug test artifacts are development-only, not a new signed candidate.
The signed P6 build 7 candidate, signing secrets and release-test AVD were not
overwritten. Android work used the separate `Salapiya_P6_Native_Test` AVD. No new
keystore, signed package, installer, distribution, paid service or hosted mutation.
Normal development outputs are `apps/salapiya/build/windows/x64/runner/Debug/salapiya.exe`
and `apps/salapiya/build/app/outputs/flutter-apk/app-debug.apk`. These replace only
local debug/test outputs and are not the owner-signed P6 candidate.

P6 remains **BLOCKED**, including trusted Windows signing/installed updates,
remaining signed Android update cases, lifecycle/deletion/revocation, sole-owner
recovery, independent hosted backup/restore, physical Android acceptance, human
Narrator/TalkBack, mixed-domain capacity/quotas and outstanding administrative
dependency advisories. The approved local-only attachment policy remains intact.

Owner live visual-review checklist:

- Review and save a card fee and a provider schedule; inspect exact effects and
  dates, local success, Done, and expandable/copyable evidence.
- Compare ordinary expense/transfer/correction, planning and Life review/result
  pages in Daylight/Midnight; edit from review and use Back with a durable draft.
- Review a Shared bill/payment and private-money action; confirm group acceptance,
  transport synchronization and recipient confirmation remain visibly separate.
- Inspect `₱9,283,004.75` on Android, all four cards, hidden values and 200% text;
  inspect the explicit scroll fallback for exceptionally long totals.
- Inspect Windows caption continuity in both themes and active/inactive states;
  manually try drag, corners, Snap flyout/keyboard snapping, Alt+Space, Alt+F4,
  multiple monitors/DPI and assistive technology before release acceptance.
- Check file/archive review: missing cloud/file-byte coverage must remain visible.

Owner visual review is separate from the blocked private-release decision.

**Implementation: COMPLETE. Ready for owner visual review: YES.** The next
release-closure task should start from the final pushed tip of
`feat/salapiya-post-p6-presentation-polish`, using the exact SHA in the final chat
handoff or the handoff-tip Git command above. Do not restart from the historical
P6 baseline or interpret this presentation milestone as release acceptance.
