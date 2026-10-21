import { supabase } from '@/lib/supabase'

export interface PlatformSchoolRecord {
  id: string
  shortcode: string
  name: string
  status: 'active' | 'suspended' | 'closed'
  address: string | null
  phone: string | null
  email: string | null
  country: string
  createdAt: string
  suspendedAt: string | null
  suspensionReason: string | null
  administratorName: string | null
  administratorEmail: string | null
  planName: string | null
  studentCount: number
  teacherCount: number
  lastActivityAt: string | null
}

export interface PlatformAuditRecord {
  id: string
  action: string
  actorEmail: string | null
  schoolId: string | null
  entityType: string
  entityId: string | null
  summary: string | null
  createdAt: string
}

export interface PlatformOperatorRecord {
  id: string
  userId: string
  fullName: string
  email: string
  grantedAt: string
  revokedAt: string | null
  team: string | null
}

export interface PlatformContactMessage {
  id: string
  name: string
  email: string
  topic: string
  message: string
  status: 'new' | 'handled'
  createdAt: string
}

interface SchoolRow {
  id: string
  shortcode: string
  name: string
  status: PlatformSchoolRecord['status']
  address: string | null
  phone: string | null
  email: string | null
  country: string
  created_at: string
  suspended_at: string | null
  suspension_reason: string | null
}

async function countRows(table: 'students' | 'teachers', schoolId: string): Promise<number> {
  const { count, error } = await supabase.from(table).select('id', { count: 'exact', head: true }).eq('school_id', schoolId)
  if (error) throw error
  return count ?? 0
}

export async function fetchPlatformSchools(): Promise<PlatformSchoolRecord[]> {
  const { data: schoolData, error: schoolsError } = await supabase
    .from('schools')
    .select('id, shortcode, name, status, address, phone, email, country, created_at, suspended_at, suspension_reason')
    .order('created_at', { ascending: false })
  if (schoolsError) throw schoolsError

  const rows = (schoolData ?? []) as SchoolRow[]
  if (rows.length === 0) return []

  const schoolIds = rows.map((row) => row.id)
  const [membershipsResult, subscriptionsResult, auditResult] = await Promise.all([
    supabase
      .from('memberships')
      .select('school_id, user_id, role')
      .in('school_id', schoolIds)
      .eq('status', 'active'),
    supabase
      .from('school_subscriptions')
      .select('school_id, plan_id, status, created_at')
      .in('school_id', schoolIds)
      .is('cancelled_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('audit_logs')
      .select('school_id, created_at')
      .in('school_id', schoolIds)
      .order('created_at', { ascending: false })
      .limit(5000),
  ])
  if (membershipsResult.error) throw membershipsResult.error
  if (subscriptionsResult.error) throw subscriptionsResult.error
  if (auditResult.error) throw auditResult.error

  const memberships = (membershipsResult.data ?? []) as { school_id: string; user_id: string; role: string }[]
  const adminRolePriority = ['owner', 'director', 'administrator', 'principal', 'admin']
  const adminMemberships = memberships
    .filter((row) => adminRolePriority.includes(row.role))
    .sort((left, right) => adminRolePriority.indexOf(left.role) - adminRolePriority.indexOf(right.role))
  const profileIds = Array.from(new Set(adminMemberships.map((row) => row.user_id)))
  const planIds = Array.from(new Set(
    ((subscriptionsResult.data ?? []) as { school_id: string; plan_id: string | null; status: string }[])
      .flatMap((row) => row.plan_id ? [row.plan_id] : []),
  ))

  const [profilesResult, plansResult, counts] = await Promise.all([
    profileIds.length
      ? supabase.from('profiles').select('id, school_id, full_name, email').in('id', profileIds)
      : Promise.resolve({ data: [], error: null }),
    planIds.length
      ? supabase.from('subscription_plans').select('id, name').in('id', planIds)
      : Promise.resolve({ data: [], error: null }),
    Promise.all(rows.map(async (row) => {
      const [studentCount, teacherCount] = await Promise.all([
        countRows('students', row.id),
        countRows('teachers', row.id),
      ])
      return [row.id, studentCount, teacherCount] as const
    })),
  ])
  if (profilesResult.error) throw profilesResult.error
  if (plansResult.error) throw plansResult.error

  const profiles = new Map(
    ((profilesResult.data ?? []) as { id: string; school_id: string | null; full_name: string; email: string }[])
      .map((profile) => [profile.id, profile]),
  )
  const planNames = new Map(
    ((plansResult.data ?? []) as { id: string; name: string }[]).map((plan) => [plan.id, plan.name]),
  )
  const subscriptions = new Map<string, { school_id: string; plan_id: string | null; status: string }>()
  for (const subscription of (subscriptionsResult.data ?? []) as { school_id: string; plan_id: string | null; status: string; created_at: string }[]) {
    if (!subscriptions.has(subscription.school_id)) subscriptions.set(subscription.school_id, subscription)
  }
  const latestActivity = new Map<string, string>()
  for (const event of (auditResult.data ?? []) as { school_id: string | null; created_at: string }[]) {
    if (event.school_id && !latestActivity.has(event.school_id)) latestActivity.set(event.school_id, event.created_at)
  }
  const countBySchool = new Map(counts.map(([id, students, teachers]) => [id, { students, teachers }]))

  return rows.map((row) => {
    const manager = adminMemberships
      .filter((membership) => membership.school_id === row.id)
      .map((membership) => profiles.get(membership.user_id))
      .find((profile) => profile !== undefined)
    const subscription = subscriptions.get(row.id)
    const count = countBySchool.get(row.id)
    return {
      id: row.id,
      shortcode: row.shortcode,
      name: row.name,
      status: row.status,
      address: row.address,
      phone: row.phone,
      email: row.email,
      country: row.country,
      createdAt: row.created_at,
      suspendedAt: row.suspended_at,
      suspensionReason: row.suspension_reason,
      administratorName: manager?.full_name ?? null,
      administratorEmail: manager?.email ?? null,
      planName: subscription?.plan_id ? planNames.get(subscription.plan_id) ?? 'Plan unavailable' : null,
      studentCount: count?.students ?? 0,
      teacherCount: count?.teachers ?? 0,
      lastActivityAt: latestActivity.get(row.id) ?? null,
    }
  })
}

export async function fetchPlatformAuditLogs(limit = 500): Promise<PlatformAuditRecord[]> {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('id, action, actor_email, school_id, entity_type, entity_id, summary, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return ((data ?? []) as {
    id: string
    action: string
    actor_email: string | null
    school_id: string | null
    entity_type: string
    entity_id: string | null
    summary: string | null
    created_at: string
  }[]).map((row) => ({
    id: row.id,
    action: row.action,
    actorEmail: row.actor_email,
    schoolId: row.school_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    summary: row.summary,
    createdAt: row.created_at,
  }))
}

