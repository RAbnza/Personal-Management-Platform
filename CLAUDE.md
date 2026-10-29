# Salapiya: Working Rules

## Source of truth
- Read the docs before changing code: SALAPIYA_PRODUCT_AND_PLATFORM_BLUEPRINT.md, SYSTEM_ARCHITECTURE.md, DATABASE_ARCHITECTURE.md, DESIGN_SYSTEM_AND_VISUAL_GUIDELINES.md, PROJECT_DEVELOPMENT_HANDOFF.md. Newer docs supersede older ones.
- Code and documented decisions beat assumptions. If a request conflicts with a documented rule, keep the rule and flag the conflict.

## Testing
- Run ONLY targeted tests for the feature being changed.
- Never run the full unit/integration/e2e suite, a full build, or a broad quality pipeline.
- Never claim a test passed unless it actually ran and passed. Report environment blockers honestly.

## Scope and safety
- Keep changes minimal. No unrelated refactors, entities, screens, or docs.
- Migrations must be non-destructive. Preserve profile isolation and offline-first behavior.
- No new dependencies unless unavoidable.
- Never commit secrets, local databases, or user data.
- Never push, force-push, or rewrite history without my explicit approval.

## Reporting
- One handoff Markdown file per task. No extra summary or status files.
- Keep chat replies short; put detail in the handoff file.