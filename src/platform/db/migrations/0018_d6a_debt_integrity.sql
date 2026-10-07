/*
 * D6a coherent-V1 debt security and integrity foundation.
 *
 * 0017 introduces the structural debt tables and the minimum enum/check
 * expansions required by the first debt release.
 *
 * This migration adds the database behavior that is intentionally kept
 * outside Drizzle's declarative schema:
 *
 * - runtime privileges and FORCE RLS
 * - workspace serialization for debt writes
 * - debt ledger semantic binding
 * - immutable debt evidence
 * - debt mutable-aggregate behavior
 * - deferred current-schedule ownership/pointer integrity
 * - finalized immutable schedule versions
 * - append-only installment evidence
 * - opening-debt financial recipe validation
 * - debt-liability posting classification
 * - recognized-liability validation before debt closure
 *
 * D6a deliberately does not enable borrowing, debt-payment, settlement,
 * payment-allocation, or reclassification action kinds. Those arrive with
 * their typed evidence and command workflows.
 */

/*
 * ---------------------------------------------------------------------------
 * Runtime privileges
 * ---------------------------------------------------------------------------
 */

REVOKE ALL PRIVILEGES
ON TABLE
  "finance"."debt",
  "finance"."debt_action_link",
  "finance"."debt_obligation",
  "finance"."debt_schedule_version",
  "finance"."scheduled_installment"
FROM PUBLIC;

REVOKE ALL PRIVILEGES
ON TABLE
  "finance"."debt",
  "finance"."debt_action_link",
  "finance"."debt_obligation",
  "finance"."debt_schedule_version",
  "finance"."scheduled_installment"
FROM
  app_domain,
  auth_adapter,
  queue_broker,
  worker_domain,
  lifecycle_operator;

/*
 * Debt is a mutable aggregate.
 *
 * A schedule-version row is mutable only for its controlled
 * building -> finalized transition.
 */
GRANT SELECT, INSERT, UPDATE
ON TABLE
  "finance"."debt",
  "finance"."debt_schedule_version"
TO app_domain;

/*
 * The remaining D6a rows are append-only evidence.
 */
GRANT SELECT, INSERT
ON TABLE
  "finance"."debt_action_link",
  "finance"."debt_obligation",
  "finance"."scheduled_installment"
TO app_domain;

/*
 * ---------------------------------------------------------------------------
 * Additional structural integrity
 * ---------------------------------------------------------------------------
 */

ALTER TABLE "finance"."debt"
ADD CONSTRAINT "ck_debt_distinct_ledgers"
CHECK (
  "clearing_ledger_account_id" IS NULL
  OR "clearing_ledger_account_id" <> "liability_ledger_account_id"
);

/*
 * debt.current_schedule_version_id intentionally forms a forward relationship
 * with debt_schedule_version.
 *
 * A debt and its first schedule may therefore be assembled atomically using
 * preallocated UUIDs. The pointer must always identify a version belonging to
 * the same debt.
 */
ALTER TABLE "finance"."debt"
ADD CONSTRAINT "fk_debt_current_schedule_version"
FOREIGN KEY (
  "workspace_id",
  "id",
  "current_schedule_version_id"
)
REFERENCES "finance"."debt_schedule_version" (
  "workspace_id",
  "debt_id",
  "id"
)
ON DELETE RESTRICT
ON UPDATE RESTRICT
DEFERRABLE INITIALLY DEFERRED;

/*
 * A schedule revision may reference only a prior version for the same debt.
 */
ALTER TABLE "finance"."debt_schedule_version"
ADD CONSTRAINT "fk_debt_schedule_previous_version"
FOREIGN KEY (
  "workspace_id",
  "debt_id",
  "previous_version_id"
)
REFERENCES "finance"."debt_schedule_version" (
  "workspace_id",
  "debt_id",
  "id"
)
ON DELETE RESTRICT
ON UPDATE RESTRICT;

CREATE INDEX "ix_debt_current_schedule"
ON "finance"."debt" (
  "workspace_id",
  "current_schedule_version_id"
)
WHERE "current_schedule_version_id" IS NOT NULL;

CREATE INDEX "ix_debt_action_link_revision"
ON "finance"."debt_action_link" (
  "workspace_id",
  "action_revision_id"
);

CREATE INDEX "ix_debt_obligation_debt"
ON "finance"."debt_obligation" (
  "workspace_id",
  "debt_id",
  "id"
);

CREATE INDEX "ix_scheduled_installment_obligation"
ON "finance"."scheduled_installment" (
  "workspace_id",
  "debt_id",
  "obligation_id"
);

CREATE INDEX "ix_debt_recorded_by"
ON "finance"."debt" ("recorded_by_user_id")
WHERE "recorded_by_user_id" IS NOT NULL;

CREATE INDEX "ix_debt_obligation_recorded_by"
ON "finance"."debt_obligation" ("recorded_by_user_id")
WHERE "recorded_by_user_id" IS NOT NULL;

CREATE INDEX "ix_debt_schedule_version_recorded_by"
ON "finance"."debt_schedule_version" ("recorded_by_user_id")
WHERE "recorded_by_user_id" IS NOT NULL;

/*
 * ---------------------------------------------------------------------------
 * Debt aggregate identity and attribution
 * ---------------------------------------------------------------------------
 */

CREATE TRIGGER "debt_scope_immutability"
BEFORE UPDATE OF "id", "workspace_id"
ON "finance"."debt"
FOR EACH ROW
EXECUTE FUNCTION "core"."enforce_private_record_scope_immutability"();

CREATE FUNCTION "finance"."enforce_debt_attribution_immutability"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.recorded_by_user_id IS DISTINCT FROM OLD.recorded_by_user_id THEN
    RAISE EXCEPTION
      'finance.debt.recorded_by_user_id is immutable'
      USING ERRCODE = '22023';
  END IF;

  IF NEW.actor_kind IS DISTINCT FROM OLD.actor_kind THEN
    RAISE EXCEPTION
      'finance.debt.actor_kind is immutable'
      USING ERRCODE = '22023';
  END IF;

  IF NEW.request_id IS DISTINCT FROM OLD.request_id THEN
    RAISE EXCEPTION
      'finance.debt.request_id is immutable'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION "finance"."enforce_debt_attribution_immutability"()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION "finance"."enforce_debt_attribution_immutability"()
TO app_domain;

CREATE TRIGGER "debt_attribution_immutability"
BEFORE UPDATE OF
  "recorded_by_user_id",
  "actor_kind",
  "request_id"
ON "finance"."debt"
FOR EACH ROW
EXECUTE FUNCTION "finance"."enforce_debt_attribution_immutability"();

