DO $$ DECLARE d text;anchor text; BEGIN
 d:=pg_get_functiondef('finance.validate_private_bill_revision()'::regprocedure);
 anchor:='(paid=0 AND consumed=0) OR';
 IF strpos(d,anchor)=0 THEN RAISE EXCEPTION 'bill zero allocation anchor missing'; END IF;
 EXECUTE replace(d,anchor,'(paid=0 AND consumed=0 AND NEW.revision_no=1) OR');
 d:=pg_get_functiondef('finance.validate_group_adoption_recipe()'::regprocedure);
 d:=replace(d,'r.change_kind=''void'' OR','(r.change_kind=''void'' AND (x.paid_minor<>0 OR x.share_minor<>0 OR x.revision_no=1)) OR');
 d:=replace(d,'IF journal_count<>1 OR','IF journal_count<>(CASE WHEN x.paid_minor=0 AND x.share_minor=0 THEN 0 ELSE 1 END) OR');
 anchor:='a.transaction_date=r.primary_effective_date AND a.posting_date=d.card_posting_date AND a.provider_reference IS NOT DISTINCT FROM d.card_provider_reference';
 IF strpos(d,anchor)=0 THEN RAISE EXCEPTION 'group card activity metadata anchor missing'; END IF;
 d:=replace(d,anchor,$q$(a.transaction_date,a.posting_date,a.provider_reference) IS NOT DISTINCT FROM (SELECT coalesce(nr.primary_effective_date,pr.primary_effective_date),coalesce(nd.card_posting_date,pd.card_posting_date),CASE WHEN nd.action_revision_id IS NOT NULL THEN nd.card_provider_reference ELSE pd.card_provider_reference END FROM finance.credit_card c LEFT JOIN finance.purchase_detail nd ON nd.workspace_id=c.workspace_id AND nd.action_revision_id=r.id AND nd.funding_ledger_account_id=c.liability_ledger_account_id LEFT JOIN finance.action_revision nr ON nr.workspace_id=nd.workspace_id AND nr.id=nd.action_revision_id LEFT JOIN finance.purchase_detail pd ON pd.workspace_id=c.workspace_id AND pd.action_revision_id=r.previous_revision_id AND pd.funding_ledger_account_id=c.liability_ledger_account_id LEFT JOIN finance.action_revision pr ON pr.workspace_id=pd.workspace_id AND pr.id=pd.action_revision_id WHERE c.workspace_id=r.workspace_id AND c.id=movement.id)$q$);
 EXECUTE d;
END $$;
