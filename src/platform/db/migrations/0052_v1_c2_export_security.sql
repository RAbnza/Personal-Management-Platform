/* V1 synchronous CSV provenance only. No persisted CSV/private object, worker
 * export job or portable workspace bundle is introduced. Completed means the
 * bounded CSV has been prepared, not that a browser successfully received it. */
REVOKE ALL ON SCHEMA ops FROM PUBLIC,auth_adapter,queue_broker,worker_domain,lifecycle_operator;
GRANT USAGE ON SCHEMA ops TO app_domain;
REVOKE ALL ON ops.export_run FROM PUBLIC,app_domain,auth_adapter,queue_broker,worker_domain,lifecycle_operator;
GRANT SELECT,INSERT,DELETE ON ops.export_run TO app_domain;
ALTER TABLE ops.export_run ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.export_run FORCE ROW LEVEL SECURITY;
CREATE POLICY export_run_owner_access ON ops.export_run FOR ALL TO app_domain
USING (workspace_id=NULLIF(current_setting('app.workspace_id',true),'')::uuid
  AND requested_by_user_id=NULLIF(current_setting('app.user_id',true),'')::uuid
  AND EXISTS(SELECT 1 FROM core.workspace w JOIN core.user_profile u ON u.user_id=w.owner_user_id
    WHERE w.id=workspace_id AND w.owner_user_id=NULLIF(current_setting('app.user_id',true),'')::uuid AND w.state='active' AND u.lifecycle='active'))
WITH CHECK (workspace_id=NULLIF(current_setting('app.workspace_id',true),'')::uuid
  AND requested_by_user_id=NULLIF(current_setting('app.user_id',true),'')::uuid
  AND EXISTS(SELECT 1 FROM core.workspace w JOIN core.user_profile u ON u.user_id=w.owner_user_id
    WHERE w.id=workspace_id AND w.owner_user_id=NULLIF(current_setting('app.user_id',true),'')::uuid AND w.state='active' AND u.lifecycle='active'));
--> statement-breakpoint
CREATE FUNCTION ops.guard_export_run() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'export provenance is immutable' USING ERRCODE='23514'; END IF;
  IF OLD.created_at>=transaction_timestamp()-interval '30 days' THEN
    RAISE EXCEPTION 'export provenance retains thirty days' USING ERRCODE='23514';
  END IF;
  RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION ops.guard_export_run() FROM PUBLIC;
CREATE TRIGGER export_run_guard BEFORE UPDATE OR DELETE ON ops.export_run FOR EACH ROW EXECUTE FUNCTION ops.guard_export_run();
--> statement-breakpoint
CREATE FUNCTION ops.validate_export_run() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM core.workspace w WHERE w.id=NEW.workspace_id AND w.owner_user_id=NEW.requested_by_user_id)
    OR NOT EXISTS(SELECT 1 FROM core.command_receipt c WHERE c.workspace_id=NEW.workspace_id AND c.id=NEW.command_receipt_id
      AND c.command_type='reporting.export_csv' AND c.state='completed' AND c.result_json->>'exportRunId'=NEW.id::text) THEN
    RAISE EXCEPTION 'export provenance needs owned completed command' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION ops.validate_export_run() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER export_run_completion AFTER INSERT ON ops.export_run DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ops.validate_export_run();
