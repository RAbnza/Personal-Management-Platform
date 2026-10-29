# Salapiya — Final release and project closure

29 October 2026, Asia/Manila.

**Final application version: `0.6.1+8`.**

**Release status: OWNER-APPROVED FULL RELEASE.**

**Project development status: COMPLETE.**

## Owner acceptance and release authority

The owner personally tested and approved Salapiya and explicitly authorized full
release for the owner and their three brothers with the existing limitations.
This is the completed personal/family application, not a beta or trial.

The final release assignment accepts the existing encrypted backup/recovery,
Supabase/PowerSync infrastructure, financial/authentication/synchronization and
physical-device evaluation, unsigned Windows distribution, manual free-tier
monitoring, local-only attachments and narrow device scope. Advanced permanent
sole-owner recovery is deferred. These decisions supersede the earlier release
scope and mandatory-gate classification; they do not manufacture missing evidence.

The original [P6 handoff](P6_PRIVATE_RELEASE_HANDOFF.md) and
[post-P6 closure handoff](POST_P6_RELEASE_GATE_CLOSURE_HANDOFF.md) retain their
historical findings. Their BLOCKED classifications and pending checklists describe
the earlier approval boundary. Deferred requirements are owner-accepted limitations
under this final scope, not blockers or a new development milestone.

## Completed product scope

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

## Final artifacts and identities

The verified existing normal release binaries are promoted without recompilation
or modification. Version `0.6.1+8` remains appropriate because the application bytes
are unchanged; release approval does not require a new version or another signing
session. Android versionName is `0.6.1`, versionCode `8`; Windows application version
is `0.6.1+8`, installer DisplayVersion `0.6.1.8`.

Final local directory:

```text
E:\My Files\Personal Projects\Personal-Management-Platform\out\salapiya-release\0.6.1-8
```

| Artifact in that directory | Bytes | SHA-256 |
| --- | ---: | --- |
| `Salapiya-0.6.1-8-windows-x64-setup-unsigned.exe` | 15,574,840 | `dcc7e30e2dd488031f8165f8b50c5ff65c671ea0c3af67a5e75065fdb3b30611` |
| `Salapiya-0.6.1-8-android-owner-signed.apk` | 80,057,367 | `341be091a1211b4323cfc2073000c70e03e279d4c4aa04948c15cc2bbf7f025a` |
| `Salapiya-0.6.1-8-windows-x64-unsigned.zip` (complete runtime bundle) | 19,088,720 | `8125bd4fbd0a078a20403c0ee3a00ad00be11a2b197f1a5e3d6ea4518b861303` |

Exact installer path:

```text
E:\My Files\Personal Projects\Personal-Management-Platform\out\salapiya-release\0.6.1-8\Salapiya-0.6.1-8-windows-x64-setup-unsigned.exe
```

Exact APK path:

```text
E:\My Files\Personal Projects\Personal-Management-Platform\out\salapiya-release\0.6.1-8\Salapiya-0.6.1-8-android-owner-signed.apk
```

`SHA256SUMS.txt`, `release-manifest.json`, `INSTALL.md`, fresh Android signature/package
and packaged-icon checks, source identity results and historical installer proof
accompany the packages locally. Historical builds 6/7/8 and their evidence remain in
their original locations. No binaries are uploaded to GitHub, publicly published,
or sent to anyone. Local ignored output is not retained by a repository clone;
the owner should preserve the release directory separately.

Android package remains `dev.salapiya.salapiya`; callback remains
`dev.salapiya.p0://auth/callback`. The existing owner keystore was used for this APK;
no key was generated or rotated. Its verified certificate SHA-256 is:

```text
d45ef96f19ce9e9df9c23711bc9f843b2bb34350352f06aba347187980dc787e
```

Windows retains AppId `{6345880B-55F4-478B-BB8C-60D67321621C}`, profile identity
`dev.salapiya` / `Salapiya`, AUMID `Salapiya.Private.Development` and existing toast
CLSID. Historical development-labelled IDs remain stable to preserve updates,
callbacks, keys and notifications. The installer includes all 49 Flutter/native,
VC++ runtime and data files plus native icons; never distribute `salapiya.exe` alone.

