# UI/UX Redesign Milestones

**Prepared:** October 16, 2026, Asia/Manila  
**Baseline:** `main`, `239c360c0b4a094ae8244d0b42f55a7dcfc6b530`  
**Owner approval:** October 17, 2026, Asia/Manila — six-milestone roadmap approved.\
**Status:** M1 implemented and technically checked; final owner visual sign-off pending. M2–M6 have not started.\
**Authority:** [Comprehensive plan](COMPREHENSIVE_UI_UX_REDESIGN_PLAN.md) · [Decision register](UI_UX_REDESIGN_DECISIONS_REQUIRED.md)

## 1. Scope and sequencing

Six substantial milestones implement the **CURRENT V3 REDESIGN** and its **FUTURE-READY FOUNDATION**. They preserve all V1–V3 behavior. They do not implement local profiles, offline persistence/queues, cloud synchronization, native Windows/Android applications, database changes, replacement authentication or production deployment.

Sequence: **M1 → M2 → M3 → M4 → M5 → M6**. This is a suggested serial sequence for a solo developer, not an instruction to delegate or run parallel agents. Each milestone can be assigned as one future session or continued across sessions without changing scope. D01/D03/D04 and the working identity **Personal workspace** are approved. Direction approval does not automatically assign implementation; start only the individually assigned milestone. No further product or architecture decision blocks M1.

| Milestone | Outcome                                                        | Principal ownership                                                              |
| --------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| M1        | Validated design foundations and reusable interaction patterns | Tokens, primitives, layout recipes, form/list/review/state contracts             |
| M2        | Complete application frame and entry/discovery experience      | Navigation, Home composition, auth/setup, general Settings/Security, Help        |
| M3        | Complete Money workspaces and entry/review flows               | Accounts/activity, debts/cards, recurring/budgets/goals                          |
| M4        | Complete Career, Calendar and Trackers workspaces              | Daily tracking, source deadlines, templates and migration                        |
| M5        | Complete reports, collaboration and data-control workflows     | Forecasts/reports, shared expenses, notifications/files/import/restore/lifecycle |
| M6        | Redesign-wide polish and targeted preservation acceptance          | Responsive/accessibility/performance/visual and complete workflow validation     |

Each milestone uses owner-approved change-impact verification: changed UI, affected shared contracts/workflows and materially affected existing behavior, with relevant responsive/theme/keyboard/accessibility and financial/privacy/authorization/lifecycle checks. M6 is final redesign-wide acceptance, not an automatic complete V1–V3 campaign; essential checks are not postponed to M6. Broaden only for changed shared contracts, discovered failures or significant security/financial integrity risks. Preserve all assertions and unchanged CI. Record executed tests, results, coverage, exclusions and rationale; historical evidence supports unchanged behavior, not new interfaces. Final branding and F01–F07 are **not dependencies**; platform decisions wait until after redesign and before native implementation.

## 2. M1 — Design foundations and shared interaction patterns

**Implementation checkpoint — October 17, 2026 (Asia/Manila):** M1 foundations, shared patterns and development-only synthetic proofs are implemented and technically checked. **Owner visual sign-off remains pending.** [Implementation handoff](REDESIGN_M1_HANDOFF.md) · [Component contracts](REDESIGN_M1_COMPONENT_GUIDE.md) · [Rendered evidence](verification/assets/redesign-m1/README.md). Resolve owner feedback before individually assigning M2.

