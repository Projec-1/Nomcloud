import type { ReactNode } from 'react'

export interface AdminInsightMetric {
  label: string
  value: string | number
  detail?: string
  change?: {
    value: string
    direction: 'up' | 'down' | 'flat'
    positive: boolean
  }
  progress?: number
}

export interface AdminInsightBreakdown {
  label: string
  value: number
  displayValue?: string
  tone?: 'brand' | 'accent' | 'positive' | 'negative' | 'warning' | 'neutral'
}

export interface AdminInsightSeries {
  label: string
  values: number[]
  tone?: 'brand' | 'accent' | 'positive' | 'negative' | 'warning' | 'neutral'
}

export type AdminInsightChart =
  | {
      kind: 'line'
      title: string
      categories: string[]
      series: AdminInsightSeries[]
      formatValue?: (value: number) => string
    }
  | {
      kind: 'donut'
      title: string
      segments: AdminInsightBreakdown[]
      formatValue?: (value: number) => string
    }

const defaultTones: AdminInsightSeries['tone'][] = ['brand', 'accent', 'positive', 'warning']
const chartColorClasses: Record<NonNullable<AdminInsightSeries['tone']>, string> = {
  brand: 'text-brand',
  accent: 'text-accent',
  positive: 'text-emerald-700 dark:text-emerald-300',
  negative: 'text-red-700 dark:text-red-300',
  warning: 'text-amber-700 dark:text-amber-300',
  neutral: 'text-graphite',
}
const donutColorValues: Record<NonNullable<AdminInsightSeries['tone']>, string> = {
  brand: '#0071E3',
  accent: '#FF5A1F',
  positive: '#248A57',
  negative: '#D14343',
  warning: '#F59E0B',
  neutral: '#8A8F98',
}

function formatNumber(value: number, format?: (value: number) => string) {
  return format ? format(value) : new Intl.NumberFormat().format(value)
}

