import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {connectHosted} from './database.mjs';
import {fixtures,signIn,rest,authRequest} from './auth-fixtures.mjs';
import {report} from './cloud.mjs';

const clients=[];
let check='setup';
const body=(source,operation,amount,revision=0)=>JSON.stringify({source_id:source,operation,amount_minor:amount,expected_revision:revision});
async function run(name,fn){check=name;await fn();report({check:name,passed:true});}
try{
  const {keys,state}=await fixtures();
  const sessions=await Promise.all(['ownerA','ownerB','raceOwner'].map(label=>signIn(state.users[label],keys.client)));
  const [a,b,outsider]=sessions;
  for(let i=0;i<3;i++)clients.push(await connectHosted());
  const [admin,db1,db2]=clients;
  assert.equal(new Set((await Promise.all(clients.map(c=>c.query('SELECT pg_backend_pid() AS id')))).map(r=>r.rows[0].id)).size,3);
  async function asSession(db,session,id,payload){
    const claims=JSON.parse(Buffer.from(session.access_token.split('.')[1],'base64url').toString());
    await db.query('BEGIN');
    try{
      await db.query('SET LOCAL ROLE authenticated');
      await db.query("SELECT set_config('request.jwt.claims',$1,true),set_config('request.jwt.claim.sub',$2,true)",[JSON.stringify(claims),session.user.id]);
      const result=(await db.query('SELECT p0_gate_capacity($1,$2) AS result',[id,payload])).rows[0].result;
      await db.query('COMMIT');return result;
    }catch(error){await db.query('ROLLBACK');throw error;}
  }
  const group=randomUUID(),source=randomUUID();
  await admin.query('INSERT INTO salapiya_p0.gate_group VALUES($1,$2)',[group,a.user.id]);
  await admin.query('INSERT INTO salapiya_p0.gate_member VALUES($1,$2,true),($1,$3,true)',[group,a.user.id,b.user.id]);
  await admin.query('INSERT INTO salapiya_p0.gate_source(id,group_id,creator_id,capacity_minor) VALUES($1,$2,$3,10)',[source,group,b.user.id]);
  const rpc=(session,id,payload)=>rest('rpc/p0_gate_capacity',session,keys.client,{method:'POST',body:{command_id:id,command_payload:payload}});
  await run('private gate tables remain outside client grants and publication',async()=>{
    assert.equal((await admin.query("SELECT has_table_privilege('authenticated','salapiya_p0.gate_source','SELECT') AS allowed")).rows[0].allowed,false);
    assert.deepEqual((await admin.query("SELECT tablename FROM pg_publication_tables WHERE pubname='powersync' ORDER BY tablename")).rows.map(r=>r.tablename),['p0_accepted','p0_profile']);
  });
  await run('actual outsider JWT cannot reserve or infer group financial capacity',async()=>{
    assert.deepEqual(await rpc(outsider,randomUUID(),body(source,'allocate','1')),{outcome:'rejected',reason:'source_or_membership_unavailable'});
  });
  const ids=[randomUUID(),randomUUID()],payload=body(source,'allocate','8');
  let results;
  await run('independent capacity race accepts eight once and preserves rejected intent receipt',async()=>{
    results=await Promise.all([asSession(db1,a,ids[0],payload),asSession(db2,b,ids[1],payload)]);
    assert.deepEqual(results.map(r=>r.outcome).sort(),['accepted','rejected']);
    assert.equal(results.find(r=>r.outcome==='rejected').reason,'capacity_exceeded');
    const head=(await admin.query('SELECT used_minor::text,revision::text FROM salapiya_p0.gate_source WHERE id=$1',[source])).rows[0];
    assert.deepEqual(head,{used_minor:'8',revision:'2'});
    for(let i=0;i<2;i++)assert.deepEqual(await rpc(sessions[i],ids[i],payload),results[i]);
    assert.equal((await admin.query('SELECT count(*)::int AS n FROM salapiya_p0.gate_transition WHERE source_id=$1',[source])).rows[0].n,1);
  });
  await run('owner administration cannot correct another creator; stale corrections are explicit',async()=>{
    assert.equal((await rpc(a,randomUUID(),body(source,'revise','20',2))).reason,'creator_required');
    assert.equal((await rpc(b,randomUUID(),body(source,'revise','20',1))).reason,'stale_revision');
    assert.equal((await rpc(b,randomUUID(),body(source,'revise','7',2))).reason,'capacity_below_accepted');
    assert.equal((await rpc(b,randomUUID(),body(source,'revise','20',2))).outcome,'accepted');
  });
  await run('removed member and restored command IDs cannot regain group authority',async()=>{
    await admin.query('UPDATE salapiya_p0.gate_member SET active=false WHERE group_id=$1 AND user_id=$2',[group,b.user.id]);
    assert.equal((await rpc(b,randomUUID(),body(source,'allocate','1'))).reason,'source_or_membership_unavailable');
    assert.equal((await rpc(b,ids[1],payload)).reason,'source_or_membership_unavailable');
  });
  await run('real session revocation blocks a still-signed access JWT at command authority',async()=>{
    await authRequest('/logout?scope=local',keys.client,{bearer:a.access_token});
    assert.equal((await rpc(a,randomUUID(),body(source,'allocate','1'))).reason,'session_revoked');
    await assert.rejects(authRequest('/token?grant_type=refresh_token',keys.client,{body:{refresh_token:a.refresh_token}}));
  });
  await run('exact bounds and immutable evidence; group actions never alter private ledgers',async()=>{
    // Fresh active session for the group creator; membership removal remains authoritative.
    const again=await signIn(state.users.ownerA,keys.client);
    const before=(await admin.query('SELECT count(*)::int AS n FROM public.p0_accepted')).rows[0].n;
    for(const amount of ['0','-1','01','1.0','1e3','100000000001'])assert.equal((await rpc(again,randomUUID(),body(source,'allocate',amount))).outcome,'rejected');
    await assert.rejects(admin.query('UPDATE salapiya_p0.gate_transition SET amount_minor=1 WHERE source_id=$1',[source]),/immutable/);
    assert.equal((await admin.query('SELECT count(*)::int AS n FROM public.p0_accepted')).rows[0].n,before);
  });
  report({gateChecks:7,independentSessions:3,model:'bounded capacity and creator/current-membership proof, not product Shared Expenses'});
}catch(error){report({failedCheck:check,errorCode:error.code||error.name});process.exitCode=1;}
finally{await Promise.all(clients.map(c=>c.end()));}
