/* Custom/selected payments validate their exact per-bill obligations below.
 * Only full mode consumes the whole relationship amount. Avoid calculating
 * that unused projection for every deferred custom/selected allocation check.
 * Keep both deferred triggers, per-bill caps, fresh receipts and RLS intact. */
DO $$ DECLARE d text; anchor text; BEGIN
 d:=pg_get_functiondef('sharing.validate_settlement()'::regprocedure);
 anchor:=$q$  due:=sharing.obligation(s.group_id,s.sender_id,s.recipient_id,NULL);
  IF s.state='confirmed' THEN due:=due+s.amount_minor; END IF;
  IF s.mode='full' AND s.amount_minor<>greatest(0,due) THEN RAISE EXCEPTION 'full settlement amount changed' USING ERRCODE='23514'; END IF;$q$;
 IF strpos(d,anchor)=0 THEN RAISE EXCEPTION 'full settlement validation anchor missing'; END IF;
 EXECUTE replace(d,anchor,$q$  IF s.mode='full' THEN
   due:=sharing.obligation(s.group_id,s.sender_id,s.recipient_id,NULL);
   IF s.state='confirmed' THEN due:=due+s.amount_minor; END IF;
   IF s.amount_minor<>greatest(0,due) THEN RAISE EXCEPTION 'full settlement amount changed' USING ERRCODE='23514'; END IF;
  END IF;$q$);
END $$;
