# Adaptive navigation and interaction proposal

**Current implementation:** [D2 reimagined](D2_REIMAGINED.md) replaces the earlier framing below. Windows uses an ink sidebar and compact command footer. Android uses a single dock with integrated quick actions and a wallet-first Overview with expandable spending detail. All five destinations remain reachable.

**Status:** D1R-R02 selects Android B floating navigation and R03 selects its
modal + action menu. Windows retains collapsible rail/sidebar plus separate
contextual dock. D2 implements these in the running native shell; final geometry
and composition await owner live review. See [D2 evidence](D2_IMPLEMENTATION.md).
Layout uses available logical width, usable height, text scale and input mode.
A small platform adapter selects Windows rail/dock or Android capsule, while
constraints govern each platform's accessible fallback. See
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
Collapsed state retains current selection and a labeled expand control. Shared frames have no decorative top stroke or automatic corner ornament. Rail resizing never animates
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

### Android B — selected floating navigation

D0 required comparing A (anchored) and B (floating). The owner selected B after
hands-on D1 review (D1R-R02). A remains a collapsed historical gallery specimen,
not a competing production path. D2 must validate B in the actual shell.

Five labeled destinations remain Overview, Money, Debts, Shared Expenses and
Life. A separate compact 56×56 + sits above the capsule's trailing edge, with a
12-unit gap; its accessible name is “Quick actions” and collapsed state is exposed.
It is not a sixth destination. The capsule and Windows rail share softly rounded
lattice framing and an outlined selected pane. Windows still uses its own dock.

`FloatingActionMenu` accepts labeled icons and callbacks from the caller. D1R
supplies six synthetic actions: expense, income, transfer, debt payment, shared
expense and task. Selection closes the modal before invoking one callback and
shows “specimen only — no record created.” No real feature route or mutation.

Opening pushes one SDK modal route with a dimmed whole-viewport scrim, opaque
raised vertical list above the trigger, and an expanded close control in the
trigger's place. Only list and close are interactive; obscured controls are
excluded from traversal and accessibility. Initial keyboard focus is Close;
Tab cycles through the six actions and Close. Full labels wrap at system scale;
targets are at least 48×48. Press feedback and visible focus use semantic colors.

Dismiss through outside tap, close trigger, Android Back, Escape or selection.
The route traps focus, protects against duplicate selection, and keeps the opener
locked until reverse motion and barrier removal finish. Then focus returns to
the trigger if it is still mounted. Outside taps are consumed without activating
a destination. There is no dirty state in this presentation-only choice menu.

Motion is a 160ms scrim/content fade with an ease-out upward displacement of at
most four logical pixels; closing reverses it. System or gallery reduced motion
uses zero-duration transitions and no translation. There is no idle controller,
blur, stagger requirement or decorative background animation.

### Constrained layout and shell integration contract

The component measures action labels at actual text scale and bounds the menu to
the usable viewport. With enough room above the measured trigger it anchors there.
If space is insufficient, the anchor is out of bounds after resize, or a docked
keyboard reports an inset, it uses a bottom-aligned bounded action sheet with a
scrollable list and a separate always-reachable close control. Safe padding and
keyboard bottom insets are reserved. The same route, action semantics and callbacks
apply; there is no second business implementation. An arbitrary floating keyboard
that reports no inset remains an OS limitation requiring D2 manual verification.

The gallery retains D1's fully labeled vertical navigation fallback at narrow
specimen widths or enlarged text. This keeps every destination accessible in its
scrolling study; it does not approve a tall vertical capsule for the final shell.
D2 must validate an economical visible-label arrangement (such as stable 3+2 rows)
and landscape adaptation against real content, safe insets and system navigation.
Do not squeeze labels or hide Life/Shared Expenses merely to preserve geometry.

The shell must reserve measured capsule/trigger height and clearance, keep the
trigger reachable without gallery scrolling, and hide global creation/navigation
during focused financial tasks. Task forms own keyboard-safe Review/Back controls.
Do not overlay quick creation on an active draft. Validate gesture/three-button
navigation, rotation, IME and large text during D2, preserving all capabilities.

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

## Implemented D2 adaptation (October 23, 2026)

- Windows starts with a 240-unit sidebar at >=1200 width; a user collapse uses
  the 80-unit rail. At 600-1199, Expand opens a labeled modal destination list.
  Below 600, below 400 height, or above 150% text, the header Navigation utility
  supplies the same five choices. Selection and per-tab scroll remain in memory.
- Android uses the selected B capsule: five labeled cells where they fit, 3+2
  at narrower widths. At >=150% text or below 500 height, an economical labeled
  Navigation control opens all five full labels in a scrollable modal. This
  fallback is proposed for owner review, not a reopened A/B decision.
- The + remains separate from primary destinations. The existing D1R modal
  owns scrim, focus, duplicate prevention and sheet fallback. Windows displays
  three contextual commands plus + at roomy widths, or Create/+ when constrained.
- Navigation/dock use normal-flow measured footer space and safe insets, leaving
  12-24 units of content clearance. They look like floating surfaces but cannot
  overlap the final scroll item. This is more robust than guessed fixed padding.
- Task routes cover the shell. Their scrollable content resizes above a reported
  keyboard inset. No global creation control can overlap a focused draft.
- Primary tabs never push routes. SDK detail routes carry source breadcrumbs and
  return to the invoking screen and scroll. A group preview can push its settlement
  example; a Life agenda can push Career/Tasks. Global Escape/Alt+Left acts on the
  top route. Dirty demo notes require Keep editing/Discard; receipt and financial
  records are never mutated. Other proposed shortcuts remain unimplemented.
- The profile utility owns scenario, theme, text-size, privacy, effects and motion
  controls; First-run preview and Design Gallery are utilities, never destinations.
