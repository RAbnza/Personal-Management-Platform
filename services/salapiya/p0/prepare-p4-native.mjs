import path from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fixtures,signIn,rest} from './auth-fixtures.mjs';
import {saveState,privateDir} from './private-state.mjs';
import {powersyncClient} from './powersync-client.mjs';
import {report,ref} from './cloud.mjs';
try {
 const role=process.argv[2];if(!['windows','android'].includes(role))throw Error('Choose an existing native target');
 const {keys,state}=await fixtures(),session=await signIn(state.users.ownerA,keys.client);
 const rpc=(name,body)=>rest(`rpc/${name}`,session,keys.client,{method:'POST',body});
 const boundary=await rpc('p2_profile_boundary',{});
 if(boundary.id!==state.p4?.profile)throw Error('Existing P4 synthetic profile identity mismatch');
 if(!state.p4.nativeGroup) {
  const group=randomUUID(),me=randomUUID(),manual=randomUUID(),name=`P4 native cards ${group.slice(0,8)}`;
  let version=0;
  for(const [op,values] of [['create',{name,participant:me,display:'Native P4 owner'}],['manual',{participant:manual,name:'Native P4 consumer'}]]) {
   const result=await rpc('p3_submit_command',{command_id:randomUUID(),command_payload:JSON.stringify({contract:3,group,op,version,values})});
   if(result.outcome!=='accepted')throw Error('Native synthetic group preparation rejected');version=result.version;
  }
  state.p4.nativeGroup={group,name,me,manual};await saveState(state);
 }
 const {client,context}=await powersyncClient(),status=await client.getInstanceStatus(context);
 const config={url:`https://${ref}.supabase.co`,publicKey:keys.client,endpoint:status.instance_url,profile:boundary.id,role,refreshToken:session.refresh_token,...state.p4.nativeGroup};
 const directory=path.join(privateDir,'p4',role);await mkdir(directory,{recursive:true});
 await writeFile(path.join(directory,'defines.json'),JSON.stringify({SALAPIYA_SUPABASE_URL:config.url,SALAPIYA_PUBLIC_KEY:config.publicKey,SALAPIYA_POWERSYNC_URL:config.endpoint}));
 await writeFile(path.join(directory,'config.json'),JSON.stringify(config),{mode:0o600});
 if(role==='android') {
  const adb=process.env.SALAPIYA_ADB,serial=process.env.SALAPIYA_ANDROID_DEVICE;
  if(!adb||!serial)throw Error('Select the existing emulator and ADB');
  const directoryResult=spawnSync(adb,['-s',serial,'shell','run-as','dev.salapiya.salapiya','mkdir','-p','files'],{encoding:'utf8',windowsHide:true,stdio:['ignore','ignore','pipe']});
  if(directoryResult.status!==0)throw Error('Native private directory is unavailable; existing installation was not reset');
  const result=spawnSync(adb,['-s',serial,'shell','run-as','dev.salapiya.salapiya','tee','files/p4-native-config.json'],{input:JSON.stringify(config),encoding:'utf8',windowsHide:true,stdio:['pipe','ignore','pipe']});
  if(result.status!==0)throw Error('Native config staging failed; existing installation was not reset');
 }
 report({prepared:role,p4NativeGroup:true,privateConfigOnly:true,existingProviderResources:true});
}catch(e){report({failure:e.code||e.message});process.exitCode=1;}
