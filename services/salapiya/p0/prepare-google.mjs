import path from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {apiKeys} from './auth-fixtures.mjs';
import {privateDir} from './private-state.mjs';
import {ref,report} from './cloud.mjs';
import {powersyncClient} from './powersync-client.mjs';

try{
  const platform=process.argv[2];
  if(!['windows','android'].includes(platform))throw Error('Specify native platform');
  const keys=await apiKeys();
  const {client,context}=await powersyncClient();
  const status=await client.getInstanceStatus(context);
  const directory=path.join(privateDir,'google',platform);
  await mkdir(directory,{recursive:true});
  const config={url:`https://${ref}.supabase.co`,publicKey:keys.client,powersyncUrl:status.instance_url,platform,controlDirectory:directory};
  await writeFile(path.join(directory,'config.json'),JSON.stringify(config),{mode:0o600});
  if(platform==='android'){
    if(!process.env.SALAPIYA_ANDROID_DEVICE)throw Error('Select development emulator');
    const adb=process.env.SALAPIYA_ADB||'adb';
    const result=spawnSync(adb,['-s',process.env.SALAPIYA_ANDROID_DEVICE,'shell','run-as','dev.salapiya.salapiya','tee','files/p0-google-config.json'],
      {input:JSON.stringify(config),encoding:'utf8',windowsHide:true,stdio:['pipe','ignore','pipe']});
    if(result.status!==0)throw Error('Unable to stage public configuration in debuggable app');
  }
  report({prepared:platform,configuration:'public client fields only',credentialsEmbedded:false});
}catch(error){report({failure:error.code||error.message});process.exitCode=1;}
