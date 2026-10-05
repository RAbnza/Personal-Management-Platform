# ADR 0001: Use Better Auth session freshness instead of a custom session-assurance table

- Status: Accepted
- Date: 2026-10-06

## Context

The database architecture defines an optional application-owned
`auth.session_assurance` table for recent-password assurance.

Its intended behavior is:

- assurance is bound to an authenticated session;
- consequential actions require authentication no older than five minutes;
- normal session renewal must not refresh that assurance;
- a successful new authentication may establish fresh assurance.

The architecture explicitly allows the table to be omitted when the pinned
authentication library provides an equivalent server-owned freshness mechanism.

The project currently pins Better Auth 1.7.7 and initially supports
email/password authentication.

Better Auth 1.7 determines session freshness from the session's original
`createdAt` value. Normal session expiration refresh updates the sliding
expiration but does not move the original session creation time.

## Decision

Do not create `auth.session_assurance` while the application uses the current
Better Auth session-freshness behavior.

Configure Better Auth with:

- a seven-day ordinary session expiration;
- a one-day session-refresh cadence;
- a five-minute `freshAge`;
- database-backed session validation;
- no session cookie cache for protected application requests.

Consequential operations that require recent authentication must require a
fresh Better Auth session.

For the initial email/password-only authentication model, the application can
require the user to authenticate again when their current session is no longer
fresh. That creates a newly authenticated session whose `createdAt` establishes
the new five-minute assurance window.

Session refresh alone does not satisfy recent-authentication requirements.

The application additionally enforces a thirty-day absolute session lifetime
from the original session `createdAt`. This is independent of Better Auth's
sliding seven-day expiration and must be checked at the server authentication
boundary.

## Consequences

No custom `auth.session_assurance` table or migration is required for the
initial authentication implementation.

There is one source of session-freshness truth instead of duplicate Better Auth
and application assurance records.

The server authentication boundary must enforce the thirty-day absolute limit
before authorizing protected application work.

Sensitive operations such as account deletion and password or email changes
must use the five-minute freshness requirement even when the ordinary session
is otherwise valid.

If future authentication methods such as passkeys, passwordless login, social
providers, or MFA change what constitutes acceptable recent assurance, this
decision must be reviewed. A fresh session must not automatically be assumed
to represent a password challenge once password authentication is no longer
the sole applicable assurance method.