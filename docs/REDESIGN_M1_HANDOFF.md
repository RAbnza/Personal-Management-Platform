# M1 implementation handoff

October 17, 2026 (Asia/Manila). **M1 only: implemented and technically checked; owner visual sign-off pending.** M2–M6, native architecture, offline behavior and production deployment have not started. The complete application has not been redesigned.

## Owner review revision before M2

The owner reviewed `8f0bab785af69b612901fd3dc868953cf90920de` and partially approved overall financial activity layouts, migration, interaction states and broad direction. **Final visual approval was not granted.** This revision implements D05's required refinements on the same branch: bright ivory versus soft cream renders, richer violet/teal/blue/amber/plum roles, floating desktop/mobile capsules, explicit record-link affordances and separate expense entry/review task views with retained notes/description. The latest renders await **another owner review**; partial approval of the earlier structure is not approval of these new visuals.

Recommend **bright ivory** for a brighter, airy work area and strong separation from content; soft cream is a warmer comparison, not a new persistent theme. All colors remain centralized. No new dependencies, actual shell integration, real expense routes, financial commands/services, schema or CI changes. M2 owns real capsule navigation/capability/authentication/directory behavior. M3 owns dedicated mobile expense create/edit, explicit review, draft retention and authoritative result/recovery through unchanged contracts.

The mobile capsule has reserved viewport space, not content underneath it; task entry/review instead uses a dedicated scroll body and a separate action area. Focused editable controls yield capsule space, and short/high-zoom viewports use document flow. These are tested prototype policies; real software keyboards/safe-area devices and manual assistive technology remain unverified. See the [current review index](verification/assets/redesign-m1/README.md) and [revision verification](verification/REDESIGN_M1_RESULTS.md#owner-review-revision-verification) for actual checks and limitations. The original delivery record below remains historical where marked.

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

Open the [screenshot index](verification/assets/redesign-m1/README.md) for refreshed light/dark desktop/mobile compositions, ivory/cream comparisons, separate expense review and interaction states. All are synthetic browser captures. Mobile images now show the actual bounded viewport with independently scrollable content; desktop images show complete composition. Intermediate 768px views are tested and reproducible.

Run `pnpm dev --port 3200`, then visit `http://localhost:3200/dev/design`. Home demonstrates asymmetric snapshot/attention/activity composition; financial activity switches between one desktop table/detail and one compact mobile list with a full detail destination; expense demonstrates draft/review/validation/submitting/accepted/uncertain presentation; migration demonstrates mapping, bounded samples, preserved history, exact committed counts, cancellation and explicit resume.

Proof actions are clearly labeled fixtures. Expense confirmation requires an explicit synthetic accepted response; it does not fabricate server success after a timer. Migration consumes fixture snapshots in manual batches of at most 50. Real workflows and their source contracts remain in their existing domain components for later milestones.

## Focused verification

Final executed checks and cost observations are recorded in [verification results](verification/REDESIGN_M1_RESULTS.md). Reproduce with:

```powershell
pnpm exec vitest run tests/unit/button.component.test.tsx tests/unit/panel.component.test.tsx tests/unit/theme-select.component.test.tsx tests/unit/workspace-theme-select.component.test.tsx tests/unit/app-shell.component.test.tsx tests/unit/redesign-patterns.component.test.tsx tests/unit/design-proof-gate.test.ts --maxWorkers=1
pnpm exec playwright test --config=playwright.redesign.config.ts
pnpm lint
pnpm typecheck
pnpm exec prettier --check src/app/dev/design/page.tsx src/app/dev/design/proofs.tsx src/app/dev/design/expense-proof.tsx src/app/dev/design/product-navigation.tsx src/app/dev/design/proofs.module.css src/components/patterns/navigation-capsule.tsx src/components/patterns/work-area.tsx src/styles/tokens.css tests/redesign/foundations.spec.ts
pnpm build
```

The isolated browser config starts its own dev server, needs no database/worker/account setup and rejects all API requests. Stop any review server on 3200 first. It defaults to installed Microsoft Edge; use `PMP_BROWSER_CHANNEL` for another available Chromium channel. The production probe is separate: after the build, start `pnpm exec next start --port 3300` and run `pnpm exec tsx scripts/testing/redesign-m1-production.ts`. It checks only proof exclusion and existing sign-in appearance/client validation; no credentials are submitted. This local build probe is not a standalone deployment certification.

Verified browser behavior includes text contrast in real normal/hover/pressed/disabled controls, readable labels, error associations, unknown versus zero, visible focus, modal containment/restoration, safe initial confirmation focus, menu enabled-item navigation, native disclosures, selected-row cues, one active responsive list, explicit filters, 320px reflow, 200% text, 400%-equivalent CSS viewport, forced-color focus, System theme and reduced motion. Axe was run against every proof/theme/width combination. Visual inspection additionally caught a compressed mobile select and a hidden focal amount that automated token calculations alone would have missed.

The original M1 financial form checks verified exact payloads, review/confirmation and retry behavior across its changed primitive boundary; the revision does not modify those forms or primitives and reruns the 31 affected foundation/component checks above. Initial concurrent build/test execution caused unit test timeouts; affected files were rerun with one worker without changing assertions or time budgets. An initial matcher test used the documented but absent Next test export; corrected to the installed API. All corrected checks must pass before commit.

Excluded by impact: complete V1–V3 suites, database/integration/financial service reacceptance, containers, backups/recovery, notification workers and full household performance campaign. None of those implementations changed. No new production/CI or full-app accessibility certification is claimed.

## Trade-offs and remaining acceptance

The semantic table remains native; no speculative table sorting or second server-state lifecycle was installed. Radix additions are version-aligned to existing Dialog. See [component guide](REDESIGN_M1_COMPONENT_GUIDE.md) for dependencies, tokens and use contracts.

The approved detail split remains at 1280px rather than forcing it at 1024px; this keeps a useful 600px list and 340–400px detail region. Below it, the proof opens a full detail destination. Later domains must preserve their canonical URLs and safe return context; `/dev/design` query parameters are review-only. The collapsed review toolbar is distinct from the product capsule prototype. Its representative module/More disclosures and single Calendar sample do not implement the real M2 directory or M4 Calendar.

Remaining owner checkpoint: inspect hierarchy, warmth, density, narrow-screen reading effort, exact financial review clarity and migration cancellation/resume wording. Record feedback and resolve it before M2. No visual acceptance is inferred from passing tests or screenshots.

Manual NVDA/Narrator speech, TalkBack, real Android/software keyboard, real-device touch and low-end hardware checks were not available in this session. These remain explicit follow-up verification, not claimed results. Production standalone packaging warnings and limits of the available before/after performance artifact are recorded with the measurements.

The milestone/decision/plan headers, design guidelines and blueprint/system architecture status notes link this checkpoint. Architecture/product definitions and future F01–F07 decisions remain unchanged. Subsequent work begins only after owner review and a separate milestone assignment.
