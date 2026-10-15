-- Custom SQL migration file, put your code below! --
/* Deferred triggers run at COMMIT under the caller's role. The operator has
 * no group table privileges; this fixed predicate checks its completed receipt. */
ALTER FUNCTION sharing.validate_receipt() SECURITY DEFINER;
DO $$ DECLARE d text; BEGIN
 d:=pg_get_functiondef('sharing.detach_deleted_identity()'::regprocedure);
 EXECUTE replace(d,'CASE WHEN accepted_user_id=OLD.user_id OR target_email_normalized=email THEN ''expired'' ELSE ''revoked'' END','CASE WHEN accepted_user_id=OLD.user_id OR (target_email_normalized=email AND state=''pending'') THEN ''expired'' WHEN state=''pending'' THEN ''revoked'' ELSE state END');
END $$;
