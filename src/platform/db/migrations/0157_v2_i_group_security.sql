-- Custom SQL migration file, put your code below! --
/* Group authority is independent of workspace ownership. Permission predicates
 * return booleans/opaque IDs only, have a fixed path, and never accept a user ID. */
GRANT USAGE ON SCHEMA sharing TO app_domain;
CREATE POLICY sharing_profile_predicate ON core.user_profile FOR SELECT TO migration_owner USING(user_id=NULLIF(current_setting('app.user_id',true),'')::uuid);
REVOKE ALL ON ALL TABLES IN SCHEMA sharing FROM PUBLIC,app_domain,auth_adapter,queue_broker,worker_domain,lifecycle_operator;
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['expense_group','participant','membership','invitation','participant_claim','group_command_receipt','shared_expense','expense_revision','payer_contribution','participant_share','member_record_access'] LOOP
  EXECUTE format('ALTER TABLE sharing.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE sharing.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY predicate_owner ON sharing.%I TO migration_owner USING(true) WITH CHECK(true)',n);
 END LOOP;
END $$;
ALTER TABLE audit.group_revision ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.group_revision FORCE ROW LEVEL SECURITY;
CREATE POLICY predicate_owner ON audit.group_revision TO migration_owner USING(true) WITH CHECK(true);
REVOKE ALL ON audit.group_revision FROM PUBLIC,app_domain,auth_adapter,queue_broker,worker_domain,lifecycle_operator;

