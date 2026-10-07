import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, X, Clock, Warning as FileWarning, FloppyDisk as Save } from '@phosphor-icons/react'
import { useToast } from '@/context/ToastContext'
import Select from '@/components/ui/Select'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import Avatar from '@/components/ui/Avatar'
import EmptyState from '@/components/ui/EmptyState'
import { SkeletonRows } from '@/components/ui/Loader'
import AdminSectionInsights from '@/components/dashboard/AdminSectionInsights'
import type { AttendanceStatus } from '@/types'
import type { ClassSummary } from '@/services/teacherService'
import { fetchRosterStudents, type RosterStudent } from '@/services/studentService'
import { fetchAttendance, fetchAttendanceRange, saveAttendance, type AttendanceEntry, type AttendanceTrendEntry } from '@/services/teachingRecordsService'
import { todayInTimeZone } from '@/utils/schoolCalendar'
import { cn } from '@/utils/cn'
import { errorMessage } from '@/utils/errorMessage'

// ---------------------------------------------------------------------------
// Phase 8 batch 5. Reads and writes real attendance_records.
//
// Attendance is the one record in this batch that is CLASS-level rather than
// subject-exact: attendance_records_teacher_insert checks teaches_class, not
// teaches_class_subject. So a homeroom teacher who teaches none of the class's
// subjects can still mark this register, which is the decision RLS batch 4
// recorded and the reason there is no subject selector on this screen.
//
// WHAT CHANGED BEYOND THE DATA SOURCE. The prototype filtered a mock array by
// `s.classId === classId`. Students have no class_id in the real schema —
// enrolment lives in class_enrollments — so the roster now comes from the ids
// the class summary already resolved through that table.
//
// The date no longer defaults to the last element of a hardcoded mock week. It
// defaults to today in the SCHOOL'S timezone, which batch 0 established as the
// correct basis after proving a UTC-based "today" reports the wrong date for
// Mogadishu after 21:00 local.
//
// NO DELETE CONTROL, DELIBERATELY. attendance_records has no teacher DELETE
// policy. Offering an "unmark" button would produce a silent no-op, because a
// refused DELETE reports zero rows and no error.
// ---------------------------------------------------------------------------

const statusConfig: Record<AttendanceStatus, { label: string; icon: typeof Check; tone: string }> = {
  present: { label: 'Present', icon: Check, tone: 'bg-emerald-500 text-white' },
  absent: { label: 'Absent', icon: X, tone: 'bg-red-500 text-white' },
  late: { label: 'Late', icon: Clock, tone: 'bg-amber-500 text-white' },
  excused: { label: 'Excused', icon: FileWarning, tone: 'bg-accent text-white' },
}

interface AttendanceMarkerProps {
  classes: ClassSummary[]
  schoolId: string
  /** The school's IANA timezone, for deciding what "today" means. */
  timeZone: string
}

