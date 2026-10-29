# Operations and release

## Contents

- Salapiya release and operations
  - [Salapiya — Final release and project closure](#salapiya--final-release-and-project-closure) (formerly `docs/salapiya/FINAL_RELEASE_AND_PROJECT_CLOSURE.md`)
  - [Salapiya release history](#salapiya-release-history) (formerly `docs/salapiya/RELEASE_HISTORY.md`)
  - [Salapiya private release operations](#salapiya-private-release-operations) (formerly `docs/salapiya/PRIVATE_RELEASE_OPERATIONS.md`)
  - [Salapiya distribution, cost and release policy (product blueprint sections 16, 17, 25 and 26)](#salapiya-distribution-cost-and-release-policy-product-blueprint-sections-16-17-25-and-26) (from `docs/SALAPIYA_PRODUCT_AND_PLATFORM_BLUEPRINT.md`)
  - [Salapiya native development foundation](#salapiya-native-development-foundation) (formerly `docs/salapiya/P0_FOUNDATION.md`)
- Testing and verification
  - [Verification](#verification) (from `README.md`)
  - [Salapiya acceptance criteria and test strategy (product blueprint section 19)](#salapiya-acceptance-criteria-and-test-strategy-product-blueprint-section-19) (from `docs/SALAPIYA_PRODUCT_AND_PLATFORM_BLUEPRINT.md`)
  - [V3 change-impact acceptance](#v3-change-impact-acceptance) (formerly `docs/reference/V3_TARGETED_ACCEPTANCE.md`)
- Web application operations (reference; production checklists are conditional)
  - [V1 operations](#v1-operations) (formerly `docs/reference/V1_OPERATIONS.md`)
  - [V1 lifecycle operation](#v1-lifecycle-operation) (formerly `docs/reference/LIFECYCLE_OPERATIONS.md`)
  - [V2-H manual setup and production checklist](#v2-h-manual-setup-and-production-checklist) (formerly `docs/reference/V2_H_MANUAL_SETUP_AND_PRODUCTION_CHECKLIST.md`)
  - [V2-I manual setup and production checklist](#v2-i-manual-setup-and-production-checklist) (formerly `docs/reference/V2_I_MANUAL_SETUP_AND_PRODUCTION_CHECKLIST.md`)
  - [V3 manual actions and deferred gates](#v3-manual-actions-and-deferred-gates) (formerly `docs/reference/V3_MANUAL_ACTIONS_AND_DEFERRED_GATES.md`)

## Salapiya — Final release and project closure

29 October 2026, Asia/Manila.

**Final application version: `0.6.1+8`.**

**Release status: APPROVED FULL RELEASE.**

**Project development status: COMPLETE.**

### Release decision and scope

Salapiya `0.6.1+8` is a full release, not a beta or trial, for a small private
group of users. It was released after the maintainer's own hands-on testing,
with the limitations below accepted.

The release scope accepts the existing encrypted backup/recovery,
Supabase/PowerSync infrastructure, financial/authentication/synchronization and
physical-device evaluation, unsigned Windows distribution, manual free-tier
monitoring, local-only attachments and narrow device scope. Advanced permanent
sole-owner recovery is deferred. These decisions supersede the earlier release
scope and mandatory-gate classification; they do not manufacture missing evidence.

The original [P6 handoff](archive/salapiya/P6_PRIVATE_RELEASE_HANDOFF.md) and
[post-P6 closure handoff](archive/salapiya/POST_P6_RELEASE_GATE_CLOSURE_HANDOFF.md) retain their
historical findings. Their BLOCKED classifications and pending checklists describe
the earlier approval boundary. Deferred requirements are accepted limitations
under this final scope, not blockers or a new development milestone.

### Completed product scope

One Flutter/Dart application serves Windows and Android with encrypted offline
profiles and optional Google-connected private/group synchronization:

- Money: accounts, income/expenses, splits, transfers/fees, corrections/reversals,
  debts/payments/schedules, credit cards/statements/installments, obligations,
  budgets, savings, forecasts, reports, CSV import/export and supporting metadata.
- Shared Expenses: groups/invitations/roles, exact payer/share allocation,
  creator-only corrections, refunds, balances/netting, partial/selected/multiple
  bill settlements, recipient confirmation/disputes/reversals and independent
  private reconciliation with immutable history.
- Life: personal events and Agenda/reminders, Tasks, Learning, Books and Career
  applications/interviews/follow-ups/history.
- Profile/settings: encrypted archives and recovery, explicit device/account/local
  lifecycle controls, notification preferences, themes and native integrations.

Exact integer money, immutable correction evidence, owner/private/group boundaries,
server authorization, durable synchronization receipts, local encryption, database
invariants and backup behavior are unchanged. The existing web application, tests,
migrations and pnpm tooling remain executable references.

### Final artifacts and identities

The verified existing normal release binaries are promoted without recompilation
or modification. Version `0.6.1+8` remains appropriate because the application bytes
are unchanged; release approval does not require a new version or another signing
session. Android versionName is `0.6.1`, versionCode `8`; Windows application version
is `0.6.1+8`, installer DisplayVersion `0.6.1.8`.

Final local directory:

```text
<repository>\out\salapiya-release\0.6.1-8
```

| Artifact in that directory | Bytes | SHA-256 |
| --- | ---: | --- |
| `Salapiya-0.6.1-8-windows-x64-setup-unsigned.exe` | 15,574,840 | `dcc7e30e2dd488031f8165f8b50c5ff65c671ea0c3af67a5e75065fdb3b30611` |
| `Salapiya-0.6.1-8-android-owner-signed.apk` | 80,057,367 | `341be091a1211b4323cfc2073000c70e03e279d4c4aa04948c15cc2bbf7f025a` |
| `Salapiya-0.6.1-8-windows-x64-unsigned.zip` (complete runtime bundle) | 19,088,720 | `8125bd4fbd0a078a20403c0ee3a00ad00be11a2b197f1a5e3d6ea4518b861303` |

Exact installer path:

```text
<repository>\out\salapiya-release\0.6.1-8\Salapiya-0.6.1-8-windows-x64-setup-unsigned.exe
```

Exact APK path:

```text
<repository>\out\salapiya-release\0.6.1-8\Salapiya-0.6.1-8-android-owner-signed.apk
```

`SHA256SUMS.txt`, `release-manifest.json`, `INSTALL.md`, fresh Android signature/package
and packaged-icon checks, source identity results and historical installer proof
accompany the packages locally. Historical builds 6/7/8 and their evidence remain in
their original locations. No binaries are uploaded to GitHub, publicly published,
or sent to anyone. `out/` is git-ignored and is not part of a repository clone,
so the release directory must be preserved separately.

Android package remains `dev.salapiya.salapiya`; callback remains
`dev.salapiya.p0://auth/callback`. The existing release keystore was used for this APK;
no key was generated or rotated. Its verified certificate SHA-256 is:

```text
d45ef96f19ce9e9df9c23711bc9f843b2bb34350352f06aba347187980dc787e
```

Windows retains AppId `{6345880B-55F4-478B-BB8C-60D67321621C}`, profile identity
`dev.salapiya` / `Salapiya`, AUMID `Salapiya.Private.Development` and existing toast
CLSID. Historical development-labelled IDs remain stable to preserve updates,
callbacks, keys and notifications. The installer includes all 49 Flutter/native,
VC++ runtime and data files plus native icons; never distribute `salapiya.exe` alone.

### Installation and updates

Before updating, save an encrypted archive, keep its recovery secret separately,
and retain original attached documents and the previous package. Verify downloaded
or copied package hashes with `Get-FileHash -Algorithm SHA256` on Windows.

#### Windows

1. Use the unsigned x64 setup EXE above on the target Windows 11 x64 installation.
   Close Salapiya, run setup as the same Windows user and keep its existing
   installation location (default `%LOCALAPPDATA%\Programs\Salapiya`). Setup is
   per-user and includes its runtime dependencies.
2. Windows can display **Unknown publisher** or a SmartScreen warning because the
   installer and application are unsigned. Check the exact released file and its
   SHA-256 before proceeding with the normal per-file run confirmation if offered.
   Do not disable SmartScreen, modify trust stores or purchase a certificate.
3. Launch Salapiya from Start. Existing users update in place; do not uninstall,
   remove the profile or copy data/key directories to force an update. Ordinary
   downgrades are rejected. Open the existing profile and check its records/sync
   status after launch. Installation does not itself grant cloud access.

The ZIP is an optional complete runtime copy; the EXE is the normal installer.

#### Android

1. Copy the signed APK above to the intended phone. Open it from Files and, if
   Android requests it, allow installation from that specific file source. Install
   and open Salapiya; the source permission can be removed afterward.
2. To update an existing installation, install over it using the same application
   ID and release signing certificate. Future updates need a higher versionCode
   than `8`. This final package is the same build `8` as the retained candidate;
   an installation already at that build needs no update.
3. If Android reports an incompatible signature or newer installed version, stop
   and preserve the profile. Never uninstall, clear storage, replace the keystore
   or force a downgrade to bypass the error. Keep the existing keystore and its
   password-manager entry for future signed updates.

Local profile creation works offline. Google connection is optional and uses the
existing, accepted Supabase/PowerSync pairing; current session and
group permissions remain required. No new infrastructure or automatic data
migration is part of this release. Do not run destructive development fixtures,
reset scripts or test-account deletion against real user records.

### Existing backup and recovery

In **Profile → Backup & recovery**, generate a recovery secret, save it separately,
confirm it is stored safely, and choose **Save encrypted backup**. Keep protected
copies after meaningful changes and before updates. The accepted retention policy
is seven recent generations plus four weekly generations in two independent
protected destinations; permanent destinations and scheduling are operated manually
and are not claimed configured by this release.

On a fresh installation without an active profile, choose **Restore from backup**,
enter the separate recovery secret, choose and inspect the archive, review the
declared coverage and activate the restored profile. An active profile is never
replaced or merged with an old archive. Connected recovery requires current Google
verification and receipt/authority reconciliation; restoring a backup cannot
restore revoked membership or roll back accepted cloud history.

Archives include supported private commands/history, drafts/preferences, Life and
attachment metadata. They exclude original attachment bytes, OS keys, sessions,
notification consent and current group authority. Preserve original documents
independently; another device must reselect the exact original. A lost recovery
secret cannot be reconstructed. Synchronization and the encrypted running database
are separate from independent backups. Hosted export and isolated restore tooling
and the detailed fail-closed security reconciliation procedure remain in the
[operations guide](#salapiya-private-release-operations).

### Accepted limitations

- Windows distribution is unsigned; no trusted publisher certification is claimed.
- Existing backups/recovery are accepted. Permanent independent backup locations,
  scheduled hosted exports, durable independent current deletion/revocation journal
  and complete managed-provider disaster recovery are not newly configured or
  certified. Old server restores must remain closed until current security state
  is reconciled; this safeguard is unchanged.
- Existing hosted infrastructure is accepted, including its development environment
  label. A separate pilot, paid services and entitlement/capacity expansion are
  deferred. Free-tier usage/inactivity/quotas require manual monitoring; review at
  70%, investigate at 85%, and pause audience expansion at 90% of relevant quotas.
- Permanent sole-owner identity loss has no automatic or privileged takeover path.
  Same-identity recovery and already-authorized ownership transfer remain available.
- Original attachments stay local, encrypted and unscanned; metadata synchronization
  and financial archives do not transfer original bytes.
- Recorded engineering support is the maintainer's Windows 11 x64 build 26200 host and
  Android 17/API 37 x86_64 emulators. APK ARMv7/ARM64 packaging and minAPI 24 are
  compatibility configuration, not physical-device certification. Device evaluation
  is limited to the maintainer's own devices; no additional phone model or user
  device matrix is independently certified here.
- Human Narrator/TalkBack, every installed Google/deletion/callback/notification
  journey, connected pending/receipt and interrupted-update combinations, storage
  exhaustion, installed release performance and complete provider recovery were
  not newly executed. Historical partial/not-run results stay truthful. Existing
  financial/authentication/sync/device evaluation is accepted as sufficient for this release.

These are accepted operating limitations and optional future work. Public stores,
friends/general-audience distribution, custom updater, arbitrary tracker builder,
external calendar synchronization and cloud attachment transfer/scanning remain
outside the completed private-release scope.

### Final verification and repository history

The [release history](#salapiya-release-history) distinguishes this final approval
from the historical candidates and their original classifications.

The clean work branch and fetched remote both started at
`efdcde871d49a41b32052ed730c4f8190d5826c4` on
`feat/salapiya-private-release-gate-closure`. The application source still exactly
matches binary source checkpoint `60a6605d5a5589a8f200deb53133cbbc00eee9ca`.
Only release documentation changes are needed for this final approval.

Fresh final checks passed: all retained and final-copy hashes; APK v2 signature
against the existing certificate; package/version identity; signing/configuration
guards; nine Windows icon frames and fifteen Android PNG resources plus adaptive/
themed references; ZIP CRC and every one of the 49 runtime file hashes; required
native/VC++ files and absence of development kernel/test-plugin assets. Windows
Authenticode status remains `NotSigned`, as approved.

The byte-identical installer retains the actual historical fresh installation,
7-to-8 package upgrade, payload comparison, callback registration, downgrade
rejection and uninstall proof, with protected profile/key bytes unchanged. Existing
231 passing Flutter tests, native runtime and signed Android update/restore evidence
remain historical results. No new compilation, application launch, installation,
broad acceptance campaign, benchmark, destructive data test or screenshot is
claimed or needed for promoting these unchanged packages.

The normal repository integration uses a merge commit into `main`, preserving the
entire feature history and the release work branch. Release tag
`salapiya-v0.6.1+8` identifies the integrated final release commit; resolve its full
SHA with `git rev-parse 'salapiya-v0.6.1+8^{commit}'`. The closure documentation commit
is independently resolvable with
`git log -1 --format=%H -- docs/salapiya/FINAL_RELEASE_AND_PROJECT_CLOSURE.md`.
The exact final SHA is also recorded in the local repository-state
record alongside the artifacts, avoiding a self-referential SHA in this document.

Final closure uses `[skip ci]` to avoid another broad automatic acceptance campaign,
consistent with this release's minimum-check boundary and the repository's
prior approval-only workflow. CI definitions/assertions remain unchanged; skipped
CI is not reported as passed. No force push, history deletion, public binary
release, infrastructure deployment, service purchase or record migration occurs.

**Salapiya development milestone is COMPLETE.** Future enhancements are optional
maintenance/product decisions and do not reopen this approved full release.

## Salapiya release history

### 0.6.1+8 — 29 October 2026

**APPROVED FULL RELEASE. Development COMPLETE.**

The completed Windows/Android application was released to a small private group
of users with the existing limitations. The verified existing binaries are
promoted unchanged: signed Android APK and unsigned Inno Setup Windows
installer, with a complete optional Windows runtime ZIP. There is no new financial,
privacy, authentication, synchronization, database, backup or UI implementation.

[Final release and project closure](#salapiya--final-release-and-project-closure) records
local paths, exact hashes, installation/update/recovery instructions, the release
decision, technical evidence boundaries and optional future enhancements.
Release reference: `salapiya-v0.6.1+8`. Binaries are retained locally and are not
published as GitHub release assets or distributed automatically.

The earlier [post-P6 handoff](archive/salapiya/POST_P6_RELEASE_GATE_CLOSURE_HANDOFF.md) used the same
version under its earlier BLOCKED scope. That historical result is preserved;
the final decision changes the approved release scope, not the test results.

### 0.6.0+7 — 28 October 2026 (historical P6 candidate)

The [P6 handoff](archive/salapiya/P6_PRIVATE_RELEASE_HANDOFF.md) records its original BLOCKED
classification and acceptance evidence. Signed APKs and Windows bundles for
builds 6/7 remain retained with their evidence. They are historical update/restore
baselines, superseded for current installation by `0.6.1+8`.

Earlier P0-P5 and presentation handoffs retain development history; they are not
separate current release obligations.

## Salapiya private release operations

Current procedures, 29 October 2026 (Asia/Manila). Version `0.6.1+8`.
**APPROVED FULL RELEASE. Development COMPLETE.** The
[final release and project closure](#salapiya--final-release-and-project-closure) records
the release decision, final local artifacts/hashes and installation instructions
for the small private user group. The existing infrastructure, backups and unsigned
Windows distribution are explicitly accepted. No public binary publication, paid
services, automatic migration or additional development milestone is authorized.

Historical [P6](archive/salapiya/P6_PRIVATE_RELEASE_HANDOFF.md) and
[post-P6](archive/salapiya/POST_P6_RELEASE_GATE_CLOSURE_HANDOFF.md) results remain unchanged.
Earlier mandatory-release-gate wording in these procedures is superseded by the
final scope decision; unexecuted checks remain unexecuted and deferred operational
capabilities remain limitations. Fail-closed restore, authorization, signing-key,
financial and data-preservation safeguards remain required and implemented.

### Build and environment boundaries

Use the pinned Flutter 3.47.7 / Dart 3.13.5 toolchain and committed lockfiles.
Preserve `dev.salapiya.salapiya`, `dev.salapiya.p0://auth/callback`, Windows
`dev.salapiya` / `Salapiya`, AppId `{6345880B-55F4-478B-BB8C-60D67321621C}`,
notification AUMID `Salapiya.Private.Development` and CLSID
`{a64517d4-7ea1-49e7-bad5-c3d00db31c1d}`. Naming does not certify a pilot.

From `services/salapiya/p0`, run `npm ci --ignore-scripts` and `node prepare-p2.mjs`.
This guarded command writes ignored **public** development client defines. Never add
sessions, OAuth secrets, service-role/database credentials or signing passwords.
The normal app validates the paired Supabase project and PowerSync instance:
`development` accepts only the existing development pair; `pilot` requires explicit
`SALAPIYA_ENVIRONMENT=pilot`, `SALAPIYA_EXPECTED_PROJECT` and
`SALAPIYA_EXPECTED_SYNC_INSTANCE`, both different from development, with matching HTTPS
URLs. Unknown or mixed environments fail closed for connection; local use remains available.

No separate pilot has been provisioned. The final release uses the existing
accepted development-labelled pair; do not change its environment
identity or bypass the pairing guards. Never run destructive fixtures/reset or
test-account deletion scripts against real user records. The following separate-pilot
procedure is optional future infrastructure work, not a release prerequisite.
The initial audience is the existing private users only.
Verify actual subscription entitlements, usage and free project/instance headroom in both
provider accounts before creation. Public pricing alone is insufficient. Confirm separate
OAuth provider/callback configuration, administrator credentials, database migrations,
PowerSync connection/streams and protected backup storage. Never point fixture scripts at
pilot records or copy development identities/data into it. Do not migrate personal data
automatically. Keep independent protected archives for local and connected use.
Trusted friends require a later audience-expansion decision.

From `apps/salapiya`:

```powershell
flutter pub get --enforce-lockfile
dart format --output=none --set-exit-if-changed lib test integration_test tool
flutter analyze --no-pub
flutter test --no-pub --concurrency=1
flutter build windows --dart-define-from-file=build/p2-public-defines.json
```

Run native builds/tests serially in one checkout. Allow Flutter's pub/tooling regeneration
when switching debug/integration and normal release entry points; do not reuse stale
`--no-pub` registrants for final releases. Retain earlier versioned packages. Rebuild
normal `lib/main.dart`; integration binaries are not distribution artifacts. Preserve
immutable original IDs and schema/archive compatibility. No web migration runs in SQLite.
No screenshots or image goldens belong in this release-closure workflow.

### Windows unsigned installer

The per-user Inno Setup 6.7.3 compiler was installed through the normal winget source.
Its Authenticode signature must validate. The recipe is
`apps/salapiya/windows/packaging/salapiya.iss`; its corrected GUID syntax preserves the
same toast CLSID. Version checks use suppressible errors so unattended downgrade tests
reject safely. App support/key directories are deliberately absent from uninstall deletion.

```powershell
# Repository root, after the normal Windows release build:
.\scripts\salapiya\package-windows.ps1 -Compiler "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe"
```

The wrapper validates version, complete Flutter/native/VC++ runtime payload and absence of
development kernel/test-plugin assets. Its historical output names/messages still say
**UNSIGNED STAGING**; final approval promotes the verified byte-identical packages into
the final local release directory under descriptive unsigned release filenames.
The installer and application remain unsigned; the
Unknown publisher/SmartScreen warning is explicitly accepted for this full release. Verify the exact package
hash and use the ordinary per-file confirmation if offered. Do not buy a certificate,
activate paid signing, disable SmartScreen or alter trust stores. Trusted Windows
signing is optional future work, not a current release blocker.

`test-windows-installer.ps1` performs real fresh baseline installation, package upgrade,
payload comparison, ordinary downgrade rejection and uninstallation in a new directory
under repository `out`. It refuses an existing installed AppId, preserves the original
callback/shortcuts and verifies unchanged production profile/key bytes. It does not launch
an unknown owner's profile. A reconstructed installer for the retained P6 build-7 bundle
is an update baseline; it is not a historically distributed P6 installer. Complete
synthetic-profile installed upgrades, failure/interruption, cold activation and notifications
are not newly certified; their remaining evidence gaps are accepted for this release.
The final local staging run installed/compared all 49 payload files, upgraded to 0.6.1+8,
rejected a downgrade, uninstalled and verified protected profile/key bytes unchanged.

### Android signing and updates

Use the **existing** maintainer-controlled PKCS12 key:
`%LOCALAPPDATA%\Salapiya\signing\salapiya-private-release.p12`, alias
`salapiya-private-release`. Approved SHA-256 certificate:
`d45ef96f19ce9e9df9c23711bc9f843b2bb34350352f06aba347187980dc787e`.
Never generate a replacement, rotate it or edit its identity record to bypass a mismatch.
The key is backed up and its password is kept in a password manager; do not request passwords in chat.

Run `scripts/salapiya/sign-android-interactive.ps1` in a local interactive PowerShell console,
with the installed JDK `-Keytool` and Android SDK `-AndroidBuildTools` paths. The updated
workflow refuses a missing existing key, uses masked input and process-only environment
variables, verifies the certificate **before** compiling and checks the APK signature
against it. Never enable a transcript. Do not pass passwords in argv, Dart defines, CI,
logs or Git. `-WaitForChecks` is an assignment-local coordination option: use a new verified
signing-ready marker after checks, never an old marker as fresh evidence.

The four secure build variables remain `SALAPIYA_KEYSTORE`, `SALAPIYA_STORE_PASSWORD`,
`SALAPIYA_KEY_ALIAS`, `SALAPIYA_KEY_PASSWORD`. Supply all four or none. Release builds fail
without them unless the explicit `SALAPIYA_UNSIGNED_STAGING=true` diagnostic option is used;
that output cannot pass signed acceptance. Clear it afterward. Normal release signing saves
versioned logs, public signature metadata and a uniquely named retained APK under
`build/private-release/0.6.1-8/`, preserving P6 builds 6/7. Credentials are cleared afterward.

Before updating any real device: test an independently keyed encrypted archive restore;
retain the previous package and archive; verify package/certificate/version hashes; install
higher version code **without uninstall**; compare financial/Life IDs, pending envelopes,
accepted receipts, exact totals and backup compatibility after restart. Never use
`adb install -d`, replace the signing key or uninstall a real profile to force success.
An emulator update is not physical-phone acceptance. The assisted physical-phone checklist is in
the closure handoff; do not advertise untested Android/ARM64 or OS compatibility.
The final build 7-to-8 release-emulator update preserved UID and exact financial/Life
IDs/payloads; a fresh temporary Android user also activated the build-7 archive with its
separate OS keystore and re-exported matching records. These local-only archive results do
not certify nonempty connected pending/accepted receipts or interrupted updates.

### Local profile, device and account lifecycle

These are separate operations in Profile / Devices:

- **Local removal** requires typed confirmation, explains the local/connected distinction,
  unsynchronized-work loss, archive/file coverage and cloud preservation. It works offline,
  clears only the reviewed profile's encrypted database, WAL/SHM and attachment directories,
  cancels only its recorded OS notifications and removes the current protected descriptor.
  A `removing` checkpoint retains the key until erasure finishes; restart resumes an
  interrupted erase. Preserved profiles/keys, external archives and cloud history remain.
  This is logical local deletion, not forensic secure erase or remote device revocation.
- **Device revocation** identifies authenticated provider sessions, not attested hardware.
  A reinstall or new Google sign-in can create another session on the same physical device.
  Earlier sessions with unknown hardware are labelled honestly. Registration uses the signed
  provider `session_id`; a caller-selected UUID or label cannot grant authority. Revocation
  records that session, deletes its provider refresh-session chain and leaves peers intact.
  Already-issued commands finish before the revocation transaction commits; subsequent RPCs
  and RLS reads reject it. PowerSync filters all eight data streams through a restricted CDC
  session-entitlement index using signed `sub` and `session_id`, independently of RLS.
  Stream revocation follows the source/replication checkpoint; no instantaneous deadline is
  promised during lag/outage. Copied offline records cannot be erased remotely. Fresh Google
  authentication is separate authorization; also secure the Google account after device loss.
- **Connected deletion** requires online current-session authorization, an exact typed phrase
  and OAuth reauthentication within five minutes. Refresh-token exchange alone does not
  satisfy this. The atomic RPC records a permanent owner/profile deletion marker, closes
  group authority, purges private financial/Life commands, receipts, postings, enrollment snapshots and private review projections, and revokes sessions. Group
  bills, settlements, participant intervals and minimal audit identifiers remain for peers;
  current deleted-participant names become neutral and invitations/private ledgers do not
  become shared retention. Sole-owner administration is archived without takeover.
  Provider-side authorized identity deletion follows the same erasure policy. The Edge
  function derives its target only from online verified identity and then uses the official
  Auth admin deletion API. It accepts no caller-provided target user ID. If provider cleanup
  fails, application authority is already permanently blocked and cleanup stays explicitly
  pending; retry/verify the original operation, never recreate the account or financial IDs.
  A read-only signed-subject deletion-status RPC can verify the original outcome after
  Auth cleanup even when its success response was lost; it cannot initiate another deletion.
  Local copies, original documents and retained encrypted backups are separate and are not
  remotely/instantaneously erased. Deleting Salapiya never deletes the Google account.

Do not claim a successful real-Google deletion acceptance from a signed password fixture:
the latter is an intentional negative. The handoff distinguishes local PostgreSQL proof,
live negatives, actual SDK revocation and remaining positive OAuth/installed acceptance.

The lifecycle schema is not in the replication publication. Only `p7_sync_session` is added
as an authorization index; authenticated clients cannot select/write it. Default internal
schema/table/function access remains revoked. Do not disable immutable triggers, RLS or
stream filters. Deleted profile IDs cannot be recycled. An archive contains no sessions,
device authorization, signing keys or current group entitlements.

### Group departure and owner loss

Ordinary departure, former-member source entitlements and explicit owner-to-active-registered-
member transfer retain the existing versioned command/receipt rules. An owner must transfer
administration before ordinary departure; peers cannot appoint themselves. Recover a lost
owner device by authenticating the **same** recoverable Google identity, then revoking old
sessions from a verified device. Other active members can continue permitted group work.

Permanent sole-owner identity loss has no automatic takeover or unrestricted admin recovery
RPC. Open a security incident; establish provider/account-recovery failure, independently
verify the requesters and their existing group roles, preserve only their already-entitled
shared evidence, and obtain explicit authority for a named test/non-test group and proposed
successor before any privileged action. The operator must not impersonate the missing user
or read private ledgers. Until a reviewed privileged recovery procedure is implemented and
rehearsed, ownership transfer is unavailable in this case. Provider deletion archives
ownerless administration and retains peer history. A newly consented successor group cannot
silently repost old money or settlements. No privileged non-test recovery is authorized here.

### Five distinct backup mechanisms

1. Encrypted local SQLite, protected descriptor and encrypted attachment copies protect a
   running device. They are not an independent backup; losing the OS key may require recovery.
2. Portable encrypted archives contain supported private immutable commands, drafts,
   preferences, financial metadata and Life history. Writers local 1 / connected 3 read
   formats 1-3 under the existing 32 MiB / command bounds. Archives contain **no original
   attachment bytes**, OS keys, sessions, notification consent or group authority.
3. Independent hosted PostgreSQL exports cover `public`, `auth`, `supabase_migrations` and
   `salapiya*` schemas, immutable receipts/evidence, group state, deletion/revocation state,
   ACL/RLS dependencies and migration hashes. They contain sensitive managed Auth data and
   must stay encrypted. Provider OAuth/JWT secrets/configuration, replication credentials,
   provider services and PowerSync storage are not restored by a database dump.
4. Synchronization is current authorized replication, not independent historical retention.
5. Original financial/Career documents remain device-local and unscanned. Maintain independent
   protected originals; another device must reselect the exact original size/checksum.

### Approved backup schedule, retention and storage

The operator owns this procedure. Policy is approved: after meaningful personal changes
and **before** upgrades/consequential maintenance; hosted export nightly while operated;
seven recent generations plus the latest generation in each of four completed weekly buckets;
two independent protected destinations; a monthly isolated restore and an additional drill
after schema, provider, key or consequential release changes. Recent/weekly sets may overlap;
missing weeks are not fabricated. Retention is generation-based and must not be described as
an automatic time-purge guarantee when backups stop.

Proposed concrete arrangement: a dedicated folder on an already maintainer-controlled encrypted
removable drive, rotated offline, plus a separate maintainer-controlled private NAS/off-site
storage location containing client-encrypted archives. Verify independent device/site/failure
boundaries, ACLs, capacity and provider entitlements. Keep the encryption/recovery secrets in
the password manager, separate from both archive copies. No drive purchase, storage account,
paid tier or external destination is provisioned by this guide. Two temporary directories on
this laptop prove copy/retention mechanics only. Permanent backup operation is **unconfigured**.

`release-backup-cli.mjs` accepts one external, private JSON configuration path. Supported
`kind` values are `portable` and `development-postgres`; no pilot source is inferred. The
configuration names two dedicated `destinations`, the portable `archive` / `profileScope`,
or the development `expectedProject` / installed `pgDump` executable. Keep it outside Git.
Hosted encryption requires a separately provisioned 256-bit base64url
`SALAPIYA_BACKUP_KEY` in the current process; obtain it locally from the password manager,
never argv/chat/logs. Clear that process variable after use. The portable source must already
be an encrypted Salapiya archive; keep its own separate recovery secret.

```powershell
# From services/salapiya/p0; paths/config are deliberately owner-selected:
node release-backup-cli.mjs C:\OwnerProtectedBackupConfig\salapiya-backup.json
```

The implementation uses AES-256-GCM, bounded authenticated envelopes and PostgreSQL custom
archives, verified TLS to the development pooler, and a repeatable-read exported snapshot
for matching schema/data/security metadata. No plaintext dump is written to disk. It checks
both encrypted copies before retention deletion, preserves unrelated scopes and refuses
linked/non-dedicated destinations. Windows DACLs allow only the operator and SYSTEM; POSIX
directories require operator ownership and mode 0700. Do not assume an unconfigured task or
key-retrieval mechanism is operational. Initial scheduling is operator-run; create a Task
Scheduler entry only after protected key retrieval and both real destinations are verified.

After each run inspect the non-secret JSON success/failure record and copy hashes; an exit
failure means no operational success. Alert the operator immediately on missing/failed nightly
runs, copy mismatch, authentication failure, storage pressure, stale weekly generations or
retention failure. Do not prune after a failed second copy. A lost backup key/recovery secret
cannot be reconstructed by synchronization or the operator.

### Isolated restore and stale-security reconciliation

`release-disaster-recovery.mjs` only creates a new password-protected loopback PostgreSQL
cluster in a protected temporary directory. It accepts no target DSN or existing cluster,
uses a fresh database, imports the encrypted custom archive, verifies exact immutable table
fingerprints and RLS, then clears restored sessions. Required role names/grants are restored
as NOLOGIN without copying provider privileges/passwords. Successful temporary targets are
removed; failures remain protected for diagnosis. It never restores into development/pilot.

```powershell
$env:SALAPIYA_POSTGRES_BIN = 'C:\Program Files\PostgreSQL\18\bin'
node release-disaster-recovery.mjs
```

A restore to another Supabase project additionally needs reviewed managed-schema/Auth import,
current OAuth/JWT configuration and secrets, role mapping, replication/publication setup,
PowerSync service configuration, fresh authorized sessions and a bounded actual SDK resync.
The local PostgreSQL drill is not that end-to-end provider recovery.

**Keep service ingress closed after an old restore.** Reapply current migrations and obtain
the latest independently authenticated deletion/revocation journal, including changes later
than the database snapshot. `reconcileSecurityJournal` checks freshness, applies permanent
erasures/revocations and clears restored Auth sessions/CDC entitlements. It cannot infer
missing later deletions from an old backup. Without a trustworthy current independent
register, recovery remains blocked; do not accept new logins or revive old entitlements.
Permanent independent register durability/freshness and managed-provider client resync
remain unconfigured/unrehearsed limitations accepted for this release. An attempted old
server restore must still fail closed without current security evidence. No operator
impersonation is a recovery shortcut.

### Quotas, monitoring and maintenance

Published offerings checked 29 October 2026: [Supabase](https://supabase.com/pricing) lists
500 MB database, 5 GB uncached egress, 1 GB file storage, two active free projects across
owner/admin organizations, one-week inactivity pausing and no automatic Free backups.
[PowerSync](https://powersync.com/pricing) lists 500 MB hosted data, 2 GB monthly sync,
50 peak clients, up to two instances and one-week inactivity deactivation. Actual account
entitlements and billed usage must still be verified; do not create paid resources or
artificial keep-alive traffic. Alert/review at 70%, investigate at 85%, and pause audience
expansion at 90% of each relevant quota. These are operator policies, not provider enforcement.

Read-only checks: `node release-provider-inventory.mjs`,
`SALAPIYA_AUDIT_DIRECTORY=release-gate` with `node p6-audit.mjs` (set the environment in
PowerShell syntax), `node p2-inspect-health.mjs`, `node inspect-health.mjs` and
`node powersync-state.mjs`. They verify the development identity and emit aggregate health,
storage, WAL/replication, publication, grants and current client counts. Review provider
dashboards weekly, before new devices/full resyncs and before expansion. Current clients
are not historical peak clients; database bytes are not billed egress. Monitor retained WAL,
lag, incomplete downloads, rejected original commands, backup freshness and version windows.

During outages retain local encrypted records and queues; verify health/session, then Sync
now and receipt **plus** downloaded coverage. Do not reset databases, replace accounts/keys,
clear receipts or manufacture complete balances. Reactivate through provider controls after
inactivity; no artificial traffic. For an incident stop distribution, preserve protected
original evidence, revoke the affected sessions, secure Google credentials if needed and
rotate only an actually compromised administrator credential under explicit authority.

The vulnerable PowerSync CLI/plugin-manager bundled npm path was removed. The reviewed
administration path pins the official management SDK and existing provider identity:
`node deploy-powersync.mjs` validates development streams; `--apply` deploys only reviewed
stream content while retaining configuration/secret references. Historical bootstrap/reset
scripts are not pilot procedures. No blanket Pub/Gradle upgrade was applied. Review advisories
monthly and before releases; npm/OSV success is scoped evidence, not a claim that Flutter
engine, SQLite, JDK/NDK, every transitive Gradle dependency or the OS was exhaustively audited.

Useful authoritative references: [Supabase sessions](https://supabase.com/docs/guides/auth/sessions),
[backups](https://supabase.com/docs/guides/platform/backups),
[PowerSync auth parameters](https://docs.powersync.com/sync/streams/parameters),
[stream queries](https://docs.powersync.com/sync/streams/queries),
[Inno shortcut GUID syntax](https://jrsoftware.org/ishelp/topic_iconssection.htm),
and [suppressible installer errors](https://jrsoftware.org/ishelp/topic_isxfunc_suppressiblemsgbox.htm).

## Salapiya distribution, cost and release policy (product blueprint sections 16, 17, 25 and 26)

### 16. Distribution, updates and operational ownership

Initial distribution is a signed Windows installer and signed Android private build. Public Microsoft Store/Google Play listing is deferred. Select installer/update tooling during G5 based on supported Windows versions, Android devices and plugin requirements. Minimum OS versions and CPU architectures remain unverified until the real device inventory is collected; official framework support is only an upper bound on what the whole dependency stack can support.

Protect and back up signing keys. Retain stable application IDs/signatures so updates replace the intended installation and preserve data. Provide a visible version/build and a simple private release channel. Manual installation of signed updates is acceptable initially; do not build a custom updater before demonstrating a need. Verify update packages and schema compatibility, and tell users how to recover from a failed upgrade.

Maintain separate development/test and real pilot environments. No test fixtures or destructive test cleanup may run against pilot data. Cloud administration belongs to the operator, never to every user through app roles.

Operational tasks include provider health/quota checks, server database recovery, access/key rotation, dependency updates, failed-sync diagnostics, attachment cleanup, backup/restore drills and user support. Logs should expose correlation IDs and failure categories without disclosing private contents. A service outage pauses online features; it must not invalidate already stored personal data.

### 17. Cost and service sustainability

The approved spending posture is a **free-tier pilot, with no paid subscription commitment**. No exact monthly spending ceiling was supplied. Before activating any paid plan, record an explicit budget decision with an actual estimate. Do not assume small-group usage means every required service is free forever.

As checked on October 19, 2026:

| Service | Published starting point | Planning implication |
| --- | --- | --- |
| Supabase | Free plan; Pro from US$25/month; free projects pause after a week of inactivity | Pilot fit depends on actual quotas/usage and acceptable service availability. |
| PowerSync | Free plan; Pro from US$49/month; free projects deactivate after a week of inactivity | Free published limits include 2 GB synced/month, 500 MB hosted data and 50 peak clients. Measure actual sync history/traffic. |
| Both entry paid plans | Approximately US$74/month before additional services, taxes or overages | Potentially disproportionate for this audience; not an approved commitment. |
| Attachments/backup/distribution | Usage, retention, signing and hosting choices affect costs | Include actual bytes and history, not just number of users. |

Sources: [Supabase pricing](https://supabase.com/pricing), [PowerSync pricing](https://powersync.com/pricing). These are dated published prices, not a guaranteed quote. Recheck before procurement.

Do not create artificial keep-alive traffic to evade inactivity policies. Show service-unavailable status and a recovery route. Free-tier suitability is an explicit gate; if inadequate, compare a paid managed plan, another validated provider/transport, or self-hosting with its real maintenance burden. A provider replacement requires a recorded trade-off and an explicit decision if it materially changes cost, privacy, scope or maintenance.

Google sign-in does not eliminate database/sync/storage costs. With Google as the only launch sign-in provider, a separate password-reset email system is not mandatory; adding email authentication later would require a real mail-delivery setup. Keep optional email/push services outside launch dependency counts unless approved.

### 25. Post-P6 approved operational refinements (29 October 2026)

The following private-release policies were approved during release closure.
They refine the earlier deferred operational decisions without changing
financial semantics, private/group ownership or the approved presentation:

- Windows trusted signing is unpaid/deferred. Complete feasible unsigned staging
  engineering; trusted signing remains an original mandatory gate, with no release
  scope waiver, SmartScreen/trust-store bypass or signing purchase authorized.
- Backup retention is seven recent generations and four weekly generations, with
  two independent protected destinations, pre-upgrade/maintenance backups and
  periodic isolated restores. Permanent destinations are not yet selected. Local
  storage, portable archives, hosted PostgreSQL exports, sync and original local
  attachment bytes are five separate mechanisms.
- Local removal, provider-session/device revocation, connected deletion, group
  departure and authorized ownership transfer are separate operations. A revoked
  session/old archive cannot restore cloud authority; offline copies cannot be
  remotely erased. Deletion removes unrelated private records while retaining
  minimum necessary shared bills, settlements, participant intervals and audit
  evidence belonging to peers. Current independent deletion/revocation state is
  mandatory before bringing an old database restore online.
- Same-Google-identity owner recovery and explicit authorized transfer are allowed.
  Permanent sole-owner identity loss requires separately verified authority and a
  reviewed procedure; no automatic takeover, impersonation or unrestricted recovery
  backdoor is permitted. An unimplemented/unrehearsed privileged path stays blocked.
- Prepare a separate free-tier pilot for the existing private users only, after actual
  entitlements/costs and OAuth/operational prerequisites are verified. No automatic
  real-data migration or paid activation. Friends are a later expansion decision.
- Operator thresholds are 70% monitor/review, 85% investigate and 90% pause audience
  expansion for each relevant quota. They are policies, not provider limits. No
  artificial keep-alive traffic or assumed unlimited free capacity.
- Advertise only specific device/OS combinations with actual acceptance evidence.
  Physical Android and human Narrator/TalkBack are distinct from emulator/widgets.
- Preserve the existing backed-up Android release keystore and certificate. Do not
  generate a replacement, rotate it or request signing passwords in chat.
- Initial private-release original attachment bytes remain local-only, encrypted
  and unscanned. Metadata availability must stay separate from bytes; independent
  protected originals and exact-original reselection remain necessary. Cloud byte
  synchronization/scanning is deferred for this private-release boundary.

Current implementation/evidence and remaining gates are recorded in
[post-P6 release gate closure](archive/salapiya/POST_P6_RELEASE_GATE_CLOSURE_HANDOFF.md).
The [operations guide](#salapiya-private-release-operations) specifies retention,
security, environment pairing and fail-closed restore procedures. These policy
approvals do not themselves provision storage/services or certify release readiness.

### 26. Final approved full release and project closure (29 October 2026)

Salapiya `0.6.1+8` was approved as a **FULL RELEASE** for a small private group of
users, and the planned development scope was closed as **COMPLETE**. This is not a
beta/trial or another P6 milestone.

The release accepts the existing encrypted backup/recovery, existing Supabase/PowerSync
pair, financial/authentication/synchronization/device evaluation, unsigned Inno Setup
Windows distribution, manual free-tier monitoring, local-only attachments and narrow
device support. Advanced permanent sole-owner recovery is deferred. A separate pilot,
trusted Windows signing and additional acceptance campaigns are not release prerequisites
under this final scope. No services are added or purchased, no UI/financial logic is
rewritten, and no binaries are automatically published or sent to other people.

This decision supersedes the earlier release-gate classification and release-blocking
requirements in sections 16-22 and 25 only within the defined audience and accepted
scope. Original P6/post-P6 test evidence, partial results and unexecuted checks remain
historical facts. Existing financial/privacy/authentication/synchronization/encryption,
backup, database and fail-closed recovery safeguards remain unchanged and mandatory.

[Final release and project closure](#salapiya--final-release-and-project-closure)
records the exact local artifact paths, sizes/hashes, preserved signing identity,
installation/update and recovery instructions, accepted limitations and repository
release reference. Future enhancements are optional and do not block this release.

## Salapiya native development foundation

Assignment: P0 repository/workspace preparation, October 20-21, 2026 (Asia/Manila).
The [approved blueprint](PRODUCT_AND_FEATURES.md#salapiya--product-revision-and-windowsandroid-migration-blueprint) governs
the product. This foundation does not close G0-G4 or implement P1 features.

### Implementation and boundaries

`apps/salapiya/` contains one Flutter application with Windows and Android targets.
The offline startup screen shows the Salapiya name/tagline and a transient startup
check button. Its count resets on restart; it is not a financial record or a
persistence demonstration. Material widgets, system light/dark themes, keyboard
focus, safe insets and scrolling provide a small accessible starting point.
Required assets are bundled; startup has no network/authentication dependency.
Final typography, icons and product UI remain future work; generated Flutter icons
are development placeholders.

```text
apps/salapiya/
  AGENTS.md, README.md, .metadata, .gitignore
  pubspec.yaml, pubspec.lock, analysis_options.yaml
  lib/main.dart             entry point
  lib/app.dart              app/theme and transient startup interaction
  test/widget_test.dart     four behavior/accessibility smoke tests
  integration_test/startup_test.dart   native runtime smoke test
  android/                 Kotlin/Gradle runner, manifests, wrapper and resources
  windows/                 CMake/C++ runner, resources and plugin registration
```

No web/iOS/macOS/Linux application targets were generated. Root `src/`, web tests,
PostgreSQL migrations, package manifest/lockfile and existing acceptance workflow
remain the executable historical web reference. Run that application using the
root README and pnpm; native development uses Flutter/Dart independently. Do not
copy the web PostgreSQL schema into SQLite. Historical money, correction,
ownership, private/group isolation and source-derived reporting contracts survive.

Temporary Android namespace/application ID: `dev.salapiya.salapiya`. This is a
development identifier, not a verified domain or final distribution identity.
Version: `0.1.0+1`. The template's debug signing is for local testing only;
permanent IDs, signing, installers, updates and private distribution remain open.

### Tested toolchain

| Component | Locally inspected version |
| --- | --- |
| Flutter | stable 3.47.7, revision `abaf9c523780a608bd46686fd5e53740a07077f8` |
| Dart / DevTools | 3.13.5 / 2.60.0 |
| Windows | Windows 11 25H2, build 26200.9711, x64 |
| Visual Studio | Community 2026 18.11.0 (18.11.12306.390) |
| Windows SDK | 10.0.26100.0 |
| Android platform / build tools | android-37.0 revision 2; android-36 revision 2 added by build; build tools 37.0.0 and 36.0.0 |
| Android emulator / platform tools | 37.2.12 (build 16428233) / 37.0.1 |
| Android command-line tools | 23.0.0 |
| Java used by Flutter Android builds | Android Studio bundled OpenJDK 25.0.3 |
| NDK | 28.2.13676358 (r28c), required by this Flutter template |
| Gradle / Android Gradle Plugin / Kotlin plugin | 9.3.1 / 9.1.0 / 2.4.0 |
| Historical web Node / pnpm | 24.21.0 / 12.9.1 |

Use the tested Flutter version for reproducible development; `.metadata` records
the generator revision and CI pins the tag plus full framework SHA. Pubspec SDK
constraints describe compatibility bounds, not proof for every newer SDK.
Direct `flutter_lints` is pinned to 6.0.0; all application runtime dependencies are
from Flutter itself. `integration_test`/`flutter_test` are SDK development tools.
Commit `pubspec.lock`, Gradle wrapper scripts/JAR/properties and native runner files.
Use `flutter pub get --enforce-lockfile` in CI. Upgrade dependencies deliberately,
review licenses and rerun both platform checks. Do not add a monorepo framework.

### Windows and Android development

From the repository root:

```powershell
cd apps/salapiya
flutter --version
dart --version
flutter doctor -v
flutter pub get
flutter devices
flutter run -d windows
```

For Android, start the configured emulator from the repository root:

```powershell
.\scripts\salapiya\start-emulator.cmd
# Optional: pass another AVD name printed by flutter emulators.
cd apps/salapiya
flutter devices
flutter run -d <actual-device-id>
```

Replace `<actual-device-id>` with the ID discovered on that run. Do not save a
transient emulator serial in launch configuration. `r` in `flutter run` reloads,
`R` restarts, and `q` stops the application. Hot reload preserves the current
State object; a full restart intentionally resets this screen's check count.
Development installs/build tools may download missing caches; offline runtime does
not imply an uncached first build works offline.

The local primary AVD is `Salapiya_Pixel_9_API_37`, Google Pixel 9 profile,
1080x2424 at 420 dpi, portrait, x86_64, Google Play/API 37 (Android 17), image
revision 6, four virtual CPU cores, 4096 MB RAM, 10 GB data and 512 MB SD card.
WHPX `10.0.26200` reports installed and usable. GPU mode is automatic (boot selected host rendering), GPU and
hardware keyboard enabled. This recent image was already installed; no additional
system image was downloaded. AVD files remain outside Git.

Initially Flutter reported no AVDs because this machine relocates its Android user
home. SDK inspection later found `Medium_Phone_API_37.0`; it was left unchanged.
The helper sets `ANDROID_AVD_HOME` from an existing `ANDROID_USER_HOME` only when
needed, within its own process. It writes no machine settings or paths to Git.
For direct emulator commands in a similarly relocated PowerShell session:

```powershell
if (-not $env:ANDROID_AVD_HOME -and $env:ANDROID_USER_HOME) {
  $env:ANDROID_AVD_HOME = Join-Path $env:ANDROID_USER_HOME 'avd'
}
flutter emulators
flutter emulators --launch Salapiya_Pixel_9_API_37
```

The helper uses `--cold` because a Quick Boot restart stalled in adb during final
verification. Cold boot preserves installed applications/data. For direct launch,
append `--cold` to the command above if snapshot startup stalls.

Use the installed Android CLI/Device Manager for future AVD creation. The installed
`sdkmanager` compatibility wrapper is deprecated and mishandled Flutter's semicolon
NDK argument. The supported correction is `android --no-metrics --sdk <sdk-root>
sdk install ndk/28.2.13676358`, using the SDK root reported by doctor. During this
assignment the CLI initially chose its default SDK root; only the just-installed
NDK was moved into Flutter's configured SDK after checking both absolute paths and
refusing an existing destination. No existing toolchain was reinstalled, no system
security/virtualization setting was changed and no data was reset.

### VS Code

Open the repository root. Install recommended Dart/Flutter extensions alongside
the retained web recommendations. Select `Salapiya: Windows` in Run and Debug and
press F5. For Android, run task `Salapiya: start Android emulator`, wait for boot,
use `Flutter: Select Device` to select that emulator, then choose
`Salapiya: selected Android emulator` and F5. That launch uses the selected device;
its name does not itself force an Android target.

Set a breakpoint inside `_runCheck`, activate the button, inspect `_checks`, then
continue. Use the Flutter hot-reload control or save a Dart file during debugging;
`dart.flutterHotReloadOnSave: manual` enables reload on explicit saves. Dart uses
its own formatter and disables ESLint save actions; existing web settings remain.
`Salapiya: validate` runs format verification, analysis and widget tests in sequence.
The batch launcher also works when PowerShell script execution is disabled;
use `pnpm.cmd` for historical web commands in that environment.

### Checks and future platform scenarios

Run from `apps/salapiya`:

```powershell
flutter pub get --enforce-lockfile
dart format --output=none --set-exit-if-changed lib test integration_test
flutter analyze --no-pub
flutter test --no-pub
flutter build windows
flutter build apk --debug
flutter test integration_test/startup_test.dart -d windows
flutter test integration_test/startup_test.dart -d <actual-android-device-id>
```

Use `dart format lib test integration_test` to apply formatting. Release Windows
output is under `build/windows/x64/runner/Release/`; the debug APK is under
`build/app/outputs/flutter-apk/`. These outputs and local SDK paths stay ignored.
Preserve the entire Windows output directory when testing a copied executable.

Develop shared domain/application behavior once and adapt layout/input for both
platforms. Use Windows daily and the Android emulator throughout each vertical
feature. Keep platform-specific adapters isolated when required. Test both before
calling a feature complete; physical Android acceptance remains later work.

Use `lower_snake_case` packages/files, `UpperCamelCase` types and `lowerCamelCase`
members. Keep behavior tests under `test/` and native smoke/integration scenarios
under `integration_test/`. Add feature directories/layers as needed, not empty
architecture. Use exact minor units and lossless boundaries for future financial
rules, with range/parity tests. Prefer labeled controls, keyboard focus, text
scaling and actionable failures; never log private content or claim failed saves.

The emulator toolbar/Extended Controls and `adb` support orientation, Home/Back,
keyboard/insets, background/resume, restarts and network changes. Add durable-data
kill/restart and offline/reconnection scenarios after storage/sync exists. Add
notification/permission and authentication callback scenarios only with their
adapters. Current Android runner preserves Flutter's orientation/config-change
handling and `adjustResize`; this does not certify every future form/lifecycle
behavior. No database, permissions flow, notifications or OAuth callback is
implemented here. Airplane-mode tests must re-enable connectivity afterward.

### Git, CI, evidence and continuation

Started from clean `main` at `7662ce9cb22d6aa1ca5d18ca6604b7bdb416fc66`, matching
`origin/main`. Work uses `feat/salapiya-p0-foundation`; only assignment files are
staged, with no automatic merge or force push. See the completion report for the
final SHA and verified remote result.

`salapiya-flutter.yml` performs locked dependency resolution, formatting, analysis
and widget tests on Ubuntu with the exact tested SDK. It is source validation,
not Windows/Android runtime acceptance. Existing web acceptance CI remains intact.
Native platform builds and emulator tests stay local for this small milestone;
no paid runner, cloud credentials or emulator build matrix was introduced.

Actual commands/results, initial failures and limits are recorded in
[P0 verification](archive/salapiya/P0_VERIFICATION.md). Follow-up objectives and explicit exclusions
are in [P0 next assignments](archive/salapiya/P0_NEXT_ASSIGNMENTS.md). The recommended next
assignment is bounded G0 dependency/device compatibility plus early G7 cost
feasibility; do not start P1 until G0-G4 have sufficient evidence.

Official command references checked for this assignment:
[Flutter CLI](https://docs.flutter.dev/reference/flutter-cli) and
[Android emulator command line](https://developer.android.com/studio/run/emulator-commandline).
Prefer the installed CLI's help where command syntax has changed.

## Verification

For assigned redesign milestones, use the [approved change-impact strategy](archive/web/COMPREHENSIVE_UI_UX_REDESIGN_PLAN.md#145-approved-change-impact-verification-and-delivery-boundaries). M1–M5 test changed/affected components, workflows and shared contracts with relevant responsive/theme/keyboard/accessibility and correctness/security checks. M6 covers the complete redesigned screen/route inventory and meaningful cross-screen workflows/accessibility; it is not an automatic complete V1–V3 regression campaign. Broaden only for changed shared contracts, discovered failures or significant security/financial risks. Preserve assertions and existing CI; record executed tests, results, coverage, exclusions and rationale. Historical evidence supports unchanged behavior, not redesigned screens.

The commands below are general full-suite and specialized verification references, not a requirement to run every campaign for each milestone. Documentation-only approval runs none of the application tests, builds, benchmarks or Docker operations. Broader automatic CI remains enabled and its outcomes are reported separately.

For a separately justified full-suite run, use `pnpm check`, `pnpm test`, `pnpm test:integration`, `pnpm db:verify:chain`, `pnpm build`, then `pnpm test:browser`. On memory-constrained machines, use `pnpm test --maxWorkers=1 --pool=threads`; it runs the complete suite with the same assertions, isolation and timeouts. Install Playwright Chromium with `pnpm exec playwright install chromium`, or on Windows set `PMP_BROWSER_CHANNEL=msedge` to use installed Edge. Browser acceptance starts its own production server on port **3100** and refuses reuse of a user's development server.

Integration tests refuse databases other than `personal_management_test`. Migration verification creates and removes a uniquely named disposable database, proves a no-op repeat, and runs committed financial/lifecycle smoke checks. `pnpm db:verify:chain --upgrade` also preserves committed C4 balances and reports across the upgrade. Preserve numbered migrations; never use schema push. Generate reviewed additions with `pnpm db:generate`, test the chain before applying to development, and apply migrations once with the migration owner in the authorized environment; this is not an instruction to provision production.

`pnpm verify:performance` measures a guarded multi-year synthetic test dataset and 100 users/20 active callers against documented latency budgets. Its 50,000-action default can take considerable time with all financial integrity checks enabled; run it separately from final regressions. `pnpm verify:restore` performs the isolated encrypted local restore/deletion-register drill. Neither command proves production capacity or cloud retention. See operations for the separate controlled `pnpm backup:daily` deployment command.

If a capacity run is interrupted, `PMP_PERFORMANCE_RESUME_WORKSPACE_ID` accepts only the exact named synthetic owner/workspace in the isolated test database. The runner validates the contiguous committed purchase indices and resumes missing batches rather than disabling constraints or fabricating evidence. `PMP_PERFORMANCE_RETAIN_FIXTURE=true` retains that guarded fixture for diagnosis; remove it with the guarded named-fixture helper after review. The default run cleans up its fixture. Retained fixtures and test results are not production backups.

Build Linux artifacts with `docker build --target web --tag pmp-v1-c5-web .`, then the corresponding `worker` and `backup` targets/tags. `pnpm verify:containers` checks all three images against the isolated test database on the Compose network. It does not expose a public port, overwrite a running development service or pass administrator/migration credentials to the runtime containers. Alternate CI networks can set `PMP_TEST_DOCKER_NETWORK` and `PMP_TEST_DOCKER_DATABASE_HOST`.

## Salapiya acceptance criteria and test strategy (product blueprint section 19)

### 19. Acceptance criteria and test strategy

The legacy web tests are evidence sources and reusable scenarios, not proof that the new system works. Test pure Dart rules, native widgets, local SQLite transactions, remote PostgreSQL commands/security, sync integration, and real Windows/Android flows. Use shared fixture inputs/expected outputs across client/server implementations to prevent financial drift. Run focused checks during development and consolidated relevant regression gates before milestones; do not repeatedly run unrelated broad suites without a reason.

The scenarios below supplement, rather than replace, the inherited domain acceptance sets. In particular, map all 40 accepted Shared Expenses scenarios and the existing debt/card/planning rejection cases to new tests or an explicitly documented equivalent. A shorter native test list must not silently discard a supported workflow.

#### 19.1 Required acceptance scenarios

| ID | Scenario | Required result |
| --- | --- | --- |
| A01 | Fresh install in airplane mode | Create a local profile, open core features and save/read records without a backend. |
| A02 | Local financial save followed by immediate process kill | On restart either the whole action exists with its evidence or none does; no partial journal. |
| A03 | Connect populated Android profile to Google; open Windows with same account | Resume safe enrollment/download; one profile, original history and no repeated opening balances. |
| A04 | Connect Google with an existing remote profile to a different populated local profile | Clear safe choice; no automatic merge/overwrite; cancel preserves local data. |
| A05 | Two devices record distinct expenses offline then reconnect | Both accepted once and derived balances converge; last-write-wins does not discard either action. |
| A06 | Server commits but upload response is lost | Retry yields original receipt; no duplicate action, settlement or private posting. |
| A07 | Concurrent correction or competing final debt payments | Stale/incompatible operation enters review; genuine local intent is preserved and no liability is silently over-cleared. |
| A08 | Shared PHP100 bill split three ways | Deterministic PHP33.34/33.33/33.33 shares, payer/share sums equal total and group positions sum to zero. |
| A09 | Shared PHP1,200 dinner with payer consuming PHP400 | Private cash -1,200, personal expense 400, receivable 800 exactly once; other members' private ledgers need their own authorization. |
| A10 | Shared card-funded expense, correction and refund | No duplicate card liability/spending; received-money and consumed-share effects remain distinct. |
| A11 | Partial/selected/multi-bill settlement, advance, dispute and reversal | All existing source caps and confirmed/projected distinctions hold; confirmation/reversal never repeats cash movement. |
| A12 | Owner device off/lost | Other members can use the service; same-account recovery restores owner access without becoming a new participant. |
| A13 | Removal while member offline; later upload and history refresh | New group writes rejected, permitted history retained, unrelated later records excluded; private evidence survives. |
| A14 | Foreign IDs, forged commands or manipulated sync subscription | No private/group data leak or cross-owner write; replication filtering independently tested. |
| A15 | Expired Google session or cloud outage | Existing private data remains locally usable; sync pauses with an honest status and resumes safely. |
| A16 | Debt import, borrowing/net proceeds, payments, unknown allocation, schedule revision and payoff | All inherited monetary classifications, immutable mappings and dependent-record restrictions hold. |
| A17 | Card statements, allocations, overpayments and installment revision/application | Retain provider-evidence meaning and separate cash/liability/spending; reject invented or stale allocations. |
| A18 | Recurrence, budget, savings and forecast integration | Plans do not post money; budget overlap/basis preserved; reservations do not duplicate assets; forecasts disclose source overlap/uncertainty. |
| A19 | CSV preview/post/retry/cancel and cutoff rebase | Correct interpretation, duplicate review, preserved committed batches and exact opening/history equation. |
| A20 | Career interview, personal event and tracker deadline | Appear once from authoritative sources; completion/archive cancels stale reminders without deleting history. |
| A21 | Report with pending work or incomplete initial sync | Correct inclusion/freshness labels; never present an incomplete sum as a complete balance. |
| A22 | Portable backup restored to a new device without old credentials/keystore | Recover private data and declared attachment coverage with the recovery secret; require online identity for current group access. |
| A23 | Old backup with already accepted/pending commands reconnects | Reconcile receipts/current state; do not replay old money or resurrect revoked membership/deleted records. |
| A24 | Corruption, disk full, wrong passphrase and interrupted schema upgrade | No false save/restore success; preserve recoverable data and an actionable recovery path. |
| A25 | Signed application update on both platforms | Data, identities, pending commands and compatible backups survive; unsafe downgrade is prevented/explained. |
| A26 | Keyboard/Narrator and touch/TalkBack, enlarged text, dark/light and reduced motion | Complete consequential tasks with accessible labels/focus/errors and without clipping or motion dependence. |
| A27 | Attachments absent offline, interrupted transfer and unsafe file | Honest availability; no unsafe preview or unauthorized access; independent records remain usable. |
| A28 | Account deletion/device revocation followed by restore or stale device reconnect | No regained authority; private removal and retained shared evidence follow the disclosed lifecycle policy. |

#### 19.2 Capacity and release evidence

Use realistic long-lived personal fixtures, including at least the legacy scale of 10,000 financial actions, multi-year history, multiple groups, debt/card schedules, Life records and bounded attachments, adjusted to the intended support contract. Record cold offline startup, local command latency, report/query latency, memory, first/full/incremental sync time, network volume and low-storage behavior on actual target devices.

Proposed initial usability targets to validate in P0/P6: common local saves should usually finish within 300 ms; ordinary local lists within 500 ms; a cold usable local screen within roughly 2 seconds; bounded reports within roughly 2 seconds. These are starting engineering targets, not measured guarantees or permission to hide work. Publish the actual fixtures and percentile measurements; slow complex operations need cancellable/progressive UX and explicit bounds.

Before private real-data release: all launch rows complete; all applicable A scenarios pass; no unresolved critical/high data-loss, financial-integrity or access-control issue; backup/new-device restore demonstrated; supported devices documented; real provider/file/signing configuration verified; quotas/budget and owner recovery procedures agreed. Test builds and historical web acceptance do not substitute for this gate.

## V3 change-impact acceptance

Assignment 2 supersedes the complete V1–V3 regression campaign. The selected local checks cover new trackers and materially affected contracts. Historical V1/V2 evidence remains in its original handoffs. A passing result below does not claim comprehensive, hosted, human assistive-technology or production acceptance.

| Changed contract / risk                                                                                                          | Selected evidence and actual result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Exclusions / rationale                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tracker reporting: current snapshot, recorded activity, version coverage, compatible progress, archive selection, ownership, CSV | **Pass:** report PostgreSQL cases, three new report API tests, existing `report-period` and `report-csv` unit files. Spoofed migration reason remains a user edit; command receipts identify real migrations. Manual completion dates create no historical transitions.                                                                                                                                                                                                                                                           | Finance/Career report implementations unchanged; their unrelated analytics suites reused.                                                                |
| Tracker foundation affected by integration and portability                                                                       | **Pass:** 20 tracker PostgreSQL cases covered across the initial 18-case run and added/impacted reruns; tracker validator, command API and component cases passed. Includes immutable history, nested-ID denial, concurrent stale updates, financial non-interference and partial migration replay/resume.                                                                                                                                                                                                                        | Unchanged A/B evidence retained; no additional full-domain cycle.                                                                                        |
| Agenda source union, civil deadlines and stable routes                                                                           | **Pass:** new tracker projection, completion/reopening, archive/restore and migration-unmapped deadline cases; five existing `list-agenda-items` cases; Agenda API/component files.                                                                                                                                                                                                                                                                                                                                               | External provider sync excluded.                                                                                                                         |
| Reminder concrete FK union and worker source contract                                                                            | **Pass:** tracker dismiss, override/snooze, generation/cancellation; tracker worker scheduling/title-edit deduplication/completion cancellation; accepted tracker delivery retirement across older restore. Five affected existing notification cases cover ID-only enqueue, historical suppression, date generations, quiet hours/timezones and worker isolation. Reminder API/component checks passed.                                                                                                                          | Real provider activation excluded; use existing local/test adapters. Unmodified provider reconciliation and retry campaigns reused.                      |
| Module preferences, bootstrap, onboarding, Dashboard and navigation                                                              | **Pass:** 10 preference/onboarding PostgreSQL cases; affected bootstrap/module/onboarding/Agenda/Dashboard API and component files; Dashboard service contract and one actual financial snapshot regression. Browser hide/restore retains an entry and keeps Agenda preference independent.                                                                                                                                                                                                                                       | Whole historical UI/browser campaign excluded.                                                                                                           |
| Nine-table graph, literal values, legacy fingerprints, current/predecessor pointers and partial migrations                       | **Pass:** own/foreign graph replacement and recovery; partial running migration restored as cancelled then explicitly resumed after ID remapping; exact literal `user_id`/`workspace_id` values, receipt/audit preview samples; malformed current state rejected. Original V2-H and V2-I provenance/cash preserved. Existing export/recovery/replay, remapping/cash, graph-column alignment, retained provider evidence and independent SQL injected-proof rejection checks passed. Shared portability-upgrade unit check passed. | Full encrypted infrastructure recovery unnecessary for the unchanged backup transport. Existing graph row/byte limits and financial assertions retained. |
| Lifecycle and private/shared evidence                                                                                            | **Pass:** pending deletion blocks tracker writes; all nine populated tracker tables purged by the real lifecycle operator while shared evidence and another private owner remain preserved. Selected shared-history restore/provenance regression passed.                                                                                                                                                                                                                                                                         | Complete historical lifecycle/backup campaigns excluded.                                                                                                 |
| Forward SQL, role grants, RLS, schema drift                                                                                      | **Pass:** focused fresh chain and accepted 125-table/202-migration upgrade, sentinel preservation and migrator replay; nine forced-RLS tables; worker SELECT limited to entry/tracker; auth/queue denied; predecessor/current pointers constrained. `db:generate`: 125 tables, no drift. Local development/test migrations applied. Final inventory: **125 tables / 206 migrations through 0205**.                                                                                                                                | Complete historical migration business campaign not repeated. Published 0000?0201 SQL/snapshots/journal entries preserved.                               |
| Production UI and static quality                                                                                                 | **Pass:** three focused browser scenarios: preset entry ? Calendar ? completion/report/CSV ? graph replacement; custom publication/migration; navigation preferences. Mobile light/dark screenshots inspected, keyboard focus and axe passed. TypeScript and affected ESLint passed. Final supported Linux production build passed with receipt-value fix.                                                                                                                                                                        | No redesign or human screen-reader claim. No container fleet/capacity campaign.                                                                          |

Selected unit/API/component files include `trackers`, `api-v1-trackers`, `trackers.component`, `tracker-reports-api`, `shared-portability-upgrade`, `report-period`, `report-csv`, `workspace-preferences-form.component`, `onboarding-progress`, `getting-started-panel.component`, `onboarding-step-controls.component`, `api-v1-onboarding-route`, `api-v1-onboarding-step-mutation-route`, `api-v1-module-preference-mutation-route`, `api-v1-me-route`, `private-app-bootstrap`, `api-v1-agenda-route`, `agenda-list.component`, `reminders-api`, `reminder-controls.component`, `dashboard-service`, `dashboard.component` and `dashboard-api`. Existing suite assertions were preserved; virtual module/guide expectations now include Trackers.

Reproduce the PostgreSQL selection with `pnpm test:integration` and the named files/patterns above. `tests/integration/trackers.test.ts` holds the new boundary cases. The partial foreign migration is a separate 15-second IO test; existing 5-second test budgets were retained. Browser selection: `pnpm exec playwright test tests/browser/trackers.spec.ts` against the isolated synthetic production server. Local Windows verification used the compiled Linux artifact for web runtime and installed Chrome, with only runtime credentials passed to the server and a separate restricted worker.

Observed failures were fixed and only affected checks rerun: reminder SQL aliasing, legacy fixture construction after graph extension, updated module/guide expectations, migration reason classification, dynamic receipt-value owner substitution, report JSX lint structure and a strict nullable TypeScript check. A Windows Vitest fork startup timeout was rerun successfully using one thread worker. Browser locator corrections selected the actual source link/combobox; product assertions remained intact. Production build reruns were required by those source/type corrections; no historical build/container campaign was performed. The existing local-file adapter tracing warning remains disclosed.

Automatic CI is unchanged and will be reported separately for the exact remote main SHA. No comprehensive local V1/V2 unit/integration/browser, historical benchmarks, hosted/manual or production acceptance is claimed.

The initial automatic CI run for `32441fb` passed project checks and all 1,104 unit tests. Integration reported 680 passes and one stale expectation in `get-current-user-overview`: its exact module array omitted the newly supported Trackers module. The fixture expectation was extended without removing any existing module assertions, and the affected PostgreSQL file was rerun. Later automatic CI outcomes are reported in the completion report; these hosted full-suite runs are separate from targeted local acceptance.

The next automatic run (`cdcc41d`) passed all 1,104 unit and 681 integration tests, every configured historical migration/upgrade check, shared migration verification and the build. Browser testing passed 60/62 scenarios; two axe checks sampled intermediate theme-transition colors in tracker reports and an existing shared private review. Both checks now await preference-save completion and finite DOM transitions before axe; all assertions and contrast thresholds remain unchanged. The two affected scenarios passed targeted reruns. The final automatic CI result is reported separately at the verified final SHA.

The subsequent run (`93dad38`) passed those pre-browser checks and 61/62 browser scenarios, including both theme checks. The remaining tracker replacement scenario used a text locator that also matched a hidden page copy. Its export/replacement controls now resolve within the accessible “Portable workspace” region, retaining the same real export, preview, confirmation and retained-entry assertions. The affected scenario passed a focused rerun; the final automatic result is reported separately.

## V1 operations

This runbook describes implemented controls and the remaining deployment prerequisites. A local acceptance run does not verify a paid deployment or a cloud retention guarantee. See `verification/V1_C5_ACCEPTANCE.md` for evidence and blockers.

### Environments and deployment

Use separate databases, credentials, auth secrets, encryption keys and email destinations for local, staging and production. `PMP_DEPLOYMENT_ENV` identifies the deployment; Next's `NODE_ENV=production` also applies to local production-build acceptance. Staging/production validation requires HTTPS authentication, Resend, a support email, an independent email encryption key/key ID and database URLs using `sslmode=verify-full`. Validate provider CA support; do not disable certificate verification to pass configuration checks.

Provision six restricted roles using `.env.bootstrap` only in a controlled bootstrap job. Run numbered domain migrations with `migration_owner`, then `pnpm jobs:migrate` with the same deployment credential to install/upgrade the pinned pg-boss-owned `pgboss` namespace and grants. pg-boss schema/version history is managed by the pinned library, outside the domain Drizzle journal. Run both migration commands once per deployment; neither web nor worker owns schemas or performs migrations. Confirm an empty chain, no-op repeat and last-release upgrade in staging before promotion. Never use schema push. Keep the old compatible image available; database rollback requires a reviewed compatibility plan rather than blindly reversing finalized evidence.

The Dockerfile provides non-root `web`, `worker` and controlled `backup` targets using pinned Node/pnpm. Release artifacts use `.next-release`; a concurrently running local development server retains `.next/dev`. Release TypeScript validates its own generated route types and excludes the other process's mutable development artifacts. Linux standalone artifacts must be built on Linux; Windows may deny standalone symlink creation, so local browser acceptance uses Next start against the production build. All three Linux images have been built and checked with `pnpm verify:containers`: no environment files or development test/migration packages, non-root execution, restricted web/worker credentials, no-store health, anonymous private-API rejection, graceful worker shutdown and matching backup client. This local container check does not validate a cloud deployment.

The architecture selects paid Render web/worker/PostgreSQL in Singapore, with private database networking and PITR. The account, paid plan, verified sender, private backup bucket, retention configuration and support destination have not been supplied. Do not label a production release complete or substitute a free database for the required durability without an explicit architecture decision.

`GET /api/health` returns only ready/unavailable, with no-store. It checks current domain columns, security-mail columns and queue schema connectivity. Health alone does not prove accounting, backup age or worker readiness. Monitor generic operational event codes, command/report latency, database waits, balanced journals, oldest security-mail queue age (target under two minutes), failed/dead jobs and backup/restore age. CI uses frozen dependency resolution, formatting/lint/types, tests, isolated migrations, build, browser acceptance and a production dependency audit. Hosted CI and staging/promotion evidence must be recorded separately from local checks.

### Financial form readiness

Corrections/refunds, debt payments and schedule revisions keep native editing controls disabled until hydration attaches handlers and form references. This prevents an early date edit from reverting to a default or becoming blank. Browser acceptance deliberately holds client-script delivery, verifies disabled server-rendered controls, releases scripts and checks the exact edited date in review and resulting history. No accounting assumptions or postings change through this readiness control.

### Durable security mail

Generate an independent random 32-byte secret encoded as 64 hex characters. Configure `EMAIL_PAYLOAD_KEY` and `EMAIL_PAYLOAD_KEY_ID` identically in the web and email worker. Keep historical keys independently recoverable for restore review; never print or commit them. `.env.worker.example` documents separate `queue_broker`, `auth_adapter` maintenance and `lifecycle_operator` connections. The worker sender does not need web-domain credentials. Use a verified Resend sender in deployed environments; Mailpit is local only.

Authentication callbacks write encrypted `ops.email_delivery` intent and an ID-only, versioned pg-boss job in one authentication-role transaction. Better Auth manages its own preceding user/token write; it does not expose that library transaction to this callback. A failed enqueue fails the callback and can be retried; it does not claim atomicity with a hidden library token transaction. The adapter's rollback proof covers the delivery intent/job transaction.

The worker consults delivery/source state and expiry, rechecks account lifecycle and serializes processing. It persists possible acceptance before network I/O. A fixed logical Resend idempotency key protects retries during the one-hour payload lifetime, within the provider's documented 24-hour deduplication window. Mailpit has no such guarantee: uncertain local acceptance is held rather than blindly resent. The worker records provider acceptance, not inbox delivery. It replaces terminal recipient ciphertext with a non-null zero-byte value and clears payload ciphertext, retains non-secret metadata for seven days, uses bounded exponential retries and a dead-letter queue, and emits fixed codes only. V2-G optional reminder email uses separate consent/evidence and independent delivery gates; see Scheduled Notifications below.

Drain or expire queued ciphertext before switching the single active email key. Seamless multi-key rotation is not implemented. Migration 0071 changes the terminal recipient representation; pause older workers during that coordinated migration and deploy the matching worker before resuming. The migration preserves forced RLS and limits its temporary data-fix policy to the migration owner and terminal records.

`WORKER_PAUSED` defaults to paused and must be explicitly `false` after deployment review. A restore must pause workers before reconnecting them. Process SIGTERM/SIGINT allows current bounded work to finish. pg-boss maintenance uses runtime DML with schema migration, automatic DDL/reindex and persisted sensitive warning payloads disabled. Separate deployment credentials handle schema evolution.

Worker queue/auth connections have five-second connection/lock limits, fifteen-second statement limits and a thirty-second idle-transaction limit. Lifecycle deletion retains its separately reviewed transaction limits. The optional loopback `WORKER_HEALTH_PORT` becomes unavailable after ninety seconds without a completed loop. The minute `worker_heartbeat` event contains only queued/uncertain count and `durationMs` as oldest queue age in milliseconds; alert at the two-minute age target rather than treating it as processing duration.

Migration 0072 removes a redundant deferred negative-balance review scheduled by the transient building insert. The review still runs on finalization and retains the same exact timeline/acknowledgement validator. Existing integrity rejects a building revision persisted at commit; direct-runtime missing-acknowledgement regression checks prove the guard remains active.

Capacity verification found repeated scans in debt validation and read models. Migrations 0074/0075 retain the same deferred guards while aggregating contractual satisfaction once and selecting exact liability candidates before the posted-journal join. Applied 0073 is an unchanged no-op. Debt page balances aggregate independently for the selected page; report balances use posted signed amounts without period-only charge enrichment, while period metrics reuse the shared classification definitions. The final chain has 76 numbered migrations. See the acceptance record's retained ten-year/100-user benchmark; rerun against the paid hosting plan before promotion. The local fixture is synthetic and removed after the benchmark/restore proof.

### Backups, deletion register and recovery

Production requirements are paid PITR with an actually verified window and a daily encrypted logical dump in a separate private S3 bucket. Configure bucket encryption, least-privilege backup identity, independent access/key recovery and expiration (architecture target: 30 days). Check policy and actual objects, not just a successful upload response. Do not store operational backups in the web container filesystem. PITR targets are RPO at most 15 minutes and RTO at most four hours; an off-provider daily dump can lose up to 24 hours. These remain targets until measured on the selected infrastructure.

Schedule `pnpm backup:daily` in the controlled `backup` image using `.env.backup.example`. It requires a separate full-read PostgreSQL backup identity, verified TLS and PostgreSQL 17, matching the image's client. That identity is deliberately outside ordinary runtime RLS roles and must never be passed to web or email workers. Dumps have a thirty-minute limit and a reviewed 256 MiB compressed-size cap; provision at least 1 GiB operator memory for encryption/readback buffers and review capacity before raising the cap. The independent 32-byte backup key/key ID is separate from the email key. The script writes an authenticated encrypted envelope and manifest to immutable, KMS-encrypted S3 objects and verifies decrypted readback. Upload success does not prove bucket privacy, independent account access, expiration or PITR. Scheduling and actual cloud evidence remain pending.

Restore into an isolated new database. Keep web access disabled and workers paused. Restore role ownership/grants, then verify migration versions, row counts, journal balance, account/report totals and real-role RLS. Reapply the independently retained deletion register before reopening restored records. Revoke restored sessions and verification tokens. Cancel or reconcile restored queued/uncertain security mail; never replay historic reminder delivery. Only reopen after the recovery checks pass and record measured RPO/RTO. Run drills monthly and after major data-model changes.

Lifecycle requests carry a seven-day grace period and exact reviewed scope. Purge uses the separate lifecycle operator, RLS, transaction-local target context and resumable phases; it never disables triggers or uses a normal runtime bypass. Large financial graphs exceeding the reviewed row budget require an operator review rather than weakening integrity. Minimal deletion tombstones and an independently stored register must outlast the oldest restorable backup. `pnpm lifecycle:register <new-independent-path>` exports IDs/dates only and refuses overwrites. The local export alone does not prove independently durable cloud storage.

`LIFECYCLE_AUTOMATION_ENABLED=true` enables worker maintenance only with a separately configured S3 bucket, region, KMS key and least-privilege identity. Before every purge step, the worker conditionally creates the exact ID/date checkpoint and verifies readback. A missing or conflicting checkpoint blocks purge. Retain deletion-register objects beyond the oldest restorable backup; do not apply the backup dump's thirty-day expiry blindly to this register.

The manual `lifecycle:purge` command also requires an explicit `PMP_DEPLOYMENT_ENV` in `.env.lifecycle`. Staging/production require verified TLS and the same independent S3/KMS checkpoint before every incomplete step. Local/test operator runs retain the reviewed non-cloud path; they establish no cloud durability guarantee.

`pnpm verify:restore` is a guarded local drill against `personal_management_test`. It creates only a uniquely named `pmp_restore_<32 hex characters>` database, restores an authenticated encrypted PostgreSQL custom dump, verifies counts/account/report totals/balanced journals and real-role isolation, invalidates restored authentication/queued mail, and reapplies an independently retained deletion register. It exercises both deletion requested after the backup and an already pending deletion restored from the backup, including replay after completion. An offline recovery administrator first authorizes the exact target/hash in that isolated database; the ordinary lifecycle operator then uses existing guarded deletion phases. The authorization table and recovery exception are unusable in ordinary databases. The script removes its uniquely named database and synthetic fixtures and writes sanitized evidence under ignored `test-results/restore-drill/`. It does not demonstrate a production PITR window, independent cloud access or backup expiration.

User-facing retention wording intentionally states that older backups may retain records until actual retention expires. It does not promise immediate backup erasure. Confirm external database/object-store retention and purge schedules before making stronger guarantees.

### Diagnostics and incident handling

The application logger accepts an allowlist of fixed event codes and bounded metadata. Pool and authentication errors discard raw error messages, SQL parameters and library arguments. Private API errors use safe messages and request IDs; no private payloads, tokens, amounts, recipient addresses or provider response bodies should enter operational logs. Audit evidence remains owner-scoped domain data rather than diagnostic output. Keep Sentry PII/replay disabled if an operator configures Sentry; no external Sentry project is currently configured.

For journal imbalance or unexpected duplicate economic evidence, stop financial writes and investigate immutable command/revision history. For unknown saves, use the original command receipt/replay. For stale previews, refresh source/version and review again. For uncertain email, inspect operational status and provider acceptance by message/logical ID without exposing encrypted payloads; do not redrive after provider deduplication has expired. For a purge/restore incident, keep access closed until the independent deletion register and ownership checks are reconciled.

### Scheduled Notifications (V2-G)

See `docs/reference/v2/SCHEDULED_NOTIFICATIONS.md` for the approved delivery contract.
`NOTIFICATIONS_ENABLED` defaults off independently of required authentication mail.
Consent is a private owner command, not a deployment switch. Configure the same
optional-delivery gate for web/status and worker environments. The worker's separate
`NOTIFICATION_DATABASE_URL` must use `worker_domain`; it can read the forced-RLS
reminder source graph, materialize reminders and write delivery/attempt evidence.
It cannot write financial facts, read auth identities, perform DDL or fabricate
inbound provider events. Webhook recording uses an authenticated, narrow
`auth_adapter` function; no worker/queue/operator secret belongs in the web app.

`jobs:migrate` installs the two V2 queues with the pinned supported pg-boss API.
Optional deliveries enqueue only opaque delivery IDs, atomically with their durable
records. Persistent consenting scopes and sources are scanned once per minute;
keyset discovery continues on the next pass if its 10,000-scope pass budget is met.
Each scope fails closed above 10,000 eligible source rows. Startup failures, scan
errors and dead letters require review; never enable a blind bulk redrive.

Mailpit remains local/test only. Real Resend reminder delivery additionally requires
`NOTIFICATIONS_EXTERNAL_ENABLED=true`, the reviewed verified sender/domain, quotas,
privacy/retention configuration, and `NOTIFICATION_WEBHOOK_SECRET` in the worker gate
and web callback environment. Register `/api/webhooks/notifications` for sent,
delivered, bounced and failed events. Raw-body verification uses the pinned Resend
SDK's Svix verifier, enforces its replay-time check and a 64 KiB body limit, and
stores only validated message/event IDs, kind and timestamps. No real delivery or
production infrastructure was activated for local acceptance.

Monitor `notification_backlog` count and oldest age (`durationMs`, alert above five
minutes), `notification_uncertain`, `notification_failed`, `notification_retry` and
`notification_dead_letters`. Events contain fixed codes and counts only. Attempted
or uncertain sends must be reconciled through authenticated provider evidence or
held. Never blindly resend them, even within a supposed deduplication window.
Accepted does not mean delivered/read. A later authenticated bounce can coexist with
historical delivery evidence. Proven rejection retries use the same logical key,
with at most three attempts. Terminal cancellation/suppression cannot replay.

Keep workers paused after restore. Cancel restored pending mail, hold attempted or
uncertain outcomes, reconcile provider effects outside the recovered cutoff, and
review/reconfirm optional consent before enabling delivery. Existing compact keys
must survive operational job cleanup; they prevent historical replay. Delivery,
attempt and provider evidence stays with the live workspace; scoped lifecycle purge
removes it child-first. Jobs expire within seven days. Actual diagnostic retention,
provider retention, sender verification, monitoring and recovery approval remain
infrastructure acceptance gates.

## V1 lifecycle operation

The web runtime accepts only owner-scoped review, deletion request and grace
cancellation. `/settings/lifecycle` previews all private record types, including
hidden modules, accounting/audit history, CSV export provenance and in-app
reminders. V1 has no server-stored CSV files, uploaded files or shared history.
Confirmation deletes this one personal workspace **and** its sign-in identity.
It is distinct from hiding, archiving and financial reversal/replacement.

A library password challenge, protected by Better Auth origins and persistent
five-attempt/minute limits, records a five-minute server proof. Renewal is not
proof. A request saves the exact count/type scope snapshot and command hash,
blocks all ordinary domain access, revokes sessions and validates revocation.
Unknown outcomes are checked through limited reauthenticated lifecycle access.
Cancellation requires a fresh proof, the matching pending request and an
unexpired seven-day grace period. Once purging starts, cancellation is forbidden.

Use the separate `.env.lifecycle` operator configuration, never the application
runtime, migration owner or administrator, for real purges:

```powershell
pnpm lifecycle:purge <request-uuid> 10000
```

Each invocation performs one durable step. Repeat until `completed`. Steps are
start/revoke, bounded projection batches, then one atomic private graph and
identity removal. The graph has a total row budget; a budget/dependency error
rolls back and leaves `failed` with its existing checkpoint. Review the budget
(maximum 100,000) and retry. Statements have a sixty-second timeout and locks a
five-second timeout. Monitor failed requests without logging private content.
Future table releases require reviewed operator grants and purge verification.

Export the minimal deletion register to a new file in an independently retained
controlled location; this includes request IDs and completion dates as evidence:

```powershell
pnpm lifecycle:register <new-register-file.ndjson>
```

The exporter never overwrites a file. Database tombstones are not automatically
expired until actual backup retention is verified. The `expires_at` date is a
recommended minimum of thirty days, **not** a claim that every backup expires
then. Before reopening a restore, reapply the independently saved register,
revoke restored sessions/tokens, keep deliveries paused and validate the restored
constraints, RLS, accounting and purge evidence. Production scheduling, provider
retention and this restore drill are V1-C5 acceptance gates.

Use the separate `.env.auth-maintenance` auth-adapter configuration to remove
expired sessions (including thirty-day absolute lifetime), five-minute proofs
and expired verification credentials in batches of at most 500 each. It also
removes global library abuse counters inactive for thirty days (at most 500);
these are separate from owner records and every active limit window is retained:

```powershell
pnpm auth:housekeeping
```

Session IP/user-agent metadata remains in auth storage until session deletion;
the UI exposes only estimated browser/device and timestamps, never IPs or tokens.
Deployment must schedule this maintenance and publish its actual cadence and
security-metadata retention. Direct development security emails still use the
existing adapter; durable delivery is a remaining production gate.

Configure `SUPPORT_EMAIL` to expose an email draft route. Without it, support
offers a copyable draft and states that a contact is unconfigured. Feedback does
not attach private records or claim delivery. CSV exports are selected report
data, not a complete restorable workspace backup. Retained backups may contain
deleted data; immediate backup erasure is never promised by this release.

## V2-H manual setup and production checklist

V2-H development does not authorize deployment. No secrets belong in this document, Git, screenshots, or test logs. Local protocol simulations do not establish production storage or malware-scanner readiness. Keep file features disabled until the checks below pass. Portable bundles exclude attachment bytes and authentication; they are not infrastructure backups.

### Configuration contract

| Variable | Purpose and source | Environments |
| --- | --- | --- |
| `FILES_ENABLED` | Explicit `true` enables the dedicated worker; default disabled | Staging/production after acceptance; controlled browser tests |
| `FILES_DATABASE_URL` | Restricted `worker_domain` connection issued through existing role provisioning; staging/production require `sslmode=verify-full` | File worker |
| `FILES_STORAGE_ENABLED` | Explicit `true` enables real object-store configuration | Web and worker |
| `FILES_S3_BUCKET` | Dedicated private evidence bucket created by the operator | Web and worker |
| `FILES_S3_REGION` | Bucket region from provider configuration | Web and worker |
| `FILES_S3_ENDPOINT` | Optional HTTPS S3 endpoint; leave blank for AWS | Compatible provider only |
| `FILES_S3_ACCESS_KEY_ID`, `FILES_S3_SECRET_ACCESS_KEY` | Dedicated evidence identity issued by provider IAM; use deployment secret storage | Web and worker |
| `FILES_SCAN_ENABLED` | Explicit `true` enables real scanner configuration | Web and worker |
| `FILES_CLAMD_HOST`, `FILES_CLAMD_PORT` | Private isolated clamd endpoint; default port 3310 | Web configuration validation; worker scanning |
| `FILES_CLAMD_TIMEZONE` | Must be `UTC`; scanner version evidence includes signature date | Web and worker |
| `FILES_TEST_ADAPTER_DIR` | Controlled synthetic adapter directory, exactly `<repository>/out/pmp-files-test-runtime` | Tests only, `PMP_DEPLOYMENT_ENV=local`, actual `personal_management_test` database, app/worker roles; never staging/production |
| `PMP_DEPLOYMENT_ENV` | Existing deployment classification (`local`, `staging`, `production`) | All |

Existing queue, lifecycle, backup, authentication, TLS and `WORKER_PAUSED` contracts remain required. Copy names from `.env.files.example`; inject values through secret management. Never reuse backup/default AWS identities or buckets. Preserve the deployed bucket/region/endpoint namespace mapping until all associated objects are erased; configuration changes do not migrate evidence. Credential rotation can retain the same namespace. Test adapters verify the actual database on every operation and simulate scan outcomes; they do not scan malware.

### Required human actions

1. Create a separate evidence bucket and IAM identity. Enable all four public-access blocks and verify the bucket policy is nonpublic. Disable bucket versioning completely: enabled or suspended versioning is deliberately unsupported because delete markers do not erase historical bytes. Configure encryption and restrict access to the evidence prefix. Permit only required object put/get/delete and bucket policy/version/public-access inspection APIs. Do not grant public ACLs, policy changes, backup access, bucket deletion, or unrestricted storage administration to runtime identities.
2. Verify provider support for conditional `If-None-Match` writes, SHA-256 upload/readback checksums, encryption evidence, and the bucket policy APIs. Unsupported S3-compatible providers fail closed. Install a scanner on an isolated private network with no public clamd endpoint. Set UTC, enforce memory/CPU limits, update signatures, and monitor update age (at most 48 hours; future timestamps at most five minutes). Test scanner failure and stale-signature behavior.
3. Provision the existing database roles and apply the complete forward-only migration chain with `migration_owner`. Provision the new pg-boss queue with `pnpm jobs:migrate`. Web uses `app_domain`; scan worker uses `worker_domain`; deletion uses `lifecycle_operator`. No web/worker process receives migration/admin credentials.
4. Supply dedicated file variables to both web and worker deployments. Any standalone lifecycle purge operator must also receive the same dedicated S3 configuration and namespace; scanning configuration is unnecessary for deletion. Keep all file flags disabled until staging acceptance. Ensure web request limits permit bounded 10 MiB raw file uploads and 10 MiB portable JSON bodies. Requests have bounded read deadlines. Scanner/storage failures leave quarantined evidence and retryable cleanup intent.
5. Run and monitor the worker and expiry maintenance. Reservations expire after 15 minutes, unlinked files after 30 days, portable export and recovery bodies after 24 hours. Quotas include pending/quarantined/unlinked/deleting objects until acknowledged deletion. Account purge must acknowledge object deletion before metadata is removed; unavailable storage blocks purge safely. Review failed scans, expired leases, pending deletion age, queue backlog, and worker health without logging content or credentials.
6. Establish independent backups for database and attachment bytes, with documented encryption, access separation, retention, restore testing and deletion-register handling. Database-only portability explicitly excludes bytes. A workspace with live files cannot be replaced without resolving their deletion/recovery; do not assume a JSON export recovers those bytes. Restored file metadata is unavailable/deleted. Keep notifications paused during infrastructure recovery and apply existing deletion tombstones/register checks before activation.
7. Verify cost and limits before selecting services: storage capacity, request charges, egress/download charges, checksum/policy API support, scanner compute/signature-update bandwidth, backup retention and object erasure behavior. No prices are assumed. Limits are 10 MiB per file, 1 GiB reserved and 1,000 live files per workspace, 500 CSV rows/1 MiB, 10,000 portable rows/10 MiB. Larger histories require a separately reviewed contract.

### Staging operational verification

- Upload a synthetic PDF/PNG/JPEG through an owned source record. Confirm no download before scanning, then matching checksum/size after a real successful scan. Check another account and unauthenticated requests cannot list, upload or download it. Verify attachment-only, no-store and nosniff headers.
- Use a scanner test signature in a synthetic file under an approved staging test procedure. Confirm quarantine/rejection and cleanup, never availability. Interrupt storage/scanner networking and confirm retries do not create availability or financial changes.
- Retry the identical upload command after a lost response. Confirm one object, one logical command and no financial posting. Test oversized/mismatched bytes and disabled/stale scanners.
- Unlink, explicitly delete, and purge a disposable account with attachments. Interrupt deletion and resume; verify actual provider object absence before database metadata disappears. Inventory evidence-prefix objects independently and investigate any object without durable metadata. This inventory is a production operations requirement, not a claim established by local adapter tests.
- Export a disposable workspace; verify consistent totals, explicit byte exclusions, authenticated expiry, preview blockers and notification consent reset. Download recovery within 24 hours and preview/reapply it through the normal workflow. Maintain an independent infrastructure backup for operational rollback beyond this support window.
- Confirm previously executed notification generations cannot replay after restoring an earlier snapshot or changing timezone, and fabricated provider history is blocked. Confirm expiry housekeeping removes artifact bodies and raw CSV support data while preserving compact posted provenance. Review production backup retention separately; application expiry does not erase older backups automatically.

### Status

- [x] Production S3 and clamd configuration contracts implemented; disabled by default.
- [x] Controlled local adapters provided for synthetic database/browser verification.
- [x] H persistence, security, services, APIs, UI, regressions, browser, encrypted recovery, runtime artifacts and the user-approved 10,000-action capacity profile accepted locally; results are in the development handoff.
- [ ] Dedicated production bucket/IAM, real scanner, deployment secrets and verified TLS configured by operator.
- [ ] Real-provider policy, scanning, deletion, inventory, monitoring and recovery acceptance performed.
- [ ] Backup/retention/cost review completed and independent attachment recovery tested.
- [ ] File features explicitly enabled only after these operational gates pass.

Optional enhancements include image metadata stripping, verified versioned-bucket erasure, byte-inclusive portable bundles and larger-history formats. They are not implied by the current contract. Automated acceptance results and remaining implementation issues are recorded in the V2 development handoff; unchecked production setup is distinct from local implementation acceptance.

### Household capacity verification

The user-approved default for pnpm verify:performance is 10,000 financial actions. Existing financial integrity assertions, latency budgets and concurrent-load checks remain enabled. PMP_PERFORMANCE_ACTIONS can explicitly select the original 50,000-action stress profile when desired; it is optional for routine household verification. This changes synthetic test volume, not application limits or accounting rules.

## V2-I manual setup and production checklist

October 16, 2026 (Asia/Manila). I1-I7 are locally accepted and all 40 approved scenarios passed; actual consolidated results are recorded in `v2/SHARED_EXPENSES_IMPLEMENTATION.md`. Production acceptance requires the gates below. No deployment or external invitation email was performed.

### Local setup

1. Use pinned Node 24.21.0, pnpm 12.9.1 and PostgreSQL 17.11. Run `pnpm install --frozen-lockfile` in the checkout. Retain ignored environment files and existing restricted role provisioning. Never use migration/operator credentials in the web process.
2. Back up before upgrading. Set `DATABASE_MIGRATION_URL` in ignored `.env.migration` to the migration-owner connection. Run `pnpm db:migrate`; use `pnpm db:migrate:test` only for the guarded synthetic test database. The chain has **200 migrations through `0199_v2_i_sealed_allocation_validation`**, extending the accepted H chain of 156. Do not edit published migrations or skip intermediate files.
3. Set `SHARED_EXPENSES_ENABLED=true` in the ignored local `.env` and restart `pnpm dev`. It defaults false. This is the complete-domain flag. Legacy `SHARED_EXPENSES_PREVIEW_ENABLED=true` still works only in local/test. Enabling the complete flag in production requires the release gates below; this assignment does not authorize deployment.
4. Sign in with a verified email. Open `/sharing` or choose **Split with people** in Add Expense. Create a group, add manual participants, then create bills with independent payer/share allocation. Money is PHP with exact centavo strings.
5. Before invitations or membership/settings changes, use the existing password verification flow. Its assurance lasts five minutes and is checked again by PostgreSQL. Create a secure invitation and hand it privately to the specified recipient. The recipient must sign in with that exact verified email, open the fragment link, review the history/balance, consent, and accept. Links expire after seven days. Revoke/reissue incorrect invitations; never merge identities by display name.
6. Adopt only your own allocation. Choose an existing private purchase when already recorded; otherwise explicitly approve new cash/card funding or an unpaid share. Private approval is independent for every participant. Group owners cannot approve or inspect someone else's books.
7. Report a full/custom/selected payment. Inspect per-bill allocations and the advance/reverse preview. A reported payment remains pending until the recipient confirms. An owner can record a manual/deleted recipient's receipt only with explicit limitation evidence; it is not authenticated recipient confirmation. Disputes do not change confirmed balances. Cancel/re-report obsolete pending allocations; reverse confirmed evidence with a reason. Resolve outstanding confirmations before removal: former registered members have read-only group history and need a verified new membership interval before further group transitions.
8. Link actual settlement funds once in private Finance. Pending funds use clearing. After confirmation/reversal, review classification with **keep actual funding**; a group reversal does not return money. Reuse the narrow closed-report relinking option only for the same real movement, parties, date and amount.
9. Record shared refunds as separate received/share-credit allocations. Review each owner's private refund separately. Corrected bills retain prior revisions. Stale private evidence stays unchanged until the owner approves a correction or records a reason to retain prior evidence. Retention records a reviewed difference, not synchronized amounts. Funding corrections require explicit acknowledgement; do not bypass linked-action guards using ordinary correction/refund commands or SQL.
10. For a follow-up, choose a personal date on the settlement and create a private Calendar event. Configure existing opted-in reminder/email settings on that personal event. Complete/cancel it manually when appropriate. No other member is subscribed automatically.

### Invitation delivery, reminders and maintenance

- Secure manual link handoff is the operational invitation channel. No group invitation email adapter is advertised or activated. Authentication mail and opted-in personal-event reminders use the existing mail system. If automated invitation delivery is desired later, it requires an explicit implementation and separately tested provider workflow; supplying credentials alone does not enable it.
- For existing opted-in email reminders, configure the approved Resend sender/domain and secret using `v2/SCHEDULED_NOTIFICATIONS.md` and the notification operations section of `V2_DEVELOPMENT_HANDOFF.md`. Verify opt-in, quiet hours, delivery, retries and uncertain outcomes in staging using consenting test recipients. External sending was not performed here.
- Use a pinned operator checkout with `pnpm install --prod --frozen-lockfile` for maintenance; the standard web/worker/backup images do not package this CLI. Keep its operator secret isolated from runtime workers. Schedule `pnpm exec tsx scripts/sharing/maintain-invitations.ts` at least hourly using ignored `.env.lifecycle` and `LIFECYCLE_DATABASE_URL` as `lifecycle_operator`. Deployed connections require verified TLS (`sslmode=verify-full`). Each invocation handles at most 100 groups without waiting on busy groups. Measure backlog before changing frequency.
- The command expires pending invitations, retires contact/bearer data 30 days after expiry, and compacts detailed claim reviews after 30 days. Compact consent, command uniqueness and financial evidence remain. Alert on failures, stalled schedules and retention backlog. Output uses aggregate counts. Never log tokens, URL fragments, invitation contacts, financial request bodies or private account identifiers.
- In staging, verify expired/revoked/retired tokens fail; changed manual-claim snapshots require a new review; removed inviters cannot authorize acceptance. Test an owner-created manual receipt and subsequent registered claim: the old receipt must retain its manual limitation.

### Private portability and recovery

- Private bundles include owned group ledger bindings, links, accepted source revisions and retained-source review/audit/receipt history. They exclude shared group authority and other participants' private records. A separate authorized group-history download is **non-restorable** and excludes invitation contacts/tokens and private funding.
- Restoring adopted private history requires an **unmodified, same-workspace trusted export or recovery download**. Server-side checksum provenance is outside uploaded bundles and survives private replacement. Modified and foreign adopted bundles are blocked. Do not edit money strings, remove bindings, or rebuild a bundle to evade this gate.
- Existing H format-2 bundles with the exact accepted H schema fingerprint normalize four absent private-group descriptors to empty collections after verifying the original checksum. They cannot contain group actions. No legacy money is altered. Unrecognized schemas still fail.
- A private restore never rewrites shared bills, group membership, settlement confirmation or refunds. Older restored acceptance may correctly need review against current shared sources. Review those differences after recovery. Retaining prior private evidence must preserve its own attributed receipt/audit; it must not post money.
- Preserve `ops.shared_bundle_proof` with database backups, not with user-controlled bundles. Do not expire permanent proofs while their corresponding historical exports are retained. Account deletion purges only that owner's proof/private graph. Configure deletion reapplication using the independent register before reopening a restored database.
- Existing H bounds remain: private/group JSON 10 MiB/10,000 graph rows, CSV 1 MiB/500 rows. Private bundles do not contain object bytes. Live file recovery and unresolved external notification delivery block unsafe replacement. See `V2_H_MANUAL_SETUP_AND_PRODUCTION_CHECKLIST.md` for object storage, scanning, retention and file recovery.

### Release gates requiring personal involvement

1. Review the accepted commit and local/hosted evidence. Build the supported pinned Linux web/worker/backup images; do not use Windows standalone symlink warnings as packaging acceptance. Do not deploy from an intermediate checkpoint or mixed-schema database.
2. Provision separate least-privilege secrets and verified TLS for web (`app_domain`/`auth_adapter`), queue/notification workers, migrations, lifecycle operations and backups. Verify non-superuser/non-bypass/non-inheriting roles, all 22 new forced-RLS tables, fixed-search-path helpers and grants. Worker/auth/queue roles must not enumerate shared tables. Run `pnpm db:check:runtime` with the intended runtime configuration without printing URLs.
3. Approve history/retention policy version 1. Joining exposes existing group bills. Exit retains bills visible then and their authorized subsequent resolution; unrelated later records stay hidden. Shared evidence is not privately owned workspace data. Free-text descriptions/reasons can still identify people after structured pseudonymization and need a legal/support policy.
4. Plan owner handoff before deletion. Approved deletion detaches the user's structured group identity, removes their private graph and preserves others' history. Ownerless groups archive automatically; they are not silently reassigned. Former participants retain read-only group history and can review/correct their own private evidence. Verify this in staging with the operator path and independent deletion register.
5. Configure encrypted backups/PITR, independent deletion register, backup-key custody/rotation, retention and least-privilege storage. Perform a production-like restore drill into an isolated environment, revoke old sessions, reapply approved deletions, verify shared net-zero positions and other-owner private/provenance preservation, then review reconciliation. Never restore users' identity links by importing group-history JSON.
6. Retain existing G/H external infrastructure gates: verified email provider, webhook secrets and replay protection; S3 IAM/lifecycle/versioned erasure; quarantine/scanner updates; object inventories/retention/backups. Missing real credentials did not block synthetic acceptance. No real mail/object operation or production restore is claimed.
7. Configure privacy-safe alerts for failed/stale commands, lock timeouts/deadlocks, missing confirmation, reconciliation backlog, invitation expiry/retention and operator schedules. Use aggregate codes and scoped IDs, not financial payloads. Verify restore, worker and backup health endpoints with deployed infrastructure before release.
8. Run staging scenarios across two verified accounts and one manual participant: invite/claim, equal/multiple-payer/card entry, partial pending/confirmed payment, dispute/reversal, settled refund/correction, independent private review, former-member visibility, deletion and restore. Check mobile, keyboard and assistive technology in the actual supported environment. Automated Axe checks do not replace human screen-reader validation.
9. Respect reviewed limits: 100 identities/group, 100 revisions/bill, 1,000 bills/refunds/settlements per group, 100 explicitly selected bill allocations per payment, 10,000 current source positions, 100 source revisions in manual-claim review. Read pagination and historical coverage labels are intentional. Profile a larger required capacity before increasing bounds. Suggestions are deterministic projections; indirect discharge/agreement automation is unavailable and no minimal-count claim is made.
10. Enable `SHARED_EXPENSES_ENABLED=true` only after approved staging/release policy. Roll back by disabling the flag and running the prior compatible image only when it understands the current private graph; do not roll database migrations backward or run H private replacement against I evidence. Prefer a reviewed forward fix or isolated full restore with deletion reapplication.

No production deployment, real provider acceptance or human screen-reader certification is implied by local automated acceptance. V3 and a broad visual redesign remain outside this assignment.

## V3 manual actions and deferred gates

No human-only configuration is required for the verified local V3 workflows. No production deployment or external integration activation is part of this assignment. Follow [ADR 0005](adr/0005-v3-scope-and-platform-transition.md).

| Conditional action         | Steps and verification criteria                                                                                                                                                                                                                                                                                             | Status                                                                                                                                              |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Another local checkout     | Use the pinned Node/pnpm versions and established private local environment; run `pnpm db:migrate` and `pnpm db:migrate:test`. Confirm 206 migration records through `0205`, 125 declared tables, and no drift from `pnpm db:generate`. Open `/trackers`; instantiate a preset and verify its entry deadline in Calendar.   | Existing development and synthetic test databases migrated. No credentials committed.                                                               |
| Optional reminder email    | Keep the existing local Mailpit adapter, explicit account consent, Trackers reminder preference and current eligible deadline. Verify one logical delivery, generic message content and cancellation on completion. Real provider activation requires a separately authorized assignment and the existing provider runbook. | Local/test adapters verified; real external delivery remains disabled.                                                                              |
| Human assistive technology | If later requested, use keyboard and a screen reader through template publication, migration confirmation, reports and replacement confirmation; verify accessible names, focus and announcements.                                                                                                                          | Automated axe, mobile reflow, keyboard and both themes verified. Human screen-reader testing was not performed and is not represented as completed. |
| Hosted execution           | Review automatically triggered repository CI at the exact pushed SHA. Keep the existing broader workflow enabled; distinguish its result from the selected local tests.                                                                                                                                                     | Final remote SHA and CI outcome recorded in the completion report.                                                                                  |
| Later platform work        | Create a separate approved design/platform plan before comprehensive redesign, Windows/Android, offline sync, external calendar synchronization or production infrastructure work.                                                                                                                                          | Deferred by scope; no configuration requested.                                                                                                      |

Workspace restore is a private graph replacement. Review its counts, ownership/remapping, cash totals and blockers before confirming. Attachment bytes and shared group authority remain excluded under the existing H/I rules. Recovery bundles expire after 24 hours. Restored partial template migrations remain frozen and require explicit resume; restored unprocessed previews may need a fresh preview after identity remapping. Retained provider evidence prevents replay and notification consent is reset.

The existing whole-project tracing warning from the local file adapter remains visible in the supported Linux build. Docker excludes environment files and ignored local artifacts; no new secret or deployment configuration was introduced. Full encrypted infrastructure recovery, hosted/manual acceptance and production readiness were not inferred from the focused graph recovery test.
