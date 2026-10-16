ALTER TABLE finance.private_group_review ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.private_group_review FORCE ROW LEVEL SECURITY;
REVOKE ALL ON finance.private_group_review FROM PUBLIC,app_domain,auth_adapter,worker_domain,queue_broker,lifecycle_operator;
GRANT SELECT,INSERT ON finance.private_group_review TO app_domain;
GRANT SELECT,DELETE ON finance.private_group_review TO lifecycle_operator;
CREATE POLICY private_group_owner ON finance.private_group_review TO app_domain USING(workspace_id=NULLIF(current_setting('app.workspace_id',true),'')::uuid AND EXISTS(SELECT 1 FROM core.workspace w JOIN core.user_profile p ON p.user_id=w.owner_user_id WHERE w.id=workspace_id AND w.owner_user_id=NULLIF(current_setting('app.user_id',true),'')::uuid AND w.state='active' AND p.lifecycle='active')) WITH CHECK(workspace_id=NULLIF(current_setting('app.workspace_id',true),'')::uuid AND EXISTS(SELECT 1 FROM core.workspace w JOIN core.user_profile p ON p.user_id=w.owner_user_id WHERE w.id=workspace_id AND w.owner_user_id=NULLIF(current_setting('app.user_id',true),'')::uuid AND w.state='active' AND p.lifecycle='active'));
CREATE POLICY lifecycle_purge_scope ON finance.private_group_review TO lifecycle_operator USING(ops.purge_scope_allowed(workspace_id));
CREATE POLICY shared_restore_bridge ON finance.private_group_review TO migration_owner USING(workspace_id=NULLIF(current_setting('app.workspace_id',true),'')::uuid AND EXISTS(SELECT 1 FROM core.workspace w WHERE w.id=workspace_id AND w.owner_user_id=NULLIF(current_setting('app.user_id',true),'')::uuid)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE TRIGGER immutable_review BEFORE UPDATE OR DELETE ON finance.private_group_review FOR EACH ROW EXECUTE FUNCTION finance.enforce_debt_append_only_evidence();
CREATE INDEX ix_private_group_review_source ON finance.private_group_review(workspace_id,link_id,accepted_link_revision_id,source_hash);

CREATE FUNCTION finance.private_group_review_source(link uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=pg_catalog AS $$
DECLARE l finance.private_group_link%ROWTYPE;v jsonb;
BEGIN
 SELECT * INTO l FROM finance.private_group_link WHERE workspace_id=NULLIF(current_setting('app.workspace_id',true),'')::uuid AND id=link;
 IF l.id IS NULL OR l.participant_id IS DISTINCT FROM sharing.actor(l.group_id) THEN RAISE EXCEPTION 'owned private source unavailable' USING ERRCODE='42501'; END IF;
 IF l.expense_id IS NOT NULL THEN
  SELECT jsonb_build_object('sourceKind','bill','revisionId',r.id,'paidMinor',p.paid::text,'shareMinor',s.consumed::text,'sourceHash',encode(sha256(convert_to(jsonb_build_object('revisionId',r.id,'paidMinor',p.paid::text,'shareMinor',s.consumed::text)::text,'UTF8')),'hex')) INTO v FROM sharing.shared_expense e JOIN sharing.expense_revision r ON r.group_id=e.group_id AND r.id=e.current_revision_id AND r.state='finalized' CROSS JOIN LATERAL(SELECT coalesce(sum(amount_minor::numeric),0) paid FROM sharing.payer_contribution WHERE group_id=e.group_id AND expense_revision_id=r.id AND participant_id=l.participant_id) p CROSS JOIN LATERAL(SELECT coalesce(sum(amount_minor::numeric),0) consumed FROM sharing.participant_share WHERE group_id=e.group_id AND expense_revision_id=r.id AND participant_id=l.participant_id) s WHERE e.group_id=l.group_id AND e.id=l.expense_id;
 ELSE v:=finance.group_effect_source(l.group_id,l.participant_id,l.refund_id,l.settlement_id)||jsonb_build_object('sourceKind',CASE WHEN l.refund_id IS NOT NULL THEN 'refund' ELSE 'settlement' END);
 END IF;
 IF v IS NULL THEN RAISE EXCEPTION 'visible private group source unavailable' USING ERRCODE='42501'; END IF;
 RETURN v;
END $$;
REVOKE ALL ON FUNCTION finance.private_group_review_source(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION finance.private_group_review_source(uuid) TO app_domain;

CREATE FUNCTION finance.guard_private_group_review() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE g uuid;BEGIN
 IF ops.shared_restored_row('finance.private_group_review',to_jsonb(NEW)) THEN RETURN NEW; END IF;
 SELECT group_id INTO g FROM finance.private_group_link WHERE workspace_id=NEW.workspace_id AND id=NEW.link_id;
 IF g IS NULL THEN RAISE EXCEPTION 'owned group link unavailable' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM sharing.expense_group WHERE id=g FOR UPDATE;
 NEW.created_at:=clock_timestamp();RETURN NEW;
END $$;
CREATE TRIGGER a0_review_group_lock BEFORE INSERT ON finance.private_group_review FOR EACH ROW EXECUTE FUNCTION finance.guard_private_group_review();
CREATE TRIGGER a_private_group_root BEFORE INSERT ON finance.private_group_review FOR EACH ROW EXECUTE FUNCTION finance.guard_financial_root_write();
CREATE FUNCTION finance.validate_private_group_review() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE l finance.private_group_link%ROWTYPE;v jsonb;
BEGIN
 IF ops.shared_restored_row('finance.private_group_review',to_jsonb(NEW)) THEN RETURN NULL; END IF;
 SELECT * INTO l FROM finance.private_group_link WHERE workspace_id=NEW.workspace_id AND id=NEW.link_id;
 v:=finance.private_group_review_source(NEW.link_id);
 IF l.current_link_revision_id IS DISTINCT FROM NEW.accepted_link_revision_id OR NEW.source_hash IS DISTINCT FROM v->>'sourceHash' OR NEW.reviewed_source_json IS DISTINCT FROM v THEN RAISE EXCEPTION 'private review requires the exact current source and retained acceptance' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM core.command_receipt c JOIN audit.private_revision a ON a.workspace_id=c.workspace_id AND a.command_receipt_id=c.id WHERE c.workspace_id=NEW.workspace_id AND c.id=NEW.command_receipt_id AND c.command_type='finance.review_group_source' AND c.state='completed' AND c.retain_until IS NULL AND c.xmin::text=pg_current_xact_id()::text AND a.subject_kind='private_group_review' AND a.subject_id=NEW.id AND a.subject_version=1 AND a.recorded_by_user_id=NULLIF(current_setting('app.user_id',true),'')::uuid AND a.after_json @> jsonb_build_object('linkId',NEW.link_id,'acceptedLinkRevisionId',NEW.accepted_link_revision_id,'sourceHash',NEW.source_hash,'decision','retain_private_evidence') AND c.result_json @> jsonb_build_object('reviewId',NEW.id,'linkId',NEW.link_id)) THEN RAISE EXCEPTION 'private review requires permanent attributed approval evidence' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM finance.action_revision r WHERE r.workspace_id=NEW.workspace_id AND r.command_receipt_id=NEW.command_receipt_id) THEN RAISE EXCEPTION 'retaining private evidence must not post financial actions' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER private_group_review_approval AFTER INSERT ON finance.private_group_review DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION finance.validate_private_group_review();
REVOKE ALL ON FUNCTION finance.guard_private_group_review(),finance.validate_private_group_review() FROM PUBLIC;

DO $$ DECLARE d text;n text;anchor text:='''finance.private_group_link_revision''';BEGIN
 FOREACH n IN ARRAY ARRAY['ops.bind_shared_bundle_export(uuid)','ops.bind_shared_recovery(uuid,jsonb)','ops.shared_restored_row(text,jsonb)','ops.apply_private_restore(uuid,bytea,uuid)'] LOOP
  d:=pg_get_functiondef(n::regprocedure);
  IF strpos(d,anchor)=0 THEN RAISE EXCEPTION 'shared private table allowlist anchor missing'; END IF;
  EXECUTE replace(d,anchor,'''finance.private_group_link_revision'',''finance.private_group_review''');
 END LOOP;
END $$;
