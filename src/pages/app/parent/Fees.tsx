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
import {
  balanceAfterPayment,
  paymentMethodLabel,
  type FeePaymentView,
  type FeeRecordView,
  type FeeStatus,
} from '@/services/financeService'
import { formatDate, formatMoney } from '@/utils/format'
import FeePaymentCheckout from '@/components/finance/FeePaymentCheckout'
import PaymentReceiptDocument, { type PaymentReceiptDetails } from '@/components/finance/PaymentReceiptDocument'
import { schoolLogoUrl } from '@/services/storageService'

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
  const { state: feesState, reload: reloadFees } = useChildFees(selectedChild?.id ?? null)
  const [receiptForPrint, setReceiptForPrint] = useState<PaymentReceiptDetails | null>(null)

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

  const openReceipt = (payment: FeePaymentView, fee: FeeRecordView) => {
    setReceiptForPrint({
      schoolName: school?.name ?? '',
      schoolLogoUrl: schoolLogoUrl(school?.logo_path ?? null),
      schoolAddress: school?.address,
      schoolPhone: school?.phone,
      schoolEmail: school?.email,
      reference: payment.reference,
      studentName: fee.studentName,
      studentAdmissionNo: fee.studentAdmissionNo,
      className: fee.className,
      academicYear: fee.academicYear,
      payerName: profile?.full_name ?? t('common.parentGuardian'),
      category: fee.category,
      originalAmount: fee.amount,
      amountPaid: payment.amount,
      remainingBalance: balanceAfterPayment(fee, payment.id),
      currency: payment.currency,
      method: paymentMethodLabel(payment.method),
      paidOn: payment.paidOn,
      paidAt: payment.paidAt,
      providerReference: payment.providerReference,
      status: payment.provider ? 'verified' : 'recorded',
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

                    {f.balance > 0 && school?.is_demo && (
                      <div className="mt-4 border-t border-ink/5 pt-4 dark:border-white/10">
                        <FeePaymentCheckout fee={f} school={school} payerName={profile?.full_name ?? ''} onPaid={reloadFees}>
                          {(openCheckout, pending, paid) => (
                            <button
                              type="button"
                              onClick={openCheckout}
                              className="min-h-11 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                            >
                              {paid
                                ? t('fees.checkout.viewReceipt')
                                : pending
                                  ? t('fees.checkout.resumeStatus')
                                  : t('fees.checkout.payNow')}
                            </button>
                          )}
                        </FeePaymentCheckout>
                      </div>
                    )}

                    {f.payments.length > 0 && (
                      <div className="mt-4 space-y-2 border-t border-ink/5 pt-4 dark:border-white/10">
                        <p className="text-xs font-medium text-graphite">{t('parent.fees.paymentsReceived')}</p>
                        {f.payments.map((p) => (
                          <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-mist px-3 py-2.5 dark:bg-white/5">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-ink dark:text-white">
                                {formatMoney(p.amount, p.currency, true)}
                              </p>
                              <p className="truncate text-xs text-graphite">
                                {['cash', 'mobile_money', 'evc_plus', 'edahab', 'bank_transfer', 'card'].includes(p.method)
                                  ? t(`parent.fees.method.${p.method}`)
                                  : paymentMethodLabel(p.method)} · {p.reference} · {formatDate(p.paidOn)}
                              </p>
                              {p.provider && <p className="mt-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">{t('fees.receipt.verified')}</p>}
                            </div>
                            <button
                              type="button"
                              onClick={() => openReceipt(p, f)}
                              className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-graphite hover:bg-ink/5 hover:text-ink dark:hover:bg-white/10 dark:hover:text-white"
                            >
                              <Download className="h-3.5 w-3.5" /> {t('fees.receipt.savePdf')}
                            </button>
                            <button
                              type="button"
                              onClick={() => openReceipt(p, f)}
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
                  {school?.is_demo ? t('fees.checkout.testModeDescription') : t('parent.fees.paymentOffice')}
                </p>
              )}
            </>
          )
        }}
      </ResourceGate>
      {receiptForPrint && <PaymentReceiptDocument details={receiptForPrint} />}
    </div>
  )
}
