import { CalendarCheck, Check, X, Clock, Warning as FileWarning } from '@phosphor-icons/react'
import { useSelectedChild } from '@/hooks/useSelectedChild'
import { useChildAttendance } from '@/hooks/useChildRecords'
import PageHeader from '@/components/ui/PageHeader'
import { useLanguage } from '@/context/LanguageContext'
import ChildSwitcher from '@/components/dashboard/ChildSwitcher'
import ResourceGate from '@/components/ui/ResourceGate'
import StatCard from '@/components/ui/StatCard'
import { formatDate, percentage } from '@/utils/format'
import type { AttendanceStatus } from '@/types'
import { cn } from '@/utils/cn'

// Phase 8 batch 5. Real attendance_records for the selected child.
//
// READ ONLY. The guardian reaches these rows through
// attendance_records_guardian_select (is_guardian_of_student) and has no INSERT,
// UPDATE or DELETE policy on the table at all. No write control is rendered.
//
// The prototype walked a hardcoded mock week (`schoolDays`) and looked up each
// date. Real records are returned already ordered by date, so the list is what
// the school actually marked rather than what a fixed five-day window expected.

const statusMeta: Record<AttendanceStatus, { icon: typeof Check; tone: string; label: string }> = {
  present: { icon: Check, tone: 'text-emerald-500 bg-emerald-500/10', label: 'Present' },
  absent: { icon: X, tone: 'text-red-500 bg-red-500/10', label: 'Absent' },
  late: { icon: Clock, tone: 'text-amber-500 bg-amber-500/10', label: 'Late' },
  excused: { icon: FileWarning, tone: 'text-accent bg-accent/10', label: 'Excused' },
}

export default function ParentAttendance() {
  const { t } = useLanguage()
  const { children, selectedChild, selectChild, state } = useSelectedChild()
  const { state: attendanceState } = useChildAttendance(selectedChild?.id ?? null)

  if (!selectedChild) {
    return (
      <div>
        <PageHeader title={t('parent.attendance.title')} description={t('parent.attendance.description')} />
        <ResourceGate
          state={state}
          empty={{ icon: CalendarCheck, title: "No children linked yet", description: "Contact your school administrator to link your child's record." }}
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
        title={t('parent.attendance.title')}
        description={`${selectedChild.name} · ${selectedChild.className ?? ''}`}
        actions={<ChildSwitcher children={children} selectedId={selectedChild.id} onSelect={selectChild} classLabel={(c) => c.className ?? ''} />}
      />

      <ResourceGate
        state={attendanceState}
        empty={{
          icon: CalendarCheck,
          title: 'No attendance recorded yet',
          description: 'Attendance records will appear here once marked by the teacher.',
        }}
        deniedHint="Child records are available to a linked parent or guardian."
      >
        {(records) => {
          const present = records.filter((r) => r.status === 'present' || r.status === 'late').length
          const absent = records.filter((r) => r.status === 'absent').length
          return (
            <>
              <div className="mb-6 grid gap-5 sm:grid-cols-3">
                <StatCard label={t('parent.attendance.rate')} value={`${percentage(present, records.length)}%`} icon={CalendarCheck} tint="#34A853" />
                <StatCard label={t('parent.attendance.daysPresent')} value={present} icon={Check} tint="#0071E3" />
                <StatCard label={t('parent.attendance.daysAbsent')} value={absent} icon={X} tint="#EF4444" />
              </div>

              <div className="card divide-y divide-ink/5 dark:divide-white/5">
                {records.map((r) => {
                  const meta = statusMeta[r.status]
                  return (
                    <div key={r.date} className="flex items-center justify-between px-5 py-3.5">
                      <div>
                        <p className="text-sm font-medium text-ink dark:text-white">
                          {formatDate(r.date, { weekday: 'long', month: 'short', day: 'numeric' })}
                        </p>
                        {r.note && <p className="text-xs text-graphite">{r.note}</p>}
                      </div>
                      <span className={cn('flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium', meta.tone)}>
                        <meta.icon className="h-3.5 w-3.5" /> {meta.label}
                      </span>
                    </div>
                  )
                })}
              </div>
            </>
          )
        }}
      </ResourceGate>
    </div>
  )
}
