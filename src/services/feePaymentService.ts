import { supabase } from '@/lib/supabase'

export type OnlinePaymentMethod = 'mobile_money' | 'card' | 'ussd' | 'bank_agent'
export type PaymentEventType = 'pending' | 'approved' | 'declined' | 'cancelled'
export type PaymentProcessingStatus = 'received' | 'applied' | 'rejected' | 'ignored'
export type PaymentOutcome = 'applied' | 'duplicate' | 'rejected' | 'ignored'

export interface StartedFeePayment {
  transactionId: string
  eventType: PaymentEventType
  amount: number
  currency: string
  mock: boolean
}

export interface SettledFeePayment {
  transactionId: string
  eventType: PaymentEventType
  outcome: PaymentOutcome
  processingStatus: PaymentProcessingStatus
  feePaymentId: string | null
  reason: string | null
  mock: boolean
}

function responseObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('The payment service returned an invalid response.')
  }
  return value as Record<string, unknown>
}

function paymentEventType(value: unknown): PaymentEventType {
  if (value === 'pending' || value === 'approved' || value === 'declined' || value === 'cancelled') return value
  throw new Error('The payment service returned an unknown transaction status.')
}

function paymentOutcome(value: unknown): PaymentOutcome {
  if (value === 'applied' || value === 'duplicate' || value === 'rejected' || value === 'ignored') return value
  throw new Error('The payment service returned an unknown processing result.')
}

function paymentProcessingStatus(value: unknown): PaymentProcessingStatus {
  if (value === 'received' || value === 'applied' || value === 'rejected' || value === 'ignored') return value
  throw new Error('The payment service returned an unknown processing status.')
}

export async function startFeePayment(input: {
  feeRecordId: string
  amount: number
  paymentMethod: OnlinePaymentMethod
  accountNo: string
}): Promise<StartedFeePayment> {
  const { data, error } = await supabase.functions.invoke('start-fee-payment', {
    body: {
      fee_record_id: input.feeRecordId,
      amount: input.amount,
      payment_method: input.paymentMethod,
      account_no: input.accountNo,
    },
  })
  if (error) throw new Error(error.message || 'Could not start the payment.')

  const result = responseObject(data)
  if (
    typeof result.transaction_id !== 'string' ||
    typeof result.amount !== 'number' ||
    typeof result.currency !== 'string' ||
    typeof result.mock !== 'boolean'
  ) {
    throw new Error('The payment service returned incomplete transaction details.')
  }

  return {
    transactionId: result.transaction_id,
    eventType: paymentEventType(result.event_type),
    amount: result.amount,
    currency: result.currency,
    mock: result.mock,
  }
}

export async function settleFeePayment(transactionId: string): Promise<SettledFeePayment> {
  const { data, error } = await supabase.functions.invoke('settle-fee-payment', {
    body: { transaction_id: transactionId },
  })
  if (error) throw new Error(error.message || 'Could not verify the payment status.')

  const result = responseObject(data)
  if (
    typeof result.transaction_id !== 'string' ||
    typeof result.processing_status !== 'string' ||
    typeof result.outcome !== 'string' ||
    typeof result.mock !== 'boolean'
  ) {
    throw new Error('The payment service returned incomplete verification details.')
  }

  return {
    transactionId: result.transaction_id,
    eventType: paymentEventType(result.event_type),
    outcome: paymentOutcome(result.outcome),
    processingStatus: paymentProcessingStatus(result.processing_status),
    feePaymentId: typeof result.fee_payment_id === 'string' ? result.fee_payment_id : null,
    reason: typeof result.reason === 'string' ? result.reason : null,
    mock: result.mock,
  }
}

export function isVerifiedFeePayment(result: SettledFeePayment): boolean {
  return (
    result.eventType === 'approved' &&
    (result.outcome === 'applied' || result.outcome === 'duplicate') &&
    result.processingStatus === 'applied' &&
    result.feePaymentId !== null
  )
}
