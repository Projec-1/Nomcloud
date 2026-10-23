// ---------------------------------------------------------------------------
// Shared request handling for start-fee-payment and settle-fee-payment.
//
// Follows supabase/functions/approve-school-application/index.ts:
//   - the caller is verified from their own JWT with an anon-key client,
//   - authority is checked before anything is written,
//   - service-role work happens only after that check,
//   - secrets come only from Deno.env.get, never from the request.
//
// WHO MAY PAY A FEE (decision 1). Reused, not re-derived: the checks call the
// same SECURITY DEFINER helpers the finance RLS policies use, with the caller's
// own JWT, so "may pay" can never drift from "may see this fee".
//
//   owner / director / administrator of the fee's school  has_school_admin_role
//   guardian of the fee's student                          is_guardian_of_student
//
// Principal, teacher and platform operators are not included, matching
// migration 13's finance access model.
//
// THE MOCK SAFETY RULE. In mock mode a fee whose school is not
// schools.is_demo = true is refused here, before the provider adapter is called.
// apply_payment_event repeats the check in the database.
// ---------------------------------------------------------------------------

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { HttpError } from './http.ts'

export { corsHeaders, errorResponse, HttpError, json } from './http.ts'

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface Clients {
  userId: string
  callerClient: SupabaseClient
  adminClient: SupabaseClient
}

/** Verifies the bearer token and returns a caller client and a service-role client. */
export async function authenticate(request: Request): Promise<Clients> {
  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) throw new HttpError(401, 'Authentication is required')

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    throw new HttpError(500, 'Server authentication configuration is incomplete')
  }

  const token = authorization.slice('Bearer '.length)
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  })
  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  const { data, error } = await callerClient.auth.getUser(token)
  if (error || !data.user) throw new HttpError(401, 'Authentication is required')

  return { userId: data.user.id, callerClient, adminClient }
}

export interface FeeContext {
  id: string
  schoolId: string
  studentId: string
  amount: number
  amountPaid: number
  balance: number
  currency: string
  isDemoSchool: boolean
}

/**
 * Loads the fee with the service role, then requires that the CALLER may pay it.
 *
 * A fee the caller may not pay returns 403, not 404, only after the fee is
 * known to exist; an unknown id returns 404. Balance and currency always come
 * from the database, never from the request.
 */
export async function loadPayableFee(clients: Clients, feeRecordId: string): Promise<FeeContext> {
  const { data: fee, error } = await clients.adminClient
    .from('fee_records')
    .select('id, school_id, student_id, amount, amount_paid, currency')
    .eq('id', feeRecordId)
    .maybeSingle()

  if (error) {
    console.error('Fee lookup failed', error.code ?? 'unknown_database_error')
    throw new HttpError(500, 'Unable to load fee details')
  }
  if (!fee) throw new HttpError(404, 'Fee record not found')

  const [adminCheck, guardianCheck] = await Promise.all([
    clients.callerClient.rpc('has_school_admin_role', { p_school_id: fee.school_id }),
    clients.callerClient.rpc('is_guardian_of_student', { p_school_id: fee.school_id, p_student_id: fee.student_id }),
  ])
  if (adminCheck.error) {
    console.error('Fee administrator authorization check failed', adminCheck.error.code ?? 'unknown_database_error')
    throw new HttpError(500, 'Unable to verify payment permissions')
  }
  if (guardianCheck.error) {
    console.error('Fee guardian authorization check failed', guardianCheck.error.code ?? 'unknown_database_error')
    throw new HttpError(500, 'Unable to verify payment permissions')
  }
  if (adminCheck.data !== true && guardianCheck.data !== true) {
    throw new HttpError(403, 'You may not make a payment for this fee')
  }

  const { data: school, error: schoolError } = await clients.adminClient
    .from('schools')
    .select('is_demo')
    .eq('id', fee.school_id)
    .single()
  if (schoolError) {
    console.error('Fee school lookup failed', schoolError.code ?? 'unknown_database_error')
    throw new HttpError(500, 'Unable to verify the fee school')
  }

  const amount = Number(fee.amount)
  const amountPaid = Number(fee.amount_paid)
  return {
    id: fee.id,
    schoolId: fee.school_id,
    studentId: fee.student_id,
    amount,
    amountPaid,
    balance: Math.round((amount - amountPaid) * 100) / 100,
    currency: fee.currency,
    isDemoSchool: school.is_demo === true,
  }
}

/** THE HARD RULE: mock payments never touch a school that is not the demo school. */
export function enforceMockSafety(isMock: boolean, fee: FeeContext): void {
  if (isMock && !fee.isDemoSchool) {
    throw new HttpError(403, 'Mock payments are only permitted for the demo school')
  }
}