CREATE FUNCTION sharing.actor(g uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT p.id FROM sharing.participant p JOIN core.user_profile u ON u.user_id=p.registered_user_id
 WHERE p.group_id=g AND p.registered_user_id=NULLIF(current_setting('app.user_id',true),'')::uuid AND u.lifecycle='active'
$$;
CREATE FUNCTION sharing.active(g uuid, owner_only boolean DEFAULT false) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM sharing.membership m WHERE m.group_id=g AND m.participant_id=sharing.actor(g) AND m.left_at IS NULL AND (NOT owner_only OR m.role='owner'))
$$;
CREATE FUNCTION sharing.visible(g uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM sharing.membership m WHERE m.group_id=g AND m.participant_id=sharing.actor(g))
$$;
CREATE FUNCTION sharing.can_read_expense(g uuid,e uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT sharing.active(g) OR EXISTS(SELECT 1 FROM sharing.member_record_access a JOIN sharing.membership m ON m.group_id=a.group_id AND m.id=a.membership_id WHERE a.group_id=g AND a.expense_id=e AND m.participant_id=sharing.actor(g))
$$;
CREATE FUNCTION sharing.bootstrap(g uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM sharing.expense_group x WHERE x.id=g AND x.created_by_user_id=NULLIF(current_setting('app.user_id',true),'')::uuid AND x.version=1 AND NOT EXISTS(SELECT 1 FROM sharing.membership m WHERE m.group_id=g))
$$;
CREATE FUNCTION sharing.participant_visible(g uuid,p uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT sharing.active(g) OR p=sharing.actor(g) OR EXISTS(SELECT 1 FROM sharing.payer_contribution x WHERE x.group_id=g AND x.participant_id=p AND sharing.can_read_expense(g,x.expense_id)) OR EXISTS(SELECT 1 FROM sharing.participant_share x WHERE x.group_id=g AND x.participant_id=p AND sharing.can_read_expense(g,x.expense_id))
$$;
REVOKE ALL ON FUNCTION sharing.actor(uuid),sharing.active(uuid,boolean),sharing.visible(uuid),sharing.can_read_expense(uuid,uuid),sharing.bootstrap(uuid),sharing.participant_visible(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sharing.actor(uuid),sharing.active(uuid,boolean),sharing.visible(uuid),sharing.can_read_expense(uuid,uuid),sharing.bootstrap(uuid),sharing.participant_visible(uuid,uuid) TO app_domain;

GRANT SELECT,INSERT,UPDATE ON sharing.expense_group,sharing.participant,sharing.membership,sharing.invitation,sharing.participant_claim,sharing.group_command_receipt,sharing.shared_expense,sharing.expense_revision TO app_domain;
GRANT SELECT,INSERT ON sharing.payer_contribution,sharing.participant_share,sharing.member_record_access,audit.group_revision TO app_domain;
CREATE POLICY group_read ON sharing.expense_group FOR SELECT TO app_domain USING(sharing.visible(id) OR created_by_user_id=NULLIF(current_setting('app.user_id',true),'')::uuid);
CREATE POLICY group_create ON sharing.expense_group FOR INSERT TO app_domain WITH CHECK(created_by_user_id=NULLIF(current_setting('app.user_id',true),'')::uuid AND version=1 AND EXISTS(SELECT 1 FROM core.user_profile WHERE user_id=created_by_user_id AND lifecycle='active'));
CREATE POLICY group_update ON sharing.expense_group FOR UPDATE TO app_domain USING(sharing.active(id)) WITH CHECK(sharing.active(id) OR sharing.visible(id));
CREATE POLICY participant_read ON sharing.participant FOR SELECT TO app_domain USING(sharing.participant_visible(group_id,id) OR sharing.bootstrap(group_id));
CREATE POLICY participant_create ON sharing.participant FOR INSERT TO app_domain WITH CHECK((sharing.active(group_id,true) AND identity_kind='manual') OR (sharing.bootstrap(group_id) AND registered_user_id=NULLIF(current_setting('app.user_id',true),'')::uuid));
/* Identity claims are changed only by the token-bound acceptance function. */
CREATE POLICY member_read ON sharing.membership FOR SELECT TO app_domain USING(sharing.active(group_id) OR participant_id=sharing.actor(group_id));
CREATE POLICY member_insert ON sharing.membership FOR INSERT TO app_domain WITH CHECK(sharing.bootstrap(group_id) AND role='owner' AND participant_id=sharing.actor(group_id));
CREATE POLICY member_update ON sharing.membership FOR UPDATE TO app_domain USING(sharing.active(group_id,true) OR (sharing.active(group_id) AND participant_id=sharing.actor(group_id))) WITH CHECK(sharing.visible(group_id));
CREATE POLICY invitation_owner ON sharing.invitation TO app_domain USING(sharing.active(group_id,true)) WITH CHECK(sharing.active(group_id,true));
CREATE POLICY claim_owner ON sharing.participant_claim TO app_domain USING(sharing.active(group_id,true)) WITH CHECK(sharing.active(group_id,true));
CREATE POLICY receipt_access ON sharing.group_command_receipt TO app_domain USING(sharing.active(group_id) OR actor_participant_id=sharing.actor(group_id)) WITH CHECK(actor_participant_id=sharing.actor(group_id));
CREATE POLICY expense_read ON sharing.shared_expense FOR SELECT TO app_domain USING(sharing.can_read_expense(group_id,id));
CREATE POLICY expense_write ON sharing.shared_expense FOR INSERT TO app_domain WITH CHECK(sharing.active(group_id) AND created_by_participant_id=sharing.actor(group_id));
CREATE POLICY expense_update ON sharing.shared_expense FOR UPDATE TO app_domain USING(sharing.active(group_id) AND created_by_participant_id=sharing.actor(group_id)) WITH CHECK(created_by_participant_id=sharing.actor(group_id));
CREATE POLICY revision_read ON sharing.expense_revision FOR SELECT TO app_domain USING(sharing.can_read_expense(group_id,expense_id));
CREATE POLICY revision_write ON sharing.expense_revision FOR INSERT TO app_domain WITH CHECK(sharing.active(group_id) AND actor_participant_id=sharing.actor(group_id));
CREATE POLICY revision_finalize ON sharing.expense_revision FOR UPDATE TO app_domain USING(sharing.active(group_id) AND actor_participant_id=sharing.actor(group_id)) WITH CHECK(actor_participant_id=sharing.actor(group_id));
DO $$ DECLARE n text; BEGIN FOREACH n IN ARRAY ARRAY['payer_contribution','participant_share'] LOOP
 EXECUTE format('CREATE POLICY allocation_read ON sharing.%I FOR SELECT TO app_domain USING(sharing.can_read_expense(group_id,expense_id))',n);
 EXECUTE format('CREATE POLICY allocation_write ON sharing.%I FOR INSERT TO app_domain WITH CHECK(sharing.active(group_id))',n);
END LOOP; END $$;
CREATE POLICY entitlement_read ON sharing.member_record_access FOR SELECT TO app_domain USING(sharing.active(group_id) OR EXISTS(SELECT 1 FROM sharing.membership m WHERE m.group_id=group_id AND m.id=membership_id AND m.participant_id=sharing.actor(group_id)));
CREATE POLICY entitlement_write ON sharing.member_record_access FOR INSERT TO app_domain WITH CHECK(sharing.active(group_id));
CREATE POLICY audit_read ON audit.group_revision FOR SELECT TO app_domain USING(sharing.active(group_id) OR (subject_kind='expense' AND sharing.can_read_expense(group_id,subject_id)));
CREATE POLICY audit_insert ON audit.group_revision FOR INSERT TO app_domain WITH CHECK(actor_participant_id=sharing.actor(group_id));
--> statement-breakpoint
ALTER TABLE sharing.shared_expense ADD CONSTRAINT fk_expense_current FOREIGN KEY(group_id,id,current_revision_id) REFERENCES sharing.expense_revision(group_id,expense_id,id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE sharing.expense_revision ADD CONSTRAINT fk_expense_previous FOREIGN KEY(group_id,expense_id,previous_revision_id) REFERENCES sharing.expense_revision(group_id,expense_id,id);
ALTER TABLE sharing.membership ADD CONSTRAINT fk_membership_invitation FOREIGN KEY(group_id,accepted_invitation_id) REFERENCES sharing.invitation(group_id,id);
CREATE INDEX ix_participant_user ON sharing.participant(registered_user_id,group_id);
CREATE INDEX ix_expense_date ON sharing.expense_revision(group_id,expense_date,id);
CREATE INDEX ix_access_expense ON sharing.member_record_access(group_id,expense_id,membership_id);

CREATE FUNCTION sharing.guard_group_write() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE g uuid; owner_ok boolean;
BEGIN
 g:=coalesce((to_jsonb(NEW)->>'group_id')::uuid,NEW.id);
 PERFORM 1 FROM sharing.expense_group WHERE id=g FOR UPDATE;
 IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR to_jsonb(NEW)->>'group_id' IS DISTINCT FROM to_jsonb(OLD)->>'group_id') THEN RAISE EXCEPTION 'immutable group scope' USING ERRCODE='23514'; END IF;
 IF current_user='migration_owner' THEN RETURN NEW; END IF; -- narrow acceptance function only
 owner_ok:=sharing.active(g,true);
 IF (TG_TABLE_NAME IN ('membership','invitation','participant_claim') AND NOT sharing.bootstrap(g)) OR (TG_TABLE_NAME='expense_group' AND TG_OP='UPDATE' AND (to_jsonb(NEW)->'name' IS DISTINCT FROM to_jsonb(OLD)->'name' OR to_jsonb(NEW)->'archived_at' IS DISTINCT FROM to_jsonb(OLD)->'archived_at')) THEN
  PERFORM ops.assert_recent_auth(NULLIF(current_setting('app.session_id',true),'')::uuid);
 END IF;
 IF TG_TABLE_NAME='expense_group' AND TG_OP='UPDATE' THEN
  IF NEW.id<>OLD.id OR NEW.currency<>OLD.currency OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id OR NEW.created_at<>OLD.created_at OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'invalid group version or identity' USING ERRCODE='23514'; END IF;
  IF (NEW.name<>OLD.name OR NEW.archived_at IS DISTINCT FROM OLD.archived_at) AND NOT owner_ok THEN RAISE EXCEPTION 'owner required' USING ERRCODE='42501'; END IF;
 ELSIF TG_TABLE_NAME='membership' AND TG_OP='UPDATE' THEN
  IF OLD.left_at IS NOT NULL OR NEW.participant_id<>OLD.participant_id OR NEW.joined_at<>OLD.joined_at OR NEW.accepted_invitation_id IS DISTINCT FROM OLD.accepted_invitation_id OR NEW.history_policy_version<>OLD.history_policy_version THEN RAISE EXCEPTION 'immutable membership interval' USING ERRCODE='23514'; END IF;
  IF NOT owner_ok AND (NEW.participant_id<>sharing.actor(g) OR NEW.role<>OLD.role OR NEW.left_at IS NULL OR NEW.exit_kind<>'left') THEN RAISE EXCEPTION 'membership authority required' USING ERRCODE='42501'; END IF;
 ELSIF TG_TABLE_NAME='participant' AND TG_OP='UPDATE' THEN RAISE EXCEPTION 'identity claims require verified invitation' USING ERRCODE='42501';
 ELSIF TG_TABLE_NAME='invitation' AND TG_OP='UPDATE' THEN
  IF OLD.state<>'pending' OR NEW.state NOT IN('revoked','expired') OR (to_jsonb(NEW)-'state') IS DISTINCT FROM (to_jsonb(OLD)-'state') THEN RAISE EXCEPTION 'invalid invitation transition' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION sharing.guard_group_write() FROM PUBLIC;
DO $$ DECLARE n text; BEGIN FOREACH n IN ARRAY ARRAY['expense_group','participant','membership','invitation','participant_claim','group_command_receipt','shared_expense','expense_revision','payer_contribution','participant_share','member_record_access'] LOOP
 EXECUTE format('CREATE TRIGGER a_group_lock BEFORE INSERT OR UPDATE ON sharing.%I FOR EACH ROW EXECUTE FUNCTION sharing.guard_group_write()',n);
END LOOP; END $$;

CREATE FUNCTION sharing.immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN RAISE EXCEPTION 'immutable shared evidence' USING ERRCODE='23514'; END $$;
REVOKE ALL ON FUNCTION sharing.immutable() FROM PUBLIC;
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON audit.group_revision FOR EACH ROW EXECUTE FUNCTION sharing.immutable();
CREATE TRIGGER contribution_immutable BEFORE UPDATE OR DELETE ON sharing.payer_contribution FOR EACH ROW EXECUTE FUNCTION sharing.immutable();
CREATE TRIGGER share_immutable BEFORE UPDATE OR DELETE ON sharing.participant_share FOR EACH ROW EXECUTE FUNCTION sharing.immutable();
CREATE TRIGGER entitlement_immutable BEFORE UPDATE OR DELETE ON sharing.member_record_access FOR EACH ROW EXECUTE FUNCTION sharing.immutable();

CREATE FUNCTION sharing.validate_group() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE g uuid; v integer; a timestamp with time zone;
BEGIN
 g:=coalesce((to_jsonb(NEW)->>'group_id')::uuid,NEW.id);
 SELECT version,archived_at INTO v,a FROM sharing.expense_group WHERE id=g;
 IF a IS NULL AND NOT EXISTS(SELECT 1 FROM sharing.membership WHERE group_id=g AND left_at IS NULL AND role='owner') THEN RAISE EXCEPTION 'active group must retain an owner' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM sharing.membership m JOIN sharing.participant p ON p.group_id=m.group_id AND p.id=m.participant_id WHERE m.group_id=g AND m.left_at IS NULL AND p.identity_kind<>'registered') THEN RAISE EXCEPTION 'manual participants cannot authenticate' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM audit.group_revision r JOIN sharing.group_command_receipt c ON c.group_id=r.group_id AND c.id=r.command_receipt_id WHERE r.group_id=g AND r.after_json=jsonb_build_object('groupVersion',v) AND c.state='completed') THEN RAISE EXCEPTION 'group mutation requires completed audited command' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION sharing.validate_group() FROM PUBLIC;
DO $$ DECLARE n text; BEGIN FOREACH n IN ARRAY ARRAY['expense_group','participant','membership','invitation','participant_claim','shared_expense','expense_revision','payer_contribution','participant_share','member_record_access'] LOOP
 EXECUTE format('CREATE CONSTRAINT TRIGGER group_command_integrity AFTER INSERT OR UPDATE ON sharing.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sharing.validate_group()',n);
END LOOP; END $$;

CREATE FUNCTION sharing.guard_receipt() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 IF TG_OP='UPDATE' AND (OLD.state<>'claimed' OR NEW.state<>'completed' OR (to_jsonb(NEW)-ARRAY['state','result_json','completed_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','result_json','completed_at'])) THEN RAISE EXCEPTION 'immutable completed group command' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER receipt_transition BEFORE UPDATE ON sharing.group_command_receipt FOR EACH ROW EXECUTE FUNCTION sharing.guard_receipt();
CREATE FUNCTION sharing.validate_receipt() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM sharing.group_command_receipt c JOIN audit.group_revision a ON a.group_id=c.group_id AND a.command_receipt_id=c.id WHERE c.group_id=NEW.group_id AND c.id=NEW.id AND c.state='completed' AND c.actor_participant_id=a.actor_participant_id AND c.result_json ?& ARRAY['groupId','version','subjectId'] AND (c.result_json-ARRAY['groupId','version','subjectId'])='{}'::jsonb) THEN RAISE EXCEPTION 'unfinished or unaudited group command' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER receipt_complete AFTER INSERT OR UPDATE ON sharing.group_command_receipt DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sharing.validate_receipt();
REVOKE ALL ON FUNCTION sharing.guard_receipt(),sharing.validate_receipt() FROM PUBLIC;
--> statement-breakpoint
/* Snapshot all bills visible at exit. Later revisions of those bills remain
 * readable. Rejoin opens a new interval; unrelated post-exit bills stay hidden. */
