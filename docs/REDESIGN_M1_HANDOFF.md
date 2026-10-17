# M1 implementation handoff

October 17, 2026 (Asia/Manila). **M1 only: implemented and technically checked; owner visual sign-off pending.** M2–M6, native architecture, offline behavior and production deployment have not started. The complete application has not been redesigned.

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

Open the [screenshot index](verification/assets/redesign-m1/README.md): 16 light/dark desktop/mobile compositions and one expense receipt, about 2.4 MB total. All are synthetic browser captures. Intermediate 768px views are tested and reproducible without retaining another binary set.

Run `pnpm dev --port 3200`, then visit `http://localhost:3200/dev/design`. Home demonstrates asymmetric snapshot/attention/activity composition; financial activity switches between one desktop table/detail and one compact mobile list with a full detail destination; expense demonstrates draft/review/validation/submitting/accepted/uncertain presentation; migration demonstrates mapping, bounded samples, preserved history, exact committed counts, cancellation and explicit resume.

Proof actions are clearly labeled fixtures. Expense confirmation requires an explicit synthetic accepted response; it does not fabricate server success after a timer. Migration consumes fixture snapshots in manual batches of at most 50. Real workflows and their source contracts remain in their existing domain components for later milestones.

## Focused verification

Final executed checks and cost observations are recorded in [verification results](verification/REDESIGN_M1_RESULTS.md). Reproduce with:

```powershell
pnpm exec vitest run tests/unit/button.component.test.tsx tests/unit/panel.component.test.tsx tests/unit/theme-select.component.test.tsx tests/unit/workspace-theme-select.component.test.tsx tests/unit/app-shell.component.test.tsx tests/unit/transaction-create-form.component.test.tsx tests/unit/financial-action-review-form.component.test.tsx tests/unit/trackers.component.test.tsx tests/unit/redesign-patterns.component.test.tsx tests/unit/design-proof-gate.test.ts --maxWorkers=1
pnpm exec playwright test --config=playwright.redesign.config.ts
pnpm lint
pnpm typecheck
pnpm format:check
pnpm build
```

The isolated browser config starts its own dev server, needs no database/worker/account setup and rejects all API requests. Stop any review server on 3200 first. It defaults to installed Microsoft Edge; use `PMP_BROWSER_CHANNEL` for another available Chromium channel. The production probe is separate: after the build, start `pnpm exec next start --port 3300` and run `pnpm exec tsx scripts/testing/redesign-m1-production.ts`. It checks only proof exclusion and existing sign-in appearance/client validation; no credentials are submitted. This local build probe is not a standalone deployment certification.

Verified browser behavior includes text contrast in real normal/hover/pressed/disabled controls, readable labels, error associations, unknown versus zero, visible focus, modal containment/restoration, safe initial confirmation focus, menu enabled-item navigation, native disclosures, selected-row cues, one active responsive list, explicit filters, 320px reflow, 200% text, 400%-equivalent CSS viewport, forced-color focus, System theme and reduced motion. Axe was run against every proof/theme/width combination. Visual inspection additionally caught a compressed mobile select and a hidden focal amount that automated token calculations alone would have missed.

Existing financial form tests verify exact payloads, review/confirmation and retry behavior across the changed primitive boundary. Initial concurrent build/test execution caused unit test timeouts; affected files were rerun with one worker without changing assertions or time budgets. An initial matcher test used the documented but absent Next test export; corrected to the installed API. All corrected checks must pass before commit.

Excluded by impact: complete V1–V3 suites, database/integration/financial service reacceptance, containers, backups/recovery, notification workers and full household performance campaign. None of those implementations changed. No new production/CI or full-app accessibility certification is claimed.

## Trade-offs and remaining acceptance

The semantic table remains native; no speculative table sorting or second server-state lifecycle was installed. Radix additions are version-aligned to existing Dialog. See [component guide](REDESIGN_M1_COMPONENT_GUIDE.md) for dependencies, tokens and use contracts.

The detail split uses 1280px rather than forcing it at 1024px; this keeps a useful 600px list and 340–400px detail region. Below it, the proof opens a full detail destination. Later domains must preserve their canonical URLs and safe return context; the proof's `/dev/design` query parameters are not a proposed app navigation contract. Development proof navigation is a review toolbar, not the M2 module switcher or mobile dock.

Remaining owner checkpoint: inspect hierarchy, warmth, density, narrow-screen reading effort, exact financial review clarity and migration cancellation/resume wording. Record feedback and resolve it before M2. No visual acceptance is inferred from passing tests or screenshots.

Manual NVDA/Narrator speech, TalkBack, real Android/software keyboard, real-device touch and low-end hardware checks were not available in this session. These remain explicit follow-up verification, not claimed results. Production standalone packaging warnings and limits of the available before/after performance artifact are recorded with the measurements.

The milestone/decision/plan headers, design guidelines and blueprint/system architecture status notes link this checkpoint. Architecture/product definitions and future F01–F07 decisions remain unchanged. Subsequent work begins only after owner review and a separate milestone assignment.
