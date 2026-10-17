# Adaptive navigation and page context

Follow-up to the M2/M3 design overhaul, on `feat/redesign-m2-m3`. This refines the existing visual direction; it does not start M4/M5.

## Composition

- At 1024px and above, the floating dock separates Home/Calendar from direct enabled Money, Career, Trackers and Reports destinations. Explore holds shared-expense discovery and module management. The active module is identified across all of its nested routes, not just its landing page.
- Below 1024px the compact Home, Calendar, Modules, More pattern remains. Existing mobile task/keyboard suppression, safe-area clearance, upward menus and reduced-motion behavior remain. Only one responsive Primary navigation landmark is used.
- The header is a unified focal surface: workspace identity and private/shared context, screen search, the existing contextual expense action, and desktop account controls. Mobile More exposes the same account, theme and sign-out controls. Search indexes static available screens only. Native links remain usable while interactive menu controls wait for hydration.
- Local Money/Plans/Settings destinations now derive from the same `navigation-model.ts` definitions as discovery. Plans expands on its own routes. Header and dock menu state resets on pathname changes, including browser Back/Forward; form trees are not keyed or reset. Next Link retains normal navigation, scroll and focus behavior. No page-transition overlay or delay was added.

## Reusing breadcrumbs

`AppShell` supplies `PageLocationProvider` and the semantic Breadcrumb navigation. `breadcrumbsFor` in the shared navigation model derives logical hierarchy from existing destinations plus explicit record-route metadata. Parent links only target real landing pages: an account links to its history, for example, and no fictitious `/money` page or tracker template collection is introduced. Unknown URL segments are never printed as labels.

A page that has already authorized and loaded a record renders `BreadcrumbRecords` with:

- `path`: the exact current pathname, without query parameters;
- `labels`: a map from record-path prefixes to the already-loaded names;
- optional `parents`: an explicit logical ancestry when it differs from URL nesting (used for recurring occurrences and their originating plan).

Names come from the existing page snapshot. The shell performs no record lookup, persistent caching, localStorage write or new authorization query. Labels are scoped to an exact path and shell identity, cleaned up on unmount, and ignored on other paths. Neutral labels appear before hydration or when data is unavailable; UUIDs are never display labels. Authorized names are connected for Money records/tasks and existing Career, Calendar, Tracker and shared group/expense/participant views. Unnamed evidence uses meaningful generic labels or its statement date.

Desktop displays the hierarchy as an ordered list with `aria-current="page"`. Narrow screens show the nearest navigable ancestor and current location, with a parent arrow and constrained text. Existing financial Back/Cancel controls remain; breadcrumb navigation does not submit, persist or alter drafts or retry commands. Query filters and revision selections retain their own existing controls rather than becoming fictional ancestors.

For a future route, extend its existing destination metadata (`local`, `pageLabel`) and record pattern only where needed, then pass authorized labels from that page. Do not add a second route list, a record search index, or a breadcrumb-specific data service.

## Collection alignment

Financial accounts use distinct identity, body and bottom footer regions. Names reserve two lines; balances are separate from optional notes. Notes are expandable with bounded internal scrolling, so long notes remain accessible. Equal-height horizontal slides and `margin-top:auto` keep the two action controls aligned, including when notes expand. Cards keep their own natural content height rather than imposing a global card height. Credit-card grids anchor their final action row; Home plan highlights reserve title space and anchor the period/status line.

## Verification

- TypeScript and changed-source ESLint passed; focused formatting and whitespace checks run before commit.
- Eleven distinct unit/component tests passed across the navigation model, breadcrumb lifecycle, and app shell. These cover module filtering, deep-route active states, real parent URLs, named/fallback hierarchy, label cleanup, command navigation, account/mobile menus and Escape focus return.
- One focused installed-Chrome smoke passed (30.2 seconds): desktop direct navigation, Explore/header menu focus, command search, account footer geometry with different name lengths and expanded notes, direct history/reconciliation links with names, browser Back/Forward, mobile menus/task suppression, and document overflow at 320/390/768/1024/1440px. Dark/reduced-motion conditions were included. The initial header-menu attempt exposed an early hydration click; interactive readiness and visible-menu focus were corrected before the passing run.
- Existing financial payloads, session controls, module preferences, authorization services, RLS, CI and existing assertions remain. No full regression/migration campaign, screenshot gallery, video or trace was generated. The browser fixture used only the isolated test database.

Owner visual acceptance, physical-device touch behavior, zoom and comprehensive assistive-technology review remain owner/M6 work. No merge or M4/M5 redesign is included.
