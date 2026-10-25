import path from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fixtures,signIn} from './auth-fixtures.mjs';
import {privateDir,saveState} from './private-state.mjs';
import {report,ref} from './cloud.mjs';
try{
 const role=process.argv[2];if(!['windows','android'].includes(role))throw Error('Choose native role');
 const {keys,state}=await fixtures();
 if(!state.p2?.profile)throw Error('Run the hosted P2 fixture first');
 const [owner,other]=await Promise.all([signIn(state.users.ownerA,keys.client),signIn(state.users.ownerB,keys.client)]);
 const config={url:`https://${ref}.supabase.co`,publicKey:keys.client,
   role,profile:state.p2.profile,refreshToken:owner.refresh_token,otherRefreshToken:other.refresh_token};
 const dir=path.join(privateDir,'p2',role);await mkdir(dir,{recursive:true});
 await writeFile(path.join(dir,'config.json'),JSON.stringify(config),{mode:0o600});
 if(role==='android'){
   const adb=process.env.SALAPIYA_ADB,serial=process.env.SALAPIYA_ANDROID_DEVICE;
   if(!adb||!serial)throw Error('Select existing emulator and ADB');
   const result=spawnSync(adb,['-s',serial,'shell','run-as','dev.salapiya.salapiya','tee','files/p2-native-config.json'],
     {input:JSON.stringify(config),encoding:'utf8',windowsHide:true,stdio:['pipe','ignore','pipe']});
   if(result.status!==0)throw Error('Unable to stage private config without replacing application data');
 }
 await saveState(state);report({prepared:role,credentials:'OS-user/app-private file only; consumed by test',publicKeysOnlyInBuild:true});
}catch(e){report({failure:e.code||e.message});process.exitCode=1;}
