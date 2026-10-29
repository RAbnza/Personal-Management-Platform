import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {fixtures,signIn,rest} from './auth-fixtures.mjs';
import {connectHosted} from './database.mjs';
import {saveState} from './private-state.mjs';
import {report} from './cloud.mjs';
let db,peer;
try{
 const {keys,state}=await fixtures();
 const sessions=await Promise.all([signIn(state.users.ownerA,keys.client),signIn(state.users.ownerB,keys.client)]);
 [db,peer]=await Promise.all([connectHosted(),connectHosted()]);
 const a=sessions[0],b=sessions[1],g=randomUUID(),pa=randomUUID(),pb=randomUUID(),pm=randomUUID();let version=0;
 const timings=[];
 const rpc=(name,body,s=a)=>rest('rpc/'+name,s,keys.client,{method:'POST',body});
 const payload=(op,values,v=version)=>JSON.stringify({contract:3,group:g,op,version:v,values});
 async function submit(op,values,s=a,id=randomUUID(),v=version){const start=performance.now();const r=await rpc('p3_submit_command',{command_id:id,command_payload:payload(op,values,v)},s);timings.push(performance.now()-start);if(r.outcome==='accepted')version=Math.max(version,r.version);return r;}
 async function ok(...args){const r=await submit(...args);assert.equal(r.outcome,'accepted',r.reason);return r;}
 async function no(...args){const r=await submit(...args);assert.equal(r.outcome,'rejected');return r;}
 const hash=t=>createHash('sha256').update(t).digest('hex');
 async function check(name,fn){await fn();report({name,passed:true});}
 const snapshot=async(s=a)=>(await rest(`p3_group?group_id=eq.${g}`,s,keys.client)).map(r=>JSON.parse(r.document))[0];
 await check('hosted S01 verified invitation consent, claim review, replay, expiry and revocation',async()=>{
   await ok('create',{name:'P3 isolated hosted group',display:'Fixture A',participant:pa});
   await ok('manual',{name:'Manual fixture',participant:pm});
   const token=randomBytes(32).toString('hex');
   await ok('invite',{email:b.user.email,hash:hash(token)});
   const review=await rpc('p3_review_invitation',{group_id:g,token},b);assert.equal(review.historyPolicy,1);
   await no('accept',{token,consent:false,display:'Fixture B',participant:pb},b);
   const id=randomUUID(),v=version,values={token,consent:true,display:'Fixture B',participant:pb};
   const original=await ok('accept',values,b,id,v);assert.deepEqual(await submit('accept',values,b,id,v),original);
   await no('accept',values,b);
   for(const expire of [true,false]){
     const t=randomBytes(32).toString('hex'),inv=randomUUID();await ok('invite',{email:b.user.email,hash:hash(t)},a,inv);
     if(expire)await db.query("UPDATE salapiya_p3.invite SET expires=now()-interval '1 second' WHERE id=$1 AND group_id=$2",[inv,g]);
     else await ok('revoke',{invitation:inv});
     await no('accept',{token:t,consent:true,display:'Fixture B',participant:pb},b);
   }
   const rows=await db.query('SELECT payload::text FROM salapiya_p3.receipt WHERE actor=ANY($1::uuid[]) AND payload->>\'group\'=$2',[[a.user.id,b.user.id],g]);
   assert.ok(!JSON.stringify(rows.rows).includes(token));
 });
 let bill,correction,payment,dinner;
 await check('hosted exact multiple payers, canonical remainder, creator correction and received/consumed refunds',async()=>{
   const ids=[pa,pb,pm].sort(),shares=Object.fromEntries(ids.map((id,i)=>[id,i===0?'3334':'3333']));
   bill=randomUUID();const v={name:'Exact PHP100',date:'2026-10-25',total:'10000',paid:{[pa]:'7000',[pb]:'3000'},shares,method:'equal'};
   await ok('bill',v,a,bill);await no('bill',{...v,paid:{[pa]:'9999'}});
   await no('correct',{...v,bill,revision:bill,reason:'Wrong creator'},b);
   correction=randomUUID();await ok('correct',{...v,shares:{[pa]:'3000',[pb]:'5000',[pm]:'2000'},method:'exact',bill,revision:bill,reason:'Hosted source revision'},a,correction);
   await no('correct',{...v,bill,revision:bill,reason:'Stale revision'});
   await ok('refund',{bill,revision:correction,date:'2026-10-25',total:'1000',received:{[pa]:'1000'},credits:{[pb]:'1000'},reason:'Two independent axes'});
   assert.equal((await snapshot()).bills[bill].revisions.length,2);
 });
 await check('hosted recipient-only partial/multi-bill reports, dispute, cancellation, manual confirmation and reversal',async()=>{
   dinner=randomUUID();await ok('bill',{name:'Dinner PHP1200',date:'2026-10-25',total:'120000',paid:{[pa]:'120000'},shares:{[pa]:'40000',[pb]:'40000',[pm]:'40000'},method:'exact'},a,dinner);
   payment=randomUUID();await ok('report',{sender:pb,recipient:pa,date:'2026-10-25',amount:'15000',mode:'selected',allocations:{[dinner]:{revision:dinner,amount:'14000'},[bill]:{revision:correction,amount:'1000'}},acknowledge:false},b,payment);
   await no('resolve',{settlement:payment,state:'confirmed'},b);await ok('resolve',{settlement:payment,state:'confirmed'});
   const confirmed=await snapshot();assert.equal(confirmed.settlements[payment].state,'confirmed');
   const manual=randomUUID();await ok('report',{sender:pa,recipient:pm,date:'2026-10-25',amount:'100',mode:'custom',acknowledge:true},a,manual);
   await no('resolve',{settlement:manual,state:'confirmed'});await ok('resolve',{settlement:manual,state:'confirmed',acknowledge:true});
   await ok('resolve',{settlement:manual,state:'reversed',reason:'Retain actual cash evidence'});
   const disputed=randomUUID();await ok('report',{sender:pb,recipient:pa,date:'2026-10-25',amount:'100',mode:'custom',acknowledge:false},b,disputed);
   await ok('resolve',{settlement:disputed,state:'disputed',reason:'Not received'});await ok('resolve',{settlement:disputed,state:'cancelled',reason:'Wrong report'},b);
   const full=randomUUID(),due=(await db.query('SELECT salapiya_p3.due(salapiya_p3.edges($1),$2,$3)::text AS n',[await snapshot(),pb,pa])).rows[0].n;
   await no('report',{sender:pb,recipient:pa,date:'2026-10-25',amount:'1',mode:'full',acknowledge:false},b);
   await ok('report',{sender:pb,recipient:pa,date:'2026-10-25',amount:due,mode:'full',acknowledge:false},b,full);
   assert.equal((await snapshot()).settlements[full].advance,'0');
   await ok('resolve',{settlement:full,state:'cancelled',reason:'Keep full source allocation proof'},b);
 });
 await check('hosted reviewed manual identity claim preserves historical manual receipt limitations',async()=>{
   const candidate=await signIn(state.users.raceOwner,keys.client),token=randomBytes(32).toString('hex');
   await ok('invite',{email:candidate.user.email,participant:pm,hash:hash(token)});
   const review=await rpc('p3_review_invitation',{group_id:g,token},candidate);assert.equal(review.claim,pm);
   await ok('accept',{token,consent:true,display:'Claimed fixture',participant:randomUUID()},candidate);
   const doc=await snapshot();assert.equal(doc.people[pm].user,candidate.user.id);assert.ok(Object.values(doc.settlements).some(s=>s.recipient===pm&&s.manual===true));
 });
 await check('hosted real private adoption/refund and attributed review retain exact cash and owner isolation',async()=>{
   const profile=(await rpc('p2_profile_boundary',{})).id,account=randomUUID(),purchase=randomUUID(),adoption=randomUUID();
   async function post(id,kind,values){
     const base=(await rpc('p2_profile_boundary',{})).revision;
     const local=JSON.stringify({contract:1,authority:'local',owner:profile,expectedVersion:base,kind,values:Object.fromEntries(Object.entries(values).sort(([a],[b])=>a<b?-1:a>b?1:0))});
     const result=await rpc('p2_submit_command',{command_id:id,command_payload:JSON.stringify({contract:2,profile_id:profile,base_revision:base,payload:local})});assert.equal(result.outcome,'accepted',result.reason);
   }
   await post(account,'account',{name:'P3 hosted cash '+account.slice(0,8),kind:'Cash',amount:'2000.00',cutoff:'2026-10-24'});
   await post(purchase,'expense',{name:'P3 actual dinner',date:'2026-10-25',account,category:'category-food',amount:'1200.00'});
   const values={name:'P3 adopted dinner',date:'2026-10-25',sharedMode:'bill',sharedGroup:g,sharedKey:dinner,sharedRevision:dinner,fundingAmount:'1200.00',shareAmount:'400.00',account,category:'category-food',funding:'cash',source:purchase,sourceVersion:'1',reason:'Keep one real purchase'};
   await post(adoption,'shared',values);
   assert.equal((await db.query("SELECT salapiya_p2.balance($1,$2,'9999-12-31')::text AS n",[profile,account])).rows[0].n,'80000');
   const before=(await rpc('p2_profile_boundary',{})).revision;
   await rpc('p3_retain_private_evidence',{command_id:randomUUID(),profile_id:profile,group_id:g,bill_id:dinner,private_revision:adoption,source_stamp:dinner+':',reason:'Retain private funding evidence'});
   assert.equal((await rpc('p2_profile_boundary',{})).revision,before);
   const refund=randomUUID();await ok('refund',{bill:dinner,revision:dinner,date:'2026-10-25',total:'30000',received:{[pa]:'30000'},credits:{[pb]:'20000',[pm]:'10000'},reason:'Merchant refund after confirmed settlement'},a,refund);
   await post(randomUUID(),'shared',{name:'P3 merchant return',date:'2026-10-25',sharedAccounting:'2',sharedMode:'refund',sharedGroup:g,sharedKey:refund,sharedRevision:refund,billSource:dinner,billRevision:dinner,coverage:'adopted',fundingAmount:'300.00',shareAmount:'0.00',account,category:'category-food',funding:'cash'});
   assert.equal((await db.query("SELECT salapiya_p2.balance($1,$2,'9999-12-31')::text AS n",[profile,account])).rows[0].n,'110000');
   assert.deepEqual(await rest(`p2_command?id=eq.${adoption}`,b,keys.client),[]);
   assert.ok(!JSON.stringify(await snapshot()).includes(account));
 });
 const withSession=async(client,s,fn)=>{const claims=JSON.parse(Buffer.from(s.access_token.split('.')[1],'base64url'));await client.query('BEGIN');try{await client.query('SET LOCAL ROLE authenticated');await client.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[s.user.id,JSON.stringify(claims)]);const r=await fn(client);await client.query('COMMIT');return r;}catch(e){await client.query('ROLLBACK');throw e;}};
 await check('hosted competing corrections serialize; same-ID lost-response retry preserves one result',async()=>{
   const ids=[randomUUID(),randomUUID()],v=version;
   const values={bill,revision:correction,name:'Competing correction',date:'2026-10-25',total:'10000',paid:{[pa]:'7000',[pb]:'3000'},shares:{[pa]:'4000',[pb]:'3000',[pm]:'3000'},method:'exact',reason:'Race proof'};
   const results=await Promise.all([db,peer].map((client,i)=>withSession(client,a,c=>c.query('SELECT p3_submit_command($1,$2) AS r',[ids[i],payload('correct',values,v)]))));
   assert.deepEqual(results.map(r=>r.rows[0].r.outcome).sort(),['accepted','rejected']);
   for(let i=0;i<2;i++)assert.deepEqual(await submit('correct',values,a,ids[i],v),results[i].rows[0].r);
   version=(await snapshot()).version;
   const accepted=results.findIndex(r=>r.rows[0].r.outcome==='accepted');
   assert.deepEqual(await rpc('p3_review_command',{command_id:ids[accepted]}),results[accepted].rows[0].r);
   assert.equal((await rpc('p3_review_command',{command_id:ids[accepted]},b)).outcome,'missing');
 });
 await check('hosted API owner private isolation; offline-removal denial and former retained history excludes later activity',async()=>{
   await ok('remove',{participant:pb,reason:'Synthetic exit'});
   await no('bill',{name:'Stale offline report',date:'2026-10-25',total:'1',paid:{[pb]:'1'},shares:{[pb]:'1'},method:'exact'},b);
   const future=randomUUID();await ok('bill',{name:'Unrelated post-exit',date:'2026-10-25',total:'1',paid:{[pa]:'1'},shares:{[pa]:'1'},method:'exact'},a,future);
   const former=await snapshot(b);assert.ok(former.bills[bill]);assert.ok(!former.bills[future]);assert.equal(former.complete,false);assert.equal(former.activity.length,0);
   assert.deepEqual(await rest(`p2_command?owner_id=eq.${b.user.id}`,a,keys.client),[]);
   await rest('p3_group',a,keys.client,{method:'POST',body:{id:'forged'},expectStatus:403});
 });
 // Active native fixture remains intact for actual CDC and production UI tests.
 const native=randomUUID(),person=randomUUID(),nativeName='P3 native shared group '+native.slice(0,8);
 const np=JSON.stringify({contract:3,group:native,op:'create',version:0,values:{name:nativeName,display:'Native fixture A',participant:person}});
 assert.equal((await rpc('p3_submit_command',{command_id:randomUUID(),command_payload:np})).outcome,'accepted');
 const current=await snapshot(),former=await snapshot(b);
 state.p3={group:g,nativeGroup:native,nativeName,person,profile:(await rpc('p2_profile_boundary',{})).id,peer:b.user.id,former:pb,excludedBill:Object.keys(current.bills).find(k=>!former.bills[k])};
 await saveState(state);
 const storage=await db.query('SELECT count(*)::int AS snapshots,sum(octet_length(document))::text AS api_snapshot_bytes,sum(octet_length(sync_document))::text AS cdc_metadata_bytes FROM p3_group WHERE group_id=ANY($1::uuid[])',[[g,native]]);
 const resources=await db.query('SELECT count(*)::int AS resources,sum(octet_length(payload))::text AS cdc_resource_bytes FROM p3_resource WHERE group_id=ANY($1::uuid[])',[[g,native]]);
 timings.sort((a,b)=>a-b);report({passed:true,checks:7,command_p95_ms:Math.round(timings[Math.floor(timings.length*.95)]),storage:{...storage.rows[0],...resources.rows[0]},nativeFixtureReady:true});
}catch(e){report({failure:e.code||e.message,reason:e.message});process.exitCode=1;}finally{await db?.end();await peer?.end();}
