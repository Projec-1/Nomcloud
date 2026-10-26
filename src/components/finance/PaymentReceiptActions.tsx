import { ArrowLeft, DownloadSimple, Printer } from '@phosphor-icons/react'
import Button from '@/components/ui/Button'
import type { PaymentReceiptDetails } from '@/components/finance/PaymentReceiptDocument'
import { downloadPaymentReceiptPdf } from '@/utils/paymentReceiptPdf'
import { printPaymentReceipt } from '@/utils/printPaymentReceipt'

export default function PaymentReceiptActions({
  details,
  t,
  returnLabel,
  onReturn,
  backLabel,
  onBack,
}: {
  details: PaymentReceiptDetails
  t: (key: string) => string
  returnLabel: string
  onReturn: () => void
  backLabel?: string
  onBack?: () => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {onBack && backLabel && (
        <Button variant="ghost" onClick={onBack} icon={<ArrowLeft className="h-4 w-4" />}>
          {backLabel}
        </Button>
      )}
      <Button
        variant="outline"
        onClick={() => downloadPaymentReceiptPdf(details, t)}
        icon={<DownloadSimple className="h-4 w-4" />}
      >
        {t('fees.checkout.downloadPdf')}
      </Button>
      <Button variant="outline" onClick={() => printPaymentReceipt(details.reference)} icon={<Printer className="h-4 w-4" />}>
        {t('fees.checkout.print')}
      </Button>
      <Button onClick={onReturn}>{returnLabel}</Button>
    </div>
  )
}
