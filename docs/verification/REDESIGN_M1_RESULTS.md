# M1 targeted verification results

October 17, 2026 (Asia/Manila). Scope: design foundations, shared UI and synthetic proofs. Porcelain, Midnight Spectrum, Magic UI Dock A, mobile design and existing workflows are owner-approved; the final desktop correction awaits manual owner review. See [handoff](../REDESIGN_M1_HANDOFF.md), [contracts](../REDESIGN_M1_COMPONENT_GUIDE.md) and [historical screenshot index](assets/redesign-m1/README.md).

## Final desktop dock refinement

Baseline `764ac233f3acfd68e6c3fcf94b33b86c9c1656b9`, on `feat/redesign-m1-foundations`. Scope: bottom-centered desktop A, compact horizontal items, restrained magnification and desktop safe-area/content clearance. The mobile path, selected themes, dependencies and business behavior are unchanged.

| Check | Actual result |
| --- | --- |
| Targeted ESLint | Passed for `magic-dock.tsx`, `product-navigation.tsx` and the affected `foundations.spec.ts`. |
| TypeScript | `pnpm typecheck` passed (`next typegen && tsc --noEmit`). |
| Formatting / patch | Prettier passed for all five changed source/test files; `git diff --check` passed. |
| Existing dock assertions | Updated compact desktop resting/reduced-motion width to 90px and hover threshold to >94px; retained tile-growth, fixed-height and accessible-name assertions. Browser test not executed for this correction. |

No screenshots were generated or recaptured; gallery files are unchanged and predate these desktop proportions. No M1 browser suite, V1–V3 regression campaign, database checks, production build/probe or performance benchmarks were rerun. Appearance, placement, scrolling, proportions and device/assistive-technology acceptance remain the owner's manual browser review. No merge or M2 work.

## Owner review Round 3 verification (historical)

Baseline `2b0a492be6c40b1068c312b49ce2acbfc3cca7f4`, clean and matching fetched origin. D06 rejects warm ivory/cream and the prior capsules. Current white-based/dark-spectrum renders and two proven navigation concepts remain **pending owner approval**. No M2/M3 implementation.

| Check | Actual result |
| --- | --- |
| Selected component/theme/gate tests | **31 passed across 7 files**, one worker. No assertion/time-budget changes. |
| Browser geometry/accessibility/navigation/tasks | **83 distinct checks pass across the final main and affected reruns.** Main run: 81/83, then 16/16 affected expense/navigation checks (including both failures) after the focus correction; an additional 1/1 dock tile/reduced-motion check and 4/4 palette checks pass. The 40 screen/theme/width matrix scans and both navigation concepts pass axe/reflow/geometry; existing financial/migration assertions remain. |
| Lint / types / changed formatting | Repository-wide ESLint and `pnpm typecheck` passed; final changed JS/TS lint and all 12 changed source/config/package paths pass Prettier. The final production build also passes TypeScript. `git diff --check` and local evidence-link audit pass. |
| Production build, exclusion and sign-in | Final `pnpm build` passed. Build `l-S7tih-a34fQrI-Lz2rd`: proof HTTP **404**, all four sign-in theme/width cases pass axe/reflow/local validation focus/association. No credential submission. Sign-in client-reference closure **140,626 gzip bytes**, unchanged from Round 2. |
| Runtime/bundle impact | Isolated ESM harness (esbuild 0.28.2, minified, React external/CSS omitted): prior capsule **9,014 gzip bytes**, adapted dock **47,493** (**+38,479**), both complete prototype branches **86,202**. These standalone exports overlap existing app dependencies and are not additive route transfer, hydration or M2 budget certification. Current Next production sign-in closure remains unchanged at 140,626 gzip bytes. |

