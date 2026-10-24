import {randomBytes} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {connectHosted} from './database.mjs';
import {verifyProject,sb,ref,report,protect} from './cloud.mjs';
import {readState,saveState,protectState} from './private-state.mjs';

let db;
try{
  await verifyProject();db=await connectHosted();
  const existing=await db.query("SELECT rolname FROM pg_roles WHERE rolname='salapiya_p0_replication'");
  const state=protectState(await readState());
  if(existing.rowCount&&!state.replicationPassword)throw Error('Existing replication role requires its original stored password; no rotation performed');
  if(!existing.rowCount){
    state.replicationPassword=protect(randomBytes(32).toString('hex'));
    // Save before creating role so interrupted setup can resume without rotation.
    await saveState(state);
    await db.query(`CREATE ROLE salapiya_p0_replication WITH REPLICATION BYPASSRLS LOGIN PASSWORD '${state.replicationPassword}'`);
  }
  await db.query('GRANT USAGE ON SCHEMA public TO salapiya_p0_replication');
  await db.query('GRANT SELECT ON public.p0_profile,public.p0_accepted TO salapiya_p0_replication');
  const publications=await db.query("SELECT puballtables FROM pg_publication WHERE pubname='powersync'");
  if(!publications.rowCount)await db.query('CREATE PUBLICATION powersync FOR TABLE public.p0_profile,public.p0_accepted');
  const tables=(await db.query("SELECT schemaname,tablename FROM pg_publication_tables WHERE pubname='powersync' ORDER BY 1,2")).rows;
  if(JSON.stringify(tables)!==JSON.stringify([{schemaname:'public',tablename:'p0_accepted'},{schemaname:'public',tablename:'p0_profile'}]))throw Error('Publication is not restricted to the two proof tables');
  const project=await sb('');
  const ca=await readFile(new URL('supabase/certs/supabase-ca.crt',import.meta.url),'utf8');
  // Runtime environment substitution: privileged material never enters tracked YAML.
  const service=`_type: cloud\nname: Development\nregion: jp\nreplication:\n  connections:\n    - type: postgresql\n      hostname: ${project.database.host}\n      port: 5432\n      database: postgres\n      username: salapiya_p0_replication\n      password:\n        secret: !env SALAPIYA_P0_REPLICATION_PASSWORD\n      sslmode: verify-full\n      cacert: |\n${ca.trimEnd().split('\n').map(l=>'        '+l).join('\n')}\nclient_auth:\n  supabase: false\n  jwks_uri: https://${ref}.supabase.co/auth/v1/.well-known/jwks.json\n  additional_audiences: [authenticated]\n`;
  await writeFile(new URL('powersync/service.yaml',import.meta.url),service);
  await writeFile(new URL('powersync/cli.yaml',import.meta.url),'type: cloud\ninstance_id: 6adc9162b32a60a89a2e706c\n');
  report({replicationRole:'salapiya_p0_replication',publication:tables,tls:'verify-full',region:'jp'});
}catch(error){report({failure:error.code||error.message});process.exitCode=1;}
finally{await db?.end();}
