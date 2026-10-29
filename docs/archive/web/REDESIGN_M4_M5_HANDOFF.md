# M4 + M5 design implementation

> **Historical record:** preserved development evidence. Current summary: [Development history](../../DEVELOPMENT_HISTORY.md).

**Visual approval:** M1–M5 explicitly approved October 18, 2026 (Asia/Manila). Implementation is complete as recorded below; consolidated technical acceptance is tracked separately in [M6 acceptance](REDESIGN_M6_ACCEPTANCE.md). Historical test results are not retroactively expanded.


Branch: `feat/redesign-m4-m5`, based on the approved M2/M3 commit `9f3d9bd808cda003dc2a2b7261fbcecffaa29e43`.

## M4 checkpoint

The interaction model now follows the activity: calendar navigation, application cards and timelines, schema-aware tracker collections, selected-field template editing, and guided migration mapping. Approved themes, navigation, breadcrumbs, and financial workflows remain the foundation.

| Inventory | Routes and implementation |
| --- | --- |
| CR1–CR2 | `/career/applications`, `/new`, `/[applicationId]`: cards/grouped/table views, server search/stage/archive filtering with cursor continuity, page-scoped summaries, next action, combined effective-date timeline, contextual stage/event/observation editors, optional role context and notes, contacts/resume references, original history evidence and attachment placement. |
| TM1 | `/calendar`: FullCalendar 7.1.3 month/week/day/list, Today and direct navigation, source filters, selected-day panel, contextual personal-event creation. Existing custom-range paginated Agenda remains in disclosure. |
| TM2–TM3 | `/calendar/events/[eventId]`, `/calendar/reminders/[sourceKind]/[sourceId]`: source details, contextual lifecycle editor, reminder cards, explicit timing/default controls and preserved confirmation/history. Due attention and module defaults remain available from Calendar. |
| TR1–TR2 | `/trackers`, `/trackers/[id]`, `/trackers/entries/[id]`: collections, presets, typed essential/optional entry fields, list/status/table browsing, exact values, published-schema interpretation during partial migration, contextual create/edit, archive/restore, deadline links and revision history. Counts describe the loaded page. |
| TR3 | `/trackers/templates/new`, `/trackers/templates/[id]`, `/trackers/versions/[id]`: field list → selected settings → interactive preview. Existing types, stable identities, ordering, options, defaults, retirement, mappings, review and publication contracts remain intact. Preview values are never saved. |
| TR4 | `/trackers/migrations/[id]` and tracker migration entry: selected-field mapping, before/after samples, real valid/invalid counts, progress and bounded processing. First-50 issue and first-5 sample limits remain explicit. Cancel preserves committed batches; resume and partial locks retain existing semantics. |

### Calendar read contract

