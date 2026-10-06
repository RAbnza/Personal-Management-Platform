# ADR 0002: Defer durable job infrastructure to the S3 operations phase

- Status: Accepted
- Date: 2026-10-06

## Context

The system architecture originally places transactional job-enqueue proof in
the foundation milestone and identifies pg-boss as a first-slice dependency.

The database architecture defines a more explicit migration sequence:

- S0 establishes authentication, runtime roles, ownership and RLS;
- S1 establishes the financial ledger and its integrity rules;
- S2 establishes career, time and onboarding persistence;
- S3 establishes operational infrastructure, including pg-boss, operational
  email records and the database roles required by the worker.

The database architecture also requires pg-boss to own its internal tables in
the dedicated `pgboss` namespace and requires rollback-safe enqueue through the
same transaction as the domain mutation that produces the asynchronous intent.
If the supported pg-boss integration cannot provide that guarantee, an
application outbox may be introduced only through a separate ADR.

The first financial vertical slice is:

verified user → private workspace → optional setup → opening account → actual
income/expense → account history.

Opening an account, recording an ordinary income or expense, and reading
account history do not inherently require asynchronous work. Their required
correctness boundaries are the scoped PostgreSQL transaction, command receipt,
financial audit evidence, ledger invariants and workspace financial revision.

Introducing the complete queue subsystem only to satisfy milestone ordering
would also pull forward the `queue_broker` and `worker_domain` runtime roles,
the pg-boss-owned schema, worker lifecycle, retry behavior and operational
failure handling before a domain command requires them.

The current authentication implementation sends development verification and
password-reset email through the configured email adapter directly. That
behavior is sufficient for the current local-development authentication proof,
but it is not considered durable queued delivery and does not satisfy the S3
production operations gate.

## Decision

Implement pg-boss and the durable job-processing infrastructure in the S3
operations phase defined by the database architecture.

The first financial vertical slice may proceed before S3 only while its
commands have no required durable asynchronous side effects.

The earlier foundation requirement to prove transactional job enqueue is
therefore interpreted as a prerequisite for the first feature that requires a
durable asynchronous effect, rather than as a prerequisite for a synchronous
opening-account, income, expense or account-history command.

Before S3 is complete:

- domain services must not claim that an asynchronous side effect is durable;
- no ad hoc in-memory queue or fire-and-forget replacement may be introduced;
- no application-owned queue table may be created merely as a temporary
  substitute for pg-boss;
- a command that requires reliable asynchronous work must not ship without an
  explicitly approved queue milestone.

If a pre-S3 feature unexpectedly requires durable asynchronous work, development
of that feature must stop at that boundary. The project must then either bring
the relevant S3 queue milestone forward explicitly or adopt the documented
`ops.outbox` fallback through a separate ADR.

When pg-boss is introduced, it must:

- own its versioned tables in the dedicated `pgboss` namespace;
- use the restricted queue and worker database roles documented by the
  architecture;
- enqueue application envelopes through the existing transaction whenever the
  job is caused by a transactional domain mutation;
- prove that a rolled-back domain transaction cannot leave a committed job;
- use idempotent handlers with bounded retry and retention behavior;
- keep secret-bearing authentication or security payloads out of ordinary
  application logs;
- pass the S3 rollback, recovery and secret-handling integration gate before
  production use.

The existing direct authentication email adapter remains an interim
development behavior until the operational email-delivery path is implemented.
It must not be treated as the final production reliability design.

## Consequences

The financial vertical slice can proceed without prematurely introducing the
worker and queue subsystem.

The S1 financial model remains focused on financial correctness rather than
operational infrastructure that none of its initial commands require.

No new dependency on pg-boss, worker process, queue connection pool or
queue-specific runtime role is introduced during the opening-account work.

The project still retains the stronger transactional queue requirement. It is
deferred to the milestone where durable asynchronous behavior becomes an
active system capability; it is not removed.

Authentication email reliability must be revisited as part of S3 before the
application is considered production-ready.

Any future pre-S3 design that introduces required asynchronous side effects
must explicitly revisit this ADR instead of silently adding background work.