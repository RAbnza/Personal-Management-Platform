-- Custom SQL migration file, put your code below! --
DO $$ DECLARE d text; BEGIN
 d:=pg_get_functiondef('sharing.validate_group()'::regprocedure);
 IF strpos(d,'r.after_json=jsonb_build_object(''groupVersion'',v)')=0 THEN RAISE EXCEPTION 'group audit version anchor missing'; END IF;
 d:=replace(d,'r.after_json=jsonb_build_object(''groupVersion'',v)','r.after_json @> jsonb_build_object(''groupVersion'',v) AND r.subject_version=v');
 EXECUTE replace(d,'IF a IS NULL AND','IF NOT EXISTS(SELECT 1 FROM sharing.expense_group x WHERE x.id=g AND x.xmin::text=pg_current_xact_id()::text) THEN RAISE EXCEPTION ''group mutation requires aggregate version advance'' USING ERRCODE=''23514''; END IF; IF a IS NULL AND');
END $$;
CREATE FUNCTION sharing.guard_group_audit_payload() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE allowed text[]:=ARRAY['groupVersion','name','displayName','archived','membershipId','role','operation','invitationId','claimParticipantId','expenseId','revisionId','totalMinor','splitMethod','reason'];
BEGIN
 IF jsonb_typeof(NEW.after_json)<>'object' OR NEW.after_json-allowed<>'{}'::jsonb OR (NEW.before_json IS NOT NULL AND NEW.before_json<>'null'::jsonb AND (jsonb_typeof(NEW.before_json)<>'object' OR NEW.before_json-allowed<>'{}'::jsonb)) THEN RAISE EXCEPTION 'group audit permits only group-owned metadata' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION sharing.guard_group_audit_payload() FROM PUBLIC;
CREATE TRIGGER group_audit_payload BEFORE INSERT ON audit.group_revision FOR EACH ROW EXECUTE FUNCTION sharing.guard_group_audit_payload();
