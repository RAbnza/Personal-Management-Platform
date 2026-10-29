BEGIN;
-- This is a CDC authorization index, not a client-visible device directory.
CREATE TABLE public.p7_sync_session(id uuid PRIMARY KEY,owner_id uuid NOT NULL);
ALTER TABLE public.p7_sync_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.p7_sync_session FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.p7_sync_session FROM PUBLIC,anon,authenticated;
CREATE FUNCTION salapiya_lifecycle.sync_session_changed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF TG_OP='DELETE' THEN DELETE FROM public.p7_sync_session WHERE id=OLD.id; RETURN OLD; END IF;
 INSERT INTO public.p7_sync_session SELECT NEW.id,NEW.user_id
 WHERE EXISTS(SELECT 1 FROM auth.users WHERE id=NEW.user_id AND deleted_at IS NULL
 AND (banned_until IS NULL OR banned_until<=clock_timestamp()))
 AND NOT EXISTS(SELECT 1 FROM salapiya_lifecycle.deleted_account WHERE owner_id=NEW.user_id)
 AND NOT EXISTS(SELECT 1 FROM salapiya_lifecycle.device_session WHERE session_id=NEW.id AND revoked_at IS NOT NULL)
 ON CONFLICT(id) DO NOTHING;
 RETURN NEW;
END $$;
CREATE TRIGGER salapiya_session_entitlement AFTER INSERT OR DELETE ON auth.sessions
FOR EACH ROW EXECUTE FUNCTION salapiya_lifecycle.sync_session_changed();
CREATE FUNCTION salapiya_lifecycle.sync_account_closed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF TG_TABLE_NAME='deleted_account' THEN DELETE FROM public.p7_sync_session WHERE owner_id=NEW.owner_id;
 ELSIF NEW.deleted_at IS NOT NULL OR NEW.banned_until>clock_timestamp()
 THEN DELETE FROM public.p7_sync_session WHERE owner_id=NEW.id; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER salapiya_deleted_entitlement AFTER INSERT ON salapiya_lifecycle.deleted_account
FOR EACH ROW EXECUTE FUNCTION salapiya_lifecycle.sync_account_closed();
CREATE TRIGGER salapiya_banned_entitlement AFTER UPDATE OF deleted_at,banned_until ON auth.users
FOR EACH ROW EXECUTE FUNCTION salapiya_lifecycle.sync_account_closed();
REVOKE ALL ON FUNCTION salapiya_lifecycle.sync_session_changed(),salapiya_lifecycle.sync_account_closed() FROM PUBLIC,anon,authenticated;
INSERT INTO public.p7_sync_session SELECT s.id,s.user_id FROM auth.sessions s JOIN auth.users u ON u.id=s.user_id
WHERE u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=clock_timestamp())
AND NOT EXISTS(SELECT 1 FROM salapiya_lifecycle.deleted_account WHERE owner_id=u.id)
AND NOT EXISTS(SELECT 1 FROM salapiya_lifecycle.device_session WHERE session_id=s.id AND revoked_at IS NOT NULL);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='salapiya_p0_replication') THEN
 GRANT SELECT ON public.p7_sync_session TO salapiya_p0_replication; END IF;
 IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='powersync') THEN
 ALTER PUBLICATION powersync ADD TABLE public.p7_sync_session; END IF;
END $$;
COMMIT;
