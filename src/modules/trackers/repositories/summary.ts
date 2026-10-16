import { sql } from "drizzle-orm";
import type { ScopedTransaction } from "@/platform/db";
export async function readTrackerSummary(t: ScopedTransaction) {
  const counts = (
    await t.db.execute<{
      active: number;
      completed: number;
      overdue: number;
      agendaVisible: boolean;
      enabled: boolean;
    }>(
      sql`SELECT count(*) FILTER(WHERE e.completed_at IS NULL)::int active,count(*) FILTER(WHERE e.completed_at IS NOT NULL)::int completed,count(*) FILTER(WHERE e.completed_at IS NULL AND e.deadline_date<(transaction_timestamp() AT TIME ZONE w.timezone)::date)::int overdue,COALESCE((SELECT p.agenda_visible FROM core.module_preference p WHERE p.module_key='trackers'),true) "agendaVisible",COALESCE((SELECT p.enabled FROM core.module_preference p WHERE p.module_key='trackers'),true) enabled FROM tracker.entry e JOIN tracker.tracker tr ON tr.id=e.tracker_id AND tr.workspace_id=e.workspace_id JOIN core.workspace w ON w.id=e.workspace_id WHERE e.archived_at IS NULL AND tr.archived_at IS NULL`,
    )
  ).rows[0]!;
  const due = (
    await t.db.execute<{ id: string; title: string; date: string }>(
      sql`SELECT e.id,e.title,e.deadline_date::text date FROM tracker.entry e JOIN tracker.tracker tr ON tr.id=e.tracker_id AND tr.workspace_id=e.workspace_id JOIN core.workspace w ON w.id=e.workspace_id WHERE e.archived_at IS NULL AND tr.archived_at IS NULL AND e.completed_at IS NULL AND e.deadline_date<(transaction_timestamp() AT TIME ZONE w.timezone)::date ORDER BY e.deadline_date,e.id LIMIT 6`,
    )
  ).rows;
  return { ...counts, due };
}
