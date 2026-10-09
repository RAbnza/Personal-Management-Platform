GRANT UPDATE(deletion_requested_at) ON core.user_profile TO lifecycle_operator;
CREATE FUNCTION ops.guard_restore_profile_date() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF current_user='lifecycle_operator' AND NEW.deletion_requested_at IS DISTINCT FROM OLD.deletion_requested_at THEN
   IF current_database() !~ '^pmp_restore_[a-f0-9]{32}$' OR NOT EXISTS(
    SELECT 1 FROM ops.restore_deletion_authorization a JOIN ops.deletion_request r ON r.id=a.request_id
    WHERE a.request_id=NULLIF(current_setting('ops.deletion_request_id',true),'')::uuid
    AND a.target_user_id=NEW.user_id AND r.state='purging' AND r.requested_at=NEW.deletion_requested_at) THEN
     RAISE EXCEPTION 'Deletion request date requires an isolated recovery authorization' USING ERRCODE='42501';
   END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION ops.guard_restore_profile_date() FROM PUBLIC;
CREATE TRIGGER restore_profile_date_guard BEFORE UPDATE OF deletion_requested_at ON core.user_profile FOR EACH ROW EXECUTE FUNCTION ops.guard_restore_profile_date();
