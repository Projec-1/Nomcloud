import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, BookOpen, CalendarCheck, ClipboardText as ClipboardCheck, Clock, Users } from '@phosphor-icons/react'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import { useTeacherClasses } from '@/hooks/useTeacherClasses'
import PageHeader from '@/components/ui/PageHeader'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import ResourceGate from '@/components/ui/ResourceGate'
import WorkspaceInsightCard from '@/components/dashboard/WorkspaceInsightCard'
import { isoDayOfWeek, todayInTimeZone, DEFAULT_TIME_ZONE } from '@/utils/schoolCalendar'
import { formatDate, percentage } from '@/utils/format'
import { fetchAttendance, fetchHomework, type HomeworkView } from '@/services/teachingRecordsService'

export default function TeacherDashboard() {
  const { profile, school } = useAuth()
  const { t } = useLanguage()
  const { state, classes: myClasses, timetable: timetables } = useTeacherClasses()

  const schoolId = school?.id ?? null
  const timeZone = school?.timezone ?? DEFAULT_TIME_ZONE
  const today = todayInTimeZone(timeZone)

  const [homework, setHomework] = useState<HomeworkView[]>([])
  const [todayPresent, setTodayPresent] = useState<{ present: number; marked: number } | null>(null)
  const [summaryStatus, setSummaryStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [summaryReload, setSummaryReload] = useState(0)
  const [now, setNow] = useState(() => new Date())

  const myClassIds = useMemo(() => myClasses.map((c) => c.id), [myClasses])
  const classNameById = useMemo(() => new Map(myClasses.map((c) => [c.id, c.name])), [myClasses])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let cancelled = false
    if (!schoolId || myClasses.length === 0) {
      setHomework([])
      setTodayPresent(null)
      setSummaryStatus('ready')
      return
    }

    setHomework([])
    setTodayPresent(null)
    setSummaryStatus('loading')

    Promise.all([
      fetchHomework(schoolId, myClassIds),
      Promise.all(myClasses.map((classroom) => fetchAttendance(schoolId, classroom.id, today))),
    ])
      .then(([assignments, attendanceByClass]) => {
        if (cancelled) return
        setHomework(assignments)
        let present = 0
        let marked = 0
        for (const attendance of attendanceByClass) {
          for (const entry of attendance.values()) {
            marked += 1
            if (entry.status === 'present' || entry.status === 'late') present += 1
          }
        }
        setTodayPresent({ present, marked })
        setSummaryStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setSummaryStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [schoolId, myClasses, myClassIds, today, summaryReload])

  const pendingByStudent = useMemo(() => {
    const counts = new Map<string, number>()
    for (const assignment of homework) {
      // Missing submission rows are pending, matching the homework board.
      const submitted = new Set(
        assignment.submissions.filter((submission) => submission.status !== 'pending').map((submission) => submission.studentId),
      )
      const classroom = myClasses.find((item) => item.id === assignment.classId)
      for (const studentId of classroom?.studentIds ?? []) {
        if (!submitted.has(studentId)) counts.set(studentId, (counts.get(studentId) ?? 0) + 1)
      }
    }
    return counts
  }, [homework, myClasses])

  const pendingTotal = Array.from(pendingByStudent.values()).reduce((total, count) => total + count, 0)
  const studentTotal = new Set(myClasses.flatMap((classroom) => classroom.studentIds)).size
  const todayIso = isoDayOfWeek(now, timeZone)
  const currentMinutes = minutesInTimeZone(now, timeZone)
  const todaySlots = timetables
    .filter((slot) => slot.day === todayIso)
    .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime))
  const liveSlot = todaySlots.find(
    (slot) => currentMinutes >= toMinutes(slot.startTime) && currentMinutes < toMinutes(slot.endTime),
  )
  const nextSlot = todaySlots
    .filter((slot) => toMinutes(slot.startTime) > currentMinutes)
    .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime))[0]

  if (state.status === 'loading' || state.status === 'denied' || state.status === 'error') {
    return (
      <div className="teacher-dashboard">
        <PageHeader title={t('teacher.dashboard.title')} />
        <ResourceGate state={state} empty={{ title: '' }} deniedHint={t('teacher.dashboard.access')}>
          {() => null}
        </ResourceGate>
      </div>
    )
  }

  const attendanceValue = todayPresent?.marked
    ? `${percentage(todayPresent.present, todayPresent.marked)}%`
    : '—'
  const scheduleSlot = liveSlot ?? nextSlot

  return (
    <div className="admin-dashboard teacher-dashboard">
      <header className="admin-dashboard__welcome">
        <div>
          <p className="admin-dashboard__eyebrow">{t('teacher.dashboard.eyebrow')}</p>
          <h1>{t('teacher.dashboard.welcome', { name: profile?.full_name.split(' ')[0] ?? '' })}</h1>
          <p>
            {myClasses.length
              ? t(myClasses.length === 1 ? 'teacher.dashboard.teachingOne' : 'teacher.dashboard.teachingMany', { count: myClasses.length })
              : t('teacher.dashboard.noClassesTerm')}
          </p>
        </div>
        <Link to="/app/teacher/classes" className="admin-action admin-action--secondary">
          <Users aria-hidden="true" className="h-4 w-4" />
          {t('teacher.dashboard.myClasses')}
        </Link>
      </header>

      {summaryStatus === 'error' && (
        <div className="admin-dashboard__notice" role="alert">
          <span>{t('teacher.dashboard.summaryError')}</span>
          <button type="button" className="admin-dashboard__retry" onClick={() => setSummaryReload((attempt) => attempt + 1)}>
            {t('common.tryAgain')}
          </button>
        </div>
      )}

      <div className="admin-dashboard__feature-grid">
        <section className="admin-dashboard__featured" aria-labelledby="teacher-schedule-title">
          <div className="admin-dashboard__featured-top">
            <span className="admin-dashboard__featured-icon"><Clock aria-hidden="true" className="h-4 w-4" /></span>
            <span className="admin-dashboard__status">
              <span className="admin-dashboard__status-dot" />
              {liveSlot ? t('teacher.dashboard.liveLecture') : t('teacher.dashboard.noLecture')}
            </span>
          </div>
          <div className="admin-dashboard__featured-content">
            <div className="min-w-0">
              <p className="admin-dashboard__eyebrow">{formatDate(`${today}T12:00:00`)}</p>
              <h2 id="teacher-schedule-title">
                {scheduleSlot?.subject ?? t('teacher.dashboard.nothingScheduled')}
              </h2>
              <p>
                {scheduleSlot
                  ? `${classNameById.get(scheduleSlot.classId) ?? ''} · ${scheduleSlot.room || t('teacher.dashboard.noRoom')} · ${liveSlot ? t('teacher.dashboard.until', { time: scheduleSlot.endTime }) : scheduleSlot.startTime}`
                  : t('teacher.dashboard.nothingScheduled')}
              </p>
            </div>
            <div className="admin-dashboard__attendance-number">
              <strong>{todaySlots.length}</strong>
              <span>{t('teacher.dashboard.classesToday')}</span>
            </div>
          </div>
          <div className="admin-dashboard__featured-footer">
            <span className="admin-dashboard__featured-link">
              {scheduleSlot ? classNameById.get(scheduleSlot.classId) : t('teacher.dashboard.noLecture')}
            </span>
            <Link to="/app/teacher/timetable" className="admin-dashboard__featured-link">
              {t('teacher.dashboard.viewTimetable')} <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
          </div>
        </section>

        <section className="admin-dashboard__highlights" aria-labelledby="teacher-today-title">
          <div className="admin-dashboard__section-heading">
            <div>
              <p className="admin-dashboard__eyebrow">{formatDate(`${today}T12:00:00`)}</p>
              <h2 id="teacher-today-title">{t('teacher.dashboard.classesToday')}</h2>
            </div>
            <Link to="/app/teacher/timetable" className="admin-dashboard__icon-link" aria-label={t('teacher.dashboard.viewTimetable')}>
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>
          <div className="admin-dashboard__class-list">
            {todaySlots.length === 0 ? (
              <p className="admin-dashboard__empty">{t('teacher.dashboard.nothingScheduled')}</p>
            ) : todaySlots.slice(0, 3).map((slot) => (
              <div key={slot.id} className="admin-dashboard__class-row">
                <span className="admin-dashboard__class-icon"><Clock aria-hidden="true" className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <p>{slot.subject} · {classNameById.get(slot.classId) ?? ''}</p>
                  <span>{slot.startTime}–{slot.endTime}{slot.room ? ` · ${slot.room}` : ''}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="admin-dashboard__stats grid grid-cols-2 gap-3 lg:grid-cols-4">
        <WorkspaceInsightCard
          label={t('teacher.dashboard.presentToday')}
          value={summaryStatus === 'ready' ? attendanceValue : '—'}
          icon={CalendarCheck}
          caption={summaryStatus === 'loading'
            ? t('app.loading.content')
            : summaryStatus === 'error'
              ? ''
              : todayPresent?.marked
                ? t('teacher.dashboard.attendanceMarked', { present: todayPresent.present, marked: todayPresent.marked })
                : t('teacher.dashboard.notMarked')}
        />
        <WorkspaceInsightCard
          label={t('teacher.dashboard.pendingSubmissions')}
          value={summaryStatus === 'ready' ? pendingTotal : '—'}
          icon={ClipboardCheck}
          caption={summaryStatus === 'ready'
            ? pendingTotal ? t('teacher.dashboard.followUp') : t('teacher.dashboard.submissionsUpToDate')
            : summaryStatus === 'loading' ? t('app.loading.content') : ''}
        />
        <WorkspaceInsightCard
          label={t('teacher.dashboard.myClasses')}
          value={myClasses.length}
          icon={BookOpen}
          caption={myClasses.length === 1
            ? t('teacher.dashboard.teachingOne', { count: myClasses.length })
            : t('teacher.dashboard.teachingMany', { count: myClasses.length })}
        />
        <WorkspaceInsightCard
          label={t('teacher.dashboard.students')}
          value={studentTotal}
          icon={Users}
          caption={t('teacher.dashboard.studentCount', { count: studentTotal })}
        />
      </div>

      {myClasses.length === 0 ? (
        <div className="admin-dashboard__panel mt-4">
          <EmptyState
            icon={Users}
            title={t('teacher.dashboard.noClasses')}
            description={t('teacher.dashboard.assignedDescription')}
          />
        </div>
      ) : (
        <div className="admin-dashboard__sections">
          <section className="admin-dashboard__panel" aria-labelledby="teacher-classes-title">
            <div className="admin-dashboard__section-heading">
              <div>
                <p className="admin-dashboard__eyebrow">{t('teacher.dashboard.eyebrow')}</p>
                <h2 id="teacher-classes-title">{t('teacher.dashboard.myClasses')}</h2>
              </div>
              <Link to="/app/teacher/classes" className="admin-dashboard__icon-link" aria-label={t('teacher.dashboard.viewAll')}>
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </div>
            <div className="admin-dashboard__class-list">
              {myClasses.slice(0, 5).map((classroom) => (
                <div key={classroom.id} className="admin-dashboard__class-row">
                  <span className="admin-dashboard__class-icon"><Users aria-hidden="true" className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1">
                    <p>{classroom.name}</p>
                    <span>{classroom.room ?? t('teacher.dashboard.noRoom')}</span>
                  </div>
                  <Badge tone="neutral">
                    {t('teacher.dashboard.studentRoster', {
                      count: classroom.studentIds.length,
                      capacity: classroom.capacity ? `/${classroom.capacity}` : '',
                    })}
                  </Badge>
                </div>
              ))}
            </div>
          </section>

          <section className="admin-dashboard__panel" aria-labelledby="teacher-homework-title">
            <div className="admin-dashboard__section-heading">
              <div>
                <p className="admin-dashboard__eyebrow">{t('teacher.dashboard.pendingSubmissions')}</p>
                <h2 id="teacher-homework-title">{t('teacher.dashboard.upcomingHomework')}</h2>
              </div>
              <Link to="/app/teacher/homework" className="admin-dashboard__icon-link" aria-label={t('teacher.dashboard.viewAll')}>
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </div>
            <div className="admin-dashboard__class-list">
              {summaryStatus === 'loading' ? (
                <p className="admin-dashboard__empty" role="status">{t('app.loading.content')}</p>
              ) : summaryStatus === 'error' ? (
                <p className="admin-dashboard__empty">{t('teacher.dashboard.summaryError')}</p>
              ) : homework.length === 0 ? (
                <p className="admin-dashboard__empty">{t('teacher.dashboard.noHomework')}</p>
              ) : (
                homework.slice(0, 5).map((assignment) => (
                  <div key={assignment.id} className="admin-dashboard__class-row">
                    <span className="admin-dashboard__class-icon"><ClipboardCheck aria-hidden="true" className="h-4 w-4" /></span>
                    <div className="min-w-0 flex-1">
                      <p>{assignment.title}</p>
                      <span>
                        {t('teacher.dashboard.homeworkDue', {
                          subject: assignment.subjectName,
                          date: formatDate(assignment.dueDate),
                        })}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

function minutesInTimeZone(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const hour = Number(parts.find((part) => part.type === 'hour')?.value)
  const minute = Number(parts.find((part) => part.type === 'minute')?.value)
  return hour * 60 + minute
}

function toMinutes(time: string): number {
  const [hour, minute] = time.split(':').map(Number)
  return hour * 60 + minute
}
