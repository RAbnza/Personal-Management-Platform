import { sql } from "drizzle-orm";
import type { ScopedTransaction } from "@/platform/db";
import type {
  ReminderSource,
  ReminderTarget,
  ReminderHistoryItem,
} from "../domain/reminder";

export type StoredRule = {
  id: string;
  offsetDays: number;
  localTime: string;
  enabled: boolean;
  generation: number;
  version: number;
  moduleKey: string | null;
};
export type ReminderReadRow = {
  source_kind: string;
  source_id: string;
  module_key: string;
  title: string;
  source_route: string;
  source_version: number;
  occurrence_key: string | null;
  source_generation: number | null;
  due_date: string | null;
  timezone: string;
  now: string;
  remaining_minor: string | null;
  eligible: boolean;
  module_enabled: boolean;
  agenda_visible: boolean;
  reminders_enabled: boolean;
  preference_version: number;
  mode: "inherit" | "override" | "off";
  setting_version: number;
  rules: StoredRule[];
  occurrences: (ReminderHistoryItem & { ruleId: string; version: number })[];
  schedules: { id: string; scheduledFor: string }[];
  actions: {
    id: string;
    operation: string;
    recordedAt: string;
    snoozedUntil: string | null;
  }[];
};
export function sourceColumns(s: ReminderSource) {
  return {
    personal: s.sourceKind === "personal_event" ? s.sourceId : null,
    career: s.sourceKind === "application_event" ? s.sourceId : null,
    debt: s.sourceKind === "debt_installment" ? s.sourceId : null,
  };
}
export function sourcePredicate(s: ReminderSource) {
  const c = sourceColumns(s);
  return sql`personal_event_id IS NOT DISTINCT FROM ${c.personal}::uuid AND application_event_id IS NOT DISTINCT FROM ${c.career}::uuid AND debt_obligation_id IS NOT DISTINCT FROM ${c.debt}::uuid`;
}

