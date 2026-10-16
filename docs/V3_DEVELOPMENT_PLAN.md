# V3 Development Plan

**Date:** October 16, 2026 (Asia/Manila)\
**Status:** V3-A/V3-B implemented as an intermediate feature-branch checkpoint; V3-C/V3-D and comprehensive V3 acceptance remain pending. See the [implementation handoff](V3_DEVELOPMENT_HANDOFF.md).\
**Repository:** `RAbnza/Personal-Management-Platform`\
**Accepted starting point:** `main`, `54a08d67c4ef7f5be01f5eaf63ba5c071e708b93` (`feat(sharing): complete V2-I shared expenses and settlements`), verified equal to `origin/main` during preparation.

## 1. Authority and development direction

Read this plan with the [blueprint](PROJECT_VISION_AND_FEATURE_BLUEPRINT.md), [system architecture](SYSTEM_ARCHITECTURE.md), [database architecture](DATABASE_ARCHITECTURE.md), [design guidelines](DESIGN_SYSTEM_AND_VISUAL_GUIDELINES.md), and [V2 handoff](V2_DEVELOPMENT_HANDOFF.md), especially its completed V2-I evidence in Section 30. [ADR 0005](adr/0005-v3-scope-and-platform-transition.md) supersedes earlier roadmap statements about external calendar synchronization in V3 and a subsequent production release of the current web application. Unaffected V1/V2 business rules and implementation decisions remain authoritative.

The current web application remains the development and verification environment through V3 and the subsequent comprehensive UI/UX redesign. Production deployment and production-readiness completion for this web application are no longer planned. Existing infrastructure and runbooks remain useful for local verification, security, integrity and recovery; their presence does not create a deployment assignment.

The intended sequence is **V3 → Comprehensive UI/UX Redesign → Platform Architecture Planning → Windows/Android Development → Platform-Specific Acceptance**. The future product should run most personal features offline with device-local data, keeping selected synchronization/collaboration online. This is an approved direction, not an approved replacement architecture. Reassess feature fit and infrastructure during architecture planning; do not preselect technologies or implement that transition in V3.

## 2. Approved scope and boundaries

V3 delivers adaptable private trackers:

- Preset **Learning**, **Books**, and **Personal Tasks** trackers.
- Versioned templates and field definitions; user-created templates and custom fields.
- Exactly the supported field types: **text, number, date, checkbox, single-select**.
- Validated entries, immutable entry history, and explicit safe template migrations.
- Tracker reporting/statistics, internal Calendar/Agenda deadlines and appropriate existing reminder behavior.
- Relevant Dashboard, onboarding/help, navigation, module preferences, exports/portability, lifecycle, accessibility and security integration.

External calendar-provider synchronization is deferred until future platform architecture planning explicitly approves it. No provider OAuth flows, synchronization jobs or provider configuration belong to V3. Existing opted-in reminder email is distinct from calendar synchronization and may be extended through the established notification contract without enabling real delivery.

V3 does not include offline support, desktop/mobile packaging, a replacement database/backend, template sharing or collaborative tracker permissions, arbitrary formulas, scripting, general page builders, richer relations, or habit streaks/check-ins. Do not turn tracker number fields into financial balances or replace specialized Finance, Career or group authorities. Tracker attachments are not a required V3 deliverable; do not expand file scope merely because the database design reserves a later attachment relation. Relevant existing export and lifecycle behavior must still cover tracker data.

## 3. Prerequisites, responsibilities and dependency order

Before Assignment 1, the implementing engineer must:

