// Operator entry point. Config and storage are external, private and explicit.
// No scheduler, destination or encryption key is inferred or auto-provisioned.
import {readFile,stat,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {backupKey,capturePostgres,sealBackup,openBackup,storeGeneration,hash} from './release-backup.mjs';

let db,key;
try {
 if(process.argv.length!==3)throw Error('Usage: node release-backup-cli.mjs <external-config.json>; secrets come from the process environment');
 const configPath=path.resolve(process.argv[2]),repository=fileURLToPath(new URL('../../../',import.meta.url));
 if(configPath.toLowerCase().startsWith(repository.toLowerCase()))throw Error('Backup configuration must remain outside the repository');
 const config=JSON.parse(await readFile(configPath,'utf8'));
 let bytes,scope;
 if(config.kind==='portable') {
  if((await stat(config.archive)).size>33*1024*1024)throw Error('Portable archive exceeds the supported size');
  bytes=await readFile(config.archive);
  const header=Buffer.from('SALAPIYA-LOCAL-ARCHIVE-1\n');
  if(bytes.length<header.length+28||!bytes.subarray(0,header.length).equals(header))throw Error('Select an existing encrypted Salapiya portable archive');
  if(typeof config.profileScope!=='string'||!/^[0-9a-f-]{36}$/.test(config.profileScope))throw Error('Explicit portable profile UUID required');
  scope='portable:'+config.profileScope;
 }else if(config.kind==='development-postgres') {
  const {ref}=await import('./cloud.mjs');
  if(config.expectedProject!==ref)throw Error('Backup project does not match the explicitly selected development source');
  const {connectHosted}=await import('./database.mjs');db=await connectHosted();
  key=backupKey(process.env.SALAPIYA_BACKUP_KEY);
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const snapshot=(await db.query('SELECT pg_export_snapshot() AS snapshot')).rows[0].snapshot;
  const roles=(await db.query("SELECT rolname FROM pg_roles WHERE rolname !~ '^pg_' AND rolname<>'postgres' ORDER BY rolname")).rows.map(r=>r.rolname);
  const migrations={};
  for(const name of (await readdir(new URL('supabase/migrations/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort())migrations[name]=hash(await readFile(new URL('supabase/migrations/'+name,import.meta.url)));
  const securityJournal={measuredAt:new Date().toISOString(),
   deletedAccounts:(await db.query('SELECT * FROM salapiya_lifecycle.deleted_account')).rows,
   revokedSessions:(await db.query('SELECT * FROM salapiya_lifecycle.device_session WHERE revoked_at IS NOT NULL')).rows};
  const c=db.connectionParameters;
  const bundle=await capturePostgres({pgDump:config.pgDump,snapshot,roles,migrations,securityJournal,source:ref,connectionEnv:{
   PGHOST:c.host,PGPORT:String(c.port),PGUSER:c.user,PGDATABASE:c.database,PGPASSWORD:c.password,
   PGSSLMODE:'verify-full',PGSSLROOTCERT:path.resolve('supabase/certs/supabase-ca.crt'),PGAPPNAME:'salapiya_independent_encrypted_backup',
  }});
  await db.query('COMMIT');bytes=sealBackup(bundle,key);openBackup(bytes,key);scope=bundle.manifest.scope;
 }else throw Error('Choose portable or development-postgres; a pilot adapter requires separately verified access');
 const result=await storeGeneration(bytes,config.destinations,{scope});
 console.log(JSON.stringify({backupVerified:true,...result,permanentDestinationsOperational:false,
  note:'Two matching copies do not prove independent storage; verify and record real media/location boundaries separately'}));
}catch(error){console.error(JSON.stringify({backupFailed:true,code:error.code||'backup_incomplete',message:'No operational success recorded. Check the selected source, key, tool and protected destinations locally.'}));process.exitCode=1;}
finally{key?.fill(0);await db?.end();}
