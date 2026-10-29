# ADR 0005: V3 scope and platform transition

- Status: Accepted development direction and V3 scope; replacement platform architecture not yet designed or approved
- Later status (2026-10-19, historical): the replacement architecture was defined in the Salapiya product blueprint; see [Architecture](../ARCHITECTURE.md)
- Date: 2026-10-16 (Asia/Manila)
- Baseline: `main`, `54a08d67c4ef7f5be01f5eaf63ba5c071e708b93`; V1 and V2-A through V2-I locally accepted
- Execution plan: [V3 Development Plan](../archive/web/V3_DEVELOPMENT_PLAN.md)

## Context

Earlier roadmap and handoff text anticipated completing production infrastructure and hosted acceptance for the current web application after V3, optionally following a visual redesign. That strategy changed: after V3 and a comprehensive UI/UX redesign, the product should move toward Windows desktop and Android applications. Most personal functionality should work offline with device-local data; selected synchronization and collaboration should remain online.

Completing production deployment/readiness for a web-first product is no longer aligned with that intended destination. The current application nevertheless provides the implemented, locally accepted V1/V2 business behavior, private workspace and group boundaries, data model, UI and verification infrastructure needed to develop V3. Replacing those foundations now would combine tracker delivery with an undesigned platform transition.

## Decision

### Current environment and release scope

Keep the existing web application, PostgreSQL persistence, authentication, scoped roles/RLS, worker and local verification infrastructure through V3 and the subsequent comprehensive UI/UX redesign. Do not implement offline support, mobile/desktop packaging or a replacement backend during V3. Current web production deployment and production-readiness completion are no longer planned; earlier promises of a web production release after V3 are superseded by this ADR.

V3 includes preset Learning, Books and Personal Tasks trackers; versioned template/field definitions; user-created templates/custom fields; text, number, date, checkbox and single-select fields; validated entries with immutable history; explicit safe migrations; reporting/statistics; internal Calendar/Agenda deadlines and appropriate reminders; and relevant onboarding/navigation, exports/portability, lifecycle, accessibility and security integration. Preserve the existing tracker model in [database Section 14](../DATABASE.md#14-trackers-and-template-evolution-t3). Trackers do not replace specialized Finance, Career or shared-expense authorities. Scripting, arbitrary formulas, general page builders, premature habits/streaks and unrelated feature expansion are outside this scope.

Organize V3 as four internal milestones: **V3-A — Tracker Foundation and Presets; V3-B — Custom Templates and Versioned Migrations; V3-C — Reporting, Calendar, and Cross-Domain Integration; V3-D — Consolidated Acceptance and Documentation**. Use two future implementation assignments: A/B with focused boundary tests, then C/D with one consolidated full applicable V1–V3 verification phase. Fewer complete verification cycles do not relax essential integrity or security checks.

### External calendar synchronization

Defer external calendar-provider synchronization until future platform architecture planning explicitly designs and approves it. Provider permissions, identity, synchronization direction, stable IDs, conflict resolution, echo suppression and deletion behavior depend on choices that may change with device-local data and multiple platforms. Implementing provider sync now would commit the project prematurely to the current web architecture.

Internal source-derived Calendar/Agenda integration and deadlines remain in V3. Existing opted-in notification infrastructure remains available under its established consent, privacy, freshness and replay controls; email delivery is not calendar synchronization. No new external provider configuration is required for documentation preparation.

### Future direction and deliberately postponed architecture

The approved direction is Windows desktop plus Android, with most personal features offline and device-local, and selected online synchronization/collaboration. Before that transition, reassess existing features, infrastructure and architecture. Features may later be changed or removed through explicit decisions; this ADR does not approve their removal now.

The following remain undecided and require a separate platform architecture plan and approval:

- Desktop runtime/packaging, including whether to use Tauri or any alternative.
- Android framework, native versus shared code, and boundaries of cross-platform reuse.
- Device-local database, including whether to use SQLite or any alternative, encryption and key management.
- Online backend/service/storage, including whether Firebase or any alternative is appropriate.
- Offline identity/authorization, account recovery and the division of local versus online features.
- Synchronization protocols, conflict handling, multi-device identity, collaboration consistency and external calendar providers.
- Migration of existing data/history, compatibility, backup/recovery/deletion behavior and platform-specific acceptance/distribution/update rules.

These examples are open questions, not selected technologies or instructions to replace existing components.

### Guarantees retained

Preserve data integrity, privacy, authorization and security throughout V3 and redesign. Server-owned identity and ownership checks, private workspace isolation, separate group authority, composite FKs and RLS, immutable history, validation, atomic transactions, idempotent/replay-safe commands and migration safety remain mandatory. Financial integer minor units, balanced journals, source authority, correction rules and existing V1/V2 business behavior remain unchanged.

Keep secure session/recovery behavior, sensitive-data protections, notification consent and current-source revalidation, safe exports/restoration, lifecycle/deletion-register reconciliation and truthful accessibility/failure states. The future offline intention never justifies weakening current protections.

Preserve historical acceptance evidence and human-configuration/production runbooks, including [V1 operations](../OPERATIONS_AND_RELEASE.md#v1-operations), [V2-H](../OPERATIONS_AND_RELEASE.md#v2-h-manual-setup-and-production-checklist) and [V2-I](../OPERATIONS_AND_RELEASE.md#v2-i-manual-setup-and-production-checklist). Their hosted/provider requirements remain conditional requirements if such operations are ever separately authorized. They are not prerequisites to this preparation or a new obligation to provision the current web product. Existing local build/container/restore checks can still supply engineering evidence without implying a deployment.

## Sequence and consequences

**V3 → Comprehensive UI/UX Redesign → Platform Architecture Planning → Windows/Android Development → Platform-Specific Acceptance**

The web environment supports the first two stages. Architecture planning must precede platform implementation; future delivery/acceptance requirements will follow the approved architecture rather than the old web launch sequence. Each later stage needs its own assignment. This documentation decision starts none of those implementation stages.

The project avoids spending on a superseded web launch and avoids designing synchronization twice, while retaining an established environment for tracker implementation and verification. Some existing infrastructure may be temporary and some features may need redesign; both are accepted planning consequences, not grounds for speculative rewrites now. Existing architecture/stack/operational guidance describes the current web baseline or historical conditional deployment requirements, not binding choices for the future platforms.
