# M1 implementation handoff

October 17, 2026 (Asia/Manila). **M1 only: themes, overall visual direction, bottom-centered placement and slim dock proportions approved; refined active state and expanding dock menus await manual owner review.** M2–M6, native architecture, offline behavior and production deployment have not started. The complete application has not been redesigned.

## Active state and upward dock menus

Baseline `d85a7314bce07090c966e085f8f286d2afb16d20`. Selected Magic UI Dock destinations now use stronger text, a restrained icon border and a small indicator line, with no large filled active capsule or colored active tile/glow. Desktop dimensions and the static 180ms hover tint remain. Mobile placement, proportions and icon/label layout remain.

Modules and More share one nonmodal Radix Popover anchored to the activated dock on desktop/mobile. The matching-width surface unfolds above the dock with a small connecting arrow and 180ms ease-out entrance; reduced motion disables the entrance. There is no right-edge sheet, backdrop, focus trap or body scroll lock. Only one menu is open at a time; switching menus focuses the first destination. Escape/Close restore the activating button; outside pointer/focus dismisses while preserving the outside target's focus. Buttons expose expanded/control semantics and the panel has a visible accessible title. M2 must inherit these behaviors and retain native destination links and focus outlines.

The panel remains above the dock and scrolls internally within available viewport height, including the existing <=500px document-flow dock fallback. No small-screen side-sheet fallback is used. Existing dock content/safe-area clearance remains. These are synthetic M1 destinations; application routing, capabilities, business logic and the legacy desktop Radix comparison remain outside this correction. No dependencies, screenshots or gallery updates. The owner reviews the current implementation at `http://localhost:3200/dev/design?nav=dock`; no automatic M1 sign-off, merge or M2/M3 start.

Verification: **7/7 directly affected checks passed** (two desktop hover checks plus five active/menu cases across light/dark desktop, 320/390px mobile and 320x500 short height). Assertions cover anchor centering/upward placement, unchanged dock bounds, current-state weight/line, initial/switch/return focus, Escape/Close/outside dismissal and reduced motion. Capture remained off for screenshots, trace and video. Targeted ESLint, `pnpm typecheck`, changed-source Prettier and `git diff --check` passed. Initial focused failures exposed duplicate-anchor positioning, corrected by one shared popover anchored to the activated dock; the short-height outside-click check also needed an actually uncovered point on the summary. No relaxed assertions, CI changes, full browser suite or unrelated checks. Visual acceptance remains manual.

## Desktop hover refinement (historical)

Baseline `d1404f5b91c569f82cb957379a1e81dab32ddf6a`. Compact desktop items now use fixed 5.625rem widths (90px at default text size), without Motion width expansion or CSS icon lift. Unselected hover/keyboard focus uses a subtle surface tint and accent text through a 180ms ease-out color/background transition; the selected destination retains its filled accent, active icon and marker. Reduced-motion and touch presentation disable the transition. Position, resting proportions, spacing, icons, labels, routing and the separate mobile interaction remain unchanged. No dependencies were added.

The affected dock check now asserts stable dock/item/icon geometry, selected-versus-hover state, keyboard focus and reduced-motion behavior in both themes. **2/2 targeted hover checks passed**, using an ignored temporary config with screenshot/trace/video capture disabled and the existing review server. Targeted ESLint (`magic-dock.tsx`, `foundations.spec.ts`), `pnpm typecheck`, changed-source Prettier and `git diff --check` passed. No screenshots, gallery updates, full browser suite or unrelated checks. The owner will review the hover feel at `http://localhost:3200/dev/design?nav=dock` and provide final M1 sign-off. No merge or M2 work.

## Desktop dock placement refinement (historical)

Baseline `764ac233f3acfd68e6c3fcf94b33b86c9c1656b9`. The owner selected **Porcelain + Midnight Spectrum + Magic UI Dock (Concept A)** and approved the existing mobile design, financial activity, expense review, migration and interaction patterns. Desktop A now floats at bottom center with horizontal icon/label items, a 60px pill and approximately 384px resting width at default text size. Hover expansion is restrained to 90–96px per item, with smaller icon tiles, subtle elevation and a clear current destination. Application identity remains at the top. No new dependencies.

