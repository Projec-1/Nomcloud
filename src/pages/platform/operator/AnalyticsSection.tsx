import { useMemo, useState } from 'react'
import { ArrowUpRight, Buildings as Building2, CaretRight as ChevronRight, CreditCard, GraduationCap, Users } from '@phosphor-icons/react'
import { formatCurrency } from '@/utils/format'
import {
  BarSeries,
  DataTable,
  DetailModal,
  DistributionBar,
  ExportButton,
  FilterChips,
  KpiTile,
  MetaList,
  Panel,
  Pill,
  PrototypeNotice,
  SectionHeader,
  Sparkline,
  downloadCsv,
  type Column,
} from './PrototypeKit'
import { analyticsSeries, analyticsSnapshot, trendLabels, trendWindows, windowSize, type TrendWindow } from './prototypeData'

interface RegionRow {
  region: string
  schools: number
  students: number
  mrr: number
}

function slice(values: number[], window: TrendWindow): number[] {
  return values.slice(-windowSize(window))
}

function changeFor(values: number[], window: TrendWindow): { start: number; end: number; delta: number; percent: number } {
  const current = slice(values, window)
  const size = current.length
  const index = values.length - size
  const previous = values.slice(Math.max(0, index - size), index)
  const end = current[current.length - 1] ?? 0
  const start = current[0] ?? 0
  const baseline = previous.length ? previous[previous.length - 1] ?? start : start
  const delta = end - baseline
  return { start, end, delta, percent: baseline === 0 ? 0 : delta / baseline }
}

