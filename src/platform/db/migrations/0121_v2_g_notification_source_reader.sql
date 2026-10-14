/* Direct source identity reads in readReminderSources complement view dependencies. */
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT c.oid,n.nspname schema,c.relname name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.oid=ANY(ARRAY['finance.debt_obligation'::regclass,'finance.card_statement'::regclass,'finance.credit_card'::regclass,'finance.card_installment'::regclass,'finance.card_installment_revision'::regclass,'finance.card_installment_plan'::regclass,'planning.recurring_obligation'::regclass]) LOOP
  EXECUTE format('GRANT SELECT ON %I.%I TO worker_domain',r.schema,r.name);
  EXECUTE format('CREATE POLICY notification_source_read ON %I.%I FOR SELECT TO worker_domain USING(workspace_id=NULLIF(current_setting(''app.workspace_id'',true),'''')::uuid AND EXISTS(SELECT 1 FROM core.workspace w JOIN core.user_profile p ON p.user_id=w.owner_user_id WHERE w.id=workspace_id AND w.owner_user_id=NULLIF(current_setting(''app.user_id'',true),'''')::uuid AND w.state=''active'' AND p.lifecycle=''active''))',r.schema,r.name);
 END LOOP;
END $$;