/*
 * The debt currency and liability ledger establish historical accounting
 * identity and therefore cannot be switched to another bucket in place.
 *
 * A clearing ledger is optional and may be attached later when an actual
 * unknown-allocation workflow requires it, but once attached it cannot be
 * silently replaced or removed.
 *
 * The imported opening cutoff may not be rewritten after an opening-debt
 * revision has been attached. A future cutoff correction requires an explicit
 * reviewed baseline-correction workflow.
 */
CREATE FUNCTION "finance"."enforce_debt_accounting_identity"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.currency IS DISTINCT FROM OLD.currency THEN
    RAISE EXCEPTION
      'debt currency is immutable'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.liability_ledger_account_id
      IS DISTINCT FROM OLD.liability_ledger_account_id THEN
    RAISE EXCEPTION
      'debt liability ledger binding is immutable'
      USING ERRCODE = '23514';
  END IF;

  IF OLD.clearing_ledger_account_id IS NOT NULL
    AND NEW.clearing_ledger_account_id
      IS DISTINCT FROM OLD.clearing_ledger_account_id
  THEN
    RAISE EXCEPTION
      'existing debt clearing ledger binding is immutable'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.opening_cutoff_date IS DISTINCT FROM OLD.opening_cutoff_date
    AND EXISTS (
      SELECT 1
      FROM "finance"."debt_action_link" AS link
      WHERE
        link."workspace_id" = OLD.workspace_id
        AND link."debt_id" = OLD.id
        AND link."purpose" = 'opening'
    )
  THEN
    RAISE EXCEPTION
      'debt opening cutoff cannot change after opening-debt evidence exists'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION "finance"."enforce_debt_accounting_identity"()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION "finance"."enforce_debt_accounting_identity"()
TO app_domain;

CREATE TRIGGER "debt_accounting_identity"
BEFORE UPDATE OF
  "currency",
  "liability_ledger_account_id",
  "clearing_ledger_account_id",
  "opening_cutoff_date"
ON "finance"."debt"
FOR EACH ROW
EXECUTE FUNCTION "finance"."enforce_debt_accounting_identity"();

CREATE TRIGGER "debt_mutable_aggregate_update"
BEFORE UPDATE
ON "finance"."debt"
FOR EACH ROW
EXECUTE FUNCTION "core"."apply_mutable_aggregate_update"();

/*
 * ---------------------------------------------------------------------------
 * Debt ledger semantic binding
 * ---------------------------------------------------------------------------
 */

CREATE FUNCTION "finance"."validate_debt_ledger_binding"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  v_liability_kind text;
  v_clearing_kind text;
BEGIN
  SELECT ledger."kind"
  INTO v_liability_kind
  FROM "finance"."ledger_account" AS ledger
  WHERE
    ledger."workspace_id" = NEW.workspace_id
    AND ledger."id" = NEW.liability_ledger_account_id
    AND ledger."currency" = NEW.currency;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'debt liability ledger does not exist in the active scope/currency'
      USING ERRCODE = '23503';
  END IF;

  IF v_liability_kind <> 'debt_liability' THEN
    RAISE EXCEPTION
      'debt liability ledger must have debt_liability kind'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.clearing_ledger_account_id IS NOT NULL THEN
    IF NEW.clearing_ledger_account_id = NEW.liability_ledger_account_id THEN
      RAISE EXCEPTION
        'debt liability and payment-clearing ledgers must be distinct'
        USING ERRCODE = '23514';
    END IF;

    SELECT ledger."kind"
    INTO v_clearing_kind
    FROM "finance"."ledger_account" AS ledger
    WHERE
      ledger."workspace_id" = NEW.workspace_id
      AND ledger."id" = NEW.clearing_ledger_account_id
      AND ledger."currency" = NEW.currency;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'debt clearing ledger does not exist in the active scope/currency'
        USING ERRCODE = '23503';
    END IF;

    IF v_clearing_kind <> 'payment_clearing_asset' THEN
      RAISE EXCEPTION
        'debt clearing ledger must have payment_clearing_asset kind'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION "finance"."validate_debt_ledger_binding"()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION "finance"."validate_debt_ledger_binding"()
TO app_domain;

CREATE TRIGGER "debt_ledger_binding_validation"
BEFORE INSERT OR UPDATE OF
  "liability_ledger_account_id",
  "clearing_ledger_account_id",
  "currency"
ON "finance"."debt"
FOR EACH ROW
EXECUTE FUNCTION "finance"."validate_debt_ledger_binding"();

/*
 * Existing ledger identity protection must now consider debt bindings even
 * before a posting happens. In particular, a future payment-clearing ledger
 * cannot be repurposed merely because it has not yet received a posting.
 */
CREATE OR REPLACE FUNCTION "finance"."enforce_referenced_ledger_identity"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.kind IS NOT DISTINCT FROM OLD.kind
    AND NEW.currency IS NOT DISTINCT FROM OLD.currency
  THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "finance"."financial_account" AS account
    WHERE
      account."workspace_id" = OLD.workspace_id
      AND account."ledger_account_id" = OLD.id
  )
  OR EXISTS (
    SELECT 1
    FROM "finance"."posting" AS posting
    WHERE
      posting."workspace_id" = OLD.workspace_id
      AND posting."ledger_account_id" = OLD.id
  )
  OR EXISTS (
    SELECT 1
    FROM "finance"."debt" AS debt
    WHERE
      debt."workspace_id" = OLD.workspace_id
      AND (
        debt."liability_ledger_account_id" = OLD.id
        OR debt."clearing_ledger_account_id" = OLD.id
      )
  )
  THEN
    RAISE EXCEPTION
      'referenced ledger account kind/currency is immutable'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

/*
 * ---------------------------------------------------------------------------
 * Financial workspace serialization
 * ---------------------------------------------------------------------------
 *
 * Debt mutations participate in the same serialized financial-write protocol
 * as existing account/action writes.
 */

CREATE TRIGGER "debt_financial_root_guard"
BEFORE INSERT OR UPDATE
ON "finance"."debt"
FOR EACH ROW
EXECUTE FUNCTION "finance"."guard_financial_root_write"();

CREATE TRIGGER "debt_obligation_financial_root_guard"
BEFORE INSERT
ON "finance"."debt_obligation"
FOR EACH ROW
EXECUTE FUNCTION "finance"."guard_financial_root_write"();

CREATE TRIGGER "debt_schedule_version_financial_root_guard"
BEFORE INSERT OR UPDATE
ON "finance"."debt_schedule_version"
FOR EACH ROW
EXECUTE FUNCTION "finance"."guard_financial_root_write"();

