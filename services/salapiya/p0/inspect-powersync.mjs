import {report} from './cloud.mjs';
import {powersyncClient} from './powersync-client.mjs';
try{
 const {client,context}=await powersyncClient();
 const result=await client.listInstances({org_id:context.org_id,app_id:context.app_id});
 report({project:'salapiya-dev',instances:result.instances.map(i=>({id:i.id,name:i.name,deployable:i.deployable}))});
}catch(error){report({failure:error.code||error.message});process.exitCode=1;}
