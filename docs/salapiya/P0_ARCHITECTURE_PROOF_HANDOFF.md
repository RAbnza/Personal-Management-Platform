# Salapiya P0 architecture proof handoff

**Date:** October 24, 2026 (Asia/Manila)

**Branch:** `feat/salapiya-p0-hosted-integration`

**Verified base:** `8e2f9cc4708c6123609c17e41d124c2d3d16e739`, matching the remote architecture-proof branch at this continuation's start. The earlier local proof was based on approved D5 commit `4cd03faf72f1242b6018ac64c7de3df0c1387d3c`.
**Decision:** development Supabase and PowerSync are configured; bounded hosted acceptance is now exercised. Google OAuth and wider foundation acceptance remain open. **Substantial P1 must not begin yet.**

This is the assignment's single completion report. The [blueprint](../SALAPIYA_PRODUCT_AND_PLATFORM_BLUEPRINT.md) and [approved D5 handoff](design/D5_PRODUCTION_HANDOFF.md) remain authoritative. Presentation, navigation and prototype controllers remain unchanged. Historical web source, tests, migrations and pnpm tooling remain executable and unmodified. This continuation modifies only the existing development resources with synthetic data. No production changes, destructive resets, paid activation, main merge or force push occurred.

## Implementation and source map

| Phase | Result |
| --- | --- |
| A: compatibility/cost | Exact stack pins, lockfile, native critical API probes, dated service quotas and explicit four-user model |
| B: money/SQLite | Exact Dart money port and shared golden fixtures, strict transactional evidence, migrations, integer extremes, rollback and actual process-kill recovery |
| C: commands/sync | Real SDK queue and Supabase RPC; independent hosted races, durable receipts/conflicts and private PowerSync streams; local simulation tests retained separately |
| D: identity | Secure runtime Supabase session/PKCE initialization, callback transport, durable enrollment freeze/cancel and bounded publication completion; real password fixture sessions, Google still unavailable |
| E: protection/recovery | Library AES-GCM database/file/archive approaches and independent secret; cross-target transfer plus owner-authenticated hosted receipt review and explicit same-ID retry of a missing restored command |
| F: consolidation | Evidence-based gate assessment, configuration runbook, blockers and P1 decision below |

Native modules are under `apps/salapiya/lib/p0/`; none is wired into product `main.dart`. Tests include `test/p0_*_test.dart`, `integration_test/p0_architecture_test.dart`, `p0_callback_test.dart`, `p0_portability_test.dart` and the new `p0_hosted_test.dart`. The process-kill worker is `tool/p0_crash_worker.dart`. `tool/p0_make_transfer.dart` writes only a synthetic fixture into ignored `build/`.

Server SQL, stream configuration and executable tests are under `services/salapiya/p0/`. Shared golden data is `contracts/salapiya/p0_money.json`. Reuse traced `src/shared/money.ts`, its tests, sharing allocation code/tests, web command canonicalization/receipt code and `tests/integration/financial-command-receipt.test.ts`. The original TypeScript money functions actually execute against the same fixture used by Dart. Web backup framing informed authenticated metadata and independent-key recovery; its server dump format was not mechanically copied.

This remains a bounded synthetic expense proof, not a full ledger, group system, generic sync engine or P1 feature implementation.

### Hosted continuation implementation

The official Supabase CLI **2.122.0**, PowerSync CLI **0.10.2** and `pg` **8.23.1** are pinned in the service package/lockfile. Existing SQL was moved into tracked timestamped migrations, with no web migration replay:

- `supabase/migrations/20261024000100_p0_financial_proof.sql`
- `supabase/migrations/20261024000200_p0_enrollment_proof.sql`
- `supabase/migrations/20261024000300_p0_recovery_receipt_review.sql`

All three were previewed and applied with the linked official CLI. The third adds a SELECT-only, owner-authenticated receipt-review RPC; no table reset or financial rewrite. The target is Supabase **salapiya-dev**, ref `uxnyxhwqshqpvinvopiv`, Tokyo `ap-northeast-1`, healthy, hosted PostgreSQL **17.11**. `cloud.mjs` verifies name/ref/region/health before operations. PostgreSQL race tests use three distinct backend sessions through the verified **session** pooler on port 5432, with full TLS certificate verification. The public CA bundle is reproducibly extracted from the pinned official Supabase CLI source; certificate verification was not disabled.

The existing PowerSync **salapiya-dev → Development**, JP instance `6adc9162b32a60a89a2e706c`, runs at `https://6adc9162b32a60a89a2e706c.powersync.journeyapps.com`. No additional instance was created. The dedicated `salapiya_p0_replication` login has the provider-required REPLICATION/BYPASSRLS privileges, public schema usage and SELECT on exactly the two proof tables. Publication `powersync` contains only `public.p0_profile` and `public.p0_accepted`; private receipts/evidence/staging stay excluded. The server connection verifies TLS against the supplied public roots. Edition-3 streams filter with signed `auth.user_id()`, without owner parameters granting authority.

