# M1 rendered review evidence

**Owner review 2 — pending approval.** The owner partially approved the first activity layouts, migration and state patterns, but withheld final visual approval. These refreshed captures demonstrate the requested refinements. All records are synthetic; nothing calls a private API or persists a financial record.

Captured in Microsoft Edge/Chromium on Windows at 1440×1000 (some comparisons 1440×900) and 320×900 CSS px; tablet checks use 768×900. Mobile screenshots are actual bounded viewport renders: scroll the content area to inspect the rest while the capsule/task actions stay in reserved space. Desktop captures include the complete composition. The development diagnostics badge is hidden only for captures.

| Composition | Light desktop | Dark desktop | Light mobile | Dark mobile |
| --- | --- | --- | --- | --- |
| Home | [1440px](home-light-1440.png) | [1440px](home-dark-1440.png) | [320px](home-light-320.png) | [320px](home-dark-320.png) |
| Financial list/detail | [1440px](activity-light-1440.png) | [1440px](activity-dark-1440.png) | [320px](activity-light-320.png) | [320px](activity-dark-320.png) |
| Expense entry | [1440px](expense-light-1440.png) | [1440px](expense-dark-1440.png) | [320px](expense-light-320.png) | [320px](expense-dark-320.png) |
| Separate expense review | [1440px](expense-review-light-1440.png) | [1440px](expense-review-dark-1440.png) | [320px](expense-review-light-320.png) | [320px](expense-review-dark-320.png) |
| Tracker migration | [1440px](migration-light-1440.png) | [1440px](migration-dark-1440.png) | [320px](migration-light-320.png) | [320px](migration-dark-320.png) |

Also inspect [entry fields after scrolling](expense-entry-more-light-320.png), [lower review effects/allocation](expense-review-effects-light-320.png), [expense receipt](expense-confirmed-dark-320.png), and interaction states in [light](states-light-1440.png) / [dark](states-dark-1440.png). Fields and consequences remain present; entry and review do not coexist. Edit preserves notes/description. Fixture amount/date are read-only, with exact effects supplied by the fixture. Migration mapping, counts, cancellation and resume semantics remain intact.

## Two light treatments

| Treatment | Desktop | Mobile | Recommendation |
| --- | --- | --- | --- |
| Bright warm ivory | [Home](home-light-1440.png) | [Home](home-light-320.png) | **Recommended**: brighter, airy warm canvas with clearer working-surface separation and room for complementary accents. |
| Soft cream | [Same Home proof](home-cream-light-1440.png) | [Same Home proof](home-cream-light-320.png) | Viable warmer, more enveloping alternative; stronger cream cast behind the same content. |

These compare the same rendered application fixture, not generated mockups or a new persistent theme setting. Both preserve violet identity, charcoal emphasis and readable semantic states. Teal supports continuation, blue supports Agenda, plum marks Career/Trackers and amber provides restrained secondary emphasis. Module/category hues remain separate from authoritative feedback status.

## Floating navigation and task behavior

The desktop Home/activity/migration images demonstrate the opaque floating capsule, icon-plus-label destinations, active pill and integrated module disclosure. Mobile Home/activity/migration show the detached Home / Calendar / Modules / More capsule, safe-area clearance and reserved content viewport. The capsule yields when editable fields receive focus; short/zoomed viewports place it in document flow. The expense task replaces mobile product navigation with Back plus a separate action area, leaving its body scrollable without covering fields/errors. Real device/software-keyboard checks remain outstanding.

Record links now use an icon/chevron title affordance on desktop and outlined Details-plus-chevron targets on compact rows. They remain native, individually named links; rows have no whole-row click handlers or nested interactive targets.

For before/after context, inspect the first M1 [Home](https://github.com/RAbnza/Personal-Management-Platform/blob/8f0bab785af69b612901fd3dc868953cf90920de/docs/verification/assets/redesign-m1/home-light-1440.png), [mobile activity](https://github.com/RAbnza/Personal-Management-Platform/blob/8f0bab785af69b612901fd3dc868953cf90920de/docs/verification/assets/redesign-m1/activity-light-320.png) and [mobile expense review](https://github.com/RAbnza/Personal-Management-Platform/blob/8f0bab785af69b612901fd3dc868953cf90920de/docs/verification/assets/redesign-m1/expense-light-320.png). Original binaries remain in Git history, avoiding duplicate artifacts in the current tree.

Reproduce with `pnpm dev --port 3200`, then open `http://localhost:3200/dev/design`. Expand **M1 review controls** to choose a composition, System/Light/Dark and an ivory/cream comparison. The capsule demonstrates product navigation independently of this review toolbar. Open `?screen=expense&stage=review` for the canonical synthetic review, or `?screen=home&treatment=cream` for the alternative light background. Fixture response controls inside the expense body's disclosure expose submitting/accepted/stale/unknown presentation. These controls do not save workspace preferences or create a new persisted theme.

For automated recapture, stop that development server and run `pnpm exec playwright test --config=playwright.redesign.config.ts`. This starts its own server and rejects every `/api/**` request. The route is gated out of production at the request boundary and in its Server Component.

See [verification/handoff](../../../REDESIGN_M1_HANDOFF.md) and [component contracts](../../../REDESIGN_M1_COMPONENT_GUIDE.md). Owner review should cover hierarchy, everyday density, mobile reading effort, review clarity and migration consequences. Record feedback before assigning M2.
