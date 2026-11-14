import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Users, GraduationCap, CalendarCheck, Wallet, ArrowRight, Plus, Megaphone, BookOpen, Clock } from '@phosphor-icons/react'
import { useAuth } from '@/context/AuthContext'
import PageHeader from '@/components/ui/PageHeader'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import ResourceGate from '@/components/ui/ResourceGate'
import { useRecordableClasses } from '@/hooks/useRecordableClasses'
import { useAnnouncements } from '@/hooks/useCommunications'
import { useFinance } from '@/hooks/useFinance'
import { fetchSchoolStudents } from '@/services/studentService'
import { fetchSchoolTeachers } from '@/services/teacherService'
import { fetchAttendance } from '@/services/teachingRecordsService'
import { formatDate, formatMoney, percentage } from '@/utils/format'
import { todayInTimeZone, DEFAULT_TIME_ZONE } from '@/utils/schoolCalendar'

// ---------------------------------------------------------------------------
// Phase 8 batch 8. The management landing page, on real data throughout.
//
// THE THREE QUICK-ACTION FORMS ARE NOW LINKS. The prototype embedded miniature
// add-a-student, add-a-teacher and post-an-announcement forms here, each a
// simplified duplicate of the dedicated page's form. Against the real schema
// those shortcuts were actively misleading: the student one invented an
// admission number with Math.random and enrolled without an academic year, and
// neither could express the relations the real tables need. They are links to
// the pages that do it properly, which is one extra click and no duplicated
// write path.
//
// THE ATTENDANCE SPARKLINE IS GONE for the same reason as on the teacher
// dashboard: it plotted a fixed mock week, and reproducing it honestly means one
// query per day, which is a lot of round trips for decoration. Today's rate is
// real and carries the same message.
// ---------------------------------------------------------------------------

