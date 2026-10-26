import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  ArrowRight,
  Check,
  CheckCircle as CheckCircleIcon,
  Clock,
  DeviceMobile,
  Receipt,
  WarningCircle,
} from '@phosphor-icons/react'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import PageHeader from '@/components/ui/PageHeader'
import Textarea from '@/components/ui/Textarea'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import { subscriptionPlans } from '@/data/subscriptionPlans'
import {
  fetchSubscriptionBillingHistory,
  fetchSubscriptionPlanPrices,
  startSubscriptionCheckout,
  submitEnterpriseSubscriptionEnquiry,
  type SubscriptionCheckoutResult,
  type SubscriptionInvoice,
  type SubscriptionPayment,
  type SubscriptionPlanPrice,
} from '@/services/subscriptionBillingService'
import { fetchSchoolSubscription, type SchoolSubscription } from '@/services/subscriptionService'
import { isValidEmail, isValidPhone, minLength, type FieldErrors } from '@/utils/validators'
import { errorMessage, toError } from '@/utils/errorMessage'

type BillingInterval = 'monthly' | 'annual'
type CheckoutResult = SubscriptionCheckoutResult | {
  status: 'unknown'
  invoice_number: ''
  amount_minor: number
  currency: string
  mock?: boolean
  message: string
}

interface EnterpriseForm {
  contactPerson: string
  email: string
  phone: string
  country: string
  studentRange: string
  campuses: string
  requirements: string
}

const billingMethods = [
  { id: 'starter', prefix: 'pricing.starter', features: subscriptionPlans[0].features, highlight: false },
  { id: 'growth', prefix: 'pricing.growth', features: subscriptionPlans[1].features, highlight: true },
  { id: 'enterprise', prefix: 'pricing.enterprise', features: subscriptionPlans[2].features, highlight: false },
] as const

const subscriptionStatusTones: Record<SchoolSubscription['status'], 'success' | 'warning' | 'danger' | 'neutral'> = {
  trialing: 'neutral',
  active: 'success',
  past_due: 'warning',
  cancelled: 'neutral',
  expired: 'danger',
}

function formatMoney(amountMinor: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100)
}

function formatPlanPrice(amount: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function formatDate(value: string, lang: string) {
  const locale = lang === 'ar' ? 'ar' : lang === 'so' ? 'so-SO' : 'en-US'
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(value))
}

function invoiceTone(status: SubscriptionInvoice['status']): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'paid') return 'success'
  if (status === 'overdue') return 'danger'
  if (status === 'open') return 'warning'
  return 'neutral'
}

function paymentTone(status: SubscriptionPayment['status']): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'succeeded') return 'success'
  if (status === 'pending' || status === 'unknown') return 'warning'
  if (status === 'failed') return 'danger'
  return 'neutral'
}