export default function AnalyticsSection({ onNotify, onNavigate }: { onNotify: (message: string) => void; onNavigate?: (path: string) => void }) {
  const [window, setWindow] = useState<TrendWindow>('Last 30 days')
  const [region, setRegion] = useState<RegionRow | null>(null)

  const metrics = useMemo(() => ({
    schools: changeFor(analyticsSeries.schools, window),
    students: changeFor(analyticsSeries.students, window),
    teachers: changeFor(analyticsSeries.teachers, window),
    mrr: changeFor(analyticsSeries.mrr, window),
  }), [window])

  const labels = slice(trendLabels, window)
  const trendRows = [
    ['Registered schools', metrics.schools],
    ['Active students', metrics.students],
    ['Teachers', metrics.teachers],
    ['Monthly recurring revenue', metrics.mrr],
  ] as const

  const exportReport = () => {
    downloadCsv('platform-analytics.csv', [
      ['Metric', 'Value', 'Change in period'],
      ['Registered schools', metrics.schools.end, `${metrics.schools.delta >= 0 ? '+' : ''}${metrics.schools.delta}`],
      ['Active students', metrics.students.end, `${metrics.students.delta >= 0 ? '+' : ''}${metrics.students.delta}`],
      ['Teachers', metrics.teachers.end, `${metrics.teachers.delta >= 0 ? '+' : ''}${metrics.teachers.delta}`],
      ['Monthly recurring revenue', metrics.mrr.end, `${metrics.mrr.delta >= 0 ? '+' : ''}${formatCurrency(metrics.mrr.delta)}`],
      [],
      ['Plans', 'Schools', 'MRR'],
      ...analyticsSnapshot.planDistribution.map((plan) => [plan.plan, plan.schools, plan.mrr]),
      [],
      ['Region', 'Schools', 'Students', 'MRR'],
      ...analyticsSnapshot.regions.map((row) => [row.region, row.schools, row.students, row.mrr]),
    ])
    onNotify(`Analytics report exported for ${window.toLowerCase()}.`)
  }

  const regionColumns: Array<Column<RegionRow>> = [
    { key: 'region', label: 'Region', width: 'minmax(0,1.2fr)', render: (row) => <span className="font-semibold">{row.region}</span> },
    { key: 'schools', label: 'Schools', render: (row) => <span>{row.schools}</span> },
    { key: 'students', label: 'Students', render: (row) => <span>{row.students.toLocaleString()}</span> },
    { key: 'mrr', label: 'Monthly revenue', render: (row) => <span className="font-medium">{formatCurrency(row.mrr)}</span> },
    { key: 'share', label: 'Share of network', render: (row) => <span className="text-graphite">{Math.round((row.students / analyticsSnapshot.people.students) * 100)}% of students</span> },
  ]

  return (
    <>
      <SectionHeader
        eyebrow="Platform intelligence"
        title="Analytics"
        description="Growth, adoption and subscription health across the Nom Cloud network, with the numbers behind every figure."
        action={<ExportButton onClick={exportReport} label="Export report" />}
      />
      <PrototypeNotice
        scope="Analytics"
        detail="No aggregate or reporting tables exist yet, so every figure here comes from built-in sample data. The live counts it summarises — schools, students, teachers — are already visible in the Overview and Schools sections, which read the real records."
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <FilterChips options={trendWindows} value={window} onChange={setWindow} label="Comparison period" />
        <span className="text-xs text-graphite">Compared with the previous period of the same length.</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Registered schools" value={metrics.schools.end.toLocaleString()} detail={`${analyticsSnapshot.schools.active} active · ${analyticsSnapshot.schools.trialing} trialing · ${analyticsSnapshot.schools.suspended} suspended`} icon={Building2} />
        <KpiTile label="Active students" value={metrics.students.end.toLocaleString()} detail={`${metrics.students.delta >= 0 ? '+' : ''}${metrics.students.delta.toLocaleString()} in ${window.toLowerCase()}`} icon={GraduationCap} />
        <KpiTile label="Monthly recurring revenue" value={formatCurrency(metrics.mrr.end)} detail={`${metrics.mrr.percent >= 0 ? '+' : ''}${(metrics.mrr.percent * 100).toFixed(1)}% vs previous period`} icon={CreditCard} />
        <KpiTile label="Payments needing attention" value={`${analyticsSnapshot.revenue.failedPayments} failed`} detail={`${analyticsSnapshot.revenue.overdueSubscriptions} overdue subscriptions · ${formatCurrency(analyticsSnapshot.revenue.collectedThisMonth)} collected this month`} icon={Users} tone="warning" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <Panel
          title="Growth trend"
          description={`Registered schools and active students over ${window.toLowerCase()}.`}
          action={onNavigate && <button onClick={() => onNavigate('/platform/schools')} className="text-xs font-semibold text-brand">Open schools <ChevronRight className="inline h-3.5 w-3.5" /></button>}
        >
          <p className="text-sm text-graphite">Registered schools</p>
          <Sparkline points={slice(analyticsSeries.schools, window)} />
          <p className="mt-3 text-sm text-graphite">Monthly recurring revenue</p>
          <Sparkline points={slice(analyticsSeries.mrr, window)} />
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-ink/[0.07] text-[10px] font-bold uppercase tracking-[0.15em] text-graphite dark:border-white/[0.08]">
                  <th className="py-2">Metric</th>
                  <th className="py-2">Start of period</th>
                  <th className="py-2">Now</th>
                  <th className="py-2">Change</th>
                </tr>
              </thead>
              <tbody>
                {trendRows.map(([label, metric]) => (
                  <tr key={label} className="border-b border-ink/[0.06] last:border-0 dark:border-white/[0.08]">
                    <td className="py-2.5 font-medium">{label}</td>
                    <td className="py-2.5 text-graphite">{label === 'Monthly recurring revenue' ? formatCurrency(metric.start) : metric.start.toLocaleString()}</td>
                    <td className="py-2.5 font-semibold">{label === 'Monthly recurring revenue' ? formatCurrency(metric.end) : metric.end.toLocaleString()}</td>
                    <td className="py-2.5">
                      <Pill label={`${metric.delta >= 0 ? '+' : ''}${label === 'Monthly recurring revenue' ? formatCurrency(metric.delta) : metric.delta.toLocaleString()}`} tone={metric.delta >= 0 ? 'success' : 'danger'} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel title="Plan distribution" description="Where the revenue comes from and how the network is split.">
            <DistributionBar segments={analyticsSnapshot.planDistribution.map((plan) => ({ label: plan.plan, value: plan.schools }))} />
            <ul className="mt-5 space-y-3 text-sm">
              {analyticsSnapshot.planDistribution.map((plan) => (
                <li key={plan.plan} className="flex items-center justify-between gap-3 border-b border-ink/[0.06] pb-3 last:border-0 last:pb-0 dark:border-white/[0.08]">
                  <span className="font-medium">{plan.plan}</span>
                  <span className="text-graphite">{plan.schools} schools</span>
                  <span className="font-semibold">{formatCurrency(plan.mrr)}</span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="School lifecycle" description="Activation is measured from application approval to the first recorded attendance.">
            <BarSeries
              data={[
                { label: 'Activation rate', value: Math.round(analyticsSnapshot.lifecycle.activation * 100) },
                { label: 'Retention (90 days)', value: Math.round(analyticsSnapshot.lifecycle.retention90 * 100) },
                { label: 'Churn (monthly)', value: Math.round(analyticsSnapshot.lifecycle.churn * 100) },
              ]}
              formatValue={(value) => `${value}%`}
            />
            <p className="mt-3 text-xs text-graphite">Average onboarding time is {analyticsSnapshot.lifecycle.onboardingDays} days.</p>
          </Panel>
        </div>
      </div>

      <div className="mt-6">
        <Panel title="Regional distribution" description="Select a region to see what makes up its share of the network.">
          <DataTable columns={regionColumns} rows={analyticsSnapshot.regions} rowKey={(row) => row.region} onRow={setRegion} />
        </Panel>
      </div>

      <DetailModal
        open={Boolean(region)}
        onClose={() => setRegion(null)}
        title={region ? `${region.region}` : ''}
        description="Regional breakdown from the analytics sample data"
        meta={region ? [
          ['Schools', region.schools.toString()],
          ['Students', region.students.toLocaleString()],
          ['Monthly revenue', formatCurrency(region.mrr)],
          ['Revenue per student', formatCurrency(region.students ? Math.round(region.mrr / region.students) : 0)],
          ['Share of students', `${Math.round((region.students / analyticsSnapshot.people.students) * 100)}%`],
          ['Average school size', Math.round(region.students / region.schools).toLocaleString()],
        ] : []}
        size="md"
        footer={<ExportButton onClick={() => region && downloadCsv(`analytics-${region.region.toLowerCase()}.csv`, [['Region', 'Schools', 'Students', 'MRR'], [region.region, region.schools, region.students, region.mrr]])} label="Export region" />}
      >
        <MetaList
          columns={1}
          items={[
            ['What the sample data shows', `${region?.schools ?? 0} schools contributing ${formatCurrency(region?.mrr ?? 0)} of ${formatCurrency(analyticsSnapshot.revenue.mrr)} monthly recurring revenue.`],
            ['What the backend will need', 'A reporting view per region, grouped from the schools and memberships tables. Nothing here is measured today.'],
          ]}
        />
        <p className="flex items-center gap-2 text-xs text-graphite">
          <ArrowUpRight className="h-3.5 w-3.5" /> Region-level figures are sample data, not a measurement.
        </p>
      </DetailModal>

      <p className="mt-6 text-xs text-graphite">
        {labels.length} days of trend data are shown. Figures marked as sample data are stable sample values, not measurements.
      </p>
    </>
  )
}
