import { useEffect, useState, type FormEvent } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Bank,
  Check,
  CheckCircle as CheckCircleIcon,
  Clock,
  Copy,
  CreditCard,
  DeviceMobile,
  Info,
  LockKey,
  Receipt,
  UploadSimple,
  WarningCircle,
  XCircle,
  type Icon as PhosphorIcon,
} from '@phosphor-icons/react'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import PaymentJourney from '@/components/finance/PaymentJourney'
import PaymentMethodCard from '@/components/finance/PaymentMethodCard'
import PaymentReceiptActions from '@/components/finance/PaymentReceiptActions'
import PaymentReceiptDocument, { type PaymentReceiptDetails } from '@/components/finance/PaymentReceiptDocument'
import Input from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import PageHeader from '@/components/ui/PageHeader'
import Select from '@/components/ui/Select'
import Textarea from '@/components/ui/Textarea'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import { subscriptionPlans } from '@/data/subscriptionPlans'
import { fetchSchoolSubscription, type SchoolSubscription } from '@/services/subscriptionService'
import {
  createDemoAttemptId,
  loadDemoBillingState,
  recordDemoPayment,
  resolveDemoBankTransfer,
  type DemoBillingState,
  type DemoBillingInterval,
  type DemoPaymentMethod,
  type DemoPaymentOutcome,
  type DemoTransaction,
  type FixedPlanCode,
} from '@/services/subscriptionDemoService'
import { isValidEmail, isValidPhone, minLength, type FieldErrors } from '@/utils/validators'
import { schoolLogoUrl } from '@/services/storageService'

type BillingStep = 'plans' | 'review' | 'payment-method' | 'checkout' | 'result' | 'receipt'

interface EnterpriseForm {
  schoolName: string
  contactPerson: string
  email: string
  phone: string
  country: string
  studentRange: string
  campuses: string
  requirements: string
}

const paymentMethods: Array<{
  id: DemoPaymentMethod
  icon: PhosphorIcon
  titleKey: string
  descriptionKey: string
}> = [
  { id: 'card', icon: CreditCard, titleKey: 'billing.method.card', descriptionKey: 'billing.method.cardDescription' },
  { id: 'evc-plus', icon: DeviceMobile, titleKey: 'billing.method.evcPlus', descriptionKey: 'billing.method.evcPlusDescription' },
  { id: 'edahab', icon: DeviceMobile, titleKey: 'billing.method.edahab', descriptionKey: 'billing.method.edahabDescription' },
  { id: 'bank-transfer', icon: Bank, titleKey: 'billing.method.bankTransfer', descriptionKey: 'billing.method.bankTransferDescription' },
]

