import { supabase } from '@/lib/supabase'

export type PlatformCaseStatus = 'open' | 'investigating' | 'waiting' | 'escalated' | 'resolved' | 'closed'
export type PlatformCasePriority = 'low' | 'normal' | 'high' | 'urgent'
export type PlatformCaseSeverity = 'sev1' | 'sev2' | 'sev3' | 'sev4'
export type PlatformCaseType = 'support' | 'account' | 'billing' | 'technical' | 'school_request' | 'incident' | 'other'

export interface PlatformCase {
  id: string
  title: string
  caseType: PlatformCaseType
  status: PlatformCaseStatus
  priority: PlatformCasePriority
  severity: PlatformCaseSeverity
  description: string
  schoolId: string | null
  assignedOperatorId: string | null
  team: string | null
  dueAt: string | null
  requiresApproval: boolean
  approvalStatus: 'not_required' | 'pending' | 'approved' | 'declined'
  sourceContactMessageId: string | null
  resolution: string | null
  createdAt: string
  firstResponseAt: string | null
  resolvedAt: string | null
}

export interface PlatformCaseEvent {
  id: string
  eventType: string
  body: string
  evidenceReference: string | null
  actorName: string
  createdAt: string
}

export interface PlatformIncident {
  id: string
  title: string
  description: string
  severity: PlatformCaseSeverity
  status: 'investigating' | 'mitigating' | 'monitoring' | 'resolved'
  affectedServices: string[]
  commanderId: string | null
  linkedCaseId: string | null
  postmortem: string | null
  postmortemReviewedAt: string | null
  startedAt: string
  resolvedAt: string | null
  responders: string[]
}

export interface PlatformIncidentUpdate {
  id: string
  updateType: 'update' | 'recovery_step' | 'postmortem'
  body: string
  actorName: string
  createdAt: string
}

const caseColumns = 'id, title, case_type, status, priority, severity, description, school_id, assigned_operator_id, team, due_at, requires_approval, approval_status, source_contact_message_id, resolution, created_at, first_response_at, resolved_at'

export async function fetchPlatformCases(): Promise<PlatformCase[]> {
  const { data, error } = await supabase
    .from('platform_cases')
    .select(caseColumns)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as Record<string, unknown>[]).map(mapCase)
}

export async function fetchPlatformCaseEvents(caseId: string): Promise<PlatformCaseEvent[]> {
  const { data, error } = await supabase
    .from('platform_case_events')
    .select('id, event_type, body, evidence_reference, created_at, profiles!platform_case_events_actor_id_fkey(full_name)')
    .eq('case_id', caseId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as {
    id: string
    event_type: string
    body: string
    evidence_reference: string | null
    created_at: string
    profiles: { full_name: string }[] | { full_name: string } | null
  }[]).map((row) => ({
    id: row.id,
    eventType: row.event_type,
    body: row.body,
    evidenceReference: row.evidence_reference,
    actorName: (Array.isArray(row.profiles) ? row.profiles[0]?.full_name : row.profiles?.full_name) ?? 'Platform operator',
    createdAt: row.created_at,
  }))
}

export async function createPlatformCase(input: {
  title: string
  caseType: PlatformCaseType
  description: string
  schoolId: string | null
  priority: PlatformCasePriority
  dueAt: string | null
  assignedOperatorId: string | null
  team: string | null
  createdBy: string
}): Promise<string> {
  const { data, error } = await supabase
    .from('platform_cases')
    .insert({
      title: input.title.trim(),
      case_type: input.caseType,
      description: input.description.trim(),
      school_id: input.schoolId,
      priority: input.priority,
      due_at: input.dueAt,
      assigned_operator_id: input.assignedOperatorId,
      team: input.team,
      created_by: input.createdBy,
    })
    .select('id')
    .single()
  if (error) throw error
  return (data as { id: string }).id
}

export async function updatePlatformCase(
  caseId: string,
  patch: Partial<Pick<PlatformCase, 'status' | 'priority' | 'severity' | 'assignedOperatorId' | 'team' | 'dueAt' | 'requiresApproval' | 'approvalStatus' | 'resolution'>>,
): Promise<void> {
  const payload: Record<string, unknown> = {}
  if (patch.status !== undefined) payload.status = patch.status
  if (patch.priority !== undefined) payload.priority = patch.priority
  if (patch.severity !== undefined) payload.severity = patch.severity
  if (patch.assignedOperatorId !== undefined) payload.assigned_operator_id = patch.assignedOperatorId
  if (patch.team !== undefined) payload.team = patch.team
  if (patch.dueAt !== undefined) payload.due_at = patch.dueAt
  if (patch.requiresApproval !== undefined) payload.requires_approval = patch.requiresApproval
  if (patch.approvalStatus !== undefined) payload.approval_status = patch.approvalStatus
  if (patch.resolution !== undefined) payload.resolution = patch.resolution
  const { error } = await supabase.from('platform_cases').update(payload).eq('id', caseId)
  if (error) throw error
}

export async function addPlatformCaseEvent(
  caseId: string,
  eventType: 'note' | 'evidence',
  body: string,
  evidenceReference: string | null,
): Promise<void> {
  const { error } = await supabase.from('platform_case_events').insert({
    case_id: caseId,
    event_type: eventType,
    body: body.trim(),
    evidence_reference: evidenceReference,
  })
  if (error) throw error
}

