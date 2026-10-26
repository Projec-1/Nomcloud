import type { PaymentReceiptDetails } from '@/components/finance/PaymentReceiptDocument'
import { formatDate, formatMoney } from '@/utils/format'
import { downloadReceiptPdf } from '@/utils/receiptPdf'

export function downloadPaymentReceiptPdf(details: PaymentReceiptDetails, t: (key: string) => string) {
  const subscription = Boolean(details.isSubscription)
  const providerReference = details.providerReference && details.providerReference !== details.reference
    ? details.providerReference
    : undefined

  downloadReceiptPdf({
    title: subscription ? t('fees.checkout.subscriptionReceipt') : t('fees.receipt.title'),
    schoolName: details.schoolName,
    supportContact: [details.schoolPhone, details.schoolEmail].filter(Boolean).join(' · ') || undefined,
    receiptNumberLabel: t('billing.history.reference'),
    receiptNumber: details.reference,
    payerLabel: t('fees.receipt.payer'),
    payerName: subscription ? undefined : details.payerName,
    subjectLabel: subscription ? t('billing.order.school') : t('fees.receipt.student'),
    subjectName: details.studentName,
    registrationNumberLabel: t('fees.receipt.registrationNumber'),
    registrationNumber: subscription ? undefined : details.registrationNumber,
    descriptionLabel: subscription ? t('fees.checkout.subscriptionPlan') : t('fees.receipt.fee'),
    description: details.category,
    billingPeriodLabel: t('fees.checkout.billingPeriod'),
    billingPeriod: subscription ? details.billingPeriod : undefined,
    totalFeeLabel: t('fees.receipt.totalFee'),
    totalFee: !subscription ? formatMoney(details.originalAmount, details.currency, true) : undefined,
    previouslyPaidLabel: t('fees.receipt.previouslyPaid'),
    previouslyPaid: !subscription && details.totalPaid !== undefined && details.totalPaid > details.amountPaid
      ? formatMoney(Math.max(0, details.totalPaid - details.amountPaid), details.currency, true)
      : undefined,
    amountLabel: t('fees.receipt.amountPaid'),
    amount: formatMoney(details.amountPaid, details.currency, true),
    methodLabel: t('fees.receipt.method'),
    method: details.method,
    transactionReferenceLabel: t('fees.receipt.transactionReference'),
    transactionReference: subscription ? providerReference : undefined,
    dateLabel: t('fees.receipt.paymentDate'),
    date: formatDate(details.paidOn, { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }),
    statusLabel: t('billing.receipt.paymentStatus'),
    status: details.isTestPayment
      ? t('fees.receipt.testStatus')
      : details.status === 'verified'
        ? t('fees.receipt.verified')
        : t('fees.receipt.recorded'),
    remainingBalanceLabel: t('fees.receipt.remainingBalance'),
    remainingBalance: !subscription && details.remainingBalance !== undefined
      ? formatMoney(details.remainingBalance, details.currency, true)
      : undefined,
    demoNotice: details.isTestPayment ? t('fees.receipt.testNotice') : undefined,
  })
}
