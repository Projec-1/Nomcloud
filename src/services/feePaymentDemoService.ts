import type { PaymentReceiptDetails } from '@/components/finance/PaymentReceiptDocument'
import type { CheckoutMethodId } from '@/components/finance/PaymentJourney'

export interface PendingFeeDemoTransaction {
  reference: string
  amount: number
  method: CheckoutMethodId
  methodLabel: string
  createdAt: string
  lastCheckedAt: string | null
}

function storageKey(schoolId: string, feeId: string) {
  return `nomcloud:fee-payment-demo:${encodeURIComponent(schoolId)}:${encodeURIComponent(feeId)}`
}

function pendingStorageKey(schoolId: string, feeId: string) {
  return `${storageKey(schoolId, feeId)}:pending`
}

function isPendingDemoTransaction(value: unknown): value is PendingFeeDemoTransaction {
  if (typeof value !== 'object' || value === null) return false
  const transaction = value as Partial<PendingFeeDemoTransaction>
  return typeof transaction.reference === 'string'
    && Number.isFinite(transaction.amount)
    && Number(transaction.amount) > 0
    && typeof transaction.method === 'string'
    && typeof transaction.methodLabel === 'string'
    && typeof transaction.createdAt === 'string'
    && Number.isFinite(Date.parse(transaction.createdAt))
    && (transaction.lastCheckedAt === null
      || (typeof transaction.lastCheckedAt === 'string' && Number.isFinite(Date.parse(transaction.lastCheckedAt))))
}

function isDemoReceipt(value: unknown): value is PaymentReceiptDetails {
  if (typeof value !== 'object' || value === null) return false
  const receipt = value as Partial<PaymentReceiptDetails>
  return receipt.isTestPayment === true &&
    receipt.isSubscription !== true &&
    typeof receipt.reference === 'string' &&
    typeof receipt.providerReference === 'string' &&
    Number.isFinite(receipt.amountPaid) &&
    Number(receipt.amountPaid) > 0 &&
    typeof receipt.currency === 'string' &&
    typeof receipt.paidOn === 'string' &&
    Number.isFinite(Date.parse(receipt.paidOn)) &&
    Number.isFinite(receipt.remainingBalance)
}

export function loadFeeDemoReceipts(schoolId: string, feeId: string): PaymentReceiptDetails[] {
  const raw = window.localStorage.getItem(storageKey(schoolId, feeId))
  if (!raw) return []
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new Error('Stored fee demonstration receipts are invalid. Clear this fee’s local demo receipt data to continue.')
  }
  if (!Array.isArray(value) || !value.every(isDemoReceipt)) {
    throw new Error('Stored fee demonstration receipts are invalid. Clear this fee’s local demo receipt data to continue.')
  }
  return value
}

export function recordFeeDemoReceipt(schoolId: string, feeId: string, receipt: PaymentReceiptDetails) {
  if (!schoolId || !feeId || !isDemoReceipt(receipt)) throw new Error('Valid fee and demonstration receipt details are required.')
  const previous = loadFeeDemoReceipts(schoolId, feeId)
  if (previous.some((entry) => entry.providerReference === receipt.providerReference)) return
  window.localStorage.setItem(storageKey(schoolId, feeId), JSON.stringify([receipt, ...previous]))
}

export function loadPendingFeeDemoTransactions(schoolId: string, feeId: string): PendingFeeDemoTransaction[] {
  const raw = window.localStorage.getItem(pendingStorageKey(schoolId, feeId))
  if (!raw) return []
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new Error('Stored pending demonstration payments are invalid. Clear this fee’s local demo payment data to continue.')
  }
  if (!Array.isArray(value) || !value.every(isPendingDemoTransaction)) {
    throw new Error('Stored pending demonstration payments are invalid. Clear this fee’s local demo payment data to continue.')
  }
  return value
}

export function recordPendingFeeDemoTransaction(
  schoolId: string,
  feeId: string,
  transaction: PendingFeeDemoTransaction,
): PendingFeeDemoTransaction[] {
  if (!schoolId || !feeId || !isPendingDemoTransaction(transaction)) {
    throw new Error('Valid fee and pending demonstration payment details are required.')
  }
  const previous = loadPendingFeeDemoTransactions(schoolId, feeId)
  const existing = previous.find((entry) => entry.reference === transaction.reference)
  if (existing) return previous
  const next = [transaction, ...previous]
  window.localStorage.setItem(pendingStorageKey(schoolId, feeId), JSON.stringify(next))
  return next
}

export function markPendingFeeDemoChecked(
  schoolId: string,
  feeId: string,
  transactionReference: string,
  checkedAt = new Date().toISOString(),
): PendingFeeDemoTransaction {
  const previous = loadPendingFeeDemoTransactions(schoolId, feeId)
  const index = previous.findIndex((entry) => entry.reference === transactionReference)
  if (index < 0) throw new Error('Pending demonstration payment was not found. Refresh fees and try again.')
  const updated = { ...previous[index], lastCheckedAt: checkedAt }
  const next = [...previous]
  next[index] = updated
  window.localStorage.setItem(pendingStorageKey(schoolId, feeId), JSON.stringify(next))
  return updated
}
