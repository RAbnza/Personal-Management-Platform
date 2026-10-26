import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fixtures,signIn,rest} from './auth-fixtures.mjs';
import {report} from './cloud.mjs';
import {connectHosted} from './database.mjs';

let db,peer;const checks=[];
async function check(name,work){await work();checks.push(name);report({name,passed:true});}
try{
 const {keys,state}=await fixtures(),session=await signIn(state.users.ownerA,keys.client),other=await signIn(state.users.ownerB,keys.client);
 const rpc=(name,args,s=session)=>rest(`rpc/${name}`,s,keys.client,{method:'POST',body:args});
 const boundary=await rpc('p2_profile_boundary',{}),profile=boundary.id;
 const financialBefore=boundary.revision;
 const fixture=JSON.parse(await readFile(new URL('../../../contracts/salapiya/p5_life.json',import.meta.url),'utf8'));
 const ids=new Map(),replaceId=id=>{if(!ids.has(id))ids.set(id,randomUUID());return ids.get(id);};
 const commands=fixture.commands.map(row=>{
  const body=JSON.parse(row.payload);body.owner=profile;body.record=replaceId(body.record);
  if(body.fields.application)body.fields.application=replaceId(body.fields.application);
  return {id:randomUUID(),payload:JSON.stringify(body)};
 });
 await check('hosted all Life presets and revision history append to the existing profile without financial effects',async()=>{
  for(const c of commands){const result=await rpc('p5_submit_command',{command_id:c.id,command_payload:c.payload});assert.equal(result.outcome,'accepted',JSON.parse(c.payload).type+': '+result.reason);}
  assert.equal((await rpc('p2_profile_boundary',{})).revision,financialBefore);
  const rows=await rest(`p5_command?profile_id=eq.${profile}&order=sequence_no`,session,keys.client);
  for(const c of commands)assert.equal(rows.find(r=>r.id===c.id)?.payload,c.payload);
 });
 await check('hosted lost-response replay returns the immutable original receipt and changed-payload reuse is denied',async()=>{
  const c=commands[0],first=await rpc('p5_receipt',{command_id:c.id});
  assert.deepEqual(await rpc('p5_submit_command',{command_id:c.id,command_payload:c.payload}),first);
  await assert.rejects(rpc('p5_submit_command',{command_id:c.id,command_payload:c.payload.replace('Synthetic task','Changed task')}));
 });
 await check('hosted authenticated owner isolation and direct-write denial',async()=>{
  assert.deepEqual(await rest(`p5_command?profile_id=eq.${profile}`,other,keys.client),[]);
  await rest('p5_command',other,keys.client,{method:'POST',body:{id:randomUUID()},expectStatus:403});
  const c=commands[0];assert.equal((await rpc('p5_submit_command',{command_id:randomUUID(),command_payload:c.payload},other)).outcome,'rejected');
 });
 [db,peer]=await Promise.all([connectHosted(),connectHosted()]);
 await check('hosted two-session competing edits accept one and retain the other for review',async()=>{
  const base=JSON.parse(commands[0].payload),create={...base,record:randomUUID()};
  assert.equal((await rpc('p5_submit_command',{command_id:randomUUID(),command_payload:JSON.stringify(create)})).outcome,'accepted');
  const claims=JSON.parse(Buffer.from(session.access_token.split('.')[1],'base64url').toString());
  const updates=[db,peer].map((client,index)=>({client,id:randomUUID(),payload:JSON.stringify({...create,expectedVersion:1,fields:{...create.fields,title:`P5 hosted competing edit ${index}`}})}));
  const responses=await Promise.all(updates.map(async({client,id,payload})=>{
   await client.query('BEGIN');try{
    await client.query('SET LOCAL ROLE authenticated');await client.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[session.user.id,JSON.stringify(claims)]);
    const result=(await client.query('SELECT p5_submit_command($1,$2) result',[id,payload])).rows[0].result;await client.query('COMMIT');return result;
   }catch(e){await client.query('ROLLBACK');throw e;}
  }));
  assert.deepEqual(responses.map(r=>r.outcome).sort(),['accepted','rejected']);
  for(let i=0;i<updates.length;i++)assert.deepEqual(await rpc('p5_submit_command',{command_id:updates[i].id,command_payload:updates[i].payload}),responses[i]);
 });
 await check('hosted forced RLS, restricted replication and exact publication membership',async()=>{
  const rows=(await db.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='public.p5_command'::regclass")).rows;assert.ok(rows[0].relrowsecurity&&rows[0].relforcerowsecurity);
  const grants=(await db.query("SELECT has_table_privilege('salapiya_p0_replication','public.p5_command','SELECT') allowed,has_schema_privilege('authenticated','salapiya_p5','USAGE') private_access")).rows[0];assert.equal(grants.allowed,true);assert.equal(grants.private_access,false);
  assert.equal((await db.query("SELECT count(*)::int n FROM pg_publication_tables WHERE pubname='powersync' AND schemaname='public' AND tablename='p5_command'")).rows[0].n,1);
  const bytes=(await db.query('SELECT sum(octet_length(payload))::text bytes FROM p5_command WHERE id=ANY($1::uuid[])',[commands.map(c=>c.id)])).rows[0].bytes;report({p5FixtureCommands:commands.length,payloadBytes:bytes,financialRevisionUnchanged:true});
 });
 report({p5HostedPassed:checks.length,syntheticAppendOnly:true});
}catch(e){report({p5HostedFailure:e.message,passedBeforeFailure:checks.length});process.exitCode=1;}
finally{await Promise.all([db?.end(),peer?.end()]);}
