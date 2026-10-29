# Salapiya private release operations

Current procedures, 29 October 2026 (Asia/Manila). Version `0.6.1+8`.
**OWNER-APPROVED FULL RELEASE. Development COMPLETE.** The
[final release and project closure](FINAL_RELEASE_AND_PROJECT_CLOSURE.md) records
the owner's acceptance, final local artifacts/hashes and installation instructions
for the owner and three brothers. The existing infrastructure, backups and unsigned
Windows distribution are explicitly accepted. No public binary publication, paid
services, automatic migration or additional development milestone is authorized.

Historical [P6](P6_PRIVATE_RELEASE_HANDOFF.md) and
[post-P6](POST_P6_RELEASE_GATE_CLOSURE_HANDOFF.md) results remain unchanged.
Earlier mandatory-release-gate wording in these procedures is superseded by the
final scope decision; unexecuted checks remain unexecuted and deferred operational
capabilities remain limitations. Fail-closed restore, authorization, signing-key,
financial and data-preservation safeguards remain required and implemented.

## Build and environment boundaries

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
development-labelled pair accepted by the owner; do not change its environment
identity or bypass the pairing guards. Never run destructive fixtures/reset or
test-account deletion scripts against family records. The following separate-pilot
procedure is optional future infrastructure work, not a release prerequisite.
The initial audience is the owner and brothers only.
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

## Windows unsigned installer

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
The installer and application remain unsigned; the owner explicitly accepts the
Unknown publisher/SmartScreen warning for this full release. Verify the exact package
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

## Android signing and updates

Use the **existing** owner-controlled PKCS12 key:
`%LOCALAPPDATA%\Salapiya\signing\salapiya-private-release.p12`, alias
`salapiya-private-release`. Approved SHA-256 certificate:
`d45ef96f19ce9e9df9c23711bc9f843b2bb34350352f06aba347187980dc787e`.
Never generate a replacement, rotate it or edit its identity record to bypass a mismatch.
The owner has backed up the key and uses a password manager; do not request passwords in chat.

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
that output cannot pass signed acceptance. Clear it afterward. Normal owner signing saves
versioned logs, public signature metadata and a uniquely named retained APK under
`build/private-release/0.6.1-8/`, preserving P6 builds 6/7. Credentials are cleared afterward.

Before updating any real device: test an independently keyed encrypted archive restore;
retain the previous package and archive; verify package/certificate/version hashes; install
higher version code **without uninstall**; compare financial/Life IDs, pending envelopes,
accepted receipts, exact totals and backup compatibility after restart. Never use
`adb install -d`, replace the signing key or uninstall a real profile to force success.
An emulator update is not physical-phone acceptance. The owner's assisted checklist is in
the closure handoff; do not advertise untested Android/ARM64 or OS compatibility.
The final build 7-to-8 release-emulator update preserved UID and exact financial/Life
IDs/payloads; a fresh temporary Android user also activated the build-7 archive with its
separate OS keystore and re-exported matching records. These local-only archive results do
not certify nonempty connected pending/accepted receipts or interrupted updates.

## Local profile, device and account lifecycle

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

## Group departure and owner loss

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

## Five distinct backup mechanisms

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

## Approved backup schedule, retention and storage

The owner/operator owns this procedure. Policy is approved: after meaningful personal changes
and **before** upgrades/consequential maintenance; hosted export nightly while operated;
seven recent generations plus the latest generation in each of four completed weekly buckets;
two independent protected destinations; a monthly isolated restore and an additional drill
after schema, provider, key or consequential release changes. Recent/weekly sets may overlap;
missing weeks are not fabricated. Retention is generation-based and must not be described as
an automatic time-purge guarantee when backups stop.

Proposed concrete arrangement: a dedicated folder on an already owner-controlled encrypted
removable drive, rotated offline, plus a separate owner-controlled private NAS/off-site
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

## Isolated restore and stale-security reconciliation

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

## Quotas, monitoring and maintenance

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
