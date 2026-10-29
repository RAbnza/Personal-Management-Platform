<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Salapiya and repository boundaries

- Read `docs/SALAPIYA_PRODUCT_AND_PLATFORM_BLUEPRINT.md` for approved native
  direction, scope, identity and synchronization contracts.
- `apps/salapiya/` is one Flutter/Dart application for Windows and Android.
  Follow its scoped `AGENTS.md`; generated Next.js rules apply to web development,
  not Dart/native code.
- Preserve the web application, tests, migrations and pnpm tooling as an
  executable reference. Historical financial semantics remain authoritative
  unless explicitly superseded by the Salapiya blueprint.
- Foundation evidence: `docs/salapiya/P0_FOUNDATION.md`. Successful builds alone
  do not close G0-G4.
- Implement shared behavior once and validate each vertical feature on Windows
  and the Android emulator. Isolate necessary platform adapters. Do not finish
  the entire Windows product before beginning Android support.
- Preserve exact monetary arithmetic, immutable correction evidence, ownership,
  privacy and private/group authorization. Do not replay web migrations in SQLite.
