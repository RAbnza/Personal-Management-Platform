CREATE TABLE "ops"."shared_bundle_proof" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"checksum_sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_shared_bundle_proof" UNIQUE("workspace_id","checksum_sha256"),
	CONSTRAINT "ck_shared_bundle_proof_hash" CHECK ("ops"."shared_bundle_proof"."checksum_sha256" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "ops"."shared_bundle_proof" ADD CONSTRAINT "shared_bundle_proof_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE no action ON UPDATE no action;