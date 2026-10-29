// Destructive acceptance ONLY for identities/groups created inside this run.
// Never accepts a target user/group identifier or reads another private profile.
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {apiKeys,authRequest,signIn,rest} from './auth-fixtures.mjs';
import {protect,report,ref} from './cloud.mjs';
import {connectHosted} from './database.mjs';

const canonical=value=>JSON.stringify((function sort(v){return Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;})(value));
let db;
try{
 const keys=await apiKeys(),users=[];
 for(let i=0;i<2;i++){
  const email=`salapiya-erasure-${randomUUID()}@example.test`,password=protect(randomBytes(32).toString('base64url'));
  const user=await authRequest('/admin/users',keys.admin,{body:{email,password,email_confirm:true,user_metadata:{salapiya_p0_fixture:true,salapiya_release_erasure:true}}});
  const session=await signIn({id:user.id,email,password},keys.client);users.push({user,session});
 }
 const [owner,peer]=users,profile=randomUUID(),peerProfile=randomUUID();
 const rpc=(session,name,body={})=>rest('rpc/'+name,session,keys.client,{method:'POST',body});
 for(const [person,p]of [[owner,profile],[peer,peerProfile]]){
  const enrollment=randomUUID();
  assert.equal((await rpc(person.session,'p2_stage_enrollment',{enrollment_id:enrollment,profile_id:p,display_name:'Dedicated erasure acceptance',snapshot:[]})).outcome,'staged');
  assert.equal((await rpc(person.session,'p2_publish_enrollment',{enrollment_id:enrollment})).outcome,'published');
  await rpc(person.session,'p7_register_device',{device_label:'Dedicated erasure acceptance'});
 }
 const account=randomUUID();
 const command=async(id,kind,values)=>rpc(owner.session,'p2_submit_command',{command_id:id,
  command_payload:JSON.stringify({contract:2,profile_id:profile,base_revision:0,payload:JSON.stringify({contract:1,authority:'local',owner:profile,expectedVersion:0,kind,values:Object.fromEntries(Object.entries(values).sort(([a],[b])=>a.localeCompare(b)))})})});
 assert.equal((await command(account,'account',{name:'Synthetic private wallet',kind:'Cash',amount:'100.00',cutoff:'2026-10-01',date:'2026-10-29',acknowledge:'false'})).outcome,'accepted');
 assert.equal((await command(randomUUID(),'expense',{name:'Synthetic private erasure evidence',account,amount:'1.23',category:'category-food',date:'2026-10-29',acknowledge:'false'})).outcome,'accepted');
 assert.equal((await rpc(owner.session,'p5_submit_command',{command_id:randomUUID(),command_payload:canonical({contract:5,presetVersion:1,
  owner:profile,record:randomUUID(),type:'task',expectedVersion:0,reason:'Created synthetic erasure fixture',recordedAt:new Date().toISOString(),
  fields:{title:'Synthetic private task',detail:'',due:'2026-11-01',priority:'Normal',status:'Not started',completed:'',notes:'',archived:'false'}})})).outcome,'accepted');
 const group=randomUUID(),person=randomUUID(),otherPerson=randomUUID();let version=0;
 const groupCommand=async(session,op,values)=>{
  const r=await rpc(session,'p3_submit_command',{command_id:randomUUID(),command_payload:JSON.stringify({contract:3,group,version,op,values})});
  assert.equal(r.outcome,'accepted',r.reason);version=r.version;
 };
 await groupCommand(owner.session,'create',{name:'Dedicated owner erasure test group',participant:person,display:'Synthetic owner'});
 const token=randomBytes(32).toString('hex');
 await groupCommand(owner.session,'invite',{email:peer.user.email,hash:createHash('sha256').update(token).digest('hex')});
 await groupCommand(peer.session,'accept',{token,consent:true,display:'Synthetic peer',participant:otherPerson});
 await groupCommand(owner.session,'bill',{name:'Synthetic retained shared bill',date:'2026-10-29',total:'10001',paid:{[person]:'10001'},shares:{[person]:'5001',[otherPerson]:'5000'},method:'exact'});
 db=await connectHosted();
 const before=(await db.query('SELECT document FROM salapiya_p3.groups WHERE id=$1',[group])).rows[0].document;
 const identity=await authRequest('/admin/users/'+owner.user.id,keys.admin,{method:'GET'});
 assert.equal(identity.user_metadata?.salapiya_release_erasure,true);
 assert.equal(identity.id,owner.user.id);
 // Official provider deletion exercises the actual Auth schema/FKs and trigger.
 await authRequest('/admin/users/'+owner.user.id,keys.admin,{method:'DELETE'});
 for(const table of ['public.p2_profile','public.p2_command','public.p5_command','salapiya_p2.receipt','salapiya_p5.record','salapiya_p5.receipt'])
  assert.equal((await db.query(`SELECT count(*)::int n FROM ${table} WHERE owner_id=$1`,[owner.user.id])).rows[0].n,0,table);
 assert.equal((await db.query('SELECT count(*)::int n FROM salapiya_p2.posting WHERE profile_id=$1',[profile])).rows[0].n,0);
 const tombstone=(await db.query('SELECT * FROM salapiya_lifecycle.deleted_account WHERE owner_id=$1',[owner.user.id])).rows[0];
 assert.equal(tombstone.profile_id,profile);assert(tombstone.auth_cleanup_completed_at);
 assert.equal((await db.query('SELECT count(*)::int n FROM p7_sync_session WHERE owner_id=$1',[owner.user.id])).rows[0].n,0);
 const after=(await db.query('SELECT document FROM salapiya_p3.groups WHERE id=$1',[group])).rows[0].document;
 assert.equal(after.archived,true);assert.equal(after.people[person].kind,'deleted');assert.equal(after.people[person].user,null);
 assert.deepEqual(after.bills,before.bills);
 assert.equal((await rest(`p3_group?group_id=eq.${group}`,peer.session,keys.client)).length,1);
 assert.equal((await rpc(peer.session,'p2_profile_boundary')).id,peerProfile);
 assert.deepEqual(await rest('p2_profile',owner.session,keys.client),[]);
 await rest('rpc/p2_profile_boundary',owner.session,keys.client,{method:'POST',body:{},expectStatus:403});
 await rest('rpc/p2_stage_enrollment',owner.session,keys.client,{method:'POST',body:{enrollment_id:randomUUID(),profile_id:profile,display_name:'Stale archive',snapshot:[]},expectStatus:403});
 assert.deepEqual(await rpc(owner.session,'p7_deletion_status'),{application_deleted:true,auth_cleanup_pending:false});
 assert.deepEqual(await rpc(peer.session,'p7_deletion_status'),{application_deleted:false});
 const edge=await fetch(`https://${ref}.supabase.co/functions/v1/delete-account`,{method:'POST',headers:{apikey:keys.client,
  Authorization:`Bearer ${owner.session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({confirmation:'DELETE CONNECTED ACCOUNT'}),signal:AbortSignal.timeout(30000)});
 assert.equal(edge.status,200);assert.deepEqual(await edge.json(),{application_deleted:true,auth_cleanup_pending:false});
 const result={measuredAt:new Date().toISOString(),dedicatedSyntheticIdentitiesOnly:true,officialProviderIdentityDeletion:true,
  privateFinancialAndLifePurged:true,permanentDeletionMarker:true,providerCleanupCompleted:true,
  retainedSharedBillsUnchanged:true,soleOwnerGroupArchivedWithoutTakeover:true,peerPrivateProfilePreserved:true,
  staleSignedJwtRpcDenied:true,staleSignedJwtRlsEmpty:true,staleArchiveEnrollmentDenied:true,
  sessionCdcEntitlementsRemoved:true,repeatedLostResponseOutcomeVerified:true,
  limitation:'Provider-admin synthetic deletion acceptance; real Google-reauthenticated user-initiated deletion remains a separate acceptance case'};
 await mkdir(new URL('../../../out/release-gate/',import.meta.url),{recursive:true});
 await writeFile(new URL('../../../out/release-gate/hosted-deletion.json',import.meta.url),JSON.stringify(result,null,2)+'\n');report(result);
}catch(error){report({hostedDeletionFailure:error.code||error.message});process.exitCode=1;}
finally{await db?.end();}
