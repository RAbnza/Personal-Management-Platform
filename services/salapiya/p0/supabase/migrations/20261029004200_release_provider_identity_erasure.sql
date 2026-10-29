BEGIN;
-- Provider-side authorized deletion must not leave orphan private ledgers or
-- evade the deletion register. This trigger never grants recovery/impersonation.
CREATE OR REPLACE FUNCTION salapiya_p3.identity_deleted() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF TG_OP='UPDATE' AND (NEW.deleted_at IS NULL OR OLD.deleted_at IS NOT NULL) THEN RETURN NEW; END IF;
 INSERT INTO salapiya_lifecycle.deleted_account(owner_id,profile_id)
 VALUES(OLD.id,(SELECT id FROM public.p2_profile WHERE owner_id=OLD.id))
 ON CONFLICT(owner_id) DO NOTHING;
 PERFORM salapiya_lifecycle.purge_deleted_account(OLD.id);
 IF TG_OP='DELETE' THEN
  UPDATE salapiya_lifecycle.deleted_account SET auth_cleanup_completed_at=clock_timestamp() WHERE owner_id=OLD.id;
  RETURN OLD;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION salapiya_p3.identity_deleted() FROM PUBLIC,anon,authenticated;
COMMIT;
