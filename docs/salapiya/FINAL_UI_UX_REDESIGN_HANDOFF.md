# Salapiya - final UI/UX redesign handoff

Date: 27 October 2026 (Asia/Manila). Branch: `feat/salapiya-final-uiux-redesign`.
Status: implemented presentation baseline for owner visual review; P6 has not started. This is not a release, security, accessibility or synchronization certification.

## Authority and starting point

This handoff supersedes **D0-D5 presentation choices**. In particular, do not restore the Windows floating quick-action tray, dark-only sidebar, oversized hero headings, button walls or technical banners from those historical screenshots. Keep those records for provenance. The accompanying [design system](design/DESIGN_SYSTEM.md) and [platform UX](design/PLATFORM_UX.md) now lead with the implemented rules.

P0-P5 financial/domain, ownership, identity, privacy, immutable evidence, offline storage, synchronization, authorization and recovery contracts are not superseded. The [product blueprint](../SALAPIYA_PRODUCT_AND_PLATFORM_BLUEPRINT.md), [P1](P1_LOCAL_FOUNDATION_HANDOFF.md), [P2](P2_CONNECTED_IDENTITY_HANDOFF.md), [P3](P3_SHARED_EXPENSES_HANDOFF.md), [P4](P4_COMPLETE_FINANCIAL_SCOPE_HANDOFF.md) and [P5](P5_LIFE_AND_NATIVE_INTEGRATION_HANDOFF.md) remain the functional evidence trail.

The requested base `e7027ce984a1ad2a9cafa75a6d1bc0d2d35bfe7c` was verified as an ancestor of the starting P5 branch HEAD `5ed1785af22b250074da849f399498674ed2785a`. The descendant added the six supplied reference images. The redesign branch was created from that HEAD. Unrelated untracked `apps/salapiya/android/build/` was preserved and excluded from the commit. No web application, migration, provider configuration or production dataset was changed.

## Direction and references

The strongest reference is [dashboard_windows_1.png](../../apps/salapiya/assets/references/final_redesign/dashboard_windows_1.png): a narrow light sidebar, quiet gray workspace, compact metric row and purposeful white sections. The implemented design adopts that composition while retaining Salapiya's identity, exact financial distinctions and actual available features. The alternate dashboard and four onboarding references informed the first-use frame and phone adaptation; they were not used as fake runtime data or raster UI backgrounds.

The seven supplied problem screenshots drove these concrete corrections:

| Problem | Implemented response |
| --- | --- |
| Cards presented eleven equally prominent pills | Three task groups: Cards & payments, Statements, Installments; primary actions plus labelled secondary menus; card metrics and bounded list |
| Planning presented all commands and empty sections together | Recurring/Budgets/Savings groups, a forecast entry, and separate Recurring/Budgets/Savings/History views |
| Reports were a technical prose wall | Spending/income/cash summary, period comparison, bounded filters, optional liability/clearing detail and linked evidence |
| Import had one long technical warning | Clear import action and history; concise supported scope with format/limits available on demand |
| Files displayed repeated engineering banners | A visible truthful local/unscanned/backup limitation, clear source and file controls, optional limits and backup detail |
| Career displayed fourteen stage chips | One labelled stage dropdown, shared section tabs, search and lifecycle filters; purposeful empty state |
| Android packed five destinations and plus into one row | Five labelled destinations; separate plus above the right edge; large-text/narrow fallback |

## Shared visual system

Geist remains the bundled typeface. Daylight uses `#F3F4F6` canvas, white surfaces, ink text, light dividers and restrained purple actions. Midnight uses `#14151A` canvas, `#1E2027` surfaces and accessible light/lavender roles. The logo remains the approved existing asset. No generated artwork, third-party icon pack, network font or package dependency was introduced.

The scale uses 4/8/12/16/24/32 spacing, 14-radius panels and 10-radius fields/buttons. Workspace panels have 20 padding. Desktop headline/body defaults are 28/14, with 18 section titles. Desktop buttons have 38 minimum height; Android uses 48. Text is allowed to scale and wrap. Neutral notices carry ordinary information; warnings retain visible meaning and do not rely on color alone. Existing reduced-motion and effects preferences are preserved.

`lib/design_system/workspace.dart` centralizes panels, wrapping tabs, responsive grids, task groups, empty states, expandable help, bounded forms, steps, pagination and exit protection. `welcome_frame.dart` owns first-use composition. `app/workspace_overview.dart` owns the production dashboard. These consume existing controllers and semantic colors rather than creating a second feature implementation.

## Onboarding and returning sessions

