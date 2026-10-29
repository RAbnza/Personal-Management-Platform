# Salapiya - Post-P6 release gate closure

> Historical post-P6 evidence. The owner's final release decision supersedes this
> report's earlier BLOCKED classification for the defined personal/family audience.
> See [final release and project closure](FINAL_RELEASE_AND_PROJECT_CLOSURE.md):
> **OWNER-APPROVED FULL RELEASE**, development **COMPLETE**. Deferred requirements
> are accepted limitations; the original test results below are preserved.

29 October 2026, Asia/Manila. **Release classification: BLOCKED.**

## Provenance and approved boundary

Fetched `origin` before branching. Base branch `feat/salapiya-post-p6-presentation-polish`
was unchanged at `fe01930fb1287d32c6df3131fee6377c53d6a033`; working tree was clean.
Work branch: `feat/salapiya-private-release-gate-closure`. Final report commit is
resolved with `git log -1 --format=%H -- docs/salapiya/POST_P6_RELEASE_GATE_CLOSURE_HANDOFF.md`;
its full SHA is also supplied in the final response. This avoids a self-referential SHA.

The blueprint, P0 foundation/architecture and P1-P6 handoffs, operations guide,
final redesign, Android Overview and latest presentation-polish handoffs were inspected
alongside actual native, migration, stream, financial and security implementation.
The latest presentation remains authoritative; no redesign, screenshots, image goldens,
paid activation, signing-key replacement, real-data migration, main merge or distribution.
Historical P6 reports and owner-signed builds 6/7 remain historical evidence.

Approved policies A-I are requirements: unpaid Windows signing boundary; seven recent
plus four weekly backups in two protected independent locations; separate local/device/account
and group operations; authorized owner transfer and no automatic takeover; separate free pilot
for owner and brothers only; 70/85/90% quota thresholds; verified-device-only support;
original Android signing identity; local-only encrypted original attachments.
These approvals do not configure storage, provide signing passwords or certify devices.

## Initial blocker audit and closure plan

| P6 item | Initial status / dependency | Required closure work |
|---|---|---|
| P6-01 | High; compiler engineering plus unpaid trusted-signing blocker | Compile/install/test staging installer; retain trusted-signing gate |
| P6-02 | High; incomplete signed A25 | Rebuild final source; preserve certificate, pending/accepted IDs, backups and update evidence |
| P6-03 | High; independent lifecycle engineering and isolated identities | Server/RLS/CDC revocation, explicit deletion, stale archives and group retention/recovery |
| P6-04 | High; backup engineering and permanent storage provisioning | Encrypted export, 7+4 retention, isolated PostgreSQL restore; never call temporary paths operational |
| P6-05 | Mandatory; physical device and human participation | Owner chose an assisted phone checklist; Narrator/TalkBack remain unexecuted |
| P6-06 | Mandatory; mixed-domain/release/device and billing evidence | Reuse 10,046 baseline, extend gaps; record actual provider usage and limits |
| P6-07 | High admin tooling; engineering | Replace vulnerable bundled CLI administration path with reviewed official SDK |
| P6-08 | Owner policy already resolved | Preserve local-only bytes and independent original-file backup disclosure |
| P6-09 | Fixed; reusable prior evidence | Final relevant presentation/regression checks |
| P6-10 | Fixed test infrastructure | Preserve financial assertions and fixture isolation |
| P6-11 | Fixed financial integration defect | Preserve cash/card source classification and exact nonduplication tests |
| P6-12 | Fixed packaging defect | Rebuild normal main; retain development-asset rejection |

No new approval is needed for independently executable work. Permanent protected backup
destinations, physical/human acceptance and interactive signing authorization are distinct
prerequisites. Privileged non-test owner-loss recovery and paid resources are not authorized.

## Evidence vocabulary and reuse

Historical = cited prior evidence, not freshly certified. U = unit/component/encrypted SQLite;
DB = isolated PostgreSQL integration; H = real hosted API/CDC; NW/NA = actual native Windows/
Android emulator with mode explicitly identified. Installed = actual normal release package.
Mock-only, failed, blocked and not executed remain separate. Grouped Shared fixtures do not
independently certify 40 native options. Build success does not close G0-G8.

## Implementation and verification checkpoints

Application **0.6.1+8**. Source checkpoints: `15f3162c2434d297b2e15f4b875b6568c4a3222d`
(lifecycle/security), `f2657ee` (encrypted recovery/deletion outcomes), `60a6605` (native
tests, capacity and packaging). Normal release binaries use the latter source checkpoint;
later documentation commits do not change application source. Ignored logs/evidence remain
under `out/release-gate/` and app `build/`; no credentials/binaries are committed.
Reproduction: [operations](PRIVATE_RELEASE_OPERATIONS.md); approved policy: blueprint section 25.

### Lifecycle, authorization and deletion

Separate Profile/Devices operations now provide typed local removal, session revocation
and recent-Google-authorized connected deletion. Offline local removal warns about pending
work/backup coverage, closes sync/persistence, cancels only this profile's recorded OS
notifications and removes only its UUID database/WAL/SHM/attachment directories. A protected
resumable `removing` checkpoint retains its key until erasure finishes. Other local profiles,
keys, external archives and cloud data survive. Errors have a semantic live region. This
is logical deletion, not forensic erasure or remote wipe.

Device identity means a provider session, not attested hardware. Registration/revocation
uses signed `session_id` and ownership; foreign IDs cannot revoke peers. Revocation persists
and deletes the provider refresh-session chain. RPC guards and restrictive SELECT RLS cover
all eight synchronized tables. PowerSync independently joins all eight streams through
restricted `p7_sync_session` CDC entitlements using signed `auth.user_id()` and
`auth.parameter('session_id')`; caller parameters confer no authority. Stream retraction
follows the replication checkpoint; no instantaneous deadline is promised during lag/outage.
Offline copies remain readable. Fresh Google sign-in is separate new authorization.
The measured provider JWT expiry is 3,600 seconds. Live RPC/RLS guards reject a revoked
session before that expiry; CDC retraction still depends on replication progress. No
hour-long RPC access grace period or instantaneous offline erasure is claimed.

