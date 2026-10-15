import { useState, type FormEvent } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Bank,
  Check,
  CheckCircle as CheckCircleIcon,
  CreditCard,
  DeviceMobile,
  Hash,
  Info,
  LockKey,
  Receipt,
  WarningCircle,
  XCircle,
  type Icon as PhosphorIcon,
} from '@phosphor-icons/react'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import PageHeader from '@/components/ui/PageHeader'
import Select from '@/components/ui/Select'
import Textarea from '@/components/ui/Textarea'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import { subscriptionPlans } from '@/data/subscriptionPlans'
import {
  createDemoAttemptId,
  recordDemoPayment,
  type DemoBillingState,
  type DemoPaymentMethod,
  type DemoPaymentOutcome,
  type DemoTransaction,
  type FixedPlanCode,
} from '@/services/subscriptionDemoService'
import { isValidEmail, isValidPhone, minLength, type FieldErrors } from '@/utils/validators'

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
  { id: 'mobile-money', icon: DeviceMobile, titleKey: 'billing.method.mobileMoney', descriptionKey: 'billing.method.mobileMoneyDescription' },
  { id: 'card', icon: CreditCard, titleKey: 'billing.method.card', descriptionKey: 'billing.method.cardDescription' },
  { id: 'ussd', icon: Hash, titleKey: 'billing.method.ussd', descriptionKey: 'billing.method.ussdDescription' },
  { id: 'bank-agent', icon: Bank, titleKey: 'billing.method.bankAgent', descriptionKey: 'billing.method.bankAgentDescription' },
]

const mobileMoneyProviders = [
  { id: 'hormuud', name: 'Hormuud Telecom' },
  { id: 'waafi', name: 'WAAFI' },
] as const

