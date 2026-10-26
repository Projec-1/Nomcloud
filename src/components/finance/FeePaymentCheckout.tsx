import { useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, CheckCircle, CircleNotch, CreditCard, ShieldCheck } from '@phosphor-icons/react'
import type { SchoolRow } from '@/types/auth'
import { useLanguage } from '@/context/LanguageContext'
import { fetchChildFeeRecords, type FeeRecordView } from '@/services/financeService'
import {
  isVerifiedFeePayment,
  settleFeePayment,
  startFeePayment,
  type SettledFeePayment,
} from '@/services/feePaymentService'
import { errorMessage } from '@/utils/errorMessage'
import { formatDate, formatMoney } from '@/utils/format'
import { schoolLogoUrl } from '@/services/storageService'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import PaymentReceiptDocument, { type PaymentReceiptDetails } from '@/components/finance/PaymentReceiptDocument'
import PaymentReceiptActions from '@/components/finance/PaymentReceiptActions'

type Step = 'review' | 'method' | 'confirm' | 'processing' | 'success' | 'failed'

interface FeePaymentCheckoutProps {
  fee: FeeRecordView
  school: SchoolRow | null
  payerName: string
  onPaid: () => void
  children: (open: () => void, pending: boolean, paid: boolean) => ReactNode
}