export default function SubscriptionBilling() {
  const { t, lang } = useLanguage()
  const { school, profile } = useAuth()
  const [subscription, setSubscription] = useState<SchoolSubscription | null>(null)
  const [plans, setPlans] = useState<SubscriptionPlanPrice[]>([])
  const [invoices, setInvoices] = useState<SubscriptionInvoice[]>([])
  const [payments, setPayments] = useState<SubscriptionPayment[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<Error | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [interval, setInterval] = useState<BillingInterval>('monthly')
  const [selectedPlan, setSelectedPlan] = useState<'starter' | 'growth' | null>(null)
  const [phone, setPhone] = useState('')
  const [phoneError, setPhoneError] = useState('')
  const [checkoutBusy, setCheckoutBusy] = useState(false)
  const [checkoutResult, setCheckoutResult] = useState<CheckoutResult | null>(null)
  const attemptKey = useRef<string | null>(null)
  const [enterpriseOpen, setEnterpriseOpen] = useState(false)
  const [enterpriseBusy, setEnterpriseBusy] = useState(false)
  const [enterpriseMessage, setEnterpriseMessage] = useState('')
  const [enterpriseError, setEnterpriseError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [enterpriseForm, setEnterpriseForm] = useState<EnterpriseForm>({
    contactPerson: profile?.full_name ?? '',
    email: profile?.email ?? '',
    phone: '',
    country: '',
    studentRange: '',
    campuses: '',
    requirements: '',
  })

  const loadBilling = useCallback(async () => {
    if (!school?.id) {
      setSubscription(null)
      setPlans([])
      setInvoices([])
      setPayments([])
      setLoading(false)
      setLoadError(null)
      return
    }
    setLoading(true)
    setLoadError(null)
    try {
      const [nextSubscription, nextPlans, history] = await Promise.all([
        fetchSchoolSubscription(school.id),
        fetchSubscriptionPlanPrices(school.id),
        fetchSubscriptionBillingHistory(school.id),
      ])
      setSubscription(nextSubscription)
      setPlans(nextPlans)
      setInvoices(history.invoices)
      setPayments(history.payments)
    } catch (error) {
      setLoadError(toError(error))
    } finally {
      setLoading(false)
    }
  }, [school?.id])

  useEffect(() => {
    void loadBilling()
  }, [loadBilling, reloadKey])

  const planById = useMemo(() => new Map(plans.map((plan) => [plan.id, plan])), [plans])
  const isSubscriptionActive = subscription !== null &&
    ['trialing', 'active', 'past_due'].includes(subscription.status)
  const selectedPlanPrice = selectedPlan ? plans.find((plan) => plan.code === selectedPlan) : undefined
  const selectedAmount = selectedPlanPrice
    ? interval === 'annual' ? selectedPlanPrice.annual_price : selectedPlanPrice.monthly_price
    : null

  const openCheckout = (code: 'starter' | 'growth') => {
    setSelectedPlan(code)
    setPhone('')
    setPhoneError('')
    setCheckoutResult(null)
    attemptKey.current = null
  }

  const closeCheckout = () => {
    if (checkoutBusy || checkoutResult?.status === 'unknown' || checkoutResult?.status === 'pending') return
    setSelectedPlan(null)
    setCheckoutResult(null)
    attemptKey.current = null
  }

  const paySubscriptionInvoice = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!school?.id || !selectedPlan || !selectedPlanPrice || selectedAmount === null) return
    const compactPhone = phone.trim().replace(/[\s()-]/g, '')
    if (!/^\+252\d{8,9}$/.test(compactPhone)) {
      setPhoneError(t('billing.method.phoneError'))
      return
    }

    setPhoneError('')
    setCheckoutBusy(true)
    const key = attemptKey.current ?? crypto.randomUUID()
    attemptKey.current = key
    try {
      const result = await startSubscriptionCheckout({
        schoolId: school.id,
        planCode: selectedPlan,
        billingInterval: interval,
        idempotencyKey: key,
        accountNumber: compactPhone.replace('+', ''),
      })
      setCheckoutResult(result)
      if (result.status === 'succeeded' || result.status === 'failed') attemptKey.current = null
      await loadBilling()
    } catch (error) {
      setCheckoutResult({
        status: 'unknown',
        invoice_number: '',
        amount_minor: Math.round(selectedAmount * 100),
        currency: selectedPlanPrice.currency,
        message: errorMessage(error, t('billing.payment.unknownWarning')),
      })
    } finally {
      setCheckoutBusy(false)
    }
  }

  const updateEnterpriseField = <K extends keyof EnterpriseForm>(key: K, value: EnterpriseForm[K]) => {
    setEnterpriseForm((current) => ({ ...current, [key]: value }))
    setFieldErrors((current) => ({ ...current, [key]: undefined }))
    setEnterpriseError('')
  }

  const submitEnterpriseEnquiry = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!school?.id) return
    const nextErrors: FieldErrors = {}
    if (!minLength(enterpriseForm.contactPerson, 2)) nextErrors.contactPerson = t('billing.enterpriseForm.error.contactPerson')
    if (!isValidEmail(enterpriseForm.email)) nextErrors.email = t('billing.enterpriseForm.error.email')
    if (enterpriseForm.phone.trim() && !isValidPhone(enterpriseForm.phone)) nextErrors.phone = t('billing.enterpriseForm.error.phone')
    if (!minLength(enterpriseForm.country, 2)) nextErrors.country = t('billing.enterpriseForm.error.country')
    if (!enterpriseForm.studentRange) nextErrors.studentRange = t('billing.enterpriseForm.error.studentRange')
    if (enterpriseForm.campuses &&
      (!Number.isInteger(Number(enterpriseForm.campuses)) || Number(enterpriseForm.campuses) < 1)) {
      nextErrors.campuses = t('billing.enterpriseForm.error.campuses')
    }
    setFieldErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setEnterpriseBusy(true)
    setEnterpriseError('')
    try {
      await submitEnterpriseSubscriptionEnquiry({
        schoolId: school.id,
        contactPerson: enterpriseForm.contactPerson.trim(),
        email: enterpriseForm.email.trim(),
        phone: enterpriseForm.phone.trim(),
        country: enterpriseForm.country.trim(),
        studentRange: enterpriseForm.studentRange,
        campuses: enterpriseForm.campuses,
        requirements: enterpriseForm.requirements.trim(),
      })
      setEnterpriseOpen(false)
      setEnterpriseMessage(t('billing.enterpriseForm.submitted'))
      setEnterpriseForm((current) => ({ ...current, requirements: '' }))
    } catch (error) {
      setEnterpriseError(errorMessage(error, t('billing.enterpriseForm.submitError')))
    } finally {
      setEnterpriseBusy(false)
    }
  }

  if (loading && !plans.length && !loadError) {
    return (
      <div>
        <PageHeader title={t('billing.title')} description={t('billing.plans.subtitle')} />
        <div className="card p-6 text-sm text-graphite" role="status">{t('billing.catalog.loading')}</div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title={t('billing.title')} description={t('billing.plans.subtitle')} />

      {enterpriseMessage && (
        <p className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100" role="status">
          {enterpriseMessage}
        </p>
      )}

      {loadError ? (
        <div className="card p-6" role="alert">
          <p className="font-medium text-ink dark:text-white">{t('billing.catalog.error')}</p>
          <p className="mt-2 break-words text-sm text-graphite">{loadError.message}</p>
          <Button type="button" className="mt-4" variant="outline" onClick={() => setReloadKey((key) => key + 1)}>
            {t('billing.retry')}
          </Button>
        </div>
      ) : (
        <>
          <section aria-labelledby="billing-current-heading" className="mb-7 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <article className="card min-w-0 p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-graphite">{t('billing.current')}</p>
                  <h2 id="billing-current-heading" className="mt-1 text-xl font-semibold text-ink dark:text-white">
                    {subscription?.plan?.name ?? t('billing.none.title')}
                  </h2>
                </div>
                {subscription && (
                  <Badge tone={subscriptionStatusTones[subscription.status]}>
                    {t(`billing.status.${subscription.status}`)}
                  </Badge>
                )}
              </div>
              {subscription ? (
                <dl className="mt-5 grid gap-4 border-t border-ink/5 pt-4 text-sm dark:border-white/10 sm:grid-cols-2">
                  <Detail label={t('billing.periodStart')} value={formatDate(subscription.current_period_start, lang)} />
                  {subscription.current_period_end && (
                    <Detail label={t('billing.periodEnd')} value={formatDate(subscription.current_period_end, lang)} />
                  )}
                  {subscription.trial_ends_at && (
                    <Detail label={t('billing.trialEnds')} value={formatDate(subscription.trial_ends_at, lang)} />
                  )}
                </dl>
              ) : (
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-graphite">{t('billing.none.description')}</p>
              )}
              {isSubscriptionActive && (
                <p className="mt-4 rounded-lg bg-ink/[0.03] p-3 text-sm text-graphite dark:bg-white/[0.04]">
                  {t('billing.actionsUnavailable')}
                </p>
              )}
            </article>

            <article className="card min-w-0 p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
                  <Receipt className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-graphite">{t('billing.history.title')}</p>
                  <p className="mt-1 text-2xl font-semibold text-ink dark:text-white">{invoices.length}</p>
                  <p className="mt-1 text-sm text-graphite">{t('billing.history.invoiceCount')}</p>
                </div>
              </div>
              {invoices.length > 0 && (
                <p className="mt-5 border-t border-ink/5 pt-4 text-sm text-graphite dark:border-white/10">
                  {t('billing.history.latestInvoice')}: <span className="font-mono font-medium text-ink dark:text-white">{invoices[0].invoice_number}</span>
                </p>
              )}
            </article>
          </section>

          {selectedPlan && selectedPlanPrice && selectedAmount !== null && (
            <section aria-labelledby="subscription-checkout-heading" className="card mb-7 border-brand/20 p-5 sm:p-7">
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.55fr)]">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand">{t('billing.flow.checkout.kicker')}</p>
                  <h2 id="subscription-checkout-heading" className="mt-1 text-2xl font-semibold tracking-tight text-ink dark:text-white">
                    {t('billing.checkout.title', { plan: selectedPlanPrice.name })}
                  </h2>
                  <p className="mt-2 max-w-xl text-sm leading-relaxed text-graphite">{t('billing.checkout.walletNotice')}</p>

                  {checkoutResult ? (
                    <CheckoutOutcome
                      result={checkoutResult}
                      onRefresh={() => setReloadKey((key) => key + 1)}
                      t={t}
                    />
                  ) : (
                    <form onSubmit={paySubscriptionInvoice} className="mt-5 max-w-xl space-y-4">
                      <Input
                        id="subscription-wallet-number"
                        label={t('billing.method.phone')}
                        type="tel"
                        autoComplete="tel"
                        required
                        value={phone}
                        onChange={(event) => {
                          setPhone(event.target.value)
                          setPhoneError('')
                        }}
                        placeholder={t('billing.method.phonePlaceholder')}
                        error={phoneError}
                      />
                      <p className="text-xs leading-relaxed text-graphite">{t('billing.checkout.walletPrivacy')}</p>
                      <div className="flex items-start gap-3 rounded-xl border border-amber-300/70 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
                        <WarningCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                        <p>{t('billing.checkout.mobileOnly')}</p>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <Button type="submit" variant="primary" size="lg" disabled={checkoutBusy}>
                          <DeviceMobile className="h-4 w-4" aria-hidden="true" />
                          {checkoutBusy ? t('billing.checkout.processing') : t('billing.checkout.submit')}
                        </Button>
                        <Button type="button" variant="ghost" onClick={closeCheckout} disabled={checkoutBusy}>
                          {t('billing.cancel')}
                        </Button>
                      </div>
                    </form>
                  )}
                </div>

                <aside className="h-fit rounded-xl border border-ink/10 bg-ink/[0.02] p-5 dark:border-white/10 dark:bg-white/[0.03]">
                  <h3 className="font-semibold text-ink dark:text-white">{t('billing.order.summary')}</h3>
                  <dl className="mt-3 divide-y divide-ink/5 dark:divide-white/10">
                    <Detail label={t('billing.order.school')} value={school?.name ?? '—'} />
                    <Detail label={t('billing.order.plan')} value={selectedPlanPrice.name} />
                    <Detail label={t('billing.order.frequency')} value={t(`billing.interval.${interval}`)} />
                    <Detail label={t('billing.order.amountDueToday')} value={formatPlanPrice(selectedAmount, selectedPlanPrice.currency)} prominent />
                  </dl>
                </aside>
              </div>
            </section>
          )}

          <section id="billing-available-plans" aria-labelledby="billing-plans-heading">
            <div className="mb-4">
              <h2 id="billing-plans-heading" className="text-xl font-semibold text-ink dark:text-white">{t('billing.available')}</h2>
              <p className="mt-1 text-sm text-graphite">{t('billing.availableDescription')}</p>
            </div>

            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div role="group" aria-label={t('pricing.billing.label')} className="inline-flex rounded-xl border border-ink/10 bg-white p-1 dark:border-white/10 dark:bg-[#202328]">
                {(['monthly', 'annual'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={interval === value}
                    onClick={() => setInterval(value)}
                    className={`min-h-11 rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand ${
                      interval === value ? 'bg-brand text-white' : 'text-graphite hover:text-ink dark:hover:text-white'
                    }`}
                  >
                    {t(`billing.interval.${value}`)}
                  </button>
                ))}
              </div>
              <p className="flex items-center gap-2 text-xs text-graphite">
                <CheckCircleIcon className="h-4 w-4 text-brand" aria-hidden="true" />
                {t('billing.checkout.secureProvider')}
              </p>
            </div>

            {plans.length === 0 ? (
              <div className="card p-6 text-sm text-graphite" role="status">{t('billing.catalog.empty')}</div>
            ) : (
              <div className="grid gap-5 lg:grid-cols-3">
                {billingMethods.map((presentation) => {
                  const plan = plans.find((candidate) => candidate.code === presentation.id)
                  if (!plan) return null
                  const planAmount = interval === 'annual' ? plan.annual_price : plan.monthly_price
                  return (
                    <article
                      key={presentation.id}
                      className={`card flex min-w-0 flex-col p-5 sm:p-6 ${
                        presentation.highlight ? 'border-brand/50 shadow-floaty' : ''
                      }`}
                    >
                      {presentation.highlight && (
                        <Badge tone="brand" className="mb-4 w-fit">{t('pricing.mostPopular')}</Badge>
                      )}
                      <h3 className="text-xl font-semibold text-ink dark:text-white">{t(`${presentation.prefix}.name`)}</h3>
                      <p className="mt-1.5 text-sm text-graphite">{t(`${presentation.prefix}.tagline`)}</p>
                      <div className="mt-5 min-h-16">
                        {presentation.id === 'enterprise' ? (
                          <span className="text-3xl font-semibold tracking-tight text-ink dark:text-white">{t('pricing.custom')}</span>
                        ) : planAmount !== null ? (
                          <>
                            <span className="text-3xl font-semibold tracking-tight text-ink dark:text-white">
                              {formatPlanPrice(planAmount, plan.currency)}
                            </span>
                            <span className="ms-1 text-sm text-graphite">
                              {interval === 'annual' ? t('billing.interval.priceSuffix.annual') : t('pricing.perMonth')}
                            </span>
                            {interval === 'annual' && plan.annual_price !== null && plan.monthly_price * 12 > plan.annual_price && (
                              <p className="mt-2 text-xs font-medium text-brand">
                                {t('pricing.billing.saveTwoMonths')} · {t('pricing.billing.save')} {formatPlanPrice(plan.monthly_price * 12 - plan.annual_price, plan.currency)} {t('pricing.billing.perYear')}
                              </p>
                            )}
                          </>
                        ) : (
                          <p className="text-sm text-amber-800 dark:text-amber-200">{t('billing.catalog.intervalUnavailable')}</p>
                        )}
                      </div>
                      <ul className="mt-5 flex-1 space-y-3">
                        {presentation.features.map((feature) => (
                          <li key={feature} className="flex items-start gap-3 text-sm leading-relaxed text-ink dark:text-white">
                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                            <span>{t(`${presentation.prefix}.${feature}`)}</span>
                          </li>
                        ))}
                      </ul>
                      <Button
                        type="button"
                        variant={presentation.highlight ? 'accent' : 'outline'}
                        className="mt-6 w-full justify-center"
                        disabled={presentation.id !== 'enterprise' && (isSubscriptionActive || planAmount === null)}
                        onClick={() => {
                          setEnterpriseMessage('')
                          if (presentation.id === 'enterprise') setEnterpriseOpen(true)
                          else if (!isSubscriptionActive) openCheckout(presentation.id)
                        }}
                      >
                        {presentation.id === 'enterprise'
                          ? t('billing.enterpriseForm.contactUs')
                          : isSubscriptionActive
                            ? t('billing.actionsUnavailable')
                            : t(`billing.plans.choose.${presentation.id}`)}
                      </Button>
                    </article>
                  )
                })}
              </div>
            )}
          </section>

          <section aria-labelledby="billing-history-heading" className="mt-8">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="billing-history-heading" className="text-xl font-semibold text-ink dark:text-white">{t('billing.history.title')}</h2>
                <p className="mt-1 text-sm text-graphite">{t('billing.history.authoritative')}</p>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setReloadKey((key) => key + 1)}>
                {t('billing.history.refresh')}
              </Button>
            </div>
            {invoices.length === 0 ? (
              <div className="card p-6 text-sm text-graphite">{t('billing.history.empty')}</div>
            ) : (
              <div className="card overflow-hidden">
                <ul className="divide-y divide-ink/5 dark:divide-white/10">
                  {invoices.map((invoice) => {
                    const planName = invoice.subscription_plan_id
                      ? planById.get(invoice.subscription_plan_id)?.name
                      : null
                    const invoicePayments = payments.filter((payment) => payment.invoice_id === invoice.id)
                    return (
                      <li key={invoice.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="break-all font-mono text-sm font-semibold text-ink dark:text-white">{invoice.invoice_number}</span>
                            <Badge tone={invoiceTone(invoice.status)}>{t(`billing.invoice.status.${invoice.status}`)}</Badge>
                          </div>
                          <p className="mt-1 text-xs text-graphite">
                            {planName ?? t('billing.planUnavailable')}
                            {invoice.billing_interval ? ` · ${t(`billing.interval.${invoice.billing_interval}`)}` : ''}
                            {` · ${formatDate(invoice.created_at, lang)}`}
                          </p>
                          {invoicePayments.map((payment) => (
                            <span key={payment.id} className="mt-2 inline-flex">
                              <Badge tone={paymentTone(payment.status)}>
                                {t(`billing.payment.status.${payment.status}`)}
                              </Badge>
                            </span>
                          ))}
                        </div>
                        <p className="shrink-0 text-lg font-semibold text-ink dark:text-white">
                          {formatMoney(invoice.amount_minor, invoice.currency)}
                        </p>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </section>
        </>
      )}

      <Modal
        open={enterpriseOpen}
        onClose={() => {
          if (!enterpriseBusy) {
            setEnterpriseOpen(false)
            setFieldErrors({})
            setEnterpriseError('')
          }
        }}
        title={t('billing.enterpriseForm.title')}
        description={t('billing.enterpriseForm.description')}
        size="lg"
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setEnterpriseOpen(false)} disabled={enterpriseBusy}>
              {t('billing.enterpriseForm.cancel')}
            </Button>
            <Button type="submit" form="enterprise-enquiry-form" disabled={enterpriseBusy}>
              {enterpriseBusy ? t('billing.enterpriseForm.submitting') : t('billing.enterpriseForm.submit')}
            </Button>
          </>
        }
      >
        <form id="enterprise-enquiry-form" onSubmit={submitEnterpriseEnquiry} noValidate className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label={t('billing.enterpriseForm.contactPerson')}
              required
              autoComplete="name"
              value={enterpriseForm.contactPerson}
              onChange={(event) => updateEnterpriseField('contactPerson', event.target.value)}
              error={fieldErrors.contactPerson}
            />
            <Input
              label={t('billing.enterpriseForm.email')}
              type="email"
              required
              autoComplete="email"
              value={enterpriseForm.email}
              onChange={(event) => updateEnterpriseField('email', event.target.value)}
              error={fieldErrors.email}
            />
            <Input
              label={t('billing.enterpriseForm.phone')}
              type="tel"
              autoComplete="tel"
              value={enterpriseForm.phone}
              onChange={(event) => updateEnterpriseField('phone', event.target.value)}
              error={fieldErrors.phone}
            />
            <Input
              label={t('billing.enterpriseForm.country')}
              required
              autoComplete="country-name"
              value={enterpriseForm.country}
              onChange={(event) => updateEnterpriseField('country', event.target.value)}
              error={fieldErrors.country}
            />
            <label className="block text-sm font-medium text-ink dark:text-white">
              {t('billing.enterpriseForm.studentRange')}
              <select
                value={enterpriseForm.studentRange}
                onChange={(event) => updateEnterpriseField('studentRange', event.target.value)}
                className="mt-1 block min-h-11 w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 dark:border-white/15 dark:bg-[#202328] dark:text-white"
              >
                <option value="">{t('billing.enterpriseForm.selectRange')}</option>
                <option value="under-300">{t('billing.enterpriseForm.range.under300')}</option>
                <option value="300-1200">{t('billing.enterpriseForm.range.300To1200')}</option>
                <option value="1201-3000">{t('billing.enterpriseForm.range.1201To3000')}</option>
                <option value="over-3000">{t('billing.enterpriseForm.range.over3000')}</option>
              </select>
              {fieldErrors.studentRange && <span className="mt-1 block text-xs text-red-600">{fieldErrors.studentRange}</span>}
            </label>
            <Input
              label={t('billing.enterpriseForm.campuses')}
              type="number"
              min="1"
              step="1"
              value={enterpriseForm.campuses}
              onChange={(event) => updateEnterpriseField('campuses', event.target.value)}
              error={fieldErrors.campuses}
            />
          </div>
          <Textarea
            label={t('billing.enterpriseForm.requirements')}
            rows={4}
            value={enterpriseForm.requirements}
            onChange={(event) => updateEnterpriseField('requirements', event.target.value)}
          />
          {enterpriseError && <p className="text-sm text-red-700 dark:text-red-300" role="alert">{enterpriseError}</p>}
        </form>
      </Modal>
    </div>
  )
}

function Detail({ label, value, prominent = false }: { label: string; value: string; prominent?: boolean }) {
  return (
    <div className={`min-w-0 py-2 ${prominent ? 'sm:col-span-2' : ''}`}>
      <dt className="text-xs text-graphite">{label}</dt>
      <dd className={`mt-1 break-words ${prominent ? 'text-lg font-semibold text-brand' : 'text-sm font-medium text-ink dark:text-white'}`}>
        {value}
      </dd>
    </div>
  )
}

function CheckoutOutcome({
  result,
  onRefresh,
  t,
}: {
  result: CheckoutResult
  onRefresh: () => void
  t: (key: string) => string
}) {
  const succeeded = result.status === 'succeeded'
  const pending = result.status === 'pending'
  const unknown = result.status === 'unknown'
  const tone = succeeded
    ? 'border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100'
    : pending || unknown
      ? 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100'
      : 'border-red-200 bg-red-50 text-red-950 dark:border-red-900 dark:bg-red-950/30 dark:text-red-100'

  return (
    <div className={`mt-5 rounded-xl border p-4 ${tone}`} role={unknown || result.status === 'failed' ? 'alert' : 'status'}>
      <div className="flex items-start gap-3">
        {succeeded
          ? <CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          : pending || unknown
            ? <Clock className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            : <WarningCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />}
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{t(`billing.payment.status.${result.status}`)}</p>
          {result.invoice_number && (
            <p className="mt-1 break-all text-sm">{t('billing.payment.invoice')}: {result.invoice_number}</p>
          )}
          <p className="mt-2 text-sm leading-relaxed">
            {unknown
              ? result.message || t('billing.payment.unknownWarning')
              : pending
                ? t('billing.payment.pendingWarning')
                : succeeded
                  ? t('billing.payment.successDetail')
                  : t('billing.payment.failureDetail')}
          </p>
          {result.mock && (
            <p className="mt-3 rounded-lg border border-dashed border-current/30 px-3 py-2 text-xs font-semibold">
              {t('billing.payment.mockNotice')}
            </p>
          )}
          {pending || unknown ? (
            <Button type="button" variant="outline" size="sm" className="mt-4" onClick={onRefresh}>
              {t('billing.history.refresh')}
            </Button>
          ) : succeeded ? (
            <Button type="button" variant="outline" size="sm" className="mt-4" onClick={onRefresh}>
              {t('billing.history.refresh')} <ArrowRight className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
