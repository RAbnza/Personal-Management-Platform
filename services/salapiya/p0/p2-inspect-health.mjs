import {connectHosted} from './database.mjs';
import {powersyncClient} from './powersync-client.mjs';
import {report} from './cloud.mjs';
let db;
try{
 const {client,context}=await powersyncClient();
 const diagnostics=await client.getInstanceDiagnostics(context);
 db=await connectHosted();
 const consumption=(await db.query(`SELECT pg_database_size(current_database())::text AS database_bytes,
   (SELECT sum(pg_total_relation_size(c.oid))::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE c.relkind='r' AND (n.nspname='salapiya_p2' OR (n.nspname='public' AND c.relname IN ('p2_profile','p2_command')))) AS p2_table_bytes,
   (SELECT count(*)::int FROM public.p2_profile) AS p2_profiles,
   (SELECT count(*)::int FROM public.p2_command) AS p2_commands,
   (SELECT coalesce(sum(octet_length(payload)+octet_length(plan)),0)::text FROM public.p2_command) AS logical_recipe_and_plan_bytes,
   (SELECT count(*)::int FROM public.p2_command WHERE payload IS DISTINCT FROM salapiya_p2.canonical_payload(payload::jsonb)) AS noncanonical_rows`)).rows[0];
 const publication=(await db.query("SELECT schemaname,tablename FROM pg_publication_tables WHERE pubname='powersync' ORDER BY 1,2")).rows;
 const slots=diagnostics.active_sync_rules?.connections.map(c=>c.slot_name)||[];
 const wal=(await db.query('SELECT active,wal_status,pg_wal_lsn_diff(pg_current_wal_lsn(),restart_lsn)::text AS retained_wal_bytes FROM pg_replication_slots WHERE slot_name=ANY($1::text[])',[slots])).rows;
 report({measuredAt:new Date().toISOString(),consumption,publication,wal,
   sourceConnected:diagnostics.connections.every(c=>c.connected),streamErrors:diagnostics.active_sync_rules?.errors.length,
   transportBytes:'Logical payload bytes above exclude protocol/reconnect overhead; monthly transfer requires the provider usage dashboard.'});
}catch(e){report({failure:e.code||e.message});process.exitCode=1;}
finally{await db?.end();}
