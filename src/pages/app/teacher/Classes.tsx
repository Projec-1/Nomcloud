import { useEffect, useState } from 'react'
import { Users, MapPin, BookOpen, CalendarBlank as CalendarRange, Lock } from '@phosphor-icons/react'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import ResourceGate from '@/components/ui/ResourceGate'
import { useTeacherClasses } from '@/hooks/useTeacherClasses'
import PageHeader from '@/components/ui/PageHeader'
import Avatar from '@/components/ui/Avatar'
import Modal from '@/components/ui/Modal'
import Select from '@/components/ui/Select'
import TimetableGrid from '@/components/dashboard/TimetableGrid'
import { fetchRosterStudents, type RosterStudent } from '@/services/studentService'
import type { ClassSummary } from '@/services/teacherService'

// ---------------------------------------------------------------------------
// Phase 8 batch 8. Real rosters, and a READ-ONLY timetable.
//
// THIS CLOSES THE OTHER HALF OF OPEN DECISION 6. timetable_slots gates INSERT,
// UPDATE and DELETE on can_manage_class, which covers management and not
// teaching staff. A teacher holds three SELECT policies on the table and no
// write policy at all, so the prototype's add-a-period and remove-a-period
// controls could never have worked.
//
// They are removed rather than left to fail silently: a refused DELETE reports
// zero rows and no error, so a teacher would have clicked to remove a period,
// seen it vanish from the mock store, and found it back on reload. Timetabling
// is an administrative act, and the screen now says so.
//
// The roster modal read mock students filtered by a `classId` column that does
// not exist on the real table. It now reads the ids the class summary already
// resolved through class_enrollments.
// ---------------------------------------------------------------------------

export default function TeacherClasses() {
  const { school } = useAuth()
  const { t } = useLanguage()
  const { state, classes: myClasses, timetable } = useTeacherClasses()
  const [viewing, setViewing] = useState<ClassSummary | null>(null)
  const [roster, setRoster] = useState<RosterStudent[]>([])
  const [timetableClassId, setTimetableClassId] = useState('')

  const schoolId = school?.id ?? null
  const activeClass = myClasses.find((c) => c.id === timetableClassId) ?? myClasses[0]
  const classSlots = timetable.filter((t) => t.classId === activeClass?.id)

  useEffect(() => {
    let cancelled = false
    if (!schoolId || !viewing) {
      setRoster([])
      return
    }
    fetchRosterStudents(schoolId, viewing.studentIds)
      .then((rows) => {
        if (!cancelled) setRoster(rows)
      })
      .catch(() => {
        // The modal still opens; it simply shows no names.
      })
    return () => {
      cancelled = true
    }
  }, [schoolId, viewing])

  if (myClasses.length === 0) {
    return (
      <div>
        <PageHeader title={t('teacher.classes.title')} description={t('teacher.classes.description')} />
        <ResourceGate
          state={state}
          empty={{
            icon: BookOpen,
            title: t('teacher.classes.noClasses'),
            description: t('teacher.classes.contactAdmin'),
          }}
          deniedHint={t('teacher.classes.access')}
        >
          {() => null}
        </ResourceGate>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title={t('teacher.classes.title')}
        description={t(myClasses.length === 1 ? 'teacher.classes.assignedOne' : 'teacher.classes.assignedMany', { count: myClasses.length })}
      />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {myClasses.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setViewing(c)}
            className="card p-6 text-left transition-transform hover:-translate-y-1"
          >
            <p className="font-semibold text-ink dark:text-white">{c.name}</p>
            <p className="text-xs text-graphite">
              {t('teacher.classes.grade', { grade: c.grade })}
              {c.section ? ` · ${t('teacher.classes.section', { section: c.section })}` : ''}
            </p>
            <div className="mt-4 space-y-2 text-xs text-graphite">
              <p className="flex items-center gap-2">
                <Users className="h-3.5 w-3.5" /> {t('teacher.classes.studentCount', { count: c.studentIds.length })}
              </p>
              <p className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5" /> {c.room ?? t('teacher.classes.noRoom')}
              </p>
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {c.subject.slice(0, 3).map((s) => (
                <span key={s} className="rounded-full bg-ink/5 px-2.5 py-1 text-[11px] text-graphite dark:bg-white/10">
                  {s}
                </span>
              ))}
            </div>
          </button>
        ))}
      </div>

      <Modal
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing?.name}
        description={t('teacher.classes.modalStudents', {
          count: viewing?.studentIds.length ?? 0,
          room: viewing?.room ?? t('teacher.classes.noRoom'),
        })}
        size="lg"
      >
        <div className="space-y-2">
          {roster.length === 0 ? (
            <p className="text-sm text-graphite">{t('teacher.classes.noStudents')}</p>
          ) : (
            roster.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-xl bg-mist px-4 py-3 dark:bg-white/5">
                <div className="flex items-center gap-3">
                  <Avatar name={s.name} color={s.avatarColor} size="sm" />
                  <div>
                    <p className="text-sm font-medium text-ink dark:text-white">{s.name}</p>
                    <p className="text-xs text-graphite">{s.admissionNo}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </Modal>

      <div className="mt-10">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="rounded-xl bg-accent/10 p-2.5 text-accent">
              <CalendarRange className="h-4 w-4" />
            </div>
            <h3 className="font-semibold text-ink dark:text-white">{t('teacher.classes.weeklyTimetable')}</h3>
          </div>
          {myClasses.length > 1 && (
            <Select
              value={timetableClassId || myClasses[0]?.id}
              onChange={(e) => setTimetableClassId(e.target.value)}
              className="w-56"
            >
              {myClasses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </div>
        <div className="card p-5">
          {/* Read-only: a teacher holds no write policy on timetable_slots. */}
          <TimetableGrid slots={classSlots} />
        </div>
        <p className="mt-3 flex items-center gap-2 text-xs text-graphite">
          <Lock className="h-3.5 w-3.5 shrink-0" />
          {t('teacher.classes.timetableAdmin')}
        </p>
      </div>
    </div>
  )
}
