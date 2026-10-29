BEGIN;
REVOKE ALL ON FUNCTION salapiya_p0.immutable(),salapiya_p3.immutable(),salapiya_p5.immutable() FROM PUBLIC,anon,authenticated;
-- A deleted profile identity is never recycled by a new account or old archive.
CREATE FUNCTION salapiya_lifecycle.reject_deleted_profile() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM salapiya_lifecycle.deleted_account WHERE profile_id=NEW.id)
 THEN RAISE EXCEPTION 'deleted profile identity cannot be reused' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION salapiya_lifecycle.reject_deleted_profile() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER p7_deleted_profile BEFORE INSERT ON public.p2_profile
FOR EACH ROW EXECUTE FUNCTION salapiya_lifecycle.reject_deleted_profile();
COMMIT;
