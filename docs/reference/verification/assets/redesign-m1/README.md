# M1 Round 3 — rendered owner review

**Final visual approval is pending.** D06 replaces the rejected ivory/cream canvases and Round 2 capsules. Activity architecture, separate expense entry/review, migration and shared states are preserved. Everything here is an actual Edge/Chromium browser render with synthetic data.

Open the [side-by-side visual comparison](review.html) for paired images, or follow the tables below. Recommend **Porcelain + Midnight spectrum + A, the adapted Magic UI Dock**. The alternatives remain functioning review choices, not saved workspace settings or owner-approved decisions.

## Navigation choices in the same Home composition

| Concept | Light desktop | Dark desktop | Light mobile 390px | Dark mobile 390px |
| --- | --- | --- | --- | --- |
| **A — Magic UI Dock, recommended** | [1440px](concept-dock-light-1440.png) | [1440px](concept-dock-dark-1440.png) | [390px](concept-dock-light-390.png) | [390px](concept-dock-dark-390.png) |
| **B — Radix floating segments / ink rail** | [1440px](concept-radix-light-1440.png) | [1440px](concept-radix-dark-1440.png) | [390px](concept-radix-light-390.png) | [390px](concept-radix-dark-390.png) |

A uses raised icon tiles, persistent labels, a small current marker, desktop proximity springs and a static compact mobile dock. B uses separate desktop segments with an integrated Radix module panel; mobile is a compact dark rail with a filled active destination. These differ in structure, interaction and mobile treatment. A has more character and introduces the Motion runtime; B is quieter and avoids magnification. Both branches share the M1 comparison bundle; a future B-only route cost is not claimed. Both preserve Home / Calendar / Modules / More, native links, focus and current semantics. See the [library evaluation and licenses](../../../REDESIGN_M1_COMPONENT_GUIDE.md#navigation-library-evaluation--round-3) and [measured costs](../../REDESIGN_M1_RESULTS.md).

Module switching: A [light](modules-dock-light-1440.png) / [dark](modules-dock-dark-1440.png) uses the existing accessible sheet; B [light](modules-radix-light-1440.png) / [dark](modules-radix-dark-1440.png) uses an integrated desktop panel. Keyboard, Escape restoration and pointer entry are exercised, including More.

Narrow and tablet comparisons: A [light 320](concept-dock-light-320.png), [dark 320](concept-dock-dark-320.png), [light 768](concept-dock-light-768.png), [dark 768](concept-dock-dark-768.png); B [light 320](concept-radix-light-320.png), [dark 320](concept-radix-dark-320.png), [light 768](concept-radix-light-768.png), [dark 768](concept-radix-dark-768.png).

## Palette alternatives

| Direction | Recommended treatment | Functioning alternative | Difference |
| --- | --- | --- | --- |
| White-based light | [Porcelain](home-light-1440.png) | [Gallery white](home-alternative-light-1440.png) | Cool near-white canvas / white surfaces versus white canvas / subtly tinted surfaces and pink-lavender focal blend. |
| Dark | [Midnight spectrum](home-dark-1440.png) | [Graphite blue](home-alternative-dark-1440.png) | Violet-blue depth, cyan/plum support and static active-icon glow versus a quieter neutral/blue composition without glow. |

Gallery white also appears at [320px](home-gallery-light-320.png). Color stays centralized. Neon influence is controlled: no glowing body text, flashing, animated background or blur layer. Authoritative semantic feedback retains its independent roles.

## Preserved workflows under the revised themes

| Composition | Light desktop | Dark desktop | Light mobile | Dark mobile |
| --- | --- | --- | --- | --- |
| Home / initial Add expense | [1440](home-light-1440.png) | [1440](home-dark-1440.png) | [390](home-light-390.png) · [320](home-light-320.png) | [390](home-dark-390.png) · [320](home-dark-320.png) |
| Financial activity | [1440](activity-light-1440.png) | [1440](activity-dark-1440.png) | [320](activity-light-320.png) | [320](activity-dark-320.png) |
| Expense entry | [1440](expense-light-1440.png) | [1440](expense-dark-1440.png) | [320](expense-light-320.png) | [320](expense-dark-320.png) |
| Separate exact review | [1440](expense-review-light-1440.png) | [1440](expense-review-dark-1440.png) | [320](expense-review-light-320.png) | [320](expense-review-dark-320.png) |
| Tracker migration | [1440](migration-light-1440.png) | [1440](migration-dark-1440.png) | [320](migration-light-320.png) | [320](migration-dark-320.png) |
| Shared interaction states | [1440](states-light-1440.png) | [1440](states-dark-1440.png) | Tested at 320/390/768 | Tested at 320/390/768 |

Also inspect [later entry fields](expense-entry-more-light-320.png), [lower exact effects/allocation](expense-review-effects-light-320.png) and [accepted synthetic receipt](expense-confirmed-dark-320.png). No fields, financial consequences, source metadata, migration semantics or command guarantees were removed.

## Clipping and manual review

Browsing uses document scrolling: review controls, app frame and content move together. Initial/returned Home title and Add expense are checked geometrically; dock/safe-area padding and focus margins keep the last focused destination reachable. Dedicated expense tasks alone retain a bounded body and separate action area, with document flow at short heights. Mobile screenshots show actual viewports, not an artificial full-page mobile canvas; scroll normally to inspect the rest. Fixed navigation enters document flow at short/high-zoom heights. Real software-keyboard, screen-reader and device checks remain outstanding.

The Next development indicator is disabled through the supported config for manual review too. Tests do not hide its portal. Application geometry and overlaps are tested independently.

Start `pnpm dev --port 3200`, open `http://localhost:3200/dev/design`, then expand **M1 review controls**. Choose Theme, light/dark treatment and Navigation concept. Direct links: `?nav=dock`, `?nav=radix`, `?treatment=gallery`, `?dark=graphite`, `?screen=expense&stage=review`. The palette controls affect their corresponding theme; use Light/Dark explicitly. No financial data or new workspace preference is persisted.

Before/after history: [Round 2 Home](https://github.com/RAbnza/Personal-Management-Platform/blob/2b0a492be6c40b1068c312b49ce2acbfc3cca7f4/docs/reference/verification/assets/redesign-m1/home-light-1440.png) and [Round 2 mobile Home](https://github.com/RAbnza/Personal-Management-Platform/blob/2b0a492be6c40b1068c312b49ce2acbfc3cca7f4/docs/reference/verification/assets/redesign-m1/home-light-320.png) remain in Git history; they are not current recommendations.

Recapture with `pnpm exec playwright test --config=playwright.redesign.config.ts` after stopping the review server. See [handoff](../../../REDESIGN_M1_HANDOFF.md) and [results/limits](../../REDESIGN_M1_RESULTS.md). **M2/M3 have not started.**
