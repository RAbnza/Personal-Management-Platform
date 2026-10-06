/*
 * S1 private-domain security and structural integrity foundation.
 *
 * This migration deliberately handles concerns that are either outside
 * Drizzle's declarative schema model or clearer as reviewed PostgreSQL SQL:
 *
 * - runtime privileges for new core/finance/audit tables
 * - FORCE RLS on every private S1 table
 * - workspace/user ownership policies
 * - scoped deferred/circular foreign keys
 * - scoped preference/opening-action foreign keys
 * - private-record identity/scope immutability
 * - mutable-aggregate version/timestamp triggers
 *
 * Accounting finalization, journal balancing, revision-chain validation,
 * posting classification and evidence immutability are added separately in
 * the S1 financial-integrity migration.
 */

/*
 * ---------------------------------------------------------------------------
 * Schema and table privileges
 * ---------------------------------------------------------------------------
 */

REVOKE ALL ON SCHEMA "finance" FROM PUBLIC;
REVOKE ALL ON SCHEMA "audit" FROM PUBLIC;

REVOKE ALL ON SCHEMA "finance"
FROM
  auth_adapter,
  queue_broker,
  worker_domain,
  lifecycle_operator;

REVOKE ALL ON SCHEMA "audit"
FROM
  auth_adapter,
  queue_broker,
  worker_domain,
  lifecycle_operator;

REVOKE ALL PRIVILEGES
ON TABLE
  "core"."category",
  "core"."tag",
  "core"."command_receipt"
FROM PUBLIC;

REVOKE ALL PRIVILEGES
ON TABLE
  "finance"."ledger_account",
  "finance"."financial_account",
  "finance"."financial_action",
  "finance"."action_revision",
  "finance"."journal",
  "finance"."posting",
  "finance"."receipt_detail",
  "finance"."purchase_detail",
  "finance"."transfer_detail",
  "finance"."fee_component",
  "finance"."action_tag"
FROM PUBLIC;

REVOKE ALL PRIVILEGES
ON TABLE
  "audit"."private_revision",
  "audit"."private_activity"
FROM PUBLIC;

REVOKE ALL PRIVILEGES
ON TABLE
  "core"."category",
  "core"."tag",
  "core"."command_receipt",
  "finance"."ledger_account",
  "finance"."financial_account",
  "finance"."financial_action",
  "finance"."action_revision",
  "finance"."journal",
  "finance"."posting",
  "finance"."receipt_detail",
  "finance"."purchase_detail",
  "finance"."transfer_detail",
  "finance"."fee_component",
  "finance"."action_tag",
  "audit"."private_revision",
  "audit"."private_activity"
FROM
  app_domain,
  auth_adapter,
  queue_broker,
  worker_domain,
  lifecycle_operator;

GRANT USAGE ON SCHEMA "finance" TO app_domain;
GRANT USAGE ON SCHEMA "audit" TO app_domain;

/*
 * Mutable/private aggregate roots.
 */
GRANT SELECT, INSERT, UPDATE
ON TABLE
  "core"."category",
  "core"."tag",
  "core"."command_receipt",
  "finance"."ledger_account",
  "finance"."financial_account",
  "finance"."financial_action",
  "finance"."action_revision",
  "finance"."journal"
TO app_domain;

/*
 * Immutable financial evidence is insert/read-only through app_domain.
 *
 * Posting/journal finalization protection is reinforced by triggers in the
 * following financial-integrity migration.
 */
GRANT SELECT, INSERT
ON TABLE
  "finance"."posting",
  "finance"."receipt_detail",
  "finance"."purchase_detail",
  "finance"."transfer_detail",
  "finance"."fee_component",
  "audit"."private_revision",
  "audit"."private_activity"
TO app_domain;

/*
 * Tags can be linked and unlinked without deleting either the action or tag.
 */
GRANT SELECT, INSERT, DELETE
ON TABLE "finance"."action_tag"
TO app_domain;

/*
 * ---------------------------------------------------------------------------
 * Deferred and forward-reference foreign keys
 * ---------------------------------------------------------------------------
 */

