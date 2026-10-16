-- Custom SQL migration file, put your code below! --
/* Runtime callers cannot fabricate former-member entitlements. Only the
 * fixed exit trigger writes those rows. Every mutation needs fresh evidence. */
REVOKE INSERT ON sharing.member_record_access FROM app_domain;
DROP POLICY entitlement_write ON sharing.member_record_access;
DO $$ DECLARE d text; BEGIN
 d:=pg_get_functiondef('sharing.validate_group()'::regprocedure);
 IF strpos(d,'AND c.state=''completed''')=0 THEN RAISE EXCEPTION 'group evidence anchor missing'; END IF;
 EXECUTE replace(d,'AND c.state=''completed''','AND c.state=''completed'' AND c.xmin::text=pg_current_xact_id()::text');
 d:=pg_get_functiondef('sharing.review_invitation(text)'::regprocedure);
 EXECUTE replace(d,'WHERE x.token_hash=h AND','WHERE x.token_hash=h AND EXISTS(SELECT 1 FROM sharing.membership authority WHERE authority.group_id=x.group_id AND authority.participant_id=x.inviter_participant_id AND authority.role=''owner'' AND authority.left_at IS NULL) AND');
END $$;
CREATE FUNCTION sharing.guard_claim() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 IF current_user='migration_owner' THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.state<>'pending' OR NEW.claiming_user_id IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.balance_review_json<>'{}'::jsonb THEN RAISE EXCEPTION 'claim creation cannot fabricate consent' USING ERRCODE='23514'; END IF;
 ELSIF OLD.state<>'pending' OR NEW.state NOT IN('expired','rejected') OR (to_jsonb(NEW)-'state') IS DISTINCT FROM (to_jsonb(OLD)-'state') THEN RAISE EXCEPTION 'accepted identity consent is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION sharing.guard_claim() FROM PUBLIC;
CREATE TRIGGER claim_consent BEFORE INSERT OR UPDATE ON sharing.participant_claim FOR EACH ROW EXECUTE FUNCTION sharing.guard_claim();

/* A correction may retain participants from its prior evidence after exit,
 * but cannot add a former member to unrelated new activity. */
DO $$ DECLARE d text; BEGIN
 d:=pg_get_functiondef('sharing.guard_bill()'::regprocedure);
 IF strpos(d,'m.left_at IS NULL)))')=0 THEN RAISE EXCEPTION 'bill participant anchor missing'; END IF;
 EXECUTE replace(d,'m.left_at IS NULL)))','m.left_at IS NULL) OR EXISTS(SELECT 1 FROM sharing.payer_contribution prior WHERE prior.group_id=p.group_id AND prior.participant_id=p.id AND prior.expense_revision_id=r.previous_revision_id) OR EXISTS(SELECT 1 FROM sharing.participant_share prior WHERE prior.group_id=p.group_id AND prior.participant_id=p.id AND prior.expense_revision_id=r.previous_revision_id)))');
END $$;
