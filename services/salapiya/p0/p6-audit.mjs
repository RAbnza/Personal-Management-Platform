// Read-only release inventory. Never emit records, identities, tokens or secrets.
import {mkdir,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {connectHosted} from './database.mjs';
import {powersyncClient} from './powersync-client.mjs';
import {report,sb} from './cloud.mjs';
let db;
try{
 db=await connectHosted();
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
 await db.query('BEGIN READ ONLY');
 const inventory={measuredAt:new Date().toISOString(),readOnly:true};
 inventory.storage=await q(`SELECT pg_database_size(current_database())::text database_bytes,
  (SELECT coalesce(sum(pg_total_relation_size(c.oid)),0)::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE c.relkind='r' AND (n.nspname LIKE 'salapiya_%' OR (n.nspname='public' AND c.relname ~ '^p[0235]_'))) salapiya_table_bytes,
  (SELECT count(*) FROM storage.objects)::text storage_objects,(SELECT count(*) FROM storage.buckets)::int storage_buckets`);
 inventory.migrations=await q('SELECT version FROM supabase_migrations.schema_migrations ORDER BY version');
 inventory.securityDefiners=await q(`SELECT n.nspname schema,p.proname name,p.proconfig settings,
   has_function_privilege('anon',p.oid,'EXECUTE') anon_execute
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.prosecdef AND
   (n.nspname LIKE 'salapiya_%' OR (n.nspname='public' AND p.proname ~ '^p[0235]_')) ORDER BY 1,2`);
 inventory.tables=await q(`SELECT n.nspname schema,c.relname name,c.relrowsecurity rls,c.relforcerowsecurity forced_rls,
   has_table_privilege('anon',c.oid,'SELECT') anon_read,has_table_privilege('authenticated',c.oid,'INSERT') client_insert,
   has_table_privilege('authenticated',c.oid,'UPDATE') client_update,has_table_privilege('authenticated',c.oid,'DELETE') client_delete
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND
   (n.nspname LIKE 'salapiya_%' OR (n.nspname='public' AND c.relname ~ '^p[0235]_')) ORDER BY 1,2`);
 inventory.replicationGrants=await q("SELECT table_schema,table_name,privilege_type FROM information_schema.role_table_grants WHERE grantee='salapiya_p0_replication' ORDER BY 1,2,3");
 inventory.publication=await q("SELECT schemaname,tablename FROM pg_publication_tables WHERE pubname='powersync' ORDER BY 1,2");
 await db.query('COMMIT');
 const auth=await sb('/config/auth');
 inventory.auth={googleEnabled:auth.external_google_enabled,signupDisabled:auth.disable_signup,callbacks:auth.uri_allow_list,
  sessionPolicy:'Live sessions checked on command/recovery RPCs; copied JWT read revocation remains expiry-bound.'};
 const {client,context}=await powersyncClient(),diagnostics=await client.getInstanceDiagnostics(context);
 inventory.sync={sourceConnected:diagnostics.connections.every(c=>c.connected),streamErrors:diagnostics.active_sync_rules?.errors.length,
  initialReplicationDone:diagnostics.active_sync_rules?.connections.every(c=>c.initial_replication_done)};
 const slots=diagnostics.active_sync_rules?.connections.map(c=>c.slot_name)||[];
 inventory.wal=await q('SELECT active,wal_status,pg_wal_lsn_diff(pg_current_wal_lsn(),restart_lsn)::text retained_wal_bytes FROM pg_replication_slots WHERE slot_name=ANY($1::text[])',[slots]);
 inventory.sourceMigrations={};
 for(const name of (await readdir(new URL('supabase/migrations/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort())
  inventory.sourceMigrations[name]=createHash('sha256').update(await readFile(new URL(`supabase/migrations/${name}`,import.meta.url))).digest('hex');
 inventory.unmeasured=['Provider-billed monthly egress','PowerSync hosted-byte and peak-client usage dashboard','Independent hosted database restore','Quarantine/scanner deployment'];
 await mkdir(new URL('../../../out/p6/',import.meta.url),{recursive:true});
 await writeFile(new URL('../../../out/p6/hosted-audit.json',import.meta.url),JSON.stringify(inventory,null,2)+'\n');
 const unsafeDefiners=inventory.securityDefiners.filter(f=>f.anon_execute||!f.settings?.some(x=>x.startsWith('search_path=')));
 const unsafeTables=inventory.tables.filter(t=>t.anon_read||t.client_insert||t.client_update||t.client_delete);
 report({p6ReadOnlyAudit:true,...inventory.storage[0],...inventory.sync,migrations:inventory.migrations.length,
  definerCount:inventory.securityDefiners.length,unsafeDefiners:unsafeDefiners.map(f=>f.name),unsafeTables:unsafeTables.map(t=>t.name),
  wal:inventory.wal,artifact:'out/p6/hosted-audit.json'});
 if(unsafeDefiners.length||unsafeTables.length)process.exitCode=1;
}catch(e){report({p6AuditFailure:e.code||e.message});process.exitCode=1;}finally{await db?.end();}
