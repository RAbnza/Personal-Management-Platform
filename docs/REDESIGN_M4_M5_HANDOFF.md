# M4 + M5 design implementation

Branch: `feat/redesign-m4-m5`, based on the owner-approved M2/M3 commit `9f3d9bd808cda003dc2a2b7261fbcecffaa29e43`.

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

## M5 continuation

M5 implementation follows the M4 checkpoint: analytical Financial/Career/Tracker reports and spending detail; interactive forecast; Shared Expenses group/bill/payment/participant/private-adoption surfaces; notifications, files, portability and lifecycle workflows. No M6, merge, deployment or native/offline work is included.

Owner review uses the running application. No screenshot, video, trace or visual-report package is produced.
