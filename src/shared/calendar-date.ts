const calendarDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;

declare const calendarDateBrand: unique symbol;

export type CalendarDate = string & {
  readonly [calendarDateBrand]: true;
};

function isLeapYear(year: number): boolean {
  return year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);
}

function getDaysInMonth(year: number, month: number): number {
  switch (month) {
    case 2:
      return isLeapYear(year) ? 29 : 28;

    case 4:
    case 6:
    case 9:
    case 11:
      return 30;

    default:
      return 31;
  }
}

/**
 * Validate a date-only YYYY-MM-DD value without converting it to a
 * JavaScript Date.
 *
 * Financial/due dates are calendar values, not UTC-midnight instants.
 */
export function parseCalendarDate(value: string): CalendarDate {
  const match = calendarDatePattern.exec(value);

  if (!match) {
    throw new TypeError(
      `Calendar date must use YYYY-MM-DD; received "${value}".`,
    );
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (year < 1) {
    throw new RangeError(
      `Calendar date year must be at least 0001; received "${value}".`,
    );
  }

  if (month < 1 || month > 12) {
    throw new RangeError(
      `Calendar date month is invalid; received "${value}".`,
    );
  }

  const maximumDay = getDaysInMonth(year, month);

  if (day < 1 || day > maximumDay) {
    throw new RangeError(`Calendar date day is invalid; received "${value}".`);
  }

  return value as CalendarDate;
}

export function isCalendarDate(value: string): value is CalendarDate {
  try {
    parseCalendarDate(value);

    return true;
  } catch {
    return false;
  }
}

/**
 * Compare two already validated date-only values.
 *
 * YYYY-MM-DD has chronological lexical ordering because every component is
 * fixed-width.
 */
export function compareCalendarDates(
  left: CalendarDate,
  right: CalendarDate,
): -1 | 0 | 1 {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}
