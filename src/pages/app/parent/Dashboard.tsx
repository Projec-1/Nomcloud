import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BookOpen,
  CalendarCheck,
  ClipboardText as ClipboardCheck,
  Clock,
  Wallet,
  Users,
} from '@phosphor-icons/react'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import { useSelectedChild } from '@/hooks/useSelectedChild'
import { useAnnouncements } from '@/hooks/useCommunications'
import PageHeader from '@/components/ui/PageHeader'
import ChildSwitcher from '@/components/dashboard/ChildSwitcher'
import WorkspaceInsightCard from '@/components/dashboard/WorkspaceInsightCard'
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

export default function ParentDashboard() {
  const { profile, school } = useAuth()
  const { t } = useLanguage()
  const { children, selectedChild, selectChild, state } = useSelectedChild()
  const { announcements, state: announcementsState } = useAnnouncements()

  const schoolId = school?.id ?? null
  const timeZone = school?.timezone ?? DEFAULT_TIME_ZONE
  const currency = school?.currency ?? 'USD'

  const [summary, setSummary] = useState<{
    attendanceRate: number | null
    averageGrade: number | null
    balance: number
    pending: ChildHomeworkItem[]
  }>({ attendanceRate: null, averageGrade: null, balance: 0, pending: [] })
  const [summaryStatus, setSummaryStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [summaryReload, setSummaryReload] = useState(0)

  useEffect(() => {
    let cancelled = false
    if (!schoolId || !selectedChild) {
      setSummaryStatus('ready')
      setSummary({ attendanceRate: null, averageGrade: null, balance: 0, pending: [] })
      return
    }

    setSummaryStatus('loading')
    setSummary({ attendanceRate: null, averageGrade: null, balance: 0, pending: [] })

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
        setSummaryStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setSummaryStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [schoolId, selectedChild, timeZone, summaryReload])

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

  const recentAnnouncements = announcements.slice(0, 4)
  const attendanceValue = summary.attendanceRate === null ? '—' : `${summary.attendanceRate}%`
  const valueIsReady = summaryStatus === 'ready'

  return (
    <div className="admin-dashboard parent-dashboard">
      <header className="admin-dashboard__welcome">
        <div>
          <p className="admin-dashboard__eyebrow">{selectedChild.className ?? t('common.school')}</p>
          <h1>{t('parent.dashboard.welcome', { name: profile?.full_name.split(' ')[0] ?? '' })}</h1>
          <p>{t('parent.dashboard.attendanceFor', { name: selectedChild.name.split(' ')[0] })}</p>
        </div>
        <ChildSwitcher
          children={children}
          selectedId={selectedChild.id}
          onSelect={selectChild}
          classLabel={(child) => child.className ?? ''}
        />
      </header>

      {summaryStatus === 'error' && (
        <div className="admin-dashboard__notice" role="alert">
          <span>{t('parent.dashboard.summaryError')}</span>
          <button type="button" className="admin-dashboard__retry" onClick={() => setSummaryReload((attempt) => attempt + 1)}>
            {t('common.tryAgain')}
          </button>
        </div>
      )}

      <div className="admin-dashboard__feature-grid">
        <section className="admin-dashboard__featured" aria-labelledby="parent-attendance-title">
          <div className="admin-dashboard__featured-top">
            <span className="admin-dashboard__featured-icon"><CalendarCheck aria-hidden="true" className="h-4 w-4" /></span>
            <span className="admin-dashboard__status">
              <span className="admin-dashboard__status-dot" />
              {t('parent.dashboard.attendance')}
            </span>
          </div>
          <div className="admin-dashboard__featured-content">
            <div>
              <p className="admin-dashboard__eyebrow">{selectedChild.name}</p>
              <h2 id="parent-attendance-title">{t('parent.dashboard.attendance')}</h2>
              <p>{t('parent.dashboard.childSummary', {
                name: selectedChild.name.split(' ')[0],
                school: selectedChild.className ?? t('common.school'),
              })}</p>
            </div>
            <div className="admin-dashboard__attendance-number" aria-live="polite">
              <strong>{summaryStatus === 'ready' ? attendanceValue : '—'}</strong>
              <span>{t('parent.dashboard.attendance')}</span>
            </div>
          </div>
          <div className="admin-dashboard__featured-footer">
            <div
              className="admin-dashboard__progress"
              role="progressbar"
              aria-label={t('parent.dashboard.attendance')}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={summaryStatus === 'ready' ? summary.attendanceRate ?? 0 : 0}
            >
              <span style={{ width: summaryStatus === 'ready' ? `${summary.attendanceRate ?? 0}%` : '0%' }} />
            </div>
            <Link to="/app/parent/attendance" className="admin-dashboard__featured-link">
              {t('parent.dashboard.viewAll')} <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
          </div>
        </section>

        <section className="admin-dashboard__highlights" aria-labelledby="parent-homework-title">
          <div className="admin-dashboard__section-heading">
            <div>
              <p className="admin-dashboard__eyebrow">{t('parent.dashboard.pendingHomework')}</p>
              <h2 id="parent-homework-title">{t('parent.dashboard.upcomingHomework')}</h2>
            </div>
            <Link to="/app/parent/homework" className="admin-dashboard__icon-link" aria-label={t('parent.dashboard.viewAll')}>
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>
          <div className="admin-dashboard__class-list">
            {summaryStatus === 'loading' ? (
              <p className="admin-dashboard__empty" role="status">{t('app.loading.content')}</p>
            ) : summaryStatus === 'error' ? (
              <p className="admin-dashboard__empty">{t('parent.dashboard.summaryError')}</p>
            ) : summary.pending.length === 0 ? (
              <p className="admin-dashboard__empty">{t('parent.dashboard.caughtUp')}</p>
            ) : (
              summary.pending.slice(0, 3).map((homework) => (
                <div key={homework.id} className="admin-dashboard__class-row">
                  <span className="admin-dashboard__class-icon"><ClipboardCheck aria-hidden="true" className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1">
                    <p>{homework.title}</p>
                    <span>{t('parent.dashboard.due', { date: formatDate(homework.dueDate) })}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <div className="admin-dashboard__stats grid grid-cols-2 gap-3 lg:grid-cols-4">
        <WorkspaceInsightCard
          label={t('parent.dashboard.attendance')}
          value={valueIsReady ? attendanceValue : '—'}
          icon={CalendarCheck}
          caption={summaryStatus === 'loading' ? t('app.loading.content') : ''}
        />
        <WorkspaceInsightCard
          label={t('parent.dashboard.averageGrade')}
          value={valueIsReady && summary.averageGrade !== null ? `${summary.averageGrade}%` : '—'}
          icon={BookOpen}
          caption=""
        />
        <WorkspaceInsightCard
          label={t('parent.dashboard.feeBalance')}
          value={valueIsReady ? formatMoney(summary.balance, currency) : '—'}
          icon={Wallet}
          caption=""
        />
        <WorkspaceInsightCard
          label={t('parent.dashboard.pendingHomework')}
          value={valueIsReady ? summary.pending.length : '—'}
          icon={ClipboardCheck}
          caption=""
        />
      </div>

      <div className="admin-dashboard__sections">
        <section className="admin-dashboard__panel" aria-labelledby="parent-announcements-title">
          <div className="admin-dashboard__section-heading">
            <div>
              <p className="admin-dashboard__eyebrow">{t('parent.dashboard.recentAnnouncements')}</p>
              <h2 id="parent-announcements-title">{t('parent.dashboard.recentAnnouncements')}</h2>
            </div>
            <Link to="/app/parent/announcements" className="admin-dashboard__icon-link" aria-label={t('parent.dashboard.viewAll')}>
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>
          {announcementsState.status === 'loading' ? (
            <p className="admin-dashboard__empty" role="status">{t('app.loading.content')}</p>
          ) : announcementsState.status === 'error' ? (
            <div className="admin-dashboard__empty" role="alert">
              <p>{t('parent.dashboard.announcementsError')}</p>
              {announcementsState.retry && (
                <button type="button" className="admin-dashboard__retry" onClick={announcementsState.retry}>
                  {t('common.tryAgain')}
                </button>
              )}
            </div>
          ) : announcementsState.status === 'denied' ? (
            <p className="admin-dashboard__empty" role="status">{t('parent.dashboard.announcementsUnavailable')}</p>
          ) : recentAnnouncements.length === 0 ? (
            <p className="admin-dashboard__empty">{t('parent.dashboard.noAnnouncements')}</p>
          ) : (
            <div className="admin-dashboard__announcement-list">
              {recentAnnouncements.map((announcement) => (
                <article key={announcement.id} className="admin-dashboard__announcement">
                  <span
                    className={`admin-dashboard__announcement-dot${announcement.priority === 'urgent' ? ' admin-dashboard__announcement-dot--urgent' : announcement.priority === 'important' ? ' admin-dashboard__announcement-dot--important' : ''}`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p>{announcement.title}</p>
                    <span>{formatDate(announcement.publishedAt ?? announcement.createdAt)}</span>
                  </div>
                  <Badge tone={announcement.priority === 'urgent' ? 'danger' : announcement.priority === 'important' ? 'warning' : 'neutral'}>
                    {['urgent', 'important', 'normal'].includes(announcement.priority)
                      ? t(`common.priority.${announcement.priority}`)
                      : announcement.priority}
                  </Badge>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="admin-dashboard__panel" aria-labelledby="parent-quick-links-title">
          <div className="admin-dashboard__section-heading">
            <div>
              <p className="admin-dashboard__eyebrow">{selectedChild.name}</p>
              <h2 id="parent-quick-links-title">{selectedChild.className ?? t('common.school')}</h2>
            </div>
          </div>
          <div className="admin-dashboard__class-list">
            <Link to="/app/parent/timetable" className="admin-dashboard__class-row">
              <span className="admin-dashboard__class-icon"><Clock aria-hidden="true" className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1"><p>{t('parent.timetable.title')}</p></div>
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
            <Link to="/app/parent/grades" className="admin-dashboard__class-row">
              <span className="admin-dashboard__class-icon"><BookOpen aria-hidden="true" className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1"><p>{t('parent.dashboard.averageGrade')}</p></div>
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
            <Link to="/app/parent/fees" className="admin-dashboard__class-row">
              <span className="admin-dashboard__class-icon"><Wallet aria-hidden="true" className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1"><p>{t('parent.fees.title')}</p></div>
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}
