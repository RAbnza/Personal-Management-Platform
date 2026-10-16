CREATE TABLE "sharing"."refund_allocation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"refund_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"axis" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	CONSTRAINT "uq_refund_allocation_person" UNIQUE("group_id","refund_id","axis","participant_id"),
	CONSTRAINT "ck_refund_allocation_shape" CHECK ("sharing"."refund_allocation"."axis" IN ('received','share_credit') AND "sharing"."refund_allocation"."amount_minor">0)
);
--> statement-breakpoint
ALTER TABLE "sharing"."refund_allocation" ADD CONSTRAINT "refund_allocation_group_id_expense_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "sharing"."expense_group"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharing"."refund_allocation" ADD CONSTRAINT "fk_refund_allocation_parent" FOREIGN KEY ("group_id","refund_id") REFERENCES "sharing"."refund"("group_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharing"."refund_allocation" ADD CONSTRAINT "fk_refund_allocation_person" FOREIGN KEY ("group_id","participant_id") REFERENCES "sharing"."participant"("group_id","id") ON DELETE no action ON UPDATE no action;