export default function AttendanceMarker({ classes, schoolId, timeZone }: AttendanceMarkerProps) {
  const { showToast } = useToast()

  const [classId, setClassId] = useState(classes[0]?.id ?? '')
  const [date, setDate] = useState(() => todayInTimeZone(timeZone))
  const [students, setStudents] = useState<RosterStudent[]>([])
  const [existing, setExisting] = useState<Map<string, AttendanceEntry>>(new Map())
  const [trendEntries, setTrendEntries] = useState<AttendanceTrendEntry[]>([])
  const [draft, setDraft] = useState<Record<string, { status: AttendanceStatus; note: string | null }>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const selectedClass = classes.find((c) => c.id === classId)

  // Roster and existing marks load together, so the editor never renders a row
  // whose saved status has not arrived yet and briefly claims "present".
  useEffect(() => {
    let cancelled = false
    if (!selectedClass) {
      setStudents([])
      setDraft({})
      setTrendEntries([])
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setLoadError(false)
    setExisting(new Map())
    const from = new Date(`${date}T00:00:00Z`)
    from.setUTCDate(from.getUTCDate() - 13)
    const fromDate = from.toISOString().slice(0, 10)
    Promise.all([
      fetchRosterStudents(schoolId, selectedClass.studentIds),
      fetchAttendance(schoolId, selectedClass.id, date),
      fetchAttendanceRange(schoolId, selectedClass.id, fromDate, date),
    ])
      .then(([roster, existing, trend]) => {
        if (cancelled) return
        setStudents(roster)
        setExisting(existing)
        setTrendEntries(trend)
        const next: Record<string, { status: AttendanceStatus; note: string | null }> = {}
        for (const s of roster) {
          const record = existing.get(s.id)
          // An unmarked student defaults to present in the editor only. Nothing
          // is persisted until Save, so this default never becomes a record on
          // its own.
          next[s.id] = { status: record?.status ?? 'present', note: record?.note ?? null }
        }
        setDraft(next)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setLoadError(true)
        showToast({
          type: 'error',
          title: 'Could not load attendance',
          description: errorMessage(err),
        })
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [schoolId, selectedClass, date, showToast])

  const setStatus = (studentId: string, status: AttendanceStatus) => {
    setDraft((prev) => ({ ...prev, [studentId]: { ...prev[studentId], status } }))
  }

  const markAll = (status: AttendanceStatus) => {
    setDraft((prev) => {
      const next: typeof prev = {}
      for (const s of students) next[s.id] = { ...prev[s.id], status, note: prev[s.id]?.note ?? null }
      return next
    })
  }

  const handleSave = useCallback(async () => {
    if (!selectedClass || students.length === 0) return
    setIsSaving(true)

    const entries: AttendanceEntry[] = students.map((s) => ({
      studentId: s.id,
      status: draft[s.id]?.status ?? 'present',
      note: draft[s.id]?.note ?? null,
    }))

    try {
      const { refusedStudentIds } = await saveAttendance(schoolId, selectedClass.id, date, entries)
      if (refusedStudentIds.length === 0) {
        showToast({
          type: 'success',
          title: 'Attendance saved',
          description: `${selectedClass.name} attendance for ${date} has been recorded.`,
        })
      } else {
        // M8: the rest of the register saved; name the pupils who did not.
        const names = refusedStudentIds.map((id) => students.find((s) => s.id === id)?.name ?? 'A pupil')
        showToast({
          type: 'warning',
          title: `Attendance saved for ${entries.length - refusedStudentIds.length} of ${entries.length}`,
          description: `Not saved for ${names.join(', ')} — usually because they were already marked today in another class after moving. The school office can correct it.`,
        })
      }
      const saved = new Map(entries
        .filter((entry) => !refusedStudentIds.includes(entry.studentId))
        .map((entry) => [entry.studentId, entry]))
      setExisting(saved)
      setTrendEntries((rows) => [
        ...rows.filter((row) => row.date !== date),
        ...Array.from(saved.values(), (entry) => ({ date, status: entry.status })),
      ].sort((a, b) => a.date.localeCompare(b.date)))
    } catch (err: unknown) {
      // A refused INSERT raises 42501 and lands here. The message is shown
      // rather than swallowed, because a teacher who is not assigned to this
      // class needs to know the save did not happen.
      showToast({
        type: 'error',
        title: 'Attendance not saved',
        description: errorMessage(err),
      })
    } finally {
      setIsSaving(false)
    }
  }, [selectedClass, students, draft, schoolId, date, showToast])

  const counts = (Object.keys(statusConfig) as AttendanceStatus[]).reduce(
    (result, status) => ({ ...result, [status]: students.filter((s) => draft[s.id]?.status === status).length }),
    { present: 0, absent: 0, late: 0, excused: 0 } as Record<AttendanceStatus, number>,
  )
  const attendanceDays = useMemo(() => {
    const end = new Date(`${date}T00:00:00Z`)
    return Array.from({ length: 14 }, (_, index) => {
      const day = new Date(end)
      day.setUTCDate(end.getUTCDate() - (13 - index))
      return day.toISOString().slice(0, 10)
    })
  }, [date])
  const attendanceRates = attendanceDays.map((day) => {
    const rows = trendEntries.filter((entry) => entry.date === day)
    const total = rows.length
    const ratio = (status: AttendanceStatus) => total ? (rows.filter((entry) => entry.status === status).length / total) * 100 : 0
    return { day, total, present: ratio('present'), absent: ratio('absent'), late: ratio('late'), excused: ratio('excused') }
  })
  const previousWeek = attendanceRates.slice(0, 7).filter((item) => item.total > 0)
  const currentWeek = attendanceRates.slice(7).filter((item) => item.total > 0)
  const previousAverage = previousWeek.length ? previousWeek.reduce((sum, day) => sum + day.present, 0) / previousWeek.length : null
  const currentAverage = currentWeek.length ? currentWeek.reduce((sum, day) => sum + day.present, 0) / currentWeek.length : null
  const weeklyChange = previousAverage !== null && currentAverage !== null ? currentAverage - previousAverage : null
  const savedRosterEntries = students.flatMap((student) => {
    const entry = existing.get(student.id)
    return entry ? [entry] : []
  })
  const savedTotal = savedRosterEntries.length
  const savedPresent = savedRosterEntries.filter((entry) => entry.status === 'present').length
  const savedRate = savedTotal ? (savedPresent / savedTotal) * 100 : 0

  return (
    <div>
      {!isLoading && !loadError && <AdminSectionInsights
        metrics={[
          { label: 'Students in class', value: students.length },
          {
            label: 'Attendance marked',
            value: students.filter((student) => existing.has(student.id)).length,
            detail: `${students.length
              ? Math.round((students.filter((student) => existing.has(student.id)).length / students.length) * 100)
              : 0}% of roster`,
            progress: students.length
              ? (students.filter((student) => existing.has(student.id)).length / students.length) * 100
              : 0,
          },
          {
            label: 'Attendance rate',
            value: savedTotal ? `${Math.round(savedRate)}%` : 'No marks',
            change: weeklyChange === null ? undefined : {
              value: `${Math.abs(weeklyChange).toFixed(1)} pts vs prior week`,
              direction: weeklyChange > 0 ? 'up' : weeklyChange < 0 ? 'down' : 'flat',
              positive: weeklyChange >= 0,
            },
          },
        ]}
        charts={[
          {
            kind: 'line',
            title: 'Daily attendance · last week',
            categories: attendanceRates.slice(7).map((item) =>
              new Date(`${item.day}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short' }),
            ),
            series: [
              { label: 'Present', values: attendanceRates.slice(7).map((item) => item.present), tone: 'positive' },
              { label: 'Absent', values: attendanceRates.slice(7).map((item) => item.absent), tone: 'negative' },
              { label: 'Late', values: attendanceRates.slice(7).map((item) => item.late), tone: 'warning' },
              { label: 'Excused', values: attendanceRates.slice(7).map((item) => item.excused), tone: 'brand' },
            ],
            formatValue: (value) => `${value.toFixed(0)}%`,
          },
          {
            kind: 'donut',
            title: 'Saved marks for selected date',
            segments: [
              { label: 'Present', value: savedRosterEntries.filter((entry) => entry.status === 'present').length, tone: 'positive' },
              { label: 'Absent', value: savedRosterEntries.filter((entry) => entry.status === 'absent').length, tone: 'negative' },
              { label: 'Late', value: savedRosterEntries.filter((entry) => entry.status === 'late').length, tone: 'warning' },
              { label: 'Excused', value: savedRosterEntries.filter((entry) => entry.status === 'excused').length, tone: 'brand' },
            ],
          },
        ]}
        insight="Counts reflect saved attendance for the selected class and date, not unsaved register edits."
      />}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Select label="Class" value={classId} onChange={(e) => setClassId(e.target.value)} className="sm:w-56">
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="sm:w-48" />
        </div>
        <Button onClick={handleSave} disabled={isSaving || isLoading || students.length === 0} icon={<Save className="h-4 w-4" />}>
          {isSaving ? 'Saving…' : 'Save Attendance'}
        </Button>
      </div>

      {isLoading ? (
        <SkeletonRows />
      ) : students.length === 0 ? (
        <EmptyState title="No students in this class" description="Add students to this class to begin marking attendance." />
      ) : (
        <div className="card overflow-hidden">
          <div className="flex flex-col gap-4 border-b border-ink/5 px-4 py-4 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div>
              <p className="text-sm text-graphite">
                <span className="font-semibold text-ink dark:text-white">{counts.present}</span> / {students.length} students present
              </p>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-graphite">
                <span className="text-emerald-600">Present {counts.present}</span>
                <span className="text-red-500">Absent {counts.absent}</span>
                <span className="text-amber-600">Late {counts.late}</span>
                <span className="text-accent">Excused {counts.excused}</span>
              </div>
            </div>
            <div className="flex w-full flex-wrap gap-2 sm:w-auto">
              <button
                onClick={() => markAll('present')}
                className="rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600"
              >
                Mark all present
              </button>
              {(Object.keys(statusConfig) as AttendanceStatus[]).map((status) => (
                status === 'present' ? null :
                <button
                  key={status}
                  onClick={() => markAll(status)}
                  className="rounded-full border border-ink/10 px-3 py-1.5 text-xs font-medium text-graphite hover:border-ink/30 hover:text-ink dark:border-white/10 dark:hover:text-white"
                >
                  Mark all {statusConfig[status].label}
                </button>
              ))}
            </div>
          </div>
          <div className="divide-y divide-ink/5 dark:divide-white/5">
            {students.map((s) => {
              const current = draft[s.id]?.status ?? 'present'
              return (
                <div key={s.id} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                  <div className="flex items-center gap-3">
                    <Avatar name={s.name} color={s.avatarColor} size="sm" />
                    <div>
                      <p className="text-sm font-medium text-ink dark:text-white">{s.name}</p>
                      <p className="text-xs text-graphite">{s.admissionNo}</p>
                    </div>
                  </div>
                  <div className="flex w-full flex-wrap gap-1.5 sm:w-auto">
                    {(Object.keys(statusConfig) as AttendanceStatus[]).map((status) => {
                      const config = statusConfig[status]
                      const active = current === status
                      return (
                        <div key={status} className="flex items-center gap-1">
                          <button
                            onClick={() => setStatus(s.id, status)}
                            className={cn(
                              'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all',
                              active ? config.tone : 'bg-ink/5 text-graphite hover:bg-ink/10 dark:bg-white/10',
                            )}
                          >
                            <config.icon className="h-3 w-3" />
                            {config.label}
                          </button>
                          {status === 'excused' && active && (
                            <input
                              value={draft[s.id]?.note ?? ''}
                              onChange={(event) =>
                                setDraft((current) => ({ ...current, [s.id]: { ...current[s.id], status, note: event.target.value } }))
                              }
                              placeholder="Optional note"
                              className="h-8 w-32 rounded-full border border-ink/10 bg-white px-3 text-xs outline-none focus:border-accent dark:border-white/10 dark:bg-white/5"
                              aria-label={`Excused note for ${s.name}`}
                            />
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