/*
 * workspace_preference.default_salary_account_id becomes a real owned
 * financial-account reference now that the S1 account table exists.
 */
ALTER TABLE "core"."workspace_preference"
ADD CONSTRAINT "fk_workspace_preference_salary_account"
FOREIGN KEY ("workspace_id", "default_salary_account_id")
REFERENCES "finance"."financial_account" ("workspace_id", "id")
ON DELETE RESTRICT
ON UPDATE RESTRICT;

CREATE INDEX "ix_workspace_preference_salary_account"
ON "core"."workspace_preference"
  ("workspace_id", "default_salary_account_id")
WHERE "default_salary_account_id" IS NOT NULL;

/*
 * A financial account may point at its opening action.
 *
 * The semantic check that this is an opening_cash action belonging to this
 * account is added in the financial-integrity migration.
 */
ALTER TABLE "finance"."financial_account"
ADD CONSTRAINT "fk_financial_account_opening_action"
FOREIGN KEY ("workspace_id", "opening_action_id")
REFERENCES "finance"."financial_action" ("workspace_id", "id")
ON DELETE RESTRICT
ON UPDATE RESTRICT;

/*
 * financial_action.current_revision_id and action_revision.action_id form an
 * intentional cycle. The pointer is checked at transaction end so an action
 * and its first revision can be inserted atomically using preallocated UUIDs.
 */
ALTER TABLE "finance"."financial_action"
ADD CONSTRAINT "fk_financial_action_current_revision"
FOREIGN KEY ("workspace_id", "id", "current_revision_id")
REFERENCES "finance"."action_revision"
  ("workspace_id", "action_id", "id")
ON DELETE RESTRICT
ON UPDATE RESTRICT
DEFERRABLE INITIALLY DEFERRED;

/*
 * Replacement/void revisions must reference a revision belonging to the same
 * logical action. Exact immediately-previous sequencing is enforced later by
 * the revision-chain trigger.
 */
ALTER TABLE "finance"."action_revision"
ADD CONSTRAINT "fk_action_revision_previous_revision"
FOREIGN KEY ("workspace_id", "action_id", "previous_revision_id")
REFERENCES "finance"."action_revision"
  ("workspace_id", "action_id", "id")
ON DELETE RESTRICT
ON UPDATE RESTRICT
DEFERRABLE INITIALLY DEFERRED;

/*
 * Reversal parents are scoped to the same workspace.
 *
 * Exact opposite-sign/class matching is enforced in the financial-integrity
 * migration.
 */
ALTER TABLE "finance"."journal"
ADD CONSTRAINT "fk_journal_reversal_parent"
FOREIGN KEY ("workspace_id", "reverses_journal_id")
REFERENCES "finance"."journal" ("workspace_id", "id")
ON DELETE RESTRICT
ON UPDATE RESTRICT
DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "finance"."posting"
ADD CONSTRAINT "fk_posting_reversal_parent"
FOREIGN KEY ("workspace_id", "reverses_posting_id")
REFERENCES "finance"."posting" ("workspace_id", "id")
ON DELETE RESTRICT
ON UPDATE RESTRICT
DEFERRABLE INITIALLY DEFERRED;

/*
 * ---------------------------------------------------------------------------
 * Scope/identity immutability
 * ---------------------------------------------------------------------------
 */

CREATE FUNCTION "core"."enforce_private_record_scope_immutability"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'private record id is immutable'
      USING ERRCODE = '22023';
  END IF;

  IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id THEN
    RAISE EXCEPTION 'private record workspace_id is immutable'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION "core"."enforce_private_record_scope_immutability"()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION "core"."enforce_private_record_scope_immutability"()
TO app_domain;

CREATE TRIGGER "category_scope_immutability"
BEFORE UPDATE OF "id", "workspace_id"
ON "core"."category"
FOR EACH ROW
EXECUTE FUNCTION "core"."enforce_private_record_scope_immutability"();

CREATE TRIGGER "tag_scope_immutability"
BEFORE UPDATE OF "id", "workspace_id"
ON "core"."tag"
FOR EACH ROW
EXECUTE FUNCTION "core"."enforce_private_record_scope_immutability"();

