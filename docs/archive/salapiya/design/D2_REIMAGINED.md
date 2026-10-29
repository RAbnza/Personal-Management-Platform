# D2 reimagined — Daylight

> **Historical record:** preserved development evidence. Current summary: [Development history](../../../DEVELOPMENT_HISTORY.md).

23 October 2026 (Asia/Manila). Branch: `feat/salapiya-d2-reimagined`.
Built on `7310e47` plus the existing uncommitted D2 shell and prototype flows.
The maintainer explicitly authorized replacing all previously approved UI. This is
still a synthetic, memory-only prototype, awaiting personal visual review.

## Composition

Visually inspected all seven images present in `apps/salapiya/assets/references/`
and all five in `docs/reference/redesign-references/`. The request mentioned nine
new images; the directory contained seven. The open ledger in new reference 3,
dark hierarchy in 2/4, wallet hierarchy in 6/7, and mobile navigation in 5 informed
the implementation, together with the older financial compositions.

Windows: ink sidebar, editorial heading, asymmetric balance/chart and wallet
columns, open transaction ledger, category strip, interactive week agenda, shared
household and Life sections. Android: compact balance, spending detail on demand,
wallet switching and a single dock. Small windows and large text retain scrolling
and a labeled navigation fallback.

Geist replaces Nunito Sans as the application font. Warm porcelain and graphite
support lilac, mint and peach accents. `EditorialSurface`, `Eyebrow`,
`SectionHeading` and `IconTile` are reusable primitives. The actual Salapiya logo
is unchanged. The Design Gallery uses the new tokens and preserves older motif
and type studies. No packages or external assets were added to the runtime.

## Data and interaction

The 15–21 October activity fixture uses exact BigInt centavos: opening liquid
balance ₱16,046.75 + income ₱18,000.00 − outflows ₱4,746.00 = ₱29,300.75.
Daily bars, category totals and activity filters derive from those records.
Only chart geometry converts to floating point. Exact values and transaction
details are accessible through native controls. This is not real analytics.

Wallet selection, daily chart selection, exact-value expansion, activity filters,
record details and agenda dates are interactive. Privacy hides values and chart
proportions. Empty/incomplete scenarios withhold history; pending effects stay
separate. Group examples remain independent of private liquid balances. Existing
source routes, draft protection, scenarios, utilities and five destinations remain.

## Verification

Passed formatting, analyzer, affected widget suites (including the final Windows
adaptive rerun), and native shell journeys on Windows and the Android API 37
emulator. Windows release and Android debug APK builds passed. The normal Android
APK was installed and launched after the integration run. Historical D2 profile
files are not new performance proof.
No production finance, identity, persistence, synchronization, migrations or G0–G4
gate closure is claimed. Manual visual approval and physical-device accessibility
acceptance remain with the maintainer.

## Floating controls and bounded previews

Follow-up: `fix/salapiya-floating-docks`. The shell now overlays its controls in a
viewport-anchored Stack. The Windows tray is compact and centered; Android keeps
its dark capsule. Safe areas surround both, and measured dock height adds trailing
padding inside each scroll view. Android hides the dock while the keyboard is open.

Overview shows at most four recent movements, one wallet, one selected agenda
item, two upcoming reminders, four category totals, one household and one Life
summary. “See all” opens separate history with six records per page. Wallets and
history support horizontal swipes plus explicit selection/paging controls; page
heights follow content and text scaling. Amounts and source meaning are unchanged.
