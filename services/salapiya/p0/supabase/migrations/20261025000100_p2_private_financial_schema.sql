-- Additive P2 schema. Historical P0/web tables and hosted evidence are untouched.
BEGIN;
CREATE SCHEMA salapiya_p2;
REVOKE ALL ON SCHEMA salapiya_p2 FROM PUBLIC,anon,authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA salapiya_p2 REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE TABLE public.p2_profile (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL UNIQUE,
  name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200),
  revision bigint NOT NULL DEFAULT 0 CHECK(revision>=0), UNIQUE(id,owner_id)
);
CREATE TABLE public.p2_command (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL, profile_id uuid NOT NULL,
  payload text NOT NULL, plan text NOT NULL, sequence_no bigint NOT NULL CHECK(sequence_no>0),
  recorded_at text NOT NULL, UNIQUE(profile_id,sequence_no), UNIQUE(id,profile_id),
  FOREIGN KEY(profile_id,owner_id) REFERENCES public.p2_profile(id,owner_id)
);
CREATE TABLE salapiya_p2.account (
  id uuid NOT NULL, profile_id uuid NOT NULL REFERENCES public.p2_profile(id),
  name text NOT NULL, kind text NOT NULL CHECK(kind IN ('Cash','Bank','Mobile wallet','Checking','Savings')),
  cutoff text NOT NULL, institution text NOT NULL, notes text NOT NULL,
  archived boolean NOT NULL DEFAULT false, PRIMARY KEY(profile_id,id)
);
CREATE UNIQUE INDEX p2_account_name ON salapiya_p2.account(profile_id,lower(name));
CREATE TABLE salapiya_p2.category (
  id text NOT NULL, profile_id uuid NOT NULL REFERENCES public.p2_profile(id),
  name text NOT NULL, kind text NOT NULL CHECK(kind IN ('income','expense')),
  PRIMARY KEY(profile_id,id)
);
CREATE UNIQUE INDEX p2_category_name ON salapiya_p2.category(profile_id,lower(name));
CREATE TABLE salapiya_p2.revision (
  id uuid PRIMARY KEY, profile_id uuid NOT NULL, action_id uuid NOT NULL,
  revision_no integer NOT NULL CHECK(revision_no>0), kind text NOT NULL,
  change_kind text NOT NULL CHECK(change_kind IN ('create','replace','reverse')),
  effective_date text NOT NULL, title text NOT NULL, amount_minor numeric(40,0) NOT NULL,
  values_json jsonb NOT NULL, previous_id uuid UNIQUE, source_id uuid,
  UNIQUE(id,profile_id), UNIQUE(profile_id,action_id,revision_no),
  FOREIGN KEY(id,profile_id) REFERENCES public.p2_command(id,profile_id),
  FOREIGN KEY(previous_id,profile_id) REFERENCES salapiya_p2.revision(id,profile_id),
  FOREIGN KEY(source_id,profile_id) REFERENCES salapiya_p2.revision(id,profile_id)
);
CREATE TABLE salapiya_p2.posting (
  id text PRIMARY KEY, profile_id uuid NOT NULL, revision_id uuid NOT NULL,
  line integer NOT NULL, ledger text NOT NULL CHECK(ledger IN ('cash','expense','income','equity')),
  account_id uuid, category_id text, effective_date text NOT NULL,
  amount_minor bigint NOT NULL CHECK(amount_minor<>0 AND amount_minor BETWEEN -100000000000 AND 100000000000),
  UNIQUE(revision_id,line),
  CHECK((ledger='cash' AND account_id IS NOT NULL AND category_id IS NULL) OR
    (ledger IN ('expense','income') AND account_id IS NULL AND category_id IS NOT NULL) OR
    (ledger='equity' AND account_id IS NULL AND category_id IS NULL)),
  FOREIGN KEY(revision_id,profile_id) REFERENCES salapiya_p2.revision(id,profile_id),
  FOREIGN KEY(account_id,profile_id) REFERENCES salapiya_p2.account(id,profile_id),
  FOREIGN KEY(category_id,profile_id) REFERENCES salapiya_p2.category(id,profile_id)
);
CREATE INDEX p2_posting_history ON salapiya_p2.posting(profile_id,account_id,effective_date);
CREATE INDEX p2_revision_sources ON salapiya_p2.revision(profile_id,source_id);
CREATE INDEX p2_command_owner ON public.p2_command(owner_id,profile_id,sequence_no);
CREATE TABLE salapiya_p2.receipt (
  owner_id uuid NOT NULL, id uuid NOT NULL, envelope jsonb NOT NULL,
  result jsonb NOT NULL, PRIMARY KEY(owner_id,id)
);
CREATE TABLE salapiya_p2.enrollment (
  owner_id uuid NOT NULL, id uuid NOT NULL, profile_id uuid NOT NULL,
  name text NOT NULL, snapshot jsonb NOT NULL, published boolean NOT NULL DEFAULT false,
  PRIMARY KEY(owner_id,id)
);
CREATE VIEW salapiya_p2.current_revision AS
 SELECT r.* FROM salapiya_p2.revision r WHERE r.change_kind<>'reverse'
 AND NOT EXISTS(SELECT 1 FROM salapiya_p2.revision n WHERE n.previous_id=r.id);

