-- Custom SQL migration file, put your code below! --
/* Deferred DELETE evidence checks run during the same finishing transaction.
 * A completed request cannot authorize a later transaction's purge. */
CREATE OR REPLACE FUNCTION ops.purge_scope_allowed(p_workspace_id uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT current_user='lifecycle_operator' AND EXISTS(SELECT 1 FROM ops.deletion_request r
 WHERE r.id=NULLIF(current_setting('ops.deletion_request_id',true),'')::uuid
 AND r.target_workspace_id=p_workspace_id AND r.purge_after<=transaction_timestamp()
 AND (r.state='purging' OR (r.state='completed' AND r.completed_at>=transaction_timestamp())))
$$;
CREATE OR REPLACE FUNCTION ops.guard_auth_purge() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE uid uuid; row_json jsonb; BEGIN
 IF current_user<>'lifecycle_operator' THEN RETURN OLD; END IF;
 SELECT target_user_id INTO uid FROM ops.deletion_request WHERE id=NULLIF(current_setting('ops.deletion_request_id',true),'')::uuid
 AND state='purging' AND purge_after<=transaction_timestamp();
 row_json:=to_jsonb(OLD);
 IF uid IS NULL OR (TG_TABLE_NAME='user' AND row_json->>'id'<>uid::text)
   OR (TG_TABLE_NAME IN ('session','account') AND row_json->>'user_id'<>uid::text)
   OR (TG_TABLE_NAME='verification' AND row_json->>'value'<>uid::text) THEN
   RAISE EXCEPTION 'Auth purge is outside approved identity' USING ERRCODE='42501';
 END IF; RETURN OLD;
END $$;
