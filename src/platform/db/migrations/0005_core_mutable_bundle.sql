ALTER TABLE "core"."user_profile" DROP CONSTRAINT "user_profile_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "core"."workspace" DROP CONSTRAINT "workspace_owner_user_id_user_profile_user_id_fk";
--> statement-breakpoint
ALTER TABLE "core"."workspace_preference" DROP CONSTRAINT "workspace_preference_workspace_id_workspace_id_fk";
--> statement-breakpoint
ALTER TABLE "core"."user_profile" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."user_profile" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."workspace" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."workspace" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."workspace_preference" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."workspace_preference" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."user_profile" ADD CONSTRAINT "user_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "core"."workspace" ADD CONSTRAINT "workspace_owner_user_id_user_profile_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "core"."user_profile"("user_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "core"."workspace_preference" ADD CONSTRAINT "workspace_preference_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "core"."user_profile" ADD CONSTRAINT "user_profile_version_check" CHECK ("core"."user_profile"."version" > 0);--> statement-breakpoint
ALTER TABLE "core"."workspace" ADD CONSTRAINT "workspace_version_check" CHECK ("core"."workspace"."version" > 0);--> statement-breakpoint
ALTER TABLE "core"."workspace_preference" ADD CONSTRAINT "workspace_preference_version_check" CHECK ("core"."workspace_preference"."version" > 0);