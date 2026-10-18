# V2-H — Supporting Files, Imports and Portability

Authority: SYSTEM_ARCHITECTURE §18 and DATABASE_ARCHITECTURE §15. H covers one owned private workspace. No V2-I, shared history, V3, provider ingestion or redesign is authorized.

## H1 — Private supporting files

Eight concrete scoped relationships support financial actions, debts, settlements, reconciliations, exact statement revisions, applications, application events and exact resume versions. PDF/JPEG/PNG only; 10 MiB per object, 1 GiB reserved and at most 1,000 live objects per workspace. Forced RLS protects persisted pending, quarantined, available, rejected, deleting and deleted states. Sources are authorized before transfer. Quota reservations and command/audit evidence are serialized; retries retain their original commands.

Authenticated bounded uploads use opaque immutable keys and a four-minute operational lease to prevent expiry cleanup during bounded provider I/O. Actual size, signature, checksum and a fresh successful scan precede availability. Signatures are format hints, not guarantees of harmless content. Images retain original metadata; no document renders inline. Downloads reauthorize and validate exact readback, with attachment-only, no-store, nosniff and sandbox headers.

Production S3 uses explicit separate credentials, conditional writes, encryption/checksum evidence and private-policy probes. Enabled or suspended versioning is unsupported. Persisted namespaces bind bucket, region and endpoint; configuration changes fail closed instead of forgetting old objects. Clamd exchanges/responses are bounded, UTC-configured, and require signatures within 48 hours. Synthetic adapters verify the actual test database and are forbidden outside local testing.

Scan/cleanup intent survives crashes and provider failures. Discovery is bounded with UUID cursors; file I/O runs independently of security mail and supports cancellation. Reservations expire after 15 minutes. Unlinked files are inaccessible and retained for up to 30 days, with explicit deletion controls. Account purge acknowledges one object deletion per step before removing metadata. Storage/namespace failures retain retryable keys. Independent provider inventory, backups and real storage/scanner acceptance remain operating gates.

## H2 — Durable CSV cash history

Format `pmp-cash-activity`, version 1, requires explicit mapping of date, kind, amount minor units, classification, description and reference. PHP, an owned active cash account, date interpretation (YYYY-MM-DD, DD/MM/YYYY or MM/DD/YYYY), and opening-cutoff strategy are explicit. UTF-8 CSV is bounded to 1 MiB, 500 rows and 16 KiB per record. Positive canonical integer amounts use existing component bounds. Supported kinds are expense and income; income classes are earned, gift, reward and other. Card/debt/transfer/refund/Career/provider formats are unsupported and are not inferred.

Persistent batches retain hashes, account/source snapshots, immutable previews, decisions, stable row commands and posting provenance. Duplicate file, fingerprint and reference warnings require acknowledgement. Confirmation reads the server preview and rechecks revision/version; initial processing rejects stale snapshots. After-opening commands process at most 50 rows with existing financial services and per-row savepoints. Concurrent retries serialize without duplicate postings. Cancellation stops future chunks and preserves committed rows; corrections use existing finance correction/reversal commands.

Rebase-history requires an earlier date/amount and exact coverage equation: earlier opening plus selected historical net movement equals the original baseline. The opening transition and all selected historical rows commit atomically. Positive/zero transitions preserve reversals and immutable journals; no zero journal or guessed adjustment is invented. Ordinary opening corrections cannot move cutoffs. Imports do not infer paid installments, links, reminders or allocations.

Normalized staging and preview rows expire after 30 days. Compact hashes, row commands, receipts and recognized-action links remain as provenance. Recognized descriptions/references remain legitimate financial history.

## H3 — Private portability and recovery

Runtime format `pmp-private-workspace-graph`, manifest version 2, uses a reviewed static graph registry/fingerprint, repeatable snapshot, canonical checksum, exact values/dates, financial revision, definitions and coverage. Bounds are 10 MiB and 10,000 total graph rows, including relationships/audits; this is not a promise of 10,000 financial actions. Authentication/profile identity, lifecycle/tombstones, queue/operator records, temporary artifacts, external-effect retirement records and attachment bytes are excluded. Receiving account identity remains intact. Currency must match; timezone/week start are restored.

Exports have owned command/audit provenance and authenticated 24-hour downloads. Raw previews accept `application/vnd.pmp.private-workspace-graph+json` with a preview command in the query, rejecting duplicate keys, excessive nesting and invalid UTF-8 before parsing. JSON command envelopes remain supported. Unsupported tables/columns, incomplete coverage, duplicate identities, invalid references, ambiguous dates and wrong fingerprints/checksums block activation.

Preview reports counts, exact cash/spending/income and ledger positions, mapping, exclusions and blockers. Replacement requires the exact preview hash, current revision and typed confirmation. Lifecycle/workspace locks suspend writes. A bounded recovery snapshot precedes deletion. The narrow database bridge reconstructs the registered graph atomically; FK/check and INSERT/UPDATE constraint validators remain enabled. Failed validation preserves the prior workspace. Evidence IDs remain stable within a workspace; foreign copies remap typed UUIDs and registered internal JSON references, preserving literal provider references/notes. Previous financial receipts remain retired against replay.

Live file bytes require explicit deletion or separately supported byte recovery before replacement. Incoming file metadata is unavailable/deleted; JSON never recreates bytes. Pending imports are cancelled and notification consent is reset. In-flight external delivery blocks replacement. Provider delivery/attempt/event evidence must match trusted owned current, recovery or immutable retired evidence; fabricated/foreign provider history is blocked. Executed notification generations and actual provider evidence remain in protected operational command records, preventing replay after restoration or timezone changes. User-controlled bundles cannot inject those records.

Recovery bodies expire after 24 hours. Download the owned recovery bundle and reapply through the same preview/confirmation workflow. Operational retirement survives expiry. Infrastructure recovery uses a separate trusted backup/deletion-register procedure; portability never restores authentication or erases tombstones.

## H4 — Interfaces and acceptance

Settings provides owned source selection, files/unlinked cleanup, CSV review/resumption, exports, replacement preview and recovery links. Financial action, debt, application and statement pages expose files directly; all eight sources are available centrally. Labelled native controls, progressive disclosure, bounded pages and status feedback support keyboard/mobile use. Unconfirmed requests retain exact commands; confirmed rejections allow a new reviewed operation.

Actual verification, decisions and remaining gates are in `docs/reference/V2_DEVELOPMENT_HANDOFF.md`. Production setup is tracked in `docs/reference/V2_H_MANUAL_SETUP_AND_PRODUCTION_CHECKLIST.md`. Local acceptance does not imply production configuration, a real malware scan or deployment.
Local H1–H4 acceptance completed October 15, 2026. Household capacity verification defaults to 10,000 actions at the explicit request of the user; original latency, integrity and concurrent-load assertions remain unchanged. The 50,000-action stress profile remains optional. Production file integrations remain disabled pending the documented operating gates.
