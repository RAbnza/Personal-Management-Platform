BEGIN;
DO $$DECLARE definition text:=pg_get_functiondef('salapiya_p3.apply_v1(uuid,uuid,jsonb)'::regprocedure);needle text:='doc:=jsonb_set(doc,''{owner}'',to_jsonb(pid));';BEGIN
 IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'Unexpected ownership transfer definition';END IF;
 EXECUTE replace(definition,needle,needle||$patch$
   doc:=jsonb_set(doc,ARRAY['people',me,'intervals'],people->me->'intervals'||jsonb_build_array(jsonb_build_object('role','member','changedAt',stamp,'actor',actor::text,'reason',v->>'reason')));
   doc:=jsonb_set(doc,ARRAY['people',pid,'intervals'],people->pid->'intervals'||jsonb_build_array(jsonb_build_object('role','owner','changedAt',stamp,'actor',actor::text,'reason',v->>'reason')));
 $patch$);
END $$;
-- Provider identity deletion closes authority; it does not delete shared bills
-- or transfer ownership to peers. This adapter does not initiate user deletion.
CREATE FUNCTION salapiya_p3.identity_deleted() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=OLD.id;g record;doc jsonb;p record;person jsonb;stamp text:=clock_timestamp()::text;BEGIN
 IF TG_OP='UPDATE' AND (NEW.deleted_at IS NULL OR OLD.deleted_at IS NOT NULL) THEN RETURN NEW;END IF;
 FOR g IN SELECT id FROM salapiya_p3.groups x WHERE EXISTS(SELECT 1 FROM jsonb_each(x.document->'people') person_entry WHERE person_entry.value->>'user'=actor::text) ORDER BY id LOOP
   PERFORM pg_advisory_xact_lock(hashtextextended(g.id::text,3));
   SELECT document INTO doc FROM salapiya_p3.groups WHERE id=g.id FOR UPDATE;
   FOR p IN SELECT * FROM jsonb_each(doc->'people') WHERE value->>'user'=actor::text LOOP
     person:=p.value||jsonb_build_object('name','Deleted participant','user',NULL,'kind','deleted','active',false,
       'entitled',(SELECT coalesce(jsonb_agg(k),'[]') FROM jsonb_object_keys(doc->'bills') k),
       'intervals',p.value->'intervals'||jsonb_build_array(jsonb_build_object('left',stamp,'reason','Provider identity deleted')));
     doc:=jsonb_set(doc,ARRAY['people',p.key],person);
     IF doc->>'owner'=p.key THEN doc:=jsonb_set(doc,'{archived}','true');END IF;
   END LOOP;
   doc:=jsonb_set(doc,'{version}',to_jsonb((doc->>'version')::bigint+1));
   doc:=jsonb_set(doc,'{activity}',doc->'activity'||jsonb_build_array(jsonb_build_object('id',gen_random_uuid()::text,'op','identity_deleted','actor',actor::text,'at',stamp,'reason','Shared evidence retained; ownerless administration archived')));
   UPDATE salapiya_p3.groups SET document=doc,version=(doc->>'version')::bigint WHERE id=g.id;
   DELETE FROM public.p3_group WHERE owner_id=actor AND group_id=g.id;
   PERFORM salapiya_p3.publish(g.id);
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;END $$;
CREATE TRIGGER salapiya_p3_identity_deleted AFTER UPDATE OF deleted_at OR DELETE ON auth.users FOR EACH ROW EXECUTE FUNCTION salapiya_p3.identity_deleted();
REVOKE ALL ON FUNCTION salapiya_p3.identity_deleted() FROM PUBLIC,anon,authenticated;
COMMIT;
