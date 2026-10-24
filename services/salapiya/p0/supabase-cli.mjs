import {cli,report,verifyProject,ref} from './cloud.mjs';
try {
  await verifyProject();
  const args=process.argv.slice(2);
  const command=args.join(' ');
  const allowed=command==='init'||command===`link --project-ref ${ref}`
    || command==='migration list --linked'
    || (args[0]==='db'&&args[1]==='push'&&args.includes('--linked')
      && args.slice(2).every(a=>['--linked','--dry-run','--yes'].includes(a)));
  if(!allowed)throw Error('Only scoped link, migration list and reviewed linked db push are allowed');
  const result=cli(process.execPath,['node_modules/supabase/dist/supabase.js',...args]);
  report({command:args.slice(0,2),stdout:result.stdout,stderr:result.stderr});
}catch(error){report({failure:error.message});process.exitCode=1;}