CREATE TRIGGER "command_receipt_scope_immutability"
BEFORE UPDATE OF "id", "workspace_id"
ON "core"."command_receipt"
FOR EACH ROW
EXECUTE FUNCTION "core"."enforce_private_record_scope_immutability"();

CREATE TRIGGER "ledger_account_scope_immutability"
BEFORE UPDATE OF "id", "workspace_id"
ON "finance"."ledger_account"
FOR EACH ROW
EXECUTE FUNCTION "core"."enforce_private_record_scope_immutability"();

CREATE TRIGGER "financial_account_scope_immutability"
BEFORE UPDATE OF "id", "workspace_id"
ON "finance"."financial_account"
FOR EACH ROW
EXECUTE FUNCTION "core"."enforce_private_record_scope_immutability"();

CREATE TRIGGER "financial_action_scope_immutability"
BEFORE UPDATE OF "id", "workspace_id"
ON "finance"."financial_action"
FOR EACH ROW
EXECUTE FUNCTION "core"."enforce_private_record_scope_immutability"();

CREATE FUNCTION "core"."enforce_command_receipt_identity_immutability"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.client_command_id IS DISTINCT FROM OLD.client_command_id THEN
    RAISE EXCEPTION 'core.command_receipt.client_command_id is immutable'
      USING ERRCODE = '22023';
  END IF;

  IF NEW.command_type IS DISTINCT FROM OLD.command_type THEN
    RAISE EXCEPTION 'core.command_receipt.command_type is immutable'
      USING ERRCODE = '22023';
  END IF;

  IF NEW.payload_hash IS DISTINCT FROM OLD.payload_hash THEN
    RAISE EXCEPTION 'core.command_receipt.payload_hash is immutable'
      USING ERRCODE = '22023';
  END IF;

  IF NEW.hash_version IS DISTINCT FROM OLD.hash_version THEN
    RAISE EXCEPTION 'core.command_receipt.hash_version is immutable'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION "core"."enforce_command_receipt_identity_immutability"()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION "core"."enforce_command_receipt_identity_immutability"()
TO app_domain;

CREATE TRIGGER "command_receipt_identity_immutability"
BEFORE UPDATE OF
  "client_command_id",
  "command_type",
  "payload_hash",
  "hash_version"
ON "core"."command_receipt"
FOR EACH ROW
EXECUTE FUNCTION "core"."enforce_command_receipt_identity_immutability"();

/*
 * Financial action attribution is evidence and therefore immutable.
 * Description/reference/notes and current revision/version remain controlled
 * mutable fields.
 */
CREATE FUNCTION "finance"."enforce_financial_action_evidence_immutability"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.original_command_receipt_id
      IS DISTINCT FROM OLD.original_command_receipt_id THEN
    RAISE EXCEPTION
      'finance.financial_action.original_command_receipt_id is immutable'
      USING ERRCODE = '22023';
  END IF;

  IF NEW.recorded_by_user_id IS DISTINCT FROM OLD.recorded_by_user_id THEN
    RAISE EXCEPTION
      'finance.financial_action.recorded_by_user_id is immutable'
      USING ERRCODE = '22023';
  END IF;

  IF NEW.actor_kind IS DISTINCT FROM OLD.actor_kind THEN
    RAISE EXCEPTION 'finance.financial_action.actor_kind is immutable'
      USING ERRCODE = '22023';
  END IF;

  IF NEW.request_id IS DISTINCT FROM OLD.request_id THEN
    RAISE EXCEPTION 'finance.financial_action.request_id is immutable'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION "finance"."enforce_financial_action_evidence_immutability"()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION "finance"."enforce_financial_action_evidence_immutability"()
TO app_domain;

CREATE TRIGGER "financial_action_evidence_immutability"
BEFORE UPDATE OF
  "original_command_receipt_id",
  "recorded_by_user_id",
  "actor_kind",
  "request_id"
ON "finance"."financial_action"
FOR EACH ROW
EXECUTE FUNCTION "finance"."enforce_financial_action_evidence_immutability"();

