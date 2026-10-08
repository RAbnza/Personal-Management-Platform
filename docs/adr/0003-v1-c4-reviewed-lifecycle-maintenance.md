# ADR 0003: Reviewed V1 lifecycle maintenance

- Status: Accepted under the explicitly requested V1-C4 lifecycle scope
- Date: 2026-10-09

V1-C4 brings forward the documented deletion request, grace, scoped purge and
tombstone path. `ops.deletion_request` is the authoritative durable lifecycle
intent and checkpoint, not a replacement general job queue. The request commits
the blocked domain lifecycle before Better Auth revokes ordinary sessions through
its supported operation. A separately validated completion marker is written
only after all pre-request sessions are gone. A failed auth step returns an
uncertain result and leaves domain access blocked; a limited sign-in can inspect
or cancel during grace, or replay the same reviewed request after reauthentication.

The separately credentialed lifecycle operator invokes bounded maintenance
steps. It has no bypass-RLS, role membership, DDL or trigger-disabling capability.
Its private DELETE policies require a specific confirmed request after grace.
Immutable evidence triggers allow only deletion in that authorized scope. Ordinary
web requests receive no evidence DELETE or operator credential. Profile, workspace
and child locks follow the established global order.

Projection deletion uses bounded batches. The remaining private evidence graph
is an atomic phase with a reviewed total-row budget (default 10,000, maximum
100,000). If the budget or a dependency fails, the phase rolls back and retains
its durable checkpoint; the operator must review and retry. Partially purged data
never becomes active again. Four circular current-history pointers use deferred
`NO ACTION` delete checks so the complete graph can be removed without disabling
constraints. Current-version correctness and ownership remain checked at commit.

The deletion register exporter writes minimal IDs and dates to a new operator
file. Completion scrubs scope counts and progress. Tombstones have a thirty-day
minimum policy date but are **not automatically deleted** while actual retained
backup windows remain unverified. Export the register to independent controlled
storage and reapply it before reopening any restored database.

This resolves the C4 lifecycle dependency described in ADR 0002 without claiming
an unconfigured background scheduler. V1-C5 must configure and demonstrate
maintenance scheduling, independent register retention, backup expiry, restore
with tombstones, operational monitoring and durable security-email delivery
before production acceptance. pg-boss remains the selected general job system;
no in-memory queue or application-owned general outbox is introduced here.