## Installation and updates

Before updating, save an encrypted archive, keep its recovery secret separately,
and retain original attached documents and the previous package. Verify downloaded
or copied package hashes with `Get-FileHash -Algorithm SHA256` on Windows.

### Windows

1. Use the unsigned x64 setup EXE above on the owner's Windows 11 installation.
   Close Salapiya, run setup as the same Windows user and keep its existing
   installation location (default `%LOCALAPPDATA%\Programs\Salapiya`). Setup is
   per-user and includes its runtime dependencies.
2. Windows can display **Unknown publisher** or a SmartScreen warning because the
   installer and application are unsigned. Check the exact owner-provided file and
   SHA-256 before proceeding with the normal per-file run confirmation if offered.
   Do not disable SmartScreen, modify trust stores or purchase a certificate.
3. Launch Salapiya from Start. Existing users update in place; do not uninstall,
   remove the profile or copy data/key directories to force an update. Ordinary
   downgrades are rejected. Open the existing profile and check its records/sync
   status after launch. Installation does not itself grant cloud access.

The ZIP is an optional complete runtime copy; the EXE is the normal installer.

### Android

1. Copy the signed APK above to the intended phone. Open it from Files and, if
   Android requests it, allow installation from that specific file source. Install
   and open Salapiya; the source permission can be removed afterward.
2. To update an existing installation, install over it using the same application
   ID and owner signing certificate. Future updates need a higher versionCode
   than `8`. This final package is the same build `8` as the retained candidate;
   an installation already at that build needs no update.
3. If Android reports an incompatible signature or newer installed version, stop
   and preserve the profile. Never uninstall, clear storage, replace the keystore
   or force a downgrade to bypass the error. Keep the existing keystore and its
   password-manager entry for future signed updates.

Local profile creation works offline. Google connection is optional and uses the
existing Supabase/PowerSync pairing accepted by the owner; current session and
group permissions remain required. No new infrastructure or automatic data
migration is part of this release. Do not run destructive development fixtures,
reset scripts or test-account deletion against family records.

## Existing backup and recovery

In **Profile → Backup & recovery**, generate a recovery secret, save it separately,
confirm it is stored safely, and choose **Save encrypted backup**. Keep protected
copies after meaningful changes and before updates. The accepted retention policy
is seven recent generations plus four weekly generations in two independent
protected destinations; permanent destinations/scheduling remain owner-operated
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
[operations guide](PRIVATE_RELEASE_OPERATIONS.md).

## Owner-accepted limitations

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
- Recorded engineering support is the owner's Windows 11 x64 build 26200 host and
  Android 17/API 37 x86_64 emulators. APK ARMv7/ARM64 packaging and minAPI 24 are
  compatibility configuration, not physical-device certification. The owner accepts
  their own device evaluation; no additional phone model or brothers' device matrix
  is independently certified here.
- Human Narrator/TalkBack, every installed Google/deletion/callback/notification
  journey, connected pending/receipt and interrupted-update combinations, storage
  exhaustion, installed release performance and complete provider recovery were
  not newly executed. Historical partial/not-run results stay truthful. Existing
  financial/authentication/sync/device evaluation is accepted by the owner.

These are accepted operating limitations and optional future work. Public stores,
friends/general-audience distribution, custom updater, arbitrary tracker builder,
external calendar synchronization and cloud attachment transfer/scanning remain
outside the completed personal/family scope.

## Final verification and repository history

The [release history](RELEASE_HISTORY.md) distinguishes this final owner approval
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
The exact final SHA is also supplied to the owner and in the local repository-state
record alongside the artifacts, avoiding a self-referential SHA in this document.

Final closure uses `[skip ci]` to avoid another broad automatic acceptance campaign,
consistent with this assignment's minimum-check boundary and the repository's
prior approval-only workflow. CI definitions/assertions remain unchanged; skipped
CI is not reported as passed. No force push, history deletion, public binary
release, infrastructure deployment, service purchase or record migration occurs.

**Salapiya development milestone is COMPLETE.** Future enhancements are optional
maintenance/product decisions and do not reopen this owner-approved full release.
