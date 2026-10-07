/* New payments require an active debt. Historical corrections keep their
 * original context; later clearing resolution cannot predate its source. */
CREATE FUNCTION finance.guard_payment_command_context()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE
  v_change_kind text;
  v_effective_date date;
  v_source_date date;
  v_lifecycle text;
BEGIN
  PERFORM finance.lock_active_workspace(NEW.workspace_id);
  SELECT change_kind, primary_effective_date INTO v_change_kind, v_effective_date
    FROM finance.action_revision WHERE workspace_id = NEW.workspace_id
      AND action_id = NEW.action_id AND id = NEW.action_revision_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'payment context unavailable' USING ERRCODE = '23503'; END IF;
  IF TG_TABLE_NAME = 'debt_payment_revision' THEN
    SELECT lifecycle INTO v_lifecycle FROM finance.debt
      WHERE workspace_id = NEW.workspace_id AND id = NEW.debt_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'payment debt unavailable' USING ERRCODE = '23503'; END IF;
    IF v_change_kind = 'create' AND v_lifecycle <> 'active' THEN
      RAISE EXCEPTION 'new payment requires an active debt' USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT r.primary_effective_date INTO v_source_date
      FROM finance.payment_component c JOIN finance.debt_payment_revision p
        ON p.workspace_id = c.workspace_id AND p.id = c.payment_revision_id
      JOIN finance.action_revision r ON r.workspace_id = p.workspace_id AND r.id = p.action_revision_id
      WHERE c.workspace_id = NEW.workspace_id AND c.debt_id = NEW.debt_id AND c.id = NEW.source_component_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'clearing source unavailable' USING ERRCODE = '23503'; END IF;
    IF v_effective_date < v_source_date THEN
      RAISE EXCEPTION 'clearing resolution cannot predate payment evidence' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER debt_payment_revision_command_context BEFORE INSERT ON finance.debt_payment_revision
FOR EACH ROW EXECUTE FUNCTION finance.guard_payment_command_context();
CREATE TRIGGER payment_reclassification_command_context BEFORE INSERT ON finance.payment_reclassification
FOR EACH ROW EXECUTE FUNCTION finance.guard_payment_command_context();
REVOKE ALL ON FUNCTION finance.guard_payment_command_context() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION finance.guard_payment_command_context() TO app_domain;
