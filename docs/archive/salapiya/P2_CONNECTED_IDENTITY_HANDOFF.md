# P2 — Connected identity, private synchronization and recovery

> **Historical record:** preserved development evidence. Current summary: [Development history](../../DEVELOPMENT_HISTORY.md).

Date: October 25, 2026 (Asia/Manila).
Branch: `feat/salapiya-p2-connected-private-sync`.
Verified P1 base: `beb5ba3f106173efe265831dadc7dbc5711126a5`, on the requested
`feat/salapiya-p1-local-foundation` branch before creating P2.

**P2 engineering acceptance: complete for the Windows and Android emulator targets
and the bounded P1 Money scope verified below.**
This is the single P2 milestone report. The [blueprint](../../PRODUCT_AND_FEATURES.md#salapiya--product-revision-and-windowsandroid-migration-blueprint),
[P0 handoff](P0_ARCHITECTURE_PROOF_HANDOFF.md), [P1 handoff](P1_LOCAL_FOUNDATION_HANDOFF.md),
[D5 handoff](design/D5_PRODUCTION_HANDOFF.md) and [screen inventory](../../DESIGN_SYSTEM.md#screen-state-and-synthetic-scenario-inventory)
informed the work. Historical web code, tests, pnpm tooling and migrations remain
unchanged. No P3–P6 implementation, new provider project, paid activation, main merge,
force push, database/replication reset or identity-account deletion occurred.

## 1. Production identity and onboarding

The ordinary `lib/main.dart` / `SalapiyaApp(production: true)` composition now has
functional local, Google and archive paths. Tests use isolated encrypted profile
directories/vault slots through that same composition; they do not activate or
replace the maintainer's default P1 profile. No P0 harness controls appear in the product.

- Local profile creation/startup still requires no cloud configuration, Google,
  anonymous registration or network. Opening protected local records precedes
  optional online work; provider failure does not reset storage.
- **Continue with Google** can retrieve the server-owned profile directly. If
  none exists, explicit confirmation creates the connected cloud profile before
  protected device retrieval; no disposable local financial profile is required.
- **Connect an existing profile** displays the selected Google identity and the
  private-data/service-administrator disclosure. Authentication alone uploads no
  financial profile. Confirmation freezes the consistent local graph and starts
  durable enrollment/publication/download reconciliation.
- A different populated cloud profile produces a collision review. Cancel keeps
  local records. Switching requires a successfully exported encrypted archive and
  a separate confirmation. The prior encrypted database remains at its original
  path, and its activation descriptor/key is retained inside OS secure storage.
  This is a one-time reviewed activation path, not a routine profile switcher.
- Bound profiles require the same authenticated Supabase/Google identity during
  reauthentication. Display names/emails never confer ownership.

[connected_runtime.dart](../../../apps/salapiya/lib/connected/connected_runtime.dart)
and [connection_view.dart](../../../apps/salapiya/lib/connected/connection_view.dart)
reuse P0's maintained Supabase system-browser PKCE flow, exact callback predicate,
secure session/verifier storage and expiring attempt lifecycle. Cancellation clears
the verifier; late or expired attempts cannot exchange codes. An additional test
covers expiry while the application remains running. No custom OAuth exchange,
Google client secret, token issuer or token logging was introduced.

Android retains the approved deep link `dev.salapiya.p0://auth/callback`.
Windows development registration reuses `scripts/salapiya/p0-protocol.ps1`, which
accepts only its exact per-user Debug executable mapping. It now points to the
configured development product executable after final product builds. The provider
broker callback, existing allowlist, OAuth projects/test accounts and JP PowerSync
instance were preserved. Packaged/signed installer registration remains P6 work.

## 2. Local migration and preservation

[local_store.dart](../../../apps/salapiya/lib/local/local_store.dart) upgrades the P1
SQLite schema from version 1 to 2 transactionally. Existing profile/account/category,
command, revision, posting, seal and draft tables, IDs, preferences and encryption
keys are preserved. The `local-v1/` directory and original protected activation
descriptor/vault slot remain in use. Older P1 applications reject schema 2 instead
of silently writing a connected database as local-only.

The separately versioned connection metadata schema is version 2. Its upgrades add
the frozen enrollment name and a monotonic preview generation, retaining existing
intents. Tests inject interrupted upgrades and verify rollback, unchanged commands
and successful retry. Unsupported versions stop without key replacement or reset.

P1's ledger is the accepted local projection. Connected pending intents are stored
alongside it, not falsely sealed as server-accepted postings. Downloaded complete
commands are materialized through the existing pure Dart planner and immutable P1
writer. SDK projection views and insert-only command transport are the only new
PowerSync tables; local financial tables are never uploaded as arbitrary row writes.

## 3. Remote financial authority

Six additive migrations, `20261025000100` through `20261025000600`, reside in
`services/salapiya/p0/supabase/migrations/`. They were previewed and applied using
the pinned official Supabase CLI against the verified existing `salapiya-dev`
project `uxnyxhwqshqpvinvopiv`. The final linked dry-run reports up to date.

| Boundary | Implementation |
| --- | --- |
| Replicated private projection | Read-only `public.p2_profile` and immutable `public.p2_command`, with independent owner RLS |
| Server-only evidence | `salapiya_p2.account`, `category`, `revision`, `posting`, `receipt`, `enrollment`, `enrollment_cancel` |
| Whole-command authority | `p2_submit_command`, current live-session/owner checks, owner serialization, stable receipt/payload matching and transactional effects |
| Enrollment/recovery | Stage, publish, cancel, profile-boundary and original-command receipt-review RPCs |

The server computes its own plans; it never accepts client-supplied posting plans.
It validates exact ranges, owner/profile/account/category/source IDs, current source
revisions, cutoffs, archived accounts, balanced per-date journals, refunds and
remaining portions, dependent evidence, reconciliation coverage and negative-balance
acknowledgement. Money uses PostgreSQL integer/numeric arithmetic and string JSON
boundaries. Balances derive from current immutable evidence, not editable balance rows.

Paired cash/classification/equity effects, revisions, accepted command and receipt
commit together. Receipt lookup precedes mutable financial validation, under current
session authority. A same-ID changed envelope/payload is rejected. Permanent
rejections retain immutable receipts; parameter/encoding errors retain local review
intent without an accepted effect. Unauthenticated clients cannot write ledger tables
or execute private cores. RLS is enforced independently of replication filtering.

The shared [P2 fixture](../../../contracts/salapiya/p2_finance.json) stores Dart-generated
canonical recipes, exact plans and balances. Both implementations assert those
stored expectations. Received plans must also match a fresh Dart replay before
projection. Canonical payload guards reject representations the native contract
cannot consume; Unicode and escaped metadata are covered.

## 4. PowerSync and accepted-state reconciliation

The existing `powersync` publication contains exactly `p0_profile`, `p0_accepted`,
`p2_profile` and `p2_command`. P0 compatibility streams remain intact. Only the two
reviewed P2 tables were added, with owner indexes and the restricted replication
role's SELECT grants. Receipts, staging/cancellation evidence, drafts, preferences,
keys, files and unrelated module tables are excluded. New edition-3 private streams
filter by signed `auth.user_id()` and expose no owner-selecting subscription parameter.

The official PowerSync deployment passed configuration, source-connection and stream
validation before application and completed successfully on the existing Free
Development instance. No slot reset, broad publication, additional instance or
administrative credential in Flutter was needed.

[connected_store.dart](../../../apps/salapiya/lib/connected/connected_store.dart)
requires the authenticated profile boundary, contiguous downloaded commands,
original ID/payload matches and compatible calculated plans. Projection and overlay
retirement share a SQLite transaction. A server receipt alone cannot retire pending
work. Download arriving before acknowledgement cannot double-count the action:
the overlay excludes any already materialized accepted ID. Cached `hasSynced` /
`waitForFirstSync()` alone is not accepted as current coverage proof.

Manual sync checks a current authenticated boundary and a live SDK connection.
The displayed successful-sync timestamp cannot advance from offline cache reads
or move backward when an older SDK checkpoint is observed.

## 5. Offline commands, versions and conflicts

[command_connector.dart](../../../apps/salapiya/lib/connected/command_connector.dart)
uses the real SDK durable insert-only queue. Each locally validated save atomically
persists frozen intent/envelope, pending representation and draft removal. Retries
keep the original ID and payload through process restart. Monetary facts are never
merged with last-write-wins. Permanent failures preserve inspectable original values
and leave unrelated queue entries able to progress.

Connected accounts, categories, income, expense/splits and completed transfers/fees
can be saved offline. Independent server creates do not reject simply because another
device advanced the profile revision. Actual account/source/dependency rules still apply.

Connected corrections, refunds, reversals, reconciliation, adjustments and archival
require a fresh online review with no waiting work, followed by server revalidation.
The UI explains that restriction. Local-only P1 capabilities remain available offline.
Stale previews use a durable monotonic generation; removing/rejecting an overlay
cannot accidentally reuse an older preview token. Incompatible pending overlays
remain reviewable and are excluded from calculated totals rather than force-merged.

Accepted and projected Overview totals are separate, read from one SQLite snapshot.
Pending Money views count local work once; the accepted total excludes it. Production
pending/review surfaces no longer inherit synthetic group or fixed demo-money values.

## 6. Enrollment, cancellation and retrieval recovery

A populated local profile freezes a complete, ordered, bounded command graph,
enrollment ID and name in one SQLite transaction before remote staging. The server
replays the graph inside one publication transaction. No partially valid profile is
visible; repeated publication returns the original result and opening balances/IDs.
Original local preferences and drafts are not published.

Cancellation uses the same server owner lock as staging/publication. An immutable
cancellation marker fences even a stage/publish request arriving late after restart.
If publication already won, cancellation reports published and local authority stays
bound. It does not roll back accepted money. Interrupted cancellation can be retried.
Cloud unavailability retains the safe enrollment freeze and drafts until its outcome
can be verified; it does not invent successful cancellation.

Second-device retrieval resolves the owner through authenticated authority, creates
independently protected storage, downloads and validates coverage, then enables complete
totals. Both devices need not be online together. Incomplete initial history is shown
explicitly; established cached records survive later service/session failures.

## 7. Connected archives and native UI

[local_profiles.dart](../../../apps/salapiya/lib/local/local_profiles.dart) retains
version-1 archive compatibility and adds version-2 connected manifests in the existing
authenticated library AES-256-GCM envelope. Archives include accepted recipes, original
pending/rejected intents, drafts and preferences. OS/database keys, OAuth credentials,
cloud authority, attachments and group permissions are excluded.

Restoration validates/replays accepted recipes into independently keyed staging
storage. Connected intents initially remain held. Current bound authentication,
receipt review and actual downloaded accepted state are required. Missing work needs
an explicit same-ID resume; accepted work is not reposted. If another device accepts
the work during review, its existing receipt is reconciled instead of creating a new
command. Published archives cannot recreate missing/deleted cloud history. A backup
from a genuinely unpublished enrollment retains its frozen graph and permits a
reviewed enrollment resume after current identity validation.

The approved Porcelain/Midnight, Geist, Windows navigation/action tray, Android
capsule and editor/review design remain intact. Existing first-run, Profile/Connection,
devices, backup, Money/history and Overview surfaces now expose real states:
saved on device, waiting, synchronizing, synced, needs review, session expired and
incomplete initial download. Counts, verified sync time and manual sync are real.
Pause, sign-out and ownership/deletion are differentiated. Device information describes
this installation; a remote device registry/revocation/deletion UI is not fabricated.
Foreground resume and the SDK's reconnection/backoff resume supported work.

Both 200% text/Midnight connection journeys pass after fixing the profile text-size
dropdown's narrow-width overflow. Broad visual redesign/animation work was not done.

## 8. Actual native and hosted evidence

Targets: the existing Windows 11 x64 build 26200.9711 environment and Android
API 37 x86_64 emulator (`Salapiya_Pixel_9_API_37`), Flutter 3.47.7 / Dart 3.13.5.
All financial records are synthetic. Existing default P1 data and OS keys were not
used as test fixtures. Android commands use `--no-uninstall` / preserving installation.

| Acceptance | Observed result |
| --- | --- |
| A03 real Google | Populated Android → fresh Windows: same profile `b85ade2c-250c-4432-b1bb-3e2f6acd92dd`, same two original financial revisions and exact 8,766 minor units. Authentication did not alone mark it synced. |
| A04 real collision/cancel | Google A owns that cloud profile; separate populated Windows profile `fe4e5702-5406-4017-be8b-1026a1268e6e` cancelled connection with owner, commands, drafts, preferences and counts unchanged. |
| Google B isolation | Different identity fingerprint and profile `407f857b-a324-47bc-bc6a-5e946d5f9bda`; its managed Google session provisioned/retrieved its own private profile. Signed Data API and actual SDK queries could not read A's records. |
| Fresh identity, no local/cloud profile | Both native targets passed the normal first-run connection/review/confirmation UI without creating a local profile first. Existing synthetic authenticated identities created profiles `63155325-d05a-4eb4-93f7-68ae4246b90b` (Windows) and `4b6d7931-340a-416c-9385-dfd68a3e0a39` (Android); each accepted its first account at exactly **100** minor units, pending **0**, **Synced**. This branch test does not certify OAuth; the separate real Google journeys do. |
| Wrong account / reauthentication | Both platforms rejected B when reconnecting bound A and preserved A's records. Android completed rejection → correct A reauthentication in one passing journey. Windows guard assertions passed; after a driver timing fix, a separate final A reconnect passed with live synchronization. |
| A05/A06 on real Google A | Windows saved 11 minor units offline and closed. Android independently saved/uploaded 22 while Windows was stopped. Windows reopened, converged, then discarded an actual accepted 44-unit income response and retried its original command. Both ended at **8,777**, the same **five revision IDs**, pending/review **0**, status **Synced**. |
| Full connected P1 Money | Windows and Android each passed 13 new account/category/split/transfer-fee/correction/refund/reversal/reconciliation/linked-adjustment/manual-adjustment/correction/archive commands, every one receipt-plus-download reconciled. Each new account pair ended at **89,000 / 19,925** minor units before subsequent independent recovery activity. |
| Cross-device full fixture | After Android's additions and both controlled outage recoveries, Windows reopened and matched all **61 accepted commands**, six account balances and no pending/review work. Exact table below. |
| A15 service failure | Windows and Android each observed three real loopback HTTP 503 requests, including two upload attempts. Existing records and original pending work remained readable/durable, then each recovered to the hosted service once. No hosted provider was shut down or reset. |
| A23 current receipts / old archive | Both native targets independently restored an older connected manifest under a new protected database key. Already accepted work activated once after download; genuinely missing work stayed held until explicit resume. Old-device replay added no duplicate effects. |
| Backend authority/races | **8 hosted checks passed**, including independent backend sessions for expense/correction and publication/cancellation races, signed JWT RLS/forged-ID/direct-write negatives, receipt replay, invalid changed payload, and revoked current-session denial. **16 local server checks** (P2 plus affected P0) passed separately. |

These are complementary evidence layers: `p2_google_product_test.dart` uses real
maintainer-assisted OAuth; `p2_google_money_test.dart` uses those OS-persisted Google
sessions and production editors; `p2_native_test.dart` uses separate authenticated
synthetic provider fixtures for detailed transport/security/recovery/domain tests.
`p2_fresh_profile_test.dart` covers the no-local/no-cloud creation branch using
existing synthetic sessions through the same product composition. These synthetic
session tests explicitly do **not** certify Google OAuth. SQL stubs and locally
injected download rows in unit tests are not reported as live CDC.

Exact full-fixture convergence at the 61-command boundary:

| Financial account ID | Windows minor units | Android minor units |
| --- | ---: | ---: |
| `9f7c60f2-f684-47c9-b836-8078ccb99d43` | 963112 | 963112 |
| `b470f669-a230-46d4-bfc8-c5f78a7fdb25` | 76671 | 76671 |
| `b68f27e2-ed1b-4c30-8385-64e16e290533` | 89000 | 89000 |
| `8c5538bc-ad5e-44f6-93b4-8e231a7b24de` | 20258 | 20258 |
| `0d74463e-dcf8-4dc7-8675-27080a5b08ad` | 89000 | 89000 |
| `27d48a8a-f231-48eb-bcd3-47bee087ca44` | 19927 | 19927 |

The final focused Dart gate passed **50 tests**: P2 connected storage/recovery (10),
Windows/Android widget states (2), real killed-process transaction checks (2),
affected P1 persistence (9), financial domain (19), production widgets (3),
Google attempt lifecycle (3) and P1 killed-process persistence (2). The P2 process
tests terminate their own child workers at committed and uncommitted boundaries,
then reopen the encrypted database and verify intent, SDK transport and draft
deletion commit or roll back together. Format checking covered 133 Dart files with
zero changes. Native build/security outcomes are consolidated in section 11.

Failures were retained and corrected, not counted as passing: the first Google
attempt waited until Supabase reported `bad_oauth_state / OAuth state has expired`,
then redirected its error to the configured localhost fallback. A fresh attempt
succeeded without provider reconfiguration. Choosing B for the first A-collision
attempt authenticated B but could not satisfy the collision expectation; no publication
occurred. That authenticated B session was subsequently used for the B-profile test.
The initial Windows wrong-account driver failed to wait for UI refresh before its
retry tap; its guard assertions had passed. A path-quoting typo, overlapping Flutter
build/test invocation, stale P1 expectations for upcoming Google/schema version 2,
test platform-override cleanup and the newly exposed text dropdown overflow were
resolved. Final native commands run serially. The Windows computer-use helper could
not initialize (`failed to write kernel assets`); Flutter integration and scoped Android
diagnostics supplied actual evidence, with the maintainer performing authentication.

## 9. Measurements and free-tier operation

Bounded samples, not 10,000-action certification or production latency promises:

| Measurement | Windows | Android |
| --- | ---: | ---: |
| 13 connected local queues, median / p95 | 30 / 169 ms | 36 / 67 ms |
| Receipt + actual download reconciliation, median / p95 | 769 / 926 ms | 839 / 1047 ms |
| Fresh encrypted SDK initial download | 44 rows / 3,588 ms | 59 rows / 1,040 ms |
| Downloaded recipe + plan UTF-8 bytes | 53,921 | 71,627 |

Logical bytes exclude HTTP/JWT/checkpoint/P0 compatibility-stream/reconnect overhead;
they are not provider-billed transfer measurements. `p2-inspect-health.mjs` measures
actual PostgreSQL storage, restricted publication, canonical coverage, source health
and retained WAL without reading financial details into logs. At **20:12:51
Asia/Manila**, the final measured snapshot was: database **13,227,699 bytes**, P2
tables/indexes **835,584 bytes**, **6** synthetic private profiles / **70** accepted
commands, **87,025** logical recipe/plan bytes, **0** noncanonical rows, source
connected, **0** stream errors, active reserved replication slot with **56**
retained WAL bytes. These are the two Google test profiles, existing synthetic
financial/race owners and two fresh-branch profiles under existing fixture identities;
no new provider project or identity account was provisioned for the fresh checks.

Existing services remain Free. At review, [Supabase Free](https://supabase.com/pricing)
lists 500 MB database, 5 GB egress and pausing after a week of inactivity.
[PowerSync Free](https://powersync.com/pricing) lists 500 MB hosted data, 2 GB monthly
sync, 50 peak clients and deactivation after a week of inactivity. Fewer than about
20 people does not by itself guarantee storage/traffic fit: retained receipts,
enrollment snapshots, plans, ledger/indexes, multiple devices and full redownloads
all consume capacity. No paid commitment, extra project, hosted worker or artificial
keep-alive traffic was introduced.

After prolonged inactivity, restore provider availability using the existing provider
controls, then use Sync now. Preserve offline databases, queues and portable archives;
do not reset slots or recreate accounts to make a failed test pass. A stopped consumer
can retain WAL and hit source limits; monitor diagnostics/usage before the free-tier
pilot. Reactivation may require a new initial download. Monthly billed traffic/retention
growth and the long-lived 10,000-action fixture still require P6 measurements.

## 10. Reproduction and supported boundaries

From `services/salapiya/p0/`, reuse the ignored existing `.env.local` and run
`node prepare-p2.mjs`. It writes **public client configuration only** to ignored
`apps/salapiya/build/p2-public-defines.json`. Provider/admin credentials and user
sessions are not build defines or source assets. No owner SQL execution or new
Google/Supabase/PowerSync setup is required.

Build/run ordinary product `main.dart` with
`--dart-define-from-file=build/p2-public-defines.json`. Omitting configuration retains
standalone local use and clearly explains unavailable Google connection. Windows
development callbacks use the exact Debug registration script described above.

Relevant focused commands from `apps/salapiya/`:

```text
flutter analyze --no-pub
flutter test --no-pub test/p2_connected_test.dart test/p2_widgets_test.dart test/p2_crash_test.dart
flutter test --no-pub --no-uninstall integration_test/p2_google_product_test.dart -d <target> --dart-define-from-file=build/p2-public-defines.json
flutter test --no-pub --no-uninstall integration_test/p2_google_money_test.dart -d <target> --dart-define-from-file=build/p2-public-defines.json
flutter test --no-pub --no-uninstall integration_test/p2_native_test.dart -d <target> --dart-define-from-file=build/p2-public-defines.json
```

Read each integration file's stage defines before reproducing. Google acceptance
uses `connect` on Android, `retrieve`/`collision`/`identity_b` on Windows and bound
reauthentication stages. After the Money sequence, A has 8,777 minor units/five
revisions; authentication-only reruns can set `P2_GOOGLE_EXPECTED_MINOR=8777` and
`P2_GOOGLE_EXPECTED_REVISIONS=5`. Do not recreate/reset that history to recover the
initial two-record fixture. Synthetic non-Google transport fixtures are prepared by
`prepare-p2-native.mjs`; their short-lived session files stay OS-user/app-private and
are consumed by the test. Never put them in Dart defines or Git.
For the separate fresh-profile branch, use `node prepare-p2-native.mjs windows fresh`
or `android fresh`, then `p2_fresh_profile_test.dart`. Windows uses the private
`p2/fresh-windows/config.json` path through `P2_NATIVE_CONFIG_PATH`; Android consumes
its app-private file. These reuse existing fixture identities; reruns reopen their
protected profile rather than deleting cloud history to recreate first run.

Backend checks run from `services/salapiya/p0/` with
`node --test server.test.mjs p2-server.test.mjs`, `node p2-hosted-tests.mjs`,
`node p2-inspect-health.mjs` and `node audit-secrets.mjs`. Hosted command tests append
synthetic history; they are not reset scripts. The normal native fixture uses
`P2_STAGE=offline` on Windows then Android, `online` on Windows, and `verify` on
Android. `P2_STAGE=all` exercises the full domain/recovery sequence;
`P2_STAGE=verify` plus `P2_VERIFY_OUTAGE=true` exercises controlled unavailability.
Google test selection uses `P2_GOOGLE_ACTION`; its Money sequence uses
`P2_GOOGLE_MONEY_STAGE`. Financial stages add real synthetic commands and must not
be rerun while expecting the historical fixed counts in this report.

Operational/development limits remain explicit: one active product profile, no automatic
financial merge, no destructive cloud rollback, no routine identity reassignment,
and no remote device revocation/deletion administration. A restored local-only legacy
archive that independently diverged from an already published same-ID profile is held
for review; it is not automatically merged or allowed to overwrite current cloud history.
P2 does not certify signed
updates/installers, minimum OS/ARM64/physical devices, Narrator/TalkBack, faulty storage,
native document-provider power-loss guarantees, attachments or later financial/Life
modules. Archives remain bounded to 20,000 accepted commands, 20,000 retained intents,
100 drafts and 32 MiB plaintext; oversized/unsupported archives fail visibly.

Private data is encrypted on device and in portable archives, not end-to-end against
service administrators. Live session checks gate all consequential/recovery RPCs;
RLS/PowerSync reads use authenticated JWT ownership. A copied, still-valid JWT may
retain read access until expiry; immediate device-read revocation is not promised.
Projection verification currently loads/replays complete immutable history and requires
capacity optimization/measurement before wider long-lived use. Connected display-name
edits and preferences are device-local; the enrollment name seeds cloud retrieval.

## 11. Final verification and readiness decision

Final gates passed against the delivered source:

| Gate | Actual outcome |
| --- | --- |
| Dart formatting / analysis | 133 files, zero formatting changes; final `flutter analyze --no-pub`: no issues |
| Focused Dart / SQLite / widgets / process termination | **50 passed**, no failures; breakdown and killed-process method in section 8 |
| Backend local / hosted | **16 local passed**; **8 hosted passed**; exact planner parity, authenticated RLS, receipt conflicts and concurrency covered |
| Real Google native workflows | Android enrollment, Windows retrieval/collision, both identities, bound reauthentication and four-stage Google Money convergence passed as qualified in section 8 |
| Detailed native workflows | Both targets passed domain/recovery, separate offline-to-online stages, controlled HTTP 503 recovery and the fresh no-local/no-cloud branch; final full fixture converged at **61** commands |
| Ordinary Windows product | `main.dart` Release build passed (70.7 s); Debug build passed (20.4 s); exact existing per-user callback mapping verified |
| Ordinary Android product | Debug APK build passed (55.8 s), preserving `adb install -r` succeeded and ordinary `MainActivity` launched successfully |
| Hosted deployment health | Linked official migration dry-run up to date; six additive migrations; restricted four-table publication; connected PowerSync source, zero stream errors |
| Credential audit | **1,952 files scanned**, **zero matching paths** across working source, P0/P2 logs, Debug/Release Windows executable/library assets and decompressed Debug APK, using known provider/admin/session/fixture credentials; no claim that pattern scanning proves absence of every possible secret |
| Repository scope | `git diff --check` passed; web code/tooling/migrations and native dependency pins preserved; pre-existing untracked `apps/salapiya/android/build/` retained outside commits |

Ignored local evidence includes `apps/salapiya/build/p2-final-tests.log`,
`p2-final-analysis.log`, `p2-final-server-tests.log`, `p2-windows-final-61.log`,
`p2-android-outage.log`, `p2-windows-fresh.log`, `p2-android-fresh.log` and the three
`p2-product-*.log` build logs. Synthetic structured evidence files stay in the
platform app-support/build directories; credential-bearing fixture files are
private and consumed, never report attachments or Git assets.

The one ordinary Android Debug cold activity launch measured **15,937 ms** under
the emulator/development workload. This is an ActivityManager launch observation,
not a measured usable-screen benchmark or a claim that the blueprint's proposed
startup target is met. Signed Release startup, physical-device accessibility and
long-lived workload performance remain P6 acceptance work.

**Decision:** P2's production connected identity/private Money synchronization and
recovery exit condition is met on the stated targets. Accepted evidence, pending
intent, ownership and portable recovery remain distinct; exact cross-device
convergence and recovery were observed against the real hosted services. No P2
implementation blocker or required maintainer configuration action remains. The maintainer
can review the delivered branch/report and use the existing configured development
builds; completing this assignment requires no further Google chooser interaction.
This is bounded engineering acceptance, not certification of the later P3–P6
product, signed distribution or unrestricted real-data release. The explicit
security, lifecycle, archive, capacity and platform limitations in sections 9–10
remain part of this decision.

## 12. Recommended P3 starting point

Begin P3 only as a separate assignment after review of this P2 delivery. Reuse stable
profile ownership, live-session authority, exact planner/immutable evidence,
whole-command receipt contracts, SDK transport, accepted/pending separation, private
stream isolation and format-2 recovery holds. Add later domain schemas/authorization
and shared golden cases explicitly; group roles must never grant another member's
private-ledger authority. Preserve local-only operation, original IDs, version checks,
current receipts and the one-active-profile boundary. Do not extend production by
turning arbitrary replicated ledger rows into authenticated commands or by silently
replaying web migrations in SQLite. No P3 implementation is included here.
