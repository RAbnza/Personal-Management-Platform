# M1 design foundations and component contracts

Implementation date: October 17, 2026 (Asia/Manila). Authority: approved plan sections 5, 6, 9, 11 and 12. These foundations are implemented; owner visual acceptance remains pending. See [handoff and verification](REDESIGN_M1_HANDOFF.md) before starting M2.

**Current owner decision (D06):** **Porcelain**, **Midnight Spectrum**, **Magic UI Dock (Concept A)**, bottom-centered placement, slim proportions and overall M1 direction are approved. The final active-state and upward-menu refinement awaits manual visual review. Activity architecture, separate expense entry/review, migration and shared states are preserved. This is M1, not an M2 shell or M3 conversion.

## Tokens and styling

`src/styles/tokens.css` remains the single semantic theme source, exposed through Tailwind 4's `@theme inline`. Existing aliases remain compatible. Do not add a parallel palette, per-screen hex colors, opacity-reduced body copy or another styling system.

| Role | Light | Dark |
| --- | --- | --- |
| Canvas / working surface | `#F7F8FC` / `#FFFFFF` | `#0D1020` / `#171B31` |
| Elevated / subtle | `#FFFFFF` / `#EEF0F8` | `#20253F` / `#202440` |
| Text / secondary | `#22252B` / `#5E6570` | `#F3F5FF` / `#B7C2DE` |
| Primary / label | `#6B469C` / white | `#C8B6F2` / `#1B1B22` |
| Control border / focus | `#7A8197` / violet | `#929CBA` / lavender |
| Focal blend / text | lavender `#EEE8FF` to blue `#E1EFFF` / `#282344` | violet `#302153` to blue `#142C49` / `#F3F5FF` |
| Dock / label | white / `#34324C` | `#20253F` / `#F3F5FF` |
| Dock active / label | violet / white | lavender / `#292033` |
| Blue / tint | `#245E87` / `#E5F1FA` | `#8BDCFF` / `#132C45` |
| Teal / tint | `#226851` / `#E7F2ED` | `#A2EADC` / `#153531` |
| Plum / tint | `#80456F` / `#F4E5EE` | `#F3B6EF` / `#38203F` |

The owner selected **Porcelain**: a cool near-white canvas that separates white working surfaces while allowing lavender/blue/plum identity, and dark **Midnight Spectrum**. **Gallery white** and **Graphite blue** remain historical comparison controls/query values, with no persisted theme preference. Ivory/cream are rejected historical iterations.

Controlled dark glow is static and confined to the active dock icon (16px, 18% violet); never glow body text, input content or semantic errors. Only the focal region uses a restrained two-color blend. No animated background, blur layer or flashing. Semantic success/warning/error roles remain separate from module color. Borders and text retain explicit readable colors; rendered axe/contrast checks remain required.

## Primitive contracts

