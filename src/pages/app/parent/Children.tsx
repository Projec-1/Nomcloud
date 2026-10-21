import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, CalendarCheck, BookOpen, Wallet } from '@phosphor-icons/react'
import { useAuth } from '@/context/AuthContext'
import { useSelectedChild } from '@/hooks/useSelectedChild'
import PageHeader from '@/components/ui/PageHeader'
import { useLanguage } from '@/context/LanguageContext'
import ResourceGate from '@/components/ui/ResourceGate'
import Avatar from '@/components/ui/Avatar'
import Badge from '@/components/ui/Badge'
import { formatDate, percentage } from '@/utils/format'
import { DEFAULT_TIME_ZONE } from '@/utils/schoolCalendar'
import { fetchChildAttendance, fetchChildGrades } from '@/services/teachingRecordsService'
import { fetchChildFeeRecords } from '@/services/financeService'
import { useSignedImageUrl } from '@/hooks/useSignedImageUrl'
import { BUCKETS } from '@/services/storageService'
import type { ChildSummary } from '@/services/guardianService'

// Phase 8 batch 8. The last mock reader on the parent side.
//
// Each child's three summary figures are now real: attendance from
// attendance_records, the average from grade_records computed against each
// row's own max_score, and the balance from fee_records. All three are already
// bounded to this guardian's own children by the policies that batches 5 and 6
// connected, so this screen adds no access model of its own.
//
// The prototype counted attendance against a hardcoded `schoolDays` week. Real
// records are counted as they exist.

// A child's photo comes from the private student-photos bucket through a
// signed URL. Storage allows it because is_guardian_of_student holds for this
// guardian and this child, the same check that shows the child's row.
function ChildAvatar({ child }: { child: ChildSummary }) {
  const url = useSignedImageUrl(BUCKETS.studentPhotos, child.photoPath)
  return <Avatar name={child.name} color={child.avatarColor} src={url} />
}

interface ChildSummaryStats {
  attendanceRate: number | null
  averageGrade: number | null
  hasBalance: boolean
}

export default function ParentChildren() {
  const { t } = useLanguage()
  const { school } = useAuth()
  const { children, selectedChild, selectChild, state } = useSelectedChild()
  const navigate = useNavigate()
  const [stats, setStats] = useState<Record<string, ChildSummaryStats>>({})

  const schoolId = school?.id ?? null
  const timeZone = school?.timezone ?? DEFAULT_TIME_ZONE

  useEffect(() => {
    let cancelled = false
    if (!schoolId || children.length === 0) return

    Promise.all(
      children.map(async (child) => {
        const [attendance, grades, fees] = await Promise.all([
          fetchChildAttendance(schoolId, child.id),
          fetchChildGrades(schoolId, child.id),
          fetchChildFeeRecords(schoolId, child.id, timeZone),
        ])
        const present = attendance.filter((a) => a.status === 'present' || a.status === 'late').length
        const graded = grades.filter((g) => g.maxScore > 0)
        return [
          child.id,
          {
            attendanceRate: attendance.length ? percentage(present, attendance.length) : null,
            averageGrade: graded.length
              ? Math.round(graded.reduce((sum, g) => sum + (g.score / g.maxScore) * 100, 0) / graded.length)
              : null,
            hasBalance: fees.some((f) => f.balance > 0),
          } satisfies ChildSummaryStats,
        ] as const
      }),
    )
      .then((entries) => {
        if (!cancelled) setStats(Object.fromEntries(entries))
      })
      .catch(() => {
        // Summary figures only. The child cards still render without them.
      })

    return () => {
      cancelled = true
    }
  }, [schoolId, children, timeZone])

  if (children.length === 0) {
    return (
      <div>
        <PageHeader title={t('parent.children.title')} description={t('parent.children.description')} />
        <ResourceGate
          state={state}
          empty={{
            icon: Users,
            title: 'No children linked yet',
            description: "Contact your school administrator to link your child's record to this account.",
          }}
          deniedHint="Child records are available to a linked parent or guardian."
        >
          {() => null}
        </ResourceGate>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title={t('parent.children.title')}
        description={`${children.length} child${children.length === 1 ? '' : 'ren'} linked to your account`}
      />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {children.map((child) => {
          const s = stats[child.id]
          return (
            <div key={child.id} className="card p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <ChildAvatar child={child} />
                  <div>
                    <p className="font-medium text-ink dark:text-white">{child.name}</p>
                    <p className="text-xs text-graphite">
                      {child.className ?? 'No class yet'} · {child.admissionNo}
                    </p>
                  </div>
                </div>
                {selectedChild?.id === child.id && <Badge tone="brand">{t('parent.children.selected')}</Badge>}
              </div>
              <div className="mt-4 grid grid-cols-3 gap-1.5 text-center sm:gap-2">
                <div className="rounded-xl bg-mist p-2.5 dark:bg-white/5">
                  <CalendarCheck className="mx-auto mb-1 h-3.5 w-3.5 text-emerald-500" />
                  <p className="text-sm font-semibold text-ink dark:text-white">
                    {s?.attendanceRate === null || s?.attendanceRate === undefined ? '—' : `${s.attendanceRate}%`}
                  </p>
                </div>
                <div className="rounded-xl bg-mist p-2.5 dark:bg-white/5">
                  <BookOpen className="mx-auto mb-1 h-3.5 w-3.5 text-accent" />
                  <p className="text-sm font-semibold text-ink dark:text-white">
                    {s?.averageGrade === null || s?.averageGrade === undefined ? '—' : `${s.averageGrade}%`}
                  </p>
                </div>
                <div className="rounded-xl bg-mist p-2.5 dark:bg-white/5">
                  <Wallet className="mx-auto mb-1 h-3.5 w-3.5 text-brand" />
                  <p className="text-sm font-semibold text-ink dark:text-white">
                    {s === undefined ? '—' : s.hasBalance ? 'Due' : 'Paid'}
                  </p>
                </div>
              </div>
              <p className="mt-4 text-xs text-graphite">Enrolled {formatDate(child.enrolledDate)}</p>
              <button
                type="button"
                onClick={() => {
                  selectChild(child.id)
                  navigate('/app/parent')
                }}
                className="btn-outline mt-4 w-full justify-center py-2.5 text-sm"
              >
                View Dashboard
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
