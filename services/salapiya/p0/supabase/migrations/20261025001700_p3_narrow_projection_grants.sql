BEGIN;
-- Supabase projects may install public-schema default grants. Remove them
-- explicitly instead of depending only on the absence of an RLS write policy.
REVOKE ALL ON public.p3_group,public.p3_private_review FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.p3_group,public.p3_private_review TO authenticated;
COMMIT;
