import {report} from './cloud.mjs';
export const instance='6adc9162b32a60a89a2e706c';
if(process.argv[1]?.endsWith('powersync-state.mjs')){
 try{
  const {powersyncClient}=await import('./powersync-client.mjs');
  const {client,context}=await powersyncClient();
  const config=await client.getInstanceConfig(context),status=await client.getInstanceDiagnostics(context);
  report({instance:config.id,name:config.name,region:config.config?.region,
   connections:status.connections.map(c=>({connected:c.connected,tag:c.tag})),active:!!status.active_sync_rules});
 }catch(error){report({failure:error.code||error.message});process.exitCode=1;}
}
