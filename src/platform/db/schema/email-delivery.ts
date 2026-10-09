import { sql } from "drizzle-orm";
import {
  check,
  customType,
  index,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth.generated";
import { opsSchema } from "./namespaces";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});
export const emailDelivery = opsSchema.table(
  "email_delivery",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    purpose: text("purpose").notNull(),
    logicalKey: text("logical_key").notNull().unique(),
    status: text("status").default("queued").notNull(),
    recipientCiphertext: bytea("recipient_ciphertext").notNull(),
    payloadCiphertext: bytea("payload_ciphertext"),
    keyId: text("key_id").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    providerMessageId: text("provider_message_id"),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastErrorCode: text("last_error_code"),
  },
  (t) => [
    index("ix_email_delivery_status_expiry").on(t.status, t.expiresAt, t.id),
    index("ix_email_delivery_user").on(t.userId),
    check(
      "ck_email_delivery_purpose",
      sql`${t.purpose} IN ('verify_email','password_reset','security_notice')`,
    ),
    check(
      "ck_email_delivery_status",
      sql`${t.status} IN ('queued','accepted','delivered','failed','uncertain','expired','cancelled')`,
    ),
    check(
      "ck_email_delivery_secret",
      sql`(${t.status} IN ('queued','uncertain') AND octet_length(${t.recipientCiphertext})>=28 AND ${t.payloadCiphertext} IS NOT NULL AND octet_length(${t.payloadCiphertext})>=28) OR (${t.status} NOT IN ('queued','uncertain') AND octet_length(${t.recipientCiphertext})=0 AND ${t.payloadCiphertext} IS NULL)`,
    ),
    check("ck_email_delivery_expiry", sql`${t.expiresAt}>${t.createdAt}`),
  ],
);