- Standard [FullCalendar React 7](https://fullcalendar.io/docs/react) plugins plus `temporal-polyfill`; no Premium feature, external synchronization, or drag mutations.
- Existing authenticated `/api/v1/agenda` adds optional `overlap=true`. Default reads keep their start-within-range semantics. Overlap reads cover at most 63 inclusive civil dates and include events starting earlier whose exclusive end crosses the range start.
- Cursors bind overlap mode as well as dates and modules. Existing cursors default to ordinary reads. Source authorization, Agenda visibility, source routing and 200-item page limits remain intact.
- Calendar automatically reads up to five pages, then explicitly labels incomplete coverage and offers more. It never describes an unloaded day as empty. Range/filter changes abort stale fetches. Existing server-rendered paginated Agenda is independent.
- All-day values remain civil date strings; timed values remain original instants rendered in the workspace timezone. Exclusive multi-day ends are preserved. Day inspection uses timezone-aware day boundaries, including DST.
- Personal-event creation keeps its idempotent command and prevents closing during saving or an unconfirmed outcome.

### Focused verification

Date adapter and Agenda API: 7 tests passed. Agenda integration: 6 tests passed against the guarded isolated test database, including overlap boundaries and mode-bound cursors. Tracker, personal-event creation and hidden-Career source components: 9 tests passed. Both focused browser workflows passed: Calendar creation/navigation and mobile template editing; Career cards/grouping/detail/archive. TypeScript and targeted ESLint passed. No screenshots, videos or traces were recorded.

## M5 implementation

| Inventory | Routes and interaction |
| --- | --- |
| HO2 / RP1 | `/dashboard/spending`, `/reports/financial`, `/reports/financial/detail`, `/reports/career`: period-preserving exact summaries and drilldowns; separate daily/category/metric/account/planning views; selectable chart series and exact tooltips; independent Career milestone chart, timing/cohort/source views and anchored supporting evidence. Current definitions, cutoffs, exports and source authorization remain unchanged. |
| PL4 | `/money/forecasts`: primary projected cash chart with bridge toggle, explicit actual/recorded-future/expected/hypothetical amounts, negative balances and uncertainty. Existing date/source/card/what-if controls recalculate a read-only scenario. Exact daily values and source exclusions are available in disclosure. |
| TR5 | `/trackers/reports`: current-status distribution and recorded-activity charts in separate views, genuine counts, current-state semantics, template coverage, entry/revision evidence and original scoped CSV. |
| SH1–SH4 | `/sharing`, `/sharing/[groupId]`, bill create/detail, participant detail, invitations and private-effect review: group cards; people/balances, bills, payments and management views; prominent signed positions; pending-state cards; payer buttons, participant selection cards and exact rounded share previews; current versus historical bill revisions; focused private adoption/effect/invitation surfaces. The same bill component serves M3's shared transaction entry. |
| ST3 | `/settings/notifications`: opt-in switch, paired quiet hours and content preferences, environment delivery capability, recent delivery cards with status filter and source evidence. Scheduled, accepted and delivered retain distinct meanings. |
| ST4 | `/settings/files` and source attachments: source-folder browser, page-scoped search, selected-source file cards, names/types/declared sizes, state filtering, contextual upload, verified-download gating, original unlink/delete/retry behavior. Folder navigation locks during pending or unconfirmed file operations. |
| ST5 | `/settings/portability`: file selection → real six-column mapping and interpretation → preview/problem/duplicate review → explicit confirmation → bounded processing and recorded outcome. Original CSV bytes go to the existing server validator; no inferred financial conversion. Export/replacement is a separate task with before/after exact comparisons, blockers, typed confirmation and recovery history. |
| ST6 | `/settings/lifecycle`: focused scope/identity/confirmation sequence, existing recent-password verification and grace/cancel controls. Obsolete V1 text was replaced with the authoritative current manifest's identity, file-cleanup and retained shared-history explanations. |

### Preserved contracts and implementation choices

- Reuses Recharts 3.10.1 and the existing `csv-parse` 7.0.3 browser parser; no additional M5 dependency. Numeric chart coordinates are approximate; exact monetary strings and integer accounting remain authoritative.
- Workspace view switching keeps components mounted, retaining drafts and frozen command identities. Anchored evidence reveals its containing view. Approved navigation, both themes and named breadcrumbs remain in use.
- Group authority, separate private adoption, immutable revisions, rounding allocation, settlement confirmation and financial command payloads are retained. Forecast interaction only reads projections.
- File lists use the existing source-authorized read API. Source pagination and per-page filters are explicit; no workspace-wide file completeness is claimed. Downloads require verified availability.
- CSV retains 1 MiB / 500-row / six-column limits, explicit date interpretation, distinct mapping, source byte identity, preview hash, duplicate decisions, idempotent commands and partial-batch behavior. Posted rows survive cancellation. Replacement retains existing provenance, blockers and 24-hour recovery limits; a new preview clears the typed confirmation.
- Notification commands retain version and uncertain-outcome locks. Lifecycle deletion retains recent authentication, exact scope snapshot, explicit confirmation, seven-day grace, cancellation eligibility and retained-evidence limitations.

### Focused verification

- 25 existing focused component tests passed across the final relevant runs: sharing forms/settlements, forecast scenarios, notification preferences and lifecycle protections. Three selectors were updated for the new switch/radio interactions; assertions were retained.
- Two new CSV inspection tests passed (quoted/multiline fields, exact amount strings, duplicate/extra columns, malformed rows and size/count limits). One workspace-view test passed (draft retention and anchored evidence).
- Two isolated browser workflows passed: mapped CSV preview/confirmation/posting, exact analytics, what-if forecast, source-file metadata/download gating, and 320px dark/reduced-motion layout; group views and a three-person exact rounded bill save. No screenshots, videos or traces were recorded.
- TypeScript and targeted ESLint passed. Formatting and whitespace checks run on changed files.

### Review limits

- The isolated browser server has no configured object store/scanner. File browsing tests seeded reserved metadata through the existing test seam and verified that download stayed unavailable; they did not claim an uploaded file was scanned successfully.
- File search/filtering applies to the current authorized source/file page. Career/Tracker counts retain their stated cohort/current-state/recorded-activity definitions. Calendar coverage remains bounded and explicitly offers more pages.
- Historical browser campaigns, destructive replacement/purge execution, production delivery and consolidated M6 acceptance were not run. Existing APIs and deeper protection tests are preserved. Visual review was granted October 18, 2026; consolidated technical acceptance is tracked in M6.
- No M6, merge, production deployment or native/offline implementation is included.

Review uses the running application. No screenshot, video, trace or visual-report package is produced.
