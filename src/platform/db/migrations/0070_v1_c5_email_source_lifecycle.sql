-- A SECURITY DEFINER owned by migration_owner still obeys FORCE RLS. Give
-- that owner only the transaction-local subject selected by the scalar
-- email eligibility function. No runtime role gains private-table access.
CREATE POLICY email_eligibility_lookup ON core.user_profile FOR SELECT TO migration_owner
USING (user_id=NULLIF(current_setting('ops.email_user_id',true),'')::uuid);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION ops.email_source_active(p_user_id uuid,p_purpose text,p_recipient text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE previous_subject text:=current_setting('ops.email_user_id',true); eligible boolean;
BEGIN
 PERFORM set_config('ops.email_user_id',p_user_id::text,true);
 SELECT EXISTS(SELECT 1 FROM auth."user" u LEFT JOIN core.user_profile p ON p.user_id=u.id
  WHERE u.id=p_user_id AND u.email=p_recipient AND (p.lifecycle IS NULL OR p.lifecycle='active')
  AND p_purpose IN ('verify_email','password_reset','security_notice')
  AND (p_purpose<>'verify_email' OR NOT u.email_verified)) INTO eligible;
 PERFORM set_config('ops.email_user_id',COALESCE(previous_subject,''),true);
 RETURN eligible;
EXCEPTION WHEN OTHERS THEN
 PERFORM set_config('ops.email_user_id',COALESCE(previous_subject,''),true);
 RAISE;
END $$;
REVOKE ALL ON FUNCTION ops.email_source_active(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops.email_source_active(uuid,text,text) TO queue_broker;
