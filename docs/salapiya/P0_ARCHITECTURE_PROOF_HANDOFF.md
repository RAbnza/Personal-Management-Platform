# Salapiya P0 architecture proof handoff

**Date:** October 24, 2026 (Asia/Manila)

**Branch:** `feat/salapiya-p0-architecture-proof`

**Verified base:** `4cd03faf72f1242b6018ac64c7de3df0c1387d3c`, matching the latest remote D5 branch at assignment start.
**Decision:** bounded local proofs completed; hosted acceptance blocked. **Substantial P1 must not begin yet.**

This is the assignment's single completion report. The [blueprint](../SALAPIYA_PRODUCT_AND_PLATFORM_BLUEPRINT.md) and [approved D5 handoff](design/D5_PRODUCTION_HANDOFF.md) remain authoritative. All six phases were addressed sequentially through implementation checkpoints and consolidation. Presentation, navigation and prototype controllers remain unchanged. Historical web source, tests, migrations and pnpm tooling remain executable and unmodified. No real cloud configuration, personal data, paid service, main merge or force push was performed.

## Implementation and source map

| Phase | Result |
| --- | --- |
| A: compatibility/cost | Exact stack pins, lockfile, native critical API probes, dated service quotas and explicit four-user model |
| B: money/SQLite | Exact Dart money port and shared golden fixtures, strict transactional evidence, migrations, integer extremes, rollback and actual process-kill recovery |
| C: commands/sync | Real PowerSync insert-only queue, durable pending/review state, narrow Supabase connector, PostgreSQL acceptance/receipts, simulated network/download fault tests |
| D: identity | Secure session/PKCE adapters, native callback transport, durable local enrollment freeze/cancel, private SQL staging and atomic synthetic publication |
| E: protection/recovery | Library AES-GCM database/file/archive approaches, independent recovery secret, staged restore, corruption/tamper tests and actual Windows-to-Android archive transfer |
| F: consolidation | Evidence-based gate assessment, configuration runbook, blockers and P1 decision below |

Native modules are under `apps/salapiya/lib/p0/`; none is wired into product `main.dart`. Tests are `test/p0_*_test.dart`, `integration_test/p0_architecture_test.dart`, `p0_callback_test.dart` and `p0_portability_test.dart`. The process-kill worker is `tool/p0_crash_worker.dart`. `tool/p0_make_transfer.dart` writes only a synthetic fixture into ignored `build/`.

Server SQL, stream configuration and executable tests are under `services/salapiya/p0/`. Shared golden data is `contracts/salapiya/p0_money.json`. Reuse traced `src/shared/money.ts`, its tests, sharing allocation code/tests, web command canonicalization/receipt code and `tests/integration/financial-command-receipt.test.ts`. The original TypeScript money functions actually execute against the same fixture used by Dart. Web backup framing informed authenticated metadata and independent-key recovery; its server dump format was not mechanically copied.

This remains a bounded synthetic expense proof, not a full ledger, group system, generic sync engine or P1 feature implementation.

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

A receipt alone does not remove pending effects. Matching accepted ID, owner, canonical payload and amount suppress the overlay even before explicit reconciliation. Client tests deliberately inject a local accepted row to simulate a download and remove that injection's upload entry. That is **not** real CDC/checkpoint evidence.

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

SQL staging is private and unpublished. Publication creates one profile and all synthetic actions/evidence/receipts in one transaction. Repeated publication is idempotent; competing staged claims collide safely in the serialized test runtime. Retrieval is owner-scoped, never by name/email.

**Outstanding:** complete financial graph enrollment/openings/debt/card/files, activation after complete initial sync, populated-local/existing-cloud switch, true simultaneous independent-session claims and actual Google cancellation/wrong-account/expiry/revocation/second-device identity. Placeholder claims do not certify authentication.

Secure session and PKCE adapters replace preference storage. Native tests exercise synthetic credential/session/verifier operations. Windows uses the plugin's Credential Manager backed protection; Android uses supported keystore-backed storage. These protect at rest, not against a compromised logged-in OS. Native callback delivery and PKCE URL generation do not prove provider token exchange.

