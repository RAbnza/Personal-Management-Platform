DO $$ DECLARE d text;anchor text:='''card_refund''';BEGIN
 d:=pg_get_functiondef('finance.guard_unreleased_card_posting()'::regprocedure);
 IF strpos(d,anchor)=0 THEN RAISE EXCEPTION 'released card recipe dispatch anchor missing'; END IF;
 EXECUTE replace(d,anchor,'''card_refund'',''group_adoption'',''group_effect''');
END $$;

CREATE FUNCTION sharing.validate_operational_receipt() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE receipt uuid:=NEW.receipt_id;actor uuid:=NEW.actor_id;subject uuid;kind text;command text;
BEGIN
 IF TG_TABLE_NAME='settlement_event' THEN subject:=NEW.settlement_id;kind:='settlement';command:=CASE WHEN NEW.version=1 THEN 'settlement' ELSE 'settlement_transition' END;
 ELSE subject:=NEW.id;kind:='refund';command:='refund';END IF;
 IF NOT EXISTS(SELECT 1 FROM sharing.group_command_receipt c JOIN audit.group_revision a ON a.group_id=c.group_id AND a.command_receipt_id=c.id WHERE c.group_id=NEW.group_id AND c.id=receipt AND c.actor_participant_id=actor AND c.command_type=command AND c.state='completed' AND c.xmin::text=pg_current_xact_id()::text AND a.actor_participant_id=actor AND a.subject_kind=kind AND a.subject_id=subject AND c.result_json->>'subjectId'=subject::text) THEN RAISE EXCEPTION 'operational record requires its own exact fresh actor command and audit' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION sharing.validate_operational_receipt() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER exact_settlement_event_receipt AFTER INSERT ON sharing.settlement_event DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sharing.validate_operational_receipt();
CREATE CONSTRAINT TRIGGER exact_refund_receipt AFTER INSERT ON sharing.refund DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sharing.validate_operational_receipt();

CREATE FUNCTION sharing.guard_operational_bounds() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 IF TG_TABLE_NAME='settlement' AND (SELECT count(*) FROM sharing.settlement WHERE group_id=NEW.group_id)>=1000 THEN RAISE EXCEPTION 'group settlement history limit reached' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='refund' AND (SELECT count(*) FROM sharing.refund WHERE group_id=NEW.group_id)>=1000 THEN RAISE EXCEPTION 'group refund history limit reached' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='shared_expense' AND (SELECT count(*) FROM sharing.shared_expense WHERE group_id=NEW.group_id)>=1000 THEN RAISE EXCEPTION 'group bill history limit reached' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION sharing.guard_operational_bounds() FROM PUBLIC;
CREATE TRIGGER operational_bound BEFORE INSERT ON sharing.settlement FOR EACH ROW EXECUTE FUNCTION sharing.guard_operational_bounds();
CREATE TRIGGER operational_bound BEFORE INSERT ON sharing.refund FOR EACH ROW EXECUTE FUNCTION sharing.guard_operational_bounds();
CREATE TRIGGER operational_bound BEFORE INSERT ON sharing.shared_expense FOR EACH ROW EXECUTE FUNCTION sharing.guard_operational_bounds();
CREATE FUNCTION sharing.validate_source_position_bound() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 IF (SELECT count(*) FROM (SELECT c.expense_id,c.participant_id FROM sharing.payer_contribution c JOIN sharing.shared_expense e ON e.group_id=c.group_id AND e.current_revision_id=c.expense_revision_id WHERE c.group_id=NEW.group_id UNION SELECT c.expense_id,c.participant_id FROM sharing.participant_share c JOIN sharing.shared_expense e ON e.group_id=c.group_id AND e.current_revision_id=c.expense_revision_id WHERE c.group_id=NEW.group_id) positions)>10000 THEN RAISE EXCEPTION 'group current position limit reached' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION sharing.validate_source_position_bound() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER source_position_bound AFTER INSERT OR UPDATE ON sharing.expense_revision DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sharing.validate_source_position_bound();
