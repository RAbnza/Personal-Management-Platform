# Adaptive navigation and interaction proposal

**Status:** D0 proposal. The five destinations, platform parity and first-run
choices are approved requirements; dimensions and Android selection remain open.
Layout uses available logical width, usable height, text scale and input mode,
not a hardcoded “phone versus PC” test. See
[Flutter adaptive guidance](https://docs.flutter.dev/ui/adaptive-responsive/best-practices);
Salapiya's required financial parity takes precedence over generic advice that
allows removing features on smaller devices.

## Information architecture

| Primary destination | Local organization                                                                             | Contextual creation                                         |
| ------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Overview            | Money today; needs attention; upcoming obligations; Life agenda                                | Add expense; other quick actions                            |
| Money               | Activity, Accounts, Cards; Planning → Recurring, Budgets, Goals, Forecast; Reports and Imports | Expense, income, transfer; contextual card/planning actions |
| Debts               | Debts list/detail; schedule; payments; evidence and history                                    | Record payment, add existing debt, record borrowing         |
| Shared Expenses     | Groups → group summary, bills, people, settlements, activity/private review                    | Add shared expense; report payment                          |
| Life                | Agenda/Calendar, Tasks, Learning, Books, Career                                                | Task, event or context-specific entry                       |

Profile, sync/backup, Settings and Help are utilities. Activity is a dedicated
Money location; Overview can link to it without becoming a transaction feed.
Reports remain inside Money; source links may cross destinations. Debts is one
domain with a prominent entry, not a second implementation of debt balances.
Cards stay under Money, while Overview/Debts may link to related commitments.
Use full “Shared Expenses” labels, allowing two lines.

### Windows shell

Proposed starting dimensions:

| Available width                       | Primary frame                                                                 | Workspace                                                                                   |
| ------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| ≥1200                                 | 240-wide expanded sidebar by default; user may collapse to 80                 | List/detail only if list ≥520 and detail ≥360 after margins/gaps; otherwise one active view |
| 840–1199                              | 80-wide collapsed rail; expand as overlay without squeezing forms             | One useful main view; contextual panel only if sufficient remaining width                   |
| 600–839                               | Collapsed rail; labels through accessible names/tooltips and expansion        | Single view; complex entry becomes a full workspace route                                   |
| <600 or severe text/height constraint | Labeled Navigation button opens a modal list containing all five destinations | Same capabilities; full task routes, no clipped rail or minimum-window-size workaround      |

These are proof breakpoints, not screen-size restrictions. High text scaling can
switch composition earlier. Preserve selection, scroll, focused record and draft
while resizing; close obsolete overlay geometry without losing content.

Keep native window controls/title-bar behavior. Expanded sidebar contains the
brand identity, five labeled destinations, and separated utilities at the foot.
Collapsed state retains current selection and a labeled expand control. A small
craft seam sits outside the destination hit regions. Rail resizing never animates
amount text or displaces a focused input during typing.

Proposed shortcuts, shown in tooltips and Help:
`Ctrl+1`…`Ctrl+5` select destinations; `Ctrl+K` opens the command/search surface;
`Ctrl+N` opens the context creation menu; `Alt+Left` goes back; `Esc` dismisses the
top transient layer. These are review candidates: check OS/assistive-tool
conflicts and do not intercept text-editing shortcuts. No unmodified global
single-letter shortcuts. No shortcut bypasses a consequential review step.

### Windows floating quick-action dock

The dock is a **tool tray**, never a second primary destination menu.

| Context                   | Leading action                                | Other offered actions                         |
| ------------------------- | --------------------------------------------- | --------------------------------------------- |
| Overview / Money Activity | Add expense                                   | Record income, transfer, more creations       |
| Debt list/detail          | Record payment (choose debt if none selected) | Add existing debt, record borrowing           |
| Group detail              | Add shared expense                            | Report payment; show active group explicitly  |
| Life                      | Add task or context entry                     | Add event, application or book where relevant |

At most three directly labeled actions plus “More actions.” Keep global Add
expense reachable from the command menu in every ordinary workspace. A context
change never silently changes the scope of an already-open draft. If an action
needs an account/group, ask within the form; do not assume a funding source.

Center the dock inside the **main workspace**, excluding the sidebar and an open
nonmodal inspector. Use 48-high targets, 8 padding, 8 gaps, at least 16 from the
usable bottom edge. Reserve bottom content space equal to measured dock height

- bottom inset + 16 clearance; scroll-to-focus uses the same reservation.
  No fixed padding assumption when text wraps. Menus open upward if room permits,
  otherwise as a bounded accessible popover.

When fewer than 640 logical pixels remain for the workspace or usable height is
under 600, try a single labeled “Add” launcher with the same actions. At very
short height, put actions in a normal-flow toolbar. Show the same commands; do
not let a floating control cover the last table row or form footer.

During a focused financial task, the task's own Review/Edit/Simulate action area
replaces the creation dock. A modal suppresses background actions. A nonmodal
entry panel receives one scoped creation flow; opening another action prompts
about the existing draft rather than creating stacked financial forms.

### Android alternatives — both for D2 proof

Five destinations plus an add control cannot be six cramped slots in one row.
Both concepts retain five visible destination labels and put actions in a
separate area. Do not hide Life or Shared Expenses in “More.”

| Criterion         | Concept A: anchored bar + central Add                                                                                                                                                   | Concept B: floating navigation + context shelf                                                                                                                                            |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Structure         | Full-width bottom navigation with five equal destinations. A central 56-high “Add” button sits in a separate reserved row directly above it. No central notch displacing a destination. | Inset opaque rounded navigation capsule with five destinations. A labeled context-action tab sits above its trailing edge; expanding it opens a bounded action shelf above the capsule.   |
| Creation behavior | Add opens a modal sheet of labeled actions, led by Add expense; five destinations remain visible behind the scrim but inactive.                                                         | “Add expense”/“Actions” opens a nonmodal shelf when it fits; on a compact/large-text screen use a modal sheet. Selection opens a focused route. No radial fan or long-press prerequisite. |
| Visual identity   | Familiar stable base; woven seam, selected marker, palette and type carry Salapiya character.                                                                                           | More distinctive suspended surface and layered craft edge; stronger resemblance to the Windows tool tray without sharing its primary-navigation role.                                     |
| Discoverability   | Consistent labels and Add location; central action is easy to locate.                                                                                                                   | Five stable labels; context tab must not look like a sixth destination or disappear on scroll.                                                                                            |
| Accessibility     | Lower focus complexity; sheet semantics and safe focus restoration                                                                                                                      | More demanding traversal/dismissal and selected-state testing; shelf actions follow trigger in focus order, destination order remains stable                                              |
| Space             | Bar about 80 high plus about 64 action row before safe inset; conservative but predictable                                                                                              | Capsule about 80 high plus 12 bottom gap and 56 action tab; expanded shelf costs additional space. Floating is not inherently more compact.                                               |
| Performance       | Standard navigation/modal widgets, minimal decoration                                                                                                                                   | Extra elevation/layout and overlay work; no blur/magnification, so measurable cost should remain bounded                                                                                  |
| Implementation    | Lower complexity; safest comparison baseline                                                                                                                                            | Medium complexity; bespoke composition, overflow and menu anchoring require proof                                                                                                         |
| Risk              | Add row takes room; can feel familiar without disciplined branding                                                                                                                      | More visual clutter, occlusion and accidental actions if shelf placement is wrong                                                                                                         |

**Recommendation for comparison:** A is the usability baseline. B is the
expressive challenger and may win if owner preference and task evidence support
it. Neither is selected by this document.

At width 360, A has 72-unit destination cells. B with 12-unit outer margins has
67.2-unit cells before internal padding; “Shared Expenses” wraps. Never reduce
targets below 48 or shrink labels to make B fit. At 320/large text, allow a
two-row visible navigation arrangement (three items, then two) in stable reading
order, with the action row separate. If that layout costs too much usable height,
document the trade-off and revise the concept; do not substitute a hidden
destination. Landscape/large-window Android may use a rail after D2 proof.

Both concepts reserve their measured total height plus system safe inset and
focus clearance. Neither floats above the keyboard in a financial form. Focused
task routes hide global bottom navigation and expose Back plus a keyboard-safe
review action. Entry fields scroll above the IME. Tests must include gesture and
three-button navigation, portrait/landscape, large fonts and split-window sizes.

### Back, focus and state

Maintain each destination's in-session subroute, filters and scroll position.
Switching destinations is not a growing Back stack of tab taps. From a nested
detail, Back returns to its list/previous source with restored focus. From a tab
root, Back follows system app-exit/background behavior; do not trap users in an
Overview-first loop.

Dismiss in order: keyboard where system behavior calls for it, active menu/shelf,
modal sheet/dialog, then route. Dirty routes show “Keep editing” and “Discard
demo draft” before losing meaningful input. `Esc` on Windows follows the same
top-layer principle. Cancelling review returns to the intact draft. Explicit
Back labels supplement gestures.

Use current [PopScope](https://api.flutter.dev/flutter/widgets/PopScope-class.html)
and router-supported Back handling, with ahead-of-time pop eligibility;
validate predictive Back on the installed SDK/emulator. D0 does not prescribe
an obsolete interception API or claim predictive animations passed.

## Overview composition

The dashboard answers “What needs my attention, and what money information can I
trust?” Layout is a hierarchy of related regions:

1. **Header:** greeting/display name if available, current date, concise profile/
   sync status and privacy control. No full personal identity exposed on group
   screens. Quick entry is available without scrolling through an introduction.
2. **Money today:** liquid account total with definition, as-of and account
   drilldown. Cards/credit limits are a separate liability context. Pending
   effects appear as a separately labeled projection, not a silently inflated
   accepted balance.
3. **Needs attention:** unresolved sync/private-effect reviews, due obligations
   and shared receipt confirmations, sorted by actionable urgency and date.
   Business confirmation is not conflated with sync failure.
4. **Upcoming:** chronological debt, card and bill commitments plus personal
   tasks/events. Each item identifies its source and opens that source.
5. **Life glance:** next task/event and bounded progress, with access to full
   Life detail. Do not make Life invisible simply because finance dominates.

At wide sizes, money and attention share the top baseline, with upcoming and
Life regions below. Android presents the same priority order vertically with
disclosure and “View all.” Avoid a row of unrelated metric tiles. Reordering or
hiding optional sections is a future preference; it must not suppress unresolved
financial warnings or erase data/reminders. No recent-transactions destination.

Initial incomplete download shows “Money summary not ready — history is still
downloading,” with source-specific progress and unrelated Life access if ready.
A complete local-only profile shows locally derived amounts without suggesting
it is broken because it is offline. Connected cached views show last successful
sync and pending/review counts. Empty, unavailable and zero remain distinct.

## First run and profile journeys

All prototype screens carry “Demo — synthetic data, resets when closed.”
Use the protected mark and accessible name/tagline. Entry choices appear
immediately; an optional three-step interactive tour can be skipped or replayed
from Help. No decorative launch delay.

| Entry / state                     | Proposed steps and meaning                                                                                                                                                                                             |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create a local offline profile    | Name and optional theme → enter demo Overview → optional account setup. No Google, email, connectivity check or financial setup gate.                                                                                  |
| Continue with Google              | Explanation that identity enables Salapiya sync → **simulated account choice**, never actual credentials → existing-profile download or new connected-profile setup. Do not create an empty local profile first.       |
| Restore from backup               | Select a synthetic manifest → inspect profile/date/schema/counts/attachment coverage → simulated validation/recovery-secret step → review → simulate restore. Do not open personal files or ask for a real passphrase. |
| Connect an existing local profile | Explain private-data upload and service access → simulated identity → enrollment progress/checkpoint → completion only when publication is represented complete                                                        |
| Local/cloud collision             | Show separate populated local and existing cloud profiles → preserve/export-local option → explicitly reviewed switch; Cancel retains local state. No Merge button.                                                    |
| Returning profile                 | Open local demo data directly; expired sign-in pauses simulated sync, never hides private records                                                                                                                      |
| Settings / Sync                   | Local-only, connected, paused, waiting, initial download, needs review and reconnect; pending count and last successful sync                                                                                           |
| Backup / devices / lifecycle      | Distinct backup, sync pause, sign-out/device removal, local deletion and cloud deletion flows; disclose unsynced work and recovery limitations                                                                         |

Recovery preview identifies omitted attachment bytes and wrong-key/corrupt/newer
schema cases. Cloud sync is not backup. Old snapshots cannot reauthorize group
membership. These meanings are required even in simulation; actual OAuth,
file access, encryption and recovery belong to engineering milestones.

## Adaptive financial tasks

| Task complexity                                | Windows                                                                           | Android                                                                   |
| ---------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Brief contextual choice/filter                 | Popover or small dialog                                                           | Bottom sheet, dismissible                                                 |
| Ordinary expense/income                        | 480–560 side panel if context remains useful; otherwise full task route           | Full-screen form with essential fields first and advanced disclosure      |
| Debt/card allocation, shared multi-payer entry | Full workspace or guided wide panel; source evidence alongside                    | Full-screen guided stages; source evidence on demand                      |
| Consequential correction/recovery/closure      | Review region with exact effects, safe initial action; dialog only if truly short | Full-screen review; bottom sheet must not compress important consequences |

Entry → validation → review → simulated submission → explicit simulated outcome.
Keep title, amount/currency, date, source/account, scope and relevant effects in
review. Advanced fields reveal allocations, notes, files and provider evidence
without hiding their existence. Do not infer principal/interest, reconcile
statements automatically, or treat a group owner's role as private-ledger access.

An invalid field retains input, receives an associated message and is reachable
from the error summary. An unknown outcome keeps the submitted summary and a
check/retry path tied to the same simulated command. A stale version presents
before/current/proposed values for review without silently merging money.
Prototype “Simulate save” results say “Demo entry recorded in this session.”
“Saved on this device,” “Synced” and “Confirmed by recipient” may appear only
inside visibly labeled scenario previews; they are not claims of real effects.
