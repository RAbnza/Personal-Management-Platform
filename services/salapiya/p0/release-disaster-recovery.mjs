// A real encrypted hosted export and restore, ONLY into a new loopback cluster.
// Never accepts a target DSN or an existing database/cluster directory.
import pg from 'pg';
import {mkdtemp,mkdir,readFile,writeFile,readdir,rm,realpath,unlink} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {connectHosted} from './database.mjs';
import {ref,report} from './cloud.mjs';
import {capturePostgres,sealBackup,openBackup,hash,runBinary,protectedDirectory,storeGeneration} from './release-backup.mjs';

const binaries=process.env.SALAPIYA_POSTGRES_BIN;
if(!binaries)throw Error('SALAPIYA_POSTGRES_BIN must name a verified PostgreSQL binary directory');
const exe=name=>path.join(binaries,name+(process.platform==='win32'?'.exe':''));
const tables=['public.p2_profile','public.p2_command','public.p5_command','salapiya_p2.posting','salapiya_p2.receipt','salapiya_p3.groups','salapiya_p3.receipt',
 'salapiya_lifecycle.deleted_account','salapiya_lifecycle.device_session','public.p7_sync_session'];
const fingerprint=async db=>{
 await db.query("SET TIME ZONE 'UTC'");
 const out={};
 for(const table of tables){
  if(!(await db.query('SELECT to_regclass($1) present',[table])).rows[0].present){out[table]={absent:true};continue;}
  out[table]=(await db.query(`SELECT count(*)::text count,
 encode(sha256(convert_to(coalesce(string_agg(row_json,'\n' ORDER BY row_json),''),'UTF8')),'hex') digest
 FROM (SELECT to_jsonb(t)::text row_json FROM ${table} t) x`)).rows[0];
 }
 return out;
};
let source,target,clusterStarted=false,root;
const key=randomBytes(32),password=randomBytes(32).toString('base64url');
try{
 source=await connectHosted();
 await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const snapshot=(await source.query('SELECT pg_export_snapshot() AS snapshot')).rows[0].snapshot;
 const parameters=source.connectionParameters;
 const before=await fingerprint(source);
 const roles=(await source.query("SELECT rolname FROM pg_roles WHERE rolname !~ '^pg_' AND rolname<>'postgres' ORDER BY rolname")).rows.map(r=>r.rolname);
 const migrations={};
 for(const name of (await readdir(new URL('supabase/migrations/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort())
  migrations[name]=hash(await readFile(new URL('supabase/migrations/'+name,import.meta.url)));
 const hasLifecycle=(await source.query("SELECT to_regclass('salapiya_lifecycle.deleted_account') IS NOT NULL present")).rows[0].present;
 const securityJournal=hasLifecycle?{
  deletedAccounts:(await source.query('SELECT * FROM salapiya_lifecycle.deleted_account ORDER BY owner_id')).rows,
  revokedSessions:(await source.query('SELECT * FROM salapiya_lifecycle.device_session WHERE revoked_at IS NOT NULL ORDER BY session_id')).rows,
  measuredAt:new Date().toISOString(),
 }:{deletedAccounts:[],revokedSessions:[],measuredAt:new Date().toISOString(),legacyWithoutDeletionRegister:true};
 const bundle=await capturePostgres({pgDump:exe('pg_dump'),snapshot,roles,migrations,securityJournal,source:ref,connectionEnv:{
  PGHOST:parameters.host,PGPORT:String(parameters.port),PGUSER:parameters.user,PGDATABASE:parameters.database,
  PGPASSWORD:parameters.password,PGSSLMODE:'verify-full',PGSSLROOTCERT:path.resolve('supabase/certs/supabase-ca.crt'),PGAPPNAME:'salapiya_release_encrypted_backup',
 }});
 const afterCapture=await fingerprint(source);
 assert.deepEqual(afterCapture,before,'Source changed during capture; rerun an explicitly coordinated backup');
 await source.query('COMMIT');
 const encrypted=sealBackup(bundle,key);
 root=await realpath(await mkdtemp(path.join(os.tmpdir(),'salapiya-release-dr-')));
 await protectedDirectory(root);
 const copies=await storeGeneration(encrypted,[path.join(root,'copy-a'),path.join(root,'copy-b')],{scope:bundle.manifest.scope});
 const reopened=openBackup(await readFile(path.join(root,'copy-b',copies.name)),key);
 assert.deepEqual(reopened.manifest,bundle.manifest);
 assert.throws(()=>openBackup(encrypted,randomBytes(32)));
 const corrupt=Buffer.from(encrypted);corrupt[corrupt.length-20]^=1;assert.throws(()=>openBackup(corrupt,key));
 const data=path.join(root,'cluster'),passwordFile=path.join(root,'init-password');
 await writeFile(passwordFile,password+'\n',{flag:'wx',mode:0o600});
 await runBinary(exe('initdb'),['-D',data,'--username=salapiya_restore_operator',`--pwfile=${passwordFile}`,'--auth=scram-sha-256','--encoding=UTF8','--locale=C']);
 await unlink(passwordFile);
 const port=55000+Math.floor(Math.random()*5000);
 await runBinary(exe('pg_ctl'),['-D',data,'-l',path.join(root,'postgres.log'),'-o',`-p ${port} -h 127.0.0.1`,'-w','start'],{ignoreOutput:true});clusterStarted=true;
 const localEnv={PGHOST:'127.0.0.1',PGPORT:String(port),PGUSER:'salapiya_restore_operator',PGPASSWORD:password,PGSSLMODE:'disable'};
 target=new pg.Client({host:'127.0.0.1',port,user:'salapiya_restore_operator',password,database:'postgres'});await target.connect();
 const database='salapiya_dr_'+randomUUID().replaceAll('-','');
 await target.query(`CREATE DATABASE ${database}`);
 await target.query('CREATE ROLE postgres NOLOGIN');
 for(const role of roles){
  if(!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(role))throw Error('Review unexpected role name');
  // Restore grants/RLS names without copying LOGIN, passwords, SUPERUSER,
  // BYPASSRLS or provider administration credentials to the recovery machine.
  await target.query(`CREATE ROLE "${role}" NOLOGIN`);
 }
 await target.end();target=null;
 target=new pg.Client({host:'127.0.0.1',port,user:'salapiya_restore_operator',password,database});await target.connect();
 // The archive owns the schema ACLs. Only the freshly created empty database
 // above is eligible; DROP without CASCADE refuses any unexpected contents.
 await target.query('DROP SCHEMA public');await target.end();target=null;
 await runBinary(exe('pg_restore'),['--exit-on-error','--no-owner','--dbname='+database],{env:localEnv,input:Buffer.from(reopened.dump,'base64')});
 target=new pg.Client({host:'127.0.0.1',port,user:'salapiya_restore_operator',password,database});await target.connect();
 assert.deepEqual(await fingerprint(target),before,'Hosted/private/shared immutable evidence differs after actual restore');
 const rls=(await target.query("SELECT tablename,rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename IN ('p2_profile','p2_command','p3_group','p5_command') ORDER BY tablename")).rows;
 assert(rls.length===4&&rls.every(t=>t.rowsecurity));
 // Restored authentication sessions never regain service authority. Recovery
 // requires new authentication and a current out-of-band deletion/revocation
 // journal before opening any service ingress. No provider is pointed here.
 await target.query('DELETE FROM auth.sessions');
 if(hasLifecycle)await target.query('DELETE FROM public.p7_sync_session');
 const synthetic=(await target.query("SELECT p.owner_id FROM p2_profile p JOIN auth.users u ON u.id=p.owner_id WHERE u.raw_user_meta_data->>'salapiya_p0_fixture'='true' ORDER BY p.owner_id LIMIT 1")).rows[0];
 if(!synthetic)throw Error('No dedicated synthetic profile for isolated RLS verification');
 await target.query('BEGIN');
 await target.query('SET LOCAL ROLE authenticated');
 await target.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[synthetic.owner_id,JSON.stringify({sub:synthetic.owner_id,session_id:randomUUID()})]);
 if(hasLifecycle)assert.equal((await target.query('SELECT count(*)::int n FROM p2_command')).rows[0].n,0);
 await assert.rejects(target.query('SELECT * FROM salapiya_p2.receipt'),/permission denied/);
 await target.query('ROLLBACK');
 await mkdir(new URL('../../../out/release-gate/',import.meta.url),{recursive:true});
 const result={measuredAt:new Date().toISOString(),source:'verified salapiya-dev; no mutation',
  sourceSchemaMigrations:(await source.query('SELECT count(*)::int n FROM supabase_migrations.schema_migrations')).rows[0].n,
  pgDumpVersion:(await runBinary(exe('pg_dump'),['--version'])).toString().trim(),
  restoredPostgresVersion:(await target.query('SELECT version() AS v')).rows[0].v,
  encryptedBytes:encrypted.length,encryptedSha256:hash(encrypted),twoTemporaryCopies:copies.copies,
  independentPermanentDestinations:false,wrongKeyAndTamperRejected:true,exactTableFingerprints:before,
  restoredRls:rls,restoredSessionsCleared:true,securityJournal:hasLifecycle?'included; permanent independent freshness still unconfigured':'legacy baseline has no deletion register',
  providerSecretsRestored:false,PowerSyncResyncExecuted:false,
  classification:'Isolated PostgreSQL restore passed; provider/auth/PowerSync recovery and permanent destinations remain separate gates'};
 await writeFile(new URL('../../../out/release-gate/disaster-recovery.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
 report(result);
}catch(error){
 if(error.toolStderr&&root)await writeFile(path.join(root,'tool-error.txt'),error.toolStderr,{mode:0o600});
 report({disasterRecoveryFailure:error.code||error.message,protectedTemporaryTarget:root||null});process.exitCode=1;
}
finally{
 await source?.end();await target?.end();
 if(clusterStarted)await runBinary(exe('pg_ctl'),['-D',path.join(root,'cluster'),'-m','fast','-w','stop'],{ignoreOutput:true});
 key.fill(0);
 // Only this newly created, canonical temporary target may be removed. Retain
 // failures for protected diagnosis, never touch an existing DB or storage root.
 if(root&&!process.exitCode){
  assert.equal(path.dirname(root).toLowerCase(),(await realpath(os.tmpdir())).toLowerCase());
  assert(path.basename(root).startsWith('salapiya-release-dr-'));
  await rm(root,{recursive:true});
 }
}
