# Debt payment scheduling and urgency

> **Historical record:** preserved development evidence. Current summary: [Development history](../../DEVELOPMENT_HISTORY.md).

Completed October 29, 2026 (Asia/Manila). Scope: the existing Debts feature of
the Salapiya Flutter app only. This is the single handoff file for the task; it
follows the existing `docs/salapiya/*_HANDOFF.md` convention, so no separate
`docs/handoff/` file was created.

Sections 1 and 2 (feature overview and implementation details) are in [Domain rules](../../DOMAIN_RULES.md#1-feature-overview).

## 3. UI/UX Changes

Screens changed (Windows and Android share one code path):
- **Debts list** (`debt_screen.dart`): each debt is a panel with a status badge
  (icon, text and outline, so it does not depend on color), the next due date as
  the headline ("Next due 2026-11-05 · in 3 days" / "5 days overdue"), the
  amount to prepare, outstanding balance, and, when known, frequency, installment
  amount and final scheduled installment. Unscheduled debts say "Schedule not
  set" and offer "Set schedule". Details opens the debt detail.
- **Order:** overdue (most overdue first), due today, due soon and upcoming by
  nearest date, unscheduled, then settled or closed. Tabs: All, Overdue,
  Upcoming (includes due today), Unscheduled.
- **Debt detail** (new `NativeDebtDetail`): next installment, frequency, amounts,
  status, "Edit schedule" or "Set schedule", "Update amounts", "Record
  payment", balances and every installment row.
- **Reminder for varying amounts:** for a "different amount each time" debt, the
  next payment shows a prompt with an Update amounts button when it is overdue,
  due today or due soon.
- **Schedule form** (shared editor `finance_screen.dart`): plain questions asked
  in order (see section 2). "Add existing debt" and "Record borrowing" have the
  same questions as an optional section, default "Not now". A calendar button
  fills the next due date. Review shows a one-line summary of the schedule.
- **Errors:** a problem found on Save or Review opens a popup ("Please check the
  form") with a plain message; the offending input is then marked red with the
  message under it, scrolled into view, and cleared when edited. This applies to
  every form that uses the shared editor, not only debts. Storage and
  uncertain-outcome problems keep the banner.
- Not changed: the Overview, the non-production demo debt screens, every other
  Money screen.

## 4. Data Model and Compatibility

- **Local database:** no schema migration and no stored-data change. The new
  facts are extra keys in the existing free-form values of a `debtSchedule`
  revision: `frequency`, `firstDue`, `intervalDays` (Custom only), `splitMode`
  (`equal`, `divide` or `varied`) and `installmentAmount`. Profile isolation,
  offline-first commits, backup and export carry the values as before.
- **Hosted (Supabase):** new migration
  `20261029004400_debt_schedule_cadence.sql` wraps the existing plan function
  and applies the same cadence checks to schedule records, including
  corrections. It changes no table and no data. It is not applied to any hosted
  project.
- **Unscheduled and legacy debts:** valid and unchanged; they show "Schedule not
  set" (or their old explicit dates, with no frequency shown) until the user
  sets or edits a schedule. Existing payments, balances and history are not
  rewritten.
- **History:** every schedule edit creates a new revision; earlier revisions and
  payment allocations are retained.
- **Auto-filled fields:** for a new schedule made with the simple form, the
  reference is set to "Entered by me", the provider confirmation is recorded as
  true (the Review step is the confirmation) and the description is
  "<debt> payment schedule".
- **Required user actions:** apply the migration to the hosted project at
  release. Nothing is required for local data. By code reading (not tested), the
  Overview's existing debt-due list reads schedule rows, so new schedules will
  appear there without changes.

## 5. Files Changed

Intended changes:
- `docs/salapiya/DEBT_SCHEDULE_URGENCY_HANDOFF.md`: this report.
- `apps/salapiya/lib/finance/debt_rules.dart`: recurrence, status, urgency order,
  split and cadence validation, due summary.
- `apps/salapiya/lib/finance/debt_screen.dart`: debt list, badges, filters,
  debt detail, Update amounts page.
- `apps/salapiya/lib/finance/finance_screen.dart`: plain schedule questions,
  schedule with the debt, popup errors and field highlighting in the shared
  editor.
- `apps/salapiya/lib/finance/finance_rules.dart`: field-aware, plain error
  messages for text, amount and reference inputs.
- `apps/salapiya/lib/local/finance_domain.dart`: optional `field` on
  `LocalRuleException` and `reject`.
- `apps/salapiya/test/debt_schedule_test.dart`: new logic, validation and
  persistence tests.
- `apps/salapiya/test/debt_screen_test.dart`: new widget tests for list, detail
  and forms.
- `apps/salapiya/integration_test/p4_debts_test.dart`: device test updated to the
  new schedule form (not executed).
- `services/salapiya/p0/supabase/migrations/20261029004400_debt_schedule_cadence.sql`:
  server-side cadence checks.
- `services/salapiya/p0/debt-schedule-cadence.test.mjs`: server check test.

Present in the working tree but not intended work:
- `CLAUDE.md`: already modified before this task started (git status at session
  start); not touched by this work.
- `apps/salapiya/windows/flutter/generated_plugin_registrant.cc`,
  `generated_plugin_registrant.h`, `generated_plugins.cmake`: line-ending-only
  rewrites by `flutter pub get`, which every `flutter` command runs. Discard
  with `git checkout -- apps/salapiya/windows/flutter/`.

## 6. Focused Test Results

The repo already has widget-test infrastructure (`flutter_test`), so UI tests
were added with the existing conventions and no new dependency. Commands, run
from `apps/salapiya` unless noted; the final runs were after the last code
change.

| Command | Result |
| --- | --- |
| `flutter test test/debt_screen_test.dart` | **passed**, 11 tests |
| `flutter test test/debt_schedule_test.dart test/p4_debt_components_test.dart test/p4_finance_test.dart test/p4_initial_download_test.dart test/post_p6_presentation_test.dart test/p1_finance_test.dart test/p4_planning_test.dart` | **passed**, 49 tests |
| `flutter analyze lib/finance lib/local test/debt_screen_test.dart test/debt_schedule_test.dart` | **passed**, no issues |
| `flutter analyze integration_test/p4_debts_test.dart lib/finance` | **passed**, no issues |
| `dart format --output=none --set-exit-if-changed` on the changed Dart files | **passed**, exit 0 |
| `node --test debt-schedule-cadence.test.mjs p4-debt-server.test.mjs` (in `services/salapiya/p0`) | **passed**, 3 tests |
| `integration_test/p4_debts_test.dart` | **not-run** (needs a device or emulator; edited only) |

What the new UI tests cover (`debt_screen_test.dart`):
- list ordering (overdue, due today, due soon, upcoming, unscheduled) and the
  filter tabs;
- status text and "Schedule not set" with no invented date;
- the Custom interval field appearing only for Custom, and the payment-split
  choice disabled until a payment count is entered;
- form validation: popup text, red field, kept values, mark cleared on edit
  (missing debt amount, missing date, invalid interval, payments not adding up
  to the debt, missing payment amount);
- dividing the debt, including after partial payments; different amounts each
  time; schedule saved together with the debt and a debt saved without one;
- debt detail (next versus final installment, Set/Edit schedule);
- the varying-amount reminder and Update amounts (including the must-add-up
  rule and unchanged balance).

`debt_schedule_test.dart` (13 tests) covers weekly, monthly, yearly, custom,
month-end, leap years, no drift, invalid intervals, status boundaries, the
payment rules (settle, partial, extra, multiple overdue, schedule edit keeps
history and balances), persistence, legacy and unscheduled debts, and the split
rules.

During development some tests failed because of mistakes in the tests
themselves (comparing records that hold maps, a repeated text match, an
animation not finished); each was fixed in the test and rerun. No product
failure remained at the end.

**Intentionally not run:** the full unit, integration and end-to-end suites, a
full build, and full regression testing, as the project rules require. Related
finance-rule files were run only because shared rule messages changed.

## 7. Known Limitations and Follow-up

- Apply the migration to the hosted project and test it there.
- Run the device integration test and check layout on Windows and Android,
  including large text sizes. No manual or device run of the app was done.
- Due soon is a fixed 7 days. Making it a user setting needs a separate decision.
- No "amount to be decided later" payments, and no way to schedule a total larger
  than the debt (interest). Both need a decision on how schedules are stored.
- The dates list of an existing schedule is still edited as text for irregular
  provider dates; totals are not checked there, only in new schedules and
  Update amounts.
- Update amounts is blocked if payments were recorded without being assigned to
  installments and the unpaid installments no longer match what is owed; the
  amounts then have to be adjusted to match the balance.
- Dates are typed as `YYYY-MM-DD` or picked from a calendar button on the next
  due date only; no other production form has a date picker.
- Notifications and sync for these schedules were not part of this task.

## 8. Git Delivery

- Remote: `origin` (`https://github.com/RAbnza/Personal-Management-Platform.git`)
- Branch: `main`
- Feature commit: `48847cf050ce985d3e3f1535f41c33e891d65bc1`, message `feat(salapiya): add debt payment scheduling`. It contains the 12 files listed in section 5 as intended changes plus `CLAUDE.md`, whose inclusion was approved. The three `windows/flutter/generated_plugin*` files were not committed.
- Push result: succeeded as a normal push (`d1e6667..48847cf  main -> main`), no force, no history rewriting. Verified afterwards: local `HEAD`, `origin/main` and `git ls-remote origin refs/heads/main` all returned `48847cf050ce985d3e3f1535f41c33e891d65bc1`.
- This section was added in a follow-up commit (documentation only) and pushed normally; its hash is the branch tip on `origin/main` after the feature commit.
- Blockers: none.

## 9. Final Assessment

All requested behavior is implemented and tested at the focused level, with no
failing focused test. Items to flag:
- The first brief made the scheduled amount optional. By a later decision,
  new schedules now require every payment amount and the exact debt total, so
  that requirement was intentionally replaced.
- A loan maturity date does not exist in the app; the final scheduled
  installment is shown instead, as a separate labeled value.
- Not verified: the device integration test, the hosted migration in a real
  Supabase project, and the app on a real Windows or Android target.
