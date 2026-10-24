import {connectHosted} from './database.mjs';
import {powersyncClient} from './powersync-client.mjs';
import {report} from './cloud.mjs';

let db;
try{
  const {client,context}=await powersyncClient();
  const status=await client.getInstanceStatus(context);
  const diagnostics=status.provisioned?await client.getInstanceDiagnostics(context):null;
  db=await connectHosted();
  const storage=(await db.query(`SELECT pg_database_size(current_database())::text AS database_bytes,
    (SELECT coalesce(sum(pg_total_relation_size(c.oid)),0)::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE c.relkind='r' AND (n.nspname='salapiya_p0' OR (n.nspname='public' AND c.relname IN ('p0_profile','p0_accepted')))) AS proof_table_bytes,
    (SELECT count(*)::int FROM public.p0_accepted) AS accepted_actions,
    (SELECT count(*)::int FROM salapiya_p0.receipt) AS receipts`)).rows[0];
  const replication=diagnostics?.active_sync_rules?.connections||[];
  const slots=replication.map(c=>c.slot_name);
  const wal=(await db.query(`SELECT active,wal_status,
    pg_wal_lsn_diff(pg_current_wal_lsn(),restart_lsn)::text AS retained_wal_bytes
    FROM pg_replication_slots WHERE slot_name=ANY($1::text[])`,[slots])).rows;
  report({measuredAt:new Date().toISOString(),provisioned:status.provisioned,storage,
    sourceConnected:diagnostics?.connections.every(c=>c.connected),
    streamErrorCount:diagnostics?.active_sync_rules?.errors.length,
    replication:replication.map(c=>({initialReplicationDone:c.initial_replication_done,
      lagBytes:c.replication_lag_bytes,checkpoint:c.last_checkpoint_ts,
      tables:c.tables.map(t=>({schema:t.schema,name:t.name,errorCount:t.errors.length}))})),wal,
    monthlyTraffic:'not exposed by this diagnostics endpoint; dashboard measurement remains required'});
}catch(error){report({failure:error.code||error.message});process.exitCode=1;}
finally{await db?.end();}
