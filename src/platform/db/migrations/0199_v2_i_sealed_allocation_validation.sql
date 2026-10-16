/* Every allocation's BEFORE guard requires a fresh sender report. Its parent
 * settlement INSERT therefore queues the complete deferred source/authority
 * validation. Repeating that entire validation for each immutable allocation
 * made a large full payment quadratic.
 *
 * The child still checks the exact sealed total, including when the caller
 * forces parent constraints before attempting another INSERT. Positive-only,
 * immutable allocations and immutable amount/advance terms mean that no later
 * child can evade the parent's full validation while preserving this total.
 * This trigger-only definer reads only NEW's group/settlement aggregate; it
 * returns no data and has no caller-executable grant. Authorization remains in
 * the existing BEFORE guards and complete parent validation under caller RLS. */
CREATE FUNCTION sharing.validate_sealed_settlement_allocations() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s sharing.settlement%ROWTYPE;
BEGIN
 SELECT * INTO s FROM sharing.settlement WHERE group_id=NEW.group_id AND id=NEW.settlement_id;
 IF s.id IS NULL OR s.amount_minor::numeric<>s.advance_minor::numeric+
   (SELECT coalesce(sum(amount_minor::numeric),0) FROM sharing.settlement_allocation WHERE group_id=NEW.group_id AND settlement_id=NEW.settlement_id)
 THEN RAISE EXCEPTION 'settlement allocation total mismatch' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION sharing.validate_sealed_settlement_allocations() FROM PUBLIC,app_domain,auth_adapter,worker_domain,queue_broker,lifecycle_operator;
DROP TRIGGER settlement_allocation_integrity ON sharing.settlement_allocation;
CREATE CONSTRAINT TRIGGER settlement_allocation_integrity AFTER INSERT ON sharing.settlement_allocation
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sharing.validate_sealed_settlement_allocations();
