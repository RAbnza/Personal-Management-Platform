BEGIN;
-- Additive, version-readable Career refinement. Original preset payloads remain
-- readable byte-for-byte; new commands retain stage and outcome independently.
ALTER FUNCTION salapiya_p5.validate(text,jsonb) RENAME TO validate_v1;
CREATE FUNCTION salapiya_p5.validate(kind text,v jsonb) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE phase text:=v->>'pipelineStage';outcome text:=v->>'outcome';BEGIN
 IF kind='application' AND (v?'pipelineStage' OR v?'outcome') THEN
  IF jsonb_typeof(v->'pipelineStage') IS DISTINCT FROM 'string' OR jsonb_typeof(v->'outcome') IS DISTINCT FROM 'string' OR
   phase NOT IN ('Saved','Applied','Screening','Interview','Technical assessment','Final interview','Offer','Accepted') OR
   outcome NOT IN ('','Accepted','Rejected','Withdrawn','Declined offer','Expired offer','Employer-cancelled opening') OR
   (phase='Accepted')<>(outcome='Accepted') OR v->>'status'<>(CASE WHEN outcome='' THEN phase ELSE outcome END) OR
   (phase='Saved' AND v->>'date'<>'') OR (v->>'date'<>'' AND v->>'stageDate'<v->>'date')
  THEN RAISE EXCEPTION 'explicit Career stage, outcome and dated submission required' USING ERRCODE='22023';END IF;
  PERFORM salapiya_p5.validate_v1(kind,(v-ARRAY['pipelineStage','outcome'])||jsonb_build_object('status',phase));
 ELSE PERFORM salapiya_p5.validate_v1(kind,v);
 END IF;
END $$;
REVOKE ALL ON FUNCTION salapiya_p5.validate(text,jsonb),salapiya_p5.validate_v1(text,jsonb) FROM PUBLIC,anon,authenticated;
COMMIT;
