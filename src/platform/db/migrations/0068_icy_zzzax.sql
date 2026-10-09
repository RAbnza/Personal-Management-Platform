CREATE TABLE "ops"."restore_deletion_authorization" (
	"request_id" uuid PRIMARY KEY NOT NULL,
	"target_user_id" uuid NOT NULL,
	"target_workspace_id" uuid NOT NULL,
	"register_hash" "bytea" NOT NULL,
	"authorized_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_restore_register_hash" CHECK (octet_length("ops"."restore_deletion_authorization"."register_hash")=32),
	CONSTRAINT "ck_restore_isolated_database" CHECK (current_database() ~ '^pmp_restore_[a-f0-9]{32}$')
);
--> statement-breakpoint
REVOKE ALL ON ops.restore_deletion_authorization FROM PUBLIC,app_domain,auth_adapter,queue_broker,worker_domain,lifecycle_operator;
GRANT SELECT ON ops.restore_deletion_authorization TO lifecycle_operator;
ALTER TABLE ops.restore_deletion_authorization ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.restore_deletion_authorization FORCE ROW LEVEL SECURITY;
CREATE POLICY restore_operator_read ON ops.restore_deletion_authorization TO lifecycle_operator USING(true);
GRANT INSERT ON ops.deletion_request TO lifecycle_operator;
--> statement-breakpoint
/* Restore authorization is written by an OFFLINE isolated restore administrator,
 * never an ordinary runtime connection. Preserve the existing trigger bodies;
 * permit only the exact independently authorized target/hash in a restore DB. */
DO $$ DECLARE definition text; anchor text; BEGIN
 definition:=pg_get_functiondef('ops.guard_deletion_request()'::regprocedure);
 anchor:=' IF TG_OP=''INSERT'' THEN';
 IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'Restore request guard anchor missing'; END IF;
 definition:=replace(definition,anchor,anchor || E'\n   IF current_user=''lifecycle_operator'' AND current_database() ~ ''^pmp_restore_[a-f0-9]{32}$''\n     AND NEW.state=''purging'' AND NEW.purge_after<clock_timestamp() AND NEW.requested_at<=NEW.purge_after\n     AND NEW.user_id=NEW.target_user_id AND NEW.workspace_id=NEW.target_workspace_id\n     AND EXISTS(SELECT 1 FROM ops.restore_deletion_authorization a WHERE a.request_id=NEW.id\n       AND a.target_user_id=NEW.target_user_id AND a.target_workspace_id=NEW.target_workspace_id\n       AND a.register_hash=NEW.payload_hash AND a.register_hash=NEW.scope_hash) THEN RETURN NEW; END IF;');
 EXECUTE definition;
 definition:=pg_get_functiondef('ops.guard_owner_lifecycle()'::regprocedure);
 anchor:=' IF current_user=''app_domain'' THEN';
 IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'Restore lifecycle guard anchor missing'; END IF;
 definition:=replace(definition,anchor,E'\n IF current_user=''lifecycle_operator'' AND current_database() ~ ''^pmp_restore_[a-f0-9]{32}$''\n  AND old_state=''active'' AND new_state=''purging'' AND EXISTS(SELECT 1 FROM ops.restore_deletion_authorization a\n   JOIN ops.deletion_request r ON r.id=a.request_id AND r.state=''purging''\n   WHERE a.request_id=NULLIF(current_setting(''ops.deletion_request_id'',true),'''')::uuid\n   AND a.target_user_id=uid AND a.target_workspace_id=wid) THEN RETURN NEW; END IF;\n' || anchor);
 EXECUTE definition;
END $$;
