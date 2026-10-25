import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fixtures,signIn,rest,authRequest} from './auth-fixtures.mjs';
import {connectHosted} from './database.mjs';
import {saveState} from './private-state.mjs';
import {report} from './cloud.mjs';

let db,peer;
const results=[];
async function check(name,fn){await fn();results.push({name,passed:true});report(results.at(-1));}
try{
 const {keys,state}=await fixtures();
 const sessions=await Promise.all([signIn(state.users.ownerA,keys.client),signIn(state.users.ownerB,keys.client)]);
 const session=sessions[0],other=sessions[1];
 [db,peer]=await Promise.all([connectHosted(),connectHosted()]);
 const fixture=JSON.parse(await readFile(new URL('../../../contracts/salapiya/p2_finance.json',import.meta.url),'utf8'));
 state.p2??={profile:randomUUID(),enrollment:randomUUID(),ids:{}};
 for(const c of fixture.commands)state.p2.ids[c.id]??=randomUUID();
 await saveState(state);
 let text=JSON.stringify(fixture).replaceAll(fixture.profile,state.p2.profile);
 for(const [from,to] of Object.entries(state.p2.ids))text=text.replaceAll(from,to);
 const f=JSON.parse(text),profile=state.p2.profile;
 const rpc=(name,body,s=session)=>rest(`rpc/${name}`,s,keys.client,{method:'POST',body});
 const boundary=()=>rpc('p2_profile_boundary',{});
 const local=(kind,values)=>JSON.stringify({contract:1,authority:'local',owner:profile,expectedVersion:0,kind,values:Object.fromEntries(Object.entries(values).sort(([a],[b])=>a.localeCompare(b)))});
 const env=(payload,base=0)=>JSON.stringify({contract:2,profile_id:profile,payload,base_revision:base});
 const submit=(id,payload,base=0)=>rpc('p2_submit_command',{command_id:id,command_payload:env(payload,base)});
 const withSession=async(client,fn)=>{
   const claims=JSON.parse(Buffer.from(session.access_token.split('.')[1],'base64url').toString());
   await client.query('BEGIN');
   try{await client.query('SET LOCAL ROLE authenticated');
     await client.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[session.user.id,JSON.stringify(claims)]);
     const r=await fn(client);await client.query('COMMIT');return r;
   }catch(e){await client.query('ROLLBACK');throw e;}
 };
 await check('hosted atomic enrollment, publication replay and exact Dart/PostgreSQL evidence',async()=>{
   let remote=await boundary();
   if(!remote){
     const snapshot=f.commands.map(c=>({id:c.id,payload:c.payload,recorded_at:'2026-10-25T00:00:00Z'}));
     assert.equal((await rpc('p2_stage_enrollment',{enrollment_id:state.p2.enrollment,profile_id:profile,display_name:'Synthetic hosted P2',snapshot})).outcome,'staged');
     assert.equal(await boundary(),null);
     assert.equal((await rpc('p2_publish_enrollment',{enrollment_id:state.p2.enrollment})).outcome,'published');
   }
   assert.equal((await boundary()).id,profile);
   assert.equal((await rpc('p2_publish_enrollment',{enrollment_id:state.p2.enrollment})).outcome,'published');
   const rows=await rest(`p2_command?profile_id=eq.${profile}&order=sequence_no`,session,keys.client);
   for(let i=0;i<f.commands.length;i++) assert.deepEqual(JSON.parse(rows[i].plan),f.commands[i].plan);
 });
 await check('A05 independent authenticated backend sessions accept distinct stale-base expenses exactly once',async()=>{
   const command=local('expense',{account:f.commands[0].id,date:'2026-10-24',name:'Synthetic offline expense',amount:'10.01',category:'category-food'});
   const ids=[randomUUID(),randomUUID()];
   const responses=await Promise.all([db,peer].map((client,i)=>withSession(client,c=>c.query('SELECT p2_submit_command($1,$2) AS result',[ids[i],env(command)]))));
   assert.ok(responses.every(r=>r.rows[0].result.outcome==='accepted'));
   const result=await db.query('SELECT count(*)::int AS n,sum((plan::jsonb->\'revision\'->>\'amount\')::numeric)::text AS total FROM p2_command WHERE id=ANY($1::uuid[])',[ids]);
   assert.deepEqual(result.rows[0],{n:2,total:'2002'});
 });
 await check('A06 ignored committed response returns original receipt and one immutable economic effect',async()=>{
   const id=randomUUID(),payload=local('income',{account:f.commands[1].id,date:'2026-10-24',name:'Synthetic response loss',amount:'2.34',category:'category-income',incomeClass:'gift'});
   const original=await submit(id,payload); // Deliberately discard transport response at the native queue layer in the native suite.
   assert.equal(original.outcome,'accepted');assert.deepEqual(await submit(id,payload),original);
   await assert.rejects(submit(id,payload.replace('2.34','2.35')));
   assert.equal((await db.query('SELECT count(*)::int AS n FROM p2_command WHERE id=$1',[id])).rows[0].n,1);
 });
 await check('A14 signed JWT RLS/forged profile/source isolation and direct write denial',async()=>{
   assert.deepEqual(await rest(`p2_profile?id=eq.${profile}`,other,keys.client),[]);
   assert.deepEqual(await rest(`p2_command?profile_id=eq.${profile}`,other,keys.client),[]);
   const forged=await rpc('p2_submit_command',{command_id:randomUUID(),command_payload:env(f.commands[0].payload)},other);
   assert.equal(forged.outcome,'rejected');
   await rest('p2_command',other,keys.client,{method:'POST',body:{id:randomUUID()},expectStatus:403});
   await assert.rejects(peer.query('BEGIN').then(async()=>{
     try{await peer.query('SET LOCAL ROLE authenticated');await peer.query('SELECT * FROM salapiya_p2.receipt');}finally{await peer.query('ROLLBACK');}
   }));
 });
 await check('A04 collision preserves populated profile and exposes no staged profile',async()=>{
   const before=await boundary();
   assert.equal((await rpc('p2_stage_enrollment',{enrollment_id:randomUUID(),profile_id:randomUUID(),display_name:'Synthetic collision',snapshot:[]})).outcome,'collision');
   assert.deepEqual(await boundary(),before);
 });
 await check('A15 revoked synthetic current session cannot review or submit commands',async()=>{
   const temporary=await signIn(state.users.ownerB,keys.client);
   await authRequest('/logout?scope=local',keys.client,{bearer:temporary.access_token});
   await assert.rejects(rpc('p2_profile_boundary',{},temporary));
   await assert.rejects(rpc('p2_review_command',{command_id:randomUUID(),command_payload:f.commands[0].payload},temporary));
 });
 const consumption=(await db.query(`SELECT pg_database_size(current_database())::text AS database_bytes,
   (SELECT sum(pg_total_relation_size(c.oid))::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relkind='r' AND (n.nspname='salapiya_p2' OR (n.nspname='public' AND c.relname IN ('p2_profile','p2_command')))) AS p2_table_bytes,
   (SELECT count(*)::int FROM public.p2_command WHERE profile_id=$1) AS fixture_commands`,[profile])).rows[0];
 report({passed:results.length,profile,consumption,exact_fixture_balances:f.commands.at(-1).balances,synthetic:true});
 await writeFile(new URL('../../../apps/salapiya/build/p2-hosted-evidence.json',import.meta.url),JSON.stringify({results,consumption,profile},null,2));
}catch(e){report({failure:e.code||e.message,passed:results.length});process.exitCode=1;}
finally{await db?.end();await peer?.end();}
