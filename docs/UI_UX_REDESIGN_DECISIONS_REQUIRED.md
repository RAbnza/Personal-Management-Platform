# UI/UX Redesign Decisions Required

**Prepared:** October 16, 2026, Asia/Manila  
**Baseline:** `239c360c0b4a094ae8244d0b42f55a7dcfc6b530`  
**Owner decisions recorded:** October 17, 2026, Asia/Manila\
**Documentation alignment baseline:** `main`, `62043c1ff8cc08d4e64576b356dc1c30717cd1ed`\
**Status:** Current direction and M1–M6 roadmap approved. M1 themes, Magic UI Dock A, mobile dock and existing workflows approved; final desktop dock refinement awaits manual owner review. M2–M6 still require individual assignments.\
**Related:** [Comprehensive plan](COMPREHENSIVE_UI_UX_REDESIGN_PLAN.md) · [Milestones](UI_UX_REDESIGN_MILESTONES.md)

## 1. How to use this register

The owner's explicit October 17, 2026 approvals resolve D01, D03 and D04. D02 approves **Personal workspace** as the neutral working application identity and defers final branding. No further product or architecture decision blocks M1; its next prerequisite is an individual implementation assignment. Approval of the six-milestone roadmap does not start implementation. Future decisions F01–F07 remain deferred and do not block M1–M6.

The requested plan does not select a desktop runtime, Android framework, local database, encryption scheme, cloud provider or synchronization protocol. It preserves the current V3 architecture and all implemented behavior. Approval of a visual proposal is not approval of future architecture or of feature removal.

