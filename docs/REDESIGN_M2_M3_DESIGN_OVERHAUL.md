# M2/M3 design overhaul continuation

**Owner visual approval:** M1–M5 explicitly approved October 18, 2026 (Asia/Manila). Implementation is complete as recorded below; consolidated technical acceptance is tracked separately in [M6 acceptance](REDESIGN_M6_ACCEPTANCE.md). Historical test results are not retroactively expanded.


This continues the uncommitted design-led work recovered on `feat/redesign-m2-m3` from baseline `fa154fa0aa651472e87f7e9632a8967f8a622e56`. It supersedes the earlier handoff's panel-and-paragraph layout descriptions. The approved Porcelain, Midnight Spectrum and Magic Dock foundations remain.

## Implemented experience

- The five images in `docs/redesign-references` informed stronger balance typography, compact icon actions, complementary account colors, asymmetric desktop composition, integrated charts and concise activity. They are visual references, not financial data or copied screens.
- Home leads with a focal balance area, period spending, daily spending/income chart and signed category bars. Attention, activity and Agenda have compact initial views with explicit access to remaining records. Career and Tracker summaries use distinct accents. Contextual information controls and evidence disclosures reduce persistent explanation; coverage and funding warnings stay visible.
- The overall balance and individual accounts occupy one horizontal Home collection. Account browsing uses a horizontal collection with partially visible next cards. Budget and savings highlights have a view switch and separate horizontal collections, preserving their periods, values and risks. Manage links expose the full paginated collections.
- Native overflow and CSS scroll snap provide touch/trackpad scrolling, previous/next buttons, position indicators, keyboard arrows/Home/End, ordinary link focus and reduced-motion handling. No auto-rotation, custom gesture engine or new dependency. Histories and consequential forms retain conventional layouts.
- Auth has a composed introduction/form layout; Settings gains icon navigation and appearance emphasis; Help has expandable topics; onboarding is more concise. Money collections have colored account/card surfaces, prominent plan progress and clear action controls. Creation disclosures no longer consume an empty desktop column.

## Everyday entry and safeguards

- Expense/income entry asks for the amount once, account, date and description. A single category stays optional; splits expose amounts when needed. Merchant/sender, references, notes and sharing remain in More details. Card posting requirements and negative-balance warnings stay visible. The server supplies the initial workspace-local date without overwriting a hydrated edit.
- Transfers start without fee rows. Description visibly defaults to `Transfer from <source> to <destination>` in its placeholder and review. Actual fees, treatment, dates, bearing accounts and categories remain explicit; invalid fee fields open their disclosure. No classification or fee is invented.
- Debt payment starts with an explicitly unknown breakdown. Exact cash less an explicit external fee becomes unresolved clearing; it does not reduce recognized principal or infer interest. Users can enter a known breakdown. Installment suggestions require review and explicit confirmation. Review/Edit retains chosen allocations; changing the economic intent revokes confirmation.
- Card commands offer named evidence-source choices and a custom source. No source is preselected. Provider references remain optional only where the existing contract permits.
- Entry/review boundaries, exact minor-unit payloads, immutable ledger/correction semantics, acknowledgements, stale-data handling and identical retry commands remain. No auth/session/API/schema/migration/RLS changes or draft persistence were added.

## Chart and financial meaning

Home reuses `readFinancialBreakdowns` inside its existing authorized, read-only snapshot. Plots use recorded daily postings, not fabricated balance history or filled missing dates. Category drilldowns retain period and category, including uncategorized entries. Coordinates are approximate JavaScript numbers; labels, tooltips, source links and the accessible exact-data table use original signed integer strings, including values above Number's safe integer range.

Account balances include archived and negative balances. Reservations and bills are not deducted from liquid funds. Credit limits stay separate from cash. Recognized liabilities, contractual dues, pending evidence and savings reservations retain their distinct meanings. Detailed coverage evidence remains accessible.

## Focused verification and limits

- Route type generation and TypeScript checking passed. Changed-source/test ESLint passed. Changed code formatting and final diff whitespace are checked before commit.
- Forty-two distinct focused tests passed across dashboard snapshot/components, exact chart values/drilldowns, transaction entry, transfers, debt payments and card commands. Existing payload, split validation, fee treatment, acknowledgement and retry assertions remain. Added checks cover the default transfer description/date and guided allocation retention through Review/Edit.
- The isolated Chrome smoke passed (41.8 seconds on the warmed development server): shell and M2/M3 collections, mobile expense review/Edit and identical retry, Home horizontal navigation, exact chart values, plan switching and 320/768/1440px document overflow under dark/reduced-motion conditions. Earlier attempts encountered sandbox startup restrictions, cold startup timeout, the old shared Home-heading assertion (corrected), and a development hot reload during navigation. None were counted as passes; no assertion was removed or timeout raised.
- No production build, broad regression campaign, migration, screenshot gallery, trace or video was generated. The guarded browser fixture uses only the test database. Owner visual approval, physical touch-device checks and consolidated responsive/zoom/assistive-technology acceptance remain M6 work. M4/M5 redesign has not started.

For local owner review, use an existing development account and the normal environment at `http://localhost:3200/`. Start with `BETTER_AUTH_URL=http://localhost:3200` in that process and `pnpm dev --webpack --port 3200`. The isolated test runtime is separate.
