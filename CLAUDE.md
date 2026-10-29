# Salapiya: Working Rules

## Source of truth
- Read the relevant docs before changing code. The README documentation index lists them:
  - Product and features: docs/PRODUCT_AND_FEATURES.md
  - Architecture: docs/ARCHITECTURE.md
  - Database: docs/DATABASE.md
  - Domain rules: docs/DOMAIN_RULES.md
  - Design system: docs/DESIGN_SYSTEM.md
  - Operations and release: docs/OPERATIONS_AND_RELEASE.md
  - Development history: docs/DEVELOPMENT_HISTORY.md
  - Architecture decision records: docs/adr/
- docs/archive/ holds superseded handoffs and plans. Treat it as historical, not as a rule source.
- Code and documented decisions beat assumptions. If a request conflicts with a documented rule, keep the rule and flag the conflict.

## Testing
- Run ONLY targeted tests for the feature being changed.
- Never run the full unit/integration/e2e suite, a full build, or a broad quality pipeline.
- Never claim a test passed unless it actually ran and passed. Report environment blockers honestly.

## Scope and safety
- Keep changes minimal. No unrelated refactors, entities, screens, or docs.
- Update user-facing documentation in place in the relevant major doc. Do not add new standalone doc files unless I ask.
- Migrations must be non-destructive. Preserve profile isolation and offline-first behavior.
- No new dependencies unless unavoidable.
- Never commit secrets, local databases, or user data.
- Never push, force-push, or rewrite history without my explicit approval.

## Reporting
- Keep one running handoff Markdown file (docs-handoff.md at the repo root). Update that same file every time something changes, across tasks and for the whole session. Start a new handoff file only when I explicitly say so; otherwise assume the existing one is still the active file.
- The handoff is a summary, not full detail: short entries on what changed, status, open items and blockers. Rewrite or trim stale entries so the file stays short. No extra summary or status files.
- Keep handoff files untracked: do not `git add` or commit them unless I ask.
- Keep chat replies short; put detail in the handoff file.
