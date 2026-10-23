import { supabase } from '@/lib/supabase'
import { edgeFunctionErrorMessage } from '@/utils/edgeFunctionError'

interface StartFeePaymentResult {
  transaction_id: string
  event_type: 'pending' | 'approved' | 'declined' | 'cancelled'
  processing_status: string
  amount: number
  currency: string
  mock: boolean
}

interface SettleFeePaymentResult {
  outcome: 'applied' | 'duplicate' | 'ignored' | 'rejected'
  processing_status: string
  fee_payment_id: string | null
  mock: boolean
}

async function invokePayment<T>(functionName: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(functionName, { body })
  if (error) throw new Error(edgeFunctionErrorMessage(error, functionName))
  if (data === null || typeof data !== 'object') throw new Error('Payment service returned an invalid response.')
  return data as T
}

export function startFeePayment(input: {
  feeRecordId: string
  amount: number
  accountNumber: string
}) {
  return invokePayment<StartFeePaymentResult>('start-fee-payment', {
    fee_record_id: input.feeRecordId,
    amount: input.amount,
    payment_method: 'mobile_money',
    account_no: input.accountNumber,
  })
}

export function settleFeePayment(transactionId: string) {
  return invokePayment<SettleFeePaymentResult>('settle-fee-payment', {
    transaction_id: transactionId,
  })
}
