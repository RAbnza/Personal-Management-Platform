# Salapiya — Product Revision and Windows/Android Migration Blueprint

**Tagline:** Your money, on your terms.  
**Name inspiration:** Salapi + Laya, as selected by the project owner.  
**Repository:** `RAbnza/Personal-Management-Platform`  
**Document version:** 1.0  
**Decision/documentation date:** October 19, 2026 (Asia/Manila)  
**Status:** Owner-approved product direction and launch scope; architectural baseline subject to the explicit technical gates in this document. No native implementation or platform acceptance is claimed.  
**Inspected web baseline:** `b721b0c6ef4c102a351e30df107b8f9b86ede588` — merged M6 redesign acceptance. Local HEAD and GitHub `main` matched when checked for this document.

## Contents

- [Authority and approval boundaries](#1-purpose-authority-and-approval-boundaries)
- [Product and users](#2-product-definition-and-intended-users)
- [Existing implementation](#3-verified-starting-point-and-reuse-strategy)
- [Launch feature inventory](#4-launch-feature-inventory-and-disposition)
- [Navigation and platform UX](#5-navigation-and-platform-experience)
- [Profiles and Google onboarding](#6-profiles-google-identity-and-onboarding)
- [Technology and architecture](#7-selected-technology-and-module-architecture)
- [Offline operation and synchronization](#8-offline-operation-authority-and-synchronization-contract)
- [Shared Expenses](#9-shared-expenses-identity-permissions-and-lifecycle)
- [Data and schema evolution](#10-data-model-integrity-and-schema-evolution)
- [Security and privacy](#11-security-privacy-and-lifecycle)
- [Files, imports and recovery](#12-files-imports-exports-and-backuprecovery)
- [Reminders and background execution](#13-calendar-reminders-and-background-execution)
- [Branding and assets](#14-branding-design-system-and-assets)
- [Repository migration](#15-repository-and-migration-organization)
- [Distribution and operations](#16-distribution-updates-and-operational-ownership)
- [Costs](#17-cost-and-service-sustainability)
- [Implementation stages and gates](#18-implementation-sequence-and-gates)
- [Acceptance criteria](#19-acceptance-criteria-and-test-strategy)
- [Risks](#20-risk-register-and-mitigation)
- [Decision register](#21-decision-register)
- [Deferred details and agent instructions](#22-deferred-decisions-and-future-agent-instructions)
- [References](#23-reference-index)
- [Completion record](#24-documentation-completion-record)

## 1. Purpose, authority, and approval boundaries

This is the approved planning blueprint for revising the existing application into Salapiya: a primarily financial personal-management application for Windows and Android, with offline operation, optional Google-connected synchronization, Shared Expenses, and a useful Life area.

The owner approved the revised scope after the discovery workshop and then replaced the previously considered name with **Salapiya**. The tagline is **Your money, on your terms.** The earlier name and earlier recommendations to delay advanced Money features are superseded. The repository name is not automatically changed by this product naming decision.

This document authorizes a documented direction, not immediate implementation, cloud provisioning, spending, deployment, destructive database work, or deletion of the existing application. Future engineering assignments should explicitly identify their milestone. A dependency gate is a requirement to produce evidence before proceeding; it is not evidence that the technology has already passed.

### 1.1 Relationship to existing documentation

Read this document together with:

- [Product vision and feature blueprint](reference/PROJECT_VISION_AND_FEATURE_BLUEPRINT.md).
- [System architecture](reference/SYSTEM_ARCHITECTURE.md).
- [Database architecture](reference/DATABASE_ARCHITECTURE.md).
- [Design system and visual guidelines](reference/DESIGN_SYSTEM_AND_VISUAL_GUIDELINES.md).
- [Original development handoff](reference/PROJECT_DEVELOPMENT_HANDOFF.md).
- [V2 development handoff](reference/V2_DEVELOPMENT_HANDOFF.md).
- [V3 development handoff](reference/V3_DEVELOPMENT_HANDOFF.md).
- [Platform-transition ADR 0005](reference/adr/0005-v3-scope-and-platform-transition.md).
- [M6 redesign acceptance](reference/REDESIGN_M6_ACCEPTANCE.md).

This blueprint supersedes the existing documents only for the future product name, replacement-platform direction, local/online identity, synchronization, navigation, approved launch/deferred scope, and explicitly described native adaptations. Existing financial meaning, ownership boundaries, correction evidence, and source-derived reporting remain authoritative unless a later approved decision explicitly changes them.

The existing web application remains governed by its current implementation contracts. This document does not make its PostgreSQL security, Better Auth, or server transaction boundaries optional before replacement.

Some older document introductions still say redesign milestones are unstarted. The newer M2–M6 records and actual merged implementation establish the current web state. Historical instructions to stop before later milestones are records of earlier assignments, not a reason to ignore the owner's newly approved planning scope.

### 1.2 Decision vocabulary

| Label | Meaning |
| --- | --- |
| Approved requirement | Explicit owner choice or recommendation accepted in the workshop. Preserve it unless the owner changes it. |
| Selected baseline, gated | Technology/architecture selected for planning; prove the named compatibility, correctness, and cost conditions before extensive implementation. |
| Proposed implementation detail | A concrete engineering starting point, not an independently approved product change. Resolve through design and evidence within the approved scope. |
| Deferred | Deliberately outside initial release; do not silently promote it into launch work. |
| Open gate | An unresolved technical/operational condition with an identified closure criterion. Do not invent a passing result. |

## 2. Product definition and intended users

Salapiya helps people record and understand their money, manage debts and cards, plan financial commitments, and settle shared expenses while keeping personal information under their control. Its Life area connects personal commitments, tasks, learning, reading, and job applications.

The initial users are the owner, their brothers, and potentially a small number of friends. The initial distribution is private. This is not a public SaaS launch, a payment service, a bank-connected aggregator, or a general no-code platform.

### 2.1 Approved product priorities

1. All existing implemented financial capabilities belong to the initial complete release.
2. Expense tracking, Shared Expenses, and Debts are central use cases.
3. Most ordinary work must function with no internet connection.
4. The same person's Windows and Android installations must synchronize private records as well as shared records when connected.
5. Each installation has one active local profile; no multi-profile switcher is planned.
6. Local profile creation does not require Google or a cloud account.
7. Google connection enables cross-device identity, synchronization, and collaboration.
8. Life must contain useful nonfinancial workflows at launch.
9. Core meaning and access to features remain consistent across Windows and Android; layouts and interactions adapt to each platform.
10. Prefer maintained tools and manageable operations for a solo developer. Small trusted groups do not justify weak data isolation or inaccurate financial synchronization.

Development may proceed in small vertical milestones and private test builds. An incomplete test build is not the completed launch release. Do not use milestone sequencing to silently remove advanced Money requirements.

### 2.2 Explicit exclusions

The initial scope does not add bank connections, payment execution, bank/provider credentials, full card numbers/CVV, automatic provider interest or settlement calculations, investments, FX/multicurrency accounting, standalone lending, in-transit transfers, refinancing, general shared workspaces, receipt OCR, AI advice, external calendar synchronization, or a public store/web launch. Existing implemented multiple-payer Shared Expenses must not be confused with deferred multiple-source funding for arbitrary private transactions.

## 3. Verified starting point and reuse strategy

The inspected web application is a Next.js/React/TypeScript modular monolith using PostgreSQL, Drizzle, Better Auth, scoped server transactions, row-level security, and background workers. Private startup depends on an authenticated server identity. Domain functions, services, repositories, and presentation are separated, but substantial behavior also resides in PostgreSQL constraints/functions/triggers.

V1 core finance/Career/Calendar, V2 financial maturity and sharing, V3 trackers, and the M1–M6 visual redesign are implemented. The V3 handoff records 125 declarative tables and 206 migrations through `0205`. The M6 record accounts for 71 page files, including the deliberately excluded design-proof route, and records acceptance with device/operational limitations. These are historical web facts, not native-platform capacity or correctness guarantees.

Selected code inspected includes `src/shared/money.ts`, `src/platform/db/scoped-transaction.ts`, `src/app/_lib/private-app-bootstrap.ts`, `src/modules/sharing/services/groups.ts`, `src/modules/sharing/services/operations.ts`, `src/modules/sharing/services/invitations.ts`, tracker presets, and the portability format/services. The existing sharing service enforces creator-only corrections and expected revisions. Settlements distinguish reported and confirmed states. Portable bundles explicitly exclude attachment bytes.

Reuse the business definitions, worked examples, test fixtures, financial acceptance scenarios, source relationships, and design principles. A Dart implementation will require porting rather than direct execution of TypeScript rules. PostgreSQL constraints cannot simply be copied into SQLite; existing database-specific guarantees need explicit replacement and fresh tests.

All current user records are disposable test data according to the owner. No legacy production-data conversion or backward-compatible web export importer is a launch requirement. Preserve the existing application and migration history as references; do not automatically purge test databases or rewrite old migration files.

## 4. Launch feature inventory and disposition

Every financial row below is a launch requirement. Later implementation must maintain a traceability checklist against the source documents and current code, including rejection rules and advanced cases, rather than treating screen labels as complete specifications.

### 4.1 Money, Debts, planning, and supporting workflows

| ID | Existing purpose/behavior | Approved disposition and required continuity |
| --- | --- | --- |
| M01 | Cash, wallet, checking, savings accounts; metadata, opening balances/cutoffs, archive/history | Retain; intuitive local setup, exact balances, owned receiving accounts, no editable independent balance. |
| M02 | Income, expenses, category splits, completed transfers, fees, categories and activity/history | Retain; quick ordinary entry, optional advanced details, exact split totals, transfers are not income/spending. |
| M03 | Corrections, refunds, reversals, negative-balance acknowledgements, reconciliation and adjustments | Retain; previews and evidence-preserving changes; acknowledge actual uncertainty; no silent history rewriting or balance resets. |
| M04 | Existing-debt import/setup and borrowing/net proceeds | Retain; distinguish opening liability, funds received, withheld fees, financed spending and income; unknown breakdowns remain explicit. |
| M05 | Debt payments, classifications, due allocations, schedule revisions and allocation mapping | Retain; exact cash/principal/interest/fee distinctions, preserved revisions and explicit dependent-record resolution. |
| M06 | Provider-confirmed early debt settlement, residual closure and adjustments | Retain; no guessed payoff calculator or hidden zeroing. Debt detail and payment evidence remain inspectable. |
| M07 | Credit-card metadata, purchases, payments, fees, interest, refunds, overpayment and utilization | Retain; available credit is not liquid money; purchases recognize spending and card payment does not count it again. |
| M08 | Statements, statement revisions/reconciliation, payment allocations and installment plans/applications | Retain all implemented workflows; no assumed minimum-payment satisfaction, inferred statement matching or provider interest rules. |
| M09 | Recurring income/bills/subscriptions, rule versions, occurrences, overrides/skips and explicit links to actuals | Retain; planning never posts money by itself; preserve logical dates, exact links and partial completion. |
| M10 | Category budgets, explicit periods, net/gross bases, comparisons and history | Retain; same-category overlap rules, zero-limit behavior, full-period labels and actual-spending definitions. |
| M11 | Savings goals, reservations, release/reallocation, progress and supported-funding ranges | Retain; reservations are not extra assets, transfers, or a guarantee that cash cannot be spent. |
| M12 | Read-only forecasts, source coverage, recorded future cash and hypothetical scenarios | Retain; distinguish actual/expected/hypothetical values and prevent recurring/card double counting. |
| M13 | Financial Overview, reports, charts, exact drilldowns, coverage and CSV export | Retain; local derivation from complete relevant data, explicit sync freshness and evidence links. |
| M14 | Financial supporting files and links to source records | Retain; private local files, controlled cloud upload/download, on-demand attachment availability and recovery coverage. |
| M15 | Reviewed CSV cash-history import, duplicate warnings, cutoff-safe posting and bounded processing | Retain supported formats; preserve existing limits/interpretation unless reviewed. Do not advertise generic bank/card/debt imports. |
| M16 | Financial reminders and Calendar projections | Retain source meaning; adapt delivery to local native notifications, with consent, stale-source cancellation and no balance changes. |
| M17 | Export, backup, restore, account/profile lifecycle, settings and help | Redesign for local/connected modes; self-contained recoverability, separate destructive actions and useful user guidance. |

Ordinary reading, entry, reporting, and local-only management must operate offline. Connected operations whose validity depends on another device's current state follow Section 8; a preview/draft may be offline even when finalization requires connectivity.

### 4.2 Shared Expenses

> **P6 private-release exception, approved by the owner on 28 October 2026:**
> M14 may launch with encrypted **device-local attachment bytes only** for this
> private release. Metadata can synchronize, but original bytes require independent
> protected backup and exact original reselection on another device. Standard
> portable archives exclude original bytes; local files remain unscanned.
> Controlled cloud-byte upload/download and production scanning remain future
> work, not certified availability. This exception does not waive lifecycle,
> recovery, signing, native accessibility or other release gates. See
> [P6 acceptance](salapiya/P6_PRIVATE_RELEASE_HANDOFF.md).

| ID | Existing capability | Launch treatment |
| --- | --- | --- |
| S01 | Groups, owner/member roles, manual/registered/deleted participants, invitations and membership intervals | Retain; replace web-account linkage with Google-connected identity and deliberate claims. |
| S02 | Single/multiple payers, selected participants, equal/exact custom shares | Retain; deterministic centavo remainder allocation and clear contribution/share previews. |
| S03 | Creator-only finalized bill revisions/corrections and historical views | Retain; conflict review and reasons, no owner power to silently rewrite another person's bill. |
| S04 | Group refunds and changed private source evidence | Retain; received-money allocation and consumed-share credits remain distinct and exact. |
| S05 | Full/custom/selected settlements, partial individual bills, multiple allocations and advances | Retain the complete implemented financial scope; put advanced allocation controls behind disclosure rather than defer them. |
| S06 | Pending, confirmed, disputed, cancelled and reversed settlement history | Retain; recipient confirmation and manual-confirmation limitations remain explicit. |
| S07 | Reciprocal netting, zero-sum balances, pairwise explanations and group suggestions | Retain; suggestions do not post money, promise a minimum transaction count, or authorize redirection of obligations. |
| S08 | Integrated Add Expense, existing-purchase conversion, cash/card/unpaid private adoption | Retain; explicit own-private authorization and no duplicate spending, cash movement, or card liability. |
| S09 | Private settlement/refund clearing, reclassification, retained-evidence review and coverage | Retain; synchronization must not overwrite accepted private facts automatically. |
| S10 | Group history/export, former-member entitlements, ownership/lifecycle handling and attention | Retain required history/privacy semantics; redesign online identity and native notifications as described below. |

Primary domain references: [Shared Expenses implementation](reference/v2/SHARED_EXPENSES_IMPLEMENTATION.md) and [Shared Expenses requirements](reference/v2/SHARED_EXPENSES_AND_SETTLEMENTS.md). The implementation record resolves stale earlier statements that multiple payers or advanced settlements are still future work.

### 4.3 Life and shared application foundations

| ID | Capability | Disposition |
| --- | --- | --- |
| L01 | Personal appointments/events, mixed Agenda/Calendar and reminders | Launch; real nonfinancial events as well as generated financial commitments. |
| L02 | Personal Tasks preset | Launch; entries, statuses, deadlines, completion/reopening, archive/history and reminders. |
| L03 | Learning and Books presets | Launch; useful typed records and basic current progress/list filtering. |
| L04 | Career applications, stages, interviews/assessments, follow-ups, notes and history | Launch essentials, including relevant supporting documents and Calendar links. |
| L05 | Advanced Career analytics | Deferred; essentials do not require the full historical analytics surface. |
| L06 | Custom tracker template editor, arbitrary supported fields and reviewed template migrations | Deferred UI/workflows; keep stable preset identities and version-readable history so later evolution is safe. |
| L07 | Advanced tracker reports/customization | Deferred; simple preset progress can launch without reproducing all V3 analysis. |
| F01 | Theme, navigation preferences, onboarding, search, help and accessibility | Launch; adapt to native input and local data. Hiding a module does not delete data or silently disable reminders. |
| F02 | Web registration/password verification/reset and web sessions | Replace with optional Google connection plus native device/session management; no separate Salapiya password required initially. |
| F03 | Scheduled external email reminders and current web worker topology | Replace initial reminder channel with device-local delivery. External email/push delivery is not a launch dependency; financial source/reminder behavior remains required. |
| F04 | Web production deployment, hosted web readiness and disposable web-data conversion | Not part of this migration. Native/cloud-service operational checks remain required before real use. |

### 4.4 Financial semantic details that must survive simplification

- Launch currency remains PHP; preserving currency fields does not implement exchange rates or mixed-currency totals.
- Financial amounts use exact integer minor units and lossless boundaries. Avoid floating-point monetary calculations or lossy JSON numbers. Aggregate ranges and SQLite/driver conversion must be proved, not assumed.
- An opening cutoff is through the end of its accounting date; subsequent activity and historical import must not count the baseline twice.
- Budgets compare actual recognized category spending; recurring expectations do not consume a budget by being scheduled.
- Savings reservations cannot include credit limits, future-dated cash, expected salary, debt balances or forecast values. Underfunding remains visible without choosing an arbitrary winning goal.
- Forecasts remain read-only. Their current supported automatic sources are not expanded to every debt installment merely because Debts is prominent; explicit assumptions and source coverage remain necessary.
- Civil dates remain dates. Timed events retain UTC instants and IANA timezone context. DST ambiguity, recurrence month-end rules, exclusive period ends and backdated corrections need explicit tests.
- Ordinary recurring records link to eligible actual income/purchases; they do not automatically infer card payments, debt payments, or settlement allocations.
- Correction dependencies, unknown debt classifications, provider-confirmed card facts and incomplete coverage must remain honest. Simpler screens do not authorize invented values.

## 5. Navigation and platform experience

The approved primary destinations are **Overview, Money, Debts, Shared Expenses, and Life**. Settings, backup/sync status and help are accessible without adding competing primary destinations.

| Destination | Content and priority |
| --- | --- |
| Overview | Upcoming debt/card commitments, recent money activity, group confirmations/review needs, tasks/events and data freshness. Exact financial summaries link to their sources. |
| Money | Accounts, transactions, cards/statements/installments, recurring obligations, budgets, savings, forecasts and reports. |
| Debts | Prominent independent navigation into the existing specialized finance domain: borrowing, imported debts, balances, schedules, payments and settlement. No second debt ledger. |
| Shared Expenses | Groups, people, bills, payments, explanations and private-effect review. Group and private scope are visually distinct. |
| Life | Calendar/Agenda, Personal Tasks, Career essentials, Learning and Books. This label is navigation, not a generic replacement data model. |

### 5.1 Windows

Use resizable layouts, keyboard shortcuts, predictable Tab order, visible focus, searchable lists, aligned numeric tables, list/detail views where useful, native file selection, and explicit close behavior for unsaved work. Dense workflows such as statements, allocation review and reports can use more screen space. Do not require mouse-only hover interactions. A navigation rail/sidebar or suitable dock can be selected through design proof; the web dock geometry is not binding on the native product.

### 5.2 Android

Use compact primary navigation, readable touch targets, system Back/predictive-back behavior where supported, safe-area and keyboard-inset handling, accessible sheets/full-screen forms, share/file pickers, and quick expense capture. Complex debt/card/settlement functions remain available through focused steps, not removed because a phone screen is smaller.

### 5.3 Shared experience requirements

- Match business capabilities and record meaning, not pixel-identical screens.
- Preserve drafts safely through navigation, backgrounding and process termination where practicable; a draft is not a posted action.
- Use task-focused financial forms: essential fields first, advanced funding/splits/allocations on demand.
- Show truthful saved/synced/confirmed states without technical queue terminology in ordinary flows.
- Reports disclose filters, dates, coverage, pending local effects and last synchronized state when relevant.
- Offer light/dark/system theme, text scaling, screen-reader labels, reduced motion and non-color status cues.
- Never label incomplete downloaded data as an empty account, zero balance, or complete report.

## 6. Profiles, Google identity, and onboarding

### 6.1 Identity model

Keep these concepts separate: local profile, remote account, device installation, financial account, group, group participant, and membership. A Google identity is mapped by the authenticated provider/Supabase identity, not by trusting a user-entered email or matching display names.

One remote Salapiya account owns one private profile. The profile can have multiple registered installations. One installation has one active profile and no routine profile switcher. Separate OS user contexts may have separate installations/data directories; an app profile is not a replacement for OS account isolation.

A purely local profile uses a stable local identifier and needs no network request or anonymous Supabase session. When connected, its ownership relationship is established through a trusted, explicit enrollment transaction. Identifiers can be preserved where valid, but the server must validate the graph and ownership; possession of an arbitrary profile UUID proves nothing.

### 6.2 First-run choices

1. **Create a local profile:** choose a display name and initial preferences, create the local database, and start without network access. Module/account setup is progressive.
2. **Continue with Google:** authenticate online. Retrieve the existing profile if present; otherwise create a connected profile. Do not force a disposable local profile first.
3. **Restore from backup:** validate a backup and preview its identity, coverage, dates and consequences before activating it. A backup does not itself confer current group membership.

Google is the selected initial online sign-in method. Additional providers, passkeys and a separate Salapiya password flow are deferred. Local app locking is a separate device security feature.

### 6.3 Connect an existing local profile

The user selects **Connect Google account** and is shown the account and the fact that enabling sync uploads private records to Salapiya's services. Successful Google authentication establishes identity, not completed data transfer.

Use a resumable, idempotent enrollment/import operation. Validate source identities, references, money totals, versions, ownership and quotas; stage incomplete data so other devices cannot see a partially valid financial graph. Keep an enrollment receipt/checkpoint and recover from interruption without another opening balance or duplicated actions. Either freeze affected writes briefly during final publication or catch up a durable local command tail; select and prove the mechanism in Gate G2.

If the account already owns a cloud profile and the device holds a different populated local profile, do not merge or overwrite silently. Initial behavior is to preserve/export the local profile and explicitly switch to the existing cloud profile after confirmation. Full two-profile financial merge is deferred. Cancel must leave local records intact. Simultaneous enrollment attempts must resolve the one-profile-per-account constraint safely.

### 6.4 Retrieve a profile on another device

Authenticate using the same Google account, select the existing profile implicitly through that account, download a consistent usable dataset, and indicate initial-sync progress. No manual matching by name/email and no need for both devices to be online together. Android must upload a new record before Windows can receive it.

Enable complete financial views only when their required snapshot is available. Attachments may remain explicitly online-only until downloaded. Once initialized, local access remains available offline; expired online tokens pause synchronization rather than destroying or hiding private local records. Reauthentication is required before new remote access resumes.

### 6.5 Google configuration

Use supported Supabase/Google libraries and the platform-supported browser/native flow. Configure a Google Cloud project, OAuth clients, consent/audience settings, Android application/signing configuration, Supabase callback URLs and allowlisted return-to-app URLs. Use the system browser/appropriate native sign-in and PKCE where applicable; do not collect Google passwords or embed OAuth client secrets in distributed binaries. Handle cancellation, wrong-account choice and interrupted callbacks.

Request only basic identity scopes. Gmail, Drive and Calendar access are unnecessary. Google identifies the user; it does not store the Salapiya dataset or perform synchronization. Branding/audience verification requirements are checked during setup; private distribution does not exempt the application from OAuth policies. Basic identity support and platform setup are documented by [Supabase Google sign-in](https://supabase.com/docs/guides/auth/social-login/auth-google) and [Google OAuth app states](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview).

### 6.6 Sign-out, disconnect, device loss and account changes

Define separate actions for pausing sync, locking the app, signing out/removing a device, deleting local data and deleting the cloud account. Before removing local access, disclose unsynchronized commands and offer backup; no routine sign-out silently discards them. Private app lock can reopen an existing local profile without contacting Google.

Google recovery restores access to the identity; downloading from Salapiya restores only successfully synchronized data. Unsynced data requires a surviving device or backup. Revoking a device blocks future authorized cloud access but cannot erase data from a disconnected or copied device. Do not promise remote wipe.

Changing the connected Google account or recovering into a different identity is not a simple display-name edit. Defer automatic reassignment; require an explicit reviewed recovery/transfer design. Retain a documented backup route and explain this limitation before real use.

## 7. Selected technology and module architecture

### 7.1 Baseline and rationale

| Area | Selected baseline | Reason and limits |
| --- | --- | --- |
| Applications | Flutter/Dart, one shared product codebase | Owner accepts rewriting; prioritize desktop/mobile product behavior. Platform adapters and adaptive UI are still necessary. |
| Local data | SQLite via the validated Flutter/PowerSync-compatible storage stack | Durable transactions, local reads and offline work. Encryption, exact types, schema constraints and upgrade behavior require proof. |
| Remote identity | Supabase Auth with Google | Standard recoverable identity for sync/groups; not required for local-only use. |
| Remote data | Managed Supabase PostgreSQL | Fits relational financial/group rules and transactional validation better than a document-model rewrite. |
| Sync infrastructure | PowerSync | Reuse transport/local replication infrastructure; custom authorization, financial commands and conflict resolution remain necessary. |
| Files | Private object storage with local download cache | Keep file transfer separate from small structured-record synchronization. Provider configuration/scanning is gated. |
| Business rules | Shared pure Dart domain code within both clients; validated remote command implementation | Local responsiveness plus independently enforced remote integrity. Cross-language parity needs fixtures, not assumptions. |

Flutter supports Windows and Android; this is not a promise that every plugin supports every target. See [Flutter platforms](https://docs.flutter.dev/reference/supported-platforms), [Supabase Flutter](https://supabase.com/docs/guides/getting-started/quickstarts/flutter), and the publisher's [PowerSync package](https://pub.dev/packages/powersync). Pin tested compatible versions when Gate G0 is executed; do not use the web repository's version numbers as native dependency selections.

### 7.2 Application boundaries

Use a modular application with presentation, application commands/queries, pure domain rules, repositories and platform adapters. Keep Money, Debts/Cards, Planning, Sharing, Career, Time, Trackers, Profile/Sync and Files/Recovery coherent without premature microservices.

UI state is transient. The local database owns persisted records, durable drafts and pending commands. State-management libraries coordinate views; they are not a second financial authority. Use reactive local queries and bounded results. Select one primary state-management and routing approach during G0, rather than introducing competing frameworks. Candidate categories include Riverpod-style state coordination and maintained declarative routing; exact packages/versions are not independently approved by this blueprint.

The server authenticates each request, checks ownership/membership and versions, then executes a complete domain command in one transaction. Prefer a narrow application-command surface, such as validated PostgreSQL RPC with a small API layer where needed. Do not expose arbitrary ledger writes to clients. Least-privilege database grants, API checks and sync filtering are all required; service-role secrets remain server-side.

### 7.3 What is not automatically portable

Next.js server rendering, browser sessions, raw PostgreSQL functions, RLS, lock semantics, deferred trigger behavior, pg-boss jobs and S3/ClamAV infrastructure do not become native capabilities by changing UI frameworks. Identify the replacement for every invariant and side effect.

SQLite local transactional checks and the controlled command layer protect against application bugs; an owner with full control of their device can modify local files. The service must treat uploaded data as untrusted and enforce shared/remote rules independently. Local tampering cannot grant access to another person's records.

### 7.4 Alternatives considered

Tauri/React offers stronger direct reuse of the web UI/domain language and remains a fallback if Flutter's critical integrations fail. The owner's acceptance of a substantial rewrite shifted the preference toward Flutter; no measured performance superiority is claimed. Tauri's documented Next.js path requires static export, so the current server application is not a drop-in package. [Tauri Next.js integration](https://v2.tauri.app/start/frontend/nextjs/).

Firestore has useful offline caching, but documented last-write-wins updates and offline transaction limitations do not supply this application's relational financial guarantees. It is not selected as the primary data model. [Firestore offline data](https://firebase.google.com/docs/firestore/manage-data/enable-offline), [transactions](https://firebase.google.com/docs/firestore/manage-data/transactions).

Fully separate native clients increase solo-developer maintenance. Peer-hosted synchronization makes availability depend on personal devices and complicates recovery. Self-hosting is a possible later cost trade-off, not an assumed free or lower-maintenance default.

## 8. Offline operation, authority and synchronization contract

### 8.1 Authority by mode

| Mode/data | Authority and user experience |
| --- | --- |
| Local-only private profile | Local transactional data is authoritative. All launch personal functions must be usable without a backend, including advanced local management. |
| Connected private profile | PostgreSQL holds the accepted cross-device record. Each device reads local accepted data plus explicitly pending local work. Local saves remain durable before service acceptance. |
| Shared group | Service holds accepted group history/membership; local copies and pending commands support offline reading/capture. No device is the group server. |
| Derived values | Rebuildable projections of applicable authoritative records; never independently edited balances or totals. |
| Attachments | Metadata and transfer status are distinct from actual bytes available on a device. |

This is a local-first interaction model with server-authoritative reconciliation for synchronized data, not a promise of simultaneous global consistency while offline. PowerSync documents that conflict handling and idempotent backend writes remain application responsibilities. [PowerSync conflict handling](https://docs.powersync.com/handling-writes/handling-update-conflicts).

### 8.2 Operational availability

| Workflow | Offline behavior | Online requirement |
| --- | --- | --- |
| Startup, local creation, private reads/search, downloaded history | Available without sign-in refresh | None |
| Ordinary income, expense, transfer, new bill and payment report | Validate and durably save local work; connected effects are pending until accepted | Sync/revalidation for cross-device/group acceptance |
| Reports and forecasts | Calculate over available complete local data with freshness/pending labels | Refresh for newer remote changes |
| Complex debt/card closure, schedule replacement, allocation/correction or capacity-dependent actions | Full local operation in local-only mode; connected mode permits review/draft | Online finalization can be required where stale concurrent state makes acceptance unsafe |
| Google enrollment, another-device retrieval, invitation acceptance, membership/ownership changes | Explain connection requirement; preserve user input | Required |
| Local reminders and downloaded file access | Available subject to OS scheduling/files present | None |
| Undownloaded files, remote updates and cloud recovery | Show explicit availability/status | Required |

Gate G3 must produce a command-by-command availability matrix for all M/S rows. Keep ordinary recording offline; do not use this exception to turn the entire finance module into an online-only application. Advanced offline finalization can be expanded after its invariants are proved.

### 8.3 Durable command processing

Proposed implementation contract, to be proved against the selected SDK:

1. A user action is validated with exact domain rules and assigned a stable command ID, schema version, device identity, expected record/source versions, and payload digest.
2. Commit pending intent and the local representation needed to display it atomically. A power loss must not leave an unexplained balance change without a recoverable command.
3. Upload a whole domain command through an authenticated endpoint. Do not treat independently replicated ledger rows as authorization to post money.
4. The server verifies current authority, dependencies and versions, then atomically records the accepted action, journal/evidence, audit and idempotent receipt, or returns a structured rejection/conflict.
5. Same command ID and same normalized payload returns its prior result. Same ID with a different payload fails. Use stable IDs and dependencies, not device clock order, to identify actions.
6. Reconcile the receipt and downloaded accepted state without displaying the accepted action and its pending projection twice. An upload acknowledgement and completed download checkpoint are different events.
7. Temporary failures retry with bounded backoff. Permanent validation/authority conflicts move to an inspectable review state; they must not stall all unrelated uploads indefinitely.
8. Preserve rejected intent and genuine private money evidence. Correction/retry creates explicit subsequent intent where necessary; never mark a rejected command synced or repeatedly resubmit an invalid payload under new IDs.

PowerSync's exact queue/transaction/checkpoint behavior and local-only table support must be tested. A bounded command adapter/pending projection is acceptable application work; building a second general-purpose synchronization engine is not the default. Download-only accepted financial tables plus local pending command records are a proposed approach, not a validated SDK guarantee.

### 8.4 Conflicts and duplicates

| Situation | Required behavior |
| --- | --- |
| Two distinct expenses recorded on separate devices | Preserve both if independently valid; no balance-row overwrite. |
| Same submitted command retried after response loss | Return original outcome without a second economic effect. |
| Same real-world purchase manually entered twice under different IDs | Offer duplicate detection/review; idempotency alone cannot establish that they are the same purchase. |
| Concurrent correction of one bill/action | Expected-version rejection and comparison/review; no last-write-wins amounts. |
| Two payments consume the same remaining liability/allocation capacity | Serialize server validation; reject/hold incompatible intent; preserve evidence of an actual payment for reviewed classification. |
| New expense makes another device's savings reservation underfunded | Keep real expense and explain shortfall; never fabricate cash or delete a reservation silently. |
| Record archived/deleted remotely while offline edits exist | Enforce current allowed transition, preserve draft/conflict; no automatic resurrection. |
| Member removed before an offline command uploads | Recheck current membership and deny new group writes; local private evidence remains available. |
| Unrelated new bill advances group state | Avoid rejecting all independent creates solely because a global version changed; validate the actual affected dependencies. Scope version changes carefully. |

Do not auto-merge monetary fields, posted journals, settlement transitions, schedule versions, or provider facts. For nonfinancial entries, default to explicit record-version conflicts first; field-level merging is an optional later improvement.

### 8.5 Read consistency and user-facing status

Provide a consistent accepted snapshot for financial reporting and distinguish any overlay of local pending entries. Show last successful sync, pending count and actionable review failures in a dedicated Sync area. Ordinary screens need concise labels rather than implementation detail.

**Saved on this device** means durable locally. **Synced** means accepted and reconciled to the applicable service checkpoint. **Waiting for connection** means pending transfer. **Needs review** means user action is needed. For settlements, **Confirmed by recipient** is a separate business state; a synced pending settlement is not a confirmed payment receipt.

Download histories sufficient for required local calculations; pagination cannot silently turn visible-page sums into account/group totals. Supported capacity bounds must be disclosed and validated. A missing initial history blocks a complete-balance claim, not unrelated features.

## 9. Shared Expenses identity, permissions and lifecycle

### 9.1 Group participation

An online-connected identity is required to create/join synchronized groups. Local-only users may keep private records but do not receive shared membership through a display name. A user can be a member of multiple groups. Their devices act as the same member; they are not additional people or payers.

Group owners administer membership, not infrastructure. The service remains available when the owner's phone/computer is off. Losing a device does not transfer ownership; recover the account or use an explicit online ownership transfer.

### 9.2 Permission baseline

| Action | Authority |
| --- | --- |
| Read current group records | Active members, subject to defined history rules |
| Create bill with one/multiple payers | Active members |
| Correct own bill | Creator, current revision, reason and applicable dependency checks |
| Correct someone else's bill | Not silently permitted; request correction/dispute; exceptional administrative handling requires a separately designed attributed workflow |
| Report own settlement | Active payer with valid recipient/source references |
| Confirm/dispute receipt | Registered recipient; never inferred from successful sync |
| Manual recipient confirmation | Owner with explicit manual/unverified limitation; retain historical evidence after later identity claim |
| Invite/remove members, manage group, transfer ownership | Owner, online, current permission and reviewed action |
| Mutate another person's private ledger | Never granted by group role |
| Delete published financial facts | Use allowed versioned corrections/reversals; lifecycle removal is separately reviewed |

Offline bill submission is automatically validated by the service; there is no new owner approval queue for every ordinary bill.

### 9.3 Invitations and manual participants

Retain short-lived, single-use, revocable invitation tokens, hash-only storage and explicit acceptance of history visibility. Seven days is the inherited starting lifetime, configurable only through a deliberate policy change. Prefer a token bound to a verified target identity/email obtained through authentication; possession of an invitation URL alone must not silently claim an existing participant. Do not build a searchable public user directory.

Links must work through an installed-app callback or a clear manual invite-code path, including when the application was not installed at first click. Deep-link routing is part of platform acceptance. No automatic invitation-email service is required; secure copy/share is sufficient initially.

Manual participants remain available. Claiming one requires an explicit owner-approved nomination and the recipient's authenticated acceptance/review. Never match by name automatically. Preserve old manual-confirmation labels after a real person claims that participant.

### 9.4 Settlements, corrections, refunds and private effects

Payer contributions and participant shares each equal the bill total exactly. Confirmed participant positions sum to zero. Pending/disputed settlements affect only labelled projections. Suggestions do not create financial movements. Preserve source caps, exact selected-bill allocations, advances and correction/refund histories.

A private financial action and remote group acceptance cannot be one cross-device database transaction. Preserve the independent actual-money record, durable group intent, and explicit link/review state. If group acceptance fails, the actual expenditure remains; the user can correct sharing or retain private evidence. Group corrections cannot silently rewrite previously adopted private costs/funding.

Likewise, reporting a private settlement may record actual cash once in clearing. Recipient confirmation classifies accepted coverage; it never deducts cash again. Reversal of group confirmation is not proof that money was physically returned. New group refunds must distinguish who received money and whose consumed share is reduced.

### 9.5 Exit, removal and owner loss

Retain the existing distinction between historical entitlements and new membership access. Former members may see the records entitled at exit, their relevant later corrections and permitted settlement resolution; they do not gain unrelated subsequent bills. Synchronization subscriptions must implement this precisely, not just query every record in any group a person once joined.

Removal stops new authorized group writes when the service processes them. Cached/downloaded data cannot be reliably recalled. Member removal is not debt cancellation. Account deletion pseudonymizes/detaches identity as appropriate while retaining legitimate shared financial evidence under the declared policy.

Support explicit ownership transfer. A lost device alone is solved through identity recovery. If ownership is permanently unavailable, freeze owner-only administration and use the documented recovery/archive policy; do not invent peer takeover. If deletion would leave a group ownerless, follow an explicit transfer-or-archive outcome, preserving access to entitled history. The exact administrative recovery policy is an operational gate.

## 10. Data model, integrity and schema evolution

Retain specialized financial actions, immutable revisions, journals/postings, debt/card details, planning records and group facts. Reports/Calendar are derived views. Do not flatten the application into a generic tracker database or adopt full event-sourcing as a requirement solely because some history is immutable.

Proposed cross-platform records need stable UUID-style identities, owner scope, current version/predecessor where applicable, civil/effective dates, authoritative server receipt time for synchronized acceptance, device provenance, command references and archive/tombstone state. Device wall clocks never decide financial conflict winners or confer membership.

Local tables, server tables and sync transport schema may differ. Document their mapping and which fields are writable or derived. Define deletion markers and retention so an old offline device cannot recreate deleted records during resync. Do not purge receipts/tombstones while they are needed for supported retry and stale-device behavior.

Required transaction units include the entire financial action/journal/evidence, complete settlement allocation/state transition, complete local intent/receipt update and explicit import batches. Test failures between intermediate writes. PostgreSQL RLS and triggers remain defense in depth for the backend; configure replication access and sync streams independently because replication must not be assumed to apply client RLS automatically.

Use separate version numbers for local database schema, server schema, sync protocol/command payload, backup format, and domain calculation definitions. Record compatible ranges. Server changes should allow a deliberate client upgrade window. Unsupported clients retain safe local read/export where possible while unsafe writes are blocked with a recovery path. Never solve incompatibility by silently deleting a database and downloading over unsynced work.

Use reviewed forward migrations, pre-upgrade backup where appropriate, transactional migration where supported, and recovery from interruption. Binary rollback is not automatically safe after a database migration; pair installers with schema compatibility and a tested restoration plan. Preset tracker definitions must remain version-readable even before a custom editor exists.

## 11. Security, privacy and lifecycle

The approved security posture is practical baseline protection, not an enterprise control program. It includes strict ownership, secure authentication, encrypted transport, protected credentials, appropriate local storage protection, auditable financial transitions and recoverability.

End-to-end encryption is not a first-release requirement. Authorized infrastructure administrators may technically access cloud-stored private/group data; disclose this. Group members cannot access each other's private records. Enabling synchronization uploads the private dataset to the selected services, so this product is not described as device-only once connected.

Select maintained encryption and OS credential-storage facilities; do not invent cryptography or derive a database key directly from a short PIN. Validate the chosen SQLite encryption path on both platforms. Protect attachment bytes, temporary exports and logs as well as database files. Optional biometric/system app lock is a convenience/access control separate from encryption and recovery. Secure database/backup key handling is Gate G4, not an assumed property of SQLite or PowerSync.

Authenticate and authorize all commands, file requests and subscription scopes. Never ship service-role, database-owner, signing or OAuth client secrets in apps. Use bounded validation, least-privilege grants, rate/size limits, current membership checks, safe local file paths and external link handling. Financial values, notes, tokens, invite secrets and attachment contents do not belong in telemetry.

Separate local-profile removal, device revocation, cloud-account deletion and leaving a group. Consequential actions show what is removed, what remains shared, unsynced data at risk and recovery availability. Cloud deletion requires online authentication and revalidation; local-only deletion remains possible offline with explicit confirmation. A locally queued delete is not globally completed deletion.

Define retained-backup and shared-history handling before real use. Do not promise immediate erasure from old backups or other members' downloads. Restoration must reapply account deletion/revocation decisions rather than revive unauthorized access. No advertising or behavioral analytics is required for the private pilot; any diagnostic upload is explicit and redacted.

## 12. Files, imports, exports and backup/recovery

### 12.1 Attachments

Retain private source-linked supporting files; group membership does not make a privately linked receipt or funding account public. Initial allowed formats and bounds can inherit PDF/JPEG/PNG and the reviewed web limits, but confirm them against local/cloud capacity before release. Metadata availability is not byte availability.

Validate actual size/type/checksum, authorize both upload/download, use opaque private object keys and bounded resumable transfer, and maintain pending/available/rejected/deleting states. Decide the native preview/scanning strategy explicitly. Do not silently drop existing upload-safety controls or represent unscanned files as verified safe. No active document execution. Prefer platform viewers or sandboxed supported rendering. A real scanner/storage path must be validated before shared cloud file use; local test adapters are not evidence.

Track local-only, uploading, cloud-available, downloaded and failed status. Cloud uploads survive app restarts; a failed file does not hold up unrelated structured transactions. Cloud-backed attachments can be downloaded on demand or marked keep offline. Retain recoverable local bytes until transfer outcome is known. Explicit deletion and orphan cleanup must not remove another source's evidence.

### 12.2 CSV and portable exports

Preserve the implemented reviewed cash-history CSV contract: explicit columns/date format/account/currency/cutoff, duplicate warnings, preview, confirmation, bounded batches and permanent recognized-row provenance. Existing support is income/expense cash history, not arbitrary provider ingestion. Rebase historical opening and selected historical rows atomically with an exact coverage equation.

CSV reports are readable exports, not a full backup. Generate formula-safe cells and accurate period/source/freshness metadata. Do not expose private rows through group exports.

### 12.3 New Salapiya backup contract

Design a versioned, encrypted, portable archive containing private records and history, the definitions required to interpret them, a manifest with checksums/counts/currency/schema versions, and clearly declared attachment coverage. Offer a self-contained attachment-inclusive backup; if an export excludes undownloaded files, state the exact omission. Backups must be recoverable on a different compatible device using a user-controlled recovery secret rather than a key available only on the lost device.

Do not export reusable online credentials, OAuth tokens or private server secrets. Include pending work only under an explicit format that cannot blindly replay already accepted commands. Preserve immutable command IDs and import provenance. A backup's group snapshot is historical evidence, not current group authority or an invitation to overwrite group data.

Use local rolling snapshots for quick recovery plus user-directed portable exports to a separate location. Explain that a backup on the same lost device is insufficient. Cloud synchronization is not backup because it can propagate mistakes; hosted recovery and user archives have different purposes. Retention and storage limits are operational decisions to document before real use.

### 12.4 Restore modes

- **Local recovery:** validate, preview and restore private data into a safe local profile, with explicit treatment of attachment coverage and pending work.
- **Connected-device recovery:** sign in, reconcile existing cloud state and original receipts, then restore only supported missing/private intent through reviewed commands. An older backup cannot blindly replace accepted newer history.
- **Historical inspection/export:** permit reading an old private snapshot without making it the current connected dataset where useful.

A full connected-profile rollback is destructive and must be separately designed; no generic overwrite-cloud button is implied. Test corrupted/truncated archives, wrong passphrases, unknown schemas, wrong-owner data, huge/deeply nested inputs, path traversal in archives, missing bytes, and restoration after credential revocation or account deletion.

## 13. Calendar, reminders and background execution

Calendar entries from debts, cards, recurring obligations, Career and trackers remain projections of their authoritative records. Editing a projected deadline opens the source; do not create an independently editable duplicate. Source IDs, occurrence identity and generation/version handle updates, completion, archive and reminders.

Use local native notifications for launch. Notification permission is optional and does not block records. Store reminder intent durably, reconcile scheduled notifications after restart/reboot/timezone changes as supported, respect quiet hours, and cancel obsolete generations. Hide sensitive content by default on lock screens. Reminder dismissal is not debt payment or task completion.

Each device has its own delivery permissions/settings. A connected profile may receive reminders on both devices unless the user disables delivery on one; do not promise global exactly-once notifications while devices are offline. Financial data and relevant reminder definitions can sync, while local scheduling IDs/permissions remain device-specific.

Sync on app opening/resume and while active; offer Sync now. Background attempts are best effort under platform constraints and must never be the only path to progress. Android restricts background work and WorkManager observes power/constraint scheduling; precise alarms need a separate justified platform design. [Android persistent work](https://developer.android.com/develop/background-work/background-tasks/persistent).

New group activity is refreshed through synchronization; remote push/email alerts are deferred unless explicitly selected later. Existing opted-in web email notification infrastructure is not carried over as a mandatory native service. No stale reminder delivery is assumed recallable after it has been shown.

## 14. Branding, design system and assets

### 14.1 Approved identity

Use **Salapiya** consistently for application titles, onboarding, installer labels, help and future release notes. Use **Your money, on your terms.** as the tagline where helpful, especially onboarding/about. Life remains part of the product despite the financial emphasis. The owner selected the name; trademark/domain/store availability has not been researched or certified by this document.

Do not automatically rename the GitHub repository, old migration identifiers, historical documents, or API namespaces. Choose stable package/application IDs before first signed distribution; these are technical identifiers and should not depend on an unverified domain.

### 14.2 Visual direction

Carry forward the approved Porcelain light and Midnight Spectrum dark direction, restrained violet/lavender identity, Geist typography where licensing/packaging and rendering are suitable, semantic chart/status colors and readable financial density. Map these into Flutter theme tokens rather than duplicating arbitrary colors per screen. Validate contrast and text scaling in native widgets. The web dock is inspiration, not a requirement to reproduce browser interaction on Android/Windows.

The visual personality is calm, capable and personal. No shame-based overdue copy, money confetti, animated balances or delays before a user can record an expense. Use platform-correct input, selection, focus and feedback within a coherent brand.

### 14.3 Asset register

| Asset | Plan |
| --- | --- |
| Logo/wordmark | Not finalized and not generated. Later explore a simple mark suggesting agency/freedom without requiring a coin or bank symbol. |
| Windows icon / Android adaptive and themed icon | Create from the approved mark later; include correct masks/layers/scales and verify small-size readability on both themes. |
| Splash/launch | Minimal platform launch screen; no blocking animation or artificial delay. |
| Functional icons | Use a maintained, licensed icon set with consistent weights and accessible labels; evaluate Flutter availability before selecting a package. |
| Onboarding/empty states | Clear text and an action first; optional small original illustrations only where they aid comprehension. |
| Offline/sync/conflict feedback | Text plus icon and appropriate status color; finite progress where measurable, honest indeterminate state otherwise. |
| Charts | Mature accessible chart tools, exact values/table alternatives, meaningful legends and filters; no financial rounding hidden by graphics. |
| Motion | Short purposeful transitions, reduced-motion support, no animated backgrounds or startup intro. |
| Lottie/Rive | Optional later; add only for a specific benefit and measured performance. Neither is a required dependency. |
| Generated imagery | Optional illustration exploration after approval; never rely on generated text/logo details as final production assets without review. |

Bundle required fonts/icons/assets for offline startup. Maintain attribution/licenses and source files. Profile illustrations, large animations and blur-heavy effects are not launch requirements. Test on the user's lower-capability devices rather than equating a powerful development machine with acceptable performance.

## 15. Repository and migration organization

Continue in `RAbnza/Personal-Management-Platform`. Preserve the accepted web baseline and its tests/docs as an executable reference. Do not dismantle the web app at the start or maintain two competing product roadmaps indefinitely.

A proposed structure is a new `apps/salapiya/` Flutter application, a bounded backend area such as `services/salapiya/` or documented Supabase functions/migrations, reusable cross-language fixtures under `contracts/`, and existing authoritative documents under `docs/`. This is a starting suggestion, not permission to move current files. Inspect repository tooling and decide exact paths in G0.

Create a fresh native/local schema and deliberately mapped remote schema. Do not replay all web migrations inside SQLite. Reuse appropriate PostgreSQL logic only after reviewing its dependence on Better Auth/web workspace identities, privileged roles and old lifecycle machinery. Port semantic fixtures into Dart and backend tests; do not mechanically reuse web UI tests as native acceptance.

No real legacy data migration is required. Create synthetic seed data and purposeful edge fixtures. Any cleaning/resetting of the old test environment remains a separate explicit action. New Salapiya schema upgrades and backup compatibility become required as soon as real pilot data exists.

Before implementation begins, add narrowly scoped pointers/ADRs to the current handoff and architecture documents to avoid future agents following stale status text. This blueprint alone does not rewrite those historical records. Do not rename the repository or publish changes without a corresponding assignment.

## 16. Distribution, updates and operational ownership

Initial distribution is a signed Windows installer and signed Android private build. Public Microsoft Store/Google Play listing is deferred. Select installer/update tooling during G5 based on supported Windows versions, Android devices and plugin requirements. Minimum OS versions and CPU architectures remain unverified until the real device inventory is collected; official framework support is only an upper bound on what the whole dependency stack can support.

Protect and back up signing keys. Retain stable application IDs/signatures so updates replace the intended installation and preserve data. Provide a visible version/build and a simple private release channel. Manual installation of signed updates is acceptable initially; do not build a custom updater before demonstrating a need. Verify update packages and schema compatibility, and tell users how to recover from a failed upgrade.

Maintain separate development/test and real pilot environments. No test fixtures or destructive test cleanup may run against pilot data. Cloud administration belongs to the owner/operator, never to every family member through app roles.

Operational tasks include provider health/quota checks, server database recovery, access/key rotation, dependency updates, failed-sync diagnostics, attachment cleanup, backup/restore drills and user support. Logs should expose correlation IDs and failure categories without disclosing private contents. A service outage pauses online features; it must not invalidate already stored personal data.

## 17. Cost and service sustainability

The approved spending posture is a **free-tier pilot, with no paid subscription commitment**. No exact monthly spending ceiling was supplied. Before activating any paid plan, obtain the owner's budget decision with an actual estimate. Do not assume family usage means every required service is free forever.

As checked on October 19, 2026:

| Service | Published starting point | Planning implication |
| --- | --- | --- |
| Supabase | Free plan; Pro from US$25/month; free projects pause after a week of inactivity | Pilot fit depends on actual quotas/usage and acceptable service availability. |
| PowerSync | Free plan; Pro from US$49/month; free projects deactivate after a week of inactivity | Free published limits include 2 GB synced/month, 500 MB hosted data and 50 peak clients. Measure actual sync history/traffic. |
| Both entry paid plans | Approximately US$74/month before additional services, taxes or overages | Potentially disproportionate for this audience; not an approved commitment. |
| Attachments/backup/distribution | Usage, retention, signing and hosting choices affect costs | Include actual bytes and history, not just number of users. |

Sources: [Supabase pricing](https://supabase.com/pricing), [PowerSync pricing](https://powersync.com/pricing). These are dated published prices, not a guaranteed quote. Recheck before procurement.

Do not create artificial keep-alive traffic to evade inactivity policies. Show service-unavailable status and a recovery route. Free-tier suitability is an explicit gate; if inadequate, compare a paid managed plan, another validated provider/transport, or self-hosting with its real maintenance burden. A provider replacement requires a recorded trade-off and owner agreement if it materially changes cost, privacy, scope or maintenance.

Google sign-in does not eliminate database/sync/storage costs. With Google as the only launch sign-in provider, a separate password-reset email system is not mandatory; adding email authentication later would require a real mail-delivery setup. Keep optional email/push services outside launch dependency counts unless approved.

## 18. Implementation sequence and gates

No duration estimate is committed. Complete bounded evidence-producing milestones rather than starting every module at once. The launch scope stays fixed while implementation order follows dependencies.

| Stage | Deliverable | Exit evidence |
| --- | --- | --- |
| P0 — Architecture proof | Real-device inventory, Flutter builds, local persistence, Google callbacks, sync/receipt prototype, encryption feasibility and cost model | G0–G4 foundational proof results; resolve blockers before extensive feature work. |
| P1 — Local foundation and everyday Money | Profile/onboarding/theme/navigation, exact ledger, accounts, basic entries, history, corrections/reconciliation, draft/backup foundation | Offline kill/restart/rollback tests and canonical money fixtures pass. |
| P2 — Connected identity/private sync | Safe enrollment, second-device retrieval, durable commands, conflict/receipt reconciliation, Sync/recovery UI | Two real-platform devices converge, preserve data through network/process faults and enforce private ownership. |
| P3 — Shared Expenses | All S01–S10 workflows, invitations, settlements, private effects, former-member rules | Full group arithmetic, permissions, concurrent/offline cases and private nonduplication pass. |
| P4 — Complete financial scope | All debt/card/statement/installment/recurring/budget/goal/forecast/report/import/file features | Every M01–M17 row mapped to implementation and acceptance; command offline matrix complete. |
| P5 — Life and native integration | Calendar/reminders, Tasks/Learning/Books, Career essentials, platform UX/accessibility | Life end-to-end flows work offline and sync, with no source duplication; G5/G6 device acceptance. |
| P6 — Complete private release | Signed upgrade path, backups/recovery, operational setup, capacity/cost checks and complete regression acceptance | All launch rows and release gates pass; owner can use real data with documented limitations. |

P0/P2 can use synthetic expense flows to prove the architecture without claiming an early reduced-scope launch. Later milestones may overlap only when their interfaces are stable and the owner authorizes work; this plan does not request delegation or parallel agents by itself.

### 18.1 Gate register

| Gate | Unresolved condition | Required closure |
| --- | --- | --- |
| G0 | Exact native package versions, state/routing/chart/file libraries, minimum OS/device matrix | Build and exercise critical plugins on Windows and Android; pin dependencies/licenses and name supported devices. |
| G1 | PowerSync financial-command integration, transaction/checkpoint behavior and local-only support | Prove atomic pending intent, response-loss replay, accepted snapshot/overlay handoff, rejection recovery and no queue-wide stall. |
| G2 | Offline-to-cloud profile enrollment, identity collision and snapshot publication | Prove interrupted/repeated enrollment, simultaneous account claims and populated-local/existing-cloud choice without data loss. |
| G3 | Local/server money parity, exact numeric ranges and concurrency policy | Canonical fixtures, backend security tests, per-command offline/finalization matrix and two-device conflict evidence. |
| G4 | Local database/files encryption, credential storage and portable key recovery | New-device encrypted restore with no original device; wrong-key/tamper tests and no secret exposure. |
| G5 | Native distribution, callbacks, notifications/background execution and upgrades | Signed update preserves actual data on target devices; Google/invitation callbacks and honest background behavior work. |
| G6 | Accessibility and representative-device performance | Manual Narrator/TalkBack, keyboard/touch/text scaling/themes and bounded capacity tests with measured results. |
| G7 | Managed service quotas, free-tier operation and budget | Measured initial sync, active sync, storage/history/files and outage/reactivation behavior; explicit budget decision if paid service required. |
| G8 | File validation/scanning, backup retention and account/group lifecycle operations | Real configured adapters, restore/deletion reconciliation, owner-loss procedure and recovery documentation. |

A failed gate calls for a bounded redesign or documented alternative. It must not silently reduce financial scope, invent successful tests, or replace the provider because it is convenient for the current implementation.

## 19. Acceptance criteria and test strategy

The legacy web tests are evidence sources and reusable scenarios, not proof that the new system works. Test pure Dart rules, native widgets, local SQLite transactions, remote PostgreSQL commands/security, sync integration, and real Windows/Android flows. Use shared fixture inputs/expected outputs across client/server implementations to prevent financial drift. Run focused checks during development and consolidated relevant regression gates before milestones; do not repeatedly run unrelated broad suites without a reason.

The scenarios below supplement, rather than replace, the inherited domain acceptance sets. In particular, map all 40 accepted Shared Expenses scenarios and the existing debt/card/planning rejection cases to new tests or an explicitly documented equivalent. A shorter native test list must not silently discard a supported workflow.

### 19.1 Required acceptance scenarios

| ID | Scenario | Required result |
| --- | --- | --- |
| A01 | Fresh install in airplane mode | Create a local profile, open core features and save/read records without a backend. |
| A02 | Local financial save followed by immediate process kill | On restart either the whole action exists with its evidence or none does; no partial journal. |
| A03 | Connect populated Android profile to Google; open Windows with same account | Resume safe enrollment/download; one profile, original history and no repeated opening balances. |
| A04 | Connect Google with an existing remote profile to a different populated local profile | Clear safe choice; no automatic merge/overwrite; cancel preserves local data. |
| A05 | Two devices record distinct expenses offline then reconnect | Both accepted once and derived balances converge; last-write-wins does not discard either action. |
| A06 | Server commits but upload response is lost | Retry yields original receipt; no duplicate action, settlement or private posting. |
| A07 | Concurrent correction or competing final debt payments | Stale/incompatible operation enters review; genuine local intent is preserved and no liability is silently over-cleared. |
| A08 | Shared PHP100 bill split three ways | Deterministic PHP33.34/33.33/33.33 shares, payer/share sums equal total and group positions sum to zero. |
| A09 | Shared PHP1,200 dinner with payer consuming PHP400 | Private cash -1,200, personal expense 400, receivable 800 exactly once; other members' private ledgers need their own authorization. |
| A10 | Shared card-funded expense, correction and refund | No duplicate card liability/spending; received-money and consumed-share effects remain distinct. |
| A11 | Partial/selected/multi-bill settlement, advance, dispute and reversal | All existing source caps and confirmed/projected distinctions hold; confirmation/reversal never repeats cash movement. |
| A12 | Owner device off/lost | Other members can use the service; same-account recovery restores owner access without becoming a new participant. |
| A13 | Removal while member offline; later upload and history refresh | New group writes rejected, permitted history retained, unrelated later records excluded; private evidence survives. |
| A14 | Foreign IDs, forged commands or manipulated sync subscription | No private/group data leak or cross-owner write; replication filtering independently tested. |
| A15 | Expired Google session or cloud outage | Existing private data remains locally usable; sync pauses with an honest status and resumes safely. |
| A16 | Debt import, borrowing/net proceeds, payments, unknown allocation, schedule revision and payoff | All inherited monetary classifications, immutable mappings and dependent-record restrictions hold. |
| A17 | Card statements, allocations, overpayments and installment revision/application | Retain provider-evidence meaning and separate cash/liability/spending; reject invented or stale allocations. |
| A18 | Recurrence, budget, savings and forecast integration | Plans do not post money; budget overlap/basis preserved; reservations do not duplicate assets; forecasts disclose source overlap/uncertainty. |
| A19 | CSV preview/post/retry/cancel and cutoff rebase | Correct interpretation, duplicate review, preserved committed batches and exact opening/history equation. |
| A20 | Career interview, personal event and tracker deadline | Appear once from authoritative sources; completion/archive cancels stale reminders without deleting history. |
| A21 | Report with pending work or incomplete initial sync | Correct inclusion/freshness labels; never present an incomplete sum as a complete balance. |
| A22 | Portable backup restored to a new device without old credentials/keystore | Recover private data and declared attachment coverage with the recovery secret; require online identity for current group access. |
| A23 | Old backup with already accepted/pending commands reconnects | Reconcile receipts/current state; do not replay old money or resurrect revoked membership/deleted records. |
| A24 | Corruption, disk full, wrong passphrase and interrupted schema upgrade | No false save/restore success; preserve recoverable data and an actionable recovery path. |
| A25 | Signed application update on both platforms | Data, identities, pending commands and compatible backups survive; unsafe downgrade is prevented/explained. |
| A26 | Keyboard/Narrator and touch/TalkBack, enlarged text, dark/light and reduced motion | Complete consequential tasks with accessible labels/focus/errors and without clipping or motion dependence. |
| A27 | Attachments absent offline, interrupted transfer and unsafe file | Honest availability; no unsafe preview or unauthorized access; independent records remain usable. |
| A28 | Account deletion/device revocation followed by restore or stale device reconnect | No regained authority; private removal and retained shared evidence follow the disclosed lifecycle policy. |

### 19.2 Capacity and release evidence

Use realistic long-lived personal fixtures, including at least the legacy scale of 10,000 financial actions, multi-year history, multiple groups, debt/card schedules, Life records and bounded attachments, adjusted to the intended support contract. Record cold offline startup, local command latency, report/query latency, memory, first/full/incremental sync time, network volume and low-storage behavior on actual target devices.

Proposed initial usability targets to validate in P0/P6: common local saves should usually finish within 300 ms; ordinary local lists within 500 ms; a cold usable local screen within roughly 2 seconds; bounded reports within roughly 2 seconds. These are starting engineering targets, not measured guarantees or permission to hide work. Publish the actual fixtures and percentile measurements; slow complex operations need cancellable/progressive UX and explicit bounds.

Before private real-data release: all launch rows complete; all applicable A scenarios pass; no unresolved critical/high data-loss, financial-integrity or access-control issue; backup/new-device restore demonstrated; supported devices documented; real provider/file/signing configuration verified; quotas/budget and owner recovery procedures agreed. Test builds and historical web acceptance do not substitute for this gate.

## 20. Risk register and mitigation

| Risk | Consequence | Mitigation / owner-visible decision |
| --- | --- | --- |
| Financial sync treated as generic row replication | Duplicated/overwritten money or invalid allocations | Command receipts, server transactions, pending-state model, G1/G3. |
| Flutter rewrite loses subtle legacy behavior | Incorrect debt/card/group semantics | Feature matrix, existing domain docs, shared golden fixtures and A16–A19. |
| Full financial launch scope is underestimated | Long delivery or pressure to drop advanced features | Staged development; explicit progress by M/S row; changes require owner decision. |
| Google identity loss or enrollment collision | Lost access or accidental profile overwrite | Managed identity recovery, backup, safe profile choice and G2. |
| Sync streams expose records outside RLS assumptions | Privacy breach | Independently tested stream authorization, no service secrets in clients, A14. |
| Free-tier suspension/limits | Delayed sync/recovery or unexpected migration work | Offline resilience, usage measurement, G7 and no paid assumptions. |
| Encryption protects data but makes recovery impossible | Permanent loss after device failure | Portable encrypted archives and tested independent key recovery, G4. |
| Device background restrictions | Late updates/reminders | Foreground sync path, durable work, device-specific notification disclosures. |
| Old clients/backups resurrect obsolete data | Duplicates or restored revoked access | Version windows, receipts/tombstones, server revalidation and A23/A28. |
| Files outgrow free storage or bypass safety checks | Cost/security problems | Bounded attachments, explicit coverage, real validation/scanning and G8. |
| Provider/plugin/API changes | Broken builds or sign-in | Pinned versions, dependency review, provider-boundary adapters and tested upgrades. |
| Broad Life scope competes with financial priority | Feature bloat | Launch only approved essentials/presets; defer custom tracker builder and deep analytics. |

## 21. Decision register

| ID | Decision | Status / rationale |
| --- | --- | --- |
| D01 | Salapiya; Your money, on your terms. | Approved final workshop name/tagline; repository name unchanged. |
| D02 | Windows and Android with substantial capability parity | Approved; adapt UI/input, preserve meaning. |
| D03 | One local profile per installation | Approved; no actual multi-person-per-installation need. |
| D04 | Local creation/use without mandatory account | Approved; no online anonymous-registration prerequisite. |
| D05 | Optional Google connection; one remote account/private profile, multiple devices | Approved; replaces earlier email/password-first recommendation. |
| D06 | Continue with Google can retrieve an existing profile directly | Approved; do not create an empty profile first. |
| D07 | Synchronize private data as well as groups | Approved; same-person cross-device use is core scope. |
| D08 | All existing implemented financial capabilities launch together | Approved; supersedes earlier financial deferrals. Internal stages are not scope cuts. |
| D09 | Overview, Money, Debts, Shared Expenses, Life | Approved; Debts prominent and Life retained despite finance-focused name. |
| D10 | Calendar/reminders, Tasks/Learning/Books and Career essentials at launch | Approved; meaningful broader personal use from the beginning. |
| D11 | Custom tracker builder/migrations, deep Career/tracker analytics later | Approved deferral; preserve compatible underlying preset/history design. |
| D12 | Flutter, SQLite, Supabase and PowerSync baseline | Approved for planning, gated by actual platform/integrity/cost proof; no prior native acceptance. |
| D13 | Owner-independent cloud groups, active-member bill creation, creator corrections, recipient confirmations | Approved; no owner approval queue for every bill and no owner access to private ledgers. |
| D14 | Versioned conflict review and durable retries | Approved principle; exact queue/command implementation remains G1/G3. |
| D15 | Baseline security; no initial end-to-end encryption requirement | Approved; disclose administrator trust, preserve user isolation and protected storage. |
| D16 | Private distribution and free-tier pilot | Approved; no paid-service commitment or public launch. |
| D17 | Substantial rewrite acceptable; no legacy real-data migration | Approved; existing data is disposable, but deletion is not automatically authorized. |
| D18 | Continue in the existing repository | Approved; preserve web reference/history, separate replacement implementation. |
| D19 | Logo and final native assets later | Deferred; no logo generated or implied approved here. |
| D20 | Independent backups and reviewed recovery | Approved requirement; exact format/encryption/retention validated in G4/G8. |

## 22. Deferred decisions and future-agent instructions

The following do not prevent this document from recording the approved product direction, but must not be silently guessed when they become implementation dependencies:

- Exact dependency versions, state/routing/chart packages, database encryption integration and schema layout.
- Minimum supported OS versions/architectures and the owner's representative physical-device list.
- Per-command connected-offline finalization policy, local/remote rule parity mechanism and durable checkpoint implementation.
- Cloud regions, storage/scanner configuration, backup retention, sync-history retention and explicit paid budget ceiling.
- Native notification scheduling details, installer/signing/update tools, stable package IDs and private distribution channel.
- Group owner-loss administrative recovery and exact account deletion/retained-history operations.
- Final logo/icon assets and brand availability checks before broader distribution.

For the next engineering assignment:

1. Read this blueprint and the relevant current domain documentation/code.
2. Confirm the current repository state; do not assume the baseline SHA remains latest.
3. Start with P0 and the explicitly assigned gates, not a full application rewrite in one change.
4. Preserve existing web files and published migrations unless an assignment explicitly authorizes their modification.
5. Record evidence, decisions and unresolved issues separately. Do not mark a gate passed from documentation or a vendor marketing claim.
6. Do not alter approved launch scope, bill permissions, money meaning, privacy or paid commitments silently.
7. Maintain feature-to-test traceability and update this blueprint/ADRs when a later approved decision supersedes a detail.

## 23. Reference index

### Repository domain references

- [Credit cards and statements](reference/v2/CREDIT_CARDS_AND_STATEMENTS.md).
- [Recurring obligations](reference/v2/RECURRING_OBLIGATIONS.md).
- [Budgets](reference/v2/BUDGETS.md).
- [Savings goals](reference/v2/SAVINGS_GOALS.md).
- [Forecasts](reference/v2/FORECASTS.md).
- [Career analytics](reference/v2/CAREER_ANALYTICS.md) — advanced analytics deferred, evidence retained.
- [Scheduled notifications](reference/v2/SCHEDULED_NOTIFICATIONS.md) — source semantics retained; native channel redesign specified here.
- [Files, imports and portability](reference/v2/FILES_IMPORTS_AND_PORTABILITY.md).
- [Shared Expenses implementation](reference/v2/SHARED_EXPENSES_IMPLEMENTATION.md).
- [V3 tracker workflows](reference/V3_TRACKER_WORKFLOWS.md).
- [V1 user guide](reference/V1_USER_GUIDE.md), [CSV exports](reference/V1_CSV_EXPORTS.md), and [lifecycle operations](reference/LIFECYCLE_OPERATIONS.md).
- [Approved web redesign plan](reference/COMPREHENSIVE_UI_UX_REDESIGN_PLAN.md), [M4/M5 handoff](reference/REDESIGN_M4_M5_HANDOFF.md), and [M6 acceptance](reference/REDESIGN_M6_ACCEPTANCE.md).

### External technical references

Official documentation checked during the October 19, 2026 workshop/doc preparation. Revalidate time-sensitive claims before implementation or spending. These sources establish product capabilities/constraints, not acceptance of Salapiya's implementation.

- [Flutter supported platforms](https://docs.flutter.dev/reference/supported-platforms) and [adaptive design](https://docs.flutter.dev/ui/adaptive-responsive).
- [Supabase Flutter guide](https://supabase.com/docs/guides/getting-started/quickstarts/flutter) and [Google sign-in](https://supabase.com/docs/guides/auth/social-login/auth-google).
- [Google OAuth application states](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview).
- [PowerSync Flutter SDK](https://docs.powersync.com/client-sdks/reference/flutter), [publisher package](https://pub.dev/packages/powersync), and [conflict handling](https://docs.powersync.com/handling-writes/handling-update-conflicts).
- [Supabase pricing](https://supabase.com/pricing) and [PowerSync pricing](https://powersync.com/pricing).
- [Android persistent background work](https://developer.android.com/develop/background-work/background-tasks/persistent).
- [Tauri Next.js guidance](https://v2.tauri.app/start/frontend/nextjs/) and [Firestore offline/transaction guidance](https://firebase.google.com/docs/firestore/manage-data/enable-offline).

## 24. Documentation completion record

This version records the approved workshop direction and final Salapiya name. It adds no application code, schema migration, cloud service, logo, subscription or deployment. Repository inspection and official documentation checks informed the plan; native builds, sync prototypes, security tests, physical-device checks and restore drills remain future work at the named gates.

The intended next step is a separately assigned architecture feasibility milestone with concrete evidence, followed by the complete approved financial and Life release scope.
