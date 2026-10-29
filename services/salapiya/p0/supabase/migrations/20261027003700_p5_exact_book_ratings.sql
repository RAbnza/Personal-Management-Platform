BEGIN;
-- Preserve the inherited Books preset's exact 0..5 decimal semantics. Earlier
-- integer-string payloads remain valid; no stored command or receipt is edited.
ALTER FUNCTION salapiya_p5.validate(text,jsonb) RENAME TO validate_client_guards;
CREATE FUNCTION salapiya_p5.validate(kind text,v jsonb) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE rating text:=v->>'rating';BEGIN
 IF kind='book' THEN
  IF jsonb_typeof(v->'rating') IS DISTINCT FROM 'string' OR rating IS NULL OR (rating<>'' AND (rating !~ '^-?(0|[1-9][0-9]{0,11})(\.[0-9]{1,4})?$' OR rating::numeric<0 OR rating::numeric>5)) THEN
   RAISE EXCEPTION 'invalid exact Book rating' USING ERRCODE='22023';
  END IF;
  PERFORM salapiya_p5.validate_client_guards(kind,jsonb_set(v,'{rating}','""'::jsonb));
 ELSE PERFORM salapiya_p5.validate_client_guards(kind,v);
 END IF;
END $$;
REVOKE ALL ON FUNCTION salapiya_p5.validate(text,jsonb),salapiya_p5.validate_client_guards(text,jsonb) FROM PUBLIC,anon,authenticated;
COMMIT;