Desktop reserves 6.5rem plus safe-area bottom clearance for final records, controls and expense actions; focused-target margins and document scroll-padding remain. It rests 1rem plus safe-area above the viewport bottom, stays fixed during ordinary scrolling and uses the existing short-height document-flow fallback at 500px or less. Text-relative desktop dimensions preserve scaling; touch/reduced-motion presentation is static. The separate mobile path and its design/placement are unchanged. Radix B remains a historical comparison.

Only focused lint/type/format validation is required for this correction; execution is recorded in [results](verification/REDESIGN_M1_RESULTS.md#final-desktop-dock-refinement). The existing magnification test retains its assertions with updated compact desktop width expectations. No screenshots were generated, recaptured or changed, and the gallery still shows the earlier desktop proportions. Review the current implementation at `http://localhost:3200/dev/design?nav=dock`. Appearance, placement, scrolling and proportions require the owner's manual browser review. Do not merge or start M2.

## Owner review Round 3 before M2 (historical)

Baseline `2b0a492be6c40b1068c312b49ce2acbfc3cca7f4`, clean local branch matching fetched origin. The owner rejected ivory/cream and the prior custom capsules. **D06 supersedes those recommendations; final visual approval remains pending.** The overall activity architecture/readability, distinct expense entry/review, migration and shared states are preserved.

Recommend **Porcelain + Midnight spectrum + Magic UI Dock (A)** for the next visual review: cool near-white canvas, white working surfaces, lavender/blue/pink regions, and controlled violet/cyan/plum accents in dark mode. A focal blend and static active-icon glow add personality without moving backgrounds. **Gallery white / Graphite blue** and **Radix floating segments/ink rail (B)** are actual functioning alternatives, not owner-approved selections or persisted preferences.

Researched Aceternity, Magic UI and shadcn/Radix sources before implementing. A retains MIT Magic UI distance/transform/spring mechanics with persistent labels and a static mobile/reduced-motion treatment; B uses Radix Navigation Menu desktop disclosures and existing Radix sheets on mobile. Lucide stays unchanged. Exact additions: `motion` 14.3.0 and `@radix-ui/react-navigation-menu` 1.4.1. Licenses, mobile limitations and reuse contracts are in the [component guide](REDESIGN_M1_COMPONENT_GUIDE.md#navigation-library-evaluation--round-3); measured runtime/production costs are in [results](verification/REDESIGN_M1_RESULTS.md).

The clipping investigation found a height-capped main scroller under a stationary review/app frame. A fresh 390x700 baseline initially had no overlap (title top 137px, action 211-259px), so the supplied finding is not generalized as every fresh load failing. Scrolling that main independently crops the top content at the stationary frame; it also leaves a second scroll coordinate for focus/restoration. Browsing now uses **document flow**, moving toolbar, frame and content together, with dock/safe-area bottom clearance and focused-target margins. Tests check initial/returned Home and Add expense geometry, disclosure expansion, 320/390/768px and desktop, short heights and enlarged text. The 320x500 / 200% text check also exposed an actual 404px Home overflow from minimum-content grid sizing. Explicit zero-minimum tracks, responsive focal typography/padding, wrapping attention headers and long-word wrapping fix it without truncating values. Enlarged navigation labels wrap around compact icons. The dedicated expense task alone retains its bounded body/actions and short-height fallback. Its focus effect now reacts only to actual presentation-state changes, avoiding an initial Strict Mode replay scroll during fast Back navigation. M2 must preserve this browsing layout contract and domain-appropriate history restoration.

`devIndicators: false` is the installed Next documented configuration for unobstructed **manual and automated** review; errors still surface. Screenshot-only hiding of the diagnostics portal was removed. This does not suppress any application overlap. Real Android/IME, manual screen-reader and device touch/zoom checks remain unverified.

M1 only: no real shell/routes, permissions, financial calculations, payloads, command/retry semantics, services, schema or CI changes. M2 owns real application navigation and M3 real expense create/edit. Nothing is merged automatically. Review the [actual comparisons](verification/assets/redesign-m1/README.md) before assigning another milestone.

## Baseline and scope

Started with a clean `main` at the approved planning commit `265c3f2f64e1539e2b4279f3e245282358841d3c`; fetched origin and confirmed the same remote baseline. Implementation branch: `feat/redesign-m1-foundations`. The pushed commit is the commit containing this handoff (resolve with `git rev-parse HEAD` and `git ls-remote origin refs/heads/feat/redesign-m1-foundations`); the completion report records its exact SHA. No automatic merge.

Inspected the approved plan, M1 roadmap, decision register, design guidelines, financial/product rules, frontend architecture and database scalar/ownership rules; the five references; UI/shell/styles and their form/list/theme consumers; affected tests; and installed Next 16.3.8 documentation for CSS, Server/Client Components, testing, notFound and proxy. Current stack: Node 24.21.0, pnpm 12.9.1, React 19.2.8 and Tailwind 4. The installed Next experimental test helper still exports `unstable_doesMiddlewareMatch`, despite the proxy guide naming its successor; the matcher test uses the actual installed export.

Changed areas:

- `src/styles/{tokens,globals}.css`: approved palette, roles, geometry, type hierarchy, 1600px work area, focus, explicit disabled colors, touch sizing, reduced motion, progress styling and corrected cascade layering.
- Existing Button/Input/Textarea/FormField interfaces retained; direct-field error/hint association improved without changing RHF registration or domain validation. Panel and the existing shell retain their structures and inherit the tokens.
- New Radix-backed dialog/sheet, safe confirmation, help popover and menu; native select/disclosure; IconButton and feedback patterns.
- `src/components/patterns`: WorkArea, ScreenHeader, DetailLayout, RecordTable, CompactRecordList, FilterBar, PageControls with cursor/offset adapters, Metric, CoverageNotice, ReviewSummary and all eight CommandStatus states.
- `src/app/dev/design`: four synthetic compositions plus interaction states. No API calls, real UUIDs, persisted forms, query caches or real data. The preview theme control affects the existing browser presentation cache only; authenticated workspace preference/version authority is unchanged.
- `src/proxy.ts`: matcher restricted to `/dev/design/:path*`, returning production HTTP 404 before a loading boundary streams. The page also calls notFound outside development. No authentication, authorization or supported app/API path is handled by this proxy.

No changes to `src/modules`, domain services/calculations, database/schema/migrations, command payloads/receipts/IDs/retries, immutable history, source Calendar/reminders, shared/private authority, lifecycle/restoration, supported routes or CI configuration.

## Review the actual renders

Open the [screenshot index](verification/assets/redesign-m1/README.md) for refreshed light/dark desktop/mobile compositions, white-based/dark-spectrum comparisons, separate expense review and interaction states. All are synthetic browser captures. Mobile comparison images show actual viewports with document scrolling for browsing; only expense tasks retain an independent body. Desktop images show complete compositions. Intermediate 768px views are tested and reproducible.

Run `pnpm dev --port 3200`, then visit `http://localhost:3200/dev/design`. Home demonstrates asymmetric snapshot/attention/activity composition; financial activity switches between one desktop table/detail and one compact mobile list with a full detail destination; expense demonstrates draft/review/validation/submitting/accepted/uncertain presentation; migration demonstrates mapping, bounded samples, preserved history, exact committed counts, cancellation and explicit resume.

Proof actions are clearly labeled fixtures. Expense confirmation requires an explicit synthetic accepted response; it does not fabricate server success after a timer. Migration consumes fixture snapshots in manual batches of at most 50. Real workflows and their source contracts remain in their existing domain components for later milestones.

## Round 3 verification (historical; not rerun for the final desktop correction)

Final executed checks and cost observations are recorded in [verification results](verification/REDESIGN_M1_RESULTS.md). Reproduce with:

```powershell
pnpm exec vitest run tests/unit/button.component.test.tsx tests/unit/panel.component.test.tsx tests/unit/theme-select.component.test.tsx tests/unit/workspace-theme-select.component.test.tsx tests/unit/app-shell.component.test.tsx tests/unit/redesign-patterns.component.test.tsx tests/unit/design-proof-gate.test.ts --maxWorkers=1
pnpm exec playwright test --config=playwright.redesign.config.ts
pnpm lint
pnpm typecheck
pnpm exec prettier --check src/app/dev/design/page.tsx src/app/dev/design/proofs.tsx src/app/dev/design/expense-proof.tsx src/app/dev/design/product-navigation.tsx src/app/dev/design/proofs.module.css src/components/patterns/magic-dock.tsx src/components/patterns/navigation-dock.module.css src/components/patterns/work-area.tsx src/styles/tokens.css tests/redesign/foundations.spec.ts next.config.ts scripts/testing/redesign-m1-bundle.ts
pnpm exec tsx scripts/testing/redesign-m1-bundle.ts
pnpm build
```

The isolated browser config starts its own dev server, needs no database/worker/account setup and rejects all API requests. Stop any review server on 3200 first. It defaults to installed Microsoft Edge; use `PMP_BROWSER_CHANNEL` for another available Chromium channel. The production probe is separate: after the build, start `pnpm exec next start --port 3300` and run `pnpm exec tsx scripts/testing/redesign-m1-production.ts`. It checks only proof exclusion and existing sign-in appearance/client validation; no credentials are submitted. This local build probe is not a standalone deployment certification.

Verified browser behavior includes text contrast in real normal/hover/pressed/disabled controls, readable labels, error associations, unknown versus zero, visible focus, modal containment/restoration, safe initial confirmation focus, menu enabled-item navigation, native disclosures, selected-row cues, one active responsive list, explicit filters, 320px reflow, 200% text, 400%-equivalent CSS viewport, forced-color focus, System theme and reduced motion. Axe was run against every proof/theme/width combination. Visual inspection additionally caught a compressed mobile select and a hidden focal amount that automated token calculations alone would have missed.

The original M1 financial form checks verified exact payloads, review/confirmation and retry behavior across its changed primitive boundary; the revision does not modify those forms or primitives and reruns the 31 affected foundation/component checks above. Initial concurrent build/test execution caused unit test timeouts; affected files were rerun with one worker without changing assertions or time budgets. An initial matcher test used the documented but absent Next test export; corrected to the installed API. All corrected checks must pass before commit.

Excluded by impact: complete V1–V3 suites, database/integration/financial service reacceptance, containers, backups/recovery, notification workers and full household performance campaign. None of those implementations changed. No new production/CI or full-app accessibility certification is claimed.

## Trade-offs and remaining acceptance

The semantic table remains native; no speculative table sorting or second server-state lifecycle was installed. Radix additions are version-aligned to existing Dialog. See [component guide](REDESIGN_M1_COMPONENT_GUIDE.md) for dependencies, tokens and use contracts.

The approved detail split remains at 1280px rather than forcing it at 1024px; this keeps a useful 600px list and 340–400px detail region. Below it, the proof opens a full detail destination. Later domains must preserve their canonical URLs and safe return context; `/dev/design` query parameters are review-only. The collapsed review toolbar is distinct from the two library-backed product navigation prototypes. Its representative module/More disclosures and single Calendar sample do not implement the real M2 directory or M4 Calendar.

Remaining owner checkpoint: inspect hierarchy, warmth, density, narrow-screen reading effort, exact financial review clarity and migration cancellation/resume wording. Record feedback and resolve it before M2. No visual acceptance is inferred from passing tests or screenshots.

Manual NVDA/Narrator speech, TalkBack, real Android/software keyboard, real-device touch and low-end hardware checks were not available in this session. These remain explicit follow-up verification, not claimed results. Production standalone packaging warnings and limits of the available before/after performance artifact are recorded with the measurements.

The milestone/decision/plan headers, design guidelines and blueprint/system architecture status notes link this checkpoint. Architecture/product definitions and future F01–F07 decisions remain unchanged. Subsequent work begins only after owner review and a separate milestone assignment.