Resolved intermediate checks: the first matrix reached 72 passes before a Radix desktop reopening test failed on hover/click toggling; it was stopped and the interaction sequence corrected without dropping assertions. The next focused run passed 20/22 and exposed the real 404px enlarged-text overflow, then the strengthened main run passed 81/83 and exposed fast task/Back focus timing. The 16-test rerun covers the corrected task effect and both failed cases; no retries or relaxed timeout budgets were used. Reduced-motion hydration classes were made invariant and an explicit hydration-error assertion passes. Final dock geometry also verifies the visible tile grows while the dock frame stays fixed. The last palette check corrected inherited focal-gradient aliases in the two review alternatives; 4/4 rechecks assert actual computed-gradient changes and accessibility, and refresh their captures.

Actual review artifacts: **57 PNGs**, approximately **7.4 MB**, with representative renders manually inspected. The side-by-side HTML loads all **16** embedded images and passes desktop/mobile reflow. [Measurements](assets/redesign-m1/measurements.json) preserve earlier deliveries and add `ownerReviewRound3`; the final development observations are the 8 expense rerun samples, not a new production performance campaign. Existing broad tracing and Windows standalone EPERM symlink warnings remain; local `next start` verification is not standalone deployment certification.

The baseline 390x700 fresh view had main scroll 0, header top 137px and Add expense 211-259px, with no initial overlap. The independent main scroller nevertheless cropped top content below the stationary frame when scrolled, matching the class of clipping reported. Browsing now uses one document scroll, with reserved dock/safe-area space and focus margins. A new 320x500 / 200% text test also found a concrete **404px horizontal overflow**: implicit single-column grid tracks expanded to the Home focal/attention content's minimum width. Explicit zero-minimum tracks, responsive focal type/padding, wrapping attention headers and inherited long-word wrapping correct that cause without truncating amounts or hiding content. Mobile dock icons retain compact geometry while enlarged labels wrap; the skip link is bounded too. Geometry checks cover fresh/returned Home, Add expense, module/More disclosures, scroll, review-toolbar changes, short heights and enlarged text at 320/390/768/1440px. Task-only scroll/actions remain separate. A fast Home-to-expense-to-Back check also exposed initial task effect replay moving focus/scroll during navigation; focus now runs only when the command presentation state actually changes, and the browser waits for hydration before operating the new task. Financial command/data behavior is unchanged. The supported Next `devIndicators: false` configuration removes the development overlay for manual review too; tests no longer hide its portal with CSS.

Reproduction: `pnpm exec playwright test --config=playwright.redesign.config.ts`; selected component command in [handoff](../REDESIGN_M1_HANDOFF.md); `pnpm exec tsx scripts/testing/redesign-m1-bundle.ts`; `pnpm lint`; `pnpm typecheck`; targeted Prettier; `pnpm build`, then existing production probe on 3300. No unrelated V1-V3 database/financial/infrastructure campaign. The full formatter's 139 unchanged baseline failures are not rewritten. Real IME/device safe areas and manual assistive technology remain unverified; automated geometry/axe is not full device certification or owner visual acceptance.

## Round 2 revision verification (historical)

Baseline: `8f0bab785af69b612901fd3dc868953cf90920de`, clean local/remote M1 branch. The owner partially approved the activity architecture, migration and interaction patterns, and required warmer/richer palettes, capsule navigation, record affordances and distinct mobile expense task/review. **New renders are pending owner re-review.** M2/M3 implementation remains unstarted.

Focused component/theme/gate checks: **31 passed in 7 files** (redesign-patterns, design-proof-gate, Button, Panel, ThemeSelect, WorkspaceThemeSelect and AppShell). Actual domain form/command code did not change; its previous acceptance evidence below is historical and was not rerun speculatively. The revised browser suite preserves existing assertions for exact values, uncertainty, source links, native controls and migration semantics, and adds palette alternatives, capsule active destinations, safe-area clearance, module focus restoration, draft-preserving separate entry/review and keyboard-space checks. The final browser run passed **52/52 (2.2 minutes)**. Repository-wide ESLint, TypeScript and targeted changed-source Prettier checks passed. The existing full-format baseline remains 139 unchanged files; documentation/lockfile are excluded by the repository prettierignore.

**Current revision results:**