CREATE FUNCTION sharing.capture_exit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF OLD.left_at IS NULL AND NEW.left_at IS NOT NULL THEN
  INSERT INTO sharing.member_record_access(group_id,membership_id,expense_id) SELECT NEW.group_id,NEW.id,id FROM sharing.shared_expense WHERE group_id=NEW.group_id ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION sharing.capture_exit() FROM PUBLIC;
CREATE TRIGGER capture_exit BEFORE UPDATE ON sharing.membership FOR EACH ROW EXECUTE FUNCTION sharing.capture_exit();

CREATE FUNCTION sharing.guard_bill() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE r sharing.expense_revision%ROWTYPE; e sharing.shared_expense%ROWTYPE;
BEGIN
 IF TG_TABLE_NAME='expense_revision' THEN
  IF TG_OP='UPDATE' AND (OLD.state<>'building' OR NEW.state NOT IN('finalized','void') OR (to_jsonb(NEW)-'state') IS DISTINCT FROM (to_jsonb(OLD)-'state')) THEN RAISE EXCEPTION 'finalized bill revision is immutable' USING ERRCODE='23514'; END IF;
  SELECT * INTO e FROM sharing.shared_expense WHERE group_id=NEW.group_id AND id=NEW.expense_id;
  IF e.created_by_participant_id<>sharing.actor(NEW.group_id) THEN RAISE EXCEPTION 'only bill creator may revise' USING ERRCODE='42501'; END IF;
 ELSE
  SELECT * INTO r FROM sharing.expense_revision WHERE group_id=NEW.group_id AND id=NEW.expense_revision_id;
  IF r.state<>'building' OR r.actor_participant_id<>sharing.actor(NEW.group_id) THEN RAISE EXCEPTION 'allocation requires owned building revision' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(SELECT 1 FROM sharing.participant p WHERE p.group_id=NEW.group_id AND p.id=NEW.participant_id AND (p.identity_kind='manual' OR EXISTS(SELECT 1 FROM sharing.membership m WHERE m.group_id=p.group_id AND m.participant_id=p.id AND m.left_at IS NULL))) THEN RAISE EXCEPTION 'new bills require current participants' USING ERRCODE='23514'; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM sharing.expense_group WHERE id=NEW.group_id AND archived_at IS NOT NULL) THEN RAISE EXCEPTION 'archived group is read only' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION sharing.guard_bill() FROM PUBLIC;
