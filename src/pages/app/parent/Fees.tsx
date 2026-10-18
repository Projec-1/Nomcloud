import { Wallet, CreditCard, CheckCircle as CheckCircle2, Download, Printer } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import { useSelectedChild } from '@/hooks/useSelectedChild'
import { useChildFees } from '@/hooks/useFinance'
import PageHeader from '@/components/ui/PageHeader'
import ChildSwitcher from '@/components/dashboard/ChildSwitcher'
import ResourceGate from '@/components/ui/ResourceGate'
import StatCard from '@/components/ui/StatCard'
import Badge from '@/components/ui/Badge'
import { paymentMethodLabel, type FeePaymentView, type FeeStatus } from '@/services/financeService'
import { formatDate, formatMoney } from '@/utils/format'
import { downloadReceiptImage } from '@/utils/receipt'
import { schoolLogoUrl } from '@/services/storageService'

// ---------------------------------------------------------------------------
// Phase 8 batch 6. Real fee_records and fee_payments for the selected child.
//
// READ ONLY, AND THE "PAY NOW" FLOW IS REMOVED. This is the most consequential
// deletion in Phase 8 so far, so the reasoning is recorded here in full.
//
// The prototype offered a Pay Now button which:
//   1. waited 1.1 seconds to simulate a gateway,
//   2. generated a reference as `PAY<timestamp>`,
//   3. called the mock recordPayment,
//   4. showed "Payment successful" and offered a receipt to download.
//
// No money moved at any point, and none could. A guardian holds SELECT and
// nothing else on fee_payments — there is no guardian INSERT policy, by design:
// C.5 states a guardian-initiated payment belongs to a real payment flow, never
// to a direct row insert. Against the real database that write is refused.
//
// Left in place, the button would have told a parent their fees were paid, and
// handed them a receipt as evidence, while the school's books showed the money
// still outstanding. That is the worst failure available on this screen, so the
// control is deleted rather than disabled. This closes open decision 4.
//
// THE RECEIPT IS KEPT, AND NOW MEANS SOMETHING. It is attached to payments the
// school has actually recorded, read from fee_payments, instead of to a
// simulated one. A parent downloading proof of a real receipted payment is a
// legitimate read.
//
// Status is derived at read from amount, amount_paid and due_date against the
// school's today, exactly as the admin page derives it. There is no status
// column and nothing here writes one.
// ---------------------------------------------------------------------------

const statusTone: Record<FeeStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  paid: 'success',
  partial: 'warning',
  unpaid: 'neutral',
  overdue: 'danger',
}

