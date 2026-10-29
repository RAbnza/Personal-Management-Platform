import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {connectHosted} from './database.mjs';
import {fixtures,signIn,rest,freshFixtureSession,authRequest} from './auth-fixtures.mjs';
import {report,query} from './cloud.mjs';

const clients=[];
const claimsByOwner=new Map();
function remember(session){claimsByOwner.set(session.user.id,JSON.parse(Buffer.from(session.access_token.split('.')[1],'base64url').toString()));return session.user.id;}
let check='setup';
async function connect(){const c=await connectHosted();clients.push(c);return c;}
async function asOwner(client,owner,fn){
  await client.query('BEGIN');
  try{
    await client.query('SET LOCAL ROLE authenticated');
    await client.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[owner]);
    if(!claimsByOwner.has(owner))throw Error('A real active fixture session is required');
    await client.query("SELECT set_config('request.jwt.claims',$1,true)",[JSON.stringify(claimsByOwner.get(owner))]);
    const value=await fn(client);await client.query('COMMIT');return value;
  }catch(error){await client.query('ROLLBACK');throw error;}
}
const payload=(owner,amount='1',revision=0)=>JSON.stringify({amount_minor:amount,expected_revision:revision,kind:'expense',owner_id:owner,version:1});
const submit=(db,id,body)=>db.query('SELECT public.p0_submit_expense($1,$2) AS result',[id,body]).then(r=>r.rows[0].result);
async function run(name,fn){check=name;await fn();report({check:name,passed:true});}
try{
  const {keys,state}=await fixtures();
  const a=state.users.ownerA.id,b=state.users.ownerB.id;
  const [db1,db2,observer]=await Promise.all([connect(),connect(),connect()]);
  const pids=await Promise.all([db1,db2,observer].map(c=>c.query('SELECT pg_backend_pid() AS id').then(r=>r.rows[0].id)));
  assert.equal(new Set(pids).size,3);
  const sessionA=await signIn(state.users.ownerA,keys.client),sessionB=await signIn(state.users.ownerB,keys.client);
  remember(sessionA);remember(sessionB);
  for(const [owner,session]of [[a,sessionA],[b,sessionB]]){
    const existing=await rest('p0_profile?select=id',session,keys.client);
    if(!existing.length){
      const id=randomUUID(),profile=randomUUID();
      await rest('rpc/p0_stage_enrollment',session,keys.client,{method:'POST',body:{enrollment_id:id,profile_id:profile,snapshot:[]}});
      await rest('rpc/p0_publish_enrollment',session,keys.client,{method:'POST',body:{enrollment_id:id}});
    }
  }
  await run('hosted schema, RLS and client grants',async()=>{
    const rows=await query("SELECT relname,relrowsecurity FROM pg_class WHERE oid IN ('public.p0_profile'::regclass,'public.p0_accepted'::regclass)");
    assert.ok(rows.every(r=>r.relrowsecurity));
    const grants=(await observer.query("SELECT has_table_privilege('authenticated','public.p0_accepted','INSERT') AS insert_allowed, has_schema_privilege('authenticated','salapiya_p0','USAGE') AS private_allowed")).rows[0];
    assert.equal(grants.insert_allowed,false);assert.equal(grants.private_allowed,false);
  });
  await run('independent sessions race same ID; one financial effect',async()=>{
    const id=randomUUID(),body=payload(a,'500050');
    const results=await Promise.all([asOwner(db1,a,c=>submit(c,id,body)),asOwner(db2,a,c=>submit(c,id,body))]);
    assert.deepEqual(results[0],results[1]);assert.equal(results[0].outcome,'accepted');
    assert.equal((await observer.query('SELECT count(*)::int AS n FROM salapiya_p0.evidence WHERE action_id=$1',[id])).rows[0].n,2);
    await assert.rejects(asOwner(db1,a,c=>submit(c,id,payload(a,'2'))),e=>e.code==='22023');
  });
  await run('lost committed response retries the original receipt',async()=>{
    const id=randomUUID(),body=payload(a);await asOwner(db1,a,c=>submit(c,id,body));
    assert.equal((await asOwner(db2,a,c=>submit(c,id,body))).outcome,'accepted');
    assert.equal((await observer.query('SELECT count(*)::int AS n FROM salapiya_p0.receipt WHERE owner_id=$1 AND id=$2',[a,id])).rows[0].n,1);
  });
  await run('independent commands both survive concurrent owner revision changes',async()=>{
    const ids=[randomUUID(),randomUUID()];
    const values=await Promise.all([db1,db2].map((c,i)=>asOwner(c,a,d=>submit(d,ids[i],payload(a,'100000000000')))));
    assert.ok(values.every(v=>v.outcome==='accepted'));
  });
  await run('same expected revision: one acceptance, one durable conflict',async()=>{
    const revision=Number((await observer.query('SELECT revision FROM public.p0_profile WHERE owner_id=$1',[a])).rows[0].revision);
    const values=await Promise.all([db1,db2].map(c=>asOwner(c,a,d=>submit(d,randomUUID(),payload(a,'1',revision)))));
    assert.deepEqual(values.map(v=>v.outcome).sort(),['accepted','rejected']);
    assert.equal(values.find(v=>v.outcome==='rejected').reason,'stale_revision');
  });
  await run('rollback after action leaves no receipt or financial evidence',async()=>{
    const id=randomUUID();
    await assert.rejects(asOwner(db1,a,async c=>{await submit(c,id,payload(a));throw Error('injected');}));
    assert.equal((await observer.query('SELECT count(*)::int AS n FROM public.p0_accepted WHERE id=$1',[id])).rows[0].n,0);
  });
  await run('actual signed-in JWTs isolate owners and reject direct/anonymous writes',async()=>{
    const own=await rest(`p0_accepted?select=id,owner_id&owner_id=eq.${a}`,sessionA,keys.client);
    assert.ok(own.length>0);
    assert.equal((await rest(`p0_accepted?select=id&owner_id=eq.${a}`,sessionB,keys.client)).length,0);
    await rest('p0_accepted',sessionA,keys.client,{method:'POST',body:{},expectStatus:403});
    await rest('rpc/p0_submit_expense',null,keys.client,{method:'POST',body:{command_id:randomUUID(),command_payload:payload(a)},expectStatus:401});
    const spoof=await rest('rpc/p0_submit_expense',sessionB,keys.client,{method:'POST',body:{command_id:randomUUID(),command_payload:payload(a)}});
    assert.equal(spoof.outcome,'rejected');
  });
  await run('exact monetary bounds reject loss and immutable evidence survives',async()=>{
    for(const amount of ['0','-1','01','1.0','1e3','100000000001']){
      assert.equal((await asOwner(db1,a,c=>submit(c,randomUUID(),payload(a,amount)))).outcome,'rejected');
    }
    await assert.rejects(observer.query("UPDATE salapiya_p0.evidence SET amount_minor=1 WHERE owner_id=$1",[a]),e=>e.message.includes('immutable'));
  });
  await run('concurrent enrollment claims publish one complete profile',async()=>{
    // Real session authority is required even for independently claimed SQL roles.
    const owner=remember(await freshFixtureSession(keys)), claims=[randomUUID(),randomUUID()],profiles=[randomUUID(),randomUUID()];
    for(let i=0;i<2;i++)await asOwner(db1,owner,c=>c.query('SELECT p0_stage_enrollment($1,$2,$3)',[claims[i],profiles[i],JSON.stringify([{id:randomUUID(),amount_minor:'500050'}])]));
    const result=await Promise.all([db1,db2].map((c,i)=>asOwner(c,owner,d=>d.query('SELECT p0_publish_enrollment($1) AS result',[claims[i]]).then(r=>r.rows[0].result))));
    assert.deepEqual(result.map(r=>r.outcome).sort(),['collision','published']);
    assert.equal((await observer.query('SELECT count(*)::int AS n FROM public.p0_accepted WHERE owner_id=$1',[owner])).rows[0].n,1);
  });
  await run('failed hosted enrollment exposes no partial graph',async()=>{
    const owner=remember(await freshFixtureSession(keys)),enrollment=randomUUID(),profile=randomUUID(),first=randomUUID();
    const existing=(await observer.query('SELECT id FROM public.p0_accepted LIMIT 1')).rows[0].id;
    await asOwner(db1,owner,c=>c.query('SELECT p0_stage_enrollment($1,$2,$3)',[enrollment,profile,JSON.stringify([{id:first,amount_minor:'1'},{id:existing,amount_minor:'1'}])]));
    await assert.rejects(asOwner(db1,owner,c=>c.query('SELECT p0_publish_enrollment($1)',[enrollment])));
    assert.equal((await observer.query('SELECT count(*)::int AS n FROM public.p0_profile WHERE owner_id=$1',[owner])).rows[0].n,0);
    assert.equal((await observer.query('SELECT count(*)::int AS n FROM public.p0_accepted WHERE owner_id=$1',[owner])).rows[0].n,0);
  });
  await run('recovery review checks current owner and matching payload without writes',async()=>{
    const id=randomUUID(),body=payload(a);
    const request=(session,p=body)=>rest('rpc/p0_review_command',session,keys.client,{method:'POST',body:{command_id:id,command_payload:p}});
    assert.equal((await request(sessionA)).outcome,'missing');
    await asOwner(db1,a,c=>submit(c,id,body));
    assert.equal((await request(sessionA)).outcome,'accepted');
    assert.equal((await request(sessionA,payload(a,'2'))).outcome,'mismatch');
    await rest('rpc/p0_review_command',sessionB,keys.client,{method:'POST',body:{command_id:id,command_payload:body},expectStatus:403});
    assert.equal((await observer.query('SELECT count(*)::int AS n FROM salapiya_p0.receipt WHERE owner_id=$1 AND id=$2',[a,id])).rows[0].n,1);
  });
  await run('revoked session cannot submit, stage, publish or review recovered commands',async()=>{
    const revoked=await signIn(state.users.ownerA,keys.client),id=randomUUID(),command=payload(a);
    await authRequest('/logout?scope=local',keys.client,{bearer:revoked.access_token});
    for(const [rpc,body]of [
      ['p0_submit_expense',{command_id:id,command_payload:command}],
      ['p0_review_command',{command_id:id,command_payload:command}],
      ['p0_stage_enrollment',{enrollment_id:id,profile_id:randomUUID(),snapshot:[]}],
      ['p0_publish_enrollment',{enrollment_id:id}],
    ])await rest(`rpc/${rpc}`,revoked,keys.client,{method:'POST',body,expectStatus:403});
    assert.equal((await observer.query('SELECT count(*)::int AS n FROM public.p0_accepted WHERE id=$1',[id])).rows[0].n,0);
  });
  report({hostedChecks:12,independentBackends:pids.length,identity:'real Supabase password fixtures for server races; Google verified separately by native harness'});
}catch(error){report({failedCheck:check,errorCode:error.code||error.name});process.exitCode=1;}
finally{await Promise.all(clients.map(c=>c.end()));}
