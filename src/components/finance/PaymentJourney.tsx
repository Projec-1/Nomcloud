import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Buildings,
  Check,
  CheckCircle,
  Clock,
  Copy,
  CreditCard,
  DeviceMobile,
  GraduationCap,
  ShieldCheck,
  Wallet,
  X,
} from '@phosphor-icons/react'
import { ThinkingOrb } from 'thinking-orbs'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import PaymentReceiptDocument, { type PaymentReceiptDetails } from '@/components/finance/PaymentReceiptDocument'
import PaymentMethodCard from '@/components/finance/PaymentMethodCard'
import PaymentReceiptActions from '@/components/finance/PaymentReceiptActions'
import { useLanguage } from '@/context/LanguageContext'
import { formatDate, formatMoney } from '@/utils/format'
import { errorMessage } from '@/utils/errorMessage'
import {
  markPendingFeeDemoChecked,
  recordFeeDemoReceipt,
  recordPendingFeeDemoTransaction,
  type PendingFeeDemoTransaction,
} from '@/services/feePaymentDemoService'

export type CheckoutMethodId = 'evc-plus' | 'waafi' | 'zaad' | 'sahal' | 'edahab' | 'visa' | 'mastercard' | 'ussd'
export type CheckoutOutcome = 'success' | 'failed' | 'cancelled' | 'pending'

export interface PaymentJourneyResult {
  outcome: CheckoutOutcome
  amount: number
  method: CheckoutMethodId
  transactionReference: string
  receipt: PaymentReceiptDetails | null
}

export interface PaymentJourneyProps {
  kind: 'fee' | 'subscription'
  schoolId: string
  schoolName: string
  schoolLogoUrl?: string | null
  schoolAddress?: string | null
  schoolPhone?: string | null
  schoolEmail?: string | null
  subjectName: string
  payerName: string
  description: string
  amount: number
  currency: string
  originalAmount?: number
  alreadyPaid?: number
  dueDate?: string
  billingPeriod?: string
  storageId: string
  allowPartial?: boolean
  minimumPayment?: number
  registrationNumber?: string
  ussdProviders?: UssdProviderConfig[]
  pendingDemo?: PendingFeeDemoTransaction
  children: (open: () => void, pending: boolean, paid: boolean) => ReactNode
  onResult?: (result: PaymentJourneyResult) => void
}

type Screen = 'method' | 'confirm' | 'processing' | 'success' | 'pending' | 'failed' | 'cancelled' | 'receipt'
type MethodGroup = 'mobile' | 'ussd' | 'card'
type UssdProvider = 'airtel' | 'mtn'
type DemoOutcome = 'success' | 'pending' | 'failed' | 'cancelled'

export interface UssdProviderConfig {
  id: UssdProvider
  name: string
  dialCode: string
  steps: string[]
}

const methods: {
  id: CheckoutMethodId
  labelKey: string
  icon: typeof DeviceMobile
  group: 'mobile' | 'ussd' | 'card'
  mark: string
}[] = [
  { id: 'ussd', labelKey: 'fees.checkout.ussdPayment', icon: DeviceMobile, group: 'ussd', mark: '*#' },
  { id: 'evc-plus', labelKey: 'parent.fees.method.evc_plus', icon: DeviceMobile, group: 'mobile', mark: 'EVC' },
  { id: 'waafi', labelKey: 'fees.checkout.method.waafi', icon: DeviceMobile, group: 'mobile', mark: 'WAAFI' },
  { id: 'zaad', labelKey: 'fees.checkout.method.zaad', icon: DeviceMobile, group: 'mobile', mark: 'ZAAD' },
  { id: 'sahal', labelKey: 'fees.checkout.method.sahal', icon: DeviceMobile, group: 'mobile', mark: 'SAHAL' },
  { id: 'edahab', labelKey: 'parent.fees.method.edahab', icon: DeviceMobile, group: 'mobile', mark: 'eD' },
  { id: 'mastercard', labelKey: 'fees.checkout.cardMastercard', icon: CreditCard, group: 'card', mark: 'MC' },
  { id: 'visa', labelKey: 'fees.checkout.cardVisa', icon: CreditCard, group: 'card', mark: 'VISA' },
]

const defaultUssdProviders: UssdProviderConfig[] = [
  {
    id: 'airtel',
    name: 'Airtel Money',
    dialCode: '*185#',
    steps: [
      'Garaac *185#.',
      'Dooro School Fees.',
      'Dooro School Pay.',
      'Dooro Pay School Fees.',
      'Geli Lambarka Diiwaangelinta.',
      'Geli Lacagta aad bixinayso.',
      'Ku xaqiiji PIN-kaaga Airtel Money.',
    ],
  },
  {
    id: 'mtn',
    name: 'MTN Mobile Money',
    dialCode: '*165#',
    steps: [
      'Garaac *165#.',
      'Dooro Payments.',
      'Dooro School Fees.',
      'Dooro School Pay.',
      'Dooro Pay School Fees.',
      'Geli Lambarka Diiwaangelinta.',
      'Geli Lacagta aad bixinayso.',
      'Ku xaqiiji PIN-kaaga MTN MoMo.',
    ],
  },
]

function reference(prefix: string) {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().replace(/-/g, '').slice(-10).toUpperCase()
    : Math.random().toString(36).slice(2, 12).toUpperCase()
  return `${prefix}-${new Date().getFullYear()}-${id}`
}

function Detail({ label, value, prominent = false }: { label: string; value: string; prominent?: boolean }) {
  return (
    <div className={`flex flex-wrap justify-between gap-3 py-3 text-sm ${prominent ? 'text-base font-semibold' : ''}`}>
      <dt className="text-graphite">{label}</dt>
      <dd className="break-words text-right font-medium text-ink dark:text-white">{value}</dd>
    </div>
  )
}

