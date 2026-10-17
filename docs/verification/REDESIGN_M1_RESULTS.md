# M1 targeted verification results

October 17, 2026 (Asia/Manila). Scope: design foundations, shared UI and synthetic proofs. Owner visual approval remains pending. See [handoff](../REDESIGN_M1_HANDOFF.md), [contracts](../REDESIGN_M1_COMPONENT_GUIDE.md) and [screenshot index](assets/redesign-m1/README.md).

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