Classification terms follow [Plan Section 1](COMPREHENSIVE_UI_UX_REDESIGN_PLAN.md#1-purpose-authority-and-scope): CURRENT REDESIGN, FUTURE-READY FOUNDATION, FUTURE MIGRATION, and PROVISIONAL / UNRESOLVED.

| ID | Decision | Owner status — October 17, 2026 | Blocks M1? |
| --- | --- | --- | --- |
| D01 | Overall direction and six-milestone roadmap | **APPROVED**; milestones individually assigned | No |
| D02 | Working identity / final branding | **Personal workspace APPROVED**; final name, wordmark, logo and native branding deferred | No |
| D03 | Complete visual identity | **APPROVED** identity/type/accessibility; D06 records approved Porcelain / Midnight Spectrum and Magic UI Dock A | No |
| D04 | Balanced information density | **APPROVED**; readable everyday use, rich desktop records and adaptive mobile layouts | No |
| D06 | M1 owner review round 3 and final refinement | **APPROVED** Porcelain, Midnight Spectrum, Magic UI Dock A, mobile design and existing workflows; slim bottom-centered desktop correction required | Desktop correction awaits manual owner review |
| D05 | Previous M1 owner review refinements | Color/navigation recommendation superseded by D06; record affordances and separate expense entry/review retained | See D06 |
| F01 | Windows/Android runtime and code reuse | **DEFERRED** to platform architecture planning | No |
| F02 | Local profile and online identity | **DEFERRED** to platform architecture planning | No |
| F03 | Device security, encryption and recovery | **DEFERRED** to platform architecture planning | No |
| F04 | Online collaboration and local/remote boundaries | **DEFERRED** to platform architecture planning | No |
| F05 | Offline group writes, synchronization and conflicts | **DEFERRED** to platform architecture planning | No |
| F06 | Backup, migration, restoration and deletion | **DEFERRED** to platform architecture planning | No |
| F07 | Native reminders, permissions and lifecycle | **DEFERRED** to platform architecture planning | No |

## 2. Approved current redesign direction

### D06 — M1 owner review round 3

The owner rejected the Round 2 ivory/cream direction and custom capsules at `2b0a492be6c40b1068c312b49ce2acbfc3cca7f4`. D06 **supersedes D05's palette/navigation recommendation**. After reviewing `764ac233f3acfd68e6c3fcf94b33b86c9c1656b9`, the owner approved **Porcelain**, **Midnight Spectrum**, **Magic UI Dock (Concept A)**, the existing mobile dock, financial activity, expense review, tracker migration and interaction patterns.

The selected themes retain white/cool near-white with lavender/blue/pink supporting regions and controlled dark violet/cyan/plum, one restrained focal blend and static active-icon glow. No flashing, moving backgrounds or glowing body text. Gallery white / Graphite blue and Radix Concept B remain historical comparison options. See the [library evaluation](REDESIGN_M1_COMPONENT_GUIDE.md#navigation-library-evaluation--round-3).

**Latest M1 refinement:** bottom-centered placement, slim proportions and themes are approved. Keep desktop widths static and retain safe-area/content/focus clearance and short-viewport fallback. Replace the rejected large filled active capsule with stronger text, a restrained icon border and small indicator line. Modules and More must expand upward in a dock-centered, connected nonmodal panel on desktop/mobile, with Escape/outside dismissal, appropriate entry/return focus, a single open menu and reduced-motion support. Do not use the previous right sidebar. This synthetic-only refinement awaits manual owner review; no screenshots, gallery updates, broad regression campaign, automatic merge or M2/M3 implementation.

The Round 3 mobile clipping correction uses document flow for browsing, shared header/content scroll, dock/safe-area/focus clearance and verified initial/returned Home action geometry. The dedicated expense task retains its separate body/actions and short-height fallback. The supported Next development indicator configuration keeps manual review unobstructed; do not hide application overlaps. M1 remains synthetic-only, M2 owns real routing/permissions/navigation and its production layout contract, and M3 owns real expense create/edit. Review the current desktop correction in the local browser before assigning another milestone; the [earlier renders](verification/assets/redesign-m1/README.md) remain historical evidence.

### D05 — Previous M1 review (color/navigation superseded by D06)

The owner partially approved the first M1 proofs at `8f0bab785af69b612901fd3dc868953cf90920de`: overall financial activity layouts, tracker migration, interaction states and broad redesign direction. Final visual approval was **not** granted. This newer feedback refines D01/D03/D04; the earlier light palette and navigation proposal are not immutable.

Required refinements: compare bright warm ivory with soft cream in real renders and recommend one; increase purposeful violet, teal, blue, amber and plum variation in both themes; replace text-only record affordances with recognizable native links; and demonstrate **floating capsule navigation as a mandatory product pattern**. Desktop uses an elevated compact icon-and-label capsule with integrated module switching. Mobile uses detached Home / Calendar / Modules / More with safe-area space, readable labels, focus and keyboard/zoom fallback. Opaque floating navigation is required; decorative glass and wallpaper remain discouraged.

M1 demonstrates synthetic prototypes only. **M2** owns actual application-wide capsule navigation, capability-aware routing, authentication and directory integration. **M3** owns dedicated full-screen mobile expense create/edit, a separate explicit review, draft-preserving Edit, confirmation and authoritative recovery states. No real financial routes, payloads, command identities or services change in this revision. Revised visuals remain **pending owner re-review**, with no automatic merge or next-milestone start. See [review evidence](verification/assets/redesign-m1/README.md).

### D01 — Approved redesign direction and implementation boundary

- **Class:** CURRENT REDESIGN + FUTURE-READY FOUNDATION.
- **Approved decision:** adopt the warm, modern personal-workspace presentation, compact application frame, integrated module switcher rather than a mandatory permanent global sidebar, contextual navigation/actions, adaptive list/detail layouts and user-focused interactions. All six milestones M1–M6 are approved as the roadmap.
- **Why it matters:** the proposal intentionally replaces the permanent sidebar and repetitive panel composition, changes the light primary-action treatment, and reorganizes access to implemented workflows. These should be deliberate owner choices.
- **Current refinement:** D06 updates [Plan Sections 4–6](COMPREHENSIVE_UI_UX_REDESIGN_PLAN.md#4-reference-image-analysis) to white-based light canvases, controlled dark accents and proven-component floating navigation. Keep violet/lavender identity, an integrated module switcher, local navigation and contextual detail. Mobile retains labeled Home, Calendar, Modules, More. Preserve all current URLs and business behavior.
- **Earlier alternatives:** previous canvas/capsule proposals are historical; D06 records the owner's newer instruction and pending visual choices.
- **Impact:** approval establishes the proposed visual supersession of the corresponding existing design-guideline roles. Product, architecture, database, financial and privacy authorities remain unchanged. It permits starting only the milestone(s) the owner subsequently assigns.
- **Implementation boundary:** planning approval is complete. M1 has been individually assigned and implemented; its rendered proofs await owner visual sign-off. No future architecture decision is needed.
- **Blocks current redesign:** **No**; direction approved. Implementation remains separately assigned.
- **Only affects future migration:** **No**.
- **Review evidence:** the complete plan and route inventory now; representative rendered Home, financial review, dense record list and tracker-migration proofs during M1 before broad adoption.

**Owner's final decision: APPROVED — October 17, 2026 (Asia/Manila).** Preserve every V1–V3 capability, financial rule, privacy/security/authorization guarantee and historical behavior. Approval authorizes the direction and roadmap, not automatic implementation. M1 representative rendered layouts remain subject to usability/accessibility review before broad adoption.

## 3. Approved current identity, visual system and density

### D02 — Approved working identity; final branding deferred

- **Class:** CURRENT REDESIGN; assets also carry into FUTURE-READY FOUNDATION.
- **Approved decision:** use **Personal workspace** as the neutral working application identity. The repository name is tentative and is not the final product brand.
- **Why it matters:** window titles, first-launch screens, Help, installed-app identity and export wording need a stable name eventually.
- **Approved working choice:** use **Personal workspace** in design proofs and retain the repository name only to identify the project. Final branding remains a later owner decision.
- **Alternatives:** a distinct short product name or a descriptive utility name; a personal portfolio connection can remain in color/type without copying its logo.
- **Impact:** later text/asset substitution; do not hardcode brand geometry into navigation or business components. Naming/trademark availability research is a separate task once candidates exist.
- **Postponement:** no effect on M1–M6 foundations, functionality or acceptance. Final branded distribution assets wait; current web production launch is not a requirement.
- **Blocks current redesign:** **No**.
- **Only affects future migration:** **No**; native app icons and store assets are future applications of the choice.

**Owner's final decision: WORKING IDENTITY APPROVED; FINAL BRANDING DEFERRED — October 17, 2026 (Asia/Manila).** The owner will choose the final product name, wordmark, logo and native application branding during future Windows/Android planning and development. Create no speculative branding assets. Keep text/assets and navigation geometry flexible for later substitution; final branding does not block M1–M6.

### D03 — Brand connection and color emphasis

- **Class:** CURRENT REDESIGN + FUTURE-READY FOUNDATION.
- **Approved identity, refined by D06:** violet/lavender, Geist, consistent light/dark modes, centralized semantic tokens and accessibility/contrast remain. White-based light canvases and controlled dark spectrum accents replace the previous warm-canvas proposal; rendered acceptance remains pending.
- **Why it matters:** the previous guidelines explicitly reference that visual family, while the new references introduce warmer and more varied color.
- **Approved choice:** retain violet/lavender and Geist with Porcelain / Midnight Spectrum under D06. Complementary blue/cyan, teal and plum support content independently of feedback meaning. Strong violet light actions and lavender dark actions remain.
- **Earlier alternatives:** warm ivory/cream are rejected historical iterations. Final brand assets remain deferred under D02.
- **Impact:** centralized token changes and representative contrast/layout checks. Do not introduce another icon/font/component system to express a color preference.
- **Validation:** M1 rendered proofs validate the approved palette and all relevant contrast states before broad screen conversion; token calculations alone do not certify the interface.
- **Blocks current redesign:** **No**; D01 is approved.
- **Only affects future migration:** **No**.

**Owner's final decision: APPROVED — October 17, 2026 (Asia/Manila).** [Plan Section 5](COMPREHENSIVE_UI_UX_REDESIGN_PLAN.md#5-visual-identity-and-design-tokens) is authoritative for the new visual direction.

### D04 — Everyday density and navigation emphasis

- **Class:** CURRENT REDESIGN + FUTURE-READY FOUNDATION.
- **Approved decision:** balanced density: comfortable everyday readability; information-rich desktop records/tables; keyboard/mouse efficiency; mobile-friendly targets/forms; adaptive layouts instead of compressed desktop interfaces; consistent navigation and interaction across screen sizes.
- **Why it matters:** information density and switcher discoverability should reflect actual use rather than screenshot aesthetics.
- **Recommended choice:** comfortable default controls, aligned dense desktop records, larger mobile targets, no mandatory sidebar, and a complete visible module directory. Keep keyboard Find a screen as an accelerator, never the sole path. Avoid persistent custom pins/layout settings until an actual supported preference model is scoped.
- **Validation boundary:** review representative M1 rendered layouts for usability/accessibility. Material changes to the approved navigation/density direction require review; no new persistent density/layout preference is approved.
- **Impact:** layout and interaction choices only. Breakpoint behavior follows available width and input; no architecture change is needed.
- **Validation:** apply the approved balanced approach; collect task feedback during M1/M2 and verify affected layouts in M6.
- **Blocks current redesign:** **No**.
- **Only affects future migration:** **No**.

**Owner's final decision: APPROVED — October 17, 2026 (Asia/Manila).** Representative M1 rendered layouts remain subject to usability and accessibility review.

## 4. Future Windows/Android migration decisions

**Owner deferral recorded: October 17, 2026 (Asia/Manila).** All F01–F07 decisions wait for the dedicated platform architecture planning phase **after the current redesign and before native application implementation**. Recommendations and alternatives below are preserved as provisional design guidance, not approved technical decisions. The high-level direction remains Windows desktop and Android, mostly offline personal functionality, device-local private data and selected online collaboration. Select no runtime, replacement database, cloud provider, encryption mechanism, sync protocol or local authentication system here; preserve the current web architecture. All items here remain **FUTURE MIGRATION — PROVISIONAL / UNRESOLVED**. They affect the future screen concepts in [Plan Section 13](COMPREHENSIVE_UI_UX_REDESIGN_PLAN.md#13-future-offline-first-windows-and-android-ux). They do not add tasks or dependencies to the current six milestones.

### F01 — Client runtimes and reuse boundary

- **Decision:** choose Windows runtime/packaging and Android framework, including native versus shared presentation.
- **Why it matters:** determines which React/DOM components can actually transfer, native accessibility/input, installation, update and lifecycle behavior.
- **Recommendation:** decide in a separate architecture phase after redesign, using prototypes of an exact-money command, list/detail workflow, local recovery and native lifecycle. Preserve tokens and interaction contracts now.
- **Alternatives:** Windows webview-based client or native Windows UI; native Android or an approved cross-platform framework. These are options, not selected technologies.
- **Impact:** FUX01–FUX20 implementation and native-equivalent libraries. Next.js server components do not automatically run offline inside a package.
- **Postponement:** no visual/specification rework is required merely to defer the runtime; some native control metrics will adapt later.
- **Blocks current redesign:** **No**. **Future-only:** **Yes**.

**Owner's final decision: DEFERRED — October 17, 2026 (Asia/Manila)** to the platform architecture phase defined above. No technical recommendation in this item is approved.

### F02 — Local profile model and identity relationship

- **Decision:** single versus multiple local profiles, profile selection, and how a local profile connects to an optional online identity.
- **Why it matters:** affects first launch, isolation, switching, returning users and collaboration consent. A display profile is not equivalent to an authenticated cloud account.
- **Recommendation:** one local profile initially, optional online connection only when needed; design profile management so multiple profiles could be added without making current onboarding complex. Explicitly define local/online identity mapping before collaboration.
- **Alternatives:** multiple isolated profiles at launch; separate device installations per user; optional multi-device identity after a later synchronization decision.
- **Impact:** FUX01–FUX04, FUX06/FUX07/FUX14/FUX16. Requires future data ownership/isolation rules.
- **Postponement:** current Better Auth sign-in and one personal workspace per owner remain unchanged. Current Setup/Settings redesign proceeds.
- **Blocks current redesign:** **No**. **Future-only:** **Yes**.

**Owner's final decision: DEFERRED — October 17, 2026 (Asia/Manila)** to the platform architecture phase defined above. No technical recommendation in this item is approved.

### F03 — Device-local security and recovery

- **Decision:** storage encryption, key management, OS credentials/biometrics, app lock, and lost-key/device recovery.
- **Why it matters:** determines whether unlock, protection badges and recovery promises are truthful. Offline/local does not itself mean encrypted or recoverable.
- **Recommendation:** use platform-supported protection where appropriate after threat-model and recovery design; clearly disclose unrecoverable cases. Keep protection and backup status distinct.
- **Alternatives:** OS-only protection; application-managed encrypted storage; optional lock. Each requires explicit risk/recovery evaluation rather than a cosmetic PIN screen.
- **Impact:** FUX02/FUX04–FUX06/FUX13–FUX15. Exact copy and actions cannot be finalized before guarantees exist.
- **Postponement:** no effect on current authentication/security controls or theme/component work.
- **Blocks current redesign:** **No**. **Future-only:** **Yes**.

**Owner's final decision: DEFERRED — October 17, 2026 (Asia/Manila)** to the platform architecture phase defined above. No technical recommendation in this item is approved.

### F04 — Online feature scope and shared-data authority

- **Decision:** which features/data are online, group authentication/membership model, cached group access, and boundaries between shared evidence and private local records.
- **Why it matters:** determines status labels, invitations, privacy notices, access revocation and what can remain visible offline.
- **Recommendation:** personal tracking stays device-local by default; shared-group facts have a distinct authoritative collaboration service; private financial adoption remains explicit. No assumption that every personal feature synchronizes.
- **Alternatives:** online-only group access; limited approved offline group reading; optional private sync as a separately consented later feature.
- **Impact:** FUX07–FUX12/FUX16 and migration of trusted group provenance. Cloud provider selection is an architecture task, not a UI decision.
- **Postponement:** current shared server authority, manual invitation handoff, feature flags and private consent remain. Current group redesign is fully specified.
- **Blocks current redesign:** **No**. **Future-only:** **Yes**.

**Owner's final decision: DEFERRED — October 17, 2026 (Asia/Manila)** to the platform architecture phase defined above. No technical recommendation in this item is approved.

### F05 — Offline group writes, queues and conflict policy

- **Decision:** whether disconnected group changes are drafts, queued commands or unavailable; how acknowledgements, retries, stale sources and conflicts resolve.
- **Why it matters:** a pending change must not look like a confirmed settlement. Financial history and participant confirmation cannot use an unexamined last-write-wins policy.
- **Recommendation:** initially require connection for group writes and confirmations. Allow offline drafts only after durable local storage and privacy are designed. Introduce queues/conflict screens only if actual synchronization semantics require them.
- **Alternatives:** carefully constrained queued commands with durable idempotency and explicit server acknowledgement; read-only cached groups; no offline group access.
- **Impact:** FUX08–FUX12. Requires concurrency/revocation/replay decisions and financial invariants before implementation.
- **Postponement:** current commands continue their existing online pending/unknown/retry behavior. No offline queue is added to M1–M6.
- **Blocks current redesign:** **No**. **Future-only:** **Yes**.

**Owner's final decision: DEFERRED — October 17, 2026 (Asia/Manila)** to the platform architecture phase defined above. No technical recommendation in this item is approved.

### F06 — Backup, existing V3 data migration, restoration and deletion

- **Decision:** portable format/version policy, attachment bytes, encryption, destination, create-new versus replace, recovery retention and local/remote deletion scope.
- **Why it matters:** current graph exports and trusted shared provenance cannot be assumed to be complete native backups or valid on unrelated devices. Users need predictable recovery.
- **Recommendation:** define explicit coverage and compatibility, preflight validation and exact preview before restoring. Keep CSV/report exports separate from complete backup. Prefer creating a separate restored profile when the future ownership model safely supports it; replacement requires stronger confirmation and recovery.
- **Alternatives:** private-only migration with later group reconnection; reviewed compatible graph import; complete encrypted backup after attachment/key handling is designed.
- **Impact:** FUX13–FUX16/FUX18, app upgrade failure recovery and existing-user transition.
- **Postponement:** current 24-hour recovery, graph/file limits, proof rules and deletion lifecycle remain as implemented; their current UI can be redesigned now.
- **Blocks current redesign:** **No**. **Future-only:** **Yes**.

**Owner's final decision: DEFERRED — October 17, 2026 (Asia/Manila)** to the platform architecture phase defined above. No technical recommendation in this item is approved.

### F07 — Native reminders, permissions and application lifecycle

- **Decision:** local scheduled notifications, optional online channels, background execution, device restart behavior, permission denial and application update/close semantics.
- **Why it matters:** native platforms impose different delivery and background limits. Reminder wording must distinguish scheduled intent from guaranteed delivery.
- **Recommendation:** ask for permission in context, show useful fallback/recovery, preserve date-only/timed/source-generation distinctions, and disclose platform constraints. Keep security messages separate from optional reminders where online identity exists.
- **Alternatives:** in-app reminders only initially; local notifications plus optional online delivery after lifecycle verification.
- **Impact:** FUX08/FUX17/FUX18, device settings links and returning-user feedback.
- **Postponement:** current in-app and explicitly opted-in delivery semantics remain unchanged. No current milestone needs native permission or notification APIs.
- **Blocks current redesign:** **No**. **Future-only:** **Yes**.

**Owner's final decision: DEFERRED — October 17, 2026 (Asia/Manila)** to the platform architecture phase defined above. No technical recommendation in this item is approved.

## 5. Approved change-impact verification and next assignment

**Owner approval recorded: October 17, 2026 (Asia/Manila).** Replace the proposed automatic comprehensive V1–V3 regression campaign with targeted, risk-based verification.

M1–M5 verify changed components/screens/workflows, affected shared contracts and materially affected existing functionality. Include appropriate browser, responsive, theme, keyboard and accessibility checks, and financial, authorization, privacy and lifecycle invariants wherever changed flows could affect them. Do not automatically repeat unrelated backend/database/infrastructure/performance/browser suites.

M6 is final **redesign-wide acceptance**: complete screen/route coverage, cross-module navigation/contextual links, visual consistency, responsive layouts, both themes, keyboard/accessibility, shared presentation components, consequential workflows, changed UI performance and affected existing behavior. Meaningful cross-screen browser/accessibility coverage remains required because most screens change. It is not an automatic complete V1–V3 regression campaign.

Broaden verification only for changed shared contracts, discovered failures or significant security/financial integrity risks. Preserve existing assertions, mandatory correctness guarantees and unchanged CI. Historical evidence supports unchanged behavior, not newly redesigned interfaces. Record executed tests, actual results, coverage, exclusions and rationale.

**M1 implementation checkpoint — October 17, 2026:** individually assigned M1 is implemented and technically checked; see [handoff](REDESIGN_M1_HANDOFF.md). Owner visual review and any feedback remain pending before M2. Final branding and F01–F07 remain deferred and non-blocking. The original planning assignment started no milestone; this checkpoint records the subsequent M1 implementation assignment.
