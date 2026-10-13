/* Category identity changes cannot invalidate a budget's expense classification.
 * Name/archive changes retain history and invalidate read metadata only. */
CREATE FUNCTION planning.guard_budget_category() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 IF ROW(NEW.kind,NEW.name,NEW.archived_at) IS DISTINCT FROM ROW(OLD.kind,OLD.name,OLD.archived_at) THEN
  PERFORM finance.lock_active_workspace(NEW.workspace_id);
  IF NEW.kind<>'expense' AND EXISTS(SELECT 1 FROM planning.budget WHERE workspace_id=NEW.workspace_id AND category_id=NEW.id) THEN RAISE EXCEPTION 'budget category must remain an expense category' USING ERRCODE='23514'; END IF;
  UPDATE core.workspace SET financial_revision=financial_revision+1 WHERE id=NEW.workspace_id;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER category_budget_dependencies BEFORE UPDATE OF kind,name,archived_at ON core.category FOR EACH ROW EXECUTE FUNCTION planning.guard_budget_category();
REVOKE ALL ON FUNCTION planning.guard_budget_category() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION planning.guard_budget_category() TO app_domain;
