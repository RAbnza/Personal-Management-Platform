/* Keep the audit operation variable distinct from the evidence column. */
CREATE OR REPLACE FUNCTION planning.validate_evidence() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE body jsonb; before_body jsonb; c core.command_receipt%ROWTYPE; audit_operation text; effective date; p planning.recurring_obligation%ROWTYPE; r planning.recurrence_version%ROWTYPE; total numeric;
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
 audit_operation:=CASE WHEN TG_TABLE_NAME='occurrence_actual_link' AND body->>'reverses_link_id' IS NOT NULL THEN 'void' WHEN before_body IS NULL THEN 'create' ELSE 'replace' END;
 IF NOT EXISTS(SELECT 1 FROM audit.private_revision a WHERE a.workspace_id=NEW.workspace_id AND a.command_receipt_id=c.id AND a.subject_kind=TG_TABLE_NAME AND a.subject_id=NEW.id AND a.subject_version=COALESCE((body->>'version')::integer,(body->>'version_no')::integer,1) AND a.operation=audit_operation AND a.after_json=body AND a.before_json IS NOT DISTINCT FROM before_body AND a.recorded_by_user_id=(body->>'recorded_by_user_id')::uuid AND a.actor_kind='user' AND a.request_id IS NOT DISTINCT FROM (body->>'request_id')::uuid AND a.effective_date IS NOT DISTINCT FROM effective AND a.reason IS NOT DISTINCT FROM CASE WHEN c.command_type IN('planning.definition','planning.archive','planning.occurrence','planning.unlink') THEN c.result_json->>'reason' ELSE NULL END) THEN RAISE EXCEPTION 'planning requires exact attributed before/after audit evidence' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION planning.validate_evidence() FROM PUBLIC;
