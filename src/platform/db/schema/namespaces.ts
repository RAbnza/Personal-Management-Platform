import { pgSchema } from "drizzle-orm/pg-core";

/**
 * First-slice application schemas.
 *
 * Future feature namespaces are intentionally not declared here until their
 * corresponding feature is ready to ship.
 *
 * Library-owned queue storage (pg-boss) is also intentionally excluded.
 */
export const authSchema = pgSchema("auth");
export const coreSchema = pgSchema("core");
export const financeSchema = pgSchema("finance");
export const careerSchema = pgSchema("career");
export const timeSchema = pgSchema("time");
export const auditSchema = pgSchema("audit");
export const opsSchema = pgSchema("ops");
