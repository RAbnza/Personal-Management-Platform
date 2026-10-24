import {cli,report,verifyProject} from './cloud.mjs';
import {readState,protectState} from './private-state.mjs';
export const instance='6adc9162b32a60a89a2e706c';
export function ps(args){
  const result=cli(process.execPath,['node_modules/powersync/bin/run.js',...args]);
  return result.stdout;
}
export function jsonOutput(value){return JSON.parse(value.slice(value.search(/[{[]/)));}
if(process.argv[1]?.endsWith('powersync-state.mjs')){
  try{
    await verifyProject();
    const state=protectState(await readState());
    process.env.SALAPIYA_P0_REPLICATION_PASSWORD=state.replicationPassword||'';
    const config=jsonOutput(ps(['fetch','config',`--instance-id=${instance}`,'--output=json']));
    report({fields:Object.keys(config),instance:config.id,name:config.name,region:config.config?.region,
      configFields:Object.keys(config.config||{}),connections:config.config?.replication?.connections?.length,
      deployable:config.deployable,program:config.program_version});
    const status=jsonOutput(ps(['fetch','status',`--instance-id=${instance}`,'--output=json']));
    report({statusFields:Object.keys(status),connections:status.connections?.map(c=>({connected:c.connected,tag:c.tag})),active:!!status.active_sync_rules});
  }catch(error){report({failure:error.message});process.exitCode=1;}
}
