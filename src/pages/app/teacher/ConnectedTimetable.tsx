import { useMemo, useState } from 'react'
import { CalendarBlank as CalendarRange, Clock as Clock3, MapPin } from '@phosphor-icons/react'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import { useTeacherClasses } from '@/hooks/useTeacherClasses'
import PageHeader from '@/components/ui/PageHeader'
import ResourceGate from '@/components/ui/ResourceGate'
import Select from '@/components/ui/Select'
import TimetableGrid from '@/components/dashboard/TimetableGrid'
import EmptyState from '@/components/ui/EmptyState'
import { schoolWeekdays } from '@/utils/schoolCalendar'

export default function ConnectedTeacherTimetable() {
  const { school } = useAuth()
  const { t } = useLanguage()
  const { state, classes, timetable, teacherId } = useTeacherClasses()
  const [classId, setClassId] = useState('')
  const [view, setView] = useState<'route' | 'class'>('route')
  const visibleDays = useMemo(() => schoolWeekdays(school?.weekend_days), [school?.weekend_days])
  const selectedClass = classes.find((item) => item.id === classId) ?? classes[0] ?? null
  const selectedSlots = timetable.filter((slot) => slot.classId === selectedClass?.id)
  const teacherSlots = timetable.filter((slot) => slot.teacherId === teacherId)
  const classNameById = useMemo(() => new Map(classes.map((item) => [item.id, item.name])), [classes])

  return (
    <div>
      <PageHeader
        title={t('teacher.timetable.title')}
        description={t('teacher.timetable.description')}
      />
      <ResourceGate
        state={state}
        empty={{
          icon: CalendarRange,
          title: t('teacher.timetable.noClasses'),
          description: t('teacher.timetable.emptyDescription'),
        }}
        deniedHint={t('teacher.timetable.access')}
      >
        {() => (
          <div>
            {teacherSlots.length === 0 ? (
              <EmptyState icon={CalendarRange} title={t('teacher.timetable.notPublished')} description={t('teacher.timetable.noLessons')} />
            ) : (
              <>
                <div className="mb-5 flex flex-col gap-4 rounded-2xl border border-ink/5 bg-white/60 p-4 dark:border-white/10 dark:bg-white/[0.03] sm:flex-row sm:items-end sm:justify-between">
                  <Select
                    label={t('teacher.timetable.class')}
                    value={selectedClass?.id ?? ''}
                    onChange={(event) => setClassId(event.target.value)}
                    className="w-full sm:w-64"
                  >
                    {classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </Select>
                  <div className="flex rounded-xl bg-mist p-1 dark:bg-white/10" aria-label={t('teacher.timetable.viewLabel')}>
                    <button type="button" aria-pressed={view === 'route'} onClick={() => setView('route')} className={`min-h-11 rounded-lg px-3 text-xs font-semibold ${view === 'route' ? 'bg-white text-ink shadow-sm dark:bg-white/15 dark:text-white' : 'text-graphite'}`}>{t('teacher.timetable.myRoute')}</button>
                    <button type="button" aria-pressed={view === 'class'} onClick={() => setView('class')} className={`min-h-11 rounded-lg px-3 text-xs font-semibold ${view === 'class' ? 'bg-white text-ink shadow-sm dark:bg-white/15 dark:text-white' : 'text-graphite'}`}>{t('teacher.timetable.classView')}</button>
                  </div>
                </div>

                {view === 'class' ? (
                  selectedClass ? (
                    <div className="card overflow-x-auto p-3 sm:p-4">
                      <div className="mb-4 flex items-center gap-3 rounded-2xl bg-mist/70 p-4 dark:bg-white/[0.04]">
                        <CalendarRange className="h-5 w-5 shrink-0 text-accent" />
                        <div>
                          <h2 className="font-semibold text-ink dark:text-white">{t('teacher.timetable.weeklyTitle', { name: selectedClass.name })}</h2>
                          <p className="text-xs text-graphite">{t('teacher.timetable.lessonDetails')}</p>
                        </div>
                      </div>
                      <TimetableGrid slots={selectedSlots} />
                    </div>
                  ) : null
                ) : (
                  <div className="grid gap-5 md:grid-cols-2">
                    {visibleDays.map((day) => {
                      const daySlots = teacherSlots
                        .filter((slot) => slot.day === day)
                        .sort((a, b) => a.startTime.localeCompare(b.startTime))
                      return (
                        <section key={day} className="card overflow-hidden">
                          <div className="flex items-center justify-between border-b border-ink/5 px-5 py-4 dark:border-white/10">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wider text-accent">{t(`common.weekday.${day}`)}</p>
                              <h2 className="mt-1 font-semibold text-ink dark:text-white">{daySlots.length
                                ? t(daySlots.length === 1 ? 'teacher.timetable.periodOne' : 'teacher.timetable.periods', { count: daySlots.length })
                                : t('teacher.timetable.noClassesToday')}</h2>
                            </div>
                            <CalendarRange className="h-5 w-5 text-graphite/50" />
                          </div>
                          <div className="space-y-2 p-3">
                            {daySlots.length ? daySlots.map((slot) => (
                              <div key={slot.id} className="flex items-center gap-3 rounded-2xl bg-mist/70 p-3 dark:bg-white/[0.04]">
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                                  <Clock3 className="h-4 w-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="font-semibold text-ink dark:text-white">{classNameById.get(slot.classId) ?? t('teacher.timetable.classFallback')}</p>
                                  <p className="text-xs font-medium text-ink dark:text-white">{slot.subject || t('teacher.timetable.break')}</p>
                                  <p className="text-xs tabular-nums">
                                    <span className="text-emerald-700 dark:text-emerald-300">{slot.startTime}</span>
                                    <span className="px-1 text-graphite">–</span>
                                    <span className="text-red-600 dark:text-red-300">{slot.endTime}</span>
                                  </p>
                                </div>
                                {slot.room && <span className="inline-flex shrink-0 items-center gap-1 text-xs text-graphite"><MapPin className="h-3.5 w-3.5" />{slot.room}</span>}
                              </div>
                            )) : <p className="px-2 py-8 text-center text-sm text-graphite">{t('teacher.timetable.noClassesToday')}</p>}
                          </div>
                        </section>
                      )
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </ResourceGate>
    </div>
  )
}
