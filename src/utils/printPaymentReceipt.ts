export function printPaymentReceipt(reference: string) {
  const body = document.body
  const printMedia = window.matchMedia('print')
  const candidates = Array.from(document.querySelectorAll<HTMLDivElement>('.receipt-print-root'))
    .filter((root) => root.dataset.receiptReference === reference)
  const selected = candidates.find((root) => root.dataset.visibleReceipt === 'true') ?? candidates[0]
  if (!selected) throw new Error(`Could not find the receipt "${reference}" to print.`)

  let cleanedUp = false

  const cleanup = () => {
    if (cleanedUp) return
    cleanedUp = true
    body.classList.remove('printing-payment-receipt')
    selected.classList.remove('receipt-print-selected')
    window.removeEventListener('afterprint', cleanup)
    printMedia.removeEventListener('change', handleMediaChange)
  }
  const handleMediaChange = (event: MediaQueryListEvent) => {
    if (!event.matches) cleanup()
  }

  selected.classList.add('receipt-print-selected')
  body.classList.add('printing-payment-receipt')
  window.addEventListener('afterprint', cleanup, { once: true })
  printMedia.addEventListener('change', handleMediaChange)
  try {
    window.print()
  } finally {
    if (!printMedia.matches) cleanup()
  }
}
