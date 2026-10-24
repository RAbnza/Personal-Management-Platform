# P1 — Local foundation and everyday Money

Date: October 25, 2026 (Asia/Manila). Branch: `feat/salapiya-p1-local-foundation`.
Base: `01709d766c65b67ae476b03d85ab13f55f6ba6da`, fetched and verified against
`origin/feat/salapiya-p0-google-gate-closure` before implementation.

**Status: P1 implemented and verified on the tested Windows/Android targets.** P0 was not
repeated. P2 identity/synchronization work and the private release gate remain
outside this assignment. This is the assignment's one primary handoff.
Implementation checkpoints: `8af262e` (composition/storage/workflows) and
`a303692` (financial hardening and native acceptance).

## Delivered application and review paths

The normal `lib/main.dart` entry point now opens production local composition.
No configuration, Google sign-in, anonymous registration, Supabase initialization
or network is required. `--dart-define=SALAPIYA_DEMO=true` explicitly selects the
preserved synthetic design application. P0 engineering entry points stay separate.

The approved branding, Porcelain/Midnight themes, typography, five destinations,
Windows sidebar/action tray, Android capsule, editor surfaces, confirmation steps,
responsive layouts, safe areas and SDK navigation remain in use.

| Review path | Real behavior |
| --- | --- |
| First run → Create local offline profile | Display name and appearance; one stable profile, protected random database key, resumable initialization. The other two approved choices remain visible: Google truthfully upcoming; local archive recovery real. |
| Profile & utilities | Durable display name, appearance, text size, amount privacy, reduced motion and craft effects. Local device/connection facts; actual encrypted backup and inspected restore. No fictional identity/device or simulated lifecycle success. |
| Money → Accounts | Cash, Bank, Mobile wallet, Checking and Savings; institution/notes; exact opening amount and cutoff; derived balance, opening evidence and account history. Archive retains balance/history and blocks new entries. |
| Money → Add expense / Record income | Owned account/category selection, dates, description, references/notes, merchant/sender/source details and income classification. Expenses support exact positive category portions, including repeated categories, up to 100. |
| Money → Transfer | Amount arriving, source/destination, up to 20 explicit fees, fee category/date and source-additional/withheld/separate bearing account. Both sides and every fee commit together. |
| Editor → Review → Confirm & save | Frozen payload/ID, exact cash/category effects, explicit confirmation, durable receipt, saving/saved/failed/stale/uncertain states and original-ID resolution. No production result-simulation selector. |
| Money → Activity / account history | Search, kind/category filters, bounded visible pages, source-linked detail and immutable revision trails. Filtering/paging never changes account totals. Comparisons and reversal evidence remain in account history even without a new cash posting. |
| Transaction detail | Current-version corrections, partial/multi-portion refunds and reversals. Prior revisions remain readable and linked; superseded facts do not continue contributing to balances. |
| Account → Reconcile | Observed-versus-calculated comparison at an explicit date, with source-count/version evidence. Saving a comparison moves no money. Its detail offers a separate reviewed adjustment; stale sources require a fresh comparison. |
| Account → Record adjustment | Signed, reasoned equity adjustment; no fabricated income/spending. Supports current-version correction/reversal and negative-balance acknowledgement. |
| Money → Saved drafts | Profile/operation/source-scoped encrypted drafts; navigation/restart restoration, explicit discard or save-and-leave, and separate draft/posting status. Posting and draft removal share one transaction. |
| Overview | Actual liquid total/wallets, recent source-linked records, seven-day net-spending chart and exact value disclosure from current financial evidence. Empty profiles are complete zero/empty states, not missing snapshots. |

Debts, Shared Expenses, Life, cards, planning, reports, CSV imports and supporting
files retain their approved implementations in demo mode. Production entry points
show truthful upcoming states and do not expose their mock saves or records.

## Financial contracts and reuse

