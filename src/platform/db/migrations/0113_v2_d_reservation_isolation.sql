/* Financial revision advancement belongs to existing Finance services. A raw
 * SQL writer can finalize valid financial evidence without that service step.
 * Reservation capacity therefore needs a fresh statement snapshot after the
 * workspace lock, never an older REPEATABLE READ snapshot. */
CREATE FUNCTION planning.guard_reservation_isolation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN
  RAISE EXCEPTION 'Reservation writes require current read-committed financial evidence' USING ERRCODE='40001';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER a_reservation_isolation BEFORE INSERT OR UPDATE ON planning.goal_reservation FOR EACH ROW EXECUTE FUNCTION planning.guard_reservation_isolation();
REVOKE ALL ON FUNCTION planning.guard_reservation_isolation() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION planning.guard_reservation_isolation() TO app_domain;
