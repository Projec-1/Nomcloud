import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pulse as Activity } from '@phosphor-icons/react'
import { useAuth } from '@/context/AuthContext'
import PageHeader from '@/components/ui/PageHeader'
import AdminSectionInsights from '@/components/dashboard/AdminSectionInsights'
import AccessDenied from '@/components/ui/AccessDenied'
import EmptyState from '@/components/ui/EmptyState'
import Button from '@/components/ui/Button'
import { SkeletonRows } from '@/components/ui/Loader'
import { fetchTeacherAccess } from '@/services/accessService'
import { fetchSchoolTeacherActivityEvents, type TeacherActivityEvent } from '@/services/reportsService'
import { fetchSchoolTeachers, type TeacherRow } from '@/services/teacherService'
import { monthAnchor, recentMonthlyCounts } from '@/utils/adminAnalytics'
import { errorMessage } from '@/utils/errorMessage'

export default function AdminTeacherActivity() {
  const { activeRole, school } = useAuth()
  const schoolId = school?.id ?? null
  const [events, setEvents] = useState<TeacherActivityEvent[]>([])
  const [teachers, setTeachers] = useState<TeacherRow[]>([])
  const [userByTeacher, setUserByTeacher] = useState<Map<string, string>>(new Map())
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => setNonce((current) => current + 1), [])

  useEffect(() => {
    let cancelled = false
    if (!schoolId) {
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setError(null)
    const since = new Date()
    since.setMonth(since.getMonth() - 5)
    since.setDate(1)
    Promise.all([
      fetchSchoolTeacherActivityEvents(schoolId, since.toISOString()),
      fetchSchoolTeachers(schoolId),
      fetchTeacherAccess(schoolId),
    ])
      .then(([activity, staff, access]) => {
        if (cancelled) return
        setEvents(activity)
        setTeachers(staff)
        setUserByTeacher(new Map(Array.from(access, ([teacherId, member]) => [teacherId, member.userId])))
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(errorMessage(cause))
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [schoolId, nonce])

  const teacherIdByUser = useMemo(
    () => new Map(Array.from(userByTeacher, ([teacherId, userId]) => [userId, teacherId])),
    [userByTeacher],
  )
  const teacherNameById = useMemo(
    () => new Map(teachers.map((teacher) => [teacher.id, teacher.full_name])),
    [teachers],
  )
  const attributedEvents = useMemo(
    () => events.flatMap((event) => {
      const teacherId = teacherIdByUser.get(event.actorId)
      return teacherId && teacherNameById.has(teacherId)
        ? [{ ...event, teacherId, teacherName: teacherNameById.get(teacherId) ?? 'Teacher' }]
        : []
    }),
    [events, teacherIdByUser, teacherNameById],
  )

  if (activeRole !== 'admin') {
    return <AccessDenied hint="Teacher activity is available to school management." />
  }

  const monthly = recentMonthlyCounts(
    attributedEvents.map((event) => event.date),
    6,
    monthAnchor(school?.timezone),
  )
  const kindLabels = [
    { kind: 'attendance', label: 'Attendance marked' },
    { kind: 'grades', label: 'Grades entered' },
    { kind: 'homework', label: 'Homework assigned' },
  ] as const
  const activeCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
  const activeTeachers = new Set(
    attributedEvents.filter((event) => new Date(event.date).getTime() >= activeCutoff).map((event) => event.teacherId),
  ).size

  return (
    <div>
      <PageHeader
        title="Teacher Activity"
        description="Recorded teaching actions across attendance, grades and homework."
      />
      {isLoading ? (
        <SkeletonRows />
      ) : error ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/[0.04] p-4" role="alert">
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
          <Button className="mt-3" variant="outline" onClick={reload}>Try again</Button>
        </div>
      ) : attributedEvents.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="No attributed teacher activity yet"
          description="Activity appears here when a teacher account records attendance, enters grades or assigns homework."
        />
      ) : (
        <AdminSectionInsights
          metrics={[
            { label: 'Teachers active · 30 days', value: activeTeachers },
            { label: 'Attendance marked', value: attributedEvents.filter((event) => event.kind === 'attendance').length, detail: 'Last six months' },
            { label: 'Grades entered', value: attributedEvents.filter((event) => event.kind === 'grades').length, detail: 'Last six months' },
            { label: 'Homework assigned', value: attributedEvents.filter((event) => event.kind === 'homework').length, detail: 'Last six months' },
          ]}
          charts={[
            {
              kind: 'line',
              title: 'Teaching activity by month',
              categories: monthly.labels,
              series: kindLabels.map(({ kind, label }) => ({
                label,
                values: monthly.keys.map((key) =>
                  attributedEvents.filter((event) => event.kind === kind && event.date.slice(0, 7) === key).length,
                ),
              })),
            },
          ]}
          insight="Counts use recorded actor IDs linked to teacher accounts. Homework review and completed-lesson events are not recorded."
        />
      )}
    </div>
  )
}
