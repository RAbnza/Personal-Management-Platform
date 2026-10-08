-- Custom SQL migration file, put your code below! --
/* RESTRICT delete checks do not defer, even on a DEFERRABLE FK. Current
 * pointers form deliberate cycles with their immutable histories. NO ACTION
 * permits whole-graph operator deletion in one transaction, while the same
 * composite ownership/version FKs and all runtime immutability checks still
 * hold at commit. Ordinary roles still have no evidence DELETE grants. */
ALTER TABLE finance.financial_action DROP CONSTRAINT fk_financial_action_current_revision;
ALTER TABLE finance.financial_action ADD CONSTRAINT fk_financial_action_current_revision
 FOREIGN KEY(workspace_id,id,current_revision_id) REFERENCES finance.action_revision(workspace_id,action_id,id)
 ON DELETE NO ACTION ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE finance.debt DROP CONSTRAINT fk_debt_current_schedule_version;
ALTER TABLE finance.debt ADD CONSTRAINT fk_debt_current_schedule_version
 FOREIGN KEY(workspace_id,id,current_schedule_version_id) REFERENCES finance.debt_schedule_version(workspace_id,debt_id,id)
 ON DELETE NO ACTION ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE career.job_application DROP CONSTRAINT fk_job_application_current_history;
ALTER TABLE career.job_application ADD CONSTRAINT fk_job_application_current_history
 FOREIGN KEY(workspace_id,id,current_history_id) REFERENCES career.application_stage_history(workspace_id,application_id,id)
 ON DELETE NO ACTION ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE career.job_application DROP CONSTRAINT fk_job_application_next_action_event;
ALTER TABLE career.job_application ADD CONSTRAINT fk_job_application_next_action_event
 FOREIGN KEY(workspace_id,id,next_action_event_id) REFERENCES career.application_event(workspace_id,application_id,id)
 ON DELETE NO ACTION ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED;
