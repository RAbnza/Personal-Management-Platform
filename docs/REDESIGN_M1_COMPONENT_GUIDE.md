# M1 design foundations and component contracts

Implementation date: October 17, 2026 (Asia/Manila). Authority: approved plan sections 5, 6, 9, 11 and 12. These foundations are implemented; owner visual acceptance remains pending. See [handoff and verification](REDESIGN_M1_HANDOFF.md) before starting M2.

## Tokens and styling

`src/styles/tokens.css` remains the single semantic theme source, exposed through Tailwind 4's `@theme inline`. Existing aliases remain compatible. Do not add a parallel palette, per-screen hex colors, opacity-reduced body copy or another styling system.

| Role | Light | Dark |
| --- | --- | --- |
| Canvas / working surface | `#F6F5F2` / `#FFFFFF` | `#15181D` / `#20252C` |
| Elevated / subtle | `#FFFFFF` / `#EFEDE8` | `#2B323B` / `#262D35` |
| Text / secondary text | `#22252B` / `#5E6570` | `#F2F4F5` / `#B5BEC8` |
| Primary / label | `#6B469C` / white | `#C8B6F2` / `#1B1B22` |
| Hover / pressed | `#5D3D88` / `#503474` | `#BCA5EE` / `#B09AE0` |
| Selection / selection text | `#EEEAF5` / violet | `#332A45` / lavender |
| Control border / focus | `#7D8490` / violet | `#8994A3` / lavender |
| Decorative divider | `#DDDAD4` | `#3A424C` |
| Teal / tint | `#226851` / `#E7F2ED` | `#90D5B7` / `#173A30` |
| Warm / tint | `#946119` / `#FFF2D7` | `#F0CA7E` / `#3A2E16` |

Feedback uses the existing success, warning, danger, information and neutral role pairs. Accent identity is independent of success/failure. Focal surfaces are charcoal with explicitly paired light text in both themes; `bg-focal-surface` and `text-focal` have distinct names to avoid a color/type utility collision. Chart colors remain categorical, separate from status.

Geist delivery, fallbacks and next-themes remain intact. `text-page` is 24/30 on narrow screens and 28/34 from 1024px; `text-focal` is 28/34 then 32/38; `text-section` is 18/26. Existing Tailwind caption/support/body sizes supply 12/16, 14/20 and 16/24. Financial figures use `numeric-value`; accept exact formatted strings and preserve signs and currency. Unknown is explicit, never fabricated zero.

Use Tailwind's existing 4px spacing rhythm. Marker/control/content/dialog radii are 6/10/12/18px. Work areas cap at 1600px; reviewed editors at 1100px. Default controls are at least 44px, 48px below 600px or for a coarse pointer. Compact table links are 32px only with a fine pointer; touch remains 48px. No persistent density preference is introduced.

Global reset declarations for link color, control font and border color live in the **base cascade layer**, so semantic utilities can override them. Keep focus at 2px with 3px offset. Reduced motion removes transitions and reduces animations globally; loading text remains available. Native progress uses semantic primary/subtle colors rather than the browser's default green.

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
| `DetailLayout` | Supply only the active detail presentation. Split begins at 1280px so the list retains at least 600px. Below that, navigate to the canonical detail route; do not retain an active duplicate mobile/desktop view. The domain adapter owns return URL, safe filters, scroll/focus restoration and authorization. |
| `RecordTable<T>` | Stable `rowKey`, domain columns, already ordered bounded records, exact strings, empty content and optional selected key. Native headers/caption; numeric alignment; contained, labeled, keyboard-reachable horizontal region. Selected row has weight and background cues. No implied search, sorting, filtering or selection across pages. |
| `CompactRecordList` | Title, exact value/status, date, source/account/scope metadata and an explicit detail link. Choose a single accessible representation at a breakpoint. |
| `FilterBar` | Accessible GET-form composition and supplied summary. Expose only supported source filters. Caller applies/reset filters, retains independent list cursors and keeps sensitive values out of new URLs. Narrow filter controls need a full row; do not allow flex shrink to hide a select's value. |
| `PageControls`, `cursorPage`, `offsetPage` | Cursor helper passes opaque cursor to a caller URL builder; Previous exists only when supplied. Offset helper takes the real offset, limit and authoritative `hasMore`; a full page does not imply another page. Total/range only when known. Keep independent subsection paging and documented source maximums. |
| `Metric`, `CoverageNotice` | Supply exact formatted value or `null`, period/as-of, source link and material coverage limitations. Never calculate money or suppress uncertainty in these components. |
| `ReviewSummary` | Stable labeled domain-supplied rows and optional evidence/warnings. No parsing, arithmetic or payload construction. |
| `CommandStatus` | Explicit draft, review, submitting, confirmed, validation-failure, stale-revision, unknown-outcome and partial-completion states. Workflow supplies consequences and supported recovery actions. Confirmed requires accepted evidence; unknown remains inline. The workflow owns input preservation, summary/invalid-field focus, command IDs, revision checks and exact retry semantics. |

Cursor examples in the current application are account history, Career and trackers. Card lists/statements use offset plus server `hasMore`. Financial activity itself remains a fixed latest-100 list; the proof deliberately does not invent pagination for it. Do not infer a global total from loaded records.

## Dependency choices

Added exact versions: `@radix-ui/react-alert-dialog` **1.1.23**, `@radix-ui/react-popover` **1.1.23**, `@radix-ui/react-dropdown-menu` **2.1.24**. Their React 19 peer ranges and shared transitive versions were inspected against installed Dialog **1.1.23**. The aligned versions reuse its focus/portal/context family rather than adding a second Dialog version.

Tailwind 4, CVA, clsx, tailwind-merge, RHF, Zod, Lucide, Geist, next-themes and all domain services remain. No TanStack Query: these proofs introduce no server-state lifecycle. No Sonner: consequential feedback is inline and no shared transient requirement emerged. TanStack Table remains staged for actual M3 table consumers that need its view state; the M1 synthetic comparison needs no headless sorting/selection machinery. No animation framework, new router, financial library or private browser persistence.

## Subsequent adoption

Review the [rendered proofs](verification/assets/redesign-m1/README.md) with the owner before broad conversion. M2 owns application navigation and Home rollout; M3–M5 own their screens. Reuse existing DTOs/commands, RHF validation, source URLs and financial formatting. A new view is not permission to change supported filters, backend behavior or command recovery. Check real assistive technology and Android input when those environments are available; browser automation is only part of acceptance.
