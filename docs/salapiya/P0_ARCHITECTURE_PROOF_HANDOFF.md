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
