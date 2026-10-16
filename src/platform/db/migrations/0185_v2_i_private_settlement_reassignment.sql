CREATE OR REPLACE FUNCTION finance.guard_private_group_link() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 IF ops.shared_restored_row('finance.private_group_link',to_jsonb(NEW)) THEN RETURN NEW; END IF;
 PERFORM 1 FROM sharing.expense_group WHERE id=NEW.group_id FOR UPDATE;
 IF NEW.participant_id IS DISTINCT FROM sharing.actor(NEW.group_id) OR NOT ((NEW.expense_id IS NOT NULL AND sharing.can_read_expense(NEW.group_id,NEW.expense_id)) OR (NEW.refund_id IS NOT NULL AND EXISTS(SELECT 1 FROM sharing.refund r WHERE r.group_id=NEW.group_id AND r.id=NEW.refund_id)) OR (NEW.settlement_id IS NOT NULL AND sharing.can_read_settlement(NEW.group_id,NEW.settlement_id))) THEN RAISE EXCEPTION 'private adoption requires owned source entitlement' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' AND (to_jsonb(NEW)-'current_link_revision_id') IS DISTINCT FROM (to_jsonb(OLD)-'current_link_revision_id') THEN
  IF (to_jsonb(NEW)-ARRAY['current_link_revision_id','settlement_id']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['current_link_revision_id','settlement_id']) OR NOT EXISTS(SELECT 1 FROM sharing.settlement old JOIN sharing.settlement next ON next.group_id=old.group_id WHERE old.group_id=OLD.group_id AND old.id=OLD.settlement_id AND next.id=NEW.settlement_id AND old.state IN('cancelled','reversed') AND next.state NOT IN('cancelled','reversed') AND old.sender_id=next.sender_id AND old.recipient_id=next.recipient_id AND old.amount_minor=next.amount_minor AND old.payment_date=next.payment_date AND NEW.participant_id IN(next.sender_id,next.recipient_id)) THEN RAISE EXCEPTION 'private link source is immutable except an explicitly reviewed identical movement from a closed settlement' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
