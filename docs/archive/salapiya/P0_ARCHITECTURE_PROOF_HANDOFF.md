# Salapiya P0 architecture proof handoff

> **Historical record:** preserved development evidence. Current summary: [Development history](../../DEVELOPMENT_HISTORY.md).

**Date:** October 24, 2026 (Asia/Manila)

**Branch:** `feat/salapiya-p0-google-gate-closure`

**Verified base:** `ff3ab4835ff560f902f7b9a477c60afa9031e4f6`, matching the remote hosted-integration branch at assignment start. Earlier architecture/local/D5 checkpoints are retained below.
**Decision:** **P1 may begin as a separately authorized development milestone on the tested Windows/Android targets.** G0–G4 have sufficient bounded architecture evidence; wider support/release/lifecycle acceptance remains explicit below. This assignment does not implement P1 or claim production acceptance.

This is the assignment's single completion report. The [blueprint](../../PRODUCT_AND_FEATURES.md#salapiya--product-revision-and-windowsandroid-migration-blueprint) and [approved D5 handoff](design/D5_PRODUCTION_HANDOFF.md) remain authoritative. Presentation, navigation and prototype controllers remain unchanged. Historical web source, tests, migrations and pnpm tooling remain executable and unmodified. This continuation modifies only the existing development resources with synthetic data. No production changes, destructive resets, paid activation, main merge or force push occurred.

## Implementation and source map

| Phase | Result |
| --- | --- |
| A: compatibility/cost | Exact stack pins, lockfile, native critical API probes, dated service quotas and explicit four-user model |
| B: money/SQLite | Exact Dart money port and shared golden fixtures, strict transactional evidence, migrations, integer extremes, rollback and actual process-kill recovery |
| C: commands/sync | Real SDK queue and Supabase RPC; independent hosted races, durable receipts/conflicts and private PowerSync streams; local simulation tests retained separately |
| D: identity | Real system-browser Google PKCE on both native targets, protected attempt/session storage, wrong-account protection, enrollment freeze/cancel and bounded publication/retrieval |
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