export async function fetchPendingPlatformApplicationCount(): Promise<number> {
  const { count, error } = await supabase
    .from('school_applications')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
  if (error) throw error
  return count ?? 0
}

export async function fetchPlatformContactMessages(): Promise<PlatformContactMessage[]> {
  const { data, error } = await supabase
    .from('contact_messages')
    .select('id, name, email, topic, message, status, created_at')
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) throw error
  return ((data ?? []) as {
    id: string
    name: string
    email: string
    topic: string
    message: string
    status: 'new' | 'handled'
    created_at: string
  }[]).map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    topic: row.topic,
    message: row.message,
    status: row.status,
    createdAt: row.created_at,
  }))
}

export async function markPlatformContactMessageHandled(messageId: string, operatorId: string): Promise<void> {
  const { error } = await supabase
    .from('contact_messages')
    .update({ status: 'handled', handled_by: operatorId, handled_at: new Date().toISOString() })
    .eq('id', messageId)
    .select('id')
    .single()
  if (error) throw error
}

export async function updatePlatformSchoolStatus(
  schoolId: string,
  status: 'active' | 'suspended',
  suspensionReason: string | null = null,
): Promise<void> {
  const { error } = await supabase
    .from('schools')
    .update({
      status,
      suspended_at: status === 'suspended' ? new Date().toISOString() : null,
      suspension_reason: status === 'suspended' ? suspensionReason : null,
    })
    .eq('id', schoolId)
    .select('id')
    .single()
  if (error) throw error
}

export async function fetchPlatformOperators(): Promise<PlatformOperatorRecord[]> {
  const { data, error } = await supabase
    .from('platform_admins')
    .select('id, user_id, granted_at, revoked_at, profiles!platform_admins_user_id_fkey(full_name, email)')
    .order('granted_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as {
    id: string
    user_id: string
    granted_at: string
    revoked_at: string | null
    profiles: { full_name: string; email: string }[] | { full_name: string; email: string } | null
  }[]).map((row) => ({
    id: row.id,
    userId: row.user_id,
    fullName: (Array.isArray(row.profiles) ? row.profiles[0]?.full_name : row.profiles?.full_name) ?? 'Profile unavailable',
    email: (Array.isArray(row.profiles) ? row.profiles[0]?.email : row.profiles?.email) ?? '',
    grantedAt: row.granted_at,
    revokedAt: row.revoked_at,
    team: null,
  }))
}
