import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const ownerA = '11111111-1111-4111-8111-111111111111';
const ownerB = '22222222-2222-4222-8222-222222222222';
const db = new PGlite();
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  GRANT USAGE ON SCHEMA public,auth TO authenticated,anon;
  GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon;`);
await db.exec(await readFile(new URL('supabase/migrations/20261024000100_p0_financial_proof.sql', import.meta.url),'utf8'));
await db.exec(await readFile(new URL('supabase/migrations/20261024000200_p0_enrollment_proof.sql', import.meta.url),'utf8'));
await db.query('INSERT INTO p0_profile(id,owner_id) VALUES($1,$2),($3,$4)',[randomUUID(),ownerA,randomUUID(),ownerB]);
const asOwner = async (owner, fn) => db.transaction(async tx => {
  await tx.exec('SET LOCAL ROLE authenticated');
  await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[owner]);
  return fn(tx);
});
const payload = (owner, amount='500050', revision=0) => JSON.stringify({amount_minor:amount,expected_revision:revision,kind:'expense',owner_id:owner,version:1});
const submit = (tx,id,body) => tx.query('SELECT p0_submit_expense($1,$2) AS result',[id,body]).then(r=>r.rows[0].result);

test('transactional receipt replay, changed-payload denial, immutable paired evidence', async () => {
  const id = randomUUID(), body = payload(ownerA);
  const first = await asOwner(ownerA,tx=>submit(tx,id,body));
  assert.equal(first.outcome,'accepted');
  assert.deepEqual(await asOwner(ownerA,tx=>submit(tx,id,body)),first);
  await assert.rejects(asOwner(ownerA,tx=>submit(tx,id,payload(ownerA,'1'))),/payload mismatch/);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM salapiya_p0.evidence WHERE action_id=$1',[id])).rows[0].n,2);
  await assert.rejects(db.query('UPDATE salapiya_p0.evidence SET amount_minor=1 WHERE action_id=$1',[id]),/immutable/);
  assert.equal((await db.query('SELECT sum(amount_minor)::text AS total FROM salapiya_p0.evidence WHERE action_id=$1',[id])).rows[0].total,'0');
});
test('RLS independently isolates owners and denies direct writes / unauthenticated RPC', async () => {
  assert.equal((await asOwner(ownerB,tx=>tx.query('SELECT * FROM p0_accepted'))).rows.length,0);
  assert.equal((await asOwner(ownerA,tx=>tx.query('SELECT * FROM p0_accepted'))).rows.length,1);
  await assert.rejects(asOwner(ownerB,tx=>tx.query("INSERT INTO p0_accepted VALUES($1,$2,'{}','1',1)",[randomUUID(),ownerA])),/permission denied/);
  await assert.rejects(asOwner(ownerB,tx=>tx.query('SELECT * FROM salapiya_p0.receipt')),/permission denied/);
  await assert.rejects(db.transaction(async tx=>{await tx.exec('SET LOCAL ROLE anon');return submit(tx,randomUUID(),payload(ownerA));}),/permission denied/);
  const denied = await asOwner(ownerB,tx=>submit(tx,randomUUID(),payload(ownerA)));
  assert.equal(denied.outcome,'rejected');
});
test('permanent rejection survives replay; unrelated commands continue; stale revision is explicit', async () => {
  for (const amount of ['0','-1','01','1.0','1e3','100000000001','9223372036854775808']) {
    const id=randomUUID(), body=payload(ownerA,amount);
    const rejected=await asOwner(ownerA,tx=>submit(tx,id,body));
    assert.equal(rejected.outcome,'rejected');
    assert.deepEqual(await asOwner(ownerA,tx=>submit(tx,id,body)),rejected);
  }
  assert.equal((await asOwner(ownerA,tx=>submit(tx,randomUUID(),payload(ownerA,'1')))).outcome,'accepted');
  assert.equal((await asOwner(ownerA,tx=>submit(tx,randomUUID(),payload(ownerA,'1',999)))).reason,'stale_revision');
});
test('rollback after financial acceptance rolls back receipt, action and evidence', async () => {
  const id=randomUUID();
  await assert.rejects(asOwner(ownerA,async tx=>{await submit(tx,id,payload(ownerA));throw Error('injected lost transaction');}),/injected/);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM p0_accepted WHERE id=$1',[id])).rows[0].n,0);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM salapiya_p0.receipt WHERE id=$1',[id])).rows[0].n,0);
  assert.equal((await asOwner(ownerA,tx=>submit(tx,id,payload(ownerA)))).outcome,'accepted');
});
test('two device IDs produce two accepted effects with exact decimal transport', async () => {
  const results = await Promise.all([randomUUID(),randomUUID()].map(id=>asOwner(ownerB,tx=>submit(tx,id,payload(ownerB,'100000000000')))));
  assert.ok(results.every(r=>r.outcome==='accepted'));
  assert.equal((await db.query('SELECT sum(amount_minor::bigint)::text AS total FROM p0_accepted WHERE owner_id=$1',[ownerB])).rows[0].total,'200000000000');
  // PGlite serializes these transactions; this is not a multi-session race proof.
});
test('enrollment stages privately, publishes one graph, retries and retrieves by trusted owner', async () => {
  const owner=randomUUID(), profile=randomUUID(), enrollment=randomUUID(), action=randomUUID();
  const snapshot=JSON.stringify([{id:action,amount_minor:'500050'}]);
  const stage=()=>asOwner(owner,tx=>tx.query('SELECT p0_stage_enrollment($1,$2,$3) AS result',[enrollment,profile,snapshot]));
  assert.equal((await stage()).rows[0].result.outcome,'staged');
  assert.equal((await asOwner(owner,tx=>tx.query('SELECT * FROM p0_profile'))).rows.length,0);
  assert.equal((await stage()).rows[0].result.outcome,'staged');
  await assert.rejects(asOwner(owner,tx=>tx.query('SELECT p0_stage_enrollment($1,$2,$3)',[enrollment,profile,'[]'])),/payload mismatch/);
  const publish=()=>asOwner(owner,tx=>tx.query('SELECT p0_publish_enrollment($1) AS result',[enrollment]));
  const first=await publish();assert.equal(first.rows[0].result.outcome,'published');
  assert.deepEqual((await publish()).rows,first.rows);
  assert.equal((await asOwner(owner,tx=>tx.query('SELECT id FROM p0_profile'))).rows[0].id,profile);
  assert.equal((await asOwner(owner,tx=>tx.query('SELECT id FROM p0_accepted'))).rows[0].id,action);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM salapiya_p0.evidence WHERE action_id=$1',[action])).rows[0].n,2);
  assert.equal((await asOwner(owner,tx=>tx.query('SELECT p0_stage_enrollment($1,$2,$3) AS result',[randomUUID(),randomUUID(),'[]']))).rows[0].result.outcome,'collision');
  await assert.rejects(asOwner(ownerB,tx=>tx.query('SELECT p0_publish_enrollment($1)',[enrollment])),/not found/);
});
test('two staged claims publish once; failed publication exposes no partial graph', async () => {
  const owner=randomUUID(), enrollments=[randomUUID(),randomUUID()];
  for(const id of enrollments) await asOwner(owner,tx=>tx.query('SELECT p0_stage_enrollment($1,$2,$3)',[id,randomUUID(),'[]']));
  const claims=await Promise.all(enrollments.map(id=>asOwner(owner,tx=>tx.query('SELECT p0_publish_enrollment($1) AS result',[id]))));
  assert.deepEqual(claims.map(r=>r.rows[0].result.outcome),['published','collision']);
  const failedOwner=randomUUID(), enrollment=randomUUID();
  const existing=(await db.query('SELECT id FROM p0_accepted LIMIT 1')).rows[0].id;
  await asOwner(failedOwner,tx=>tx.query('SELECT p0_stage_enrollment($1,$2,$3)',[enrollment,randomUUID(),JSON.stringify([{id:randomUUID(),amount_minor:'1'},{id:existing,amount_minor:'1'}])]));
  await assert.rejects(asOwner(failedOwner,tx=>tx.query('SELECT p0_publish_enrollment($1)',[enrollment])),/graph rejected/);
  assert.equal((await asOwner(failedOwner,tx=>tx.query('SELECT * FROM p0_profile'))).rows.length,0);
  assert.equal((await asOwner(failedOwner,tx=>tx.query('SELECT * FROM p0_accepted'))).rows.length,0);
});
test.after(async()=>db.close());
