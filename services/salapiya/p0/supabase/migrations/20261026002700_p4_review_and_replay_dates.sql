BEGIN;
-- Pure replay uses the frozen original review day. A separate fresh-submit
-- boundary checks today's eligibility; enrollment/old receipts retain history.
CREATE FUNCTION salapiya_p2.p4_review_day(p uuid,cmd jsonb,recorded text) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v jsonb:=cmd->'values';k text:=cmd->>'kind';old salapiya_p2.revision;zone text:='Asia/Manila';BEGIN
 IF recorded IS NOT NULL THEN RETURN;END IF;
 IF k='financeCorrection' THEN SELECT * INTO old FROM salapiya_p2.current_revision r WHERE r.profile_id=p AND r.id::text=v->>'replace';END IF;
 IF old.values_json->>'financeType'='recurrence' THEN zone:=coalesce(v->>'timezone',old.values_json->>'timezone');
 ELSIF k NOT IN ('reservation','savingsReallocation','cashImportPreview') THEN RETURN;END IF;
 IF v->>'date' IS DISTINCT FROM to_char(clock_timestamp() AT TIME ZONE zone,'YYYY-MM-DD') THEN RAISE EXCEPTION 'review date changed; review current sources again' USING ERRCODE='22023';END IF;
END $$;
DO $$DECLARE definition text;needle text;BEGIN
 definition:=pg_get_functiondef('salapiya_p2.plan(uuid,uuid,jsonb,bigint)'::regprocedure);
 needle:='to_char(clock_timestamp() AT TIME ZONE (v->>''timezone''),''YYYY-MM-DD'')';
 IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'Unexpected rule review-date boundary';END IF;
 EXECUTE replace(definition,needle,'d');
 definition:=pg_get_functiondef('salapiya_p2.submit(uuid,uuid,jsonb,text)'::regprocedure);
 needle:='planned:=salapiya_p2.plan(p,cid,cmd,profile.revision);';
 IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'Unexpected private submit boundary';END IF;
 EXECUTE replace(definition,needle,'PERFORM salapiya_p2.p4_review_day(p,cmd,recorded);'||needle);
END $$;

ALTER FUNCTION salapiya_p2.plan(uuid,uuid,jsonb,bigint) RENAME TO plan_p4_planning;
CREATE FUNCTION salapiya_p2.plan(p uuid,cid uuid,cmd jsonb,seq bigint) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE result jsonb;r jsonb;old_id uuid;account record;day record;cash numeric;BEGIN
 result:=salapiya_p2.plan_p4_planning(p,cid,cmd,seq);r:=result->'revision';
 IF r IS NULL OR r='null' OR NOT(r->'values' ? 'financeType') THEN RETURN result;END IF;
 old_id:=(r->>'previous')::uuid;
 FOR account IN SELECT DISTINCT q.account_id FROM salapiya_p2.posting q WHERE q.profile_id=p AND q.revision_id=old_id AND q.ledger='cash'
  UNION SELECT DISTINCT (q->>'account')::uuid FROM jsonb_array_elements(r->'postings') q WHERE q->>'ledger'='cash' LOOP
  FOR day IN SELECT DISTINCT q.effective_date AS label FROM salapiya_p2.posting q WHERE q.profile_id=p AND q.account_id=account.account_id
   UNION SELECT q->>'date' FROM jsonb_array_elements(r->'postings') q WHERE q->>'account'=account.account_id::text LOOP
   SELECT salapiya_p2.balance(p,account.account_id,day.label,old_id)+coalesce(sum((q->>'amount')::numeric),0) INTO cash
   FROM jsonb_array_elements(r->'postings') q WHERE q->>'account'=account.account_id::text AND q->>'date'<=day.label;
   IF cash<0 AND cmd->'values'->>'acknowledge' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'negative balance requires acknowledgement' USING ERRCODE='22023';END IF;
  END LOOP;
 END LOOP;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION salapiya_p2.p4_review_day(uuid,jsonb,text),salapiya_p2.plan_p4_planning(uuid,uuid,jsonb,bigint),salapiya_p2.plan(uuid,uuid,jsonb,bigint) FROM PUBLIC,anon,authenticated;
COMMIT;
