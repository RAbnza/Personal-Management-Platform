-- Preserve the original two P0 streams and add only the P2 private projection.
-- No receipt, staging, local draft, key, attachment or unrelated table is in CDC.
BEGIN;
DO $$
DECLARE t text; BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='salapiya_p0_replication') THEN
   GRANT SELECT ON public.p2_profile,public.p2_command TO salapiya_p0_replication;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='powersync') THEN
   IF EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='powersync'
     AND (schemaname<>'public' OR tablename NOT IN ('p0_profile','p0_accepted','p2_profile','p2_command'))) OR
     EXISTS(SELECT 1 FROM pg_publication WHERE pubname='powersync' AND puballtables)
   THEN RAISE EXCEPTION 'unexpected replication scope; review without resetting publication'; END IF;
   FOREACH t IN ARRAY ARRAY['p2_profile','p2_command'] LOOP
     IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='powersync' AND schemaname='public' AND tablename=t)
     THEN EXECUTE format('ALTER PUBLICATION powersync ADD TABLE public.%I',t); END IF;
   END LOOP;
 END IF;
END $$;
COMMIT;