/*
 * ---------------------------------------------------------------------------
 * Mutable aggregate bundle
 * ---------------------------------------------------------------------------
 *
 * core.apply_mutable_aggregate_update() already implements the documented M
 * bundle for any table exposing version + updated_at:
 *
 *   version := previous version + 1
 *   updated_at := clock_timestamp()
 */

CREATE TRIGGER "category_mutable_aggregate_update"
BEFORE UPDATE
ON "core"."category"
FOR EACH ROW
EXECUTE FUNCTION "core"."apply_mutable_aggregate_update"();

CREATE TRIGGER "tag_mutable_aggregate_update"
BEFORE UPDATE
ON "core"."tag"
FOR EACH ROW
EXECUTE FUNCTION "core"."apply_mutable_aggregate_update"();

CREATE TRIGGER "ledger_account_mutable_aggregate_update"
BEFORE UPDATE
ON "finance"."ledger_account"
FOR EACH ROW
EXECUTE FUNCTION "core"."apply_mutable_aggregate_update"();

CREATE TRIGGER "financial_account_mutable_aggregate_update"
BEFORE UPDATE
ON "finance"."financial_account"
FOR EACH ROW
EXECUTE FUNCTION "core"."apply_mutable_aggregate_update"();

CREATE TRIGGER "financial_action_mutable_aggregate_update"
BEFORE UPDATE
ON "finance"."financial_action"
FOR EACH ROW
EXECUTE FUNCTION "core"."apply_mutable_aggregate_update"();

/*
 * ---------------------------------------------------------------------------
 * Row-level security
 * ---------------------------------------------------------------------------
 *
 * Every S1 private row is constrained by both transaction-local workspace
 * context and an active workspace owned by transaction-local app.user_id.
 *
 * core.workspace itself retains its already-established non-recursive owner
 * policy from the S0 ownership migration.
 */

ALTER TABLE "core"."category" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "core"."category" FORCE ROW LEVEL SECURITY;

ALTER TABLE "core"."tag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "core"."tag" FORCE ROW LEVEL SECURITY;

ALTER TABLE "core"."command_receipt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "core"."command_receipt" FORCE ROW LEVEL SECURITY;

ALTER TABLE "finance"."ledger_account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finance"."ledger_account" FORCE ROW LEVEL SECURITY;

ALTER TABLE "finance"."financial_account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finance"."financial_account" FORCE ROW LEVEL SECURITY;

ALTER TABLE "finance"."financial_action" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finance"."financial_action" FORCE ROW LEVEL SECURITY;

ALTER TABLE "finance"."action_revision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finance"."action_revision" FORCE ROW LEVEL SECURITY;

ALTER TABLE "finance"."journal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finance"."journal" FORCE ROW LEVEL SECURITY;

ALTER TABLE "finance"."posting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finance"."posting" FORCE ROW LEVEL SECURITY;

ALTER TABLE "finance"."receipt_detail" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finance"."receipt_detail" FORCE ROW LEVEL SECURITY;

ALTER TABLE "finance"."purchase_detail" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finance"."purchase_detail" FORCE ROW LEVEL SECURITY;

ALTER TABLE "finance"."transfer_detail" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finance"."transfer_detail" FORCE ROW LEVEL SECURITY;

ALTER TABLE "finance"."fee_component" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finance"."fee_component" FORCE ROW LEVEL SECURITY;

ALTER TABLE "finance"."action_tag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finance"."action_tag" FORCE ROW LEVEL SECURITY;

ALTER TABLE "audit"."private_revision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit"."private_revision" FORCE ROW LEVEL SECURITY;

ALTER TABLE "audit"."private_activity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit"."private_activity" FORCE ROW LEVEL SECURITY;

/*
 * Core S1 policies.
 */

