import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fixtures,signIn,rest} from './auth-fixtures.mjs';
import {saveState} from './private-state.mjs';
import {report,verifyProject} from './cloud.mjs';

try {
 await verifyProject();
 const {keys,state}=await fixtures(),session=await signIn(state.users.ownerA,keys.client);
 const rpc=(name,body)=>rest(`rpc/${name}`,session,keys.client,{method:'POST',body});
 const boundary=()=>rpc('p2_profile_boundary',{}),profile=(await boundary()).id;
 if(profile!==state.p4?.profile)throw Error('Existing synthetic P4 profile identity mismatch');
 const original=JSON.parse(await readFile(new URL('../../../contracts/salapiya/p4_debt_components.json',import.meta.url),'utf8'));
 state.p4.debtIds??={};state.p4.debtEnvelopes??={};
 for(const c of original.commands)state.p4.debtIds[c.id]??=randomUUID();
 await saveState(state);
 let mapped=JSON.stringify(original).replaceAll(original.profile,profile);
 for(const [from,to] of Object.entries(state.p4.debtIds))mapped=mapped.replaceAll(from,to);
 const fixture=JSON.parse(mapped);
 for(const c of fixture.commands){
  state.p4.debtEnvelopes[c.id]??=JSON.stringify({contract:2,profile_id:profile,payload:c.payload,base_revision:(await boundary()).revision});
  await saveState(state);
  const raw=state.p4.debtEnvelopes[c.id];
  const result=await rpc('p2_submit_command',{command_id:c.id,command_payload:raw});
  assert.equal(result.outcome,'accepted',`${JSON.parse(c.payload).kind}: ${result.reason}`);
  assert.deepEqual(await rpc('p2_submit_command',{command_id:c.id,command_payload:raw}),result);
  const rows=await rest(`p2_command?id=eq.${c.id}`,session,keys.client);
  assert.equal(rows.length,1);assert.deepEqual(JSON.parse(rows[0].plan),c.plan);
 }
 report({p4HostedDebtComponents:true,commands:fixture.commands.length,independentPlanParity:true,originalReceipts:true,existingResources:true});
}catch(e){report({p4HostedDebtFailure:e.code||e.message});process.exitCode=1;}
