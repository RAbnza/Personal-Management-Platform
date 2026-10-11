/* V2-A1: identity and read foundations only. Existing financial validators
 * remain installed and unchanged. Reserved commands, activity and liability
 * postings are explicitly gated until their recipes/evidence ship. */
REVOKE ALL ON finance.credit_card, finance.card_activity
FROM PUBLIC, app_domain, auth_adapter, queue_broker, worker_domain, lifecycle_operator;
GRANT SELECT, INSERT, UPDATE ON finance.credit_card TO app_domain;
GRANT SELECT ON finance.card_activity TO app_domain;
GRANT SELECT, DELETE ON finance.credit_card, finance.card_activity TO lifecycle_operator;

ALTER TABLE finance.credit_card ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.credit_card FORCE ROW LEVEL SECURITY;
ALTER TABLE finance.card_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.card_activity FORCE ROW LEVEL SECURITY;

DO $$ DECLARE relation text; BEGIN
  FOREACH relation IN ARRAY ARRAY['credit_card', 'card_activity'] LOOP
    EXECUTE format('CREATE POLICY card_owner_access ON finance.%I TO app_domain
      USING (workspace_id = NULLIF(current_setting(''app.workspace_id'',true),'''')::uuid
        AND EXISTS (SELECT 1 FROM core.workspace w JOIN core.user_profile p ON p.user_id=w.owner_user_id
          WHERE w.id=workspace_id AND w.owner_user_id=NULLIF(current_setting(''app.user_id'',true),'''')::uuid
          AND w.state=''active'' AND p.lifecycle=''active''))
      WITH CHECK (workspace_id = NULLIF(current_setting(''app.workspace_id'',true),'''')::uuid
        AND EXISTS (SELECT 1 FROM core.workspace w JOIN core.user_profile p ON p.user_id=w.owner_user_id
          WHERE w.id=workspace_id AND w.owner_user_id=NULLIF(current_setting(''app.user_id'',true),'''')::uuid
          AND w.state=''active'' AND p.lifecycle=''active''))', relation);
    EXECUTE format('CREATE POLICY lifecycle_purge_scope ON finance.%I TO lifecycle_operator
      USING (ops.purge_scope_allowed(workspace_id))', relation);
  END LOOP;
END $$;
--> statement-breakpoint
CREATE TRIGGER a_credit_card_financial_root_guard BEFORE INSERT OR UPDATE ON finance.credit_card
FOR EACH ROW EXECUTE FUNCTION finance.guard_financial_root_write();
CREATE TRIGGER credit_card_scope_immutability BEFORE UPDATE OF id, workspace_id ON finance.credit_card
FOR EACH ROW EXECUTE FUNCTION core.enforce_private_record_scope_immutability();
CREATE TRIGGER credit_card_mutable_aggregate_update BEFORE UPDATE ON finance.credit_card
FOR EACH ROW EXECUTE FUNCTION core.apply_mutable_aggregate_update();

CREATE FUNCTION finance.guard_credit_card_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF TG_OP='UPDATE' AND (
    NEW.liability_ledger_account_id IS DISTINCT FROM OLD.liability_ledger_account_id
    OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.recorded_by_user_id IS DISTINCT FROM OLD.recorded_by_user_id
    OR NEW.actor_kind IS DISTINCT FROM OLD.actor_kind
    OR NEW.request_id IS DISTINCT FROM OLD.request_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  ) THEN
    RAISE EXCEPTION 'card accounting identity and attribution are immutable' USING ERRCODE='23514';
  END IF;
  IF TG_OP='INSERT' AND (
    NEW.version<>1 OR (NEW.recorded_by_user_id IS NOT NULL AND
      NEW.recorded_by_user_id IS DISTINCT FROM NULLIF(current_setting('app.user_id',true),'')::uuid)
  ) THEN
    RAISE EXCEPTION 'card creation requires initial version and owned attribution' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM finance.ledger_account l
    WHERE l.workspace_id=NEW.workspace_id AND l.id=NEW.liability_ledger_account_id
      AND l.currency=NEW.currency AND l.kind='card_liability') THEN
    RAISE EXCEPTION 'card requires an owned same-currency card-liability ledger' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION finance.guard_credit_card_identity() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION finance.guard_credit_card_identity() TO app_domain;
CREATE TRIGGER credit_card_identity BEFORE INSERT OR UPDATE ON finance.credit_card
FOR EACH ROW EXECUTE FUNCTION finance.guard_credit_card_identity();

/* Separate additional guard preserves all earlier cash/debt/posting protections. */
CREATE FUNCTION finance.guard_card_ledger_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF (NEW.kind IS DISTINCT FROM OLD.kind OR NEW.currency IS DISTINCT FROM OLD.currency)
    AND EXISTS (SELECT 1 FROM finance.credit_card c WHERE c.workspace_id=OLD.workspace_id
      AND c.liability_ledger_account_id=OLD.id) THEN
    RAISE EXCEPTION 'bound card ledger kind/currency is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION finance.guard_card_ledger_identity() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION finance.guard_card_ledger_identity() TO app_domain;
CREATE TRIGGER ledger_account_card_identity BEFORE UPDATE OF kind,currency ON finance.ledger_account
FOR EACH ROW EXECUTE FUNCTION finance.guard_card_ledger_identity();
--> statement-breakpoint
/* Metadata is versioned, audited and attached to a completed permanent receipt.
 * No journal or opening amount is created by card creation. */
CREATE FUNCTION finance.validate_credit_card_audit() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM finance.credit_card WHERE workspace_id=NEW.workspace_id AND id=NEW.id) THEN
    RETURN NULL; -- the separate approved whole-workspace purge removed the graph
  END IF;
  IF NOT EXISTS (SELECT 1 FROM audit.private_revision a
    JOIN core.command_receipt r ON r.workspace_id=a.workspace_id AND r.id=a.command_receipt_id
    WHERE a.workspace_id=NEW.workspace_id AND a.subject_kind='credit_card' AND a.subject_id=NEW.id
      AND a.subject_version=NEW.version AND a.operation=CASE WHEN TG_OP='INSERT' THEN 'create' ELSE 'update' END
      AND a.recorded_by_user_id=NULLIF(current_setting('app.user_id',true),'')::uuid
      AND a.actor_kind='user' AND r.state='completed' AND r.retain_until IS NULL
      AND a.after_json @> jsonb_build_object(
        'liabilityLedgerAccountId',NEW.liability_ledger_account_id,
        'name',NEW.name,'issuerName',NEW.issuer_name,'currency',NEW.currency,
        'creditLimitMinor',NEW.credit_limit_minor::text,'limitVerifiedDate',NEW.limit_verified_date::text,
        'notes',NEW.notes,'archived',NEW.archived_at IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'card metadata requires matching audit and completed permanent command' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION finance.validate_credit_card_audit() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION finance.validate_credit_card_audit() TO app_domain;
CREATE CONSTRAINT TRIGGER credit_card_audit_integrity AFTER INSERT OR UPDATE ON finance.credit_card
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION finance.validate_credit_card_audit();
--> statement-breakpoint
CREATE FUNCTION finance.guard_unreleased_card_action() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF NEW.action_kind IN ('opening_card','card_purchase','card_payment','card_fee','card_interest','card_refund','card_adjustment') THEN
    RAISE EXCEPTION 'card financial command is not enabled' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION finance.guard_unreleased_card_action() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION finance.guard_unreleased_card_action() TO app_domain;
CREATE TRIGGER action_revision_unreleased_card_guard BEFORE INSERT OR UPDATE ON finance.action_revision
FOR EACH ROW EXECUTE FUNCTION finance.guard_unreleased_card_action();

CREATE FUNCTION finance.guard_unreleased_card_posting() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM finance.ledger_account l WHERE l.workspace_id=NEW.workspace_id
    AND l.id=NEW.ledger_account_id AND l.kind='card_liability') THEN
    RAISE EXCEPTION 'card liability posting is not enabled' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION finance.guard_unreleased_card_posting() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION finance.guard_unreleased_card_posting() TO app_domain;
CREATE TRIGGER posting_unreleased_card_guard BEFORE INSERT ON finance.posting
FOR EACH ROW EXECUTE FUNCTION finance.guard_unreleased_card_posting();

CREATE FUNCTION finance.guard_unreleased_card_activity() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF TG_OP='DELETE' AND current_user='lifecycle_operator' AND ops.purge_scope_allowed(OLD.workspace_id) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'card activity is not enabled' USING ERRCODE='23514';
END $$;
REVOKE ALL ON FUNCTION finance.guard_unreleased_card_activity() FROM PUBLIC;
CREATE TRIGGER card_activity_unreleased_guard BEFORE INSERT OR UPDATE OR DELETE ON finance.card_activity
FOR EACH ROW EXECUTE FUNCTION finance.guard_unreleased_card_activity();
