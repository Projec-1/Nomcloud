import { createPortal } from 'react-dom'
import { useLanguage } from '@/context/LanguageContext'
import { formatDate, formatMoney } from '@/utils/format'

export interface PaymentReceiptDetails {
  schoolName: string
  schoolLogoUrl?: string | null
  schoolAddress?: string | null
  schoolPhone?: string | null
  schoolEmail?: string | null
  reference: string
  studentName: string
  registrationNumber?: string
  payerName?: string
  category: string
  originalAmount: number
  amountPaid: number
  totalPaid?: number
  remainingBalance?: number
  currency: string
  method: string
  paidOn: string
  providerReference?: string
  isTestPayment?: boolean
  isSubscription?: boolean
  billingPeriod?: string
  subscriptionStartedAt?: string
  subscriptionExpiresAt?: string
  status: 'verified' | 'recorded'
}

function ReceiptRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div className="min-w-0">
      <dt className="text-[11px] leading-4 text-[#667085]">{label}</dt>
      <dd className="mt-0.5 break-words text-[13px] font-medium leading-5 text-[#152238]">{value}</dd>
    </div>
  )
}

function ReceiptMarkup({ details, title }: { details: PaymentReceiptDetails; title: string }) {
  const { t } = useLanguage()
  const previousPaid = details.totalPaid === undefined
    ? undefined
    : Math.max(0, details.totalPaid - details.amountPaid)
  const hasSeparateProviderReference = details.providerReference
    && details.providerReference !== details.reference
    ? details.providerReference
    : undefined
  const statusLabel = details.isTestPayment
    ? t('fees.receipt.testStatus')
    : details.status === 'verified'
      ? t('fees.receipt.verified')
      : t('fees.receipt.recorded')
  const paymentDate = formatDate(details.paidOn, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
  const supportContact = [details.schoolPhone, details.schoolEmail].filter(Boolean).join(' · ')

  return (
    <article
      className="receipt-paper mx-auto w-full max-w-xl overflow-hidden rounded-xl border border-[#d9dee7] bg-white text-[#152238]"
      aria-label={title}
    >
      <div className="receipt-brand-bar h-1 bg-[#e6252a]" />
      <div className="receipt-content px-5 py-4 sm:px-6 sm:py-5">
        <header className="flex items-start justify-between gap-3 border-b border-[#e5e8ee] pb-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <img src="/logo-512.png" alt="Nom Cloud" className="h-9 w-9 shrink-0 object-contain" />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#c9471b]">Nom Cloud</p>
              <h1 className="mt-0.5 break-words text-sm font-semibold leading-5">{details.schoolName}</h1>
              <p className="mt-0.5 text-[11px] leading-4 text-[#667085]">{paymentDate}</p>
            </div>
          </div>
          <div className="min-w-0 max-w-[48%] text-end">
            <p className="text-[11px] font-medium text-[#667085]">{title}</p>
            {details.reference && (
              <p className="mt-0.5 break-all text-xs font-semibold leading-4 tabular-nums">{details.reference}</p>
            )}
            <span className={`receipt-status mt-1.5 inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold leading-4 ${
              details.isTestPayment
                ? 'receipt-status--test border-amber-700/30 bg-amber-50 text-amber-900'
                : details.status === 'verified'
                  ? 'receipt-status--verified border-emerald-700/30 bg-emerald-50 text-emerald-800'
                  : 'border-[#cbd2dc] bg-[#f7f8fa] text-[#465467]'
            }`}>
              {statusLabel}
            </span>
          </div>
        </header>

        <section className="border-b border-[#e5e8ee] py-3" aria-label={t('fees.receipt.fee')}>
          <p className="text-[11px] font-medium text-[#667085]">
            {details.isSubscription ? t('fees.checkout.subscriptionPlan') : t('fees.receipt.fee')}
          </p>
          <p className="mt-0.5 break-words text-[13px] font-semibold leading-5">{details.category}</p>
          {details.isSubscription && details.billingPeriod && (
            <p className="mt-0.5 text-[11px] leading-4 text-[#667085]">
              {t('fees.checkout.billingPeriod')}: {details.billingPeriod}
            </p>
          )}
        </section>

        <section className="grid grid-cols-2 gap-x-5 gap-y-2.5 border-b border-[#e5e8ee] py-3" aria-label={t('fees.receipt.paymentDetails')}>
          {!details.isSubscription && (
            <>
              <ReceiptRow label={t('fees.receipt.payer')} value={details.payerName} />
              <ReceiptRow label={t('fees.receipt.student')} value={details.studentName} />
              <ReceiptRow label={t('fees.receipt.registrationNumber')} value={details.registrationNumber} />
            </>
          )}
          <ReceiptRow label={t('fees.receipt.method')} value={details.method} />
          {details.isSubscription && hasSeparateProviderReference && (
            <ReceiptRow label={t('fees.receipt.transactionReference')} value={hasSeparateProviderReference} />
          )}
        </section>

        <dl className="receipt-amounts divide-y divide-[#edf0f4] text-[13px]">
          {!details.isSubscription && (
            <div className="flex items-start justify-between gap-4 py-2">
              <dt className="text-[#667085]">{t('fees.receipt.totalFee')}</dt>
              <dd className="text-end font-medium tabular-nums">{formatMoney(details.originalAmount, details.currency, true)}</dd>
            </div>
          )}
          {!details.isSubscription && previousPaid !== undefined && previousPaid > 0 && (
            <div className="flex items-start justify-between gap-4 py-2">
              <dt className="text-[#667085]">{t('fees.receipt.previouslyPaid')}</dt>
              <dd className="text-end font-medium tabular-nums">{formatMoney(previousPaid, details.currency, true)}</dd>
            </div>
          )}
          <div className="flex items-center justify-between gap-4 py-2 font-semibold">
            <dt>{t('fees.receipt.amountPaid')}</dt>
            <dd className="text-end text-base tabular-nums">{formatMoney(details.amountPaid, details.currency, true)}</dd>
          </div>
          {!details.isSubscription && details.remainingBalance !== undefined && (
            <div className="flex items-start justify-between gap-4 py-2 font-semibold">
              <dt>{t('fees.receipt.remainingBalance')}</dt>
              <dd className="text-end tabular-nums">{formatMoney(details.remainingBalance, details.currency, true)}</dd>
            </div>
          )}
        </dl>

        {(details.isTestPayment || supportContact) && (
          <footer className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-[#e5e8ee] pt-2 text-[10px] leading-4 text-[#667085]">
            {details.isTestPayment && (
              <span className="receipt-test-notice font-medium text-amber-900">{t('fees.receipt.testNotice')}</span>
            )}
            {supportContact && <span className="break-words">{supportContact}</span>}
          </footer>
        )}
      </div>
    </article>
  )
}

export default function PaymentReceiptDocument({
  details,
  visible = false,
}: {
  details: PaymentReceiptDetails
  visible?: boolean
}) {
  const { t } = useLanguage()
  const title = details.isSubscription ? t('fees.checkout.subscriptionReceipt') : t('fees.receipt.title')

  return (
    <>
      {visible && <ReceiptMarkup details={details} title={title} />}
      {createPortal(
        <div
          className="receipt-print-root"
          data-receipt-reference={details.reference}
          data-visible-receipt={visible ? 'true' : 'false'}
          aria-hidden="true"
        >
          <ReceiptMarkup details={details} title={title} />
        </div>,
        document.body,
      )}
    </>
  )
}
