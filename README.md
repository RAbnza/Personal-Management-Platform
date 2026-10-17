# Personal Management Platform

**Working application identity: Personal workspace.** The repository name is tentative; final product name, wordmark, logo and native branding are deferred to future Windows/Android planning and development.

Private personal management application with exact PHP financial workflows, accounts/debts/cards/planning, Career, source-driven Calendar/reminders, reports/CSV, shared expenses with separate group authority, versioned custom Trackers, onboarding, files/imports/private graph restore and account lifecycle.

| Stage         | Verified status / evidence                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1            | Completed under its documented functional/local acceptance scope, with recorded hosted CI evidence; [handoff](docs/PROJECT_DEVELOPMENT_HANDOFF.md) and [acceptance](docs/verification/V1_C5_ACCEPTANCE.md). Production-dependent gates were separate.                                                                                                                                                                        |
| V2-A–I        | Completed under documented acceptance scopes; [handoff, including final V2-I acceptance](docs/V2_DEVELOPMENT_HANDOFF.md#30-v2-i-assignment-2---complete-domain-and-consolidated-acceptance). No production-release claim.                                                                                                                                                                                                    |
| V3-A–D        | Completed and locally accepted under the approved targeted strategy; [handoff](docs/V3_DEVELOPMENT_HANDOFF.md), [impact matrix](docs/V3_TARGETED_ACCEPTANCE.md). Separately, [automatic CI at `239c360`](https://github.com/RAbnza/Personal-Management-Platform/actions/runs/38911065106) passed 1,104 unit, 681 integration and 62 browser tests, migration/build/restore/container checks and production dependency audit. |
| Current phase | M1 Design Foundations and Shared Interaction Patterns completed and explicitly owner-approved October 17, 2026 (Asia/Manila), including final dock/menu revisions; [handoff](docs/REDESIGN_M1_HANDOFF.md). M2 is ready for separate assignment and has not started.                                                                                                                                                          |
| Later         | Dedicated offline-first Windows/Android platform architecture planning after redesign and before native implementation, then platform development/acceptance. F01–F07 remain deferred; no replacement technology selected.                                                                                                                                                                                                   |

[ADR 0005](docs/adr/0005-v3-scope-and-platform-transition.md) keeps the existing web application as the implementation/verification environment through redesign. Current web production deployment/readiness completion is no longer planned. Local and CI evidence do not establish production readiness, real cloud/provider activation, or human/hosted product acceptance. Historical handoffs retain their original phase boundaries; follow their latest accepted sections and the current approved roadmap.

## Project documentation

The four authoritative project documents preserve product and technical contracts. The approved redesign plan takes precedence over superseded visual/navigation guidance; it changes presentation without authorizing feature removal or architecture replacement.

- [Product vision and feature blueprint](docs/PROJECT_VISION_AND_FEATURE_BLUEPRINT.md)
- [System architecture](docs/SYSTEM_ARCHITECTURE.md)
- [Database architecture](docs/DATABASE_ARCHITECTURE.md)
- [Design system and visual guidelines](docs/DESIGN_SYSTEM_AND_VISUAL_GUIDELINES.md)
- [V3 handoff](docs/V3_DEVELOPMENT_HANDOFF.md) and [targeted acceptance](docs/V3_TARGETED_ACCEPTANCE.md)
- [Approved comprehensive UI/UX redesign plan](docs/COMPREHENSIVE_UI_UX_REDESIGN_PLAN.md)
- [Approved redesign milestones](docs/UI_UX_REDESIGN_MILESTONES.md)
- [Owner decisions and deferred platform questions](docs/UI_UX_REDESIGN_DECISIONS_REQUIRED.md)

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

For assigned redesign milestones, use the [approved change-impact strategy](docs/COMPREHENSIVE_UI_UX_REDESIGN_PLAN.md#145-approved-change-impact-verification-and-delivery-boundaries). M1–M5 test changed/affected components, workflows and shared contracts with relevant responsive/theme/keyboard/accessibility and correctness/security checks. M6 covers the complete redesigned screen/route inventory and meaningful cross-screen workflows/accessibility; it is not an automatic complete V1–V3 regression campaign. Broaden only for changed shared contracts, discovered failures or significant security/financial risks. Preserve assertions and existing CI; record executed tests, results, coverage, exclusions and rationale. Historical evidence supports unchanged behavior, not redesigned screens.

The commands below are general full-suite and specialized verification references, not a requirement to run every campaign for each milestone. Documentation-only approval runs none of the application tests, builds, benchmarks or Docker operations. Broader automatic CI remains enabled and its outcomes are reported separately.

For a separately justified full-suite run, use `pnpm check`, `pnpm test`, `pnpm test:integration`, `pnpm db:verify:chain`, `pnpm build`, then `pnpm test:browser`. On memory-constrained machines, use `pnpm test --maxWorkers=1 --pool=threads`; it runs the complete suite with the same assertions, isolation and timeouts. Install Playwright Chromium with `pnpm exec playwright install chromium`, or on Windows set `PMP_BROWSER_CHANNEL=msedge` to use installed Edge. Browser acceptance starts its own production server on port **3100** and refuses reuse of a user's development server.

Integration tests refuse databases other than `personal_management_test`. Migration verification creates and removes a uniquely named disposable database, proves a no-op repeat, and runs committed financial/lifecycle smoke checks. `pnpm db:verify:chain --upgrade` also preserves committed C4 balances and reports across the upgrade. Preserve numbered migrations; never use schema push. Generate reviewed additions with `pnpm db:generate`, test the chain before applying to development, and apply migrations once with the migration owner in the authorized environment; this is not an instruction to provision production.

`pnpm verify:performance` measures a guarded multi-year synthetic test dataset and 100 users/20 active callers against documented latency budgets. Its 50,000-action default can take considerable time with all financial integrity checks enabled; run it separately from final regressions. `pnpm verify:restore` performs the isolated encrypted local restore/deletion-register drill. Neither command proves production capacity or cloud retention. See operations for the separate controlled `pnpm backup:daily` deployment command.

If a capacity run is interrupted, `PMP_PERFORMANCE_RESUME_WORKSPACE_ID` accepts only the exact named synthetic owner/workspace in the isolated test database. The runner validates the contiguous committed purchase indices and resumes missing batches rather than disabling constraints or fabricating evidence. `PMP_PERFORMANCE_RETAIN_FIXTURE=true` retains that guarded fixture for diagnosis; remove it with the guarded named-fixture helper after review. The default run cleans up its fixture. Retained fixtures and test results are not production backups.

Build Linux artifacts with `docker build --target web --tag pmp-v1-c5-web .`, then the corresponding `worker` and `backup` targets/tags. `pnpm verify:containers` checks all three images against the isolated test database on the Compose network. It does not expose a public port, overwrite a running development service or pass administrator/migration credentials to the runtime containers. Alternate CI networks can set `PMP_TEST_DOCKER_NETWORK` and `PMP_TEST_DOCKER_DATABASE_HOST`.

## Product and release documentation

- [V1 user guide](docs/V1_USER_GUIDE.md)
- [Environment, deployment, worker and recovery operations](docs/V1_OPERATIONS.md)
- [Historical V1 acceptance evidence and conditional production gates](docs/verification/V1_C5_ACCEPTANCE.md)

V1/V2/V3 acceptance records remain historical evidence within their stated scopes. Operational/provider checklists are conditional under ADR 0005, not active web-production provisioning tasks. Existing local setup, role isolation and recovery safeguards remain applicable.

Adaptable Trackers: see [workflows](docs/V3_TRACKER_WORKFLOWS.md), [targeted V3 acceptance](docs/V3_TARGETED_ACCEPTANCE.md) and [deferred configuration](docs/V3_MANUAL_ACTIONS_AND_DEFERRED_GATES.md). The V3 assignment uses change-impact verification; the existing full CI workflow remains enabled.
