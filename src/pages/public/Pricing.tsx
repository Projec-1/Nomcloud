import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Minus, Users, Wallet, Buildings as Building2 } from '@phosphor-icons/react'
import SEO from '@/components/layout/SEO'
import Reveal from '@/components/marketing/Reveal'
import FaqAccordion from '@/components/marketing/FaqAccordion'
import { PaymentMarquee } from '@/components/marketing/PaymentLogos'
import { cn } from '@/utils/cn'
import { useLanguage } from '@/context/LanguageContext'
import { subscriptionPlans } from '@/data/subscriptionPlans'

const comparisonCategories: {
  icon: typeof Users
  prefix: string
  rows: { key: string; starter: boolean | 'support'; growth: boolean | 'support'; enterprise: boolean | 'support' }[]
}[] = [
  {
    icon: Users,
    prefix: 'pricing.cat1',
    rows: [
      { key: 'row1', starter: true, growth: true, enterprise: true },
      { key: 'row2', starter: true, growth: true, enterprise: true },
      { key: 'row3', starter: true, growth: true, enterprise: true },
    ],
  },
  {
    icon: Wallet,
    prefix: 'pricing.cat2',
    rows: [
      { key: 'row1', starter: false, growth: true, enterprise: true },
      { key: 'row2', starter: false, growth: true, enterprise: true },
      { key: 'row3', starter: false, growth: true, enterprise: true },
    ],
  },
  {
    icon: Building2,
    prefix: 'pricing.cat3',
    rows: [
      { key: 'row1', starter: false, growth: false, enterprise: true },
      { key: 'row2', starter: false, growth: false, enterprise: true },
      { key: 'row3', starter: 'support', growth: 'support', enterprise: 'support' },
    ],
  },
]

const faqNums = ['1', '2', '3', '4', '5', '6', '7', '8']
const comparisonColors = [
  'bg-[#fff4cc] text-[#765700] dark:bg-[#e9ae22]/15 dark:text-[#f3ca62]',
  'bg-[#fee8df] text-[#a63b23] dark:bg-[#e34e49]/15 dark:text-[#f28b78]',
  'bg-[#f0e7f7] text-[#63368b] dark:bg-[#7134aa]/20 dark:text-[#c5a0e4]',
]

function formatUSD(amount: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount)
}

