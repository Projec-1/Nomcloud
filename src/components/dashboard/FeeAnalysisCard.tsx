import { formatMoney } from '@/utils/format'

export default function FeeAnalysisCard({
  currency,
  mode,
  onModeChange,
  months,
}: {
  currency: string
  mode: 'collected' | 'outstanding'
  onModeChange: (mode: 'collected' | 'outstanding') => void
  months: { key: string; label: string; value: number }[]
}) {
  const maxValue = Math.max(...months.map((month) => month.value), 1)
  const total = months.reduce((sum, month) => sum + month.value, 0)
  const points = months.map((month, index) => {
    const x = (index / (months.length - 1)) * 100
    const y = 76 - (month.value / maxValue) * 52
    return `${x},${y}`
  }).join(' ')

  return (
    <section className="fee-analysis-card mb-6" aria-label="Monthly fee analysis">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-1 rounded-xl bg-mist p-1 dark:bg-white/10">
            {(['collected', 'outstanding'] as const).map((item) => (
              <button key={item} type="button" aria-pressed={mode === item} onClick={() => onModeChange(item)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition ${mode === item ? 'bg-white text-ink shadow-sm dark:bg-[#343A41] dark:text-white' : 'text-graphite hover:bg-white/50 dark:hover:bg-white/5'}`}>
                {item}
              </button>
            ))}
          </div>
          <p className="text-sm font-semibold text-ink dark:text-white">Monthly fees</p>
          <p className="mt-1 text-xs text-graphite">Analyze {mode} across the last seven months.</p>
        </div>
        <div className="sm:text-right">
          <p className="text-3xl font-semibold tracking-tight text-ink dark:text-white">{formatMoney(total, currency)}</p>
          <p className="mt-1 text-xs text-graphite">{mode === 'collected' ? 'Total collected' : 'Estimated outstanding'}</p>
        </div>
      </div>
      <div className="fee-analysis-chart mt-6">
        <svg viewBox="0 0 100 88" preserveAspectRatio="none" role="img" aria-label="Monthly fee trend">
          <defs>
            <linearGradient id="fee-analysis-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#FF5A1F" stopOpacity=".22" />
              <stop offset="100%" stopColor="#FF5A1F" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={`0,88 ${points} 100,88`} fill="url(#fee-analysis-fill)" />
          <polyline points={points} fill="none" stroke="#FF5A1F" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
          {months.map((month, index) => {
            const x = (index / (months.length - 1)) * 100
            const y = 76 - (month.value / maxValue) * 52
            return <circle key={month.key} cx={x} cy={y} r="1.8" fill="#FF5A1F" vectorEffect="non-scaling-stroke" />
          })}
        </svg>
        <div className="mt-2 flex justify-between text-[11px] text-graphite">
          {months.map((month) => <span key={month.key}>{month.label}</span>)}
        </div>
      </div>
    </section>
  )
}
