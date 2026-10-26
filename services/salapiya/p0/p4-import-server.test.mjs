import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const db=new PGlite();
await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claims',true),'')::jsonb$$;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,deleted_at timestamptz,banned_until timestamptz);
 CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL);GRANT USAGE ON SCHEMA public,auth TO authenticated,anon;`);
for(const file of (await readdir(new URL('supabase/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL('supabase/migrations/'+file,import.meta.url),'utf8'));
const fixture=JSON.parse(await readFile(new URL('../../../contracts/salapiya/p4_import.json',import.meta.url),'utf8'));
const actor=randomUUID(),profile=fixture.profile,enrollment=randomUUID();
await db.query('INSERT INTO auth.users(id) VALUES($1)',[actor]);await db.query('INSERT INTO auth.sessions VALUES($1,$1)',[actor]);
const rpc=(name,args=[])=>db.transaction(async tx=>{
 await tx.exec('SET LOCAL ROLE authenticated');await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[actor,JSON.stringify({sub:actor,session_id:actor})]);
 return (await tx.query(`SELECT ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) AS r`,args)).rows[0].r;
});
const payload=(kind,values)=>JSON.stringify({contract:1,authority:'local',owner:profile,expectedVersion:0,kind,values:Object.fromEntries(Object.entries(values).sort(([a],[b])=>a<b?-1:a>b?1:0))});
const envelope=async p=>JSON.stringify({contract:2,profile_id:profile,payload:p,base_revision:(await rpc('p2_profile_boundary')).revision});
let rootEnvelope;
test('actual server import RPC stages, reviews and atomically expands original row commands with exact Dart parity',async()=>{
 await rpc('p2_stage_enrollment',[enrollment,profile,'P4 native import parity',[]]);await rpc('p2_publish_enrollment',[enrollment]);
 for(const c of fixture.commands){
  if(c.id===fixture.root)break;
  const r=await rpc('p2_submit_command',[c.id,await envelope(c.payload)]);assert.equal(r.outcome,'accepted',`${JSON.parse(c.payload).kind}: ${r.reason}`);
  const plan=JSON.parse((await db.query('SELECT plan FROM p2_command WHERE id=$1',[c.id])).rows[0].plan);assert.deepEqual(plan,c.plan);
 }
 const root=fixture.commands.find(c=>c.id===fixture.root);rootEnvelope=await envelope(root.payload);
 const result=await rpc('p2_submit_command',[root.id,rootEnvelope]);assert.equal(result.outcome,'accepted',result.reason);
 const rows=(await db.query('SELECT * FROM p2_command ORDER BY sequence_no')).rows;
 assert.equal(rows.length,fixture.commands.length);
 for(let i=0;i<rows.length;i++) {assert.equal(rows[i].payload,fixture.commands[i].payload,`payload ${i+1}`);assert.deepEqual(JSON.parse(rows[i].plan),fixture.commands[i].plan,`plan ${i+1}`);}
 assert.equal((await db.query("SELECT salapiya_p2.balance($1,$2,'9999-12-31')::text AS amount",[profile,fixture.commands[0].id])).rows[0].amount,'100000');
 assert.equal((await db.query('SELECT cutoff FROM salapiya_p2.account WHERE profile_id=$1 AND id=$2',[profile,fixture.commands[0].id])).rows[0].cutoff,'2026-10-01');
 assert.deepEqual(await rpc('p2_submit_command',[root.id,rootEnvelope]),result);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM p2_command')).rows[0].n,fixture.commands.length);
});
test('import provenance cannot be forged or replayed under a changed root payload',async()=>{
 await assert.rejects(rpc('p2_submit_command',[fixture.root,rootEnvelope.replace('Atomic history processing','Changed original intent')]),/payload mismatch/);
 const row=fixture.commands.find(c=>JSON.parse(c.payload).values.importRow==='1');
 const forged=JSON.parse(row.payload);forged.values.amount='500.01';forged.expectedVersion=0;
 assert.equal((await rpc('p2_submit_command',[randomUUID(),await envelope(payload(forged.kind,forged.values))])).outcome,'rejected');
});
after(()=>db.close());
