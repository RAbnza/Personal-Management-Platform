# M6 redesign acceptance

> **Historical record:** preserved development evidence. Current summary: [Development history](../../DEVELOPMENT_HISTORY.md).

**Result: Passed with documented limitations.** The complete M1-M5 visual implementation was explicitly approved October 18, 2026 (Asia/Manila). Implementation completion, visual approval and consolidated technical acceptance are separate records. M6 does not certify production launch.

Branch: `feat/redesign-m6-acceptance`, based on verified local/remote `feat/redesign-m4-m5` at `1cab7e29b3ecb6c5c0f5f5b58abf015debd522c0`. The starting tree was clean. The completion message records the final verified remote SHA.

## Route and capability coverage

The filesystem-to-executed-route check accounts for **all 71 page files**: 70 production pages plus the intentionally excluded design proof (HTTP 404). **76 distinct visited paths** include valid owned records and the catch-all Tracker subroutes. Income/expense variants were exercised separately. [Machine-readable results](../../reference/verification/REDESIGN_M6_RESULTS.json) contain the compact page-pattern ledger.

| Inventory | Acceptance evidence |
| --- | --- |
| AU1-AU2, HO1, ON1, ST1-ST2, HP1, SY1 | Five public authentication routes; synthetic sign-in; Home, onboarding, Settings, sessions, Help/support; discovery/search, breadcrumbs, Back/Forward, keyboard menu focus and private draft retention. |
| MO1-MO7 | Accounts, history/reconciliation, activity/detail, income/expense and transfers; exact commands, corrections/refunds, reconciliation and response-loss retry. |
| DE1-DE4 | Borrow/import/detail/payment/schedule/settlement routes; partially known liability, unknown payment accounting, carried allocations and full payoff. |
| CC1-CC6 | Card, command, statement, allocation and installment create/detail/revise/application routes; exact payment cash/liability/spending distinctions. |
| PL1-PL4 | Recurrence/occurrences, budgets, savings and forecast; linked actuals, source generation, replay, reservation separation and hypothetical-only forecasting. |
| CR1-CR2, TM1-TM3 | Attempts/stages/timeline/archive; Calendar views and event creation; reminders; real API cursor paging, partial coverage, source filters and unavailable-read retry; civil/exclusive-end/DST adapters. |
| TR1-TR5 | Collections, entries, templates, versions, migrations and statistics; field composition, compatible publication, immutable versions and bounded partial migration recovery. |
| RP1, HO2 | All report/drilldown routes, real chart controls, exact evidence and forecast assumptions. |
| SH1-SH4 | Group/bill/participant/effect routes; exact three-person rounding, private settlement-effect review; verified invitation authority and pending/confirmed/disputed payment protection. |
| ST3-ST6 | Notifications, Files, CSV/portability and lifecycle; actual mapped CSV posting, scan/foreign-source denial, atomic restore/recovery, retired-command replay and recent-auth/scope restrictions. |

## Defects corrected

- Import and attachment controls now wait for client readiness. Previously an early file selection could precede its handler and leave CSV mapping unable to continue. A delayed-hydration browser check verifies the gate; programmatic file-selection tests now wait for an enabled control.
- Custom template creation now has a level-one heading. The labeled Home category chart now has a valid accessible group role and retains exact evidence.
- Shared button colors change immediately, avoiding low-contrast intermediate colors while enabling. Shadow transitions remain.
- Bounded spacing/wrapping fixes enlarged-text overflow in header/search, dock, panels, file task, skip link and loading text. Normal-size geometry remains consistent. Overflow is not hidden.
- Authenticated browser titles follow existing breadcrumb labels without an extra record read or persisted private state.

## Checks actually executed

| Gate | Result |
| --- | --- |
| Static/build | Repository ESLint and route type generation/TypeScript passed initially. Final changed-source lint, TypeScript, formatting and diff whitespace checks passed. The existing supported Linux Docker build passed after fixes. |
| Unit/components | **68 distinct checks passed** across shell/navigation, transactions/transfers, debt/card commands, Trackers, Calendar adapters, workspace views, notifications/lifecycle and primitives. One income test timed out while a build competed for resources; its full nine-test file passed on rerun with unchanged timeout and assertions. |
| Integration | **26 selected checks passed** against guarded isolated fixtures and runtime roles. Filtered tests were not counted as passes. |
| Production browser | **10 journeys passed in 2.4 minutes** on the final production application artifact, including route acceptance, delayed hydration, public boundaries, Calendar paging and M2-M5 navigation/consequential flows. |
| Responsive/accessibility | **70 route/theme/viewport cases**, at 320/390/768/1024/1440px in both themes. **25 axe audits, zero violations**. Keyboard menu/dialog focus return, skip activation, forced colors, reduced motion and 200%/400% CSS text enlargement were exercised. No final page errors or unintended overflow. |

No screenshots, video or traces were generated. Existing assertions and CI configuration remain intact. Initial failed attempts remain in ignored local logs and are not counted as passes.

## Performance and preserved guarantees

67 local production navigation-to-heading samples: median **413 ms**, observed p95 **512 ms**, maximum **1,143 ms**. Calendar under 4x CPU throttling became available in **754 ms**. These are small-fixture UI observations on an unthrottled loopback network, not service-p95 or representative-device certification.

Sign-in client-reference JavaScript: **140,580 gzip bytes**, versus M1's **140,626**, effectively unchanged. Current Home/Calendar/report closures are in the JSON. No equivalent M1 full-application route baseline exists, so no invented comparison is claimed. Charts/Calendar remain route-specific; existing lazy financial charts and data bounds remain. Browser titles add no queries; no private cache or N+1 mechanism was introduced.

Exact minor units, financial payloads and command identities, immutable evidence, workspace/source ownership, RLS, private adoption, file scan gating, import provenance and lifecycle protections remain authoritative. The production test container ran as `node` with capabilities dropped and only test runtime credentials. Administrator/migration credentials were not exported to it. Consequential operations used synthetic isolated data.

## Limits and recommendation

- Physical Android/touch keyboards and manual NVDA/Narrator/TalkBack were unavailable. Automated axe, keyboard and forced-color checks do not certify every assistive-technology combination.
- CSS enlargement and 320px reflow complement zoom acceptance; native browser-UI zoom was not manually certified. Formal contrast in every possible transient/third-party state is not claimed.
- No fresh 10,000-action load profile, CLS lab campaign, real provider delivery/storage/scanner certification, backup verification or deployment was performed. File integration used isolated adapters; browser file checks verified reserved metadata and download gating.
- The pre-existing broad filesystem tracing warning remains. Windows standalone copying encountered its known symlink-privilege restriction; the supported Linux build and actual Linux runtime passed.

No unresolved critical/high defect was found in the covered flows. **Technically ready for review and eventual integration**, retaining these manual/device and operational limitations. No automatic merge, native/offline work or deployment occurred.

## Reproduce

Build `docker build --target build --tag pmp-m6-acceptance-build .`; start `pnpm exec tsx scripts/testing/redesign-acceptance-runtime.ts start`; run `pnpm exec playwright test --config playwright.acceptance.config.ts`, then `node scripts/testing/redesign-route-coverage.mjs`; stop with the runtime script's `stop` command. The isolated database must already be set up. The launcher checks test database/roles, labels its container and removes its temporary environment file. Run `scripts/testing/redesign-acceptance-bundles.mjs` inside the build image for bundle measurements. Detailed local results are under ignored `out/m6-*`.
