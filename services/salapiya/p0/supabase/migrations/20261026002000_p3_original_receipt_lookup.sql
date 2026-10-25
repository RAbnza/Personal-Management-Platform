BEGIN;
-- Local PL/pgSQL variables cannot use the implicit parameter-block qualifier.
-- Keep receipt recovery actor-scoped without an ambiguous column/variable name.
CREATE OR REPLACE FUNCTION public.p3_review_command(command_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_actor uuid:=salapiya_p0.require_current_session();original jsonb;BEGIN
 SELECT evidence.result INTO original FROM salapiya_p3.receipt AS evidence
 WHERE evidence.actor=current_actor AND evidence.id=command_id;
 RETURN coalesce(original,jsonb_build_object('outcome','missing','id',command_id::text));END $$;
REVOKE ALL ON FUNCTION public.p3_review_command(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.p3_review_command(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
