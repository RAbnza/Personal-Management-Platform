-- Bounded architecture-only source/capacity/creator proof. No product group ledger.
-- These private tables are deliberately absent from PowerSync publication.
BEGIN;
CREATE TABLE salapiya_p0.gate_group(id uuid PRIMARY KEY, owner_id uuid NOT NULL);
CREATE TABLE salapiya_p0.gate_member(
  group_id uuid REFERENCES salapiya_p0.gate_group(id), user_id uuid,
  active boolean NOT NULL, PRIMARY KEY(group_id,user_id)
);
CREATE TABLE salapiya_p0.gate_source(
  id uuid PRIMARY KEY, group_id uuid NOT NULL REFERENCES salapiya_p0.gate_group(id),
  creator_id uuid NOT NULL, capacity_minor bigint NOT NULL CHECK(capacity_minor BETWEEN 1 AND 100000000000),
  used_minor bigint NOT NULL DEFAULT 0 CHECK(used_minor>=0 AND used_minor<=capacity_minor),
  revision bigint NOT NULL DEFAULT 1 CHECK(revision>0)
);
CREATE TABLE salapiya_p0.gate_transition(
  id uuid PRIMARY KEY, source_id uuid NOT NULL REFERENCES salapiya_p0.gate_source(id),
  actor_id uuid NOT NULL, operation text NOT NULL CHECK(operation IN ('allocate','revise')),
  amount_minor bigint NOT NULL CHECK(amount_minor BETWEEN 1 AND 100000000000),
  revision bigint NOT NULL, UNIQUE(source_id,revision)
);
CREATE TRIGGER p0_gate_transition_immutable BEFORE UPDATE OR DELETE ON salapiya_p0.gate_transition
  FOR EACH ROW EXECUTE FUNCTION salapiya_p0.immutable();
CREATE TABLE salapiya_p0.gate_receipt(
  actor_id uuid, id uuid, payload jsonb NOT NULL, result jsonb NOT NULL, PRIMARY KEY(actor_id,id)
);

CREATE FUNCTION public.p0_gate_capacity(command_id uuid, command_payload text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); data jsonb; source salapiya_p0.gate_source;
  prior salapiya_p0.gate_receipt; reason text; amount bigint; result jsonb;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='42501'; END IF;
  -- Current session authority is rechecked, not resurrected by an archive/JWT.
  PERFORM 1 FROM auth.sessions s WHERE s.user_id=actor AND s.id::text=auth.jwt()->>'session_id' FOR SHARE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome','rejected','reason','session_revoked'); END IF;
  IF command_id IS NULL OR command_payload IS NULL OR octet_length(command_payload)>4096 THEN
    RAISE EXCEPTION 'invalid command' USING ERRCODE='22023'; END IF;
  data:=command_payload::jsonb;
  IF jsonb_typeof(data) IS DISTINCT FROM 'object' OR
    data-ARRAY['source_id','operation','amount_minor','expected_revision']!='{}'::jsonb OR
    NOT(data ?& ARRAY['source_id','operation','amount_minor','expected_revision']) OR
    jsonb_typeof(data->'source_id') IS DISTINCT FROM 'string' OR
    (data->>'source_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR
    (data->>'operation') NOT IN ('allocate','revise') OR
    jsonb_typeof(data->'amount_minor') IS DISTINCT FROM 'string' OR
    (data->>'amount_minor') !~ '^[1-9][0-9]{0,11}$' OR
    jsonb_typeof(data->'expected_revision') IS DISTINCT FROM 'number' OR
    (data->>'expected_revision') !~ '^(0|[1-9][0-9]{0,14})$' THEN
    RETURN jsonb_build_object('outcome','rejected','reason','invalid_payload'); END IF;
  amount:=(data->>'amount_minor')::bigint;
  IF amount>100000000000 THEN RETURN jsonb_build_object('outcome','rejected','reason','amount_out_of_range'); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||command_id::text,2));
  SELECT * INTO source FROM salapiya_p0.gate_source WHERE id=(data->>'source_id')::uuid FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome','rejected','reason','source_or_membership_unavailable'); END IF;
  -- Lock membership until commit: removal cannot race validation then posting.
  PERFORM 1 FROM salapiya_p0.gate_member WHERE group_id=source.group_id AND user_id=actor AND active FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome','rejected','reason','source_or_membership_unavailable'); END IF;
  SELECT * INTO prior FROM salapiya_p0.gate_receipt WHERE actor_id=actor AND id=command_id;
  IF FOUND THEN
    IF prior.payload!=data THEN RAISE EXCEPTION 'command payload mismatch' USING ERRCODE='22023'; END IF;
    RETURN prior.result;
  END IF;
  IF data->>'operation'='revise' AND source.creator_id!=actor THEN reason:='creator_required';
  ELSIF data->>'operation'='revise' AND (data->>'expected_revision')::bigint!=source.revision THEN reason:='stale_revision';
  ELSIF data->>'operation'='revise' AND amount<source.used_minor THEN reason:='capacity_below_accepted';
  ELSIF data->>'operation'='allocate' AND (data->>'expected_revision')::bigint!=0 AND (data->>'expected_revision')::bigint!=source.revision THEN reason:='stale_revision';
  ELSIF data->>'operation'='allocate' AND amount>source.capacity_minor-source.used_minor THEN reason:='capacity_exceeded'; END IF;
  IF reason IS NULL THEN
    UPDATE salapiya_p0.gate_source SET
      capacity_minor=CASE WHEN data->>'operation'='revise' THEN amount ELSE capacity_minor END,
      used_minor=used_minor+CASE WHEN data->>'operation'='allocate' THEN amount ELSE 0 END,
      revision=revision+1 WHERE id=source.id RETURNING * INTO source;
    INSERT INTO salapiya_p0.gate_transition VALUES(command_id,source.id,actor,data->>'operation',amount,source.revision);
    result:=jsonb_build_object('outcome','accepted','revision',source.revision::text);
  ELSE result:=jsonb_build_object('outcome','rejected','reason',reason); END IF;
  INSERT INTO salapiya_p0.gate_receipt VALUES(actor,command_id,data,result);
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.p0_gate_capacity(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.p0_gate_capacity(uuid,text) TO authenticated;
COMMIT;
