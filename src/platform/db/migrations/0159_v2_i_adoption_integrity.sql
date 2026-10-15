-- Custom SQL migration file, put your code below! --
ALTER TABLE finance.private_group_link ADD CONSTRAINT fk_private_link_current FOREIGN KEY(workspace_id,id,current_link_revision_id) REFERENCES finance.private_group_link_revision(workspace_id,link_id,id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE finance.private_group_link_revision ADD CONSTRAINT fk_private_link_previous FOREIGN KEY(workspace_id,link_id,previous_link_revision_id) REFERENCES finance.private_group_link_revision(workspace_id,link_id,id);
DO $$ DECLARE n text; BEGIN FOREACH n IN ARRAY ARRAY['group_ledger_binding','private_group_link','private_group_link_revision'] LOOP
 EXECUTE format('REVOKE ALL ON finance.%I FROM PUBLIC,app_domain,auth_adapter,queue_broker,worker_domain,lifecycle_operator',n);
 EXECUTE format('GRANT SELECT,INSERT ON finance.%I TO app_domain',n);
 EXECUTE format('GRANT SELECT,DELETE ON finance.%I TO lifecycle_operator',n);
 EXECUTE format('ALTER TABLE finance.%I ENABLE ROW LEVEL SECURITY',n);
 EXECUTE format('ALTER TABLE finance.%I FORCE ROW LEVEL SECURITY',n);
 EXECUTE format('CREATE POLICY private_group_owner ON finance.%I TO app_domain USING(workspace_id=NULLIF(current_setting(''app.workspace_id'',true),'''')::uuid AND EXISTS(SELECT 1 FROM core.workspace w JOIN core.user_profile p ON p.user_id=w.owner_user_id WHERE w.id=workspace_id AND w.owner_user_id=NULLIF(current_setting(''app.user_id'',true),'''')::uuid AND w.state=''active'' AND p.lifecycle=''active'')) WITH CHECK(workspace_id=NULLIF(current_setting(''app.workspace_id'',true),'''')::uuid AND EXISTS(SELECT 1 FROM core.workspace w JOIN core.user_profile p ON p.user_id=w.owner_user_id WHERE w.id=workspace_id AND w.owner_user_id=NULLIF(current_setting(''app.user_id'',true),'''')::uuid AND w.state=''active'' AND p.lifecycle=''active''))',n);
 EXECUTE format('CREATE POLICY lifecycle_purge_scope ON finance.%I TO lifecycle_operator USING(ops.purge_scope_allowed(workspace_id))',n);
 EXECUTE format('CREATE TRIGGER a_private_group_root BEFORE INSERT ON finance.%I FOR EACH ROW EXECUTE FUNCTION finance.guard_financial_root_write()',n);
 EXECUTE format('CREATE TRIGGER private_group_immutable BEFORE UPDATE OR DELETE ON finance.%I FOR EACH ROW EXECUTE FUNCTION finance.enforce_debt_append_only_evidence()',n);
END LOOP; END $$;
GRANT UPDATE ON finance.private_group_link TO app_domain;
DROP TRIGGER private_group_immutable ON finance.private_group_link;
CREATE TRIGGER private_group_delete BEFORE DELETE ON finance.private_group_link FOR EACH ROW EXECUTE FUNCTION finance.enforce_debt_append_only_evidence();
CREATE TRIGGER private_group_revision_parent BEFORE INSERT ON finance.private_group_link_revision FOR EACH ROW EXECUTE FUNCTION finance.guard_revision_evidence_parent();

/* Keep all earlier classifiers and recipes. Only owner-consented link evidence
 * dispatches to the additional exact group recipe below. */
DO $$ DECLARE d text; BEGIN
 d:=pg_get_functiondef('finance.validate_posting_classification()'::regprocedure);
 IF strpos(d,'WHEN ''payment_clearing_asset'' THEN')=0 THEN RAISE EXCEPTION 'classifier anchor missing'; END IF;
 EXECUTE replace(d,'WHEN ''payment_clearing_asset'' THEN','WHEN ''group_receivable_asset'', ''group_payable_liability'', ''payment_clearing_asset'' THEN');
 d:=pg_get_functiondef('finance.validate_s1_revision_recipe()'::regprocedure);
 EXECUTE regexp_replace(d,'BEGIN','BEGIN IF EXISTS(SELECT 1 FROM finance.private_group_link_revision x WHERE x.workspace_id=NEW.workspace_id AND x.action_revision_id=NEW.id) OR NEW.action_kind=''group_adoption'' THEN RETURN NULL; END IF;');
 d:=pg_get_functiondef('finance.validate_card_purchase_recipe()'::regprocedure);
 EXECUTE regexp_replace(d,'BEGIN','BEGIN IF EXISTS(SELECT 1 FROM finance.private_group_link_revision x WHERE x.workspace_id=NEW.workspace_id AND x.action_revision_id=NEW.id) THEN RETURN NULL; END IF;');
END $$;
--> statement-breakpoint
CREATE FUNCTION finance.guard_group_binding() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 PERFORM 1 FROM sharing.expense_group WHERE id=NEW.group_id FOR UPDATE;
 IF NEW.participant_id IS DISTINCT FROM sharing.actor(NEW.group_id) THEN RAISE EXCEPTION 'private binding requires owned registered participant' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM finance.ledger_account r JOIN finance.ledger_account p ON p.workspace_id=r.workspace_id WHERE r.workspace_id=NEW.workspace_id AND r.id=NEW.receivable_ledger_account_id AND p.id=NEW.payable_ledger_account_id AND r.kind='group_receivable_asset' AND p.kind='group_payable_liability' AND r.currency='PHP' AND p.currency='PHP' AND r.archived_at IS NULL AND p.archived_at IS NULL) THEN RAISE EXCEPTION 'invalid private group ledger binding' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER a0_binding_group_lock BEFORE INSERT ON finance.group_ledger_binding FOR EACH ROW EXECUTE FUNCTION finance.guard_group_binding();
