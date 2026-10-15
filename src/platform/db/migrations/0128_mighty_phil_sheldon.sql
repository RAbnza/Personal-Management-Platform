ALTER TABLE "files"."private_attachment" ADD COLUMN "scan_lease_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "files"."private_attachment" ADD COLUMN "scan_claim_id" uuid;