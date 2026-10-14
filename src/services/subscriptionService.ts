import { supabase } from '@/lib/supabase'

export interface SchoolSubscription {
  id: string
  plan_id: string
  status: 'trialing' | 'active' | 'past_due' | 'cancelled' | 'expired'
  current_period_start: string
  current_period_end: string | null
  trial_ends_at: string | null
  cancelled_at: string | null
  plan: { name: string; code: string } | null
}

export async function fetchSchoolSubscription(schoolId: string): Promise<SchoolSubscription | null> {
  const liveResult = await supabase
    .from('school_subscriptions')
    .select(
      'id, plan_id, status, current_period_start, current_period_end, trial_ends_at, cancelled_at, plan:subscription_plans(name, code)',
    )
    .eq('school_id', schoolId)
    .in('status', ['trialing', 'active', 'past_due'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (liveResult.error) throw liveResult.error
  if (liveResult.data) {
    const plan = Array.isArray(liveResult.data.plan) ? liveResult.data.plan[0] ?? null : liveResult.data.plan
    return { ...liveResult.data, plan } as SchoolSubscription
  }

  const endedResult = await supabase
    .from('school_subscriptions')
    .select(
      'id, plan_id, status, current_period_start, current_period_end, trial_ends_at, cancelled_at, plan:subscription_plans(name, code)',
    )
    .eq('school_id', schoolId)
    .in('status', ['cancelled', 'expired'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (endedResult.error) throw endedResult.error
  if (!endedResult.data) return null
  const plan = Array.isArray(endedResult.data.plan) ? endedResult.data.plan[0] ?? null : endedResult.data.plan
  return { ...endedResult.data, plan } as SchoolSubscription
}
