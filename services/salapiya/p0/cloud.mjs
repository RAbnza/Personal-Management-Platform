import {loadEnvFile} from 'node:process';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const root=fileURLToPath(new URL('.',import.meta.url));
const ignored=spawnSync('git',['check-ignore','--quiet','.env.local'],{cwd:root});
const tracked=spawnSync('git',['ls-files','--error-unmatch','.env.local'],{cwd:root,stdio:'pipe'});
if(ignored.status!==0||tracked.status===0) throw Error('Credentials must be ignored and untracked');
loadEnvFile(new URL('.env.local',import.meta.url));
for(const name of ['SUPABASE_PROJECT_ID','SUPABASE_ACCESS_TOKEN','SUPABASE_DB_PASSWORD','PS_ADMIN_TOKEN']) {
  if(!process.env[name]) throw Error(`Missing ${name}`);
}
export const ref=process.env.SUPABASE_PROJECT_ID;
if(!/^[a-z]{20}$/.test(ref))throw Error('Invalid development project reference');
const secrets=new Set(Object.entries(process.env).filter(([k])=>/TOKEN|PASSWORD|SECRET/.test(k)).map(([,v])=>v));
export function protect(value){if(value)secrets.add(value);return value;}
export function redacted(value){let text=String(value);for(const secret of secrets){text=text.replaceAll(secret,'[REDACTED]').replaceAll(encodeURIComponent(secret),'[REDACTED]');}return text;}
export function report(value){console.log(redacted(JSON.stringify(value)));}
export async function sb(path,{method='GET',body}={}){
  const response=await fetch(`https://api.supabase.com/v1/projects/${ref}${path}`,{
    method,headers:{Authorization:`Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,'Content-Type':'application/json'},
    body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
  if(!response.ok)throw Error(`Supabase ${method} ${path} HTTP ${response.status}`);
  return response.status===204?null:response.json();
}
export async function verifyProject(){
  const project=await sb('');
  if(project.id!==ref||project.name!=='salapiya-dev'||project.region!=='ap-northeast-1'||project.status!=='ACTIVE_HEALTHY') {
    throw Error('Development project identity/region/health mismatch');
  }
  return project;
}
export async function query(sql,readOnly=true){
  await verifyProject();
  return sb(`/database/query${readOnly?'/read-only':''}`,{method:'POST',body:{query:sql}});
}
export function cli(executable,args,{allowFailure=false,timeout=180000}={}){
  const result=spawnSync(executable,args,{cwd:root,encoding:'utf8',env:process.env,timeout,windowsHide:true});
  if(result.error||result.status!==0){
    if(!allowFailure)throw Error(redacted(`CLI failed (${result.status}): ${result.stderr||result.error?.code}`));
  }
  return {...result,stdout:redacted(result.stdout||''),stderr:redacted(result.stderr||'')};
}
