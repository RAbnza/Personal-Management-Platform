BEGIN;
CREATE FUNCTION salapiya_p2.initialize_categories(p uuid) RETURNS void LANGUAGE sql SET search_path='' AS $$
 INSERT INTO salapiya_p2.category(id,profile_id,name,kind) VALUES
 ('category-food',p,'Food & drink','expense'),('category-transport',p,'Transport','expense'),
 ('category-groceries',p,'Groceries','expense'),('category-bills',p,'Bills','expense'),
 ('category-fees',p,'Fees','expense'),('category-other',p,'Other','expense'),('category-income',p,'Income','income') $$;

CREATE FUNCTION salapiya_p2.submit(actor uuid,cid uuid,envelope jsonb,recorded text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE prior salapiya_p2.receipt; profile public.p2_profile; cmd jsonb; p uuid;
 result jsonb; planned jsonb; r jsonb; a jsonb; c jsonb; x jsonb; line integer:=0;
 reason text; message text; seq bigint;
BEGIN
 IF cid IS NULL OR envelope IS NULL OR octet_length(envelope::text)>1048576
 THEN RAISE EXCEPTION 'invalid command size or id' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(actor::text,2));
 SELECT * INTO prior FROM salapiya_p2.receipt t WHERE t.owner_id=actor AND t.id=cid;
 IF FOUND THEN
   IF prior.envelope<>envelope THEN RAISE EXCEPTION 'command payload mismatch' USING ERRCODE='22023'; END IF;
   RETURN prior.result;
 END IF;
 -- A subtransaction rolls back every effect of a rejected domain operation.
 BEGIN
   IF jsonb_typeof(envelope) IS DISTINCT FROM 'object' OR
     envelope - ARRAY['contract','profile_id','payload','base_revision']<>'{}'::jsonb OR
     NOT(envelope ?& ARRAY['contract','profile_id','payload','base_revision']) OR
     envelope->'contract' IS DISTINCT FROM '2'::jsonb OR
     jsonb_typeof(envelope->'payload') IS DISTINCT FROM 'string' OR
     jsonb_typeof(envelope->'base_revision') IS DISTINCT FROM 'number' OR
     (envelope->>'base_revision') !~ '^(0|[1-9][0-9]{0,14})$'
   THEN RAISE EXCEPTION 'invalid command envelope' USING ERRCODE='22023'; END IF;
   p:=(envelope->>'profile_id')::uuid; cmd:=(envelope->>'payload')::jsonb;
   SELECT * INTO profile FROM public.p2_profile t WHERE t.id=p AND t.owner_id=actor FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'private profile unavailable' USING ERRCODE='22023'; END IF;
   IF cmd->>'kind' NOT IN ('account','category','income','expense','transfer') AND
     (envelope->>'base_revision')::bigint<>profile.revision
   THEN RAISE EXCEPTION 'sources changed; sync and review again' USING ERRCODE='22023'; END IF;
   planned:=salapiya_p2.plan(p,cid,cmd,profile.revision); seq:=profile.revision+1;
   INSERT INTO public.p2_command VALUES(cid,actor,p,envelope->>'payload',planned::text,seq,
     coalesce(recorded,to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')));
   a:=planned->'account'; c:=planned->'category'; r:=planned->'revision';
   IF a<>'null'::jsonb THEN
     INSERT INTO salapiya_p2.account VALUES((a->>'id')::uuid,p,a->>'name',a->>'kind',a->>'cutoff',a->>'institution',a->>'notes',false);
   END IF;
   IF c<>'null'::jsonb THEN
     INSERT INTO salapiya_p2.category VALUES(c->>'id',p,c->>'name',c->>'kind');
   END IF;
   IF planned->>'archiveId' IS NOT NULL THEN
     UPDATE salapiya_p2.account SET archived=true WHERE profile_id=p AND id=(planned->>'archiveId')::uuid;
   END IF;
   IF r<>'null'::jsonb THEN
     INSERT INTO salapiya_p2.revision VALUES(cid,p,(r->>'actionId')::uuid,(r->>'number')::integer,
       r->>'kind',r->>'change',r->>'date',r->>'title',(r->>'amount')::numeric,r->'values',
       (r->>'previous')::uuid,(r->>'source')::uuid);
     FOR x IN SELECT value FROM jsonb_array_elements(r->'postings') LOOP
       line:=line+1;
       INSERT INTO salapiya_p2.posting VALUES(cid::text||'-p'||line,p,cid,line,x->>'ledger',
         (x->>'account')::uuid,x->>'category',x->>'date',(x->>'amount')::bigint);
     END LOOP;
   END IF;
   UPDATE public.p2_profile SET revision=seq WHERE id=p;
   result:=jsonb_build_object('id',cid::text,'owner_id',actor::text,'profile_id',p::text,
     'outcome','accepted','sequence_no',seq,'reason',NULL);
 EXCEPTION WHEN invalid_parameter_value OR invalid_text_representation OR datetime_field_overflow OR
   numeric_value_out_of_range OR unique_violation OR foreign_key_violation OR check_violation THEN
   GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;
   -- Do not disclose constraint details or another owner's identifiers.
   reason:=CASE WHEN message IN ('source version changed or unavailable','sources changed; sync and review again',
     'resolve dependent evidence first','refund exceeds unrefunded portion','comparison sources changed',
     'account unavailable, archived or before cutoff','negative balance requires acknowledgement',
     'account type or name conflict','category classification or name conflict') THEN message ELSE 'invalid or incompatible financial command' END;
   result:=jsonb_build_object('id',cid::text,'owner_id',actor::text,'profile_id',envelope->>'profile_id','outcome','rejected','reason',reason);
 END;
 INSERT INTO salapiya_p2.receipt VALUES(actor,cid,envelope,result);
 RETURN result;
END $$;

CREATE FUNCTION public.p2_submit_command(command_id uuid,command_payload text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=salapiya_p0.require_current_session(); BEGIN
 IF command_payload IS NULL OR octet_length(command_payload)>1048576 THEN RAISE EXCEPTION 'invalid command size' USING ERRCODE='22023'; END IF;
 RETURN salapiya_p2.submit(actor,command_id,command_payload::jsonb);
END $$;

CREATE FUNCTION public.p2_profile_boundary() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=salapiya_p0.require_current_session(); result jsonb; BEGIN
 SELECT jsonb_build_object('id',p.id::text,'owner_id',actor::text,'name',p.name,'revision',p.revision)
 INTO result FROM public.p2_profile p WHERE p.owner_id=actor;
 RETURN result;
END $$;

CREATE FUNCTION public.p2_stage_enrollment(enrollment_id uuid,profile_id uuid,display_name text,snapshot jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=salapiya_p0.require_current_session(); prior salapiya_p2.enrollment;
 item jsonb; cmd jsonb; ids uuid[]:='{}'; seq integer:=0; BEGIN
 IF enrollment_id IS NULL OR profile_id IS NULL OR display_name IS NULL OR length(btrim(display_name)) NOT BETWEEN 1 AND 200 OR
   jsonb_typeof(snapshot) IS DISTINCT FROM 'array' OR octet_length(snapshot::text)>33554432 OR jsonb_array_length(snapshot)>20000
 THEN RAISE EXCEPTION 'invalid enrollment graph' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(actor::text,2));
 SELECT * INTO prior FROM salapiya_p2.enrollment e WHERE e.owner_id=actor AND e.id=enrollment_id;
 IF FOUND THEN
   IF prior.profile_id<>profile_id OR prior.snapshot<>snapshot OR prior.name<>btrim(display_name)
   THEN RAISE EXCEPTION 'enrollment payload mismatch' USING ERRCODE='22023'; END IF;
   RETURN jsonb_build_object('outcome',CASE WHEN prior.published THEN 'published' ELSE 'staged' END,'profile_id',profile_id::text);
 END IF;
 IF EXISTS(SELECT 1 FROM public.p2_profile p WHERE p.owner_id=actor OR p.id=profile_id) THEN
   RETURN jsonb_build_object('outcome','collision'); END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(snapshot) LOOP
   IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR item - ARRAY['id','payload','recorded_at']<>'{}'::jsonb
     OR NOT(item ?& ARRAY['id','payload','recorded_at']) OR jsonb_typeof(item->'payload') IS DISTINCT FROM 'string'
     OR (item->>'id')::uuid=ANY(ids) OR (item->>'recorded_at')::timestamptz IS NULL
   THEN RAISE EXCEPTION 'invalid enrollment command' USING ERRCODE='22023'; END IF;
   cmd:=(item->>'payload')::jsonb;
   IF cmd->>'owner' IS DISTINCT FROM profile_id::text OR cmd->'expectedVersion' IS DISTINCT FROM to_jsonb(seq)
   THEN RAISE EXCEPTION 'enrollment command ownership or sequence mismatch' USING ERRCODE='22023'; END IF;
   ids:=array_append(ids,(item->>'id')::uuid); seq:=seq+1;
 END LOOP;
 INSERT INTO salapiya_p2.enrollment VALUES(actor,enrollment_id,profile_id,btrim(display_name),snapshot,false);
 RETURN jsonb_build_object('outcome','staged','profile_id',profile_id::text);
END $$;

CREATE FUNCTION public.p2_publish_enrollment(enrollment_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=salapiya_p0.require_current_session(); staged salapiya_p2.enrollment;
 item jsonb; result jsonb; seq integer:=0; BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(actor::text,2));
 SELECT * INTO staged FROM salapiya_p2.enrollment e WHERE e.owner_id=actor AND e.id=enrollment_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'enrollment unavailable' USING ERRCODE='22023'; END IF;
 IF staged.published THEN RETURN jsonb_build_object('outcome','published','profile_id',staged.profile_id::text); END IF;
 IF EXISTS(SELECT 1 FROM public.p2_profile p WHERE p.owner_id=actor OR p.id=staged.profile_id)
 THEN RETURN jsonb_build_object('outcome','collision'); END IF;
 INSERT INTO public.p2_profile(id,owner_id,name) VALUES(staged.profile_id,actor,staged.name);
 PERFORM salapiya_p2.initialize_categories(staged.profile_id);
 FOR item IN SELECT value FROM jsonb_array_elements(staged.snapshot) LOOP
   result:=salapiya_p2.submit(actor,(item->>'id')::uuid,jsonb_build_object('contract',2,'profile_id',staged.profile_id::text,
     'payload',item->>'payload','base_revision',seq),item->>'recorded_at');
   IF result->>'outcome'<>'accepted' THEN RAISE EXCEPTION 'enrollment financial graph rejected' USING ERRCODE='22023'; END IF;
   seq:=seq+1;
 END LOOP;
 UPDATE salapiya_p2.enrollment e SET published=true WHERE e.owner_id=actor AND e.id=enrollment_id;
 RETURN jsonb_build_object('outcome','published','profile_id',staged.profile_id::text);
END $$;

CREATE FUNCTION public.p2_review_command(command_id uuid,command_payload text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=salapiya_p0.require_current_session(); prior salapiya_p2.receipt; BEGIN
 SELECT * INTO prior FROM salapiya_p2.receipt r WHERE r.owner_id=actor AND r.id=command_id;
 IF FOUND THEN
   IF prior.envelope->>'payload' IS DISTINCT FROM command_payload THEN
     RETURN jsonb_build_object('id',command_id::text,'owner_id',actor::text,'outcome','mismatch'); END IF;
   RETURN prior.result;
 END IF;
 RETURN jsonb_build_object('id',command_id::text,'owner_id',actor::text,'outcome','missing');
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA salapiya_p2 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.p2_submit_command(uuid,text),public.p2_profile_boundary(),
 public.p2_stage_enrollment(uuid,uuid,text,jsonb),public.p2_publish_enrollment(uuid),public.p2_review_command(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.p2_submit_command(uuid,text),public.p2_profile_boundary(),
 public.p2_stage_enrollment(uuid,uuid,text,jsonb),public.p2_publish_enrollment(uuid),public.p2_review_command(uuid,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
