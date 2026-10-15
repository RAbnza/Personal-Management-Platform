-- Custom SQL migration file, put your code below! --
/* The lifecycle operator receives a narrow command, never group table DML.
 * It takes all affected group locks before existing profile/workspace locks. */
CREATE POLICY sharing_lifecycle_bridge ON ops.deletion_request FOR SELECT TO migration_owner USING(session_user='lifecycle_operator' AND id=NULLIF(current_setting('ops.deletion_request_id',true),'')::uuid);
CREATE FUNCTION sharing.lock_identity_groups(request_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE target uuid;
BEGIN
 IF session_user<>'lifecycle_operator' THEN RAISE EXCEPTION 'lifecycle role required' USING ERRCODE='42501'; END IF;
 SELECT target_user_id INTO target FROM ops.deletion_request WHERE id=request_id AND id=NULLIF(current_setting('ops.deletion_request_id',true),'')::uuid AND state IN('pending','failed','purging') AND purge_after<=clock_timestamp();
 IF target IS NULL THEN RAISE EXCEPTION 'approved due deletion required' USING ERRCODE='42501'; END IF;
 PERFORM g.id FROM sharing.expense_group g WHERE g.created_by_user_id=target OR EXISTS(SELECT 1 FROM sharing.participant p WHERE p.group_id=g.id AND p.registered_user_id=target) ORDER BY g.id FOR UPDATE;
END $$;
REVOKE ALL ON FUNCTION sharing.lock_identity_groups(uuid) FROM PUBLIC;
GRANT USAGE ON SCHEMA sharing TO lifecycle_operator;
GRANT EXECUTE ON FUNCTION sharing.lock_identity_groups(uuid) TO lifecycle_operator;

CREATE FUNCTION sharing.detach_deleted_identity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE p record; receipt uuid; command_id uuid; v integer; email text; result jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM sharing.participant WHERE registered_user_id=OLD.user_id) THEN RETURN OLD; END IF;
 IF session_user<>'lifecycle_operator' OR NOT EXISTS(SELECT 1 FROM ops.deletion_request WHERE id=NULLIF(current_setting('ops.deletion_request_id',true),'')::uuid AND target_user_id=OLD.user_id AND state='purging' AND purge_after<=clock_timestamp()) THEN RAISE EXCEPTION 'shared identity deletion requires approved lifecycle' USING ERRCODE='42501'; END IF;
 SELECT lower(u.email) INTO email FROM auth."user" u WHERE u.id=OLD.user_id;
 FOR p IN SELECT x.id,x.group_id FROM sharing.participant x WHERE x.registered_user_id=OLD.user_id ORDER BY x.group_id LOOP
  PERFORM 1 FROM sharing.expense_group WHERE id=p.group_id FOR UPDATE;
  receipt:=gen_random_uuid();command_id:=gen_random_uuid();
  INSERT INTO sharing.group_command_receipt(id,group_id,client_command_id,actor_participant_id,command_type,payload_hash) VALUES(receipt,p.group_id,command_id,p.id,'identity_deleted',encode(sha256(convert_to(command_id::text,'UTF8')),'hex'));
  UPDATE sharing.membership SET left_at=clock_timestamp(),exit_kind='removed' WHERE group_id=p.group_id AND participant_id=p.id AND left_at IS NULL;
  UPDATE sharing.expense_group g SET created_by_user_id=CASE WHEN created_by_user_id=OLD.user_id THEN NULL ELSE created_by_user_id END,version=version+1,archived_at=CASE WHEN NOT EXISTS(SELECT 1 FROM sharing.membership m WHERE m.group_id=g.id AND m.left_at IS NULL AND m.role='owner') THEN coalesce(archived_at,clock_timestamp()) ELSE archived_at END WHERE id=p.group_id RETURNING version INTO v;
  UPDATE sharing.participant SET registered_user_id=NULL,display_name='Former participant',identity_kind='deleted' WHERE group_id=p.group_id AND id=p.id;
  UPDATE sharing.invitation SET state=CASE WHEN accepted_user_id=OLD.user_id OR target_email_normalized=email THEN 'expired' ELSE 'revoked' END,
   target_email_normalized=CASE WHEN accepted_user_id=OLD.user_id OR target_email_normalized=email THEN 'erased+'||id::text||'@invalid.test' ELSE target_email_normalized END,
   token_hash=encode(sha256(convert_to(id::text||':erased','UTF8')),'hex'),accepted_at=CASE WHEN accepted_user_id=OLD.user_id THEN NULL ELSE accepted_at END,accepted_user_id=CASE WHEN accepted_user_id=OLD.user_id THEN NULL ELSE accepted_user_id END
   WHERE group_id=p.group_id AND (accepted_user_id=OLD.user_id OR target_email_normalized=email OR (inviter_participant_id=p.id AND state='pending'));
  UPDATE sharing.participant_claim SET claiming_user_id=NULL,balance_review_json=balance_review_json-'claimName' WHERE group_id=p.group_id AND claiming_user_id=OLD.user_id;
  UPDATE sharing.participant_claim SET state='expired' WHERE group_id=p.group_id AND state='pending' AND invitation_id IN(SELECT id FROM sharing.invitation WHERE group_id=p.group_id AND state IN('expired','revoked'));
  result:=jsonb_build_object('groupId',p.group_id,'version',v,'subjectId',p.id);
  INSERT INTO audit.group_revision(group_id,actor_participant_id,actor_kind,command_receipt_id,subject_kind,subject_id,subject_version,operation,after_json) VALUES(p.group_id,p.id,'system',receipt,'participant',p.id,v,'identity_deleted',jsonb_build_object('groupVersion',v));
  UPDATE sharing.group_command_receipt SET state='completed',completed_at=clock_timestamp(),result_json=result WHERE id=receipt;
 END LOOP;
 RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION sharing.detach_deleted_identity() FROM PUBLIC;
CREATE TRIGGER sharing_identity_lifecycle BEFORE DELETE ON core.user_profile FOR EACH ROW EXECUTE FUNCTION sharing.detach_deleted_identity();
--> statement-breakpoint
/* Acceptance holds the current identity lifecycle stable, after the group. */
DO $$ DECLARE d text; BEGIN
 d:=pg_get_functiondef('sharing.accept_invitation(text,uuid,integer,boolean,text)'::regprocedure);
 IF strpos(d,'-- Refresh after acquiring')=0 THEN RAISE EXCEPTION 'acceptance lock anchor missing'; END IF;
 EXECUTE replace(d,'-- Refresh after acquiring','PERFORM 1 FROM core.user_profile WHERE user_id=uid AND lifecycle=''active'' FOR SHARE; IF NOT FOUND THEN RAISE EXCEPTION ''active identity required'' USING ERRCODE=''42501''; END IF; -- Refresh after acquiring');
END $$;
