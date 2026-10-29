BEGIN;
-- Read-only original outcome after the provider identity/session is gone. A
-- signed JWT subject may inspect only its own tombstone; it grants no authority.
CREATE FUNCTION public.p7_deletion_status() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT CASE WHEN EXISTS(SELECT 1 FROM salapiya_lifecycle.deleted_account WHERE owner_id=auth.uid())
 THEN jsonb_build_object('application_deleted',true,'auth_cleanup_pending',EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid()))
 ELSE jsonb_build_object('application_deleted',false) END
$$;
REVOKE ALL ON FUNCTION public.p7_deletion_status() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.p7_deletion_status() TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