/*
 * debt_action_link is revision-scoped typed evidence.
 *
 * The action revision must still be building, and its action kind must match
 * the debt-link purpose.
 */
CREATE FUNCTION "finance"."guard_debt_action_link_parent"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  v_state text;
  v_action_kind text;
  v_expected_action_kind text;
BEGIN
  PERFORM "finance"."lock_active_workspace"(NEW.workspace_id);

  SELECT
    revision."state",
    revision."action_kind"
  INTO
    v_state,
    v_action_kind
  FROM "finance"."action_revision" AS revision
  WHERE
    revision."workspace_id" = NEW.workspace_id
    AND revision."action_id" = NEW.action_id
    AND revision."id" = NEW.action_revision_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'debt action link revision does not exist in the active scope'
      USING ERRCODE = '23503';
  END IF;

  IF v_state <> 'building' THEN
    RAISE EXCEPTION
      'cannot append debt evidence to a finalized action revision'
      USING ERRCODE = '23514';
  END IF;

  v_expected_action_kind :=
    CASE NEW.purpose
      WHEN 'opening' THEN 'opening_debt'
      WHEN 'borrowing' THEN 'borrowing'
      WHEN 'purchase' THEN 'financed_purchase'
      WHEN 'charge' THEN 'debt_charge'
      WHEN 'payment' THEN 'debt_payment'
      WHEN 'settlement' THEN 'debt_settlement'
      WHEN 'waiver' THEN 'liability_waiver'
      WHEN 'reclassification' THEN 'payment_reclassification'
      ELSE NULL
    END;

  IF v_expected_action_kind IS NULL
    OR v_action_kind IS DISTINCT FROM v_expected_action_kind
  THEN
    RAISE EXCEPTION
      'debt action-link purpose does not match its financial action kind'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION "finance"."guard_debt_action_link_parent"()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION "finance"."guard_debt_action_link_parent"()
TO app_domain;

CREATE TRIGGER "debt_action_link_parent_guard"
BEFORE INSERT
ON "finance"."debt_action_link"
FOR EACH ROW
EXECUTE FUNCTION "finance"."guard_debt_action_link_parent"();

/*
 * ---------------------------------------------------------------------------
 * Append-only debt evidence
 * ---------------------------------------------------------------------------
 */

CREATE FUNCTION "finance"."enforce_debt_append_only_evidence"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  /*
   * Whole-workspace lifecycle purge remains the explicit evidence-retention
   * exception, consistent with the existing private-domain contracts.
   */
  IF current_user = 'lifecycle_operator'
    AND TG_OP = 'DELETE'
  THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION
    'debt evidence is immutable; append a new reviewed version instead'
    USING ERRCODE = '23514';
END;
$$;

REVOKE ALL
ON FUNCTION "finance"."enforce_debt_append_only_evidence"()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION "finance"."enforce_debt_append_only_evidence"()
TO app_domain;

CREATE TRIGGER "debt_action_link_immutability"
BEFORE UPDATE OR DELETE
ON "finance"."debt_action_link"
FOR EACH ROW
EXECUTE FUNCTION "finance"."enforce_debt_append_only_evidence"();

CREATE TRIGGER "debt_obligation_immutability"
BEFORE UPDATE OR DELETE
ON "finance"."debt_obligation"
FOR EACH ROW
EXECUTE FUNCTION "finance"."enforce_debt_append_only_evidence"();

CREATE TRIGGER "scheduled_installment_immutability"
BEFORE UPDATE OR DELETE
ON "finance"."scheduled_installment"
FOR EACH ROW
EXECUTE FUNCTION "finance"."enforce_debt_append_only_evidence"();

/*
 * ---------------------------------------------------------------------------
 * Debt schedule state machine
 * ---------------------------------------------------------------------------
 *
 * A schedule version is assembled in building state and receives one ordinary
 * update: building -> finalized.
 *
 * Its terms cannot be rewritten after INSERT. Corrections create another
 * immutable schedule version.
 */

CREATE FUNCTION "finance"."enforce_debt_schedule_version_state_machine"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'building'
      OR NEW.finalized_at IS NOT NULL
    THEN
      RAISE EXCEPTION
        'debt schedule version must be inserted in building state'
        USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF current_user = 'lifecycle_operator' THEN
      RETURN OLD;
    END IF;

    RAISE EXCEPTION
      'ordinary deletion of debt schedule versions is prohibited'
      USING ERRCODE = '42501';
  END IF;

  IF OLD.state = 'finalized' THEN
    RAISE EXCEPTION
      'finalized debt schedule versions are immutable'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
    OR NEW.debt_id IS DISTINCT FROM OLD.debt_id
    OR NEW.version_no IS DISTINCT FROM OLD.version_no
    OR NEW.previous_version_id IS DISTINCT FROM OLD.previous_version_id
    OR NEW.effective_date IS DISTINCT FROM OLD.effective_date
    OR NEW.revision_kind IS DISTINCT FROM OLD.revision_kind
    OR NEW.reason IS DISTINCT FROM OLD.reason
    OR NEW.frequency IS DISTINCT FROM OLD.frequency
    OR NEW.recorded_by_user_id IS DISTINCT FROM OLD.recorded_by_user_id
    OR NEW.actor_kind IS DISTINCT FROM OLD.actor_kind
    OR NEW.request_id IS DISTINCT FROM OLD.request_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION
      'debt schedule fields cannot be rewritten after creation'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.state <> 'finalized'
    OR NEW.finalized_at IS NULL
  THEN
    RAISE EXCEPTION
      'debt schedule update must finalize building -> finalized'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION "finance"."enforce_debt_schedule_version_state_machine"()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION "finance"."enforce_debt_schedule_version_state_machine"()
TO app_domain;

CREATE TRIGGER "debt_schedule_version_state_machine"
BEFORE INSERT OR UPDATE OR DELETE
ON "finance"."debt_schedule_version"
FOR EACH ROW
EXECUTE FUNCTION "finance"."enforce_debt_schedule_version_state_machine"();

/*
 * Installments may be appended only while their parent schedule is building.
 */
CREATE FUNCTION "finance"."guard_scheduled_installment_parent"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  v_state text;
BEGIN
  PERFORM "finance"."lock_active_workspace"(NEW.workspace_id);

  SELECT schedule."state"
  INTO v_state
  FROM "finance"."debt_schedule_version" AS schedule
  WHERE
    schedule."workspace_id" = NEW.workspace_id
    AND schedule."debt_id" = NEW.debt_id
    AND schedule."id" = NEW.schedule_version_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'scheduled installment parent does not exist in the active scope'
      USING ERRCODE = '23503';
  END IF;

  IF v_state <> 'building' THEN
    RAISE EXCEPTION
      'cannot append installments to a finalized debt schedule'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION "finance"."guard_scheduled_installment_parent"()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION "finance"."guard_scheduled_installment_parent"()
