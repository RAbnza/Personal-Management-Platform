import {cli,report} from './cloud.mjs';
try{
  const result=cli(process.execPath,['node_modules/powersync/bin/run.js','fetch','instances','--output=json']);
  const start=result.stdout.search(/[{[]/);
  const data=JSON.parse(result.stdout.slice(start));
  // Instance discovery is metadata only. Never print fetched service config.
  const projects=Object.values(data.cloudInstances).flatMap(org=>Object.values(org.projects));
  const targets=projects.filter(p=>p.name==='salapiya-dev');
  if(targets.length!==1)throw Error('Ambiguous PowerSync development project');
  report({project:targets[0].name,instances:targets[0].instances});
}catch(error){report({failure:error.message});process.exitCode=1;}