CREATE TRIGGER bill_guard BEFORE INSERT OR UPDATE ON sharing.expense_revision FOR EACH ROW EXECUTE FUNCTION sharing.guard_bill();
CREATE TRIGGER contribution_parent BEFORE INSERT ON sharing.payer_contribution FOR EACH ROW EXECUTE FUNCTION sharing.guard_bill();
CREATE TRIGGER share_parent BEFORE INSERT ON sharing.participant_share FOR EACH ROW EXECUTE FUNCTION sharing.guard_bill();

CREATE FUNCTION sharing.validate_bill() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE r sharing.expense_revision%ROWTYPE; n bigint; q numeric; remainder numeric;
BEGIN
 SELECT * INTO r FROM sharing.expense_revision WHERE group_id=NEW.group_id AND id=NEW.id;
 IF r.state='building' THEN RAISE EXCEPTION 'unfinished shared bill' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM sharing.shared_expense e WHERE e.group_id=r.group_id AND e.id=r.expense_id AND (e.current_revision_id=r.id OR EXISTS(SELECT 1 FROM sharing.expense_revision next WHERE next.group_id=r.group_id AND next.previous_revision_id=r.id))) THEN RAISE EXCEPTION 'orphan bill revision' USING ERRCODE='23514'; END IF;
 IF r.revision_no>1 AND NOT EXISTS(SELECT 1 FROM sharing.expense_revision p WHERE p.group_id=r.group_id AND p.id=r.previous_revision_id AND p.expense_id=r.expense_id AND p.revision_no=r.revision_no-1 AND p.state<>'building') THEN RAISE EXCEPTION 'invalid bill history chain' USING ERRCODE='23514'; END IF;
 IF r.state='void' THEN
  IF EXISTS(SELECT 1 FROM sharing.payer_contribution WHERE group_id=r.group_id AND expense_revision_id=r.id) OR EXISTS(SELECT 1 FROM sharing.participant_share WHERE group_id=r.group_id AND expense_revision_id=r.id) THEN RAISE EXCEPTION 'void revision has allocations' USING ERRCODE='23514'; END IF;
 ELSE
  IF (SELECT coalesce(sum(amount_minor::numeric),0) FROM sharing.payer_contribution WHERE group_id=r.group_id AND expense_revision_id=r.id)<>r.total_minor OR (SELECT coalesce(sum(amount_minor::numeric),0) FROM sharing.participant_share WHERE group_id=r.group_id AND expense_revision_id=r.id)<>r.total_minor THEN RAISE EXCEPTION 'payer and share totals must each equal bill total' USING ERRCODE='23514'; END IF;
  SELECT count(*) INTO n FROM sharing.participant_share WHERE group_id=r.group_id AND expense_revision_id=r.id;
  q:=div(r.total_minor::numeric,n); remainder:=mod(r.total_minor::numeric,n);
  IF EXISTS(SELECT 1 FROM sharing.participant_share s WHERE s.group_id=r.group_id AND s.expense_revision_id=r.id AND (s.rounding_rank>=n OR (r.split_method='equal' AND (s.amount_minor<>q+CASE WHEN s.rounding_rank<remainder THEN 1 ELSE 0 END OR s.rounding_extra_minor<>CASE WHEN s.rounding_rank<remainder THEN 1 ELSE 0 END)) OR (r.split_method='exact' AND s.rounding_extra_minor<>0))) THEN RAISE EXCEPTION 'invalid deterministic split' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION sharing.validate_bill() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER bill_totals AFTER INSERT OR UPDATE ON sharing.expense_revision DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sharing.validate_bill();
