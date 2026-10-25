BEGIN;
CREATE TABLE salapiya_p3.event(id uuid PRIMARY KEY,group_id uuid NOT NULL REFERENCES salapiya_p3.groups,
 version bigint NOT NULL,actor uuid NOT NULL,operation text NOT NULL,recorded_at timestamptz NOT NULL,
 evidence jsonb NOT NULL,UNIQUE(group_id,version));
REVOKE ALL ON salapiya_p3.event FROM PUBLIC,anon,authenticated;
CREATE TRIGGER p3_event_immutable BEFORE UPDATE OR DELETE ON salapiya_p3.event FOR EACH ROW EXECUTE FUNCTION salapiya_p3.immutable();
CREATE FUNCTION salapiya_p3.validate_sources() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE b record;oldbill jsonb;rev jsonb;f jsonb;p record;received numeric;credit numeric;s record;prior jsonb;e jsonb;BEGIN
 IF NEW.document->>'id' IS DISTINCT FROM NEW.id::text OR (NEW.document->>'version')::bigint IS DISTINCT FROM NEW.version THEN PERFORM salapiya_p3.fail('Group identity/version constraint');END IF;
 IF TG_OP='UPDATE' THEN
   IF NEW.version<>OLD.version+1 OR NOT(NEW.document->'bills' ?& ARRAY(SELECT jsonb_object_keys(OLD.document->'bills'))) OR NOT(NEW.document->'settlements' ?& ARRAY(SELECT jsonb_object_keys(OLD.document->'settlements'))) THEN PERFORM salapiya_p3.fail('Retain prior group evidence');END IF;
 END IF;
 FOR b IN SELECT * FROM jsonb_each(NEW.document->'bills') LOOP
   oldbill:=CASE WHEN TG_OP='UPDATE' THEN OLD.document->'bills'->b.key ELSE NULL END;
   IF oldbill=b.value THEN CONTINUE;END IF;
   IF oldbill IS NOT NULL AND (oldbill->>'creator' IS DISTINCT FROM b.value->>'creator' OR
     (SELECT coalesce(jsonb_agg(x.value ORDER BY x.ordinality),'[]') FROM jsonb_array_elements(b.value->'revisions') WITH ORDINALITY x WHERE x.ordinality<=jsonb_array_length(oldbill->'revisions')) IS DISTINCT FROM oldbill->'revisions' OR
     (SELECT coalesce(jsonb_agg(x.value ORDER BY x.ordinality),'[]') FROM jsonb_array_elements(b.value->'refunds') WITH ORDINALITY x WHERE x.ordinality<=jsonb_array_length(oldbill->'refunds')) IS DISTINCT FROM oldbill->'refunds')
   THEN PERFORM salapiya_p3.fail('Immutable bill revision/refund evidence');END IF;
   IF jsonb_array_length(b.value->'revisions') NOT BETWEEN 1 AND 100 THEN PERFORM salapiya_p3.fail('Bill revision capacity');END IF;
   FOR rev IN SELECT value FROM jsonb_array_elements(b.value->'revisions') LOOP
     PERFORM salapiya_p3.axis(rev->'paid',NEW.document->'people',salapiya_p3.minor(rev->'total',true));
     PERFORM salapiya_p3.axis(rev->'shares',NEW.document->'people',salapiya_p3.minor(rev->'total',true));
   END LOOP;
   rev:=b.value->'revisions'->-1;
   FOR f IN SELECT value FROM jsonb_array_elements(b.value->'refunds') LOOP
     PERFORM salapiya_p3.axis(f->'received',NEW.document->'people',salapiya_p3.minor(f->'total',true));
     PERFORM salapiya_p3.axis(f->'credits',NEW.document->'people',salapiya_p3.minor(f->'total',true));
   END LOOP;
   FOR p IN SELECT * FROM jsonb_each(NEW.document->'people') LOOP
     SELECT coalesce(sum((x->'received'->>p.key)::numeric),0),coalesce(sum((x->'credits'->>p.key)::numeric),0) INTO received,credit FROM jsonb_array_elements(b.value->'refunds') x;
     IF received>coalesce((rev->'paid'->>p.key)::numeric,0) OR credit>coalesce((rev->'shares'->>p.key)::numeric,0) THEN PERFORM salapiya_p3.fail('Cumulative refund capacity constraint');END IF;
   END LOOP;
 END LOOP;
 FOR s IN SELECT * FROM jsonb_each(NEW.document->'settlements') LOOP
   prior:=CASE WHEN TG_OP='UPDATE' THEN OLD.document->'settlements'->s.key ELSE NULL END;
   IF prior IS NOT NULL AND ((prior-ARRAY['state','events','manual']) IS DISTINCT FROM (s.value-ARRAY['state','events','manual']) OR
     (prior->'manual'='true' AND s.value->'manual'<>'true') OR
     (SELECT coalesce(jsonb_agg(x.value ORDER BY x.ordinality),'[]') FROM jsonb_array_elements(s.value->'events') WITH ORDINALITY x WHERE x.ordinality<=jsonb_array_length(prior->'events')) IS DISTINCT FROM prior->'events')
   THEN PERFORM salapiya_p3.fail('Immutable payment terms/events');END IF;
   IF salapiya_p3.minor(s.value->'amount',true)<>salapiya_p3.minor(s.value->'advance')+(SELECT coalesce(sum(salapiya_p3.minor(x.value->'amount',true)),0) FROM jsonb_each(s.value->'allocations') x) THEN PERFORM salapiya_p3.fail('Payment allocation total constraint');END IF;
 END LOOP;
 RETURN NEW;END $$;
CREATE TRIGGER p3_group_source_constraints BEFORE INSERT OR UPDATE ON salapiya_p3.groups FOR EACH ROW EXECUTE FUNCTION salapiya_p3.validate_sources();
CREATE FUNCTION salapiya_p3.capture_event() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE e jsonb:=NEW.document->'activity'->-1;BEGIN
 INSERT INTO salapiya_p3.event VALUES((e->>'id')::uuid,NEW.id,NEW.version,(e->>'actor')::uuid,e->>'op',(e->>'at')::timestamptz,
 jsonb_build_object('reason',e->>'reason','bills',(SELECT coalesce(jsonb_object_agg(b.key,b.value),'{}') FROM jsonb_each(NEW.document->'bills') b WHERE b.value IS DISTINCT FROM OLD.document->'bills'->b.key),
 'settlements',(SELECT coalesce(jsonb_object_agg(s.key,s.value),'{}') FROM jsonb_each(NEW.document->'settlements') s WHERE s.value IS DISTINCT FROM OLD.document->'settlements'->s.key)));
 RETURN NEW;END $$;
CREATE TRIGGER p3_group_event AFTER UPDATE ON salapiya_p3.groups FOR EACH ROW EXECUTE FUNCTION salapiya_p3.capture_event();
REVOKE ALL ON FUNCTION salapiya_p3.validate_sources(),salapiya_p3.capture_event() FROM PUBLIC,anon,authenticated;
COMMIT;
