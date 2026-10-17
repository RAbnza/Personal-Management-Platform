# M2 + M3 implementation handoff

October 17, 2026 (Asia/Manila). Branch: `feat/redesign-m2-m3`. Verified starting remote `main`: `a109b19172ce1f634d1a9cb3f188307967eaff87`. M1 remains owner-approved. This assignment implements M2, records its checkpoint, then continues into M3; no M4–M6, PR or merge is authorized.

## Running implementation checklist

- M2 implemented: production dock/menus, capability-aware module discovery, command menu, local navigation, Home, access, Getting Started, Settings/Security and Help.
- M2 checkpoint: scope reviewed; implementation `c54f4f9`; documentation checkpoint recorded immediately afterward in branch history. Owner visual approval and consolidated M6 acceptance are pending.
- M3 implemented: all existing Money accounts/activity, reviewed transactions, debts/cards/recurring/budgets/goals; Forecast/report-specific conversion and internal Shared Expenses remain M5. Implementation: `0187f11`.
- M2 implementation `c54f4f9`, documentation `ebc2b05`; M3 implementation `0187f11`, followed by this final documentation checkpoint. The combined feature branch is pushed for owner review only, without a PR or merge.

## Boundaries and verification

Reuse M1 tokens, primitives and dock behavior. Existing services, schema, ownership, financial math, command IDs/receipts, validation, authentication and recovery remain authoritative. No private draft/query persistence is introduced. Use narrow consequential checks; no screenshot/image artifacts, full regression/integration campaigns, migration chains, container checks or repetitive builds. Manual visual/device/assistive-technology acceptance remains explicitly deferred to owner/M6 rather than claimed.

## Implementation notes

- Production navigation uses one responsive dock and one upward nonmodal panel, avoiding duplicate desktop/mobile navigation in the accessibility tree. Existing server module snapshots are passed where already available; otherwise the existing authenticated, no-store `/api/v1/me` read is used. Deployment sharing visibility comes from the existing server flag; UI visibility never replaces service authorization.
- `cmdk` 1.1.1 is added for authorized screen/action-name discovery only (React 18/19 peer support). It indexes static destination metadata, never private records or form values, and executes navigation rather than financial mutations.

## Executed checks and remaining work

M2 implementation covers AU1–AU2, HO1, ON1, ST1–ST2, HP1 and shared shell/error states. Home keeps the complete server snapshot, source links and uncertainty labels; attention starts with four items plus an explicit remainder disclosure, with no client re-ranking. Three prominent financial metrics lead to financial details/coverage and cards/budgets/goals disclosures. Onboarding separates live progress from setup forms, and Settings uses focused category URLs. Current session is listed first. Help retains its replayable tour and user-controlled support draft.

M2 focused checks: 19 component tests passed across `app-shell`, `dashboard`, `workspace-preferences-form` and `onboarding-step-controls` (shell tests updated for the approved navigation and checked after fixing JSDOM floating-anchor geometry). Changed-source ESLint passed after correcting the navigation handler's React ref rule; type checking passed. Five public auth screens returned HTTP 200 with a named heading and no 390px horizontal overflow in headless installed Chrome, without images, traces or video. The initially unavailable bundled Chromium was replaced by the installed Chrome channel; no browser download was needed. At this checkpoint, authentication/service handlers and session/workspace authority were not changed. The subsequent post-sign-in document handoff is recorded below.

No production build, full integration/browser suite, migration/database campaign or CI change. Real-device, zoom, assistive-technology and complete route/history/visual acceptance remain owner/M6 work; component checks are not represented as those manual checks. M4/M5 routes retain their functionality through the new shell. No M2 visual acceptance is claimed.

## M3 route and capability inventory

| Group | Implemented presentation and retained capabilities |
| --- | --- |
| Accounts (MO1–MO2) | `/money/accounts` uses ledger-backed rows beside an explicit opening-account disclosure/review. `/money/accounts/[accountId]/history` leads with balance and identity, then signed activity and real cursor pagination. Reconciliation comparisons/adjustments retain their existing independent preview, history and command validation. |
| Activity (MO3) | `/money/actions` uses M1 desktop records/mobile rows and only supported funding/effective/provider-date filters. Card/category source scopes survive filter changes. The source returns the latest 100 logical actions and has no cursor; the UI says so and retains paginated account history. |
| Entry/review (MO4–MO5) | `/money/transactions` and `/money/transfers` have distinct entry/review views. Edit restores the same in-memory fields, notes, references, dates, categories/splits, card posting evidence and transfer fees/treatments. Income links select the existing income intent. Mobile tasks suppress the dock and keep document scrolling/safe-area clearance. Primary transaction/transfer confirmation alone creates the command identity; uncertain retries keep the exact command/body. |
| Corrections (MO6–MO7) | `/money/actions/[actionId]` retains current action, revisions, attachments and all correction/reversal/refund/clearing controls. Starting a task focuses the work area; entry and static before/after review are separate, with source details recoverable from the task. Required reasons, acknowledgements, stale states and immutable evidence remain. |
| Debt (DE1–DE4) | Debt collection uses structured rows. Detail prioritizes recognized liability and current contractual dues before payment/schedule/settlement history. Borrow/import/pay/schedule-revision forms separate existing entry from exact review; early settlement already used a dedicated review and keeps its blockers, fees, due mappings and uncertainty semantics. All existing task URLs remain. |
| Cards (CC1–CC6) | Card collection separates browsing from creation. Detail exposes Overview/Activity/Statements/Installments and metadata editing. Statement detail compares provider snapshot with tracked reconciliation; line candidates and all existing pagination remain. Charge/payment/refund, allocation/reversal, installment create/revise/cancel/applications retain the original commands and now separate entry/review. Installment detail distinguishes projected provider schedule from recognized card position and preserves every historical line. |
| Plans (PL1–PL3) | Recurring/budget/goal collections separate browse and create; definitions, occurrences, existing lifecycle actions, link/unlink, skips, overrides, extension, conflict handling, limits, signed actuals, reservation bounds/releases/reallocations/completion/reopening and all cursor/history controls remain. Goal account links now target the actual history route. |
| Integration boundaries | Existing SharedExpenseEntry receives the same outer transaction context; no inner sharing command/UI conversion. Forecast/report internals remain M5. Career/Calendar/Tracker domain conversion remains M4. Forecast receives only the shared shell/local navigation. |

