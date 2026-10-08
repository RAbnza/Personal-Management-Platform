import type { DashboardResult } from "@/modules/dashboard/services/get-dashboard";
import { parseCalendarDate } from "@/shared/calendar-date";
export function dashboardFixture(): DashboardResult {
  return {
    timezone: "Asia/Manila",
    currency: "PHP",
    weekStart: 1,
    today: "2026-10-08",
    generatedAt: "2026-10-08T01:00:00.000Z",
    financialRevision: "12",
    definitionVersion: "v1-posted-signed-1",
    period: {
      kind: "custom",
      startDate: "2026-10-01",
      endDate: "2026-10-08",
      endDateExclusive: "2026-10-09",
    },
    filters: { source: "all" },
    horizon: "2026-10-22",
    finance: {
      liquidMinor: "0",
      liabilitiesMinor: "0",
      liabilityCreditMinor: "0",
      clearingMinor: "0",
      scheduledMinor: "0",
      upcomingMinor: "0",
      trackedNetMinor: "0",
      spending: {
        grossMinor: "0",
        offsetsMinor: "0",
        netMinor: "0",
        baselineMinor: "0",
      },
      accounts: [],
      debts: [],
    },
    coverage: {
      scope:
        "Tracked cash accounts and recognized debt liabilities only. Unrecorded finances remain unknown.",
      noAccounts: true,
      noDebts: true,
      unknownSchedules: 0,
      periodBeforeCutoff: false,
      incompleteLiabilities: false,
    },
    career: {
      applications: [],
      events: [],
      activeCount: 0,
      savedCount: 0,
      interviews: 0,
      assessments: 0,
      followUps: 0,
    },
    attention: [],
    agenda: {
      workspaceTimezone: "Asia/Manila",
      today: parseCalendarDate("2026-10-08"),
      items: [],
      sourceRoutes: {},
      nextCursor: null,
    },
    overdueHasMore: false,
    activity: [],
  };
}
