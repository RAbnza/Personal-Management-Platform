-- Extend only the existing invoker-security source projection.
DO $$ DECLARE d text; BEGIN
 d:=pg_get_viewdef('time.agenda_v'::regclass,true);
 d:=rtrim(d,E';\n ');
 EXECUTE 'CREATE OR REPLACE VIEW time.agenda_v WITH (security_invoker=true) AS '||d||$v$
 UNION ALL SELECT 'tracker_entry'::text,e.id,'entry'::text,e.title,e.notification_generation,
 'date'::text,e.deadline_date,NULL::date,NULL::timestamptz,NULL::timestamptz,NULL::text,'scheduled'::text,e.version,NULL::text
 FROM tracker.entry e JOIN tracker.tracker t ON t.workspace_id=e.workspace_id AND t.id=e.tracker_id
 WHERE e.deadline_date IS NOT NULL AND e.completed_at IS NULL AND e.archived_at IS NULL AND t.archived_at IS NULL
 $v$;
END $$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA tracker TO worker_domain;
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['entry','tracker'] LOOP
  EXECUTE format('GRANT SELECT ON tracker.%I TO worker_domain',tab);
  EXECUTE format($policy$CREATE POLICY tracker_notification_read ON tracker.%I FOR SELECT TO worker_domain USING(workspace_id=NULLIF(current_setting('app.workspace_id',true),'')::uuid AND EXISTS(SELECT 1 FROM core.workspace w JOIN core.user_profile p ON p.user_id=w.owner_user_id WHERE w.id=workspace_id AND w.owner_user_id=NULLIF(current_setting('app.user_id',true),'')::uuid AND w.state='active' AND p.lifecycle='active'))$policy$,tab);
 END LOOP;
END $$;
--> statement-breakpoint
-- Preserve old source behavior while extending the closed source union.
DO $$ DECLARE name text; d text; alias text; BEGIN
 FOREACH name IN ARRAY ARRAY['time.guard_reminder_identity','time.validate_reminder_relation','time.cancel_stale_reminders','ops.preserve_notification_effects','ops.apply_private_restore'] LOOP
  SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=split_part(name,'.',1) AND p.proname=split_part(name,'.',2);
  IF d IS NULL THEN RAISE EXCEPTION 'required source contract missing: %',name; END IF;
  IF name='time.guard_reminder_identity' THEN
   d:=replace(replace(d,'NEW.expected_occurrence_id,','NEW.expected_occurrence_id,NEW.tracker_entry_id,'),'OLD.expected_occurrence_id,','OLD.expected_occurrence_id,OLD.tracker_entry_id,');
  ELSIF name='time.validate_reminder_relation' THEN
   d:=replace(replace(d,'r.expected_occurrence_id)','r.expected_occurrence_id,r.tracker_entry_id)'),'NEW.expected_occurrence_id)','NEW.expected_occurrence_id,NEW.tracker_entry_id)');
   d:=replace(d,'ELSE ''money'' END','WHEN NEW.tracker_entry_id IS NOT NULL THEN ''trackers'' ELSE ''money'' END');
  ELSE
   -- Only the source identity branches change; recurring financial epoch logic remains intact.
   FOREACH alias IN ARRAY ARRAY['o','r'] LOOP
    d:=replace(d,'WHEN '||alias||'.card_installment_id IS NOT NULL THEN ''card_installment'' ELSE ''expected_occurrence'' END','WHEN '||alias||'.card_installment_id IS NOT NULL THEN ''card_installment'' WHEN '||alias||'.tracker_entry_id IS NOT NULL THEN ''tracker_entry'' ELSE ''expected_occurrence'' END');
    d:=replace(d,alias||'.card_installment_id,'||alias||'.expected_occurrence_id)',alias||'.card_installment_id,'||alias||'.expected_occurrence_id,'||alias||'.tracker_entry_id)');
   END LOOP;
  END IF;
  EXECUTE d;
 END LOOP;
END $$;
--> statement-breakpoint
CREATE FUNCTION tracker.lifecycle_epoch() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF ops.restore_scope_allowed(NEW.workspace_id) THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='entry' THEN
  IF NEW.archived_at IS DISTINCT FROM OLD.archived_at THEN NEW.notification_generation:=OLD.notification_generation+1; END IF;
 ELSE
  IF NEW.archived_at IS DISTINCT FROM OLD.archived_at THEN UPDATE tracker.entry SET notification_generation=notification_generation+1,version=version+1 WHERE tracker_id=NEW.id AND workspace_id=NEW.workspace_id; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION tracker.lifecycle_epoch() FROM PUBLIC;
CREATE TRIGGER tracker_entry_epoch BEFORE UPDATE ON tracker.entry FOR EACH ROW EXECUTE FUNCTION tracker.lifecycle_epoch();
CREATE TRIGGER tracker_parent_epoch AFTER UPDATE ON tracker.tracker FOR EACH ROW EXECUTE FUNCTION tracker.lifecycle_epoch();
CREATE CONSTRAINT TRIGGER tracker_entry_reminder_cancel AFTER UPDATE ON tracker.entry DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION time.cancel_stale_reminders();
CREATE CONSTRAINT TRIGGER tracker_parent_reminder_cancel AFTER UPDATE ON tracker.tracker DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION time.cancel_stale_reminders();
