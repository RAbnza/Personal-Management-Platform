-- Custom SQL migration file, put your code below! --
ALTER POLICY audit_insert ON audit.group_revision WITH CHECK(actor_participant_id=sharing.actor(group_id) AND actor_kind='participant');
DO $$ DECLARE d text; BEGIN
 d:=pg_get_functiondef('sharing.review_invitation(text)'::regprocedure);
 EXECUTE replace(replace(d,'paid numeric; consumed numeric;','paid numeric; consumed numeric; history_json jsonb; history_count integer;'),
  'RETURN jsonb_build_object(',
  'SELECT count(*) INTO history_count FROM sharing.expense_revision r WHERE r.group_id=g.id AND claim.participant_id IS NOT NULL AND (EXISTS(SELECT 1 FROM sharing.payer_contribution p WHERE p.group_id=r.group_id AND p.expense_revision_id=r.id AND p.participant_id=claim.participant_id) OR EXISTS(SELECT 1 FROM sharing.participant_share s WHERE s.group_id=r.group_id AND s.expense_revision_id=r.id AND s.participant_id=claim.participant_id));
   IF history_count>100 THEN RAISE EXCEPTION ''manual claim requires complete history review within the 100-revision preview bound'' USING ERRCODE=''23514''; END IF;
   SELECT coalesce(jsonb_agg(item ORDER BY created_at,id),''[]''::jsonb) INTO history_json FROM (SELECT r.created_at,r.id,jsonb_build_object(''expenseId'',r.expense_id,''revisionId'',r.id,''revisionNo'',r.revision_no,''description'',r.description,''date'',r.expense_date::text,''reason'',r.reason,''paidMinor'',coalesce((SELECT amount_minor::text FROM sharing.payer_contribution p WHERE p.group_id=r.group_id AND p.expense_revision_id=r.id AND p.participant_id=claim.participant_id),''0''),''shareMinor'',coalesce((SELECT amount_minor::text FROM sharing.participant_share s WHERE s.group_id=r.group_id AND s.expense_revision_id=r.id AND s.participant_id=claim.participant_id),''0'')) item FROM sharing.expense_revision r WHERE r.group_id=g.id AND claim.participant_id IS NOT NULL AND (EXISTS(SELECT 1 FROM sharing.payer_contribution p WHERE p.group_id=r.group_id AND p.expense_revision_id=r.id AND p.participant_id=claim.participant_id) OR EXISTS(SELECT 1 FROM sharing.participant_share s WHERE s.group_id=r.group_id AND s.expense_revision_id=r.id AND s.participant_id=claim.participant_id))) histories;
   RETURN jsonb_build_object(''history'',history_json,');
END $$;
CREATE FUNCTION sharing.guard_preview_bounds() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 IF TG_TABLE_NAME='participant' AND TG_OP='INSERT' AND (SELECT count(*) FROM sharing.participant WHERE group_id=NEW.group_id)>=100 THEN RAISE EXCEPTION 'group participant preview bound exceeded' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='expense_revision' THEN IF NEW.revision_no>100 THEN RAISE EXCEPTION 'bill revision preview bound exceeded' USING ERRCODE='23514'; END IF; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION sharing.guard_preview_bounds() FROM PUBLIC;
CREATE TRIGGER preview_bound BEFORE INSERT ON sharing.participant FOR EACH ROW EXECUTE FUNCTION sharing.guard_preview_bounds();
CREATE TRIGGER preview_bound BEFORE INSERT ON sharing.expense_revision FOR EACH ROW EXECUTE FUNCTION sharing.guard_preview_bounds();

/* I6 will provide explicit group refund reconciliation. Ordinary private
 * refund paths must not silently bypass the accepted group binding. */
CREATE FUNCTION finance.guard_linked_group_refund() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 IF NEW.purchase_action_id IS NOT NULL AND EXISTS(SELECT 1 FROM finance.private_group_link WHERE workspace_id=NEW.workspace_id AND action_id=NEW.purchase_action_id) THEN RAISE EXCEPTION 'shared purchase refund requires explicit group reconciliation' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION finance.guard_linked_group_refund() FROM PUBLIC;
CREATE TRIGGER linked_group_refund BEFORE INSERT ON finance.refund_detail FOR EACH ROW EXECUTE FUNCTION finance.guard_linked_group_refund();
CREATE TRIGGER linked_group_refund BEFORE INSERT ON finance.card_action_detail FOR EACH ROW EXECUTE FUNCTION finance.guard_linked_group_refund();
