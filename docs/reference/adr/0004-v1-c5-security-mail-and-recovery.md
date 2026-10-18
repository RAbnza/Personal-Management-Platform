# ADR 0004: V1 security email and isolated recovery controls

- Status: Implemented; production acceptance remains conditional on deployment evidence
- Date: 2026-10-09

## Decision

Use pinned pg-boss for versioned ID-only jobs. Its public Drizzle adapter inserts
an encrypted email intent and queue job in the same authentication-role
transaction. Library migrations run separately as `migration_owner`; workers
perform restricted DML and never own schemas or migrate at startup. There is no
application-owned general outbox or external reminder delivery.

AES-256-GCM protects the recipient and token-bearing template payload with
delivery-specific authenticated context. Payloads expire within one hour.
Terminal records retain a non-null zero-byte recipient value and no payload;
non-secret operational metadata expires after seven days. Provider acceptance
is distinct from delivery. Resend retries retain their logical deduplication
key; uncertain Mailpit sends are held rather than blindly resent.

Because a migration owner's ordinary queries also obey forced RLS, email source
eligibility uses an exact-subject, migration-owner-only SELECT policy inside a
scoped scalar security-definer function. It restores its transaction-local
subject on success and failure. Queue runtime receives only function execution,
not access to private profile rows. Actual-role tests cover pending deletion,
cancellation, private-table denial and terminal secret wiping.

Before lifecycle purge, publish a minimal immutable deletion checkpoint to the
independently configured private S3 store and verify exact readback. A failed or
conflicting checkpoint stops purge. Logical backups use an independently keyed,
authenticated envelope and a separate controlled backup identity; neither web
nor ordinary worker obtains backup administrator credentials.

Restore into a uniquely named, isolated database with workers paused. An offline
administrator authorizes exact register hashes and targets there. The separate
lifecycle operator then reapplies deletion through the existing RLS and evidence
guards. Ordinary databases and runtime roles cannot insert that authorization
or use the recovery exception. Recovery does not disable triggers or RLS.

## Consequences

Local queue rollback/replay, real-role eligibility and isolated recovery can be
proved without claiming a deployed provider or retention guarantee. Production
requires a verified sender, paid database/PITR, independently protected keys and
storage, measured staging capacity, monitoring and a successful hosted CI run.
Key rotation requires draining or expiring existing queued ciphertext before
switching the single active key; seamless multiple-key rotation is not claimed.
