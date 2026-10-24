import {readFile,writeFile,rename} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {privateDir} from './private-state.mjs';
import {report} from './cloud.mjs';
try{
  const [platform,action='status']=process.argv.slice(2);
  if(!['windows','android'].includes(platform)||!['status','google','cancel','cancel_enrollment','logout','revoke_probe','refresh','stage','proof','retrieve','new_profile','reliability'].includes(action))throw Error('Unsupported harness command');
  const directory=path.join(privateDir,'google',platform);
  const body=JSON.stringify({action});
  if(platform==='windows'){
    if(action==='status')report(JSON.parse(await readFile(path.join(directory,'status.json'),'utf8')));
    else{
      await writeFile(path.join(directory,'command.tmp'),body,{mode:0o600});
      await rename(path.join(directory,'command.tmp'),path.join(directory,'command.json'));
      report({queued:action,platform});
    }
  }else{
    const adb=process.env.SALAPIYA_ADB||'adb',serial=process.env.SALAPIYA_ANDROID_DEVICE;
    if(!serial)throw Error('Select development emulator');
    const result=spawnSync(adb,['-s',serial,'shell','run-as','dev.salapiya.salapiya',action==='status'?'cat':'tee',`files/p0-google/${action==='status'?'status.json':'command.json'}`],
      {input:action==='status'?undefined:body,encoding:'utf8',windowsHide:true});
    if(result.status!==0)throw Error('Native harness control failed');
    if(action==='status')report(JSON.parse(result.stdout));else report({queued:action,platform});
  }
}catch(error){report({failure:error.code||error.name});process.exitCode=1;}
