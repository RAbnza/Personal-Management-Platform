// Read-only account/usage discovery. Never provision from marketing limits alone.
import {mkdir,writeFile} from 'node:fs/promises';
import {verifyProject,report} from './cloud.mjs';
import {powersyncClient} from './powersync-client.mjs';

async function management(path) {
 const response=await fetch('https://api.supabase.com/v1'+path,{headers:{Authorization:`Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`},signal:AbortSignal.timeout(30000)});
 if(!response.ok)return {unavailable:true,status:response.status};return response.json();
}
try{
 const project=await verifyProject(),organizations=await management('/organizations'),projects=await management('/projects');
 const organization=Array.isArray(organizations)?organizations.find(o=>o.id===project.organization_id):null;
 const details=organization?await management('/organizations/'+encodeURIComponent(organization.slug||organization.id)):null;
 const {client,context}=await powersyncClient();
 const instances=await client.listInstances({org_id:context.org_id,app_id:context.app_id});
 const start=new Date();start.setUTCDate(1);start.setUTCHours(0,0,0,0);
 const optional=async fn=>{try{return await fn();}catch{return {unavailable:true,reason:'Provider reporting permission was not granted to the existing administrative token'};}};
 const [connections,current]=await Promise.all([
  optional(()=>client.getClientConnectionReports({...context,start:start.toISOString(),end:new Date().toISOString()})),
  optional(()=>client.getConnectedClients(context)),
 ]);
 const result={measuredAt:new Date().toISOString(),readOnly:true,
  supabase:{visibleProjects:Array.isArray(projects)?projects.map(p=>({name:p.name,status:p.status,region:p.region})):projects,
   organizationVisible:!!organization,organizationResponseFields:details?Object.keys(details):[],
   verifiedPlan:details?.plan||details?.subscription?.plan||details?.billing_plan||null,
   publishedFreeLimit:'two active free projects across all owner/admin organizations; 500 MB per database; no automatic database backups'},
  powersync:{visibleDevelopmentProjectInstances:instances.instances.map(i=>({name:i.name,deployable:i.deployable})),
   currentConnections:current,monthConnectionReport:connections,
   publishedFreeLimit:'two instances; 500 MB hosted; 2 GB monthly sync; 50 peak clients; inactive one week',
   verifiedAccountPlan:null},
  thresholds:{monitor:70,investigate:85,pauseExpansion:90},
  audience:'owner and brothers only; friends expansion requires a later decision',
  unverified:['Supabase actual subscription/free-project entitlement across all owner/admin organizations','PowerSync organization subscription and free instance entitlement',
   'Provider-billed Supabase egress','PowerSync hosted bytes, monthly billed sync and peak clients','Independent permanent backup storage quotas'],
  provisioning:'not performed; plan/entitlements and OAuth pilot prerequisites must be verified before any no-cost creation',
  safeAlternative:'Keep real records local-only with protected independently recoverable archives until a separate pilot is verified; never mix them with destructive fixtures'};
 // Aggregate current counts only; do not retain individual connected-user IDs.
 if(result.powersync.currentConnections?.sdks)result.powersync.currentConnections={users:current.users,sdks:current.sdks};
 await mkdir(new URL('../../../out/release-gate/',import.meta.url),{recursive:true});
 await writeFile(new URL('../../../out/release-gate/provider-inventory.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
 report(result);
}catch(error){report({providerInventoryFailure:error.code||error.message});process.exitCode=1;}