First use has three clear paths: Continue with Google, Create a local offline profile and Restore from backup. Wide Windows layouts show a brand/privacy column beside the content; Android stacks the same content and scrolls naturally. Local setup is a dedicated route with a name and theme selection, genuine busy/error feedback and dirty cancellation. Successful creation enters the actual encrypted profile. Returning profiles reopen through the existing runtime without introductory delays.

Google connection and recovery use the same bounded framing. Existing configured OAuth/deep-link, local-versus-connected identity, synchronization review and archive operations are retained. The validation opened the Google entry in the isolated unconfigured test environment and returned; it did not sign into a real Google account. Restore UI was inspected, not represented as a newly certified archive round-trip. Recovery still explains excluded file bytes and retains the existing review/restore logic.

## Navigation and information architecture

Windows has a theme-aware 204-wide sidebar (76 collapsed), five primary destinations, profile/settings access and a top Create menu. The expanded layout begins at 1000 logical pixels when available. Page actions remain close to their subject. There is no Windows bottom floating tray. Quick actions remain keyboard accessible and Escape dismisses their menu.

Android has five destinations in one rounded floating surface with short visible labels and full accessible names. The separate plus preserves the existing bounded action menu. At narrow width below 360 or large text scaling, Navigation opens the complete destination chooser. Keyboard appearance hides the dock. Measured dock padding keeps final scroll content reachable. The extra plus row intentionally requires more reserved bottom space than a fixed flat navigation bar.

Money has Accounts, Activity, Cards, Planning, Reports, Import and Files. Expense/income/transfer buttons are direct in Accounts and Activity; advanced tabs emphasize their own tasks, with global creation still available in the shell. Debts remains a separate primary destination. Shared Expenses keeps group/private authority separate. Life keeps Calendar, Tasks, Learning, Books and Career, subject to the existing user preferences.

## Screens and workflows actually changed

| Area | Implemented scope |
| --- | --- |
| Overview | Compact accepted-history metrics; exact net month spending/income and current debt; category bars; accounts/cards links; activity; Life agenda; shared/Life entry points. Pending/projected values and incomplete coverage remain explicit. |
| Accounts/activity | Neutral account surfaces, compact amounts, visible Add account, existing categories/splits and drafts, common heading/row/notice styling. |
| Cards | Task groups preserve every original command ID; liability, card-credit and available-credit meanings remain distinct; records paginate at 12; source history remains accessible. |
| Debts | Compact heading, debt/payment/provider-evidence task groups, empty state and 12-record pagination. Original schedules, payments, statement evidence and correction remain. |
| Planning | Separated task groups and four views; purposeful budget/savings empty states; original recurrence generation, actual links, reservations and read-only forecast remain. |
| Reports | Compact summary and comparison; account/category filters adapt to width; extra accounting detail is expandable; original aggregate queries and source-linked detail remain. |
| Import/files | Clear entry points, concise visible limitations, optional technical information, meaningful empty/history states and conditional pagination. Existing reviewed import, file-picker, integrity, retention and retry paths remain. |
| Shared Expenses | Compact header, group empty state, wrapping group tabs and bounded reviewed forms. Existing group permissions, invitations, bill links, settlement and private review remain. |
| Life | Shared tabs and compact contextual headings; career stage dropdown and empty state; common list/notice/form styling across calendar, tasks, learning, books and career. Existing event and progression models remain. |
| Profile/connection/recovery | Shared theme/control density, first-use frame, bounded connection panel and optional archive-detail disclosure. Existing utilities and recovery operations remain. |
| Detail/evidence | Structured recorded-field labels and separate ledger effects in native financial detail, preserving original evidence and correction access. |

The production local/connected sessions use the new dashboard. The intentionally synthetic historical gallery is not a second production baseline; some historical/demo-only page compositions remain for reference. Deep evidence, import mapping, sync-conflict and lifecycle dialogs retain specialized controls where their decisions require them. This pass does not claim every rare dialog was manually exercised or replaced with a bespoke layout.

## Forms, review and meaningful cancellation

The shared money editor, native P4 financial editor, durable Life form and reviewed Shared form use a centered form surface bounded to 760 logical pixels. Details / Review / Saved names the existing stages. Desktop no longer stretches a small form across an entire window. Mobile uses the same fields and validation with natural scrolling and keyboard insets.

Dirty forms offer Keep editing or Keep draft & close when durable drafts exist. The close waits for draft persistence and stays open with a recovery message if saving fails. A form without draft support asks before discarding. Explicit Life draft discard also confirms. Busy/uncertain financial results retain original-result recovery and are not treated as harmless unfinished input. No new submission, financial arithmetic or authorization service was introduced.

Review remains before the real save; successful, queued, rejected, uncertain and incomplete outcomes retain their controller meanings. Saved is never a timer-based animation. Field validation remains inline/on review through the existing command validators. Date, currency, timezone, evidence and permission details remain visible when they affect the user's decision.

