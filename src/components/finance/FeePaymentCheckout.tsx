import type { ReactNode } from 'react'
import type { SchoolRow } from '@/types/auth'
import { useLanguage } from '@/context/LanguageContext'
import type { FeeRecordView } from '@/services/financeService'
import { schoolLogoUrl } from '@/services/storageService'
import PaymentJourney from '@/components/finance/PaymentJourney'
import type { PendingFeeDemoTransaction } from '@/services/feePaymentDemoService'

interface FeePaymentCheckoutProps {
  fee: FeeRecordView
  school: SchoolRow | null
  payerName: string
  registrationNumber?: string
  pendingDemo?: PendingFeeDemoTransaction
  children: (open: () => void, pending: boolean, paid: boolean) => ReactNode
}

export default function FeePaymentCheckout({ fee, school, payerName, registrationNumber, pendingDemo, children }: FeePaymentCheckoutProps) {
  const { t } = useLanguage()

  return (
    <PaymentJourney
      kind="fee"
      schoolId={school?.id ?? 'school'}
      schoolName={school?.name ?? 'Nom Cloud School'}
      schoolLogoUrl={schoolLogoUrl(school?.logo_path ?? null)}
      schoolAddress={school?.address}
      schoolPhone={school?.phone}
      schoolEmail={school?.email}
      subjectName={fee.studentName}
      payerName={payerName || t('common.parentGuardian')}
      description={`${fee.category} · ${fee.termName}`}
      amount={fee.balance}
      originalAmount={fee.amount}
      alreadyPaid={fee.amountPaid}
      currency={fee.currency}
      dueDate={fee.dueDate}
      storageId={fee.id}
      allowPartial
      registrationNumber={registrationNumber}
      pendingDemo={pendingDemo}
      children={(open, busy, paid) => children(open, busy || Boolean(pendingDemo), paid)}
    />
  )
}
