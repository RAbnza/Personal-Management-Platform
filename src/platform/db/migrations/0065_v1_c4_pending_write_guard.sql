-- Custom SQL migration file, put your code below! --
DO $$ DECLARE definition text; BEGIN
 definition:=pg_get_functiondef('ops.guard_owner_lifecycle()'::regprocedure);
 definition:=replace(definition,'IF new_state IS NOT DISTINCT FROM old_state THEN RETURN NEW; END IF;',
 'IF new_state IS NOT DISTINCT FROM old_state THEN IF current_user=''app_domain'' AND old_state<>''active'' THEN RAISE EXCEPTION ''Pending ownership roots cannot be edited'' USING ERRCODE=''42501''; END IF; RETURN NEW; END IF;');
 EXECUTE definition;
END $$;