CREATE POLICY "category_owner_access"
ON "core"."category"
FOR ALL
TO app_domain
USING (
  "workspace_id" =
    NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "core"."workspace" AS w
    WHERE
      w."id" =
        NULLIF(current_setting('app.workspace_id', true), '')::uuid
      AND w."owner_user_id" =
        NULLIF(current_setting('app.user_id', true), '')::uuid
      AND w."state" = 'active'
  )
)
WITH CHECK (
  "workspace_id" =
    NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "core"."workspace" AS w
    WHERE
      w."id" =
        NULLIF(current_setting('app.workspace_id', true), '')::uuid
      AND w."owner_user_id" =
        NULLIF(current_setting('app.user_id', true), '')::uuid
      AND w."state" = 'active'
  )
);

CREATE POLICY "tag_owner_access"
ON "core"."tag"
FOR ALL
TO app_domain
USING (
  "workspace_id" =
    NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "core"."workspace" AS w
    WHERE
      w."id" =
        NULLIF(current_setting('app.workspace_id', true), '')::uuid
      AND w."owner_user_id" =
        NULLIF(current_setting('app.user_id', true), '')::uuid
      AND w."state" = 'active'
  )
)
WITH CHECK (
  "workspace_id" =
    NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "core"."workspace" AS w
    WHERE
      w."id" =
        NULLIF(current_setting('app.workspace_id', true), '')::uuid
      AND w."owner_user_id" =
        NULLIF(current_setting('app.user_id', true), '')::uuid
      AND w."state" = 'active'
  )
);

CREATE POLICY "command_receipt_owner_access"
ON "core"."command_receipt"
FOR ALL
TO app_domain
USING (
  "workspace_id" =
    NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "core"."workspace" AS w
    WHERE
      w."id" =
        NULLIF(current_setting('app.workspace_id', true), '')::uuid
      AND w."owner_user_id" =
        NULLIF(current_setting('app.user_id', true), '')::uuid
      AND w."state" = 'active'
  )
)
WITH CHECK (
  "workspace_id" =
    NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "core"."workspace" AS w
    WHERE
      w."id" =
        NULLIF(current_setting('app.workspace_id', true), '')::uuid
      AND w."owner_user_id" =
        NULLIF(current_setting('app.user_id', true), '')::uuid
      AND w."state" = 'active'
  )
);

/*
 * Finance policies.
 */

CREATE POLICY "ledger_account_owner_access"
ON "finance"."ledger_account"
FOR ALL
TO app_domain
USING (
  "workspace_id" =
    NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "core"."workspace" AS w
    WHERE
      w."id" =
        NULLIF(current_setting('app.workspace_id', true), '')::uuid
      AND w."owner_user_id" =
        NULLIF(current_setting('app.user_id', true), '')::uuid
      AND w."state" = 'active'
  )
)
WITH CHECK (
  "workspace_id" =
    NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "core"."workspace" AS w
    WHERE
      w."id" =
        NULLIF(current_setting('app.workspace_id', true), '')::uuid
      AND w."owner_user_id" =
        NULLIF(current_setting('app.user_id', true), '')::uuid
      AND w."state" = 'active'
  )
);

CREATE POLICY "financial_account_owner_access"
ON "finance"."financial_account"
FOR ALL
TO app_domain
USING (
  "workspace_id" =
    NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "core"."workspace" AS w
    WHERE
      w."id" =
        NULLIF(current_setting('app.workspace_id', true), '')::uuid
      AND w."owner_user_id" =
        NULLIF(current_setting('app.user_id', true), '')::uuid
      AND w."state" = 'active'
  )
)
WITH CHECK (
  "workspace_id" =
    NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "core"."workspace" AS w
    WHERE
      w."id" =
        NULLIF(current_setting('app.workspace_id', true), '')::uuid
      AND w."owner_user_id" =
        NULLIF(current_setting('app.user_id', true), '')::uuid
      AND w."state" = 'active'
  )
);

CREATE POLICY "financial_action_owner_access"
ON "finance"."financial_action"
FOR ALL
TO app_domain
USING (
  "workspace_id" =
    NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "core"."workspace" AS w
    WHERE
      w."id" =
        NULLIF(current_setting('app.workspace_id', true), '')::uuid
      AND w."owner_user_id" =
        NULLIF(current_setting('app.user_id', true), '')::uuid
      AND w."state" = 'active'
  )
)
WITH CHECK (
  "workspace_id" =
    NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "core"."workspace" AS w
    WHERE
      w."id" =
        NULLIF(current_setting('app.workspace_id', true), '')::uuid
      AND w."owner_user_id" =
        NULLIF(current_setting('app.user_id', true), '')::uuid
      AND w."state" = 'active'
  )
);

