# Salapiya Flutter application

Read `../../docs/PRODUCT_AND_FEATURES.md`, `../../docs/ARCHITECTURE.md` and
`../../docs/OPERATIONS_AND_RELEASE.md` (P0 foundation) before changing this application.
Use Flutter/Dart tooling here; Next.js, pnpm, ESLint and Prettier govern the web.

- Maintain one shared codebase for Windows and Android. Windows is convenient for
  daily development; the Android emulator is the primary routine Android target.
  Validate each vertical feature on both; physical-device acceptance comes later.
- Introduce presentation/application/domain/persistence boundaries when a real
  feature needs them, following blueprint section 7. Avoid empty layers and P1
  workflows during foundation work.
- Use `lower_snake_case.dart`, `UpperCamelCase` types and `lowerCamelCase` members.
  Format with Dart; keep analysis and tests passing.
- Commit `pubspec.lock`, `.metadata`, required native sources and Gradle wrapper.
  Pin direct dependencies and validate SDK upgrades on both platforms. Never
  commit SDK paths, credentials, signing keys, emulator disks or build caches.
- Money requires exact integer minor units and lossless boundaries, never doubles.
  Numeric ranges and SQLite/server parity need G3 proof before use.
- Preserve source ownership, privacy, creator-only corrections, immutable history
  and separate private/group authority. Uploaded data is untrusted to the server.
- Prefer semantic controls, keyboard focus, safe insets, scrolling and system text
  scaling. Show actionable failures; never claim a failed save succeeded. Do not
  log financial records, notes, credentials or tokens.
- SQLite, Supabase Auth/Google, Supabase PostgreSQL and PowerSync are gated
  selections. G0-G4 remain open. Do not add plugin collections, production schemas,
  real auth or sync without a bounded assignment.

Run `flutter pub get`, `dart format --output=none --set-exit-if-changed lib test integration_test`,
`flutter analyze`, `flutter test`, `flutter build windows` and
`flutter build apk --debug` as appropriate. Record runtime/input/debugger/hot
reload evidence separately from compilation; web acceptance does not prove native
acceptance.
