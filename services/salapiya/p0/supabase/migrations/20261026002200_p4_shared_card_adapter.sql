BEGIN;
DO $$DECLARE definition text;needle text;BEGIN
 definition:=pg_get_functiondef('salapiya_p2.plan_p3_base(uuid,uuid,jsonb,bigint)'::regprocedure);
 needle:='IF v->>''funding''=''card'' THEN PERFORM salapiya_p3.fail(''Card integration requires P4'');END IF;';
 IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'Unexpected P3 card boundary';END IF;
 definition:=replace(definition,needle,'IF v->>''funding''=''card'' AND mode NOT IN (''bill'',''refund'') THEN PERFORM salapiya_p3.fail(''Card evidence cannot fund settlements'');END IF;');
 definition:=replace(definition,'OR old.values_json->>''account'' IS DISTINCT FROM v->>''account''','OR (v->>''funding'' IS DISTINCT FROM ''card'' AND old.values_json->>''account'' IS DISTINCT FROM v->>''account'')');
 definition:=replace(definition,'salapiya_p2.post(''cash'',-amount,d,v->>''account'')','salapiya_p2.post(CASE WHEN v->>''funding''=''card'' THEN ''card_liability'' ELSE ''cash'' END,-amount,d,CASE WHEN v->>''funding''=''card'' THEN NULL ELSE v->>''account'' END)');
 definition:=replace(definition,'salapiya_p2.post(''cash'',amount,d,v->>''account'')','salapiya_p2.post(CASE WHEN v->>''funding''=''card'' THEN ''card_liability'' ELSE ''cash'' END,amount,d,CASE WHEN v->>''funding''=''card'' THEN NULL ELSE v->>''account'' END)');
 EXECUTE definition;
 definition:=pg_get_functiondef('salapiya_p2.plan_p3_refund(uuid,uuid,jsonb,bigint)'::regprocedure);
 needle:='IF old.id IS NULL OR old.revision_no::text IS DISTINCT FROM v->>''sourceVersion'' OR old.values_json->>''sharedMode''<>''refund''';
 IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'Unexpected P3 refund boundary';END IF;
 definition:=replace(definition,needle,'IF NOT(v->>''funding''=''card'' AND old.values_json->>''financeType''=''cardRefund'' AND NOT(old.values_json ? ''sharedGroup'')) AND (old.id IS NULL OR old.revision_no::text IS DISTINCT FROM v->>''sourceVersion'' OR old.values_json->>''sharedMode''<>''refund''');
 needle:='old.effective_date IS DISTINCT FROM v->>''date'' THEN PERFORM salapiya_p3.fail(''Refund reclassification retains actual money'');';
 IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'Unexpected P3 refund identity boundary';END IF;
 definition:=replace(definition,needle,'old.effective_date IS DISTINCT FROM v->>''date'') THEN PERFORM salapiya_p3.fail(''Refund reclassification retains actual money'');');
 definition:=replace(definition,'salapiya_p2.post(''cash'',amount,d,v->>''account'')','salapiya_p2.post(CASE WHEN v->>''funding''=''card'' THEN ''card_liability'' ELSE ''cash'' END,amount,d,CASE WHEN v->>''funding''=''card'' THEN NULL ELSE v->>''account'' END)');
 EXECUTE definition;
END $$;

ALTER FUNCTION salapiya_p2.plan(uuid,uuid,jsonb,bigint) RENAME TO plan_p4_cards;
CREATE FUNCTION salapiya_p2.plan(p uuid,cid uuid,cmd jsonb,seq bigint) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v jsonb:=cmd->'values';old salapiya_p2.revision;card salapiya_p2.revision;result jsonb;mode text:=v->>'sharedMode';paid numeric;BEGIN
 IF cmd->>'kind'<>'shared' OR v->>'funding' IS DISTINCT FROM 'card' THEN RETURN salapiya_p2.plan_p4_cards(p,cid,cmd,seq);END IF;
 SELECT * INTO old FROM salapiya_p2.current_revision r WHERE r.profile_id=p AND r.id::text=v->>'source';
 IF old.id IS NULL OR old.revision_no::text IS DISTINCT FROM v->>'sourceVersion' OR mode NOT IN ('bill','refund') OR old.effective_date IS DISTINCT FROM v->>'date'
 OR (mode='bill' AND old.values_json->>'financeType' IS DISTINCT FROM 'cardPurchase')
 OR (mode='refund' AND old.values_json->>'financeType' IS DISTINCT FROM 'cardRefund')
 THEN RAISE EXCEPTION 'current immutable card purchase or credit required' USING ERRCODE='22023';END IF;
 card:=salapiya_p2.p4_source(p,old.values_json->>'card',ARRAY['creditCard']);
 paid:=salapiya_p2.php(v,'fundingAmount',true);
 IF v->>'card' IS DISTINCT FROM card.action_id::text OR paid<>(CASE WHEN old.values_json ? 'sharedGroup' THEN salapiya_p2.php(old.values_json,'fundingAmount',true) ELSE old.amount_minor END)
 THEN RAISE EXCEPTION 'retain exact owned card funding' USING ERRCODE='22023';END IF;
 v:=v||jsonb_build_object('account',coalesce(old.values_json->>'account',''));
 result:=salapiya_p2.plan_p4_cards(p,cid,jsonb_set(cmd,'{values}',v),seq);
 v:=v||jsonb_build_object('financeType',old.values_json->>'financeType','financeContract','1','postingDate',coalesce(old.values_json->>'postingDate',old.effective_date));
 IF mode='refund' THEN
  v:=v||jsonb_build_object('purchase',old.values_json->>'purchase');
  result:=jsonb_set(result,'{revision,source}',coalesce(to_jsonb(old.source_id::text),'null'::jsonb));
 END IF;
 RETURN jsonb_set(result,'{revision,values}',v);
END $$;
REVOKE ALL ON FUNCTION salapiya_p2.plan_p4_cards(uuid,uuid,jsonb,bigint),salapiya_p2.plan(uuid,uuid,jsonb,bigint) FROM PUBLIC,anon,authenticated;
COMMIT;
