-- Bounded P0 synthetic schema. Apply only to a disposable/local development DB.
-- Supabase supplies auth.uid(), anon and authenticated; tests provide stubs.
BEGIN;
CREATE SCHEMA salapiya_p0;
REVOKE ALL ON SCHEMA salapiya_p0 FROM PUBLIC;
CREATE TABLE public.p0_profile (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL UNIQUE,
  revision bigint NOT NULL DEFAULT 0 CHECK(revision >= 0)
);
CREATE TABLE public.p0_accepted (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES public.p0_profile(owner_id),
  payload text NOT NULL, amount_minor text NOT NULL,
  revision bigint NOT NULL CHECK(revision > 0),
  CHECK(amount_minor ~ '^[1-9][0-9]*$' AND amount_minor::numeric <= 100000000000)
);
CREATE TABLE salapiya_p0.evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), action_id uuid NOT NULL REFERENCES public.p0_accepted(id),
  owner_id uuid NOT NULL, kind text NOT NULL CHECK(kind IN ('expense','cash')),
  amount_minor bigint NOT NULL CHECK(amount_minor != 0 AND abs(amount_minor) <= 100000000000),
  UNIQUE(action_id,kind)
);
CREATE TABLE salapiya_p0.receipt (
  owner_id uuid NOT NULL, id uuid NOT NULL, payload jsonb NOT NULL,
  result jsonb NOT NULL, PRIMARY KEY(owner_id,id)
);
CREATE FUNCTION salapiya_p0.immutable() RETURNS trigger LANGUAGE plpgsql
SET search_path='' AS $$ BEGIN RAISE EXCEPTION 'immutable financial evidence'; END $$;
CREATE TRIGGER p0_evidence_immutable BEFORE UPDATE OR DELETE ON salapiya_p0.evidence
  FOR EACH ROW EXECUTE FUNCTION salapiya_p0.immutable();
CREATE TRIGGER p0_action_immutable BEFORE UPDATE OR DELETE ON public.p0_accepted
  FOR EACH ROW EXECUTE FUNCTION salapiya_p0.immutable();

ALTER TABLE public.p0_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.p0_accepted ENABLE ROW LEVEL SECURITY;
CREATE POLICY p0_profile_owner ON public.p0_profile FOR SELECT TO authenticated
  USING(owner_id=(SELECT auth.uid()));
CREATE POLICY p0_action_owner ON public.p0_accepted FOR SELECT TO authenticated
  USING(owner_id=(SELECT auth.uid()));
REVOKE ALL ON public.p0_profile,public.p0_accepted FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.p0_profile,public.p0_accepted TO authenticated;

CREATE FUNCTION public.p0_submit_expense(command_id uuid, command_payload text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  actor uuid := auth.uid(); data jsonb; prior salapiya_p0.receipt;
  current_revision bigint; amount bigint; outcome jsonb; reason text;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='42501'; END IF;
  IF octet_length(command_payload) > 4096 THEN RAISE EXCEPTION 'payload too large' USING ERRCODE='22023'; END IF;
  data := command_payload::jsonb;
  -- Lock receipt identity before lookup. Same-owner actions serialize below too.
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text || command_id::text,0));
  SELECT * INTO prior FROM salapiya_p0.receipt WHERE owner_id=actor AND id=command_id;
  IF FOUND THEN
    IF prior.payload != data THEN RAISE EXCEPTION 'command payload mismatch' USING ERRCODE='22023'; END IF;
    RETURN prior.result;
  END IF;
  IF jsonb_typeof(data) != 'object' OR
      data - ARRAY['amount_minor','expected_revision','kind','owner_id','version'] != '{}'::jsonb OR
      NOT (data ?& ARRAY['amount_minor','expected_revision','kind','owner_id','version']) OR
      data->>'kind' != 'expense' OR data->'version' != '1'::jsonb OR
      jsonb_typeof(data->'owner_id') != 'string' OR data->>'owner_id' != actor::text OR
      jsonb_typeof(data->'amount_minor') != 'string' OR
      (data->>'amount_minor') !~ '^[1-9][0-9]{0,11}$' OR
      jsonb_typeof(data->'expected_revision') != 'number' OR
      (data->>'expected_revision') !~ '^(0|[1-9][0-9]{0,14})$' THEN
    reason := 'invalid_or_unauthorized_payload';
  ELSE
    amount := (data->>'amount_minor')::bigint;
    IF amount > 100000000000 THEN reason := 'amount_out_of_range'; END IF;
  END IF;
  SELECT revision INTO current_revision FROM public.p0_profile WHERE owner_id=actor FOR UPDATE;
  IF NOT FOUND THEN reason := coalesce(reason,'profile_not_enrolled'); END IF;
  IF reason IS NULL AND (data->>'expected_revision')::bigint != 0 AND
      (data->>'expected_revision')::bigint != current_revision THEN reason := 'stale_revision'; END IF;
  IF reason IS NULL AND EXISTS(SELECT 1 FROM public.p0_accepted WHERE id=command_id) THEN
    reason := 'command_id_taken';
  END IF;
  IF reason IS NULL THEN
    current_revision := current_revision + 1;
    INSERT INTO public.p0_accepted VALUES(command_id,actor,command_payload,amount::text,current_revision);
    INSERT INTO salapiya_p0.evidence(action_id,owner_id,kind,amount_minor)
      VALUES(command_id,actor,'expense',amount),(command_id,actor,'cash',-amount);
    UPDATE public.p0_profile SET revision=current_revision WHERE owner_id=actor;
    outcome := jsonb_build_object('id',command_id,'owner_id',actor,'outcome','accepted','revision',current_revision::text);
  ELSE
    outcome := jsonb_build_object('id',command_id,'owner_id',actor,'outcome','rejected','reason',reason);
  END IF;
  INSERT INTO salapiya_p0.receipt VALUES(actor,command_id,data,outcome);
  RETURN outcome;
END $$;
REVOKE ALL ON FUNCTION public.p0_submit_expense(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.p0_submit_expense(uuid,text) TO authenticated;
COMMIT;