export async function lockReminderTarget(
  tx: ScopedTransaction,
  workspaceId: string,
  target: ReminderTarget,
) {
  // Serialize reminder writes, including virtual-default materialization. Source
  // row locks coordinate with existing source commands, independently of notes.
  await tx.db.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${workspaceId} || ':reminders',0))`,
  );
  await tx.db.execute(
    sql`SELECT id FROM core.workspace WHERE id=${workspaceId}::uuid FOR SHARE`,
  );
  const moduleKey =
    "moduleKey" in target
      ? target.moduleKey
      : target.sourceKind === "personal_event"
        ? "time"
        : target.sourceKind === "application_event"
          ? "career"
          : "money";
  await tx.db.execute(
    sql`SELECT module_key FROM core.module_preference WHERE workspace_id=${workspaceId}::uuid AND module_key=${moduleKey} FOR SHARE`,
  );
  if ("moduleKey" in target) return;
  if (target.sourceKind === "personal_event")
    await tx.db.execute(
      sql`SELECT id FROM time.personal_event WHERE workspace_id=${workspaceId}::uuid AND id=${target.sourceId}::uuid FOR SHARE`,
    );
  else if (target.sourceKind === "application_event") {
    await tx.db.execute(
      sql`SELECT a.id FROM career.job_application a JOIN career.application_event e ON e.workspace_id=a.workspace_id AND e.application_id=a.id WHERE e.workspace_id=${workspaceId}::uuid AND e.id=${target.sourceId}::uuid FOR SHARE OF a,e`,
    );
  } else
    await tx.db.execute(
      sql`SELECT d.id FROM finance.debt d JOIN finance.debt_obligation o ON o.workspace_id=d.workspace_id AND o.debt_id=d.id WHERE o.workspace_id=${workspaceId}::uuid AND o.id=${target.sourceId}::uuid FOR SHARE OF d`,
    );
}

// Grain: one resolved source, with independent bounded rule/history aggregates.
// No occurrence writes are performed by this read, including virtual defaults.
export async function readReminderSources(
  tx: ScopedTransaction,
  workspaceId: string,
  sources: ReminderSource[],
): Promise<ReminderReadRow[]> {
  if (!sources.length) return [];
  const ids = sql`ARRAY[${sql.join(
    sources.map((s) => sql`${s.sourceId}::uuid`),
    sql`, `,
  )}]`;
  const result = await tx.db.execute<ReminderReadRow>(sql`
  WITH sources AS (
    SELECT 'personal_event'::text source_kind,e.id source_id,'time'::text module_key,e.title,e.version source_version,
      '/calendar/events/'||e.id::text source_route,e.workspace_id
      FROM time.personal_event e WHERE e.workspace_id=${workspaceId}::uuid AND e.id=ANY(${ids})
    UNION ALL SELECT 'application_event',e.id,'career',e.title,e.version,'/career/applications/'||e.application_id::text,e.workspace_id
      FROM career.application_event e WHERE e.workspace_id=${workspaceId}::uuid AND e.id=ANY(${ids})
    UNION ALL SELECT 'debt_installment',o.id,'money',d.name,d.version,'/money/debts/'||d.id::text,o.workspace_id
      FROM finance.debt_obligation o JOIN finance.debt d ON d.workspace_id=o.workspace_id AND d.id=o.debt_id WHERE o.workspace_id=${workspaceId}::uuid AND o.id=ANY(${ids})
  )
  SELECT s.*,a.occurrence_key,a.notification_generation source_generation,
    COALESCE(a.event_date,(a.starts_at AT TIME ZONE COALESCE(a.timezone,w.timezone))::date)::text due_date,
    COALESCE(a.timezone,w.timezone) timezone,transaction_timestamp()::text now,a.source_id IS NOT NULL eligible,
    due.remaining_minor::text remaining_minor,
    COALESCE(p.enabled,true) module_enabled,COALESCE(p.agenda_visible,true) agenda_visible,
    COALESCE(p.reminders_enabled,true) reminders_enabled,COALESCE(p.version,0) preference_version,
    COALESCE(setting.mode,'inherit') mode,COALESCE(setting.version,0) setting_version,
    COALESCE(rules.items,'[]'::jsonb) rules,COALESCE(occ.items,'[]'::jsonb) occurrences,
    COALESCE(schedules.items,'[]'::jsonb) schedules,COALESCE(actions.items,'[]'::jsonb) actions
  FROM sources s JOIN core.workspace w ON w.id=s.workspace_id
  LEFT JOIN time.agenda_v a ON a.source_kind=s.source_kind AND a.source_id=s.source_id
  LEFT JOIN core.module_preference p ON p.workspace_id=s.workspace_id AND p.module_key=s.module_key
  LEFT JOIN finance.current_installment_due_v due ON s.source_kind='debt_installment' AND due.workspace_id=s.workspace_id AND due.obligation_id=s.source_id
  LEFT JOIN time.source_reminder_setting setting ON setting.workspace_id=s.workspace_id AND
    CASE s.source_kind WHEN 'personal_event' THEN setting.personal_event_id WHEN 'application_event' THEN setting.application_event_id ELSE setting.debt_obligation_id END=s.source_id
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object('id',r.id,'offsetDays',r.offset_days,'localTime',substring(r.local_time::text,1,5),'enabled',r.enabled,'generation',r.generation,'version',r.version,'moduleKey',r.module_key) ORDER BY r.offset_days,r.local_time,r.id) items
    FROM time.reminder_rule r WHERE r.workspace_id=s.workspace_id AND (r.module_key=s.module_key OR CASE s.source_kind WHEN 'personal_event' THEN r.personal_event_id WHEN 'application_event' THEN r.application_event_id ELSE r.debt_obligation_id END=s.source_id)
  ) rules ON true
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object('id',o.id,'ruleId',o.rule_id,'state',o.state,'scheduledFor',o.scheduled_for,'snoozedUntil',o.snoozed_until,'dismissedAt',o.dismissed_at,'cancellationReason',o.cancellation_reason,'occurrenceKey',o.occurrence_key,'sourceGeneration',o.source_generation,'ruleGeneration',o.rule_generation,'version',o.version,'updatedAt',o.updated_at) ORDER BY o.updated_at DESC,o.id) items
    FROM (SELECT * FROM time.reminder_occurrence o WHERE o.workspace_id=s.workspace_id AND CASE s.source_kind WHEN 'personal_event' THEN o.personal_event_id WHEN 'application_event' THEN o.application_event_id ELSE o.debt_obligation_id END=s.source_id ORDER BY (occurrence_key=a.occurrence_key AND source_generation=a.notification_generation) DESC,updated_at DESC,id LIMIT 58) o
  ) occ ON true
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object('id',r.id,'scheduledFor',((COALESCE(a.event_date,(a.starts_at AT TIME ZONE COALESCE(a.timezone,w.timezone))::date)-r.offset_days)+r.local_time) AT TIME ZONE COALESCE(a.timezone,w.timezone))) items
    FROM (SELECT id::text id,offset_days,local_time FROM time.reminder_rule WHERE workspace_id=s.workspace_id AND (module_key=s.module_key OR CASE s.source_kind WHEN 'personal_event' THEN personal_event_id WHEN 'application_event' THEN application_event_id ELSE debt_obligation_id END=s.source_id)
      UNION ALL SELECT 'virtual',0,'09:00'::time) r
  ) schedules ON true
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object('id',r.id,'operation',r.operation,'recordedAt',r.created_at,'snoozedUntil',r.after_json->>'snoozedUntil') ORDER BY r.created_at DESC,r.id) items
    FROM (SELECT * FROM audit.private_revision r WHERE r.workspace_id=s.workspace_id
      AND r.subject_kind IN ('reminder_occurrence','source_reminder_setting','reminder_rule')
      AND r.after_json->'target'->>'sourceId'=s.source_id::text
      AND r.after_json->'target'->>'sourceKind'=s.source_kind
      ORDER BY r.created_at DESC,r.id LIMIT 50) r
  ) actions ON true
  `);
  return result.rows.filter((r) =>
    sources.some(
      (s) => s.sourceKind === r.source_kind && s.sourceId === r.source_id,
    ),
  );
}

export async function readModuleReminderRules(
  tx: ScopedTransaction,
  workspaceId: string,
  moduleKey: string,
) {
  const rules = await tx.db.execute<{ rule: StoredRule }>(
    sql`SELECT jsonb_build_object('id',id,'offsetDays',offset_days,'localTime',substring(local_time::text,1,5),'enabled',enabled,'generation',generation,'version',version,'moduleKey',module_key) rule FROM time.reminder_rule WHERE workspace_id=${workspaceId}::uuid AND module_key=${moduleKey} ORDER BY offset_days,local_time,id`,
  );
  const context = await tx.db.execute<{
    timezone: string;
    enabled: boolean;
    agenda_visible: boolean;
    reminders_enabled: boolean;
    version: number;
  }>(
    sql`SELECT w.timezone,COALESCE(p.enabled,true) enabled,COALESCE(p.agenda_visible,true) agenda_visible,COALESCE(p.reminders_enabled,true) reminders_enabled,COALESCE(p.version,0) version FROM core.workspace w LEFT JOIN core.module_preference p ON p.workspace_id=w.id AND p.module_key=${moduleKey} WHERE w.id=${workspaceId}::uuid`,
  );
  return { rules: rules.rows.map((r) => r.rule), context: context.rows[0] };
}

// Grain: source/rule first, then one source. Count independently of the bounded
// attention page so dismissed early records cannot hide later due reminders.
export async function readReminderAttention(
  tx: ScopedTransaction,
  workspaceId: string,
) {
  const result = await tx.db.execute<{
    source_kind: string;
    source_id: string;
    total: string;
  }>(sql`
    WITH sources AS (
      SELECT a.*,w.id workspace_id,COALESCE(a.timezone,w.timezone) display_timezone,
        CASE a.source_kind WHEN 'personal_event' THEN 'time' WHEN 'application_event' THEN 'career' ELSE 'money' END module_key,
        COALESCE(a.event_date,(a.starts_at AT TIME ZONE COALESCE(a.timezone,w.timezone))::date) source_date
      FROM time.agenda_v a JOIN core.workspace w ON w.id=${workspaceId}::uuid
    ), due_rules AS (
      SELECT s.source_kind,s.source_id,COALESCE(o.snoozed_until,((s.source_date-r.offset_days)+r.local_time) AT TIME ZONE s.display_timezone) next_display
      FROM sources s
      LEFT JOIN core.module_preference p ON p.workspace_id=s.workspace_id AND p.module_key=s.module_key
      LEFT JOIN time.source_reminder_setting setting ON setting.workspace_id=s.workspace_id AND
        CASE s.source_kind WHEN 'personal_event' THEN setting.personal_event_id WHEN 'application_event' THEN setting.application_event_id ELSE setting.debt_obligation_id END=s.source_id
      CROSS JOIN LATERAL (
        SELECT r.id,r.offset_days,r.local_time,r.generation FROM time.reminder_rule r WHERE r.workspace_id=s.workspace_id AND r.enabled
          AND ((COALESCE(setting.mode,'inherit')='inherit' AND r.module_key=s.module_key)
            OR (setting.mode='override' AND CASE s.source_kind WHEN 'personal_event' THEN r.personal_event_id WHEN 'application_event' THEN r.application_event_id ELSE r.debt_obligation_id END=s.source_id))
        UNION ALL SELECT NULL::uuid,0,'09:00'::time,1 WHERE COALESCE(setting.mode,'inherit')='inherit'
          AND NOT EXISTS(SELECT 1 FROM time.reminder_rule r WHERE r.workspace_id=s.workspace_id AND r.module_key=s.module_key)
      ) r
      LEFT JOIN time.reminder_occurrence o ON o.workspace_id=s.workspace_id AND o.rule_id=r.id
        AND CASE s.source_kind WHEN 'personal_event' THEN o.personal_event_id WHEN 'application_event' THEN o.application_event_id ELSE o.debt_obligation_id END=s.source_id
        AND o.occurrence_key=s.occurrence_key AND o.source_generation=s.notification_generation AND o.rule_generation=r.generation
      WHERE COALESCE(p.reminders_enabled,true) AND COALESCE(setting.mode,'inherit')<>'off'
        AND COALESCE(o.state,'active') IN ('active','snoozed')
        AND COALESCE(o.snoozed_until,((s.source_date-r.offset_days)+r.local_time) AT TIME ZONE s.display_timezone)<=transaction_timestamp()
    ), due_sources AS (SELECT source_kind,source_id,min(next_display) next_display FROM due_rules GROUP BY source_kind,source_id)
    SELECT source_kind,source_id,count(*) OVER()::text total FROM due_sources ORDER BY next_display,source_kind,source_id LIMIT 25
  `);
  return {
    total: Number(result.rows[0]?.total ?? 0),
    sources: result.rows.map(
      (r) =>
        ({
          sourceKind: r.source_kind,
          sourceId: r.source_id,
        }) as ReminderSource,
    ),
  };
}