TO app_domain;

CREATE TRIGGER "scheduled_installment_parent_guard"
BEFORE INSERT
ON "finance"."scheduled_installment"
FOR EACH ROW
EXECUTE FUNCTION "finance"."guard_scheduled_installment_parent"();

/*
 * Every schedule version that survives commit is finalized.
 *
 * Version 1 is the initial schedule. Later versions must point to the
 * immediately preceding finalized version for the same debt.
 */
CREATE FUNCTION "finance"."validate_committed_debt_schedule_version"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  v_schedule "finance"."debt_schedule_version"%ROWTYPE;

  v_previous_version_no integer;
  v_previous_state text;

  v_installment_count bigint;

  v_opening_cutoff_date date;
BEGIN
  SELECT schedule.*
  INTO v_schedule
  FROM "finance"."debt_schedule_version" AS schedule
  WHERE
    schedule."workspace_id" = NEW.workspace_id
    AND schedule."id" = NEW.id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_schedule.state <> 'finalized'
    OR v_schedule.finalized_at IS NULL
  THEN
    RAISE EXCEPTION
      'committed debt schedule version must be finalized'
      USING ERRCODE = '23514';
  END IF;

  IF v_schedule.version_no = 1 THEN
    IF v_schedule.previous_version_id IS NOT NULL
      OR v_schedule.revision_kind <> 'initial'
    THEN
      RAISE EXCEPTION
        'initial debt schedule must be version 1 with no predecessor'
        USING ERRCODE = '23514';
    END IF;
  ELSE
    IF v_schedule.previous_version_id IS NULL
      OR v_schedule.revision_kind = 'initial'
    THEN
      RAISE EXCEPTION
        'later debt schedule versions require a non-initial predecessor'
        USING ERRCODE = '23514';
    END IF;

    SELECT
      previous."version_no",
      previous."state"
    INTO
      v_previous_version_no,
      v_previous_state
    FROM "finance"."debt_schedule_version" AS previous
    WHERE
      previous."workspace_id" = v_schedule.workspace_id
      AND previous."debt_id" = v_schedule.debt_id
      AND previous."id" = v_schedule.previous_version_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'debt schedule predecessor does not exist'
        USING ERRCODE = '23514';
    END IF;

    IF v_previous_version_no <> v_schedule.version_no - 1 THEN
      RAISE EXCEPTION
        'debt schedule must reference the immediately preceding version'
        USING ERRCODE = '23514';
    END IF;

    IF v_previous_state <> 'finalized' THEN
      RAISE EXCEPTION
        'debt schedule predecessor must already be finalized'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  SELECT count(*)
  INTO v_installment_count
  FROM "finance"."scheduled_installment" AS installment
  WHERE
    installment."workspace_id" = v_schedule.workspace_id
    AND installment."debt_id" = v_schedule.debt_id
    AND installment."schedule_version_id" = v_schedule.id;

  IF v_installment_count < 1 THEN
    RAISE EXCEPTION
      'finalized debt schedule requires at least one installment'
      USING ERRCODE = '23514';
  END IF;

  SELECT debt."opening_cutoff_date"
  INTO v_opening_cutoff_date
  FROM "finance"."debt" AS debt
  WHERE
    debt."workspace_id" = v_schedule.workspace_id
    AND debt."id" = v_schedule.debt_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'debt schedule parent does not exist'
      USING ERRCODE = '23503';
  END IF;

  /*
   * opening_satisfied is imported historical evidence. A debt with no opening
   * cutoff represents a newly originated debt and therefore cannot begin with
   * already-satisfied contractual amounts.
   */
  IF v_opening_cutoff_date IS NULL
    AND EXISTS (
      SELECT 1
      FROM "finance"."scheduled_installment" AS installment
      WHERE
        installment."workspace_id" = v_schedule.workspace_id
        AND installment."debt_id" = v_schedule.debt_id
        AND installment."schedule_version_id" = v_schedule.id
        AND installment."opening_satisfied_minor" <> 0
    )
  THEN
    RAISE EXCEPTION
      'newly originated debt schedules cannot contain opening-satisfied amounts'
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL
ON FUNCTION "finance"."validate_committed_debt_schedule_version"()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION "finance"."validate_committed_debt_schedule_version"()
TO app_domain;

CREATE CONSTRAINT TRIGGER "debt_schedule_version_commit_integrity"
AFTER INSERT OR UPDATE
ON "finance"."debt_schedule_version"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "finance"."validate_committed_debt_schedule_version"();

/*
 * debt.current_schedule_version_id is the only authoritative active schedule
 * pointer. It must equal the highest finalized version for the debt.
 */
CREATE FUNCTION "finance"."validate_debt_current_schedule"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  v_workspace_id uuid;
  v_debt_id uuid;

  v_current_schedule_version_id uuid;
  v_highest_schedule_version_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'debt' THEN
    v_workspace_id := NEW.workspace_id;
    v_debt_id := NEW.id;
  ELSE
    v_workspace_id := NEW.workspace_id;
    v_debt_id := NEW.debt_id;
  END IF;

  SELECT debt."current_schedule_version_id"
  INTO v_current_schedule_version_id
  FROM "finance"."debt" AS debt
  WHERE
    debt."workspace_id" = v_workspace_id
    AND debt."id" = v_debt_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT schedule."id"
  INTO v_highest_schedule_version_id
  FROM "finance"."debt_schedule_version" AS schedule
  WHERE
    schedule."workspace_id" = v_workspace_id
    AND schedule."debt_id" = v_debt_id
    AND schedule."state" = 'finalized'
  ORDER BY
    schedule."version_no" DESC,
    schedule."id" DESC
  LIMIT 1;

  IF v_highest_schedule_version_id IS NULL THEN
    IF v_current_schedule_version_id IS NOT NULL THEN
      RAISE EXCEPTION
        'debt current schedule pointer requires a finalized schedule version'
        USING ERRCODE = '23514';
    END IF;

    RETURN NULL;
  END IF;

  IF v_current_schedule_version_id
      IS DISTINCT FROM v_highest_schedule_version_id
  THEN
    RAISE EXCEPTION
      'debt current schedule must reference the highest finalized version'
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL
ON FUNCTION "finance"."validate_debt_current_schedule"()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION "finance"."validate_debt_current_schedule"()
TO app_domain;

