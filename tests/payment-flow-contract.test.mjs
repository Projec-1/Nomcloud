import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { corsHeaders, errorResponse, HttpError } from '../supabase/functions/_shared/payments/http.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8')

test('payment errors expose actionable messages without returning internal details', async () => {
  const logged = []
  const originalConsoleError = console.error
  console.error = (...args) => logged.push(args)

  try {
    const response = errorResponse(new Error('internal database detail'))
    assert.equal(response.status, 500)
    assert.deepEqual(await response.json(), {
      error: 'The payment could not be completed. Check its status before retrying or contact the billing team.',
    })

    const expected = errorResponse(new HttpError(422, 'Enter a valid amount'))
    assert.equal(expected.status, 422)
    assert.deepEqual(await expected.json(), { error: 'Enter a valid amount' })
  } finally {
    console.error = originalConsoleError
  }

  assert.equal(logged.length, 1)
  assert.equal(logged[0].join(' '), 'Payment endpoint failed Error')
  assert.doesNotMatch(logged[0].join(' '), /internal database detail/)

  for (const relativePath of [
    'supabase/functions/_shared/payments/access.ts',
    'supabase/functions/start-fee-payment/index.ts',
    'supabase/functions/settle-fee-payment/index.ts',
    'supabase/functions/subscription-checkout/index.ts',
  ]) {
    assert.doesNotMatch(await read(relativePath), /\.message\b/)
  }
})

test('fee payment handlers advertise browser POST preflight headers', () => {
  assert.equal(corsHeaders['Access-Control-Allow-Methods'], 'POST, OPTIONS')
  assert.equal(
    corsHeaders['Access-Control-Allow-Headers'],
    'authorization, x-client-info, apikey, content-type',
  )
})

test('school subscription UI uses server billing data and reports only verified outcomes', async () => {
  const source = await read('src/pages/app/admin/SubscriptionBilling.tsx')
  assert.match(source, /fetchSubscriptionPlanPrices/)
  assert.match(source, /fetchSubscriptionBillingHistory/)
  assert.match(source, /startSubscriptionCheckout/)
  assert.match(source, /submitEnterpriseSubscriptionEnquiry/)
  assert.match(source, /checkoutResult\?\.status === 'unknown' \|\| checkoutResult\?\.status === 'pending'/)
  assert.doesNotMatch(source, /subscriptionDemoService|localStorage|simulateSuccess/)

  const edge = await read('supabase/functions/subscription-checkout/index.ts')
  assert.match(edge, /const clients = await authenticate\(request\)/)
  assert.match(edge, /Only an active school owner or director may manage billing/)
  assert.match(edge, /provider\.isMock && school\.is_demo !== true/)
  assert.match(edge, /provider\.purchase\(/)
  assert.match(edge, /result\.referenceId === referenceId/)
  assert.match(edge, /amountMinor === checkout\.amount_minor/)
  assert.match(edge, /status: 'unknown'/)
  assert.match(edge, /finalize_subscription_payment/)
})

test('parent fee UI settles through the student-fee service and requires an applied ledger row for success', async () => {
  const page = await read('src/pages/app/parent/Fees.tsx')
  assert.match(page, /startFeePayment\(/)
  assert.match(page, /settleFeePayment\(/)
  assert.match(page, /settled\.fee_payment_id && settled\.processing_status === 'applied'/)
  assert.match(page, /status: 'unknown'/)
  assert.match(page, /paymentInFlight\.current/)
  assert.match(page, /retryFeePaymentStatus/)
  assert.doesNotMatch(page, /recordPayment|localStorage|simulatePayment/)

  const service = await read('src/services/feePaymentService.ts')
  assert.match(service, /'start-fee-payment'/)
  assert.match(service, /'settle-fee-payment'/)

  const start = await read('supabase/functions/start-fee-payment/index.ts')
  assert.match(start, /rejectUnresolvedPayment/)
  assert.match(start, /A previous student-fee payment is still awaiting confirmation/)
  assert.match(start, /event_type', \['approved', 'declined', 'cancelled'\]/)
})

test('new payment experience translations exist in English, Somali, and Arabic', async () => {
  const source = await read('src/data/translations.ts')
  const english = source.split('\n  en: {')[1].split('\n  so: {')[0]
  const somali = source.split('\n  so: {')[1].split('\n  ar: {')[0]
  const arabic = source.split('\n  ar: {')[1]
  const keys = [
    'billing.catalog.error',
    'billing.checkout.walletNotice',
    'billing.checkout.walletPrivacy',
    'billing.payment.pendingWarning',
    'billing.payment.unknownWarning',
    'billing.payment.successDetail',
    'billing.enterpriseForm.submitted',
    'billing.enterpriseForm.submitError',
    'parent.fees.payment.payNow',
    'parent.fees.payment.phoneError',
    'parent.fees.payment.failed',
    'parent.fees.payment.succeeded',
    'parent.fees.payment.unknown',
    'parent.fees.payment.newAttempt',
  ]

  for (const key of keys) {
    assert.ok(english.includes(`'${key}':`), `English translation missing ${key}`)
    assert.ok(somali.includes(`'${key}':`), `Somali translation missing ${key}`)
    assert.ok(arabic.includes(`'${key}':`), `Arabic translation missing ${key}`)
  }
})
