-- Unpublished V3 foundation: current pointers are commit-time checked cycles.
ALTER TABLE tracker.template ADD CONSTRAINT tracker_template_current_fk FOREIGN KEY(workspace_id,id,current_version_id) REFERENCES tracker.template_version(workspace_id,template_id,id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE tracker.template_version ADD CONSTRAINT tracker_version_previous_fk FOREIGN KEY(workspace_id,template_id,previous_version_id) REFERENCES tracker.template_version(workspace_id,template_id,id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE tracker.template_version ADD CONSTRAINT tracker_title_identity_fk FOREIGN KEY(workspace_id,template_id,title_field_id) REFERENCES tracker.field_identity(workspace_id,template_id,id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE tracker.template_version ADD CONSTRAINT tracker_status_identity_fk FOREIGN KEY(workspace_id,template_id,status_field_id) REFERENCES tracker.field_identity(workspace_id,template_id,id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE tracker.template_version ADD CONSTRAINT tracker_deadline_identity_fk FOREIGN KEY(workspace_id,template_id,deadline_field_id) REFERENCES tracker.field_identity(workspace_id,template_id,id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE tracker.entry ADD CONSTRAINT tracker_entry_current_fk FOREIGN KEY(workspace_id,id,template_version_id,current_revision_id) REFERENCES tracker.entry_revision(workspace_id,entry_id,template_version_id,id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE tracker.entry_revision ADD CONSTRAINT tracker_revision_previous_fk FOREIGN KEY(workspace_id,previous_revision_id) REFERENCES tracker.entry_revision(workspace_id,id) DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
REVOKE ALL ON SCHEMA tracker FROM PUBLIC,auth_adapter,queue_broker,worker_domain;
GRANT USAGE ON SCHEMA tracker TO app_domain,lifecycle_operator;
CREATE FUNCTION tracker.guard_write() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE parent_state text; wid uuid; uid uuid;
BEGIN
  IF TG_OP='DELETE' THEN
    IF current_user='lifecycle_operator' AND ops.purge_scope_allowed(OLD.workspace_id) THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'tracker history cannot be deleted' USING ERRCODE='42501';
  END IF;
  wid:=NULLIF(current_setting('app.workspace_id',true),'')::uuid;
  uid:=NULLIF(current_setting('app.user_id',true),'')::uuid;
  IF NEW.workspace_id IS DISTINCT FROM wid THEN RAISE EXCEPTION 'tracker scope mismatch' USING ERRCODE='42501'; END IF;
  PERFORM p.user_id FROM core.user_profile p JOIN core.workspace w ON w.owner_user_id=p.user_id WHERE w.id=wid AND p.user_id=uid AND p.lifecycle='active' AND w.state='active' FOR SHARE OF p;
  IF NOT FOUND THEN RAISE EXCEPTION 'active tracker owner required' USING ERRCODE='42501'; END IF;
  PERFORM id FROM core.workspace WHERE id=wid FOR UPDATE;
  IF TG_OP='INSERT' AND NEW.recorded_by_user_id<>uid THEN RAISE EXCEPTION 'tracker actor mismatch' USING ERRCODE='42501'; END IF;
  IF TG_OP='UPDATE' THEN
    IF (NEW.id,NEW.workspace_id,NEW.recorded_by_user_id,NEW.created_at) IS DISTINCT FROM (OLD.id,OLD.workspace_id,OLD.recorded_by_user_id,OLD.created_at) THEN RAISE EXCEPTION 'immutable tracker identity' USING ERRCODE='23514'; END IF;
    IF TG_TABLE_NAME IN ('field_identity','entry_revision') THEN RAISE EXCEPTION 'immutable tracker evidence' USING ERRCODE='23514'; END IF;
    IF TG_TABLE_NAME='template_version' THEN
      IF OLD.state='published' THEN RAISE EXCEPTION 'published template is immutable' USING ERRCODE='23514'; END IF;
    END IF;
  END IF;
  IF TG_TABLE_NAME='field_definition' THEN
    SELECT state INTO parent_state FROM tracker.template_version WHERE id=NEW.template_version_id;
    IF parent_state IS DISTINCT FROM 'building' THEN RAISE EXCEPTION 'published field definitions are immutable' USING ERRCODE='23514'; END IF;
  ELSIF TG_TABLE_NAME='field_option' THEN
    SELECT v.state INTO parent_state FROM tracker.field_definition f JOIN tracker.template_version v ON v.id=f.template_version_id WHERE f.id=NEW.field_definition_id AND f.field_type='single_select';
    IF parent_state IS DISTINCT FROM 'building' THEN RAISE EXCEPTION 'published options are immutable' USING ERRCODE='23514'; END IF;
  ELSIF TG_TABLE_NAME='entry_revision' THEN
    IF NEW.previous_revision_id IS NOT NULL THEN
      PERFORM id FROM tracker.entry_revision WHERE id=NEW.previous_revision_id AND entry_id=NEW.entry_id AND revision_no=NEW.revision_no-1;
      IF NOT FOUND THEN RAISE EXCEPTION 'wrong entry predecessor' USING ERRCODE='23514'; END IF;
    ELSIF NEW.revision_no<>1 THEN RAISE EXCEPTION 'missing entry predecessor' USING ERRCODE='23514'; END IF;
  ELSIF TG_TABLE_NAME='template_migration' THEN
    IF NOT EXISTS(SELECT 1 FROM tracker.tracker t JOIN tracker.template_version f ON f.id=NEW.from_version_id JOIN tracker.template_version v ON v.id=NEW.to_version_id WHERE t.id=NEW.tracker_id AND f.template_id=t.template_id AND v.template_id=t.template_id AND f.state='published' AND v.state='published' AND v.version_no>f.version_no) THEN RAISE EXCEPTION 'wrong migration lineage' USING ERRCODE='23514'; END IF;
    IF TG_OP='UPDATE' AND (NEW.tracker_id,NEW.from_version_id,NEW.to_version_id,NEW.mapping_json,NEW.preview_counts_json,NEW.preview_hash) IS DISTINCT FROM (OLD.tracker_id,OLD.from_version_id,OLD.to_version_id,OLD.mapping_json,OLD.preview_counts_json,OLD.preview_hash) THEN RAISE EXCEPTION 'immutable reviewed migration' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION tracker.guard_write() FROM PUBLIC;
--> statement-breakpoint
-- Trigger is invoker-security: it never bypasses private RLS or grants execution.
CREATE FUNCTION tracker.check_pointers() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE e tracker.entry; v tracker.template_version; r tracker.entry_revision; title_key text; status_key text; deadline_key text; done boolean;
BEGIN
  IF current_user='lifecycle_operator' THEN RETURN NULL; END IF;
  IF TG_TABLE_NAME='entry' THEN
    SELECT * INTO e FROM tracker.entry WHERE id=NEW.id;
    IF NOT FOUND THEN RETURN NULL; END IF;
    SELECT * INTO v FROM tracker.template_version WHERE id=e.template_version_id;
    SELECT * INTO r FROM tracker.entry_revision WHERE id=e.current_revision_id;
    IF v.state IS DISTINCT FROM 'published' OR NOT EXISTS(SELECT 1 FROM tracker.tracker t WHERE t.id=e.tracker_id AND t.template_id=v.template_id AND (t.template_version_id=v.id OR EXISTS(SELECT 1 FROM tracker.template_migration m WHERE m.tracker_id=t.id AND m.to_version_id=v.id AND m.state IN ('confirmed','running','completed','cancelled','failed')))) THEN RAISE EXCEPTION 'entry version incompatible with tracker' USING ERRCODE='23514'; END IF;
    SELECT stable_key INTO title_key FROM tracker.field_identity WHERE id=v.title_field_id;
    SELECT stable_key INTO status_key FROM tracker.field_identity WHERE id=v.status_field_id;
    SELECT stable_key INTO deadline_key FROM tracker.field_identity WHERE id=v.deadline_field_id;
    done:=COALESCE((r.values_json->>(v.completion_json->>'key'))='true',false) OR COALESCE((v.completion_json->'statuses') ? (r.values_json->>status_key),false);
    IF e.title IS DISTINCT FROM r.values_json->>title_key OR e.status_key IS DISTINCT FROM NULLIF(r.values_json->>status_key,'') OR e.deadline_date IS DISTINCT FROM NULLIF(r.values_json->>deadline_key,'')::date OR (e.completed_at IS NOT NULL)<>done THEN RAISE EXCEPTION 'tracker extracted values disagree with revision' USING ERRCODE='23514'; END IF;
  ELSIF TG_TABLE_NAME='template_version' THEN
    SELECT * INTO v FROM tracker.template_version WHERE id=NEW.id;
    IF v.state='published' AND (NOT EXISTS(SELECT 1 FROM tracker.field_definition f WHERE f.template_version_id=v.id AND f.field_id=v.title_field_id AND f.field_type='text' AND f.required AND NOT f.retired) OR (v.status_field_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM tracker.field_definition f WHERE f.template_version_id=v.id AND f.field_id=v.status_field_id AND f.field_type='single_select' AND NOT f.retired)) OR (v.deadline_field_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM tracker.field_definition f WHERE f.template_version_id=v.id AND f.field_id=v.deadline_field_id AND f.field_type='date' AND NOT f.retired))) THEN RAISE EXCEPTION 'invalid published primary mappings' USING ERRCODE='23514'; END IF;
  ELSIF TG_TABLE_NAME='tracker' THEN
    IF NOT EXISTS(SELECT 1 FROM tracker.template_version WHERE id=NEW.template_version_id AND state='published') OR EXISTS(SELECT 1 FROM tracker.entry pending_entry WHERE pending_entry.tracker_id=NEW.id AND pending_entry.template_version_id<>NEW.template_version_id AND NOT EXISTS(SELECT 1 FROM tracker.template_migration m WHERE m.tracker_id=NEW.id AND m.from_version_id=NEW.template_version_id AND m.to_version_id=pending_entry.template_version_id AND m.state IN ('confirmed','running','failed','cancelled'))) THEN RAISE EXCEPTION 'tracker version cannot advance before migration finishes' USING ERRCODE='23514'; END IF;
  ELSIF TG_TABLE_NAME='template' THEN
    IF NOT EXISTS(SELECT 1 FROM tracker.template_version WHERE id=NEW.current_version_id AND template_id=NEW.id AND state='published') THEN RAISE EXCEPTION 'template current version must be published' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION tracker.check_pointers() FROM PUBLIC;
--> statement-breakpoint
DO $$ DECLARE tab text; owner_pred text:= 'workspace_id=NULLIF(current_setting(''app.workspace_id'',true),'''')::uuid AND EXISTS(SELECT 1 FROM core.workspace w JOIN core.user_profile p ON p.user_id=w.owner_user_id WHERE w.id=workspace_id AND w.owner_user_id=NULLIF(current_setting(''app.user_id'',true),'''')::uuid AND w.state=''active'' AND p.lifecycle=''active'')';
BEGIN
  FOREACH tab IN ARRAY ARRAY['template','template_version','field_identity','field_definition','field_option','tracker','entry','entry_revision','template_migration'] LOOP
    EXECUTE format('ALTER TABLE tracker.%I ENABLE ROW LEVEL SECURITY',tab);
    EXECUTE format('ALTER TABLE tracker.%I FORCE ROW LEVEL SECURITY',tab);
    EXECUTE format('REVOKE ALL ON tracker.%I FROM PUBLIC,auth_adapter,queue_broker,worker_domain',tab);
    EXECUTE format('GRANT SELECT,INSERT ON tracker.%I TO app_domain',tab);
    EXECUTE format('GRANT SELECT,DELETE ON tracker.%I TO lifecycle_operator',tab);
    EXECUTE format('CREATE POLICY tracker_owner ON tracker.%I TO app_domain USING(%s) WITH CHECK(%s)',tab,owner_pred,owner_pred);
    EXECUTE format('CREATE POLICY tracker_purge ON tracker.%I TO lifecycle_operator USING(ops.purge_scope_allowed(workspace_id))',tab);
    EXECUTE format('CREATE TRIGGER tracker_write_guard BEFORE INSERT OR UPDATE OR DELETE ON tracker.%I FOR EACH ROW EXECUTE FUNCTION tracker.guard_write()',tab);
  END LOOP;
END $$;
GRANT UPDATE(name,current_version_id,archived_at,version,command_receipt_id) ON tracker.template TO app_domain;
GRANT UPDATE(state) ON tracker.template_version TO app_domain;
GRANT UPDATE(name,template_version_id,archived_at,version,command_receipt_id) ON tracker.tracker TO app_domain;
GRANT UPDATE(template_version_id,current_revision_id,title,status_key,deadline_date,completed_at,archived_at,notification_generation,version,command_receipt_id) ON tracker.entry TO app_domain;
GRANT UPDATE(state,migrated_count,last_entry_id,completed_at) ON tracker.template_migration TO app_domain;
CREATE CONSTRAINT TRIGGER tracker_entry_pointer AFTER INSERT OR UPDATE ON tracker.entry DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION tracker.check_pointers();
CREATE CONSTRAINT TRIGGER tracker_version_pointer AFTER INSERT OR UPDATE ON tracker.template_version DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION tracker.check_pointers();
CREATE CONSTRAINT TRIGGER tracker_tracker_pointer AFTER INSERT OR UPDATE ON tracker.tracker DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION tracker.check_pointers();
CREATE CONSTRAINT TRIGGER tracker_template_pointer AFTER INSERT OR UPDATE ON tracker.template DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION tracker.check_pointers();
