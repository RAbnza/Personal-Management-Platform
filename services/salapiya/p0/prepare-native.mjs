import {randomBytes,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fixtures,authRequest,signIn} from './auth-fixtures.mjs';
import {protect,report,ref} from './cloud.mjs';
import {privateDir,saveState} from './private-state.mjs';
import {powersyncClient} from './powersync-client.mjs';

try{
  const {keys,state}=await fixtures();
  if(!state.nativeUser){
    const email=`salapiya-p0-native-${randomUUID()}@example.test`,password=protect(randomBytes(32).toString('base64url'));
    const user=await authRequest('/admin/users',keys.admin,{body:{email,password,email_confirm:true,user_metadata:{salapiya_p0_fixture:true}}});
    state.nativeUser={id:user.id,email,password};await saveState(state);
  }
  const {client,context}=await powersyncClient();
  const status=await client.getInstanceStatus(context);
  if(!status.instance_url)throw Error('Existing instance URL unavailable');
  const diagnostics=status.provisioned?await client.getInstanceDiagnostics(context):null;
  const syncReady=!!diagnostics?.active_sync_rules && diagnostics.connections.every(c=>c.connected)
    && !diagnostics.active_sync_rules.errors.some(e=>e.level==='fatal');
  const role=process.argv[2];
  if(!['windows','android'].includes(role))throw Error('Specify windows or android');
  const primary=await signIn(state.nativeUser,keys.client);
  const other=await signIn(state.users.ownerB,keys.client);
  const config={url:`https://${ref}.supabase.co`,publicKey:keys.client,powersyncUrl:status.instance_url,
    syncEnabled:syncReady,owner:primary.user.id,otherOwner:other.user.id,
    refreshToken:primary.refresh_token,otherRefreshToken:other.refresh_token,role,
    profileId:randomUUID(),sourceId:randomUUID(),commandId:randomUUID(),rejectedId:randomUUID(),
    unrelatedId:randomUUID(),missingId:randomUUID(),offlineId:randomUUID(),otherCommandId:randomUUID()};
  state.nativeCommands??={};
  if(role==='android')config.peerCommandId=state.nativeCommands.windows;
  state.nativeCommands[role]=config.commandId;
  await saveState(state);
  if(role==='windows'){
    await writeFile(path.join(privateDir,'windows.json'),JSON.stringify(config),{mode:0o600});
  }else{
    const sdk=process.env.ANDROID_HOME||process.env.ANDROID_SDK_ROOT;
    const adb=process.env.SALAPIYA_ADB||(sdk?path.join(sdk,'platform-tools','adb.exe'):'adb');
    const serial=process.env.SALAPIYA_ANDROID_DEVICE;
    if(!serial)throw Error('Set SALAPIYA_ANDROID_DEVICE to the selected development emulator');
    const directory=spawnSync(adb,['-s',serial,'shell','run-as','dev.salapiya.salapiya','mkdir','-p','files'],{encoding:'utf8',windowsHide:true});
    if(directory.status!==0)throw Error('Unable to create private native fixture directory');
    const result=spawnSync(adb,['-s',serial,'shell','run-as','dev.salapiya.salapiya','tee',
      'files/p0-hosted-config.json'],{input:JSON.stringify(config),encoding:'utf8',windowsHide:true,stdio:['pipe','ignore','pipe']});
    if(result.status!==0)throw Error('Unable to stage private native fixture with run-as');
  }
  report({prepared:role,privilegedKeysInClient:false,syncProvisioned:status.provisioned,syncReady,config:'external OS-user/app-private runtime file; consumed and deleted by test'});
}catch(error){report({failure:error.code||error.message});process.exitCode=1;}
