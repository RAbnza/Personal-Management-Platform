# Development history

## Contents

- [Timeline](#timeline)
- [Phase records](#phase-records)
- [Implementation sequence, gates and blueprint record (product blueprint sections 18 and 24)](#implementation-sequence-gates-and-blueprint-record-product-blueprint-sections-18-and-24)

## Timeline

The project was built in bounded milestones from 6 to 29 October 2026 (Asia/Manila). Each milestone ended with a written handoff and its verification evidence. Implementation was AI-assisted (see the README, "How it was built"). Dates and hashes below come from the archived records and git history. Status uses: implemented and verified, implemented with limitations, superseded (historical), not implemented.

| Dates (2026) | Phase | Outcome | Key evidence | Record |
| --- | --- | --- | --- | --- |
| 6 Oct | Planning and architecture documents | Basis for V1 | First commit `3961aac` | [V1 handoff](archive/web/PROJECT_DEVELOPMENT_HANDOFF.md) |
| 6–9 Oct | Web V1 (phases C1–C5) | Implemented and verified locally; production gates separate, later superseded by ADR 0005 | C4 code `84e989e`, handoff `b71bf98`; D6B and D7 verification on 7–8 Oct | [V1-C5 acceptance](archive/web/verification/V1_C5_ACCEPTANCE.md), [D6B](archive/web/verification/D6B_EXISTING_DEBT_IMPORT.md), [D7](archive/web/verification/D7_BORROWING_NET_PROCEEDS.md) |
| 10–16 Oct | Web V2-A–I (cards, planning, files, shared expenses) | Implemented and locally accepted; no production release | V2-I: all 40 approved scenarios passed | [V2 handoff](archive/web/V2_DEVELOPMENT_HANDOFF.md), [shared expenses](archive/web/SHARED_EXPENSES_IMPLEMENTATION.md) |
| 16–18 Oct | Web V3-A–D (Trackers, Calendar integration) | Implemented and locally accepted under the targeted change-impact strategy | CI at `239c360`: 1,104 unit, 681 integration, 62 browser tests | [V3 plan](archive/web/V3_DEVELOPMENT_PLAN.md), [V3 handoff](archive/web/V3_DEVELOPMENT_HANDOFF.md), [ADR 0005](adr/0005-v3-scope-and-platform-transition.md) |
| 16–19 Oct | Web UI/UX redesign M1–M6 | Implemented; M6 passed with documented limitations | M1 merged `a109b19` (PR #2, 17 Oct); M6 merged `b721b0c` (PR #3, 19 Oct) | [Plan](archive/web/COMPREHENSIVE_UI_UX_REDESIGN_PLAN.md), [milestones](archive/web/UI_UX_REDESIGN_MILESTONES.md), [decisions](archive/web/UI_UX_REDESIGN_DECISIONS_REQUIRED.md), [M6 acceptance](archive/web/REDESIGN_M6_ACCEPTANCE.md) |
| 19 Oct | Salapiya product blueprint | Direction set for a Windows/Android app; web production deployment superseded | Web baseline `b721b0c` | [Product and features](PRODUCT_AND_FEATURES.md#salapiya--product-revision-and-windowsandroid-migration-blueprint) |
| 20–21 Oct | P0 native foundation | Toolchain and builds verified on Windows and the Android emulator | Tested toolchain table | [P0 verification](archive/salapiya/P0_VERIFICATION.md) |
| 21–24 Oct | Design prototype D0–D5 | Superseded (historical) by the final UI/UX redesign on 27 Oct | D1 base `7914b72`; D2 replaced by D2 reimagined on 23 Oct; D5 finalized 24 Oct | [Prototype roadmap](archive/salapiya/design/PROTOTYPE_ROADMAP.md) |
| 24 Oct | P0 architecture proof | Google, sync and receipt gates exercised against the hosted backend | Branch `feat/salapiya-p0-google-gate-closure` | [P0 proof](archive/salapiya/P0_ARCHITECTURE_PROOF_HANDOFF.md) |
| 25 Oct | P1 local foundation; P2 connected identity and private sync | Implemented and verified on both platforms | P1 base `01709d7` | [P1](archive/salapiya/P1_LOCAL_FOUNDATION_HANDOFF.md), [P2](archive/salapiya/P2_CONNECTED_IDENTITY_HANDOFF.md) |
| 26 Oct | P3 Shared Expenses; P4 complete financial scope | Implemented and verified | P3: 54/54 focused Flutter tests; P4: 186 Flutter tests passed | [P3](archive/salapiya/P3_SHARED_EXPENSES_HANDOFF.md), [P4](archive/salapiya/P4_COMPLETE_FINANCIAL_SCOPE_HANDOFF.md) |
| 27 Oct | P5 Life and native integration; final UI/UX redesign | Implemented and verified | P5: 209 Flutter tests passed; redesign `a624282` | [P5](archive/salapiya/P5_LIFE_AND_NATIVE_INTEGRATION_HANDOFF.md), [Design system](DESIGN_SYSTEM.md#salapiya---final-uiux-redesign-handoff) |
| 28 Oct | P6 private-release candidate `0.6.0+7`; Android Overview polish | P6 classified BLOCKED at the time; superseded (historical) by the final release decision | Signed builds 6 and 7 kept as update baselines | [P6](archive/salapiya/P6_PRIVATE_RELEASE_HANDOFF.md), [Android polish](archive/salapiya/ANDROID_OVERVIEW_POLISH_HANDOFF.md) |
| 29 Oct | Post-P6 presentation polish and release-gate closure | Still classified BLOCKED under the earlier gate scope; superseded (historical) | Same version `0.6.1+8`, binary source checkpoint `60a6605` | [Polish](archive/salapiya/POST_P6_PRESENTATION_POLISH_HANDOFF.md), [gate closure](archive/salapiya/POST_P6_RELEASE_GATE_CLOSURE_HANDOFF.md) |
| 29 Oct | Release `0.6.1+8` | Implemented with limitations: full release for a small private group, with open gates reclassified as accepted limitations | Merged `d1e6667` (PR #4), tag `salapiya-v0.6.1+8`; 231 Flutter tests passing in the release evidence | [Operations and release](OPERATIONS_AND_RELEASE.md#salapiya--final-release-and-project-closure) |
| 29 Oct | Debt payment scheduling and urgency | Implemented after the release; not in a tagged build | `48847cf`, `294c6d0` | [Domain rules](DOMAIN_RULES.md#debt-payment-scheduling-and-urgency), [handoff](archive/salapiya/DEBT_SCHEDULE_URGENCY_HANDOFF.md) |

## Phase records

### Web application (V1-V3 and redesign M1-M6)

- [Project Development Handoff](archive/web/PROJECT_DEVELOPMENT_HANDOFF.md)
- [V2 Development Handoff](archive/web/V2_DEVELOPMENT_HANDOFF.md)
- [V3 Development Plan](archive/web/V3_DEVELOPMENT_PLAN.md)
- [V3 Development Handoff](archive/web/V3_DEVELOPMENT_HANDOFF.md)
- [UI/UX Redesign Decisions Required](archive/web/UI_UX_REDESIGN_DECISIONS_REQUIRED.md)
- [Comprehensive UI/UX Redesign Plan](archive/web/COMPREHENSIVE_UI_UX_REDESIGN_PLAN.md)
- [UI/UX Redesign Milestones](archive/web/UI_UX_REDESIGN_MILESTONES.md)
- [M1 implementation handoff](archive/web/REDESIGN_M1_HANDOFF.md)
- [M2 + M3 implementation handoff](archive/web/REDESIGN_M2_M3_HANDOFF.md)
- [M4 + M5 design implementation](archive/web/REDESIGN_M4_M5_HANDOFF.md)
- [M6 redesign acceptance](archive/web/REDESIGN_M6_ACCEPTANCE.md)
- [V2-I - Shared Expenses and Settlements implementation](archive/web/SHARED_EXPENSES_IMPLEMENTATION.md)
- [V1-C5 acceptance record](archive/web/verification/V1_C5_ACCEPTANCE.md)
- [D6b existing-debt import verification](archive/web/verification/D6B_EXISTING_DEBT_IMPORT.md)
- [D7 borrowing and net proceeds verification](archive/web/verification/D7_BORROWING_NET_PROCEEDS.md)
- [M1 targeted verification results](archive/web/verification/REDESIGN_M1_RESULTS.md)

### Salapiya native (P0-P6, post-P6, release and later work)

- [P0 foundation verification](archive/salapiya/P0_VERIFICATION.md)
- [Remaining P0 assignments](archive/salapiya/P0_NEXT_ASSIGNMENTS.md)
- [Salapiya P0 architecture proof handoff](archive/salapiya/P0_ARCHITECTURE_PROOF_HANDOFF.md)
- [P1 — Local foundation and everyday Money](archive/salapiya/P1_LOCAL_FOUNDATION_HANDOFF.md)
- [P2 — Connected identity, private synchronization and recovery](archive/salapiya/P2_CONNECTED_IDENTITY_HANDOFF.md)
- [P3 — Shared Expenses and Settlements](archive/salapiya/P3_SHARED_EXPENSES_HANDOFF.md)
- [P4 - Complete Financial Scope](archive/salapiya/P4_COMPLETE_FINANCIAL_SCOPE_HANDOFF.md)
- [P5 — Life and native integration](archive/salapiya/P5_LIFE_AND_NATIVE_INTEGRATION_HANDOFF.md)
- [P6 — Complete private release](archive/salapiya/P6_PRIVATE_RELEASE_HANDOFF.md)
- [Post-P6 presentation polish](archive/salapiya/POST_P6_PRESENTATION_POLISH_HANDOFF.md)
- [Salapiya - Post-P6 release gate closure](archive/salapiya/POST_P6_RELEASE_GATE_CLOSURE_HANDOFF.md)
- [Android Overview polish — pre-P6](archive/salapiya/ANDROID_OVERVIEW_POLISH_HANDOFF.md)
- [Debt payment scheduling and urgency](archive/salapiya/DEBT_SCHEDULE_URGENCY_HANDOFF.md)

### Salapiya design prototype (D0-D5)

- [Salapiya native design — approved prototype](archive/salapiya/design/README.md)
- [Prototype architecture, milestones and review gates](archive/salapiya/design/PROTOTYPE_ROADMAP.md)
- [D1 — Woven Calm implementation and review record](archive/salapiya/design/D1_IMPLEMENTATION.md)
- [D1R — Luminous Lattice and floating quick actions](archive/salapiya/design/D1R_IMPLEMENTATION.md)
- [D2 — native shell and interactive Overview](archive/salapiya/design/D2_IMPLEMENTATION.md)
- [D2 reimagined — Daylight](archive/salapiya/design/D2_REIMAGINED.md)
- [D3 — Core financial interaction prototype](archive/salapiya/design/D3_IMPLEMENTATION.md)
- [D4 remaining UI/UX prototype](archive/salapiya/design/D4_IMPLEMENTATION.md)
- [D5 — Prototype finalization and production handoff](archive/salapiya/design/D5_PRODUCTION_HANDOFF.md)

## Implementation sequence, gates and blueprint record (product blueprint sections 18 and 24)

### 18. Implementation sequence and gates

No duration estimate is committed. Complete bounded evidence-producing milestones rather than starting every module at once. The launch scope stays fixed while implementation order follows dependencies.

| Stage | Deliverable | Exit evidence |
| --- | --- | --- |
| P0 — Architecture proof | Real-device inventory, Flutter builds, local persistence, Google callbacks, sync/receipt prototype, encryption feasibility and cost model | G0–G4 foundational proof results; resolve blockers before extensive feature work. |
| P1 — Local foundation and everyday Money | Profile/onboarding/theme/navigation, exact ledger, accounts, basic entries, history, corrections/reconciliation, draft/backup foundation | Offline kill/restart/rollback tests and canonical money fixtures pass. |
| P2 — Connected identity/private sync | Safe enrollment, second-device retrieval, durable commands, conflict/receipt reconciliation, Sync/recovery UI | Two real-platform devices converge, preserve data through network/process faults and enforce private ownership. |
| P3 — Shared Expenses | All S01–S10 workflows, invitations, settlements, private effects, former-member rules | Full group arithmetic, permissions, concurrent/offline cases and private nonduplication pass. |
| P4 — Complete financial scope | All debt/card/statement/installment/recurring/budget/goal/forecast/report/import/file features | Every M01–M17 row mapped to implementation and acceptance; command offline matrix complete. |
| P5 — Life and native integration | Calendar/reminders, Tasks/Learning/Books, Career essentials, platform UX/accessibility | Life end-to-end flows work offline and sync, with no source duplication; G5/G6 device acceptance. |
| P6 — Complete private release | Signed upgrade path, backups/recovery, operational setup, capacity/cost checks and complete regression acceptance | All launch rows and release gates pass; the primary user can use real data with documented limitations. |

P0/P2 can use synthetic expense flows to prove the architecture without claiming an early reduced-scope launch. Later milestones may overlap only when their interfaces are stable and the work is explicitly authorized; this plan does not request delegation or parallel agents by itself.

#### 18.1 Gate register

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

### 24. Documentation completion record

This version records the approved workshop direction and final Salapiya name. It adds no application code, schema migration, cloud service, logo, subscription or deployment. Repository inspection and official documentation checks informed the plan; native builds, sync prototypes, security tests, physical-device checks and restore drills remain future work at the named gates.

The intended next step is a separately assigned architecture feasibility milestone with concrete evidence, followed by the complete approved financial and Life release scope.