function formatUSD(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function formatUSDCompact(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(amount)
}

function intervalAmount(plan: (typeof subscriptionPlans)[number], interval: DemoBillingInterval) {
  if (plan.monthlyPrice === null) return 0
  return interval === 'annual' ? plan.annualPrice : plan.monthlyPrice
}

function intervalExpiry(start: string, interval: DemoBillingInterval) {
  return new Date(Date.parse(start) + (interval === 'annual' ? 365 : 30) * 24 * 60 * 60 * 1000).toISOString()
}

function isValidSomaliMobileNumber(value: string) {
  const compact = value.trim().replace(/[\s()-]/g, '')
  return /^\+252\d{8,9}$/.test(compact)
}

function formatDemoDate(value: string, lang: string) {
  const locale = lang === 'ar' ? 'ar' : lang === 'so' ? 'so-SO' : 'en-US'
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function paymentMethodLabel(method: DemoPaymentMethod, t: (key: string) => string) {
  const option = paymentMethods.find((candidate) => candidate.id === method)
  if (option) return t(option.titleKey)
  const keyByMethod: Partial<Record<DemoPaymentMethod, string>> = {
    waafi: 'fees.checkout.method.waafi',
    zaad: 'fees.checkout.method.zaad',
    sahal: 'fees.checkout.method.sahal',
    visa: 'fees.checkout.cardVisa',
    mastercard: 'fees.checkout.cardMastercard',
  }
  const key = keyByMethod[method]
  return key ? t(key) : method
}

export default function SubscriptionBilling() {
  const { t, lang } = useLanguage()
  const { school, profile } = useAuth()
  const demoAvailable = typeof window !== 'undefined'
  const [step, setStep] = useState<BillingStep>('plans')
  const [billingInterval, setBillingInterval] = useState<DemoBillingInterval>('monthly')
  const [selectedPlanCode, setSelectedPlanCode] = useState<FixedPlanCode | null>(null)
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<DemoPaymentMethod | null>(null)
  const [paymentMethodError, setPaymentMethodError] = useState('')
  const [attemptId, setAttemptId] = useState<string | null>(null)
  const [demoCheckoutReady, setDemoCheckoutReady] = useState(false)
  const [walletWaiting, setWalletWaiting] = useState(false)
  const [demoState, setDemoState] = useState<DemoBillingState | null>(null)
  const [demoError, setDemoError] = useState<string | null>(null)
  const [lastTransaction, setLastTransaction] = useState<DemoTransaction | null>(null)
  const [mobilePhone, setMobilePhone] = useState('')
  const [mobileMoneyError, setMobileMoneyError] = useState('')
  const [transferReference, setTransferReference] = useState('')
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [liveSubscription, setLiveSubscription] = useState<SchoolSubscription | null>(null)
  const [liveSubscriptionError, setLiveSubscriptionError] = useState(false)
  const [liveSubscriptionLoading, setLiveSubscriptionLoading] = useState(true)
  const [enterpriseOpen, setEnterpriseOpen] = useState(false)
  const [form, setForm] = useState<EnterpriseForm>({
    schoolName: school?.name ?? '',
    contactPerson: profile?.full_name ?? '',
    email: profile?.email ?? '',
    phone: '',
    country: '',
    studentRange: '',
    campuses: '',
    requirements: '',
  })
  const [errors, setErrors] = useState<FieldErrors>({})
  const [submissionUnavailable, setSubmissionUnavailable] = useState(false)
  const selectedPlan = selectedPlanCode
    ? subscriptionPlans.find((plan) => plan.code === selectedPlanCode)
    : undefined
  const demoSubscriptionPlan = demoState?.subscription
    ? subscriptionPlans.find((plan) => plan.code === demoState.subscription?.planCode)
    : undefined
  const demoSubscriptionTransaction = demoState?.subscription
    ? demoState.transactions.find((transaction) => transaction.id === demoState.subscription?.transactionId)
    : undefined

  useEffect(() => {
    if (!school?.id) {
      setLiveSubscription(null)
      setLiveSubscriptionError(false)
      setLiveSubscriptionLoading(false)
      return
    }
    let current = true
    setLiveSubscription(null)
    if (demoAvailable) {
      try {
        setDemoState(loadDemoBillingState(school.id))
        setDemoError(null)
      } catch (error) {
        setDemoError(error instanceof Error ? error.message : 'Unable to load browser demo data.')
      }
    }
    setLiveSubscriptionLoading(true)
    setLiveSubscriptionError(false)
    fetchSchoolSubscription(school.id)
      .then((subscription) => {
        if (current) setLiveSubscription(subscription)
      })
      .catch(() => {
        if (current) setLiveSubscriptionError(true)
      })
      .finally(() => {
        if (current) setLiveSubscriptionLoading(false)
      })
    return () => {
      current = false
    }
  }, [school?.id, demoAvailable])

  const startPlanReview = (planCode: FixedPlanCode) => {
    setSelectedPlanCode(planCode)
    setSelectedPaymentMethod(null)
    setPaymentMethodError('')
    setAttemptId(null)
    setDemoCheckoutReady(false)
    setWalletWaiting(false)
    setLastTransaction(null)
    setDemoError(null)
    setMobilePhone('')
    setMobileMoneyError('')
    setTransferReference('')
    setProofFile(null)
    setStep('review')
  }

  const choosePaymentMethod = (method: DemoPaymentMethod) => {
    setSelectedPaymentMethod(method)
    setPaymentMethodError('')
    setMobileMoneyError('')
    setDemoCheckoutReady(false)
    setWalletWaiting(false)
  }

  const continueToMethodCheckout = () => {
    if (!selectedPaymentMethod) {
      setPaymentMethodError(t('billing.method.chooseBeforeContinue'))
      return
    }
    if (!selectedPlanCode || !demoAvailable) return
    try {
      if (!attemptId) setAttemptId(createDemoAttemptId())
      setDemoError(null)
      setMobileMoneyError('')
      setDemoCheckoutReady(false)
      setWalletWaiting(false)
      setStep('checkout')
    } catch (error) {
      setDemoError(error instanceof Error ? error.message : t('billing.demo.storageUnavailable'))
    }
  }

  const proceedToDemoCheckout = () => {
    if (selectedPaymentMethod === 'evc-plus' || selectedPaymentMethod === 'edahab') {
      if (!isValidSomaliMobileNumber(mobilePhone)) {
        setMobileMoneyError(t('billing.method.phoneError'))
        return
      }
    }
    if (selectedPaymentMethod === 'bank-transfer' && !minLength(transferReference, 3)) {
      setMobileMoneyError(t('billing.bank.referenceError'))
      return
    }
    setMobileMoneyError('')
    setDemoCheckoutReady(true)
    if (selectedPaymentMethod === 'evc-plus' || selectedPaymentMethod === 'edahab') {
      setWalletWaiting(true)
    }
  }

  const returnToPlans = () => {
    setStep('plans')
    setSelectedPlanCode(null)
    setSelectedPaymentMethod(null)
    setPaymentMethodError('')
    setAttemptId(null)
    setDemoCheckoutReady(false)
    setWalletWaiting(false)
    setLastTransaction(null)
    setDemoError(null)
    setMobilePhone('')
    setMobileMoneyError('')
    setTransferReference('')
    setProofFile(null)
  }

  const recordPaymentOutcome = (outcome: DemoPaymentOutcome) => {
    if (!school || !selectedPlanCode || !selectedPaymentMethod || !attemptId || !demoAvailable) return
    if (outcome !== 'cancelled' &&
      (selectedPaymentMethod === 'evc-plus' || selectedPaymentMethod === 'edahab') &&
      !isValidSomaliMobileNumber(mobilePhone)) {
      setMobileMoneyError(t('billing.method.phoneError'))
      return
    }
    if (selectedPaymentMethod === 'bank-transfer' && outcome === 'pending' &&
      !minLength(transferReference, 3)) {
      setMobileMoneyError(t('billing.bank.referenceError'))
      return
    }
    if (selectedPaymentMethod === 'bank-transfer' && outcome !== 'pending' && outcome !== 'cancelled') {
      setMobileMoneyError(t('billing.bank.pendingOnly'))
      return
    }
    try {
      const nextState = recordDemoPayment(
        school.id,
        attemptId,
        selectedPlanCode,
        billingInterval,
        outcome,
        selectedPaymentMethod,
        selectedPaymentMethod === 'bank-transfer' ? transferReference.trim() : undefined,
      )
      const transaction = nextState.transactions.find((entry) => entry.attemptId === attemptId)
      if (!transaction) throw new Error(t('billing.demo.storageUnavailable'))
      setDemoState(nextState)
      setLastTransaction(transaction)
      setDemoError(null)
      setStep('result')
    } catch (error) {
      setDemoError(error instanceof Error ? error.message : t('billing.demo.storageUnavailable'))
    }
  }

  const resolveBankTransfer = (outcome: 'succeeded' | 'rejected') => {
    if (!school || !lastTransaction || !demoAvailable) return
    try {
      const nextState = resolveDemoBankTransfer(school.id, lastTransaction.id, outcome)
      const transaction = nextState.transactions.find((entry) => entry.id === lastTransaction.id)
      if (!transaction) throw new Error(t('billing.demo.storageUnavailable'))
      setDemoState(nextState)
      setLastTransaction(transaction)
      setDemoError(null)
    } catch (error) {
      setDemoError(error instanceof Error ? error.message : t('billing.demo.storageUnavailable'))
    }
  }

  const cancelCheckout = () => {
    if (attemptId && selectedPlanCode && selectedPaymentMethod && demoAvailable) {
      recordPaymentOutcome('cancelled')
      return
    }
    returnToPlans()
  }

  const openHistoryTransaction = (transaction: DemoTransaction) => {
    const plan = subscriptionPlans.find((item) => item.code === transaction.planCode)
    setSelectedPlanCode(transaction.planCode)
    setSelectedPaymentMethod(transaction.paymentMethod ?? 'card')
    setBillingInterval(transaction.billingInterval)
    setLastTransaction(transaction)
    setStep('result')
    setDemoError(null)
    if (!plan) setDemoError(t('billing.demo.storageUnavailable'))
  }

  const retryPayment = () => {
    if (!demoAvailable) return
    try {
      setAttemptId(createDemoAttemptId())
      setDemoCheckoutReady(false)
      setWalletWaiting(false)
      setLastTransaction(null)
      setDemoError(null)
      setMobileMoneyError('')
      setTransferReference('')
      setProofFile(null)
      setStep('checkout')
    } catch (error) {
      setDemoError(error instanceof Error ? error.message : t('billing.demo.storageUnavailable'))
    }
  }

  const stepIndex = step === 'review' ? 1 : step === 'payment-method' || step === 'checkout' ? 2 : 3

  const updateField = <K extends keyof EnterpriseForm>(key: K, value: EnterpriseForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: undefined }))
    setSubmissionUnavailable(false)
  }

  const submitEnquiry = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextErrors: FieldErrors = {}
    if (!minLength(form.schoolName, 2)) nextErrors.schoolName = t('billing.enterpriseForm.error.schoolName')
    if (!minLength(form.contactPerson, 2)) nextErrors.contactPerson = t('billing.enterpriseForm.error.contactPerson')
    if (!isValidEmail(form.email)) nextErrors.email = t('billing.enterpriseForm.error.email')
    if (form.phone.trim() && !isValidPhone(form.phone)) nextErrors.phone = t('billing.enterpriseForm.error.phone')
    if (!minLength(form.country, 2)) nextErrors.country = t('billing.enterpriseForm.error.country')
    if (form.campuses && (!Number.isInteger(Number(form.campuses)) || Number(form.campuses) < 1)) {
      nextErrors.campuses = t('billing.enterpriseForm.error.campuses')
    }
    setErrors(nextErrors)
    setSubmissionUnavailable(false)

    if (Object.keys(nextErrors).length === 0) {
      setSubmissionUnavailable(true)
    }
  }

  const closeEnterpriseForm = () => {
    setEnterpriseOpen(false)
    setErrors({})
    setSubmissionUnavailable(false)
  }

  return (
    <div>
      <PageHeader title={t('billing.title')} description={t('billing.plans.subtitle')} />

      {step === 'plans' ? (
        <>
          <section aria-labelledby="billing-current-heading" className="mb-6 grid gap-4 lg:grid-cols-2">
            <article className="card min-w-0 p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-graphite">{t('billing.current')}</p>
                  <h2 id="billing-current-heading" className="mt-1 text-lg font-semibold text-ink dark:text-white">
                    {liveSubscriptionLoading
                      ? t('billing.current.loading')
                      : liveSubscription
                        ? liveSubscription.plan?.name ?? t('billing.current.unknownPlan')
                        : t('billing.none.title')}
                  </h2>
                </div>
                {liveSubscription && (
                  <Badge tone={liveSubscription.status === 'active' ? 'success' : 'neutral'}>
                    {t(`billing.status.${liveSubscription.status}`)}
                  </Badge>
                )}
              </div>
              {liveSubscriptionError ? (
                <p className="mt-3 text-sm text-red-700 dark:text-red-300" role="alert">{t('billing.current.loadError')}</p>
              ) : liveSubscription ? (
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <ReceiptDetail label={t('billing.current.started')} value={formatDemoDate(liveSubscription.current_period_start, lang)} />
                  {liveSubscription.current_period_end && (
                    <ReceiptDetail label={t('billing.current.renews')} value={formatDemoDate(liveSubscription.current_period_end, lang)} />
                  )}
                </dl>
              ) : !liveSubscriptionLoading ? (
                <p className="mt-2 text-sm leading-relaxed text-graphite">{t('billing.none.description')}</p>
              ) : null}
              <Button
                type="button"
                variant="outline"
                className="mt-4"
                onClick={() => document.getElementById('billing-available-plans')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              >
                {t('billing.current.manage')} <ArrowRight className="h-4 w-4" />
              </Button>
            </article>

            {demoAvailable && (
              <article className="card min-w-0 border-dashed border-brand/40 p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-brand">{t('billing.demo.title')}</p>
                    <h2 className="mt-1 text-lg font-semibold text-ink dark:text-white">
                      {demoState?.subscription
                        ? `${subscriptionPlans.find((plan) => plan.code === demoState.subscription?.planCode)?.name ?? ''} · ${t('billing.demo.active')}`
                        : t('billing.demo.subscription')}
                    </h2>
                  </div>
                  <Badge tone="brand">{t('billing.demo.badge')}</Badge>
                </div>
                {demoState?.subscription ? (
                  <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                    <ReceiptDetail
                      label={t('billing.order.frequency')}
                      value={t(`billing.interval.${demoState.subscription.billingInterval}`)}
                    />
                    <ReceiptDetail
                      label={t('billing.order.amountDueToday')}
                      value={formatUSD(demoSubscriptionTransaction?.amount ?? intervalAmount(
                        demoSubscriptionPlan ?? subscriptionPlans[0],
                        demoState.subscription.billingInterval,
                      ))}
                    />
                    <ReceiptDetail label={t('billing.demo.started')} value={formatDemoDate(demoState.subscription.startedAt, lang)} />
                    <ReceiptDetail label={t('billing.current.renews')} value={formatDemoDate(demoState.subscription.expiresAt, lang)} />
                  </dl>
                ) : (
                  <p className="mt-2 text-sm leading-relaxed text-graphite">{t('billing.demo.none')}</p>
                )}
                <p className="mt-3 text-xs leading-relaxed text-graphite">{t('billing.demo.notReal')}</p>
                {demoError && <p className="mt-3 break-words text-sm text-red-700 dark:text-red-300" role="alert">{demoError}</p>}
              </article>
            )}
          </section>

          {demoAvailable && demoState && demoState.transactions.length > 0 && (
            <section aria-labelledby="billing-history-heading" className="card mb-6 min-w-0 p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 id="billing-history-heading" className="text-lg font-semibold text-ink dark:text-white">{t('billing.history.title')}</h2>
                  <p className="mt-1 text-sm text-graphite">{t('billing.history.demoOnly')}</p>
                </div>
                <Badge tone="brand">{t('billing.demo.badge')}</Badge>
              </div>
              <ul className="mt-4 divide-y divide-ink/10 dark:divide-white/10">
                {demoState.transactions.slice(0, 10).map((transaction) => (
                  <li key={transaction.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="break-all font-mono text-sm font-medium text-ink dark:text-white">{transaction.reference}</p>
                      <p className="mt-1 text-xs text-graphite">
                        {subscriptionPlans.find((plan) => plan.code === transaction.planCode)?.name} · {paymentMethodLabel(transaction.paymentMethod ?? 'card', t)} · {formatDemoDate(transaction.createdAt, lang)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                      <span className="text-sm font-semibold text-ink dark:text-white">{formatUSD(transaction.amount)}</span>
                      <Badge tone={transaction.outcome === 'succeeded' ? 'success' : transaction.outcome === 'pending' ? 'warning' : 'neutral'}>
                        {t(`billing.history.status.${transaction.outcome}`)}
                      </Badge>
                      <Button type="button" variant="ghost" size="sm" onClick={() => openHistoryTransaction(transaction)}>
                        {transaction.outcome === 'pending' ? t('billing.history.review') : t('billing.history.view')}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-ink dark:text-white">{t('billing.plans.subtitle')}</h2>
              <p className="mt-1 text-sm text-graphite">{t('billing.interval.annualSavings')}</p>
            </div>
            <div role="group" aria-label={t('billing.interval.label')} className="inline-flex w-fit rounded-lg border border-ink/10 bg-white p-1 dark:border-white/10 dark:bg-[#202328]">
              {(['monthly', 'annual'] as const).map((interval) => (
                <button
                  key={interval}
                  type="button"
                  aria-pressed={billingInterval === interval}
                  onClick={() => setBillingInterval(interval)}
                  className={`rounded-md px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                    billingInterval === interval
                      ? 'bg-brand text-white'
                      : 'text-graphite hover:text-ink dark:hover:text-white'
                  }`}
                >
                  {t(`billing.interval.${interval}`)}
                </button>
              ))}
            </div>
          </div>

          <section id="billing-available-plans" aria-label={t('billing.available')} className="scroll-mt-6 grid min-w-0 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {subscriptionPlans.map((plan) => {
          return (
            <article
              key={plan.code}
              className={`card flex h-full min-w-0 flex-col p-5 sm:p-6 ${
                plan.highlight
                  ? 'border-2 border-brand/50 bg-white shadow-soft dark:bg-[#161618]'
                  : ''
              }`}
            >
              <div className="min-h-[3.25rem]">
                {plan.highlight && (
                  <Badge tone="brand">{t('pricing.mostPopular')}</Badge>
                )}
              </div>

              <h2 className="text-xl font-semibold text-ink dark:text-white">{plan.name}</h2>
              <p className="mt-2 min-h-12 text-sm leading-relaxed text-graphite">
                {t(`${plan.prefix}.tagline`)}
              </p>

              <div className="mt-5 min-h-10">
                {plan.monthlyPrice === null ? (
                  <span className="text-3xl font-semibold tracking-tight text-ink dark:text-white">
                    {t('pricing.custom')}
                  </span>
                ) : (
                  <>
                    <span className="text-3xl font-semibold tracking-tight text-ink dark:text-white">
                      {formatUSDCompact(intervalAmount(plan, billingInterval))}
                    </span>
                    <span className="ms-1 text-sm text-graphite">{t(`billing.interval.priceSuffix.${billingInterval}`)}</span>
                    {billingInterval === 'annual' && plan.annualPrice !== null && (
                      <div className="mt-2 space-y-1 text-xs text-graphite">
                        <p>
                          {formatUSDCompact(plan.annualPrice / 12)} {t('pricing.billing.monthlyEquivalent')} · {t('pricing.billing.billedAnnually')}
                        </p>
                        <p className="font-medium text-brand">
                          {t('pricing.billing.saveTwoMonths')} · {t('pricing.billing.save')} {formatUSDCompact(plan.monthlyPrice * 12 - plan.annualPrice)} {t('pricing.billing.perYear')}
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>

              <ul className="mt-6 flex-1 space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3 text-sm leading-relaxed text-ink dark:text-white">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                    <span>{t(`${plan.prefix}.${feature}`)}</span>
                  </li>
                ))}
              </ul>

              {plan.monthlyPrice === null ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-7 w-full justify-center"
                    onClick={() => setEnterpriseOpen(true)}
                  >
                    {t('billing.enterpriseForm.contactUs')}
                  </Button>
                ) : (plan.code === 'starter' || plan.code === 'growth') ? (
                  <PaymentJourney
                    kind="subscription"
                    schoolId={school?.id ?? 'school'}
                    schoolName={school?.name ?? 'Nom Cloud School'}
                    schoolLogoUrl={schoolLogoUrl(school?.logo_path ?? null)}
                    schoolAddress={school?.address}
                    schoolPhone={school?.phone}
                    schoolEmail={school?.email}
                    subjectName={school?.name ?? 'Nom Cloud School'}
                    payerName={profile?.full_name ?? profile?.email ?? ''}
                    description={`${plan.name} plan`}
                    amount={intervalAmount(plan, billingInterval)}
                    originalAmount={intervalAmount(plan, billingInterval)}
                    currency="USD"
                    billingPeriod={t(`billing.interval.${billingInterval}`)}
                    dueDate={liveSubscription?.current_period_end ?? demoState?.subscription?.expiresAt}
                    storageId={`${plan.code}-${billingInterval}`}
                    onResult={(result) => {
                      if (!school?.id) return
                      try {
                        const demoMethod: DemoPaymentMethod = result.method === 'ussd' ? 'card' : result.method
                        const attemptId = createDemoAttemptId()
                        const nextState = recordDemoPayment(
                          school.id,
                          attemptId,
                          plan.code,
                          billingInterval,
                          result.outcome === 'success'
                            ? 'succeeded'
                            : result.outcome === 'failed'
                              ? 'rejected'
                              : result.outcome,
                          demoMethod,
                        )
                        const transaction = nextState.transactions.find((entry) => entry.attemptId === attemptId)
                        if (!transaction) throw new Error(t('billing.demo.storageUnavailable'))
                        setDemoState(nextState)
                        setLastTransaction(transaction)
                        setDemoError(null)
                      } catch (paymentError) {
                        setDemoError(paymentError instanceof Error ? paymentError.message : t('billing.demo.storageUnavailable'))
                      }
                    }}
                  >
                    {(openCheckout, pending, paid) => (
                      <Button
                        type="button"
                        variant={plan.highlight ? 'accent' : 'outline'}
                        className="mt-7 w-full justify-center"
                        disabled={!demoAvailable || !school?.id}
                        onClick={openCheckout}
                      >
                        {paid
                          ? 'View demo receipt'
                          : pending
                            ? 'Payment processing'
                            : liveSubscription?.plan?.code === plan.code || demoState?.subscription?.planCode === plan.code
                              ? 'Pay / Renew Subscription'
                              : t(`billing.plans.choose.${plan.code}`)}
                      </Button>
                    )}
                  </PaymentJourney>
              ) : null}
            </article>
          )
            })}
          </section>

          <p className="mt-4 text-xs text-graphite" role="note">
            {demoAvailable ? t('billing.demo.prototypeNotice') : t('billing.demo.production')}
          </p>
        </>
      ) : (
        <section aria-labelledby="billing-flow-heading" className="mx-auto mt-2 max-w-6xl">
          <ol aria-label={t('billing.progress.label')} className="mb-7 grid grid-cols-4">
            {[
              t('billing.progress.plan'),
              t('billing.progress.review'),
              t('billing.progress.paymentMethod'),
              t('billing.progress.result'),
            ].map((label, index) => {
              const complete = index < stepIndex
              const current = index === stepIndex
              return (
                <li key={label} aria-current={current ? 'step' : undefined} className="relative text-center">
                  {index < 3 && (
                    <span
                      aria-hidden="true"
                      className={`absolute start-1/2 top-4 h-px w-full ${index < stepIndex ? 'bg-brand' : 'bg-ink/10 dark:bg-white/15'}`}
                    />
                  )}
                  <span className={`relative mx-auto flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold ${
                    complete || current
                      ? 'border-brand bg-brand text-white'
                      : 'border-ink/15 bg-white text-graphite dark:border-white/20 dark:bg-[#202328]'
                  }`}>
                    {complete ? <CheckCircleIcon className="h-4 w-4" aria-hidden="true" /> : index + 1}
                  </span>
                  <span className={`relative mt-2 block text-[0.7rem] sm:text-xs ${current ? 'font-semibold text-ink dark:text-white' : 'text-graphite'}`}>
                    {label}
                  </span>
                </li>
              )
            })}
          </ol>

          {step === 'receipt' && lastTransaction?.outcome === 'succeeded' ? (
            <DemoReceipt
              transaction={lastTransaction}
              schoolName={school?.name ?? ''}
              schoolLogoUrl={schoolLogoUrl(school?.logo_path ?? null)}
              schoolAddress={school?.address}
              schoolPhone={school?.phone}
              schoolEmail={school?.email}
              administratorName={profile?.full_name ?? profile?.email ?? ''}
              planName={selectedPlan?.name ?? lastTransaction.planCode}
              paymentMethodName={paymentMethodLabel(lastTransaction.paymentMethod ?? 'card', t)}
              t={t}
              onBack={() => setStep('result')}
              onReturn={returnToPlans}
            />
          ) : (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,0.7fr)]">
              <div className="card min-w-0 p-5 sm:p-7">
                {step === 'review' && selectedPlan && selectedPlan.monthlyPrice !== null && (
                  <>
                    <p className="text-xs font-semibold uppercase tracking-wide text-brand">{t('billing.flow.review.kicker')}</p>
                    <h2 id="billing-flow-heading" className="mt-1 text-2xl font-semibold tracking-tight text-ink dark:text-white">
                      {t('billing.flow.review.title')}
                    </h2>
                    <p className="mt-2 max-w-xl text-sm text-graphite">{t('billing.flow.review.description')}</p>
                    <div className="mt-6">
                      <p className="text-xs font-semibold uppercase tracking-wide text-graphite">{t('billing.order.plan')}</p>
                      <h3 className="mt-1 text-xl font-semibold text-ink dark:text-white">{selectedPlan.name}</h3>
                      <p className="mt-2 max-w-xl text-sm leading-relaxed text-graphite">{t(`${selectedPlan.prefix}.tagline`)}</p>
                      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                        {selectedPlan.features.slice(0, 4).map((feature) => (
                          <li key={feature} className="flex items-start gap-2 text-sm text-ink dark:text-white">
                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                            <span>{t(`${selectedPlan.prefix}.${feature}`)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <p className="mt-4 text-sm leading-relaxed text-graphite">{t(`billing.order.terms.${billingInterval}`)}</p>
                    <p className="mt-3 text-xs text-graphite">{t('billing.checkout.noCharge')}</p>
                    <div className="mt-6 flex flex-wrap justify-between gap-3">
                      <Button type="button" variant="ghost" onClick={returnToPlans}>
                        <ArrowLeft className="h-4 w-4" /> {t('billing.checkout.backPlans')}
                      </Button>
                      <Button type="button" variant="primary" size="lg" onClick={() => setStep('payment-method')}>
                        {t('billing.checkout.continuePayment')} <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </>
                )}

                {step === 'payment-method' && (
                  <>
                    <p className="text-xs font-semibold uppercase tracking-wide text-brand">{t('billing.flow.paymentMethod.kicker')}</p>
                    <h2 id="billing-flow-heading" className="mt-1 text-2xl font-semibold tracking-tight text-ink dark:text-white">
                      {t('billing.flow.paymentMethod.title')}
                    </h2>
                    <p className="mt-2 max-w-xl text-sm text-graphite">{t('billing.flow.paymentMethod.description')}</p>
                    <div role="group" aria-label={t('billing.flow.paymentMethod.title')} className="mt-6 grid gap-3 sm:grid-cols-2">
                      {paymentMethods.map(({ id, icon, titleKey, descriptionKey }) => (
                        <PaymentMethodCard
                          key={id}
                          icon={icon}
                          label={t(titleKey)}
                          description={t(descriptionKey)}
                          selected={selectedPaymentMethod === id}
                          selectionRole="button"
                          onSelect={() => choosePaymentMethod(id)}
                        />
                      ))}
                    </div>
                    {!selectedPaymentMethod && (
                      <p className="mt-3 text-sm text-graphite">{t('billing.method.chooseBeforeContinue')}</p>
                    )}
                    {paymentMethodError && (
                      <p className="mt-3 text-sm text-red-600 dark:text-red-300" role="alert">{paymentMethodError}</p>
                    )}
                    <div className="mt-6 flex flex-wrap justify-between gap-3">
                      <Button type="button" variant="ghost" onClick={() => setStep('review')}>
                        <ArrowLeft className="h-4 w-4" /> {t('billing.back')}
                      </Button>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="ghost" onClick={returnToPlans}>{t('billing.checkout.cancel')}</Button>
                        <Button type="button" variant="primary" size="lg" disabled={!demoAvailable} onClick={continueToMethodCheckout}>
                          {t('billing.checkout.continue')} <ArrowRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </>
                )}

                {step === 'checkout' && selectedPaymentMethod && (
                  <CheckoutMethodPanel
                    method={selectedPaymentMethod}
                    phone={mobilePhone}
                    transferReference={transferReference}
                    proofFile={proofFile}
                    amount={selectedPlan?.monthlyPrice === null || selectedPlan?.monthlyPrice === undefined
                      ? 0 : intervalAmount(selectedPlan, billingInterval)}
                    interval={billingInterval}
                    attemptId={attemptId ?? ''}
                    error={mobileMoneyError}
                    demoError={demoError}
                    demoCheckoutReady={demoCheckoutReady}
                    walletWaiting={walletWaiting}
                    t={t}
                    onPhoneChange={(value) => {
                      setMobilePhone(value)
                      setMobileMoneyError('')
                    }}
                    onTransferReferenceChange={(value) => {
                      setTransferReference(value)
                      setMobileMoneyError('')
                    }}
                    onProofChange={setProofFile}
                    onBack={() => {
                      setDemoCheckoutReady(false)
                      setWalletWaiting(false)
                      setMobileMoneyError('')
                      setStep('payment-method')
                    }}
                    onCancel={cancelCheckout}
                    onProceed={proceedToDemoCheckout}
                    onOutcome={recordPaymentOutcome}
                  />
                )}

                {step === 'result' && lastTransaction && selectedPlan && (
                  <PaymentResult
                    transaction={lastTransaction}
                    planName={selectedPlan.name}
                    paymentMethodName={paymentMethodLabel(lastTransaction.paymentMethod ?? selectedPaymentMethod ?? 'card', t)}
                    lang={lang}
                    t={t}
                    error={demoError}
                    onReceipt={() => setStep('receipt')}
                    onRetry={retryPayment}
                    onReturn={returnToPlans}
                    onResolve={resolveBankTransfer}
                  />
                )}
              </div>

              {selectedPlan && selectedPlan.monthlyPrice !== null && (
                <OrderSummary
                  schoolName={school?.name ?? '—'}
                  administratorName={profile?.full_name ?? profile?.email ?? '—'}
                  plan={selectedPlan}
                  interval={billingInterval}
                  t={t}
                />
              )}
            </div>
          )}
        </section>
      )}

      <Modal
        open={enterpriseOpen}
        onClose={closeEnterpriseForm}
        title={t('billing.enterpriseForm.title')}
        description={t('billing.enterpriseForm.description')}
        size="lg"
        footer={
          <>
            <Button type="button" variant="ghost" onClick={closeEnterpriseForm}>
              {t('billing.enterpriseForm.cancel')}
            </Button>
            <Button type="submit" form="enterprise-enquiry-form">
              {t('billing.enterpriseForm.submit')}
            </Button>
          </>
        }
      >
        <form id="enterprise-enquiry-form" onSubmit={submitEnquiry} noValidate className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label={t('billing.enterpriseForm.schoolName')}
              required
              autoComplete="organization"
              value={form.schoolName}
              onChange={(event) => updateField('schoolName', event.target.value)}
              error={errors.schoolName}
              placeholder={t('billing.enterpriseForm.schoolPlaceholder')}
            />
            <Input
              label={t('billing.enterpriseForm.contactPerson')}
              required
              autoComplete="name"
              value={form.contactPerson}
              onChange={(event) => updateField('contactPerson', event.target.value)}
              error={errors.contactPerson}
              placeholder={t('billing.enterpriseForm.contactPlaceholder')}
            />
            <Input
              label={t('billing.enterpriseForm.email')}
              type="email"
              required
              autoComplete="email"
              value={form.email}
              onChange={(event) => updateField('email', event.target.value)}
              error={errors.email}
              placeholder={t('billing.enterpriseForm.emailPlaceholder')}
            />
            <Input
              label={t('billing.enterpriseForm.phone')}
              type="tel"
              autoComplete="tel"
              value={form.phone}
              onChange={(event) => updateField('phone', event.target.value)}
              error={errors.phone}
              placeholder={t('billing.enterpriseForm.phonePlaceholder')}
            />
            <Input
              label={t('billing.enterpriseForm.country')}
              required
              autoComplete="country-name"
              value={form.country}
              onChange={(event) => updateField('country', event.target.value)}
              error={errors.country}
              placeholder={t('billing.enterpriseForm.countryPlaceholder')}
            />
            <Select
              label={t('billing.enterpriseForm.studentRange')}
              value={form.studentRange}
              onChange={(event) => updateField('studentRange', event.target.value)}
            >
              <option value="">{t('billing.enterpriseForm.selectRange')}</option>
              <option value="under-300">{t('billing.enterpriseForm.range.under300')}</option>
              <option value="300-1200">{t('billing.enterpriseForm.range.300To1200')}</option>
              <option value="1201-3000">{t('billing.enterpriseForm.range.1201To3000')}</option>
              <option value="over-3000">{t('billing.enterpriseForm.range.over3000')}</option>
            </Select>
            <Input
              label={t('billing.enterpriseForm.campuses')}
              type="number"
              min="1"
              step="1"
              value={form.campuses}
              onChange={(event) => updateField('campuses', event.target.value)}
              error={errors.campuses}
              placeholder={t('billing.enterpriseForm.campusesPlaceholder')}
            />
          </div>

          <Textarea
            label={t('billing.enterpriseForm.requirements')}
            rows={4}
            value={form.requirements}
            onChange={(event) => updateField('requirements', event.target.value)}
            placeholder={t('billing.enterpriseForm.requirementsPlaceholder')}
          />

          {submissionUnavailable && (
            <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100" role="alert">
              {t('billing.enterpriseForm.backendUnavailable')}
            </p>
          )}
        </form>
      </Modal>
    </div>
  )
}

function SummaryRow({
  label,
  value,
  prominent = false,
}: {
  label: string
  value: string
  prominent?: boolean
}) {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 px-1 py-3 ${prominent ? 'font-semibold' : ''}`}>
      <dt className={`min-w-0 ${prominent ? 'text-ink dark:text-white' : 'text-graphite'}`}>{label}</dt>
      <dd className="min-w-0 break-all text-end text-ink dark:text-white">{value}</dd>
    </div>
  )
}

function OrderSummary({
  schoolName,
  administratorName,
  plan,
  interval,
  t,
}: {
  schoolName: string
  administratorName: string
  plan: (typeof subscriptionPlans)[number]
  interval: DemoBillingInterval
  t: (key: string) => string
}) {
  if (plan.monthlyPrice === null) return null
  const annualDiscount = plan.monthlyPrice * 12 - plan.annualPrice
  return (
    <aside aria-label={t('billing.order.summary')} className="h-fit rounded-xl border border-ink/10 bg-white p-5 shadow-soft dark:border-white/10 dark:bg-[#202328] sm:p-6">
      <h2 className="text-base font-semibold text-ink dark:text-white">{t('billing.order.summary')}</h2>
      <dl className="mt-3 divide-y divide-ink/5 dark:divide-white/10">
        <SummaryRow label={t('billing.order.school')} value={schoolName} />
        <SummaryRow label={t('billing.order.administrator')} value={administratorName} />
        <SummaryRow label={t('billing.order.plan')} value={plan.name} />
        <SummaryRow label={t('billing.order.frequency')} value={t(`billing.interval.${interval}`)} />
        <SummaryRow
          label={t('billing.order.subtotal')}
          value={formatUSD(interval === 'annual' ? plan.monthlyPrice * 12 : plan.monthlyPrice)}
        />
        <SummaryRow
          label={t('billing.order.discount')}
          value={interval === 'annual' ? `−${formatUSD(annualDiscount)}` : formatUSD(0)}
        />
        <SummaryRow label={t('billing.order.amountDueToday')} value={formatUSD(intervalAmount(plan, interval))} prominent />
      </dl>
    </aside>
  )
}

function CheckoutMethodPanel({
  method,
  phone,
  transferReference,
  proofFile,
  amount,
  interval,
  attemptId,
  error,
  demoError,
  demoCheckoutReady,
  walletWaiting,
  t,
  onPhoneChange,
  onTransferReferenceChange,
  onProofChange,
  onBack,
  onCancel,
  onProceed,
  onOutcome,
}: {
  method: DemoPaymentMethod
  phone: string
  transferReference: string
  proofFile: File | null
  amount: number
  interval: DemoBillingInterval
  attemptId: string
  error: string
  demoError: string | null
  demoCheckoutReady: boolean
  walletWaiting: boolean
  t: (key: string) => string
  onPhoneChange: (value: string) => void
  onTransferReferenceChange: (value: string) => void
  onProofChange: (value: File | null) => void
  onBack: () => void
  onCancel: () => void
  onProceed: () => void
  onOutcome: (outcome: DemoPaymentOutcome) => void
}) {
  const [copyMessage, setCopyMessage] = useState('')
  const [proofError, setProofError] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const methodTitleKey = `billing.method.${method === 'evc-plus' ? 'evcPlus' : method === 'bank-transfer' ? 'bankTransfer' : method}`
  const demoOrderReference = `NOM-DEMO-${attemptId.slice(0, 8).toUpperCase()}`

  useEffect(() => {
    if (!proofFile || !proofFile.type.startsWith('image/')) {
      setPreviewUrl(null)
      return
    }
    const objectUrl = URL.createObjectURL(proofFile)
    setPreviewUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [proofFile])

  const copyReference = async () => {
    try {
      await navigator.clipboard.writeText(demoOrderReference)
      setCopyMessage(t('billing.bank.copied'))
    } catch {
      setCopyMessage(t('billing.bank.copyFailed'))
    }
  }

  const handleProofFile = (file: File | undefined) => {
    if (!file) {
      setProofError('')
      onProofChange(null)
      return
    }
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf'].includes(file.type)) {
      setProofError(t('billing.bank.proofTypeError'))
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setProofError(t('billing.bank.proofSizeError'))
      return
    }
    setProofError('')
    onProofChange(file)
  }

  return (
    <>
      <p className="text-xs font-semibold uppercase tracking-wide text-brand">{t('billing.flow.checkout.kicker')}</p>
      <h2 id="billing-flow-heading" className="mt-1 text-2xl font-semibold tracking-tight text-ink dark:text-white">
        {t(`billing.method.${method}.checkoutTitle`)}
      </h2>
      <p className="mt-2 max-w-xl text-sm text-graphite">{t(`billing.method.${method}.checkoutDescription`)}</p>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink/10 bg-ink/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.03]">
        <div className="min-w-0">
          <p className="text-xs text-graphite">{t('billing.order.amountDueToday')}</p>
          <p className="mt-1 break-words text-xl font-semibold text-ink dark:text-white">{formatUSD(amount)}</p>
          <p className="mt-1 text-xs leading-relaxed text-graphite">{t(`billing.checkout.billingNotice.${interval}`)}</p>
        </div>
        <Badge tone="brand">{t('billing.demo.badge')}</Badge>
      </div>

      <div className="mt-4 rounded-xl border border-amber-300/70 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100" role="note">
        <p className="flex items-center gap-2 font-semibold">
          <Info className="h-4 w-4 shrink-0" aria-hidden="true" /> {t('billing.checkout.noCharge')}
        </p>
        <p className="mt-1">{t('billing.checkout.disclaimer')}</p>
      </div>

      {(method === 'evc-plus' || method === 'edahab') && (
        <div className="mt-5 space-y-4">
          <Input
            id="subscription-mobile-phone"
            label={t('billing.method.phone')}
            type="tel"
            autoComplete="tel"
            required
            value={phone}
            onChange={(event) => onPhoneChange(event.target.value)}
            placeholder={t('billing.method.phonePlaceholder')}
            aria-invalid={Boolean(error && error === t('billing.method.phoneError'))}
            aria-describedby={error && error === t('billing.method.phoneError')
              ? 'subscription-mobile-phone-help subscription-mobile-error'
              : 'subscription-mobile-phone-help'}
          />
          <p id="subscription-mobile-phone-help" className="text-xs leading-relaxed text-graphite">{t('billing.method.phonePrivacy')}</p>
          {error && <p id="subscription-mobile-error" className="text-sm text-red-600 dark:text-red-300" role="alert">{error}</p>}
        </div>
      )}

      {method === 'card' && (
        <div className="mt-5 rounded-xl border border-ink/10 p-4 dark:border-white/10">
          <p className="flex items-center gap-2 font-medium text-ink dark:text-white">
            <LockKey className="h-4 w-4 text-brand" aria-hidden="true" /> {t('billing.method.cardSecurity')}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-graphite">{t('billing.method.cardPrototype')}</p>
        </div>
      )}

      {method === 'bank-transfer' && (
        <div className="mt-5 rounded-xl border border-ink/10 p-4 dark:border-white/10">
          <p className="flex items-center gap-2 font-medium text-ink dark:text-white">
            <Bank className="h-4 w-4 text-brand" aria-hidden="true" /> {t('billing.bank.detailsUnavailable')}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-graphite">{t('billing.bank.detailsNotice')}</p>
          <div className="mt-4 flex flex-col gap-2 rounded-lg bg-ink/[0.03] p-3 dark:bg-white/[0.04] sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs text-graphite">{t('billing.bank.demoReference')}</p>
              <p className="mt-1 break-all font-mono text-sm font-medium text-ink dark:text-white">{demoOrderReference}</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={copyReference}>
              <Copy className="h-4 w-4" /> {t('billing.bank.copyReference')}
            </Button>
          </div>
          {copyMessage && <p className="mt-2 text-xs text-graphite" role="status">{copyMessage}</p>}
          <div className="mt-4 space-y-4">
            <Input
              id="bank-transfer-reference"
              label={t('billing.bank.transferReference')}
              required
              autoComplete="off"
              value={transferReference}
              onChange={(event) => onTransferReferenceChange(event.target.value)}
              placeholder={t('billing.bank.transferReferencePlaceholder')}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'bank-transfer-error' : undefined}
            />
            <div>
              <label htmlFor="bank-proof-file" className="mb-1 block text-sm font-medium text-ink dark:text-white">
                {t('billing.bank.proofUpload')}
              </label>
              <div className="flex flex-col gap-3 rounded-lg border border-dashed border-ink/20 p-3 dark:border-white/20 sm:flex-row sm:items-center sm:justify-between">
                <input
                  key={proofFile?.name ?? 'empty'}
                  id="bank-proof-file"
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp,.gif,.pdf,image/png,image/jpeg,image/webp,image/gif,application/pdf"
                  onChange={(event) => handleProofFile(event.currentTarget.files?.[0])}
                  className="min-w-0 max-w-full text-sm text-graphite file:me-3 file:rounded-md file:border-0 file:bg-brand/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand"
                />
                <UploadSimple className="hidden h-5 w-5 shrink-0 text-brand sm:block" aria-hidden="true" />
              </div>
              <p className="mt-1 text-xs leading-relaxed text-graphite">{t('billing.bank.proofHelp')}</p>
              {proofFile && (
                <div className="mt-3 flex min-w-0 items-start gap-3 rounded-lg bg-ink/[0.03] p-3 dark:bg-white/[0.04]">
                  {previewUrl && <img src={previewUrl} alt={t('billing.bank.proofPreview')} className="h-16 w-16 shrink-0 rounded object-cover" />}
                  <p className="min-w-0 break-all text-sm text-ink dark:text-white">{proofFile.name}</p>
                  <button type="button" className="ms-auto shrink-0 text-sm text-brand underline" onClick={() => {
                    setProofError('')
                    onProofChange(null)
                  }}>
                    {t('billing.bank.removeProof')}
                  </button>
                </div>
              )}
              {proofError && <p className="mt-2 text-xs text-red-700 dark:text-red-300" role="alert">{proofError}</p>}
            </div>
            {error && <p id="bank-transfer-error" className="text-sm text-red-600 dark:text-red-300" role="alert">{error}</p>}
          </div>
        </div>
      )}

      <p className="mt-5 text-sm leading-relaxed text-graphite">{t('billing.method.nextStep')}</p>

      {demoCheckoutReady ? (
        <section aria-labelledby="demo-checkout-heading" className="mt-5 rounded-xl border-2 border-dashed border-brand/40 bg-brand/[0.03] p-4 dark:bg-brand/[0.06]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="demo-checkout-heading" className="font-semibold text-ink dark:text-white">{t('billing.flow.checkout.title')}</h3>
            <Badge tone="brand">{t('billing.demo.badge')}</Badge>
          </div>
          <p className="mt-1 text-sm leading-relaxed text-graphite">
            {method === 'bank-transfer'
              ? t('billing.bank.verificationPendingNotice')
              : walletWaiting
                ? t('billing.wallet.waiting')
                : t('billing.checkout.demoActionDescription')}
          </p>
          <p className="mt-2 text-sm text-ink dark:text-white">
            {t('billing.method.selected')} {t(methodTitleKey)}
          </p>
          {demoError && <p className="mt-3 text-sm text-red-600 dark:text-red-300" role="alert">{demoError}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            {method === 'bank-transfer' ? (
              <Button type="button" variant="primary" onClick={() => onOutcome('pending')}>
                <Clock className="h-4 w-4" /> {t('billing.bank.submitVerification')}
              </Button>
            ) : walletWaiting ? (
              <>
                <Button type="button" variant="primary" onClick={() => onOutcome('succeeded')}>
                  <CheckCircleIcon className="h-4 w-4" /> {t('billing.checkout.simulateApproval')}
                </Button>
                <Button type="button" variant="outline" onClick={() => onOutcome('failed')}>
                  <WarningCircle className="h-4 w-4" /> {t('billing.checkout.simulateFailure')}
                </Button>
              </>
            ) : (
              <>
                <Button type="button" variant="primary" onClick={() => onOutcome('succeeded')}>
                  <CheckCircleIcon className="h-4 w-4" /> {t('billing.checkout.simulateSuccess')}
                </Button>
                <Button type="button" variant="outline" onClick={() => onOutcome('failed')}>
                  <WarningCircle className="h-4 w-4" /> {t('billing.checkout.simulateFailure')}
                </Button>
              </>
            )}
          </div>
        </section>
      ) : (
        <div className="mt-5 flex justify-end">
          <Button type="button" variant="primary" size="lg" onClick={onProceed}>
            {method === 'bank-transfer' ? t('billing.bank.continue') : t('billing.method.proceedToDemo')} <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div className="mt-5 flex flex-wrap justify-between gap-3">
        <Button type="button" variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> {t('billing.back')}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          <XCircle className="h-4 w-4" /> {t('billing.checkout.cancel')}
        </Button>
      </div>
    </>
  )
}

function PaymentResult({
  transaction,
  planName,
  paymentMethodName,
  lang,
  t,
  error,
  onReceipt,
  onRetry,
  onReturn,
  onResolve,
}: {
  transaction: DemoTransaction
  planName: string
  paymentMethodName: string
  lang: string
  t: (key: string) => string
  error: string | null
  onReceipt: () => void
  onRetry: () => void
  onReturn: () => void
  onResolve: (outcome: 'succeeded' | 'rejected') => void
}) {
  const succeeded = transaction.outcome === 'succeeded'
  const pending = transaction.outcome === 'pending'
  const cancelled = transaction.outcome === 'cancelled'
  const headingKey = succeeded
    ? 'billing.result.success'
    : pending
      ? 'billing.result.pending'
      : transaction.outcome === 'rejected'
        ? 'billing.result.rejected'
        : cancelled
          ? 'billing.result.cancelled'
          : 'billing.result.failure'
  const descriptionKey = succeeded
    ? 'billing.result.demoOnly'
    : pending
      ? 'billing.result.pendingDetail'
      : transaction.outcome === 'rejected'
        ? 'billing.result.rejectedDetail'
        : cancelled
          ? 'billing.result.cancelledDetail'
          : 'billing.result.failureDetail'
  const resultDate = transaction.resolvedAt ?? transaction.createdAt
  return (
    <div role="status">
      <div className={`flex h-14 w-14 items-center justify-center rounded-full ${
        succeeded ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
          : pending ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
            : 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300'
      }`}>
        {succeeded ? <CheckCircleIcon className="h-8 w-8" aria-hidden="true" /> : pending ? <Clock className="h-8 w-8" aria-hidden="true" /> : <WarningCircle className="h-8 w-8" aria-hidden="true" />}
      </div>
      <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-brand">{t('billing.demo.badge')}</p>
      <h2 id="billing-flow-heading" className="mt-1 text-2xl font-semibold tracking-tight text-ink dark:text-white">
        {t(headingKey)}
      </h2>
      <p className="mt-2 max-w-xl text-sm text-graphite">
        {t(descriptionKey)}
      </p>
      <dl className="mt-6 grid gap-4 rounded-xl border border-ink/10 p-4 dark:border-white/10 sm:grid-cols-2">
        <ReceiptDetail label={t('billing.order.plan')} value={planName} />
        <ReceiptDetail label={t('billing.order.amountDueToday')} value={formatUSD(transaction.amount)} />
        <ReceiptDetail label={t('billing.order.frequency')} value={t(`billing.interval.${transaction.billingInterval}`)} />
        <ReceiptDetail label={t('billing.method.paymentMethod')} value={paymentMethodName} />
        <ReceiptDetail label={t('billing.history.reference')} value={transaction.reference} />
        <ReceiptDetail label={t('billing.history.date')} value={formatDemoDate(resultDate, lang)} />
        {transaction.transferReference && (
          <ReceiptDetail label={t('billing.bank.transferReference')} value={transaction.transferReference} />
        )}
        {succeeded && (
          <>
            <ReceiptDetail label={t('billing.result.subscriptionStart')} value={formatDemoDate(resultDate, lang)} />
            <ReceiptDetail label={t('billing.result.subscriptionExpiry')} value={formatDemoDate(intervalExpiry(resultDate, transaction.billingInterval), lang)} />
          </>
        )}
      </dl>
      {error && <p className="mt-4 break-words text-sm text-red-700 dark:text-red-300" role="alert">{error}</p>}
      <div className="mt-6 flex flex-wrap gap-3">
        {pending ? (
          <>
            <Button type="button" variant="primary" size="lg" onClick={() => onResolve('succeeded')}>
              <CheckCircleIcon className="h-4 w-4" /> {t('billing.bank.demoApprove')}
            </Button>
            <Button type="button" variant="outline" onClick={() => onResolve('rejected')}>
              <WarningCircle className="h-4 w-4" /> {t('billing.bank.demoReject')}
            </Button>
          </>
        ) : succeeded ? (
          <Button type="button" variant="primary" size="lg" onClick={onReceipt}>
            <Receipt className="h-4 w-4" /> {t('billing.receipt.view')}
          </Button>
        ) : (
          <Button type="button" variant="primary" size="lg" onClick={onRetry}>
            {t('billing.checkout.retry')} <ArrowRight className="h-4 w-4" />
          </Button>
        )}
        <Button type="button" variant="outline" onClick={onReturn}>{t('billing.backToBilling')}</Button>
      </div>
    </div>
  )
}

function ReceiptDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-graphite">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium text-ink dark:text-white">{value}</dd>
    </div>
  )
}

function DemoReceipt({
  transaction,
  schoolName,
  schoolLogoUrl: logoUrl,
  schoolAddress,
  schoolPhone,
  schoolEmail,
  administratorName,
  planName,
  paymentMethodName,
  t,
  onBack,
  onReturn,
}: {
  transaction: DemoTransaction
  schoolName: string
  schoolLogoUrl: string | null
  schoolAddress?: string | null
  schoolPhone?: string | null
  schoolEmail?: string | null
  administratorName: string
  planName: string
  paymentMethodName: string
  t: (key: string) => string
  onBack: () => void
  onReturn: () => void
}) {
  const paymentDate = transaction.resolvedAt ?? transaction.createdAt
  const receipt: PaymentReceiptDetails = {
    schoolName,
    schoolLogoUrl: logoUrl,
    schoolAddress,
    schoolPhone,
    schoolEmail,
    reference: transaction.reference,
    studentName: schoolName,
    payerName: administratorName,
    category: planName,
    originalAmount: transaction.amount,
    amountPaid: transaction.amount,
    currency: 'USD',
    method: paymentMethodName,
    paidOn: paymentDate,
    providerReference: transaction.transferReference ?? transaction.reference,
    isTestPayment: true,
    isSubscription: true,
    billingPeriod: t(`billing.interval.${transaction.billingInterval}`),
    subscriptionStartedAt: paymentDate,
    subscriptionExpiresAt: intervalExpiry(paymentDate, transaction.billingInterval),
    status: 'recorded',
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PaymentReceiptDocument details={receipt} visible />
      <div className="print-hide mt-5">
        <PaymentReceiptActions
          details={receipt}
          t={t}
          backLabel={t('billing.back')}
          onBack={onBack}
          returnLabel={t('billing.backToBilling')}
          onReturn={onReturn}
        />
      </div>
    </div>
  )
}
