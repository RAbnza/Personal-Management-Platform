# D6b existing-debt import verification

Baseline inspected: `main` at `e01a375d51b5bca19db21b8013b92fd3c0d6d8aa`.
Verification date: 7 October 2026 (Asia/Manila).

Implemented the existing-debt import service, owner-scoped list/detail reads,
same-origin API routes, review/confirm form, list/detail pages, and current
unpaid installment projection into Agenda. Amounts remain exact minor-unit
strings at transport boundaries and bigint in accounting code.

The import creates one opening-equity debit and classified/unclassified debt
liability credits. It creates no receipt, income, expense, or historical cash
payment. Schedule satisfaction at the cutoff remains historical evidence.
Schedule totals are independent of recognized liability. Unknown principal and
missing schedule coverage display as unknown. The empty initial manual schedule
follows Database Architecture section 7.2, correcting D6a's conflicting minimum
installment check without removing finalization or ownership protections.

New migrations:

- `0020_d6b_optional_manual_schedule.sql`: permit an empty finalized schedule.
- `0021_d6b_debt_agenda.sql`: extend the invoker-security Agenda view to current,
  unpaid debt obligations. Stable obligation identities become source IDs.

Both migrations were applied to the test database before development. All 152
integration tests passed before the development migration. An empty-database
chain verification applied all 22 migrations and checked repeat migration,
simultaneous same-key import, committed replay after a lost response, changed
payload conflict, balanced postings, read snapshots, and foreign-owner debt and
Agenda isolation. Run it with `pnpm db:verify:chain`; it creates and removes only
a uniquely named disposable database using `.env.test` connection settings.

The complete unit/component suite passed all 302 tests. An obsolete test that
treated Money as an unsupported Agenda filter now uses the still unsupported
Trackers filter. Type checking, lint, formatting, and production build passed. The only
existing transaction-form modification adds its missing final newline.

Browser verification remains outstanding: this session's browser tools reported
no connected browser, including no in-app browser. Component tests verify labels,
preview focus, exact payloads, malformed success responses, and retained command
identity across network failure and session expiry. They do not establish visual
reflow, contrast, or a complete browser acceptance result. D6b is implemented and
automatically verified, but its browser acceptance gate remains open.

This is milestone evidence, not a V1 completion claim. Borrowing, payments,
schedule revisions, settlement, corrections/reconciliation, connected reports,
lifecycle controls, and operational release gates still require implementation
and verification. No V2 work has started.
