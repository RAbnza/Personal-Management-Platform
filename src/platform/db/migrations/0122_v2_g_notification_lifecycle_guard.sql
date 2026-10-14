/* Keep the established operator predicate, but fail closed before looking at
 * deletion requests when invoked by a non-operator runtime role. */
CREATE OR REPLACE FUNCTION ops.purge_scope_allowed(p_workspace_id uuid) RETURNS boolean LANGUAGE plpgsql STABLE SET search_path=pg_catalog AS $$
BEGIN
 IF current_user<>'lifecycle_operator' THEN RETURN false; END IF;
 RETURN EXISTS(SELECT 1 FROM ops.deletion_request r WHERE r.id=NULLIF(current_setting('ops.deletion_request_id',true),'')::uuid AND r.target_workspace_id=p_workspace_id AND r.purge_after<=transaction_timestamp() AND (r.state='purging' OR (r.state='completed' AND r.xmin::text=(pg_current_xact_id()::text::numeric % 4294967296)::text)));
END $$;
GRANT EXECUTE ON FUNCTION ops.purge_scope_allowed(uuid) TO worker_domain;
CREATE FUNCTION time.guard_notification_worker() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN IF current_user='worker_domain' THEN PERFORM ops.lock_notification_scope(); END IF; RETURN NEW; END $$;
REVOKE ALL ON FUNCTION time.guard_notification_worker() FROM PUBLIC;
CREATE TRIGGER notification_worker_lifecycle BEFORE INSERT OR UPDATE ON time.reminder_rule FOR EACH ROW EXECUTE FUNCTION time.guard_notification_worker();
CREATE TRIGGER notification_worker_lifecycle BEFORE INSERT OR UPDATE ON time.reminder_occurrence FOR EACH ROW EXECUTE FUNCTION time.guard_notification_worker();
CREATE TRIGGER notification_worker_lifecycle BEFORE INSERT OR UPDATE ON time.notification_delivery FOR EACH ROW EXECUTE FUNCTION time.guard_notification_worker();
CREATE TRIGGER notification_worker_lifecycle BEFORE INSERT OR UPDATE ON time.notification_attempt FOR EACH ROW EXECUTE FUNCTION time.guard_notification_worker();