export default function AdminDashboard() {
  const { profile, school } = useAuth()
  const { state, classes } = useRecordableClasses()
  const { announcements } = useAnnouncements()
  const { records: fees, canManageFinance } = useFinance()

  const schoolId = school?.id ?? null
  const timeZone = school?.timezone ?? DEFAULT_TIME_ZONE
  const currency = school?.currency ?? 'USD'
  const today = todayInTimeZone(timeZone)

  const [counts, setCounts] = useState({ students: 0, teachers: 0 })
  const [attendanceToday, setAttendanceToday] = useState<{ present: number; marked: number }>({ present: 0, marked: 0 })
  const [rateByClass, setRateByClass] = useState<Map<string, number | null>>(new Map())

  useEffect(() => {
    let cancelled = false
    if (!schoolId) return
    Promise.all([fetchSchoolStudents(schoolId), fetchSchoolTeachers(schoolId)])
      .then(([students, teachers]) => {
        if (!cancelled) setCounts({ students: students.length, teachers: teachers.length })
      })
      .catch(() => {
        // Counts only.
      })
    return () => {
      cancelled = true
    }
  }, [schoolId])

  useEffect(() => {
    let cancelled = false
    if (!schoolId || classes.length === 0) return
    Promise.all(classes.map((c) => fetchAttendance(schoolId, c.id, today)))
      .then((maps) => {
        if (cancelled) return
        let present = 0
        let marked = 0
        const byClass = new Map<string, number | null>()
        maps.forEach((map, i) => {
          let p = 0
          for (const e of map.values()) {
            if (e.status === 'present' || e.status === 'late') p += 1
          }
          present += p
          marked += map.size
          byClass.set(classes[i].id, map.size ? percentage(p, map.size) : null)
        })
        setAttendanceToday({ present, marked })
        setRateByClass(byClass)
      })
      .catch(() => {
        // Today's rate only.
      })
    return () => {
      cancelled = true
    }
  }, [schoolId, classes, today])

  const collected = useMemo(() => fees.reduce((sum, f) => sum + f.amountPaid, 0), [fees])
  const outstanding = useMemo(() => fees.reduce((sum, f) => sum + f.balance, 0), [fees])

  // The four-state contract. loading, denied and error render through
  // ResourceGate exactly as every other connected screen does; `denied` comes
  // from the caller's role via the classes hook, never from a row count. The
  // `ready` and `empty` cases fall through to the page below, which already
  // handles a school with no classes.
  if (state.status === 'loading' || state.status === 'denied' || state.status === 'error') {
    return (
      <div>
        <PageHeader title="Dashboard" />
        <ResourceGate state={state} empty={{ title: '' }} deniedHint="The school dashboard is available to school staff.">
          {() => null}
        </ResourceGate>
      </div>
    )
  }

  const firstName = profile?.full_name?.trim().split(/\s+/)[0] ?? ''
  const attendanceRate = attendanceToday.marked > 0 ? percentage(attendanceToday.present, attendanceToday.marked) : null

  return (
    <div className="admin-dashboard">
      <header className="admin-dashboard__welcome">
        <div>
          <p className="admin-dashboard__eyebrow">{school?.name ?? 'School workspace'}</p>
          <h1>Good morning, {firstName.toUpperCase()}</h1>
          <p>Here’s what’s happening at your school today.</p>
        </div>
        <div className="admin-dashboard__actions">
          <Link to="/app/admin/students" className="admin-action admin-action--secondary">
            <Plus aria-hidden="true" className="h-4 w-4" /> Add student
          </Link>
          <Link to="/app/admin/announcements" className="admin-action admin-action--primary">
            <Megaphone aria-hidden="true" className="h-4 w-4" /> Announce
          </Link>
        </div>
      </header>

      <div className="admin-dashboard__feature-grid">
        <section className="admin-dashboard__featured">
          <div className="admin-dashboard__featured-top">
            <span className="admin-dashboard__featured-icon"><CalendarCheck aria-hidden="true" className="h-4 w-4" /></span>
            <span className="admin-dashboard__status">
              <span className="admin-dashboard__status-dot" />
              {attendanceToday.marked > 0 ? 'Attendance updated today' : 'Awaiting attendance'}
            </span>
          </div>
          <div className="admin-dashboard__featured-content">
            <div>
              <p className="admin-dashboard__featured-label">Today’s school overview</p>
              <h2>Attendance</h2>
              <p>
                {attendanceToday.marked > 0
                  ? `${attendanceToday.present} of ${attendanceToday.marked} records marked present`
                  : 'No attendance has been recorded yet today.'}
              </p>
            </div>
            <div className="admin-dashboard__attendance-number">
              <strong>{attendanceRate === null ? '—' : `${attendanceRate}%`}</strong>
              <span>present today</span>
            </div>
          </div>
          <div className="admin-dashboard__featured-footer">
            <div className="admin-dashboard__progress" aria-label={attendanceRate === null ? 'Attendance not recorded' : `${attendanceRate}% present`}>
              <span style={{ width: `${attendanceRate ?? 0}%` }} />
            </div>
            <Link to="/app/admin/attendance" className="admin-dashboard__featured-link">
              Open attendance <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
          </div>
        </section>

        <section className="admin-dashboard__highlights card">
          <div className="admin-dashboard__section-heading">
            <div>
              <p className="admin-dashboard__eyebrow">School updates</p>
              <h2>Latest announcements</h2>
            </div>
            <Link to="/app/admin/announcements" aria-label="View all announcements" className="admin-dashboard__icon-link">
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>
          {announcements.length === 0 ? (
            <p className="admin-dashboard__empty">Nothing published yet.</p>
          ) : (
            <div className="admin-dashboard__announcement-list">
              {announcements.slice(0, 3).map((announcement) => (
                <article key={announcement.id} className="admin-dashboard__announcement">
                  <span className={`admin-dashboard__announcement-dot admin-dashboard__announcement-dot--${announcement.priority}`} />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1">{announcement.title}</p>
                    <span>{formatDate(announcement.publishedAt ?? announcement.createdAt)}</span>
                  </div>
                  <Badge tone={announcement.priority === 'urgent' ? 'danger' : announcement.priority === 'important' ? 'warning' : 'neutral'}>
                    {announcement.priority}
                  </Badge>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="admin-dashboard__stats grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminInsightCard label="Students" value={counts.students} icon={Users} caption="Registered learners" />
        <AdminInsightCard label="Teachers" value={counts.teachers} icon={GraduationCap} caption="Teaching staff" />
        <AdminInsightCard
          label="Present Today"
          value={attendanceRate === null ? '—' : `${attendanceRate}%`}
          icon={CalendarCheck}
          caption={attendanceToday.marked > 0 ? `${attendanceToday.present} of ${attendanceToday.marked} marked present` : 'Attendance not marked yet'}
        />
        <AdminInsightCard
          label={canManageFinance ? 'Fees Outstanding' : 'Classes'}
          value={canManageFinance ? formatMoney(outstanding, currency) : classes.length}
          icon={canManageFinance ? Wallet : BookOpen}
          caption={canManageFinance ? 'Current balance' : 'Active classes'}
        />
      </div>

      {canManageFinance && (
        <p className="admin-dashboard__collection">
          <Wallet aria-hidden="true" className="h-4 w-4" />
          {formatMoney(collected, currency)} collected so far this term
        </p>
      )}

      <div className="admin-dashboard__sections">
        <section className="admin-dashboard__panel card">
          <div className="admin-dashboard__section-heading">
            <div>
              <p className="admin-dashboard__eyebrow">School overview</p>
              <h2>Classes</h2>
            </div>
            <Link to="/app/admin/classes" className="admin-dashboard__text-link">
              View all <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
          </div>
          {classes.length === 0 ? (
            <EmptyState icon={BookOpen} title="No classes yet" description="Create a class to begin." />
          ) : (
            <div className="admin-dashboard__class-list">
              {classes.slice(0, 5).map((schoolClass) => (
                <div key={schoolClass.id} className="admin-dashboard__class-row">
                  <span className="admin-dashboard__class-icon"><BookOpen aria-hidden="true" className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1">
                    <p>{schoolClass.name}</p>
                    <span>{schoolClass.studentIds.length} students · {schoolClass.room ?? 'No room set'}</span>
                  </div>
                  <span className="admin-dashboard__student-count">{schoolClass.studentIds.length}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="admin-dashboard__panel card">
          <div className="admin-dashboard__section-heading">
            <div>
              <p className="admin-dashboard__eyebrow">Today</p>
              <h2>Attendance by class</h2>
            </div>
            <Link to="/app/admin/attendance" className="admin-dashboard__text-link">
              Open attendance <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
          </div>
          {classes.length === 0 ? (
            <p className="admin-dashboard__empty">Classes will appear here once they’re set up.</p>
          ) : (
            <div className="admin-dashboard__attendance-list">
              {classes.slice(0, 5).map((schoolClass) => {
                const rate = rateByClass.get(schoolClass.id)
                return (
                  <div key={schoolClass.id} className="admin-dashboard__attendance-row">
                    <span className="admin-dashboard__attendance-marker"><Clock aria-hidden="true" className="h-3.5 w-3.5" /></span>
                    <span className="min-w-0 flex-1">{schoolClass.name}</span>
                    <Badge tone={rate === null || rate === undefined ? 'neutral' : rate >= 90 ? 'success' : rate >= 75 ? 'warning' : 'danger'}>
                      {rate === null || rate === undefined ? 'Not marked' : `${rate}% present`}
                    </Badge>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function AdminInsightCard({
  label,
  value,
  icon: Icon,
  caption,
}: {
  label: string
  value: string | number
  icon: typeof Users
  caption: string
}) {
  return (
    <div className="admin-insight-card">
      <div className="admin-insight-card__heading">
        <span className="admin-insight-card__icon"><Icon aria-hidden="true" className="h-4 w-4" /></span>
        <p className="admin-insight-card__label">{label}</p>
      </div>
      <p className="admin-insight-card__value">{value}</p>
      <p className="admin-insight-card__caption">{caption}</p>
    </div>
  )
}
