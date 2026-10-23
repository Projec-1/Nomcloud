// ---------------------------------------------------------------------------
// settle-fee-payment
//
// Finishes a payment that start-fee-payment began. THE ONLY PATH THAT RECORDS
// MONEY, and it does so solely through apply_payment_event.
//
// POST { transaction_id }
//
//   1. Verify the caller's JWT.
//   2. Find the 'pending' event start-fee-payment recorded for this transaction.
//      That row, not the request, supplies the school, fee, amount, currency and
//      method.
//   3. Require that the caller may pay that fee, exactly as start does.
//   4. Mock safety: refuse any school that is not the demo school.
//   5. Commit through the provider adapter, which returns the provider's
//      outcome.
//   6. Record the outcome through apply_payment_event.
//
// SAFE TO CALL TWICE. The provider's answer for a settled transaction is the
// same message again, so the second call hits
// UNIQUE (provider, provider_event_id, event_type) and apply_payment_event
// returns 'duplicate' without creating a second payment. That is also exactly
// what happens if WaafiPay delivers one success twice.
//
// NEVER TRUSTS THE CALLER FOR MONEY. The request carries only a reference.
// The amount recorded is the provider's, and the ceiling is the existing
// amount_paid <= amount CHECK.
//
// NEVER WRITES fee_records, AND NEVER WRITES amount_paid. apply_payment_event
// inserts one fee_payments row; the existing trigger updates the balance.
// ---------------------------------------------------------------------------

import { getPaymentProvider, type PaymentMethod } from '../_shared/payments/provider.ts'
import {
  authenticate,
  corsHeaders,
  enforceMockSafety,
  errorResponse,
  HttpError,
  json,
  loadPayableFee,
} from '../_shared/payments/access.ts'

interface SettleRequest {
  transaction_id: string
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const clients = await authenticate(request)

    let input: SettleRequest
    try {
      input = (await request.json()) as SettleRequest
    } catch {
      throw new HttpError(400, 'Request body must be valid JSON')
    }

    if (typeof input.transaction_id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(input.transaction_id)) {
      throw new HttpError(400, 'transaction_id is required')
    }

    const provider = getPaymentProvider()

    // The pending event is the source of truth for what was started.
    const { data: started, error: startedError } = await clients.adminClient
      .from('payment_events')
      .select('school_id, fee_record_id, amount, currency, payment_method')
      .eq('provider', provider.name)
      .eq('provider_event_id', input.transaction_id)
      .eq('event_type', 'pending')
      .maybeSingle()

    if (startedError) {
      console.error('Pending fee payment lookup failed', startedError.code ?? 'unknown_database_error')
      throw new HttpError(500, 'Unable to verify the pending payment')
    }
    if (!started) throw new HttpError(404, 'No pending payment with that transaction id')

    const fee = await loadPayableFee(clients, started.fee_record_id)
    enforceMockSafety(provider.isMock, fee)

    const result = await provider.commit({
      transactionId: input.transaction_id,
      amount: Number(started.amount),
      currency: started.currency,
      method: started.payment_method as PaymentMethod,
    })

    const { data: applied, error: applyError } = await clients.adminClient.rpc('apply_payment_event', {
      p_school_id: fee.schoolId,
      p_provider: provider.name,
      p_provider_event_id: result.transactionId,
      p_payment_method: result.method,
      p_event_type: result.eventType,
      p_amount: result.amount,
      p_currency: result.currency,
      p_fee_record_id: fee.id,
      p_raw_payload: result.raw,
      p_is_mock: provider.isMock,
    })
    if (applyError) {
      console.error('Fee payment outcome could not be recorded', applyError.code ?? 'unknown_database_error')
      throw new HttpError(
        applyError.code === '42501' ? 403 : 500,
        applyError.code === '42501' ? 'You are not authorized to record this payment' : 'Payment status could not be recorded',
      )
    }

    return json({
      transaction_id: result.transactionId,
      event_type: result.eventType,
      outcome: applied.outcome,
      processing_status: applied.processing_status,
      fee_payment_id: applied.fee_payment_id,
      reason: applied.reason ?? null,
      mock: provider.isMock,
    })
  } catch (error) {
    return errorResponse(error)
  }
})
