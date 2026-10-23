import { supabase } from '@/lib/supabase'
import { edgeFunctionErrorMessage } from '@/utils/edgeFunctionError'

export type PlatformFeatureKey =
  | 'operations_queue'
  | 'incident_command'
  | 'school_application_review'
  | 'billing_ledger'

export interface PlatformFeatureFlag {
  flag_key: PlatformFeatureKey
  enabled: boolean
  description: string
  updated_at: string
}

export interface PlatformMaintenanceSettings {
  singleton: boolean
  enabled: boolean
  message: string
  starts_at: string | null
  ends_at: string | null
  updated_at: string
}

export interface PlatformHealthCheck {
  id: string
  service_name: 'database' | 'operator_tables'
  status: 'healthy' | 'degraded' | 'unavailable' | 'unknown'
  duration_ms: number | null
  failure_code: string | null
  checked_at: string
}

export interface PlatformBackupCheck {
  id: string
  provider: 'supabase'
  status: 'records_found' | 'none_found' | 'unknown'
  backup_count: number | null
  latest_backup_at: string | null
  latest_backup_status: string | null
  error_code: string | null
  checked_at: string
}

export interface PlatformInvoice {
  id: string
  invoice_number: string
  school_id: string
  subscription_id: string | null
  amount_minor: number
  currency: string
  status: 'draft' | 'open' | 'overdue' | 'paid' | 'void'
  issued_at: string | null
  due_at: string | null
  created_at: string
}

export interface PlatformPayment {
  id: string
  invoice_id: string
  provider: string
  amount_minor: number
  currency: string
  status: 'pending' | 'succeeded' | 'failed' | 'refunded' | 'unknown'
  recorded_at: string
}

export interface PlatformBillingEvent {
  id: string
  invoice_id: string | null
  payment_id: string | null
  event_type: string
  from_status: string | null
  to_status: string | null
  created_at: string
}

export interface PlatformBillingLedger {
  invoices: PlatformInvoice[]
  payments: PlatformPayment[]
  events: PlatformBillingEvent[]
}

export async function fetchPlatformFeatureFlags(): Promise<PlatformFeatureFlag[]> {
  const { data, error } = await supabase
    .from('platform_feature_flags')
    .select('flag_key, enabled, description, updated_at')
    .order('flag_key')
  if (error) throw error
  return (data ?? []) as PlatformFeatureFlag[]
}

export async function updatePlatformFeatureFlag(
  flagKey: PlatformFeatureKey,
  enabled: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('platform_feature_flags')
    .update({ enabled })
    .eq('flag_key', flagKey)
    .select('flag_key')
    .single()
  if (error) throw error
}

export async function fetchPlatformMaintenanceSettings(): Promise<PlatformMaintenanceSettings> {
  const { data, error } = await supabase
    .from('platform_maintenance_settings')
    .select('singleton, enabled, message, starts_at, ends_at, updated_at')
    .eq('singleton', true)
    .single()
  if (error) throw error
  return data as PlatformMaintenanceSettings
}

export async function updatePlatformMaintenanceSettings(input: {
  enabled: boolean
  message: string
  startsAt: string | null
  endsAt: string | null
}): Promise<void> {
  const { error } = await supabase
    .from('platform_maintenance_settings')
    .update({
      enabled: input.enabled,
      message: input.message.trim(),
      starts_at: input.startsAt,
      ends_at: input.endsAt,
    })
    .eq('singleton', true)
    .select('singleton')
    .single()
  if (error) throw error
}

export async function fetchPlatformHealthChecks(): Promise<PlatformHealthCheck[]> {
  const { data, error } = await supabase
    .from('platform_health_checks')
    .select('id, service_name, status, duration_ms, failure_code, checked_at')
    .order('checked_at', { ascending: false })
    .limit(20)
  if (error) throw error
  return (data ?? []) as PlatformHealthCheck[]
}

export async function runPlatformHealthChecks(): Promise<void> {
  const { error } = await supabase.functions.invoke('platform-health-check', {
    body: {},
  })
  if (error) throw new Error(edgeFunctionErrorMessage(error, 'platform-health-check'))
}

export async function fetchPlatformBackupChecks(): Promise<PlatformBackupCheck[]> {
  const { data, error } = await supabase
    .from('platform_backup_checks')
    .select('id, provider, status, backup_count, latest_backup_at, latest_backup_status, error_code, checked_at')
    .order('checked_at', { ascending: false })
    .limit(10)
  if (error) throw error
  return (data ?? []) as PlatformBackupCheck[]
}

export async function checkPlatformBackupStatus(): Promise<void> {
  const { error } = await supabase.functions.invoke('platform-backup-status', {
    body: {},
  })
  if (error) throw new Error(edgeFunctionErrorMessage(error, 'platform-backup-status'))
}

export async function fetchPlatformBillingLedger(): Promise<PlatformBillingLedger> {
  const [invoices, payments, events] = await Promise.all([
    supabase
      .from('platform_invoices')
      .select('id, invoice_number, school_id, subscription_id, amount_minor, currency, status, issued_at, due_at, created_at')
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('platform_payments')
      .select('id, invoice_id, provider, amount_minor, currency, status, recorded_at')
      .order('recorded_at', { ascending: false })
      .limit(100),
    supabase
      .from('platform_billing_events')
      .select('id, invoice_id, payment_id, event_type, from_status, to_status, created_at')
      .order('created_at', { ascending: false })
      .limit(100),
  ])
  for (const result of [invoices, payments, events]) {
    if (result.error) throw result.error
  }
  return {
    invoices: (invoices.data ?? []) as PlatformInvoice[],
    payments: (payments.data ?? []) as PlatformPayment[],
    events: (events.data ?? []) as PlatformBillingEvent[],
  }
}
