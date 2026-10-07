// ---------------------------------------------------------------------------
// School calendar helpers.
//
// Rewritten in Phase 8 batch 0 to close the two deferred follow-ups this file
// previously carried as comments, both settled as decision 9 in
// docs/PHASE8_CONNECTION_PLAN.md:
//
//   1. The weekend was hardcoded to Saturday and Sunday, i.e. a Monday-to-Friday
//      week. Nom Cloud launches in Somalia, where the school week runs Sunday to
//      Thursday. schools.weekend_days has carried the correct value since Phase
//      3 and was already being fetched on every sign-in; it was simply ignored.
//
//   2. Dates were derived from new Date() and toISOString(), which is UTC.
//      Mogadishu is UTC+3, so between local midnight and 03:00 the application
//      computed YESTERDAY. attendance_records is keyed (school_id, student_id,
//      date), so a marker screen open late in the evening would have written to
//      the wrong day.
//
// Neither fix needed a schema change or a new dependency. Timezone-correct dates
// come from Intl.DateTimeFormat, which is built into every browser this project
// targets.
//
// DAY NUMBERING. Everything here speaks ISO 8601: 1 = Monday through 7 = Sunday,
// matching timetable_slots.day_of_week and schools.weekend_days. JavaScript's
// Date.getDay() uses 0 = Sunday through 6 = Saturday and is converted at the
// boundary by isoDayOfWeek. Nothing outside this file should call getDay().
// ---------------------------------------------------------------------------

import type { IsoWeekday } from '@/types'

/** Friday and Saturday, the schools.weekend_days default since Phase 3. */
/** Thursday and Friday: the default school week is Saturday through Wednesday. */
export const DEFAULT_WEEKEND_DAYS: IsoWeekday[] = [4, 5]

const SCHOOL_WEEK_ORDER: IsoWeekday[] = [6, 7, 1, 2, 3, 4]
/** Timetable order: the full Saturday-to-Friday week requested by schools. */
export const TIMETABLE_WEEKDAYS: IsoWeekday[] = [6, 7, 1, 2, 3, 4, 5]

/** The schools.timezone default since Phase 3. */
export const DEFAULT_TIME_ZONE = 'Africa/Mogadishu'

export const ISO_WEEKDAYS: IsoWeekday[] = [1, 2, 3, 4, 5, 6, 7]

const ISO_WEEKDAY_LABELS: Record<IsoWeekday, string> = {
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
  7: 'Sunday',
}

export function isoWeekdayLabel(day: IsoWeekday): string {
  return ISO_WEEKDAY_LABELS[day]
}

/**
 * The calendar date in a given timezone, as YYYY-MM-DD.
 *
 * `en-CA` is used because its short date format is already ISO-ordered, which
 * avoids reassembling parts by hand. This is the function that fixes follow-up 2.
 */
export function dateInTimeZone(date: Date = new Date(), timeZone: string = DEFAULT_TIME_ZONE): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

/** Today's date in the school's timezone, as YYYY-MM-DD. */
export function todayInTimeZone(timeZone: string = DEFAULT_TIME_ZONE): string {
  return dateInTimeZone(new Date(), timeZone)
}

/**
 * The ISO weekday, 1 to 7, of an instant as observed in a timezone.
 *
 * Computed from the timezone-local calendar date rather than from getDay() on
 * the raw instant, so it cannot disagree with dateInTimeZone near midnight.
 */
export function isoDayOfWeek(date: Date = new Date(), timeZone: string = DEFAULT_TIME_ZONE): IsoWeekday {
  const [year, month, day] = dateInTimeZone(date, timeZone).split('-').map(Number)
  // Interpreted as UTC on purpose: the parts are already timezone-local, so this
  // is a pure calendar calculation with no further offset to apply.
  const jsDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  return (jsDay === 0 ? 7 : jsDay) as IsoWeekday
}

/** Whether an ISO weekday falls in this school's weekend. */
export function isWeekendDay(day: IsoWeekday, weekendDays: readonly number[] = DEFAULT_WEEKEND_DAYS): boolean {
  return weekendDays.includes(day)
}

/**
 * The school week in ISO order: every weekday that is not in weekendDays.
 *
 * With the Somali default of {5,6} this yields [1,2,3,4,7], which renders as
 * Monday, Tuesday, Wednesday, Thursday, Sunday. Timetable grids use this to
 * decide their columns instead of assuming five Monday-to-Friday columns.
 */
export function schoolWeekdays(weekendDays: readonly number[] = DEFAULT_WEEKEND_DAYS): IsoWeekday[] {
  return SCHOOL_WEEK_ORDER.filter((day) => !weekendDays.includes(day))
}

/**
 * The last `count` school days ending today, oldest first, as YYYY-MM-DD.
 *
 * Both the weekend and the timezone are parameters now. Callers that hold a
 * SchoolRow should pass school.weekend_days and school.timezone; the defaults
 * exist only so the prototype seed keeps working until batch 5 retires it.
 */
export function lastSchoolDays(
  count: number,
  weekendDays: readonly number[] = DEFAULT_WEEKEND_DAYS,
  timeZone: string = DEFAULT_TIME_ZONE,
): string[] {
  // Guard against a school whose weekend covers every day, which the
  // schools_weekend_days_check constraint caps at three but which a caller
  // could still pass by hand.
  if (schoolWeekdays(weekendDays).length === 0) return []

  const days: string[] = []
  const cursor = new Date()
  while (days.length < count) {
    if (!isWeekendDay(isoDayOfWeek(cursor, timeZone), weekendDays)) {
      days.unshift(dateInTimeZone(cursor, timeZone))
    }
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }
  return days
}