Initial ordinary deployment failed at operation `6adcb567501b259d0e4dfed7`; neither API nor the owner's dashboard inspection exposed a cause. A supported initial deploy using `--validate-only=configuration,connections` included the reviewed streams at first boot and succeeded. Full configuration, connection **and stream** validation then passed. This bootstrap's skipped stream validation is not counted as passing evidence. A subsequent real client exposed `PSYNC_S2105`: Cloud CLI ignores the self-hosted `audience` field. Configuration now uses explicit Supabase JWKS, `supabase: false` and Cloud `additional_audiences: [authenticated]`; a normal fully validated redeploy succeeded. No JWT secret or custom token signer was added. See the official [Supabase auth guide](https://docs.powersync.com/configuration/auth/supabase-auth) and the pinned Cloud CLI schema.

`auth_runtime.dart` initializes actual PKCE auth using OS-secured session/verifier adapters. `completePublication` verifies the entire bounded accepted snapshot and identity before atomically remapping local intent ownership/payload while retaining evidence IDs and amounts; repeated completion cannot regress reconciliation. `ConnectedRecovery.review` compares restored original IDs/payloads against the authenticated server receipt. Accepted/rejected/mismatched results remain held; a missing result queues only after explicit resume. Receipts never manufacture downloaded rows or grant group access.

## Dependencies, compatibility and environment

| Direct dependency | Exact selection | License / exercised purpose |
| --- | --- | --- |
| Flutter / Dart | 3.47.7 / 3.13.5 | BSD-3-Clause; retained shared native baseline |
| powersync | 2.5.0 | Apache-2.0; native core, encrypted reopen, local-only/insert-only APIs |
| sqlite3 | 3.8.0 | MIT wrapper; SQLite3 Multiple Ciphers selected by build hook; retain bundled cipher notices |
| sqlite_async | 0.14.6 | Apache-2.0; pool/open-factory durability configuration |
| supabase_flutter | 2.18.3 | MIT; PKCE URL, session interface, RPC connector |
| flutter_secure_storage | 11.2.0 | BSD-3-Clause; OS credential read/write/delete |
| cryptography | 2.9.0 | Apache-2.0; secure random keys, AES-256-GCM and SHA-256 |
| app_links | 7.2.2 | Apache-2.0; native callback delivery |
| path_provider / path | 2.1.5 / 1.9.1 | BSD-3-Clause; app support directory/native paths |

Existing flutter_svg 2.3.0 and flutter_lints 6.0.0 remain. Transitives are locked, including Supabase 2.16.5, GoTrue 2.27.3 and secure-storage Windows 4.2.2. EOL compatibility shims are transitive PowerSync dependencies, not separately selected encryption adapters. No obsolete `powersync_sqlcipher` wrapper is used. State/navigation remain the approved prototype's existing approach; this proof needs no new state/router/chart framework.

Official sources checked October 24, 2026: [PowerSync Flutter](https://docs.powersync.com/client-sdks/reference/flutter), [EncryptionOptions](https://pub.dev/documentation/powersync/latest/powersync/EncryptionOptions-class.html), [SQLite hooks](https://github.com/simolus3/sqlite3.dart/blob/main/sqlite3/doc/hook.md), [secure storage](https://pub.dev/packages/flutter_secure_storage), [Supabase Flutter](https://pub.dev/packages/supabase_flutter), [cryptography](https://pub.dev/packages/cryptography), [app_links Windows](https://github.com/llfbandit/app_links/blob/main/doc/README_windows.md) and [Flutter platform support](https://docs.flutter.dev/reference/supported-platforms). Package manifests/licenses were inspected locally. Shipping must retain bundled SQLite3MC/cipher notices and resolved Flutter license notices; this is not a dependency security audit.

Actually exercised: Windows 11 25H2 x64 build 26200.9711 and Android 17/API 37 x86_64 emulator, using the foundation toolchain. Current Flutter supports Android API 24–37; the secure-storage minimum alone does not determine this application's floor. Windows 10/ARM64, minimum Android API/ARM64 and physical devices remain untested. The owner's actual phone/OS inventory is still needed for G0/G6.

Environment corrections:
- Windows plugin generation initially lacked symlink privileges. NTFS directory junctions in ignored `windows/flutter/ephemeral/.plugin_symlinks/` allowed native builds without changing Windows security settings. A new environment needs Developer Mode or equivalent generated plugin-directory junctions from `.flutter-plugins-dependencies`.
- Android Kotlin incremental caches failed because Pub sources are on C: and this repository on E:. `android/gradle.properties` now disables Kotlin incremental compilation. Subsequent native tests pass. Gradle installed required API 35 and CMake 3.22.1 components; no existing SDK/AVD was replaced.
- Android Auto Backup is disabled to avoid restoring credentials without OS keys. Internet permission supports connected operation; local use needs no sign-in.
- Docker's engine was unavailable. **Automatic approval review rejected starting Docker Desktop.** The safe alternative is PGlite, not bypassing that rejection. PGlite does not substitute for Supabase or independent-session race tests.
- Early compatibility failures revealed failed-open cleanup propagation and missing PKCE async storage; both were fixed in the probe. JDK native-access and Node TypeScript module-detection warnings remain nonfatal.
- The original workspace's release build hit LNK1104 because the owner's existing Release executable was running. It was left open. Product release verification uses an isolated detached worktree at implementation commit `1e6152d`, so it does not replace or terminate that running prototype.

## Financial and synchronization contracts

Money uses canonical signed decimal strings and Dart BigInt, never doubles. PHP form parsing, negative/rejection cases and deterministic remainders follow web fixtures. Individual private components remain nonzero within ±100,000,000,000 minor units. Shared bill fixtures retain the larger signed-bigint bound and stable participant ordering. The proof bounds participants to 100.

Checked conversion permits signed-64-bit SQLite INTEGER values only; actual maximum/minimum database round trips are tested. Aggregates use BigInt instead of floating-point SQLite TOTAL or overflow-prone SUM. JSON monetary boundaries stay strings.

An expense atomically writes intent, expense/cash evidence and, in connected mode, its SDK transport record. Strict tables and immutable evidence triggers reject type drift and corrections by mutation. Version-1 migrations roll back on interruption and fail closed on unknown versions without resetting data. The native factory explicitly enables foreign keys, WAL/FULL synchronization, memory temp storage and disables SQL query profiling. Actual killed-process tests prove WAL recovery, not physical power-cut/faulty-storage guarantees.

| Store | Authority |
| --- | --- |
| Ordinary local `proof_intent` / `proof_evidence` | Synthetic local facts or durable connected overlay; financial rows do not directly upload |
| PowerSync `local_probe` | Local-only API proof; generates no upload queue |
| PowerSync `command_transport` | Insert-only whole command; independent server authorization required |
| `p0_profile` / `p0_accepted` | Accepted server projections; authenticated client grants allow SELECT only |
| `salapiya_p0.receipt` / `evidence` / `enrollment` | Server-private receipts/evidence/staging; excluded from publication/Data API |

The PostgreSQL RPC uses auth.uid(), bounded validation, server-parsed JSONB payload equality, owner/receipt locks and a transaction containing accepted action, paired immutable evidence, revision and receipt. Different-payload ID reuse fails; accepted payload text is normalized by the server. Independent expense creates use expected revision 0; explicit stale dependencies reject rather than overwrite.

SDK queue completion follows durable local accepted/review state. Response loss retries the original ID. Permanent rejection preserves intent/evidence and allows unrelated valid commands to progress. Temporary network/auth failures retain the queue for SDK retry. Wrong-owner queues/unexpected transport operations fail closed; broader malformed-queue quarantine remains unimplemented.

A receipt alone does not remove pending effects. Matching accepted ID, owner, canonical payload and amount suppress the overlay even before explicit reconciliation. Retained local tests inject an accepted row to simulate a download and remove that injection's upload entry; those tests remain **simulations**. The new hosted native test instead waits for a genuine PowerSync download before reconciliation and checks an offline queue through encrypted reopen/reconnect.

No group command surface exists here. Owner RLS does not prove membership, creator corrections or recipient confirmations. Two manually entered purchases with different IDs also cannot be deduplicated by idempotency alone.

### Connected offline/finalization policy

Every row remains fully offline in local-only mode once its domain implementation exists. This matrix is policy for subsequent gate work, not a claim of P0 product implementation.

| IDs | Connected offline behavior | Finalization |
| --- | --- | --- |
| M01 accounts/openings/archive | Durable setup/draft; cached history | Validate ownership/cutoff uniqueness/dependencies; dependency-sensitive archive online |
| M02 ordinary income/expense/transfer/fees/categories | Durable pending whole action and exact preview | Atomic server acceptance; unrelated updates do not reject independent creates |
| M03 corrections/refunds/reversal/reconciliation | Evidence-preserving draft, retain actual cash facts | Online source/version checks; no history overwrite |
| M04 debt import/borrowing | Capture graph/evidence draft | Validate opening/net-proceeds graph once |
| M05 payments/schedules/allocations | Actual payment capture plus allocation draft | Current capacity/version check; schedule replacement online |
| M06 early settlement/residual closure | Provider evidence/draft | Online current liability; no guessed closure |
| M07 cards/purchases/payments/refunds | Ordinary facts pending; cash/spending axes separate | Dependency/capacity-sensitive correction online |
| M08 statements/installments | Local review/draft | Online statement/revision/capacity validation |
| M09 recurring rules/actual links | Versioned draft; never automatic posting | Record/version/actual-eligibility validation |
| M10 budgets | Cached calculation/draft | Online overlap/version validation |
| M11 savings/reservations | Draft and visible shortfall | Online funding/capacity check; actual spending survives |
| M12 forecasts | Local read-only over complete sources | Refresh freshness only; no postings |
| M13 overview/reports/CSV | Local with coverage/pending labels | Initial partial history cannot claim complete balances |
| M14 files | Protected downloaded bytes; uploads separate | Remote authorization/type/size/scanning |
| M15 cash-history import | Parse/review/durable draft | Atomic cutoff/provenance/duplicate validation |
| M16 reminders | Device-local source projections | Reconcile generations; no money effects |
| M17 backup/lifecycle | Local encrypted backup/recovery; preserve unsynced work | Cloud deletion/account changes need fresh online authority |
| S01 membership/invites/ownership | Entitled cached history/input | Current online identity/membership |
| S02 new bills | Durable pending exact payer/share axes | Active membership; independent creates preserved |
| S03 creator correction | Comparison/draft | Online creator and expected revision |
| S04 refunds/private source changes | Separate received-money/share-credit draft | Online capacities and authority |
| S05 settlements/advances | Actual payment report and allocation draft | Online allocation caps; retain genuine private evidence if rejected |
| S06 settlement transitions | Confirmation/dispute/cancel/reversal draft | Online recipient/actor/state/version; sync is not confirmation |
| S07 balances/netting/suggestions | Entitled local read-only explanation | Suggestions never post/redirect obligations |
| S08 private adoption | Retain own-private evidence/adoption draft | Separate private/group authorization; no duplicate spending/cash |
| S09 clearing/reclassification | Evidence review/draft | Online source/version/capacity checks |
| S10 history/export/lifecycle | Entitled cached history/export | Membership/retention changes online; caches grant no new authority |

Most command-specific fixtures in this matrix remain unimplemented. No launch-scope reduction or broad online-only finance policy is authorized.

## Identity, encryption and recovery

Local creation makes no network/anonymous-auth request. Enrollment freezes the bounded local graph transactionally, persists claim/snapshot across reopening and preserves records on cancellation/collision. Wrong-account interruption cannot replace the staged claim.

SQL staging is private and unpublished. Publication creates one profile and all synthetic actions/evidence/receipts in one transaction. Repeated publication is idempotent; competing staged claims now also collide safely in genuinely concurrent hosted sessions. Retrieval is owner-scoped, never by name/email.

**Outstanding:** complete financial graph enrollment/openings/debt/card/files, complete-profile activation after initial sync, populated-local/existing-cloud switch and actual Google cancellation/wrong-account/expiry/revocation/second-device identity. SQL race cases use transaction-local synthetic subjects, while separate JWT tests use real Auth-created password fixtures. Neither certifies Google authentication.

Secure session and PKCE adapters replace preference storage. Native tests exercise synthetic storage operations and real Supabase fixture sessions. Windows uses the plugin's Credential Manager backed protection; Android uses supported keystore-backed storage. These protect at rest, not against a compromised logged-in OS. Native callback delivery and Google PKCE URL generation do not prove Google token exchange. Actual refresh-token revocation is checked; this does not invalidate already issued stateless access JWTs immediately.

Portable archives and private files use cryptography's AES-256-GCM with fresh nonces and authenticated version headers. The encrypted archive manifest records schema/command/calculation versions, UTC creation time, record/file counts and SHA-256 file checksums. Exact paired evidence and owner consistency are validated.

A separate library-generated random **256-bit recovery secret** permits restoration without the source device/database key. It is not a short PIN or human password; no custom cryptography/KDF exists. Retain the archive and secret separately off-device.

Bounds: 100 synthetic expenses, 10 supplied files, 1 MiB/file, 4 MiB plaintext archive. No paths, arbitrary fields or reusable tokens are permitted. This is not a backup of all approved domains/group history. Files return in memory for safe staging rather than silently becoming plaintext files.

Connected commands retain original IDs but restore held in review with **no upload entries**. Owner-authenticated receipt comparison and explicit same-ID release of a missing command are now implemented and exercised against Supabase. Accepted/rejected receipts remain held; complete accepted-history restoration/activation, deleted/revoked account reconciliation, atomic profile/file activation and production key creation/rotation/loss remain unimplemented. A backup grants no group authority or cloud rollback permission.

## Actual evidence and reproduction

The earlier local Windows/emulator evidence is retained below; the new hosted continuation is listed separately. No screenshots/videos or unrelated historical web campaign were run.

| Check | Actual result |
| --- | --- |
| PostgreSQL/PGlite + original web money fixture | **8 passed**: seven SQL scenarios plus cross-language golden parity |
| Windows host P0 + retained widget smoke | **33 passed**, including exact money, rollback/migrations, queue faults, enrollment, recovery and approved UI smoke |
| Actual Windows worker termination | Both passed: committed intent/evidence/queue survives; uncommitted transaction disappears; integrity_check ok |
| Windows native consolidated proof | **7 passed**: compatibility, persistence, simulated commands, enrollment, recovery, Windows-created archive restore |
| Android native consolidated proof | **7 passed**, including actual Windows-to-Android archive transfer |
| Final Android offline durability run | **7 passed**, Wi-Fi/mobile data verified 0 during execution and restored to original 1/1 afterward; includes explicit foreign-key/FULL-sync assertions |
| Android callback delivery | **1 passed** through an actual adb VIEW intent and app_links |
| Final Windows native durability run | **7 passed**, including explicit foreign-key/FULL-sync assertions and portable restore |
| Windows callback forwarding | **1 passed** using the actual executable and app_links; browser protocol registration remains untested |
| Product entry-point builds | Windows **release passed** from isolated commit `1e6152d` (164.0s); normal Android **debug APK passed** (107.6s) |
| Normal Android application restored | `adb install -r` succeeded without clearing data; MainActivity cold start returned Status ok (8.6s) |
| Analyzer | No issues found on the final analyzed code |
| Locked dependencies / formatting / whitespace | `flutter pub get --enforce-lockfile`, targeted Dart format verification and `git diff --check` passed |
| Hosted PostgreSQL concurrency and authority | **11 passed**, three distinct backend sessions; real JWT/RLS checks separately from SQL claim fixtures |
| Focused local command/enrollment/recovery regression | **5 passed**, including new complete-publication validation/idempotence |
| Local server regression after tracked migrations | **8 passed**, including authoritative web money golden parity |
| Windows hosted native proof | **1 comprehensive scenario passed** (20s runtime; 49.6s Debug build), real Supabase/PowerSync |
| Android hosted native proof | **Same scenario passed** (15s runtime; 109.8s build, 6.3s install), including download of Windows' accepted command for the same owner |
| Normal Android app after hosted tests | **Debug build passed** (86.3s), `adb install -r` succeeded without clearing data; MainActivity cold start returned **Status ok** (11.0s) |
| Final analysis/credential checks | Analyzer **no issues** (8.0s); format/diff checks passed; actual known supplied/admin/generated secrets absent from **1,841 scanned files**, including Windows Dart kernel and decompressed normal APK; `.env.local` ignored/untracked |
| Google OAuth | **Not tested; blocked** by absent Google project/client/provider setup |

Portable evidence: the actual Windows-created encrypted archive was **1,339 bytes**, containing two intents, four evidence rows and one file. It restored with an independently encrypted target database on both native platforms. The ignored `build/p0-transfer.json` contains only synthetic test material; its compile-time test secret is not a real credential-storage pattern. Archive size is not measured hosted wire traffic.

Local disposable logs are under ignored `apps/salapiya/build/p0-*.log`; committed test code is the reproducible evidence. PGlite executes real PostgreSQL in WASM but serializes transactions. Its auth.uid() stub sets a transaction-local subject and verifies no JWT. `hosted-tests.mjs` supplies independent hosted races and actual signed JWT/RLS checks; `p0_hosted_test.dart` supplies native hosted auth/RPC/download checks. No local injected row is counted as hosted replication.

The hosted scenario exercises real Supabase fixture session exchange, bounded enrollment/publication or preserved-local collision, committed RPC retry after encrypted close/reopen, stale rejection while unrelated work proceeds, owner API isolation, encrypted archive restore into another database, accepted/rejected/missing receipt review and explicit original-ID resume. Actual PowerSync streams then download matching accepted rows, reconcile without double counting, preserve cached history plus offline intent through reopen, upload automatically on reconnect, and exclude foreign owners in **two independently authenticated databases**, even with forged owner parameters. Android additionally downloads the preceding Windows command. Other-session sign-out is followed by a real rejected refresh attempt. Google URL generation checks PKCE S256 only; no Google authorization/exchange is claimed.

Fault boundaries: response loss is an injected client `SocketException` **after a real hosted commit**, and the original ID is replayed through the durable SDK queue after reopen. Offline work uses an explicit SDK disconnect, not a new host-network/airplane-mode campaign. No forced service outage, replication-slot loss, deliberately invalidated checkpoint or immediate access-JWT revocation is claimed. PowerSync's default debug logger is replaced by its non-console attached logger; financial payload/query logging remains disabled.

The isolated Windows release bundle is retained locally under ignored
`apps/salapiya/build/p0-release/`; its build log is copied into the main workspace.
The temporary detached worktree is removed after verification. The ordinary
Android APK is reinstalled without clearing data after integration tests so the
emulator opens the approved application rather than a test listener.

From the repository root:

```powershell
cd services/salapiya/p0
npm.cmd ci --ignore-scripts --no-audit --no-fund
npm.cmd test
cd ../../../apps/salapiya
flutter pub get --enforce-lockfile
dart run tool/p0_make_transfer.dart
flutter test --no-pub test/p0_money_test.dart test/p0_persistence_test.dart test/p0_command_test.dart test/p0_enrollment_test.dart test/p0_recovery_test.dart test/p0_crash_test.dart test/widget_test.dart
flutter test integration_test/p0_architecture_test.dart -d windows --no-pub --dart-define-from-file=build/p0-transfer.json
flutter test integration_test/p0_architecture_test.dart -d <actual-android-id> --no-pub --dart-define-from-file=build/p0-transfer.json
flutter analyze --no-pub
flutter build windows --release --no-pub
flutter build apk --debug --no-pub
```

Run native builds/tests sequentially per target. Offline emulator checks must restore prior Wi-Fi/data settings in a finally block. The host network was not disabled.

Callback checks use `flutter test integration_test/p0_callback_test.dart -d <target> --no-pub`. After `P0_CALLBACK_READY`, send the URI `dev.salapiya.p0://auth/callback?code=synthetic-callback-only`:
- Android: `adb -s <device> shell am start -W -a android.intent.action.VIEW -d "<URI>" dev.salapiya.salapiya`.
- Windows: invoke the just-built Debug salapiya.exe with that URI as its single argument. This tests existing-instance forwarding, separately from browser protocol registration.
- Never substitute a real authorization code in this synthetic test.

## Early G7: cost, inactivity and limits

Official free-tier allowances checked October 24, 2026:

| Service | Published allowance/behavior |
| --- | --- |
| Supabase | 500 MB database, 1 GB files, 5 GB egress plus 5 GB cached egress, 50,000 MAU, two active projects; inactivity pause after one week. [Pricing](https://supabase.com/pricing) |
| PowerSync | 500 MB hosted sync data, 2 GB synced/month, 50 peak concurrent clients, two instances, one source connection/instance; inactivity deactivation after one week. [Pricing](https://powersync.com/pricing) |

**Planning model, not measured service use:** four owners × two devices, 2,000 initial actions/owner, 20 new actions/owner/day, 4 KiB server storage/action and 2 KiB replicated payload/action. Approximately 31 MiB initial server records, 31 MiB initial two-device payload, 2,400 monthly actions and 9.4 MiB monthly replicated payload before protocol/reconnect overhead. A fivefold payload allowance still fits listed transfer quotas.

Files dominate: 50 MiB/owner starts at 200 MiB, plus 20 MiB total/month reaches about 440 MiB after one year, excluding independent backups. Indexes, immutable receipts/history, tombstones, WAL, sync buckets, repeated initial downloads, scans and exports add usage. Four light users appear plausible on free tiers, not guaranteed.

Actual snapshot at **2026-10-24 14:05:03 UTC / 22:05:03 Manila**, after both hosted native runs: database **11,499,187 bytes**, proof tables including indexes **229,376 bytes**, **30 accepted synthetic actions / 50 receipts**. PowerSync initial replication was complete, source connected, stream/table error counts zero, reported lag **0 bytes**; its active slot had reserved WAL status and **56 bytes** retained at that instant. This is a tiny synthetic point-in-time sample, not four-user capacity/traffic evidence. `inspect-health.mjs` reproduces the measurement. Monthly PowerSync wire/storage billing usage is not exposed by that diagnostics endpoint and still needs the provider Usage dashboard.

Pauses/deactivation require manual reactivation and a real drill for slot health, refresh/reauthentication, complete resync and receipt reconciliation. Preserve offline writes throughout. Inspect retained WAL/slots and disk during outages; see [PowerSync Supabase operations](https://docs.powersync.com/integrations/supabase/guide). Monthly traffic, retention growth and inactivity recovery remain unmeasured; no slot was removed/reset.

If always-on paid continuity is needed, current listed starting plans are approximately Supabase $25/month and PowerSync $49/month, before extras/tax. No upgrade/production instance/card/budget commitment was activated. Owner approval of a specific budget is required before paid changes.

## Gate decision and P1 readiness

| Gate | Classification | Remaining condition |
| --- | --- | --- |
| G0 | **Partially verified** | Native stack works on tested targets; owner physical/minimum OS/CPU inventory and installer callback registration open |
| G1 | **Partially verified** | Live private streams, RPC retries and encrypted offline reopen/reconnect now exercised; hosted service interruption/inactivity, forced checkpoint loss/full resync and broader queue faults remain open |
| G2 | **Partially verified** | Real JWT owner retrieval, bounded publication and independently concurrent claims pass; Google, full graph and populated-local/existing-cloud activation remain blocked/open |
| G3 | **Partially verified** | Exact fixtures/storage/crash plus independent hosted idempotency/revision races pass; advanced domain parity, financial capacity conflicts and group authorization remain untested |
| G4 | **Partially verified** | Cross-target encryption/recovery, real receipt review and explicit missing-command resume pass; complete archive/activation, production key lifecycle and revoked/deleted identity reconciliation remain open |
| Early G7 | **Partially verified** | Published quotas/model and actual development DB/replication health sampled; monthly wire usage, inactivity/reactivation and retained-WAL growth during outages remain untested |

No foundational gate is marked Passed. G5 signing/upgrades/distribution, G6 physical/accessibility/performance and G8 full files/lifecycle/retention remain later work. No new acceptance is implied.

**P1 must wait.** The immediate external blocker is Google Cloud/Supabase Google provider setup below. The next bounded assignment should prove real browser PKCE on Windows/Android (including Windows protocol registration), cancellation/wrong-account/revocation/restart/second-device behavior, full enrollment/restore activation and deliberate hosted interruption/resync. Complete domain parity/capacity/group authority and key lifecycle evidence before closing G0–G4 or starting substantial P1. Do not begin P2–P6.

## Exact manual setup and credentials

### Completed development provider setup and reproduction

No manual SQL or PowerSync dashboard authorization is currently required. The CLI is linked to the verified existing Supabase target; the existing JP Development instance is deployed. Review migrations/configuration before rerunning remote writes. Never replay web migrations, use transaction pooling for replication, expose `salapiya_p0` in Data API schemas, or publish all tables.

The server helpers load `services/salapiya/p0/.env.local` only after verifying Git ignores it and does not track it. The four supplied variable names remain `SUPABASE_PROJECT_ID`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` and `PS_ADMIN_TOKEN`. Values are passed in memory/inherited environment, never command arguments. No persistent provider CLI login was created.

```powershell
cd services/salapiya/p0
npm.cmd ci --ignore-scripts --no-audit --no-fund
node inspect-cloud.mjs
node fetch-database-ca.mjs
node supabase-cli.mjs link --project-ref uxnyxhwqshqpvinvopiv
node supabase-cli.mjs db push --linked --dry-run
# Apply only after reviewing the preview and tracked SQL:
node supabase-cli.mjs db push --linked --yes
node hosted-tests.mjs
node deploy-powersync.mjs
# Apply only a reviewed config diff; already deployed at handoff:
node deploy-powersync.mjs --apply
node inspect-health.mjs
```

`configure-auth.mjs` merges the exact native callback into Supabase's existing allowlist, leaving Google disabled and Site URL unchanged. `configure-replication.mjs` resumes the existing restricted role/publication, refuses an existing role without its stored original password, and writes only environment references into tracked service YAML. Do not rotate/delete that role or slot as a troubleshooting shortcut.

`hosted-tests.mjs` is append-only: it retains synthetic test actions/receipts and creates fresh SQL race subjects. Four Auth Admin-created, confirmed `example.test` fixture users are retained for reproducible server/native checks; no email is sent, Google is not impersonated and signup policy was not relaxed. Test sessions are independent of the owner's identity.

To run native hosted acceptance, prepare fresh per-user sessions immediately before each test. Use the same emulator application ID `dev.salapiya.salapiya`; `adb run-as` requires an existing debuggable installation. Windows runs first so Android can verify its accepted command. From the service directory:

```powershell
node prepare-native.mjs windows
cd ../../../apps/salapiya
$configPath = Join-Path $env:LOCALAPPDATA 'Salapiya/p0/hosted/windows.json'
flutter test integration_test/p0_hosted_test.dart -d windows --no-pub "--dart-define=P0_NATIVE_CONFIG_PATH=$configPath"
cd ../../services/salapiya/p0
$env:SALAPIYA_ANDROID_DEVICE = 'emulator-5554' # use actual selected emulator
# Set SALAPIYA_ADB to the actual adb executable if absent from PATH/ANDROID_HOME.
node prepare-native.mjs android
cd ../../../apps/salapiya
flutter test integration_test/p0_hosted_test.dart -d emulator-5554 --no-pub
```

The Windows define contains a **file path only**. Runtime fixture files contain the public client key and per-user refresh tokens, never administrative/database/replication credentials. Android receives its fixture through stdin into app-private storage; both tests consume and delete their fixture before running. Sessions/PKCE and the reopen key use the secure-storage adapters, and test sessions/keys/temp databases are cleaned afterward. Reprepare fixtures after any test failure; consumed files are intentionally not reusable.

Generated replication password and synthetic fixture passwords remain outside Git under `%LOCALAPPDATA%/Salapiya/p0/hosted/state.json`, protected by the OS user's directory. Windows mode flags alone do not establish custom NTFS ACLs. Protect/back up this server-side development state separately; it never ships with Flutter. Tracked YAML contains `!env SALAPIYA_P0_REPLICATION_PASSWORD`, public endpoints and public CA certificates only. `audit-secrets.mjs` scans working source, proof logs, Windows Debug binaries and decompressed debug APK against actual supplied/admin/generated passwords without printing matches. It is an evidence check for known credentials, not a general security audit.

See [Supabase integration](https://docs.powersync.com/integrations/supabase/guide), [JWT configuration](https://docs.powersync.com/configuration/auth/supabase-auth) and [Sync Streams](https://docs.powersync.com/sync/streams/quickstart). The replication role bypasses RLS as required by CDC, so the reviewed streams are a separate privacy boundary from API RLS. Keep both tests.

### Google browser PKCE via Supabase

The selected path is system-browser Supabase OAuth on both targets, without a separate native Google sign-in plugin.

1. In **Google Cloud → Google Auth Platform**, select/create the intended project; configure **Branding** and support/contact details.
2. In **Audience**, choose External for personal Google accounts and add actual development test users. Internal applies only inside a managed Workspace organization.
3. In **Data Access**, request only openid, email and profile; no Gmail/Drive/Calendar.
4. In **Clients**, create a **Web application OAuth client** for the Supabase broker. Add the exact authorized redirect **`https://uxnyxhwqshqpvinvopiv.supabase.co/auth/v1/callback`**. The native scheme is not Google's redirect URI. No native Android client, signing fingerprint, Gmail/Drive permissions or frontend JavaScript origin is needed for this system-browser broker proof.
5. In **Supabase → Authentication → Sign In / Providers → Google**, enable Google with that client ID/secret. Store the secret only in provider dashboards/password manager.
6. Supabase **Authentication → URL Configuration → Redirect URLs** already contains exactly `dev.salapiya.p0://auth/callback`, merged by the automation. Existing Site URL was left unchanged; choose a legitimate controlled fallback when preparing a distributable application. Do not add broad wildcard redirects.
7. Android already declares scheme/host/path and disables competing Flutter deep-link handling. Development application ID remains dev.salapiya.salapiya. A native Android OAuth client/signing fingerprint is only needed if a future reviewed assignment changes to native Google sign-in.
8. Windows needs protocol registration to the actual chosen development executable, or a later packaged protocol manifest. A temporary per-user registration uses `HKCU\Software\Classes\dev.salapiya.p0`, string **URL Protocol** = empty, and `shell\open\command` default = `"<absolute-executable-path>" "%1"`. No registry/installer registration was performed.
9. `initializeProofAuth` already configures PKCE, SecureSessionStorage, SecurePkceStorage and the exact callback predicate. `connectProofGoogle` invokes supported system-browser Supabase OAuth. The approved prototype still has no product login/activation flow; use a bounded test harness after provider configuration. Never send Google passwords, client secrets or refresh tokens through chat. Only confirmation that configuration is complete is needed to continue testing.
10. Exercise cancellation, wrong account, interrupted callbacks, expired/revoked sessions, restart, second-device retrieval and populated-local/existing-cloud decisions. Local data remains available if sync pauses. Synthetic callbacks cannot prove these outcomes.

Publishing/verification depends on actual scopes/audience/branding. Check [Google app states](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview) and [Supabase Google setup](https://supabase.com/docs/guides/auth/social-sign-in/auth-google), rather than assuming private distribution waives requirements.

### Environment values and safe locations

The supplied ignored `.env.local` is used only by server-side automation. Current product main.dart does not read it or initialize real auth/sync. Public client configuration and server credentials have separate consumers:

| Name/value | Purpose | Safe storage |
| --- | --- | --- |
| SALAPIYA_SUPABASE_URL | Actual API URL | External client JSON/environment; nonsecret |
| SALAPIYA_SUPABASE_PUBLISHABLE_KEY | Client identification only | External config; never substitute service-role key |
| SALAPIYA_POWERSYNC_URL | Actual JP endpoint | External client config; nonsecret |
| SALAPIYA_AUTH_REDIRECT_URI | Exact allowlisted callback above | External client config; nonsecret |
| SUPABASE_PROJECT_ID / SUPABASE_ACCESS_TOKEN / SUPABASE_DB_PASSWORD / PS_ADMIN_TOKEN | Verified development automation and independent-session tests | Existing ignored `.env.local`; never client defines/assets |
| Google OAuth secret | Provider broker secret | Google/Supabase dashboards/password manager |
| Replication password | Existing restricted PowerSync server login | External OS-user state and PowerSync server settings; tracked YAML uses environment reference |
| Session/refresh/PKCE values | Per-installation online identity | Implemented OS secure-storage adapters |
| Database/private-file keys | Independent random installation protection | OS secure storage; full creation/rotation/loss lifecycle still gated |
| Recovery secret | User-controlled portable archive access | Separate off-device password manager/copy; never beside real-use archive |

Future product builds may consume **public client values only** from external configuration. The current hosted test uses the consumed runtime fixture described above; no credential-bearing dart-define file or bundled asset exists. Do not put real tokens/database/recovery secrets in compile-time defines, CLI history, logs or chat. The retained older synthetic transfer fixture is explicitly test-only.

Remaining owner actions/decisions: Google Cloud project/consent/test users and broker client configuration, Windows protocol/installer approach, physical device inventory, retention/support limits and explicit budget if free-tier continuity is inadequate. Supabase SQL and PowerSync connection/streams need no manual setup now. No paid approval was needed or used for this continuation.

## Git and preservation

Prior implementation checkpoints: 37b94d5 (pins/probe), 1bc5bcb (money/storage), f1305e8 (receipts/queue), b9235c0 (enrollment/auth storage), 04e6419 (encrypted recovery), 1e6152d (explicit native durability), then 8e2f9cc (consolidated local proof). This continuation adds fd7ffd3 (scoped migrations/provider automation and hosted concurrency), ec300e5 (live native sync and receipt-aware recovery), followed by final evidence consolidation. Final branch HEAD is the reviewable state; this document avoids embedding its own self-referential SHA.

The branch is based on the verified architecture-proof HEAD, not main. No unrelated work, actual secret values, web migrations, paid activation or P1 implementation is committed. Unverified/blocked work above remains required despite successful bounded hosted tests.
