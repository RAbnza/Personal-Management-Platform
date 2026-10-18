# V2-G — Scheduled Opted-In Notifications

## Authority and sequence

This domain implements the notification boundaries in SYSTEM_ARCHITECTURE and
DATABASE_ARCHITECTURE using existing V1 reminders and V2 A–F sources. G1 adds
explicit consent, forced-RLS evidence and lifecycle protections. G2 adds durable
pg-boss scheduling, current-source revalidation and authenticated provider evidence.
G3 adds Settings/status workflows and consolidated acceptance. No V2-H is authorized.

## Product contract

Email is the only channel. Missing preferences mean disabled. Enabling requires a
current verified owned sign-in identity; there is no editable destination. In-app
reminder offsets, local times, overrides, dismissal, snooze and module switches
remain authoritative. Navigation hiding and Agenda visibility do not revoke
reminder consent; the module's separate reminder switch controls eligibility.
Sources are Calendar appointments, Career scheduled events,
Debt installments, verified card statements, eligible projected card installments
and materialized Recurring occurrences. Unmaterialized projections do not invent
notification sources. Statement and installment messages describe separate source
evidence, never a sum or financial instruction.

One logical delivery identifies the occurrence, source/rule generations and email
channel. Source version checks freshness but never creates another delivery for an
unrelated edit. No repeated overdue cadence is offered. Schedules predating the
current opt-in are suppressed; restoring consent does not replay already terminal
logical deliveries. Relevant due/rule changes use existing reminder generations.

Workspace timezone remains the scheduling timezone of date-only sources; timed
sources retain their recorded timezone. Optional quiet hours use a selected IANA
timezone or the current workspace timezone and defer delivery without changing
deadlines. Both endpoints must be supplied together and differ. DST transitions
follow PostgreSQL civil-time conversion. Quiet windows may cross midnight.

Default messages contain only a generic reminder and a link to authenticated
Agenda. An explicit preference may include the recorded due date. No amount,
company, title, recipient, private notes or provider payload enters queue data or
operational logs. Security/verification/recovery email is independent of consent.

## Durable processing and safety

Preferences and authoritative source rows are durable scan intent. The worker
discovers consenting scopes every minute and scans bounded current Agenda sources;
this also recovers edits committed while it was stopped. This is polling over
authoritative evidence, not a second queue or a post-commit best-effort hook.
Delivery insertion and the ID-only pg-boss job share the proven Drizzle transaction
adapter. Missing queue setup fails the transaction. Current-source validity is
checked again immediately before sending. Pending cancellation/rescheduling becomes
visible within a healthy scan interval; provider-boundary checks protect against
stale jobs between scans. Already accepted mail cannot be recalled.

Attempt evidence is committed before provider I/O. Racing workers can claim once.
An abandoned attempt becomes uncertain and is never automatically resent, including
Resend after its provider deduplication window. Definitively rejected attempts may
retry under the same logical key with a bounded count. Provider acceptance is not
delivery/read evidence. Signed, replay-deduplicated Resend events are resolved by
stored provider message ID, never by caller-supplied scope IDs. Conflicting or
unmatched events cannot fabricate acceptance or delivery.

Runtime financial tables remain read-only for notification work. Owner RLS,
workspace locking, command receipts and attributed preference audit are preserved.
Lifecycle purge removes deliveries/attempts/provider evidence before occurrences.
Restore keeps workers paused and requires external-effect reconciliation. Compact
delivery keys remain with the live workspace to prevent replay; operational
attempt/event evidence remains with the live workspace as compact audit evidence.
Queue metadata expires within seven days; operational logs have a recommended
30-day infrastructure retention gate. No raw body is kept.

## Operational gates and acceptance

Optional delivery requires NOTIFICATIONS_ENABLED=true independently of WORKER_PAUSED.
Real Resend delivery additionally requires NOTIFICATIONS_EXTERNAL_ENABLED=true,
reviewed sender/domain/quota configuration and authenticated webhook setup. These
gates remain off in this implementation's real environments. Acceptance uses mock
providers and local Mailpit. No deployment or real external send is authorized.

Acceptance covers consent/defaults/timezones/quiet hours, all source eligibility,
transaction rollback, replay/concurrency, current verified recipient, generations,
source resolution/corrections, opt-out, durable attempts/crash uncertainty, provider
events, forced RLS/roles, deletion, exact unchanged financial evidence, settings
origin/scope enforcement, accessibility, migration upgrades/schema drift, regression,
restore, container and bounded scan performance. Actual results belong in the V2
handoff; unexecuted infrastructure acceptance is never labelled passed.
