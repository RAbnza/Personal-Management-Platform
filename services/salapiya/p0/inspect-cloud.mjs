import {verifyProject,sb,query,report} from './cloud.mjs';
try {
  const project=await verifyProject();
  report({project:project.name,region:project.region,status:project.status});
  report({tables:await query("SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('public','salapiya_p0','supabase_migrations') ORDER BY 1,2")});
  const pooler=await sb('/config/database/pooler');
  report({pooler:pooler.map(x=>({host:x.db_host,port:x.db_port,user:x.db_user,mode:x.pool_mode,region:x.region}))});
  const auth=await sb('/config/auth');
  report({googleEnabled:auth.external_google_enabled,passwordEnabled:auth.external_email_enabled,signupDisabled:auth.disable_signup,redirects:auth.uri_allow_list});
  const ssl=await sb('/ssl-enforcement');
  report({sslFields:Object.keys(ssl),sslNested:Object.fromEntries(Object.entries(ssl).filter(([,v])=>v&&typeof v==='object').map(([k,v])=>[k,Object.keys(v)]))});
} catch(error){report({failure:error.message});process.exitCode=1;}
