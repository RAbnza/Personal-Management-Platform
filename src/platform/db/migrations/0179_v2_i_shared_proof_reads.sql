DO $$ DECLARE n text;d text;BEGIN
 FOREACH n IN ARRAY ARRAY['finance.financial_action','finance.action_revision','finance.journal','finance.posting','finance.purchase_detail','finance.card_activity','audit.private_revision','core.command_receipt'] LOOP
  EXECUTE format('CREATE POLICY shared_export_proof_read ON %s FOR SELECT TO migration_owner USING(workspace_id=NULLIF(current_setting(''app.workspace_id'',true),'''')::uuid AND EXISTS(SELECT 1 FROM core.workspace w WHERE w.id=workspace_id AND w.owner_user_id=NULLIF(current_setting(''app.user_id'',true),'''')::uuid))',n);
 END LOOP;
 d:=pg_get_functiondef('ops.bind_shared_bundle_export(uuid)'::regprocedure);
 EXECUTE replace(d,'RAISE EXCEPTION ''shared export must preserve exact existing private evidence''','RAISE EXCEPTION ''shared export must preserve exact existing private evidence: %'',name');
END $$;
