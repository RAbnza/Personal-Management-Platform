-- Preserve literal dynamic values in tracker preview receipts/audits.
DO $$ DECLARE d text;anchor text; BEGIN
 d:=pg_get_functiondef('ops.apply_private_restore(uuid,bytea,uuid)'::regprocedure);
 anchor:='IF name=''tracker.template_migration''';
 IF strpos(d,anchor)=0 THEN RAISE EXCEPTION 'tracker restore evidence anchor unavailable';END IF;
 d:=replace(d,anchor,$preserve$
 IF name='core.command_receipt' AND record->>'command_type' LIKE 'tracker.%' THEN
   record_data:=jsonb_set(record_data,'{result_json}',record->'result_json');
 ELSIF name='audit.private_revision' AND record->>'subject_kind'='tracker' THEN
   record_data:=jsonb_set(jsonb_set(record_data,'{before_json}',record->'before_json'),'{after_json}',record->'after_json');
 END IF;
 IF name='tracker.template_migration'$preserve$);
 EXECUTE d;
END $$;
