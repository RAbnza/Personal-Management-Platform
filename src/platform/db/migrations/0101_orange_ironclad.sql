CREATE INDEX "ix_expected_command" ON "planning"."expected_occurrence" USING btree ("workspace_id","command_receipt_id");--> statement-breakpoint
CREATE INDEX "ix_expected_actor" ON "planning"."expected_occurrence" USING btree ("recorded_by_user_id");--> statement-breakpoint
CREATE INDEX "ix_occurrence_link_command" ON "planning"."occurrence_actual_link" USING btree ("workspace_id","command_receipt_id");--> statement-breakpoint
CREATE INDEX "ix_occurrence_link_actor" ON "planning"."occurrence_actual_link" USING btree ("recorded_by_user_id");--> statement-breakpoint
CREATE INDEX "ix_recurrence_command" ON "planning"."recurrence_version" USING btree ("workspace_id","command_receipt_id");--> statement-breakpoint
CREATE INDEX "ix_recurrence_actor" ON "planning"."recurrence_version" USING btree ("recorded_by_user_id");--> statement-breakpoint
CREATE INDEX "ix_recurrence_account" ON "planning"."recurrence_version" USING btree ("workspace_id","default_account_id");--> statement-breakpoint
CREATE INDEX "ix_recurrence_category" ON "planning"."recurrence_version" USING btree ("workspace_id","category_id");--> statement-breakpoint
CREATE INDEX "ix_recurring_command" ON "planning"."recurring_obligation" USING btree ("workspace_id","command_receipt_id");--> statement-breakpoint
CREATE INDEX "ix_recurring_actor" ON "planning"."recurring_obligation" USING btree ("recorded_by_user_id");