export default function Pricing() {
  const { t } = useLanguage()
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'annual'>('monthly')
  const faqs = faqNums.map((n) => ({ q: t(`pricing.faq.q${n}`), a: t(`pricing.faq.a${n}`) }))
  const supportLabels = { starter: t('pricing.support.email'), growth: t('pricing.support.priority'), enterprise: t('pricing.support.sla') }
  const formatUSDWithCents = (amount: number) => new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount)

  return (
    <div>
      <SEO
        title="Pricing — Simple Plans for Every School"
        description="No per-user fees, no hidden costs. Compare Nom Cloud's Starter, Growth and Enterprise plans, billed in USD."
        path="/pricing"
      />
      <section className="pt-20 pb-12 sm:pt-28">
        <div className="container text-center">
          <Reveal>
            <h1 className="mx-auto max-w-3xl text-display-lg text-ink dark:text-white">{t('pricing.title')}</h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-graphite">{t('pricing.subtitle')}</p>
          </Reveal>
        </div>
      </section>

      <section className="pb-24">
        <div className="container">
          <div className="mb-7 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <span className="text-sm font-medium text-ink dark:text-white">{t('pricing.billing.label')}</span>
            <div role="group" aria-label={t('pricing.billing.label')} className="inline-flex rounded-xl border border-ink/10 bg-white p-1 dark:border-white/10 dark:bg-[#202328]">
              {(['monthly', 'annual'] as const).map((interval) => (
                <button
                  key={interval}
                  type="button"
                  aria-pressed={billingInterval === interval}
                  onClick={() => setBillingInterval(interval)}
                  className={cn(
                    'min-h-11 rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                    billingInterval === interval ? 'bg-brand text-white' : 'text-graphite hover:text-ink dark:hover:text-white',
                  )}
                >
                  {t(`billing.interval.${interval}`)}
                  {interval === 'annual' && <span className="ms-2 text-xs"> {t('pricing.billing.saveTwoMonths')}</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
          {subscriptionPlans.map((plan, i) => (
            <Reveal key={plan.name} delay={i * 100}>
              <div
                className={cn(
                  'group flex h-full flex-col rounded-3xl p-8 transition-all duration-300',
                  plan.highlight ? 'border-2 border-brand bg-white shadow-floaty hover:shadow-[0_20px_40px_rgba(0,113,227,0.15)] dark:bg-[#161618]' : 'card hover:shadow-lg hover:border-brand/30',
                )}
              >
                {plan.highlight && (
                  <span className="mb-4 inline-flex w-fit items-center rounded-full bg-brand px-3 py-1 text-xs font-semibold text-white">
                    {t('pricing.mostPopular')}
                  </span>
                )}
                <h3 className="text-xl font-semibold text-ink dark:text-white">{plan.name}</h3>
                <p className="mt-1.5 text-sm text-graphite">{t(`${plan.prefix}.tagline`)}</p>
                <div className="mt-6">
                  {plan.monthlyPrice !== null ? (
                    <>
                      <span className="text-4xl font-semibold tracking-tight text-ink dark:text-white">
                        {formatUSD(billingInterval === 'annual' ? plan.annualPrice : plan.monthlyPrice)}
                      </span>
                      <span className="ms-1 text-sm text-graphite">
                        {' '}{billingInterval === 'annual' ? t('billing.interval.priceSuffix.annual') : t('pricing.perMonth')}
                      </span>
                      {billingInterval === 'annual' && plan.annualPrice !== null && (
                        <div className="mt-3 space-y-1.5 text-sm">
                          <p className="font-medium text-brand">
                            {t('pricing.billing.saveTwoMonths')} · {t('pricing.billing.save')} {formatUSD(plan.monthlyPrice * 12 - plan.annualPrice)} {t('pricing.billing.perYear')}
                          </p>
                          <p className="text-graphite">
                            {formatUSDWithCents(plan.annualPrice / 12)} {t('pricing.billing.monthlyEquivalent')} · {t('pricing.billing.billedAnnually')}
                          </p>
                          <p className="text-xs text-graphite">
                            {t('pricing.billing.regularPrice')} {formatUSD(plan.monthlyPrice * 12)} {t('pricing.billing.perYear')}
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    <span className="text-4xl font-semibold tracking-tight text-ink dark:text-white">{t('pricing.custom')}</span>
                  )}
                </div>
                <ul className="mt-8 flex-1 space-y-3.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-3 text-sm text-ink dark:text-white">
                      <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand" />
                      <span>{t(`${plan.prefix}.${f}`)}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  to={plan.monthlyPrice !== null ? '/signup' : '/contact'}
                  className={cn('mt-8 w-full justify-center py-3.5 text-sm transition-all', plan.highlight ? 'btn-accent hover:shadow-lg' : 'btn-outline hover:border-brand hover:text-brand')}
                >
                  {plan.monthlyPrice !== null ? t('pricing.getStarted') : t('pricing.contactSales')}
                </Link>
              </div>
            </Reveal>
          ))}
          </div>
        </div>
      </section>

      <section className="py-24">
        <div className="container">
          <Reveal>
            <div className="text-center mb-12">
              <h2 className="text-display-md text-ink dark:text-white">Analysis Overview</h2>
              <p className="mt-3 text-base text-graphite max-w-2xl mx-auto">See real-time insights into your school's performance with clean, actionable analytics.</p>
            </div>
          </Reveal>

          <Reveal delay={100}>
            <div className="mx-auto max-w-4xl">
              <div className="rounded-3xl border border-ink/5 dark:border-white/10 bg-white dark:bg-white/[0.04] shadow-soft p-8 sm:p-10">
                {/* Header Stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 mb-10 pb-10 border-b border-ink/5 dark:border-white/10">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-graphite mb-2">Students</p>
                    <p className="text-3xl font-semibold text-ink dark:text-white">1,248</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-graphite mb-2">Teachers</p>
                    <p className="text-3xl font-semibold text-ink dark:text-white">68</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-graphite mb-2">Attendance</p>
                    <div className="flex items-baseline gap-2">
                      <p className="text-3xl font-semibold text-ink dark:text-white">94.8%</p>
                      <p className="text-sm text-emerald-600 font-medium">+4.8%</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-graphite mb-2">Outstanding Fees</p>
                    <p className="text-3xl font-semibold text-ink dark:text-white">$12,480</p>
                  </div>
                </div>

                {/* Chart Section */}
                <div>
                  <h3 className="text-sm font-semibold text-ink dark:text-white mb-6">Attendance Trend</h3>
                  <div className="h-48 flex items-end justify-center gap-2">
                    {[68, 71, 69, 75, 72, 78, 82, 85, 88, 91, 93, 95].map((value, i) => (
                      <div key={i} className="flex flex-col items-center flex-1 gap-2">
                        <div
                          className="w-full rounded-t-md bg-brand"
                          style={{ height: `${(value / 100) * 160}px` }}
                        />
                        <p className="text-xs text-graphite/50">W{String(i + 1).padStart(2, '0')}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-graphite mt-4 text-center">Week-by-week attendance percentage across all classes</p>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="pb-14">
        <div className="container">
          <p className="mb-6 text-center text-xs font-semibold uppercase tracking-[0.2em] text-graphite">{t('footer.payments')}</p>
          <PaymentMarquee />
        </div>
      </section>

      <section className="section overflow-hidden bg-[#f7f7f5] dark:bg-[#17191c]">
        <div className="container">
          <Reveal className="mx-auto max-w-3xl text-center">
            <span className="eyebrow">{t('pricing.compare.eyebrow')}</span>
            <h2 className="mt-5 text-display-md text-ink dark:text-white">{t('pricing.compare.title')}</h2>
            <p className="mx-auto mt-4 max-w-2xl text-base text-graphite">{t('pricing.compare.subtitle')}</p>
          </Reveal>

          <Reveal delay={100} className="mt-12 overflow-hidden rounded-3xl border border-ink/10 bg-white dark:border-white/10 dark:bg-[#202320]">
            <div className="grid items-center gap-2 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
              <div className="px-4 pt-6 sm:px-8 sm:pt-8">
                <svg aria-hidden="true" focusable="false" viewBox="0 0 520 300" className="mx-auto block w-full max-w-[520px]">
                  <g fill="none" strokeWidth="34" strokeLinecap="round">
                    <path d="M 42 280 A 218 218 0 0 1 478 280" className="stroke-[#ebe9e3] dark:stroke-[#35383b]" />
                    <path d="M 94 280 A 166 166 0 0 1 426 280" className="stroke-[#ebe9e3] dark:stroke-[#35383b]" />
                    <path d="M 146 280 A 114 114 0 0 1 374 280" className="stroke-[#ebe9e3] dark:stroke-[#35383b]" />
                    <path d="M 42 280 A 218 218 0 0 1 478 280" stroke="#7134aa" />
                    <path d="M 94 280 A 166 166 0 0 1 426 280" stroke="#e34e49" />
                    <path d="M 146 280 A 114 114 0 0 1 374 280" stroke="#e9ae22" />
                  </g>
                  <g fill="white" fontFamily="DM Sans, sans-serif" fontSize="13" fontWeight="700" textAnchor="middle">
                    <text x="260" y="74">03</text>
                    <text x="260" y="126">02</text>
                    <text x="260" y="178">01</text>
                  </g>
                </svg>
              </div>
              <div className="px-6 pb-7 sm:px-8 sm:pb-8 lg:py-8 lg:pe-10 lg:ps-4">
                <div className="space-y-2">
                  {comparisonCategories.map((cat, index) => {
                    return (
                      <div key={cat.prefix} className="flex items-center gap-4 rounded-2xl px-3 py-3 transition-colors hover:bg-mist/70 dark:hover:bg-white/[0.04]">
                        <span className={cn('flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums', comparisonColors[index])}>
                          0{index + 1}
                        </span>
                        <cat.icon aria-hidden="true" className="h-5 w-5 flex-shrink-0 text-graphite" />
                        <span className="text-sm font-semibold text-ink dark:text-white">{t(`${cat.prefix}.title`)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </Reveal>

          <Reveal delay={160} className="mt-8 overflow-hidden rounded-3xl border border-ink/10 bg-white dark:border-white/10 dark:bg-[#202320]">
            <div className="overflow-x-auto">
              <table className="w-full table-fixed border-collapse text-start">
                <colgroup>
                  <col className="w-[36%] sm:w-[46%]" />
                  <col className="w-[21.33%] sm:w-[18%]" />
                  <col className="w-[21.33%] sm:w-[18%]" />
                  <col className="w-[21.34%] sm:w-[18%]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-ink/10 dark:border-white/10">
                    <th aria-hidden="true" className="px-3 py-4 sm:px-6" />
                    {subscriptionPlans.map((plan) => (
                      <th key={plan.name} scope="col" className={cn('px-0.5 py-4 text-center sm:px-4 sm:py-5', plan.highlight ? 'bg-brand/[0.06]' : '')}>
                        <span className="block text-[11px] font-bold text-ink dark:text-white sm:text-sm">{plan.name}</span>
                        {plan.highlight && <span className="mt-1 block text-[9px] font-semibold leading-tight text-brand sm:text-[10px]">{t('pricing.mostPopular')}</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                {comparisonCategories.map((cat, ci) => (
                  <tbody key={cat.prefix}>
                    <tr className="border-t border-ink/10 bg-mist/70 dark:border-white/10 dark:bg-white/[0.035]">
                      <th colSpan={4} scope="rowgroup" className="px-3 py-4 text-start sm:px-6">
                        <span className="flex items-center gap-3">
                          <span className={cn(
                            'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl text-[10px] font-bold tabular-nums',
                            comparisonColors[ci],
                          )}>
                            0{ci + 1}
                          </span>
                          <cat.icon aria-hidden="true" className="h-4 w-4 flex-shrink-0 text-brand" />
                          <span className="text-sm font-semibold text-ink dark:text-white">{t(`${cat.prefix}.title`)}</span>
                        </span>
                      </th>
                    </tr>
                    {cat.rows.map((row) => {
                      const cells = [row.starter, row.growth, row.enterprise]
                      return (
                        <tr key={`${cat.prefix}-${row.key}`} className="border-t border-ink/5 dark:border-white/[0.06]">
                          <th scope="row" className="px-3 py-4 text-start text-xs font-medium leading-snug text-ink dark:text-white sm:px-6 sm:text-sm">
                            {t(`${cat.prefix}.${row.key}`)}
                          </th>
                          {cells.map((cell, i) => (
                            <td key={i} className={cn('px-0.5 py-4 text-center sm:px-4', subscriptionPlans[i].highlight ? 'bg-brand/[0.035]' : '')}>
                              {cell === 'support' ? (
                                <span className="inline-block max-w-full break-words rounded-lg bg-mist px-1 py-1 text-[10px] font-medium leading-tight text-ink dark:bg-white/10 dark:text-white sm:px-2.5 sm:text-xs">
                                  {i === 0 ? supportLabels.starter : i === 1 ? supportLabels.growth : supportLabels.enterprise}
                                </span>
                              ) : cell ? (
                                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300" aria-label={t('pricing.compare.included')}>
                                  <Check aria-hidden="true" className="h-4 w-4" />
                                </span>
                              ) : (
                                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-mist text-graphite/60 dark:bg-white/[0.06] dark:text-white/40" aria-label={t('pricing.compare.notIncluded')}>
                                  <Minus aria-hidden="true" className="h-4 w-4" />
                                </span>
                              )}
                            </td>
                          ))}
                        </tr>
                      )
                    })}
                  </tbody>
                ))}
              </table>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="section">
        <div className="container max-w-3xl">
          <h2 className="text-display-md text-ink dark:text-white">{t('pricing.faq.title')}</h2>
          <div className="mt-12">
            <FaqAccordion items={faqs} />
          </div>
        </div>
      </section>
    </div>
  )
}
