import { useEffect, useMemo, useState } from 'react'
import { Download, TrendUp as TrendingUp, CalendarCheck, Wallet, Users, GraduationCap, CalendarBlank as CalendarRange } from '@phosphor-icons/react'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import PageHeader from '@/components/ui/PageHeader'
import Tabs from '@/components/ui/Tabs'
import Button from '@/components/ui/Button'
import PrintButton from '@/components/ui/PrintButton'
import Avatar from '@/components/ui/Avatar'
import ResourceGate from '@/components/ui/ResourceGate'
import { deriveResourceState } from '@/lib/resourceState'
import { percentage, formatMoney } from '@/utils/format'
import { useRecordableClasses } from '@/hooks/useRecordableClasses'
import { useFinance } from '@/hooks/useFinance'
import { fetchStudentDirectory, type DirectoryStudent } from '@/services/studentService'
import { fetchSchoolTeachers, type TeacherRow } from '@/services/teacherService'
import { fetchSubjects, type SubjectRow } from '@/services/academicService'
import {
  fetchSchoolAttendanceFacts,
  fetchSchoolGradeFacts,
  type AttendanceFact,
  type GradeFact,
} from '@/services/reportsService'
import { toError } from '@/utils/errorMessage'

// ---------------------------------------------------------------------------
// Phase 8 batch 8. Reports on real data.
//
// Every figure is aggregated from real rows. Three prototype assumptions are
// corrected rather than carried over:
//
//   - Grade averages are taken against each row's own max_score, not by
//     averaging raw scores as if every assessment were out of 100.
//   - Enrolment per class comes from class_enrollments via the student
//     directory, not a `classId` column that students do not have.
//   - Money is formatted in the school's currency, not hardcoded USD.
//
// THE FEES TABS ARE GATED ON FINANCE ACCESS. fee_records and fee_payments admit
// owner, director and administrator only. A principal on this screen would read
// zero rows and see a report claiming the school collected nothing, which is
// worse than no report. The two money tabs therefore render only for roles that
// can actually read the money, decided from role and never from the row count.
// ---------------------------------------------------------------------------