1. Fetch and inspect the current branch, accepted V2 baseline, current handoff and any subsequent authorized changes; preserve unrelated work. Reuse the existing 116-table/200-migration baseline through `0199` as recorded in V2-I, checking actual schema/journal before adding forward migrations. Never rewrite published migrations.
2. Inspect only affected Tracker/Time/Reports/Dashboard/Settings, authorization, command, portability and lifecycle seams. Read the relevant installed Next.js guides in `node_modules/next/dist/docs/` before application code changes, as required by `AGENTS.md`.
3. Translate database Section 14 into ordered, reviewed forward migrations using the established roles, scoped transactions, composite ownership keys and forced RLS. Reuse current command receipts, audit, validation and error conventions.
4. Define bounded text/value sizes, field/option counts, number precision/ranges, entry pagination and migration batch limits before exposing custom input. Specify allowed validation/default schemas and exact title/status/deadline/completion mapping semantics for each preset. Resolve ordinary implementation details from established rules; escalate only a genuine scope or product-policy change.
5. Use synthetic local/test fixtures and existing local adapters. Missing real mail/storage/hosting credentials must not block unrelated local work or trigger requests to configure external services.

| Responsibility                         | Accountable party                             | Required output                                                                                                        |
| -------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Scope and future architecture approval | Project owner                                 | This approved V3 boundary; separate future approval for platform architecture and feature changes                      |
| Implementation and database review     | Implementing engineer/technical lead          | Vertical workflows, safe forward migrations, authorization and validation proofs, accurate documentation               |
| Verification and acceptance evidence   | Implementing engineer                         | Focused Assignment 1 evidence; one complete Assignment 2 verification record with failures, fixes and limits disclosed |
| Human-only operational configuration   | Owner/operator, only if separately authorized | Historical production checklists remain preserved; no such configuration is required by this plan                      |

Dependency order: **V2 accepted baseline → V3-A → V3-B → Assignment 1 checkpoint → V3-C → V3-D consolidated acceptance**. A establishes the version model before B exposes customization; C consumes stable entries/migrations; D accepts the complete product. These are four internal milestones within two implementation assignments, not four independent full acceptance cycles. The preparation assignment creates documentation only and authorizes none of those implementation steps yet.

## 4. Persistence and integrity contract

