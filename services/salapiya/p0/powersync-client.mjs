import {verifyProject,report} from './cloud.mjs';
import {instance} from './powersync-state.mjs';
import {PowerSyncManagementClient} from '@powersync/management-client';
import {createWebNetworkClient} from '@journeyapps-labs/common-sdk';

// The public CLI plugin API supplies the same client used by official commands.
export async function powersyncClient(){
  await verifyProject();
  const client=new PowerSyncManagementClient({
    endpoint:'https://powersync-api.journeyapps.com',
    client:createWebNetworkClient({async headers(){return {Authorization:`Bearer ${process.env.PS_ADMIN_TOKEN}`};}})
  });
  const metadata=await client.getInstance({id:instance});
  if(metadata.name!=='Development'||metadata.app_id!=='6adc916056687900074d1497'||metadata.org_id!=='6adc8f1677f24600077e1c16')throw Error('PowerSync development instance mismatch');
  return {client,context:{id:instance,org_id:metadata.org_id,app_id:metadata.app_id}};
}
if(process.argv[1]?.endsWith('powersync-client.mjs')){
  try{
    const {client,context}=await powersyncClient();
    const status=await client.getInstanceStatus(context);
    report({provisioned:status.provisioned,url:status.instance_url,
      operations:status.operations.map(o=>({id:o.id,type:o.type,status:o.status,version:o.version,started:o.started_at,finished:o.finished_at}))});
  }catch(error){report({failure:error.code||error.message});process.exitCode=1;}
}