CREATE POLICY "action_revision_owner_access"
ON "finance"."action_revision"
FOR ALL
TO app_domain
USING (
  "workspace_id" =
    NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "core"."workspace" AS w
    WHERE
      w."id" =
        NULLIF(current_setting('app.workspace_id', true), '')::uuid
      AND w."owner_user_id" =
        NULLIF(current_setting('app.user_id', true), '')::uuid
      AND w."state" = 'active'
  )
)
WITH CHECK (
  "workspace_id" =
    NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "core"."workspace" AS w
    WHERE
      w."id" =
        NULLIF(current_setting('app.workspace_id', true), '')::uuid
      AND w."owner_user_id" =
        NULLIF(current_setting('app.user_id', true), '')::uuid
      AND w."state" = 'active'
  )
);

CREATE POLICY "journal_owner_access"
ON "finance"."journal"
FOR ALL
TO app_domain
USING (
  "workspace_id" =
    NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "core"."workspace" AS w
    WHERE
      w."id" =
        NULLIF(current_setting('app.workspace_id', true), '')::uuid
      AND w."owner_user_id" =
        NULLIF(current_setting('app.user_id', true), '')::uuid
      AND w."state" = 'active'
  )
)
WITH CHECK (
  "workspace_id" =
    NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "core"."workspace" AS w
    WHERE
      w."id" =
        NULLIF(current_setting('app.workspace_id', true), '')::uuid
      AND w."owner_user_id" =
        NULLIF(current_setting('app.user_id', true), '')::uuid
      AND w."state" = 'active'
  )
);

CREATE POLICY "posting_owner_access"
ON "finance"."posting"
FOR ALL
TO app_domain
USING (
  "workspace_id" =
    NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "core"."workspace" AS w
    WHERE
      w."id" =
        NULLIF(current_setting('app.workspace_id', true), '')::uuid
      AND w."owner_user_id" =
        NULLIF(current_setting('app.user_id', true), '')::uuid
      AND w."state" = 'active'
  )
)
WITH CHECK (
  "workspace_id" =
    NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "core"."workspace" AS w
    WHERE
      w."id" =
        NULLIF(current_setting('app.workspace_id', true), '')::uuid
      AND w."owner_user_id" =
        NULLIF(current_setting('app.user_id', true), '')::uuid
      AND w."state" = 'active'
  )
);

CREATE POLICY "receipt_detail_owner_access"
ON "finance"."receipt_detail"
FOR ALL
TO app_domain
USING (
  "workspace_id" =
    NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "core"."workspace" AS w
    WHERE
      w."id" =
        NULLIF(current_setting('app.workspace_id', true), '')::uuid
      AND w."owner_user_id" =
        NULLIF(current_setting('app.user_id', true), '')::uuid
      AND w."state" = 'active'
  )
)
WITH CHECK (
  "workspace_id" =
    NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "core"."workspace" AS w
    WHERE
      w."id" =
        NULLIF(current_setting('app.workspace_id', true), '')::uuid
      AND w."owner_user_id" =
        NULLIF(current_setting('app.user_id', true), '')::uuid
      AND w."state" = 'active'
  )
);

CREATE POLICY "purchase_detail_owner_access"
ON "finance"."purchase_detail"
FOR ALL
TO app_domain
USING (
  "workspace_id" =
    NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "core"."workspace" AS w
    WHERE
      w."id" =
        NULLIF(current_setting('app.workspace_id', true), '')::uuid
      AND w."owner_user_id" =
        NULLIF(current_setting('app.user_id', true), '')::uuid
      AND w."state" = 'active'
  )
)
WITH CHECK (
  "workspace_id" =
    NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "core"."workspace" AS w
    WHERE
      w."id" =
        NULLIF(current_setting('app.workspace_id', true), '')::uuid
      AND w."owner_user_id" =
        NULLIF(current_setting('app.user_id', true), '')::uuid
      AND w."state" = 'active'
  )
);

