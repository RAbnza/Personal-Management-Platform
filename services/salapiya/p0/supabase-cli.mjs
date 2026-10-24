import {cli,report,verifyProject,ref} from './cloud.mjs';
try {
  await verifyProject();
  const args=process.argv.slice(2);
  if(!['init','link','db','migration'].includes(args[0]))throw Error('Unsupported proof CLI command');
  if(args[0]==='db'&&args[1]!=='push')throw Error('Only reviewed db push is allowed');
  if(args[0]==='link'&&!args.includes(ref))throw Error('Link must specify verified development ref');
  const result=cli(process.execPath,['node_modules/supabase/dist/supabase.js',...args]);
  report({command:args.slice(0,2),stdout:result.stdout,stderr:result.stderr});
}catch(error){report({failure:error.message});process.exitCode=1;}
