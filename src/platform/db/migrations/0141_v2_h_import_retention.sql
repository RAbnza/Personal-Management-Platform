
CREATE POLICY h_import_expiry ON ops.import_batch TO migration_owner USING(expires_at<clock_timestamp()) WITH CHECK(expires_at<clock_timestamp());
CREATE POLICY h_row_expiry ON ops.import_row TO migration_owner USING(EXISTS(SELECT 1 FROM ops.import_batch b WHERE b.id=batch_id AND b.workspace_id=workspace_id AND b.expires_at<clock_timestamp())) WITH CHECK(EXISTS(SELECT 1 FROM ops.import_batch b WHERE b.id=batch_id AND b.workspace_id=workspace_id AND b.expires_at<clock_timestamp()));
DO $$ DECLARE d text;BEGIN d:=pg_get_functiondef('ops.guard_import_evidence()'::regprocedure);d:=regexp_replace(d,'\mBEGIN\M','BEGIN IF current_user=''migration_owner'' AND TG_OP=''UPDATE'' AND current_setting(''ops.expiring_imports'',true)=''yes'' THEN RETURN NEW;END IF;');EXECUTE d;END $$;
CREATE FUNCTION ops.expire_import_staging() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE ids uuid[];n integer;BEGIN
 SELECT array_agg(id) INTO ids FROM(SELECT id FROM ops.import_batch WHERE expires_at<clock_timestamp() AND preview_json->'rows'<>'[]'::jsonb ORDER BY expires_at LIMIT 100 FOR UPDATE SKIP LOCKED) b;
 PERFORM set_config('ops.expiring_imports','yes',true);
 UPDATE ops.import_row SET normalized_json=NULL,validation_errors_json='[]'::jsonb WHERE batch_id=ANY(ids);
 UPDATE ops.import_batch SET preview_json=jsonb_set(preview_json,'{rows}','[]'::jsonb),state=CASE WHEN state IN ('completed','cancelled') THEN state ELSE 'cancelled' END WHERE id=ANY(ids);GET DIAGNOSTICS n=ROW_COUNT;RETURN n;END $$;
REVOKE ALL ON FUNCTION ops.expire_import_staging() FROM PUBLIC;GRANT EXECUTE ON FUNCTION ops.expire_import_staging() TO worker_domain,lifecycle_operator;
GRANT EXECUTE ON FUNCTION ops.expire_portable_artifacts() TO lifecycle_operator;