CREATE FUNCTION finance.guard_private_group_link() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 PERFORM 1 FROM sharing.expense_group WHERE id=NEW.group_id FOR UPDATE;
 IF NEW.participant_id IS DISTINCT FROM sharing.actor(NEW.group_id) OR NOT sharing.can_read_expense(NEW.group_id,NEW.expense_id) THEN RAISE EXCEPTION 'private adoption requires owned source entitlement' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' AND (to_jsonb(NEW)-'current_link_revision_id') IS DISTINCT FROM (to_jsonb(OLD)-'current_link_revision_id') THEN RAISE EXCEPTION 'private link identity is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER a0_link_group_lock BEFORE INSERT OR UPDATE ON finance.private_group_link FOR EACH ROW EXECUTE FUNCTION finance.guard_private_group_link();

CREATE FUNCTION finance.validate_private_group_revision() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE p finance.private_group_link%ROWTYPE; r sharing.expense_revision%ROWTYPE; paid numeric; consumed numeric; fingerprint text;
BEGIN
 SELECT * INTO p FROM finance.private_group_link WHERE workspace_id=NEW.workspace_id AND id=NEW.link_id;
 IF p.group_id<>NEW.group_id OR p.participant_id<>NEW.participant_id OR p.expense_id<>NEW.expense_id OR p.action_id<>NEW.action_id OR p.current_link_revision_id<>NEW.id THEN RAISE EXCEPTION 'private link parent mismatch' USING ERRCODE='23514'; END IF;
 SELECT r0.* INTO r FROM sharing.expense_revision r0 JOIN sharing.shared_expense e ON e.group_id=r0.group_id AND e.id=r0.expense_id AND e.current_revision_id=r0.id WHERE r0.group_id=NEW.group_id AND r0.expense_id=NEW.expense_id AND r0.id=NEW.source_expense_revision_id AND r0.state='finalized';
 IF NOT FOUND THEN RAISE EXCEPTION 'adoption requires current visible finalized source' USING ERRCODE='23514'; END IF;
 SELECT coalesce(sum(amount_minor::numeric),0) INTO paid FROM sharing.payer_contribution WHERE group_id=NEW.group_id AND expense_revision_id=r.id AND participant_id=NEW.participant_id;
 SELECT coalesce(sum(amount_minor::numeric),0) INTO consumed FROM sharing.participant_share WHERE group_id=NEW.group_id AND expense_revision_id=r.id AND participant_id=NEW.participant_id;
 fingerprint:=encode(sha256(convert_to(jsonb_build_object('revisionId',r.id,'paidMinor',paid::text,'shareMinor',consumed::text)::text,'UTF8')),'hex');
 IF (paid=0 AND consumed=0) OR paid<>NEW.paid_minor OR consumed<>NEW.share_minor OR fingerprint<>NEW.accepted_source_hash OR NEW.consent_json IS DISTINCT FROM jsonb_build_object('approved',true,'sourceHash',fingerprint) OR NEW.participant_id IS DISTINCT FROM sharing.actor(NEW.group_id) THEN RAISE EXCEPTION 'adoption requires exact independent source consent' USING ERRCODE='23514'; END IF;
 IF NEW.revision_no>1 AND NOT EXISTS(SELECT 1 FROM finance.private_group_link_revision x WHERE x.workspace_id=NEW.workspace_id AND x.link_id=NEW.link_id AND x.id=NEW.previous_link_revision_id AND x.revision_no=NEW.revision_no-1) THEN RAISE EXCEPTION 'invalid private link history' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER private_group_source AFTER INSERT ON finance.private_group_link_revision DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION finance.validate_private_group_revision();

