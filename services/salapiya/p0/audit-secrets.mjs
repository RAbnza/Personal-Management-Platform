import {spawnSync} from 'node:child_process';
import {apiKeys} from './auth-fixtures.mjs';
import {readState} from './private-state.mjs';
import {root,report,sb,protect} from './cloud.mjs';

try{
  const keys=await apiKeys();
  const auth=await sb('/config/auth');
  const values=[keys.admin,...['SUPABASE_ACCESS_TOKEN','SUPABASE_DB_PASSWORD','PS_ADMIN_TOKEN']
    .map(name=>process.env[name])];
  if(auth.external_google_secret&&!/^\*+$/.test(auth.external_google_secret)){
    values.push(protect(auth.external_google_secret));
  }
  function collect(value){
    for(const [key,item]of Object.entries(value)){
      if(item&&typeof item==='object')collect(item);
      else if(typeof item==='string'&&/password|token|secret/i.test(key))values.push(item);
    }
  }
  collect(await readState());
  const result=spawnSync('python',['audit-secrets.py'],{cwd:root,
    input:JSON.stringify(values.filter(Boolean)),encoding:'utf8',windowsHide:true});
  // The scanner emits counts and paths only, never matched values/content.
  if(result.stdout)process.stdout.write(result.stdout);
  if(result.status!==0)throw Error('Credential scan failed; inspect reported paths privately');
}catch(error){report({failure:error.code||error.message});process.exitCode=1;}
