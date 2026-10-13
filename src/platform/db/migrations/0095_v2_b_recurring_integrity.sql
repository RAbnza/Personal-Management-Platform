-- Custom SQL migration file, put your code below! --
/* Plans are owner-scoped evidence. No new financial recipe or automatic posting. */
ALTER TABLE planning.recurring_obligation ADD CONSTRAINT fk_recurring_current FOREIGN KEY(workspace_id,id,current_version_id) REFERENCES planning.recurrence_version(workspace_id,obligation_id,id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE planning.recurrence_version ADD CONSTRAINT fk_recurrence_previous FOREIGN KEY(workspace_id,obligation_id,previous_version_id) REFERENCES planning.recurrence_version(workspace_id,obligation_id,id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE planning.occurrence_actual_link ADD CONSTRAINT fk_occurrence_link_reversal FOREIGN KEY(workspace_id,reverses_link_id) REFERENCES planning.occurrence_actual_link(workspace_id,id) DEFERRABLE INITIALLY DEFERRED;
REVOKE ALL ON SCHEMA planning FROM PUBLIC,auth_adapter,queue_broker,worker_domain;
GRANT USAGE ON SCHEMA planning TO app_domain,lifecycle_operator;
DO $$ DECLARE relation text; BEGIN
 FOREACH relation IN ARRAY ARRAY['recurring_obligation','recurrence_version','expected_occurrence','occurrence_actual_link'] LOOP
  EXECUTE format('REVOKE ALL ON planning.%I FROM PUBLIC,app_domain,auth_adapter,queue_broker,worker_domain,lifecycle_operator',relation);
  EXECUTE format('GRANT SELECT,INSERT ON planning.%I TO app_domain',relation);
  EXECUTE format('GRANT SELECT,DELETE ON planning.%I TO lifecycle_operator',relation);
  EXECUTE format('ALTER TABLE planning.%I ENABLE ROW LEVEL SECURITY',relation);
  EXECUTE format('ALTER TABLE planning.%I FORCE ROW LEVEL SECURITY',relation);
  EXECUTE format('CREATE POLICY recurring_owner ON planning.%I TO app_domain USING(workspace_id=NULLIF(current_setting(''app.workspace_id'',true),'''')::uuid AND EXISTS(SELECT 1 FROM core.workspace w JOIN core.user_profile p ON p.user_id=w.owner_user_id WHERE w.id=workspace_id AND w.owner_user_id=NULLIF(current_setting(''app.user_id'',true),'''')::uuid AND w.state=''active'' AND p.lifecycle=''active'')) WITH CHECK(workspace_id=NULLIF(current_setting(''app.workspace_id'',true),'''')::uuid AND EXISTS(SELECT 1 FROM core.workspace w JOIN core.user_profile p ON p.user_id=w.owner_user_id WHERE w.id=workspace_id AND w.owner_user_id=NULLIF(current_setting(''app.user_id'',true),'''')::uuid AND w.state=''active'' AND p.lifecycle=''active''))',relation);
  EXECUTE format('CREATE POLICY lifecycle_purge_scope ON planning.%I TO lifecycle_operator USING(ops.purge_scope_allowed(workspace_id))',relation);
 END LOOP;
END $$;
GRANT UPDATE ON planning.recurring_obligation,planning.expected_occurrence TO app_domain;
--> statement-breakpoint
CREATE FUNCTION planning.evidence_snapshot(body jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT (body-ARRAY['created_at','updated_at']) || CASE WHEN body ? 'expected_minor' THEN jsonb_build_object('expected_minor',body->>'expected_minor') WHEN body ? 'linked_minor' THEN jsonb_build_object('linked_minor',body->>'linked_minor') ELSE '{}'::jsonb END
$$;
CREATE FUNCTION planning.recurrence_ordinal(r planning.recurrence_version,d date) RETURNS integer LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE n integer; monday date; dow integer; month_index integer; first_month date; wanted date; rank integer;
BEGIN
 IF d<r.effective_from OR (r.ends_on IS NOT NULL AND d>r.ends_on) THEN RETURN 0; END IF;
 IF r.frequency='daily' THEN
  n:=d-r.effective_from; IF n%r.interval_count<>0 THEN RETURN 0; END IF; rank:=n/r.interval_count+1;
 ELSIF r.frequency='weekly' THEN
  monday:=r.effective_from-(extract(isodow FROM r.effective_from)::integer-1); n:=(d-monday)/7; dow:=extract(isodow FROM d)::integer;
  IF n%r.interval_count<>0 OR NOT dow=ANY(r.weekdays) THEN RETURN 0; END IF;
  rank:=n/r.interval_count*cardinality(r.weekdays)+(SELECT count(*) FROM unnest(r.weekdays) w WHERE w<=dow)-(SELECT count(*) FROM unnest(r.weekdays) w WHERE monday+w-1<r.effective_from);
 ELSE
  first_month:=date_trunc('month',r.effective_from)::date; month_index:=(extract(year FROM d)::integer-extract(year FROM r.effective_from)::integer)*12+extract(month FROM d)::integer-extract(month FROM r.effective_from)::integer;
  IF month_index%r.interval_count<>0 THEN RETURN 0; END IF;
  wanted:=date_trunc('month',d)::date+LEAST(r.day_of_month,extract(day FROM date_trunc('month',d)+interval '1 month - 1 day')::integer)-1;
  IF d<>wanted OR (r.short_month_policy='skip' AND extract(day FROM d)::integer<>r.day_of_month) THEN RETURN 0; END IF;
  SELECT count(*) INTO rank FROM generate_series(0,month_index/r.interval_count) i CROSS JOIN LATERAL(SELECT (first_month+make_interval(months=>i*r.interval_count))::date first) m
   WHERE m.first+LEAST(r.day_of_month,extract(day FROM m.first+interval '1 month - 1 day')::integer)-1>=r.effective_from AND (r.short_month_policy='last_valid_day' OR extract(day FROM m.first+interval '1 month - 1 day')::integer>=r.day_of_month);
 END IF;
 IF r.occurrence_limit IS NOT NULL AND rank>r.occurrence_limit THEN RETURN 0; END IF; RETURN rank;
END $$;
CREATE VIEW planning.eligible_actual_v WITH(security_invoker=true) AS
SELECT f.workspace_id,f.id AS action_id,r.id AS action_revision_id,r.action_kind,r.primary_effective_date AS transaction_date,
 CASE WHEN r.action_kind='income' THEN receipt.actual_received_minor ELSE purchase.purchase_minor END AS amount_minor,
 f.description
FROM finance.financial_action f JOIN finance.action_revision r ON r.workspace_id=f.workspace_id AND r.id=f.current_revision_id AND r.state='posted' AND r.change_kind<>'void'
LEFT JOIN finance.receipt_detail receipt ON receipt.workspace_id=r.workspace_id AND receipt.action_revision_id=r.id
LEFT JOIN finance.purchase_detail purchase ON purchase.workspace_id=r.workspace_id AND purchase.action_revision_id=r.id
WHERE r.action_kind IN('income','expense','card_purchase');
CREATE VIEW planning.effective_occurrence_link_v WITH(security_invoker=true) AS
SELECT l.* FROM planning.occurrence_actual_link l WHERE l.reverses_link_id IS NULL AND NOT EXISTS(SELECT 1 FROM planning.occurrence_actual_link u WHERE u.workspace_id=l.workspace_id AND u.reverses_link_id=l.id);
CREATE VIEW planning.occurrence_due_v WITH(security_invoker=true) AS
SELECT o.*,r.timezone,p.name,p.kind,p.archived_at,r.category_id,r.default_account_id,COALESCE(a.amount,0)::numeric AS linked_minor,(o.expected_minor::numeric-COALESCE(a.amount,0)) AS remaining_minor
FROM planning.expected_occurrence o JOIN planning.recurring_obligation p ON p.workspace_id=o.workspace_id AND p.id=o.obligation_id JOIN planning.recurrence_version r ON r.workspace_id=o.workspace_id AND r.id=o.recurrence_version_id
LEFT JOIN LATERAL(SELECT sum(l.linked_minor::numeric) amount FROM planning.effective_occurrence_link_v l WHERE l.workspace_id=o.workspace_id AND l.occurrence_id=o.id) a ON true;
REVOKE ALL ON planning.eligible_actual_v,planning.effective_occurrence_link_v,planning.occurrence_due_v FROM PUBLIC;
GRANT SELECT ON planning.eligible_actual_v,planning.effective_occurrence_link_v,planning.occurrence_due_v TO app_domain,lifecycle_operator;
--> statement-breakpoint
CREATE FUNCTION planning.guard_evidence() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
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
  IF TG_TABLE_NAME='recurring_obligation' AND (c.command_type<>'planning.definition' OR NEW.version<>1 OR NEW.current_version_id IS NOT NULL OR NEW.archived_at IS NOT NULL) THEN RAISE EXCEPTION 'definition requires an initial identity' USING ERRCODE='23514'; END IF;
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
DO $$ DECLARE relation text; BEGIN FOREACH relation IN ARRAY ARRAY['recurring_obligation','recurrence_version','expected_occurrence','occurrence_actual_link'] LOOP EXECUTE format('CREATE TRIGGER recurring_guard BEFORE INSERT OR UPDATE OR DELETE ON planning.%I FOR EACH ROW EXECUTE FUNCTION planning.guard_evidence()',relation); END LOOP; END $$;
--> statement-breakpoint
CREATE FUNCTION planning.validate_evidence() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE body jsonb; before_body jsonb; c core.command_receipt%ROWTYPE; operation text; effective date; p planning.recurring_obligation%ROWTYPE; r planning.recurrence_version%ROWTYPE; total numeric;
BEGIN
 IF TG_TABLE_NAME='recurring_obligation' THEN
  SELECT * INTO p FROM planning.recurring_obligation WHERE workspace_id=NEW.workspace_id AND id=NEW.id; IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO r FROM planning.recurrence_version WHERE workspace_id=p.workspace_id AND id=p.current_version_id AND obligation_id=p.id;
  IF r.id IS NULL OR EXISTS(SELECT 1 FROM planning.recurrence_version newer WHERE newer.workspace_id=p.workspace_id AND newer.obligation_id=p.id AND newer.version_no>r.version_no) THEN RAISE EXCEPTION 'definition requires latest immutable rule' USING ERRCODE='23514'; END IF;
  body:=planning.evidence_snapshot(to_jsonb(p)); before_body:=CASE WHEN TG_OP='INSERT' OR OLD.current_version_id IS NULL THEN NULL ELSE planning.evidence_snapshot(to_jsonb(OLD)) END;
  SELECT * INTO c FROM core.command_receipt WHERE workspace_id=p.workspace_id AND id=p.command_receipt_id;
  IF NOT c.result_json @> jsonb_build_object('obligationId',p.id,'version',p.version) THEN RAISE EXCEPTION 'definition receipt result mismatch' USING ERRCODE='23514'; END IF;
  IF p.archived_at IS NOT NULL AND EXISTS(SELECT 1 FROM planning.expected_occurrence o WHERE o.workspace_id=p.workspace_id AND o.obligation_id=p.id AND o.state='planned' AND o.logical_date>=(p.archived_at AT TIME ZONE r.timezone)::date) THEN RAISE EXCEPTION 'archive must cancel unlinked future occurrences' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='recurrence_version' THEN
  body:=planning.evidence_snapshot(to_jsonb(NEW)); before_body:=NULL; effective:=NEW.effective_from;
  SELECT * INTO c FROM core.command_receipt WHERE workspace_id=NEW.workspace_id AND id=NEW.command_receipt_id;
  IF NOT c.result_json @> jsonb_build_object('obligationId',NEW.obligation_id,'recurrenceVersionId',NEW.id) THEN RAISE EXCEPTION 'rule receipt result mismatch' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM planning.expected_occurrence o WHERE o.workspace_id=NEW.workspace_id AND o.obligation_id=NEW.obligation_id AND o.recurrence_version_id<>NEW.id AND o.logical_date>=NEW.effective_from AND o.state='planned') THEN RAISE EXCEPTION 'future revision must cancel outstanding prior plans' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='expected_occurrence' THEN
  body:=planning.evidence_snapshot(to_jsonb(NEW)); before_body:=CASE WHEN TG_OP='INSERT' THEN NULL ELSE planning.evidence_snapshot(to_jsonb(OLD)) END; effective:=NEW.due_date;
  SELECT * INTO c FROM core.command_receipt WHERE workspace_id=NEW.workspace_id AND id=NEW.command_receipt_id;
  SELECT COALESCE(sum(linked_minor::numeric),0) INTO total FROM planning.effective_occurrence_link_v WHERE workspace_id=NEW.workspace_id AND occurrence_id=NEW.id;
  IF TG_OP='INSERT' AND ((c.result_json->>'generationThrough')::date-(c.result_json->>'generationFrom')::date NOT BETWEEN 0 AND 365 OR NOT NEW.logical_date BETWEEN (c.result_json->>'generationFrom')::date AND (c.result_json->>'generationThrough')::date OR NOT c.result_json ?& ARRAY['generationFrom','generationThrough'] OR (SELECT count(*) FROM planning.expected_occurrence o WHERE o.workspace_id=NEW.workspace_id AND o.command_receipt_id=NEW.command_receipt_id)>500) THEN RAISE EXCEPTION 'generation requires an explicit bounded receipt window' USING ERRCODE='23514'; END IF;
  IF total>NEW.expected_minor OR (NEW.state='planned' AND total<>0) OR (NEW.state='linked' AND (total<=0 OR total>=NEW.expected_minor)) OR (NEW.state='completed' AND total<>NEW.expected_minor) OR (NEW.state IN('skipped','cancelled') AND total<>0) THEN RAISE EXCEPTION 'occurrence state must match exact supported links' USING ERRCODE='23514'; END IF;
 ELSE
  body:=planning.evidence_snapshot(to_jsonb(NEW)); before_body:=NULL;
  IF NEW.reverses_link_id IS NOT NULL THEN SELECT planning.evidence_snapshot(to_jsonb(l)) INTO before_body FROM planning.occurrence_actual_link l WHERE workspace_id=NEW.workspace_id AND id=NEW.reverses_link_id; END IF;
  SELECT * INTO c FROM core.command_receipt WHERE workspace_id=NEW.workspace_id AND id=NEW.command_receipt_id;
  SELECT primary_effective_date INTO effective FROM finance.action_revision WHERE workspace_id=NEW.workspace_id AND id=NEW.action_revision_id;
  IF NOT c.result_json @> jsonb_build_object('linkId',NEW.id) OR EXISTS(SELECT 1 FROM planning.effective_occurrence_link_v l LEFT JOIN planning.eligible_actual_v a ON a.workspace_id=l.workspace_id AND a.action_revision_id=l.action_revision_id WHERE l.workspace_id=NEW.workspace_id AND l.action_id=NEW.action_id GROUP BY a.action_id,a.amount_minor HAVING a.action_id IS NULL OR sum(l.linked_minor::numeric)>a.amount_minor::numeric) THEN RAISE EXCEPTION 'actual links exceed supported current financial evidence' USING ERRCODE='23514'; END IF;
 END IF;
 IF c.id IS NULL OR c.state<>'completed' OR c.retain_until IS NOT NULL OR c.command_type NOT IN('planning.definition','planning.generate','planning.archive','planning.occurrence','planning.link','planning.unlink') OR EXISTS(SELECT 1 FROM finance.action_revision a WHERE a.workspace_id=c.workspace_id AND a.command_receipt_id=c.id) THEN RAISE EXCEPTION 'planning requires completed permanent nonfinancial receipt' USING ERRCODE='23514'; END IF;
 operation:=CASE WHEN TG_TABLE_NAME='occurrence_actual_link' AND body->>'reverses_link_id' IS NOT NULL THEN 'void' WHEN before_body IS NULL THEN 'create' ELSE 'replace' END;
 IF NOT EXISTS(SELECT 1 FROM audit.private_revision a WHERE a.workspace_id=NEW.workspace_id AND a.command_receipt_id=c.id AND a.subject_kind=TG_TABLE_NAME AND a.subject_id=NEW.id AND a.subject_version=COALESCE((body->>'version')::integer,(body->>'version_no')::integer,1) AND a.operation=operation AND a.after_json=body AND a.before_json IS NOT DISTINCT FROM before_body AND a.recorded_by_user_id=(body->>'recorded_by_user_id')::uuid AND a.actor_kind='user' AND a.request_id IS NOT DISTINCT FROM (body->>'request_id')::uuid AND a.effective_date IS NOT DISTINCT FROM effective AND a.reason IS NOT DISTINCT FROM CASE WHEN c.command_type IN('planning.definition','planning.archive','planning.occurrence','planning.unlink') THEN c.result_json->>'reason' ELSE NULL END) THEN RAISE EXCEPTION 'planning requires exact attributed before/after audit evidence' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
DO $$ DECLARE relation text; BEGIN FOREACH relation IN ARRAY ARRAY['recurring_obligation','recurrence_version','expected_occurrence','occurrence_actual_link'] LOOP EXECUTE format('CREATE CONSTRAINT TRIGGER recurring_integrity AFTER INSERT OR UPDATE ON planning.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION planning.validate_evidence()',relation); END LOOP; END $$;
--> statement-breakpoint
CREATE FUNCTION planning.guard_financial_dependency() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 IF NEW.current_revision_id IS DISTINCT FROM OLD.current_revision_id AND EXISTS(SELECT 1 FROM planning.effective_occurrence_link_v l WHERE l.workspace_id=NEW.workspace_id AND l.action_id=NEW.id) THEN RAISE EXCEPTION 'RECURRING_ACTUAL_DEPENDENCY: reverse occurrence links before correcting or reversing this actual transaction' USING ERRCODE='23514'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER recurring_actual_dependency BEFORE UPDATE ON finance.financial_action FOR EACH ROW EXECUTE FUNCTION planning.guard_financial_dependency();
CREATE FUNCTION planning.guard_nonfinancial_command() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM core.command_receipt c WHERE c.workspace_id=NEW.workspace_id AND c.id=NEW.command_receipt_id AND c.command_type LIKE 'planning.%') THEN RAISE EXCEPTION 'expected activity commands cannot create financial revisions' USING ERRCODE='23514'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER action_revision_planning_command BEFORE INSERT ON finance.action_revision FOR EACH ROW EXECUTE FUNCTION planning.guard_nonfinancial_command();
REVOKE ALL ON FUNCTION planning.evidence_snapshot(jsonb),planning.recurrence_ordinal(planning.recurrence_version,date),planning.guard_evidence(),planning.validate_evidence(),planning.guard_financial_dependency(),planning.guard_nonfinancial_command() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION planning.evidence_snapshot(jsonb),planning.recurrence_ordinal(planning.recurrence_version,date),planning.guard_evidence(),planning.validate_evidence(),planning.guard_financial_dependency(),planning.guard_nonfinancial_command() TO app_domain,lifecycle_operator;
