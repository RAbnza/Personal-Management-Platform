/* Resolve table-specific fields only after selecting the concrete row shape. */
CREATE OR REPLACE FUNCTION planning.guard_evidence() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE c core.command_receipt%ROWTYPE; original planning.occurrence_actual_link%ROWTYPE; source planning.eligible_actual_v%ROWTYPE; occurrence planning.expected_occurrence%ROWTYPE; r planning.recurrence_version%ROWTYPE; p planning.recurring_obligation%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' THEN
  IF current_user='lifecycle_operator' AND ops.purge_scope_allowed(OLD.workspace_id) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'recurring history requires approved lifecycle purge' USING ERRCODE='23514';
 END IF;
 PERFORM finance.lock_active_workspace(NEW.workspace_id);
 IF NEW.recorded_by_user_id IS DISTINCT FROM NULLIF(current_setting('app.user_id',true),'')::uuid THEN RAISE EXCEPTION 'planning attribution requires current actor' USING ERRCODE='23514'; END IF;
 SELECT * INTO c FROM core.command_receipt WHERE workspace_id=NEW.workspace_id AND id=NEW.command_receipt_id;
 IF c.id IS NULL OR c.state<>'claimed' OR c.command_type NOT IN('planning.definition','planning.generate','planning.archive','planning.occurrence','planning.link','planning.unlink') THEN RAISE EXCEPTION 'planning write requires current command receipt' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' THEN
  IF TG_TABLE_NAME IN('recurrence_version','occurrence_actual_link') THEN RAISE EXCEPTION 'rule revisions and actual links are immutable' USING ERRCODE='23514'; END IF;
  IF ROW(NEW.id,NEW.workspace_id,NEW.created_at) IS DISTINCT FROM ROW(OLD.id,OLD.workspace_id,OLD.created_at) THEN RAISE EXCEPTION 'planning identity is immutable' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME='recurring_obligation' THEN
   IF NEW.kind<>OLD.kind OR OLD.archived_at IS NOT NULL OR NEW.version<>(CASE WHEN OLD.current_version_id IS NULL THEN 1 ELSE OLD.version+1 END) OR (OLD.current_version_id IS NOT NULL AND NEW.command_receipt_id=OLD.command_receipt_id) OR c.command_type NOT IN('planning.definition','planning.archive') THEN RAISE EXCEPTION 'recurring root revision is protected' USING ERRCODE='23514'; END IF;
  ELSE
   IF ROW(NEW.obligation_id,NEW.recurrence_version_id,NEW.logical_date,NEW.generation) IS DISTINCT FROM ROW(OLD.obligation_id,OLD.recurrence_version_id,OLD.logical_date,OLD.generation) OR NEW.version<>OLD.version+1 OR NEW.command_receipt_id=OLD.command_receipt_id OR OLD.state IN('skipped','cancelled') THEN RAISE EXCEPTION 'occurrence identity and terminal history are protected' USING ERRCODE='23514'; END IF;
   IF c.command_type IN('planning.link','planning.unlink') THEN
    IF ROW(NEW.due_date,NEW.expected_minor,NEW.override_reason) IS DISTINCT FROM ROW(OLD.due_date,OLD.expected_minor,OLD.override_reason) THEN RAISE EXCEPTION 'link commands cannot rewrite expected evidence' USING ERRCODE='23514'; END IF;
   ELSIF c.command_type IN('planning.definition','planning.archive') THEN
    IF OLD.state<>'planned' OR NEW.state<>'cancelled' OR ROW(NEW.due_date,NEW.expected_minor) IS DISTINCT FROM ROW(OLD.due_date,OLD.expected_minor) THEN RAISE EXCEPTION 'future revisions only cancel unlinked plans' USING ERRCODE='23514'; END IF;
   ELSIF c.command_type<>'planning.occurrence' OR OLD.state='completed' OR NEW.override_reason IS NULL THEN RAISE EXCEPTION 'occurrence mutation requires explicit review' USING ERRCODE='23514'; END IF;
   NEW.notification_generation:=OLD.notification_generation+CASE WHEN NEW.due_date<>OLD.due_date OR (OLD.state='completed' AND NEW.state<>'completed') THEN 1 ELSE 0 END;
  END IF;
  NEW.updated_at:=clock_timestamp();
 ELSE
  NEW.created_at:=clock_timestamp();
  IF TG_TABLE_NAME='recurring_obligation' THEN IF c.command_type<>'planning.definition' OR NEW.version<>1 OR NEW.current_version_id IS NOT NULL OR NEW.archived_at IS NOT NULL THEN RAISE EXCEPTION 'definition requires an initial identity' USING ERRCODE='23514'; END IF; END IF;
  IF TG_TABLE_NAME='expected_occurrence' THEN
   SELECT * INTO r FROM planning.recurrence_version WHERE workspace_id=NEW.workspace_id AND id=NEW.recurrence_version_id AND obligation_id=NEW.obligation_id;
   SELECT * INTO p FROM planning.recurring_obligation WHERE workspace_id=NEW.workspace_id AND id=NEW.obligation_id;
   IF c.command_type NOT IN('planning.definition','planning.generate') OR r.id IS NULL OR p.archived_at IS NOT NULL OR NEW.state<>'planned' OR NEW.version<>1 OR NEW.notification_generation<>1 OR NEW.due_date<>NEW.logical_date OR NEW.expected_minor<>r.expected_minor OR NEW.override_reason IS NOT NULL OR planning.recurrence_ordinal(r,NEW.logical_date)=0 OR EXISTS(SELECT 1 FROM planning.recurrence_version next WHERE next.workspace_id=r.workspace_id AND next.obligation_id=r.obligation_id AND next.effective_from>r.effective_from AND next.effective_from<=NEW.logical_date) OR NEW.generation<>1+COALESCE((SELECT max(o.generation) FROM planning.expected_occurrence o WHERE o.workspace_id=NEW.workspace_id AND o.obligation_id=NEW.obligation_id AND o.logical_date=NEW.logical_date),0) THEN RAISE EXCEPTION 'occurrence requires deterministic effective bounded rule evidence' USING ERRCODE='23514'; END IF;
  ELSIF TG_TABLE_NAME='recurrence_version' THEN
   IF c.command_type<>'planning.definition' OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=NEW.timezone) OR EXISTS(SELECT 1 FROM unnest(NEW.weekdays) w GROUP BY w HAVING count(*)>1) THEN RAISE EXCEPTION 'rule requires supported named timezone and unique weekdays' USING ERRCODE='23514'; END IF;
   SELECT * INTO p FROM planning.recurring_obligation WHERE workspace_id=NEW.workspace_id AND id=NEW.obligation_id;
   IF p.archived_at IS NOT NULL OR (NEW.category_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM core.category category WHERE category.workspace_id=NEW.workspace_id AND category.id=NEW.category_id AND category.archived_at IS NULL AND category.kind=CASE WHEN p.kind='income' THEN 'income' ELSE 'expense' END)) OR (NEW.default_account_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM finance.financial_account account WHERE account.workspace_id=NEW.workspace_id AND account.id=NEW.default_account_id AND account.archived_at IS NULL AND account.currency=NEW.currency)) THEN RAISE EXCEPTION 'suggestions require active owned matching references' USING ERRCODE='23514'; END IF;
   IF NEW.version_no>1 THEN
    SELECT * INTO r FROM planning.recurrence_version WHERE workspace_id=NEW.workspace_id AND id=NEW.previous_version_id AND obligation_id=NEW.obligation_id;
    IF r.id IS NULL OR r.id<>p.current_version_id OR r.version_no<>NEW.version_no-1 OR NEW.effective_from<=r.effective_from OR NEW.effective_from<(clock_timestamp() AT TIME ZONE r.timezone)::date THEN RAISE EXCEPTION 'future revision requires current sequential rule and future boundary' USING ERRCODE='23514'; END IF;
   END IF;
  ELSIF TG_TABLE_NAME='occurrence_actual_link' THEN
   SELECT * INTO occurrence FROM planning.expected_occurrence WHERE workspace_id=NEW.workspace_id AND id=NEW.occurrence_id;
   IF NEW.reverses_link_id IS NOT NULL THEN
    SELECT * INTO original FROM planning.occurrence_actual_link WHERE workspace_id=NEW.workspace_id AND id=NEW.reverses_link_id;
    IF c.command_type<>'planning.unlink' OR original.id IS NULL OR original.reverses_link_id IS NOT NULL OR ROW(NEW.occurrence_id,NEW.action_id,NEW.action_revision_id,NEW.linked_minor) IS DISTINCT FROM ROW(original.occurrence_id,original.action_id,original.action_revision_id,original.linked_minor) THEN RAISE EXCEPTION 'unlink requires one exact original reversal' USING ERRCODE='23514'; END IF;
   ELSE
    SELECT * INTO source FROM planning.eligible_actual_v WHERE workspace_id=NEW.workspace_id AND action_id=NEW.action_id AND action_revision_id=NEW.action_revision_id;
    SELECT * INTO p FROM planning.recurring_obligation WHERE workspace_id=NEW.workspace_id AND id=occurrence.obligation_id;
    IF c.command_type<>'planning.link' OR source.action_id IS NULL OR occurrence.state NOT IN('planned','linked') OR (p.kind='income') IS DISTINCT FROM (source.action_kind='income') OR EXISTS(SELECT 1 FROM planning.effective_occurrence_link_v l WHERE l.workspace_id=NEW.workspace_id AND l.occurrence_id=NEW.occurrence_id AND l.action_id=NEW.action_id) THEN RAISE EXCEPTION 'link requires current eligible distinct actual evidence' USING ERRCODE='23514'; END IF;
   END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION planning.guard_evidence() FROM PUBLIC;
