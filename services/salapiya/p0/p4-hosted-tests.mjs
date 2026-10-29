import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {fixtures,signIn,rest} from './auth-fixtures.mjs';
import {saveState} from './private-state.mjs';
import {connectHosted} from './database.mjs';
import {report} from './cloud.mjs';

const results=[];let db,peer;
async function check(name,fn){await fn();const result={name,passed:true};results.push(result);report(result);}
try {
 const {keys,state}=await fixtures();
 const [session,other]=await Promise.all([signIn(state.users.ownerA,keys.client),signIn(state.users.ownerB,keys.client)]);
 [db,peer]=await Promise.all([connectHosted(),connectHosted()]);
 const rpc=(name,body,s=session)=>rest(`rpc/${name}`,s,keys.client,{method:'POST',body});
 const boundary=()=>rpc('p2_profile_boundary',{});
 const current=await boundary();if(!current||current.id!==(state.p3?.profile??state.p2?.profile))throw Error('Existing synthetic P2/P3 profile identity mismatch');
 state.p4??={profile:current.id,ids:{},envelopes:{}};
 if(state.p4.profile!==current.id)throw Error('Preserve and review the existing P4 fixture identity');
 const original=JSON.parse(await readFile(new URL('../../../contracts/salapiya/p4_finance.json',import.meta.url),'utf8'));
 for(const c of original.commands)state.p4.ids[c.id]??=randomUUID();await saveState(state);
 let text=JSON.stringify(original).replaceAll(original.profile,current.id);
 for(const [from,to] of Object.entries(state.p4.ids))text=text.replaceAll(from,to);
 const fixture=JSON.parse(text);
 for(const c of fixture.commands){
  const v=c.plan.revision?.values;if(!v?.occurrence)continue;
  const rule=fixture.commands.find(r=>r.id===v.rule)?.plan.revision;
  const d=createHash('sha256').update(`salapiya-recurring-1:${rule.actionId}:${rule.number}:${v.logicalDate}`).digest('hex');
  v.occurrence=`${d.slice(0,8)}-${d.slice(8,12)}-5${d.slice(13,16)}-a${d.slice(17,20)}-${d.slice(20,32)}`;
 }
 const canonical=(kind,values)=>JSON.stringify({contract:1,authority:'local',owner:current.id,expectedVersion:0,kind,values:Object.fromEntries(Object.entries(values).sort(([a],[b])=>a<b?-1:a>b?1:0))});
 const envelope=(payload,base)=>JSON.stringify({contract:2,profile_id:current.id,payload,base_revision:base});
 const post=async(kind,values,id=randomUUID())=>{
  const payload=canonical(kind,{date:'2026-10-26',...values}),raw=envelope(payload,(await boundary()).revision);
  const result=await rpc('p2_submit_command',{command_id:id,command_payload:raw});assert.equal(result.outcome,'accepted',`${kind}: ${result.reason}`);return {id,payload,raw,result};
 };
 await check('hosted P4 exact card/debt/planning plans append without replacing P1-P3 history',async()=>{
  for(const c of fixture.commands){
   if(!state.p4.envelopes[c.id]){state.p4.envelopes[c.id]=envelope(c.payload,(await boundary()).revision);await saveState(state);}
   const result=await rpc('p2_submit_command',{command_id:c.id,command_payload:state.p4.envelopes[c.id]});
   assert.equal(result.outcome,'accepted',`${JSON.parse(c.payload).kind}: ${result.reason}`);
   const rows=await rest(`p2_command?id=eq.${c.id}`,session,keys.client);
   assert.equal(rows.length,1);assert.deepEqual(JSON.parse(rows[0].plan),c.plan);
  }
 });
 await check('hosted original receipts survive ignored responses and deny changed payloads',async()=>{
  const card=fixture.commands.find(c=>JSON.parse(c.payload).kind==='creditCard').id;
  const saved=await post('cardFee',{name:'P4 hosted receipt test',card,amount:'0.01',postingDate:'2026-10-26',category:'category-fees'});
  assert.deepEqual(await rpc('p2_submit_command',{command_id:saved.id,command_payload:saved.raw}),saved.result);
  await assert.rejects(rpc('p2_submit_command',{command_id:saved.id,command_payload:saved.raw.replace('0.01','0.02')}));
  assert.equal((await db.query('SELECT count(*)::int AS n FROM p2_command WHERE id=$1',[saved.id])).rows[0].n,1);
 });
 await check('hosted signed private isolation and direct financial-write denial',async()=>{
  assert.deepEqual(await rest(`p2_command?profile_id=eq.${current.id}`,other,keys.client),[]);
  await rest('p2_command',other,keys.client,{method:'POST',body:{id:randomUUID()},expectStatus:403});
  const c=fixture.commands[1];assert.equal((await rpc('p2_submit_command',{command_id:randomUUID(),command_payload:envelope(c.payload,(await boundary()).revision)},other)).outcome,'rejected');
 });
 await check('hosted independent-session allocation race accepts one and retains the rejected receipt',async()=>{
  const card=fixture.commands.find(c=>JSON.parse(c.payload).kind==='creditCard').id,account=fixture.commands[0].id;
  const statement=(await post('statement',{name:'P4 allocation race statement',card,start:'2026-10-01',end:'2026-10-26',issued:'2026-10-26',due:'2026-11-20',amount:'1.00',minimum:'0.00',reference:'synthetic race',verified:'true'})).id;
  const payment=(await post('cardPayment',{name:'P4 allocation race cash',card,account,amount:'1.00'})).id;
  const base=(await boundary()).revision,ids=[randomUUID(),randomUUID()];
  const raw=envelope(canonical('cardAllocation',{date:'2026-10-26',name:'P4 competing allocation',card,payment,statement,amount:'1.00',verified:'true'}),base);
  const claims=JSON.parse(Buffer.from(session.access_token.split('.')[1],'base64url').toString());
  const responses=await Promise.all([db,peer].map(async(client,i)=>{
   await client.query('BEGIN');try{await client.query('SET LOCAL ROLE authenticated');await client.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[session.user.id,JSON.stringify(claims)]);
    const result=(await client.query('SELECT p2_submit_command($1,$2) AS result',[ids[i],raw])).rows[0].result;await client.query('COMMIT');return result;
   }catch(e){await client.query('ROLLBACK');throw e;}
  }));
  assert.deepEqual(responses.map(r=>r.outcome).sort(),['accepted','rejected']);
  for(let i=0;i<ids.length;i++)assert.deepEqual(await rpc('p2_submit_command',{command_id:ids[i],command_payload:raw}),responses[i]);
 });
 await check('hosted card sharing keeps one liability and sanitized group evidence',async()=>{
  const group=randomUUID(),me=randomUUID(),manual=randomUUID();let version=0;
  const groupPost=async(op,values)=>{const id=randomUUID();const r=await rpc('p3_submit_command',{command_id:id,command_payload:JSON.stringify({contract:3,group,op,version,values})});assert.equal(r.outcome,'accepted',r.reason);version=r.version;return id;};
  await groupPost('create',{name:'P4 hosted card group',participant:me,display:'Synthetic card owner'});await groupPost('manual',{participant:manual,name:'Synthetic consumer'});
  const card=(await post('creditCard',{name:`P4 shared card ${group.slice(0,8)}`,issuer:'Synthetic issuer',amount:'0.00',limit:''})).id;
  const purchase=(await post('cardPurchase',{name:'P4 hosted dinner',card,amount:'1200.00',postingDate:'2026-10-26',category:'category-food'})).id;
  const bill=await groupPost('bill',{name:'P4 hosted dinner',date:'2026-10-26',total:'120000',paid:{[me]:'120000'},shares:{[me]:'40000',[manual]:'80000'},method:'exact'});
  const adoption=(await post('shared',{name:'Private card adoption',sharedMode:'bill',sharedAccounting:'2',sharedGroup:group,sharedKey:bill,sharedRevision:bill,funding:'card',card,fundingAmount:'1200.00',shareAmount:'400.00',account:'',category:'category-food',source:purchase,sourceVersion:'1',reason:'Adopt actual private card evidence'})).id;
  const credit=(await post('cardRefund',{name:'P4 hosted actual refund',card,purchase:adoption,amount:'90.00',category:'category-food',reason:'Provider credit'})).id;
  const refund=await groupPost('refund',{bill,revision:bill,date:'2026-10-26',total:'9000',received:{[me]:'9000'},credits:{[me]:'3000',[manual]:'6000'},reason:'Provider refund'});
  await post('shared',{name:'Private card refund adoption',sharedMode:'refund',sharedAccounting:'2',sharedGroup:group,sharedKey:refund,sharedRevision:refund,funding:'card',card,fundingAmount:'90.00',shareAmount:'30.00',account:'',category:'category-food',source:credit,sourceVersion:'1',reason:'Adopt actual card refund',billSource:bill,billRevision:bill,coverage:'adopted'});
  const totals=(await db.query(`SELECT q.ledger,sum(q.amount_minor::numeric)::text AS amount FROM salapiya_p2.posting q JOIN salapiya_p2.current_revision r ON r.id=q.revision_id WHERE r.profile_id=$1 AND r.values_json->>'card'=$2 GROUP BY q.ledger`,[current.id,card])).rows;
  assert.deepEqual(Object.fromEntries(totals.map(r=>[r.ledger,r.amount])),{card_liability:'-111000',expense:'37000',shared_receivable:'74000'});
  const projection=JSON.stringify(await rest(`p3_group?group_id=eq.${group}`,session,keys.client));assert.ok(!projection.includes(card));
  state.p4.shared={group,card,bill,adoption,credit,refund};await saveState(state);
 });
 report({p4HostedPassed:results.length,syntheticData:true,existingProviderResources:true});
}catch(e){report({p4HostedFailure:e.message,passedBeforeFailure:results.length});process.exitCode=1;}
finally{await Promise.all([db?.end(),peer?.end()]);}
