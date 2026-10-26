BEGIN;
CREATE FUNCTION salapiya_p5.canonical(v jsonb) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE result text;BEGIN
 IF jsonb_typeof(v)='object' THEN SELECT '{'||coalesce(string_agg(to_jsonb(key)::text||':'||salapiya_p5.canonical(value),',' ORDER BY key COLLATE "C"),'')||'}' INTO result FROM jsonb_each(v);RETURN result;
 ELSIF jsonb_typeof(v)='array' THEN SELECT '['||coalesce(string_agg(salapiya_p5.canonical(value),',' ORDER BY ord),'')||']' INTO result FROM jsonb_array_elements(v) WITH ORDINALITY a(value,ord);RETURN result;
 ELSE RETURN v::text;END IF;
END $$;
CREATE FUNCTION salapiya_p5.utc_text(v timestamptz) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT to_char(v AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS')||CASE WHEN mod(extract(microseconds FROM v)::bigint,1000)=0 THEN '' ELSE lpad(mod(extract(microseconds FROM v)::bigint,1000)::text,3,'0') END||'Z'
$$;
CREATE FUNCTION salapiya_p5.trim_text(v text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT btrim(v,(SELECT string_agg(chr(n),'') FROM unnest(ARRAY[9,10,11,12,13,32,133,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279]) n))
$$;
CREATE FUNCTION salapiya_p5.utf16_length(v text) RETURNS bigint LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT length(v)+(SELECT count(*) FROM regexp_split_to_table(v,'') c WHERE ascii(c)>65535)
$$;

ALTER FUNCTION salapiya_p5.validate(text,jsonb) RENAME TO validate_stage_outcome;
CREATE FUNCTION salapiya_p5.validate(kind text,v jsonb) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE x record;BEGIN
 PERFORM salapiya_p5.validate_stage_outcome(kind,v);
 IF salapiya_p5.trim_text(v->>'title')<>v->>'title' OR salapiya_p5.utf16_length(v->>'title')>200 OR
  (kind='application' AND (salapiya_p5.trim_text(v->>'company')='' OR salapiya_p5.utf16_length(v->>'company')>200))
 THEN RAISE EXCEPTION 'invalid normalized Life title or company' USING ERRCODE='22023';END IF;
 FOR x IN SELECT key,value#>>'{}' value FROM jsonb_each(v) LOOP
  IF salapiya_p5.utf16_length(x.value)>(CASE WHEN x.key IN ('notes','description') THEN 20000 ELSE 2000 END) THEN RAISE EXCEPTION 'Life field exceeds native bounds' USING ERRCODE='22023';END IF;
 END LOOP;
 IF kind IN ('personal','careerEvent') AND v->>'time'<>'' AND salapiya_p5.utc_text((v->>'utc')::timestamptz)<>v->>'utc' THEN RAISE EXCEPTION 'UTC instant must use native canonical precision' USING ERRCODE='22023';END IF;
END $$;

DO $$DECLARE definition text;needle text;replacement text;BEGIN
 definition:=pg_get_functiondef('public.p5_submit_command(uuid,text)'::regprocedure);
 needle:='PERFORM salapiya_p5.validate(k,v);';
 IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'unexpected Life authority; preserve and review';END IF;
 replacement:=needle||E'\n  IF salapiya_p5.canonical(cmd)<>command_payload OR cmd->>''owner''<>p::text OR cmd->>''record''<>rid::text OR salapiya_p5.utc_text((cmd->>''recordedAt'')::timestamptz)<>cmd->>''recordedAt'' OR salapiya_p5.trim_text(cmd->>''reason'')='''' OR salapiya_p5.utf16_length(cmd->>''reason'')>2000 THEN RAISE EXCEPTION ''noncanonical native Life command'' USING ERRCODE=''22023'';END IF;';
 EXECUTE replace(definition,needle,replacement);
 -- Compare the actual candidate offsets surrounding the instant. This covers
 -- non-hour folds as well as ordinary DST without scanning every UTC minute.
 definition:=pg_get_functiondef('salapiya_p5.validate_v1(text,jsonb)'::regprocedure);
 needle:='SELECT array_agg(t ORDER BY t) INTO matches FROM generate_series(instant-interval ''3 hours'',instant+interval ''3 hours'',interval ''15 minutes'') t WHERE to_char(t AT TIME ZONE (v->>''timezone''),''YYYY-MM-DD HH24:MI:SS'')=((v->>''date'')||'' ''||(v->>''time'')||'':00'');';
 IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'unexpected Life temporal validation; preserve and review';END IF;
 replacement:='SELECT array_agg(t ORDER BY t) INTO matches FROM (SELECT DISTINCT (((v->>''date'')||'' ''||(v->>''time''))::timestamp - ((probe AT TIME ZONE (v->>''timezone''))-(probe AT TIME ZONE ''UTC''))) AT TIME ZONE ''UTC'' t FROM generate_series(instant-interval ''2 days'',instant+interval ''2 days'',interval ''6 hours'') probe) candidates WHERE to_char(t AT TIME ZONE (v->>''timezone''),''YYYY-MM-DD HH24:MI:SS'')=((v->>''date'')||'' ''||(v->>''time'')||'':00'');';
 EXECUTE replace(definition,needle,replacement);
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA salapiya_p5 FROM PUBLIC,anon,authenticated;
COMMIT;