CREATE FUNCTION finance.validate_group_adoption_recipe() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE x finance.private_group_link_revision%ROWTYPE; r finance.action_revision%ROWTYPE; b finance.group_ledger_binding%ROWTYPE; d finance.purchase_detail%ROWTYPE; own_expense numeric; receivable numeric; payable numeric; funding numeric; journal_count integer; line_count integer; expected_lines integer; movement record; activity_count integer;
BEGIN
 SELECT * INTO r FROM finance.action_revision WHERE workspace_id=NEW.workspace_id AND id=NEW.id;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO x FROM finance.private_group_link_revision WHERE workspace_id=r.workspace_id AND action_revision_id=r.id;
 IF NOT FOUND THEN
  IF r.action_kind='group_adoption' OR EXISTS(SELECT 1 FROM finance.private_group_link WHERE workspace_id=r.workspace_id AND action_id=r.action_id) THEN RAISE EXCEPTION 'linked financial action requires explicit private adoption command' USING ERRCODE='23514'; END IF;
  RETURN NULL;
 END IF;
 IF r.state<>'posted' OR r.change_kind='void' OR r.action_kind NOT IN('expense','card_purchase','group_adoption') THEN RAISE EXCEPTION 'invalid adoption action' USING ERRCODE='23514'; END IF;
 SELECT * INTO b FROM finance.group_ledger_binding WHERE workspace_id=x.workspace_id AND group_id=x.group_id AND participant_id=x.participant_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'missing private group binding' USING ERRCODE='23514'; END IF;
 SELECT * INTO d FROM finance.purchase_detail WHERE workspace_id=r.workspace_id AND action_revision_id=r.id;
 IF x.paid_minor>0 THEN
  IF d.purchase_minor IS DISTINCT FROM x.paid_minor OR (r.action_kind='expense' AND NOT EXISTS(SELECT 1 FROM finance.financial_account a WHERE a.workspace_id=r.workspace_id AND a.ledger_account_id=d.funding_ledger_account_id AND a.opening_cutoff_date<r.primary_effective_date)) OR (r.action_kind='card_purchase' AND NOT EXISTS(SELECT 1 FROM finance.credit_card c WHERE c.workspace_id=r.workspace_id AND c.liability_ledger_account_id=d.funding_ledger_account_id)) OR r.action_kind='group_adoption' THEN RAISE EXCEPTION 'funding must equal actual contribution' USING ERRCODE='23514'; END IF;
 ELSIF r.action_kind<>'group_adoption' OR d.action_revision_id IS NOT NULL THEN RAISE EXCEPTION 'unfunded adoption cannot move cash or cards' USING ERRCODE='23514'; END IF;
 SELECT count(*) INTO journal_count FROM finance.journal WHERE workspace_id=r.workspace_id AND action_revision_id=r.id AND role='economic' AND state='posted';
 SELECT coalesce(sum(p.amount_minor::numeric) FILTER(WHERE l.kind='expense' AND p.expense_class='gross'),0),coalesce(sum(p.amount_minor::numeric) FILTER(WHERE l.id=b.receivable_ledger_account_id),0),coalesce(sum(p.amount_minor::numeric) FILTER(WHERE l.id=b.payable_ledger_account_id),0),coalesce(sum(p.amount_minor::numeric) FILTER(WHERE l.id=d.funding_ledger_account_id),0),count(*) INTO own_expense,receivable,payable,funding,line_count FROM finance.posting p JOIN finance.journal j ON j.workspace_id=p.workspace_id AND j.id=p.journal_id AND j.role='economic' JOIN finance.ledger_account l ON l.workspace_id=p.workspace_id AND l.id=p.ledger_account_id WHERE p.workspace_id=r.workspace_id AND p.action_revision_id=r.id;
 expected_lines:=CASE WHEN x.share_minor>0 THEN 1 ELSE 0 END+CASE WHEN x.paid_minor>0 THEN 1 ELSE 0 END+CASE WHEN x.paid_minor<>x.share_minor THEN 1 ELSE 0 END;
 IF journal_count<>1 OR line_count<>expected_lines OR own_expense<>x.share_minor OR receivable<>greatest(x.paid_minor::numeric-x.share_minor,0) OR payable<>least(x.paid_minor::numeric-x.share_minor,0) OR funding<>-x.paid_minor::numeric THEN RAISE EXCEPTION 'private funding, spending and group position must reconcile exactly' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM audit.private_revision a JOIN core.command_receipt c ON c.workspace_id=a.workspace_id AND c.id=a.command_receipt_id WHERE a.workspace_id=r.workspace_id AND a.command_receipt_id=r.command_receipt_id AND a.subject_kind='financial_action' AND a.subject_id=r.action_id AND a.subject_version=r.revision_no AND a.recorded_by_user_id IS NOT DISTINCT FROM r.recorded_by_user_id AND a.after_json @> jsonb_build_object('actionRevisionId',r.id,'actionKind',r.action_kind,'privateGroupLinkRevisionId',x.id,'acceptedSourceHash',x.accepted_source_hash) AND c.state='completed' AND c.retain_until IS NULL) THEN RAISE EXCEPTION 'private adoption requires attributed permanent audit and receipt' USING ERRCODE='23514'; END IF;
 activity_count:=0;
 FOR movement IN SELECT c.id,(-sum(p.amount_minor::numeric)) amount FROM finance.posting p JOIN finance.credit_card c ON c.workspace_id=p.workspace_id AND c.liability_ledger_account_id=p.ledger_account_id WHERE p.workspace_id=r.workspace_id AND p.action_revision_id=r.id GROUP BY c.id HAVING sum(p.amount_minor::numeric)<>0 LOOP
  activity_count:=activity_count+1;
  IF NOT EXISTS(SELECT 1 FROM finance.card_activity a WHERE a.workspace_id=r.workspace_id AND a.action_revision_id=r.id AND a.card_id=movement.id AND a.activity_kind='purchase' AND a.signed_liability_minor::numeric=movement.amount AND a.transaction_date=r.primary_effective_date AND a.posting_date=d.card_posting_date AND a.provider_reference IS NOT DISTINCT FROM d.card_provider_reference) THEN RAISE EXCEPTION 'group card activity must match actual liability' USING ERRCODE='23514'; END IF;
 END LOOP;
 IF (SELECT count(*) FROM finance.card_activity WHERE workspace_id=r.workspace_id AND action_revision_id=r.id)<>activity_count THEN RAISE EXCEPTION 'unexpected group card activity' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER group_adoption_recipe AFTER INSERT OR UPDATE ON finance.action_revision DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION finance.validate_group_adoption_recipe();
REVOKE ALL ON FUNCTION finance.guard_group_binding(),finance.guard_private_group_link(),finance.validate_private_group_revision(),finance.validate_group_adoption_recipe() FROM PUBLIC;

/* Buckets cannot be repurposed into cash, card, or standalone lender debt. */
CREATE FUNCTION finance.guard_group_bucket() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 IF (NEW.kind<>OLD.kind OR NEW.currency<>OLD.currency) AND EXISTS(SELECT 1 FROM finance.group_ledger_binding b WHERE b.workspace_id=OLD.workspace_id AND OLD.id IN(b.receivable_ledger_account_id,b.payable_ledger_account_id)) THEN RAISE EXCEPTION 'bound group bucket identity is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION finance.guard_group_bucket() FROM PUBLIC;
CREATE TRIGGER group_bucket_identity BEFORE UPDATE ON finance.ledger_account FOR EACH ROW EXECUTE FUNCTION finance.guard_group_bucket();
