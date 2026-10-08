-- Custom SQL migration file, put your code below! --
CREATE FUNCTION ops.guard_deletion_tombstone() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NOT EXISTS(SELECT 1 FROM ops.deletion_request r WHERE r.id=NEW.request_id
    AND r.id=NULLIF(current_setting('ops.deletion_request_id',true),'')::uuid
    AND r.target_user_id=NEW.target_user_id AND r.target_workspace_id=NEW.target_workspace_id
    AND r.state='purging' AND r.purge_after<=clock_timestamp()) THEN
    RAISE EXCEPTION 'Tombstone requires its authorized purge' USING ERRCODE='23514';
  END IF;
 ELSE
  IF (to_jsonb(NEW)-'register_exported_at') IS DISTINCT FROM (to_jsonb(OLD)-'register_exported_at')
    OR OLD.register_exported_at IS NOT NULL OR NEW.register_exported_at IS NULL
    OR NEW.register_exported_at<OLD.purged_at OR NEW.register_exported_at>clock_timestamp() THEN
    RAISE EXCEPTION 'Tombstone identity and completion evidence are immutable' USING ERRCODE='23514';
  END IF;
 END IF; RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION ops.guard_deletion_tombstone() FROM PUBLIC;
CREATE TRIGGER deletion_tombstone_guard BEFORE INSERT OR UPDATE ON ops.deletion_tombstone FOR EACH ROW EXECUTE FUNCTION ops.guard_deletion_tombstone();
