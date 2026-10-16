/* Group evidence only. No private workspace scope is accepted by these tables. */
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['settlement','settlement_allocation','settlement_event','refund','refund_allocation'] LOOP
  EXECUTE format('ALTER TABLE sharing.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE sharing.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('REVOKE ALL ON sharing.%I FROM PUBLIC,app_domain,auth_adapter,worker_domain,queue_broker,lifecycle_operator',n);
  EXECUTE format('CREATE POLICY predicate_owner ON sharing.%I TO migration_owner USING(true) WITH CHECK(true)',n);
  EXECUTE format('GRANT SELECT,INSERT ON sharing.%I TO app_domain',n);
  EXECUTE format('CREATE TRIGGER a_group_lock BEFORE INSERT OR UPDATE ON sharing.%I FOR EACH ROW EXECUTE FUNCTION sharing.guard_group_write()',n);
  EXECUTE format('CREATE CONSTRAINT TRIGGER group_command_integrity AFTER INSERT OR UPDATE ON sharing.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sharing.validate_group()',n);
 END LOOP;
END $$;
GRANT UPDATE ON sharing.settlement TO app_domain;

CREATE FUNCTION sharing.can_read_settlement(g uuid,s uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT sharing.active(g) OR (sharing.visible(g) AND EXISTS(SELECT 1 FROM sharing.settlement x WHERE x.group_id=g AND x.id=s AND (sharing.actor(g) IN(x.sender_id,x.recipient_id) OR EXISTS(SELECT 1 FROM sharing.membership m WHERE m.group_id=g AND m.participant_id=sharing.actor(g) AND m.left_at IS NOT NULL AND x.created_at<=m.left_at))))
$$;
REVOKE ALL ON FUNCTION sharing.can_read_settlement(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sharing.can_read_settlement(uuid,uuid) TO app_domain;
CREATE POLICY settlement_read ON sharing.settlement FOR SELECT TO app_domain USING(sharing.can_read_settlement(group_id,id));
CREATE POLICY settlement_insert ON sharing.settlement FOR INSERT TO app_domain WITH CHECK(sharing.active(group_id) AND sender_id=sharing.actor(group_id) AND reported_by=sender_id);
CREATE POLICY settlement_update ON sharing.settlement FOR UPDATE TO app_domain USING(sharing.active(group_id)) WITH CHECK(sharing.active(group_id));
CREATE POLICY allocation_read ON sharing.settlement_allocation FOR SELECT TO app_domain USING(sharing.can_read_settlement(group_id,settlement_id));
CREATE POLICY allocation_insert ON sharing.settlement_allocation FOR INSERT TO app_domain WITH CHECK(sharing.active(group_id));
CREATE POLICY event_read ON sharing.settlement_event FOR SELECT TO app_domain USING(sharing.can_read_settlement(group_id,settlement_id));
CREATE POLICY event_insert ON sharing.settlement_event FOR INSERT TO app_domain WITH CHECK(sharing.active(group_id) AND actor_id=sharing.actor(group_id));
CREATE POLICY refund_read ON sharing.refund FOR SELECT TO app_domain USING(sharing.can_read_expense(group_id,expense_id));
CREATE POLICY refund_insert ON sharing.refund FOR INSERT TO app_domain WITH CHECK(sharing.active(group_id) AND actor_id=sharing.actor(group_id));
CREATE POLICY refund_allocation_read ON sharing.refund_allocation FOR SELECT TO app_domain USING(EXISTS(SELECT 1 FROM sharing.refund r WHERE r.group_id=refund_allocation.group_id AND r.id=refund_allocation.refund_id));
CREATE POLICY refund_allocation_insert ON sharing.refund_allocation FOR INSERT TO app_domain WITH CHECK(sharing.active(group_id));
ALTER POLICY audit_read ON audit.group_revision USING(sharing.active(group_id) OR actor_participant_id=sharing.actor(group_id) OR (subject_kind='expense' AND sharing.can_read_expense(group_id,subject_id)) OR (subject_kind='settlement' AND sharing.can_read_settlement(group_id,subject_id)) OR (subject_kind='refund' AND EXISTS(SELECT 1 FROM sharing.refund r WHERE r.group_id=group_revision.group_id AND r.id=subject_id)));

/* Historical participants on visible settlement evidence remain nameable. */
CREATE OR REPLACE FUNCTION sharing.participant_visible(g uuid,p uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT sharing.active(g) OR p=sharing.actor(g) OR EXISTS(SELECT 1 FROM sharing.payer_contribution x WHERE x.group_id=g AND x.participant_id=p AND sharing.can_read_expense(g,x.expense_id)) OR EXISTS(SELECT 1 FROM sharing.participant_share x WHERE x.group_id=g AND x.participant_id=p AND sharing.can_read_expense(g,x.expense_id)) OR EXISTS(SELECT 1 FROM sharing.settlement x WHERE x.group_id=g AND p IN(x.sender_id,x.recipient_id) AND sharing.can_read_settlement(g,x.id))
$$;
CREATE OR REPLACE FUNCTION sharing.guard_group_audit_payload() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE allowed text[]:=ARRAY['groupVersion','name','displayName','archived','membershipId','role','operation','invitationId','claimParticipantId','expenseId','revisionId','totalMinor','splitMethod','reason','settlementId','refundId','amountMinor','state'];
BEGIN
 IF jsonb_typeof(NEW.after_json)<>'object' OR NEW.after_json-allowed<>'{}'::jsonb OR (NEW.before_json IS NOT NULL AND NEW.before_json<>'null'::jsonb AND (jsonb_typeof(NEW.before_json)<>'object' OR NEW.before_json-allowed<>'{}'::jsonb)) THEN RAISE EXCEPTION 'group audit permits only group-owned metadata' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;

/* Exact per-bill attribution, matching domain/balances.ts policy v1. Numeric
 * prefix ranges avoid multiplication and remain exact beyond summed bigint. */
CREATE FUNCTION sharing.obligation(g uuid,s uuid,r uuid,e uuid DEFAULT NULL) RETURNS numeric LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 WITH amounts AS (
 SELECT c.expense_id,c.participant_id,c.amount_minor::numeric n FROM sharing.payer_contribution c JOIN sharing.shared_expense b ON b.group_id=c.group_id AND b.current_revision_id=c.expense_revision_id WHERE c.group_id=g
 UNION ALL SELECT c.expense_id,c.participant_id,-c.amount_minor::numeric FROM sharing.participant_share c JOIN sharing.shared_expense b ON b.group_id=c.group_id AND b.current_revision_id=c.expense_revision_id WHERE c.group_id=g
 UNION ALL SELECT f.expense_id,a.participant_id,CASE WHEN a.axis='received' THEN -a.amount_minor::numeric ELSE a.amount_minor::numeric END FROM sharing.refund_allocation a JOIN sharing.refund f ON f.group_id=a.group_id AND f.id=a.refund_id WHERE a.group_id=g
 ), positions AS (SELECT expense_id,participant_id,sum(n) n FROM amounts WHERE e IS NULL OR expense_id=e GROUP BY expense_id,participant_id),
 creditors AS (SELECT *,sum(n) OVER(PARTITION BY expense_id ORDER BY participant_id) hi FROM positions WHERE n>0),
 debtors AS (SELECT *,sum(-n) OVER(PARTITION BY expense_id ORDER BY participant_id) hi FROM positions WHERE n<0),
 edges AS (SELECT d.participant_id sender,c.participant_id recipient,greatest(0,least(d.hi,c.hi)-greatest(d.hi+d.n,c.hi-c.n)) n FROM debtors d JOIN creditors c USING(expense_id)),
 payments AS (SELECT x.sender_id,x.recipient_id,CASE WHEN e IS NULL THEN x.amount_minor::numeric ELSE coalesce((SELECT sum(a.amount_minor::numeric) FROM sharing.settlement_allocation a WHERE a.group_id=g AND a.settlement_id=x.id AND a.expense_id=e),0) END n FROM sharing.settlement x WHERE x.group_id=g AND x.state='confirmed')
 SELECT coalesce((SELECT sum(CASE WHEN sender=s AND recipient=r THEN n WHEN sender=r AND recipient=s THEN -n ELSE 0 END) FROM edges),0)-coalesce((SELECT sum(CASE WHEN sender_id=s AND recipient_id=r THEN n WHEN sender_id=r AND recipient_id=s THEN -n ELSE 0 END) FROM payments),0)
$$;
REVOKE ALL ON FUNCTION sharing.obligation(uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sharing.obligation(uuid,uuid,uuid,uuid) TO app_domain;

CREATE FUNCTION sharing.guard_settlement_evidence() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE s sharing.settlement%ROWTYPE; prev sharing.settlement_event%ROWTYPE; manual boolean;
BEGIN
 IF TG_TABLE_NAME='settlement' THEN
  IF TG_OP='INSERT' THEN
   IF NEW.state<>'pending' OR NEW.version<>1 OR NEW.sender_id<>sharing.actor(NEW.group_id) OR NEW.reported_by<>NEW.sender_id OR NEW.created_at<>transaction_timestamp() THEN RAISE EXCEPTION 'settlement must begin as an authenticated sender report' USING ERRCODE='23514'; END IF;
  ELSIF (to_jsonb(NEW)-ARRAY['state','version']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','version']) OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'immutable settlement terms' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='settlement_allocation' THEN
  SELECT * INTO s FROM sharing.settlement WHERE group_id=NEW.group_id AND id=NEW.settlement_id AND xmin::text=pg_current_xact_id()::text;
  IF s.id IS NULL OR s.version<>1 OR s.sender_id<>sharing.actor(NEW.group_id) OR s.state<>'pending' THEN RAISE EXCEPTION 'allocations require a fresh sender report' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='settlement_event' THEN
  SELECT * INTO s FROM sharing.settlement WHERE group_id=NEW.group_id AND id=NEW.settlement_id;
  SELECT * INTO prev FROM sharing.settlement_event WHERE group_id=NEW.group_id AND settlement_id=NEW.settlement_id ORDER BY version DESC LIMIT 1;
  SELECT identity_kind<>'registered' INTO manual FROM sharing.participant WHERE group_id=NEW.group_id AND id=s.recipient_id;
  IF NEW.created_at<>transaction_timestamp() OR NEW.version<>s.version OR NEW.to_state<>s.state OR NEW.actor_id<>sharing.actor(NEW.group_id) OR NEW.from_state IS DISTINCT FROM prev.to_state OR NEW.version<>coalesce(prev.version,0)+1 THEN RAISE EXCEPTION 'invalid settlement transition chain' USING ERRCODE='23514'; END IF;
  IF NEW.version=1 THEN
   IF NEW.to_state<>'pending' OR NEW.confirmation_type<>'reported' OR NEW.actor_id<>s.sender_id OR NEW.receipt_id<>s.original_receipt_id THEN RAISE EXCEPTION 'invalid settlement report evidence' USING ERRCODE='23514'; END IF;
  ELSIF NEW.to_state='confirmed' THEN
   IF NEW.from_state<>'pending' OR NOT ((NOT manual AND NEW.actor_id=s.recipient_id AND NEW.confirmation_type='recipient_authenticated') OR (manual AND sharing.active(NEW.group_id,true) AND NEW.confirmation_type='manual_entry')) THEN RAISE EXCEPTION 'recipient confirmation authority required' USING ERRCODE='42501'; END IF;
  ELSIF NEW.to_state='disputed' THEN
   IF NEW.from_state<>'pending' OR NEW.actor_id<>s.recipient_id OR manual OR NEW.confirmation_type<>'participant_transition' THEN RAISE EXCEPTION 'recipient dispute authority required' USING ERRCODE='42501'; END IF;
  ELSIF NEW.to_state='cancelled' THEN
   IF NEW.from_state NOT IN('pending','disputed') OR NEW.actor_id NOT IN(s.sender_id,s.recipient_id) OR NEW.confirmation_type<>'participant_transition' THEN RAISE EXCEPTION 'party cancellation authority required' USING ERRCODE='42501'; END IF;
  ELSIF NEW.to_state='reversed' THEN
   IF NEW.from_state<>'confirmed' OR NOT (NEW.actor_id=s.recipient_id OR (manual AND sharing.active(NEW.group_id,true))) OR NEW.confirmation_type<>'participant_transition' THEN RAISE EXCEPTION 'recipient reversal authority required' USING ERRCODE='42501'; END IF;
  ELSE RAISE EXCEPTION 'unsupported settlement transition' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION sharing.guard_settlement_evidence() FROM PUBLIC;
CREATE TRIGGER settlement_guard BEFORE INSERT OR UPDATE ON sharing.settlement FOR EACH ROW EXECUTE FUNCTION sharing.guard_settlement_evidence();
CREATE TRIGGER settlement_allocation_guard BEFORE INSERT ON sharing.settlement_allocation FOR EACH ROW EXECUTE FUNCTION sharing.guard_settlement_evidence();
CREATE TRIGGER settlement_event_guard BEFORE INSERT ON sharing.settlement_event FOR EACH ROW EXECUTE FUNCTION sharing.guard_settlement_evidence();
DO $$ DECLARE n text; BEGIN FOREACH n IN ARRAY ARRAY['settlement_allocation','settlement_event','refund','refund_allocation'] LOOP
 EXECUTE format('CREATE TRIGGER immutable_evidence BEFORE UPDATE OR DELETE ON sharing.%I FOR EACH ROW EXECUTE FUNCTION sharing.immutable()',n);
END LOOP; END $$;

CREATE FUNCTION sharing.validate_settlement() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE s sharing.settlement%ROWTYPE; a sharing.settlement_allocation%ROWTYPE; current_receipt uuid; due numeric;
BEGIN
 SELECT * INTO s FROM sharing.settlement WHERE group_id=NEW.group_id AND id=CASE WHEN TG_TABLE_NAME='settlement' THEN NEW.id ELSE NEW.settlement_id END;
 IF s.amount_minor::numeric<>s.advance_minor::numeric+(SELECT coalesce(sum(amount_minor::numeric),0) FROM sharing.settlement_allocation WHERE group_id=s.group_id AND settlement_id=s.id) THEN RAISE EXCEPTION 'settlement allocation total mismatch' USING ERRCODE='23514'; END IF;
 SELECT receipt_id INTO current_receipt FROM sharing.settlement_event WHERE group_id=s.group_id AND settlement_id=s.id AND version=s.version AND to_state=s.state;
 IF current_receipt IS NULL OR NOT EXISTS(SELECT 1 FROM sharing.group_command_receipt c WHERE c.group_id=s.group_id AND c.id=current_receipt AND c.state='completed' AND c.xmin::text=pg_current_xact_id()::text) THEN RAISE EXCEPTION 'settlement requires fresh transition evidence' USING ERRCODE='23514'; END IF;
 IF (s.version=1 OR (s.state='confirmed' AND EXISTS(SELECT 1 FROM sharing.settlement_event v WHERE v.group_id=s.group_id AND v.settlement_id=s.id AND v.version=s.version AND v.from_state='pending'))) THEN
  FOR a IN SELECT * FROM sharing.settlement_allocation WHERE group_id=s.group_id AND settlement_id=s.id LOOP
   IF NOT EXISTS(SELECT 1 FROM sharing.shared_expense e WHERE e.group_id=s.group_id AND e.id=a.expense_id AND e.current_revision_id=a.source_revision_id) THEN RAISE EXCEPTION 'settlement source revision changed' USING ERRCODE='23514'; END IF;
   due:=sharing.obligation(s.group_id,s.sender_id,s.recipient_id,a.expense_id);
   IF s.state='confirmed' THEN due:=due+a.amount_minor; END IF;
   IF a.amount_minor>due THEN RAISE EXCEPTION 'settlement exceeds recipient bill obligation' USING ERRCODE='23514'; END IF;
  END LOOP;
  due:=sharing.obligation(s.group_id,s.sender_id,s.recipient_id,NULL);
  IF s.state='confirmed' THEN due:=due+s.amount_minor; END IF;
  IF s.mode='full' AND s.amount_minor<>greatest(0,due) THEN RAISE EXCEPTION 'full settlement amount changed' USING ERRCODE='23514'; END IF;
  IF s.advance_minor>0 AND NOT EXISTS(SELECT 1 FROM sharing.settlement_event v WHERE v.group_id=s.group_id AND v.settlement_id=s.id AND v.version=1 AND v.reason='Sender reported payment; explicitly acknowledged unallocated advance/reverse position.') THEN RAISE EXCEPTION 'advance acknowledgement evidence required' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION sharing.validate_settlement() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER settlement_integrity AFTER INSERT OR UPDATE ON sharing.settlement DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sharing.validate_settlement();
CREATE CONSTRAINT TRIGGER settlement_allocation_integrity AFTER INSERT ON sharing.settlement_allocation DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sharing.validate_settlement();

CREATE FUNCTION sharing.guard_refund() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE r sharing.refund%ROWTYPE;
BEGIN
 IF TG_TABLE_NAME='refund' THEN
  IF NEW.created_at<>transaction_timestamp() OR NOT EXISTS(SELECT 1 FROM sharing.shared_expense e WHERE e.group_id=NEW.group_id AND e.id=NEW.expense_id AND e.current_revision_id=NEW.source_revision_id AND e.created_by_participant_id=sharing.actor(NEW.group_id)) THEN RAISE EXCEPTION 'refund requires current bill creator authority' USING ERRCODE='42501'; END IF;
 ELSE
  SELECT * INTO r FROM sharing.refund WHERE group_id=NEW.group_id AND id=NEW.refund_id AND xmin::text=pg_current_xact_id()::text;
  IF r.id IS NULL OR r.actor_id<>sharing.actor(NEW.group_id) THEN RAISE EXCEPTION 'refund allocation requires a fresh owned refund' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION sharing.guard_refund() FROM PUBLIC;
CREATE TRIGGER refund_guard BEFORE INSERT ON sharing.refund FOR EACH ROW EXECUTE FUNCTION sharing.guard_refund();
CREATE TRIGGER refund_allocation_guard BEFORE INSERT ON sharing.refund_allocation FOR EACH ROW EXECUTE FUNCTION sharing.guard_refund();

CREATE FUNCTION sharing.validate_refunds() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE e uuid; g uuid:=NEW.group_id; rid uuid; total numeric;
BEGIN
 e:=CASE WHEN TG_TABLE_NAME='expense_revision' THEN NEW.expense_id ELSE NEW.expense_id END;
 SELECT current_revision_id INTO rid FROM sharing.shared_expense WHERE group_id=g AND id=e;
 IF EXISTS(SELECT 1 FROM sharing.refund r WHERE r.group_id=g AND r.expense_id=e AND ((SELECT coalesce(sum(a.amount_minor::numeric),0) FROM sharing.refund_allocation a WHERE a.group_id=g AND a.refund_id=r.id AND a.axis='received')<>r.total_minor OR (SELECT coalesce(sum(a.amount_minor::numeric),0) FROM sharing.refund_allocation a WHERE a.group_id=g AND a.refund_id=r.id AND a.axis='share_credit')<>r.total_minor)) THEN RAISE EXCEPTION 'refund allocation axes must equal total' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM sharing.refund_allocation a JOIN sharing.refund r ON r.group_id=a.group_id AND r.id=a.refund_id WHERE r.group_id=g AND r.expense_id=e GROUP BY a.participant_id,a.axis HAVING sum(a.amount_minor::numeric)>CASE WHEN a.axis='received' THEN coalesce((SELECT amount_minor FROM sharing.payer_contribution c WHERE c.group_id=g AND c.expense_revision_id=rid AND c.participant_id=a.participant_id),0) ELSE coalesce((SELECT amount_minor FROM sharing.participant_share c WHERE c.group_id=g AND c.expense_revision_id=rid AND c.participant_id=a.participant_id),0) END) THEN RAISE EXCEPTION 'refunds exceed current paid/share evidence; correct refund allocations first' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION sharing.validate_refunds() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER refund_integrity AFTER INSERT ON sharing.refund DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sharing.validate_refunds();
CREATE CONSTRAINT TRIGGER revision_refund_integrity AFTER INSERT OR UPDATE ON sharing.expense_revision DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sharing.validate_refunds();