Connected deletion requires exact typed confirmation, online identity and OAuth reauthentication
within five minutes (refresh alone is insufficient). An atomic transaction records permanent
owner/profile tombstones, revokes sessions and purges private financial/Life commands,
postings, receipts, enrollment snapshots and private reviews. The narrow immutable DELETE
exception requires the tombstone; shared history is not made mutable. Peer bills/settlements,
participant intervals and minimum audit IDs remain; deleted current names are neutralized.
Unrelated private ledgers are purged. Sole-owner administration is archived without takeover.
The Edge handler accepts no target ID and calls official Auth admin deletion only for the
online verified subject. Cleanup failure is explicitly pending. A read-only signed-subject
outcome RPC verifies lost responses after Auth deletion; it grants no deletion authority.
Local copies, original documents and retained backups are separate. Google is not deleted.

Forward migrations `20261029003800`-`20261029004300` are deployed only to verified development
(48 total; previously42): lifecycle/session state, private erasure, CDC entitlement index,
trigger privilege/profile-ID boundaries, provider-side deletion erasure and deletion outcome.
Historical migrations/local schema 7/archive formats 1-3 are unchanged. Lifecycle tables are
not published; only the restricted authorization index is added as publication table nine.
No provider reset, privileged real-group recovery or real-data migration occurred. Stream
deployment validated with zero errors/warnings.

- U/DB passed: path/key/profile isolation and resumed removal; confirmations at normal/200%
  text; owned-notification cancellation; environment pairing; foreign-session rejection;
  recent-OAuth guard; purge/peer retention/immutable guards; stale-journal reconciliation;
  original rejected financial intent and CRUD envelope retained without completion/remint.
- NW/NA Debug: two `release_lifecycle_test.dart` passes each. Real SDK initial private
  download, peer revocation, same unexpired JWT RPC denial/RLS empty/stream retraction,
  reconnect with that same JWT still empty, peer authorized, local draft preserved; typed
  offline local removal passed. Logs `build/release-lifecycle-{windows,android}.log`.
- H: `release-deletion-hosted.mjs` created only dedicated synthetic users/group. Official
  provider-admin deletion passed private financial/Life purge, permanent marker, unchanged
  peer bills/private profile, ownerless archive, stale JWT RPC/RLS/archive denial, removed
  CDC entitlements and lost-response Edge verification (`out/release-gate/hosted-deletion.json`).
- **Not executed:** positive real-Google user-initiated deletion in the final installed UI.
  Password-provider authorization is intentionally negative; DB OAuth claim fixtures do not
  certify that Google flow. A28 remains partial.

Ordinary departure/versioned owner-to-active-member transfer retain existing authority rules.
Same-identity Google recovery can recover the original owner role; then revoke lost sessions.
Permanent sole-owner identity loss has no takeover RPC: independently verify identities,
current roles and failed provider recovery, obtain explicit named-group authority and a
reviewed plan, preserve only already-entitled shared evidence, rehearse on a dedicated group.
No operator impersonation/private-ledger access. That privileged recovery drill remains open.

### Independent backup and actual restore

Implemented bounded AES-256-GCM PostgreSQL custom archives, verified TLS, exported repeatable-read
snapshots matching data/security metadata, migration hashes and role/grant dependencies.
No plaintext dump file is emitted. Two dedicated protected copies are verified before
pruning. Retention preserves seven recent generations plus latest generations in four
completed weekly buckets (overlap allowed). Wrong key/tamper/failed second copy, linked paths
and unrelated-scope retention are tested. The operator CLI takes external config/process-only
keys and never infers a pilot source.

Actual hosted PG17.11 snapshot -> isolated passworded loopback PG18.6 restore passed at
42 migrations and again at48 with a **non-empty deletion register**. Exact command/posting/
receipt/group/tombstone/session fingerprints and RLS matched; restored sessions/CDC entitlements
were cleared. Required role names are NOLOGIN; provider privileges/credentials are not copied.
Latest encrypted drill archive: 1,217,460 bytes, SHA-256
`3f57fcc250256a33ff12693851b2cfa1bce4d4fde94f193a4667943ef528eb8a`.
`out/release-gate/disaster-recovery.json` records counts/digests/limitations. Actual backup
CLI proof verified both temporary copies/current deletion register/wrong-key rejection
(`backup-cli-proof.json`, encrypted bytes1,229,432).

Temporary directories on one machine are **not independent storage**. Permanent destinations,
unattended key retrieval/scheduling and independent current security-journal storage remain
**unconfigured**. Proposed encrypted removable media plus separately protected off-site/NAS
need owner selection/access and failure-domain verification. Policy: hosted nightly while
operated; personal changes/pre-upgrade; monthly isolated restore plus consequential-change
drills. Local SQLite, portable archives, hosted dumps, sync and original file bytes are
distinct; portable archives omit original attachment bytes and sessions.

After an old restore, keep ingress closed until the trustworthy current independent
deletion/revocation journal is applied. `reconcileSecurityJournal` rejects stale input,
purges tombstoned accounts and clears restored sessions; it cannot discover later lost
deletions from the old dump. Managed Supabase Auth/config/secrets, PowerSync re-creation,
fresh login and actual client resync were **not** restored. G4/G8 operations remain open.

### Native presentation and hosted regression

Fresh Windows three/Android two Debug presentation tests passed: exact monetary fee review/
outcome, responsive Overview, both themes, Win32 minimize/maximize/restore/resize/caption hit
test/icon at measured120 DPI. No screenshots/images captured. Human Snap flyout, Narrator,
TalkBack, physical DPI/high contrast/reduced motion and installed cold callback/notification
activation remain separate unexecuted checks.

