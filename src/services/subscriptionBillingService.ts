import { supabase } from '@/lib/supabase'
import { edgeFunctionErrorMessage } from '@/utils/edgeFunctionError'

export interface SubscriptionPlanPrice {
  id: string
  code: 'starter' | 'growth' | 'enterprise'
  name: string
  monthly_price: number
  annual_price: number | null
  currency: string
}

export interface SubscriptionInvoice {
  id: string
  invoice_number: string
  subscription_plan_id: string | null
  billing_interval: 'monthly' | 'annual' | null
  amount_minor: number
  currency: string
  status: 'draft' | 'open' | 'overdue' | 'paid' | 'void'
  issued_at: string | null
  due_at: string | null
  billing_period_start: string | null
  billing_period_end: string | null
  created_at: string
}

export interface SubscriptionPayment {
  id: string
  invoice_id: string
  status: 'pending' | 'succeeded' | 'failed' | 'refunded' | 'unknown'
  recorded_at: string
}

export interface SubscriptionCheckoutResult {
  invoice_id: string
  invoice_number: string
  payment_id: string
  amount_minor: number
  currency: string
  status: 'pending' | 'succeeded' | 'failed' | 'unknown'
  subscription_id?: string | null
  period_start?: string | null
  period_end?: string | null
  message?: string | null
  mock?: boolean
  replayed?: boolean
}

interface BillingHistory {
  invoices: SubscriptionInvoice[]
  payments: SubscriptionPayment[]
}

async function invokeBilling<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('subscription-checkout', { body })
  if (error) throw new Error(edgeFunctionErrorMessage(error, 'subscription-checkout'))
  if (data === null || typeof data !== 'object') {
    throw new Error('Subscription billing service returned an invalid response.')
  }
  return data as T
}

export async function fetchSubscriptionPlanPrices(schoolId: string) {
  const result = await invokeBilling<{ plans: SubscriptionPlanPrice[] }>({
    action: 'catalog',
    school_id: schoolId,
  })
  if (!Array.isArray(result.plans)) throw new Error('Subscription plan catalogue is invalid.')
  return result.plans
}

export async function fetchSubscriptionBillingHistory(schoolId: string): Promise<BillingHistory> {
  const result = await invokeBilling<BillingHistory>({
    action: 'history',
    school_id: schoolId,
  })
  if (!Array.isArray(result.invoices) || !Array.isArray(result.payments)) {
    throw new Error('Subscription billing history is invalid.')
  }
  return result
}

export async function startSubscriptionCheckout(input: {
  schoolId: string
  planCode: 'starter' | 'growth'
  billingInterval: 'monthly' | 'annual'
  idempotencyKey: string
  accountNumber: string
}): Promise<SubscriptionCheckoutResult> {
  return invokeBilling<SubscriptionCheckoutResult>({
    action: 'start',
    school_id: input.schoolId,
    plan_code: input.planCode,
    billing_interval: input.billingInterval,
    idempotency_key: input.idempotencyKey,
    account_no: input.accountNumber,
  })
}

export async function submitEnterpriseSubscriptionEnquiry(input: {
  schoolId: string
  contactPerson: string
  email: string
  phone: string
  country: string
  studentRange: string
  campuses: string
  requirements: string
}) {
  return invokeBilling<{ submitted: boolean; enquiry_id: string }>({
    action: 'enterprise-enquiry',
    school_id: input.schoolId,
    enquiry: {
      contact_person: input.contactPerson,
      email: input.email,
      phone: input.phone,
      country: input.country,
      student_range: input.studentRange,
      campuses: input.campuses,
      requirements: input.requirements,
    },
  })
}