export async function fetchPlatformIncidents(): Promise<PlatformIncident[]> {
  const { data, error } = await supabase
    .from('platform_incidents')
    .select('id, title, description, severity, status, affected_services, commander_id, linked_case_id, postmortem, postmortem_reviewed_at, started_at, resolved_at, platform_incident_responders(operator_id)')
    .order('started_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as {
    id: string
    title: string
    description: string
    severity: PlatformCaseSeverity
    status: PlatformIncident['status']
    affected_services: string[]
    commander_id: string | null
    linked_case_id: string | null
    postmortem: string | null
    postmortem_reviewed_at: string | null
    started_at: string
    resolved_at: string | null
    platform_incident_responders: { operator_id: string }[]
  }[]).map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    severity: row.severity,
    status: row.status,
    affectedServices: row.affected_services,
    commanderId: row.commander_id,
    linkedCaseId: row.linked_case_id,
    postmortem: row.postmortem,
    postmortemReviewedAt: row.postmortem_reviewed_at,
    startedAt: row.started_at,
    resolvedAt: row.resolved_at,
    responders: row.platform_incident_responders.map((item) => item.operator_id),
  }))
}

export async function fetchPlatformIncidentUpdates(incidentId: string): Promise<PlatformIncidentUpdate[]> {
  const { data, error } = await supabase
    .from('platform_incident_updates')
    .select('id, update_type, body, created_at, profiles!platform_incident_updates_actor_id_fkey(full_name)')
    .eq('incident_id', incidentId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as {
    id: string
    update_type: PlatformIncidentUpdate['updateType']
    body: string
    created_at: string
    profiles: { full_name: string }[] | { full_name: string } | null
  }[]).map((row) => ({
    id: row.id,
    updateType: row.update_type,
    body: row.body,
    actorName: (Array.isArray(row.profiles) ? row.profiles[0]?.full_name : row.profiles?.full_name) ?? 'Platform operator',
    createdAt: row.created_at,
  }))
}

export async function createPlatformIncident(input: {
  title: string
  description: string
  severity: PlatformCaseSeverity
  affectedServices: string[]
  commanderId: string | null
  linkedCaseId: string | null
  createdBy: string
}): Promise<string> {
  const { data, error } = await supabase
    .from('platform_incidents')
    .insert({
      title: input.title.trim(),
      description: input.description.trim(),
      severity: input.severity,
      affected_services: input.affectedServices,
      commander_id: input.commanderId,
      linked_case_id: input.linkedCaseId,
      created_by: input.createdBy,
    })
    .select('id')
    .single()
  if (error) throw error
  return (data as { id: string }).id
}

export async function updatePlatformIncident(
  incidentId: string,
  patch: Partial<Pick<PlatformIncident, 'status' | 'severity' | 'postmortem' | 'postmortemReviewedAt' | 'commanderId'>>,
): Promise<void> {
  const payload: Record<string, unknown> = {}
  if (patch.status !== undefined) payload.status = patch.status
  if (patch.severity !== undefined) payload.severity = patch.severity
  if (patch.postmortem !== undefined) payload.postmortem = patch.postmortem
  if (patch.postmortemReviewedAt !== undefined) payload.postmortem_reviewed_at = patch.postmortemReviewedAt
  if (patch.commanderId !== undefined) payload.commander_id = patch.commanderId
  const { error } = await supabase.from('platform_incidents').update(payload).eq('id', incidentId)
  if (error) throw error
}

export async function setPlatformIncidentResponders(incidentId: string, operatorIds: string[]): Promise<void> {
  const { error } = await supabase.rpc('set_platform_incident_responders', {
    p_incident_id: incidentId,
    p_operator_ids: operatorIds,
  })
  if (error) throw error
}

export async function addPlatformIncidentUpdate(
  incidentId: string,
  updateType: PlatformIncidentUpdate['updateType'],
  body: string,
): Promise<void> {
  const { error } = await supabase.from('platform_incident_updates').insert({
    incident_id: incidentId,
    update_type: updateType,
    body: body.trim(),
  })
  if (error) throw error
}

export async function updatePlatformOperatorTeam(operatorId: string, team: string | null): Promise<void> {
  const { error } = await supabase.from('platform_admins').update({ team }).eq('id', operatorId)
  if (error) throw error
}

export async function fetchPlatformCaseWorkload(): Promise<PlatformCase[]> {
  const { data, error } = await supabase
    .from('platform_cases')
    .select(caseColumns)
    .order('created_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as Record<string, unknown>[]).map(mapCase)
}

function mapCase(row: Record<string, unknown>): PlatformCase {
  return {
    id: String(row.id),
    title: String(row.title),
    caseType: row.case_type as PlatformCaseType,
    status: row.status as PlatformCaseStatus,
    priority: row.priority as PlatformCasePriority,
    severity: row.severity as PlatformCaseSeverity,
    description: String(row.description ?? ''),
    schoolId: (row.school_id as string | null) ?? null,
    assignedOperatorId: (row.assigned_operator_id as string | null) ?? null,
    team: (row.team as string | null) ?? null,
    dueAt: (row.due_at as string | null) ?? null,
    requiresApproval: Boolean(row.requires_approval),
    approvalStatus: row.approval_status as PlatformCase['approvalStatus'],
    sourceContactMessageId: (row.source_contact_message_id as string | null) ?? null,
    resolution: (row.resolution as string | null) ?? null,
    createdAt: String(row.created_at),
    firstResponseAt: (row.first_response_at as string | null) ?? null,
    resolvedAt: (row.resolved_at as string | null) ?? null,
  }
}
