/* Deferred reminder cancellation retains the existing financial reactivation
 * epoch. Worker may advance this metadata, never change owner reminder mode. */
GRANT INSERT(workspace_id,personal_event_id,application_event_id,debt_obligation_id,card_statement_id,card_installment_id,expected_occurrence_id,notification_generation),UPDATE(notification_generation) ON time.source_reminder_setting TO worker_domain;
CREATE POLICY notification_epoch ON time.source_reminder_setting TO worker_domain USING(workspace_id=NULLIF(current_setting('app.workspace_id',true),'')::uuid AND EXISTS(SELECT 1 FROM core.workspace w JOIN core.user_profile p ON p.user_id=w.owner_user_id WHERE w.id=workspace_id AND w.owner_user_id=NULLIF(current_setting('app.user_id',true),'')::uuid AND w.state='active' AND p.lifecycle='active'));
CREATE TRIGGER notification_worker_lifecycle BEFORE INSERT OR UPDATE ON time.source_reminder_setting FOR EACH ROW EXECUTE FUNCTION time.guard_notification_worker();
