CREATE TABLE "ops"."email_delivery" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"logical_key" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"recipient_ciphertext" "bytea",
	"payload_ciphertext" "bytea",
	"key_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"provider_message_id" text,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error_code" text,
	CONSTRAINT "email_delivery_logical_key_unique" UNIQUE("logical_key"),
	CONSTRAINT "ck_email_delivery_purpose" CHECK ("ops"."email_delivery"."purpose" IN ('verify_email','password_reset','security_notice')),
	CONSTRAINT "ck_email_delivery_status" CHECK ("ops"."email_delivery"."status" IN ('queued','accepted','delivered','failed','uncertain','expired','cancelled')),
	CONSTRAINT "ck_email_delivery_secret" CHECK (("ops"."email_delivery"."status" IN ('queued','uncertain') AND "ops"."email_delivery"."recipient_ciphertext" IS NOT NULL AND "ops"."email_delivery"."payload_ciphertext" IS NOT NULL) OR ("ops"."email_delivery"."status" NOT IN ('queued','uncertain') AND "ops"."email_delivery"."recipient_ciphertext" IS NULL AND "ops"."email_delivery"."payload_ciphertext" IS NULL)),
	CONSTRAINT "ck_email_delivery_expiry" CHECK ("ops"."email_delivery"."expires_at">"ops"."email_delivery"."created_at")
);
--> statement-breakpoint
ALTER TABLE "ops"."email_delivery" ADD CONSTRAINT "email_delivery_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_email_delivery_status_expiry" ON "ops"."email_delivery" USING btree ("status","expires_at","id");--> statement-breakpoint
CREATE INDEX "ix_email_delivery_user" ON "ops"."email_delivery" USING btree ("user_id");
--> statement-breakpoint
REVOKE ALL ON ops.email_delivery FROM PUBLIC,app_domain,auth_adapter,queue_broker,worker_domain,lifecycle_operator;
GRANT USAGE ON SCHEMA ops TO auth_adapter,queue_broker;
GRANT SELECT,INSERT,UPDATE,DELETE ON ops.email_delivery TO auth_adapter;
GRANT SELECT,UPDATE ON ops.email_delivery TO queue_broker;
GRANT SELECT,DELETE ON ops.email_delivery TO lifecycle_operator;
ALTER TABLE ops.email_delivery ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.email_delivery FORCE ROW LEVEL SECURITY;
CREATE POLICY email_auth ON ops.email_delivery TO auth_adapter USING(true) WITH CHECK(true);
CREATE POLICY email_worker ON ops.email_delivery TO queue_broker USING(true) WITH CHECK(true);
CREATE POLICY email_purge ON ops.email_delivery TO lifecycle_operator USING(EXISTS(
 SELECT 1 FROM ops.deletion_request r WHERE r.id=NULLIF(current_setting('ops.deletion_request_id',true),'')::uuid
 AND r.target_user_id=email_delivery.user_id AND r.state='purging' AND r.purge_after<=clock_timestamp()));
--> statement-breakpoint
CREATE FUNCTION ops.email_source_active(p_user_id uuid,p_purpose text,p_recipient text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM auth."user" u LEFT JOIN core.user_profile p ON p.user_id=u.id
 WHERE u.id=p_user_id AND u.email=p_recipient AND (p.lifecycle IS NULL OR p.lifecycle='active')
 AND (p_purpose<>'verify_email' OR NOT u.email_verified))
$$;
REVOKE ALL ON FUNCTION ops.email_source_active(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops.email_source_active(uuid,text,text) TO queue_broker;