Portable archives and private files use cryptography's AES-256-GCM with fresh nonces and authenticated version headers. The encrypted archive manifest records schema/command/calculation versions, UTC creation time, record/file counts and SHA-256 file checksums. Exact paired evidence and owner consistency are validated.

A separate library-generated random **256-bit recovery secret** permits restoration without the source device/database key. It is not a short PIN or human password; no custom cryptography/KDF exists. Retain the archive and secret separately off-device.

Bounds: 100 synthetic expenses, 10 supplied files, 1 MiB/file, 4 MiB plaintext archive. No paths, arbitrary fields or reusable tokens are permitted. This is not a backup of all approved domains/group history. Files return in memory for safe staging rather than silently becoming plaintext files.

Connected commands retain original IDs but restore held in review with **no upload entries**. Later receipt comparison/release, complete accepted-history restoration, deleted/revoked account reconciliation, atomic profile/file activation and production key creation/rotation/loss remain unimplemented. A backup grants no group authority or cloud rollback permission.

## Actual evidence and reproduction

All evidence is local Windows/emulator work. No screenshots/videos, hosted tests or unrelated historical web campaign were run.

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
| Hosted Google/Supabase/PowerSync | **Not tested; blocked** by missing configuration/credentials |

Portable evidence: the actual Windows-created encrypted archive was **1,339 bytes**, containing two intents, four evidence rows and one file. It restored with an independently encrypted target database on both native platforms. The ignored `build/p0-transfer.json` contains only synthetic test material; its compile-time test secret is not a real credential-storage pattern. Archive size is not measured hosted wire traffic.

Local disposable logs are under ignored `apps/salapiya/build/p0-*.log`; committed test code is the reproducible evidence. PGlite executes real PostgreSQL in WASM but serializes transactions. Its auth.uid() stub sets a transaction-local subject and verifies no JWT. Real server races, CDC checkpoints, stream privacy and provider authentication remain unverified.

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