CREATE CONSTRAINT TRIGGER "debt_current_schedule_integrity"
AFTER INSERT OR UPDATE
ON "finance"."debt"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "finance"."validate_debt_current_schedule"();

CREATE CONSTRAINT TRIGGER "debt_schedule_current_pointer_integrity"
AFTER INSERT OR UPDATE
ON "finance"."debt_schedule_version"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "finance"."validate_debt_current_schedule"();

/*
 * ---------------------------------------------------------------------------
 * Row-level security
 * ---------------------------------------------------------------------------
 */

ALTER TABLE "finance"."debt"
ENABLE ROW LEVEL SECURITY;

ALTER TABLE "finance"."debt"
FORCE ROW LEVEL SECURITY;

ALTER TABLE "finance"."debt_action_link"
ENABLE ROW LEVEL SECURITY;

ALTER TABLE "finance"."debt_action_link"
FORCE ROW LEVEL SECURITY;

ALTER TABLE "finance"."debt_obligation"
ENABLE ROW LEVEL SECURITY;

ALTER TABLE "finance"."debt_obligation"
FORCE ROW LEVEL SECURITY;

ALTER TABLE "finance"."debt_schedule_version"
ENABLE ROW LEVEL SECURITY;

ALTER TABLE "finance"."debt_schedule_version"
FORCE ROW LEVEL SECURITY;

ALTER TABLE "finance"."scheduled_installment"
ENABLE ROW LEVEL SECURITY;

ALTER TABLE "finance"."scheduled_installment"
FORCE ROW LEVEL SECURITY;

CREATE POLICY "debt_owner_access"
ON "finance"."debt"
FOR ALL
TO app_domain
USING (
  "workspace_id" =
    NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "core"."workspace" AS workspace
    WHERE
      workspace."id" =
        NULLIF(current_setting('app.workspace_id', true), '')::uuid
      AND workspace."owner_user_id" =
        NULLIF(current_setting('app.user_id', true), '')::uuid
      AND workspace."state" = 'active'
  )
)
WITH CHECK (
  "workspace_id" =
    NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "core"."workspace" AS workspace
    WHERE
      workspace."id" =
        NULLIF(current_setting('app.workspace_id', true), '')::uuid
      AND workspace."owner_user_id" =
        NULLIF(current_setting('app.user_id', true), '')::uuid
      AND workspace."state" = 'active'
  )
);

CREATE POLICY "debt_action_link_owner_access"
ON "finance"."debt_action_link"
FOR ALL
TO app_domain
USING (
  "workspace_id" =
    NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "core"."workspace" AS workspace
    WHERE
      workspace."id" =
        NULLIF(current_setting('app.workspace_id', true), '')::uuid
      AND workspace."owner_user_id" =
        NULLIF(current_setting('app.user_id', true), '')::uuid
      AND workspace."state" = 'active'
  )
)
WITH CHECK (
  "workspace_id" =
    NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "core"."workspace" AS workspace
    WHERE
      workspace."id" =
        NULLIF(current_setting('app.workspace_id', true), '')::uuid
      AND workspace."owner_user_id" =
        NULLIF(current_setting('app.user_id', true), '')::uuid
      AND workspace."state" = 'active'
  )
);

CREATE POLICY "debt_obligation_owner_access"
ON "finance"."debt_obligation"
FOR ALL
TO app_domain
USING (
  "workspace_id" =
    NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "core"."workspace" AS workspace
    WHERE
      workspace."id" =
        NULLIF(current_setting('app.workspace_id', true), '')::uuid
      AND workspace."owner_user_id" =
        NULLIF(current_setting('app.user_id', true), '')::uuid
      AND workspace."state" = 'active'
  )
)
WITH CHECK (
  "workspace_id" =
    NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "core"."workspace" AS workspace
    WHERE
      workspace."id" =
        NULLIF(current_setting('app.workspace_id', true), '')::uuid
      AND workspace."owner_user_id" =
        NULLIF(current_setting('app.user_id', true), '')::uuid
      AND workspace."state" = 'active'
  )
);

CREATE POLICY "debt_schedule_version_owner_access"
ON "finance"."debt_schedule_version"
FOR ALL
TO app_domain
USING (
  "workspace_id" =
    NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "core"."workspace" AS workspace
    WHERE
      workspace."id" =
        NULLIF(current_setting('app.workspace_id', true), '')::uuid
      AND workspace."owner_user_id" =
        NULLIF(current_setting('app.user_id', true), '')::uuid
      AND workspace."state" = 'active'
  )
)
WITH CHECK (
  "workspace_id" =
    NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "core"."workspace" AS workspace
    WHERE
      workspace."id" =
        NULLIF(current_setting('app.workspace_id', true), '')::uuid
      AND workspace."owner_user_id" =
        NULLIF(current_setting('app.user_id', true), '')::uuid
      AND workspace."state" = 'active'
  )
);

CREATE POLICY "scheduled_installment_owner_access"
ON "finance"."scheduled_installment"
FOR ALL
TO app_domain
USING (
  "workspace_id" =
    NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "core"."workspace" AS workspace
    WHERE
      workspace."id" =
        NULLIF(current_setting('app.workspace_id', true), '')::uuid
      AND workspace."owner_user_id" =
        NULLIF(current_setting('app.user_id', true), '')::uuid
      AND workspace."state" = 'active'
  )
)
WITH CHECK (
  "workspace_id" =
    NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "core"."workspace" AS workspace
    WHERE
      workspace."id" =
        NULLIF(current_setting('app.workspace_id', true), '')::uuid
      AND workspace."owner_user_id" =
        NULLIF(current_setting('app.user_id', true), '')::uuid
      AND workspace."state" = 'active'
  )
);

/*
 * ---------------------------------------------------------------------------
 * Coherent-V1 posting classification
 * ---------------------------------------------------------------------------
 *
 * The S1 classifier rejected every ledger kind that did not yet exist.
 *
 * Replace it now with the same S1 rules plus the two C debt ledger kinds:
 *
 * debt_liability:
 *   - no expense/income/cash-flow/category classification
 *   - liability_component is mandatory
 *
 * payment_clearing_asset:
 *   - non-cash temporary accounting bucket
 *   - all report classifications remain none/null
 *
 * Sign rules remain command-specific and therefore belong to each reviewed
 * financial recipe rather than this generic classifier.
 */

CREATE OR REPLACE FUNCTION "finance"."validate_posting_classification"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  v_ledger_kind text;
  v_journal_role text;
  v_category_kind text;