| Check | Actual result |
| --- | --- |
| Component/theme/production-gate tests | 31 passed across 7 files; one worker. |
| Browser proofs and interactions | 52 passed; all 30 screen/theme/width scans, ivory/cream comparisons, capsule navigation and separate expense tasks. Zero axe violations in selected WCAG A/AA tags. |
| Static checks | Repository-wide lint and typecheck passed; all 9 changed source/test paths pass Prettier; `git diff --check` and local evidence-document link audit pass. |
| Rendered evidence | 27 PNGs, approximately 2.75 MB; actual synthetic browser renders, manually inspected representative desktop/mobile/theme/task comparisons. |
| Production build and read-only boundary probe | `pnpm build` passed. Build `obYrcJrfW0hskpF_AR_es`: proof HTTP 404; all four sign-in width/theme cases pass axe, reflow and local invalid-field focus/association. Sign-in client-reference closure **140,626 gzip bytes**, unchanged from original M1. No credential submission. |

Build warnings remain the existing broad tracing patterns in `src/platform/files/local-test-adapters.ts` and Windows standalone EPERM symlink-copy warnings. The local `next start` probe is not standalone packaging/deployment certification. [Measurements](assets/redesign-m1/measurements.json) preserve the original delivery and add an `ownerReviewRevision` record with this build and 30 development observations; no new full performance campaign is claimed.

The capsule tests inject **34px** safe-area clearance and check content/last-record bounds against navigation, 48px targets, native links and keyboard access in both themes. Short viewport and editable-focus behavior simulate keyboard-space pressure; they are not real Android/IME certification. No new persisted background preference, private cache, dependency, real navigation registry or financial command was introduced.

Initial revision browser run: **50/52 passed**. Failures were a formerly unique summary selector matching the new review toolbar too, and a keyboard-focus assertion after native mouse interaction. The selector was scoped and actual keyboard modality established; assertions were preserved. A lint-driven local-variable rename briefly missed one JSX reference and broke prototype rendering; that reference was corrected before the final passing run. A subsequent run passed 51/52 with a pre-hydration native disclosure click timing out; the browser helper now waits for an explicit hydration signal before operating the review toolbar. Final verification reran all 52 checks, including the 200% text/short-viewport task case, without retries or relaxed assertions. An intermediate build was interrupted before completion; only the completed revision build above is verification evidence. Revised screenshots replace the prior files; before/after links point to the original commit rather than duplicating binary artifacts.

## Original M1 delivery evidence (historical)

The following results/costs describe the first delivery at `8f0bab7`; they do not certify the owner-review revision.

| Check | Actual result |
| --- | --- |
| Affected existing and new unit/component tests | **49 passed across 10 files**, using `--maxWorkers=1`; existing financial assertions retained. |
| Proof browser matrix and interactions | **38 passed** in the main run; supplemental light/dark mobile overlay tests and menu/confirmation keyboard check **3 passed**. This covers **40 distinct browser tests**; the menu/confirmation test is counted only once. |
| Accessibility/reflow matrix | Five proof/state screens × two themes × 320/768/1440px; zero axe violations against selected WCAG 2/2.1/2.2 A/AA tags. Dialog, sheet and interactive help also checked at 320px in both themes. |
| Contrast in rendered controls | Normal, hover, pressed and disabled labels pass 4.5:1. Actual computed readonly-input border/surface passes 3:1. Text/status/selected-row states also covered by rendered axe scans and visual inspection. Focus is 2px with 3px offset. |
| Keyboard | Modal containment, Escape and trigger restoration; safe Cancel initial focus; enabled-item arrow navigation; popover closure; native disclosure activation. |
| Form and command boundaries | Hint/error IDs, preserved associations/refs, required/invalid/read-only/disabled states; exact strings and signs; unknown is not zero or success; no implicit retries or command generation. |
| Responsive/preferences | One list representation at a time; mobile full detail; explicit apply/reset; 48px mobile controls; 200% text and 400%-equivalent 320 CSS px; System/Light/Dark; reduced-motion transitions; forced-color focus. |
| ESLint | Passed repository-wide. |
| TypeScript | `pnpm typecheck` passed; production build also checks types. |
| Formatting | Changed source/config/test/package paths pass targeted Prettier check. Full `pnpm format:check` reports **139 unchanged baseline files**, including existing domain code/tests and CI; no broad formatting rewrite was performed. Docs and lockfile are excluded by the existing prettierignore. |
| Production build / boundary / existing sign-in | **Build passed** (warnings below); actual production HTTP **404** for the proof path; sign-in passes axe/reflow/local validation focus and associations at 320/1440px in both themes. No credential submission. |