--> statement-breakpoint
CREATE FUNCTION sharing.review_invitation(h text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE i sharing.invitation%ROWTYPE; g sharing.expense_group%ROWTYPE; claim sharing.participant_claim%ROWTYPE; paid numeric; consumed numeric;
BEGIN
 SELECT x.* INTO i FROM sharing.invitation x JOIN auth."user" u ON lower(u.email)=x.target_email_normalized AND u.email_verified
 WHERE x.token_hash=h AND u.id=NULLIF(current_setting('app.user_id',true),'')::uuid AND x.state='pending' AND x.expires_at>clock_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'invitation unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO g FROM sharing.expense_group WHERE id=i.group_id AND archived_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'invitation unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO claim FROM sharing.participant_claim WHERE group_id=g.id AND invitation_id=i.id AND state='pending';
 SELECT coalesce(sum(p.amount_minor::numeric),0) INTO paid FROM sharing.payer_contribution p JOIN sharing.shared_expense e ON e.group_id=p.group_id AND e.current_revision_id=p.expense_revision_id JOIN sharing.expense_revision r ON r.group_id=e.group_id AND r.id=e.current_revision_id AND r.state='finalized' WHERE p.group_id=g.id AND p.participant_id=claim.participant_id;
 SELECT coalesce(sum(p.amount_minor::numeric),0) INTO consumed FROM sharing.participant_share p JOIN sharing.shared_expense e ON e.group_id=p.group_id AND e.current_revision_id=p.expense_revision_id JOIN sharing.expense_revision r ON r.group_id=e.group_id AND r.id=e.current_revision_id AND r.state='finalized' WHERE p.group_id=g.id AND p.participant_id=claim.participant_id;
 RETURN jsonb_build_object('groupId',g.id,'groupName',g.name,'version',g.version,'invitationId',i.id,'claimParticipantId',claim.participant_id,'claimName',(SELECT display_name FROM sharing.participant WHERE group_id=g.id AND id=claim.participant_id),'paidMinor',paid::text,'shareMinor',consumed::text,'netMinor',(paid-consumed)::text,'historyPolicyVersion',1,'historyNotice','Joining grants visibility to existing group bills. Leaving preserves read-only access to bills visible at exit and their later revisions. Unrelated later records are hidden. Claiming a manual identity accepts its recorded history and balances; it does not post private money.');
END $$;
CREATE FUNCTION sharing.accept_invitation(h text,command_id uuid,review_version integer,consent boolean,display_name text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE i sharing.invitation%ROWTYPE; g sharing.expense_group%ROWTYPE; p uuid; c sharing.participant_claim%ROWTYPE; review jsonb; receipt uuid:=gen_random_uuid(); result jsonb; uid uuid:=NULLIF(current_setting('app.user_id',true),'')::uuid; fingerprint text;
BEGIN
 IF NOT consent OR length(btrim(display_name)) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'explicit history and balance consent required' USING ERRCODE='23514'; END IF;
 SELECT x.* INTO i FROM sharing.invitation x JOIN auth."user" u ON lower(u.email)=x.target_email_normalized AND u.email_verified WHERE x.token_hash=h AND u.id=uid;
 IF NOT FOUND THEN RAISE EXCEPTION 'invitation unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO g FROM sharing.expense_group WHERE id=i.group_id FOR UPDATE;
 -- Refresh after acquiring the shared serialization lock.
 SELECT * INTO i FROM sharing.invitation WHERE id=i.id;
 fingerprint:=encode(sha256(convert_to(jsonb_build_object('tokenHash',h,'version',review_version,'consent',consent,'displayName',display_name)::text,'UTF8')),'hex');
 IF i.state='accepted' AND i.accepted_user_id=uid THEN
  SELECT result_json INTO result FROM sharing.group_command_receipt WHERE group_id=g.id AND client_command_id=command_id AND actor_participant_id=sharing.actor(g.id) AND payload_hash=fingerprint;
  IF result IS NOT NULL AND sharing.visible(g.id) THEN RETURN result; END IF;
 END IF;
 IF g.version<>review_version OR g.archived_at IS NOT NULL THEN RAISE EXCEPTION 'stale invitation review' USING ERRCODE='40001'; END IF;
 review:=sharing.review_invitation(h);
 IF sharing.actor(g.id) IS NULL AND NOT EXISTS(SELECT 1 FROM core.user_profile WHERE user_id=uid AND lifecycle='active') THEN RAISE EXCEPTION 'active identity required' USING ERRCODE='42501'; END IF;
 SELECT * INTO c FROM sharing.participant_claim WHERE group_id=g.id AND invitation_id=i.id AND state='pending';
 SELECT id INTO p FROM sharing.participant WHERE group_id=g.id AND registered_user_id=uid;
 IF c.id IS NOT NULL THEN
  IF p IS NOT NULL OR NOT EXISTS(SELECT 1 FROM sharing.participant WHERE group_id=g.id AND id=c.participant_id AND identity_kind='manual') THEN RAISE EXCEPTION 'manual claim unavailable' USING ERRCODE='23514'; END IF;
  p:=c.participant_id;
  UPDATE sharing.participant SET registered_user_id=uid,identity_kind='registered',linked_at=clock_timestamp() WHERE group_id=g.id AND id=p;
  UPDATE sharing.participant_claim SET claiming_user_id=uid,state='accepted',balance_review_json=review,review_group_version=g.version,reviewed_at=clock_timestamp() WHERE id=c.id;
 ELSIF p IS NULL THEN
  p:=gen_random_uuid();
  INSERT INTO sharing.participant(id,group_id,registered_user_id,display_name,identity_kind,linked_at) VALUES(p,g.id,uid,btrim(display_name),'registered',clock_timestamp());
 END IF;
 IF EXISTS(SELECT 1 FROM sharing.membership WHERE group_id=g.id AND participant_id=p AND left_at IS NULL) THEN RAISE EXCEPTION 'already a current member' USING ERRCODE='23514'; END IF;
 UPDATE sharing.invitation SET state='accepted',accepted_user_id=uid,accepted_at=clock_timestamp() WHERE id=i.id;
 INSERT INTO sharing.membership(group_id,participant_id,role,accepted_invitation_id) VALUES(g.id,p,'member',i.id);
 INSERT INTO sharing.group_command_receipt(id,group_id,client_command_id,actor_participant_id,command_type,payload_hash) VALUES(receipt,g.id,command_id,p,'accept_invitation',fingerprint);
 UPDATE sharing.expense_group SET version=version+1 WHERE id=g.id;
 result:=jsonb_build_object('groupId',g.id,'version',g.version+1,'subjectId',p);
 INSERT INTO audit.group_revision(group_id,actor_participant_id,command_receipt_id,subject_kind,subject_id,subject_version,operation,after_json) VALUES(g.id,p,receipt,'membership',p,g.version+1,'accept_invitation',jsonb_build_object('groupVersion',g.version+1));
 UPDATE sharing.group_command_receipt SET state='completed',result_json=result,completed_at=clock_timestamp() WHERE id=receipt;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION sharing.review_invitation(text),sharing.accept_invitation(text,uuid,integer,boolean,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sharing.review_invitation(text),sharing.accept_invitation(text,uuid,integer,boolean,text) TO app_domain;
