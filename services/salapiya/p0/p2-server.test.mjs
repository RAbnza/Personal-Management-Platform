import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

const db=new PGlite();
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
 $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS
 $$ SELECT nullif(current_setting('request.jwt.claims',true),'')::jsonb $$;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,deleted_at timestamptz,banned_until timestamptz);
 CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL);
 GRANT USAGE ON SCHEMA public,auth TO authenticated,anon;
 GRANT EXECUTE ON FUNCTION auth.uid(),auth.jwt() TO authenticated,anon;`);
for(const name of (await readdir(new URL('supabase/migrations/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort())
 await db.exec((await readFile(new URL(`supabase/migrations/${name}`,import.meta.url),'utf8')).replace('GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;', process.env.P2_DEBUG ? 'RAISE;' : 'GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;'));
const fixture=JSON.parse(await readFile(new URL('../../../contracts/salapiya/p2_finance.json',import.meta.url),'utf8'));
const actor=randomUUID(),other=randomUUID(),enrollment=randomUUID(),profile=fixture.profile;
for(const id of [actor,other]){
 await db.query('INSERT INTO auth.users(id) VALUES($1)',[id]);
 await db.query('INSERT INTO auth.sessions VALUES($1,$1)',[id]);
}
const asOwner=(owner,fn)=>db.transaction(async tx=>{
 await tx.exec('SET LOCAL ROLE authenticated');
 await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[owner]);
 await tx.query("SELECT set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:owner,session_id:owner})]);
 return fn(tx);
});
const rpc=(owner,name,args=[])=>asOwner(owner,tx=>tx.query(`SELECT ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) AS result`,args)).then(r=>r.rows[0].result);
const envelope=(payload,base=0,p=profile)=>JSON.stringify({contract:2,profile_id:p,payload,base_revision:base});
const cmd=(kind,values,owner=profile)=>JSON.stringify({contract:1,authority:'local',owner,expectedVersion:0,kind,values});
const submit=(id,payload,base=0,owner=actor)=>rpc(owner,'p2_submit_command',[id,envelope(payload,base)]);

test('P2 complete P1 graph parity: stage invisibility, exact plans, immutable publication and replay',async()=>{
 const snapshot=fixture.commands.map(c=>({id:c.id,payload:c.payload,recorded_at:'2026-10-25T00:00:00.000Z'}));
 assert.equal((await rpc(actor,'p2_stage_enrollment',[enrollment,profile,'Synthetic P2',JSON.stringify(snapshot)])).outcome,'staged');
 assert.equal(await rpc(actor,'p2_profile_boundary'),null);
 assert.equal((await rpc(actor,'p2_publish_enrollment',[enrollment])).outcome,'published');
 assert.equal((await rpc(actor,'p2_publish_enrollment',[enrollment])).outcome,'published');
 const rows=(await asOwner(actor,tx=>tx.query('SELECT * FROM p2_command ORDER BY sequence_no'))).rows;
 assert.equal(rows.length,fixture.commands.length);
 for(let i=0;i<rows.length;i++){
   assert.deepEqual(JSON.parse(rows[i].plan),fixture.commands[i].plan,`command ${i+1} ${fixture.commands[i].kind}`);
   assert.equal(rows[i].payload,fixture.commands[i].payload);
 }
 for(const [id,amount] of Object.entries(fixture.commands.at(-1).balances))
   assert.equal((await db.query('SELECT salapiya_p2.balance($1,$2,$3)::text AS n',[profile,id,'9999-12-31'])).rows[0].n,amount);
 await assert.rejects(db.query("UPDATE salapiya_p2.posting SET amount_minor=1 WHERE profile_id=$1",[profile]),/immutable/);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM salapiya_p2.receipt WHERE owner_id=$1',[actor])).rows[0].n,fixture.commands.length);
});

test('distinct offline expenses survive unrelated revisions; response loss retries one effect; payload mismatch denied',async()=>{
 const account=fixture.commands[0].id;
 const payload=cmd('expense',{date:'2026-10-04',name:'Offline A',account,amount:'10.01',category:'category-food'});
 const id=randomUUID();
 const receipt=await submit(id,payload);
 assert.equal(receipt.outcome,'accepted');
 assert.deepEqual(await submit(id,payload),receipt);
 await assert.rejects(submit(id,payload.replace('10.01','10.02')),/payload mismatch/);
 assert.equal((await submit(randomUUID(),payload.replace('Offline A','Offline B'))).outcome,'accepted');
 assert.equal((await db.query('SELECT count(*)::int AS n FROM p2_command WHERE id=$1',[id])).rows[0].n,1);
});

test('stale corrections, dependent refund caps, archival and preserved rejected receipts do not stall valid work',async()=>{
 const source=fixture.commands[4],account=fixture.commands[0].id;
 let boundary=(await rpc(actor,'p2_profile_boundary')).revision;
 const payload=cmd('correction',{...source.values,source:source.id,sourceVersion:'2',amount:'101.00',reason:'Concurrent correction'});
 const id=randomUUID();
 assert.equal((await submit(id,payload,boundary)).outcome,'accepted');
 const second=randomUUID();
 const rejected=await submit(second,payload,boundary);
 assert.equal(rejected.outcome,'rejected');
 assert.deepEqual(await submit(second,payload,boundary),rejected);
 boundary=(await rpc(actor,'p2_profile_boundary')).revision;
 assert.equal((await submit(randomUUID(),cmd('refund',{source:id,sourceVersion:'3',account,date:'2026-10-05',amount:'999.00',reason:'Too much',refundPosting:id+'-p2'}),boundary)).outcome,'rejected');
 assert.equal((await submit(randomUUID(),cmd('income',{account,date:'2026-10-06',amount:'5.00',name:'Independent',category:'category-income',incomeClass:'gift'}))).outcome,'accepted');
 boundary=(await rpc(actor,'p2_profile_boundary')).revision;
 assert.equal((await submit(randomUUID(),cmd('archive',{account,reason:'Close account'}),boundary)).outcome,'accepted');
 assert.equal((await submit(randomUUID(),cmd('expense',{account,date:'2026-10-06',amount:'1.00',name:'Stale offline account',category:'category-food'}))).outcome,'rejected');
});

test('A14 private RLS, forged IDs, financial table denial and current-session entry guards',async()=>{
 assert.equal((await asOwner(other,tx=>tx.query('SELECT * FROM p2_profile'))).rows.length,0);
 assert.equal((await asOwner(other,tx=>tx.query('SELECT * FROM p2_command'))).rows.length,0);
 assert.equal((await submit(randomUUID(),fixture.commands[0].payload,0,other)).outcome,'rejected');
 await assert.rejects(asOwner(other,tx=>tx.query('SELECT * FROM salapiya_p2.receipt')),/permission denied/);
 await assert.rejects(asOwner(other,tx=>tx.query('DELETE FROM p2_command')),/permission denied/);
 await assert.rejects(asOwner(other,tx=>tx.query('INSERT INTO p2_profile VALUES($1,$2,$3,0)',[randomUUID(),other,'forged'])),/permission denied/);
 assert.equal((await rpc(other,'p2_review_command',[fixture.commands[0].id,fixture.commands[0].payload])).outcome,'missing');
 await db.query('DELETE FROM auth.sessions WHERE user_id=$1',[other]);
 await assert.rejects(rpc(other,'p2_profile_boundary'),/current session/);
 await assert.rejects(submit(randomUUID(),fixture.commands[0].payload,0,other),/current session/);
});

test('enrollment collision/cancel and invalid full graph never expose partial profile',async()=>{
 assert.equal((await rpc(actor,'p2_stage_enrollment',[randomUUID(),randomUUID(),'Other local profile','[]'])).outcome,'collision');
 const owner=randomUUID(),p=randomUUID(),id=randomUUID();
 await db.query('INSERT INTO auth.users(id) VALUES($1)',[owner]);
 await db.query('INSERT INTO auth.sessions VALUES($1,$1)',[owner]);
 const payload=cmd('expense',{name:'Foreign account',date:'2026-10-05',account:fixture.commands[0].id,amount:'1.00',category:'category-food'},p);
 await rpc(owner,'p2_stage_enrollment',[id,p,'Invalid graph',JSON.stringify([{id:randomUUID(),payload,recorded_at:'2026-10-25T00:00:00Z'}])]);
 await assert.rejects(rpc(owner,'p2_publish_enrollment',[id]),/financial graph rejected/);
 assert.equal(await rpc(owner,'p2_profile_boundary'),null);
});
after(()=>db.close());
