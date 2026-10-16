# UI/UX Redesign Decisions Required

**Prepared:** October 16, 2026, Asia/Manila  
**Baseline:** `239c360c0b4a094ae8244d0b42f55a7dcfc6b530`  
**Status:** Recommendations for owner review; no implementation authorization is inferred.  
**Related:** [Comprehensive plan](COMPREHENSIVE_UI_UX_REDESIGN_PLAN.md) · [Milestones](UI_UX_REDESIGN_MILESTONES.md)

## 1. How to use this register

Only **D01** requires a decision before implementation begins, because the owner explicitly requested planning first and approval before coding. It is not a blocker to completing the planning documents. The remaining current preferences have sensible defaults and can be settled during foundation review. All future-platform decisions are deferred and **do not block any current redesign milestone**.

The requested plan does not select a desktop runtime, Android framework, local database, encryption scheme, cloud provider or synchronization protocol. It preserves the current V3 architecture and all implemented behavior. Approval of a visual proposal is not approval of future architecture or of feature removal.

Classification terms follow [Plan Section 1](COMPREHENSIVE_UI_UX_REDESIGN_PLAN.md#1-purpose-authority-and-scope): CURRENT REDESIGN, FUTURE-READY FOUNDATION, FUTURE MIGRATION, and PROVISIONAL / UNRESOLVED.

| ID  | Decision                                                 | Recommended default                                                                               | Blocks current implementation?                  | Future-only? |
| --- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------ |
| D01 | Approve visual/navigation direction and current scope    | Warm surfaces, violet identity, integrated module switcher, adaptive detail views, six milestones | **Yes, until explicit implementation approval** | No           |
| D02 | Final product name and logo                              | Keep neutral working identity until chosen                                                        | No; required before final branded distribution  | No           |
| D03 | Brand relationship and color emphasis                    | Retain violet connection; add restrained teal/amber; no copied reference branding                 | No; follow D01 default                          | No           |
| D04 | Preferred everyday density and navigation emphasis       | Comfortable default; keyboard-efficient desktop; labeled mobile module directory                  | No; validate in M1/M2                           | No           |
| F01 | Windows/Android implementation strategy                  | Decide after current redesign; carry tokens/specifications forward                                | **No**                                          | Yes          |
| F02 | Local profiles and optional online identity relationship | One local profile initially; online identity only for features requiring it                       | **No**                                          | Yes          |
| F03 | Local protection, unlock and recovery                    | Make no encryption/recovery promise until technically specified                                   | **No**                                          | Yes          |
| F04 | Online collaboration and data boundary                   | Device-local personal records; separate online shared authority                                   | **No**                                          | Yes          |
| F05 | Offline group writes, synchronization and conflicts      | Online-confirmed group writes initially; no assumed universal sync                                | **No**                                          | Yes          |
| F06 | Backup, V3 migration, restore and deletion scope         | Explicit versioned coverage and reviewed restoration; CSV separate                                | **No**                                          | Yes          |
| F07 | Native reminders, background work and lifecycle          | Contextual permission requests and honest delivery limits                                         | **No**                                          | Yes          |

## 2. Current redesign blockers

### D01 — Approve the proposed redesign direction and implementation boundary

- **Class:** CURRENT REDESIGN + FUTURE-READY FOUNDATION.
- **Decision:** accept the proposed visual identity, navigation/composition and six-milestone scope, or identify specific changes before implementation.
- **Why it matters:** the proposal intentionally replaces the permanent sidebar and repetitive panel composition, changes the light primary-action treatment, and reorganizes access to implemented workflows. These should be deliberate owner choices.
- **Recommended choice:** adopt [Plan Sections 4–6](COMPREHENSIVE_UI_UX_REDESIGN_PLAN.md#4-reference-image-analysis): warm neutral surfaces, violet/lavender primary identity, charcoal emphasis, restrained teal/amber accents, one module switcher, local section navigation and contextual detail. Use a labeled mobile bottom bar: Home, Calendar, Modules, More. Preserve all current URLs and business behavior.
- **Alternatives:** retain a compact labeled global rail if real navigation testing shows a meaningful advantage; or use the cooler existing silver canvas with the same new information architecture. A conventional full-width navbar or icon-only dock is not recommended for the feature inventory.
- **Impact:** approval establishes the proposed visual supersession of the corresponding existing design-guideline roles. Product, architecture, database, financial and privacy authorities remain unchanged. It permits starting only the milestone(s) the owner subsequently assigns.
- **Postponement:** planning remains complete; implementation waits. Future architecture discussions are not required to decide this.
- **Blocks current redesign:** **Yes, implementation only**, because the user explicitly requires approval before implementation.
- **Only affects future migration:** **No**.
- **Review evidence:** the complete plan and route inventory now; representative rendered Home, financial review, dense record list and tracker-migration proofs during M1 before broad adoption.

**Owner's final decision:** _Pending — approve, approve with listed changes, or request revision._  
**Conditions / date:** _Not recorded._

## 3. Current redesign non-blocking preferences

### D02 — Final product name and brand assets

- **Class:** CURRENT REDESIGN; assets also carry into FUTURE-READY FOUNDATION.
- **Decision:** choose a product name, wordmark and eventual application icon. The repository name is not automatically the product brand.
- **Why it matters:** window titles, first-launch screens, Help, installed-app identity and export wording need a stable name eventually.
- **Recommended choice:** use a neutral text identity such as “Personal workspace” in design proofs and retain the existing working project name only where needed to identify the project. Choose the final brand independently of the owner's personal initials.
- **Alternatives:** a distinct short product name or a descriptive utility name; a personal portfolio connection can remain in color/type without copying its logo.
- **Impact:** later text/asset substitution; do not hardcode brand geometry into navigation or business components. Naming/trademark availability research is a separate task once candidates exist.
- **Postponement:** no effect on M1–M5 foundations or functionality. Final branded distribution assets wait; current web production launch is not a requirement.
- **Blocks current redesign:** **No**.
- **Only affects future migration:** **No**; native app icons and store assets are future applications of the choice.

**Owner's final decision:** _Pending; use the neutral working identity._  
**Approved name / asset source / date:** _Not recorded._

### D03 — Brand connection and color emphasis

- **Class:** CURRENT REDESIGN + FUTURE-READY FOUNDATION.
- **Decision:** retain the portfolio's violet/lavender connection or establish a more independent identity.
- **Why it matters:** the previous guidelines explicitly reference that visual family, while the new references introduce warmer and more varied color.
- **Recommended choice:** retain violet/lavender and Geist; adopt the plan's warm canvas, teal secondary accent and restrained amber/plum/blue chart/module roles. Use strong light-theme violet actions and dark-theme lavender actions. This supplies variety without recoloring every screen.
- **Alternatives:** keep the cooler silver canvas; or later commission an independent brand palette. The saturated orange/red gradient direction is not recommended for long financial sessions.
- **Impact:** centralized token changes and representative contrast/layout checks. Do not introduce another icon/font/component system to express a color preference.
- **Postponement:** proceed with D01's recommended palette; M1 proofs make the choice concrete before broad screen conversion.
- **Blocks current redesign:** **No**, once D01 is approved.
- **Only affects future migration:** **No**.

**Owner's final decision:** _Pending; use the proposed violet/teal/warm-neutral palette._  
**Requested adjustments / date:** _Not recorded._

### D04 — Everyday density and navigation emphasis

- **Class:** CURRENT REDESIGN + FUTURE-READY FOUNDATION.
- **Decision:** confirm whether long desktop review sessions or quick mobile entry should receive additional emphasis after testing the proposed balanced layout.
- **Why it matters:** information density and switcher discoverability should reflect actual use rather than screenshot aesthetics.
- **Recommended choice:** comfortable default controls, aligned dense desktop records, larger mobile targets, no mandatory sidebar, and a complete visible module directory. Keep keyboard Find a screen as an accelerator, never the sole path. Avoid persistent custom pins/layout settings until an actual supported preference model is scoped.
- **Alternatives:** a compact labeled desktop rail if M2 testing demonstrates better discovery; more generous spacing for predominantly touch use. Do not make Android look like a squeezed desktop table.
- **Impact:** layout and interaction choices only. Breakpoint behavior follows available width and input; no architecture change is needed.
- **Postponement:** defaults remain usable; collect feedback using actual tasks during M1/M2 and verify in M6.
- **Blocks current redesign:** **No**.
- **Only affects future migration:** **No**.

**Owner's final decision:** _Pending; use comfortable defaults and the proposed module directory._  
**Primary usage notes / date:** _Not recorded._

## 4. Future Windows/Android migration decisions

All items here are **FUTURE MIGRATION — PROVISIONAL / UNRESOLVED**. They affect the future screen concepts in [Plan Section 13](COMPREHENSIVE_UI_UX_REDESIGN_PLAN.md#13-future-offline-first-windows-and-android-ux). They do not add tasks or dependencies to the current six milestones.

### F01 — Client runtimes and reuse boundary

- **Decision:** choose Windows runtime/packaging and Android framework, including native versus shared presentation.
- **Why it matters:** determines which React/DOM components can actually transfer, native accessibility/input, installation, update and lifecycle behavior.
- **Recommendation:** decide in a separate architecture phase after redesign, using prototypes of an exact-money command, list/detail workflow, local recovery and native lifecycle. Preserve tokens and interaction contracts now.
- **Alternatives:** Windows webview-based client or native Windows UI; native Android or an approved cross-platform framework. These are options, not selected technologies.
- **Impact:** FUX01–FUX20 implementation and native-equivalent libraries. Next.js server components do not automatically run offline inside a package.
- **Postponement:** no visual/specification rework is required merely to defer the runtime; some native control metrics will adapt later.
- **Blocks current redesign:** **No**. **Future-only:** **Yes**.

**Owner's final decision:** _Deferred to platform architecture planning._

### F02 — Local profile model and identity relationship

- **Decision:** single versus multiple local profiles, profile selection, and how a local profile connects to an optional online identity.
- **Why it matters:** affects first launch, isolation, switching, returning users and collaboration consent. A display profile is not equivalent to an authenticated cloud account.
- **Recommendation:** one local profile initially, optional online connection only when needed; design profile management so multiple profiles could be added without making current onboarding complex. Explicitly define local/online identity mapping before collaboration.
- **Alternatives:** multiple isolated profiles at launch; separate device installations per user; optional multi-device identity after a later synchronization decision.
- **Impact:** FUX01–FUX04, FUX06/FUX07/FUX14/FUX16. Requires future data ownership/isolation rules.
- **Postponement:** current Better Auth sign-in and one personal workspace per owner remain unchanged. Current Setup/Settings redesign proceeds.
- **Blocks current redesign:** **No**. **Future-only:** **Yes**.

**Owner's final decision:** _Deferred; provisional default is one local profile with optional online connection._

### F03 — Device-local security and recovery

- **Decision:** storage encryption, key management, OS credentials/biometrics, app lock, and lost-key/device recovery.
- **Why it matters:** determines whether unlock, protection badges and recovery promises are truthful. Offline/local does not itself mean encrypted or recoverable.
- **Recommendation:** use platform-supported protection where appropriate after threat-model and recovery design; clearly disclose unrecoverable cases. Keep protection and backup status distinct.
- **Alternatives:** OS-only protection; application-managed encrypted storage; optional lock. Each requires explicit risk/recovery evaluation rather than a cosmetic PIN screen.
- **Impact:** FUX02/FUX04–FUX06/FUX13–FUX15. Exact copy and actions cannot be finalized before guarantees exist.
- **Postponement:** no effect on current authentication/security controls or theme/component work.
- **Blocks current redesign:** **No**. **Future-only:** **Yes**.

**Owner's final decision:** _Deferred; no encryption or recovery guarantee selected._

### F04 — Online feature scope and shared-data authority

- **Decision:** which features/data are online, group authentication/membership model, cached group access, and boundaries between shared evidence and private local records.
- **Why it matters:** determines status labels, invitations, privacy notices, access revocation and what can remain visible offline.
- **Recommendation:** personal tracking stays device-local by default; shared-group facts have a distinct authoritative collaboration service; private financial adoption remains explicit. No assumption that every personal feature synchronizes.
- **Alternatives:** online-only group access; limited approved offline group reading; optional private sync as a separately consented later feature.
- **Impact:** FUX07–FUX12/FUX16 and migration of trusted group provenance. Cloud provider selection is an architecture task, not a UI decision.
- **Postponement:** current shared server authority, manual invitation handoff, feature flags and private consent remain. Current group redesign is fully specified.
- **Blocks current redesign:** **No**. **Future-only:** **Yes**.

**Owner's final decision:** _Deferred; provisional default is separate online group authority and local personal data._

### F05 — Offline group writes, queues and conflict policy

- **Decision:** whether disconnected group changes are drafts, queued commands or unavailable; how acknowledgements, retries, stale sources and conflicts resolve.
- **Why it matters:** a pending change must not look like a confirmed settlement. Financial history and participant confirmation cannot use an unexamined last-write-wins policy.
- **Recommendation:** initially require connection for group writes and confirmations. Allow offline drafts only after durable local storage and privacy are designed. Introduce queues/conflict screens only if actual synchronization semantics require them.
- **Alternatives:** carefully constrained queued commands with durable idempotency and explicit server acknowledgement; read-only cached groups; no offline group access.
- **Impact:** FUX08–FUX12. Requires concurrency/revocation/replay decisions and financial invariants before implementation.
- **Postponement:** current commands continue their existing online pending/unknown/retry behavior. No offline queue is added to M1–M6.
- **Blocks current redesign:** **No**. **Future-only:** **Yes**.

**Owner's final decision:** _Deferred; provisional default is online-confirmed group writes._

### F06 — Backup, existing V3 data migration, restoration and deletion

- **Decision:** portable format/version policy, attachment bytes, encryption, destination, create-new versus replace, recovery retention and local/remote deletion scope.
- **Why it matters:** current graph exports and trusted shared provenance cannot be assumed to be complete native backups or valid on unrelated devices. Users need predictable recovery.
- **Recommendation:** define explicit coverage and compatibility, preflight validation and exact preview before restoring. Keep CSV/report exports separate from complete backup. Prefer creating a separate restored profile when the future ownership model safely supports it; replacement requires stronger confirmation and recovery.
- **Alternatives:** private-only migration with later group reconnection; reviewed compatible graph import; complete encrypted backup after attachment/key handling is designed.
- **Impact:** FUX13–FUX16/FUX18, app upgrade failure recovery and existing-user transition.
- **Postponement:** current 24-hour recovery, graph/file limits, proof rules and deletion lifecycle remain as implemented; their current UI can be redesigned now.
- **Blocks current redesign:** **No**. **Future-only:** **Yes**.

**Owner's final decision:** _Deferred; no new backup format or retention promise selected._

### F07 — Native reminders, permissions and application lifecycle

- **Decision:** local scheduled notifications, optional online channels, background execution, device restart behavior, permission denial and application update/close semantics.
- **Why it matters:** native platforms impose different delivery and background limits. Reminder wording must distinguish scheduled intent from guaranteed delivery.
- **Recommendation:** ask for permission in context, show useful fallback/recovery, preserve date-only/timed/source-generation distinctions, and disclose platform constraints. Keep security messages separate from optional reminders where online identity exists.
- **Alternatives:** in-app reminders only initially; local notifications plus optional online delivery after lifecycle verification.
- **Impact:** FUX08/FUX17/FUX18, device settings links and returning-user feedback.
- **Postponement:** current in-app and explicitly opted-in delivery semantics remain unchanged. No current milestone needs native permission or notification APIs.
- **Blocks current redesign:** **No**. **Future-only:** **Yes**.

**Owner's final decision:** _Deferred; native delivery/lifecycle architecture not selected._

## 5. Recommended next decision

Review D01 and the current route inventory. If the direction is acceptable, authorize **M1 only** or explicitly assign a wider set of current milestones. M1 makes the visual proposal concrete on representative rendered screens before broad rollout. Naming, logo and future architecture may remain pending.

Record the owner's actual decision here when provided. Do not replace a Pending/Deferred field with an assumption or interpret silence as authorization. No additional questionnaire is needed to complete the planning assignment.