**Latest owner decision and final M1 refinement:** **Porcelain**, **Midnight Spectrum**, **Magic UI Dock (Concept A)**, the existing mobile dock and activity/expense review/migration/interaction patterns are approved. Both desktop and mobile use bottom-centered floating navigation; desktop must be slimmer with horizontal icon/label items, restrained magnification and safe-area/content/focus clearance. Preserve mobile. Only the desktop correction awaits manual browser review, with minimal relevant static/component checks and no new screenshots, gallery changes or broad regression campaign. M1 supplies synthetic foundations only; M2/M3 have not started. See [D06](UI_UX_REDESIGN_DECISIONS_REQUIRED.md#d06--m1-owner-review-round-3) and [handoff](REDESIGN_M1_HANDOFF.md#final-desktop-dock-refinement).

**Objective:** establish a tested, recognizable visual and interaction system before broad page conversion.

**Scope and affected areas:** `src/styles/tokens.css`, existing global styles, `src/components/ui`, layout compositions, theme behavior, shared list/filter/review/state adapters and representative proof compositions. No domain calculation/service rewrite. Follow Plan Sections 5, 6, 9, 11 and 12.

**Specific tasks:**

1. Verify repository changes since the inspected baseline and record current route, package and regression inventory. Capture representative existing screens/timings in the established local synthetic environment.
2. Map the approved palette, typography, geometry, focus and motion tokens to the existing theme aliases. Preserve System/Light/Dark and workspace preference/version behavior.
3. Expand the existing Radix family with only the needed shadcn-backed primitives. Implement component states, semantic labels, focus restoration, popover help and safe confirmation behavior.
4. Establish WorkArea/ScreenHeader/DetailLayout, RecordTable/CompactRecordList, FilterBar/PageControls, Metric/CoverageNotice and ReviewSummary/CommandStatus compositions. Keep domain values and commands outside generic presentation logic.
5. Define typed adapters for current cursor/offset list sources. Introduce TanStack Table only for actual table consumers. Introduce TanStack Query only where it replaces an interactive fetch lifecycle, with identity scoping and existing command retry semantics.
6. Produce representative light/dark proofs: Home, dense financial activity/detail, expense review, and tracker migration at desktop and mobile sizes. Use synthetic data in the existing development/test environment; do not ship a public demo route containing private records.
7. Document tested token pairs, all states and baseline client cost. Review the proofs before applying the design across the application.

**Required components/libraries:** retain Tailwind/CVA/clsx/tailwind-merge, RHF/Zod, Lucide, themes and existing tests; expand Radix-backed components; staged TanStack Table/Query adoption. Sonner only if a shared transient-feedback need is demonstrated. No motion/calendar/grid package by default.

**Dependencies:** D01 approval **satisfied October 17, 2026**; explicit M1 assignment and current stack/docs remain required. Final name/logo, F01–F07 and real external services are not required.

**Functionality preservation:** existing primitive public behavior, form field semantics, no private persisted cache, identity/theme cleanup, exact money strings and authoritative validation. No new generic command abstraction may change existing business payloads.

**Testing/verification:** affected Button/Panel/form/theme/shell component tests; dialog keyboard/focus tests; rendered contrast/reflow and reduced-motion checks; static checks. Test interactive-query account switching and retries if adopted. Record bundle/render baseline; do not benchmark the whole database for token changes.

**Acceptance criteria:** both themes and every primitive state work; proofs reflow at 320px and desktop; focus/keyboard targets are clear; no new private-state persistence; representative rendered layouts undergo usability/accessibility review and owner feedback is incorporated before mass conversion; source contracts remain unchanged.

**Expected deliverables:** token/component changes, representative reviewed proofs/screenshots, updated component guidance and focused test evidence. These artifacts are created only during the future authorized milestone, not by the planning assignment.

## 3. M2 — Application frame, navigation and first-use experience

**Objective:** make every current module discoverable and give the application a coherent, native-oriented work area.

**Scope/inventory ownership:** AU1–AU2, HO1, ON1, ST1–ST2, HP1 and shared SY1 states. Shell/navigation and current Home composition; no offline/native access behavior. Follow Plan Sections 3, 6, 7.1–7.2 and 10.

**Specific tasks:**

1. Replace the permanent global sidebar with the approved **Magic UI Dock (Concept A)**: bottom-centered floating navigation on desktop and mobile, with slim horizontal desktop items and the approved mobile presentation. Include integrated module switching, compact utility frame, local navigation and complete module directory. M2 owns real application-wide implementation and capability/authentication integration; M1 supplies prototypes only. Respect existing module and deployment flags.
2. Implement the **touch-first floating mobile Home/Calendar/Modules/More navigation**, icon-and-label active destinations, reserved safe-area/content space, keyboard/focus/zoom fallbacks and a screen/action command menu. Use document scrolling for browsing, reset fresh-view top geometry, reserve dock/focus space, and keep software keyboards, inputs, errors and task actions unobscured. Test 320/390/768px, shorter heights, route transitions and zoom. Do not add record-wide search or persistent navigation preferences.
3. Establish canonical detail-route behavior, Back/focus restoration and safe single-active-page semantics; preserve all existing paths/bookmarks.
4. Recompose Home into attention/actions/upcoming/snapshot/progress/activity, using current payloads. Keep every existing metric, coverage detail and supporting record reachable. M5 does not own a second Home redesign.
5. Redesign sign-in/up/verification/recovery while preserving actual authentication, generic responses, token and session rules.
6. Rework current Getting started, profile/preferences/module/theme Settings, Security/session controls and Help/support draft. Retain actual progress, skip/resume, recent-authentication and diagnostic consent.
7. Remove outdated “when introduced” shell copy; distinguish private and shared context truthfully. Align module loading/error/unavailable states with the shared patterns.

**Required components/libraries:** M1 frame/primitives; cmdk for destination/action search; existing Next links/routing and Radix dialogs. No new router, identity system or native wrapper.

**Dependencies:** M1 foundations and representative review. Use existing services/DTOs and source links; future local profiles are not a dependency.

**Functionality preservation:** all modules remain reachable according to actual availability; hidden modules retain data and independent Agenda/reminder behavior; reports do not change inclusion because a nav item is hidden; current auth/recovery/lifecycle access remains secure.

**Testing/verification:** affected shell/auth/onboarding/preference component/API tests; `onboarding`, `dashboard`, `settings-lifecycle`, `accessibility` browser selections and private-access checks. Verify keyboard traps/return, route refresh, Back, account switching, 320px, both themes and restricted deletion entry.

**Acceptance criteria:** desktop and mobile use the required floating capsule language with active icon-and-label destinations, safe-area/content clearance and keyboard/zoom/task fallbacks; each module is reachable within two activations; common starts are easy to find; no icon-only primary navigation; no shell duplication in the accessibility tree; Home retains every current capability and scope distinction; existing access/recovery/setup tests still assert the same behavior.

**Expected deliverables:** complete frame/navigation, redesigned current access/setup/settings/help/Home screens, route/state evidence and focused regression report.

## 4. M3 — Money workspaces and reviewed financial tasks

**Objective:** make daily financial entry and complex debt/card work clear without changing any financial effect.

**Scope/inventory ownership:** MO1–MO7, DE1–DE4, CC1–CC6, PL1–PL3. Forecast PL4 and report routes belong to M5. Follow Plan Sections 7.3–7.8 and shared command contracts.

**Specific tasks:**

1. Build Money local navigation: Activity, Accounts, Debts, Cards and Plans. Plans exposes Recurring, Budgets, Savings goals and the existing Forecast destination.
2. Redesign activity/account tables and mobile rows, account creation/history/reconciliation and source navigation. Correct verified broken contextual account links to the existing history route.
3. Recompose income/expense/transfer into focused entry and review tasks. **Mandatory M3 mobile expense create/edit pattern:** dedicated full-screen entry, separate explicit review of exact effects, Edit without losing the draft, then authoritative confirmation/failure/recovery. Do not combine a lengthy form and extensive review summary. Preserve cash/card funding, all fields/notes, dates, splits, fees, acknowledgements, warnings and recurring links, and coordinate task controls with keyboard/capsule space. M1 remains synthetic-only.
4. Preserve integrated shared-expense entry through its existing components/contract. M3 owns the outer transaction form and context handoff; M5 owns the internal group/payer/share presentation. Neither milestone duplicates command logic.
5. Rework action detail, corrections, reversal, linked refunds and clearing resolution with exact before/after effects, current revision and retained evidence.
6. Implement debt list/detail/import/borrow/pay/schedule revision/settlement compositions with explicit liability-versus-schedule and accounting-versus-due-allocation distinctions.
7. Implement card collection/detail, commands, statement lists/create/revise/allocation and installment lists/create/detail/revise/application views. Preserve provider evidence, limits and pagination.
8. Rework recurring definitions/occurrences, budgets and goals into browse/detail/action compositions. Keep existing uncertainty, signed values, reservation bounds, historical and lifecycle actions.

**Required components/libraries:** M1 tables/filter/page controls, RHF/Zod adapters, review/state/history/help patterns; existing financial forms/services. Recharts only for the small approved domain comparisons using existing data. No new money/math library.

**Dependencies:** M2 navigation and M1 components. Existing sharing behavior must remain functional until M5's visual conversion. No new API/sort/filter/schema capability is required; expose only supported controls.

**Functionality preservation:** one exact financial action per confirmation/retry; original command identity frozen on unknown outcome; source classifications, required acknowledgements, negative values, immutable history, refunds, payments and settlement prerequisites unchanged.

**Testing/verification:** affected financial component/domain/API tests; relevant integration files for borrowing, debt payments/schedules/settlement, reconciliation/corrections, cards, recurring, budgets and goals. Browser financial/card/planning suites plus integrated shared expense smoke. Test stale/unknown responses, maximum values/labels, both themes, 320px and keyboard review.

**Acceptance criteria:** every owned route supports browse, action, review, history and appropriate failure states; mobile expense create/edit and exact review are distinct task views with draft-preserving Edit and unobscured task controls; all prior business effects, command identities, retry rules and payload contracts remain exact; planned values/reservations never appear as actual cash; no ordinary or advanced financial capability is hidden or omitted.

**Expected deliverables:** complete Money redesign excluding Forecast/report-specific work, evidence of preserved financial behaviors, route-link fixes and bounded regression results.

## 5. M4 — Career, Calendar and adaptable Trackers

**Objective:** make daily tracking and safe template evolution usable with coherent source-linked workflows.

**Scope/inventory ownership:** CR1–CR2, TM1–TM3, TR1–TR4. Career/Tracker report views belong to M5. Follow Plan Sections 7.10–7.13 and 10.

**Specific tasks:**

1. Redesign application list/new/detail, stage/outcome transitions, dated observations, events, timeline and files placement. Preserve separate attempts and duplicate warning.
2. Recompose Calendar around the existing Agenda with date/source controls, reminder attention, bounded pages and Add event. Keep source editing in its authoritative module.
3. Redesign personal-event detail and reminder controls, including inherit/override/off, snooze/dismiss/restore, current source generation and hidden-module context.
4. Separate My trackers from Templates while preserving independent pagination, presets and create-from-template.
5. Redesign tracker/entry lists, typed forms, mapped values, archive/restore, immutable revision detail and reminder links.
6. Create the template editor composition and review/publication view without adding draft autosave or executable fields. Keep stable IDs, required/default/retirement/validation rules and all mappings.
7. Create migration mapping/review/progress/cancel/resume views with actual batch counts, invalid links and sample limits; preserve partial locks and full completion conditions.

**Required components/libraries:** existing forms/validation, M1 list/history/editor layouts and Radix disclosure/help/dialog primitives. Native date controls remain a valid default. No FullCalendar, drag board, formula engine or separate tour framework is required.

**Dependencies:** M2 frame; M1 components; M3 source routes remain stable. M4 does not depend on native calendar providers, sync, local profiles or background native scheduling.

**Functionality preservation:** civil date/instant distinction; Calendar uniqueness/source ownership; reminder state does not resolve obligations; Career stage/outcome/history semantics; tracker immutable definitions/revisions and migration safety.

**Testing/verification:** affected Career/Agenda/reminder/tracker component/API/integration checks; `trackers.spec.ts`, reminder and relevant Career/browser selections. Exercise custom type/option mappings, invalid previews, partial cancel/resume, archive/restore and deadline completion. Verify keyboard field ordering, no-hover help, 320px, long labels and both themes.

**Acceptance criteria:** browse/add/edit/history workflows remain complete; generated deadlines open correct sources; complex template/migration tasks can be followed without permanent instructional walls; partial/locked/unknown states are truthful; no report definition is changed to accommodate a new layout.

**Expected deliverables:** complete redesigned Career/Calendar/Tracker operational screens, safe editor/migration interaction evidence and focused regressions.

## 6. M5 — Reports, Shared expenses and data-control workflows

**Objective:** complete analytical, collaborative and high-consequence workflows with clear scope, evidence and recovery.

**Scope/inventory ownership:** HO2, PL4, TR5, RP1, SH1–SH4, ST3–ST6. Follow Plan Sections 7.9, 7.14–7.16 and 8. Existing Home/domain widgets reuse their owned presentation; M5 verifies integration rather than redesigning those screens again.

**Specific tasks:**

1. Redesign Financial/Career/Tracker reports, periods/filters/drilldowns/CSV and the Home spending drilldown. Preserve each report's scope/denominator/coverage and exact-value table.
2. Implement only the approved useful charts with lazy loading, signed values, accessible alternatives and bounded aggregates. Keep forecast actual/expected/what-if/bridge semantics.
3. Recompose Shared expenses Groups/Invitations and each group's Overview/Bills/Payments/People, including historical-member views and authorized export.
4. Redesign bill/payer/share/refund and settlement/confirmation/dispute/reversal/suggestion tasks. Complete the internal shared-expense presentation used by M3's transaction entry without changing its integrated atomic operation.
5. Redesign My private record adoption/reconciliation/retained evidence and private follow-up entry, making scope transitions visible.
6. Rework notification consent/privacy/quiet hours/delivery evidence and contextual reminder navigation. Preserve real provider capability limits and status meanings.
7. Redesign Files and contextual attachment states, plus Data tasks for CSV import, graph export, replacement review/confirmation and recovery. Preserve proof, row/byte/scan limits and actual batch state.
8. Redesign deletion preview/recent-authentication/pending-cancel/restricted access while preserving current lifecycle and retained evidence.

**Required components/libraries:** existing Recharts, report/CSV infrastructure, M1 tables/review/comparison/progress/help/state patterns and current sharing/files/portability forms. No synchronization engine, new provider, backup format or cloud infrastructure.

**Dependencies:** M1–M4 presentation and stable source routes. Synthetic local adapters and current permission models; no production credentials. Existing Sharing flags remain unchanged and tests use the established explicit test configuration.

**Functionality preservation:** exact report definitions and exports; group/private authority separation; recipient confirmation and pending balance distinction; source revisions and private consent; scan authorization, import idempotency, restore provenance/recovery and account deletion boundaries.

**Testing/verification:** affected reporting/forecast/sharing/files/restore/notifications/lifecycle unit/API/integration suites. Browser `reports`, `career-analytics`, `forecasts`, `sharing`, `files-portability`, `notifications`, relevant `settings-lifecycle` and tracker report/replacement scenarios. Use two or more synthetic owners for permissions; exercise actual preview/replacement/recovery and lost-response states. No real messages/files are sent to external providers.

**Acceptance criteria:** all current report/collaboration/data-control routes are complete; no chart replaces its exact evidence; group suggestions do not post; private actions affect only their owner; export/backup distinctions and partial/recovery states are clear; all current inventory rows now have implementation evidence.

**Expected deliverables:** complete redesigned analytical/shared/data-control screens, cross-domain evidence, exact-value/permission/recovery regression results and any explicitly documented deferred presentation-only enhancements.

## 7. M6 — Redesign-wide polish, accessibility and targeted acceptance

**Objective:** verify that the entire redesigned V3 application is coherent, usable and functionally preserved.

**Scope:** every Section 3 inventory row and shared states. M6 owns final cross-screen consistency, defects found in acceptance and verification; it does not introduce missing major features or future migration work. Follow Plan Sections 11, 12 and 14.

**Specific tasks:**

1. Audit route/capability coverage against the original inventory and any subsequent accepted repository changes. Verify all canonical/deep/contextual links and Back restoration.
2. Finish consistent motion, empty/error/loading/unknown states, helper wording, mobile keyboard/safe-area behavior and desktop density. Use CSS first; add Motion only for a measured approved need.
3. Inspect representative screens and consequential states across the specified viewport/theme/long-value matrix. Remove repeated boilerplate without removing warnings or constraints.
4. Complete keyboard, focus, screen-reader, forced-color, reduced-motion, zoom and touch checks. Record manual checks actually performed and environment limitations.
5. Measure client bundle/interactions/loading against M1; investigate regressions, new N+1 reads and hidden duplicated page instances. Retain current backend limits/budgets.
6. Execute redesign-wide, risk-based acceptance: complete redesigned screen/route coverage; cross-module navigation/contextual links; shared presentation components; responsive/theme/keyboard/accessibility behavior; consequential workflows; changed UI performance; and existing behavior affected by redesign. Use existing assertions, appropriate static checks and the supported production build where needed. Do not automatically run the complete V1–V3 campaign or unrelated backend/database/infrastructure/performance/browser suites. Broaden only for changed shared contracts, discovered failures or significant security/financial integrity risks; rerun affected checks after fixes.
7. Conduct the task walkthroughs in Plan Section 14; record findings, fixes, remaining limitations and final acceptance status. Confirm only approved current scope was delivered.

**Required components/libraries:** existing Playwright/axe/Testing Library/Vitest and local browser/build environment; no new runner or native tooling. Motion remains optional, not a milestone completion condition.

**Dependencies:** M1–M5 complete with focused checks; D01 approval already satisfied. Use **Personal workspace** as the working identity; final branding and F01–F07 remain deferred and non-blocking.

**Functionality preservation:** no numerical, security, history, retry, import/restore, permission or lifecycle assertion is weakened to make redesigned screens pass. UI selectors can change to follow improved accessible names while retaining the behavior being tested.

**Testing/verification:** meaningful cross-screen browser/accessibility coverage of all redesigned inventory areas and consequential journeys, plus changed/affected unit/API/component/integration contracts, visual/theme/viewport/keyboard checks, changed UI performance, appropriate static checks and supported build where required. Complete route coverage is mandatory; complete historical suite execution is not. Record an impact matrix with actual results, coverage, exclusions/rationale and unverified gates. Preserve mandatory guarantees and existing CI; broader automatic CI outcomes are separate evidence. Do not add migration generation, production deployment or infrastructure recovery campaigns without a concrete changed seam/risk. No result is claimed before execution.

**Acceptance criteria:** all inventory IDs verified; no unresolved critical financial/privacy/accessibility regression; all required gates pass or a material limitation is explicitly accepted by the owner; measured performance is within agreed budgets; ordinary and advanced workflows remain discoverable; current V3 remains functional throughout adoption.

**Expected deliverables:** finished current redesign, coverage/verification report, final screenshots and measured performance/accessibility evidence, updated handoff with any remaining limitations. No native/offline implementation or production launch.

## 8. Coverage and responsibility ledger

| Inventory group                                              | Implementation owner     | Cross-cutting acceptance           |
| ------------------------------------------------------------ | ------------------------ | ---------------------------------- |
| AU1–AU2, HO1, ON1, ST1–ST2, HP1, SY1                         | M2                       | M6                                 |
| MO1–MO7, DE1–DE4, CC1–CC6, PL1–PL3                           | M3                       | M6                                 |
| CR1–CR2, TM1–TM3, TR1–TR4                                    | M4                       | M6                                 |
| HO2, PL4, TR5, SH1–SH4, RP1, ST3–ST6                         | M5                       | M6                                 |
| Tokens, primitives and shared interaction/layout foundations | M1                       | Each consumer milestone and M6     |
| Future FUX01–FUX20 implementation                            | **Outside this roadmap** | Separate approved platform program |

M2 owns Home composition; later domain/report work supplies reusable components without creating an unrelated second dashboard. M3 owns unified transaction entry; M5 owns its shared-expense subflow presentation. M4 owns operational tracker screens; M5 owns tracker reporting. This division avoids overlapping responsibility while requiring integration checks.

## 9. Session handoff and completion record

For each assigned milestone, record: baseline/changed paths, inventory IDs completed, behavior preserved, checks run/results, screenshots or other review evidence, unresolved defects and precise next step. Preserve unrelated working-tree changes. Keep documentation consistent with the comprehensive plan and actual owner decisions.

Use the project's code-output rule when creating or updating code/configuration files in future implementation sessions. No code/configuration file is created or changed by this planning assignment.

| Milestone | State at planning delivery                | Evidence                      |
| --------- | ----------------------------------------- | ----------------------------- |
| M1 | Implemented and technically checked; pending owner visual sign-off | [Handoff, tests and rendered proofs](REDESIGN_M1_HANDOFF.md) |
| M2        | Not started                               | No implementation claimed     |
| M3        | Not started                               | No implementation claimed     |
| M4        | Not started                               | No implementation claimed     |
| M5        | Not started                               | No implementation claimed     |
| M6        | Not started                               | No acceptance results claimed |

Next step: owner reviews the final desktop dock in the local browser for appearance, placement, scrolling and proportions. Approved themes, Dock A, mobile presentation and existing workflows remain settled. Resolve any desktop feedback before individually assigning M2. M2–M6 and future platform decisions remain outside this delivery.
