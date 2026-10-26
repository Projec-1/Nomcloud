import { ChartLine, ClipboardText, GraduationCap, Users } from '@phosphor-icons/react'
import type { Request, School } from '@/pages/platform/types'
import { KpiTile, Panel, SectionHeader } from './PrototypeKit'

export default function AnalyticsSection({
  schools,
  requests,
  pendingApplicationCount,
  operatorCount,
  loading,
}: {
  schools: School[]
  requests: Request[]
  pendingApplicationCount: number
  operatorCount: number
  loading: boolean
}) {
  const studentCount = schools.reduce((total, school) => total + (school.students ?? 0), 0)
  const teacherCount = schools.reduce((total, school) => total + (school.teachers ?? 0), 0)
  const activeSchoolCount = schools.filter((school) => school.status === 'Active').length
  const pendingRequestCount = requests.filter((request) => request.status === 'Open').length

  return <>
    <SectionHeader eyebrow="Network reporting" title="Analytics" description="A current snapshot derived from records available to this workspace; no historical trend is implied." />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiTile label="Schools loaded" value={loading ? '…' : schools.length.toLocaleString()} detail={loading ? 'Loading school records' : `${activeSchoolCount.toLocaleString()} marked active`} icon={GraduationCap} />
      <KpiTile label="Students in loaded records" value={loading ? '…' : studentCount.toLocaleString()} detail="Current school-record totals" icon={Users} />
      <KpiTile label="Pending requests loaded" value={loading ? '…' : pendingRequestCount.toLocaleString()} detail="Latest request records returned" icon={ClipboardText} />
      <KpiTile label="Pending applications" value={loading ? '…' : pendingApplicationCount.toLocaleString()} detail="Count query from application workflow" icon={ChartLine} />
    </div>
    <div className="mt-6 grid gap-6 xl:grid-cols-2">
      <Panel title="Current school snapshot" description="Counts are calculated from the school rows loaded for this view.">
        <dl className="grid gap-4 sm:grid-cols-2">
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-graphite">Teachers in loaded records</dt><dd className="mt-1 text-xl font-bold">{loading ? '…' : teacherCount.toLocaleString()}</dd></div>
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-graphite">Operators loaded</dt><dd className="mt-1 text-xl font-bold">{loading ? '…' : operatorCount.toLocaleString()}</dd></div>
        </dl>
      </Panel>
      <Panel title="Reporting limits" description="These source records do not provide historical analytics.">
        <p className="text-sm leading-6 text-graphite">Retention, revenue, churn, adoption-over-time, and product-usage metrics remain unavailable. Request totals reflect only the latest records returned by the workspace query; school and operator totals are loaded rows, not a versioned reporting snapshot.</p>
      </Panel>
    </div>
  </>
}