| Component | Contract |
| --- | --- |
| `Button`, `buttonVariants` | Existing variants, props and default `type="button"` preserved. Loading disables duplicate activation, retains the original width and exposes `aria-busy` plus its loading label. Disabled labels use readable explicit colors. Merge variant overrides with `cn`, not class-string concatenation. |
| `IconButton` | Required accessible `label`; child icon is decorative. Square target, inherited variants and busy behavior. Use visible labels for navigation and consequential actions. |
| `Input`, `Textarea`, `Select` | Native controls; forward refs; preserve browser date, selection, autofill and keyboard behavior. Select is a native select, not a custom listbox. Disabled, invalid, read-only and focus states remain distinct. |
| `FormField` | Existing props preserved; optional `required` adds a visible marker and native requirement. A **direct child with matching `id`** receives joined hint/error IDs and `aria-invalid`, preserving existing associations and refs. Compound children retain explicit associations in their caller. Supply unique IDs and connect errors; placeholders do not replace labels. |
| `Dialog`, `DialogContent`, `SheetContent` | Radix Dialog supplies trap, Escape, outside dismissal and restoration. Required title/description. Sheet shares the same behavior. Root state and Content autofocus/dismissal hooks remain available to the caller. Long contents scroll inside bounded viewport space. |
| `ConfirmationDialog` | Radix AlertDialog; Cancel receives initial focus. Explicit action and consequence copy supplied by caller. Controlled root supported. For an asynchronous command, prevent the Action's default close and retain authoritative pending state; the wrapper never submits, retries or interprets a result. |
| `Popover` | Named Radix dialog-style help with keyboard/touch access and explicit Close; interactive content is allowed. No hover-only instructions. |
| `Menu`, `MenuItem` | Radix DropdownMenu handles keyboard/typeahead/Escape/return focus. Arrow navigation loops across enabled items. Disabled actions remain inactive. Use `asChild` for domain navigation links. |
| `Disclosure` | Native details/summary with Enter/Space and expanded semantics. |
| `StatusBadge`, `Notice` | Text plus icon; semantic tone supplied explicitly. Badge is not a live region. Notice accepts `status`/`alert` when a changing result requires announcement. Domain enums still require domain-owned mapping. |
| `EmptyState`, `InlineError`, `LoadingRegion` | Caller distinguishes first use, no matches, unavailable, unauthorized and disabled. Retry is caller-owned and never clears a draft. Loading gives one status and hides decorative placeholders from assistive technology. |

These are owned Radix-backed, shadcn-style recipes within the existing component family, not a second installed UI framework. Do not infer that composing a Radix primitive alone certifies accessibility.

## Shared compositions

`src/components/patterns` contains presentation only. Demonstrated recurring needs come from the transaction/transfer reviews, financial history/Career lists, dashboard/report coverage, and tracker/financial command states. The proofs compose them across workflows without converting production domain screens.

| Pattern | Caller responsibility |
| --- | --- |
| `WorkArea`, `ScreenHeader` | One main landmark in the page/shell; one page heading, scope, actions, local navigation and description. Do not wrap every section in a Panel. Editor variant bounds complex reviews. |
| `MagicDock`, `MagicDockItem` / Radix navigation prototype | Compact desktop uses fixed widths, a subtle 180ms hover tint and no icon movement. Current destinations use stronger text, an icon border and small line without a filled capsule. Modules/More share a nonmodal, dock-centered upward Radix Popover on desktop/mobile; Escape/Close restore the trigger, outside interaction preserves outside focus, and opening/switching focuses the first destination. One menu at a time; reduced motion disables entrance animation. Mobile geometry remains. Alternative B retains its historical desktop Navigation Menu. Native links/current semantics, no route registry or authorization. M1 only; M2 owns integration. |
| `DetailLayout` | Supply only the active detail presentation. Split begins at 1280px so the list retains at least 600px. Below that, navigate to the canonical detail route; do not retain an active duplicate mobile/desktop view. The domain adapter owns return URL, safe filters, scroll/focus restoration and authorization. |
| `RecordTable<T>` | Stable `rowKey`, domain columns, already ordered bounded records, exact strings, empty content and optional selected key. Native headers/caption; numeric alignment; contained, labeled, keyboard-reachable horizontal region. Selected row has weight and background cues. No implied search, sorting, filtering or selection across pages. |
| `CompactRecordList` | Title, exact value/status, date, source/account/scope metadata and an explicit detail link. Choose a single accessible representation at a breakpoint. |
| `FilterBar` | Accessible GET-form composition and supplied summary. Expose only supported source filters. Caller applies/reset filters, retains independent list cursors and keeps sensitive values out of new URLs. Narrow filter controls need a full row; do not allow flex shrink to hide a select's value. |
| `PageControls`, `cursorPage`, `offsetPage` | Cursor helper passes opaque cursor to a caller URL builder; Previous exists only when supplied. Offset helper takes the real offset, limit and authoritative `hasMore`; a full page does not imply another page. Total/range only when known. Keep independent subsection paging and documented source maximums. |
| `Metric`, `CoverageNotice` | Supply exact formatted value or `null`, period/as-of, source link and material coverage limitations. Never calculate money or suppress uncertainty in these components. |
| `ReviewSummary` | Stable labeled domain-supplied rows and optional evidence/warnings. No parsing, arithmetic or payload construction. |
| `CommandStatus` | Explicit draft, review, submitting, confirmed, validation-failure, stale-revision, unknown-outcome and partial-completion states. Workflow supplies consequences and supported recovery actions. Confirmed requires accepted evidence; unknown remains inline. The workflow owns input preservation, summary/invalid-field focus, command IDs, revision checks and exact retry semantics. |

