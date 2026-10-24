import {verifyProject,protect,report,cli} from './cloud.mjs';
import {readState,protectState} from './private-state.mjs';
import {instance} from './powersync-state.mjs';
import {powersyncClient} from './powersync-client.mjs';
try{
  await verifyProject();
  await powersyncClient();
  const state=protectState(await readState());
  if(!state.replicationPassword)throw Error('Configure restricted replication first');
  process.env.SALAPIYA_P0_REPLICATION_PASSWORD=protect(state.replicationPassword);
  const args=['node_modules/powersync/bin/run.js','deploy',`--instance-id=${instance}`,'--sync-config-file-path=sync-streams.yaml'];
  // First-ever deployment may have no old sync config to boot with. This public
  // CLI mode includes our reviewed streams at initial boot; validate streams
  // against the running instance immediately afterward.
  if(process.argv.includes('--bootstrap'))args.push('--validate-only=configuration,connections');
  if(!process.argv.includes('--apply'))args.push('--dry-run');
  const result=cli(process.execPath,args,{timeout:420000});
  report({operation:args.includes('--dry-run')?'preview':'deploy',stdout:result.stdout,stderr:result.stderr});
}catch(error){report({failure:error.message});process.exitCode=1;}
