import { DEFAULT_TIME_ZONE, todayInTimeZone } from '@/utils/schoolCalendar'

export interface MonthlyCountSeries {
  labels: string[]
  keys: string[]
  values: number[]
}

export function monthAnchor(timeZone = DEFAULT_TIME_ZONE): Date {
  return new Date(`${todayInTimeZone(timeZone).slice(0, 7)}-15T12:00:00Z`)
}

export function recentMonthlyCounts(
  dates: Array<string | null | undefined>,
  monthCount = 6,
  now = new Date(),
): MonthlyCountSeries {
  const first = new Date(now.getFullYear(), now.getMonth() - monthCount + 1, 1)
  const keys = Array.from({ length: monthCount }, (_, index) => {
    const month = new Date(first.getFullYear(), first.getMonth() + index, 1)
    return `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`
  })
  const counts = new Map(keys.map((key) => [key, 0]))

  for (const date of dates) {
    if (!date) continue
    const match = /^(\d{4})-(\d{2})/.exec(date)
    if (!match) continue
    const key = `${match[1]}-${match[2]}`
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return {
    keys,
    values: keys.map((key) => counts.get(key) ?? 0),
    labels: keys.map((key) => {
      const [year, month] = key.split('-').map(Number)
      return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'short' })
    }),
  }
}

export function percentageChange(current: number, previous: number): number | null {
  if (previous <= 0) return null
  return ((current - previous) / previous) * 100
}