Preserve [database Section 14](DATABASE_ARCHITECTURE.md#14-trackers-and-template-evolution-t3):

| Existing model                                       | V3 obligation                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tracker.template`, `template_version`               | Clone source-controlled presets into the user's private workspace. Record preset origin/version as metadata. Published versions are immutable; trackers pin a version rather than following a mutable current pointer automatically.                                                               |
| `field_identity`, `field_definition`, `field_option` | Stable identities and option keys retain meaning across versions. Validate primary mappings against this version's definitions. Retired definitions/options remain understandable in old entries; never recycle a field key for a different meaning.                                               |
| `tracker.tracker`, `entry`, `entry_revision`         | Keep compatible same-template/version relationships and immutable previous revisions. Validate bounded JSONB against its referenced version. Extracted title/status/deadline/completion values update with the revision in the same transaction; they are derived, not separately editable.        |
| `template_migration`                                 | Explicit preview, confirmed mapping and bounded resumable execution. Use the documented states, same-lineage references and one-running-migration-per-tracker guard. Replays create no duplicate revisions. Invalid entries retain their original values and require resolution before completion. |

Use the controlled version-aware validator at normal service writes and privileged migration paths, with database JSON object/size checks and immutable published definitions. Preserve same-workspace and same-parent/version FKs, runtime privilege restrictions and server-derived authority. Define the transaction/concurrency policy for entry edits during migration, including mixed-version reads, stale previews and final version-pointer changes; never expose an invalid intermediate state or mark a partial migration complete. A failed/cancelled run must disclose which entries migrated and retain every prior revision; do not imply cancellation reverses committed batches.

Adding optional fields, adding required fields/defaults, type changes, retired fields/options and title/status/deadline mapping changes all use an explicit version policy. No coercion or bulk overwrite may silently lose information. A date value is a date string, not midnight UTC. No new persistence architecture is required for the future platform intention.

## 5. Internal milestones

### V3-A — Tracker Foundation and Presets

**Dependency:** Accepted V2 and Section 3 prerequisites. **Owner:** Implementing engineer.

Deliver the private tracker schema, constraints/RLS, bounded validator, command/API/read contracts and existing-design-system list/detail/entry/history flows. Publish versioned seed definitions for Learning, Books and Personal Tasks; creating a preset must create an owned template instance without mutating another workspace. Expose supported fields and consistent title/status/deadline/completion mappings. Include archive/restore behavior with history retained and source eligibility defined. Keep unfinished integrations hidden or explicitly unavailable.

**Acceptance:** Each preset can be created, populated, edited and archived without duplicate commands or lost history. All five field types accept valid values and reject malformed/unknown/oversized values. Required/default/option/date/number boundaries are defined and tested. Published definitions and old revisions cannot be overwritten. Mixed-owner, mixed-template and mixed-entry references fail under actual restricted roles. Seed retries and response-loss retries are safe. Existing financial and group records remain unchanged.

### V3-B — Custom Templates and Versioned Migrations

**Dependency:** V3-A model, validation and immutable history. **Owner:** Implementing engineer.

Deliver private user-created templates and an accessible custom-field editor with publish/version semantics. Provide migration preview, mapping/default review, invalid-entry review, explicit confirmation and truthful progress/resume/failure/cancellation states. Show before/after impact and retain old definitions/values. Bind confirmation to the reviewed versions and relevant current data; reject or refresh stale previews. Serialize competing migrations and define safe interactions with entry edits, archival and lifecycle deletion.

**Acceptance:** A user can create a template and migrate an existing populated tracker across compatible and incompatible changes while reviewing affected counts and unresolved values. Required-field additions, numeric conversions, option retirement and mapping changes preserve original evidence. Batch interruption/resume and same-key/concurrent replay produce exactly one intended successor per entry. Invalid entries remain readable and recoverable; no success is claimed while unresolved. Foreign versions/fields/options and unauthorized migration requests fail. Focused tests prove rollback, concurrency and database/authorization boundaries before the checkpoint.

### V3-C — Reporting, Calendar, and Cross-Domain Integration

**Dependency:** Assignment 1 checkpoint with no unresolved integrity/security blocker. **Owner:** Implementing engineer.

Deliver the following using existing services and design patterns:

- **Reports/statistics:** Weekly, monthly, quarterly, yearly and custom periods; documented current-state versus completion/activity semantics, compatible status/completion mappings, missing values and version coverage. Define denominators and archived-entry treatment. Use immutable history for activity facts and current revisions for current state, without counting both as duplicate entries. Provide scoped drilldowns, accessible tables and export coverage; avoid unrelated scores or misleading cross-template aggregates.
- **Internal Calendar/Agenda:** Project eligible date-only deadlines from current tracker sources with stable source keys and source-routed edits. Define completion, archive, reschedule, migration and overdue behavior. Preserve workspace timezone semantics; do not copy deadlines into independent appointments. Recheck mapping/version changes without producing duplicates or orphaned sources.
- **Reminders:** Reuse [V2-G](v2/SCHEDULED_NOTIFICATIONS.md) rules, source generations, dismissal/snooze, separate module reminder switches, quiet hours, consent, privacy-safe content and immediate pre-send source/lifecycle revalidation. Irrelevant edits must not resend; completion/archive/deletion must suppress obsolete work. Do not infer opt-in, replay restored notifications, add push/SMS or require real provider setup.
- **Connected experience:** Add relevant Dashboard links/attention, navigation, hide/restore semantics, skip/resume/replay onboarding and contextual help. Use established tokens/components, light/dark themes, responsive layouts, keyboard focus and accessible dynamic forms/migration errors. Module hiding must disclose separate Agenda and reminder behavior. Broad redesign remains a later assignment.
- **Portability/lifecycle:** Extend existing supported exports and trusted workspace restoration with definitions, identities, versions, entries, revisions and migration evidence in dependency order. Document exact CSV and portable format coverage, compatibility and limits; preserve H/I provenance, retirement, notification-consent reset and group-history restrictions. Do not discard partial-migration evidence, accept executable/unvalidated template payloads or disable checks during restore. Integrate deletion preview/purge ordering, archived history, reminder cleanup and recovery/deletion-register reconciliation. Do not silently omit tracker data from an export advertised as complete.

**Acceptance:** Counts reconcile to eligible entries and history across template versions and supported periods; drilldowns/exports agree. Deadlines appear once, source edits and lifecycle changes update eligibility, and reminders obey the existing consent/replay protections. A foreign user or group member sees no private tracker data through reports, search, exports, reminders or nested IDs. Portable round trips retain version/history relationships and safe partial-migration state under existing restore rules. Relevant V1/V2 flows retain their recorded business behavior. Representative forms, reports, migration review and Calendar flows pass responsive, keyboard and accessibility acceptance.

### V3-D — Consolidated Acceptance and Documentation

**Dependency:** V3-A through V3-C complete. **Owner:** Implementing engineer; owner reviews any separately identified human-only evidence.

Perform the single consolidated phase in Section 7. Record a scenario/evidence index, final schema and migration inventory, implemented decisions, known limitations, actual verification results and reproducible commands. Update affected user/help, export/lifecycle and handoff documentation. Distinguish local acceptance from any unperformed manual or hosted check; preserve historical V1/V2 evidence. Do not claim complete V3 acceptance while a required correctness/security gate is failing.

**Acceptance:** Applicable V1–V3 regression and acceptance gates pass with unchanged security/integrity assertions; failures have fixes and affected reruns. Document genuinely unavailable human-only evidence explicitly. Commit/push the authorized assignment result and verify the remote SHA. Stop before redesign or platform implementation.

## 6. Two-prompt execution strategy

### Assignment 1 — Implement V3-A and V3-B

The first future implementation prompt assigns Sections 3–5 through V3-B, including affected documentation and a committed, reviewable checkpoint. Implement the foundation before the editor/migration workflow. Run focused unit/API/component checks and real PostgreSQL tests at critical constraints, forced-RLS/runtime-role, ownership, version validation, immutable-history, rollback, replay and migration/concurrency boundaries. Run affected lint/type/format checks and focused new-schema/upgrade validation appropriate to those changes. If a cross-domain contract is unfinished, guard it safely and document it rather than exposing a falsely complete integration.

Do not repeat the complete V1/V2 regression, full production builds, browser acceptance campaigns, encrypted restore drills, container acceptance or performance benchmarks at the A/B boundary or checkpoint. This limits verification cycles, not essential proofs. A concrete failure or high-risk boundary can require an additional focused check immediately.

The checkpoint handoff must identify its verified commit, migrations, preset/validator/migration decisions, focused evidence, safe partial-integration behavior and exact C/D prerequisites. Resolve critical database, authorization, validation and migration failures before closing Assignment 1. Do not describe the checkpoint as full V3 acceptance. Stop after A/B; C/D require the second assignment.

### Assignment 2 — Implement V3-C, complete V3-D

The second future prompt starts from that checkpoint. Review its actual evidence and resolve prerequisite defects, then complete C's reports, Time/notification, experience, portability and lifecycle integration. Run focused checks while implementing and one consolidated full applicable V1–V3 verification phase after the complete implementation is ready. Produce the final acceptance/handoff and verified commit/push result. No additional implementation prompt or full test cycle is required for each internal milestone.

## 7. One consolidated verification phase

This is future implementation work in Assignment 2. **None of these application checks is part of this documentation-preparation assignment.** Run heavy checks sequentially with existing bounded workers; preserve assertions, exact-money requirements and established budgets. Inspect current scripts/CI rather than assuming historical test counts or command flags remain current.

| Gate                      | Required complete-V3 evidence                                                                                                                                                                                                                                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Static and schema         | Lint, TypeScript/route types, formatting, schema drift, forward migration review; published migrations intact; fresh and applicable upgrade chains including the accepted V2 baseline, repeat/no-change behavior and restricted-role checks                                                                                                      |
| Full regression           | Full applicable unit/domain/API/component and real-PostgreSQL integration suites across V1–V3; no exclusion of unchanged Finance/Career/groups/portability/notifications merely because V3 adds trackers                                                                                                                                         |
| Adversarial integrity     | Cross-workspace/nested-ID access, actual-role RLS/FKs, immutable versions/history, malformed dynamic values, stale previews, concurrent edits/migrations/deletion, rollback, interrupted batches, duplicate commands and notification replay                                                                                                     |
| Browser and accessibility | Full applicable existing V1/V2 acceptance plus all three presets, custom editing/migration recovery, reports, Calendar/reminders, exports/restore and lifecycle; response-loss recovery, multi-user privacy, light/dark, representative 320–1440px reflow, keyboard/focus/error handling and existing automated/manual accessibility obligations |
| Build and local runtime   | One final supported production-mode build/artifact and applicable web/worker/backup container checks as local compatibility evidence, using the supported Linux path where required by the V2 handoff; no hosted promotion or web production-readiness claim                                                                                     |
| Recovery and portability  | Supported tracker export/restore round trips and one consolidated isolated encrypted backup/decrypt/actual restore drill; exact V1/V2 totals, tracker versions/history, RLS, revoked sessions, deletion reapplication and paused/reconciled notification effects                                                                                 |
| Capacity and security     | Applicable existing household/load budgets plus bounded tracker/report/migration cases at explicitly documented sizes; dependency/security review and no sensitive artifact leakage; no new production performance promise                                                                                                                       |
| Documentation             | Scenario/evidence index, real pass/failure/blocked status, user-visible scope/limits, operational checklist references, final commit and verified remote SHA                                                                                                                                                                                     |

Use one coordinated phase, with affected reruns after failures/fixes. Repeat a full suite only when new changes or unresolved evidence justify it. Never hide a failed check, lower an assertion/budget or substitute historical evidence for a required current check to meet the two-prompt strategy. Hosted-only or human-only checks remain explicitly distinguished from locally executable acceptance; do not request external provisioning to manufacture web production acceptance.

## 8. Completion and stop boundaries

For this preparation: check documentation consistency, relative links, Markdown formatting and diff scope; commit and push only documentation and verify the remote SHA. Do not run application suites, browser tests, Docker builds, database migrations or benchmarks.

For future V3 completion: deliver accepted trackers and consolidated evidence, then stop. The comprehensive redesign, platform architecture planning, Windows/Android development and platform-specific acceptance are separate later assignments. Preserve existing [V2-H](V2_H_MANUAL_SETUP_AND_PRODUCTION_CHECKLIST.md), [V2-I](V2_I_MANUAL_SETUP_AND_PRODUCTION_CHECKLIST.md) and [V1 operational](V1_OPERATIONS.md) instructions as historical/conditional operational requirements. No real provider keys, cloud storage, email configuration, hosting or infrastructure changes are requested by this documentation assignment.

## 9. Assignment 1 checkpoint

V3-A and V3-B now have a local/test-only, default-off implementation on `feat/v3-a-b-trackers`; see [V3_DEVELOPMENT_HANDOFF.md](V3_DEVELOPMENT_HANDOFF.md) for actual evidence and decisions. The schema contains 125 declarative tables and 202 migrations through `0201`. Migration previews bind current entries and immutable definitions; batches process at most 50 entries. Confirmed and partially cancelled migrations pause ordinary edits/archival until completion. Old revisions survive every transformation, and the active tracker version advances only when all entries are resolved.

Workspace bundle generation/replacement is guarded while tracker data exists, including confirmation of a preview that predates tracker creation. Definition/entry/history portability, reports, internal Calendar/reminders, global onboarding/navigation integration and consolidated acceptance remain Assignment 2 work. Minimal deletion-inventory and portability guards protect the intermediate state; they do not claim V3-C/D completion. No future-platform or production-readiness scope was added.
