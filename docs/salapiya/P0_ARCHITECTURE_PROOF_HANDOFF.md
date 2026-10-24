# P0 architecture proof handoff

Work in progress on `feat/salapiya-p0-architecture-proof`, based on verified D5
`4cd03faf72f1242b6018ac64c7de3df0c1387d3c`. This is the single completion record
for the bounded P0 assignment. The approved UI and historical web implementation
remain intact. P1–P6 are outside this branch.

## Evidence rules

Native runtime results, local PostgreSQL tests, simulated transport and actual
hosted integration are recorded separately. Missing credentials/configuration
never count as successful security, OAuth or synchronization evidence.

## Phase A checkpoint

Pinned PowerSync 2.5.0, SQLite3 3.8.0, sqlite_async 0.14.6,
Supabase Flutter 2.18.3, flutter_secure_storage 11.2.0, cryptography 2.9.0,
path_provider 2.1.5 and path 1.9.1. Flutter remains 3.47.7 / Dart 3.13.5.
SQLite3 Multiple Ciphers is selected through the official SQLite build hook;
PowerSync's `EncryptionOptions` supplies encryption. No deprecated SQLCipher
wrapper is used. Native API checks are pending execution at this checkpoint.

State/navigation remain the approved prototype's existing approach. No additional
routing/state/chart framework is necessary for this proof.

Official references checked October 24, 2026:

- [PowerSync Flutter SDK](https://docs.powersync.com/client-sdks/reference/flutter)
- [EncryptionOptions setup](https://pub.dev/documentation/powersync/latest/powersync/EncryptionOptions-class.html)
- [SQLite native hooks](https://github.com/simolus3/sqlite3.dart/blob/main/sqlite3/doc/hook.md)
- [Secure storage](https://pub.dev/packages/flutter_secure_storage)
- [Supabase Flutter](https://pub.dev/packages/supabase_flutter)
- [Cryptography](https://pub.dev/packages/cryptography)

Docker is installed but its engine is unavailable. Automatic approval review
rejected starting Docker Desktop. An isolated PostgreSQL test runtime will be
used where possible; that does not substitute for hosted service acceptance.

## Phase B checkpoint

The exact-money port uses `BigInt`, canonical decimal-string boundaries and
checked signed-64-bit SQLite conversion. Component bounds remain ±100,000,000,000
minor units; shared bill fixtures retain the web's larger signed-bigint bound
and stable participant ordering. Aggregates use BigInt rather than SQLite TOTAL
or potentially overflowing SUM. The synthetic expense proof commits intent,
expense/cash evidence and (when connected) a PowerSync command atomically.
Immutable evidence triggers and strict SQLite tables reject mutation/type drift.
Versioned migrations roll back and fail closed on unsupported versions.

Windows host tests passed: two money fixture tests, one encrypted persistence /
migration / rollback / reopen test and two actual killed-process WAL tests.
These are native Windows-host SQLite checks, not yet Android process-kill proof.
The killed worker is an isolated Dart subprocess with synthetic data; tests
terminate only that worker's PID/process tree.

## Phase C checkpoint

`services/salapiya/p0/001_proof.sql` is a fresh synthetic schema, not a copy of
web migrations. PostgreSQL RPC authenticates through `auth.uid()`, validates a
bounded whole expense, locks receipt identity / owner revision, and atomically
persists paired immutable evidence, action and durable accepted/rejected receipt.
JSONB payload equality is server-owned; different-payload ID reuse fails. Client
SDK completion follows durable local acceptance/review; response loss replays the
same ID. Accepted-download matching excludes the overlay even before the explicit
reconciliation update. Local-only writes generate no SDK upload records.

Five actual PostgreSQL-in-WASM (PGlite 0.5.11) tests passed: receipt replay and
mismatch, RLS/direct-write/anonymous denial, durable rejections and stale revision,
full transaction rollback and independent expense IDs. The auth.uid() test stub
sets a transaction-local claim; it does not verify JWTs. PGlite serializes
transactions: advisory-lock behavior under independent PostgreSQL sessions is
unverified. These are SQL implementation tests, not Supabase deployment tests.

One Windows host test passed using the real encrypted PowerSync upload queue and
an explicitly simulated server/download. It covers lost responses, close/reopen,
exactly one simulated financial effect, retained rejection evidence, unrelated
queue progress, pending/accepted matching and owner-scoped local queries.
No service connection, CDC checkpoint or actual second-device replication has
been claimed. `sync-streams.yaml` filters by authenticated JWT owner independently
of RLS; hosted syntax/negative-scope verification remains mandatory.

## Phase D checkpoint

Seven SQL tests now pass, adding private staged enrollment, immutable retry
identity, publication of one complete synthetic expense graph, retained source
IDs, collision outcomes, second-device owner-scoped retrieval and full rollback
when a staged graph cannot publish. Two competing claims are serialized by the
test runtime; true independent-session races remain outstanding.

Two Windows host identity tests pass: unauthenticated local creation, one local
profile guard, transactional write freeze, durable staged snapshot across reopen,
wrong-account interruption denial and cancel preserving local records. The proof
does **not** activate a real connected profile or merge financial datasets.
Production graph enrollment (openings, debt/card relations, attachments and full
download activation) remains blocked by the bounded schema / hosted prerequisites.

Secure Supabase session and PKCE-verifier adapters use OS secure storage instead
of default preferences. Callback filtering is restricted to
`dev.salapiya.p0://auth/callback`. Android declares this development callback;
Windows forwards app links to an existing instance. No protocol registration,
Google account or provider configuration is invented. OAuth URL generation and
native callback delivery are distinct from real provider authentication.

Initial native Windows builds succeeded; the compatibility test first exposed
failed-open cleanup propagation, then missing PKCE async storage. Both were fixed
in the probe. Android's first build failed because Kotlin incremental caches
cannot relativize Pub sources on C: against the repository on E:. The project
now disables Kotlin incremental compilation, without relocating the toolchain.
