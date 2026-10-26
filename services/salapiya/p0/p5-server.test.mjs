import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

const db=new PGlite();
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claims',true),'')::jsonb $$;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,deleted_at timestamptz,banned_until timestamptz);
 CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL);
 GRANT USAGE ON SCHEMA public,auth TO authenticated,anon;
 GRANT EXECUTE ON FUNCTION auth.uid(),auth.jwt() TO authenticated,anon;`);
for(const name of (await readdir(new URL('supabase/migrations/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort()){try{await db.exec(await readFile(new URL(`supabase/migrations/${name}`,import.meta.url),'utf8'));}catch(e){throw Error(`${name}: ${e.message} at ${e.position}`);}}
const fixture=JSON.parse(await readFile(new URL('../../../contracts/salapiya/p5_life.json',import.meta.url),'utf8'));
const owner=randomUUID(),other=randomUUID(),profile=fixture.profile;
for(const actor of [owner,other]){await db.query('INSERT INTO auth.users VALUES($1)',[actor]);await db.query('INSERT INTO auth.sessions VALUES($1,$1)',[actor]);}
const rpc=(actor,name,args=[])=>db.transaction(async tx=>{
 await tx.exec('SET LOCAL ROLE authenticated');
 await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[actor]);
 await tx.query("SELECT set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:actor,session_id:actor})]);
 return (await tx.query(`SELECT ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result;
});
const canonical=v=>JSON.stringify((function sort(x){return Array.isArray(x)?x.map(sort):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,sort(x[k])])):x;})(v));
const submit=(id,payload,actor=owner)=>rpc(actor,'p5_submit_command',[id,canonical(JSON.parse(payload))]);
test('Dart/SQL parity for every Life preset and immutable lifecycle, with zero financial revision changes',async()=>{
 const enrollment=randomUUID();await rpc(owner,'p2_stage_enrollment',[enrollment,profile,'P5 synthetic',[]]);await rpc(owner,'p2_publish_enrollment',[enrollment]);
 for(const row of fixture.commands){const result=await submit(row.id,row.payload);assert.equal(result.outcome,'accepted',`${JSON.parse(row.payload).type}: ${result.reason}`);}
 assert.equal((await rpc(owner,'p2_profile_boundary')).revision,0);
 assert.equal((await db.query('SELECT count(*)::int n FROM salapiya_p2.posting')).rows[0].n,0);
 assert.equal((await rpc(owner,'p5_boundary')).revision,fixture.commands.length);
 const rows=(await db.query('SELECT payload FROM p5_command ORDER BY sequence_no')).rows;
 assert.deepEqual(rows.map(r=>r.payload),fixture.commands.map(r=>r.payload));
});
test('original receipt survives response loss; same ID changed payload is rejected',async()=>{
 const row=fixture.commands[0],prior=await rpc(owner,'p5_receipt',[row.id]);assert.deepEqual(await submit(row.id,row.payload),prior);
 const changed=JSON.parse(row.payload);changed.fields.title='Changed payload';await assert.rejects(submit(row.id,JSON.stringify(changed)),/payload mismatch/);
});
test('independent creates accept stale unrelated financial state; competing source edits retain rejection',async()=>{
 const first=JSON.parse(fixture.commands[0].payload),a={...first,record:randomUUID(),fields:{...first.fields,title:'Independent A'}},b={...first,record:randomUUID(),fields:{...first.fields,title:'Independent B'}};
 assert.equal((await submit(randomUUID(),JSON.stringify(a))).outcome,'accepted');assert.equal((await submit(randomUUID(),JSON.stringify(b))).outcome,'accepted');
 const update={...a,expectedVersion:1,fields:{...a.fields,title:'Winner'}};
 assert.equal((await submit(randomUUID(),JSON.stringify(update))).outcome,'accepted');
 const id=randomUUID(),loser=JSON.stringify({...update,fields:{...a.fields,title:'Stale loser'}});
 const result=await submit(id,loser);assert.equal(result.outcome,'rejected');assert.match(result.reason,/version changed/);assert.deepEqual(await submit(id,loser),result);
});
test('forged ownership, foreign event dependencies, arbitrary fields, progress and time tampering are rejected',async()=>{
 const first=JSON.parse(fixture.commands[0].payload);
 assert.equal((await submit(randomUUID(),JSON.stringify({...first,record:randomUUID()}),other)).outcome,'rejected');
 const book=JSON.parse(fixture.commands.find(r=>JSON.parse(r.payload).type==='book').payload);
 assert.equal((await submit(randomUUID(),JSON.stringify({...book,record:randomUUID(),fields:{...book.fields,progress:'999999'}}))).outcome,'rejected');
 assert.equal((await submit(randomUUID(),JSON.stringify({...first,record:randomUUID(),fields:{...first.fields,custom:'unreviewed'}}))).outcome,'rejected');
 const timed=JSON.parse(fixture.commands.find(r=>JSON.parse(r.payload).type==='personal').payload);
 assert.equal((await submit(randomUUID(),JSON.stringify({...timed,record:randomUUID(),fields:{...timed.fields,utc:'2026-11-01T00:00:00.000Z'}}))).outcome,'rejected');
 const event=JSON.parse(fixture.commands.find(r=>JSON.parse(r.payload).type==='careerEvent').payload);
 assert.equal((await submit(randomUUID(),JSON.stringify({...event,record:randomUUID(),fields:{...event.fields,application:randomUUID()}}))).outcome,'rejected');
});
test('forced RLS and grants prevent foreign reads and all direct Life writes',async()=>{
 const count=await db.transaction(async tx=>{await tx.exec('SET LOCAL ROLE authenticated');await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[other]);return tx.query('SELECT * FROM p5_command');});assert.equal(count.rows.length,0);
 await assert.rejects(db.transaction(async tx=>{await tx.exec('SET LOCAL ROLE authenticated');await tx.query('DELETE FROM p5_command');}),/permission denied/);
 await assert.rejects(db.transaction(async tx=>{await tx.exec('SET LOCAL ROLE authenticated');await tx.query('SELECT * FROM salapiya_p5.record');}),/permission denied/);
 await assert.rejects(db.exec('UPDATE p5_command SET payload=payload'),/immutable/);
});
test('Career canonical stage and outcome are independent, and dated no-response never rejects an attempt',async()=>{
 const template=JSON.parse(fixture.commands.find(r=>JSON.parse(r.payload).type==='application').payload);
 for(const outcome of ['Rejected','Withdrawn','Declined offer','Expired offer','Employer-cancelled opening']){
  const body={...template,record:randomUUID(),fields:{...template.fields,pipelineStage:'Offer',outcome,status:outcome,date:'2026-10-20',stageDate:'2026-10-26'}};
  assert.equal((await submit(randomUUID(),JSON.stringify(body))).outcome,'accepted',outcome);
 }
 const invalid={...template,record:randomUUID(),fields:{...template.fields,pipelineStage:'Saved',outcome:'Accepted',status:'Accepted'}};
 assert.equal((await submit(randomUUID(),JSON.stringify(invalid))).outcome,'rejected');
 const observed=(await db.query("SELECT fields->>'status' status FROM salapiya_p5.record WHERE id=$1",[JSON.parse(fixture.commands.find(r=>JSON.parse(r.payload).fields.eventKind==='No response').payload).fields.application])).rows[0].status;
 assert.equal(observed,'Declined offer');
});
test('noncanonical transport is retained as a rejection rather than poisoning CDC',async()=>{const body=JSON.parse(fixture.commands[0].payload);body.record=randomUUID();const raw=JSON.stringify(body,null,2);assert.equal((await rpc(owner,'p5_submit_command',[randomUUID(),raw])).outcome,'rejected');});
test('inherited Book ratings preserve exact zero-to-five decimal strings without floating point',async()=>{
 const template=JSON.parse(fixture.commands.find(r=>JSON.parse(r.payload).type==='book').payload);
 for(const rating of ['0','4.1250','5.0000','-0.0000','5.0001','-0.0001','NaN','1e0','01','1.00001',5,null]){
  const body={...template,record:randomUUID(),fields:{...template.fields,rating}};
  const result=await submit(randomUUID(),JSON.stringify(body));
  assert.equal(result.outcome,['0','4.1250','5.0000','-0.0000'].includes(rating)?'accepted':'rejected',rating);
 }
});

test('expired/revoked session cannot replay even an existing accepted receipt',async()=>{
 await db.query('DELETE FROM auth.sessions WHERE user_id=$1',[owner]);const row=fixture.commands[0];await assert.rejects(submit(row.id,row.payload),/session/i);
});
after(()=>db.close());