The single pure planner is [finance_domain.dart](../../apps/salapiya/lib/local/finance_domain.dart).
Both previews and the transaction writer call it; UI controllers do not independently
calculate financial effects. [local_finance_controller.dart](../../apps/salapiya/lib/local/local_finance_controller.dart)
adapts committed query results to the existing approved frontend models.

- Reuses P0 `exact_money.dart` parsing, component bounds and checked SQLite integers.
  All effects use `BigInt`; monetary form/command/archive boundaries are lossless
  strings. Posting components are nonzero and bounded to ±100,000,000,000 minor
  units. Aggregate account balances are checked against signed SQLite 64-bit range.
  Comparison observations support that full signed range; differences remain exact
  even when larger than one component or one SQLite integer.
- Opening is equity, not income. Zero opening creates no zero posting. Ordinary
  activity is strictly **after** the cutoff. Opening corrections retain the original
  account/cutoff and review every affected historical balance boundary.
- Income classifications match the web contract: earned, gift, reward, other.
  Split portions must be positive and sum exactly. Transfers create neither income
  nor spending; only actual fees recognize spending. Withheld fees use the transfer
  date and their combined source principal obeys the component bound.
- Every action has a stable action ID, append-only revisions and immutable paired
  postings. Replacement contributes only its current economic evidence. Reversal
  voids the original effect at its original dates while preserving its evidence.
  Refunds have their own cash receipt and negative expense allocations, capped
  independently by original posting IDs and prior current refunds. Multiple portions
  are atomic; a refund is never income. Dependent evidence blocks incompatible
  source correction/reversal until explicitly resolved.
- Negative-balance review checks all affected historical date boundaries, not just
  the final total. Acknowledgement is part of the frozen accepted intent. Adjustments
  use equity. Reconciliation records its observed/calculated/difference/source count;
  changed evidence cannot silently authorize an old adjustment.
- Accepted command IDs return their original result before mutable account/version
  validation. Reusing an ID for another payload fails. Competing stale previews fail
  under the SQLite write transaction. Original evidence is never edited in place.

Established references inspected: web `open-financial-account.ts`,
`manual-financial-action.ts`, `record-income.ts`, `record-expense.ts`,
`record-transfer.ts`, `record-refund.ts`, `correct-financial-action.ts`,
`reconcile-account.ts`, `negative-balance-repository.ts`, financial account/history
queries and their acceptance tests. Native tests reuse D5 F-EXPENSE/F-TRANSFER
amounts and P0 canonical-money fixtures. The blueprint, P0 architecture handoff,
D5 handoff/state inventory and reference system/database architecture informed
the implementation. No historical web file, test or PostgreSQL migration changed.

## Storage, initialization and recovery

[local_store.dart](../../apps/salapiya/lib/local/local_store.dart) owns a fresh,
transactional native schema version 1: `local_profile`, `local_command`,
`local_account`, `local_category`, `local_revision`, `local_posting`, `local_seal`
and `local_draft`, plus the migration version. These are ordinary local tables,
not replicated financial row writes. There is no connector/upload queue or second
synchronization engine.

SQLite uses the P0-verified PowerSync native open factory, SQLite3 Multiple Ciphers,
WAL, FULL synchronization, foreign keys, memory temporary storage and disabled SQL
profiling. Strict tables, composite owner FKs, immutable update/delete triggers,
post-seal insertion guards, category-class checks and balanced-journal sealing
complement domain validation. Postings use INTEGER minor units; revision summary
amounts use canonical integer TEXT so full-range comparison differences cannot
overflow. Queries aggregate with BigInt, never SQLite TOTAL or floating point.

The application support `local-v1/` directory is separate from all P0 proof stores.
`salapiya.local.production.v1` in OS secure storage holds one versioned activation
descriptor, stable owner ID and independently random database key. A descriptor is
stored before first database creation. Interrupted first-run resumes the same
identity/key. Existing files with missing/corrupt credentials, missing ready databases,
wrong keys, unsupported versions and integrity failures stop safely; no silent
deletion, key replacement or empty-database fallback occurs.

