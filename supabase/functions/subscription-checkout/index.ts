import {
  authenticate,
  corsHeaders,
  errorResponse,
  HttpError,
  json,
  UUID_RE,
} from '../_shared/payments/access.ts'
import { getPaymentProvider } from '../_shared/payments/provider.ts'

interface RequestBody {
  action?: unknown
  school_id?: unknown
  plan_code?: unknown
  billing_interval?: unknown
  idempotency_key?: unknown
  account_no?: unknown
  enquiry?: unknown
}

interface CheckoutRecord {
  invoice_id: string
  invoice_number: string
  payment_id: string
  amount_minor: number
  currency: string
  status: string
  replayed: boolean
  should_process: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function amountInMinorUnits(value: number) {
  return Math.round(value * 100)
}

async function requireBillingAccess(
  clients: Awaited<ReturnType<typeof authenticate>>,
  schoolId: string,
) {
  const [schoolResult, roleResult, featureResult] = await Promise.all([
    clients.adminClient
      .from('schools')
      .select('id, name, is_demo')
      .eq('id', schoolId)
      .maybeSingle(),
    clients.callerClient.rpc('has_school_billing_role', { p_school_id: schoolId }),
    clients.callerClient.rpc('is_platform_feature_enabled', { p_flag_key: 'billing_ledger' }),
  ])

  if (schoolResult.error) throw new HttpError(500, 'Unable to verify the school billing account')
  if (!schoolResult.data) throw new HttpError(404, 'School not found')
  if (roleResult.error || featureResult.error) {
    throw new HttpError(500, 'Unable to verify billing permissions')
  }
  if (roleResult.data !== true) throw new HttpError(403, 'Only an active school owner or director may manage billing')
  if (featureResult.data !== true) throw new HttpError(503, 'School billing is temporarily unavailable')
  return schoolResult.data
}

async function loadCatalog(adminClient: Awaited<ReturnType<typeof authenticate>>['adminClient']) {
  const { data, error } = await adminClient
    .from('subscription_plans')
    .select('id, code, name, price_monthly, price_annual, currency, is_public, sort_order')
    .eq('is_public', true)
    .order('sort_order', { ascending: true })

  if (error) throw new HttpError(500, 'Unable to load subscription plans')
  return (data ?? []).map((plan) => ({
    id: plan.id,
    code: plan.code,
    name: plan.name,
    monthly_price: Number(plan.price_monthly),
    annual_price: plan.price_annual === null ? null : Number(plan.price_annual),
    currency: plan.currency,
  }))
}

async function loadHistory(
  adminClient: Awaited<ReturnType<typeof authenticate>>['adminClient'],
  schoolId: string,
) {
  const { data: invoices, error: invoiceError } = await adminClient
    .from('platform_invoices')
    .select('id, invoice_number, subscription_plan_id, billing_interval, amount_minor, currency, status, issued_at, due_at, billing_period_start, billing_period_end, created_at')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (invoiceError) throw new HttpError(500, 'Unable to load subscription invoices')

  const invoiceIds = (invoices ?? []).map((invoice) => invoice.id)
  if (invoiceIds.length === 0) return { invoices: [], payments: [] }

  const { data: payments, error: paymentError } = await adminClient
    .from('platform_payments')
    .select('id, invoice_id, status, recorded_at')
    .in('invoice_id', invoiceIds)
    .order('recorded_at', { ascending: false })
    .limit(100)
  if (paymentError) throw new HttpError(500, 'Unable to load subscription payment history')
  return { invoices: invoices ?? [], payments: payments ?? [] }
}

async function startCheckout(
  clients: Awaited<ReturnType<typeof authenticate>>,
  body: RequestBody,
  schoolId: string,
) {
  if (body.plan_code !== 'starter' && body.plan_code !== 'growth') {
    throw new HttpError(400, 'Choose a fixed-price Starter or Growth plan')
  }
  if (body.billing_interval !== 'monthly' && body.billing_interval !== 'annual') {
    throw new HttpError(400, 'billing_interval must be monthly or annual')
  }
  if (typeof body.idempotency_key !== 'string' || !UUID_RE.test(body.idempotency_key)) {
    throw new HttpError(400, 'idempotency_key must be a UUID')
  }
  if (typeof body.account_no !== 'string') throw new HttpError(400, 'A mobile wallet number is required')
  const accountNo = body.account_no.replace(/[\s()+-]/g, '')
  if (!/^\d{10,20}$/.test(accountNo)) {
    throw new HttpError(400, 'Enter a full international mobile number with country code')
  }

  const school = await requireBillingAccess(clients, schoolId)
  const provider = getPaymentProvider()
  if (provider.isMock && school.is_demo !== true) {
    throw new HttpError(403, 'Sandbox or mock payments are only permitted for the reserved demo school')
  }

  const { data, error } = await clients.adminClient.rpc('create_subscription_checkout', {
    p_school_id: schoolId,
    p_plan_code: body.plan_code,
    p_billing_interval: body.billing_interval,
    p_idempotency_key: body.idempotency_key,
    p_actor_id: clients.userId,
  })
  if (error) {
    const status = error.code === '55000' || error.code === '23505' ? 409 : error.code === 'P0002' ? 404 : 500
    const message = error.code === '55000'
      ? 'An active or pending subscription checkout already exists for this school'
      : error.code === '23505'
        ? 'This checkout request conflicts with an existing order'
        : error.code === 'P0002'
          ? 'The selected subscription plan is unavailable'
          : 'Unable to prepare subscription checkout'
    console.error('Subscription checkout preparation failed', error.code ?? 'unknown_database_error')
    throw new HttpError(
      status,
      message,
    )
  }
  if (!isRecord(data) || typeof data.payment_id !== 'string') {
    throw new HttpError(500, 'Subscription checkout could not be prepared')
  }

  const checkout = data as unknown as CheckoutRecord
  if (!checkout.should_process) {
    return {
      invoice_id: checkout.invoice_id,
      invoice_number: checkout.invoice_number,
      payment_id: checkout.payment_id,
      amount_minor: checkout.amount_minor,
      currency: checkout.currency,
      status: checkout.status,
      replayed: true,
    }
  }

  const referenceId = `NC${body.idempotency_key.replaceAll('-', '')}`
  let result
  try {
    result = await provider.purchase({
      referenceId,
      invoiceId: checkout.invoice_number,
      amount: checkout.amount_minor / 100,
      currency: checkout.currency,
      method: 'mobile_money',
      accountNo,
    })
  } catch (error) {
    console.error(
      'WaafiPay subscription purchase failed',
      error instanceof Error ? error.name : 'UnknownProviderError',
    )
    return finalizeCheckout(clients, checkout, {
      status: 'unknown',
      providerPaymentId: null,
      providerEventId: null,
      amountMinor: null,
      currency: checkout.currency,
      mock: provider.isMock,
    })
  }

  const amountMinor = result.amount === null ? null : amountInMinorUnits(result.amount)
  const exactApprovedResult =
    result.eventType === 'approved' &&
    result.referenceId === referenceId &&
    result.transactionId !== null &&
    result.responseId !== null &&
    amountMinor === checkout.amount_minor &&
    result.currency === checkout.currency

  const status = exactApprovedResult
    ? 'succeeded'
    : result.eventType === 'declined' || result.eventType === 'cancelled'
      ? 'failed'
      : result.eventType === 'pending'
        ? 'pending'
        : 'unknown'

  return finalizeCheckout(clients, checkout, {
    status,
    providerPaymentId: result.transactionId,
    providerEventId: result.responseId,
    amountMinor,
    currency: result.currency,
    mock: provider.isMock,
  })
}

async function finalizeCheckout(
  clients: Awaited<ReturnType<typeof authenticate>>,
  checkout: CheckoutRecord,
  result: {
    status: 'succeeded' | 'failed' | 'pending' | 'unknown'
    providerPaymentId: string | null
    providerEventId: string | null
    amountMinor: number | null
    currency: string
    mock: boolean
  },
) {
  const { data, error } = await clients.adminClient.rpc('finalize_subscription_payment', {
    p_payment_id: checkout.payment_id,
    p_status: result.status,
    p_provider_payment_id: result.providerPaymentId,
    p_provider_event_id: result.providerEventId,
    p_amount_minor: result.amountMinor,
    p_currency: result.currency,
  })

  if (error || !isRecord(data)) {
    console.error('Unable to finalize subscription payment', error?.code ?? 'invalid_rpc_response')
    return json({
      invoice_id: checkout.invoice_id,
      invoice_number: checkout.invoice_number,
      payment_id: checkout.payment_id,
      amount_minor: checkout.amount_minor,
      currency: checkout.currency,
      status: 'unknown',
      message: 'Payment status could not be confirmed. Do not retry this payment; contact the school billing team with the invoice number.',
      mock: result.mock,
    }, 202)
  }

  return json({
    invoice_id: checkout.invoice_id,
    invoice_number: checkout.invoice_number,
    payment_id: checkout.payment_id,
    amount_minor: checkout.amount_minor,
    currency: checkout.currency,
    status: data.status,
    subscription_id: data.subscription_id ?? null,
    period_start: data.period_start ?? null,
    period_end: data.period_end ?? null,
    message: data.status === 'unknown'
      ? 'Payment status could not be confirmed. Do not retry this payment; contact the school billing team with the invoice number.'
      : null,
    mock: result.mock,
  }, data.status === 'succeeded' || data.status === 'failed' ? 200 : 202)
}

async function submitEnterpriseEnquiry(
  clients: Awaited<ReturnType<typeof authenticate>>,
  schoolId: string,
  value: unknown,
) {
  if (!isRecord(value)) throw new HttpError(400, 'Enterprise enquiry details are required')
  const school = await requireBillingAccess(clients, schoolId)
  const name = typeof value.contact_person === 'string' ? value.contact_person.trim() : ''
  const email = typeof value.email === 'string' ? value.email.trim().toLowerCase() : ''
  const phone = typeof value.phone === 'string' ? value.phone.trim() : ''
  const country = typeof value.country === 'string' ? value.country.trim() : ''
  const studentRange = typeof value.student_range === 'string' ? value.student_range : ''
  const campuses = value.campuses === '' || value.campuses === null || value.campuses === undefined
    ? null
    : Number(value.campuses)
  const requirements = typeof value.requirements === 'string' ? value.requirements.trim() : ''

  if (name.length < 2 || name.length > 120) throw new HttpError(400, 'Enter a valid contact name')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new HttpError(400, 'Enter a valid contact email')
  }
  if (phone && (!/^[+()\d\s.-]{7,30}$/.test(phone))) throw new HttpError(400, 'Enter a valid phone number')
  if (country.length < 2 || country.length > 100) throw new HttpError(400, 'Enter the school country')
  if (!['under-300', '300-1200', '1201-3000', 'over-3000'].includes(studentRange)) {
    throw new HttpError(400, 'Choose a student range')
  }
  if (campuses !== null && (!Number.isInteger(campuses) || campuses < 1 || campuses > 1000)) {
    throw new HttpError(400, 'Campus count must be a whole number from 1 to 1000')
  }
  if (requirements.length > 4000) throw new HttpError(400, 'Requirements must be 4000 characters or fewer')

