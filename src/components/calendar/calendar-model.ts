import { TZDate } from "@date-fns/tz";
import type { AgendaItem } from "@/modules/time/services/list-agenda-items";

export function previousCivilDay(value: string): string {
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function agendaItemOnDay(
  item: AgendaItem,
  date: string,
  timezone: string,
): boolean {
  if (item.temporal.kind === "date") {
    return (
      item.temporal.eventDate <= date &&
      (item.temporal.endDateExclusive
        ? item.temporal.endDateExclusive > date
        : item.temporal.eventDate === date)
    );
  }
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7)) - 1;
  const day = Number(date.slice(8, 10));
  const start = new TZDate(year, month, day, 0, 0, 0, timezone).getTime();
  const end = new TZDate(year, month, day + 1, 0, 0, 0, timezone).getTime();
  const eventStart = Date.parse(item.temporal.startsAt);
  return (
    eventStart < end &&
    (item.temporal.endsAt
      ? Date.parse(item.temporal.endsAt) > start
      : eventStart >= start)
  );
}

export function calendarEvent(
  item: AgendaItem,
  routes: Record<string, string>,
) {
  const end =
    item.temporal.kind === "date"
      ? item.temporal.endDateExclusive
      : item.temporal.endsAt;
  const url = routes[`${item.sourceKind}:${item.sourceId}`];
  return {
    id: `${item.sourceKind}:${item.sourceId}:${item.occurrenceKey}`,
    title: `${{ money: "Money", career: "Career", time: "Personal", trackers: "Tracker" }[item.displayModule]} · ${item.title}`,
    allDay: item.temporal.kind === "date",
    start:
      item.temporal.kind === "date"
        ? item.temporal.eventDate
        : item.temporal.startsAt,
    ...(end ? { end } : {}),
    ...(url ? { url } : {}),
    class: `calendar-source-${item.displayModule}`,
  };
}
