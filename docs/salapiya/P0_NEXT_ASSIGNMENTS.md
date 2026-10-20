# Remaining P0 assignments

The [blueprint](../SALAPIYA_PRODUCT_AND_PLATFORM_BLUEPRINT.md) remains authoritative.
This foundation closes none of G0-G4. Each assignment must preserve the web
reference, produce Windows and Android evidence and leave product features out
unless a synthetic flow is essential to prove a gate. Complete foundational gates
before substantial P1 work; failed gates require bounded redesign and a recorded
decision, not a silent scope reduction.

## 1. Dependency/device compatibility and early cost feasibility (next)

- Objective/scope: prove a minimal compatible Flutter/SQLite/PowerSync/Supabase
  storage/auth/credential stack on both platforms; collect the actual supported
  OS/CPU/device inventory, plugin licenses and a preliminary free-tier cost model.
- Gates: G0; early G7 review before committing to backend design.
- Likely files: `apps/salapiya/pubspec.*`, native adapters/prototypes and
  `docs/salapiya/` dependency/device/cost records.
- Evidence: pinned versions, builds and exercised critical plugin APIs on Windows
  and Android; dated official quota/pricing sources, assumptions for initial sync,
  ongoing traffic, retained history/files and inactivity/reactivation.
- Acceptance: supported matrix and incompatibilities explicit; dependency choices
  tested together; no implied free-tier guarantee. Paid requirements are a budget
  decision for the owner before activation.
- Exclusions: paid plans, production cloud, full feature UI, complete sync/auth,
  encryption or financial acceptance from a plugin startup alone.

## 2. Exact monetary contracts and transactional persistence prototype

- Objective/scope: port bounded canonical money fixtures and prove exact local
  numeric/storage boundaries with synthetic transactional writes and migrations.
- Gates: G3 foundations, G0 storage compatibility.
- Likely files: new `contracts/` golden fixtures, pure Dart domain tests, bounded
  SQLite adapter/prototype and documentation; deliberately reviewed backend fixture
  harness if needed, without copying historical web migrations.
- Evidence: centavo round trips, aggregate/overflow bounds, lossless serialization,
  deterministic remainders, negative/rejection cases and kill/rollback/restart
  tests on both platforms; fixture parity with authoritative web examples.
- Acceptance: no floating-point money; whole action/evidence or none persisted;
  interrupted migration has a recovery path. Record remaining server parity work.
- Exclusions: production ledger schema, real money/data, P1 accounts/expense UI,
  assumed authorization from local UUID possession.

## 3. Financial-command transport, receipts and recovery prototype

- Objective/scope: prove PowerSync transport with atomic local pending intent,
  server command receipts, pending overlays and accepted checkpoints.
- Gates: G1 and G3 concurrency/parity/security.
- Likely files: bounded Dart sync adapter, synthetic command modules, reviewed
  test-only backend under `services/salapiya/`, shared fixtures and fault harness.
- Evidence: Windows/emulator two-client distinct offline writes, response loss,
  retry same/different payload IDs, crash between receipt/download, stale revision,
  permanent rejection, unrelated queue progress and independently tested private
  sync filtering. Define the per-command offline/finalization matrix.
- Acceptance: no duplicated/overwritten financial effect or stalled entire queue;
  rejected intent survives for review; accepted snapshot removes pending overlay
  exactly once. Server independently checks ownership and versions.
- Exclusions: generic custom sync engine, all financial modules, Shared Expenses
  product UI, production services or provider credentials in Git.

## 4. Google identity, enrollment and second-installation retrieval

- Objective/scope: prove supported Windows/Android Google callbacks, one-profile
  enrollment, interrupted publication and safe local/cloud collision choices.
- Gates: G2, dependencies on G1 receipts and G3 validation.
- Likely files: profile/auth/enrollment adapters, test backend, callback native
  configuration, synthetic ownership tests and redacted setup runbook.
- Evidence: cancellation/wrong account/expired session, repeated/interrupted and
  simultaneous enrollment, original IDs/opening balances once, complete consistent
  download, populated-local/existing-cloud cancel/export/switch with no silent
  merge and no partial financial graph visible to another device.
- Acceptance: trusted provider identity establishes ownership; local data remains
  usable offline after token expiry; enrollment receipt resumes safely.
- Exclusions: credential creation without a concrete separate setup decision,
  production Google consent, account transfer/merge, real personal uploads,
  embedded OAuth/service-role secrets.

## 5. Encryption, protected credentials and portable recovery

- Objective/scope: validate compatible local database/file protection and portable
  encrypted recovery independent of the original OS keystore/device.
- Gates: G4, G0 compatibility and G1/G2 receipt/identity dependencies.
- Likely files: storage/credential/recovery adapters, versioned synthetic backup
  prototype, tamper tests and recovery threat/coverage record.
- Evidence: new-device restore on both targets, wrong key/tamper/truncation/missing
  files, lost-device recovery, interrupted export, revoked session, pending command
  reconciliation, corruption and safe migration/downgrade failure.
- Acceptance: private records and declared attachment coverage recover without old
  credentials; no token export, private logs or blind replay of accepted commands;
  cached group snapshots never grant current authority.
- Exclusions: invented cryptography, real financial data, full account lifecycle,
  enterprise compliance or production key/signing deployment.

## 6. Consolidated P0 decision and platform proof

- Objective/scope: consolidate G0-G4 outcomes, measure the G7 model with prototype
  traffic, document remaining risks and decide whether P1 can safely begin.
- Gates: G0-G4 closure decision; G7 feasibility, with G5/G6/G8 release work explicit.
- Likely files: gate register, compatibility/cost evidence, traceability fixtures,
  targeted prototype corrections and handoff.
- Evidence: reproducible cross-platform fault journeys, exact server/local fixture
  parity, privacy tests, measured traffic/storage and owner-supported device matrix.
- Acceptance: every foundational gate has evidence-backed pass or explicit blocker;
  substantial P1 starts only after blockers are resolved. Spending remains gated.
- Exclusions: marking gates passed from builds, full release acceptance, broad web
  regression without changed contracts or beginning P1 in the proof assignment.

## Product milestones after P0

P1 local foundation/everyday Money; P2 connected identity/private synchronization;
P3 complete Shared Expenses; P4 complete advanced financial scope; P5 Life/native
integration; P6 complete private release. Preserve all approved launch requirements.
G5 signing/updates/callbacks, G6 accessibility/representative devices and G8
files/retention/lifecycle remain explicit later gates. Physical Android testing
remains required for later acceptance; emulator proof does not certify it.