export default function PaymentJourney(props: PaymentJourneyProps) {
  const { t } = useLanguage()
  const propsRef = useRef(props)
  const processingLock = useRef(false)
  propsRef.current = props
  const [open, setOpen] = useState(false)
  const [screen, setScreen] = useState<Screen>('method')
  const [activeGroup, setActiveGroup] = useState<MethodGroup>('mobile')
  const [methodId, setMethodId] = useState<CheckoutMethodId | null>(null)
  const [paymentMode, setPaymentMode] = useState<'full' | 'partial'>('full')
  const [partialAmount, setPartialAmount] = useState('')
  const [ussdProvider, setUssdProvider] = useState<UssdProvider>('airtel')
  const [demoOutcome, setDemoOutcome] = useState<DemoOutcome>('success')
  const [copiedField, setCopiedField] = useState<'registration' | 'amount' | null>(null)
  const [busy, setBusy] = useState(false)
  const [checkingStatus, setCheckingStatus] = useState(false)
  const [processingStage, setProcessingStage] = useState(0)
  const [error, setError] = useState('')
  const [transactionReference, setTransactionReference] = useState('')
  const [pendingTransaction, setPendingTransaction] = useState<PendingFeeDemoTransaction | null>(null)
  const [receipt, setReceipt] = useState<PaymentReceiptDetails | null>(null)
  const currencyDigits = (() => {
    try {
      return new Intl.NumberFormat('en', { style: 'currency', currency: props.currency || 'USD' }).resolvedOptions().maximumFractionDigits ?? 2
    } catch {
      return 2
    }
  })()
  const minimumAmount = props.minimumPayment ?? 10 ** -currencyDigits
  const amount = pendingTransaction?.amount ?? (props.allowPartial && paymentMode === 'partial' ? Number(partialAmount) : props.amount)
  const requiredMinimum = props.allowPartial && paymentMode === 'partial' ? minimumAmount : 10 ** -currencyDigits
  const amountIsValid = Number.isFinite(amount)
    && amount >= requiredMinimum
    && amount <= props.amount
    && Math.abs(amount * 10 ** currencyDigits - Math.round(amount * 10 ** currencyDigits)) < 1e-7
  const method = methods.find((entry) => entry.id === methodId)
  const methodLabel = method ? t(method.labelKey) : ''
  const ussdProviders = props.ussdProviders?.length ? props.ussdProviders : defaultUssdProviders

  const reset = () => {
    setScreen('method')
    setActiveGroup('mobile')
    setMethodId(null)
    setPaymentMode('full')
    setPartialAmount('')
    setUssdProvider('airtel')
    setDemoOutcome('success')
    setCopiedField(null)
    setBusy(false)
    setCheckingStatus(false)
    setProcessingStage(0)
    processingLock.current = false
    setError('')
    setTransactionReference('')
    setPendingTransaction(null)
    setReceipt(null)
  }

  const close = () => {
    if (busy) {
      setBusy(false)
      setProcessingStage(0)
      processingLock.current = false
      setScreen('method')
    }
    setOpen(false)
  }

  const retry = () => {
    setError('')
    setBusy(false)
    setProcessingStage(0)
    processingLock.current = false
    setTransactionReference('')
    setScreen('method')
  }

  const start = () => {
    if (!open && props.pendingDemo) {
      const pendingDemo = props.pendingDemo
      reset()
      setPendingTransaction(pendingDemo)
      setMethodId(pendingDemo.method)
      setActiveGroup(methods.find((entry) => entry.id === pendingDemo.method)?.group ?? 'mobile')
      setPaymentMode(pendingDemo.amount === props.amount ? 'full' : 'partial')
      setPartialAmount(pendingDemo.amount.toFixed(currencyDigits))
      setTransactionReference(pendingDemo.reference)
      setScreen('pending')
    } else if (!open) {
      reset()
      setPartialAmount(props.amount.toFixed(currencyDigits))
    }
    setOpen(true)
  }

  const reportSuccess = (details: PaymentReceiptDetails, selectedMethod: CheckoutMethodId) => {
    try {
      propsRef.current.onResult?.({
        outcome: 'success',
        amount,
        method: selectedMethod,
        transactionReference,
        receipt: details,
      })
    } catch (resultError) {
      setError(errorMessage(resultError))
    }
  }

  useEffect(() => {
    if (screen !== 'processing') return
    const stageOne = window.setTimeout(() => setProcessingStage(1), 500)
    const stageTwo = window.setTimeout(() => setProcessingStage(2), 1000)
    const timer = window.setTimeout(() => {
      const current = propsRef.current
      if (!methodId || !amountIsValid) {
        setBusy(false)
        processingLock.current = false
        setError(t('fees.checkout.amountInvalid'))
        setScreen('method')
        return
      }

      if (demoOutcome === 'pending') {
        try {
          const pending = {
            reference: transactionReference,
            amount,
            method: methodId,
            methodLabel,
            createdAt: new Date().toISOString(),
            lastCheckedAt: null,
          } satisfies PendingFeeDemoTransaction
          if (current.kind === 'fee') {
            recordPendingFeeDemoTransaction(current.schoolId, current.storageId, pending)
            window.dispatchEvent(new Event('nomcloud:fee-demo-payment'))
          }
          setPendingTransaction(pending)
          setBusy(false)
          processingLock.current = false
          setScreen('pending')
          propsRef.current.onResult?.({
            outcome: 'pending',
            amount,
            method: methodId,
            transactionReference,
            receipt: null,
          })
        } catch (storageError) {
          setBusy(false)
          processingLock.current = false
          setError(errorMessage(storageError))
          setScreen('confirm')
        }
        return
      }
      if (demoOutcome === 'failed') {
        setBusy(false)
        processingLock.current = false
        setScreen('failed')
        propsRef.current.onResult?.({
          outcome: 'failed',
          amount,
          method: methodId,
          transactionReference,
          receipt: null,
        })
        return
      }
      if (demoOutcome === 'cancelled') {
        setBusy(false)
        processingLock.current = false
        setScreen('cancelled')
        propsRef.current.onResult?.({
          outcome: 'cancelled',
          amount,
          method: methodId,
          transactionReference,
          receipt: null,
        })
        return
      }

      const paidOn = new Date().toISOString()
      const details: PaymentReceiptDetails = {
        schoolName: current.schoolName || 'Nom Cloud',
        schoolLogoUrl: current.schoolLogoUrl,
        schoolAddress: current.schoolAddress,
        schoolPhone: current.schoolPhone,
        schoolEmail: current.schoolEmail,
        reference: reference(current.kind === 'fee' ? 'RCTP' : 'NCS'),
        studentName: current.kind === 'fee' ? current.subjectName : current.schoolName,
        registrationNumber: current.kind === 'fee' ? current.registrationNumber : undefined,
        payerName: current.payerName,
        category: current.description,
        originalAmount: current.originalAmount ?? current.amount,
        amountPaid: amount,
        totalPaid: current.kind === 'fee' ? (current.alreadyPaid ?? 0) + amount : undefined,
        remainingBalance: current.kind === 'fee' ? Math.max(0, current.amount - amount) : undefined,
        currency: current.currency,
        method: methodLabel,
        paidOn,
        providerReference: transactionReference,
        isTestPayment: true,
        isSubscription: current.kind === 'subscription',
        billingPeriod: current.kind === 'subscription' ? current.billingPeriod : undefined,
        status: 'recorded',
      }
      try {
        if (current.kind === 'fee') {
          recordFeeDemoReceipt(current.schoolId, current.storageId, details)
        } else {
          const key = `nomcloud:subscription-payment-demo:${encodeURIComponent(current.schoolId)}:${encodeURIComponent(current.storageId)}`
          const previous = JSON.parse(window.localStorage.getItem(key) ?? '[]') as PaymentReceiptDetails[]
          if (!Array.isArray(previous) || previous.some((entry) => entry.providerReference === transactionReference)) {
            throw new Error(t('fees.checkout.duplicateDemo'))
          }
          window.localStorage.setItem(key, JSON.stringify([details, ...previous]))
        }
        setReceipt(details)
        setBusy(false)
        processingLock.current = false
        setScreen('success')
        reportSuccess(details, methodId)
        if (current.kind === 'fee') window.dispatchEvent(new Event('nomcloud:fee-demo-payment'))
      } catch (storageError) {
        setBusy(false)
        processingLock.current = false
        setError(errorMessage(storageError))
        setScreen('confirm')
      }
    }, 1500)
    return () => {
      window.clearTimeout(stageOne)
      window.clearTimeout(stageTwo)
      window.clearTimeout(timer)
    }
  }, [screen, methodId, methodLabel, transactionReference, amount, amountIsValid, demoOutcome, t])

  const continueToConfirm = () => {
    if (!method || method.group !== activeGroup || (methodId === 'ussd' && !ussdProvider)) {
      setError(t('fees.checkout.methodRequired'))
      return
    }
    if (!amountIsValid) {
      setError(t('fees.checkout.amountInvalid'))
      return
    }
    setError('')
    setScreen('confirm')
  }

  const beginProcessing = () => {
    if (busy || processingLock.current) return
    if (!method || !amountIsValid) {
      setError(!method ? t('fees.checkout.methodRequired') : t('fees.checkout.amountInvalid'))
      return
    }
    setError('')
    processingLock.current = true
    setTransactionReference(reference('DEMO-TXN'))
    setBusy(true)
    setProcessingStage(0)
    setScreen('processing')
  }

  const checkUssdPayment = () => {
    if (busy || processingLock.current || pendingTransaction) return
    if (!props.registrationNumber?.trim() || !amountIsValid) {
      setError(!props.registrationNumber?.trim() ? t('fees.checkout.registrationMissing') : t('fees.checkout.amountInvalid'))
      return
    }
    setError('')
    processingLock.current = true
    const nextReference = reference('DEMO-USSD')
    const pending = {
      reference: nextReference,
      amount,
      method: 'ussd' as const,
      methodLabel: `${t('fees.checkout.ussdPayment')} · ${ussdProviders.find((provider) => provider.id === ussdProvider)?.name ?? ussdProvider}`,
      createdAt: new Date().toISOString(),
      lastCheckedAt: null,
    } satisfies PendingFeeDemoTransaction
    try {
      recordPendingFeeDemoTransaction(props.schoolId, props.storageId, pending)
      setPendingTransaction(pending)
      setTransactionReference(nextReference)
      setScreen('pending')
      window.dispatchEvent(new Event('nomcloud:fee-demo-payment'))
    } catch (storageError) {
      processingLock.current = false
      setError(errorMessage(storageError))
    }
  }

  const checkPendingStatus = async () => {
    if (checkingStatus) return
    if (!pendingTransaction) {
      setError(t('fees.checkout.pendingUnavailable'))
      return
    }
    setCheckingStatus(true)
    setError('')
    try {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 350))
      const updated = props.kind === 'fee'
        ? markPendingFeeDemoChecked(props.schoolId, props.storageId, pendingTransaction.reference)
        : { ...pendingTransaction, lastCheckedAt: new Date().toISOString() }
      setPendingTransaction(updated)
      setError(props.kind === 'fee'
        ? t('fees.checkout.pendingStillUnconfirmed')
        : t('fees.checkout.subscriptionPendingStillUnconfirmed'))
      if (props.kind === 'fee') window.dispatchEvent(new Event('nomcloud:fee-demo-payment'))
    } catch (statusError) {
      setError(errorMessage(statusError))
    } finally {
      setCheckingStatus(false)
    }
  }

  const copyValue = async (value: string, field: 'registration' | 'amount') => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value)
      } else {
        const input = document.createElement('textarea')
        input.value = value
        input.setAttribute('readonly', '')
        input.style.position = 'fixed'
        input.style.opacity = '0'
        document.body.appendChild(input)
        input.select()
        const copied = document.execCommand('copy')
        input.remove()
        if (!copied) throw new Error(t('fees.checkout.copyFailed'))
      }
      setCopiedField(field)
      window.setTimeout(() => setCopiedField((current) => current === field ? null : current), 1800)
    } catch {
      setError(t('fees.checkout.copyFailed'))
    }
  }

  let footer: ReactNode = null
  if (screen === 'method') {
    const ussdSelected = methodId === 'ussd' && activeGroup === 'ussd'
    footer = (
      <>
        <Button variant="ghost" onClick={close}>{t('fees.checkout.cancel')}</Button>
        <Button
          onClick={ussdSelected ? checkUssdPayment : continueToConfirm}
          disabled={!method || method.group !== activeGroup || !amountIsValid || (ussdSelected && !props.registrationNumber?.trim())}
          icon={ussdSelected ? <CheckCircle className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
          className="!bg-[#2d75b9] hover:!bg-[#2566a4] focus-visible:!outline-[#2d75b9]"
        >
          {ussdSelected ? 'Waan bixiyay — Hubi lacag-bixinta' : t('fees.checkout.continue')}
        </Button>
      </>
    )
  } else if (screen === 'confirm') {
    footer = (
      <>
        <Button variant="ghost" onClick={() => { setError(''); setScreen('method') }} icon={<ArrowLeft className="h-4 w-4" />}>
          {t('fees.checkout.back')}
        </Button>
        <Button onClick={beginProcessing} loading={busy} disabled={busy || !method || !amountIsValid}>
          {t('fees.checkout.confirmAndPay')}
        </Button>
      </>
    )
  } else if (screen === 'processing') {
    footer = <Button variant="ghost" onClick={close}>{t('fees.checkout.cancel')}</Button>
  } else if (screen === 'pending') {
    footer = (
      <>
        <Button variant="ghost" onClick={close}>
          {props.kind === 'fee' ? t('fees.checkout.backToFees') : t('fees.checkout.backToBilling')}
        </Button>
        <Button
          variant="outline"
          onClick={() => void checkPendingStatus()}
          disabled={checkingStatus}
          icon={checkingStatus ? (
            <ThinkingOrb
              state="searching"
              size={20}
              color="#C9471B"
              aria-label={t('fees.checkout.checkingStatus')}
            />
          ) : undefined}
        >
          {checkingStatus ? t('fees.checkout.checkingStatus') : t('fees.checkout.checkStatus')}
        </Button>
      </>
    )
  } else if (screen === 'failed') {
    footer = (
      <>
        <Button variant="ghost" onClick={close}>
          {props.kind === 'fee' ? t('fees.checkout.backToFees') : t('fees.checkout.backToBilling')}
        </Button>
        <Button onClick={retry}>{t('fees.checkout.retryPayment')}</Button>
      </>
    )
  } else if (screen === 'cancelled') {
    footer = (
      <>
        <Button variant="ghost" onClick={close}>
          {props.kind === 'fee' ? t('fees.checkout.backToFees') : t('fees.checkout.backToBilling')}
        </Button>
        <Button onClick={retry}>{t('fees.checkout.retryPayment')}</Button>
      </>
    )
  } else if (screen === 'success') {
    footer = (
      <>
        <Button variant="ghost" onClick={close}>{props.kind === 'fee' ? t('fees.checkout.backToFees') : t('fees.checkout.backToBilling')}</Button>
        <Button onClick={() => setScreen('receipt')}>{t('fees.checkout.viewReceipt')}</Button>
      </>
    )
  } else if (screen === 'receipt') {
    footer = receipt ? (
      <PaymentReceiptActions
        details={receipt}
        t={t}
        returnLabel={props.kind === 'fee' ? t('fees.checkout.backToFees') : t('fees.checkout.backToBilling')}
        onReturn={close}
      />
    ) : null
  }

  const title = screen === 'receipt'
    ? (props.kind === 'fee' ? t('fees.receipt.title') : t('fees.checkout.subscriptionReceipt'))
    : screen === 'success'
      ? t('fees.checkout.successTitle')
      : screen === 'processing'
        ? t('fees.checkout.processing')
        : screen === 'pending'
        ? t('fees.checkout.waitingConfirmation')
          : screen === 'failed'
            ? t('fees.checkout.paymentNotConfirmed')
            : screen === 'cancelled'
              ? t('fees.checkout.paymentNotConfirmed')
          : screen === 'confirm'
          ? t('fees.checkout.confirmPayment')
          : t('fees.checkout.paymentMethod')

  return (
    <>
      {props.children(start, busy, screen === 'success' || screen === 'receipt')}
      <Modal open={open} onClose={close} title={title} size={screen === 'method' ? '2xl' : 'xl'} footer={footer}>
        {screen === 'method' && (
          <div className="-mx-4 -my-5 overflow-hidden bg-[#f1f4f8] dark:bg-[#171b20] sm:-mx-8 sm:-my-6">
            <div className="grid min-h-[480px] lg:grid-cols-[minmax(0,0.68fr)_minmax(250px,0.32fr)]">
              <aside className="border-b border-[#dce4ed] bg-[#edf3f9] px-5 py-4 text-center dark:border-white/10 dark:bg-[#1c2631] sm:px-6 lg:order-2 lg:border-b-0 lg:border-s">
                <div className="mx-auto flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-2 border-[#d5e0eb] bg-white text-[#506c89] dark:border-white/15 dark:bg-[#263342] dark:text-[#c3d7ec]">
                  {props.schoolLogoUrl
                    ? <img src={props.schoolLogoUrl} alt="" className="h-full w-full object-contain p-2" />
                    : props.kind === 'fee'
                      ? <GraduationCap className="h-8 w-8" weight="duotone" />
                      : <Buildings className="h-8 w-8" weight="duotone" />}
                </div>
                <h2 className="mt-3 break-words text-sm font-semibold text-[#22364b] dark:text-white">
                  {props.kind === 'fee' ? props.subjectName : props.schoolName}
                </h2>
                <p className="mt-2 inline-flex max-w-full items-center gap-2 rounded-full bg-[#e0e8f1] px-3 py-1.5 text-xs font-medium text-[#5c7188] dark:bg-white/10 dark:text-slate-300">
                  <Wallet className="h-3.5 w-3.5 shrink-0" />
                  <span className="break-all">{props.kind === 'fee' ? props.payerName : t('fees.checkout.subscriptionPlan')}</span>
                </p>

                <dl className="mt-4 hidden divide-y divide-[#dce4ed] text-center dark:divide-white/10 lg:block">
                  <ProfileDetail
                    label={props.kind === 'fee' ? t('fees.receipt.fee') : t('billing.order.school')}
                    value={props.kind === 'fee' ? props.description : props.schoolName}
                  />
                  {props.kind === 'fee' && props.dueDate && (
                    <ProfileDetail label={t('fees.checkout.dueDate')} value={formatDate(props.dueDate)} />
                  )}
                  {props.kind === 'subscription' && props.billingPeriod && (
                    <ProfileDetail label={t('fees.checkout.billingPeriod')} value={props.billingPeriod} />
                  )}
                  <ProfileDetail label={t('fees.checkout.currency')} value={props.currency} />
                </dl>
                <details className="mt-3 text-start lg:hidden">
                  <summary className="min-h-10 cursor-pointer py-2 text-xs font-medium text-[#60778f] dark:text-slate-300">
                    {t('fees.checkout.feeDetails')}
                  </summary>
                  <dl className="divide-y divide-[#dce4ed] text-center dark:divide-white/10">
                    <ProfileDetail label={props.kind === 'fee' ? t('fees.receipt.fee') : t('billing.order.school')} value={props.kind === 'fee' ? props.description : props.schoolName} />
                    {props.kind === 'fee' && props.dueDate && <ProfileDetail label={t('fees.checkout.dueDate')} value={formatDate(props.dueDate)} />}
                    {props.kind === 'subscription' && props.billingPeriod && <ProfileDetail label={t('fees.checkout.billingPeriod')} value={props.billingPeriod} />}
                    <ProfileDetail label={t('fees.checkout.currency')} value={props.currency} />
                  </dl>
                </details>
                <div className="mt-3 rounded-xl border border-[#dce4ed] bg-white px-3 py-3 text-start dark:border-white/10 dark:bg-white/5">
                  <dl className="grid grid-cols-3 gap-2 text-start">
                    <CompactAmount label={t('fees.checkout.originalAmount')} value={formatMoney(props.originalAmount ?? props.amount + (props.alreadyPaid ?? 0), props.currency, true)} />
                    <CompactAmount label={t('fees.checkout.alreadyPaid')} value={formatMoney(props.alreadyPaid ?? 0, props.currency, true)} />
                    <CompactAmount label={t('fees.checkout.balanceDue')} value={formatMoney(props.amount, props.currency, true)} />
                  </dl>
                  <p className="mt-3 border-t border-[#e5eaf0] pt-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#8498ad] dark:border-white/10">
                    {t('fees.checkout.amountToPay')}
                  </p>
                  <p className="mt-1 text-xl font-semibold tabular-nums text-[#23384e] dark:text-white">
                    {formatMoney(amount, props.currency, true)}
                  </p>
                </div>
              </aside>

              <section className="min-w-0 bg-white px-5 py-6 dark:bg-[#202328] sm:px-8 lg:order-1">
                <header className="flex items-center gap-3 border-b border-[#e8edf3] pb-5 dark:border-white/10">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#edf5ff] text-[#2d75b9] dark:bg-blue-400/10 dark:text-blue-300">
                    <Wallet className="h-5 w-5" weight="duotone" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7890a9]">NOM CLOUD</p>
                    <h2 className="mt-0.5 text-lg font-semibold tracking-tight text-[#26384c] dark:text-white">
                      {t('fees.checkout.onlinePayments')}
                    </h2>
                  </div>
                </header>

                <div className="pt-5">
                  {props.kind === 'fee' && (
                    <section aria-labelledby="fee-payment-amount" className="mb-5">
                      <h3 id="fee-payment-amount" className="mb-2 text-sm font-semibold text-[#293b50] dark:text-white">
                        {t('fees.checkout.chooseAmount')}
                      </h3>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          aria-pressed={paymentMode === 'full'}
                          onClick={() => { setPaymentMode('full'); setError('') }}
                          className={`min-h-11 rounded-lg border px-3 text-start text-sm font-medium ${paymentMode === 'full' ? 'border-brand bg-brand/[0.06] text-ink dark:text-white' : 'border-ink/10 text-graphite dark:border-white/10'}`}
                        >
                          <span className="block">{t('fees.checkout.payFullAmount')}</span>
                          <span className="mt-0.5 block text-xs tabular-nums">{formatMoney(props.amount, props.currency, true)}</span>
                        </button>
                        <button
                          type="button"
                          aria-pressed={paymentMode === 'partial'}
                          onClick={() => { setPaymentMode('partial'); setError('') }}
                          className={`min-h-11 rounded-lg border px-3 text-start text-sm font-medium ${paymentMode === 'partial' ? 'border-brand bg-brand/[0.06] text-ink dark:text-white' : 'border-ink/10 text-graphite dark:border-white/10'}`}
                        >
                          <span className="block">{t('fees.checkout.payPartialAmount')}</span>
                          <span className="mt-0.5 block text-xs text-graphite">{t('fees.checkout.balanceDue')}: {formatMoney(props.amount, props.currency, true)}</span>
                        </button>
                      </div>
                      {paymentMode === 'partial' && (
                        <div className="mt-3">
                          <label className="mb-1.5 block text-xs font-medium text-[#647b93] dark:text-slate-300" htmlFor="partial-payment-amount">
                            {t('fees.checkout.amountToPay')} ({props.currency})
                          </label>
                          <input
                            id="partial-payment-amount"
                            className="input min-h-11 tabular-nums"
                            type="number"
                            inputMode="decimal"
                            min={minimumAmount}
                            max={props.amount}
                            step={10 ** -currencyDigits}
                            value={partialAmount}
                            onChange={(event) => { setPartialAmount(event.target.value); setError('') }}
                            aria-describedby="partial-payment-help"
                          />
                          <p id="partial-payment-help" className="mt-1.5 text-xs text-graphite">
                            {t('fees.checkout.minimumPayment')}: {formatMoney(minimumAmount, props.currency, true)} · {t('fees.checkout.balanceDue')}: {formatMoney(props.amount, props.currency, true)}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {[0.25, 0.5, 0.75].map((ratio) => {
                              const quickAmount = Math.max(minimumAmount, Math.floor((props.amount * ratio) * 10 ** currencyDigits) / 10 ** currencyDigits)
                              if (quickAmount >= props.amount) return null
                              return (
                                <button
                                  key={ratio}
                                  type="button"
                                  className="min-h-10 rounded-lg border border-ink/10 px-3 text-xs font-medium text-graphite hover:border-brand/40 hover:text-brand dark:border-white/10"
                                  onClick={() => { setPartialAmount(quickAmount.toFixed(currencyDigits)); setError('') }}
                                >
                                  {Math.round(ratio * 100)}% · {formatMoney(quickAmount, props.currency, true)}
                                </button>
                              )
                            })}
                          </div>
                          {!amountIsValid && partialAmount !== '' && (
                            <p role="alert" className="mt-2 text-xs text-red-600">{t('fees.checkout.amountInvalid')}</p>
                          )}
                        </div>
                      )}
                    </section>
                  )}
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#879bb0]">
                    {t('fees.checkout.paymentMethod')}
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:gap-3" aria-label={t('fees.checkout.paymentMethod')}>
                    <MethodGroupOption
                      active={activeGroup === 'mobile'}
                      icon={<DeviceMobile className="h-5 w-5" />}
                      label={t('fees.checkout.mobileMoney')}
                      onClick={() => { setActiveGroup('mobile'); setMethodId(null); setError('') }}
                    />
                    {props.kind === 'fee' && (
                      <MethodGroupOption
                        active={activeGroup === 'ussd'}
                        icon={<DeviceMobile className="h-5 w-5" />}
                        label={t('fees.checkout.ussdPayment')}
                        onClick={() => { setActiveGroup('ussd'); setMethodId('ussd'); setError('') }}
                      />
                    )}
                    <MethodGroupOption
                      active={activeGroup === 'card'}
                      icon={<CreditCard className="h-5 w-5" />}
                      label={t('fees.checkout.cardPayment')}
                      onClick={() => { setActiveGroup('card'); setMethodId(null); setError('') }}
                    />
                  </div>

                  {activeGroup !== 'ussd' ? <div className="mt-5">
                    <h3 className="text-base font-semibold text-[#293b50] dark:text-white">
                      {activeGroup === 'mobile' ? t('fees.checkout.mobileMoney') : t('fees.checkout.cardPayment')}
                    </h3>
                    <p className="mt-1 text-xs text-[#8699ad]">
                      {t('fees.checkout.selectMethodDescription')}
                    </p>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3" role="radiogroup" aria-label={t('fees.checkout.paymentMethod')}>
                      {methods.filter((entry) => entry.group === activeGroup).map((entry) => (
                        <PaymentMethodCard
                          key={entry.id}
                          icon={entry.icon}
                          mark={entry.mark}
                          selected={methodId === entry.id}
                          label={t(entry.labelKey)}
                          description=""
                          groupLabel={activeGroup === 'mobile' ? t('fees.checkout.mobileMoney') : t('fees.checkout.cardPayment')}
                          onSelect={() => { setMethodId(entry.id); setError('') }}
                        />
                      ))}
                    </div>
                  </div> : (
                    <UssdInstructions
                      providers={ussdProviders}
                      selectedProvider={ussdProvider}
                      onSelect={setUssdProvider}
                      registrationNumber={props.registrationNumber ?? ''}
                      amount={amount}
                      currency={props.currency}
                      currencyDigits={currencyDigits}
                      copiedField={copiedField}
                      onCopy={copyValue}
                      t={t}
                    />
                  )}

                  <div className="mt-4">
                    <DemoNotice text={t('fees.checkout.demoOnlyNotice')} />
                  </div>
                  {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
                </div>
              </section>
            </div>
          </div>
        )}

        {screen === 'confirm' && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-ink dark:text-white">{t('fees.checkout.confirmPayment')}</h2>
            <dl className="divide-y divide-ink/10 rounded-2xl border border-ink/10 px-4 dark:divide-white/10 dark:border-white/10">
              <Detail label={props.kind === 'fee' ? t('fees.receipt.student') : t('billing.order.school')} value={props.subjectName} />
              <Detail label={props.kind === 'fee' ? t('fees.receipt.fee') : t('fees.checkout.subscriptionPlan')} value={props.description} />
              {props.kind === 'fee' && props.dueDate && <Detail label={t('fees.checkout.dueDate')} value={formatDate(props.dueDate)} />}
              {props.kind === 'subscription' && props.billingPeriod && <Detail label={t('fees.checkout.billingPeriod')} value={props.billingPeriod} />}
              <Detail label={t('fees.checkout.currency')} value={props.currency} />
              <Detail label={t('fees.receipt.method')} value={methodLabel || '—'} />
              <Detail label={t('fees.receipt.amountPaid')} value={formatMoney(amount, props.currency, true)} />
              <Detail label={t('fees.checkout.total')} value={formatMoney(amount, props.currency, true)} prominent />
            </dl>
            <DemoNotice text={t('fees.checkout.demoOnlyNotice')} />
            {props.kind === 'fee' && (
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-graphite">{t('fees.checkout.simulationResult')}</span>
                <select className="input min-h-11" value={demoOutcome} onChange={(event) => setDemoOutcome(event.target.value as DemoOutcome)}>
                  <option value="success">{t('fees.checkout.demoSuccess')}</option>
                  <option value="pending">{t('fees.checkout.pendingTitle')}</option>
                  <option value="failed">{t('fees.checkout.paymentFailed')}</option>
                  <option value="cancelled">{t('fees.checkout.paymentCancelled')}</option>
                </select>
              </label>
            )}
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          </div>
        )}

        {screen === 'processing' && (
          <div role="status" aria-live="polite" className="mx-auto max-w-lg py-5 text-center sm:py-8">
            <ThinkingOrb
              state="working"
              size={64}
              color="#C9471B"
              className="mx-auto mb-4"
              aria-label={t('fees.checkout.processing')}
            />
            <h2 className="text-xl font-semibold text-ink dark:text-white">{t('fees.checkout.processing')}</h2>
            <p className="mt-2 text-sm text-graphite">{t('fees.checkout.processingDescription')}</p>
            <p className="mt-2 min-h-5 text-sm text-graphite" aria-live="polite" aria-atomic="true">
              {t(`fees.checkout.processingStage.${processingStage}`)}
            </p>
            <div
              className="nc-payment-progress mt-5"
              role="progressbar"
              aria-label={t('fees.checkout.processing')}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={[14, 58, 88][processingStage]}
            >
              <span className="nc-payment-progress__fill" style={{ transform: `scaleX(${[0.14, 0.58, 0.88][processingStage]})` }} />
            </div>
            <p className="mt-3 text-xs text-graphite">{t('fees.checkout.keepPageOpen')}</p>
            <p className="mt-5 text-2xl font-semibold tabular-nums text-ink dark:text-white">{formatMoney(amount, props.currency, true)}</p>
            <dl className="mt-4 divide-y divide-ink/10 rounded-xl border border-ink/10 px-4 text-start dark:divide-white/10 dark:border-white/10">
              <Detail
                label={props.kind === 'fee' ? t('fees.receipt.fee') : t('fees.checkout.subscriptionPlan')}
                value={props.description}
              />
              <Detail label={t('fees.receipt.method')} value={methodLabel || '—'} />
            </dl>
            <p className="mt-3 break-all text-xs text-graphite">{t('fees.checkout.transactionReference')}: {transactionReference}</p>
            <p className="mt-4 text-xs font-medium text-amber-800 dark:text-amber-200">{t('fees.checkout.simulatedPayment')}</p>
          </div>
        )}

        {screen === 'success' && receipt && (
          <div className="mx-auto max-w-lg py-4 text-center">
            <div className="nc-payment-success mx-auto" aria-hidden="true">
              <Check className="nc-payment-success__check h-8 w-8" weight="bold" />
            </div>
            <h2 className="mt-6 text-2xl font-semibold tracking-tight text-ink dark:text-white">{t('fees.checkout.successTitle')}</h2>
            <p className="mt-2 text-sm text-graphite">{t('fees.checkout.simulatedPayment')}</p>
            <p className="mt-6 text-3xl font-semibold tabular-nums text-ink dark:text-white">{formatMoney(receipt.amountPaid, receipt.currency, true)}</p>
            <dl className="mt-6 divide-y divide-ink/10 rounded-2xl border border-ink/10 px-4 text-start dark:divide-white/10 dark:border-white/10">
              <Detail label={props.kind === 'fee' ? t('fees.receipt.fee') : t('fees.checkout.subscriptionPlan')} value={receipt.category} />
              <Detail label={t('fees.receipt.method')} value={receipt.method} />
              <Detail label={t('fees.checkout.transactionReference')} value={receipt.providerReference ?? transactionReference} />
              <Detail label={t('fees.receipt.paymentDate')} value={formatDate(receipt.paidOn, { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })} />
            </dl>
            {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
          </div>
        )}

        {screen === 'pending' && (
          <div className="mx-auto max-w-lg py-5 text-center" role="status" aria-live="polite">
            <ThinkingOrb
              state="listening"
              size={64}
              color="#C9471B"
              className="mx-auto mb-3"
              aria-label={t('fees.checkout.waitingConfirmation')}
            />
            <h2 className="text-xl font-semibold text-ink dark:text-white">{t('fees.checkout.waitingConfirmation')}</h2>
            <p className="mt-2 text-sm text-graphite">
              {props.kind === 'fee' ? t('fees.checkout.pendingNotConfirmed') : t('fees.checkout.subscriptionPendingNotConfirmed')}
            </p>
            <p className="mt-4 text-2xl font-semibold tabular-nums text-ink dark:text-white">{formatMoney(amount, props.currency, true)}</p>
            <dl className="mt-4 divide-y divide-ink/10 rounded-xl border border-ink/10 px-4 text-start dark:divide-white/10 dark:border-white/10">
              <Detail
                label={props.kind === 'fee' ? t('fees.receipt.fee') : t('fees.checkout.subscriptionPlan')}
                value={props.description}
              />
              <Detail label={t('fees.receipt.method')} value={pendingTransaction?.methodLabel ?? methodLabel ?? '—'} />
              <Detail label={t('fees.checkout.transactionReference')} value={pendingTransaction?.reference ?? transactionReference} />
              <Detail
                label={t('fees.checkout.lastChecked')}
                value={pendingTransaction?.lastCheckedAt
                  ? formatDate(pendingTransaction.lastCheckedAt, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
                  : t('fees.checkout.notCheckedYet')}
              />
            </dl>
            <p className="mt-3 text-xs font-semibold text-amber-800 dark:text-amber-200">
              {props.kind === 'fee' ? t('fees.checkout.ussdStillPending') : t('fees.checkout.subscriptionPendingStillUnconfirmed')}
            </p>
            {error && !checkingStatus ? (
              <p role="status" aria-live="polite" className="mt-3 text-xs font-medium text-amber-800 dark:text-amber-200">{error}</p>
            ) : null}
          </div>
        )}

        {(screen === 'failed' || screen === 'cancelled') && (
          <div className="mx-auto max-w-lg py-5 text-center" role="alert">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10 text-red-600 dark:bg-red-400/10 dark:text-red-300">
              <X className="h-8 w-8" weight="bold" aria-hidden="true" />
            </div>
            <h2 className="mt-4 text-xl font-semibold text-ink dark:text-white">{t('fees.checkout.paymentNotConfirmed')}</h2>
            <p className="mt-2 text-sm text-graphite">
              {props.kind === 'fee'
                ? t('fees.checkout.paymentNotConfirmedMessage')
                : t('fees.checkout.subscriptionPaymentNotConfirmedMessage')}
            </p>
            <p className="mt-4 text-2xl font-semibold tabular-nums text-ink dark:text-white">{formatMoney(amount, props.currency, true)}</p>
            <dl className="mt-4 divide-y divide-ink/10 rounded-xl border border-ink/10 px-4 text-start dark:divide-white/10 dark:border-white/10">
              <Detail label={props.kind === 'fee' ? t('fees.receipt.fee') : t('fees.checkout.subscriptionPlan')} value={props.description} />
              <Detail label={t('fees.receipt.method')} value={methodLabel || '—'} />
              <Detail label={t('fees.checkout.transactionReference')} value={transactionReference} />
            </dl>
            <p className="mt-3 text-xs text-graphite">
              {screen === 'failed' ? t('fees.checkout.failedDemo') : t('fees.checkout.cancelledDemo')}
            </p>
          </div>
        )}

        {screen === 'receipt' && receipt && <PaymentReceiptDocument details={receipt} visible />}
      </Modal>
    </>
  )
}

function ProfileDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-2.5">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.11em] text-[#91a2b4]">{label}</dt>
      <dd className="mt-1 break-words text-xs font-medium text-[#344b63] dark:text-slate-200">{value}</dd>
    </div>
  )
}