  const message = [
    `Enterprise subscription enquiry for ${school.name}.`,
    `Country: ${country}`,
    `Student range: ${studentRange}`,
    `Campuses: ${campuses ?? 'Not specified'}`,
    `Phone: ${phone || 'Not provided'}`,
    `Requirements: ${requirements || 'Not provided'}`,
  ].join('\n')
  const { data, error } = await clients.adminClient
    .from('contact_messages')
    .insert({ name, email, topic: 'Enterprise Subscription', message })
    .select('id')
    .single()
  if (error) throw new HttpError(500, 'Unable to save the enterprise enquiry')

  return { submitted: true, enquiry_id: data.id }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const clients = await authenticate(request)
    let parsed: unknown
    try {
      parsed = await request.json()
    } catch {
      throw new HttpError(400, 'Request body must be valid JSON')
    }
    if (!isRecord(parsed)) throw new HttpError(400, 'Request body must be a JSON object')
    const body = parsed as RequestBody

    if (typeof body.school_id !== 'string' || !UUID_RE.test(body.school_id)) {
      throw new HttpError(400, 'school_id must be a UUID')
    }
    const schoolId = body.school_id

    switch (body.action) {
      case 'catalog': {
        await requireBillingAccess(clients, schoolId)
        return json({ plans: await loadCatalog(clients.adminClient) })
      }
      case 'history': {
        await requireBillingAccess(clients, schoolId)
        return json(await loadHistory(clients.adminClient, schoolId))
      }
      case 'start': {
        const result = await startCheckout(clients, body, schoolId)
        return result instanceof Response ? result : json(result)
      }
      case 'enterprise-enquiry':
        return json(await submitEnterpriseEnquiry(clients, schoolId, body.enquiry), 201)
      default:
        throw new HttpError(400, 'Unsupported subscription billing action')
    }
  } catch (error) {
    return errorResponse(error)
  }
})