## Data and state preservation

No persistence schema, journal arithmetic, monetary parser, migration, sync protocol or private/group authorization implementation was edited. Dashboard totals use `BigInt` and accepted postings with economic civil dates. Card credit stays outside cash; borrowing stays outside recognized income. The projected view is separately labelled and includes pending work once. Amount masking suppresses values and the spending breakdown. Incomplete accepted history does not show authoritative-looking metrics.

Action grouping only changes discovery; it retains the existing command identifiers and callbacks. Card/debt pagination changes visible rows, not aggregates. Existing history/due pagination is hidden when there is no next page. Planning history remains available on its own tab. Help sections use dedicated PageStorage keys so a parent scroll offset cannot be mistaken for expansion state.

Local and cached-connected loading/error/waiting/review disclosures remain. Cloud file upload/download is still unavailable, local file contents are unscanned and standard archives contain metadata rather than original bytes. These limitations stay prominent. No hosted reset, provider setting change, user-data deletion, credential commit or P6 work was performed.

## Validation and evidence

All native journeys use isolated synthetic profiles and dedicated secure-storage slots; cleanup targets only those generated test directories/slots. Captures are Flutter-rendered native app surfaces, not browser previews or mockups. Windows uses a 1440 x 900 logical test surface; Android uses 412 x 900 on `emulator-5554` (API 37). These fixed test surfaces do not certify every physical window/keyboard/inset configuration.

### Checks

| Check | Result / scope |
| --- | --- |
| `flutter pub get --enforce-lockfile` | Passed; existing lockfile preserved, no dependency upgrade |
| `dart format --output=none --set-exit-if-changed lib test integration_test` | Passed; 204 files, zero formatting changes |
| `flutter analyze --no-pub` | Passed; no issues |
| Targeted widget suite | 18 passed across final-redesign, P1, P2, P3, P5 and existing financial-widget tests |
| Windows native redesign journey | Passed; real native journey and profile reopen |
| Android emulator native redesign journey | Passed; real native journey and profile reopen |
| Windows release application build | Passed; `flutter build windows --no-pub` |
| Android debug APK application build | Passed; `flutter build apk --debug --no-pub` |
| `git diff --check` | Passed |

The targeted command was `flutter test --no-pub test/final_redesign_widgets_test.dart test/p1_widgets_test.dart test/p2_widgets_test.dart test/p3_widgets_test.dart test/p5_widgets_test.dart test/financial_widgets_test.dart`. This covers real-record composition, pending accepted/projected distinctions and connection review, private/group boundaries and durable offline drafts, both platform layouts/themes, 200% text, keyboard interaction, form reflow, menu access, and failed-draft-save exit protection. It is not the entire repository suite.

`integration_test/final_redesign_test.dart` runs the shared production app on each native target, opens all three first-use paths, tests dirty local-setup cancellation, creates a real encrypted local profile, saves an account with PHP 25,000.00, posts a reviewed PHP 850.25 expense, creates a PHP 50,000 credit limit and saves a Life task. It asserts exact liquid minor units `2414975`, confirms presentation navigation adds no financial revisions, then closes and reopens the profile and checks the same balance and task. The credit limit is never counted as liquid money. No real bank/provider/Google account is contacted.

The native visual matrix contains 35 captures per platform: welcome, connection entry, restore entry, local setup, empty Overview, account form, task form, eleven main/module views plus Career in both themes, light Calendar/Learning/Books and 200% Career. Render exceptions are checked at capture. Fixed-size native captures are review evidence, not exhaustive device coverage.

During iteration, native switching exposed an ExpansionTile/scroll PageStorage key collision; dedicated help keys fixed it and a regression test now covers it. Draft-failure exit behavior is also explicitly tested. Earlier widget failures were old ChoiceChip/hero-label finders or platform-override test cleanup and were corrected without weakening financial assertions. An initial Windows runner build returned a generic MSB8066 error; subsequent native and normal builds passed. A native test cleanup error came from reusing a disposed runtime; the journey now creates a fresh runtime for reopen and passes. Android's toolchain emits the existing Java native-access warning; it did not prevent build or execution.

Build artifacts and raw runner logs remain ignored under `apps/salapiya/build/`; they are not release packages. Screenshots below contain only the isolated synthetic review data.


## Native visual review

All 70 unmodified native captures are retained in `design/review/final/`. Start with Overview, then compare the seven originally reported problem areas.