[local_profiles.dart](../../apps/salapiya/lib/local/local_profiles.dart) provides
the portable recovery foundation. Library AES-256-GCM authenticates a distinct P1
header and versioned manifest; generated recovery secrets contain 256 random bits
and are independent of the OS key. Archives contain all local accepted command
intents/IDs/timestamps, profile/preferences and unposted drafts. They exclude OS
keys, OAuth/session tokens, attachments, cloud authority and group permissions.
Format/schema/command/calculation versions and exact counts are checked.

Recovery inspects the decrypted manifest, revalidates/replays original local commands
into a separately keyed staging database, checks integrity and only then activates
it. A protected staging descriptor makes interruption before/after final rename
resumable. Financial receipts/effects remain single, with original IDs. Existing
profiles are never merged or overwritten. Wrong secrets/tampering/unsupported
archives/invalid financial recipes cannot activate a profile.

Dependencies retain P0 pins. The only new direct dependency is
[`file_picker` 13.2.0](https://pub.dev/packages/file_picker), pinned with its lockfile,
for native Windows and Android document selection/saving. Its Android manifest adds
no broad storage permission; SAF handles user-selected destinations. No hosted
dependency, telemetry, paid resource or provider configuration was introduced.
Pub setup encountered the existing Windows symlink restriction; ignored plugin
directory junctions were recreated using the documented P0 workaround. No global
Windows security setting was changed, and subsequent native builds passed.

## Actual verification

Targets: tested Windows 11 x64 build 26200.9711 and Android 17/API 37 x86_64
emulator, Flutter 3.47.7/Dart 3.13.5. Test data is synthetic and separate from
the production local profile slot.

| Check | Outcome |
| --- | --- |
| Static analysis and formatting | `flutter analyze --no-pub`: no issues. 117 Dart files unchanged by the format check. |
| P1 financial commands | 19 passed, including standalone/full-range/multi-portion cases, 100 exact split portions and blank economic-date rejection. |
| P1 persistence/recovery | 9 passed, including activation resume both before rename and after final descriptor-write failure. |
| P1 real killed-process WAL recovery | Both committed and mid-write Windows worker cases passed: complete receipt/evidence or none; draft state agrees. |
| P1 widgets | 3 passed: Windows/Android production composition, real committed fixtures, empty/first-run choices, truthful availability, Midnight and 200% text with compact navigation. |
| Focused regression batch | 66 passed: 33 P1 checks, 2 P0 canonical-money fixture checks and 31 affected prototype finance/widget/Overview/shell regressions. Latest date-validation change was followed by a focused 19/19 financial rerun. |
| Approved UI journey — Windows | Passed accounts/categories, exact validation, draft restoration, split expense, income, transfer with multiple fees, correction/multi-portion refund/reversal, reconciliation/linked adjustment, standalone signed adjustment/reversal and persisted profile/theme reopen. |
| Approved UI journey — Android | The same expanded journey passed on the emulator. |
| Native independent recovery — Windows | Passed separately keyed restore, wrong-secret rejection, interrupted activation and all 9 original commands/financial sources/draft/preferences. Separate process invocation reopened the protected profile and exact PHP1,600 total. |
| Windows → Android recovery and separate process | Passed using a real 4,493-byte encrypted synthetic Windows archive; no old database key/OS credentials transferred. Restored all 9 commands, exact PHP1,600 total, preferences and draft. After `am force-stop`, a second native invocation reopened the OS-protected profile with the same results. |
| Normal Windows/Android product builds | Windows release build passed (143.8s); normal Android debug APK passed (76.8s). These use product `main.dart`, not engineering/test entry points. |
| Explicit offline native journey | Passed on both targets with outbound Dart HTTP denied and zero attempted HTTP clients. Android ran the complete expanded UI journey with airplane mode verified on (`1`); original off state (`0`) restored afterward. |

Initial integration runs found and fixed omitted zero-effect comparisons in account
history and a category-route context that prevented opening its real editor.
Early fake-clock widget attempts to run SQLite write journeys were stopped; final
widget tests use real prepared read models, and native engines exercise the actual
write journeys. One overlapping host Flutter invocation hit a native-DLL lock;
subsequent Flutter build/test commands run serially. No failed attempt is counted
as passing. The first Android build with the new picker took 274.9 seconds; this
is a build result, not a runtime performance measurement.

The initial Android integration invocation used Flutter's default post-test
uninstall. Subsequent recovery runs explicitly use `--no-uninstall`; repository
P0 evidence and hosted resources are unchanged, but this run does not claim
preservation of pre-existing emulator installation data/OS keys across that
initial uninstall. No backend revocation/reset or P0 gate rerun occurred.

Reproduction from `apps/salapiya/`: use `flutter test --no-pub --no-uninstall
integration_test/p1_local_money_test.dart -d <target>` for the shared native journey.
`p1_native_recovery_test.dart` seeds a protected synthetic recovery fixture; a second
invocation with `--dart-define=P1_VERIFY_RESTART=true` verifies the process boundary
and removes that fixture. The cross-target case uses `P1_EXPORT_PATH` on Windows,
then an ADB copy to the Android app's external files directory and
`--dart-define=P1_IMPORT_WINDOWS=true`. Never run Android integration tests with
Flutter's default uninstall against an installation whose local data you need.

## Limits, P2 boundary and owner action

- P1 is local authority. No Google enrollment/download, connected-profile replacement,
  server acceptance, private synchronization, groups, device revocation or cloud
  deletion is claimed. Those production controls remain visibly upcoming.
- Portable activation currently requires a fresh installation/local profile directory.
  Same-installation replacement/merge is deliberately unavailable. Keep the original
  files and recovery secret; a missing OS key cannot be reconstructed from ciphertext.
  Archive limits are 20,000 commands, 100 drafts and 32 MiB plaintext. Old P0 proof
  archives are a distinct format, not product-profile backups.
- Native document-provider dialogs are supplied by the pinned picker. Power-loss
  guarantees for provider file writes, physical storage faults/disk-full devices,
  physical Android/ARM64, minimum OS versions, Narrator/TalkBack and 10,000-action
  performance certification remain release validation, not inferred from these tests.
  Authentication/integrity checks reject partial archives; SQLite rollback tests do
  not certify faulty hardware.
- Query snapshots currently load the profile's financial facts and render bounded
  pages. P6 capacity work should measure and optimize this before a larger deployment.
  Routine app/profile lifecycle closes owned resources; committed SQLite data remains
  recoverable after process termination.
- Account metadata is entered at creation. Metadata editing and an unarchive UI are
  not provided by this P1 surface; archival retains the balance and evidence and
  blocks new activity, while historical correction remains available.
- P2 must extend the existing proven server command/receipt and PowerSync contracts
  for these native recipes, validate owner/source versions server-side, and reconcile
  accepted receipt plus downloaded checkpoint before retiring pending overlays.
  Preserve original action/command IDs, explicit local/connected authority and backup
  contract versions. Do not upload local tables or reinterpret an archive as cloud
  permission. The conservative local global financial revision is not a distributed
  last-write-wins policy. Reuse P0 enrollment collision/receipt-review guards.
- No Supabase/PowerSync/Google resource, subscription, stream, migration, paid tier or
  configuration changed. Local use continues through cloud outages without polling.

Local build outputs are the normal `build/windows/x64/runner/Release/` application
folder and `build/p1-local-debug.apk` (the normal product APK retained before native
test builds). They are ignored development artifacts, not committed installers.
The normal product APK was restored on the emulator after testing.

Owner action for P1 review: run the normal Flutter entry point on Windows/Android,
create a local profile, use Money, and keep a generated recovery secret separately
from an exported archive. No cloud setup or payment is required. Product-wide
real-data release/signing/update/lifecycle acceptance remains P6; this assignment
does not merge `main` or begin P2.
