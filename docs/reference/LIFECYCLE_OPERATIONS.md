# V1 lifecycle operation

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