Cursor examples in the current application are account history, Career and trackers. Card lists/statements use offset plus server `hasMore`. Financial activity itself remains a fixed latest-100 list; the proof deliberately does not invent pagination for it. Do not infer a global total from loaded records.

Browsing uses **one document scroll**: review toolbar, application header and main move together. No height-capped/overflow-hidden Home or stationary header over a separately scrolled main. Both desktop A and mobile float at bottom center. Desktop reserves 6.5rem plus safe-area space below all content, including expense task actions; mobile retains 7rem and its existing task/keyboard behavior. Document scroll-padding and focused-target margins clear the dock. Initial Home title and Add expense must be fully reachable at 320/390/768px and desktop, after fresh navigation and toolbar changes. Short/high-zoom layouts put navigation in flow. Home grids use explicit zero-minimum tracks; focal type/padding adapts and long labels wrap, including enlarged dock labels, so 200% text does not expand the page. Exact amounts are never truncated. M2 must preserve this contract and implement domain-appropriate Back/scroll restoration; no unconditional reset on history restoration is prescribed.

The dedicated expense task still replaces mobile product navigation with Back and a reserved action area: entry and review never coexist. Only this focused task uses its bounded scrollable body, with a short-height document-flow fallback. Draft description/notes survive Edit/Review; exact fixture amount/date remain read-only. Real IME, screen-reader and device behavior remain unverified. The Next development indicator is disabled with documented `devIndicators: false`, including manual review; compile/runtime errors still surface.

Record navigation retains exact metadata and source destinations, with an icon container/chevron in desktop title links and an outlined Details-plus-chevron link on compact records. Accessible names identify the record; there is no whole-row click handler or nested interactive target.

## Dependency choices

Added exact versions: `@radix-ui/react-alert-dialog` **1.1.23**, `@radix-ui/react-popover` **1.1.23**, `@radix-ui/react-dropdown-menu` **2.1.24**. Their React 19 peer ranges and shared transitive versions were inspected against installed Dialog **1.1.23**. The aligned versions reuse its focus/portal/context family rather than adding a second Dialog version.

Tailwind 4, CVA, clsx, tailwind-merge, RHF, Zod, Lucide, Geist, next-themes and all domain services remain. No TanStack Query: these proofs introduce no server-state lifecycle. No Sonner: consequential feedback is inline and no shared transient requirement emerged. TanStack Table remains staged for actual M3 table consumers that need its view state; the M1 synthetic comparison needs no headless sorting/selection machinery. Round 3 adds one animation engine, Motion; no competing engine, new router, financial library or private browser persistence.

## Navigation library evaluation — Round 3

Researched live documentation, source registries and licenses on October 17, 2026, before implementation. Compatibility was checked against React 19.2.8, Next 16.3.8, Tailwind 4 and existing Lucide/Radix. The actively updated Magic UI repository and current registry support Motion; installed package peer ranges accept React 19. Radix's current package also declares React 19 compatibility. Source recipes require application accessibility work; no demo is accepted as certification.

