import { sql } from "drizzle-orm";
import { uuid, text, timestamp, unique, check } from "drizzle-orm/pg-core";
import { opsSchema } from "./namespaces";
import { workspace } from "./core";
/** Server-owned approval provenance, excluded from user-controlled bundles. */
export const sharedBundleProof = opsSchema.table(
  "shared_bundle_proof",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    checksumSha256: text("checksum_sha256").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("uq_shared_bundle_proof").on(t.workspaceId, t.checksumSha256),
    check(
      "ck_shared_bundle_proof_hash",
      sql`${t.checksumSha256} ~ '^[a-f0-9]{64}$'`,
    ),
  ],
);