| Screen | Windows | Android |
| --- | --- | --- |
| Welcome | [View](design/review/final/windows-welcome.png) | [View](design/review/final/android-welcome.png) |
| Local setup | [View](design/review/final/windows-profile-setup.png) | [View](design/review/final/android-profile-setup.png) |
| Google entry | [View](design/review/final/windows-connection.png) | [View](design/review/final/android-connection.png) |
| Restore entry | [View](design/review/final/windows-restore.png) | [View](design/review/final/android-restore.png) |
| Empty Overview | [View](design/review/final/windows-overview-empty.png) | [View](design/review/final/android-overview-empty.png) |
| Account form | [View](design/review/final/windows-account-form.png) | [View](design/review/final/android-account-form.png) |
| Life task form | [View](design/review/final/windows-task-form.png) | [View](design/review/final/android-task-form.png) |
| Calendar | [View](design/review/final/windows-light-calendar.png) | [View](design/review/final/android-light-calendar.png) |
| Learning | [View](design/review/final/windows-light-learning.png) | [View](design/review/final/android-light-learning.png) |
| Books | [View](design/review/final/windows-light-books.png) | [View](design/review/final/android-light-books.png) |
| Career at 200% | [View](design/review/final/windows-large-text-career.png) | [View](design/review/final/android-large-text-career.png) |

| Screen | Windows light | Windows dark | Android light | Android dark |
| --- | --- | --- | --- | --- |
| Overview | [View](design/review/final/windows-light-overview.png) | [View](design/review/final/windows-dark-overview.png) | [View](design/review/final/android-light-overview.png) | [View](design/review/final/android-dark-overview.png) |
| Accounts | [View](design/review/final/windows-light-accounts.png) | [View](design/review/final/windows-dark-accounts.png) | [View](design/review/final/android-light-accounts.png) | [View](design/review/final/android-dark-accounts.png) |
| Activity | [View](design/review/final/windows-light-activity.png) | [View](design/review/final/windows-dark-activity.png) | [View](design/review/final/android-light-activity.png) | [View](design/review/final/android-dark-activity.png) |
| Cards | [View](design/review/final/windows-light-cards.png) | [View](design/review/final/windows-dark-cards.png) | [View](design/review/final/android-light-cards.png) | [View](design/review/final/android-dark-cards.png) |
| Planning | [View](design/review/final/windows-light-planning.png) | [View](design/review/final/windows-dark-planning.png) | [View](design/review/final/android-light-planning.png) | [View](design/review/final/android-dark-planning.png) |
| Reports | [View](design/review/final/windows-light-reports.png) | [View](design/review/final/windows-dark-reports.png) | [View](design/review/final/android-light-reports.png) | [View](design/review/final/android-dark-reports.png) |
| Import | [View](design/review/final/windows-light-import.png) | [View](design/review/final/windows-dark-import.png) | [View](design/review/final/android-light-import.png) | [View](design/review/final/android-dark-import.png) |
| Files | [View](design/review/final/windows-light-files.png) | [View](design/review/final/windows-dark-files.png) | [View](design/review/final/android-light-files.png) | [View](design/review/final/android-dark-files.png) |
| Debts | [View](design/review/final/windows-light-debts.png) | [View](design/review/final/windows-dark-debts.png) | [View](design/review/final/android-light-debts.png) | [View](design/review/final/android-dark-debts.png) |
| Shared Expenses | [View](design/review/final/windows-light-shared.png) | [View](design/review/final/windows-dark-shared.png) | [View](design/review/final/android-light-shared.png) | [View](design/review/final/android-dark-shared.png) |
| Tasks | [View](design/review/final/windows-light-life.png) | [View](design/review/final/windows-dark-life.png) | [View](design/review/final/android-light-life.png) | [View](design/review/final/android-dark-life.png) |
| Career | [View](design/review/final/windows-light-career.png) | [View](design/review/final/windows-dark-career.png) | [View](design/review/final/android-light-career.png) | [View](design/review/final/android-dark-career.png) |

## Remaining review and P6 boundaries

Owner review should focus on Windows dashboard resemblance and information density, Android floating-navigation height/placement, task-group discovery, long-form readability, both themes and whether the terminology is approachable without losing financial distinctions. Inspect populated as well as empty screens; the evidence fixtures deliberately contain only a small set of synthetic records.

No new hosted Google sign-in/refresh, cross-device PowerSync CDC, private/group authorization attack matrix, physical Android device, screen-reader audit, large-data stress/performance run, exhaustive archive/import/file recovery or full release regression was performed in this presentation pass. Existing P0-P5 evidence is retained, not recertified. Standard platform/toolchain warnings do not constitute release acceptance. Human visual approval remains outstanding.

P6 should use this handoff and the updated design-system/platform rules as its presentation baseline, keep all functional contracts above, and conduct comprehensive release testing under a separately authorized assignment. Do not automatically start P6 or merge this branch into main.
