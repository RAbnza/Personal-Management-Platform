// Dedicated synthetic user per run; no existing account/session is revoked.
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
import {apiKeys,authRequest,signIn,rest} from './auth-fixtures.mjs';
import {privateDir} from './private-state.mjs';
import {report,ref,protect} from './cloud.mjs';
import {powersyncClient} from './powersync-client.mjs';
try{
 const role=process.argv[2];if(!['windows','android'].includes(role))throw Error('Choose windows or android');
 const keys=await apiKeys(),password=protect(randomBytes(32).toString('base64url'));
 const email=`salapiya-release-${randomUUID()}@example.test`;
 const user=await authRequest('/admin/users',keys.admin,{body:{email,password,email_confirm:true,user_metadata:{salapiya_p0_fixture:true,salapiya_release_lifecycle:true}}});
 const primary=await signIn({id:user.id,email,password},keys.client),peer=await signIn({id:user.id,email,password},keys.client);
 const profile=randomUUID(),enrollment=randomUUID();
 const rpc=(session,name,body)=>rest('rpc/'+name,session,keys.client,{method:'POST',body});
 assert.equal((await rpc(primary,'p2_stage_enrollment',{enrollment_id:enrollment,profile_id:profile,display_name:'Release lifecycle synthetic',snapshot:[]})).outcome,'staged');
 assert.equal((await rpc(primary,'p2_publish_enrollment',{enrollment_id:enrollment})).outcome,'published');
 await rpc(primary,'p7_register_device',{device_label:`Synthetic ${role} session`});
 await rpc(peer,'p7_register_device',{device_label:'Synthetic authorized peer'});
 const sid=JSON.parse(Buffer.from(primary.access_token.split('.')[1],'base64url')).session_id;
 const peerSid=JSON.parse(Buffer.from(peer.access_token.split('.')[1],'base64url')).session_id;
 assert.notEqual(sid,peerSid);
 // Real signed password sessions must not satisfy recent Google deletion.
 await rest('rpc/p7_delete_account',primary,keys.client,{method:'POST',body:{confirmation:'DELETE CONNECTED ACCOUNT'},expectStatus:403});
 const edge=await fetch(`https://${ref}.supabase.co/functions/v1/delete-account`,{method:'POST',
  headers:{apikey:keys.client,Authorization:`Bearer ${primary.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({confirmation:'DELETE CONNECTED ACCOUNT'}),signal:AbortSignal.timeout(30000)});
 assert.equal(edge.status,403,'Password fixture must not erase an account through the deployed function');
 const {client,context}=await powersyncClient(),status=await client.getInstanceStatus(context);
 const config={url:`https://${ref}.supabase.co`,publicKey:keys.client,endpoint:status.instance_url,
  profile,actor:user.id,refreshToken:primary.refresh_token,peerRefreshToken:peer.refresh_token};
 const directory=path.join(privateDir,'release-gate',role);await mkdir(directory,{recursive:true});
 const file=path.join(directory,'config.json');await writeFile(file,JSON.stringify(config),{mode:0o600});
 if(role==='android'){
  const adb=process.env.SALAPIYA_ADB,serial=process.env.SALAPIYA_ANDROID_DEVICE;
  if(!adb||!serial)throw Error('Select the existing isolated emulator and ADB');
  const result=spawnSync(adb,['-s',serial,'shell','run-as','dev.salapiya.salapiya','tee','files/release-lifecycle-config.json'],
   {input:JSON.stringify(config),windowsHide:true,stdio:['pipe','ignore','pipe']});
  if(result.status!==0)throw Error('Unable to stage app-private runtime fixture without changing installed data');
 }
 report({prepared:role,hostedRecentGoogleDeletionNegative:true,hostedEdgeDeletionNegative:true,
  credentials:'OS-user/app-private runtime file; never compiled into the application',configPath:role==='windows'?file:undefined});
}catch(error){report({failure:error.code||error.message});process.exitCode=1;}
