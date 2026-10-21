import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarCheck, BookOpen, Wallet, ClipboardText as ClipboardCheck, ArrowRight, Users } from '@phosphor-icons/react'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import { useSelectedChild } from '@/hooks/useSelectedChild'
import { useAnnouncements } from '@/hooks/useCommunications'
import PageHeader from '@/components/ui/PageHeader'
import StatCard from '@/components/ui/StatCard'
import ChildSwitcher from '@/components/dashboard/ChildSwitcher'
import ResourceGate from '@/components/ui/ResourceGate'
import Badge from '@/components/ui/Badge'
import { formatDate, formatMoney, percentage } from '@/utils/format'
import { DEFAULT_TIME_ZONE } from '@/utils/schoolCalendar'
import {
  fetchChildAttendance,
  fetchChildGrades,
  fetchChildHomework,
  type ChildHomeworkItem,
} from '@/services/teachingRecordsService'
import { fetchChildFeeRecords } from '@/services/financeService'

// Phase 8 batch 8. The parent landing page, on real data throughout.
//
// Every figure here is read through the services batches 5, 6 and 7 built, so
// this screen introduces no new access model. The announcement list in
// particular applies NO audience filter of its own: the prototype included the
// 'students' audience, which migration 14 is explicit is management-only. The
// guardian policies decide readership now.

export default function ParentDashboard() {
  const { profile, school } = useAuth()
  const { t } = useLanguage()
  const { children, selectedChild, selectChild, state } = useSelectedChild()
  const { announcements } = useAnnouncements()

  const schoolId = school?.id ?? null
  const timeZone = school?.timezone ?? DEFAULT_TIME_ZONE
  const currency = school?.currency ?? 'USD'

  const [summary, setSummary] = useState<{
    attendanceRate: number | null
    averageGrade: number | null
    balance: number
    pending: ChildHomeworkItem[]
  }>({ attendanceRate: null, averageGrade: null, balance: 0, pending: [] })

  useEffect(() => {
    let cancelled = false
    if (!schoolId || !selectedChild) return

    Promise.all([
      fetchChildAttendance(schoolId, selectedChild.id),
      fetchChildGrades(schoolId, selectedChild.id),
      fetchChildFeeRecords(schoolId, selectedChild.id, timeZone),
      selectedChild.classId
        ? fetchChildHomework(schoolId, selectedChild.classId, selectedChild.id)
        : Promise.resolve([] as ChildHomeworkItem[]),
    ])
      .then(([attendance, grades, fees, homework]) => {
        if (cancelled) return
        const present = attendance.filter((a) => a.status === 'present' || a.status === 'late').length
        const graded = grades.filter((g) => g.maxScore > 0)
        setSummary({
          attendanceRate: attendance.length ? percentage(present, attendance.length) : null,
          averageGrade: graded.length
            ? Math.round(graded.reduce((sum, g) => sum + (g.score / g.maxScore) * 100, 0) / graded.length)
            : null,
          balance: fees.reduce((sum, f) => sum + f.balance, 0),
          pending: homework.filter((h) => h.status === 'pending'),
        })
      })
      .catch(() => {
        // Summary only. The page still renders its shell.
      })

    return () => {
      cancelled = true
    }
  }, [schoolId, selectedChild, timeZone])

  if (!selectedChild) {
    return (
      <div>
        <PageHeader
          title={t('parent.dashboard.welcome', { name: profile?.full_name.split(' ')[0] ?? '' })}
          description={t('parent.dashboard.emptyDescription')}
        />
        <ResourceGate
          state={state}
          empty={{
            icon: Users,
            title: t('parent.dashboard.noChildren'),
            description: t('parent.dashboard.contactSchool'),
          }}
          deniedHint={t('parent.dashboard.access')}
        >
          {() => null}
        </ResourceGate>
      </div>
    )
  }

  const recent = announcements.slice(0, 4)

  return (
    <div>
      <PageHeader
        title={t('parent.dashboard.welcome', { name: profile?.full_name.split(' ')[0] ?? '' })}
        description={t('parent.dashboard.childSummary', {
          name: selectedChild.name.split(' ')[0],
          school: selectedChild.className ?? t('common.school'),
        })}
        actions={
          <ChildSwitcher
            children={children}
            selectedId={selectedChild.id}
            onSelect={selectChild}
            classLabel={(c) => c.className ?? ''}
          />
        }
      />

      <div className="parent-dashboard__stats grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t('parent.dashboard.attendance')}
          value={summary.attendanceRate === null ? '—' : `${summary.attendanceRate}%`}
          icon={CalendarCheck}
          tint="#34A853"
        />
        <StatCard
          label={t('parent.dashboard.averageGrade')}
          value={summary.averageGrade === null ? '—' : `${summary.averageGrade}%`}
          icon={BookOpen}
          tint="#0071E3"
        />
        <StatCard
          label={t('parent.dashboard.feeBalance')}
          value={formatMoney(summary.balance, currency)}
          icon={Wallet}
          tint={summary.balance > 0 ? '#F59E0B' : '#34A853'}
        />
        <StatCard label={t('parent.dashboard.pendingHomework')} value={summary.pending.length} icon={ClipboardCheck} tint="#FF5A1F" />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="card p-6 lg:col-span-2">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="font-semibold text-ink dark:text-white">{t('parent.dashboard.recentAnnouncements')}</h3>
            <Link
              to="/app/parent/announcements"
              className="link-underline flex items-center gap-1 text-xs font-medium text-accent"
            >
              {t('parent.dashboard.viewAll')} <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="space-y-4">
            {recent.length === 0 ? (
              <p className="text-sm text-graphite">{t('parent.dashboard.noAnnouncements')}</p>
            ) : (
              recent.map((a) => (
                <div key={a.id} className="border-b border-ink/5 pb-4 last:border-b-0 last:pb-0 dark:border-white/10">
                  <div className="mb-1.5 flex items-center justify-between">
                    <Badge tone={a.priority === 'urgent' ? 'danger' : a.priority === 'important' ? 'warning' : 'neutral'}>
                      {['urgent', 'important', 'normal'].includes(a.priority)
                        ? t(`common.priority.${a.priority}`)
                        : a.priority}
                    </Badge>
                    <span className="text-[11px] text-graphite">{formatDate(a.publishedAt ?? a.createdAt)}</span>
                  </div>
                  <p className="text-sm font-medium text-ink dark:text-white">{a.title}</p>
                  <p className="mt-1 text-xs text-graphite">{a.body}</p>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="card p-6">
          <h3 className="mb-5 font-semibold text-ink dark:text-white">{t('parent.dashboard.upcomingHomework')}</h3>
          <div className="space-y-4">
            {summary.pending.slice(0, 4).map((h) => (
              <div key={h.id} className="border-b border-ink/5 pb-4 last:border-b-0 last:pb-0 dark:border-white/10">
                <p className="text-sm font-medium text-ink dark:text-white">{h.title}</p>
                <p className="text-xs text-graphite">{t('parent.dashboard.due', { date: formatDate(h.dueDate) })}</p>
              </div>
            ))}
            {summary.pending.length === 0 && (
              <p className="text-sm text-graphite">{t('parent.dashboard.caughtUp')}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
