/* A3 releases provider evidence only. A4 financial command gates stay intact. */
ALTER TABLE finance.card_statement ADD CONSTRAINT fk_statement_current FOREIGN KEY(workspace_id,id,current_revision_id) REFERENCES finance.card_statement_revision(workspace_id,statement_id,id) ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE finance.card_statement_revision ADD CONSTRAINT fk_statement_previous FOREIGN KEY(workspace_id,statement_id,previous_revision_id) REFERENCES finance.card_statement_revision(workspace_id,statement_id,id) ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE finance.card_statement_revision ADD CONSTRAINT ck_statement_correction_reason CHECK(revision_no=1 OR reason IS NOT NULL);
REVOKE ALL ON finance.card_statement,finance.card_statement_revision,finance.card_statement_entry FROM PUBLIC,app_domain,auth_adapter,queue_broker,worker_domain,lifecycle_operator;
GRANT SELECT,INSERT,UPDATE ON finance.card_statement,finance.card_statement_revision TO app_domain;
GRANT SELECT,INSERT ON finance.card_statement_entry TO app_domain;
GRANT SELECT,DELETE ON finance.card_statement,finance.card_statement_revision,finance.card_statement_entry TO lifecycle_operator;
DO $$ DECLARE relation text; BEGIN
  FOREACH relation IN ARRAY ARRAY['card_statement','card_statement_revision','card_statement_entry'] LOOP
    EXECUTE format('ALTER TABLE finance.%I ENABLE ROW LEVEL SECURITY',relation);
    EXECUTE format('ALTER TABLE finance.%I FORCE ROW LEVEL SECURITY',relation);
    EXECUTE format('CREATE POLICY statement_owner_access ON finance.%I TO app_domain
      USING(workspace_id=NULLIF(current_setting(''app.workspace_id'',true),'''')::uuid AND EXISTS(SELECT 1 FROM core.workspace w JOIN core.user_profile p ON p.user_id=w.owner_user_id WHERE w.id=workspace_id AND w.owner_user_id=NULLIF(current_setting(''app.user_id'',true),'''')::uuid AND w.state=''active'' AND p.lifecycle=''active''))
      WITH CHECK(workspace_id=NULLIF(current_setting(''app.workspace_id'',true),'''')::uuid AND EXISTS(SELECT 1 FROM core.workspace w JOIN core.user_profile p ON p.user_id=w.owner_user_id WHERE w.id=workspace_id AND w.owner_user_id=NULLIF(current_setting(''app.user_id'',true),'''')::uuid AND w.state=''active'' AND p.lifecycle=''active''))',relation);
    EXECUTE format('CREATE POLICY lifecycle_purge_scope ON finance.%I TO lifecycle_operator USING(ops.purge_scope_allowed(workspace_id))',relation);
    EXECUTE format('CREATE TRIGGER a_statement_financial_root BEFORE INSERT OR UPDATE ON finance.%I FOR EACH ROW EXECUTE FUNCTION finance.guard_financial_root_write()',relation);
  END LOOP;
END $$;
--> statement-breakpoint
CREATE FUNCTION finance.card_statement_snapshot(scope uuid,revision uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('cycleStart',r.cycle_start::text,'cycleEnd',r.cycle_end::text,'statementDate',r.statement_date::text,'dueDate',r.due_date::text,'balanceMinor',r.balance_minor::text,'minimumDueMinor',r.minimum_due_minor::text,'openingBalanceMinor',r.opening_balance_minor::text,'providerReference',r.provider_reference,'verificationSource',r.verification_source,'verifiedDate',r.verified_date,
 'entries',COALESCE((SELECT jsonb_agg(jsonb_build_object('description',e.description,'postingDate',e.posting_date::text,'amountMinor',e.amount_minor::text,'providerReference',e.provider_reference,'actionRevisionId',e.action_revision_id) ORDER BY e.line_no) FROM finance.card_statement_entry e WHERE e.workspace_id=r.workspace_id AND e.statement_revision_id=r.id),'[]'::jsonb))
 FROM finance.card_statement_revision r WHERE r.workspace_id=scope AND r.id=revision
$$;
REVOKE ALL ON FUNCTION finance.card_statement_snapshot(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION finance.card_statement_snapshot(uuid,uuid) TO app_domain,lifecycle_operator;
CREATE FUNCTION finance.guard_statement_financial_command() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM core.command_receipt r WHERE r.workspace_id=NEW.workspace_id AND r.id=NEW.command_receipt_id AND r.command_type IN('finance.record_card_statement','finance.revise_card_statement')) THEN RAISE EXCEPTION 'statement commands cannot create financial revisions' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION finance.guard_statement_financial_command() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION finance.guard_statement_financial_command() TO app_domain;
CREATE TRIGGER action_revision_statement_command BEFORE INSERT ON finance.action_revision FOR EACH ROW EXECUTE FUNCTION finance.guard_statement_financial_command();
CREATE FUNCTION finance.guard_statement_root() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 IF TG_OP='INSERT' THEN
   IF NEW.version<>1 OR NEW.current_revision_id IS NOT NULL THEN RAISE EXCEPTION 'statement requires initial identity' USING ERRCODE='23514'; END IF;
   NEW.created_at:=clock_timestamp(); NEW.updated_at:=NEW.created_at;
 ELSE
   IF NEW.id<>OLD.id OR NEW.workspace_id<>OLD.workspace_id OR NEW.card_id<>OLD.card_id OR NEW.created_at<>OLD.created_at OR NEW.current_revision_id IS NULL OR NEW.current_revision_id IS NOT DISTINCT FROM OLD.current_revision_id OR NEW.version<>(CASE WHEN OLD.current_revision_id IS NULL THEN 1 ELSE OLD.version+1 END) THEN
     RAISE EXCEPTION 'statement identity and revision chain are protected' USING ERRCODE='23514'; END IF;
   NEW.updated_at:=clock_timestamp();
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER statement_root_guard BEFORE INSERT OR UPDATE ON finance.card_statement FOR EACH ROW EXECUTE FUNCTION finance.guard_statement_root();
CREATE TRIGGER statement_root_delete BEFORE DELETE ON finance.card_statement FOR EACH ROW EXECUTE FUNCTION finance.enforce_debt_append_only_evidence();
CREATE FUNCTION finance.guard_statement_revision() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 IF TG_OP='DELETE' AND current_user='lifecycle_operator' AND ops.purge_scope_allowed(OLD.workspace_id) THEN RETURN OLD; END IF;
 IF TG_OP='INSERT' THEN
   IF NEW.state<>'building' OR NEW.finalized_at IS NOT NULL OR NEW.recorded_by_user_id IS DISTINCT FROM NULLIF(current_setting('app.user_id',true),'')::uuid THEN RAISE EXCEPTION 'statement requires building owned provider evidence' USING ERRCODE='23514'; END IF;
   NEW.created_at:=clock_timestamp(); RETURN NEW;
 END IF;
 IF TG_OP='UPDATE' AND OLD.state='building' AND NEW.state='verified' AND (to_jsonb(NEW)-ARRAY['state','finalized_at'])=(to_jsonb(OLD)-ARRAY['state','finalized_at']) THEN NEW.finalized_at:=clock_timestamp(); RETURN NEW; END IF;
 RAISE EXCEPTION 'statement snapshots are immutable; create a correction revision' USING ERRCODE='23514';
END $$;
CREATE TRIGGER statement_revision_guard BEFORE INSERT OR UPDATE OR DELETE ON finance.card_statement_revision FOR EACH ROW EXECUTE FUNCTION finance.guard_statement_revision();
CREATE FUNCTION finance.guard_statement_entry() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE r finance.card_statement_revision%ROWTYPE; s finance.card_statement%ROWTYPE; source finance.action_revision%ROWTYPE; detail finance.purchase_detail%ROWTYPE;
BEGIN
 SELECT * INTO r FROM finance.card_statement_revision WHERE workspace_id=NEW.workspace_id AND id=NEW.statement_revision_id;
 IF NOT FOUND OR r.state<>'building' THEN RAISE EXCEPTION 'entries require a building statement snapshot' USING ERRCODE='23514'; END IF;
 SELECT * INTO s FROM finance.card_statement WHERE workspace_id=r.workspace_id AND id=r.statement_id;
 IF NEW.action_revision_id IS NOT NULL THEN
   SELECT * INTO source FROM finance.action_revision WHERE workspace_id=NEW.workspace_id AND id=NEW.action_revision_id;
   SELECT d.* INTO detail FROM finance.purchase_detail d JOIN finance.credit_card c ON c.workspace_id=d.workspace_id AND c.liability_ledger_account_id=d.funding_ledger_account_id WHERE d.workspace_id=NEW.workspace_id AND d.action_revision_id=NEW.action_revision_id AND c.id=s.card_id;
   IF source.state IS DISTINCT FROM 'posted' OR source.action_kind IS DISTINCT FROM 'card_purchase' OR detail.action_revision_id IS NULL OR NEW.amount_minor IS DISTINCT FROM detail.purchase_minor OR NEW.posting_date IS DISTINCT FROM detail.card_posting_date OR NOT (EXISTS(SELECT 1 FROM finance.financial_action f WHERE f.workspace_id=source.workspace_id AND f.id=source.action_id AND f.current_revision_id=source.id) OR EXISTS(SELECT 1 FROM finance.card_statement_entry e WHERE e.workspace_id=r.workspace_id AND e.statement_revision_id=r.previous_revision_id AND e.action_revision_id=source.id)) THEN
     RAISE EXCEPTION 'statement link requires exact recognized owned card purchase evidence' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER statement_entry_guard BEFORE INSERT ON finance.card_statement_entry FOR EACH ROW EXECUTE FUNCTION finance.guard_statement_entry();
CREATE TRIGGER statement_entry_immutable BEFORE UPDATE OR DELETE ON finance.card_statement_entry FOR EACH ROW EXECUTE FUNCTION finance.enforce_debt_append_only_evidence();
--> statement-breakpoint
CREATE FUNCTION finance.validate_statement_integrity() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE s finance.card_statement%ROWTYPE; r finance.card_statement_revision%ROWTYPE; receipt core.command_receipt%ROWTYPE;
BEGIN
 IF TG_TABLE_NAME='card_statement' THEN
   SELECT * INTO s FROM finance.card_statement WHERE workspace_id=NEW.workspace_id AND id=NEW.id;
   IF NOT FOUND THEN RETURN NULL; END IF;
   SELECT * INTO r FROM finance.card_statement_revision WHERE workspace_id=s.workspace_id AND statement_id=s.id AND id=s.current_revision_id;
   IF NOT FOUND OR r.revision_no<>s.version OR r.state<>'verified' THEN RAISE EXCEPTION 'statement requires a current verified revision' USING ERRCODE='23514'; END IF;
 ELSE
   SELECT * INTO r FROM finance.card_statement_revision WHERE workspace_id=NEW.workspace_id AND id=NEW.id;
   IF NOT FOUND THEN RETURN NULL; END IF;
   SELECT * INTO s FROM finance.card_statement WHERE workspace_id=r.workspace_id AND id=r.statement_id;
 END IF;
 IF r.state<>'verified' OR s.current_revision_id IS NULL OR s.version<r.revision_no OR (r.revision_no>1 AND NOT EXISTS(SELECT 1 FROM finance.card_statement_revision prev WHERE prev.workspace_id=r.workspace_id AND prev.statement_id=r.statement_id AND prev.id=r.previous_revision_id AND prev.revision_no=r.revision_no-1 AND prev.state='verified')) THEN RAISE EXCEPTION 'statement requires finalized sequential correction evidence' USING ERRCODE='23514'; END IF;
 IF (SELECT count(*) FROM finance.card_statement_entry WHERE workspace_id=r.workspace_id AND statement_revision_id=r.id)<>(SELECT COALESCE(max(line_no),0) FROM finance.card_statement_entry WHERE workspace_id=r.workspace_id AND statement_revision_id=r.id) THEN RAISE EXCEPTION 'statement lines must be consecutive provider evidence' USING ERRCODE='23514'; END IF;
 SELECT * INTO receipt FROM core.command_receipt WHERE workspace_id=r.workspace_id AND id=r.command_receipt_id;
 IF receipt.state IS DISTINCT FROM 'completed' OR receipt.retain_until IS NOT NULL OR receipt.command_type IS DISTINCT FROM (CASE WHEN r.revision_no=1 THEN 'finance.record_card_statement' ELSE 'finance.revise_card_statement' END) OR NOT (receipt.result_json @> jsonb_build_object('statementId',s.id,'revisionId',r.id,'version',r.revision_no)) OR EXISTS(SELECT 1 FROM finance.action_revision a WHERE a.workspace_id=r.workspace_id AND a.command_receipt_id=r.command_receipt_id) THEN RAISE EXCEPTION 'statement requires a completed evidence-only command' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM audit.private_revision a WHERE a.workspace_id=r.workspace_id AND a.command_receipt_id=r.command_receipt_id AND a.subject_kind='card_statement' AND a.subject_id=s.id AND a.subject_version=r.revision_no AND a.operation=CASE WHEN r.revision_no=1 THEN 'create' ELSE 'replace' END AND a.recorded_by_user_id=r.recorded_by_user_id AND a.actor_kind='user' AND a.request_id IS NOT DISTINCT FROM r.request_id AND a.reason IS NOT DISTINCT FROM r.reason AND a.effective_date=r.statement_date AND a.after_json=finance.card_statement_snapshot(r.workspace_id,r.id) AND a.before_json IS NOT DISTINCT FROM CASE WHEN r.previous_revision_id IS NULL THEN NULL ELSE finance.card_statement_snapshot(r.workspace_id,r.previous_revision_id) END) THEN RAISE EXCEPTION 'statement requires exact attributed before/after audit evidence' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM finance.card_statement other JOIN finance.card_statement_revision other_r ON other_r.workspace_id=other.workspace_id AND other_r.id=other.current_revision_id JOIN finance.card_statement_revision own_r ON own_r.workspace_id=s.workspace_id AND own_r.id=s.current_revision_id WHERE other.workspace_id=s.workspace_id AND other.card_id=s.card_id AND other.id<>s.id AND other_r.cycle_start=own_r.cycle_start AND other_r.cycle_end=own_r.cycle_end) THEN RAISE EXCEPTION 'correct the existing statement for this provider cycle' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT source.action_id FROM finance.card_statement roots JOIN finance.card_statement_entry entries ON entries.workspace_id=roots.workspace_id AND entries.statement_revision_id=roots.current_revision_id JOIN finance.action_revision source ON source.workspace_id=entries.workspace_id AND source.id=entries.action_revision_id WHERE roots.workspace_id=s.workspace_id GROUP BY source.action_id HAVING count(*)>1) THEN RAISE EXCEPTION 'recognized purchase belongs to at most one current statement' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER statement_root_integrity AFTER INSERT OR UPDATE ON finance.card_statement DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION finance.validate_statement_integrity();
CREATE CONSTRAINT TRIGGER statement_revision_integrity AFTER INSERT OR UPDATE ON finance.card_statement_revision DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION finance.validate_statement_integrity();
DO $$ DECLARE fn text; BEGIN
 FOREACH fn IN ARRAY ARRAY['guard_statement_root','guard_statement_revision','guard_statement_entry','validate_statement_integrity'] LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION finance.%I() FROM PUBLIC',fn);
   EXECUTE format('GRANT EXECUTE ON FUNCTION finance.%I() TO app_domain,lifecycle_operator',fn);
 END LOOP;
END $$;
