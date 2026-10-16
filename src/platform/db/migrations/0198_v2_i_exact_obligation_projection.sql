/* Preserve the relationship-wide advance acknowledgement check for every
 * settlement mode. Reuse one RLS-scoped current-bill snapshot and calculate
 * only the requested pair's edges after complete canonical prefix ranges.
 * All per-bill caps, exact totals, deferred triggers and grants remain active. */
DO $$ DECLARE d text; anchor text; BEGIN
 d:=replace(pg_get_functiondef('sharing.validate_settlement()'::regprocedure),chr(13),'');
 anchor:=$q$  IF s.mode='full' THEN
   due:=sharing.obligation(s.group_id,s.sender_id,s.recipient_id,NULL);
   IF s.state='confirmed' THEN due:=due+s.amount_minor; END IF;
   IF s.amount_minor<>greatest(0,due) THEN RAISE EXCEPTION 'full settlement amount changed' USING ERRCODE='23514'; END IF;
  END IF;$q$;
 anchor:=replace(anchor,chr(13),'');
 IF strpos(d,anchor)=0 OR strpos(d,'s.amount_minor>greatest(0,due)')=0 THEN RAISE EXCEPTION 'exact relationship validation anchor missing'; END IF;
 EXECUTE replace(d,anchor,$q$  due:=sharing.obligation(s.group_id,s.sender_id,s.recipient_id,NULL);
  IF s.state='confirmed' THEN due:=due+s.amount_minor; END IF;
  IF s.mode='full' AND s.amount_minor<>greatest(0,due) THEN RAISE EXCEPTION 'full settlement amount changed' USING ERRCODE='23514'; END IF;$q$);
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION sharing.obligation(g uuid,s uuid,r uuid,e uuid DEFAULT NULL) RETURNS numeric LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 WITH current_bills AS MATERIALIZED (SELECT b.id,b.current_revision_id FROM sharing.shared_expense b WHERE b.group_id=g AND (e IS NULL OR b.id=e)), amounts AS (
 SELECT c.expense_id,c.participant_id,c.amount_minor::numeric n FROM sharing.payer_contribution c JOIN current_bills b ON b.current_revision_id=c.expense_revision_id WHERE c.group_id=g
 UNION ALL SELECT c.expense_id,c.participant_id,-c.amount_minor::numeric FROM sharing.participant_share c JOIN current_bills b ON b.current_revision_id=c.expense_revision_id WHERE c.group_id=g
 UNION ALL SELECT f.expense_id,a.participant_id,CASE WHEN a.axis='received' THEN -a.amount_minor::numeric ELSE a.amount_minor::numeric END FROM sharing.refund_allocation a JOIN sharing.refund f ON f.group_id=a.group_id AND f.id=a.refund_id WHERE a.group_id=g
 ), positions AS (SELECT expense_id,participant_id,sum(n) n FROM amounts WHERE e IS NULL OR expense_id=e GROUP BY expense_id,participant_id),
 creditors AS (SELECT *,sum(n) OVER(PARTITION BY expense_id ORDER BY participant_id) hi FROM positions WHERE n>0),
 debtors AS (SELECT *,sum(-n) OVER(PARTITION BY expense_id ORDER BY participant_id) hi FROM positions WHERE n<0),
 edges AS (SELECT d.participant_id sender,c.participant_id recipient,greatest(0,least(d.hi,c.hi)-greatest(d.hi+d.n,c.hi-c.n)) n FROM debtors d JOIN creditors c USING(expense_id) WHERE (d.participant_id=s AND c.participant_id=r) OR (d.participant_id=r AND c.participant_id=s)),
 payments AS (SELECT x.sender_id,x.recipient_id,CASE WHEN e IS NULL THEN x.amount_minor::numeric ELSE coalesce((SELECT sum(a.amount_minor::numeric) FROM sharing.settlement_allocation a WHERE a.group_id=g AND a.settlement_id=x.id AND a.expense_id=e),0) END n FROM sharing.settlement x WHERE x.group_id=g AND x.state='confirmed')
 SELECT coalesce((SELECT sum(CASE WHEN sender=s AND recipient=r THEN n WHEN sender=r AND recipient=s THEN -n ELSE 0 END) FROM edges),0)-coalesce((SELECT sum(CASE WHEN sender_id=s AND recipient_id=r THEN n WHEN sender_id=r AND recipient_id=s THEN -n ELSE 0 END) FROM payments),0)
$$;