BEGIN
  SELECT
    ledger."kind",
    journal."role"
  INTO
    v_ledger_kind,
    v_journal_role
  FROM "finance"."ledger_account" AS ledger
  JOIN "finance"."journal" AS journal
    ON journal."workspace_id" = NEW.workspace_id
    AND journal."action_revision_id" = NEW.action_revision_id
    AND journal."id" = NEW.journal_id
  WHERE
    ledger."workspace_id" = NEW.workspace_id
    AND ledger."id" = NEW.ledger_account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'posting ledger or journal does not exist in the active scope'
      USING ERRCODE = '23503';
  END IF;

  IF v_journal_role = 'economic'
    AND NEW.reverses_posting_id IS NOT NULL
  THEN
    RAISE EXCEPTION
      'economic postings cannot identify a reversed posting'
      USING ERRCODE = '23514';
  END IF;

  IF v_journal_role = 'reversal'
    AND NEW.reverses_posting_id IS NULL
  THEN
    RAISE EXCEPTION
      'reversal postings must identify the posting they reverse'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.category_id IS NOT NULL THEN
    SELECT category."kind"
    INTO v_category_kind
    FROM "core"."category" AS category
    WHERE
      category."workspace_id" = NEW.workspace_id
      AND category."id" = NEW.category_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'posting category does not exist in the active scope'
        USING ERRCODE = '23503';
    END IF;

    IF v_ledger_kind NOT IN ('expense', 'income') THEN
      RAISE EXCEPTION
        'only income/expense ledger postings may carry a category'
        USING ERRCODE = '23514';
    END IF;

    IF v_category_kind <> v_ledger_kind THEN
      RAISE EXCEPTION
        'posting category kind must match the ledger kind'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  CASE v_ledger_kind
    WHEN 'cash_asset' THEN
      IF NEW.expense_class <> 'none'
        OR NEW.income_class <> 'none'
        OR NEW.cash_flow_kind = 'none'
        OR NEW.cash_flow_direction = 'none'
        OR NEW.liability_component IS NOT NULL
        OR NEW.category_id IS NOT NULL
      THEN
        RAISE EXCEPTION
          'cash_asset posting classification is invalid'
          USING ERRCODE = '23514';
      END IF;

    WHEN 'expense' THEN
      IF NEW.expense_class = 'none'
        OR NEW.income_class <> 'none'
        OR NEW.cash_flow_kind <> 'none'
        OR NEW.cash_flow_direction <> 'none'
        OR NEW.liability_component IS NOT NULL
      THEN
        RAISE EXCEPTION
          'expense posting classification is invalid'
          USING ERRCODE = '23514';
      END IF;

      IF v_journal_role = 'economic' THEN
        IF NEW.expense_class = 'gross'
          AND NEW.amount_minor <= 0
        THEN
          RAISE EXCEPTION
            'gross expense postings must be positive'
            USING ERRCODE = '23514';
        END IF;

        IF NEW.expense_class IN (
          'refund_offset',
          'rebate_offset',
          'waiver_offset'
        )
        AND NEW.amount_minor >= 0
        THEN
          RAISE EXCEPTION
            'expense offset postings must be negative'
            USING ERRCODE = '23514';
        END IF;
      END IF;

    WHEN 'income' THEN
      IF NEW.expense_class <> 'none'
        OR NEW.income_class = 'none'
        OR NEW.cash_flow_kind <> 'none'
        OR NEW.cash_flow_direction <> 'none'
        OR NEW.liability_component IS NOT NULL
      THEN
        RAISE EXCEPTION
          'income posting classification is invalid'
          USING ERRCODE = '23514';
      END IF;

      IF v_journal_role = 'economic'
        AND NEW.amount_minor >= 0
      THEN
        RAISE EXCEPTION
          'normal income postings must be credit-negative'
          USING ERRCODE = '23514';
      END IF;

    WHEN 'opening_equity' THEN
      IF NEW.expense_class <> 'none'
        OR NEW.income_class <> 'none'
        OR NEW.cash_flow_kind <> 'none'
        OR NEW.cash_flow_direction <> 'none'
        OR NEW.liability_component IS NOT NULL
        OR NEW.category_id IS NOT NULL
      THEN
        RAISE EXCEPTION
          'opening_equity posting classification is invalid'
          USING ERRCODE = '23514';
      END IF;

    WHEN 'adjustment_equity' THEN
      IF NEW.expense_class <> 'none'
        OR NEW.income_class <> 'none'
        OR NEW.cash_flow_kind <> 'none'
        OR NEW.cash_flow_direction <> 'none'
        OR NEW.liability_component IS NOT NULL
        OR NEW.category_id IS NOT NULL
      THEN
        RAISE EXCEPTION
          'adjustment_equity posting classification is invalid'
          USING ERRCODE = '23514';
      END IF;

    WHEN 'debt_liability' THEN
      IF NEW.expense_class <> 'none'
        OR NEW.income_class <> 'none'
        OR NEW.cash_flow_kind <> 'none'
        OR NEW.cash_flow_direction <> 'none'
        OR NEW.liability_component IS NULL
        OR NEW.category_id IS NOT NULL
      THEN
        RAISE EXCEPTION
          'debt_liability posting classification is invalid'
          USING ERRCODE = '23514';
      END IF;

    WHEN 'payment_clearing_asset' THEN
      IF NEW.expense_class <> 'none'
        OR NEW.income_class <> 'none'
        OR NEW.cash_flow_kind <> 'none'
        OR NEW.cash_flow_direction <> 'none'
        OR NEW.liability_component IS NOT NULL
        OR NEW.category_id IS NOT NULL
      THEN
        RAISE EXCEPTION
          'payment_clearing_asset posting classification is invalid'
          USING ERRCODE = '23514';
      END IF;

    ELSE
      RAISE EXCEPTION
        'ledger kind is not supported by the financial posting classifier'
        USING ERRCODE = '23514';
  END CASE;

  RETURN NEW;
END;
$$;

/*
 * ---------------------------------------------------------------------------
 * opening_debt financial recipe
 * ---------------------------------------------------------------------------
 *
 * Importing an already-existing debt is a baseline operation:
 *
 *   opening equity  + outstanding amount
 *   debt liability  - outstanding amount
 *
 * It creates no cash movement, income, expense, borrowing receipt, or
 * historical payment.
 */

CREATE FUNCTION "finance"."validate_opening_debt_revision_recipe"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  v_revision "finance"."action_revision"%ROWTYPE;

  v_link_count bigint;
  v_opening_link_count bigint;

  v_debt_id uuid;
  v_liability_ledger_id uuid;

  v_debt_currency text;
  v_breakdown_status text;
  v_debt_lifecycle text;
  v_opening_cutoff_date date;

  v_economic_journal_count bigint;

  v_debt_posting_count bigint;
  v_equity_posting_count bigint;

  v_debt_total numeric;
  v_equity_total numeric;

  v_classified_liability_count bigint;
  v_unclassified_liability_count bigint;
