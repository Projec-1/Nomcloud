// ---------------------------------------------------------------------------
// start-fee-payment
//
// Starts a WaafiPay payment against one fee. CANNOT CREATE A PAYMENT: the only
// event it can record is 'pending' or 'declined', and apply_payment_event marks
// both 'ignored'. Money is recorded only by settle-fee-payment.
//
// POST { fee_record_id, amount, payment_method, account_no }
//
//   1. Verify the caller's JWT.
//   2. Require that the caller may pay this fee (decision 1): a guardian of the
//      fee's student, or owner / director / administrator of its school.
//   3. Mock safety: in mock mode, refuse any school that is not the demo school.
//   4. Validate the amount against the REAL remaining balance read from the
//      database: greater than zero, at most the balance, two decimal places.
//      The full balance is required until a school policy for partial payments
//      exists.
//   5. PreAuthorize through the provider adapter.
//   6. Record the provider's answer through apply_payment_event.
//   7. Return the transaction reference for settle-fee-payment.
//
// The balance check here is a courtesy that gives a clear error early. The
// guarantee is the existing fee_records CHECK amount_paid <= amount, enforced
// when a payment is applied, so two payments started at once against the same
// balance cannot both succeed.
//
// NEVER WRITES fee_records, AND NEVER WRITES amount_paid.
// ---------------------------------------------------------------------------

import { getPaymentProvider, PAYMENT_METHODS, type PaymentMethod } from '../_shared/payments/provider.ts'
import {
  authenticate,
  corsHeaders,
  enforceMockSafety,
  errorResponse,
  HttpError,
  json,
  loadPayableFee,
  UUID_RE,
} from '../_shared/payments/access.ts'

interface StartRequest {
  fee_record_id: string
  amount: number
  payment_method: PaymentMethod
  account_no: string
  require_mock?: boolean
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const clients = await authenticate(request)

    let input: StartRequest
    try {
      input = (await request.json()) as StartRequest
    } catch {
      throw new HttpError(400, 'Request body must be valid JSON')
    }

    if (typeof input.fee_record_id !== 'string' || !UUID_RE.test(input.fee_record_id)) {
      throw new HttpError(400, 'fee_record_id must be a UUID')
    }
    if (!PAYMENT_METHODS.includes(input.payment_method)) {
      throw new HttpError(400, `payment_method must be one of ${PAYMENT_METHODS.join(', ')}`)
    }
    if (typeof input.account_no !== 'string' || !/^\+?\d{6,15}$/.test(input.account_no)) {
      throw new HttpError(400, 'account_no must be 6 to 15 digits')
    }
    if (
      typeof input.amount !== 'number' ||
      !Number.isFinite(input.amount) ||
      input.amount <= 0 ||
      // Tolerant of binary floating point: 0.1 * 100 is 10.000000000000002.
      Math.abs(Math.round(input.amount * 100) - input.amount * 100) > 1e-6
    ) {
      throw new HttpError(400, 'amount must be a positive number with at most two decimal places')
    }

    const fee = await loadPayableFee(clients, input.fee_record_id)

    const provider = getPaymentProvider()
    if (input.require_mock === true && !provider.isMock) {
      throw new HttpError(503, 'Test payments are unavailable while the live payment provider is active')
    }
    enforceMockSafety(provider.isMock, fee)

    if (fee.balance <= 0) throw new HttpError(409, 'This fee is already fully paid')
    if (input.amount > fee.balance) {
      throw new HttpError(422, `amount exceeds the remaining balance of ${fee.balance.toFixed(2)} ${fee.currency}`)
    }
    if (Math.round(input.amount * 100) !== Math.round(fee.balance * 100)) {
      throw new HttpError(422, 'Partial fee payments are not currently enabled')
    }

    const result = await provider.preAuthorize({
      referenceId: crypto.randomUUID(),
      amount: input.amount,
      currency: fee.currency,
      method: input.payment_method,
      accountNo: input.account_no,
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
    if (applyError) throw new HttpError(applyError.code === '42501' ? 403 : 500, applyError.message)

    return json({
      transaction_id: result.transactionId,
      event_type: result.eventType,
      processing_status: applied.processing_status,
      amount: result.amount,
      currency: result.currency,
      remaining_balance: fee.balance,
      mock: provider.isMock,
    })
  } catch (error) {
    return errorResponse(error)
  }
})