CREATE TRIGGER p2_command_immutable BEFORE UPDATE OR DELETE ON public.p2_command
 FOR EACH ROW EXECUTE FUNCTION salapiya_p0.immutable();
CREATE TRIGGER p2_revision_immutable BEFORE UPDATE OR DELETE ON salapiya_p2.revision
 FOR EACH ROW EXECUTE FUNCTION salapiya_p0.immutable();
CREATE TRIGGER p2_posting_immutable BEFORE UPDATE OR DELETE ON salapiya_p2.posting
 FOR EACH ROW EXECUTE FUNCTION salapiya_p0.immutable();
CREATE TRIGGER p2_receipt_immutable BEFORE UPDATE OR DELETE ON salapiya_p2.receipt
 FOR EACH ROW EXECUTE FUNCTION salapiya_p0.immutable();
ALTER TABLE public.p2_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.p2_command ENABLE ROW LEVEL SECURITY;
CREATE POLICY p2_profile_owner ON public.p2_profile FOR SELECT TO authenticated USING(owner_id=(SELECT auth.uid()));
CREATE POLICY p2_command_owner ON public.p2_command FOR SELECT TO authenticated USING(owner_id=(SELECT auth.uid()));
REVOKE ALL ON public.p2_profile,public.p2_command FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.p2_profile,public.p2_command TO authenticated;

CREATE FUNCTION salapiya_p2.value(v jsonb,k text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS
 $$ SELECT btrim(coalesce(v->>k,'')) $$;
CREATE FUNCTION salapiya_p2.required(v jsonb,k text,lim integer DEFAULT 2000) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE x text:=salapiya_p2.value(v,k); BEGIN
 IF length(x)<1 OR length(x)>lim THEN RAISE EXCEPTION 'invalid %',k USING ERRCODE='22023'; END IF;
 RETURN x; END $$;
CREATE FUNCTION salapiya_p2.day(x text) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
BEGIN
 IF x IS NULL OR x !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR left(x,4)::integer<1900
 OR to_char(x::date,'YYYY-MM-DD')<>x THEN RAISE EXCEPTION 'invalid economic date' USING ERRCODE='22023'; END IF;
 RETURN x;
END $$;
CREATE FUNCTION salapiya_p2.php(v jsonb,k text,allow_zero boolean DEFAULT false,signed_value boolean DEFAULT false,wide boolean DEFAULT false)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE x text:=salapiya_p2.value(v,k); n numeric; BEGIN
 IF length(x)>100 OR x !~ '^-?(0|[1-9][0-9]*)(\.[0-9]{1,2})?$' OR (left(x,1)='-' AND NOT signed_value)
 THEN RAISE EXCEPTION 'invalid exact amount' USING ERRCODE='22023'; END IF;
 n:=(x::numeric*100)::numeric(40,0);
 IF (n=0 AND NOT allow_zero) OR (NOT signed_value AND n<0) OR
   (NOT wide AND abs(n)>100000000000) OR (wide AND (n< -9223372036854775808 OR n>9223372036854775807))
 THEN RAISE EXCEPTION 'amount outside contract' USING ERRCODE='22023'; END IF;
 RETURN n; END $$;
CREATE FUNCTION salapiya_p2.post(ledger text,n numeric,d text,a text DEFAULT NULL,c text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT jsonb_build_object('ledger',ledger,'amount',n::text,'date',d,'account',a,'category',c) $$;
CREATE FUNCTION salapiya_p2.balance(p uuid,a uuid,d text,excluded uuid DEFAULT NULL)
RETURNS numeric LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce(sum(x.amount_minor::numeric),0) FROM salapiya_p2.posting x
 JOIN salapiya_p2.current_revision r ON r.id=x.revision_id
 WHERE x.profile_id=p AND x.account_id=a AND x.effective_date<=d AND (excluded IS NULL OR r.id<>excluded) $$;
CREATE FUNCTION salapiya_p2.source_count(p uuid,a uuid,d text,excluded uuid DEFAULT NULL)
RETURNS bigint LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT count(*) FROM salapiya_p2.posting x JOIN salapiya_p2.current_revision r ON r.id=x.revision_id
 WHERE x.profile_id=p AND x.account_id=a AND x.effective_date<=d AND (excluded IS NULL OR r.id<>excluded) $$;
REVOKE ALL ON ALL TABLES IN SCHEMA salapiya_p2 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA salapiya_p2 FROM PUBLIC,anon,authenticated;
COMMIT;
