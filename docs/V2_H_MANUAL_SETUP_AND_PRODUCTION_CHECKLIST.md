# V2-H manual setup and production checklist

V2-H development does not authorize deployment. No secrets belong in this document, Git, screenshots, or test logs. Local protocol simulations do not establish production storage or malware-scanner readiness. Keep file features disabled until the checks below pass. Portable bundles exclude attachment bytes and authentication; they are not infrastructure backups.

## Configuration contract

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

## Required human actions

1. Create a separate evidence bucket and IAM identity. Enable all four public-access blocks and verify the bucket policy is nonpublic. Disable bucket versioning completely: enabled or suspended versioning is deliberately unsupported because delete markers do not erase historical bytes. Configure encryption and restrict access to the evidence prefix. Permit only required object put/get/delete and bucket policy/version/public-access inspection APIs. Do not grant public ACLs, policy changes, backup access, bucket deletion, or unrestricted storage administration to runtime identities.
2. Verify provider support for conditional `If-None-Match` writes, SHA-256 upload/readback checksums, encryption evidence, and the bucket policy APIs. Unsupported S3-compatible providers fail closed. Install a scanner on an isolated private network with no public clamd endpoint. Set UTC, enforce memory/CPU limits, update signatures, and monitor update age (at most 48 hours; future timestamps at most five minutes). Test scanner failure and stale-signature behavior.
3. Provision the existing database roles and apply the complete forward-only migration chain with `migration_owner`. Provision the new pg-boss queue with `pnpm jobs:migrate`. Web uses `app_domain`; scan worker uses `worker_domain`; deletion uses `lifecycle_operator`. No web/worker process receives migration/admin credentials.
4. Supply dedicated file variables to both web and worker deployments. Any standalone lifecycle purge operator must also receive the same dedicated S3 configuration and namespace; scanning configuration is unnecessary for deletion. Keep all file flags disabled until staging acceptance. Ensure web request limits permit bounded 10 MiB raw file uploads and 10 MiB portable JSON bodies. Requests have bounded read deadlines. Scanner/storage failures leave quarantined evidence and retryable cleanup intent.
5. Run and monitor the worker and expiry maintenance. Reservations expire after 15 minutes, unlinked files after 30 days, portable export and recovery bodies after 24 hours. Quotas include pending/quarantined/unlinked/deleting objects until acknowledged deletion. Account purge must acknowledge object deletion before metadata is removed; unavailable storage blocks purge safely. Review failed scans, expired leases, pending deletion age, queue backlog, and worker health without logging content or credentials.
6. Establish independent backups for database and attachment bytes, with documented encryption, access separation, retention, restore testing and deletion-register handling. Database-only portability explicitly excludes bytes. A workspace with live files cannot be replaced without resolving their deletion/recovery; do not assume a JSON export recovers those bytes. Restored file metadata is unavailable/deleted. Keep notifications paused during infrastructure recovery and apply existing deletion tombstones/register checks before activation.
7. Verify cost and limits before selecting services: storage capacity, request charges, egress/download charges, checksum/policy API support, scanner compute/signature-update bandwidth, backup retention and object erasure behavior. No prices are assumed. Limits are 10 MiB per file, 1 GiB reserved and 1,000 live files per workspace, 500 CSV rows/1 MiB, 10,000 portable rows/10 MiB. Larger histories require a separately reviewed contract.

## Staging operational verification

- Upload a synthetic PDF/PNG/JPEG through an owned source record. Confirm no download before scanning, then matching checksum/size after a real successful scan. Check another account and unauthenticated requests cannot list, upload or download it. Verify attachment-only, no-store and nosniff headers.
- Use a scanner test signature in a synthetic file under an approved staging test procedure. Confirm quarantine/rejection and cleanup, never availability. Interrupt storage/scanner networking and confirm retries do not create availability or financial changes.
- Retry the identical upload command after a lost response. Confirm one object, one logical command and no financial posting. Test oversized/mismatched bytes and disabled/stale scanners.
- Unlink, explicitly delete, and purge a disposable account with attachments. Interrupt deletion and resume; verify actual provider object absence before database metadata disappears. Inventory evidence-prefix objects independently and investigate any object without durable metadata. This inventory is a production operations requirement, not a claim established by local adapter tests.
- Export a disposable workspace; verify consistent totals, explicit byte exclusions, authenticated expiry, preview blockers and notification consent reset. Download recovery within 24 hours and preview/reapply it through the normal workflow. Maintain an independent infrastructure backup for operational rollback beyond this support window.
- Confirm previously executed notification generations cannot replay after restoring an earlier snapshot or changing timezone, and fabricated provider history is blocked. Confirm expiry housekeeping removes artifact bodies and raw CSV support data while preserving compact posted provenance. Review production backup retention separately; application expiry does not erase older backups automatically.

## Status

- [x] Production S3 and clamd configuration contracts implemented; disabled by default.
- [x] Controlled local adapters provided for synthetic database/browser verification.
- [x] H persistence, security, services, APIs, UI, regressions, browser, encrypted recovery, runtime artifacts and the user-approved 10,000-action capacity profile accepted locally; results are in the development handoff.
- [ ] Dedicated production bucket/IAM, real scanner, deployment secrets and verified TLS configured by operator.
- [ ] Real-provider policy, scanning, deletion, inventory, monitoring and recovery acceptance performed.
- [ ] Backup/retention/cost review completed and independent attachment recovery tested.
- [ ] File features explicitly enabled only after these operational gates pass.

Optional enhancements include image metadata stripping, verified versioned-bucket erasure, byte-inclusive portable bundles and larger-history formats. They are not implied by the current contract. Automated acceptance results and remaining implementation issues are recorded in the V2 development handoff; unchecked production setup is distinct from local implementation acceptance.

## Household capacity verification

The user-approved default for pnpm verify:performance is 10,000 financial actions. Existing financial integrity assertions, latency budgets and concurrent-load checks remain enabled. PMP_PERFORMANCE_ACTIONS can explicitly select the original 50,000-action stress profile when desired; it is optional for routine household verification. This changes synthetic test volume, not application limits or accounting rules.