Focused unit files: Button, Panel, ThemeSelect, WorkspaceThemeSelect, AppShell, TransactionCreateForm, FinancialActionReviewForm, trackers, redesign-patterns and design-proof-gate. The two financial form files were selected because FormField/Button are on their exact payload, review and recovery boundary. Tests for account-scoped authoritative theme versions remain unchanged and pass.

The browser fixture prevents all `/api/**` requests. Expense and tracker batch controls show synthetic response states only. No production data, credentials, private financial records, service modifications or browser persistence were introduced. All screenshots contain only synthetic names and amounts.

Observed and fixed during verification: utility color/type naming collision hiding a focal amount; global unlayered link/font/border resets overriding semantic utilities; compressed mobile select; doubled-text reflow; menu loop/naming; and page-level notFound returning a streamed HTTP 200. The production guard is scoped exclusively to the development proof path; matcher tests confirm supported app/API routes are excluded.

Initial parallel unit execution during compilation hit existing 5s timeouts and a subsequent partial form interaction. The complete selected 49-test set passed serially without changing tests' original assertions or timeout budgets. Installed Next test API names were checked against actual exports after the documented newer name failed. Resolved intermediate failures are not counted as passing runs.

## Measurements and limits

Baseline sign-in capture: `out/redesign-m1/baseline-sign-in.png` (local, untracked). The first cold development navigation took 22,479ms including startup/compilation; this is not a production performance baseline or user interaction time.

The pre-existing local production artifact (`hfnDTPwspp0o0iBaLAL3M`) had a unique sign-in client-reference chunk closure of **140,267 gzip bytes**. Its source commit provenance is not embedded in that artifact, so this is an artifact comparison, not a certified like-for-like regression budget. The new production probe records the current build ID and the same closure metric. Gzip is computed independently per unique referenced chunk, not measured network transfer or hydration.

Final production build `MiPN1j7OZHj39ZGVGyUyJ`: **140,626 gzip bytes**, an artifact difference of **359 bytes (+0.256%)**. The probe used installed Microsoft Edge/Chromium without network/CPU throttling. Existing sign-in renders are available locally under `out/redesign-m1/existing-sign-in-{light,dark}-{320,1440}.png`. The production guard, public sign-in appearance and unchanged client validation were checked against this final build.

Development proof navigation/resource observations are captured in `out/redesign-m1/render-metrics.json`; review the curated [measurement record](assets/redesign-m1/measurements.json). These include Next development runtime/HMR, compile effects and concurrent local work. They are not production route costs or a claim to meet the 3s mobile/CLS/10% production budgets. The proof route is unavailable in production; mature overlay dependencies do not enter a new public workflow in M1. No household database, complete application performance or low-end device campaign was rerun.

Production build emits existing `src/platform/files/local-test-adapters.ts` broad tracing warnings. Windows standalone packaging can additionally report EPERM symlink-copy warnings. These files/configuration were not changed, and standalone distribution is not certified by this local UI check. No production deployment was attempted.

Manual NVDA/Narrator, TalkBack, real Android/software keyboard, real-device zoom/touch and low-end hardware remain unverified. Axe/Chromium accessibility-tree and keyboard checks do not replace those checks or owner usability review. No full-application WCAG certification, business-functionality reacceptance or final visual approval is claimed.

Excluded unchanged suites: backend/database integration, full V1–V3/financial browser campaigns, worker/notification services, containers, backup/restoration and recovery. CI configuration and all existing assertions are preserved.