CREATE POLICY "transfer_detail_owner_access"
ON "finance"."transfer_detail"
FOR ALL
TO app_domain
USING (
  "workspace_id" =
    NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "core"."workspace" AS w
    WHERE
      w."id" =
        NULLIF(current_setting('app.workspace_id', true), '')::uuid
      AND w."owner_user_id" =
        NULLIF(current_setting('app.user_id', true), '')::uuid
      AND w."state" = 'active'
  )
)
WITH CHECK (
  "workspace_id" =
    NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "core"."workspace" AS w
    WHERE
      w."id" =
        NULLIF(current_setting('app.workspace_id', true), '')::uuid
      AND w."owner_user_id" =
        NULLIF(current_setting('app.user_id', true), '')::uuid
      AND w."state" = 'active'
  )
);

CREATE POLICY "fee_component_owner_access"
ON "finance"."fee_component"
FOR ALL
TO app_domain
USING (
  "workspace_id" =
    NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "core"."workspace" AS w
    WHERE
      w."id" =
        NULLIF(current_setting('app.workspace_id', true), '')::uuid
      AND w."owner_user_id" =
        NULLIF(current_setting('app.user_id', true), '')::uuid
      AND w."state" = 'active'
  )
)
WITH CHECK (
  "workspace_id" =
    NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "core"."workspace" AS w
    WHERE
      w."id" =
        NULLIF(current_setting('app.workspace_id', true), '')::uuid
      AND w."owner_user_id" =
        NULLIF(current_setting('app.user_id', true), '')::uuid
      AND w."state" = 'active'
  )
);

CREATE POLICY "action_tag_owner_access"
ON "finance"."action_tag"
FOR ALL
TO app_domain
USING (
  "workspace_id" =
    NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "core"."workspace" AS w
    WHERE
      w."id" =
        NULLIF(current_setting('app.workspace_id', true), '')::uuid
      AND w."owner_user_id" =
        NULLIF(current_setting('app.user_id', true), '')::uuid
      AND w."state" = 'active'
  )
)
WITH CHECK (
  "workspace_id" =
    NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "core"."workspace" AS w
    WHERE
      w."id" =
        NULLIF(current_setting('app.workspace_id', true), '')::uuid
      AND w."owner_user_id" =
        NULLIF(current_setting('app.user_id', true), '')::uuid
      AND w."state" = 'active'
  )
);

/*
 * Audit policies.
 */

CREATE POLICY "private_revision_owner_access"
ON "audit"."private_revision"
FOR ALL
TO app_domain
USING (
  "workspace_id" =
    NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "core"."workspace" AS w
    WHERE
      w."id" =
        NULLIF(current_setting('app.workspace_id', true), '')::uuid
      AND w."owner_user_id" =
        NULLIF(current_setting('app.user_id', true), '')::uuid
      AND w."state" = 'active'
  )
)
WITH CHECK (
  "workspace_id" =
    NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "core"."workspace" AS w
    WHERE
      w."id" =
        NULLIF(current_setting('app.workspace_id', true), '')::uuid
      AND w."owner_user_id" =
        NULLIF(current_setting('app.user_id', true), '')::uuid
      AND w."state" = 'active'
  )
);

CREATE POLICY "private_activity_owner_access"
ON "audit"."private_activity"
FOR ALL
TO app_domain
USING (
  "workspace_id" =
    NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "core"."workspace" AS w
    WHERE
      w."id" =
        NULLIF(current_setting('app.workspace_id', true), '')::uuid
      AND w."owner_user_id" =
        NULLIF(current_setting('app.user_id', true), '')::uuid
      AND w."state" = 'active'
  )
)
WITH CHECK (
  "workspace_id" =
    NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "core"."workspace" AS w
    WHERE
      w."id" =
        NULLIF(current_setting('app.workspace_id', true), '')::uuid
      AND w."owner_user_id" =
        NULLIF(current_setting('app.user_id', true), '')::uuid
      AND w."state" = 'active'
  )
);