Actual-hosted native suites passed all three on both platforms: P3 exact split, actual 503/
lost committed response/durable original queue accepted once, private isolation, archived
receipt/current-authority and former-member exclusion; P4 case 31 card adoption/source revision/
refund without cash/liability replay; P5 private CDC/offline intent/acceptance/completion/
reopening without financial mutation. Logs: `build/release-hosted-windows.log` and
`release-hosted-android-final.log`. The P3 test harness now waits for the specific nested modal
instead of an animating busy parent; all financial/duplicate-review assertions remain.
`P4_HOSTED_NATIVE=true` enabled the actual card case rather than skipping it.

### Mixed-domain capacity

Extended a copy of the preserved10,046-command baseline, asserting every original ID/payload
unchanged. Final: 10,098 financial commands, 511 Life records, real local paired transfers,
cards/debts/planning/history, 30 attachment metadata and zero original file bytes. Three
synthetic injected download groups add 750 bills/1,500 retained revisions/75 refunds/75
confirmed settlements. These prove local capacity, **not hosted authority/concurrency**.
No10k fixture uploaded. Exact wallet delta/zero-sum/new-key archive restore asserted.

| Measurement | Windows test engine | Native Windows Debug | Android API 37 x64 Debug emulator |
|---|---:|---:|---:|
| Save, 20 p50 / p95 / max ms | 173.587 / 195.314 / 202.462 | 184.684 / 256.999 / 522.471 | 216.194 / 423.189 / 1614.386 |
| Encrypted open/integrity/snapshot ms | snapshot p50 162.599 / p95 179.279 | 1840 | 2376 |
| Activate/Overview ms | not measured | 2142 | 4307 |
| Navigation, 4 p50 / p95 ms | not measured | 509.047 / 811.817 | 797.675 / 1121.318 |
| Maximum RSS bytes | 840,425,472 | 1,095,577,600 | 1,048,887,296 |

CSV p50/p95 42.954/83.124 ms; three-group positions/pairs40.406/110.220 ms (ten samples each).
Database 25,927,680 bytes; backup 794 ms/4,894,591 bytes; independent-key restore 34,950 ms.
Evidence `build/release-mixed-capacity.json`, `release-mixed-capacity-final.log`,
`release-capacity-{windows,android}-final.log`. Warm caches/Debug/test settling limit results;
some targets missed. Signed installed cold start, physical performance, actual disk exhaustion,
host concurrency, billed traffic and large hosted reconciliation remain unmeasured. No
financial arithmetic/history/authorization/transaction guarantees were weakened.

### Normal Windows release and actual installer

Built normal `lib/main.dart` with public development defines and a regenerated release
registrant (no `--no-pub` reuse of integration assets). Version 0.6.1+8. Complete payload
contains Flutter/native/VC++ runtimes; development kernel/test plugin absent. Actual packaged
PE icon frames match source at 16/20/24/32/40/48/64/128/256px, including transparency. Both
runner and installer Authenticode status are **NotSigned**. No trust/SmartScreen modification.

Installed normal per-user Inno Setup 6.7.3 through winget; compiler signature valid. Fixed
the recipe's toast CLSID syntax and Pascal comments while preserving the identical UUID,
AppId, AUMID, callback and data locations. Version errors are suppressible for safe silent
downgrade rejection. Reconstructed a build 7 installer from the complete retained P6 bundle;
this is a reconstruction, not a historically distributed installer.

Actual final staging test passed fresh baseline install, build 7->8 upgrade, comparison of
all 49 installed payload files, DisplayVersion 0.6.1.8, callback target, ordinary downgrade
rejection (exit 1), uninstall and restoration of original callback/shortcuts. All protected
production-profile/key file bytes remained unchanged. The script refuses an existing
installed stable AppId and never launches the unknown owner's profile. This is actual
installer evidence, **not** a synthetic-profile running upgrade, startup/Google callback,
notification activation, interruption recovery or trusted distribution pass.
Proof: `out/release-gate/windows-installed-acceptance-final/evidence/installer-proof.json`;
build/package logs: `build/release-windows-normal.log`, `out/release-gate/windows-package.log`.

### Consolidated verification and failures corrected

- Final local Dart formatting: 238 files, zero changes; Flutter analysis: no issues.
  `flutter test --no-pub --concurrency=1`: **231 passed**, no failures/skips
  (`build/release-flutter-consolidated-final.log`). Backend `node --test *.test.mjs`:
  **53 passed**, no failures/skips (`out/release-backend-consolidated.log`).
- Focused lifecycle/reminders/environment tests 8, typed-removal widgets 2 (normal/200%),
  original revoked financial-intent retention 1 passed before the final consolidated suite.
  Actual native/hosted runs are recorded above separately from these component counts.
- The first full Flutter run had a load failure after a reminder mock was changed while
  that run was loading its source. It is retained as failed evidence, not counted as clean;
  focused reruns and the final stable 231-pass suite supersede it.
- Initial P3 Android global `pumpAndSettle` timed out on an animating busy parent; modal-specific
  waiting fixed the harness without weakening financial assertions. An earlier card case
  was skipped without its explicit hosted flag; the final runs enabled it and passed.
- Initial Windows installer compilation rejected the old CLSID notation/Pascal comments;
  corrected unchanged identity syntax compiled. First acceptance cleanup stopped because
  Windows PowerShell treated `reg.exe`'s success stderr as an error. Cleanup now checks its
  actual exit code; the entire final acceptance rerun passed.
- Two early isolated restore attempts failed on Windows inherited `pg_ctl` pipes and the
  fresh target's empty public schema. The harness now ignores inherited server output and
  drops only that freshly created empty schema before import. Both later restore drills
  passed. Automatic approval review initially rejected computed recursive cleanup as
  **"blocked by policy"**. After confirming the two exact task-owned canonical directories
  were not links and no PostgreSQL process remained, cleanup using explicit absolute literal
  paths without force succeeded. Both failed temporary clusters are removed. No existing
  development/pilot database was restored over or reset.