BEGIN
  SELECT revision.*
  INTO v_revision
  FROM "finance"."action_revision" AS revision
  WHERE
    revision."workspace_id" = NEW.workspace_id
    AND revision."id" = NEW.id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_revision.state <> 'posted' THEN
    RAISE EXCEPTION
      'opening_debt recipe validation requires a finalized revision'
      USING ERRCODE = '23514';
  END IF;

  IF v_revision.action_kind <> 'opening_debt' THEN
    RETURN NULL;
  END IF;

  /*
   * D6a creates imported opening debt only.
   *
   * Economic correction of an opening debt is intentionally not enabled until
   * the reviewed baseline-correction workflow exists.
   */
  IF v_revision.change_kind <> 'create'
    OR v_revision.revision_no <> 1
  THEN
    RAISE EXCEPTION
      'D6a opening_debt supports only initial create revisions'
      USING ERRCODE = '23514';
  END IF;

  SELECT
    count(*),
    count(*) FILTER (
      WHERE link."purpose" = 'opening'
    )
  INTO
    v_link_count,
    v_opening_link_count
  FROM "finance"."debt_action_link" AS link
  WHERE
    link."workspace_id" = v_revision.workspace_id
    AND link."action_revision_id" = v_revision.id;

  IF v_link_count <> 1
    OR v_opening_link_count <> 1
  THEN
    RAISE EXCEPTION
      'opening_debt requires exactly one opening debt-action link'
      USING ERRCODE = '23514';
  END IF;

  SELECT link."debt_id"
  INTO v_debt_id
  FROM "finance"."debt_action_link" AS link
  WHERE
    link."workspace_id" = v_revision.workspace_id
    AND link."action_revision_id" = v_revision.id
    AND link."purpose" = 'opening';

  SELECT
    debt."liability_ledger_account_id",
    debt."currency",
    debt."breakdown_status",
    debt."lifecycle",
    debt."opening_cutoff_date"
  INTO
    v_liability_ledger_id,
    v_debt_currency,
    v_breakdown_status,
    v_debt_lifecycle,
    v_opening_cutoff_date
  FROM "finance"."debt" AS debt
  WHERE
    debt."workspace_id" = v_revision.workspace_id
    AND debt."id" = v_debt_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'opening_debt debt does not exist in the active scope'
      USING ERRCODE = '23503';
  END IF;

  IF v_debt_lifecycle <> 'active' THEN
    RAISE EXCEPTION
      'opening_debt requires an active debt'
      USING ERRCODE = '23514';
  END IF;

  IF v_opening_cutoff_date IS NULL THEN
    RAISE EXCEPTION
      'imported opening debt requires an opening cutoff date'
      USING ERRCODE = '23514';
  END IF;

  IF v_revision.currency IS DISTINCT FROM v_debt_currency THEN
    RAISE EXCEPTION
      'opening_debt currency must match its debt'
      USING ERRCODE = '23514';
  END IF;

  IF v_revision.primary_effective_date
      IS DISTINCT FROM v_opening_cutoff_date
  THEN
    RAISE EXCEPTION
      'opening_debt effective date must equal the debt opening cutoff'
      USING ERRCODE = '23514';
  END IF;

  /*
   * Imported baseline debt must not masquerade as a receipt, purchase,
   * transfer or fee.
   */
  IF EXISTS (
    SELECT 1
    FROM "finance"."receipt_detail" AS detail
    WHERE
      detail."workspace_id" = v_revision.workspace_id
      AND detail."action_revision_id" = v_revision.id
  )
  OR EXISTS (
    SELECT 1
    FROM "finance"."purchase_detail" AS detail
    WHERE
      detail."workspace_id" = v_revision.workspace_id
      AND detail."action_revision_id" = v_revision.id
  )
  OR EXISTS (
    SELECT 1
    FROM "finance"."transfer_detail" AS detail
    WHERE
      detail."workspace_id" = v_revision.workspace_id
      AND detail."action_revision_id" = v_revision.id
  )
  OR EXISTS (
    SELECT 1
    FROM "finance"."fee_component" AS fee
    WHERE
      fee."workspace_id" = v_revision.workspace_id
      AND fee."action_revision_id" = v_revision.id
  )
  THEN
    RAISE EXCEPTION
      'opening_debt cannot contain cash receipt/purchase/transfer/fee detail'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "finance"."financial_account" AS account
    WHERE
      account."workspace_id" = v_revision.workspace_id
      AND account."opening_action_id" = v_revision.action_id
  )
  THEN
    RAISE EXCEPTION
      'opening_debt cannot be used as a financial-account opening action'
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*)
  INTO v_economic_journal_count
  FROM "finance"."journal" AS journal
  WHERE
    journal."workspace_id" = v_revision.workspace_id
    AND journal."action_revision_id" = v_revision.id
    AND journal."role" = 'economic';

  IF v_economic_journal_count <> 1 THEN
    RAISE EXCEPTION
      'opening_debt requires exactly one economic journal'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "finance"."journal" AS journal
    WHERE
      journal."workspace_id" = v_revision.workspace_id
      AND journal."action_revision_id" = v_revision.id
      AND journal."role" = 'economic'
      AND journal."effective_date"
        IS DISTINCT FROM v_opening_cutoff_date
  )
  THEN
    RAISE EXCEPTION
      'opening_debt journal date must equal the debt opening cutoff'
      USING ERRCODE = '23514';
  END IF;

  /*
   * No present-period cash, income, expense or adjustment is allowed in an
   * imported opening liability.
   */
  IF EXISTS (
    SELECT 1
    FROM "finance"."posting" AS posting
    JOIN "finance"."journal" AS journal
      ON journal."workspace_id" = posting."workspace_id"
      AND journal."action_revision_id" = posting."action_revision_id"
      AND journal."id" = posting."journal_id"
    JOIN "finance"."ledger_account" AS ledger
      ON ledger."workspace_id" = posting."workspace_id"
      AND ledger."id" = posting."ledger_account_id"
    WHERE
      posting."workspace_id" = v_revision.workspace_id
      AND posting."action_revision_id" = v_revision.id
      AND journal."role" = 'economic'
      AND ledger."kind" NOT IN (
        'opening_equity',
        'debt_liability'
      )
  )
  THEN
    RAISE EXCEPTION
      'opening_debt may contain only opening_equity and debt_liability postings'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "finance"."posting" AS posting
    JOIN "finance"."journal" AS journal
      ON journal."workspace_id" = posting."workspace_id"
      AND journal."action_revision_id" = posting."action_revision_id"
      AND journal."id" = posting."journal_id"
    JOIN "finance"."ledger_account" AS ledger
      ON ledger."workspace_id" = posting."workspace_id"
      AND ledger."id" = posting."ledger_account_id"
    WHERE
      posting."workspace_id" = v_revision.workspace_id
      AND posting."action_revision_id" = v_revision.id
      AND journal."role" = 'economic'
      AND ledger."kind" = 'debt_liability'
      AND (
        posting."ledger_account_id"
          IS DISTINCT FROM v_liability_ledger_id
        OR posting."amount_minor" >= 0
        OR posting."liability_component" IS NULL
      )
  )
  THEN
    RAISE EXCEPTION
      'opening_debt liability postings must credit the debt liability ledger'
      USING ERRCODE = '23514';
  END IF;

  SELECT
    count(*),
    COALESCE(
      sum(-(posting."amount_minor"::numeric)),
      0
    ),
    count(*) FILTER (
      WHERE posting."liability_component" = 'unclassified'
    ),
    count(*) FILTER (
      WHERE posting."liability_component" <> 'unclassified'
    )
  INTO
    v_debt_posting_count,
    v_debt_total,
    v_unclassified_liability_count,
    v_classified_liability_count
  FROM "finance"."posting" AS posting
  JOIN "finance"."journal" AS journal
    ON journal."workspace_id" = posting."workspace_id"
    AND journal."action_revision_id" = posting."action_revision_id"
    AND journal."id" = posting."journal_id"
  WHERE
    posting."workspace_id" = v_revision.workspace_id
    AND posting."action_revision_id" = v_revision.id
    AND journal."role" = 'economic'
    AND posting."ledger_account_id" = v_liability_ledger_id;

  IF v_debt_posting_count < 1
    OR v_debt_total <= 0
  THEN
    RAISE EXCEPTION
      'opening_debt requires a positive recognized opening liability'
      USING ERRCODE = '23514';
  END IF;

  IF v_breakdown_status = 'known'
    AND v_unclassified_liability_count <> 0
  THEN
    RAISE EXCEPTION
      'known debt breakdown cannot contain unclassified liability'
      USING ERRCODE = '23514';
  END IF;

  IF v_breakdown_status = 'unknown'
    AND v_classified_liability_count <> 0
  THEN
    RAISE EXCEPTION
      'unknown debt breakdown must remain unclassified'
      USING ERRCODE = '23514';
  END IF;

  IF v_breakdown_status = 'partial'
    AND (
      v_unclassified_liability_count = 0
      OR v_classified_liability_count = 0
    )
  THEN
    RAISE EXCEPTION
      'partial debt breakdown requires classified and unclassified liability portions'
      USING ERRCODE = '23514';
  END IF;

  SELECT
    count(*),
    COALESCE(
      sum(posting."amount_minor"::numeric),
      0
    )
  INTO
    v_equity_posting_count,
    v_equity_total
  FROM "finance"."posting" AS posting
  JOIN "finance"."journal" AS journal
    ON journal."workspace_id" = posting."workspace_id"
    AND journal."action_revision_id" = posting."action_revision_id"
    AND journal."id" = posting."journal_id"
  JOIN "finance"."ledger_account" AS ledger
    ON ledger."workspace_id" = posting."workspace_id"
    AND ledger."id" = posting."ledger_account_id"
  WHERE
    posting."workspace_id" = v_revision.workspace_id
    AND posting."action_revision_id" = v_revision.id
    AND journal."role" = 'economic'
    AND ledger."kind" = 'opening_equity';

  IF v_equity_posting_count <> 1
    OR v_equity_total <= 0
  THEN
    RAISE EXCEPTION
      'opening_debt requires exactly one positive opening-equity posting'
      USING ERRCODE = '23514';
  END IF;

  IF v_equity_total <> v_debt_total THEN
    RAISE EXCEPTION
      'opening_debt equity baseline must equal recognized opening liability'
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL
ON FUNCTION "finance"."validate_opening_debt_revision_recipe"()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION "finance"."validate_opening_debt_revision_recipe"()
TO app_domain;

