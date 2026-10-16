-- Custom SQL migration file, put your code below! --
CREATE FUNCTION sharing.maintain_invitations(group_limit integer DEFAULT 100) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE g record; inviter uuid; receipt uuid; version_no integer; n integer; changed integer:=0;
BEGIN
 IF session_user<>'lifecycle_operator' OR group_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'restricted bounded maintenance required' USING ERRCODE='42501'; END IF;
 FOR g IN SELECT x.id FROM sharing.expense_group x WHERE EXISTS(SELECT 1 FROM sharing.invitation i WHERE i.group_id=x.id AND ((i.state='pending' AND i.expires_at<=clock_timestamp()) OR (i.expires_at<clock_timestamp()-interval '30 days' AND i.token_hash<>encode(sha256(convert_to(i.id::text||':retired','UTF8')),'hex')))) ORDER BY x.id LIMIT group_limit FOR UPDATE SKIP LOCKED LOOP
  SELECT inviter_participant_id INTO inviter FROM sharing.invitation WHERE group_id=g.id ORDER BY created_at LIMIT 1;
  receipt:=gen_random_uuid();
  INSERT INTO sharing.group_command_receipt(id,group_id,client_command_id,actor_participant_id,command_type,payload_hash) VALUES(receipt,g.id,receipt,inviter,'invitation_maintenance',encode(sha256(convert_to(receipt::text,'UTF8')),'hex'));
  UPDATE sharing.invitation SET state='expired' WHERE group_id=g.id AND state='pending' AND expires_at<=clock_timestamp();
  UPDATE sharing.participant_claim SET state='expired' WHERE group_id=g.id AND state='pending' AND invitation_id IN(SELECT id FROM sharing.invitation WHERE group_id=g.id AND state IN('expired','revoked'));
  UPDATE sharing.invitation SET target_email_normalized='retired+'||id::text||'@invalid.test',token_hash=encode(sha256(convert_to(id::text||':retired','UTF8')),'hex') WHERE group_id=g.id AND expires_at<clock_timestamp()-interval '30 days' AND token_hash<>encode(sha256(convert_to(id::text||':retired','UTF8')),'hex');
  GET DIAGNOSTICS n=ROW_COUNT;changed:=changed+n;
  UPDATE sharing.participant_claim SET balance_review_json=jsonb_build_object('historyPolicyVersion',1,'paidMinor',balance_review_json->>'paidMinor','shareMinor',balance_review_json->>'shareMinor','netMinor',balance_review_json->>'netMinor') WHERE group_id=g.id AND reviewed_at<clock_timestamp()-interval '30 days';
  UPDATE sharing.expense_group SET version=version+1 WHERE id=g.id RETURNING version INTO version_no;
  INSERT INTO audit.group_revision(group_id,actor_participant_id,actor_kind,command_receipt_id,subject_kind,subject_id,subject_version,operation,after_json) VALUES(g.id,inviter,'system',receipt,'group',g.id,version_no,'invitation_maintenance',jsonb_build_object('groupVersion',version_no));
  UPDATE sharing.group_command_receipt SET state='completed',result_json=jsonb_build_object('groupId',g.id,'version',version_no,'subjectId',g.id),completed_at=clock_timestamp() WHERE id=receipt;
 END LOOP;
 RETURN jsonb_build_object('redactedInvitations',changed);
END $$;
REVOKE ALL ON FUNCTION sharing.maintain_invitations(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sharing.maintain_invitations(integer) TO lifecycle_operator;
--> statement-breakpoint
/* Real private commands already lock lifecycle roots. Apply the same check to
 * direct group writes, retaining group-before-profile ordering. */
DO $$ DECLARE d text; BEGIN
 d:=pg_get_functiondef('sharing.guard_group_write()'::regprocedure);
 EXECUTE replace(d,'owner_ok:=sharing.active(g,true);','PERFORM 1 FROM core.user_profile WHERE user_id=NULLIF(current_setting(''app.user_id'',true),'''')::uuid AND lifecycle=''active'' FOR SHARE; IF NOT FOUND THEN RAISE EXCEPTION ''active identity required'' USING ERRCODE=''42501''; END IF; owner_ok:=sharing.active(g,true);');
END $$;
