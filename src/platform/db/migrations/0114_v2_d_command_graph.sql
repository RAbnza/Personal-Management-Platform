/* The financial effect stays zero; command evidence must also preserve the
 * reviewed management semantics and remain replayable through the API. */
CREATE FUNCTION planning.validate_goal_command_graph() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE c core.command_receipt%ROWTYPE; roots integer; reservations integer; audits integer; delta numeric; increases integer; decreases integer;
BEGIN
 SELECT * INTO c FROM core.command_receipt WHERE workspace_id=NEW.workspace_id AND id=NEW.command_receipt_id;
 SELECT count(*) INTO roots FROM planning.savings_goal WHERE workspace_id=NEW.workspace_id AND command_receipt_id=c.id;
 SELECT count(*) INTO reservations FROM planning.goal_reservation WHERE workspace_id=NEW.workspace_id AND command_receipt_id=c.id;
 SELECT count(*) INTO audits FROM audit.private_revision WHERE workspace_id=NEW.workspace_id AND command_receipt_id=c.id;
 IF c.id IS NULL OR c.state<>'completed' OR audits<>roots+reservations THEN RAISE EXCEPTION 'goal command requires exactly one audit per changed record' USING ERRCODE='23514'; END IF;
 IF c.command_type IN('planning.goal.save','planning.goal.complete','planning.goal.archive','planning.goal.reopen') THEN
  IF roots<>1 OR reservations<>0 THEN RAISE EXCEPTION 'goal management requires one definition and no allocation changes' USING ERRCODE='23514'; END IF;
 ELSIF c.command_type='planning.goal.reserve' THEN
  IF roots<>1 OR reservations<>1 THEN RAISE EXCEPTION 'reservation change requires exactly one goal and account' USING ERRCODE='23514'; END IF;
 ELSIF c.command_type='planning.goal.reallocate' THEN
  IF roots NOT BETWEEN 1 AND 2 OR reservations<>2 THEN RAISE EXCEPTION 'reallocation requires two distinct reservation records' USING ERRCODE='23514'; END IF;
  SELECT sum(d.amount),count(*) FILTER(WHERE d.amount>0),count(*) FILTER(WHERE d.amount<0) INTO delta,increases,decreases FROM (
   SELECT (a.after_json->>'reserved_minor')::numeric-COALESCE((a.before_json->>'reserved_minor')::numeric,0) amount
   FROM planning.goal_reservation r JOIN audit.private_revision a ON a.workspace_id=r.workspace_id AND a.command_receipt_id=r.command_receipt_id AND a.subject_kind='goal_reservation' AND a.subject_id=r.id AND a.subject_version=r.version
   WHERE r.workspace_id=NEW.workspace_id AND r.command_receipt_id=c.id
  ) d;
  IF delta IS DISTINCT FROM 0::numeric OR increases<>1 OR decreases<>1 THEN RAISE EXCEPTION 'reallocation must conserve exact reservations with one source and destination' USING ERRCODE='23514'; END IF;
 ELSE RAISE EXCEPTION 'unsupported savings command graph' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
DO $$ DECLARE relation text; BEGIN FOREACH relation IN ARRAY ARRAY['savings_goal','goal_reservation'] LOOP
 EXECUTE format('CREATE CONSTRAINT TRIGGER savings_command_graph AFTER INSERT OR UPDATE ON planning.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION planning.validate_goal_command_graph()',relation);
END LOOP; END $$;
/* Ordinary callers cannot fabricate orphan/late goal history under an existing
 * command or another domain receipt. Before images remain independently bound
 * to OLD by the deferred savings finalization validator. */
CREATE FUNCTION planning.guard_goal_audit() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE c core.command_receipt%ROWTYPE; body jsonb;
BEGIN
 SELECT * INTO c FROM core.command_receipt WHERE workspace_id=NEW.workspace_id AND id=NEW.command_receipt_id;
 IF NEW.subject_kind IN('savings_goal','goal_reservation') OR c.command_type LIKE 'planning.goal.%' THEN
  IF c.id IS NULL OR c.state<>'claimed' OR c.command_type NOT IN('planning.goal.save','planning.goal.complete','planning.goal.archive','planning.goal.reopen','planning.goal.reserve','planning.goal.reallocate') OR NEW.subject_kind NOT IN('savings_goal','goal_reservation') THEN RAISE EXCEPTION 'goal audit requires current claimed goal command' USING ERRCODE='23514'; END IF;
  IF NEW.subject_kind='savings_goal' THEN
   SELECT planning.savings_snapshot(to_jsonb(g)) INTO body FROM planning.savings_goal g WHERE workspace_id=NEW.workspace_id AND id=NEW.subject_id AND command_receipt_id=c.id;
  ELSE
   SELECT planning.savings_snapshot(to_jsonb(r)) INTO body FROM planning.goal_reservation r WHERE workspace_id=NEW.workspace_id AND id=NEW.subject_id AND command_receipt_id=c.id;
  END IF;
  IF body IS NULL OR NEW.after_json IS DISTINCT FROM body OR NEW.subject_version<>(body->>'version')::integer OR NEW.operation IS DISTINCT FROM (CASE WHEN NEW.subject_version=1 THEN 'create' ELSE 'replace' END) OR NEW.recorded_by_user_id IS DISTINCT FROM (body->>'recorded_by_user_id')::uuid OR NEW.actor_kind<>'user' OR NEW.request_id IS DISTINCT FROM (body->>'request_id')::uuid THEN RAISE EXCEPTION 'goal audit must describe the actual current mutation' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER savings_audit_evidence BEFORE INSERT ON audit.private_revision FOR EACH ROW EXECUTE FUNCTION planning.guard_goal_audit();
REVOKE ALL ON FUNCTION planning.validate_goal_command_graph(),planning.guard_goal_audit() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION planning.validate_goal_command_graph(),planning.guard_goal_audit() TO app_domain;