Initial ordinary deployment failed at operation `6adcb567501b259d0e4dfed7`; neither API nor the maintainer's dashboard inspection exposed a cause. A supported initial deploy using `--validate-only=configuration,connections` included the reviewed streams at first boot and succeeded. Full configuration, connection **and stream** validation then passed. This bootstrap's skipped stream validation is not counted as passing evidence. A subsequent real client exposed `PSYNC_S2105`: Cloud CLI ignores the self-hosted `audience` field. Configuration now uses explicit Supabase JWKS, `supabase: false` and Cloud `additional_audiences: [authenticated]`; a normal fully validated redeploy succeeded. No JWT secret or custom token signer was added. See the official [Supabase auth guide](https://docs.powersync.com/configuration/auth/supabase-auth) and the pinned Cloud CLI schema.

`auth_runtime.dart` initializes actual PKCE auth using OS-secured session/verifier adapters. `completePublication` verifies the entire bounded accepted snapshot and identity before atomically remapping local intent ownership/payload while retaining evidence IDs and amounts; repeated completion cannot regress reconciliation. `ConnectedRecovery.review` compares restored original IDs/payloads against the authenticated server receipt. Accepted/rejected/mismatched results remain held; a missing result queues only after explicit resume. Receipts never manufacture downloaded rows or grant group access.

### Google and foundational closure continuation

The maintainer's Google project/client/provider setup was verified through the existing management API and **actual Google authorization-code exchanges**, not password fixtures. `oauth_harness.dart` is a separate executable; product `main.dart`/approved UI remain unchanged. `GoogleAuthProof` wraps the maintained SDK with one protected, expiring pending attempt, exact native callback validation, owner binding, explicit cancellation and ignored late callbacks. Supabase owns OAuth state/PKCE exchange; no custom OAuth/token issuer exists. Google passwords, verification and consent were completed by the maintainer only. No Google client secret is distributed.

Native evidence includes two distinct Google identities, Windows protocol dispatch, Android browser/deep-link return, OS-secured session persistence through actual process restarts, staged enrollment interrupted by process termination, idempotent publication, existing-cloud collision/cancel with retained local records, separate retrieval, and wrong-account rejection without replacing the bound profile. Each profile uses a separate encrypted database/random OS-secured key; a missing key preserves the existing database rather than resetting it. Cancelled attempts clear the verifier, preserve local records/session, and ignore a late Windows callback. Real Google refresh-token revocation and subsequent failed refresh preserve the databases on both targets.

New reviewed migrations **004** (private capacity/current-membership/creator proof) and **005** (current-session RPC entry guards) were previewed and applied without resets. Existing financial RPC cores moved into the unexposed private schema; public signatures/financial behavior remain stable, authenticated direct execution of cores is revoked, and wrappers require a live `auth.sessions` row plus an active, nondeleted user. A valid but revoked session JWT can no longer submit, stage, publish or review restored financial commands. Existing owner RLS and the two-table PowerSync publication are preserved.

`gate-tests.mjs`: **7 hosted checks passed** using three independent sessions: a concurrent 8-of-10 capacity race accepts once, preserves the rejection receipt, creator/current-version checks deny owner override, removed membership defeats restored/replayed IDs, revoked sessions fail, exact bounds/evidence remain protected and group actions cannot mutate private ledgers. This follows web `groups.ts` current-membership locking/creator checks and the blueprint's capacity policy; it is a private synthetic proof, not a Shared Expenses implementation or new replicated group schema.

`hosted-tests.mjs`: **12 passed** after the authority changes, with real session claims in SQL concurrency cases, actual signed JWT/Data API negatives, and revoked-session checks on all four financial/enrollment/recovery RPCs. **9 local server tests** apply every tracked migration with explicit local auth-catalog stubs; **6 focused Flutter tests** cover attempt restart/expiry/cancel/late callbacks and retained enrollment/recovery contracts. These local auth stubs do not certify Google.

`runReliabilityProof` creates a real loopback HTTP **503** upload failure, preserves the SDK queue through encrypted close/reopen, then reconnects to the unchanged hosted service. An independently keyed portable restore holds commands until current-identity receipt review; actual PowerSync downloads plus matching receipts explicitly activate accepted restored intents. A missing command resumes under its original ID and an old-device replay has one server effect. A fresh encrypted replica verifies all accepted IDs and exact monetary totals. Windows: **2,220-byte archive / 3 rows / 1,280ms** initial-sync/recovery interval; Android: **2,202 bytes / 5 rows / 1,994ms**, each with one observed 503 request. These are bounded synthetic samples, not throughput guarantees or measurements of protocol bytes.

A focused test exposed an important cached-checkpoint distinction: `waitForFirstSync()` can describe an earlier completed sync after reopen. The harness now waits for every ID in an authenticated immutable server boundary before declaring complete retrieval. A rejected unsupported synthetic file ID was corrected; its durable pending action survived and was drained under the same ID before retry. Neither failed attempt is counted as a passing test. No slot/database/instance reset or provider outage was induced.

Final reauthentication passed against each profile's bound Google identity, preserving Windows' **3 intents / 3 accepted rows** and Android's **3 intents / 5 accepted rows**. Windows was closed after initiating OAuth; the registered browser callback cold-started it, recovered the protected pending verifier and completed a real code exchange (**startup count 8**). Android completed the same real reauthentication after refresh revocation (**startup count 4**). Both then passed current-session RPC, complete accepted-boundary download and private-owner checks with the final code. Several owner selections deliberately/accidentally used the other identity; guards rejected them without data changes. Masked account labels resolved chooser-order ambiguity; no password, OTP, authorization code or token was requested in chat.

Final checks: analyzer **no issues** (10.3s), targeted format and Git whitespace checks passed, linked database dry-run **up to date**. Known supplied/admin/generated secrets and the available Google provider secret were absent from **1,863 scanned source/log/artifact files**, including the Windows Dart kernel and decompressed normal APK; `.env.local` remains ignored/untracked. Normal Android debug build passed (**87.8s**) and `adb install -r` preserved data. Its first cold `am start -W` timed out; a subsequent check verified MainActivity was top-resumed and returned **Status ok** (113ms wait for the already running instance). This is restoration evidence, not a cold-start performance pass. No broad historical regression or new screenshot campaign was run.

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

Actually exercised: Windows 11 25H2 x64 build 26200.9711 and Android 17/API 37 x86_64 emulator, using the foundation toolchain. Current Flutter supports Android API 24–37; the secure-storage minimum alone does not determine this application's floor. Windows 10/ARM64, minimum Android API/ARM64 and physical devices remain untested. The maintainer's actual phone/OS inventory is still needed for G0/G6.

Environment corrections:
- Windows plugin generation initially lacked symlink privileges. NTFS directory junctions in ignored `windows/flutter/ephemeral/.plugin_symlinks/` allowed native builds without changing Windows security settings. A new environment needs Developer Mode or equivalent generated plugin-directory junctions from `.flutter-plugins-dependencies`.
- Android Kotlin incremental caches failed because Pub sources are on C: and this repository on E:. `android/gradle.properties` now disables Kotlin incremental compilation. Subsequent native tests pass. Gradle installed required API 35 and CMake 3.22.1 components; no existing SDK/AVD was replaced.
- Android Auto Backup is disabled to avoid restoring credentials without OS keys. Internet permission supports connected operation; local use needs no sign-in.
- Docker's engine was unavailable. **Automatic approval review rejected starting Docker Desktop.** The safe alternative is PGlite, not bypassing that rejection. PGlite does not substitute for Supabase or independent-session race tests.
- Early compatibility failures revealed failed-open cleanup propagation and missing PKCE async storage; both were fixed in the probe. JDK native-access and Node TypeScript module-detection warnings remain nonfatal.
- The original workspace's release build hit LNK1104 because the maintainer's existing Release executable was running. It was left open. Product release verification uses an isolated detached worktree at implementation commit `1e6152d`, so it does not replace or terminate that running prototype.

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

**Scope boundary:** complete debt/card/file graphs and account-opening workflows belong to their feature milestones. P0 proves atomic bounded graph publication, stable IDs, interruption/repetition, current identity and explicit non-destructive collision/retrieval choices. It does not certify every future graph or opening-record implementation. Hosted SQL subjects now also carry real active fixture sessions; real Google evidence comes from the separate native harness.

Secure session and PKCE adapters replace preference storage. Actual Google sessions/verifiers use Windows Credential Manager backed protection and Android keystore-backed storage. These protect at rest, not against a compromised logged-in OS. Real code exchange and refresh revocation are now verified. Financial RPCs recheck live sessions; **already issued access JWTs and an existing PowerSync stream are not globally revoked instantly**. Stateless read/stream access can persist until token expiry; downloaded data cannot be recalled. A naturally expired Google JWT, provider-wide revocation and full account-deletion recovery were not forced/tested. Preserve this distinction in P1 lifecycle UX; current group membership must gate future group streams/commands independently.

Portable archives and private files use cryptography's AES-256-GCM with fresh nonces and authenticated version headers. The encrypted archive manifest records schema/command/calculation versions, UTC creation time, record/file counts and SHA-256 file checksums. Exact paired evidence and owner consistency are validated.

A separate library-generated random **256-bit recovery secret** permits restoration without the source device/database key. It is not a short PIN or human password; no custom cryptography/KDF exists. Retain the archive and secret separately off-device.

Bounds: 100 synthetic expenses, 10 supplied files, 1 MiB/file, 4 MiB plaintext archive. No paths, arbitrary fields or reusable tokens are permitted. This is not a backup of all approved domains/group history. Files return in memory for safe staging rather than silently becoming plaintext files.

Connected commands retain original IDs but restore held in review with **no upload entries**. Current-session receipt review permits explicit same-ID release of a missing command. `acceptDownloaded` requires both an accepted current-owner receipt and the matching actual downloaded action before activation. Rejected/mismatched results remain held. Full product archive/file activation, production key rotation and complete account-deletion lifecycle remain feature/release work. A backup grants no group authority or cloud rollback permission.

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
| Prior hosted-continuation analysis/credential checks | Analyzer **no issues** (8.0s); format/diff checks passed; known supplied/admin/generated secrets absent from **1,841 scanned files**, including Windows Dart kernel and decompressed normal APK; `.env.local` ignored/untracked |
| Google OAuth | **Actual code exchange and secured sessions verified** on Windows and Android; distinct Google account isolation and current milestone details above |

Portable evidence: the actual Windows-created encrypted archive was **1,339 bytes**, containing two intents, four evidence rows and one file. It restored with an independently encrypted target database on both native platforms. The ignored `build/p0-transfer.json` contains only synthetic test material; its compile-time test secret is not a real credential-storage pattern. Archive size is not measured hosted wire traffic.

Local disposable logs are under ignored `apps/salapiya/build/p0-*.log`; committed test code is the reproducible evidence. PGlite executes real PostgreSQL in WASM but serializes transactions. Its auth.uid() stub sets a transaction-local subject and verifies no JWT. `hosted-tests.mjs` supplies independent hosted races and actual signed JWT/RLS checks; `p0_hosted_test.dart` supplies native hosted auth/RPC/download checks. No local injected row is counted as hosted replication.

The earlier hosted password-fixture scenario exercises real Supabase session exchange, bounded enrollment/publication or preserved-local collision, committed RPC retry after encrypted close/reopen, stale rejection while unrelated work proceeds, owner API isolation, encrypted archive restore into another database, accepted/rejected/missing receipt review and explicit original-ID resume. Actual PowerSync streams then download matching accepted rows, reconcile without double counting, preserve cached history plus offline intent through reopen, upload automatically on reconnect, and exclude foreign owners in **two independently authenticated databases**, even with forged owner parameters. Android additionally downloads the preceding Windows command. Other-session sign-out is followed by a real rejected refresh attempt. That earlier scenario checked Google URL generation only; actual Google evidence is supplied by the new separate native harness.

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

Latest snapshot at **2026-10-24 15:18:54 UTC / 23:18:54 Manila**, after Google/recovery/gate tests: database **11,916,979 bytes**, proof tables including indexes **516,096 bytes**, **45 accepted synthetic actions / 73 expense receipts**. PowerSync initial replication was complete, source connected, stream/table error counts zero, reported lag **56 bytes**; its active slot had reserved WAL status and **56 bytes** retained at that instant. This includes the new private gate tables and retained synthetic fixtures. It is a tiny point-in-time sample, not four-user capacity/traffic evidence. `inspect-health.mjs` reproduces the measurement. Monthly PowerSync wire/storage billing usage is not exposed by that diagnostics endpoint and still needs the provider Usage dashboard.

Pauses/deactivation require manual reactivation and a real drill for slot health, refresh/reauthentication, complete resync and receipt reconciliation. Preserve offline writes throughout. Inspect retained WAL/slots and disk during outages; see [PowerSync Supabase operations](https://docs.powersync.com/integrations/supabase/guide). Monthly traffic, retention growth and inactivity recovery remain unmeasured; no slot was removed/reset.

If always-on paid continuity is needed, current listed starting plans are approximately Supabase $25/month and PowerSync $49/month, before extras/tax. No upgrade/production instance/card/budget commitment was activated. Approval of a specific budget is required before paid changes.

## Gate decision and P1 readiness

| Gate | Classification | Remaining condition |
| --- | --- | --- |
| G0 | **Sufficient for P1 on tested development targets** | Critical pinned plugins, encryption/auth/sync and callbacks exercised on Windows 11 x64 / Android API 37 x64 emulator. This is the validated development envelope; physical/minimum-OS/ARM64 inventory and packaged protocol registration remain G5/G6 acceptance. |
| G1 | **Bounded architecture proof passed** | Durable atomic queue, committed response-loss replay, rejection isolation, actual accepted-boundary handoff, 503/restart/reconnect and fresh full resync verified. No destructive slot/checkpoint-reset or actual provider suspension is claimed. |
| G2 | **Bounded architecture proof passed** | Two actual Google identities; native callbacks/cold start, protected PKCE/session restart, cancellation/late callbacks, wrong-account rejection, real refresh revocation/reauthentication, atomic repeated/interrupted enrollment and explicit preserved-local/cloud choice verified. Natural JWT expiry/provider-wide revocation remain explicit limitations. |
| G3 | **Bounded architecture proof passed** | Canonical web/native money fixtures, exact SQL/SQLite boundaries, independent idempotency/revision/capacity races, current membership/creator authority and private/group separation verified. Each future financial command still needs its domain-specific acceptance. |
| G4 | **Bounded architecture proof passed** | Native encrypted DB/files/credentials, cross-target independently keyed archive restoration, held replay, current-session receipt plus actual-download activation and revoked-authority negatives verified. Complete product archive/key rotation/deletion policies remain P1–P6/G8 implementation and pre-pilot acceptance. |
| Early G7 | **Partial; sufficient for existing-resource P1 development** | Actual DB/slot health and small fresh-resync latency/coverage sampled; current quota model supports continued bounded development without paid activation. Monthly wire/billing data, production-sized history/files and week-long inactivity/reactivation remain operational acceptance. |

“Bounded architecture proof passed” certifies the exercised mechanism, not every product module or launch readiness. G0 has a restricted tested envelope; G7 remains partial. G5 distribution/upgrades, G6 physical/accessibility/capacity performance and G8 files/lifecycle/retention are not closed.

**Recommended next milestone: P1 local foundation and everyday Money, only after owner authorization.** Preserve the approved UI and local-first startup; build exact accounts/openings/basic entries/history/corrections with the established atomic intent/evidence and receipt/download contracts. Keep scoped encrypted key creation/loss handling, explicit profile choice and versioned backup compatibility in that work. Require targeted acceptance per command and validate Windows/Android together. Do not activate cloud/group/file lifecycle merely because P0 passed.

P1–P6 legitimately own full debts/cards/planning/Shared Expenses graphs, account-opening/cutoff rules, complete archive/file activation and feature-specific capacity/correction/recipient/history-entitlement fixtures. The 10-minor-unit capacity/creator proof shows the serialization/authority mechanism; it does not substitute for those semantics. P0's stable synthetic enrollment source proves no duplicate publication effect, not a completed product opening-balance module. Natural access-token expiry, provider-wide revoke/account deletion, production key rotation, physical devices/installers and realistic storage/traffic/inactivity drills remain named pre-pilot/release acceptance. No current unresolved architecture failure prevents bounded P1 development; none of those remaining scenarios is marked executed.

## Provider configuration, reproduction and credentials

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

`configure-auth.mjs` merges the exact native callback into Supabase's existing allowlist without changing the Google provider or Site URL. Google is now enabled through the maintainer's provider configuration. `configure-replication.mjs` resumes the existing restricted role/publication, refuses an existing role without its stored original password, and writes only environment references into tracked service YAML. Do not rotate/delete that role or slot as a troubleshooting shortcut.

`hosted-tests.mjs` is append-only: it retains synthetic test actions/receipts. Four reusable confirmed `example.test` fixture users remain; each hosted concurrency run now adds two real Auth fixture users/sessions for fresh enrollment races. No email is sent and signup policy was not relaxed. The two maintainer-operated Google identities are separate; no fixture session is counted as Google evidence.

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

### Google proof configuration and reproduction

Google Cloud `salapiya-dev` is External/Testing with two selected test accounts. The **Web application** client is `Salapiya Supabase Development`; its Google redirect is `https://uxnyxhwqshqpvinvopiv.supabase.co/auth/v1/callback`. Supabase Google is enabled, and the exact native allowlist remains `dev.salapiya.p0://auth/callback`. The maintainer entered the client secret in Supabase; no Google credentials were added to `.env.local` or Flutter. Only openid/email/profile are needed. Google setup is complete for this bounded development test; production publishing/verification remains a separate release decision. See [Supabase Google](https://supabase.com/docs/guides/auth/social-sign-in/auth-google) and [Google app states](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview).

```powershell
cd services/salapiya/p0
node prepare-google.mjs windows
cd ../../../apps/salapiya
$configPath = Join-Path $env:LOCALAPPDATA 'Salapiya/p0/hosted/google/windows/config.json'
flutter run -d windows -t lib/p0/oauth_harness.dart --no-pub "--dart-define=P0_GOOGLE_CONFIG_PATH=$configPath"
# In another repository-root terminal, only for this isolated Debug harness:
./scripts/salapiya/p0-protocol.ps1
```

For Android, set `SALAPIYA_ANDROID_DEVICE` and `SALAPIYA_ADB` as in the hosted runbook, run `node prepare-google.mjs android`, then `flutter run -d <actual-emulator-id> -t lib/p0/oauth_harness.dart --no-pub`. Chrome's first-run/device-account setup needed owner interaction before the initial Android OAuth callback could complete; this was not treated as authentication success.

The harness has explicit Google/cancel/publication/retrieval/sign-out actions. `google-control.mjs <windows|android> <action>` supplies the same bounded actions through an OS-user/app-private command file; `status` emits booleans/counts and an opaque owner fingerprint, never email, codes, verifier or tokens. `stage` stops before publication for interruption checks, `proof` verifies current identity/enrollment/complete accepted download, `reliability` runs the 503/recovery proof, `revoke_probe` verifies rejected real refresh, and `new_profile` explicitly preserves the old encrypted profile while selecting a separate one. Public config files persist for cold-start reproduction; only their paths enter Windows build defines.

`inspect-google-identities.mjs` is an optional masked account-label aid for the two configured development identities; it does not emit full emails or credentials. Current native proof sessions were explicitly signed out after final verification. The per-user Debug protocol mapping was removed after the successful cold callback, without changing any unrelated registration or the running Release app. Encrypted synthetic proof databases/keys remain available locally for inspection; production sessions/data were not removed.

Windows protocol registration is per-user and points to the exact built Debug executable; the script refuses an unrelated existing mapping. `./scripts/salapiya/p0-protocol.ps1 -Remove` removes only that exact development mapping. Installed/production protocol registration remains G5 work. Android uses the existing reviewed manifest/app_links path. Native process restarts target only the test Debug executable/application; the maintainer's running Windows Release prototype is never terminated.

OAuth evidence and local proof databases remain outside Git under the OS-user/app-private proof directories, with key/profile/session material in scoped secure storage. No real financial data was used. Callback URIs/Google profile details are not written to status/logs or archives. Reproduction requires the maintainer to select accounts/consent; never substitute password fixtures or pass a real OAuth code through chat/CLI. Cancellation intentionally invalidates the pending attempt, so old browser tabs must be ignored.

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

Remaining maintainer actions/decisions: authorize the next P1 assignment, supply physical-device/minimum-OS inventory before wider support claims, choose packaged protocol/installer and retention/support policies before distribution, and explicitly approve a budget if free-tier continuity proves inadequate. Google/Supabase/PowerSync need no further setup for the tested development proof. Do not send Google credentials through chat. No paid approval was needed or used here.

## Git and preservation

Prior implementation checkpoints: 37b94d5 (pins/probe), 1bc5bcb (money/storage), f1305e8 (receipts/queue), b9235c0 (enrollment/auth storage), 04e6419 (encrypted recovery), 1e6152d (explicit native durability), then 8e2f9cc (consolidated local proof). This continuation adds fd7ffd3 (scoped migrations/provider automation and hosted concurrency), ec300e5 (live native sync and receipt-aware recovery), followed by final evidence consolidation. Final branch HEAD is the reviewable state; this document avoids embedding its own self-referential SHA.

Google/gate-closure checkpoints: **e6619d2** (live-session guards and hosted capacity/current-authority proof), **4099e86** (guarded native Google harness and connected restore activation), followed by final evidence/cleanup consolidation. The base was verified against the hosted-integration remote; this branch is pushed separately without merging into main. P1 is recommended, not automatically started.

The branch is based on verified hosted-integration HEAD `ff3ab48`, not main. No unrelated work, actual secret values, web migrations, paid activation or P1 implementation is committed. The remaining unexecuted acceptance above is still required despite sufficient bounded P0 evidence to begin P1 development.
