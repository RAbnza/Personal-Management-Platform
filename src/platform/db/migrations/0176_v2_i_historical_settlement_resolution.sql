CREATE OR REPLACE FUNCTION sharing.can_read_settlement(g uuid,s uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT sharing.active(g) OR (sharing.visible(g) AND EXISTS(SELECT 1 FROM sharing.settlement x WHERE x.group_id=g AND x.id=s AND (sharing.actor(g) IN(x.sender_id,x.recipient_id) OR EXISTS(SELECT 1 FROM sharing.membership m WHERE m.group_id=g AND m.participant_id=sharing.actor(g) AND m.left_at IS NOT NULL AND x.created_at<=m.left_at) OR (x.advance_minor=0 AND EXISTS(SELECT 1 FROM sharing.settlement_allocation a WHERE a.group_id=g AND a.settlement_id=s) AND NOT EXISTS(SELECT 1 FROM sharing.settlement_allocation a WHERE a.group_id=g AND a.settlement_id=s AND NOT sharing.can_read_expense(g,a.expense_id))))))
$$;
/* Archived groups cannot receive raw operational mutations. Transition history
 * and refund evidence must always accompany a fresh aggregate command. */
CREATE FUNCTION sharing.guard_operational_archive() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM sharing.expense_group WHERE id=NEW.group_id AND archived_at IS NOT NULL) THEN RAISE EXCEPTION 'archived groups are read only' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION sharing.guard_operational_archive() FROM PUBLIC;
DO $$ DECLARE n text; BEGIN FOREACH n IN ARRAY ARRAY['settlement','settlement_allocation','settlement_event','refund','refund_allocation'] LOOP
 EXECUTE format('CREATE TRIGGER b_operational_archive BEFORE INSERT OR UPDATE ON sharing.%I FOR EACH ROW EXECUTE FUNCTION sharing.guard_operational_archive()',n);
END LOOP; END $$;
