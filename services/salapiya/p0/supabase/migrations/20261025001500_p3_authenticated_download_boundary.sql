BEGIN;
CREATE FUNCTION public.p3_group_boundary() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=salapiya_p0.require_current_session();result jsonb;BEGIN
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',g.id,'group_id',g.group_id::text,'version',g.version,
 'digest',encode(sha256(convert_to(g.document,'UTF8')),'hex')) ORDER BY g.id),'[]') INTO result FROM public.p3_group g WHERE g.owner_id=actor;
 RETURN result;END $$;
REVOKE ALL ON FUNCTION public.p3_group_boundary() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.p3_group_boundary() TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
