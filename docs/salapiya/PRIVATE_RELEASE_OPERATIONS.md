# Salapiya private release operations

Status: P6 staging procedures, 28 October 2026 (Asia/Manila). The central decision
and executed evidence are in [P6 handoff](P6_PRIVATE_RELEASE_HANDOFF.md).
These procedures do not authorize distribution. No public store release or paid
service is selected. Source version is `0.6.0+7`; retain
`dev.salapiya.salapiya`, callback `dev.salapiya.p0://auth/callback`, existing
Windows company/internal names and notification AUMID/CLSID.

## Build, signing and installation

Use Flutter 3.47.7 / Dart 3.13.5, Node 24.21.0, pinned lockfiles and the tested
Windows/Android toolchains in the handoff. From the backend directory, run
`npm ci --ignore-scripts`, then `node prepare-p2.mjs`. This creates ignored public
client defines; it must never contain sessions, signing passwords, database keys
or administrator credentials. Builds against this configuration connect to the
existing development service, **not an isolated real-data pilot**.

From `apps/salapiya`:

```powershell
flutter pub get --enforce-lockfile
dart format --output=none --set-exit-if-changed lib test integration_test tool
flutter analyze --no-pub
flutter test --no-pub --concurrency=1
flutter build windows --dart-define-from-file=build/p2-public-defines.json
```

Run native builds/tests serially within each checkout. Flutter 3.47 filters
development-only plugins while regenerating platform tooling during the build
pub phase. Keep the locked resolution above, allow that phase for native builds,
and review any lockfile change. Do not reuse `--no-pub` after switching between
integration/debug and release configurations. Use a separate validated worktree
for concurrent platforms; never share generated release caches.