Pauses/deactivation require manual reactivation and a real drill for slot health, refresh/reauthentication, complete resync and receipt reconciliation. Preserve offline writes throughout. Inspect retained WAL/slots and disk during outages; see [PowerSync Supabase operations](https://docs.powersync.com/integrations/supabase/guide). No hosted storage/traffic/retention or inactivity recovery was measured.

If always-on paid continuity is needed, current listed starting plans are approximately Supabase $25/month and PowerSync $49/month, before extras/tax. No upgrade/production instance/card/budget commitment was activated. Owner approval of a specific budget is required before paid changes.

## Gate decision and P1 readiness

| Gate | Classification | Remaining condition |
| --- | --- | --- |
| G0 | **Partially verified** | Native stack works on tested targets; owner physical/minimum OS/CPU inventory and installer callback registration open |
| G1 | **Partially verified** | Actual SDK queue/local faults pass; real two-device CDC/checkpoint loss, private-stream negatives and interrupted service recovery **blocked** |
| G2 | **Partially verified** | Local freeze/collision and SQL staging pass; Google/full graph activation and independently concurrent claims **blocked** |
| G3 | **Partially verified** | Exact fixtures/storage/crash and bounded SQL pass; advanced domain parity, concurrent capacity conflicts and group authorization **not tested** |
| G4 | **Partially verified** | Encrypted DB/files/credentials and cross-target recovery pass; complete archive, key lifecycle, revoked/deleted identity and connected restore activation **not tested** |
| Early G7 | **Partially verified** | Official quotas/model reviewed; measured cloud usage and inactivity/reactivation **not tested** |

No foundational gate is marked Passed. G5 signing/upgrades/distribution, G6 physical/accessibility/performance and G8 full files/lifecycle/retention remain later work. No new acceptance is implied.

**P1 must wait.** Recommended next assignment: configure the development providers below, then prove real Google-authenticated Windows/Android enrollment and private PowerSync replication against this synthetic schema. Add independent PostgreSQL-session races, receipt/checkpoint loss, wrong-owner streams and connected recovery review. Close remaining full-graph/financial parity/key-lifecycle requirements before substantial P1. Do not begin P2–P6.

## Exact manual setup and credentials

### Supabase development proof schema

1. Open existing **salapiya-dev**, verify its project reference and that the target is development/synthetic.
2. Review and apply `services/salapiya/p0/001_proof.sql`, then `002_enrollment.sql` once, in **SQL Editor**. They create a fresh bounded proof schema, not repeatable production migrations. Never replay web migrations or create arbitrary demo tables.
3. Verify RLS and SELECT-only authenticated grants on public.p0_profile/public.p0_accepted. Writes use the three explicitly granted RPCs. Keep salapiya_p0 out of exposed Data API schemas.
4. Copy actual **Project URL** and **publishable client key** from Connect/API settings to external client configuration. Never use a service-role/secret/database key in Flutter.
5. Do not install the PGlite auth.uid() stub; Supabase already supplies it. Actual signed-in JWT/RLS/RPC checks still need a hosted test session.
6. Before production, review auth-user deletion/revocation, rate limits, all financial graph rules and group permissions. This proof supplies no complete production lifecycle policy.

### PowerSync existing JP development instance

Use the [Supabase integration guide](https://docs.powersync.com/integrations/supabase/guide), [JWT guide](https://docs.powersync.com/configuration/auth/supabase-auth) and [Sync Streams reference](https://docs.powersync.com/sync/streams/quickstart).

1. Create a dedicated PostgreSQL replication login through Supabase SQL Editor, with a new random password stored in your password manager. The official role pattern uses REPLICATION BYPASSRLS LOGIN. This privileged credential belongs only to the server connection/dashboard.
2. Grant only public schema usage and SELECT on p0_profile/p0_accepted. Create publication **powersync** for these two tables only. Inspect any existing publication first; do not use FOR ALL TABLES or grants on every future table.
3. In PowerSync **salapiya-dev → JP development instance → Database Connections**, add the actual Supabase connection using that login, TLS and a supported replication-compatible direct/session endpoint. Copy actual host/database/port from Supabase Connect; do not use transaction pooling.
4. Verify the connection/publication. In **Client Auth**, enable **Use Supabase Auth**. Inspect Supabase **Project Settings → JWT** first. For asymmetric signing keys leave the legacy secret empty, verify detected project/issuer, audience authenticated and JWKS `https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json`. Follow official legacy instructions only if actually required, never exposing that secret to Flutter.
5. In **Sync Streams**, paste `services/salapiya/p0/sync-streams.yaml` and **Deploy**. It uses edition 3 and signed auth.user_id(); no client-controlled owner or global private stream. Resolve validation errors before connection.
6. Copy the actual PowerSync endpoint into external config. Keep the existing development instance; no Production/paid activation is needed.
7. Use two real devices/sessions for one owner and another unrelated owner. Prove distinct offline commands converge once, forged stream parameters cannot disclose another owner, expired/revoked identity blocks new remote access, and queue receipt acknowledgement differs from download checkpoint completion.
8. Monitor lag/disk/retained WAL. Remove unused slots only after identifying their associated instance. No slot cleanup was performed here.

For a new dedicated login/publication, the reviewed SQL shape is below. Replace
the password only inside your development provider setup; never commit it. If
the role or publication already exists, inspect it instead of rerunning CREATE.

```sql
CREATE ROLE salapiya_p0_replication WITH REPLICATION BYPASSRLS LOGIN
  PASSWORD '<new-random-password-from-your-password-manager>';
GRANT USAGE ON SCHEMA public TO salapiya_p0_replication;
GRANT SELECT ON public.p0_profile, public.p0_accepted TO salapiya_p0_replication;
CREATE PUBLICATION powersync FOR TABLE public.p0_profile, public.p0_accepted;
```

### Google browser PKCE via Supabase

The selected path is system-browser Supabase OAuth on both targets, without a separate native Google sign-in plugin.

1. In **Google Cloud → Google Auth Platform**, select/create the intended project; configure **Branding** and support/contact details.
2. In **Audience**, choose External for personal Google accounts and add actual development test users. Internal applies only inside a managed Workspace organization.
3. In **Data Access**, request only openid, email and profile; no Gmail/Drive/Calendar.
4. In **Clients**, create a **Web application OAuth client** for the Supabase broker. Add the exact redirect `https://<project-ref>.supabase.co/auth/v1/callback`, copied from Supabase. The native scheme is not Google's redirect URI.
5. In **Supabase → Authentication → Sign In / Providers → Google**, enable Google with that client ID/secret. Store the secret only in provider dashboards/password manager.
6. In **Authentication → URL Configuration → Redirect URLs**, allow exactly `dev.salapiya.p0://auth/callback` for development. Use a legitimate Site URL for a fallback you actually control; no invented domain/broad wildcard redirects.
7. Android already declares scheme/host/path and disables competing Flutter deep-link handling. Development application ID remains dev.salapiya.salapiya. A native Android OAuth client/signing fingerprint is only needed if a future reviewed assignment changes to native Google sign-in.
8. Windows needs protocol registration to the actual chosen development executable, or a later packaged protocol manifest. A temporary per-user registration uses `HKCU\Software\Classes\dev.salapiya.p0`, string **URL Protocol** = empty, and `shell\open\command` default = `"<absolute-executable-path>" "%1"`. No registry/installer registration was performed.
9. Initialize the hosted proof using PKCE, SecureSessionStorage, SecurePkceStorage and the exact callback predicate before launching Google. Adapters exist; the approved prototype does not yet contain a real login/activation flow.
10. Exercise cancellation, wrong account, interrupted callbacks, expired/revoked sessions, restart, second-device retrieval and populated-local/existing-cloud decisions. Local data remains available if sync pauses. Synthetic callbacks cannot prove these outcomes.

Publishing/verification depends on actual scopes/audience/branding. Check [Google app states](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview) and [Supabase Google setup](https://supabase.com/docs/guides/auth/social-sign-in/auth-google), rather than assuming private distribution waives requirements.

### Environment values and safe locations

No real credentials file was created. These names are the next hosted proof's configuration contract; current product main.dart does not automatically read them.

| Name/value | Purpose | Safe storage |
| --- | --- | --- |
| SALAPIYA_SUPABASE_URL | Actual API URL | External client JSON/environment; nonsecret |
| SALAPIYA_SUPABASE_PUBLISHABLE_KEY | Client identification only | External config; never substitute service-role key |
| SALAPIYA_POWERSYNC_URL | Actual JP endpoint | External client config; nonsecret |
| SALAPIYA_AUTH_REDIRECT_URI | Exact allowlisted callback above | External client config; nonsecret |
| SALAPIYA_P0_DATABASE_URL | Future independent-session SQL tests | Server-only environment/password manager/external ignored config |
| Google OAuth secret | Provider broker secret | Google/Supabase dashboards/password manager |
| Replication password | PowerSync server login | Password manager/PowerSync connection settings |
| Session/refresh/PKCE values | Per-installation online identity | Implemented OS secure-storage adapters |
| Database/private-file keys | Independent random installation protection | OS secure storage; full creation/rotation/loss lifecycle still gated |
| Recovery secret | User-controlled portable archive access | Separate off-device password manager/copy; never beside real-use archive |

Suggested client file: `%LOCALAPPDATA%\Salapiya\p0\client.json`, outside Git. Future builds may consume **public client values only** from dart-define files. Do not put real tokens/database/recovery secrets in compile-time defines, CLI history, logs or chat. The synthetic transfer fixture is explicitly test-only.

Remaining owner actions/decisions: provider setup/test users, Windows protocol/installer approach, physical device inventory, retention/support limits and explicit budget if free-tier continuity is inadequate. No paid approval is needed for independent local proof work already completed.

## Git and preservation

Implementation checkpoints: 37b94d5 (pins/probe), 1bc5bcb (money/storage), f1305e8 (receipts/queue), b9235c0 (enrollment/auth storage), 04e6419 (encrypted recovery), 1e6152d (explicit native durability), followed by final evidence consolidation. Final branch HEAD is the reviewable state; this document avoids embedding its own self-referential SHA.

The branch was based on verified latest D5, not main. No unrelated work, real credentials, web migrations, paid activation or P1 implementation was committed. Unverified/blocked work above remains required despite successful local tests.