| Candidate | Appearance / behavior | Accessibility / mobile fit | Cost, license and decision |
| --- | --- | --- | --- |
| [Aceternity Floating Dock](https://ui.aceternity.com/components/floating-dock), [actual registry source](https://ui.aceternity.com/registry/floating-dock.json) | Mac-style circular proximity magnification with hover labels; mobile expands an icon stack from one trigger. | Default mobile hides the four primary destinations and source has hover-only labels; substantial adaptation needed. | Registry lists Motion plus Tabler. Lucide could replace Tabler. Linked [license page](https://ui.aceternity.com/licence) describes Pro terms; registry does not embed a free-component license. Not copied or selected; free-component licensing would need confirmation before reuse. |
| [Magic UI Dock](https://magicui.design/docs/components/dock), [registry](https://magicui.design/r/dock.json) | **Approved A** uses a slim desktop pill with horizontal icon/label destinations and a compact static mobile tile dock. Both float at bottom center. | Native labeled anchors/buttons; the existing Radix Popover dependency supplies an upward dock-connected Modules/More panel. Static touch and reduced-motion policy, 48px dock targets. | **Owner-selected**. Exact `motion` **14.3.0**, one engine (its `framer-motion` dependency is the same implementation, not a second framework). [MIT](https://github.com/magicuidesign/magicui/blob/main/LICENSE.md); retained notice in `magic-dock.LICENSE`. |
| [shadcn Radix navigation](https://ui.shadcn.com/docs/components/radix/navigation-menu), [Radix API/keyboard guide](https://www.radix-ui.com/primitives/docs/components/navigation-menu) | Our **B** uses separate floating desktop segments with an integrated module panel; mobile uses a compact ink rail with a filled active destination. No proximity animation. | Radix supplies link/current semantics, arrow navigation, disclosure keyboard access and Escape restoration; mobile uses the shared upward dock popover. All four destinations stay visible. | Exact `@radix-ui/react-navigation-menu` **1.4.1**, reuses existing Radix dependencies. [MIT](https://github.com/radix-ui/primitives/blob/main/LICENSE). Quieter and without magnification; remains a real alternative. M1 loads both comparison branches, so no smaller B-only route bundle is claimed. |

The noncompact adaptation retains Magic UI's distance -> transform -> spring mechanics (mass 0.1, stiffness 150, damping 12), uses clientX and removes blur/hover-only naming. Desktop A opts into a static compact presentation: 60px container height, approximately 384px width at default text size, fixed 90px items, 24px icon tiles and horizontal 12px labels. Dimensions scale with text size. Desktop hover/focus uses a 180ms ease-out surface tint and accent text without width changes, spring motion or icon lift; touch/reduced-motion disables transitions. The pill retains its subtle border/elevation; stronger selected text, an icon border and a small indicator line replace the filled active capsule/tile. Home, Calendar, Modules and More retain native links/buttons; Modules/More open one connected upward popover, sized to the dock and bounded by available viewport height. Desktop rests 1rem plus safe-area above the viewport bottom; the top frame contains application identity only. At heights up to 500px it returns to document flow. Mobile keeps its existing layout, sizes, placement and motion policy. Keyboard users retain labels and focus outlines. Selected icons use a restrained border without an active glow. The Radix concept remains a historical comparison; M2 owns application-wide integration of selected A. Placement and proportions are owner-approved; final active/menu treatment awaits manual owner review. The screenshot gallery is unchanged.

Motion/navigation imports occur only through the development proof. Production exclusion, public sign-in client closure and isolated navigation runtime cost are measured in the [current results](verification/REDESIGN_M1_RESULTS.md). Do not infer that later M2 adoption is bundle-free. M2 must choose the approved concept, remove comparison-only branches, preserve semantic/focus/layout contracts and measure actual app routes.

## Subsequent adoption

Review the [rendered proofs](verification/assets/redesign-m1/README.md) with the owner before broad conversion. M2 owns application navigation and Home rollout; M3–M5 own their screens. Reuse existing DTOs/commands, RHF validation, source URLs and financial formatting. A new view is not permission to change supported filters, backend behavior or command recovery. Check real assistive technology and Android input when those environments are available; browser automation is only part of acceptance.
