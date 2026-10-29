// Official management SDK: no CLI plugin manager or bundled npm runtime.
import {readFile} from 'node:fs/promises';
import {report} from './cloud.mjs';
import {powersyncClient} from './powersync-client.mjs';
try {
 if(process.argv.slice(2).some(a=>a!=='--apply'))throw Error('Only preview or --apply of reviewed development streams is supported');
 const {client,context}=await powersyncClient();
 const sync_rules=await readFile(new URL('sync-streams.yaml',import.meta.url),'utf8');
 const validation=await client.validateSyncRules({...context,sync_rules});
 const errors=[...(validation.errors||[]),...validation.connections.flatMap(c=>c.tables.flatMap(t=>t.errors))];
 if(errors.some(e=>e.level==='fatal'))throw Error('Stream validation failed; no deployment performed');
 if(!process.argv.includes('--apply'))report({operation:'preview',fatalErrors:0,warnings:errors.length});
 else {
  const existing=await client.getInstanceConfig(context);
  // Keep provider configuration and secret references. Change reviewed streams only.
  const result=await client.deployInstance({...context,config:existing.config,sync_rules,program_version:existing.program_version});
  report({operation:'deploy-reviewed-development-streams',operationId:result.operation_id});
 }
}catch(error){report({failure:error.code||error.message});process.exitCode=1;}
