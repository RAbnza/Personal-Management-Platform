# Personal Management Platform

Private V1 workspace for exact PHP accounting, accounts and reconciliation, debt payment/schedule/settlement history, Career applications/events, source-driven Agenda, reports and scoped CSV exports, onboarding, Settings, sessions and account lifecycle.

Authoritative requirements are in `docs/PROJECT_VISION_AND_FEATURE_BLUEPRINT.md`, `docs/SYSTEM_ARCHITECTURE.md`, `docs/DATABASE_ARCHITECTURE.md` and `docs/DESIGN_SYSTEM_AND_VISUAL_GUIDELINES.md`. Read `docs/PROJECT_DEVELOPMENT_HANDOFF.md` before continuing development. Final acceptance is tracked in [V1-C5 acceptance](docs/verification/V1_C5_ACCEPTANCE.md).

## Local setup

Install Node **24.21.0**, pnpm **12.9.1** and Docker Desktop. Run `pnpm install --frozen-lockfile`. Copy `.env.docker.example`, `.env.bootstrap.example`, `.env.migration.example`, `.env.test.example` and `.env.example` to their corresponding filenames without `.example`. Keep local passwords consistent between the examples. Never commit environment files or use these public development secrets in production.

1. `pnpm services:up`
2. `pnpm db:provision:roles`
3. `pnpm db:check:runtime`
4. `pnpm db:migrate`
5. `pnpm jobs:migrate`
6. `pnpm db:setup:test`
7. `pnpm db:migrate:test`
8. `pnpm jobs:migrate:test`
9. Configure security-email encryption and start the separate worker as described in [operations](docs/V1_OPERATIONS.md).
10. `pnpm dev`; open `http://localhost:3000`. Mailpit is at `http://localhost:8025`.

Migration credentials belong to deployment commands. The web runtime uses only `app_domain` and `auth_adapter`. The worker has separate queue/auth-maintenance/lifecycle connections. No runtime uses `SET ROLE`, table ownership or `BYPASSRLS`.

## Verification

Run `pnpm check`, `pnpm test`, `pnpm test:integration`, `pnpm db:verify:chain`, `pnpm build`, then `pnpm test:browser`. On memory-constrained machines, use `pnpm test --maxWorkers=1 --pool=threads`; it runs the complete suite with the same assertions, isolation and timeouts. Install Playwright Chromium with `pnpm exec playwright install chromium`, or on Windows set `PMP_BROWSER_CHANNEL=msedge` to use installed Edge. Browser acceptance starts its own production server on port **3100** and refuses reuse of a user's development server.

Integration tests refuse databases other than `personal_management_test`. Migration verification creates and removes a uniquely named disposable database, proves a no-op repeat, and runs committed financial/lifecycle smoke checks. `pnpm db:verify:chain --upgrade` also preserves committed C4 balances and reports across the upgrade. Preserve numbered migrations; never use schema push. Generate reviewed additions with `pnpm db:generate`, test the chain before applying to development, and deploy migrations once with the migration owner.

`pnpm verify:performance` measures a guarded multi-year synthetic test dataset and 100 users/20 active callers against documented latency budgets. Its 50,000-action default can take considerable time with all financial integrity checks enabled; run it separately from final regressions. `pnpm verify:restore` performs the isolated encrypted local restore/deletion-register drill. Neither command proves production capacity or cloud retention. See operations for the separate controlled `pnpm backup:daily` deployment command.

If a capacity run is interrupted, `PMP_PERFORMANCE_RESUME_WORKSPACE_ID` accepts only the exact named synthetic owner/workspace in the isolated test database. The runner validates the contiguous committed purchase indices and resumes missing batches rather than disabling constraints or fabricating evidence. `PMP_PERFORMANCE_RETAIN_FIXTURE=true` retains that guarded fixture for diagnosis; remove it with the guarded named-fixture helper after review. The default run cleans up its fixture. Retained fixtures and test results are not production backups.

Build Linux artifacts with `docker build --target web --tag pmp-v1-c5-web .`, then the corresponding `worker` and `backup` targets/tags. `pnpm verify:containers` checks all three images against the isolated test database on the Compose network. It does not expose a public port, overwrite a running development service or pass administrator/migration credentials to the runtime containers. Alternate CI networks can set `PMP_TEST_DOCKER_NETWORK` and `PMP_TEST_DOCKER_DATABASE_HOST`.

## Product and release documentation

- [V1 user guide](docs/V1_USER_GUIDE.md)
- [Environment, deployment, worker and recovery operations](docs/V1_OPERATIONS.md)
- [Acceptance evidence and remaining release blockers](docs/verification/V1_C5_ACCEPTANCE.md)

V1-C5 production acceptance is in progress. Local passing checks do not establish production backup, restore, performance or delivery guarantees. V2 is a separate effort and has not started.
