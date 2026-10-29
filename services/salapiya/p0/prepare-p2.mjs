// Normal product builds consume public configuration only. No OAuth client
// secret, provider admin key, user session or database password enters Flutter.
import {writeFile,mkdir} from 'node:fs/promises';
import {apiKeys} from './auth-fixtures.mjs';
import {verifyProject,ref,report} from './cloud.mjs';
import {powersyncClient} from './powersync-client.mjs';
try {
 await verifyProject();
 const keys=await apiKeys();
 const {client,context}=await powersyncClient();
 const status=await client.getInstanceStatus(context);
 if(!status.instance_url) throw Error('Existing development instance URL unavailable');
 const target=new URL('../../../apps/salapiya/build/',import.meta.url);
 await mkdir(target,{recursive:true});
 await writeFile(new URL('p2-public-defines.json',target),JSON.stringify({
   SALAPIYA_SUPABASE_URL:`https://${ref}.supabase.co`,SALAPIYA_PUBLIC_KEY:keys.client,
   SALAPIYA_POWERSYNC_URL:status.instance_url,
 }));
 report({prepared:'apps/salapiya/build/p2-public-defines.json',publicConfigurationOnly:true});
} catch(e) {report({failure:e.code||e.message});process.exitCode=1;}