export default function FeePaymentCheckout({
  fee,
  school,
  payerName,
  onPaid,
  children,
}: FeePaymentCheckoutProps) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>('review')
  const [amountMode, setAmountMode] = useState<'full' | 'partial'>('full')
  const [partialAmount, setPartialAmount] = useState('')
  const [accountNo, setAccountNo] = useState('')
  const [transactionId, setTransactionId] = useState<string | null>(null)
  const [isMock, setIsMock] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [receiptError, setReceiptError] = useState('')
  const [receipt, setReceipt] = useState<PaymentReceiptDetails | null>(null)

  const amount = amountMode === 'full' ? fee.balance : Number(partialAmount)
  const amountIsValid = Number.isFinite(amount) && amount > 0 && amount <= fee.balance
  const canUseGateway = school?.is_demo === true

  const startOver = () => {
    setStep('review')
    setAmountMode('full')
    setPartialAmount('')
    setAccountNo('')
    setTransactionId(null)
    setReceipt(null)
    setError('')
    setReceiptError('')
  }

  const openCheckout = () => {
    if (step === 'failed') startOver()
    setOpen(true)
  }

  const finishVerifiedPayment = async (result: SettledFeePayment) => {
    if (!isVerifiedFeePayment(result) || !school) return

    setStep('success')
    setReceiptError('')
    onPaid()
    try {
      const latestRecords = await fetchChildFeeRecords(school.id, fee.studentId, school.timezone)
      const updatedFee = latestRecords.find((record) => record.id === fee.id)
      const payment = updatedFee?.payments.find((row) => row.id === result.feePaymentId)
      if (!updatedFee || !payment) {
        throw new Error(t('fees.checkout.receiptUnavailable'))
      }
      setReceipt({
        schoolName: school.name,
        schoolLogoUrl: schoolLogoUrl(school.logo_path),
        schoolAddress: school.address,
        schoolPhone: school.phone,
        schoolEmail: school.email,
        reference: payment.reference,
        studentName: updatedFee.studentName,
        studentAdmissionNo: updatedFee.studentAdmissionNo,
        className: updatedFee.className,
        academicYear: updatedFee.academicYear,
        payerName,
        category: updatedFee.category,
        originalAmount: updatedFee.amount,
        amountPaid: payment.amount,
        remainingBalance: updatedFee.balance,
        currency: payment.currency,
        method: t('fees.checkout.waafiMobileMoney'),
        paidOn: payment.paidOn,
        paidAt: payment.paidAt,
        providerReference: result.transactionId,
        isTestPayment: result.mock,
        status: 'verified',
      })
    } catch (receiptLoadError) {
      setReceiptError(errorMessage(receiptLoadError))
    }
  }

  const checkStatus = async (id: string) => {
    setIsSubmitting(true)
    setError('')
    setStep('processing')
    try {
      const result = await settleFeePayment(id, { requireMock: true })
      setIsMock(result.mock)
      if (isVerifiedFeePayment(result)) {
        await finishVerifiedPayment(result)
      } else if (result.eventType === 'declined' || result.eventType === 'cancelled' || result.outcome === 'rejected') {
        setStep('failed')
        setError(
          result.eventType === 'cancelled'
            ? t('fees.checkout.cancelled')
            : result.reason === 'exceeds_balance'
              ? t('fees.checkout.balanceChanged')
              : t('fees.checkout.declined'),
        )
      } else {
        setStep('processing')
      }
    } catch (verificationError) {
      setStep('processing')
      setError(errorMessage(verificationError))
    } finally {
      setIsSubmitting(false)
    }
  }

  const confirmPayment = async () => {
    if (!school || !canUseGateway || !amountIsValid) return
    const trimmedAccount = accountNo.trim()
    if (!/^\+?\d{6,15}$/.test(trimmedAccount)) {
      setError(t('fees.checkout.invalidAccount'))
      setStep('method')
      return
    }

    setIsSubmitting(true)
    setError('')
    try {
      const started = await startFeePayment({
        feeRecordId: fee.id,
        amount,
        paymentMethod: 'mobile_money',
        accountNo: trimmedAccount,
        requireMock: true,
      })
      setTransactionId(started.transactionId)
      setIsMock(started.mock)
      if (started.eventType === 'declined' || started.eventType === 'cancelled') {
        setStep('failed')
        setError(started.eventType === 'cancelled' ? t('fees.checkout.cancelled') : t('fees.checkout.declined'))
        return
      }
      await checkStatus(started.transactionId)
    } catch (startError) {
      setStep('failed')
      setError(errorMessage(startError))
    } finally {
      setIsSubmitting(false)
    }
  }

  const footer = (() => {
    if (step === 'review') {
      return (
        <>
          <Button variant="ghost" onClick={() => setOpen(false)}>{t('fees.checkout.cancel')}</Button>
          <Button
            onClick={() => {
              if (!amountIsValid) {
                setError(t('fees.checkout.amountRange'))
                return
              }
              setError('')
              setStep('method')
            }}
            icon={<ArrowRight className="h-4 w-4" />}
          >
            {t('fees.checkout.chooseMethod')}
          </Button>
        </>
      )
    }
    if (step === 'method') {
      return (
        <>
          <Button variant="ghost" onClick={() => setStep('review')} icon={<ArrowLeft className="h-4 w-4" />}>
            {t('fees.checkout.back')}
          </Button>
          <Button onClick={() => { setError(''); setStep('confirm') }} disabled={!accountNo.trim()}>
            {t('fees.checkout.continue')}
          </Button>
        </>
      )
    }
    if (step === 'confirm') {
      return (
        <>
          <Button variant="ghost" onClick={() => setStep('method')} disabled={isSubmitting}>
            {t('fees.checkout.back')}
          </Button>
          <Button onClick={confirmPayment} loading={isSubmitting} disabled={isSubmitting}>
            {t('fees.checkout.continueToPayment')}
          </Button>
        </>
      )
    }
    if (step === 'processing') {
      return (
        <>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={isSubmitting}>
            {t('fees.checkout.backToFees')}
          </Button>
          <Button
            onClick={() => transactionId && checkStatus(transactionId)}
            loading={isSubmitting}
            disabled={!transactionId || isSubmitting}
          >
            {t('fees.checkout.checkStatus')}
          </Button>
        </>
      )
    }
    if (step === 'failed') {
      return (
        <>
          <Button variant="ghost" onClick={() => setOpen(false)}>{t('fees.checkout.backToFees')}</Button>
          <Button onClick={startOver}>{t('fees.checkout.tryAgain')}</Button>
        </>
      )
    }
    return null
  })()

  return (
    <>
      {children(openCheckout, step === 'processing', step === 'success')}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={step === 'success' ? t('fees.checkout.successTitle') : t('fees.checkout.title')}
        description={step === 'processing' ? t('fees.checkout.processingDescription') : undefined}
        size="lg"
        footer={footer}
      >
        {step === 'review' && (
          <div className="space-y-5">
            <p className="text-sm text-graphite">{t('fees.checkout.reviewDescription')}</p>
            <dl className="grid gap-4 rounded-xl border border-ink/10 p-4 dark:border-white/10 sm:grid-cols-2">
              <div><dt className="text-xs text-graphite">{t('fees.receipt.student')}</dt><dd className="mt-1 font-medium text-ink dark:text-white">{fee.studentName}</dd></div>
              <div><dt className="text-xs text-graphite">{t('fees.checkout.school')}</dt><dd className="mt-1 font-medium text-ink dark:text-white">{school?.name}</dd></div>
              <div><dt className="text-xs text-graphite">{t('fees.receipt.fee')}</dt><dd className="mt-1 font-medium text-ink dark:text-white">{fee.category} · {fee.termName}</dd></div>
              <div><dt className="text-xs text-graphite">{t('fees.receipt.academicYear')}</dt><dd className="mt-1 font-medium text-ink dark:text-white">{fee.academicYear || '—'}</dd></div>
              <div><dt className="text-xs text-graphite">{t('fees.checkout.dueDate')}</dt><dd className="mt-1 font-medium text-ink dark:text-white">{formatDate(fee.dueDate)}</dd></div>
            </dl>
            <fieldset className="space-y-3">
              <legend className="mb-2 text-sm font-semibold text-ink dark:text-white">{t('fees.checkout.amountToPay')}</legend>
              <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-xl border border-ink/10 px-4 py-3 dark:border-white/10">
                <span className="flex items-center gap-3">
                  <input type="radio" name={`amount-${fee.id}`} checked={amountMode === 'full'} onChange={() => setAmountMode('full')} />
                  <span className="text-sm font-medium text-ink dark:text-white">{t('fees.checkout.fullBalance')}</span>
                </span>
                <span className="text-sm font-semibold tabular-nums text-ink dark:text-white">{formatMoney(fee.balance, fee.currency, true)}</span>
              </label>
              <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-ink/10 px-4 py-3 dark:border-white/10">
                <input type="radio" name={`amount-${fee.id}`} checked={amountMode === 'partial'} onChange={() => setAmountMode('partial')} />
                <span className="text-sm font-medium text-ink dark:text-white">{t('fees.checkout.partialPayment')}</span>
              </label>
              {amountMode === 'partial' && (
                <Input
                  label={t('fees.checkout.partialAmount')}
                  type="number"
                  min="0.01"
                  max={fee.balance}
                  step="0.01"
                  inputMode="decimal"
                  value={partialAmount}
                  onChange={(event) => {
                    setPartialAmount(event.target.value)
                    setError('')
                  }}
                  error={partialAmount && !amountIsValid ? t('fees.checkout.amountRange') : undefined}
                />
              )}
              {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            </fieldset>
            <div className="flex items-center justify-between border-t border-ink/10 pt-4 text-sm dark:border-white/10">
              <span className="text-graphite">{t('fees.checkout.total')}</span>
              <strong className="text-lg tabular-nums text-ink dark:text-white">{formatMoney(amount, fee.currency, true)}</strong>
            </div>
          </div>
        )}

        {step === 'method' && (
          <div className="space-y-5">
            <div className="rounded-xl border border-brand/25 bg-brand/[0.04] p-4 text-sm">
              <p className="flex items-center gap-2 font-semibold text-ink dark:text-white">
                <ShieldCheck className="h-5 w-5 text-brand" /> {t('fees.checkout.testMode')}
              </p>
              <p className="mt-2 leading-6 text-graphite">{t('fees.checkout.testModeDescription')}</p>
            </div>
            <fieldset>
              <legend className="mb-3 text-sm font-semibold text-ink dark:text-white">{t('fees.checkout.paymentMethod')}</legend>
              <label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border border-brand bg-brand/[0.04] px-4 py-3">
                <input type="radio" name={`method-${fee.id}`} checked readOnly />
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/10 text-brand"><CreditCard className="h-5 w-5" /></span>
                <span>
                  <span className="block text-sm font-semibold text-ink dark:text-white">{t('fees.checkout.waafiMobileMoney')}</span>
                  <span className="mt-0.5 block text-xs text-graphite">{t('fees.checkout.testOnly')}</span>
                </span>
              </label>
            </fieldset>
            <Input
              label={t('fees.checkout.testAccount')}
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              value={accountNo}
              onChange={(event) => setAccountNo(event.target.value)}
              error={error || undefined}
              aria-describedby={`payment-test-hint-${fee.id}`}
            />
            <p id={`payment-test-hint-${fee.id}`} className="text-xs leading-5 text-graphite">
              {t('fees.checkout.testAccountHint')}
            </p>
          </div>
        )}

        {step === 'confirm' && (
          <div className="space-y-5">
            <p className="text-sm leading-6 text-graphite">{t('fees.checkout.confirmDescription')}</p>
            <dl className="divide-y divide-ink/10 rounded-xl border border-ink/10 px-4 dark:divide-white/10 dark:border-white/10">
              <div className="flex justify-between gap-4 py-3 text-sm"><dt className="text-graphite">{t('fees.receipt.student')}</dt><dd className="text-right font-medium text-ink dark:text-white">{fee.studentName}</dd></div>
              <div className="flex justify-between gap-4 py-3 text-sm"><dt className="text-graphite">{t('fees.checkout.school')}</dt><dd className="text-right font-medium text-ink dark:text-white">{school?.name}</dd></div>
              <div className="flex justify-between gap-4 py-3 text-sm"><dt className="text-graphite">{t('fees.receipt.fee')}</dt><dd className="text-right font-medium text-ink dark:text-white">{fee.category}</dd></div>
              <div className="flex justify-between gap-4 py-3 text-sm"><dt className="text-graphite">{t('fees.receipt.method')}</dt><dd className="text-right font-medium text-ink dark:text-white">{t('fees.checkout.waafiMobileMoney')}</dd></div>
              <div className="flex justify-between gap-4 py-4 text-base"><dt className="font-semibold text-ink dark:text-white">{t('fees.checkout.total')}</dt><dd className="font-semibold tabular-nums text-ink dark:text-white">{formatMoney(amount, fee.currency, true)}</dd></div>
            </dl>
            <p className="text-xs leading-5 text-graphite">{t('fees.checkout.providerInstructions')}</p>
            {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-700 dark:text-red-300">{error}</p>}
          </div>
        )}

        {step === 'processing' && (
          <div role="status" aria-live="polite" className="space-y-4 py-4 text-center">
            <CircleNotch className="mx-auto h-8 w-8 animate-spin text-brand" aria-hidden="true" />
            <h2 className="text-lg font-semibold text-ink dark:text-white">{t('fees.checkout.processing')}</h2>
            <p className="mx-auto max-w-md text-sm leading-6 text-graphite">{error || t('fees.checkout.processingDescription')}</p>
            {transactionId && <p className="break-all text-xs text-graphite">{t('fees.checkout.transactionReference')}: {transactionId}</p>}
          </div>
        )}

        {step === 'failed' && (
          <div className="space-y-3 rounded-xl border border-red-500/25 bg-red-500/[0.04] p-5">
            <h2 className="font-semibold text-ink dark:text-white">{t('fees.checkout.notCompleted')}</h2>
            <p role="alert" className="text-sm leading-6 text-graphite">{error || t('fees.checkout.declined')}</p>
          </div>
        )}

        {step === 'success' && (
          <div className="space-y-5">
            <div role="status" aria-live="polite" className="rounded-xl border border-emerald-700/25 bg-emerald-500/[0.04] p-5">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-7 w-7 shrink-0 text-emerald-700" aria-hidden="true" />
                <div>
                  <h2 className="font-semibold text-ink dark:text-white">{t('fees.checkout.successTitle')}</h2>
                  <p className="mt-1 text-sm text-graphite">{t('fees.checkout.verified')}</p>
                </div>
              </div>
              <p className="mt-4 text-2xl font-semibold tabular-nums text-ink dark:text-white">{formatMoney(amount, fee.currency, true)}</p>
              {transactionId && <p className="mt-2 break-all text-xs text-graphite">{t('fees.checkout.transactionReference')}: {transactionId}</p>}
              {isMock && <p className="mt-3 text-xs font-medium text-amber-800 dark:text-amber-300">{t('fees.checkout.testTransaction')}</p>}
            </div>
            {receipt ? (
              <div className="space-y-4">
                <p className="text-sm text-graphite">{t('fees.checkout.receiptReady')}</p>
                <PaymentReceiptDocument details={receipt} visible />
                <PaymentReceiptActions
                  details={receipt}
                  t={t}
                  returnLabel={t('fees.checkout.done')}
                  onReturn={() => setOpen(false)}
                />
              </div>
            ) : (
              <p role="status" className="text-sm text-graphite">
                {receiptError || t('fees.checkout.receiptLoading')}
              </p>
            )}
          </div>
        )}
      </Modal>
      {receipt && <PaymentReceiptDocument details={receipt} />}
    </>
  )
}
