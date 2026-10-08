/* A completion authorizes deferred checks only in the transaction that wrote
 * the completed tuple, even if another operator transaction began earlier. */
CREATE OR REPLACE FUNCTION ops.purge_scope_allowed(p_workspace_id uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT current_user='lifecycle_operator' AND EXISTS(SELECT 1 FROM ops.deletion_request r
 WHERE r.id=NULLIF(current_setting('ops.deletion_request_id',true),'')::uuid
 AND r.target_workspace_id=p_workspace_id AND r.purge_after<=transaction_timestamp()
 AND (r.state='purging' OR (r.state='completed'
 AND r.xmin::text=(pg_current_xact_id()::text::numeric % 4294967296)::text)))
$$;
