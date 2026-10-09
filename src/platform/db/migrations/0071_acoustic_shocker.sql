ALTER TABLE "ops"."email_delivery" DROP CONSTRAINT "ck_email_delivery_secret";--> statement-breakpoint
-- Reviewed owner-only data transition. FORCE RLS stays enabled throughout;
-- no runtime role acquires a new policy or grant. Terminal recipients contain
-- zero bytes rather than NULL, preserving the documented nonnull bytea field.
CREATE POLICY migration_email_wipe ON ops.email_delivery FOR ALL TO migration_owner USING(status NOT IN ('queued','uncertain')) WITH CHECK(status NOT IN ('queued','uncertain'));
UPDATE ops.email_delivery SET recipient_ciphertext=decode('','hex') WHERE status NOT IN ('queued','uncertain') AND recipient_ciphertext IS NULL;
DROP POLICY migration_email_wipe ON ops.email_delivery;
--> statement-breakpoint
ALTER TABLE "ops"."email_delivery" ALTER COLUMN "recipient_ciphertext" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ops"."email_delivery" ADD CONSTRAINT "ck_email_delivery_secret" CHECK (("ops"."email_delivery"."status" IN ('queued','uncertain') AND octet_length("ops"."email_delivery"."recipient_ciphertext")>=28 AND "ops"."email_delivery"."payload_ciphertext" IS NOT NULL AND octet_length("ops"."email_delivery"."payload_ciphertext")>=28) OR ("ops"."email_delivery"."status" NOT IN ('queued','uncertain') AND octet_length("ops"."email_delivery"."recipient_ciphertext")=0 AND "ops"."email_delivery"."payload_ciphertext" IS NULL));
