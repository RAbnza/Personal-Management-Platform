# Adaptable Trackers workflows

Open **Trackers** from primary navigation. Start with Learning, Books or Personal Tasks, or publish a custom template. Every template and entry belongs to the current private workspace. Settings can hide Trackers without deleting records; Calendar visibility and reminders are separate preferences.

## Templates and entries

Custom fields support text, exact decimal numbers, civil dates, checkboxes and one select choice. Configure the title, optional status/deadline and completion mappings. Review a version before publication. Stable identifiers retain history when labels change; retire removed fields/options. Published definitions and entry revisions remain immutable. Edits create successors with a reason and reject stale concurrent changes. Archive/restore retains history.

A changed definition does not silently transform an existing tracker. Open its migration section, choose mappings/defaults/conversions and review counts, samples and invalid-entry links. Confirm the reviewed plan, then process batches of at most 50. Confirmed work pauses ordinary edits. Cancellation keeps committed batches; resume the same partial plan to finish. The tracker version advances only after every entry is resolved.

## Reports and Calendar

**Reports and statistics** supports week, month, quarter, year and custom ranges (at most 366 days). Current entries/progress are a snapshot at query time. Period activity comes from recorded immutable revisions in the workspace timezone. A manually entered completion date is a field value, not an event timestamp. Creation while already complete is a creation; later completion/reopening is counted once per recorded transition. Migration revisions use their command evidence and are reported separately from user activity.

Completion progress excludes definitions without a compatible completion mapping. Version coverage identifies the definitions used by current records and activity. Archived selection uses current entry or tracker archival state; the report does not reconstruct a historical period-end archive state. Current detail and historical activity link to owned entry/history pages. CSV exports the selected current and activity rows with period/timezone/version metadata and formula-safe text; it is not a backup. Narrow a selection above 10,000 entries or 20,000 activity revisions.

Mapped incomplete active deadlines appear once as date-only Calendar sources. The entry remains authoritative; edit its linked source to move the deadline. Completion/archive removes the source; reopening/restoration creates a current generation. Template mappings can remove or change a source. Workspace civil dates are preserved across timezone display boundaries; no external calendar synchronization occurs.

Open **Deadline reminders** on an entry for inherited/override/off settings, dismissal, restore or snooze. Navigation hiding does not itself disable reminders. Module reminder settings, explicit notification consent, quiet hours, verified identity and current source generation continue to govern delivery. Messages omit private entry titles. Completion/archive and stale generations cancel pending work; restored provider history never authorizes a resend.

## Export, replacement and account deletion

Settings ? Portability includes all nine tracker tables: templates, versions, identities, field definitions/options, tracker instances, entries, revisions and migration evidence. The existing 10,000-row/10-MiB graph limits include every domain. Strict typed validation checks definitions, normalized values, current/predecessor relationships, migration evidence and evolution rules before preview and again before replacement. Literal dynamic field values remain unchanged during owner/UUID remapping.

Original V2-H and V2-I graph fingerprints remain supported with exact original provenance; their absent tracker graph means an empty tracker replacement. Existing financial balance checks, trusted own-workspace shared-history requirements, excluded attachment bytes and retained external effects remain enforced. Privileged replacement retains a 24-hour recovery graph and resets notification consent. In-flight/failed restored migrations become cancelled; a partial migration retains editing locks until explicitly resumed. Preview-only plans can be freshly reviewed after remapping.

Account deletion preview includes tracker records. The established lifecycle guard blocks writes once deletion starts, and the controlled purge removes all nine private tracker tables while preserving other owners and shared group evidence. Full environment backup drills are separate from these verified graph replacement/recovery paths.

See [targeted acceptance](V3_TARGETED_ACCEPTANCE.md) and [deferred gates](V3_MANUAL_ACTIONS_AND_DEFERRED_GATES.md) for evidence and limits.
