import type { ReactNode } from 'react'
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
  studentAdmissionNo?: string
  className?: string
  academicYear?: string
  payerName?: string
  category: string
  originalAmount: number
  amountPaid: number
  remainingBalance: number
  currency: string
  method: string
  paidOn: string
  paidAt?: string
  providerReference?: string
  status: 'verified' | 'recorded'
}

function ReceiptRow({ label, value }: { label: string; value?: ReactNode }) {
  if (!value) return null
  return (
    <div>
      <dt className="text-xs text-graphite">{label}</dt>
      <dd className="mt-1 break-words font-medium text-ink dark:text-white">{value}</dd>
    </div>
  )
}

export default function PaymentReceiptDocument({ details }: { details: PaymentReceiptDetails }) {
  const { t } = useLanguage()
  const paymentDate = details.paidAt
    ? new Date(details.paidAt).toLocaleString()
    : formatDate(details.paidOn, { month: 'long', day: 'numeric', year: 'numeric' })

  return (
    <article className="print-only print-document mx-auto max-w-3xl bg-white p-6 text-ink sm:p-10" aria-label={t('fees.receipt.title')}>
      <header className="flex items-start justify-between gap-6 border-b border-ink/10 pb-6">
        <div className="flex min-w-0 items-center gap-4">
          {details.schoolLogoUrl && (
            <img src={details.schoolLogoUrl} alt="" className="h-14 w-14 shrink-0 object-contain" />
          )}
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">Nom Cloud</p>
            <h1 className="mt-1 break-words text-xl font-semibold">{details.schoolName}</h1>
            {[details.schoolAddress, details.schoolPhone, details.schoolEmail].filter(Boolean).map((line) => (
              <p key={line} className="mt-1 text-xs text-graphite">{line}</p>
            ))}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs uppercase tracking-wide text-graphite">{t('fees.receipt.title')}</p>
          <p className="mt-1 max-w-48 break-all text-sm font-semibold">{details.reference}</p>
        </div>
      </header>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{t('fees.receipt.paymentDetails')}</h2>
        <span className="inline-flex items-center rounded-full border border-emerald-700/30 px-3 py-1 text-xs font-semibold text-emerald-800">
          {details.status === 'verified' ? t('fees.receipt.verified') : t('fees.receipt.recorded')}
        </span>
      </div>

      <dl className="mt-5 grid gap-x-8 gap-y-5 border-b border-ink/10 pb-6 sm:grid-cols-2">
        <ReceiptRow label={t('fees.receipt.student')} value={details.studentName} />
        <ReceiptRow label={t('fees.receipt.studentId')} value={details.studentAdmissionNo} />
        <ReceiptRow label={t('fees.receipt.class')} value={details.className} />
        <ReceiptRow label={t('fees.receipt.academicYear')} value={details.academicYear} />
        <ReceiptRow label={t('fees.receipt.payer')} value={details.payerName} />
        <ReceiptRow label={t('fees.receipt.fee')} value={details.category} />
        <ReceiptRow label={t('fees.receipt.paymentDate')} value={paymentDate} />
        <ReceiptRow label={t('fees.receipt.method')} value={details.method} />
        <ReceiptRow label={t('fees.receipt.transactionReference')} value={details.providerReference} />
      </dl>

      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-b border-ink/10 text-left text-graphite">
            <th className="py-3 pr-4 font-medium">{t('fees.receipt.description')}</th>
            <th className="py-3 text-right font-medium">{t('fees.receipt.amount')}</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-ink/10">
            <td className="py-3 pr-4">
              {details.category}{details.academicYear ? ` · ${details.academicYear}` : ''}
            </td>
            <td className="py-3 text-right tabular-nums">{formatMoney(details.originalAmount, details.currency, true)}</td>
          </tr>
          <tr>
            <td className="py-3 pr-4 font-semibold">{t('fees.receipt.amountPaid')}</td>
            <td className="py-3 text-right font-semibold tabular-nums">{formatMoney(details.amountPaid, details.currency, true)}</td>
          </tr>
        </tbody>
      </table>

      <div className="mt-4 flex flex-wrap justify-end gap-x-8 gap-y-3 border-t border-ink/10 pt-4 text-sm">
        <p>
          <span className="text-graphite">{t('fees.receipt.remainingBalance')}: </span>
          <strong className="tabular-nums">{formatMoney(details.remainingBalance, details.currency, true)}</strong>
        </p>
      </div>
      <p className="mt-8 border-t border-ink/10 pt-5 text-xs leading-6 text-graphite">
        {details.status === 'verified' ? t('fees.receipt.verifiedNote') : t('fees.receipt.recordedNote')}
      </p>
    </article>
  )
}
