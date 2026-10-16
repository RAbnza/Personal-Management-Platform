/* Read-only historical group access also permits independently approved private
 * accounting. This opaque mutex grants no group mutation or data-return power. */
CREATE FUNCTION sharing.lock_private_group(g uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF NOT sharing.visible(g) THEN RAISE EXCEPTION 'group unavailable' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM sharing.expense_group WHERE id=g FOR UPDATE;
 IF NOT FOUND OR NOT sharing.visible(g) THEN RAISE EXCEPTION 'group unavailable' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION sharing.lock_private_group(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sharing.lock_private_group(uuid) TO app_domain;
DO $$ DECLARE d text;n text;anchor text;BEGIN
 FOREACH n IN ARRAY ARRAY['finance.guard_group_binding()','finance.guard_private_group_link()'] LOOP
  d:=pg_get_functiondef(n::regprocedure);anchor:='PERFORM 1 FROM sharing.expense_group WHERE id=NEW.group_id FOR UPDATE;';
  IF strpos(d,anchor)=0 THEN RAISE EXCEPTION 'private group lock anchor missing'; END IF;
  EXECUTE replace(d,anchor,'PERFORM sharing.lock_private_group(NEW.group_id);');
 END LOOP;
 d:=pg_get_functiondef('finance.guard_private_group_review()'::regprocedure);EXECUTE replace(d,'PERFORM 1 FROM sharing.expense_group WHERE id=g FOR UPDATE;','PERFORM sharing.lock_private_group(g);');
END $$;
