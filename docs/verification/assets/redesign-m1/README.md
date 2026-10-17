# M1 rendered review evidence

All records are synthetic. Captured in Microsoft Edge/Chromium on Windows at 1440×1000 and 320×900 CSS px. Tablet checks use 768×900. Screenshots are actual browser output; the development server's diagnostics badge is hidden only in captures. They are representative proofs, not completed application screens or owner approval.

| Composition | Light desktop | Dark desktop | Light mobile | Dark mobile |
| --- | --- | --- | --- | --- |
| Home | [1440px](home-light-1440.png) | [1440px](home-dark-1440.png) | [320px](home-light-320.png) | [320px](home-dark-320.png) |
| Financial list/detail | [1440px](activity-light-1440.png) | [1440px](activity-dark-1440.png) | [320px](activity-light-320.png) | [320px](activity-dark-320.png) |
| Expense review | [1440px](expense-light-1440.png) | [1440px](expense-dark-1440.png) | [320px](expense-light-320.png) | [320px](expense-dark-320.png) |
| Tracker migration | [1440px](migration-light-1440.png) | [1440px](migration-dark-1440.png) | [320px](migration-light-320.png) | [320px](migration-dark-320.png) |

Also inspect [expense receipt](expense-confirmed-dark-320.png). Mobile financial record links open one full detail view. Expense actions explicitly consume synthetic response states. Migration uses fixture-confirmed counts and bounded manual batches; cancelling retains committed entries. Nothing in the proof calls an API or writes a real record.

Reproduce with `pnpm dev --port 3200`, then open `http://localhost:3200/dev/design`. Choose a composition and theme; Interaction states exposes dialog, sheet, safe confirmation, help, menu, fields, feedback and all command states. Select System to follow the OS. These preview controls do not save workspace preferences.

For automated recapture, stop that development server and run `pnpm exec playwright test --config=playwright.redesign.config.ts`. This starts its own server and rejects every `/api/**` request. The route is gated out of production at the request boundary and in its Server Component.

See [verification/handoff](../../../REDESIGN_M1_HANDOFF.md) and [component contracts](../../../REDESIGN_M1_COMPONENT_GUIDE.md). Owner review should cover hierarchy, everyday density, mobile reading effort, review clarity and migration consequences. Record feedback before assigning M2.
