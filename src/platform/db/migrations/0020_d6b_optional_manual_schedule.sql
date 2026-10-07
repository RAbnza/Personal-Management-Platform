/* Database Architecture §7.2 explicitly permits an empty initial manual
 * schedule when provider due dates are unavailable. Preserve all finalization,
 * predecessor, same-debt, RLS, and opening-satisfaction guarantees. */
CREATE OR REPLACE FUNCTION finance.validate_committed_debt_schedule_version()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE
  v_schedule finance.debt_schedule_version%ROWTYPE;
  v_previous_version_no integer;
  v_previous_state text;
  v_opening_cutoff_date date;
BEGIN
  SELECT * INTO v_schedule FROM finance.debt_schedule_version
  WHERE workspace_id = NEW.workspace_id AND id = NEW.id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_schedule.state <> 'finalized' OR v_schedule.finalized_at IS NULL THEN
    RAISE EXCEPTION 'committed debt schedule version must be finalized' USING ERRCODE = '23514';
  END IF;
  IF v_schedule.version_no = 1 THEN
    IF v_schedule.previous_version_id IS NOT NULL OR v_schedule.revision_kind <> 'initial' THEN
      RAISE EXCEPTION 'initial debt schedule must be version 1 with no predecessor' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF v_schedule.previous_version_id IS NULL OR v_schedule.revision_kind = 'initial' THEN
      RAISE EXCEPTION 'later debt schedule versions require a non-initial predecessor' USING ERRCODE = '23514';
    END IF;
    SELECT version_no, state INTO v_previous_version_no, v_previous_state
    FROM finance.debt_schedule_version
    WHERE workspace_id = v_schedule.workspace_id AND debt_id = v_schedule.debt_id AND id = v_schedule.previous_version_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'debt schedule predecessor does not exist' USING ERRCODE = '23514';
    END IF;
    IF v_previous_version_no <> v_schedule.version_no - 1 THEN
      RAISE EXCEPTION 'debt schedule must reference the immediately preceding version' USING ERRCODE = '23514';
    END IF;
    IF v_previous_state <> 'finalized' THEN
      RAISE EXCEPTION 'debt schedule predecessor must already be finalized' USING ERRCODE = '23514';
    END IF;
  END IF;
  SELECT opening_cutoff_date INTO v_opening_cutoff_date FROM finance.debt
  WHERE workspace_id = v_schedule.workspace_id AND id = v_schedule.debt_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'debt schedule parent does not exist' USING ERRCODE = '23503';
  END IF;
  IF v_opening_cutoff_date IS NULL AND EXISTS (
    SELECT 1 FROM finance.scheduled_installment
    WHERE workspace_id = v_schedule.workspace_id AND debt_id = v_schedule.debt_id
      AND schedule_version_id = v_schedule.id AND opening_satisfied_minor <> 0
  ) THEN
    RAISE EXCEPTION 'newly originated debt schedules cannot contain opening-satisfied amounts' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
