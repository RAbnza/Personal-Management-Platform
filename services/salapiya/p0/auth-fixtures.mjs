import {randomBytes,randomUUID} from 'node:crypto';
import {sb,verifyProject,ref,protect} from './cloud.mjs';
import {readState,saveState,protectState} from './private-state.mjs';

export async function apiKeys(){
  await verifyProject();
  const keys=await sb('/api-keys');
  for(const key of keys)protect(key.api_key);
  const client=keys.find(k=>k.name==='anon')?.api_key||keys.find(k=>k.type==='publishable')?.api_key;
  const admin=keys.find(k=>k.name==='service_role')?.api_key||keys.find(k=>k.type==='secret')?.api_key;
  if(!client||!admin)throw Error('Missing secrets:read access to development client/admin API keys');
  return {client,admin};
}
export async function authRequest(path,key,{method='POST',body,bearer=key}={}){
  const response=await fetch(`https://${ref}.supabase.co/auth/v1${path}`,{
    method,headers:{apikey:key,Authorization:`Bearer ${bearer}`,'Content-Type':'application/json'},
    body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error(`Auth operation HTTP ${response.status}`);
  return response.json();
}
export async function fixtures(){
  const keys=await apiKeys();
  const state=protectState(await readState());
  state.users??={};
  for(const label of ['ownerA','ownerB','raceOwner']){
    if(!state.users[label]){
      const email=`salapiya-p0-${randomUUID()}@example.test`;
      const password=protect(randomBytes(32).toString('base64url'));
      const user=await authRequest('/admin/users',keys.admin,{body:{email,password,email_confirm:true,
        user_metadata:{salapiya_p0_fixture:true}}});
      state.users[label]={id:user.id,email,password};
      await saveState(state);
    }
  }
  return {keys,state};
}
export async function signIn(user,key){
  const session=await authRequest('/token?grant_type=password',key,{body:{email:user.email,password:user.password}});
  protect(session.access_token);protect(session.refresh_token);
  if(session.user.id!==user.id)throw Error('Fixture identity mismatch');
  return session;
}
export async function rest(path,session,key,{method='GET',body,expectStatus}={}){
  const response=await fetch(`https://${ref}.supabase.co/rest/v1/${path}`,{
    method,headers:{apikey:key,Authorization:`Bearer ${session?.access_token||key}`,'Content-Type':'application/json'},
    body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
  if(expectStatus!==undefined){if(response.status!==expectStatus)throw Error(`Unexpected authorization status ${response.status}`);return null;}
  if(!response.ok)throw Error(`Data API operation HTTP ${response.status}`);
  return response.status===204?null:response.json();
}