type ReportTab = 'attendance' | 'academic' | 'financial' | 'students' | 'teachers' | 'monthly'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export default function AdminReports() {
  const { school } = useAuth()
  const { showToast } = useToast()
  const { state: classState, classes } = useRecordableClasses()
  const { records: fees, canManageFinance } = useFinance()
  const [tab, setTab] = useState<ReportTab>('attendance')

  const schoolId = school?.id ?? null
  const currency = school?.currency ?? 'USD'

  const [attendance, setAttendance] = useState<AttendanceFact[]>([])
  const [grades, setGrades] = useState<GradeFact[]>([])
  const [students, setStudents] = useState<DirectoryStudent[]>([])
  const [teachers, setTeachers] = useState<TeacherRow[]>([])
  const [subjects, setSubjects] = useState<SubjectRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<Error | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    if (!schoolId) return
    setIsLoading(true)
    setLoadError(null)
    Promise.all([
      fetchSchoolAttendanceFacts(schoolId),
      fetchSchoolGradeFacts(schoolId),
      fetchStudentDirectory(schoolId),
      fetchSchoolTeachers(schoolId),
      fetchSubjects(schoolId),
    ])
      .then(([a, g, s, t, subs]) => {
        if (cancelled) return
        setAttendance(a)
        setGrades(g)
        setStudents(s)
        setTeachers(t)
        setSubjects(subs)
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(toError(err))
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [schoolId, nonce])

  const subjectNames = useMemo(() => new Map(subjects.map((s) => [s.id, s.name])), [subjects])

  const attendanceByClass = useMemo(
    () =>
      classes.map((c) => {
        const records = attendance.filter((a) => a.classId === c.id)
        const present = records.filter((a) => a.status === 'present' || a.status === 'late').length
        return { name: c.name, rate: records.length ? percentage(present, records.length) : 0, marked: records.length }
      }),
    [classes, attendance],
  )

  const academicByClass = useMemo(
    () =>
      classes.map((c) => {
        const rows = grades.filter((g) => g.classId === c.id && g.maxScore > 0)
        const avg = rows.length
          ? Math.round(rows.reduce((sum, g) => sum + (g.score / g.maxScore) * 100, 0) / rows.length)
          : 0
        return { name: c.name, avg }
      }),
    [classes, grades],
  )

  const financialByCategory = useMemo(() => {
    const map = new Map<string, { due: number; collected: number }>()
    for (const f of fees) {
      const entry = map.get(f.category) ?? { due: 0, collected: 0 }
      entry.due += f.amount
      entry.collected += f.amountPaid
      map.set(f.category, entry)
    }
    return Array.from(map.entries()).map(([category, v]) => ({ category, ...v }))
  }, [fees])

  const studentsByClass = useMemo(
    () =>
      classes.map((c) => {
        const roster = students.filter((s) => s.classId === c.id)
        return {
          name: c.name,
          total: roster.length,
          // Database values are lower-case (students_gender_check).
          male: roster.filter((s) => s.gender === 'male').length,
          female: roster.filter((s) => s.gender === 'female').length,
        }
      }),
    [classes, students],
  )

  // "Assigned to teach" is the homeroom OR subject link. The class summaries
  // carry the homeroom arm directly; this summary counts homeroom classes, the
  // arm a staff report most often means.
  const teacherSummaries = useMemo(
    () =>
      teachers.map((t) => {
        const homeroom = classes.filter((c) => c.teacherId === t.id)
        return {
          id: t.id,
          name: t.full_name,
          subject: t.primary_subject_id ? (subjectNames.get(t.primary_subject_id) ?? '—') : '—',
          classCount: homeroom.length,
          studentCount: homeroom.reduce((sum, c) => sum + c.studentIds.length, 0),
        }
      }),
    [teachers, classes, subjectNames],
  )

  const monthlyCollection = useMemo(() => {
    const now = new Date()
    const months: { label: string; collected: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const prefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const collected = fees.reduce(
        (sum, f) => sum + f.payments.filter((p) => p.paidOn.startsWith(prefix)).reduce((s, p) => s + p.amount, 0),
        0,
      )
      months.push({ label: MONTHS[d.getMonth()], collected })
    }
    return months
  }, [fees])

  // Four-state contract. `denied` is decided by the classes hook from role;
  // a report load failure is an `error` with a retry, never a silent blank.
  const reportState = deriveResourceState<true>({
    isLoading: classState.status === 'loading' || isLoading,
    canAccess: classState.status === 'denied' ? false : undefined,
    error: classState.status === 'error' ? classState.error : loadError,
    data: true,
    isEmpty: () => false,
    retry: () => setNonce((n) => n + 1),
  })

  const tabs = [
    { id: 'attendance', label: 'Attendance' },
    { id: 'academic', label: 'Academic' },
    ...(canManageFinance ? [{ id: 'financial', label: 'Fees' }] : []),
    { id: 'students', label: 'Students' },
    { id: 'teachers', label: 'Teachers' },
    ...(canManageFinance ? [{ id: 'monthly', label: 'Monthly' }] : []),
  ]

  const handleExport = () => {
    if (tab === 'attendance') {
      downloadCsv('attendance-report.csv', [
        ['Class', 'Attendance Rate (%)', 'Records'],
        ...attendanceByClass.map((r) => [r.name, r.rate, r.marked]),
      ])
    } else if (tab === 'academic') {
      downloadCsv('academic-report.csv', [['Class', 'Average Score (%)'], ...academicByClass.map((r) => [r.name, r.avg])])
    } else if (tab === 'financial' && canManageFinance) {
      downloadCsv('financial-report.csv', [
        ['Category', `Amount Due (${currency})`, `Amount Collected (${currency})`],
        ...financialByCategory.map((r) => [r.category, r.due, r.collected]),
      ])
    } else if (tab === 'students') {
      downloadCsv('students-report.csv', [
        ['Class', 'Total Students', 'Male', 'Female'],
        ...studentsByClass.map((r) => [r.name, r.total, r.male, r.female]),
      ])
    } else if (tab === 'teachers') {
      downloadCsv('teachers-report.csv', [
        ['Teacher', 'Primary Subject', 'Homeroom Classes', 'Students'],
        ...teacherSummaries.map((t) => [t.name, t.subject, t.classCount, t.studentCount]),
      ])
    } else if (tab === 'monthly' && canManageFinance) {
      downloadCsv('monthly-collection-report.csv', [
        ['Month', `Collected (${currency})`],
        ...monthlyCollection.map((m) => [m.label, m.collected]),
      ])
    }
    showToast({ type: 'success', title: 'Report exported', description: 'Your CSV file has started downloading.' })
  }

  if (reportState.status !== 'ready') {
    return (
      <div>
        <PageHeader title="Reports" />
        <ResourceGate state={reportState} empty={{ title: '' }} deniedHint="Reports are available to school management.">
          {() => null}
        </ResourceGate>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Reports"
        description={`Insights across ${students.length} students, ${teachers.length} teachers and ${classes.length} classes`}
        actions={
          <div className="flex flex-wrap gap-2">
            <PrintButton />
            <Button onClick={handleExport} icon={<Download className="h-4 w-4" />}>
              Export CSV
            </Button>
          </div>
        }
      />

      <div className="print-hide">
        <Tabs tabs={tabs} active={tab} onChange={(id) => setTab(id as ReportTab)} />
      </div>

      <div className="card print-document mt-8 p-6">
        <header className="print-only mb-6 border-b border-gray-300 pb-4">
          <p className="text-lg font-semibold">{school?.name ?? 'School'}</p>
          <p className="mt-1 text-sm">Reports · {new Intl.DateTimeFormat().format(new Date())}</p>
        </header>
        {tab === 'attendance' && (
          <>
            <ReportHeading icon={CalendarCheck} tone="bg-emerald-500/10 text-emerald-600" title="Attendance Rate by Class" subtitle="All attendance recorded to date" />
            <div className="space-y-4">
              {attendanceByClass.map((r) => (
                <Bar key={r.name} label={r.name} value={r.marked ? `${r.rate}%` : 'Not marked'} pct={r.rate} barClass="bg-emerald-500" />
              ))}
            </div>
          </>
        )}

        {tab === 'academic' && (
          <>
            <ReportHeading icon={TrendingUp} tone="bg-accent/10 text-accent" title="Average Score by Class" subtitle="Each assessment weighted against its own maximum" />
            <div className="space-y-4">
              {academicByClass.map((r) => (
                <Bar key={r.name} label={r.name} value={`${r.avg}%`} pct={r.avg} barClass="bg-accent" />
              ))}
            </div>
          </>
        )}

        {tab === 'financial' && canManageFinance && (
          <>
            <ReportHeading icon={Wallet} tone="bg-brand/10 text-brand" title="Fee Collection by Category" subtitle="Collected against total billed" />
            <div className="space-y-4">
              {financialByCategory.length === 0 && <p className="text-sm text-graphite">No fees issued yet.</p>}
              {financialByCategory.map((r) => (
                <Bar
                  key={r.category}
                  label={r.category}
                  value={`${formatMoney(r.collected, currency)} / ${formatMoney(r.due, currency)}`}
                  pct={percentage(r.collected, r.due)}
                  barClass="bg-brand"
                />
              ))}
            </div>
          </>
        )}

        {tab === 'students' && (
          <>
            <ReportHeading icon={Users} tone="bg-[#A855F7]/10 text-[#A855F7]" title="Enrolment by Class" subtitle={`${students.length} students`} />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="border-b border-ink/5 text-left text-xs text-graphite dark:border-white/10">
                    <th className="py-3 font-medium">Class</th>
                    <th className="py-3 text-right font-medium">Total</th>
                    <th className="py-3 text-right font-medium">Male</th>
                    <th className="py-3 text-right font-medium">Female</th>
                  </tr>
                </thead>
                <tbody>
                  {studentsByClass.map((r) => (
                    <tr key={r.name} className="border-b border-ink/5 last:border-b-0 dark:border-white/5">
                      <td className="py-3 font-medium text-ink dark:text-white">{r.name}</td>
                      <td className="py-3 text-right text-graphite">{r.total}</td>
                      <td className="py-3 text-right text-graphite">{r.male}</td>
                      <td className="py-3 text-right text-graphite">{r.female}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === 'teachers' && (
          <>
            <ReportHeading icon={GraduationCap} tone="bg-[#FF5A1F]/10 text-[#FF5A1F]" title="Teaching Staff Summary" subtitle={`${teachers.length} teachers on staff`} />
            <div className="space-y-3">
              {teacherSummaries.map((t) => (
                <div key={t.id} className="flex items-center justify-between rounded-xl border border-ink/5 px-4 py-3 dark:border-white/10">
                  <div className="flex items-center gap-3">
                    <Avatar name={t.name} size="sm" />
                    <div>
                      <p className="text-sm font-medium text-ink dark:text-white">{t.name}</p>
                      <p className="text-xs text-graphite">{t.subject}</p>
                    </div>
                  </div>
                  <div className="text-right text-xs text-graphite">
                    <p>{t.classCount} homeroom classes</p>
                    <p>{t.studentCount} students</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'monthly' && canManageFinance && (
          <>
            <ReportHeading icon={CalendarRange} tone="bg-emerald-500/10 text-emerald-600" title="Monthly Fee Collection" subtitle="Payments recorded over the last 6 months" />
            <div className="space-y-4">
              {monthlyCollection.map((m) => {
                const max = Math.max(...monthlyCollection.map((mm) => mm.collected), 1)
                return (
                  <Bar
                    key={m.label}
                    label={m.label}
                    value={formatMoney(m.collected, currency)}
                    pct={Math.round((m.collected / max) * 100)}
                    barClass="bg-emerald-500"
                  />
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ReportHeading({
  icon: Icon,
  tone,
  title,
  subtitle,
}: {
  icon: typeof Users
  tone: string
  title: string
  subtitle: string
}) {
  return (
    <div className="mb-6 flex items-center gap-3">
      <div className={`rounded-xl p-2.5 ${tone}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <h3 className="font-semibold text-ink dark:text-white">{title}</h3>
        <p className="text-xs text-graphite">{subtitle}</p>
      </div>
    </div>
  )
}

function Bar({ label, value, pct, barClass }: { label: string; value: string; pct: number; barClass: string }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="font-medium text-ink dark:text-white">{label}</span>
        <span className="text-graphite">{value}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-ink/5 dark:bg-white/10">
        <div className={`h-full rounded-full ${barClass}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </div>
    </div>
  )
}