/*
 * Existing S1 recipes remain unchanged.
 *
 * The old trigger is narrowed to pre-D6 action kinds, while opening_debt is
 * validated by the dedicated coherent-V1 recipe above.
 */
DROP TRIGGER "action_revision_s1_recipe_integrity"
ON "finance"."action_revision";

CREATE CONSTRAINT TRIGGER "action_revision_s1_recipe_integrity"
AFTER INSERT OR UPDATE
ON "finance"."action_revision"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
WHEN (NEW."action_kind" <> 'opening_debt')
EXECUTE FUNCTION "finance"."validate_s1_revision_recipe"();

CREATE CONSTRAINT TRIGGER "action_revision_opening_debt_recipe_integrity"
AFTER INSERT OR UPDATE
ON "finance"."action_revision"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
WHEN (NEW."action_kind" = 'opening_debt')
EXECUTE FUNCTION "finance"."validate_opening_debt_revision_recipe"();

/*
 * ---------------------------------------------------------------------------
 * Debt close/accounting resolution
 * ---------------------------------------------------------------------------
 *
 * Recognized debt is derived exclusively from posted entries on the debt's
 * liability ledger.
 *
 * A debt cannot be marked settled, settled_early or cancelled while a
 * recognized liability remains. Original principal and contractual schedule
 * totals are not substituted for accounting truth.
 */

CREATE FUNCTION "finance"."validate_debt_accounting_resolution"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  v_recognized_liability numeric;
BEGIN
  IF NEW.lifecycle = 'active' THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(
    sum(posting."amount_minor"::numeric),
    0
  )
  INTO v_recognized_liability
  FROM "finance"."posting" AS posting
  JOIN "finance"."journal" AS journal
    ON journal."workspace_id" = posting."workspace_id"
    AND journal."action_revision_id" = posting."action_revision_id"
    AND journal."id" = posting."journal_id"
  WHERE
    posting."workspace_id" = NEW.workspace_id
    AND posting."ledger_account_id" = NEW.liability_ledger_account_id
    AND journal."state" = 'posted';

  IF v_recognized_liability <> 0 THEN
    RAISE EXCEPTION
      'debt cannot close while recognized liability remains'
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL
ON FUNCTION "finance"."validate_debt_accounting_resolution"()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION "finance"."validate_debt_accounting_resolution"()
TO app_domain;

CREATE CONSTRAINT TRIGGER "debt_accounting_resolution_integrity"
AFTER INSERT OR UPDATE
ON "finance"."debt"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "finance"."validate_debt_accounting_resolution"();