Windows staging: `scripts/salapiya/package-windows.ps1 -BundleOnly` packages the
complete Release folder, including Flutter data and native plugins. The ZIP is
unsigned staging and is not an installer. The Inno Setup 6.7.3 recipe is
`apps/salapiya/windows/packaging/salapiya.iss`. Set `SALAPIYA_ISCC` to a locally
verified compiler and run the wrapper without `-BundleOnly` to compile it.
Compiler download: [official Inno Setup page](https://jrsoftware.org/isdl.php).
The 6.7.3 installer release SHA-256 reported by the official GitHub release is
`9c73c3bae7ed48d44112a0f48e66742c00090bdb5bef71d9d3c056c66e97b732`;
verify its Authenticode signature/publisher independently. Installing the compiler
was rejected by automatic approval review in this environment ("blocked by
policy"); installer compilation and execution are unexecuted.

The per-user installer preserves app-support data, registers the existing callback,
adds Start/optional desktop shortcuts, and refuses a lower installed version/build.
Its signature configuration is deliberately staging-only. Before release, use an
owner-approved trusted signing identity to sign the application executable and
installer, enable signed uninstall support and verify timestamp/signature with
the Windows SDK SignTool and `Get-AuthenticodeSignature`. Retain the full bundle;
do not copy only `salapiya.exe`. Verify supported machines have the required VC++
runtime. Do not disable SmartScreen or add certificates to a trust store as a
test shortcut. [Microsoft signing guidance](https://learn.microsoft.com/en-us/windows/msix/package/signing-package-overview)
distinguishes trusted production signing from self-signed development. No
certificate purchase or trust-store change is authorized here.

Android release signing uses four process environment variables:
`SALAPIYA_KEYSTORE` (absolute external path), `SALAPIYA_STORE_PASSWORD`,
`SALAPIYA_KEY_ALIAS`, `SALAPIYA_KEY_PASSWORD`. Supply **all four**. Obtain passwords
from an owner-controlled password manager in the local build session; never pass
them in shell history, chat, Dart defines, CI logs or Git. The Gradle release
task fails without credentials. Keep the keystore outside the repository and
retain encrypted, separately stored recovery copies and certificate fingerprint.
Use the same signing certificate for every update. A first private release cannot
update a development APK signed by a different debug certificate; do not uninstall
an existing profile to get past this error. First demonstrate portable recovery
on an isolated device before planning any explicit owner-authorized transition.
[Android signing requirements](https://developer.android.com/studio/publish/app-signing).

The owner authorized key creation during P6. Use
`scripts/salapiya/sign-android-interactive.ps1 -Keytool <Android-Studio-JDK-keytool>
-AndroidBuildTools <installed-build-tools>` in a local interactive console.
For a validated isolated worktree inside `out`, pass
`-ApplicationDirectory <worktree/apps/salapiya>`; place only public client defines
in that application build directory. The same external keystore remains in use.
It permits one signing session at a time, creates a protected per-user directory
outside Git, preserves an existing key,
uses RSA 3072/SHA256withRSA/PKCS12 with 10,000-day validity, and requests an
owner-chosen password through PowerShell's masked SecureString prompt, with
confirmation before creating a key. Asterisks provide typing feedback. It passes
the password to **keytool** through a temporary process environment variable,
sets only process environment variables, builds without a persistent Gradle daemon,
clears them afterward and compares the APK certificate digest with the exported
public certificate. It generates no password and never puts one in argv/config.
No transcript should be enabled. The alias is `salapiya-private-release` and the
owner-controlled location is `%LOCALAPPDATA%\Salapiya\signing\salapiya-private-release.p12`.
Preserve this keystore and password separately in two encrypted backup locations;
verify a recovery copy using keytool locally. Loss of this identity can prevent
future updates. Do not send the file/password to chat or commit it.

```powershell
# With the four environment variables securely provisioned:
flutter build apk --release --dart-define-from-file=build/p2-public-defines.json
# Verify with the installed Android build-tools apksigner:
apksigner verify --verbose --print-certs build/app/outputs/flutter-apk/app-release.apk
```

Reject a debug certificate, unexpected package ID/version or missing signature.
For packaging inspection only, setting `SALAPIYA_UNSIGNED_STAGING=true` explicitly
permits an **unsigned** optimized APK. This cannot pass signed-release acceptance
or install as an update. Clear that environment variable after the staging build.
Debug/emulator acceptance also cannot certify a release APK.

Before any real update: create a portable encrypted backup and independently test
its recovery; record package/certificate/version hashes; retain the previous
installer and compatible archive; install a higher version **without uninstall**;
reopen and compare exact profile/financial/Life IDs, original pending envelopes
and receipts; exercise callback/notifications/files; restart and repeat the
comparison. On failure preserve database/WAL/SHM, activation descriptor and keys.
Do not force a downgrade or reset a profile. Android's normal package manager
rejects lower version codes; never use `adb install -d` as a release procedure.
Both platforms still require actual signed upgrade/interruption drills.

## Portable backup and recovery

Cloud synchronization, portable archives and hosted database backups have different
purposes. Sync copies accepted state; it is not an independent historical backup.
The app's portable archive contains private commands/drafts/preferences and declared
Life/financial metadata, encrypted with a separately generated recovery secret.
It does **not** contain OS keys, sessions, group authority, notification permissions
or original attachment bytes. Retain original financial and Career documents
independently; an archive alone cannot recover them. Do not call metadata a file
backup. Restore originals only after exact size/checksum verification.

Save the archive and recovery secret in separate owner-controlled locations. A
recommended pilot policy, **pending owner agreement**, is a backup after meaningful
changes and before each update, with seven recent and four weekly generations on
two independent storage locations. Quotas/privacy determine actual retention.
Periodically test a fresh-profile restore using only archive plus secret, compare
exact command/source IDs and balances, and verify wrong-secret/corrupted archives
fail without activating an empty replacement. Never test by removing a real
profile's key. A wrong/missing protected descriptor is a recovery condition, not
permission to create another empty database.

Connected restores hold old intent for current authenticated original-receipt
review and current downloads. Do not re-enqueue an accepted action under a fresh
ID or overwrite newer cloud history. Reauthentication is necessary for current
group authority; an old archive cannot grant removed membership. Restore to a
fresh isolated profile/device, never merge into an active private database.

The operator must also establish encrypted off-site PostgreSQL logical backups,
include the Salapiya schemas, receipts, entitlements, migrations and required
roles/auth relationships, and demonstrate restore to an **isolated** PostgreSQL
instance. Keep provider secrets out of command arguments/logs. Validate RLS,
grants, receipt uniqueness and a bounded independent client resync after restore.
Do not restore into the live development/pilot database as a drill. No hosted
restore drill was performed in P6. Supabase Free does not include automatic
database backups; its [backup guide](https://supabase.com/docs/guides/platform/backups)
recommends independent exports and explains that database backups exclude object
bytes. A provider export is sensitive data, not a repository artifact.

## Service operation and incidents

The owner/operator controls Supabase, Google OAuth, PowerSync and signing keys.
Application group ownership never grants provider administration or private
ledger access. Before admitting real users, establish an isolated pilot boundary
or approve and document a safe separation strategy. Existing hosted acceptance
scripts deliberately append to dedicated synthetic profiles; **never point them
at a pilot dataset**. Do not reset hosted resources, prune immutable receipts,
clear replication slots or create keep-alive traffic to make a check pass.

Read-only diagnostics: `node p6-audit.mjs`, `node p2-inspect-health.mjs`, and
`node inspect-health.mjs` from `services/salapiya/p0`. They verify the intended
project/instance before querying and emit aggregate counts/health rather than
financial contents. Preserve original command IDs and failure categories when
diagnosing waiting/rejected work. Do not paste tokens, account notes, provider
secrets or raw financial payloads into support reports. Ask the user to keep a
portable backup before consequential repair. An uncertain result is resolved by
the original receipt, never a duplicate submission.

During an outage keep encrypted local data/queues available. Confirm provider
health and current session, then use Sync now and verify receipt **and** downloaded
coverage. After inactivity, reactivate through provider controls; a full download
may be necessary. Do not replace keys or accounts. Watch retained WAL/replication
lag while the consumer is unavailable; escalate storage pressure before quotas
are exhausted. Partial downloads must retain incomplete balance labels.

For suspected unauthorized access: stop distribution; preserve protected evidence;
revoke affected sessions through the provider; rotate the specific compromised
credential, redeploy only affected adapters, and verify foreign-access negatives.
A still-valid copied JWT may retain read access until expiry even after session
revocation. Do not promise immediate device-read revocation. Remote device/account
deletion, key rotation and owner-loss recovery require a documented, rehearsed
operator procedure; current UI is not a complete device administration service.
Group ownership can be transferred by an authorized owner; loss of the only owner
identity has no certified administrative recovery path. Do not impersonate an
owner or rewrite private/shared evidence as a support shortcut.

## Quotas, files and maintenance

Checked 28 October 2026: [Supabase Free](https://supabase.com/pricing) lists a
500 MB database, 5 GB uncached egress, 1 GB file storage and inactivity pausing.
[PowerSync Free](https://powersync.com/pricing) lists 500 MB hosted data,
2 GB monthly synchronization and 50 peak clients, with inactivity deactivation.
Check actual dashboards monthly and before new devices/full resyncs; aggregate
database bytes and logical payload bytes do not equal billed usage. Alert at
70%, investigate at 85%, and stop audience expansion at 90% of a relevant limit.
These thresholds are proposed operator policy, not provider enforcement.

Fewer than 20 users with two devices each can approach the client limit, and
10,000-action histories plus immutable receipts/indexes, repeated downloads and
backup exports consume bytes regardless of user count. No paid tier is approved.
Do not auto-upgrade or use artificial traffic to avoid inactivity. Obtain a
specific budget decision if measurements exceed free limits.

The owner explicitly approved **local-only attachments for this private release**
during P6 on 28 October 2026. This supersedes the blueprint's cloud-byte launch
requirement for this private release only; it does not certify a cloud adapter.
Financial/Career metadata may sync, original bytes stay device-local and unscanned,
and portable archives contain no original files. Back up originals independently;
other devices require exact original reselection. Cloud attachments are deferred
outside this private-release boundary and must not be advertised as available.

No private object bucket, upload/download, quarantine scanner or cross-device byte
recovery has been certified. A mature scanner such as ClamAV
still requires maintained signatures, execution capacity, quarantine, ownership
checks, content integrity and fail-closed release. Supabase's private-bucket RLS
and type/size restrictions are [access controls](https://supabase.com/docs/guides/storage/buckets/fundamentals),
not a malware verdict. No unattended free scanning service is configured here.
Future options are a separately scoped, measured private storage/quarantine adapter,
owner-approved managed scanning/budget, or an **explicitly approved** local-only
launch policy with independent original-file backup (now explicitly approved here).

Before each candidate, run `node scripts/salapiya/audit-dependencies.mjs` from the
root and review upstream advisories. It fails when matching advisories exist.
The scope excludes the full OS/JDK/NDK/Flutter-engine/SQLite supply chain; maintain
those toolchains separately. Never run blanket dependency upgrades or alter
financial fixtures just to obtain a green result. Pin reviewed fixes and rerun
the affected security/native boundaries. The current CLI's bundled npm advisories
remain recorded in the central handoff; an installed app does not contain npm.

Verify actual packaged icons with `scripts/salapiya/verify-packaged-icons.py`,
binary Android XML with `aapt2 dump xmltree`, manifest/version/signing metadata,
and artifact SHA-256. The icon generator uses only the committed official mark;
it creates native release resources and never captures application UI.
No screenshots, goldens or image-based test reports are part of P6.