### Implementation constraints

- There is no account metadata edit endpoint or bare `/money/accounts/[accountId]` route in the baseline. M3 retains account identity/history, opening creation and the supported financial adjustment/correction tasks; it does not invent an account-edit API. The broken goal reservation link now uses `/history`.
- Ordinary transaction entry has no separate purchase-fee collection in the baseline. Existing category splits/card funding/notes are preserved; transfer, debt and card fee workflows retain their distinct existing contracts.
- During the browser check, an early date edit was overwritten before hydration. The three affected primary entry forms now reuse the existing `useClientReady` guard before enabling economic inputs; no new hydration mechanism is introduced.
- Supporting Home coverage warnings remain visible above financial metrics even when their detailed evidence is collapsed. Scope labels never turn incomplete coverage into verified totals.
- Cold development sign-in navigation did not settle reliably during the smoke attempts. Successful Better Auth sign-in now uses a static full-document replacement, consistent with the existing session-boundary requirement to discard client/RSC state. Generic errors, credentials, tokens, sessions and cross-tab notices are unchanged.
- Native details disclosures retain mounted forms. No draft is written to localStorage, a query string or a server before confirmation. Financial services, APIs, schemas, auth/session rules and CI workflows are unchanged. The local Turbopack dev cache encountered an internal restore panic; a temporary Webpack dev smoke configuration is used, without changing repository runtime/CI configuration. Webpack exposed a document-level selector incorrectly placed in a CSS Module; the scroll-clearance rule now lives in the global stylesheet.

### Final focused verification

- Type generation/type checking passed at M2. Final M3 `tsc --noEmit --incremental` passed; changed-source ESLint and changed TS/TSX/CSS Prettier checks passed. `git diff --check` passed.
- **104 distinct component tests passed across 21 directly affected files:** M2 shell/Home/preferences/onboarding (19), sign-in (3), Activity filters (1), and financial forms/reviews (81). Checks were bounded to affected components; failed checks or materially changed interactions were repeated. Original exact-payload, validation, frozen-field, acknowledgement, stale and identical-retry assertions remain. The added correction-task check verifies its title and keyboard focus return.
- **One isolated browser smoke passed** in installed headless Chrome: production Modules at 320/390/768px, upward geometry/no overflow, Escape focus return, command selection and browser Back; Settings/appearance, sessions, Help, Getting Started and all six Money collections; mobile expense entry/review/Edit with notes retained, no pre-confirmation dispatch, an accepted command with a lost response, and byte-identical retry. Dark/reduced-motion conditions were included. The final Webpack dev run passed (3.7 minutes including cold compilation); no production build was needed.
- Earlier smoke attempts exposed hydration edit loss, an incorrect expected Help title, and the CSS Module/global-rule issue; these were corrected. Development compiler interruption and a Turbopack cache-restore panic were not counted as passes. Initial borrowing/split-validation checks needed the intended hidden-field assertion and an idle rerun after resource-related timeouts; all final affected component checks passed without raising existing test timeouts or weakening assertions. The new cross-workspace smoke has its own bounded development timeout.
- Existing guarded synthetic-owner setup/cleanup used only the isolated test database. No migration, full database/integration/browser regression campaign, benchmark or container verification was run. No image, screenshot, trace or video was generated. Existing screenshot/gallery and CI files are unchanged.

### Owner review and deferred acceptance

The local development preview is restored at `http://localhost:3200/` using `next dev --webpack`; its normal `.env` is separate from the test runtime. Open Home (the actual app), then use Modules and More. Sign in with an existing development account; no synthetic test user was added to the development database. For a fresh local start, set `BETTER_AUTH_URL` to `http://localhost:3200` in that process and run `pnpm dev --webpack --port 3200`. Webpack is a local workaround for the observed Turbopack cache panic, not a production/CI configuration change.

No owner visual acceptance is claimed. M6 retains consolidated responsive/zoom/assistive-technology/integration acceptance, real-device checks and broader regression investigation. Existing browser acceptance selectors follow the new review/disclosure interactions and Home label; those complete suites have not been rerun. M4/M5 dependencies remain as listed in the inventory; neither milestone has started.
