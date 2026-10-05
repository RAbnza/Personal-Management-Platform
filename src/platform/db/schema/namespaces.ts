import { pgSchema } from "drizzle-orm/pg-core";

/**
 * First-slice application-owned schemas.
 *
 * The auth namespace is intentionally not declared here. Better Auth's
 * generated schema owns the Drizzle declaration for the "auth" namespace so
 * there is only one source for its library-managed tables.
 *
 * Future feature namespaces are intentionally not declared here until their
 * corresponding feature is ready to ship.
 *
 * Library-owned queue storage (pg-boss) is also intentionally excluded.
 */
export const coreSchema = pgSchema("core");
export const financeSchema = pgSchema("finance");
export const careerSchema = pgSchema("career");
export const timeSchema = pgSchema("time");
export const auditSchema = pgSchema("audit");
export const opsSchema = pgSchema("ops");
