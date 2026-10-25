BEGIN;
CREATE FUNCTION public.p3_review_invitation(group_id uuid,token text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=salapiya_p0.require_current_session();inv salapiya_p3.invite;doc jsonb;email text;BEGIN
 IF length(token)<>64 OR token !~ '^[0-9a-f]{64}$' THEN PERFORM salapiya_p3.fail('Invitation unavailable');END IF;
 SELECT * INTO inv FROM salapiya_p3.invite WHERE salapiya_p3.invite.group_id=p3_review_invitation.group_id AND token_hash=encode(sha256(convert_to(token,'UTF8')),'hex');
 SELECT lower(u.email) INTO email FROM auth.users u WHERE u.id=actor AND u.email_confirmed_at IS NOT NULL;
 SELECT document INTO doc FROM salapiya_p3.groups WHERE id=group_id;
 IF inv.id IS NULL OR inv.revoked OR inv.used_by IS NOT NULL OR inv.expires<=clock_timestamp() OR email IS DISTINCT FROM inv.email OR
 (inv.participant IS NOT NULL AND inv.version<>(doc->>'version')::bigint) OR
 NOT EXISTS(SELECT 1 FROM jsonb_each(doc->'people') WHERE value->>'user'=inv.inviter::text AND (value->>'active')::boolean)
 THEN PERFORM salapiya_p3.fail('Invitation unavailable, changed, expired or wrong verified recipient');END IF;
 RETURN jsonb_build_object('historyPolicy',1,'document',doc,'claim',inv.participant::text,'expires',inv.expires,
 'disclosure','Joining shares the group history with you. Manual receipts remain unverified after a claim. Private accounts and financial records are never shared.');
END $$;
CREATE FUNCTION public.p3_review_command(command_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=salapiya_p0.require_current_session();r jsonb;BEGIN
 SELECT result INTO r FROM salapiya_p3.receipt WHERE salapiya_p3.receipt.actor=p3_review_command.actor AND id=command_id;
 RETURN coalesce(r,jsonb_build_object('outcome','missing','id',command_id::text));END $$;
REVOKE ALL ON FUNCTION public.p3_review_invitation(uuid,text),public.p3_review_command(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.p3_review_invitation(uuid,text),public.p3_review_command(uuid) TO authenticated;
CREATE FUNCTION salapiya_p3.immutable() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$BEGIN RAISE EXCEPTION 'immutable shared command evidence';END $$;
CREATE TRIGGER p3_receipt_immutable BEFORE UPDATE OR DELETE ON salapiya_p3.receipt FOR EACH ROW EXECUTE FUNCTION salapiya_p3.immutable();
REVOKE ALL ON FUNCTION salapiya_p3.immutable() FROM PUBLIC,anon,authenticated;
DO $$BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='salapiya_p0_replication') THEN GRANT SELECT ON public.p3_group TO salapiya_p0_replication;END IF;
 IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='powersync') THEN
   IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='powersync' AND puballtables) OR
     EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='powersync' AND (schemaname<>'public' OR tablename NOT IN ('p0_profile','p0_accepted','p2_profile','p2_command','p3_group')))
   THEN RAISE EXCEPTION 'Unexpected replication scope; preserve and review publication';END IF;
   IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='powersync' AND schemaname='public' AND tablename='p3_group') THEN ALTER PUBLICATION powersync ADD TABLE public.p3_group;END IF;
 END IF;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