- ADB Windows shell stdin truncated a copied synthetic encrypted fixture at 665 bytes.
  This was transport failure, not an encryption failure. Final testing used `adb push`
  to a random shell temporary file, app-private copy and matching SHA-256 before execution;
  exact temporary transport paths were removed. No original owner files were involved.

CI checkpoint `15f3162` passed both jobs in
[40813396760](https://github.com/RAbnza/Personal-Management-Platform/actions/runs/40813396760).
Complete source/native-test checkpoint `60a6605d5a5589a8f200deb53133cbbc00eee9ca` passed
[40817162931](https://github.com/RAbnza/Personal-Management-Platform/actions/runs/40817162931).
Final tooling checkpoint `d6f5d61b33b8f51bf60d8168382404d0d612f6d7` also passed both jobs in
[40818434371](https://github.com/RAbnza/Personal-Management-Platform/actions/runs/40818434371).
Later changes are documentation only; this workflow filters documentation-only pushes.
These Linux validation/backend checks do not certify native installation or human acceptance.
All native packaging/testing remains local evidence. No paid native runner was activated.
Final known-secret scan: **2,476 files, zero matching paths**, including working source,
release proof metadata/logs, Windows Debug/Release binaries, versioned installers and
decompressed APK/ZIP contents (`out/release-source-artifact-secret-scan-final.log`).
This checks known private values, not every possible unknown credential. Public client
configuration is intentional; signing/provider secrets are excluded. Temporary synthetic
recovery-key UI files were removed after testing; sanitized proof XML contains no such keys.

### Signed Android installed update and independent-key recovery

Normal owner-signed build 8 installed with `adb install -r` over the retained build 7 in
`Salapiya_P6_Release_Test`, **without uninstall**. Package/app UID 10235 remained unchanged.
With Wi-Fi/data disabled, force-stop/reopen displayed the same synthetic profile, liquid
PHP 9,283,004.75, cash PHP 998.75 and spending PHP 1.25. The P6 synthetic profile had four
financial commands; one synthetic task was added through build 7's reviewed normal UI before
the pre-update archive. All four financial IDs/payloads and the Life revision ID/payload
matched exactly in authenticated before/after archives exported through Android's document
picker. Build 7 ordinary downgrade was rejected with `INSTALL_FAILED_VERSION_DOWNGRADE`;
build 8/profile remained installed. No `-d`, data clear or signing replacement.

Evidence: `out/release-gate/android-build8-upgrade-proof.json`, update/downgrade/package
logs and sanitized XML accessibility trees. OS `am start -W` reported a process-cold activity
launch of 1,159 ms on the small synthetic profile. This is not dashboard-ready timing, cold OS
caches, mixed 10k performance or physical-device performance.

A fresh ephemeral secondary Android user 10 (UID 1010235) had no profile and no access to
user 0's app-private storage/keystore. Installed the existing normal build 8 package for that
user, selected the build 7 encrypted archive in the real document picker while offline,
reviewed four financial commands/one Life revision/no byte objects, and activated it. After
force-stop/reopen, exact totals/task survived. Re-export through the normal installed UI
and authenticated comparison verified the same profile and all financial/Life IDs/payloads.
`android-independent-restore-proof.json` records this actual installed recovery. This is
fresh per-user installation and separate OS-keystore acceptance on one emulator, **not** a
second physical device or clean primary-device deployment. The temporary user was stopped
and automatically removed; user 0 and its baseline remained. Wi-Fi/data were restored.

Remaining A25: nonempty connected pending envelopes/accepted receipts, original document bytes,
installed Google/callback/notifications, interruption/failure/storage-pressure matrix,
Windows running synthetic-profile upgrade and physical phone. The test archive is local
format 1/schema 7; connected format 3 and managed recovery are separately qualified. A22 gains
real installed Android local-archive recovery; Windows/physical/connected cases remain open.

### Provider isolation, costs and administrative dependencies

Read-only inventory found one healthy Tokyo development Supabase project and one PowerSync
development instance. Supabase organization enumeration returned an empty array; PowerSync
monthly reporting was denied by existing permissions. Actual plans/cross-organization free
entitlements/billed egress/hosted bytes/peak clients are unverified. No pilot/paid resource or
personal-data migration occurred. The app rejects mixed development/pilot public configuration.

Final source audit: 48 migrations / nine publication tables; no unsafe audited definers/tables;
zero stream errors; replication complete; 19,199,667 database bytes/6,119,424 application-table
bytes; zero file objects/buckets; active reserved WAL 120 bytes at sample. Current clients 0
is **not** historical peak. Evidence `out/release-gate/{hosted-audit,provider-inventory}.json`.

Published 29 October: [Supabase](https://supabase.com/pricing) 500 MB database/5 GB uncached
egress/1 GB files/two active Free projects across owner-admin organizations/one-week inactivity/
no automatic Free DB backups; [PowerSync](https://powersync.com/pricing) 500 MB hosted/2 GB
monthly sync/50 peak clients/up to two instances/one-week inactivity. These do not verify
account entitlements. Apply 70% review/85% investigate/90% pause expansion per quota. No keep-alives.

Illustrative forecast only: four users x two devices = eight clients; assumed 25 MB application
data/person replicated twice ~200 MB initial sync before overhead. At 100 actions/user/day x
assumed 5 KB delivered effect x two devices ~120 MB/month before group fan-out/versions/retries/
full resync/protocol overhead. **Not measured billing or pilot approval.** Whole hosted DB
bytes are not per-user growth. Verify dashboards and bounded traffic/concurrency before pilot;
forecast independent backup retention separately. Owner/brothers only; friends need a later
decision. Keep real records local-only with independent protected archives until prerequisites
are met; never mix them with destructive test fixtures.

Removed vulnerable bundled PowerSync CLI/plugin-manager/npm administration; pinned the same
official management SDK versions, retaining provider identity/configuration. npm audit 82
packages: zero advisories; OSV 227 package/version pairs: zero hits. No blanket Flutter upgrade.
Evidence `out/release-gate/dependency-audit.json`, `out/release-dependency-audit.log`. This
does not exhaustively cover engine/SQLite/transitive Gradle/JDK/NDK/OS vulnerabilities.

### Retained artifacts and signing identity

All paths below are repository-relative, local ignored artifacts; nothing was published.
Normal source checkpoint `60a6605d5a5589a8f200deb53133cbbc00eee9ca`; version 0.6.1+8.
Android package `dev.salapiya.salapiya`, versionCode 8/versionName 0.6.1, minAPI 24,
target/compileAPI 36, ARMv7/ARM64/x86_64 libraries. These architectures are packaged,
not all physically certified. Signature verification passed APK v2 with one signer:
`d45ef96f19ce9e9df9c23711bc9f843b2bb34350352f06aba347187980dc787e`.
The existing external owner PKCS12/alias was checked before compilation and after signing;
no key was generated/rotated. The owner entered the password only in a masked local console.
The script clears credential variables and the coordination marker was removed after completion.
Public metadata/signature/build log remain under `build/private-release/0.6.1-8/`.

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| `apps/salapiya/build/private-release/0.6.1-8/Salapiya-0.6.1-8-android-owner-signed.apk` | 80,057,367 | `341be091a1211b4323cfc2073000c70e03e279d4c4aa04948c15cc2bbf7f025a` |
| `apps/salapiya/build/private-release/Salapiya-0.6.1-8-windows-x64-UNSIGNED-STAGING.zip` | 19,088,720 | `8125bd4fbd0a078a20403c0ee3a00ad00be11a2b197f1a5e3d6ea4518b861303` |
| `apps/salapiya/build/private-release/Salapiya-0.6.1-8-windows-x64-STAGING.exe` | 15,574,840 | `dcc7e30e2dd488031f8165f8b50c5ff65c671ea0c3af67a5e75065fdb3b30611` |
| `apps/salapiya/build/windows/x64/runner/Release/salapiya.exe` | 217,088 | `d877abdbbd5b78190598e1d6582eb9d4054bac5ebae5c3bc6cece5013b3147b2` |
| `apps/salapiya/build/private-release/Salapiya-0.6.0-7-android-owner-signed.apk` | 79,909,883 | `360b7fa4ee9add2166023b3f24991614030ead7aeb99df5a2c33b6612b73aa05` |
| `apps/salapiya/build/private-release/Salapiya-0.6.0-7-windows-x64-UNSIGNED-STAGING.zip` | 19,050,580 | `954a12ae7a2ec9c831f9d4bd5022f2dd8b49cf5fa28266f9794cf3a226b2a586` |

P6 build 7 APK/ZIP hashes still match exactly; build6 remains retained too. Before rebuilding,
the complete P6 Windows Release bundle was preserved at
`out/release-gate/p6-windows-release-baseline`; its executable SHA-256 remains
`00aa9455aaf512a525995b974a9a62e004e168ec702de03c1153ac0ec21fa150`.
The Windows executable is only one part of its required bundle; never distribute it alone.
`final-packaged-icons.json` verifies nine Windows frames, fifteen Android PNG resources,
adaptive/themed XML, release manifest/callback references and cloud/device-transfer backup
exclusions. This is binary-resource verification, not a screenshot or OS appearance pass.
`out/release-gate/artifacts.json` retains machine-readable sizes/hashes.

## Acceptance traceability

Historical evidence remains reusable within its original scope. Fresh results below update
affected paths; release-package and human/physical gaps are not inferred from Debug tests.

### A01-A28

| ID | Historical P6 evidence / requirement | Remaining release boundary (initial) |
|---|---|---|
| A01 | U local startup/creation; native no-HTTP journeys below | Fresh installed release airplane-mode first run NE |
| A02 | U real P0/P1/P2/P5 child-process kills and WAL/transaction rollback | Production form OS-kill and signed-package power-loss NE |
| A03 | Historical real Google Android enrollment/Windows retrieval; H enrollment authority | Fresh interactive Google on final installed packages NE |
| A04 | H collision preserves populated profile; U cancellation/late callback guards | Fresh final-package Google collision/cancel UI NE |
| A05 | H independent stale-base creates accepted once | Fresh native two-device results below; signed-device acceptance NE |
| A06 | H lost committed response returns original immutable receipt | Fresh native transport/restart results below; signed packages NE |
| A07 | H correction/allocation races; U debt final-capacity/source guards | Every advanced native concurrent payment/correction option NE |
| A08 | U/H exact PHP100 split33.34/33.33/33.33 and zero-sum positions | Fresh native Shared journey above; no double-based arithmetic |
| A09 | U/H PHP1200 adoption: cash-1200/expense400/receivable800 once | Native integrated path below; all funding variants not individually native |
| A10 | U/H actual card sharing/refund; no repeated private cash/liability/spending | All final redesigned card-funded Shared editor combinations NE |
| A11 | U/H full/custom/partial/multi-bill/advance/dispute/reversal source caps | Every advanced native option individually NE |
| A12 | U/H owner-independent cloud/group and same-identity contracts | Sole-owner identity loss recovery/drill BLOCKED G8 |
| A13 | H removal denies stale writes; former history excludes later activity | Fresh native former-member SDK above; physical stale-device drill NE |
| A14 | H real JWT RLS/foreign/forged IDs/direct writes; restricted publication audit | Independent actual SDK stream results below; final expired-token subscription replay NE |
| A15 | H revoked session denied; U preserves locally available records/intent | Fresh native controlled503 above; actual provider suspension/reactivation NE |
| A16 | U/H exact debt import/net proceeds/components/schedules/payoff graph | Native debt journey below; every advanced combination NE |
| A17 | U/H statements/allocations/installments/overpayment and exact source caps | Native cards below; signed update dependency preservation NE |
| A18 | U/H recurrence/budget/savings; U forecasts/exclusions/nonmutation | Native planning below; expected/hypothetical never post automatically |
| A19 | U/H reviewed import/replay/cutoff conservation; U500-row export cap | Signed native document-provider and real disk-full NE |
| A20 | U/H full Life graph and authoritative Agenda/reminder sources | Fresh native Life above; final installed OS reminders NE |
| A21 | U accepted/pending handoff and initial incomplete financial/Life coverage | All native incomplete-download/report variants not exhaustively tested |
| A22 | U plus actual signed build 8 local archive restore in fresh Android user with separate OS keystore; exact IDs/payloads verified | Windows/physical/connected-archive installed recovery remains required |
| A23 | U/H original receipts/current authority and held archived intent | Fresh native connected recovery above; all old/deleted-account permutations NE |
| A24 | U wrong key/corruption/interrupted transaction/schema/activation | Actual storage exhaustion/document-provider interruption/failed package update NE |
| A25 | Actual Windows staging install/upgrade and signed Android same-UID upgrade/financial-Life IDs/archive recovery/downgrade passed | Trusted Windows and complete connected pending/receipts/activation/interrupted-update matrix BLOCKED |
| A26 | U semantics/focus/keyboard/200% reflow/themes; narrow Windows defect fixed | Human Narrator/TalkBack/physical DPI/release reduced-motion BLOCKED G6 |
| A27 | U bounded provider/type hints/AEAD/checksum/tamper/absence/detach; H metadata isolation | Local-only approved; no cloud or scanning claim; fresh native picker/reselection qualified below |
| A28 | Fresh U/DB, NW/NA real session revocation/reconnect and H provider deletion/private purge/peer retention | Positive installed Google deletion and permanent recovery operations remain BLOCKED G8 |

### M01-M17

| ID | Requirement | Retained evidence | Remaining release boundary |
|---|---|---|---|
| M01 | Cash, wallet, checking, savings accounts; metadata, opening balances/cutoffs, archive/history | P1 finance/persistence; H P2 boundary/parity | Installed identity/opening/cutoff/update preservation; G5 |
| M02 | Income, expenses, category splits, completed transfers, fees, categories and activity/history | P1 financial/split/transfer fixtures; H unrelated stale-base creates | All rare UI options individually native; signed packages |
| M03 | Corrections, refunds, reversals, negative-balance acknowledgements, reconciliation and adjustments | P1 correction/refund/reversal/reconciliation; H correction races | Full native conflict/rejection review options |
| M04 | Existing-debt import/setup and borrowing/net proceeds | P4 finance/debt components; H12-command independent plan parity | Every native borrowing/fee combination |
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

### S01-S10

| ID | Requirement | Retained evidence | Remaining release boundary |
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

### L01-L04

| ID | Requirement | Retained evidence | Remaining release boundary |
|---|---|---|---|
| L01 | Personal appointments/events, mixed Agenda/Calendar and reminders | P5 Life/Agenda/DST; H immutable Life graph | OS notifications, physical timezones/reboot/cold activation |
| L02 | Personal Tasks preset | Fresh U/H native CDC and signed Android task-ID upgrade/independent restore | Human accessibility, physical/connected update variants |
| L03 | Learning and Books presets | P5 preset/progress/rating parity; H exact decimal strings | Physical/assistive workflows; custom tracker excluded |
| L04 | Career applications, stages, interviews/assessments, follow-ups, notes and history | P5 graph/documents/Agenda; H full-graph private isolation | Native documents/source navigation and original file backups |

### Inherited Shared Expenses cases1-40

| # | Scenario | Fresh evidence boundary / remaining coverage |
|---|---|---|
| 1 | Registered group | Fresh U/DB grouped fixtures; historical H; individual native option incomplete |
| 2 | Manual participant | Fresh U/DB grouped fixtures; historical H; individual native option incomplete |
| 3 | Single payer equal split | Fresh U/DB plus NW/NA actual hosted exact split passed; other native options remain qualified |
| 4 | Multiple payers | Fresh U/DB grouped fixtures; historical H; individual native option incomplete |
| 5 | Exact payer total | Fresh U/DB grouped fixtures; historical H; individual native option incomplete |
| 6 | Exact share total | Fresh U/DB grouped fixtures; historical H; individual native option incomplete |
| 7 | Selected members | Fresh U/DB grouped fixtures; historical H; individual native option incomplete |
| 8 | Exact custom shares | Fresh U/DB grouped fixtures; historical H; individual native option incomplete |
| 9 | Reciprocal netting | Fresh U P3 domain/widget; individual native option incomplete |
| 10 | Net-zero positions | Fresh U P3 domain/widget; individual native option incomplete |
| 11 | Sources intact | Fresh U P3 domain/widget; individual native option incomplete |
| 12 | Pairwise explanations | Fresh U P3 domain/widget; individual native option incomplete |
| 13 | Group suggestions | Fresh U P3 domain/widget; individual native option incomplete |
| 14 | Nonposting suggestions | Fresh U P3 domain/widget; individual native option incomplete |
| 15 | Full settlement | Fresh U/DB grouped fixtures; historical H; individual native option incomplete |
| 16 | Custom partial | Fresh U/DB grouped fixtures; historical H; individual native option incomplete |
| 17 | Selected expenses | Fresh U/DB grouped fixtures; historical H; individual native option incomplete |
| 18 | Partial selected bill | Fresh U/DB grouped fixtures; historical H; individual native option incomplete |
| 19 | Multi-bill payment | Fresh U/DB grouped fixtures; historical H; individual native option incomplete |
| 20 | Overpayment/reverse | Fresh U/DB grouped fixtures; historical H; individual native option incomplete |
| 21 | Pending before confirmation | Fresh U/DB grouped fixtures; historical H; individual native option incomplete |
| 22 | Waiting for others | Fresh U P3 domain/widget; individual native option incomplete |
| 23 | Needs my confirmation | Fresh U/DB grouped fixtures; historical H; individual native option incomplete |
| 24 | Confirmed updates | Fresh U/DB grouped fixtures; historical H; individual native option incomplete |
| 25 | Dispute unchanged | Fresh U/DB grouped fixtures; historical H; individual native option incomplete |
| 26 | Manual limitation | Fresh U/DB grouped fixtures; historical H; individual native option incomplete |
| 27 | Versioned correction | Fresh U/DB grouped fixtures; historical H; individual native option incomplete |
| 28 | Refund after settlement | Fresh U/DB grouped fixtures; historical H; individual native option incomplete |
| 29 | Existing cash nonduplication | Fresh U/DB grouped fixtures; historical H; individual native option incomplete |
| 30 | Integrated Add Expense | Fresh U P3 domain/widget; individual native option incomplete |
| 31 | Card nonduplication | Fresh U/DB plus NW/NA actual hosted card adoption/revision/refund passed; physical/signed combinations remain open |
| 32 | Private funding hidden | Fresh U/DB grouped fixtures; historical H; individual native option incomplete |
| 33 | Owner private isolation | Fresh U/DB grouped fixtures; historical H; individual native option incomplete |
| 34 | Former history only | Fresh U/DB grouped fixtures; historical H; individual native option incomplete |
| 35 | Global/group attention | Fresh U P3 domain/widget; individual native option incomplete |
| 36 | Exact rounding | Fresh U/DB plus NW/NA actual hosted exact remainder passed; no double arithmetic |
| 37 | Idempotent writes | Fresh U/DB and NW/NA actual503/lost-response/reopen accepted original command once |
| 38 | Concurrent invariants | Fresh U/DB grouped fixtures; historical H; individual native option incomplete |
| 39 | Mobile/reflow | U reflow/theme/200%; native results above; physical/signed reflow NE |
| 40 | Keyboard/accessibility | U focus/labels/keyboard; human Narrator/TalkBack NE, mandatory G6 |


## Required owner acceptance

The owner selected an assisted physical-phone checklist on29 October. No physical phone
is connected/certified by that decision. Human Narrator/TalkBack passes are not inferred.

### Verified support envelope

| Target | Actually exercised | Qualification |
|---|---|---|
| Owner Windows host | Windows 11 Home Single Language build 26200 x64, i5-14500HX,16,869,548,032 RAM bytes,120 DPI | Flutter Debug native, normal Release build and actual unsigned per-user installer. Windows reports10.0 for compatibility in one native probe; this is Windows 11, not a Windows 10 acceptance claim. |
| Android emulator | API 37 / Android17 x86_64, dedicated native/release AVDs | Debug hosted/lifecycle/capacity and normal owner-signed release update. No physical ARM64/minimum API 24 acceptance. |
| Owner Android phone | Model/OS/build/ABI/storage not supplied; not connected | **Not executed.** No advertised physical support yet. |
| Brothers/other devices | Not supplied | **Not executed.** Test before expanding support. |

### Owner-assisted phone checklist (not executed)

Use a dedicated synthetic profile/test Google identities on a separate test device or an
explicitly isolated profile. Preserve any existing Salapiya installation; never uninstall,
clear storage, change signing identity or mix destructive fixtures with personal records.
Before starting, independently restore an encrypted archive and retain original documents.
Record device model, Android version/build, ABI, free space, app version and certificate
verification. Use only the checked retained signed candidate after release review; this
checklist is not authorization to distribute to other people.

1. Install clean only where no profile exists. With airplane mode on, create a synthetic
   profile, opening wallet, exact expense/fee, task and note. Restart; verify exact totals
   and original source/history. Record pass/fail and amounts/IDs without personal records.
2. Use isolated Google identities online: enroll, cancel/collision paths, retrieve on a
   second authorized test installation, confirm private/group separation. Share PHP100
   three ways33.34/33.33/33.33; confirm only intended peers see it. Exercise offline edits,
   restart, reconnect and verify original IDs/one accepted effect plus downloaded coverage.
3. Pick a synthetic small document; verify size/checksum and encrypted local availability.
   Restore/retrieve on another device: metadata must truthfully report missing bytes until
   exact-original reselection. Retain independent originals; no cloud scanning claim.
4. Deny then grant notification permission; schedule a near-future synthetic reminder,
   verify quiet-hour/source rules, foreground/background delivery, tap routing, cold start
   and reboot rescheduling. Record OEM battery restrictions and actual delivery times.
5. Before same-certificate update retain independently restored archive and compare profile,
   financial/Life/source IDs, pending envelopes, accepted receipts and totals. Update without
   uninstall; restart and compare. Verify old/new backup compatibility and ordinary downgrade
   rejection. Interrupted-update/disk-pressure tests require a disposable dedicated device;
   never interrupt an update on the owner's real profile to manufacture evidence.
6. Load the bounded mixed synthetic fixture on a dedicated device, measure release cold
   launch/open/Overview/save/report/restore, memory/free storage, initial and incremental
   sync with real provider dashboard traffic. Do not upload10k actions to the Free service.
7. On dedicated identities only, revoke another session, keep its old JWT/archive/offline
   queue and confirm RPC/RLS/SDK denial after checkpoint/reconnect while peers work. Verify
   locally retained records are disclosed. Reauthenticate Google and delete a dedicated
   connected identity; confirm private purge, neutral shared retention and lost-response
   outcome. Never delete a real connected account as an acceptance fixture.

Report each step `PASS / FAIL / NOT RUN`, device/app versions, expected/actual, time, synthetic
IDs and sanitized text logs. Keep recovery secrets/provider credentials out of the report.
No screenshots, screen recordings or image galleries are requested or permitted here.

### Human accessibility checklist (not executed)

- Windows: Narrator announces navigation, exact amounts, field labels/validation, review,
  confirmation, save outcome and errors once with meaningful focus. Complete one keyboard-only
  finance/Life/lifecycle journey using Tab/Shift+Tab/Enter/Escape; verify visible focus/order,
  modal return focus, title-bar control names, native Snap and resizing. Repeat at representative
  high DPI/text sizes, high contrast and reduced motion; ensure no clipped actions/amounts.
- Android: TalkBack linear navigation and explore-by-touch through Overview, financial review,
  success/failure, task, backup and typed removal cancellation. Verify names/values/order,
  large-text reachability, touch targets/gestures, status/error announcements, contrast and
  reduced motion. Check keyboard/file picker/notification transitions on the physical phone.
- Report device/OS/assistive version, app version, step and exact spoken/observed failure in
  sanitized text. Automated semantics/geometry passes are supplemental, never human passes.

### Remaining owner and engineering actions

1. Owner: choose/grant two independently protected backup locations and separate secure key
   retrieval/current deletion-register storage. Engineering: schedule, failure alert, actual
   weekly retention and independent-media loss/restore drill; managed Auth/PowerSync recovery
   and fresh authorized client resync before opening ingress.
2. Owner: provide actual provider billing/usage/entitlement/OAuth access for a separate no-cost
   owner-and-brothers pilot. Engineering: configure/verify isolation without personal migration,
   bounded measured traffic/concurrency and operating forecasts. No automatic paid upgrade.
3. Owner: execute phone/human accessibility checklist or make test devices available. Engineering:
   complete final-package Google positive deletion/enrollment, pending/receipt/backup/interrupted
   update matrix, isolated Windows installed startup/callback/notification/data upgrade and
   release-mode capacity/storage-pressure tests. Existing owner profiles stay intact.
4. Trusted Windows signing remains mandatory and intentionally unpaid. No purchase is requested.
   A separately justified owner-approved release-scope change would need its own review;
   neither Android-only nor unsigned Windows distribution is assumed authorized.
5. Permanent sole-owner-loss privileged recovery needs a reviewed narrowly authorized procedure
   and dedicated drill before any explicitly approved non-test group operation.

### G0-G8 current gates

| Gate | Current status and evidence | Remaining mandatory boundary |
|---|---|---|
| G0 | Partial: pinned plugins/encrypted native persistence exercised on both validated targets | Physical ARM64/minimum OS/device inventory |
| G1 | Partial: fresh real CDC/503/lost-response/original queue and revoked-session reconnect passed | Signed-device matrix, provider suspension/checkpoint-loss drill |
| G2 | Partial: historical Google plus fresh identity/RLS/SDK tests | Final installed interactive Google enrollment/collision/retrieval and positive deletion |
| G3 | U/DB/H exact arithmetic/idempotency/privacy passed; fresh native cash/card/Shared/Life regressions | Advanced individual native options/signed-device races remain qualified |
| G4 | Partial: independent-key archives and actual isolated PostgreSQL restore passed | Windows/physical/connected installed restore, independent current journal and managed-provider resync |
| G5 | **BLOCKED**: unsigned installer engineering passed; signed Android update qualified below | Trusted Windows signing, full installed activation/update/failure matrix |
| G6 | **BLOCKED**: mixed 10k/native Debug capacity and presentation passed | Physical/human accessibility and installed release performance/storage pressure |
| G7 | **BLOCKED**: storage/health/WAL audit and policies implemented | Billing/usage/free entitlements, isolated pilot and operational backups |
| G8 | **BLOCKED**: local removal/session revocation/erasure/retention implemented and bounded proofs passed | Real Google deletion, permanent-owner-loss drill, independent journal/backup and managed recovery |

### P6-01 through P6-12 disposition and severity

| ID | Current disposition | Remaining severity/dependency |
|---|---|---|
| P6-01 | Compiler/recipe/actual staging install-upgrade-downgrade-uninstall completed | **High release gate:** unpaid trusted signing and installed startup/data/activation/failure matrix |
| P6-02 | Fresh same-key Android candidate and update evidence below | **High:** pending connected envelopes/receipts/interrupted update and full A25 remain partial |
| P6-03 | Local/device/account erasure/RPC-RLS-CDC/peer retention implemented; actual native revocation and provider deletion passed | **High:** real Google positive and permanent sole-owner-loss recovery drill |
| P6-04 | Approved 7+4/two-copy tooling and genuine hosted snapshot/isolated restore passed | **High:** independent permanent destinations/current journal/managed resync unconfigured |
| P6-05 | Owner-assisted checklist prepared as selected | **Mandatory:** physical phone and human Narrator/TalkBack NE |
| P6-06 | Mixed10,098 finance/511 Life/3 groups capacity and both Debug native targets passed | **Mandatory:** installed release/device/cold start/disk exhaustion/billed traffic/concurrency NE |
| P6-07 | Vulnerable bundled administration removed; npm/OSV scoped scans zero | Resolved scoped advisory; routine maintenance/excluded toolchain review continues |
| P6-08 | Approved local-only attachment policy preserved | Resolved scope decision; original files still need independent backups |
| P6-09 | Prior overflow fix retained; final231 tests and native presentation passed | Resolved regression; human accessibility separate |
| P6-10 | Harness modal settling fixed; real hosted regression passed both targets | Resolved infrastructure; financial assertions unchanged |
| P6-11 | Cash/card source classification fix retained; exact native card/refund regression passed | Resolved tested behavior |
| P6-12 | Normal final builds regenerated; packaging rejects development assets | Resolved tested packaging behavior |

No demonstrated unresolved duplicate-money/private-cross-owner defect was observed in the
executed suite. This does not waive the high release/operational gates above. L05-L07,
arbitrary trackers, external calendar sync, public stores/custom updater and future cloud
attachment bytes remain outside the approved initial scope. F01 accessibility remains G6;
F03 installed reminder/cold activation remains unexecuted.

## Final classification

**BLOCKED.** Mandatory original Windows trusted signing, complete native/security/recovery,
physical/human accessibility and operational prerequisites must remain open until executed.
The implementation/evidence is ready for final owner review; the application is not approved
for distribution. A narrower pilot may be proposed separately after its technical gates and
scope are reviewed. No release scope was silently waived, main merge or distribution performed.