function formatUSD(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function formatDemoDate(value: string, lang: string) {
  const locale = lang === 'ar' ? 'ar' : lang === 'so' ? 'so-SO' : 'en-US'
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function paymentMethodLabel(method: DemoPaymentMethod, t: (key: string) => string) {
  const option = paymentMethods.find((candidate) => candidate.id === method)
  return option ? t(option.titleKey) : method
}

export default function SubscriptionBilling() {
  const { t, lang } = useLanguage()
  const { school, profile } = useAuth()
  const demoAvailable = import.meta.env.DEV
  const [step, setStep] = useState<BillingStep>('plans')
  const [selectedPlanCode, setSelectedPlanCode] = useState<FixedPlanCode | null>(null)
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<DemoPaymentMethod | null>(null)
  const [paymentMethodError, setPaymentMethodError] = useState('')
  const [attemptId, setAttemptId] = useState<string | null>(null)
  const [demoCheckoutReady, setDemoCheckoutReady] = useState(false)
  const [demoState, setDemoState] = useState<DemoBillingState | null>(null)
  const [demoError, setDemoError] = useState<string | null>(null)
  const [lastTransaction, setLastTransaction] = useState<DemoTransaction | null>(null)
  const [mobileProvider, setMobileProvider] = useState('')
  const [mobilePhone, setMobilePhone] = useState('')
  const [mobileMoneyError, setMobileMoneyError] = useState('')
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

  const startPlanReview = (planCode: FixedPlanCode) => {
    setSelectedPlanCode(planCode)
    setSelectedPaymentMethod(null)
    setPaymentMethodError('')
    setAttemptId(null)
    setDemoCheckoutReady(false)
    setLastTransaction(null)
    setDemoError(null)
    setMobileProvider('')
    setMobilePhone('')
    setMobileMoneyError('')
    setStep('review')
  }

  const choosePaymentMethod = (method: DemoPaymentMethod) => {
    setSelectedPaymentMethod(method)
    setPaymentMethodError('')
    setMobileMoneyError('')
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
      setStep('checkout')
    } catch (error) {
      setDemoError(error instanceof Error ? error.message : t('billing.demo.storageUnavailable'))
    }
  }

  const proceedToDemoCheckout = () => {
    if (selectedPaymentMethod === 'mobile-money') {
      if (!mobileProvider) {
        setMobileMoneyError(t('billing.method.providerRequired'))
        return
      }
      if (!isValidPhone(mobilePhone)) {
        setMobileMoneyError(t('billing.method.phoneError'))
        return
      }
    }
    setMobileMoneyError('')
    setDemoCheckoutReady(true)
  }

  const returnToPlans = () => {
    setStep('plans')
    setSelectedPlanCode(null)
    setSelectedPaymentMethod(null)
    setPaymentMethodError('')
    setAttemptId(null)
    setDemoCheckoutReady(false)
    setLastTransaction(null)
    setDemoError(null)
    setMobileProvider('')
    setMobilePhone('')
    setMobileMoneyError('')
  }

  const recordPaymentOutcome = (outcome: DemoPaymentOutcome) => {
    if (!school || !selectedPlanCode || !selectedPaymentMethod || !attemptId || !demoAvailable) return
    if (selectedPaymentMethod === 'mobile-money') {
      if (!mobileProvider) {
        setMobileMoneyError(t('billing.method.providerRequired'))
        return
      }
      if (!isValidPhone(mobilePhone)) {
        setMobileMoneyError(t('billing.method.phoneError'))
        return
      }
    }

    try {
      const nextState = recordDemoPayment(
        school.id,
        attemptId,
        selectedPlanCode,
        outcome,
        selectedPaymentMethod,
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

  const retryPayment = () => {
    if (!demoAvailable) return
    try {
      setAttemptId(createDemoAttemptId())
      setDemoCheckoutReady(true)
      setLastTransaction(null)
      setDemoError(null)
      setMobileMoneyError('')
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
          <section aria-label={t('billing.available')} className="grid min-w-0 gap-5 md:grid-cols-2 xl:grid-cols-3">
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
                      {formatUSD(plan.monthlyPrice)}
                    </span>
                    <span className="ms-1 text-sm text-graphite">{t('pricing.perMonth')}</span>
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

              <Button
                type="button"
                variant={plan.highlight ? 'accent' : 'outline'}
                className="mt-7 w-full justify-center"
                disabled={plan.monthlyPrice === null || !demoAvailable}
                onClick={() => {
                  if (plan.monthlyPrice === null) setEnterpriseOpen(true)
                  else if (plan.code === 'starter' || plan.code === 'growth') startPlanReview(plan.code)
                }}
              >
                {plan.monthlyPrice === null
                  ? t('billing.enterpriseForm.contactUs')
                  : t(`billing.plans.choose.${plan.code}`)}
              </Button>
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

          {step === 'receipt' && lastTransaction ? (
            <DemoReceipt
              transaction={lastTransaction}
              schoolName={school?.name ?? ''}
              planName={selectedPlan?.name ?? lastTransaction.planCode}
              paymentMethodName={paymentMethodLabel(lastTransaction.paymentMethod ?? 'card', t)}
              lang={lang}
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
                    <p className="mt-4 text-sm leading-relaxed text-graphite">{t('billing.order.oneMonthTerms')}</p>
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
                      {paymentMethods.map(({ id, icon: MethodIcon, titleKey, descriptionKey }) => (
                        <button
                          key={id}
                          type="button"
                          aria-pressed={selectedPaymentMethod === id}
                          onClick={() => choosePaymentMethod(id)}
                          className={`min-h-28 rounded-xl border p-4 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#202328] ${
                            selectedPaymentMethod === id
                              ? 'border-brand bg-brand/5 ring-1 ring-brand dark:bg-brand/10'
                              : 'border-ink/10 bg-white hover:border-brand/50 dark:border-white/10 dark:bg-[#202328] dark:hover:border-brand/60'
                          }`}
                        >
                          <span className="flex items-start gap-3">
                            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                              selectedPaymentMethod === id
                                ? 'bg-brand text-white'
                                : 'bg-ink/5 text-ink dark:bg-white/10 dark:text-white'
                            }`}>
                              <MethodIcon className="h-5 w-5" aria-hidden="true" />
                            </span>
                            <span>
                              <span className="block font-semibold text-ink dark:text-white">{t(titleKey)}</span>
                              <span className="mt-1 block text-xs leading-relaxed text-graphite">{t(descriptionKey)}</span>
                            </span>
                            {selectedPaymentMethod === id && (
                              <CheckCircleIcon className="ms-auto h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
                            )}
                          </span>
                        </button>
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
                    provider={mobileProvider}
                    phone={mobilePhone}
                    error={mobileMoneyError}
                    demoError={demoError}
                    demoCheckoutReady={demoCheckoutReady}
                    t={t}
                    onProviderChange={(value) => {
                      setMobileProvider(value)
                      setMobileMoneyError('')
                    }}
                    onPhoneChange={(value) => {
                      setMobilePhone(value)
                      setMobileMoneyError('')
                    }}
                    onBack={() => {
                      setDemoCheckoutReady(false)
                      setMobileMoneyError('')
                      setStep('payment-method')
                    }}
                    onCancel={returnToPlans}
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
                    onReceipt={() => setStep('receipt')}
                    onRetry={retryPayment}
                    onReturn={returnToPlans}
                  />
                )}
              </div>

              {selectedPlan && selectedPlan.monthlyPrice !== null && (
                <OrderSummary schoolName={school?.name ?? '—'} plan={selectedPlan} t={t} />
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
      <dt className={prominent ? 'text-ink dark:text-white' : 'text-graphite'}>{label}</dt>
      <dd className="text-ink dark:text-white">{value}</dd>
    </div>
  )
}

function OrderSummary({
  schoolName,
  plan,
  t,
}: {
  schoolName: string
  plan: (typeof subscriptionPlans)[number]
  t: (key: string) => string
}) {
  if (plan.monthlyPrice === null) return null
  return (
    <aside aria-label={t('billing.order.summary')} className="h-fit rounded-xl border border-ink/10 bg-white p-5 shadow-soft dark:border-white/10 dark:bg-[#202328] sm:p-6">
      <h2 className="text-base font-semibold text-ink dark:text-white">{t('billing.order.summary')}</h2>
      <dl className="mt-3 divide-y divide-ink/5 dark:divide-white/10">
        <SummaryRow label={t('billing.order.school')} value={schoolName} />
        <SummaryRow label={t('billing.order.plan')} value={plan.name} />
        <SummaryRow label={t('billing.order.frequency')} value={t('billing.monthly')} />
        <SummaryRow label={t('billing.order.amountDueToday')} value={formatUSD(plan.monthlyPrice)} prominent />
      </dl>
    </aside>
  )
}

function CheckoutMethodPanel({
  method,
  provider,
  phone,
  error,
  demoError,
  demoCheckoutReady,
  t,
  onProviderChange,
  onPhoneChange,
  onBack,
  onCancel,
  onProceed,
  onOutcome,
}: {
  method: DemoPaymentMethod
  provider: string
  phone: string
  error: string
  demoError: string | null
  demoCheckoutReady: boolean
  t: (key: string) => string
  onProviderChange: (value: string) => void
  onPhoneChange: (value: string) => void
  onBack: () => void
  onCancel: () => void
  onProceed: () => void
  onOutcome: (outcome: DemoPaymentOutcome) => void
}) {
  const methodTitleKey = method === 'mobile-money'
    ? 'billing.method.mobileMoney'
    : method === 'card'
      ? 'billing.method.card'
      : method === 'ussd'
        ? 'billing.method.ussd'
        : 'billing.method.bankAgent'

  return (
    <>
      <p className="text-xs font-semibold uppercase tracking-wide text-brand">{t('billing.flow.checkout.kicker')}</p>
      <h2 id="billing-flow-heading" className="mt-1 text-2xl font-semibold tracking-tight text-ink dark:text-white">
        {t(`billing.method.${method}.checkoutTitle`)}
      </h2>
      <p className="mt-2 max-w-xl text-sm text-graphite">{t(`billing.method.${method}.checkoutDescription`)}</p>

      <div className="mt-4 rounded-xl border border-amber-300/70 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100" role="note">
        <p className="flex items-center gap-2 font-semibold">
          <Info className="h-4 w-4 shrink-0" aria-hidden="true" /> {t('billing.checkout.noCharge')}
        </p>
        <p className="mt-1">{t('billing.checkout.disclaimer')}</p>
      </div>

      {method === 'mobile-money' && (
        <div className="mt-5 space-y-4">
          <Select
            id="subscription-mobile-provider"
            label={t('billing.method.provider')}
            required
            value={provider}
            onChange={(event) => onProviderChange(event.target.value)}
            aria-invalid={Boolean(error && error === t('billing.method.providerRequired'))}
            aria-describedby={error && error === t('billing.method.providerRequired') ? 'subscription-mobile-error' : undefined}
          >
            <option value="">{t('billing.method.selectProvider')}</option>
            {mobileMoneyProviders.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </Select>
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
          <p id="subscription-mobile-phone-help" className="text-xs text-graphite">
            {t('billing.method.providerPrototypeNotice')} {t('billing.method.phonePrivacy')}
          </p>
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

      {method === 'ussd' && (
        <div className="mt-5 rounded-xl border border-ink/10 p-4 dark:border-white/10">
          <p className="flex items-center gap-2 font-medium text-ink dark:text-white">
            <Hash className="h-4 w-4 text-brand" aria-hidden="true" /> {t('billing.method.ussdInstructions')}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-graphite">{t('billing.method.ussdPrototype')}</p>
        </div>
      )}

      {method === 'bank-agent' && (
        <div className="mt-5 rounded-xl border border-ink/10 p-4 dark:border-white/10">
          <p className="flex items-center gap-2 font-medium text-ink dark:text-white">
            <Bank className="h-4 w-4 text-brand" aria-hidden="true" /> {t('billing.method.bankInstructions')}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-graphite">{t('billing.method.bankPrototype')}</p>
        </div>
      )}

      <p className="mt-5 text-sm leading-relaxed text-graphite">{t('billing.method.nextStep')}</p>

      {demoCheckoutReady ? (
        <section aria-labelledby="demo-checkout-heading" className="mt-5 rounded-xl border-2 border-dashed border-brand/40 bg-brand/[0.03] p-4 dark:bg-brand/[0.06]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="demo-checkout-heading" className="font-semibold text-ink dark:text-white">{t('billing.flow.checkout.title')}</h3>
            <Badge tone="brand">{t('billing.demo.badge')}</Badge>
          </div>
          <p className="mt-1 text-sm leading-relaxed text-graphite">{t('billing.checkout.demoActionDescription')}</p>
          <p className="mt-2 text-sm text-ink dark:text-white">
            {t('billing.method.selected')} {t(methodTitleKey)}
          </p>
          {demoError && <p className="mt-3 text-sm text-red-600 dark:text-red-300" role="alert">{demoError}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => onOutcome('succeeded')}>
              <CheckCircleIcon className="h-4 w-4" /> {t('billing.checkout.simulateSuccess')}
            </Button>
            <Button type="button" variant="outline" onClick={() => onOutcome('failed')}>
              <WarningCircle className="h-4 w-4" /> {t('billing.checkout.simulateFailure')}
            </Button>
          </div>
        </section>
      ) : (
        <div className="mt-5 flex justify-end">
          <Button type="button" variant="primary" size="lg" onClick={onProceed}>
            {t('billing.method.proceedToDemo')} <ArrowRight className="h-4 w-4" />
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
  onReceipt,
  onRetry,
  onReturn,
}: {
  transaction: DemoTransaction
  planName: string
  paymentMethodName: string
  lang: string
  t: (key: string) => string
  onReceipt: () => void
  onRetry: () => void
  onReturn: () => void
}) {
  const succeeded = transaction.outcome === 'succeeded'
  return (
    <div role="status">
      <div className={`flex h-14 w-14 items-center justify-center rounded-full ${succeeded ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300'}`}>
        {succeeded ? <CheckCircleIcon className="h-8 w-8" aria-hidden="true" /> : <WarningCircle className="h-8 w-8" aria-hidden="true" />}
      </div>
      <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-brand">{t('billing.demo.badge')}</p>
      <h2 id="billing-flow-heading" className="mt-1 text-2xl font-semibold tracking-tight text-ink dark:text-white">
        {succeeded ? t('billing.result.success') : t('billing.result.failure')}
      </h2>
      <p className="mt-2 max-w-xl text-sm text-graphite">
        {succeeded ? t('billing.result.demoOnly') : t('billing.result.failureDetail')}
      </p>
      <dl className="mt-6 grid gap-4 rounded-xl border border-ink/10 p-4 dark:border-white/10 sm:grid-cols-2">
        <ReceiptDetail label={t('billing.order.plan')} value={planName} />
        <ReceiptDetail label={t('billing.order.amountDueToday')} value={formatUSD(transaction.amount)} />
        <ReceiptDetail label={t('billing.method.paymentMethod')} value={paymentMethodName} />
        <ReceiptDetail label={t('billing.history.reference')} value={transaction.reference} />
        <ReceiptDetail label={t('billing.history.date')} value={formatDemoDate(transaction.createdAt, lang)} />
      </dl>
      <div className="mt-6 flex flex-wrap gap-3">
        {succeeded ? (
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
  planName,
  paymentMethodName,
  lang,
  t,
  onBack,
  onReturn,
}: {
  transaction: DemoTransaction
  schoolName: string
  planName: string
  paymentMethodName: string
  lang: string
  t: (key: string) => string
  onBack: () => void
  onReturn: () => void
}) {
  return (
    <div>
      <article className="print-document mx-auto max-w-3xl rounded-xl border border-ink/10 bg-white p-5 text-ink shadow-soft dark:border-white/10 dark:bg-[#202328] dark:text-white sm:p-8">
        <div className="border-2 border-dashed border-red-300 bg-red-50 px-3 py-2 text-center text-xs font-bold tracking-[0.12em] text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200 print:border-solid print:bg-white print:text-black">
          {t('billing.receipt.demoNotice')}
        </div>
        <header className="mt-6 flex flex-wrap items-start justify-between gap-5 border-b border-ink/10 pb-5 dark:border-white/15">
          <div className="flex items-center gap-3">
            <img src="/logo-512.png" alt="" className="h-11 w-11 object-contain" />
            <div>
              <p className="font-bold text-ink dark:text-white">Nom Cloud</p>
              <p className="text-xs text-graphite">{t('billing.receipt.brandSubtitle')}</p>
            </div>
          </div>
          <div className="text-start sm:text-end">
            <p className="text-xs text-graphite">{t('billing.history.reference')}</p>
            <p className="break-all font-mono text-sm font-semibold text-ink dark:text-white">{transaction.reference}</p>
            <p className="mt-2 text-xs text-graphite">{formatDemoDate(transaction.createdAt, lang)}</p>
          </div>
        </header>
        <h2 className="mt-6 text-2xl font-semibold text-ink dark:text-white">{t('billing.receipt.title')}</h2>
        <p className="mt-1 text-sm text-graphite">{schoolName}</p>
        <dl className="mt-5 grid gap-4 rounded-xl border border-ink/10 p-4 dark:border-white/10 sm:grid-cols-2">
          <ReceiptDetail label={t('billing.order.plan')} value={planName} />
          <ReceiptDetail label={t('billing.order.frequency')} value={t('billing.monthly')} />
          <ReceiptDetail label={t('billing.method.paymentMethod')} value={paymentMethodName} />
          <ReceiptDetail label={t('billing.receipt.paymentStatus')} value={t('billing.receipt.simulatedSuccess')} />
        </dl>
        <div className="mt-6 border-y border-ink/10 py-4 dark:border-white/15">
          <div className="flex flex-wrap justify-between gap-3 text-sm">
            <span>{t('billing.receipt.subscriptionPlan')}</span>
            <strong>{formatUSD(transaction.amount)}</strong>
          </div>
          <div className="mt-4 flex flex-wrap justify-between gap-3 font-semibold">
            <span>{t('billing.order.totalDue')}</span>
            <span>{formatUSD(transaction.amount)}</span>
          </div>
        </div>
        <p className="mt-5 text-xs leading-relaxed text-graphite">{t('billing.receipt.disclaimer')}</p>
      </article>
      <div className="print-hide mx-auto mt-5 flex max-w-3xl flex-wrap justify-between gap-3">
        <Button type="button" variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> {t('billing.back')}
        </Button>
        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="outline" onClick={() => window.print()}>{t('billing.receipt.print')}</Button>
          <Button type="button" variant="primary" onClick={onReturn}>{t('billing.backToBilling')}</Button>
        </div>
      </div>
    </div>
  )
}