function CompactAmount({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] leading-tight text-graphite">{label}</dt>
      <dd className="mt-1 break-words text-xs font-semibold tabular-nums text-ink dark:text-white">{value}</dd>
    </div>
  )
}

function UssdInstructions({
  providers,
  selectedProvider,
  onSelect,
  registrationNumber,
  amount,
  currency,
  currencyDigits,
  copiedField,
  onCopy,
  t,
}: {
  providers: UssdProviderConfig[]
  selectedProvider: UssdProvider
  onSelect: (provider: UssdProvider) => void
  registrationNumber: string
  amount: number
  currency: string
  currencyDigits: number
  copiedField: 'registration' | 'amount' | null
  onCopy: (value: string, field: 'registration' | 'amount') => Promise<void>
  t: (key: string) => string
}) {
  const provider = providers.find((entry) => entry.id === selectedProvider) ?? providers[0]
  return (
    <section className="mt-4" aria-labelledby="ussd-instructions-heading">
      <div className="flex flex-wrap gap-2" aria-label={t('fees.checkout.ussdProvider')}>
        {providers.map((entry) => (
          <button
            key={entry.id}
            type="button"
            aria-pressed={selectedProvider === entry.id}
            onClick={() => onSelect(entry.id)}
            className={`min-h-11 rounded-lg border px-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
              selectedProvider === entry.id
                ? 'border-brand bg-brand/[0.06] text-ink dark:text-white'
                : 'border-ink/10 text-graphite dark:border-white/10'
            }`}
          >
            {entry.name}
          </button>
        ))}
      </div>
      <article className="mt-3 rounded-xl border border-ink/10 bg-[#fbfcfd] p-4 dark:border-white/10 dark:bg-white/[0.03]">
        <h3 id="ussd-instructions-heading" className="text-sm font-semibold text-ink dark:text-white">{provider.name}</h3>
        <p className="mt-1 text-xs text-graphite">Raac tallaabooyinkan taleefankaaga si aad ugu bixiso USSD.</p>
        <p className="mt-2 text-xs font-medium text-ink dark:text-white">{provider.dialCode}</p>
        <ol className="mt-3 space-y-1.5 text-xs leading-relaxed text-ink dark:text-slate-200">
          {provider.steps.map((step, index) => (
            <li key={`${provider.id}-${index}`} className="flex gap-2">
              <span className="w-4 shrink-0 font-semibold tabular-nums text-brand">{index + 1}.</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <CopyDetail
            label={t('fees.checkout.registrationNumber')}
            value={registrationNumber || '—'}
            copied={copiedField === 'registration'}
            disabled={!registrationNumber}
            copyLabel={t('fees.checkout.copy')}
            copiedLabel={t('fees.checkout.copied')}
            onCopy={() => void onCopy(registrationNumber, 'registration')}
          />
          <CopyDetail
            label={t('fees.checkout.amountToPay')}
            value={formatMoney(amount, currency, true)}
            copied={copiedField === 'amount'}
            copyLabel={t('fees.checkout.copy')}
            copiedLabel={t('fees.checkout.copied')}
            onCopy={() => void onCopy(amount.toFixed(currencyDigits), 'amount')}
          />
        </div>
        {!registrationNumber && (
          <p role="alert" className="mt-2 text-xs text-red-600">{t('fees.checkout.registrationMissing')}</p>
        )}
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:bg-amber-950/20 dark:text-amber-100">
          {t('fees.checkout.ussdSafetyNotice')}
        </p>
      </article>
    </section>
  )
}

function CopyDetail({
  label,
  value,
  copied,
  disabled,
  copyLabel,
  copiedLabel,
  onCopy,
}: {
  label: string
  value: string
  copied: boolean
  disabled?: boolean
  copyLabel: string
  copiedLabel: string
  onCopy: () => void
}) {
  return (
    <div className="min-w-0 rounded-lg border border-ink/10 bg-white p-2.5 dark:border-white/10 dark:bg-white/5">
      <p className="text-[10px] text-graphite">{label}</p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <p className="min-w-0 break-all text-xs font-semibold tabular-nums text-ink dark:text-white">{value}</p>
        <button
          type="button"
          onClick={onCopy}
          disabled={disabled}
          className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-brand hover:bg-brand/5 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
          aria-label={`${copied ? copiedLabel : copyLabel} ${label}`}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? copiedLabel : copyLabel}
        </button>
      </div>
    </div>
  )
}

function MethodGroupOption({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean
  icon: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex min-h-[70px] items-center justify-center gap-3 rounded-xl border px-3 py-3 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2d75b9] ${
        active
          ? 'border-[#4b91d4] bg-[#eff6ff] text-[#315d88] shadow-[0_0_0_1px_#4b91d4] dark:bg-blue-400/10 dark:text-blue-200'
          : 'border-[#e1e8f0] bg-[#f8fafc] text-[#71859b] hover:border-[#a8c5e2] dark:border-white/10 dark:bg-[#252a30] dark:text-slate-300'
      }`}
    >
      <span className="text-[#4b83bb] dark:text-blue-300" aria-hidden="true">{icon}</span>
      <span>{label}</span>
    </button>
  )
}

function DemoNotice({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:bg-amber-950/20 dark:text-amber-100">
      <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
      <p>{text}</p>
    </div>
  )
}
