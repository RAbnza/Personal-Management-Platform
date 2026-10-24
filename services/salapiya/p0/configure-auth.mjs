import {verifyProject,sb,report} from './cloud.mjs';
await verifyProject();
const current=await sb('/config/auth');
const callback='dev.salapiya.p0://auth/callback';
const redirects=new Set((current.uri_allow_list||'').split(',').filter(Boolean));
if(!redirects.has(callback)){
  redirects.add(callback);
  await sb('/config/auth',{method:'PATCH',body:{uri_allow_list:[...redirects].join(',')}});
}
report({developmentCallbackAllowlisted:true,googleConfigured:current.external_google_enabled});