export default function ParentFees() {
  const { profile, school } = useAuth()
  const { t } = useLanguage()
  const { children, selectedChild, selectChild, state } = useSelectedChild()
  const { state: feesState } = useChildFees(selectedChild?.id ?? null)
  const [receiptForPrint, setReceiptForPrint] = useState<{ payment: FeePaymentView; category: string } | null>(null)

  useEffect(() => {
    if (!receiptForPrint) return
    const print = () => window.print()
    const clear = () => setReceiptForPrint(null)
    window.addEventListener('afterprint', clear, { once: true })
    const timer = window.setTimeout(print, 0)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('afterprint', clear)
    }
  }, [receiptForPrint])

  if (!selectedChild) {
    return (
      <div>
        <PageHeader title={t('parent.fees.title')} description={t('parent.fees.description')} />
        <ResourceGate
          state={state}
          empty={{ icon: Wallet, title: t('parent.fees.noChildren'), description: t('parent.fees.contactSchool') }}
          deniedHint={t('parent.fees.access')}
        >
          {() => null}
        </ResourceGate>
      </div>
    )
  }

  const handleDownloadReceipt = (payment: FeePaymentView, category: string) => {
    downloadReceiptImage({
      reference: payment.reference,
      schoolName: school?.name ?? '',
      schoolLogoUrl: schoolLogoUrl(school?.logo_path ?? null),
      studentName: selectedChild.name,
      category,
      amount: payment.amount,
      method: payment.method,
      payerName: profile?.full_name ?? 'Parent',
      date: payment.paidOn,
    })
  }

  return (
    <div>
      <PageHeader
        title={t('parent.fees.title')}
        description={`${selectedChild.name} · ${selectedChild.className ?? ''}`}
        actions={<ChildSwitcher children={children} selectedId={selectedChild.id} onSelect={selectChild} classLabel={(c) => c.className ?? ''} />}
      />

      <ResourceGate
        state={feesState}
        empty={{
          icon: Wallet,
          title: t('parent.fees.noRecords'),
          description: t('parent.fees.noRecordsDescription'),
        }}
        deniedHint={t('parent.fees.access')}
      >
        {(records) => {
          const currency = records[0]?.currency ?? school?.currency ?? 'USD'
          const totalDue = records.reduce((sum, f) => sum + f.amount, 0)
          const totalPaid = records.reduce((sum, f) => sum + f.amountPaid, 0)
          const balance = Math.max(0, totalDue - totalPaid)

          return (
            <>
              <div className="mb-6 grid gap-5 sm:grid-cols-3">
                <StatCard label={t('parent.fees.total')} value={formatMoney(totalDue, currency)} icon={Wallet} tint="#0071E3" />
                <StatCard label={t('parent.fees.paid')} value={formatMoney(totalPaid, currency)} icon={CheckCircle2} tint="#34A853" />
                <StatCard
                  label={t('parent.fees.balance')}
                  value={formatMoney(balance, currency)}
                  icon={CreditCard}
                  tint={balance > 0 ? '#F59E0B' : '#34A853'}
                />
              </div>

              <div className="space-y-4">
                {records.map((f) => (
                  <div key={f.id} className="card p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="mb-1.5 flex flex-wrap items-center gap-2">
                          <Badge tone={statusTone[f.status]}>{t(`parent.fees.status.${f.status}`)}</Badge>
                          <span className="text-xs text-graphite">{f.termName}</span>
                        </div>
                        <p className="font-medium text-ink dark:text-white">{f.category}</p>
                        <p className="mt-1 text-xs text-graphite">{t('parent.fees.due', { date: formatDate(f.dueDate) })}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-ink dark:text-white">{formatMoney(f.amount, f.currency, true)}</p>
                        <p className="text-xs text-graphite">
                          {t('parent.fees.paidAmount', { amount: formatMoney(f.amountPaid, f.currency, true) })}
                          {f.balance > 0 ? ` · ${t('parent.fees.outstanding', { amount: formatMoney(f.balance, f.currency, true) })}` : ''}
                        </p>
                      </div>
                    </div>

                    {f.payments.length > 0 && (
                      <div className="mt-4 space-y-2 border-t border-ink/5 pt-4 dark:border-white/10">
                        <p className="text-xs font-medium text-graphite">{t('parent.fees.paymentsReceived')}</p>
                        {f.payments.map((p) => (
                          <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl bg-mist px-3 py-2.5 dark:bg-white/5">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-ink dark:text-white">
                                {formatMoney(p.amount, p.currency, true)}
                              </p>
                              <p className="truncate text-xs text-graphite">
                                {['cash', 'mobile_money', 'evc_plus', 'edahab', 'bank_transfer', 'card'].includes(p.method)
                                  ? t(`parent.fees.method.${p.method}`)
                                  : paymentMethodLabel(p.method)} · {p.reference} · {formatDate(p.paidOn)}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDownloadReceipt(p, f.category)}
                              className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-graphite hover:bg-ink/5 hover:text-ink dark:hover:bg-white/10 dark:hover:text-white"
                            >
                              <Download className="h-3.5 w-3.5" /> {t('parent.fees.receipt')}
                            </button>
                            <button
                              type="button"
                              onClick={() => setReceiptForPrint({ payment: p, category: f.category })}
                              className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-graphite hover:bg-ink/5 hover:text-ink dark:hover:bg-white/10 dark:hover:text-white"
                            >
                              <Printer className="h-3.5 w-3.5" /> {t('parent.fees.print')}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {balance > 0 && (
                <p className="mt-5 rounded-2xl border border-ink/5 bg-white/60 px-4 py-3 text-xs text-graphite dark:border-white/10 dark:bg-white/[0.03]">
                  {t('parent.fees.paymentOffice')}
                </p>
              )}
            </>
          )
        }}
      </ResourceGate>
      {receiptForPrint && selectedChild && (
        <article className="print-only print-document">
          <header className="mb-8 flex items-start justify-between gap-6 border-b border-gray-300 pb-5">
            <div>
              <h1 className="text-2xl font-semibold">{school?.name ?? 'Nom Cloud School'}</h1>
              <p className="mt-2 text-sm text-gray-600">{t('parent.fees.receiptTitle')}</p>
            </div>
            {school?.logo_path && (
              <img src={schoolLogoUrl(school.logo_path) ?? undefined} alt="" className="h-16 w-16 object-contain" />
            )}
          </header>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-5 text-sm">
            <div><dt className="text-gray-500">{t('parent.fees.reference')}</dt><dd className="mt-1 font-semibold">{receiptForPrint.payment.reference}</dd></div>
            <div><dt className="text-gray-500">{t('parent.fees.paymentDate')}</dt><dd className="mt-1 font-semibold">{formatDate(receiptForPrint.payment.paidOn)}</dd></div>
            <div><dt className="text-gray-500">{t('parent.fees.student')}</dt><dd className="mt-1 font-semibold">{selectedChild.name}</dd></div>
            <div><dt className="text-gray-500">{t('parent.fees.payer')}</dt><dd className="mt-1 font-semibold">{profile?.full_name ?? t('common.parentGuardian')}</dd></div>
            <div><dt className="text-gray-500">{t('parent.fees.category')}</dt><dd className="mt-1 font-semibold">{receiptForPrint.category}</dd></div>
            <div><dt className="text-gray-500">{t('parent.fees.method')}</dt><dd className="mt-1 font-semibold">{['cash', 'mobile_money', 'evc_plus', 'edahab', 'bank_transfer', 'card'].includes(receiptForPrint.payment.method)
              ? t(`parent.fees.method.${receiptForPrint.payment.method}`)
              : paymentMethodLabel(receiptForPrint.payment.method)}</dd></div>
          </dl>
          <div className="mt-8 border-y border-gray-300 py-5">
            <p className="text-sm text-gray-500">{t('parent.fees.amountReceived')}</p>
            <p className="mt-2 text-3xl font-semibold">{formatMoney(receiptForPrint.payment.amount, receiptForPrint.payment.currency, true)}</p>
          </div>
          <p className="mt-8 text-xs text-gray-500">{t('parent.fees.receiptDisclaimer')}</p>
        </article>
      )}
    </div>
  )
}
