import { Plus, X } from '@phosphor-icons/react'
import type { IsoWeekday, TimetableSlot } from '@/types'
import { cn } from '@/utils/cn'
import { isoWeekdayLabel, TIMETABLE_WEEKDAYS } from '@/utils/schoolCalendar'

export const PERIODS: { period: number; startTime: string; endTime: string }[] = [
  { period: 1, startTime: '08:00', endTime: '08:40' },
  { period: 2, startTime: '08:40', endTime: '09:20' },
  { period: 3, startTime: '09:20', endTime: '10:00' },
  { period: 4, startTime: '10:00', endTime: '10:40' },
  { period: 5, startTime: '10:40', endTime: '11:20' },
  { period: 6, startTime: '11:20', endTime: '12:00' },
  { period: 7, startTime: '12:00', endTime: '12:40' },
]

interface TimetableGridProps {
  slots: TimetableSlot[]
  editable?: boolean
  onAddSlot?: (day: IsoWeekday, period: number) => void
  onEditSlot?: (slot: TimetableSlot) => void
  onRemoveSlot?: (id: string) => void
}

export default function TimetableGrid({ slots, editable = false, onAddSlot, onEditSlot, onRemoveSlot }: TimetableGridProps) {
  // Timetables use the full school week, beginning on Saturday and ending Friday.
  const days = TIMETABLE_WEEKDAYS
  const periods = Array.from(
    new Map(
      [...PERIODS, ...slots.map((slot) => ({ period: slot.period, startTime: slot.startTime, endTime: slot.endTime }))]
        .sort((a, b) => a.period - b.period)
        .map((period) => [period.period, period]),
    ).values(),
  )

  const find = (day: IsoWeekday, period: number) => slots.find((s) => s.day === day && s.period === period)

  return (
    <div>
      <div className="space-y-4 md:hidden">
        {days.map((day) => {
          const daySlots = slots
            .filter((slot) => slot.day === day)
            .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.period - b.period)
          return (
            <section key={day} className="overflow-hidden rounded-2xl border border-ink/[0.08] dark:border-white/10">
              <header className="border-b border-ink/[0.08] bg-mist/60 px-4 py-3 dark:border-white/10 dark:bg-white/[0.04]">
                <h3 className="text-sm font-semibold text-ink dark:text-white">{isoWeekdayLabel(day)}</h3>
                <p className="mt-0.5 text-xs text-graphite">{daySlots.length} scheduled periods</p>
              </header>
              <div className="divide-y divide-ink/[0.06] dark:divide-white/[0.08]">
                {daySlots.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-graphite">No lessons scheduled.</p>
                ) : daySlots.map((slot) => (
                  <article key={slot.id} className={cn('flex items-start gap-3 px-4 py-3', !slot.subject && 'bg-amber-400/[0.08]')}>
                    <div className="w-20 shrink-0 text-xs tabular-nums">
                      <p className="font-semibold text-emerald-700 dark:text-emerald-300">{slot.startTime}</p>
                      <p className="text-red-600 dark:text-red-300">{slot.endTime}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-ink dark:text-white">{slot.subject || 'Break'}</p>
                      <p className="mt-0.5 text-xs text-graphite">{slot.teacherName ? `Teacher: ${slot.teacherName}` : 'No teacher assigned'}</p>
                      {slot.room && <p className="mt-0.5 text-xs text-graphite">{slot.room}</p>}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )
        })}
      </div>

      <div className="hidden overflow-x-auto md:block">
      <table className="w-full min-w-[640px] border-separate border-spacing-1.5 text-xs">
        <thead>
          <tr>
            <th className="w-20 text-left font-medium text-graphite">Time</th>
            {days.map((day) => (
              <th key={day} className="text-left font-medium text-graphite">{isoWeekdayLabel(day)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periods.map((p) => (
            <tr key={p.period}>
              <td className="align-top py-1 text-[11px] text-graphite">
                {p.startTime}
                <br />
                {p.endTime}
              </td>
              {days.map((day) => {
                const slot = find(day, p.period)
                return (
                  <td key={day} className="align-top">
                    {slot ? (
                      <div className="group relative">
                        <button
                          type="button"
                          onClick={() => editable && onEditSlot?.(slot)}
                          className={cn(
                            'w-full rounded-xl p-2.5 text-left',
                          slot.subject ? 'bg-accent/10 text-accent' : 'bg-amber-400/20 text-amber-700 dark:text-amber-300',
                          editable && 'transition-transform hover:-translate-y-0.5',
                          )}
                        >
                          <p className="font-semibold">{slot.subject || 'Break'}</p>
                          {slot.teacherName && <p className="text-[10px] text-accent/70">Teacher: {slot.teacherName}</p>}
                          <p className="mt-1 text-[10px] tabular-nums">
                            <span className="text-emerald-700 dark:text-emerald-300">{slot.startTime}</span>
                            <span className="px-1 text-graphite">–</span>
                            <span className="text-red-600 dark:text-red-300">{slot.endTime}</span>
                          </p>
                          {slot.room && <p className="text-[10px] text-accent/70">{slot.room}</p>}
                        </button>
                        {editable && onRemoveSlot && (
                          <button
                            onClick={() => onRemoveSlot(slot.id)}
                            className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white group-hover:flex"
                            aria-label="Remove slot"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    ) : editable && onAddSlot ? (
                      <button
                        onClick={() => onAddSlot(day, p.period)}
                        className={cn(
                          'flex h-14 w-full items-center justify-center rounded-xl border border-dashed border-ink/10 text-graphite/40 transition-colors hover:border-accent hover:text-accent dark:border-white/10',
                        )}
                        aria-label="Add class slot"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      <div className="h-14 w-full rounded-xl bg-mist/60 dark:bg-white/[0.02]" />
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  )
}
