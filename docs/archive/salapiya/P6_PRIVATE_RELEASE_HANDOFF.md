# P6 — Complete private release

> **Historical record:** preserved development evidence. Current summary: [Development history](../../DEVELOPMENT_HISTORY.md).

> Historical P6 evidence. The later approved release scope and current
> **APPROVED FULL RELEASE** classification are recorded in
> [final release and project closure](../../OPERATIONS_AND_RELEASE.md#salapiya--final-release-and-project-closure).
> Original results and unexecuted checks below remain unchanged.

28 October 2026, Asia/Manila. **Release classification: BLOCKED.** A build or test
count is not certification of installation, financial safety, recovery or authority.

## Revision, authority and decisions

- Branch: `feat/salapiya-p6-private-release`. Fetch/remote inspection confirmed
  the supplied base `a2f68978a334b8076812f0c643c5377303343808` on
  `feat/salapiya-android-overview-polish`; no advanced baseline was discarded.
- Final candidate app version: `0.6.0+7` (build 6 retained as the signed upgrade baseline). Production source checkpoint: `f4050eb60cf82368d98fbfe8064cd99811cc6cb8`. The final
  report commit is identified by `git log -1 --format=%H --
  docs/salapiya/P6_PRIVATE_RELEASE_HANDOFF.md`; the final response supplies the
  final pushed SHA, avoiding a self-referential hash inside its own commit.
- Read the blueprint, P0–P5 handoffs, final redesign/Android polish handoffs,
  design-system/platform rules, financial/file/lifecycle source references and
  actual native/backend/test/release implementation. The final approved UI remains
  authoritative. Web source, tests, migrations and pnpm tooling are preserved.
- Native schema 7 reads schemas 1–7; local command/calculation contract 1, connected
  transport 2, Shared contract 3 and Life contract 5. Archive writers local 1/connected 3
  read formats 1–3, with validated P4/P5 coverage. Bounds remain 32 MiB plaintext,
  20,000 accepted commands/retained intents and 100 drafts; original file bytes,
  sessions, OS keys, notification consent and group authority are excluded.
- Server baseline: 42 immutable forward migrations `20261024000100` through
  `20261027003700`; hosted catalog count matches the source inventory. P6 adds no
  database migration and never replays web migrations into SQLite.
- **Approval received during P6:** local-only attachments for this private
  release. This explicitly supersedes M14's cloud-byte launch dependency for this
  release only. Metadata can sync; originals require independent backup and exact
  reselection on other devices. Cloud upload/download/scanning is deferred and
  must not be advertised as available. Local files remain unscanned.
- The maintainer authorized local creation of an Android signing key using official JDK
  tooling and hidden password entry outside chat. Trusted Windows signing remains
  open by explicit decision; no certificate purchase or paid service is authorized.
- L05–L07, arbitrary trackers, external calendar sync, public stores, custom updater,
  automatic distribution and merge to `main` remain outside scope.
- No new screenshots, golden images or UI image reports were generated, captured,
  deleted or committed. New bitmap files are actual native application icon resources.

## Inventory and evidence labels

**U:** fresh unit/widget/encrypted SQLite or local PostgreSQL integration.
**H:** fresh real signed API/hosted PostgreSQL, including independent sessions.
**NW/NA:** fresh production Flutter UI on Windows/Android emulator, using a debug
integration engine unless explicitly stated. **Historical:** P0–P5 development
proof, not recertified by citation. **NE:** not executed. **Blocked:** missing
prerequisite or mandatory acceptance. Injected/mock status/download rows are U,
never H or release-native acceptance.

The feature matrices retain blueprint row meanings; the P3 handoff's differently
grouped S-row shorthand does not redefine S01–S10. All rare UI options still need
individual native coverage even where grouped domain/hosted fixtures passed.
Paths in test columns are relative to `apps/salapiya/` unless stated otherwise.

### Money M01-M17

| ID | Implemented blueprint capability | Fresh U evidence (H explicitly marked) | Fresh release gap / environment / dependency |
|---|---|---|---|
| M01 | Cash, wallet, checking, savings accounts; metadata, opening balances/cutoffs, archive/history | P1 finance/persistence; H P2 boundary/parity | Installed identity/opening/cutoff/update preservation; G5 |
| M02 | Income, expenses, category splits, completed transfers, fees, categories and activity/history | P1 financial/split/transfer fixtures; H unrelated stale-base creates | All rare UI options individually native; signed packages |
| M03 | Corrections, refunds, reversals, negative-balance acknowledgements, reconciliation and adjustments | P1 correction/refund/reversal/reconciliation; H correction races | Full native conflict/rejection review options |
| M04 | Existing-debt import/setup and borrowing/net proceeds | P4 finance/debt components; H 12-command independent plan parity | Every native borrowing/fee combination |
| M05 | Debt payments, classifications, due allocations, schedule revisions and allocation mapping | P4 debt/components/provider dates; H debt graph | Native partial/unknown payment/schedule; physical device |
| M06 | Provider-confirmed early debt settlement, residual closure and adjustments | P4 source-cap/waiver/residual/retained closure; H plan parity | All native payoff combinations and signed upgrade |
| M07 | Credit-card metadata, purchases, payments, fees, interest, refunds, overpayment and utilization | P4 finance/shared-card/provider dates; H card isolation | Native card journeys; credit outside liquid assets |
| M08 | Statements, statement revisions/reconciliation, payment allocations and installment plans/applications | P4 installment/statement/rejection; H allocation race | All native allocations and update dependency preservation |
| M09 | Recurring income/bills/subscriptions, rule versions, occurrences, overrides/skips and explicit links to actuals | P4 planning/forecast/recovery; H plan parity | Native planning; no implicit actual posting |
| M10 | Category budgets, explicit periods, net/gross bases, comparisons and history | P4 planning overlap/basis and report; H planning graph | All native archived/overlap rejection options |
| M11 | Savings goals, reservations, release/reallocation, progress and supported-funding ranges | P4 reservation/reallocation/forecast; H planning graph | Native underfunding; signed update |
| M12 | Read-only forecasts, source coverage, recorded future cash and hypothetical scenarios | P4 read-only forecast/recovery/exclusions | Dense-source native forecast and all scenario options |
| M13 | Financial Overview, reports, charts, exact drilldowns, coverage and CSV export | Final-redesign/Overview polish/reports/500-row export | Installed cold start, physical reports, billed sync; G6/G7 |
| M14 | Financial supporting files and links to source records | P4 files/bounded provider/P5 documents; H metadata privacy | Local-only approved; independent originals backup/native reselection |
| M15 | Reviewed CSV cash-history import, duplicate warnings, cutoff-safe posting and bounded processing | P4 import/parity/500-row cap; H repeated-checksum rejection/review | Signed native file provider, disk full, output export |
| M16 | Financial reminders and Calendar projections | P5 Agenda/reminders; historical real OS delivery | Fresh installed OS delivery/cold activation/reboot; F03/G5 |
| M17 | Export, backup, restore, account/profile lifecycle, settings and help | P0-P5 archive/crash/migration/restore; H original receipt/session | Signed updates, full deletion/revocation/owner loss and hosted DR; G5/G8 |

### Shared Expenses S01-S10

| ID | Implemented blueprint capability | Fresh U evidence (H explicitly marked) | Fresh release gap / environment / dependency |
|---|---|---|---|
| S01 | Groups, owner/member roles, manual/registered/deleted participants, invitations and membership intervals | P3 domain/widget; H invitation consent/expiry/claim | All invite/claim UI options, Google refresh, owner loss |
| S02 | Single/multiple payers, selected participants, equal/exact custom shares | P3 exact split/remainder; H multi-payer totals | All multiple-payer/custom-share native options |
| S03 | Creator-only finalized bill revisions/corrections and historical views | P3 immutable source-version; H creator/stale/racing corrections | All native rejection/review paths |
| S04 | Group refunds and changed private source evidence | P3/P4 refunds/private attribution; H independent axes/caps | All native after-settlement/correction combinations |
| S05 | Full/custom/selected settlements, partial individual bills, multiple allocations and advances | P3 allocation/cap/advance; H multi-bill/partial/resolution | Each advanced report UI option individually native |
| S06 | Pending, confirmed, disputed, cancelled and reversed settlement history | P3 transitions/limits; H recipient-only resolution | Physical attention/notification; sync never means confirmed |
| S07 | Reciprocal netting, zero-sum balances, pairwise explanations and group suggestions | P3 positions/suggestions/nonmutation; H group graph | All explanation/suggestion routes individually native |
| S08 | Integrated Add Expense, existing-purchase conversion, cash/card/unpaid private adoption | P3/P4 shared-card; H actual card sharing and private adoption | Final native integrated card-funded options |
| S09 | Private settlement/refund clearing, reclassification, retained-evidence review and coverage | P3 clearing/refund/source review; H exact attributed evidence | All native retain/reclassify/rejected review options |
| S10 | Group history/export, former-member entitlements, ownership/lifecycle handling and attention | P3 entitlement/export/attention; H former/removed-member denial | Owner loss/deletion retention/installed lifecycle; G8 |

### Life and native foundation

| ID | Implemented blueprint capability | Fresh U evidence (H explicitly marked) | Fresh release gap / environment / dependency |
|---|---|---|---|
| L01 | Personal appointments/events, mixed Agenda/Calendar and reminders | P5 Life/Agenda/DST; H immutable Life graph | OS notifications, physical timezones/reboot/cold activation |
| L02 | Personal Tasks preset | P5 local/connected/crash/widget; H conflicting edits/replay | Signed accessibility and update preservation |
| L03 | Learning and Books presets | P5 preset/progress/rating parity; H exact decimal strings | Physical/assistive workflows; custom tracker excluded |
| L04 | Career applications, stages, interviews/assessments, follow-ups, notes and history | P5 graph/documents/Agenda; H full-graph private isolation | Native documents/source navigation and original file backups |
| F01 | Theme, navigation preferences, onboarding, search, help and accessibility | Final redesign/Overview/shell/200% semantics/theme widgets | Human Narrator/TalkBack, physical DPI/device; G6 |
| F03 | Scheduled external email reminders and current web worker topology | P5 source/consent/quiet hours/cancellation; historical OS proof | Fresh installed display/tap/cold activation/reboot/OEM; G5 |



## A01-A28 acceptance inventory

| ID | Fresh or explicitly historical evidence | Missing release test / environment / owner dependency |
|---|---|---|
| A01 | U local startup/creation; native no-HTTP journeys below | Fresh installed release airplane-mode first run NE |
| A02 | U real P0/P1/P2/P5 child-process kills and WAL/transaction rollback | Production form OS-kill and signed-package power-loss NE |
| A03 | Historical real Google Android enrollment/Windows retrieval; H enrollment authority | Fresh interactive Google on final installed packages NE |
| A04 | H collision preserves populated profile; U cancellation/late callback guards | Fresh final-package Google collision/cancel UI NE |
| A05 | H independent stale-base creates accepted once | Fresh native two-device results below; signed-device acceptance NE |
| A06 | H lost committed response returns original immutable receipt | Fresh native transport/restart results below; signed packages NE |
| A07 | H correction/allocation races; U debt final-capacity/source guards | Every advanced native concurrent payment/correction option NE |
| A08 | U/H exact PHP100 split33.34/33.33/33.33 and zero-sum positions | Native Shared journey below; no double-based arithmetic |
| A09 | U/H PHP1200 adoption: cash-1200/expense400/receivable800 once | Native integrated path below; all funding variants not individually native |
| A10 | U/H actual card sharing/refund; no repeated private cash/liability/spending | All final redesigned card-funded Shared editor combinations NE |
| A11 | U/H full/custom/partial/multi-bill/advance/dispute/reversal source caps | Every advanced native option individually NE |
| A12 | U/H owner-independent cloud/group and same-identity contracts | Sole-owner identity loss recovery/drill BLOCKED G8 |
| A13 | H removal denies stale writes; former history excludes later activity | Native former-member SDK below; physical stale-device drill NE |
| A14 | H real JWT RLS/foreign/forged IDs/direct writes; restricted publication audit | Independent actual SDK stream results below; final expired-token subscription replay NE |
| A15 | H revoked session denied; U preserves locally available records/intent | Native controlled 503 below; actual provider suspension/reactivation NE |
| A16 | U/H exact debt import/net proceeds/components/schedules/payoff graph | Native debt journey below; every advanced combination NE |
| A17 | U/H statements/allocations/installments/overpayment and exact source caps | Native cards below; signed update dependency preservation NE |
| A18 | U/H recurrence/budget/savings; U forecasts/exclusions/nonmutation | Native planning below; expected/hypothetical never post automatically |
| A19 | U/H reviewed import/replay/cutoff conservation; U 500-row export cap | Signed native document-provider and real disk-full NE |
| A20 | U/H full Life graph and authoritative Agenda/reminder sources | Native Life below; final installed OS reminders NE |
| A21 | U accepted/pending handoff and initial incomplete financial/Life coverage | All native incomplete-download/report variants not exhaustively tested |
| A22 | U independent-key restore/wrong-secret/corruption/activation faults | Native new-device final-release restore without original OS keys still required |
| A23 | U/H original receipts/current authority and held archived intent | Native connected recovery below; all old/deleted-account permutations NE |
| A24 | U wrong key/corruption/interrupted transaction/schema/activation | Actual storage exhaustion/document-provider interruption/failed package update NE |
| A25 | Package/signing results below | Mandatory signed update/data/pending/backups preservation on both platforms BLOCKED |
| A26 | U semantics/focus/keyboard/200% reflow/themes; narrow Windows defect fixed | Human Narrator/TalkBack/physical DPI/release reduced-motion BLOCKED G6 |
| A27 | U bounded provider/type hints/AEAD/checksum/tamper/absence/detach; H metadata isolation | Local-only approved; no cloud or scanning claim; fresh native picker/reselection qualified below |
| A28 | H revoked current-session/removed-member negatives; historical deleted-identity adapter | Complete device/account deletion and stale restore/reconnect lifecycle BLOCKED G8 |

## All40 inherited Shared Expenses scenarios

Names/contracts retained from [P3](P3_SHARED_EXPENSES_HANDOFF.md) and the [historical contract](../web/SHARED_EXPENSES_IMPLEMENTATION.md). Grouped tests do not constitute40 independent production UI passes.

| # | Scenario | Fresh evidence boundary / remaining coverage |
|---|---|---|
| 1 | Registered group | U/H grouped P3 authority fixtures; individual native option incomplete |
| 2 | Manual participant | U/H grouped P3 authority fixtures; individual native option incomplete |
| 3 | Single payer equal split | U/H grouped P3 authority fixtures; individual native option incomplete |
| 4 | Multiple payers | U/H grouped P3 authority fixtures; individual native option incomplete |
| 5 | Exact payer total | U/H grouped P3 authority fixtures; individual native option incomplete |
| 6 | Exact share total | U/H grouped P3 authority fixtures; individual native option incomplete |
| 7 | Selected members | U/H grouped P3 authority fixtures; individual native option incomplete |
| 8 | Exact custom shares | U/H grouped P3 authority fixtures; individual native option incomplete |
| 9 | Reciprocal netting | U P3 domain/widget; individual native option incomplete |
| 10 | Net-zero positions | U P3 domain/widget; individual native option incomplete |
| 11 | Sources intact | U P3 domain/widget; individual native option incomplete |
| 12 | Pairwise explanations | U P3 domain/widget; individual native option incomplete |
| 13 | Group suggestions | U P3 domain/widget; individual native option incomplete |
| 14 | Nonposting suggestions | U P3 domain/widget; individual native option incomplete |
| 15 | Full settlement | U/H grouped P3 authority fixtures; individual native option incomplete |
| 16 | Custom partial | U/H grouped P3 authority fixtures; individual native option incomplete |
| 17 | Selected expenses | U/H grouped P3 authority fixtures; individual native option incomplete |
| 18 | Partial selected bill | U/H grouped P3 authority fixtures; individual native option incomplete |
| 19 | Multi-bill payment | U/H grouped P3 authority fixtures; individual native option incomplete |
| 20 | Overpayment/reverse | U/H grouped P3 authority fixtures; individual native option incomplete |
| 21 | Pending before confirmation | U/H grouped P3 authority fixtures; individual native option incomplete |
| 22 | Waiting for others | U P3 domain/widget; individual native option incomplete |
| 23 | Needs my confirmation | U/H grouped P3 authority fixtures; individual native option incomplete |
| 24 | Confirmed updates | U/H grouped P3 authority fixtures; individual native option incomplete |
| 25 | Dispute unchanged | U/H grouped P3 authority fixtures; individual native option incomplete |
| 26 | Manual limitation | U/H grouped P3 authority fixtures; individual native option incomplete |
| 27 | Versioned correction | U/H grouped P3 authority fixtures; individual native option incomplete |
| 28 | Refund after settlement | U/H grouped P3 authority fixtures; individual native option incomplete |
| 29 | Existing cash nonduplication | U/H grouped P3 authority fixtures; individual native option incomplete |
| 30 | Integrated Add Expense | U P3 domain/widget; individual native option incomplete |
| 31 | Card nonduplication | U P4 shared-card; H real card sharing/refund isolation; final integrated native option NE |
| 32 | Private funding hidden | U/H grouped P3 authority fixtures; individual native option incomplete |
| 33 | Owner private isolation | U/H grouped P3 authority fixtures; individual native option incomplete |
| 34 | Former history only | U/H grouped P3 authority fixtures; individual native option incomplete |
| 35 | Global/group attention | U P3 domain/widget; individual native option incomplete |
| 36 | Exact rounding | U/H grouped P3 authority fixtures; individual native option incomplete |
| 37 | Idempotent writes | U/H grouped P3 authority fixtures; individual native option incomplete |
| 38 | Concurrent invariants | U/H grouped P3 authority fixtures; individual native option incomplete |
| 39 | Mobile/reflow | U reflow/theme/200%; native results below; physical/signed reflow NE |
| 40 | Keyboard/accessibility | U focus/labels/keyboard; human Narrator/TalkBack NE, mandatory G6 |

## G0–G8 release gates

| Gate | Release status | Actual evidence and remaining prerequisite |
|---|---|---|
| G0 | Partial, tested development envelope | Critical pinned native plugins/encrypted persistence exercised on Windows 11 x64/API 37 emulator. Physical ARM64/minimum OS matrix NE. |
| G1 | Bounded proof, signed acceptance open | U/H durable queue, immutable receipts/source-version review; native actual CDC/fault results below. Provider suspension/checkpoint-loss certification NE. |
| G2 | Historical Google proof, final package open | H/U enrollment/identity/collision; fresh interactive Google on final installed packages NE. |
| G3 | U/H financial fixtures passed | Canonical exact Dart/PostgreSQL plans, independent races and owner/group isolation. All advanced native options/signed-device races not individually certified. |
| G4 | Cryptographic/recovery proof, release drill open | U wrong-key/tamper/independent-key archives/files/SQLite and capacity recovery below. Fresh native final-package new-device restore still required. |
| G5 | BLOCKED | Trusted Windows signing/installed update/cold activation; Android provisioning/signature results below. APK signature alone does not prove safe update. |
| G6 | BLOCKED | Human Narrator/TalkBack, physical device/minimum OS, complete mixed-domain 10k capacity and installed release cold startup not certified. |
| G7 | BLOCKED | Instant storage/health measured; billed monthly traffic/peak clients/history growth, pilot isolation and recovery operations unverified. |
| G8 | BLOCKED | Local-only attachment policy approved, but full device/account deletion/revocation, sole-owner recovery and independent hosted backup/retention/restore are incomplete. |

## Fresh runs, reproduced failures and corrections

Initial broad Flutter run: 211 passed, 5 failures. Three failures were stale approved
presentation expectations (old 24-to-20 px panel padding, former Windows floating dock,
former quick-menu implementation). One was a real 3.5 px overflow in the constrained
Windows toolbar. One was an isolated Windows WAL-cleanup race after the financial
assertions. The source/tests now reflect the approved layout, with a compact
accessible Create control only under constrained width/text. No monetary expected
value was changed. Final results are recorded below, not inferred from this run.

The first hosted import rerun failed on a reused synthetic account name, then on
correctly enforced repeated-checksum duplicate warnings. The runner now appends a
uniquely named synthetic account, explicitly asserts unacknowledged duplicates
are rejected, and reviews the warnings before posting. Exact cutoff conservation,
stable row IDs, immutable metadata/source linkage and original receipt checks
passed; no hosted history was deleted to reset a fixture.

All 43 local PostgreSQL/parity tests passed on the current 42-migration baseline.
Fresh hosted checks: P2 eight, P3 seven, P4 five, debt-component twelve-command
plan parity, import atomic/replay check and P5 six. These execute actual signed
API/PostgreSQL boundaries and competing independent backend sessions, not RLS
stubs. Linked migration dry-run reports up to date, no pending migrations/seeds/roles.

The 10k probe reproduced repeated complete-journal loading during archive replay.
The recovery-only unpublished staging database now uses the existing validated
in-memory financial projection inside one transaction, through the same planner,
SQL writes and immutable seals. It compares every account/category/revision/posting
against SQLite before recovery proceeds. Ordinary financial writes/downloads retain
their original path. Targeted tests assert full prefix rollback on foreign intent,
empty-database-only replay, cutoff rebase and original command/evidence preservation.
Final serial Flutter regression: **218 passed** (`build/p6-unit-final.log`).
The separate bounded SQLite `SQLITE_FULL` (code 13) fault test passed: the
failed write preserved the original journal and draft, and retry accepted the
original command exactly once after capacity was restored. The final indexed
10,046-command independently keyed restore passed with original commands,
revisions, cutoffs and Life evidence unchanged (`build/p6-capacity-final.log`).
Native results and their distinct execution boundary follow below.

The same probe identified a full posting scan in the per-command journal-seal
query. Schema7-compatible transactional maintenance adds indexes on revision
command IDs and posting revision/date, and changes only the equivalent inner-join
iteration order. The per-command/per-date exact `SUM(amount_minor)<>0` rejection,
ownership, immutable triggers and seals remain enforced. An isolated encrypted
10k query-plan probe demonstrates indexed revision/posting searches for the ordered
query. The cached replay without these indexes was stopped while this fix was
applied and is **not counted as a passing capacity run**. The original baseline
probe completed separately; final indexed measurements are qualified below.

Native builds initially failed with generic MSB8066; a focused rerun exposed the
locked `build/native_assets/windows/powersync_core.dll` held by the long-running
baseline recovery probe. Its process/data were preserved. Further validation uses
an ignored detached worktree at `out/p6-worktree`, containing the same tracked diff
and new P6 source files, with isolated outputs. Results must be matched to source
before committing. No Windows security setting was changed.

Android signing setup initially used a security descriptor operation that failed
with SeSecurityPrivilege before key creation. The corrected owner-only DACL uses
`icacls` without elevation and verifies only the current owner/SYSTEM have access.
Visible input feedback was requested; masked SecureString entry and confirmation
now pass temporary environment values to official keytool rather than exposing them
in argv. The keystore was created successfully outside Git. Gradle automatic heap
dumps/configuration caching are disabled, and signing uses a nonpersistent daemon. A named mutex now rejects concurrent signing sessions
before password/key access; a bounded two-process check verified that rejection.

### Windows production native journeys

All seven local journeys have passing fresh Windows evidence. The consolidated
rerun passed onboarding/reopen, everyday Money, debt import/classification/provider
schedule/payoff, planning/actual links/reservation underfunding, durable Life and
Overview polish. Its card journey reached the final Overview assertion and found
a second obsolete label. After updating that exact label and retaining the amount
assertions, the entire card journey passed in the following native invocation.
Logs: `build/p6-native-windows-final.log` (six pass, obsolete card label failure)
and `build/p6-hosted-windows-missing-defines.log` (complete card pass).

The card proof preserves 3,500.00 PHP cash, 1,140.00 PHP recognized spending and
360.00 PHP noncash card credit across actual purchases, payment, provider statement,
explicit allocation/installment correction, refund, fee, interest and encrypted
reopen. The planning proof retains 500.00 PHP actual cash and supported savings
after spending, then reverses only the mistaken plan link; tomorrow's forecast
remains 400.00 PHP. Debt tests retain unknown clearing and immutable classification,
provider adjustments, source caps and reconciled payoff. These are isolated
synthetic profiles in a debug native engine, not signed installation acceptance.

An initial hosted invocation omitted public build defines. Its connection failure
and interrupted follow-on test are not counted as product/hosted passes; cached
profiles and history were preserved, configuration corrected and sessions prepared
again. Actual configured SDK results are reported separately.

Windows configured hosted results: the full scenario 31 card sharing/source
revision/refund journey and private Life offline acceptance/reopen passed through
actual PowerSync CDC. The isolated native 10,046-command fixture opened, migrated,
checked integrity and loaded a snapshot in 1,539 ms; activation/Overview took
675 ms. Twenty native saves at capacity measured p50 158.867 ms, p95 193.446 ms,
p99/max 829.611 ms. Four module navigations including test settling measured p50
961.895 ms and p95/max 1,842.072 ms. RSS was 507,428,864 bytes; maximum process RSS
687,468,544 bytes. These use a debug integration engine and warm caches.

The Windows reminder test scheduled, revised and cancelled a real OS request,
observed genuine presented notification delivery and removed the displayed owned
reminder on opt-out. It did not claim a notification tap/cold activation or human
screen-reader pass. Logs: `build/p6-hosted-windows.log` (four pass; obsolete P3
navigation failed separately). No image capture was used.

The final build 7 Windows Shared journey passed in 2:22
(`build/p6-shared-build7-windows-canonical.log`): exact split and zero-sum group,
real loopback HTTP 503 and a discarded genuinely committed hosted response,
reopened original queue accepted once, private bill/settlement funding, recipient
confirmation/reversal and clearing, source correction/refund, same-source cash
purchase adoption without duplicated money, independently keyed old-archive
restore using original receipts/current hosted authority, and former-member CDC
exclusion/private-group isolation. P4 scenario 31 also passed again against build
7 in `build/p6-shared-build7-windows-accepted.log`; that earlier invocation's P3
lookup failure is superseded only by the separate complete P3 pass.

The same complete P3 journey passed on the API 37 Android emulator in 4:37
(`build/p6-hosted-android-final.log`), including actual hosted reconciliation,
independently keyed archive recovery and former-member/private-group exclusion.
The mobile navigation uses the stable Shared destination key while preserving
the approved shorter visible label. Windows and Android financial runs were
serialized; independent hosted concurrency tests remain separate H evidence.

The final filtered Android hosted run completed **all three journeys in 8:59**:
P3 full Shared/recovery/privacy; P4 scenario 31 actual card sharing/source revision
and merchant refund with one liability/no cash replay; P5 actual authenticated
private CDC, durable offline intent, acceptance/download, completion and encrypted
reopen with unchanged financial revision. This supersedes the initial mobile
selector/form-timing and concurrent-fixture failures; no monetary assertion was
removed. Native 10k and OS notification cases retain their separate passing logs.

The final Windows read-only peer run passed all three cases in 20 seconds
(`build/p6-windows-peer-final.log`). P3 compared freshly captured hosted account
balances, financial revision, group version and exact positions to the downloaded
native state. P4 verified a completed Android card graph with exact liability,
expense and receivable totals; P5 verified accepted Android source IDs/history.
The latter selectors match completed peer history rather than requiring only the
latest run's IDs. Verification flags return before financial/Life creation.
After testing, the normal root `lib/main.dart` Debug application was rebuilt as
`0.6.0+7`, the original Windows toast command and exact shortcut bytes were restored
only from our test targets, and both isolated hidden P6 emulators were stopped.
No real profile was launched. Aggregate proof: `out/p6/windows-notification-restored.json`.

The configured full Shared journey reproduced a production regression in existing
cash-purchase adoption: the Money form retains an unused card selector, and the
Shared UI classified funding merely by that field's presence. The immutable
planner rejected the false card claim before posting. The fix derives funding
from the validated transaction type (`cardPurchase` / `cardRefund`) through one
domain helper shared by the UI and planner guard. The regression fixture includes
an unrelated valid card selector on a cash purchase, checks exact same-source
adoption and unchanged cash, and asserts no liability on that unrelated card.
No calculation, immutable-history rule or server contract is weakened. Build 7
identifies the corrected candidate and permits a same-key signed upgrade drill
from the installed build 6 baseline.

The Android initial local suite passed four journeys; three profile-creation
steps were intercepted during the real IME transition. The harness now unfocuses
editable text, waits for native IME dismissal before scrolling/tapping and treats
missed taps as fatal. With this stricter harness the complete card, debt and
planning journeys passed on API 37. Together with the initial onboarding/Money,
Life and Overview passes, all seven local native journeys have passing evidence
on Android. This is debug-engine evidence, distinct from the signed build 6 smoke
and the final build 7 connected/update checks below.

The Android copied 10,046-command fixture passed native encrypted open/migration,
integrity and snapshot in 4,439 ms; activation/Overview took 4,027 ms. Twenty saves
measured p50 1,036.966 ms, p95 1,440.246 ms, p99/max 1,584.532 ms. Four navigations
including test settling measured p50 891.936 ms and p95/max 1,222.549 ms. RSS was
672,329,728 bytes, maximum RSS 866,189,312 bytes. The save/startup targets are missed
in this debug emulator envelope; these numbers cannot certify release/physical
performance. Evidence: `build/p6-hosted-android.log`, capacity case passed separately
from its failed early hosted navigation/fixture attempts.

Android's actual notification retry passed in 2:16
(`build/p6-android-notifications-final.log`): OS permission denial retained in-app
source access; the next OS prompt was allowed; the revised scheduled reminder was
genuinely delivered; tapping the actual OS notification opened its authoritative
personal source; Back returned through Life to Overview; opt-out removed the owned
active reminder. No task completion or financial effect was inferred from delivery.
The harness allows eight minutes overall for consent interaction and scheduling;
the actual delivery deadline assertion was preserved. No screenshots were used.

## Icons, identity and actual packaged resources

Source: unchanged approved `assets/branding/mark/salapiya_mark.svg`, SHA-256
`f223376778b191c77115193cbf8952686ba2955a872ff9f5682a804e887b2813`.
Exports use its existing source-faithful transparent PNG
`display/salapiya_mark.png`, SHA-256
`f8139c0a613fd040d0534927bf4c2c6c59e756f144b28ceb6cbce3fb7e519029`.
No source geometry/colors or in-app wordmark were changed.

`generate-native-icons.py` (Pillow 11.2.1) contains rather than stretches the original.
Windows ICO has 16/20/24/32/40/48/64/128/256px frames and transparency. Android has
five legacy densities, adaptive foreground/background `#F3F4F6`, API 26 adaptive
and API 33 themed XML. The P6 request explicitly authorizes a monochrome alpha
silhouette, superseding the historical no-monochrome note **for launcher assets**.
The mark fits 46 dp on 108 dp; every nontransparent foreground pixel is asserted inside
the 66 dp circular safe zone for circle/rounded-square/OEM masks. The native icon
manifest records all output hashes. No screenshot-based review was used.

Package/application ID, Google callback, Windows company/internal names, existing
notification AUMID/CLSID and data location are preserved. About displays `0.6.0+7`.
Android now explicitly excludes private files/preferences/databases/external app
files from cloud backup and device transfer; `allowBackup=false` alone does not
cover every OEM transfer path. Source checks do not certify actual D2D behavior.

Actual PE resource verification passed for both the native debug engine and
the normal release executable: exact source-derived frames at all nine sizes,
including transparency. APK verification is recorded after the signed build. Taskbar/Start/desktop/
installer appearance and small-size recognition still require installed native
acceptance/review; a valid source ICO is not that acceptance.

## Packages, installation, updates and supported targets

The normal Windows x64 production entry point compiled in Release mode with
public development-service configuration. The wrapper verified `0.6.0+7`,
Flutter data, native plugins and compiler-provided VC++ runtime DLLs, then produced
`build/private-release/Salapiya-0.6.0-7-windows-x64-UNSIGNED-STAGING.zip`
(19,050,580 bytes; SHA-256
`954a12ae7a2ec9c831f9d4bd5022f2dd8b49cf5fa28266f9794cf3a226b2a586`).
The release executable SHA-256 is
`00aa9455aaf512a525995b974a9a62e004e168ec702de03c1153ac0ec21fa150`.
The ZIP is an unsigned full application bundle, not an installer or a trusted
signed release. It was not distributed or launched against an existing profile.
All 49 ZIP file payloads were independently decompressed and matched byte for
byte to the built bundle; CRC/path checks passed. Inno compilation/install/update
remains blocked as described in P6-01.

The earlier build 6 staging ZIP is retired. Although its release executable and
AOT payload were valid, comparison exposed a leftover 90,588,640-byte development
`kernel_blob.bin` in its asset directory. The fresh normal build 7 release removed
that stale asset, accounting for the ZIP size reduction. The packaging wrapper now
rejects that development kernel and the integration-test plugin if present; it
never deletes a profile/cache to work around contamination. No staging ZIP was
distributed. Use only the build 7 paths/hashes in the final artifact inventory.

The signed Android build 6 baseline APK is
`build/private-release/Salapiya-0.6.0-6-android-owner-signed.apk`
(79,909,883 bytes), SHA-256
`07ca7e75cbfde6ca0368aebe315c9fdc8730dea9db9de6b969c0f2c6d93e3c87`.
Its single RSA 3072-bit signing certificate SHA-256 is
`d45ef96f19ce9e9df9c23711bc9f843b2bb34350352f06aba347187980dc787e`.
Official `apksigner` verifies APK Signature Scheme v2 and the release certificate;
v1/v3/v4 are not claimed. This identity supports same-certificate updates for the
packaged minimum API 24. Package ID is `dev.salapiya.salapiya`, version `0.6.0`,
version code 6, compile/target API 36; ARMv7, ARM64 and x86_64 libraries are present.
Those declared minima/ABIs are not physical-device certification.

All 15 density PNGs match the source's visible RGBA pixels and exact alpha values.
aapt canonicalizes only invisible RGB under fully transparent monochrome pixels.
The verifier resolves optimized resource paths through the official aapt2 table;
API 26/33 adaptive foreground/background/monochrome references, callback, release
non-debuggable manifest and both sets of five backup exclusions passed. No UI was
rendered to an image. `run-as` independently rejected the installed release as
not debuggable.

A fresh isolated `Salapiya_P6_Release_Test` API 37 x86_64 emulator installed the
signed APK successfully. Its first clean Activity launch reported 2,851 ms;
this is a package-manager measurement of empty-profile startup on this emulator,
not the 10k cold-start benchmark. Actual production UI and OS storage created a
synthetic encrypted profile, reviewed a 1,000.00 PHP opening balance and 1.25 PHP
expense, then showed 998.75 PHP cash and 1.25 PHP spending after a real process kill
and a same-APK `install -r` without uninstalling. The application UID was preserved.
Only accessibility XML, text and aggregate measurements were captured. Internal
immutable IDs were not independently extracted from this non-debuggable package.
A normal higher-version update from build 6 to signed build 7 then succeeded
without uninstalling, retained the application UID, and showed the same 998.75 PHP
cash and 1.25 PHP spending after force-stop/reopen. An ordinary attempt to reinstall
build 6 was rejected with `INSTALL_FAILED_VERSION_DOWNGRADE`; no downgrade override
was used. Both builds have the same public certificate fingerprint above. Evidence:
`out/p6/android-build7-upgrade-proof.json`, signed metadata and package-manager logs.
Pending connected envelopes, compatible backups, interrupted upgrade and physical
device acceptance remain NE; this bounded smoke does not close A25.

The final signed candidate is
`build/private-release/Salapiya-0.6.0-7-android-owner-signed.apk`
(79,909,883 bytes), SHA-256
`360b7fa4ee9add2166023b3f24991614030ead7aeb99df5a2c33b6612b73aa05`.
It uses version code 7, the same package ID/ABIs/minimum/target APIs and owner
certificate. Official signature verification and packaged-icon/manifest/backup
exclusion verification were repeated for this exact APK. The production source
is `f4050eb60cf82368d98fbfe8064cd99811cc6cb8`; subsequent harness, signing-tool and
handoff changes do not change the packaged application code.

The first root-checkout Android attempt found a development-only plugin registrant
left by overlapping desktop generation; another attempt encountered a damaged
shared generated kernel. Automatic approval review rejected cache deletion
("blocked by policy"). That cache was preserved. A fresh detached checkout at
`out/p6-android-release`, with the identical production source at the respective
checkpoint, completed unsigned diagnostic compilation and then release signing.
The signed build's locked dependency hash stayed unchanged. The final signing
script permits that isolated directory, serializes signing, saves only ordinary
build output, and allows Flutter's release-mode pub/tooling regeneration rather
than reusing stale `--no-pub` registrants. No private key/password was copied into
the checkout, defines or logs.

Evidence envelope: Windows 11 Home Single Language25H2 build26200.9711, x64,
Acer Predator PHN16-72, Intel Core i5-14500HX/20 logical CPUs,16GiB RAM;
Android17/API 37 Pixel9-profile emulator x86_64, configured4vCPU/4GiB.
Physical Android/ARM64, Windows10/ARM64 and minimum supported dependency OS
versions remain NE. Framework compatibility claims do not certify this application.

Toolchain: Flutter3.47.7 revision `abaf9c523780a608bd46686fd5e53740a07077f8`,
Dart3.13.5, Android Studio JDK25.0.3, Android build-tools37.0.0, VS2026/SDK26100.
Native dependency pins and lockfile are retained. Packaging/recovery/signing and
incident procedures are in [private release operations](../../OPERATIONS_AND_RELEASE.md#salapiya-private-release-operations).

## Capacity and performance

The baseline encrypted SQLite probe completed 10,000 new ordinary income/expense
commands across 2020-2026, plus 46 existing financial setup actions and a Life
fixture. It did not upload this data. The final journal contained 10,046 commands,
11 Life records and an exact wallet balance of 9,699,989 minor units.

| Measurement | Observed result |
|---|---|
| All 10,000 saves | p50 101.877 ms; p95 395.775 ms; p99 867.713 ms; maximum 13,196.485 ms |
| Final 1,000 saves | p50 281.817 ms; p95 385.737 ms; p99 440.215 ms; maximum 2,002.671 ms |
| Ten complete snapshots | p50 233.895 ms; p95 246.628 ms |
| Ten exports | p50 66.067 ms; p95 75.275 ms; 2,154,517 bytes |
| 25-row SQL pages near journal end | p50 31.672 ms; p95 37.348 ms |
| Encrypted backup | 4,536,036 bytes; baseline 1,204 ms |
| Checkpointed encrypted SQLite | 21,667,840 bytes |
| Baseline independent restore | 3,447,083 ms (about 57.5 minutes) |
| Final indexed/cached independent restore | **184,014 ms (about 3.1 minutes)**; backup 963 ms |
| Maximum process RSS | Baseline 645,599,232 bytes; final restore 670,842,880 bytes |

The baseline compiled before the recovery/index optimization and ran amid other
development work; its full run took about 81 minutes. The final restore reused
the same synthetic checkpoint, authenticated a fresh archive and restored under
a new independent key. These are developer-machine measurements, not isolated
release benchmarks or a claim that every application action has these latencies.
The fixture has no groups or hosted concurrency. Mixed-domain growth, final
installed release cold start and physical low-storage/device performance remain
open. Native capacity measurements, where executed, are identified separately.

The approximate300ms save,500ms list and2s cold-screen/report targets remain
preliminary goals. A debug engine measurement is not an installed release cold
start. The implementation loads/replays complete immutable history, increasing
save/restore cost. No monetary approximation or unsafe merge was introduced.
The capacity fixture lacks representative shared groups/settlements/attachment
metadata at10k scale, concurrent clients and actual storage exhaustion. G6 is open.

## Financial security, privacy, faults, backup and lifecycle

H covers real signed-JWT private isolation, forged/foreign IDs, denied direct
writes, revoked current sessions, independent correction/allocation races,
removed-member uploads, former entitlements, original receipts and changed-payload
denial. The read-only hosted catalog audit found 42 migrations, 27 security-definer
functions with explicit search paths and no anonymous execution, and no inspected
tables granting direct client writes or anonymous reads. Internal schemas rely on
revoked schema/table access plus narrow authorized RPCs; not every internal table
has forced RLS. Client RLS is not presumed to filter replication.

The restricted publication has 8 tables. PowerSync streams use trusted
`auth.user_id()` rather than caller profile/group parameters. Actual SDK isolation
is reported separately below; injected download rows remain U evidence. A copied,
unexpired JWT can retain read access until expiry; current-session RPC rejection
does not promise immediate global read revocation. Cloud data is not end-to-end
encrypted against authorized infrastructure administrators.

Local inspection preserves opaque path-safe IDs, AES-GCM AAD/checksum validation,
bounded native reads, 10 MiB file caps, truthful unscanned/absent-byte states and no
automatic unsafe document preview. Archives are authenticated bounded JSON, not
path-extracting ZIPs. U tests cover wrong keys, tamper, unsupported formats,
interrupted transactions/migrations/activation and independently keyed restore.
Real child process kills are not hardware power-loss tests. Physical disk-full (distinct from the bounded SQLite FULL test),
document-provider interruption and failed package upgrade are NE. No actual user
profile, OS key, hosted dataset or immutable history was reset.

Dependency audit: 610 locked Pub/npm/Maven package-version queries to OSV, containing
package names/versions only. No Pub advisory match returned. PowerSync admin CLI's
bundled npm contains `ip-address@10.7.2` (moderate DoS) and `undici@6.29.0`
(including high TLS-validation/DoS advisories). These are administrative tools,
not Flutter APK dependencies. `npm update`, audit-fix and scoped overrides did
not replace bundled dependencies; exploratory lock changes were reverted. No
remediation or zero-vulnerability claim is made. An upstream corrected bundle or
reviewed alternative administration boundary is required for operational closure.
The scan excludes full transitive Gradle/Flutter engine/SQLite/OS/JDK/NDK coverage.
[Undici advisory](https://github.com/nodejs/undici/security/advisories/GHSA-2m5v-pch6-74hx),
[ip-address advisory](https://github.com/beaugunderson/ip-address/security/advisories/GHSA-rxp7-6hxx-x8q5).

Final known-secret scan: **2,315 files, zero matching paths**
(`out/p6/secrets-final.log`), including source, P0-P6 logs, normal Windows
Debug/Release binaries, APKs and decompressed staging ZIP/APK payloads. The signed
build 7 log was copied into the audited local artifact directory. Bounded matching against known credentials
does not prove absence of every possible secret. Signing passwords/private keys
never enter Git, chat, build defines or logs; certificate fingerprints are public.

Lifecycle remains incomplete: full remote device registry/revocation, account
deletion with retained shared evidence, deletion-register replay after hosted
restore and sole-owner identity-loss recovery lack complete release-certified
paths. Owner transfer/member removal/deleted-identity domain fixtures do not close
A12/A28. No destructive maintainer-account test was attempted. Portable backup, sync
and provider database backup remain three distinct mechanisms.

## Cloud sustainability, local-only attachments and disaster recovery

Existing healthy `salapiya-dev` Tokyo Supabase and PowerSync JP Development were
reused for bounded synthetic checks. No 10k fixture was uploaded; no provider reset,
paid service, replacement project or keep-alive traffic was introduced.
Final read-only snapshot 2026-10-28T12:02:54Z: database 18,642,611 B; Salapiya tables/indexes
5,660,672 B; storage buckets 0/objects 0; source connected, initial replication done,
stream errors 0, reserved active WAL 10,936 B. The earlier 04:34 snapshot was
17,798,835 B / 4,898,816 B before additional bounded native fixture history.
The final catalog still has 42 migrations and 27 explicit-search-path security
definers, with no inspected anonymous definer execution/read or direct client
writes. These are instant measurements during the release checks, not monthly
usage. P3 bounded command p95 was 508 ms; four-audience API documents 33,661 B and
CDC resources 28,625 B exclude protocol/compression/reconnect overhead.

[Supabase Free](https://supabase.com/pricing) and
[PowerSync Free](https://powersync.com/pricing) quotas/inactivity were rechecked.
The runbook records limits, monitoring and proposed alert thresholds. 20 people
with 2 devices estimate 40 concurrent clients before extra devices, near the 50
client limit. Local bytes/action cannot certify server sizing: receipts/indexes,
group projections, backups and full downloads all consume capacity. Monthly billed
egress/sync, hosted PowerSync bytes/peak clients and retention growth remain NE.

The development project contains synthetic fixtures, not an approved real-data
pilot. Blueprint pilot/test isolation is still required; no real records were
moved. Supabase Free does not include automatic database backups. Independent
encrypted off-site export, retention and isolated PostgreSQL restore/resync remain
operator gates; no complete provider DR drill was performed. Portable archives
and reauthentication are not substitutes.

Approved local-only attachments resolve the cloud scanner/storage launch scope
dependency for **this private release only**. Metadata sync/archive does not
recover bytes; originals need independent protected backups and exact reselection.
This does not certify cloud file safety or close lifecycle/retention G8.

## CI, reproducibility and artifacts

`salapiya-flutter.yml` now covers Salapiya feature branches, serial unit tests,
icon verification and a Node 24.21 isolated backend migration/parity job. No hosted
credentials, signing keys, paid native runners or screenshot targets were added.
The 10k probe is opt-in under `tool/`, not a long routine CI gate. The first remote run
passed locked resolution, format, analysis, **219 Flutter tests** (including the
new SQLite FULL test), and all **43 backend tests**. Its icon step exposed
platform-dependent PNG compression in the Windows ICO. The verifier now checks
every committed SHA-256 and exact regenerated RGBA pixels at every size; it does
not require different platform zlib builds to emit identical compressed bytes.
No icon pixels or geometry changed. Remote follow-up run [40648733889](https://github.com/RAbnza/Personal-Management-Platform/actions/runs/40648733889)
passed both jobs at `f26d014ad2630ac2a12747606422ad8820072129`: all 219 Flutter tests,
43 backend tests, locked resolution, format/analysis and source/icon verification.
Later native-only harness/tool changes receive their own checks below.

The production build 7 checkpoint also passed remote run
[40654989704](https://github.com/RAbnza/Personal-Management-Platform/actions/runs/40654989704)
with both validation jobs successful. Final native harness fixes preserve financial
assertions: saves wait for the actual asynchronous form to close, source lookup
follows normal pagination, and payment allocation lookup reads its canonical nested
amount/revision object. Hosted financial UI journeys run serially across platforms
because their deliberately shared synthetic owner is mutable; concurrent fixture
writes cannot be treated as a stable per-journey financial baseline.

Final source/tool checkpoint `2f9a39e65c450e8225f88e9e022a787ea84e1447` passed remote
run [40684130716](https://github.com/RAbnza/Personal-Management-Platform/actions/runs/40684130716):
**219 Flutter tests, 43 backend tests**, locked resolution, format, analysis,
source identity/security guards and native-icon verification. Local final format
checked 214 Dart files with no changes; analysis reported no issues. Final native
evidence above supplements these jobs. Subsequent handoff-only commits do
not change the source validated by this run.

Runbook commands cover locked resolution, format/analysis/regression, native
production builds, Inno staging, secure interactive Android signing, resource
verification, upgrade and recovery. Native tests use `--no-uninstall`; historical
gallery/branding capture targets are excluded from the P6 allowlist.

Final artifact paths below are relative to `apps/salapiya/`; binaries and raw
synthetic logs remain ignored local outputs, outside Git and distribution.
Both packages use app version `0.6.0+7` and production source checkpoint
`f4050eb60cf82368d98fbfe8064cd99811cc6cb8`. Source commits after it change test,
packaging/audit tools and documentation, not the application payload.

| Artifact | Size / SHA-256 | Acceptance boundary |
|---|---|---|
| `build/private-release/Salapiya-0.6.0-7-android-owner-signed.apk` | 79,909,883 B; `360b7fa4ee9add2166023b3f24991614030ead7aeb99df5a2c33b6612b73aa05` | Release RSA certificate, v2 verified; real 6→7 emulator update and ordinary downgrade rejection; remaining A25 matrix open |
| `build/private-release/Salapiya-0.6.0-7-windows-x64-UNSIGNED-STAGING.zip` | 19,050,580 B; `954a12ae7a2ec9c831f9d4bd5022f2dd8b49cf5fa28266f9794cf3a226b2a586` | All 49 decompressed payloads equal Release bundle, CRC/path checks; unsigned staging, no installer acceptance |
| `build/windows/x64/runner/Release/salapiya.exe` | `00aa9455aaf512a525995b974a9a62e004e168ec702de03c1153ac0ec21fa150` | Normal production main; all nine PE icon frames verified |
| `build/private-release/android-signing.json`, `android-signature.txt` | Public certificate/APK metadata | No password/private key; aliases and expected identity also retained externally |

Aggregate evidence under repository `out/p6/`: `packaged-icons-build7.json`,
`windows-build7-bundle-proof.json`, `android-build7-upgrade-proof.json`,
`android-release-install-proof.json`, `hosted-audit.json` and known-secret scan
logs. Native test logs and 10k/restore metrics are in `apps/salapiya/build/` as
named above. Do not move private auth configuration or the signing keystore into
this evidence folder. A rebuilt ZIP can have different archive metadata/hashes;
always regenerate the inventory for the exact artifact to be reviewed.

## Known defects, missing tests and owner dependencies

| ID | Severity | Status and exact closure requirement |
|---|---|---|
| P6-01 | High release gate | Trusted Windows signing, compiled/installed package, signed update/failure recovery/cold activation. Purchase deferred; compiler installation rejected by automatic approval review, “blocked by policy.” No security bypass. |
| P6-02 | High release gate | Android same-certificate build 6→7 update/UID/cash/spending and downgrade rejection passed. Full A25 pending envelopes/immutable IDs/backups/interrupted update and Windows installed update remain open. |
| P6-03 | High lifecycle/data | Complete A12/A28 device/account deletion, stale restore/tombstone/revocation, sole-owner recovery and retained shared evidence procedures/drills. Dedicated identities and safe recovery targets needed. |
| P6-04 | High recovery/operations | Independent hosted backup, retention agreement and isolated restore/resync/deletion-register drill. Operator encrypted storage and independent target needed. |
| P6-05 | Mandatory G6 | Human Narrator/TalkBack and physical device/OS inventory/acceptance; emulator/component evidence cannot replace them. |
| P6-06 | Mandatory G6/G7 | Full mixed-domain 10k capacity, release cold start, actual low storage/failed upgrade and billed usage/concurrency/retention measurements. |
| P6-07 | High tooling advisory | Bundled administrative npm/undici advisories; effective upstream fix/review remains. Installed Flutter app does not contain npm. |
| P6-08 | Resolved policy | Explicit approval of local-only attachments, independent original-file backup; cloud-byte adapter deferred. |
| P6-09 | Fixed defect | Broad suite reproduced narrow Windows toolbar overflow; constrained Create control fixed. Verification below. |
| P6-10 | Test infrastructure | Stale dock/theme assertions updated to approved UI; rerunnable hosted import requires explicit checksum-duplicate review; Windows isolated WAL cleanup suppresses only an already-removed directory, never financial assertions. |
| P6-11 | Fixed functional defect | Cash purchase with a retained, unused card selector was safely rejected during private Shared adoption. Funding now follows validated transaction type; exact cash/source and unrelated-card liability regression checks pass. |
| P6-12 | Fixed packaging defect | Retired Windows build 6 ZIP contained a stale development kernel asset. Fresh normal build 7 removed it; wrapper rejects development kernel/test plugin; final ZIP byte/CRC/resource checks pass. |

Maintainer actions are signing-key/credential backup, physical/human acceptance,
Windows signing/tooling choices and actual lifecycle/operational decisions. No
routine technical permission, paid commitment or distribution is inferred.
Local-only approval has already been received and is not requested again.

### Git provenance after requested title corrections

The maintainer first authorized one protected `--force-with-lease` push for the three
initial P6 titles, then requested the same `feat(salapiya): ...` convention for
these three predecessor titles: Android Overview baseline documentation, Android
Overview polish, and the native workspace/onboarding redesign. This additional
rewrite changes only those three existing messages. The six P6 descendant
messages remain unchanged; all nine replacement commits preserve file trees,
author/committer identity and dates. Descendant SHAs change with their parents.
The unchanged boundary is the P5 checkpoint
`5ed1785af22b250074da849f399498674ed2785a`.

The original verified P6 starting tree at
`a2f68978a334b8076812f0c643c5377303343808` is preserved exactly in its renamed
counterpart below. Historical tested source/CI SHAs above remain exact evidence
references. These are their current conventional-history equivalents:

| Original tested/checkpoint SHA | Current conventional-history SHA (identical tree) |
|---|---|
| `0b29fa38c1dcd59bc71a8342397b9f40ae9646bd` | `a624282331a902f8a6a829a7c023aa8ed077d57d` |
| `c3814631042137609bb71aad4d7df6b7aff4ac6f` | `446636fd1d75000dc42320d3dd5f23adcc338917` |
| `a2f68978a334b8076812f0c643c5377303343808` | `05398c1fdd9c1fc13b40694c6d5696fdcd2a7daf` |
| `d189eb7848963f0afaf33a29b67548b9a09e78be` | `5bfb448f61e358b22f9e7b681aac5b0db5422c34` |
| `f26d014ad2630ac2a12747606422ad8820072129` | `718c3021590e839b9a09e2aa736fb7ef795042dd` |
| `f4050eb60cf82368d98fbfe8064cd99811cc6cb8` | `1daefaba93494349a546c590a44352d0e5a2a6ed` |
| `2f9a39e65c450e8225f88e9e022a787ea84e1447` | `a03ece67d0b7a5782b19059093d03b1cc14d8403` |
| `e9ef336ab9218efc800bb814c1f94593d6b33309` | `65561f80f917f74af3e361415a52d2f6086bdf57` |
| `d3193c1e8dafac9de3c1091abe9d0ad23fbaa20a` | `148a0832c8a621adf80a2b3b37cf1ed4a4e3724c` |

Each correction has a separate documentation follow-up. The additional push lease
requires the previously verified remote tip
`d3193c1e8dafac9de3c1091abe9d0ad23fbaa20a`; unexpected advancement aborts the update.
The first correction was leased against
`e9ef336ab9218efc800bb814c1f94593d6b33309`. Only the current P6 branch is updated.
Application payloads, artifact hashes, financial history and release classification
remain unchanged. Existing test evidence is preserved by the tree comparisons;
commit-message changes do not reclassify any application test.

## Release decision

**BLOCKED.** Mandatory signed installation/update, native accessibility/device,
complete lifecycle/revocation and independent hosted recovery/operations evidence
remain unsatisfied. Local-only file approval is not permission to waive those
gates. Do not distribute to real users, merge into `main`, call staging trusted
signed distribution, or entrust real personal/financial data based on test counts.
