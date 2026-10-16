-- Preserve all existing restore authority/provenance checks. Only reviewed
-- tracker tables and the closed reminder-source extension enter the graph.
DO $$ DECLARE tab text;d text;anchor text; BEGIN
 FOREACH tab IN ARRAY ARRAY['template','template_version','field_identity','field_definition','field_option','tracker','entry','entry_revision','template_migration'] LOOP
  EXECUTE format('CREATE POLICY tracker_restore ON tracker.%I TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id))',tab);
 END LOOP;
 d:=pg_get_functiondef('tracker.guard_write()'::regprocedure);
 EXECUTE regexp_replace(d,'\mBEGIN\M','BEGIN IF ops.restore_scope_allowed((CASE WHEN TG_OP=''DELETE'' THEN OLD.workspace_id ELSE NEW.workspace_id END)) THEN IF TG_OP=''DELETE'' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF;');
 -- The complete predecessor relationship stays enforced at commit even when
 -- portable rows arrive in UUID order rather than historical revision order.
 ALTER TABLE tracker.entry_revision ADD CONSTRAINT uq_tracker_revision_entry UNIQUE(workspace_id,entry_id,id);
 ALTER TABLE tracker.entry_revision ADD CONSTRAINT tracker_revision_same_entry_fk FOREIGN KEY(workspace_id,entry_id,previous_revision_id) REFERENCES tracker.entry_revision(workspace_id,entry_id,id) DEFERRABLE INITIALLY DEFERRED;
 d:=pg_get_functiondef('ops.apply_private_restore(uuid,bytea,uuid)'::regprocedure);
 anchor:='allowed text[]:=ARRAY[';
 IF strpos(d,anchor)=0 THEN RAISE EXCEPTION 'restore graph anchor unavailable'; END IF;
 d:=replace(d,anchor,anchor||'''tracker.template'',''tracker.template_version'',''tracker.field_identity'',''tracker.field_definition'',''tracker.field_option'',''tracker.tracker'',''tracker.entry'',''tracker.entry_revision'',''tracker.template_migration'',');
 d:=replace(d,'cardinality(allowed)','(cardinality(allowed)-CASE WHEN r.bundle_json->''manifest''->>''schemaFingerprint''=''404e1441be5ed0595bf71b99abb2a148a594056e47e206a6e303bc33fe5214a2'' THEN 9 ELSE 0 END)');
 anchor:='IF jsonb_array_length(r.bundle_json->''entities'')';
 IF strpos(d,anchor)=0 THEN RAISE EXCEPTION 'restore coverage anchor unavailable'; END IF;
 d:=replace(d,anchor,'IF r.bundle_json->''manifest''->>''schemaFingerprint'' NOT IN (''404e1441be5ed0595bf71b99abb2a148a594056e47e206a6e303bc33fe5214a2'',''ed30905b52c4beaba43bba6cfc9df929c1be4f660395a37e26cd969d31dea8ca'') OR (r.bundle_json->''manifest''->>''schemaFingerprint''=''404e1441be5ed0595bf71b99abb2a148a594056e47e206a6e303bc33fe5214a2'' AND EXISTS(SELECT 1 FROM jsonb_array_elements(r.bundle_json->''entities'') z WHERE z->>''kind'' LIKE ''tracker.%'')) THEN RAISE EXCEPTION ''unsupported restore graph''; END IF; '||anchor);
 anchor:='record_data:=ops.remap_owner_json(record,owner_id,scope_id);';
 IF strpos(d,anchor)=0 THEN RAISE EXCEPTION 'restore owner transform anchor unavailable'; END IF;
 d:=replace(d,anchor,$branch$
 IF name LIKE 'tracker.%' THEN record_data:=record||jsonb_build_object('workspace_id',scope_id,'recorded_by_user_id',owner_id);
 ELSE record_data:=ops.remap_owner_json(record,owner_id,scope_id); END IF;
 IF name IN ('time.reminder_rule','time.reminder_occurrence','time.source_reminder_setting') AND NOT record_data ? 'tracker_entry_id' AND r.bundle_json->'manifest'->>'schemaFingerprint'='404e1441be5ed0595bf71b99abb2a148a594056e47e206a6e303bc33fe5214a2' THEN record_data:=record_data||jsonb_build_object('tracker_entry_id',NULL); END IF;
 IF name='tracker.template_migration' AND record_data->>'state' IN ('confirmed','running','failed') THEN record_data:=jsonb_set(record_data,'{state}','"cancelled"'::jsonb); END IF;
 $branch$);
 EXECUTE d;
END $$;
