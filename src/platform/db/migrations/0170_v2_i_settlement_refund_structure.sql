CREATE TABLE "sharing"."settlement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"reported_by" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"advance_minor" bigint NOT NULL,
	"mode" text NOT NULL,
	"payment_date" date NOT NULL,
	"note" text,
	"state" text DEFAULT 'pending' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"original_receipt_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_settlement_scope" UNIQUE("group_id","id"),
	CONSTRAINT "uq_settlement_receipt" UNIQUE("group_id","original_receipt_id"),
	CONSTRAINT "ck_settlement_shape" CHECK ("sharing"."settlement"."sender_id"<>"sharing"."settlement"."recipient_id" AND "sharing"."settlement"."amount_minor">0 AND "sharing"."settlement"."advance_minor">=0 AND "sharing"."settlement"."advance_minor"<="sharing"."settlement"."amount_minor" AND "sharing"."settlement"."mode" IN ('full','custom','selected') AND "sharing"."settlement"."state" IN ('pending','disputed','confirmed','cancelled','reversed') AND "sharing"."settlement"."version">0 AND length(coalesce("sharing"."settlement"."note",''))<=2000)
);
--> statement-breakpoint
CREATE TABLE "sharing"."settlement_allocation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"settlement_id" uuid NOT NULL,
	"expense_id" uuid NOT NULL,
	"source_revision_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	CONSTRAINT "uq_settlement_allocation_bill" UNIQUE("group_id","settlement_id","expense_id"),
	CONSTRAINT "ck_settlement_allocation_amount" CHECK ("sharing"."settlement_allocation"."amount_minor">0)
);
--> statement-breakpoint
CREATE TABLE "sharing"."settlement_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"settlement_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"actor_id" uuid NOT NULL,
	"receipt_id" uuid NOT NULL,
	"from_state" text,
	"to_state" text NOT NULL,
	"confirmation_type" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_settlement_event_version" UNIQUE("group_id","settlement_id","version"),
	CONSTRAINT "uq_settlement_event_receipt" UNIQUE("group_id","receipt_id"),
	CONSTRAINT "ck_settlement_event_shape" CHECK ("sharing"."settlement_event"."version">0 AND "sharing"."settlement_event"."to_state" IN ('pending','disputed','confirmed','cancelled','reversed') AND "sharing"."settlement_event"."confirmation_type" IN ('reported','recipient_authenticated','manual_entry','participant_transition') AND length(btrim("sharing"."settlement_event"."reason")) BETWEEN 1 AND 2000)
);
--> statement-breakpoint
CREATE TABLE "sharing"."refund" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"expense_id" uuid NOT NULL,
	"source_revision_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"receipt_id" uuid NOT NULL,
	"total_minor" bigint NOT NULL,
	"refund_date" date NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_shared_refund_scope" UNIQUE("group_id","id"),
	CONSTRAINT "uq_shared_refund_receipt" UNIQUE("group_id","receipt_id"),
	CONSTRAINT "ck_shared_refund_shape" CHECK ("sharing"."refund"."total_minor">0 AND length(btrim("sharing"."refund"."reason")) BETWEEN 1 AND 2000)
);
--> statement-breakpoint
ALTER TABLE "sharing"."settlement" ADD CONSTRAINT "settlement_group_id_expense_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "sharing"."expense_group"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharing"."settlement" ADD CONSTRAINT "fk_settlement_sender" FOREIGN KEY ("group_id","sender_id") REFERENCES "sharing"."participant"("group_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharing"."settlement" ADD CONSTRAINT "fk_settlement_recipient" FOREIGN KEY ("group_id","recipient_id") REFERENCES "sharing"."participant"("group_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharing"."settlement" ADD CONSTRAINT "fk_settlement_reporter" FOREIGN KEY ("group_id","reported_by") REFERENCES "sharing"."participant"("group_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharing"."settlement" ADD CONSTRAINT "fk_settlement_receipt" FOREIGN KEY ("group_id","original_receipt_id") REFERENCES "sharing"."group_command_receipt"("group_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharing"."settlement_allocation" ADD CONSTRAINT "settlement_allocation_group_id_expense_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "sharing"."expense_group"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharing"."settlement_allocation" ADD CONSTRAINT "fk_settlement_allocation_parent" FOREIGN KEY ("group_id","settlement_id") REFERENCES "sharing"."settlement"("group_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharing"."settlement_allocation" ADD CONSTRAINT "fk_settlement_allocation_source" FOREIGN KEY ("group_id","expense_id","source_revision_id") REFERENCES "sharing"."expense_revision"("group_id","expense_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharing"."settlement_event" ADD CONSTRAINT "settlement_event_group_id_expense_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "sharing"."expense_group"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharing"."settlement_event" ADD CONSTRAINT "fk_settlement_event_parent" FOREIGN KEY ("group_id","settlement_id") REFERENCES "sharing"."settlement"("group_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharing"."settlement_event" ADD CONSTRAINT "fk_settlement_event_receipt" FOREIGN KEY ("group_id","receipt_id") REFERENCES "sharing"."group_command_receipt"("group_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharing"."settlement_event" ADD CONSTRAINT "fk_settlement_event_actor" FOREIGN KEY ("group_id","actor_id") REFERENCES "sharing"."participant"("group_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharing"."refund" ADD CONSTRAINT "refund_group_id_expense_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "sharing"."expense_group"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharing"."refund" ADD CONSTRAINT "fk_shared_refund_expense" FOREIGN KEY ("group_id","expense_id") REFERENCES "sharing"."shared_expense"("group_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharing"."refund" ADD CONSTRAINT "fk_shared_refund_revision" FOREIGN KEY ("group_id","expense_id","source_revision_id") REFERENCES "sharing"."expense_revision"("group_id","expense_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharing"."refund" ADD CONSTRAINT "fk_shared_refund_receipt" FOREIGN KEY ("group_id","receipt_id") REFERENCES "sharing"."group_command_receipt"("group_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharing"."refund" ADD CONSTRAINT "fk_shared_refund_actor" FOREIGN KEY ("group_id","actor_id") REFERENCES "sharing"."participant"("group_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_settlement_state" ON "sharing"."settlement" USING btree ("group_id","state","created_at");