function LineChart({ chart }: { chart: Extract<AdminInsightChart, { kind: 'line' }> }) {
  const width = 320
  const height = 74
  const inset = 6
  const allValues = chart.series.flatMap((item) => item.values)
  const min = Math.min(...allValues, 0)
  const max = Math.max(1, ...allValues)
  const range = max - min || 1
  const pointString = (values: number[]) =>
    values
      .map((value, index) => {
        const x = inset + (index * (width - inset * 2)) / Math.max(1, values.length - 1)
        const y = height - inset - ((value - min) / range) * (height - inset * 2)
        return `${x},${y}`
      })
      .join(' ')

  return (
    <div>
      <svg
        className="h-[4.625rem] w-full overflow-visible text-brand"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${chart.title}: ${chart.categories
          .map((category, categoryIndex) => `${category}: ${chart.series
            .map((item) => `${item.label} ${formatNumber(item.values[categoryIndex] ?? 0, chart.formatValue)}`)
            .join(', ')}`)
          .join('; ')}`}
      >
        <line x1={inset} x2={width - inset} y1={height - inset} y2={height - inset} className="stroke-ink/10 dark:stroke-white/15" />
        {chart.series.map((item, index) => (
          <g key={item.label} className={chartColorClasses[item.tone ?? defaultTones[index % defaultTones.length] ?? 'brand']}>
            {item.values.length > 1 && (
              <polyline
                points={pointString(item.values)}
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            )}
            {item.values.map((value, pointIndex) => {
              const x = inset + (pointIndex * (width - inset * 2)) / Math.max(1, item.values.length - 1)
              const y = height - inset - ((value - min) / range) * (height - inset * 2)
              return <circle key={`${item.label}-${pointIndex}`} cx={x} cy={y} r="2.6" fill="currentColor" />
            })}
          </g>
        ))}
      </svg>
      <div className="mt-1 flex justify-between gap-1 text-[10px] text-graphite">
        {chart.categories.map((category, index) => (
          <span key={`${category}-${index}`} className="truncate">
            {category}
          </span>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {chart.series.map((item, index) => (
          <span key={item.label} className={`inline-flex items-center gap-1 text-[10px] ${chartColorClasses[item.tone ?? defaultTones[index % defaultTones.length] ?? 'brand']}`}>
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
            <span className="text-graphite">{item.label}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

function DonutChart({ chart }: { chart: Extract<AdminInsightChart, { kind: 'donut' }> }) {
  const total = chart.segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0)
  let offset = 0

  return (
    <div className="flex items-center gap-4">
      <svg
        className="h-20 w-20 shrink-0 -rotate-90"
        viewBox="0 0 44 44"
        role="img"
        aria-label={`${chart.title}: ${chart.segments.map((segment) => `${segment.label} ${formatNumber(segment.value, chart.formatValue)}`).join(', ')}`}
      >
        <circle cx="22" cy="22" r="16" fill="none" className="stroke-mist dark:stroke-white/10" strokeWidth="7" />
        {total > 0 &&
          chart.segments.map((segment, index) => {
            const amount = (Math.max(0, segment.value) / total) * 100
            const segmentOffset = offset
            offset += amount
            return (
              <circle
                key={`${segment.label}-${index}`}
                cx="22"
                cy="22"
                r="16"
                fill="none"
                stroke={donutColorValues[segment.tone ?? defaultTones[index % defaultTones.length] ?? 'brand']}
                strokeWidth="7"
                strokeDasharray={`${amount} ${100 - amount}`}
                strokeDashoffset={-segmentOffset}
                pathLength="100"
              />
            )
          })}
      </svg>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {chart.segments.map((segment, index) => (
          <li key={`${segment.label}-${index}`} className="flex min-w-0 items-center justify-between gap-2 text-[10px]">
            <span className="flex min-w-0 items-center gap-1.5 text-graphite">
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: donutColorValues[segment.tone ?? defaultTones[index % defaultTones.length] ?? 'brand'] }}
                aria-hidden="true"
              />
              <span className="truncate">{segment.label}</span>
            </span>
            <span className="shrink-0 font-medium tabular-nums text-ink dark:text-white">
              {formatNumber(segment.value, chart.formatValue)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function AdminSectionInsights({
  insight,
  sample = false,
  charts,
  action,
}: {
  metrics: AdminInsightMetric[]
  insight?: string
  sample?: boolean
  breakdown?: AdminInsightBreakdown[]
  charts?: AdminInsightChart[]
  action?: ReactNode
}) {
  const primaryCharts = charts?.filter((chart) => chart.kind === 'line' || chart.kind === 'donut') ?? []
  if (primaryCharts.length === 0) return null

  return (
    <section aria-label="Section insights" className="mb-5">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {primaryCharts.map((chart) => (
          <article
            key={`${chart.kind}-${chart.title}`}
            className={`min-w-0 rounded-xl border border-ink/[0.08] bg-white px-3 py-3 dark:border-white/10 dark:bg-[#202328] sm:px-4 ${primaryCharts.length === 1 ? 'md:col-span-2' : ''}`}
          >
            <h2 className="mb-2 text-xs font-semibold text-ink dark:text-white">{chart.title}</h2>
            {chart.kind === 'line'
              ? chart.categories.length > 0
                ? <LineChart chart={chart} />
                : <p className="py-5 text-center text-xs text-graphite">No trend data for this period.</p>
              : null}
            {chart.kind === 'donut' ? <DonutChart chart={chart} /> : null}
          </article>
        ))}
      </div>
      {(insight || sample || action) && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
            {insight && <p className="min-w-0 text-xs leading-relaxed text-graphite">{insight}</p>}
            {sample && (
              <span className="rounded-full border border-amber-500/25 bg-amber-500/[0.06] px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:text-amber-200">
                Sample data
              </span>
            )}
          </div>
          {action}
        </div>
      )}
    </section>
  )
}
