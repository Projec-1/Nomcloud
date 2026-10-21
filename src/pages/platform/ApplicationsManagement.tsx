import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  Archive,
  ArrowLeft,
  ArrowSquareOut,
  Buildings,
  Check,
  CheckCircle,
  Clock,
  DownloadSimple,
  EnvelopeSimple,
  FileText,
  Flag,
  MagnifyingGlass,
  PaperPlaneTilt,
  Plus,
  ShieldWarning,
  UserCircle,
  Users,
  X,
} from '@phosphor-icons/react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { fetchPlatformOperators, type PlatformOperatorRecord } from '@/services/platformService'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import Select from '@/components/ui/Select'
import Textarea from '@/components/ui/Textarea'
import { errorMessage } from '@/utils/errorMessage'
import { SectionHeader } from './operator/PrototypeKit'

type ApplicationStatus = 'pending' | 'awaiting_information' | 'approved' | 'rejected' | 'onboarding' | 'withdrawn'
type ApplicationPriority = 'low' | 'normal' | 'high' | 'urgent'
type StatusFilter = 'all' | ApplicationStatus
type DocumentState = 'pending' | 'verified' | 'missing' | 'replacement_requested' | 'rejected'
type EmailDeliveryState = 'queued' | 'accepted' | 'delivered' | 'failed' | 'unknown'

const EMAIL_WORKFLOW_ENABLED = false
const emailDeliveryLabel: Record<EmailDeliveryState, string> = {
  queued: 'Queued',
  accepted: 'Accepted by provider',
  delivered: 'Delivery confirmed',
  failed: 'Failed',
  unknown: 'Status unknown',
}

interface ApplicationListState {
  search: string
  statusFilter: StatusFilter
  cityFilter: string
  reviewerFilter: string
  submittedAfter: string
  submittedBefore: string
  sortOrder: 'newest' | 'oldest'
  needsAttention: boolean
  showArchived: boolean
}

interface SchoolApplication {
  id: string
  school_name: string
  administrator_name: string
  email: string
  phone: string
  country: string | null
  school_size_band: string
  message: string | null
  applicant_position: string | null
  school_address: string | null
  campus_count: string | null
  student_count_band: string | null
  class_count_band: string | null
  staff_count_band: string | null
  curriculum: string | null
  current_system: string | null
  reasons: string[] | null
  created_at: string
  status: ApplicationStatus
  city?: string | null
  assigned_reviewer?: string | null
  priority?: ApplicationPriority | null
  review_due_at?: string | null
  archived_at?: string | null
  document_checklist?: Record<string, { name?: string; state?: DocumentState; note?: string | null; updated_at?: string }>
  review_checklist?: Partial<Record<'required_fields_complete' | 'contact_valid' | 'school_identity_verified', boolean>>
  review_flags?: { duplicate_suspected?: boolean; contact_mismatch_suspected?: boolean }
  onboarding_checklist?: Record<string, unknown>
}

interface ApprovalOutcome {
  application_id: string
  school_id: string
  user_id: string
  email: string
  activation_email_sent: boolean
  activation_email_error?: string
  email_kind?: 'invite' | 'recovery'
  school_name: string
}

interface ApplicationDocument {
  id: string
  name: string
  status: DocumentState
  reviewed_at: string | null
  note: string | null
}

interface ApplicationNote {
  id: string
  author_id: string | null
  author_name: string
  body: string
  mentions: string[]
  created_at: string
}

interface ApplicationCommunication {
  id: string
  direction: 'outbound' | 'inbound'
  subject: string
  body: string
  status: EmailDeliveryState
  created_at: string
}

interface ApplicationActivity {
  id: string
  actor_id: string | null
  actor_name: string
  action: string
  summary: string
  created_at: string
}

interface ApplicationChecklistItem {
  key: 'required_fields' | 'contact_valid' | 'school_identity'
  label: string
  verified: boolean
}

interface ApplicationDetailData {
  documents: ApplicationDocument[]
  checklist: ApplicationChecklistItem[]
  notes: ApplicationNote[]
  communications: ApplicationCommunication[]
  activity: ApplicationActivity[]
  onboarding: Record<string, unknown>
  reviewFlags: { duplicate_suspected: boolean; contact_mismatch_suspected: boolean }
}

interface WorkflowResult {
  application_id: string
  action: string
  ok: boolean
  status?: ApplicationStatus
  updated_at?: string
  error?: string
  error_code?: string
  action_persisted?: boolean
  delivery?: { state: EmailDeliveryState; error_code?: string; provider_message_id?: string }
}

interface WorkflowResponse {
  results: WorkflowResult[]
  total: number
  succeeded: number
  failed: number
}

interface BulkActionSummary {
  action: string
  succeeded: number
  total: number
  issues: Array<{ applicationId: string; school: string; details: string[] }>
}

interface PendingAction {
  kind: 'assign_reviewer' | 'send_template' | 'change_priority' | 'archive' | 'unarchive' | 'reject' | 'approve'
}

const emailTemplates: Record<'rejection' | 'documents_needed' | 'onboarding_instructions', { label: string; subject: string; body: string }> = {
  rejection: {
    label: 'Rejection',
    subject: 'An update on your school application',
    body: 'We have reviewed your school application. Please see the decision details below.',
  },
  documents_needed: {
    label: 'Documents needed',
    subject: 'More information needed for your school application',
    body: 'Please provide the requested information so we can continue reviewing your school application.',
  },
  onboarding_instructions: {
    label: 'Onboarding instructions',
    subject: 'Next steps for your school on Nom Cloud',
    body: 'Your school is ready to get started. Follow the steps in your administrator invitation to complete setup.',
  },
}
type EmailTemplateId = keyof typeof emailTemplates

const statusOptions: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'All applications' },
  { value: 'pending', label: 'Pending review' },
  { value: 'awaiting_information', label: 'Awaiting information' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'withdrawn', label: 'Withdrawn' },
]

const statusLabel: Record<ApplicationStatus, string> = {
  pending: 'Pending review',
  awaiting_information: 'Awaiting information',
  approved: 'Approved',
  rejected: 'Rejected',
  onboarding: 'Onboarding',
  withdrawn: 'Withdrawn',
}

const statusClass: Record<ApplicationStatus, string> = {
  pending: 'border-amber-500/30 dark:border-amber-300/40 bg-amber-500/10 dark:bg-amber-300/10 text-amber-700 dark:text-amber-200',
  awaiting_information: 'border-blue-500/30 dark:border-blue-300/40 bg-blue-500/10 dark:bg-blue-300/10 text-blue-700 dark:text-blue-200',
  approved: 'border-emerald-500/30 dark:border-emerald-300/40 bg-emerald-500/10 dark:bg-emerald-300/10 text-emerald-700 dark:text-emerald-200',
  rejected: 'border-red-500/30 dark:border-rose-300/40 bg-red-500/10 dark:bg-rose-300/10 text-red-700 dark:text-rose-200',
  onboarding: 'border-violet-500/30 dark:border-violet-300/40 bg-violet-500/10 dark:bg-violet-300/10 text-violet-700 dark:text-violet-200',
  withdrawn: 'border-slate-400/30 dark:border-slate-300/30 bg-slate-400/10 dark:bg-slate-300/10 text-ink dark:text-slate-200',
}

const rejectionReasons = [
  'Unable to verify school identity',
  'Incomplete or invalid application',
  'Duplicate application',
  'Does not meet eligibility requirements',
  'Other',
]

const documentStatusLabel: Record<ApplicationDocument['status'], string> = {
  pending: 'Awaiting review',
  verified: 'Verified',
  missing: 'Missing',
  replacement_requested: 'Replacement requested',
  rejected: 'Rejected',
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Not set'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Not set'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date)
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'Not set'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Not set'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function isApprovalOutcome(value: unknown): value is ApprovalOutcome {
  return isObject(value)
    && typeof value.application_id === 'string'
    && typeof value.school_id === 'string'
    && typeof value.user_id === 'string'
    && typeof value.email === 'string'
    && typeof value.activation_email_sent === 'boolean'
}

function toCsv(value: unknown) {
  const text = String(value ?? '')
  return `"${text.replace(/"/g, '""')}"`
}

function getErrorText(error: unknown) {
  return errorMessage(error)
}

async function getFunctionResponsePayload(error: unknown): Promise<unknown> {
  const context = isObject(error) ? error.context : null
  if (!(context instanceof Response)) return null
  try {
    return await context.clone().json()
  } catch {
    return null
  }
}

function isOverdue(application: SchoolApplication, now = Date.now()) {
  return Boolean(application.review_due_at && new Date(application.review_due_at).getTime() < now)
}

function formatDuration(milliseconds: number) {
  const totalMinutes = Math.max(0, Math.floor(Math.abs(milliseconds) / 60_000))
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function isActionable(application: SchoolApplication) {
  return application.status === 'pending' || application.status === 'awaiting_information'
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isEmailDeliveryState(value: unknown): value is EmailDeliveryState {
  return value === 'queued' || value === 'accepted' || value === 'delivered'
    || value === 'failed' || value === 'unknown'
}

function isApplicationStatus(value: unknown): value is ApplicationStatus {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(statusLabel, value)
}

function workflowResults(value: unknown): WorkflowResponse {
  if (
    !isObject(value)
    || !Array.isArray(value.results)
    || typeof value.total !== 'number'
    || typeof value.succeeded !== 'number'
    || typeof value.failed !== 'number'
  ) {
    throw new Error('The application workflow returned an invalid response.')
  }
  const results: WorkflowResult[] = []
  for (const item of value.results) {
    if (
      !isObject(item)
      || typeof item.application_id !== 'string'
      || typeof item.action !== 'string'
      || typeof item.ok !== 'boolean'
    ) {
      throw new Error('The application workflow returned an incomplete result set.')
    }
    if (
      (item.status !== undefined && !isApplicationStatus(item.status))
      || (item.updated_at !== undefined && typeof item.updated_at !== 'string')
      || (item.error !== undefined && typeof item.error !== 'string')
      || (item.error_code !== undefined && typeof item.error_code !== 'string')
      || (item.action_persisted !== undefined && typeof item.action_persisted !== 'boolean')
    ) {
      throw new Error('The application workflow returned an invalid action result.')
    }
    let delivery: WorkflowResult['delivery']
    if (item.delivery !== undefined) {
      if (
        !isObject(item.delivery)
        || !isEmailDeliveryState(item.delivery.state)
        || (item.delivery.error_code !== undefined && typeof item.delivery.error_code !== 'string')
        || (item.delivery.provider_message_id !== undefined && typeof item.delivery.provider_message_id !== 'string')
      ) {
        throw new Error('The application workflow returned an invalid email result.')
      }
      delivery = {
        state: item.delivery.state,
        ...(typeof item.delivery.error_code === 'string' ? { error_code: item.delivery.error_code } : {}),
        ...(typeof item.delivery.provider_message_id === 'string' ? { provider_message_id: item.delivery.provider_message_id } : {}),
      }
    }
    results.push({
      application_id: item.application_id,
      action: item.action,
      ok: item.ok,
      ...(isApplicationStatus(item.status) ? { status: item.status } : {}),
      ...(typeof item.updated_at === 'string' ? { updated_at: item.updated_at } : {}),
      ...(typeof item.error === 'string' ? { error: item.error } : {}),
      ...(typeof item.error_code === 'string' ? { error_code: item.error_code } : {}),
      ...(typeof item.action_persisted === 'boolean' ? { action_persisted: item.action_persisted } : {}),
      ...(delivery ? { delivery } : {}),
    })
  }
  const succeeded = results.filter((result) => result.ok).length
  if (
    results.length !== value.total
    || value.succeeded + value.failed !== value.total
    || succeeded !== value.succeeded
  ) {
    throw new Error('The application workflow returned an inconsistent result summary.')
  }
  return {
    results,
    total: value.total,
    succeeded: value.succeeded,
    failed: value.failed,
  }
}

function singleWorkflowResult(value: unknown, applicationId: string) {
  const response = workflowResults(value)
  const result = response.results[0]
  if (response.total !== 1 || !result || result.application_id !== applicationId) {
    throw new Error('The application workflow did not return an exclusive result for this application.')
  }
  return result
}

function workflowResultMessage(result: WorkflowResult) {
  const deliveryState = result.delivery?.state
  if (result.ok && (!deliveryState || deliveryState === 'delivered')) return null
  const detail = result.error || (deliveryState ? `Email ${deliveryState}.` : `${result.action} was not completed.`)
  if (result.action_persisted) {
    return `The application update was saved, but email status is ${deliveryState || 'unconfirmed'}: ${detail}`
  }
  return detail
}

function summarizeWorkflowResponses(
  action: string,
  responses: WorkflowResponse[],
  targets: SchoolApplication[],
): BulkActionSummary {
  const targetById = new Map(targets.map((application) => [application.id, application.school_name]))
  const detailsById = new Map<string, string[]>()

  for (const response of responses) {
    const seenIds = new Set<string>()
    for (const result of response.results) {
      seenIds.add(result.application_id)
      const details = detailsById.get(result.application_id) ?? []
      if (!result.ok) {
        details.push(result.error || `${result.action} failed.`)
      }
      if (result.delivery && result.delivery.state !== 'delivered') {
        details.push(`Email ${result.delivery.state}: ${result.delivery.error_code || 'delivery was not confirmed'}.`)
      }
      if (details.length) detailsById.set(result.application_id, details)
    }

    for (const application of targets) {
      if (!seenIds.has(application.id)) {
        const details = detailsById.get(application.id) ?? []
        details.push(`${response.results[0]?.action || action} response did not include this application.`)
        detailsById.set(application.id, details)
      }
    }
  }

  const issues = Array.from(detailsById, ([applicationId, details]) => ({
    applicationId,
    school: targetById.get(applicationId) || applicationId,
    details,
  }))
  return {
    action,
    succeeded: Math.max(0, targets.length - issues.length),
    total: targets.length,
    issues,
  }
}

function operatorLabel(operatorId: string | null, operators: PlatformOperatorRecord[]) {
  if (!operatorId) return 'Platform system'
  const operator = operators.find((item) => item.userId === operatorId)
  return operator?.fullName || operator?.email || 'Former operator'
}

async function fetchApplicationDetail(
  application: SchoolApplication,
  operators: PlatformOperatorRecord[],
): Promise<ApplicationDetailData> {
  const [notesResult, documentEventsResult, communicationsResult, eventsResult] = await Promise.all([
    supabase.from('school_application_notes')
      .select('id, author_id, body, mentions, created_at')
      .eq('application_id', application.id)
      .order('created_at', { ascending: false }),
    supabase.from('school_application_document_events')
      .select('id, document_id, state, note, reviewer_id, created_at')
      .eq('application_id', application.id)
      .order('created_at', { ascending: false }),
    supabase.from('school_application_communications')
      .select('id, direction, subject, body, delivery_state, created_at')
      .eq('application_id', application.id)
      .order('created_at', { ascending: false }),
    supabase.from('school_application_events')
      .select('id, actor_id, event_type, from_status, to_status, created_at')
      .eq('application_id', application.id)
      .order('created_at', { ascending: false }),
  ])

  const failures = [
    notesResult.error && `Internal notes: ${notesResult.error.message}`,
    documentEventsResult.error && `Document history: ${documentEventsResult.error.message}`,
    communicationsResult.error && `Communication history: ${communicationsResult.error.message}`,
    eventsResult.error && `Activity history: ${eventsResult.error.message}`,
  ].filter(Boolean)
  if (failures.length) throw new Error(failures.join(' '))

  const notes = (notesResult.data ?? []) as Array<{
    id: string
    author_id: string | null
    body: string
    mentions: string[] | null
    created_at: string
  }>
  const documentEvents = (documentEventsResult.data ?? []) as Array<{
    id: string
    document_id: string
    state: DocumentState
    note: string | null
    reviewer_id: string | null
    created_at: string
  }>
  const communicationsRows = (communicationsResult.data ?? []) as Array<{
    id: string
    direction: 'inbound' | 'outbound'
    subject: string
    body: string
    delivery_state: EmailDeliveryState
    created_at: string
  }>
  const eventRows = (eventsResult.data ?? []) as Array<{
    id: string
    actor_id: string | null
    event_type: string
    from_status: string | null
    to_status: string | null
    created_at: string
  }>

  const checklist = [
    ['required_fields', 'Required fields complete', 'required_fields_complete'],
    ['contact_valid', 'Contact details verified', 'contact_valid'],
    ['school_identity', 'School identity verified', 'school_identity_verified'],
  ] as const
  const reviewChecklist = application.review_checklist ?? {}
  const reviewFlags = application.review_flags ?? {}
  const documentChecklist = application.document_checklist ?? {}
  const onboarding = application.onboarding_checklist ?? {}

  const documents = Object.entries(documentChecklist).map(([id, raw]) => {
    const item = isObject(raw) ? raw : {}
    const possibleState = item.state
    const state: DocumentState = possibleState === 'verified'
      || possibleState === 'missing'
      || possibleState === 'replacement_requested'
      || possibleState === 'rejected'
      ? possibleState
      : 'pending'
    return {
      id,
      name: typeof item.name === 'string' && item.name.trim() ? item.name : id,
      status: state,
      reviewed_at: typeof item.updated_at === 'string' ? item.updated_at : null,
      note: typeof item.note === 'string' ? item.note : null,
    }
  })

  const activity: ApplicationActivity[] = [
    ...eventRows.map((event) => ({
      id: event.id,
      actor_id: event.actor_id,
      actor_name: operatorLabel(event.actor_id, operators),
      action: event.event_type.replace(/_/g, ' '),
      summary: event.from_status && event.to_status
        ? `${event.from_status} → ${event.to_status}`
        : event.event_type.replace(/_/g, ' '),
      created_at: event.created_at,
    })),
    ...notes.map((note) => ({
      id: `note-${note.id}`,
      actor_id: note.author_id,
      actor_name: operatorLabel(note.author_id, operators),
      action: 'Internal note added',
      summary: note.body,
      created_at: note.created_at,
    })),
    ...documentEvents.map((event) => ({
      id: `document-${event.id}`,
      actor_id: event.reviewer_id,
      actor_name: operatorLabel(event.reviewer_id, operators),
      action: 'Document reviewed',
      summary: `${event.document_id}: ${documentStatusLabel[event.state]}${event.note ? ` — ${event.note}` : ''}`,
      created_at: event.created_at,
    })),
    ...communicationsRows.map((communication) => ({
      id: `communication-${communication.id}`,
      actor_id: null,
      actor_name: 'Applicant communication',
      action: communication.direction === 'outbound' ? 'Applicant email' : 'Applicant reply',
      summary: `${communication.subject} (${emailDeliveryLabel[communication.delivery_state]})`,
      created_at: communication.created_at,
    })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  return {
    documents,
    checklist: checklist.map(([key, label, persistedKey]) => ({
      key,
      label,
      verified: reviewChecklist[persistedKey] === true,
    })),
    notes: notes.map((note) => ({
      id: note.id,
      author_id: note.author_id,
      author_name: operatorLabel(note.author_id, operators),
      body: note.body,
      mentions: note.mentions ?? [],
      created_at: note.created_at,
    })),
    communications: communicationsRows.map((row) => ({
      id: row.id,
      direction: row.direction,
      subject: row.subject,
      body: row.body,
      status: row.delivery_state,
      created_at: row.created_at,
    })),
    activity,
    onboarding,
    reviewFlags: {
      duplicate_suspected: reviewFlags.duplicate_suspected === true,
      contact_mismatch_suspected: reviewFlags.contact_mismatch_suspected === true,
    },
  }
}

function StatusBadge({ status }: { status: ApplicationStatus }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass[status]}`}>
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      {statusLabel[status]}
    </span>
  )
}

export default function ApplicationsManagement() {
  const { applicationId } = useParams<{ applicationId: string }>()
  const location = useLocation()
  const savedListState = (location.state as { applicationsList?: ApplicationListState } | null)?.applicationsList
  const { authUser } = useAuth()
  const navigate = useNavigate()
  const [applications, setApplications] = useState<SchoolApplication[]>([])
  const [now, setNow] = useState(Date.now())
  const [operators, setOperators] = useState<PlatformOperatorRecord[]>([])
  const [shortcodes, setShortcodes] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [isPlatformAdmin, setIsPlatformAdmin] = useState<boolean | null>(null)
  const [search, setSearch] = useState(savedListState?.search ?? '')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(savedListState?.statusFilter ?? 'all')
  const [cityFilter, setCityFilter] = useState(savedListState?.cityFilter ?? 'all')
  const [reviewerFilter, setReviewerFilter] = useState(savedListState?.reviewerFilter ?? 'all')
  const [submittedAfter, setSubmittedAfter] = useState(savedListState?.submittedAfter ?? '')
  const [submittedBefore, setSubmittedBefore] = useState(savedListState?.submittedBefore ?? '')
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>(savedListState?.sortOrder ?? 'oldest')
  const [needsAttention, setNeedsAttention] = useState(savedListState?.needsAttention ?? false)
  const [showArchived, setShowArchived] = useState(savedListState?.showArchived ?? false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [reviewerId, setReviewerId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [assignmentInstructions, setAssignmentInstructions] = useState('')
  const [priority, setPriority] = useState<ApplicationPriority>('normal')
  const [template, setTemplate] = useState<EmailTemplateId>('documents_needed')
  const [rejectionReason, setRejectionReason] = useState('')
  const [rejectionMessage, setRejectionMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [resendingActivation, setResendingActivation] = useState(false)
  const [resentNote, setResentNote] = useState<string | null>(null)
  const [approvalResult, setApprovalResult] = useState<ApprovalOutcome | null>(null)
  const [bulkApprovalSummary, setBulkApprovalSummary] = useState<{
    approved: number
    failures: string[]
    emailFailures: Array<{ applicationId: string; school: string; email: string }>
    onboardingFailures: Array<{ applicationId: string; school: string; error: string }>
  } | null>(null)
  const [bulkActionSummary, setBulkActionSummary] = useState<BulkActionSummary | null>(null)
  const [toast, setToast] = useState('')
  // Keep the nested detail component mounted while the parent refreshes its queue state.
  const ApplicationDetailView = useRef(ApplicationDetail).current
  const currentListState: ApplicationListState = {
    search,
    statusFilter,
    cityFilter,
    reviewerFilter,
    submittedAfter,
    submittedBefore,
    sortOrder,
    needsAttention,
    showArchived,
  }

  useEffect(() => {
    if (applicationId) return
    navigate('.', { replace: true, state: { applicationsList: currentListState } })
  }, [applicationId, cityFilter, needsAttention, navigate, reviewerFilter, search, showArchived, sortOrder, statusFilter, submittedAfter, submittedBefore])

  const loadApplications = async () => {
    if (!authUser) return

    setLoading(true)
    setLoadError(null)
    const { data: admin, error: adminError } = await supabase
      .from('platform_admins')
      .select('user_id')
      .eq('user_id', authUser.id)
      .is('revoked_at', null)
      .maybeSingle()

    if (adminError) {
      setIsPlatformAdmin(false)
      setLoadError(adminError.message)
      setLoading(false)
      return
    }

    if (!admin) {
      setIsPlatformAdmin(false)
      setLoading(false)
      return
    }

    setIsPlatformAdmin(true)
    try {
      const { data: reviewFlag, error: reviewFlagError } = await supabase
        .from('platform_feature_flags')
        .select('enabled')
        .eq('flag_key', 'school_application_review')
        .maybeSingle()
      if (reviewFlagError) {
        setLoadError(reviewFlagError.message)
        setApplications([])
        setSelectedIds([])
        setLoading(false)
        return
      }
      if (!reviewFlag?.enabled) {
        setLoadError('School application review is disabled by a platform feature flag.')
        setApplications([])
        setSelectedIds([])
        setLoading(false)
        return
      }

      const [applicationsResult, operatorResult] = await Promise.all([
        supabase
          .from('school_applications')
          .select('*')
          .order('created_at', { ascending: true }),
        fetchPlatformOperators(),
      ])

      if (applicationsResult.error) {
        setLoadError(applicationsResult.error.message)
        setApplications([])
        setSelectedIds([])
      } else {
        const records = (applicationsResult.data ?? []) as SchoolApplication[]
        setApplications(records)
        setSelectedIds((current) => current.filter((id) =>
          records.some((application) => application.id === id),
        ))
      }
      setOperators(operatorResult.filter((operator) => !operator.revokedAt))
    } catch (error) {
      setLoadError(getErrorText(error))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadApplications()
  }, [authUser])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const activeApplications = useMemo(
    () => applications.filter((application) => !application.archived_at),
    [applications],
  )
  const visibleApplications = useMemo(
    () => showArchived ? applications : activeApplications,
    [activeApplications, applications, showArchived],
  )

  const duplicateEmails = useMemo(() => {
    const counts = new Map<string, number>()
    for (const application of activeApplications) {
      const email = application.email.trim().toLowerCase()
      counts.set(email, (counts.get(email) ?? 0) + 1)
    }
    return new Set(Array.from(counts).filter(([, count]) => count > 1).map(([email]) => email))
  }, [activeApplications])

  const cities = useMemo(() => {
    const values = new Set(
      visibleApplications
        .map((application) => application.city?.trim() || application.country?.trim())
        .filter((value): value is string => Boolean(value)),
    )
    return Array.from(values).sort((a, b) => a.localeCompare(b))
  }, [visibleApplications])

  const statusCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = {
      all: activeApplications.length,
      pending: 0,
      awaiting_information: 0,
      approved: 0,
      rejected: 0,
      onboarding: 0,
      withdrawn: 0,
    }
    for (const application of activeApplications) {
      if (application.status in counts) counts[application.status] += 1
    }
    return counts
  }, [activeApplications])

  const filteredApplications = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    const from = submittedAfter ? new Date(`${submittedAfter}T00:00:00`).getTime() : null
    const until = submittedBefore ? new Date(`${submittedBefore}T23:59:59`).getTime() : null

    return visibleApplications
      .filter((application) => statusFilter === 'all' || application.status === statusFilter)
      .filter((application) => {
        if (!normalizedSearch) return true
        return [
          application.school_name,
          application.id,
          application.email,
          application.administrator_name,
          application.city,
          application.country,
        ].some((value) => value?.toLowerCase().includes(normalizedSearch))
      })
      .filter((application) => {
        const city = application.city?.trim() || application.country?.trim() || ''
        return cityFilter === 'all' || city === cityFilter
      })
      .filter((application) => reviewerFilter === 'all' || (application.assigned_reviewer ?? 'unassigned') === reviewerFilter)
      .filter((application) => {
        const submitted = new Date(application.created_at).getTime()
        return (from === null || submitted >= from) && (until === null || submitted <= until)
      })
      .filter((application) =>
        !needsAttention ||
        isOverdue(application, now) ||
        Boolean(application.review_flags?.duplicate_suspected || application.review_flags?.contact_mismatch_suspected) ||
        duplicateEmails.has(application.email.trim().toLowerCase()),
      )
      .sort((a, b) => {
        const difference = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        return sortOrder === 'oldest' ? difference : -difference
      })
  }, [
    cityFilter,
    duplicateEmails,
    needsAttention,
    reviewerFilter,
    search,
    visibleApplications,
    sortOrder,
    statusFilter,
    submittedAfter,
    submittedBefore,
    now,
  ])

  const selectedApplications = useMemo(
    () => applications.filter((application) => selectedIds.includes(application.id)),
    [applications, selectedIds],
  )
  const canDecideSelected = selectedApplications.length > 0 && selectedApplications.every(isActionable)
  const canEditSelected = selectedApplications.length > 0 && selectedApplications.every((application) => !application.archived_at)
  const allSelectedArchived = selectedApplications.length > 0 && selectedApplications.every((application) => Boolean(application.archived_at))

  useEffect(() => {
    if (showArchived) return
    setSelectedIds((current) => current.filter((id) => activeApplications.some((application) => application.id === id)))
  }, [activeApplications, showArchived])

  const selectedApplication = applicationId
    ? applications.find((application) => application.id === applicationId) ?? null
    : null

  const invokeAction = async (action: string, values: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('manage-school-application', {
      body: { action, ...values },
    })
    if (error) throw new Error(await getFunctionErrorMessage(error))
    return workflowResults(data)
  }

  const approveApplication = async (application: SchoolApplication, shortcode: string) => {
    const { data, error } = await supabase.functions.invoke('approve-school-application', {
      body: { application_id: application.id, shortcode },
    })
    const errorPayload = error ? await getFunctionResponsePayload(error) : null
    const outcomeValue = isObject(errorPayload) && 'outcome' in errorPayload
      ? errorPayload.outcome
      : errorPayload
    const outcome = error
      ? isApprovalOutcome(outcomeValue) ? outcomeValue : null
      : isApprovalOutcome(data) ? data : null
    if (!outcome) {
      if (error) throw new Error(await getFunctionErrorMessage(error))
      throw new Error('Approval returned an invalid result. Verify the application status before retrying.')
    }

    const onboardingIssues: string[] = []
    try {
      const start = singleWorkflowResult(
        await invokeAction('start_onboarding', { application_id: application.id }),
        application.id,
      )
      if (!start.ok) throw new Error(start.error || 'The onboarding workflow did not start.')

      const update = singleWorkflowResult(
        await invokeAction('update_onboarding', {
          application_id: application.id,
          checklist: { admin_invited: outcome.activation_email_sent },
        }),
        application.id,
      )
      if (!update.ok) throw new Error(update.error || 'The onboarding invitation status was not saved.')
    } catch (onboardingError) {
      onboardingIssues.push(getErrorText(onboardingError))
    }

    return { outcome, onboardingIssues }
  }

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => current.includes(id) ? current.filter((selected) => selected !== id) : [...current, id])
  }

  const selectVisible = (checked: boolean) => {
    setSelectedIds((current) => {
      if (!checked) return current.filter((id) => !filteredApplications.some((application) => application.id === id))
      return Array.from(new Set([...current, ...filteredApplications.map((application) => application.id)]))
    })
  }

  const exportPermittedData = (records: SchoolApplication[]) => {
    const rows = [
      ['Application ID', 'School', 'Status', 'Submitted', 'Country', 'School type', 'Student estimate'],
      ...records.map((application) => [
        application.id,
        application.school_name,
        statusLabel[application.status],
        application.created_at,
        application.country ?? '',
        application.school_size_band,
        application.student_count_band ?? '',
      ]),
    ]
    const csv = rows.map((row) => row.map(toCsv).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'school-applications.csv'
    anchor.click()
    URL.revokeObjectURL(url)
    setToast(`${records.length} application${records.length === 1 ? '' : 's'} exported.`)
  }

  const submitBulkAction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!pendingAction || selectedIds.length === 0) return
    if (!EMAIL_WORKFLOW_ENABLED && (pendingAction.kind === 'reject' || pendingAction.kind === 'send_template')) {
      setActionError('Applicant email actions are disabled until provider delivery verification is configured.')
      return
    }
    if ((pendingAction.kind === 'approve' || pendingAction.kind === 'reject') && !canDecideSelected) {
      setActionError('Only applications awaiting review or information can be approved or rejected.')
      return
    }
    if (pendingAction.kind === 'unarchive' && !allSelectedArchived) {
      setActionError('Only archived applications can be restored.')
      return
    }
    if (['assign_reviewer', 'send_template', 'change_priority', 'archive'].includes(pendingAction.kind) && !canEditSelected) {
      setActionError('Remove archived applications from the selection before applying this action.')
      return
    }
    setBusy(true)
    setActionError(null)
    setBulkActionSummary(null)

    try {
      if (pendingAction.kind === 'approve') {
        const incomplete = selectedApplications.filter((application) => !shortcodes[application.id]?.trim())
        if (incomplete.length > 0) {
          setActionError(`Enter a shortcode for each selected school. Missing: ${incomplete.map((application) => application.school_name).join(', ')}.`)
          return
        }
        let approved = 0
        const failures: string[] = []
        const emailFailures: Array<{ applicationId: string; school: string; email: string }> = []
        const onboardingFailures: Array<{ applicationId: string; school: string; error: string }> = []
        for (const application of selectedApplications) {
          try {
            const result = await approveApplication(application, shortcodes[application.id].trim())
            approved += 1
            if (!result.outcome.activation_email_sent) {
              emailFailures.push({ applicationId: application.id, school: application.school_name, email: result.outcome.email })
            }
            for (const onboardingError of result.onboardingIssues) {
              onboardingFailures.push({
                applicationId: application.id,
                school: application.school_name,
                error: onboardingError,
              })
            }
          } catch (approvalError) {
            failures.push(`${application.school_name}: ${getErrorText(approvalError)}`)
          }
        }
        setBulkApprovalSummary({ approved, failures, emailFailures, onboardingFailures })
        setBulkActionSummary(null)
        setSelectedIds([])
        setPendingAction(null)
        await loadApplications()
      } else if (pendingAction.kind === 'assign_reviewer') {
        const responses = [await invokeAction('assign_reviewer', {
          application_ids: selectedIds,
          reviewer_id: reviewerId === 'unassigned' ? null : reviewerId || null,
          instructions: assignmentInstructions.trim() || null,
        })]
        if (dueDate) {
          responses.push(await invokeAction('set_due_date', {
            application_ids: selectedIds,
            due_at: new Date(`${dueDate}T23:59:00`).toISOString(),
          }))
        }
        const summary = summarizeWorkflowResponses('Assign reviewer', responses, selectedApplications)
        setBulkActionSummary(summary.issues.length ? summary : null)
        setActionError(null)
        if (!summary.issues.length) setToast(`${summary.succeeded} reviewer assignment${summary.succeeded === 1 ? '' : 's'} updated.`)
        setSelectedIds([])
        setPendingAction(null)
        setAssignmentInstructions('')
        await loadApplications()
      } else if (pendingAction.kind === 'change_priority') {
        const response = await invokeAction('change_priority', { application_ids: selectedIds, priority })
        const summary = summarizeWorkflowResponses('Change priority', [response], selectedApplications)
        setBulkActionSummary(summary.issues.length ? summary : null)
        setActionError(null)
        if (!summary.issues.length) setToast(`Priority changed for ${summary.succeeded} application${summary.succeeded === 1 ? '' : 's'}.`)
        setSelectedIds([])
        setPendingAction(null)
        await loadApplications()
      } else if (pendingAction.kind === 'send_template') {
        const response = await invokeAction('send_template', { application_ids: selectedIds, template })
        const summary = summarizeWorkflowResponses('Send email template', [response], selectedApplications)
        setBulkActionSummary(summary.issues.length ? summary : null)
        setActionError(null)
        if (!summary.issues.length) setToast(`Email provider accepted messages for ${summary.succeeded} application${summary.succeeded === 1 ? '' : 's'}.`)
        setSelectedIds([])
        setPendingAction(null)
        await loadApplications()
      } else if (pendingAction.kind === 'archive') {
        const response = await invokeAction('archive', { application_ids: selectedIds })
        const summary = summarizeWorkflowResponses('Archive applications', [response], selectedApplications)
        setBulkActionSummary(summary.issues.length ? summary : null)
        setActionError(null)
        if (!summary.issues.length) setToast(`${summary.succeeded} application${summary.succeeded === 1 ? '' : 's'} archived.`)
        setSelectedIds([])
        setPendingAction(null)
        await loadApplications()
      } else if (pendingAction.kind === 'unarchive') {
        const response = await invokeAction('unarchive', { application_ids: selectedIds })
        const summary = summarizeWorkflowResponses('Restore applications', [response], selectedApplications)
        setBulkActionSummary(summary.issues.length ? summary : null)
        setActionError(null)
        if (!summary.issues.length) setToast(`${summary.succeeded} application${summary.succeeded === 1 ? '' : 's'} restored.`)
        setSelectedIds([])
        setPendingAction(null)
        await loadApplications()
      } else if (pendingAction.kind === 'reject') {
        const response = await invokeAction('reject', {
          application_ids: selectedIds,
          reason: rejectionReason,
          subject: 'An update on your school application',
          body: rejectionMessage.trim() || `Your school application was not approved. Reason: ${rejectionReason}.`,
        })
        const summary = summarizeWorkflowResponses('Reject applications', [response], selectedApplications)
        setBulkActionSummary(summary.issues.length ? summary : null)
        setActionError(null)
        if (!summary.issues.length) setToast(`${summary.succeeded} application${summary.succeeded === 1 ? '' : 's'} rejected.`)
        setSelectedIds([])
        setPendingAction(null)
        setRejectionReason('')
        setRejectionMessage('')
        await loadApplications()
      }

    } catch (error) {
      setActionError(getErrorText(error))
    } finally {
      setBusy(false)
    }
  }

  const approve = async (application: SchoolApplication) => {
    const shortcode = shortcodes[application.id]?.trim() ?? ''
    if (!shortcode) {
      setActionError(`Enter a school shortcode for ${application.school_name} before approval.`)
      return
    }

    setApprovingId(application.id)
    setActionError(null)
    setApprovalResult(null)
    try {
      const result = await approveApplication(application, shortcode)
      setApprovalResult({ ...result.outcome, school_name: application.school_name })
      if (result.onboardingIssues.length) {
        setActionError(`The application was approved, but onboarding needs attention: ${result.onboardingIssues.join(' ')}`)
      }
      await loadApplications()
    } catch (error) {
      setActionError(getErrorText(error))
    } finally {
      setApprovingId(null)
    }
  }

  const rejectOne = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!EMAIL_WORKFLOW_ENABLED) {
      setActionError('Applicant email actions are disabled until provider delivery verification is configured.')
      return
    }
    if (!selectedApplication || !rejectionReason) return
    setBusy(true)
    setActionError(null)
    try {
      const result = singleWorkflowResult(await invokeAction('reject', {
        application_id: selectedApplication.id,
        reason: rejectionReason,
        subject: 'An update on your school application',
        body: rejectionMessage.trim() || `Your school application was not approved. Reason: ${rejectionReason}.`,
      }), selectedApplication.id)
      const message = workflowResultMessage(result)
      if (message) {
        if (result.action_persisted) await loadApplications()
        throw new Error(message)
      }
      setToast('Application rejected.')
      setPendingAction(null)
      setRejectionReason('')
      setRejectionMessage('')
      await loadApplications()
    } catch (error) {
      setActionError(getErrorText(error))
    } finally {
      setBusy(false)
    }
  }

  const resendActivation = async () => {
    if (!approvalResult) return
    setResendingActivation(true)
    setActionError(null)
    setResentNote(null)
    try {
      const { data, error } = await supabase.functions.invoke('approve-school-application', {
        body: { application_id: approvalResult.application_id, action: 'resend' },
      })
      if (error) {
        setActionError(await getFunctionErrorMessage(error))
      } else if (!isObject(data) || data.activation_email_sent !== true) {
        setActionError('The activation service returned an invalid resend result. Verify email history before retrying.')
      } else {
        setResentNote(`Supabase Auth accepted the activation invitation request for ${approvalResult.email}. Inbox delivery is not confirmed.`)
      }
    } catch (error) {
      setActionError(getErrorText(error))
    } finally {
      setResendingActivation(false)
    }
  }

  if (!authUser) return null

  if (loading) {
    return <p className="py-12 text-center text-sm text-graphite dark:text-slate-300" role="status">Loading school applications…</p>
  }

  if (!isPlatformAdmin) {
    return (
      <section className="max-w-xl rounded-xl border border-red-500/25 dark:border-rose-300/30 bg-red-500/[0.06] dark:bg-rose-300/5 p-6">
        <h1 className="text-xl font-semibold text-ink dark:text-white">Platform-admin access required</h1>
        <p className="mt-2 text-sm text-graphite dark:text-slate-300">School application review is restricted to active platform administrators.</p>
      </section>
    )
  }

  async function getFunctionErrorMessage(error: unknown): Promise<string> {
    const context = (error as { context?: unknown } | null)?.context
    if (context instanceof Response) {
      const status = `HTTP ${context.status}`
      try {
        const body = (await context.clone().json()) as { error?: unknown }
        if (typeof body.error === 'string' && body.error) return `${body.error} (${status})`
      } catch {
        const text = await context.clone().text().catch(() => '')
        if (text) return `${text} (${status})`
      }
      return `The application workflow service returned ${status}.`
    }
    return getErrorText(error)
  }

  function ErrorNotice({ message, onRetry, onDismiss }: { message: string; onRetry?: () => void; onDismiss?: () => void }) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-red-500/25 dark:border-rose-300/30 bg-red-500/[0.06] dark:bg-rose-300/5 p-3 text-sm text-red-700 dark:text-rose-100">
        <span className="min-w-0 flex-1">{message}</span>
        {onRetry && <Button size="sm" className="min-h-11" variant="outline" onClick={onRetry}>Try again</Button>}
        {onDismiss && <Button size="sm" className="min-h-11 min-w-11" variant="ghost" onClick={onDismiss} aria-label="Dismiss error"><X className="h-4 w-4" /></Button>}
      </div>
    )
  }

  function ApprovalResult({
    result,
    onResend,
    resending,
    resentNote,
  }: {
    result: ApprovalOutcome
    onResend: () => void
    resending: boolean
    resentNote: string | null
  }) {
    return (
      <div className={`rounded-lg border p-4 ${result.activation_email_sent ? 'border-emerald-500/25 dark:border-emerald-300/30 bg-emerald-500/[0.06] dark:bg-emerald-300/5 text-emerald-700 dark:text-emerald-100' : 'border-red-500/25 dark:border-rose-300/30 bg-red-500/[0.06] dark:bg-rose-300/5 text-red-700 dark:text-rose-100'}`}>
        <h2 className="font-semibold">{result.school_name} is approved</h2>
        {result.activation_email_sent ? (
          <p className="mt-1 text-sm">Supabase Auth accepted the activation invitation for {result.email}. Inbox delivery is not confirmed; the administrator will choose their own password after receiving the link.</p>
        ) : (
          <p className="mt-1 text-sm">
            The school and administrator were created, but the activation email was not sent to {result.email}.
            {result.activation_email_error ? ` Mail service: ${result.activation_email_error}` : ' Review the email service and resend the activation link.'}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" className="min-h-11" loading={resending} onClick={onResend}>Resend activation email</Button>
          {resentNote && <span className="text-sm">{resentNote}</span>}
        </div>
      </div>
    )
  }

  function BulkApprovalResult({ summary }: { summary: { approved: number; failures: string[]; emailFailures: Array<{ applicationId: string; school: string; email: string }>; onboardingFailures: Array<{ applicationId: string; school: string; error: string }> } }) {
    return (
      <section className="space-y-2 rounded-lg border border-ink/10 dark:border-white/10 bg-ink/[0.03] dark:bg-white/[0.03] p-4" aria-label="Bulk approval results">
        <h2 className="font-semibold text-ink dark:text-white">
          {summary.approved} application{summary.approved === 1 ? '' : 's'} approved
        </h2>
        {summary.failures.length > 0 && (
          <div className="text-sm text-red-700 dark:text-rose-100">
            <p>These applications were not approved:</p>
            <ul className="mt-1 list-inside list-disc">{summary.failures.map((failure) => <li key={failure}>{failure}</li>)}</ul>
          </div>
        )}
        {summary.emailFailures.length > 0 && (
          <div className="text-sm text-amber-700 dark:text-amber-100">
            <p>Activation invitation requests were not accepted; retry them after restoring email service:</p>
            <ul className="mt-1 space-y-1">
              {summary.emailFailures.map((failure) => (
                <li key={failure.applicationId}>
                  {failure.school} ({failure.email}) — <Link className="underline underline-offset-2 hover:text-ink dark:hover:text-white" to={`/platform/applications/${encodeURIComponent(failure.applicationId)}`}>open application to resend</Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        {summary.onboardingFailures.length > 0 && (
          <div className="text-sm text-amber-700 dark:text-amber-100">
            <p>These approved schools need onboarding follow-up:</p>
            <ul className="mt-1 list-inside list-disc">
              {summary.onboardingFailures.map((failure) => (
                <li key={failure.applicationId}>
                  {failure.school}: {failure.error} (<Link className="underline underline-offset-2 hover:text-ink dark:hover:text-white" to={`/platform/applications/${encodeURIComponent(failure.applicationId)}`}>open application</Link>)
                </li>
              ))}
            </ul>
          </div>
        )}
        {summary.failures.length === 0 && summary.emailFailures.length === 0 && summary.onboardingFailures.length === 0 && (
          <p className="text-sm text-emerald-700 dark:text-emerald-100">Supabase Auth accepted all activation invitation requests. Inbox delivery is not confirmed.</p>
        )}
      </section>
    )
  }

  function BulkActionResult({ summary }: { summary: BulkActionSummary }) {
    return (
      <section className="space-y-2 rounded-lg border border-amber-500/25 dark:border-amber-300/25 bg-amber-500/[0.06] dark:bg-amber-300/5 p-4" aria-label={`${summary.action} results`}>
        <h2 className="font-semibold text-ink dark:text-white">
          {summary.action}: {summary.succeeded} of {summary.total} application{summary.total === 1 ? '' : 's'} succeeded
        </h2>
        <ul className="space-y-2 text-sm text-amber-700 dark:text-amber-100">
          {summary.issues.map((issue) => (
            <li key={issue.applicationId}>
              <Link className="font-medium underline underline-offset-2 hover:text-ink dark:hover:text-white" to={`/platform/applications/${encodeURIComponent(issue.applicationId)}`}>{issue.school}</Link>
              <ul className="ml-4 list-inside list-disc text-amber-700/80 dark:text-amber-50/80">
                {issue.details.map((detail, index) => <li key={`${issue.applicationId}-${index}`}>{detail}</li>)}
              </ul>
            </li>
          ))}
        </ul>
      </section>
    )
  }

  function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
    return (
      <div className="fixed bottom-4 right-4 z-50 flex max-w-sm items-center gap-3 rounded-lg border border-[var(--nc-line)] bg-[var(--nc-surface)] px-4 py-3 text-sm text-[var(--nc-text)]" role="status" aria-live="polite">
        <CheckCircle className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-300" aria-hidden="true" />
        <span className="min-w-0 flex-1">{message}</span>
        <button type="button" onClick={onDismiss} className="min-h-11 min-w-11 rounded-md p-2 text-graphite dark:text-slate-300 hover:bg-ink/5 dark:hover:bg-white/10 hover:text-ink dark:hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand" aria-label="Dismiss notification">
          <X className="mx-auto h-4 w-4" />
        </button>
      </div>
    )
  }

  function ApplicationDetail({
    application,
    operators,
    now,
    duplicate,
    shortcodes,
    setShortcodes,
    busy,
    approvingId,
    approvalResult,
    onResendActivation,
    resendingActivation,
    resentNote,
    actionError,
    setActionError,
    onApprove,
    onReject,
    onBack,
    onReload,
    onAction,
    onToast,
  }: {
    application: SchoolApplication | null
    operators: PlatformOperatorRecord[]
    now: number
    duplicate: boolean
    shortcodes: Record<string, string>
    setShortcodes: (value: (current: Record<string, string>) => Record<string, string>) => void
    busy: boolean
    approvingId: string | null
    approvalResult: ApprovalOutcome | null
    onResendActivation: () => void
    resendingActivation: boolean
    resentNote: string | null
    actionError: string | null
    setActionError: (value: string | null) => void
    onApprove: () => void
    onReject: () => void
    onBack: () => void
    onReload: () => void
    onAction: (action: string, values: Record<string, unknown>) => Promise<unknown>
    onToast: (message: string) => void
  }) {
    const [detail, setDetail] = useState<ApplicationDetailData | null>(null)
    const [detailLoading, setDetailLoading] = useState(false)
    const [detailError, setDetailError] = useState<string | null>(null)
    const [detailRevision, setDetailRevision] = useState(0)
    const [localBusy, setLocalBusy] = useState(false)
    const [reviewerId, setReviewerId] = useState(application?.assigned_reviewer ?? '')
    const [dueDate, setDueDate] = useState(application?.review_due_at?.slice(0, 10) ?? '')
    const [priority, setPriority] = useState<ApplicationPriority>(application?.priority ?? 'normal')
    const [assignmentInstructions, setAssignmentInstructions] = useState('')
    const [noteText, setNoteText] = useState('')
    const [mentionOperatorId, setMentionOperatorId] = useState('')
    const [mentionedOperatorIds, setMentionedOperatorIds] = useState<string[]>([])
    const [emailTemplate, setEmailTemplate] = useState<EmailTemplateId>('documents_needed')
    const [emailSubject, setEmailSubject] = useState(emailTemplates.documents_needed.subject)
    const [emailBody, setEmailBody] = useState(emailTemplates.documents_needed.body)
    const [requestMessage, setRequestMessage] = useState('')
    const [requestDueDate, setRequestDueDate] = useState('')
    const [missingDocumentIds, setMissingDocumentIds] = useState<string[]>([])
    const [newDocumentId, setNewDocumentId] = useState('')
    const [confirmApprove, setConfirmApprove] = useState(false)
    const [confirmReopen, setConfirmReopen] = useState(false)

    useEffect(() => {
      if (!application) return
      let cancelled = false
      setDetailLoading(true)
      setDetailError(null)
      setDetail(null)
      void fetchApplicationDetail(application, operators)
        .then((data) => {
          if (!cancelled) setDetail(data)
        })
        .catch((error: unknown) => {
          if (!cancelled) setDetailError(getErrorText(error))
        })
        .finally(() => {
          if (!cancelled) setDetailLoading(false)
        })
      return () => {
        cancelled = true
      }
    }, [application?.id, detailRevision, operators])

    useEffect(() => {
      setReviewerId(application?.assigned_reviewer ?? '')
      setDueDate(application?.review_due_at?.slice(0, 10) ?? '')
      setPriority(application?.priority ?? 'normal')
    }, [application?.id, application?.assigned_reviewer, application?.review_due_at, application?.priority])

    const refreshDetail = async () => {
      setDetailRevision((current) => current + 1)
      onReload()
    }

    const runDetailAction = async (
      action: string,
      values: Record<string, unknown>,
      successMessage: string,
    ) => {
      if (!application) return false
      if (!EMAIL_WORKFLOW_ENABLED && ['request_information', 'reject', 'send_email', 'send_template'].includes(action)) {
        setDetailError('Applicant email actions are disabled until provider delivery verification is configured.')
        return false
      }
      setLocalBusy(true)
      setDetailError(null)
      setActionError(null)
      try {
        const result = singleWorkflowResult(
          await onAction(action, { application_id: application.id, ...values }),
          application.id,
        )
        const message = workflowResultMessage(result)
        if (message) {
          if (result.action_persisted) await refreshDetail()
          throw new Error(message)
        }
        onToast(successMessage)
        await refreshDetail()
        return true
      } catch (error) {
        setDetailError(getErrorText(error))
        return false
      } finally {
        setLocalBusy(false)
      }
    }

    const submitNote = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const body = noteText.trim()
      if (!body || !application) return
      if (await runDetailAction('add_note', { body, mentions: mentionedOperatorIds }, 'Internal note added.')) {
        setNoteText('')
        setMentionedOperatorIds([])
      }
    }

    const submitEmail = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (!EMAIL_WORKFLOW_ENABLED) {
        setDetailError('Applicant email actions are disabled until provider delivery verification is configured.')
        return
      }
      if (!emailSubject.trim() || !emailBody.trim()) return
      await runDetailAction(
        'send_email',
        { subject: emailSubject.trim(), body: emailBody.trim() },
        'Email accepted by the provider.',
      )
    }

    const submitRequest = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (!EMAIL_WORKFLOW_ENABLED) {
        setDetailError('Applicant email actions are disabled until provider delivery verification is configured.')
        return
      }
      if (!requestMessage.trim() || !requestDueDate) return
      if (!application) return
      setLocalBusy(true)
      setDetailError(null)
      const missingNames = docList.filter((document) => missingDocumentIds.includes(document.id)).map((document) => document.name)
      const body = [
        requestMessage.trim(),
        missingNames.length ? `Please provide or replace: ${missingNames.join(', ')}.` : '',
      ].filter(Boolean).join('\n\n')
      let requestPersisted = false
      try {
        const requestResult = singleWorkflowResult(
          await onAction('request_information', {
            application_id: application.id,
            subject: 'More information needed for your school application',
            body,
          }),
          application.id,
        )
        requestPersisted = requestResult.action_persisted === true || requestResult.ok
        if (!requestPersisted) throw new Error(workflowResultMessage(requestResult) || 'The information request was not saved.')

        const dueResult = singleWorkflowResult(
          await onAction('set_due_date', {
            application_id: application.id,
            due_at: new Date(`${requestDueDate}T23:59:00`).toISOString(),
          }),
          application.id,
        )
        const errors = [workflowResultMessage(requestResult), workflowResultMessage(dueResult)].filter(Boolean)
        await refreshDetail()
        if (errors.length) {
          setDetailError(errors.join(' '))
          return
        }
        onToast('Email accepted by the provider; response deadline saved.')
        setRequestMessage('')
        setMissingDocumentIds([])
      } catch (error) {
        setDetailError(getErrorText(error))
        if (requestPersisted) await refreshDetail()
      } finally {
        setLocalBusy(false)
      }
    }

    const saveAssignment = async () => {
      if (!application) return
      setLocalBusy(true)
      setDetailError(null)
      const actions = [
        {
          action: 'assign_reviewer',
          values: {
            reviewer_id: reviewerId || null,
            ...(assignmentInstructions.trim() ? { instructions: assignmentInstructions.trim() } : {}),
          },
          label: 'Reviewer assignment',
        },
        {
          action: 'set_due_date',
          values: { due_at: dueDate ? new Date(`${dueDate}T23:59:00`).toISOString() : null },
          label: 'Review deadline',
        },
        {
          action: 'change_priority',
          values: { priority },
          label: 'Priority',
        },
      ]
      const errors: string[] = []
      try {
        for (const item of actions) {
          try {
            const result = singleWorkflowResult(
              await onAction(item.action, { application_id: application.id, ...item.values }),
              application.id,
            )
            const message = workflowResultMessage(result)
            if (message) errors.push(`${item.label}: ${message}`)
          } catch (error) {
            errors.push(`${item.label}: ${getErrorText(error)}`)
          }
        }
        await refreshDetail()
        if (errors.length) {
          setDetailError(`Some reviewer settings were not saved. ${errors.join(' ')}`)
        } else {
          onToast('Reviewer, deadline, and priority saved.')
        }
      } finally {
        setLocalBusy(false)
      }
    }

    const currentReviewer = operators.find((operator) => operator.userId === reviewerId)
    const overdue = application ? isOverdue(application, now) : false
    const reviewerName = currentReviewer?.fullName || currentReviewer?.email || 'Unassigned reviewer'
    const reviewerInitials = reviewerName.split(/[\s@]+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('')
    const riskFlags = [
      ...(duplicate ? ['Repeated administrator email across applications'] : []),
      ...(detail?.reviewFlags.duplicate_suspected ? ['Possible duplicate submission'] : []),
      ...(detail?.reviewFlags.contact_mismatch_suspected ? ['Contact details need verification'] : []),
    ]

    if (!application) {
      return (
        <section className="space-y-5">
          <button type="button" onClick={onBack} className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm text-graphite dark:text-slate-300 hover:text-ink dark:hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">
            <ArrowLeft className="h-4 w-4" /> Back to applications
          </button>
          <div className="rounded-xl border border-[var(--nc-line)] bg-[var(--nc-surface)] p-8 text-center">
            <h1 className="text-xl font-semibold text-ink dark:text-white">Application not found</h1>
            <p className="mt-2 text-sm text-graphite dark:text-slate-300">This application may have been removed or may no longer be available.</p>
          </div>
        </section>
      )
    }

    const docList = detail?.documents ?? []
    const checklist = detail?.checklist ?? []
    const noteList = detail?.notes ?? []
    const communications = detail?.communications ?? []
    const activity = detail?.activity ?? []
    const onboardingSteps = [
      ['admin_invited', 'Admin invited'],
      ['profile_completed', 'Profile completed'],
      ['first_login', 'First login recorded'],
    ] as const

    return (
      <section className="space-y-5">
        <button type="button" onClick={onBack} className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm text-graphite dark:text-slate-300 hover:text-ink dark:hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">
          <ArrowLeft className="h-4 w-4" /> Back to applications
        </button>

        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-ink/10 dark:border-white/10 pb-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="break-words text-2xl font-semibold tracking-tight text-ink dark:text-white sm:text-3xl">{application.school_name}</h1>
              <StatusBadge status={application.status} />
            </div>
            <p className="mt-2 break-all font-mono text-xs text-graphite dark:text-slate-300">{application.id}</p>
            <p className="mt-1 text-sm text-graphite dark:text-slate-300">Submitted {formatDateTime(application.created_at)}</p>
          </div>
          <div className="min-w-[190px] rounded-lg border border-ink/10 dark:border-white/10 bg-ink/[0.03] dark:bg-white/[0.03] p-3">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-graphite dark:text-slate-300"><Clock className="h-4 w-4" /> Review SLA</p>
            {application.review_due_at ? (
              <>
                <p className="mt-1.5 text-sm font-semibold tabular-nums text-ink dark:text-white">Waiting {formatDuration(now - new Date(application.created_at).getTime())}</p>
                <p className={`mt-1 text-sm font-semibold tabular-nums ${overdue ? 'text-red-700 dark:text-rose-200' : 'text-emerald-700 dark:text-emerald-100'}`}>
                  {overdue ? `Overdue by ${formatDuration(now - new Date(application.review_due_at).getTime())}` : `Due in ${formatDuration(new Date(application.review_due_at).getTime() - now)}`}
                </p>
                <p className="mt-1 text-xs tabular-nums text-graphite dark:text-slate-400">{formatDateTime(application.review_due_at)}</p>
              </>
            ) : (
              <p className="mt-1.5 text-sm text-ink dark:text-slate-200">No review deadline set</p>
            )}
            <div className="mt-2 flex items-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-ink/15 dark:border-white/15 bg-ink/[0.05] dark:bg-white/[0.06] text-xs font-semibold text-ink dark:text-white" aria-hidden="true">
                {currentReviewer ? reviewerInitials : <UserCircle className="h-5 w-5" />}
              </span>
              <p className="min-w-0 break-words text-xs text-graphite dark:text-slate-300">{reviewerName}</p>
            </div>
          </div>
        </header>

        {actionError && <ErrorNotice message={actionError} onDismiss={() => setActionError(null)} />}
        {detailError && <ErrorNotice message={detailError} onRetry={() => setDetailRevision((value) => value + 1)} />}
        {approvalResult && <ApprovalResult result={approvalResult} onResend={onResendActivation} resending={resendingActivation} resentNote={resentNote} />}
        <section aria-labelledby="risk-heading" className="rounded-lg border border-amber-500/25 dark:border-amber-300/30 bg-amber-500/[0.06] dark:bg-amber-300/5 p-4">
            <h2 id="risk-heading" className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-100">
              <ShieldWarning className="h-4 w-4" /> Human review flags
            </h2>
            {riskFlags.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-amber-700 dark:text-amber-100">
                {riskFlags.map((flag) => <li key={flag}>{flag}</li>)}
              </ul>
            )}
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
              <label className="flex min-h-11 items-center gap-2 text-sm text-amber-700 dark:text-amber-50">
                <input
                  type="checkbox"
                  checked={detail?.reviewFlags.duplicate_suspected ?? false}
                  onChange={(event) => void runDetailAction('set_review_flags', { flags: { duplicate_suspected: event.target.checked } }, 'Duplicate review flag updated.')}
                  disabled={localBusy}
                  className="h-4 w-4 accent-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                />
                Possible duplicate submission
              </label>
              <label className="flex min-h-11 items-center gap-2 text-sm text-amber-700 dark:text-amber-50">
                <input
                  type="checkbox"
                  checked={detail?.reviewFlags.contact_mismatch_suspected ?? false}
                  onChange={(event) => void runDetailAction('set_review_flags', { flags: { contact_mismatch_suspected: event.target.checked } }, 'Contact mismatch review flag updated.')}
                  disabled={localBusy}
                  className="h-4 w-4 accent-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                />
                Contact details need verification
              </label>
            </div>
            <p className="mt-2 text-xs text-amber-700/90 dark:text-amber-100/80">Flags support human review only; they never make or change an application decision.</p>
          </section>

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-6">
            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-ink dark:text-white">School and administrator</h2>
              <dl className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  ['Administrator', application.administrator_name],
                  ['Email', application.email],
                  ['Phone', application.phone],
                  ['Applicant position', application.applicant_position],
                  ['Address', application.school_address],
                  ['City', application.city],
                  ['Country', application.country],
                  ['School type', application.school_size_band],
                  ['Estimated students', application.student_count_band],
                  ['Campuses', application.campus_count],
                  ['Classes', application.class_count_band],
                  ['Staff', application.staff_count_band],
                  ['Curriculum', application.curriculum],
                  ['Current system', application.current_system],
                  ['Reasons for applying', application.reasons?.join(', ')],
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0 border-t border-ink/10 dark:border-white/10 py-3">
                    <dt className="text-xs text-graphite dark:text-slate-400">{label}</dt>
                    <dd className="mt-1 break-words text-sm font-medium text-ink dark:text-white">{value || 'Not provided'}</dd>
                  </div>
                ))}
                {application.message && (
                  <div className="border-t border-ink/10 dark:border-white/10 py-3 sm:col-span-2 lg:col-span-3">
                    <dt className="text-xs text-graphite dark:text-slate-400">Additional information</dt>
                    <dd className="mt-1 whitespace-pre-wrap break-words text-sm text-ink dark:text-white">{application.message}</dd>
                  </div>
                )}
              </dl>
            </section>

            <section className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-ink dark:text-white">Document verification</h2>
                  <p className="mt-1 text-sm text-graphite dark:text-slate-300">Add requirements as needed, then record each item&apos;s current state.</p>
                </div>
                {detailLoading && <span className="text-xs text-graphite dark:text-slate-400" role="status">Loading review records…</span>}
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <Input label="New document requirement" value={newDocumentId} onChange={(event) => setNewDocumentId(event.target.value)} placeholder="e.g. School registration certificate" maxLength={200} />
                <Button
                  type="button"
                  className="min-h-11"
                  variant="outline"
                  disabled={localBusy || !newDocumentId.trim() || docList.some((document) => document.id.toLowerCase() === newDocumentId.trim().toLowerCase())}
                  onClick={async () => {
                    const documentId = newDocumentId.trim()
                    if (docList.some((document) => document.id.toLowerCase() === documentId.toLowerCase())) {
                      setDetailError('A document requirement with that name already exists.')
                      return
                    }
                    if (await runDetailAction('update_document', { document_id: documentId, state: 'pending' }, 'Document requirement added.')) {
                      setNewDocumentId('')
                    }
                  }}
                >
                  <Plus className="h-4 w-4" /> Add requirement
                </Button>
              </div>
              {docList.length === 0 ? (
                <p className="rounded-lg border border-ink/10 dark:border-white/10 p-4 text-sm text-graphite dark:text-slate-300">No document checklist is available for this application.</p>
              ) : (
                <ul className="divide-y divide-ink/10 dark:divide-white/10 border-y border-ink/10 dark:border-white/10">
                  {docList.map((document) => (
                    <li key={document.id} className="flex flex-wrap items-center gap-3 py-3">
                      <FileText className="h-4 w-4 shrink-0 text-graphite dark:text-slate-400" aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-medium text-ink dark:text-white">{document.name}</p>
                        <p className="mt-0.5 text-xs text-graphite dark:text-slate-300">
                          {documentStatusLabel[document.status]}
                          {document.reviewed_at ? ` · Reviewed ${formatDate(document.reviewed_at)}` : ''}
                          {document.note ? ` · ${document.note}` : ''}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" className="min-h-11" variant={document.status === 'verified' ? 'accent' : 'outline'} disabled={localBusy || document.status === 'verified'} onClick={() => void runDetailAction('update_document', { document_id: document.id, state: 'verified' }, 'Document marked verified.')}>
                          <Check className="h-4 w-4" /> Verify
                        </Button>
                        <Button size="sm" className="min-h-11" variant="outline" disabled={localBusy || document.status === 'missing'} onClick={() => void runDetailAction('update_document', { document_id: document.id, state: 'missing' }, 'Document marked missing.')}>Missing</Button>
                        <Button size="sm" className="min-h-11" variant="outline" disabled={localBusy || document.status === 'replacement_requested'} onClick={() => void runDetailAction('update_document', { document_id: document.id, state: 'replacement_requested' }, 'Replacement requested.')}>Request replacement</Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-ink dark:text-white">Review checklist</h2>
              <ul className="divide-y divide-ink/10 dark:divide-white/10 border-y border-ink/10 dark:border-white/10">
                {checklist.length ? checklist.map((item) => (
                  <li key={item.key} className="flex min-h-14 items-center gap-3 py-3">
                    <input
                      type="checkbox"
                      id={`check-${application.id}-${item.key}`}
                      checked={item.verified}
                      onChange={(event) => {
                        const persistedKey = item.key === 'required_fields'
                          ? 'required_fields_complete'
                          : item.key === 'contact_valid'
                            ? 'contact_valid'
                            : 'school_identity_verified'
                        void runDetailAction('update_checklist', {
                          checklist: { [persistedKey]: event.target.checked },
                        }, `${item.label} ${event.target.checked ? 'verified' : 'reopened'}.`)
                      }}
                      disabled={localBusy}
                      className="h-4 w-4 shrink-0 accent-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                    />
                    <label htmlFor={`check-${application.id}-${item.key}`} className="flex min-h-11 flex-1 cursor-pointer items-center justify-between gap-3 text-sm text-ink dark:text-white">
                      <span>{item.label}</span>
                      <span className="text-right text-xs text-graphite dark:text-slate-300">{item.verified ? 'Verified' : 'Not verified'}</span>
                    </label>
                  </li>
                )) : <li className="py-4 text-sm text-graphite dark:text-slate-300">Checklist records are not available.</li>}
              </ul>
            </section>

            {(application.status === 'approved' || application.status === 'onboarding') && (
              <section className="space-y-3">
                <h2 className="text-lg font-semibold text-ink dark:text-white">Onboarding progress</h2>
                <ol className="grid gap-3 sm:grid-cols-3">
                  {onboardingSteps.map(([key, label]) => {
                    const complete = detail?.onboarding[key] === true
                    return (
                      <li key={key} className={`rounded-lg border p-3 ${complete ? 'border-emerald-500/25 dark:border-emerald-300/30 bg-emerald-500/[0.06] dark:bg-emerald-300/5' : 'border-ink/10 dark:border-white/10 bg-ink/[0.02] dark:bg-white/[0.02]'}`}>
                        <label className="flex min-h-11 items-center gap-2">
                          <input
                            type="checkbox"
                            checked={complete}
                            onChange={(event) => void runDetailAction('update_onboarding', { checklist: { [key]: event.target.checked } }, `${label} status updated.`)}
                            disabled={localBusy}
                            className="h-4 w-4 accent-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                          />
                          <span className={`text-sm font-semibold ${complete ? 'text-emerald-700 dark:text-emerald-100' : 'text-ink dark:text-slate-200'}`}>{label}</span>
                        </label>
                        <p className="mt-1 text-xs text-graphite dark:text-slate-300">{complete ? 'Completed' : 'Not completed'}</p>
                      </li>
                    )
                  })}
                </ol>
              </section>
            )}

            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-ink dark:text-white">Internal notes</h2>
                <span className="rounded-md border border-ink/10 dark:border-white/10 px-2 py-1 text-xs text-graphite dark:text-slate-300">Private to operators</span>
              </div>
              <form onSubmit={submitNote} className="space-y-3">
                <Textarea label="Add a private note" value={noteText} onChange={(event) => setNoteText(event.target.value)} placeholder="Record review context for the team. Use @mention to include an operator." rows={3} />
                <div className="flex flex-wrap items-center gap-2">
                  <label htmlFor="mention-operator" className="text-xs text-graphite dark:text-slate-300">Mention operator</label>
                  <Select id="mention-operator" value={mentionOperatorId} onChange={(event) => setMentionOperatorId(event.target.value)} className="!min-h-11 !w-auto !min-w-[180px] !border-[var(--nc-line)] !bg-[var(--nc-surface)] !text-[var(--nc-text)]">
                    <option value="">Choose operator</option>
                    {operators.map((operator) => <option key={operator.id} value={operator.userId}>{operator.fullName || operator.email}</option>)}
                  </Select>
                  <Button type="button" size="sm" variant="outline" disabled={!mentionOperatorId} onClick={() => {
                    const selected = operators.find((operator) => operator.userId === mentionOperatorId)
                    if (selected) {
                      setMentionedOperatorIds((current) => current.includes(selected.userId) ? current : [...current, selected.userId])
                      setNoteText((current) => `${current}${current.trim() ? ' ' : ''}@${selected.fullName || selected.email} `)
                    }
                  }}>Insert mention</Button>
                  <Button type="submit" size="sm" variant="accent" loading={localBusy} disabled={!noteText.trim()}>
                    <Plus className="h-4 w-4" /> Add note
                  </Button>
                </div>
              </form>
              <ol className="divide-y divide-ink/10 dark:divide-white/10 border-y border-ink/10 dark:border-white/10">
                {noteList.length ? noteList.map((note) => (
                  <li key={note.id} className="py-3">
                    <p className="whitespace-pre-wrap break-words text-sm text-ink dark:text-white">{note.body}</p>
                    <p className="mt-1 text-xs text-graphite dark:text-slate-400">{note.author_name} · {formatDateTime(note.created_at)}</p>
                  </li>
                )) : <li className="py-4 text-sm text-graphite dark:text-slate-300">No internal notes yet.</li>}
              </ol>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-ink dark:text-white">Communication history</h2>
              <ol className="divide-y divide-ink/10 dark:divide-white/10 border-y border-ink/10 dark:border-white/10">
                {communications.length ? communications.map((item) => (
                  <li key={item.id} className="py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-ink dark:text-white">{item.subject}</p>
                      <span className={`rounded-full border px-2 py-0.5 text-xs ${item.status === 'failed' ? 'border-red-500/25 dark:border-rose-300/30 text-red-700 dark:text-rose-100' : item.status === 'delivered' ? 'border-emerald-500/25 dark:border-emerald-300/30 text-emerald-700 dark:text-emerald-100' : item.status === 'unknown' ? 'border-amber-500/25 dark:border-amber-300/30 text-amber-700 dark:text-amber-100' : 'border-ink/15 dark:border-white/15 text-ink dark:text-slate-200'}`}>
                        {emailDeliveryLabel[item.status]}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-graphite dark:text-slate-400">{item.direction === 'outbound' ? 'Outbound' : 'Received'} · {formatDateTime(item.created_at)}</p>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm text-ink dark:text-slate-200">{item.body}</p>
                  </li>
                )) : <li className="py-4 text-sm text-graphite dark:text-slate-300">No applicant emails are recorded yet.</li>}
              </ol>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-ink dark:text-white">Activity</h2>
              <ol className="space-y-0 border-l border-ink/15 dark:border-white/15 pl-4">
                {activity.length ? activity.map((event) => (
                  <li key={event.id} className="relative border-b border-ink/[0.07] dark:border-white/[0.07] py-3 last:border-0">
                    <span className="absolute -left-[21px] top-4 h-2.5 w-2.5 rounded-full border-2 border-[var(--nc-surface)] bg-graphite" aria-hidden="true" />
                    <p className="text-sm font-medium text-ink dark:text-white">{event.action}</p>
                    <p className="mt-0.5 text-sm text-ink dark:text-slate-200">{event.summary}</p>
                    <p className="mt-1 text-xs text-graphite dark:text-slate-400">{event.actor_name} · {formatDateTime(event.created_at)}</p>
                  </li>
                )) : <li className="py-3 text-sm text-graphite dark:text-slate-300">No activity has been recorded yet.</li>}
              </ol>
            </section>
          </div>

          <aside className="space-y-5 xl:sticky xl:top-5">
            <section className="space-y-4 rounded-xl border border-[var(--nc-line)] bg-[var(--nc-surface)] p-4">
              <div>
                <h2 className="text-base font-semibold text-ink dark:text-white">Review actions</h2>
                <p className="mt-1 text-xs text-graphite dark:text-slate-300">Changes are recorded in the application history.</p>
                {!EMAIL_WORKFLOW_ENABLED && <p className="mt-2 text-xs text-amber-700 dark:text-amber-200">Rejection and applicant-email actions are disabled until provider delivery verification is configured.</p>}
              </div>
              {application.status === 'pending' && (
                <div className="space-y-3 border-t border-ink/10 dark:border-white/10 pt-4">
                  <Input label="School shortcode" value={shortcodes[application.id] ?? ''} onChange={(event) => setShortcodes((current) => ({ ...current, [application.id]: event.target.value }))} placeholder="school-code" />
                  <Button className="w-full" variant="accent" loading={approvingId === application.id} disabled={!shortcodes[application.id]?.trim()} onClick={() => setConfirmApprove(true)}>
                    <Check className="h-4 w-4" /> Approve and start onboarding
                  </Button>
                  <Button className="w-full" variant="outline" disabled={!EMAIL_WORKFLOW_ENABLED} onClick={onReject}>Reject application</Button>
                </div>
              )}
              {application.status === 'awaiting_information' && (
                <div className="space-y-3 border-t border-ink/10 dark:border-white/10 pt-4">
                  <Input label="School shortcode" value={shortcodes[application.id] ?? ''} onChange={(event) => setShortcodes((current) => ({ ...current, [application.id]: event.target.value }))} placeholder="school-code" />
                  <Button className="w-full" variant="accent" loading={approvingId === application.id} disabled={!shortcodes[application.id]?.trim()} onClick={() => setConfirmApprove(true)}>
                    <Check className="h-4 w-4" /> Approve and start onboarding
                  </Button>
                  <Button className="w-full" variant="outline" disabled={!EMAIL_WORKFLOW_ENABLED} onClick={onReject}>Reject application</Button>
                </div>
              )}
              {application.status === 'rejected' && (
                <Button className="w-full" variant="outline" disabled={localBusy} onClick={() => setConfirmReopen(true)}>
                  Reopen application
                </Button>
              )}
              {application.status === 'approved' && (
                <Button className="w-full" variant="accent" disabled={localBusy} onClick={() => void runDetailAction('start_onboarding', {}, 'Onboarding started.')}>
                  Start onboarding
                </Button>
              )}
              {isActionable(application) && (
                <form className="space-y-3 border-t border-ink/10 dark:border-white/10 pt-4" onSubmit={submitRequest}>
                  <h3 className="text-sm font-semibold text-ink dark:text-white">Request information</h3>
                  {docList.length > 0 && (
                    <fieldset className="space-y-2">
                      <legend className="text-xs font-medium text-graphite dark:text-slate-300">Missing items</legend>
                      {docList.map((document) => (
                        <label key={document.id} className="flex min-h-11 items-center gap-2 text-sm text-ink dark:text-slate-200">
                          <input type="checkbox" checked={missingDocumentIds.includes(document.id)} onChange={(event) => setMissingDocumentIds((current) => event.target.checked ? [...current, document.id] : current.filter((id) => id !== document.id))} className="h-4 w-4 accent-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand" />
                          {document.name}
                        </label>
                      ))}
                    </fieldset>
                  )}
                  <Input label="Response deadline" type="date" value={requestDueDate} onChange={(event) => setRequestDueDate(event.target.value)} required />
                  <Textarea label="Message to applicant" value={requestMessage} onChange={(event) => setRequestMessage(event.target.value)} rows={3} required />
                  <Button type="submit" className="w-full" variant="outline" loading={localBusy} disabled={!EMAIL_WORKFLOW_ENABLED || !requestMessage.trim() || !requestDueDate}>
                    <PaperPlaneTilt className="h-4 w-4" /> Request information
                  </Button>
                  {!EMAIL_WORKFLOW_ENABLED && <p className="text-xs text-amber-700 dark:text-amber-200">Email is unavailable until provider delivery verification is configured.</p>}
                </form>
              )}
            </section>

            <section className="space-y-3 rounded-xl border border-[var(--nc-line)] bg-[var(--nc-surface)] p-4">
              <h2 className="text-base font-semibold text-ink dark:text-white">Reviewer and priority</h2>
              <Select label="Assigned reviewer" value={reviewerId} onChange={(event) => setReviewerId(event.target.value)}>
                <option value="">Unassigned</option>
                {operators.map((operator) => <option key={operator.id} value={operator.userId}>{operator.fullName || operator.email}</option>)}
              </Select>
              <Input label="Review due date" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
              <Select label="Priority" value={priority} onChange={(event) => setPriority(event.target.value as ApplicationPriority)}>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </Select>
              <Textarea label="Internal instructions" value={assignmentInstructions} onChange={(event) => setAssignmentInstructions(event.target.value)} placeholder="Optional context for the assigned reviewer" rows={3} />
              <Button variant="outline" className="w-full" disabled={localBusy} loading={localBusy} onClick={() => void saveAssignment()}>
                <Users className="h-4 w-4" /> Save assignment
              </Button>
            </section>

            <section className="space-y-3 rounded-xl border border-[var(--nc-line)] bg-[var(--nc-surface)] p-4">
              <h2 className="text-base font-semibold text-ink dark:text-white">Email applicant</h2>
              <form className="space-y-3" onSubmit={submitEmail}>
                <Select label="Template" value={emailTemplate} onChange={(event) => {
                  const nextTemplate = event.target.value as EmailTemplateId
                  const next = emailTemplates[nextTemplate]
                  if (!next) return
                  setEmailTemplate(nextTemplate)
                  setEmailSubject(next.subject)
                  setEmailBody(next.body)
                }}>
                  {Object.entries(emailTemplates).map(([key, value]) => {
                    const available = key === 'rejection'
                      ? application.status === 'rejected'
                      : key === 'onboarding_instructions'
                        ? application.status === 'approved' || application.status === 'onboarding'
                        : isActionable(application)
                    return <option key={key} value={key} disabled={!available}>{value.label}</option>
                  })}
                </Select>
                <Input label="Subject" value={emailSubject} onChange={(event) => setEmailSubject(event.target.value)} required />
                <Textarea label="Message" value={emailBody} onChange={(event) => setEmailBody(event.target.value)} rows={4} required />
                <Button type="submit" variant="outline" className="w-full" loading={localBusy} disabled={!EMAIL_WORKFLOW_ENABLED || !emailSubject.trim() || !emailBody.trim()}>
                  <EnvelopeSimple className="h-4 w-4" /> Send email
                </Button>
                {!EMAIL_WORKFLOW_ENABLED && <p className="text-xs text-amber-700 dark:text-amber-200">Email is unavailable until provider delivery verification is configured.</p>}
              </form>
            </section>

            {(application.status === 'approved' || application.status === 'onboarding') && (
              <p className="rounded-lg border border-emerald-500/25 dark:border-emerald-300/25 bg-emerald-500/[0.06] dark:bg-emerald-300/5 p-3 text-sm text-emerald-700 dark:text-emerald-100">
                The school has been approved and its onboarding progress is shown above.
              </p>
            )}
          </aside>
        </div>

        <Modal
          open={confirmApprove}
          onClose={() => setConfirmApprove(false)}
          title="Approve school application?"
          description="This creates the school and administrator account, then sends a single-use activation link. The administrator sets their own password."
        >
          <div className="space-y-4">
            <div className="rounded-lg border border-ink/10 dark:border-white/10 bg-ink/[0.03] dark:bg-white/[0.03] p-3 text-sm">
              <p className="font-semibold text-ink dark:text-white">{application.school_name}</p>
              <p className="mt-1 break-all text-graphite dark:text-slate-300">{application.email}</p>
              <p className="mt-1 text-xs text-graphite dark:text-slate-400">Shortcode: {shortcodes[application.id]}</p>
            </div>
            {actionError && <p role="alert" className="text-sm text-red-700 dark:text-rose-100">{actionError}</p>}
            <div className="flex flex-wrap justify-end gap-2 border-t border-ink/10 dark:border-white/10 pt-4">
              <Button variant="outline" onClick={() => setConfirmApprove(false)} disabled={approvingId === application.id}>Cancel</Button>
              <Button variant="accent" loading={approvingId === application.id} onClick={() => {
                setConfirmApprove(false)
                onApprove()
              }}>Confirm approval</Button>
            </div>
          </div>
        </Modal>

        <Modal
          open={confirmReopen}
          onClose={() => setConfirmReopen(false)}
          title="Reopen this application?"
          description="The application will return to review. The rejection and its audit history will remain recorded."
        >
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmReopen(false)}>Cancel</Button>
            <Button variant="accent" loading={localBusy} onClick={() => {
              setConfirmReopen(false)
              void runDetailAction('reopen', {}, 'Application reopened for review.')
            }}>Confirm reopen</Button>
          </div>
        </Modal>
      </section>
    )

  }

  if (applicationId) {
    return (
      <>
        <ApplicationDetailView
          application={selectedApplication}
          operators={operators}
          now={now}
          duplicate={selectedApplication ? duplicateEmails.has(selectedApplication.email.trim().toLowerCase()) : false}
          shortcodes={shortcodes}
          setShortcodes={setShortcodes}
          busy={busy}
          approvingId={approvingId}
          approvalResult={approvalResult}
          onResendActivation={() => void resendActivation()}
          resendingActivation={resendingActivation}
          resentNote={resentNote}
          actionError={actionError}
          setActionError={setActionError}
          onApprove={() => selectedApplication && void approve(selectedApplication)}
          onReject={() => setPendingAction({ kind: 'reject' })}
          onBack={() => navigate('/platform/applications', { replace: true, state: { applicationsList: currentListState } })}
          onReload={() => void loadApplications()}
          onAction={invokeAction}
          onToast={setToast}
        />
        {pendingAction?.kind === 'reject' && selectedApplication && (
          <Modal
            open
            onClose={() => {
              if (!busy) {
                setPendingAction(null)
                setActionError(null)
              }
            }}
            title="Reject application"
            description="Review the reason and applicant-facing message before recording this decision."
          >
            <form className="space-y-4" onSubmit={(event) => void rejectOne(event)}>
              <div className="rounded-lg border border-ink/10 dark:border-white/10 bg-ink/[0.03] dark:bg-white/[0.03] p-3 text-sm">
                <p className="font-semibold text-ink dark:text-white">{selectedApplication.school_name}</p>
                <p className="mt-1 break-all font-mono text-xs text-graphite dark:text-slate-400">{selectedApplication.id}</p>
              </div>
              <Select label="Rejection reason" value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} required>
                <option value="">Choose a standardized reason</option>
                {rejectionReasons.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
              </Select>
              <Textarea label="Applicant message" value={rejectionMessage} onChange={(event) => setRejectionMessage(event.target.value)} placeholder="Optional message explaining the decision" rows={4} />
              {actionError && <p role="alert" className="rounded-lg border border-red-500/25 dark:border-rose-300/30 bg-red-500/[0.06] dark:bg-rose-300/5 p-3 text-sm text-red-700 dark:text-rose-100">{actionError}</p>}
              <div className="flex justify-end gap-2 border-t border-ink/10 dark:border-white/10 pt-4">
                <Button type="button" variant="outline" onClick={() => setPendingAction(null)} disabled={busy}>Cancel</Button>
                <Button type="submit" variant="danger" loading={busy} disabled={!rejectionReason}>Confirm rejection</Button>
              </div>
            </form>
          </Modal>
        )}
        {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
      </>
    )
  }

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink dark:text-white sm:text-3xl">School applications</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-graphite dark:text-slate-300">Review submissions, verify school details, and move each application forward.</p>
        </div>
        <p className="rounded-lg border border-ink/10 dark:border-white/10 bg-ink/[0.035] dark:bg-white/[0.04] px-3 py-2 text-xs tabular-nums text-graphite dark:text-slate-300">
          {statusCounts.all} active application{statusCounts.all === 1 ? '' : 's'}
        </p>
      </header>

      {loadError && <ErrorNotice message={loadError} onRetry={() => void loadApplications()} />}
      {actionError && <ErrorNotice message={actionError} onDismiss={() => setActionError(null)} />}
      {approvalResult && <ApprovalResult result={approvalResult} onResend={() => void resendActivation()} resending={resendingActivation} resentNote={resentNote} />}
      {bulkApprovalSummary && <BulkApprovalResult summary={bulkApprovalSummary} />}
      {bulkActionSummary && <BulkActionResult summary={bulkActionSummary} />}

      <nav aria-label="Filter applications by status" className="flex gap-2 overflow-x-auto border-b border-ink/10 dark:border-white/10 pb-px">
        {statusOptions.map((option) => {
          const active = statusFilter === option.value
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => setStatusFilter(option.value)}
              className={`inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                active ? 'border-brand font-semibold text-ink dark:text-white' : 'border-transparent text-graphite dark:text-slate-300 hover:text-ink dark:hover:text-white'
              }`}
            >
              {option.label}
              <span className={`rounded-full px-1.5 py-0.5 text-xs tabular-nums ${active ? 'bg-brand/20 text-brand dark:text-orange-100' : 'bg-ink/[0.06] dark:bg-white/[0.08] text-graphite dark:text-slate-300'}`}>
                {statusCounts[option.value]}
              </span>
            </button>
          )
        })}
      </nav>

      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1.5fr)_repeat(5,minmax(132px,1fr))]">
          <Input
            label="Search applications"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="School, ID, administrator, email"
            icon={<MagnifyingGlass className="h-4 w-4" />}
            className="!border-ink/15 !dark:border-white/15 !bg-ink/[0.035] !dark:bg-white/[0.04] !text-ink !dark:text-white !placeholder:text-graphite !dark:placeholder:text-slate-400"
          />
          <Select label="City or country" value={cityFilter} onChange={(event) => setCityFilter(event.target.value)} className="!border-[var(--nc-line)] !bg-[var(--nc-surface)] !text-[var(--nc-text)]">
            <option value="all">All locations</option>
            {cities.map((city) => <option key={city} value={city}>{city}</option>)}
          </Select>
          <Select label="Reviewer" value={reviewerFilter} onChange={(event) => setReviewerFilter(event.target.value)} className="!border-[var(--nc-line)] !bg-[var(--nc-surface)] !text-[var(--nc-text)]">
            <option value="all">All reviewers</option>
            <option value="unassigned">Unassigned</option>
            {operators.map((operator) => <option key={operator.id} value={operator.userId}>{operator.fullName || operator.email}</option>)}
          </Select>
          <Input label="Submitted after" type="date" value={submittedAfter} onChange={(event) => setSubmittedAfter(event.target.value)} className="!border-ink/15 !dark:border-white/15 !bg-ink/[0.035] !dark:bg-white/[0.04] !text-ink !dark:text-white" />
          <Input label="Submitted before" type="date" value={submittedBefore} onChange={(event) => setSubmittedBefore(event.target.value)} className="!border-ink/15 !dark:border-white/15 !bg-ink/[0.035] !dark:bg-white/[0.04] !text-ink !dark:text-white" />
          <Select label="Sort by submission" value={sortOrder} onChange={(event) => setSortOrder(event.target.value as 'newest' | 'oldest')} className="!border-[var(--nc-line)] !bg-[var(--nc-surface)] !text-[var(--nc-text)]">
            <option value="oldest">Oldest first</option>
            <option value="newest">Newest first</option>
          </Select>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={needsAttention}
              onChange={(event) => setNeedsAttention(event.target.checked)}
              className="h-4 w-4 rounded border-ink/25 dark:border-white/30 bg-transparent accent-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            />
            <span>
              <span className="block text-sm font-medium text-ink dark:text-white">Needs attention</span>
              <span className="block text-xs text-graphite dark:text-slate-300">Overdue reviews or flagged submissions</span>
            </span>
          </label>
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(event) => setShowArchived(event.target.checked)}
              className="h-4 w-4 rounded border-ink/25 dark:border-white/30 bg-transparent accent-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            />
            <span className="text-sm text-ink dark:text-slate-200">Include archived applications</span>
          </label>
          <p className="text-xs tabular-nums text-graphite dark:text-slate-400" aria-live="polite">
            Showing {filteredApplications.length} of {showArchived ? applications.length : statusCounts.all}
          </p>
        </div>
      </div>

      {selectedIds.length > 0 && (
        <div className="sticky top-3 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-brand/40 bg-[var(--nc-surface)] p-3" aria-label={`${selectedIds.length} applications selected`}>
          <span className="mr-auto px-1 text-sm font-semibold text-ink dark:text-white">{selectedIds.length} selected</span>
          <Button size="sm" className="min-h-11" variant="outline" disabled={!canEditSelected} onClick={() => setPendingAction({ kind: 'assign_reviewer' })} icon={<Users className="h-4 w-4" />}>Assign reviewer</Button>
          <Button size="sm" className="min-h-11" variant="outline" disabled={!EMAIL_WORKFLOW_ENABLED || !canEditSelected} onClick={() => {
            setTemplate('documents_needed')
            setPendingAction({ kind: 'send_template' })
          }} icon={<EnvelopeSimple className="h-4 w-4" />}>Send template</Button>
          <Button size="sm" className="min-h-11" variant="outline" onClick={() => exportPermittedData(selectedApplications)} icon={<DownloadSimple className="h-4 w-4" />}>Export permitted data</Button>
          <Button size="sm" className="min-h-11" variant="outline" disabled={!canEditSelected} onClick={() => setPendingAction({ kind: 'change_priority' })} icon={<Flag className="h-4 w-4" />}>Change priority</Button>
          <Button size="sm" className="min-h-11" variant="outline" disabled={!EMAIL_WORKFLOW_ENABLED || !canDecideSelected} onClick={() => setPendingAction({ kind: 'reject' })} icon={<X className="h-4 w-4" />}>Reject selected</Button>
          <Button size="sm" className="min-h-11" variant="accent" disabled={!canDecideSelected} onClick={() => setPendingAction({ kind: 'approve' })} icon={<Check className="h-4 w-4" />}>Approve selected</Button>
          {allSelectedArchived
            ? <Button size="sm" className="min-h-11" variant="outline" onClick={() => setPendingAction({ kind: 'unarchive' })}>Restore from archive</Button>
            : <Button size="sm" className="min-h-11" variant="outline" disabled={!canEditSelected} onClick={() => setPendingAction({ kind: 'archive' })} icon={<Archive className="h-4 w-4" />}>Archive</Button>}
          <button type="button" className="min-h-11 min-w-11 rounded-lg p-2 text-graphite dark:text-slate-300 hover:bg-ink/5 dark:hover:bg-white/10 hover:text-ink dark:hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand" aria-label="Clear selection" onClick={() => setSelectedIds([])}>
            <X className="mx-auto h-4 w-4" />
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-[var(--nc-line)] bg-[var(--nc-surface)]">
        {filteredApplications.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <FileText className="mx-auto h-8 w-8 text-graphite dark:text-slate-400" aria-hidden="true" />
            <h2 className="mt-3 text-base font-semibold text-ink dark:text-white">No applications found</h2>
            <p className="mt-1 text-sm text-graphite dark:text-slate-300">Try changing the status or clearing one of the filters.</p>
            <Button variant="outline" size="sm" onClick={() => {
              setSearch('')
              setStatusFilter('all')
              setCityFilter('all')
              setReviewerFilter('all')
              setSubmittedAfter('')
              setSubmittedBefore('')
              setNeedsAttention(false)
              setShowArchived(false)
            }} className="mt-4 min-h-11">Clear filters</Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-left">
              <thead className="border-b border-ink/10 dark:border-white/10 bg-ink/[0.03] dark:bg-white/[0.03] text-xs font-semibold uppercase tracking-wide text-graphite dark:text-slate-300">
                <tr>
                  <th scope="col" className="w-12 px-4 py-3">
                    <label className="flex min-h-11 min-w-11 items-center justify-center">
                      <input
                        type="checkbox"
                        aria-label="Select all applications on this page"
                        checked={filteredApplications.length > 0 && filteredApplications.every((application) => selectedIds.includes(application.id))}
                        onChange={(event) => selectVisible(event.target.checked)}
                        className="h-4 w-4 rounded border-ink/25 dark:border-white/30 bg-transparent accent-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                      />
                    </label>
                  </th>
                  <th scope="col" className="px-4 py-3">School</th>
                  <th scope="col" className="px-4 py-3">Location</th>
                  <th scope="col" className="px-4 py-3">Submitted</th>
                  <th scope="col" className="px-4 py-3">Reviewer</th>
                  <th scope="col" className="px-4 py-3">Priority</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                  <th scope="col" className="px-4 py-3">Review due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/[0.06] dark:divide-white/[0.07]">
                {filteredApplications.map((application) => {
                  const reviewer = operators.find((operator) => operator.userId === application.assigned_reviewer)
                  const duplicate = duplicateEmails.has(application.email.trim().toLowerCase())
                  const flagged = Boolean(application.review_flags?.duplicate_suspected || application.review_flags?.contact_mismatch_suspected || duplicate || isOverdue(application, now))
                  return (
                    <tr
                      key={application.id}
                      onClick={(event) => {
                        const target = event.target
                        if (target instanceof Element && target.closest('a, button, input, label')) return
                        navigate(`/platform/applications/${encodeURIComponent(application.id)}`, { state: { applicationsList: currentListState } })
                      }}
                      className={`cursor-pointer transition-colors hover:bg-ink/[0.035] dark:hover:bg-white/[0.035] ${selectedIds.includes(application.id) ? 'bg-brand/[0.06]' : ''}`}
                    >
                      <td className="px-4 py-4 align-top">
                        <label className="flex min-h-11 min-w-11 items-start justify-center pt-0.5">
                          <input
                            type="checkbox"
                            aria-label={`Select ${application.school_name}`}
                            checked={selectedIds.includes(application.id)}
                            onChange={() => toggleSelected(application.id)}
                            className="mt-2 h-4 w-4 rounded border-ink/25 dark:border-white/30 bg-transparent accent-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-40"
                          />
                        </label>
                      </td>
                      <td className="max-w-[280px] px-4 py-4 align-top">
                        <Link
                          to={`/platform/applications/${encodeURIComponent(application.id)}`}
                          state={{ applicationsList: currentListState }}
                          className="group block rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                        >
                          <span className="flex items-start gap-2 font-semibold text-ink dark:text-white group-hover:text-brand dark:group-hover:text-orange-200">
                            <Buildings className="mt-0.5 h-4 w-4 shrink-0 text-graphite dark:text-slate-400" aria-hidden="true" />
                            <span className="break-words">{application.school_name}</span>
                            <ArrowSquareOut className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-0 group-hover:opacity-100" aria-hidden="true" />
                          </span>
                          <span className="mt-1 block pl-6 text-xs text-graphite dark:text-slate-300">{application.administrator_name} · {application.email}</span>
                          <span className="mt-1 block break-all pl-6 text-[11px] text-graphite dark:text-slate-400">{application.id}</span>
                        </Link>
                        {flagged && (
                          <span className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-amber-500/25 dark:border-amber-300/25 bg-amber-500/10 dark:bg-amber-300/10 px-2 py-1 text-xs text-amber-700 dark:text-amber-100">
                            <ShieldWarning className="h-3.5 w-3.5" aria-hidden="true" />
                            Human review
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 align-top text-sm text-ink dark:text-slate-200">{application.city || application.country || 'Not provided'}</td>
                      <td className="whitespace-nowrap px-4 py-4 align-top text-sm tabular-nums text-ink dark:text-slate-200">{formatDate(application.created_at)}</td>
                      <td className="px-4 py-4 align-top text-sm text-ink dark:text-slate-200">{reviewer?.fullName || reviewer?.email || 'Unassigned'}</td>
                      <td className="px-4 py-4 align-top text-sm capitalize text-ink dark:text-slate-200">{application.priority || 'Normal'}</td>
                      <td className="px-4 py-4 align-top"><StatusBadge status={application.status} /></td>
                      <td className={`whitespace-nowrap px-4 py-4 align-top text-sm tabular-nums ${isOverdue(application, now) ? 'font-semibold text-red-700 dark:text-rose-200' : 'text-ink dark:text-slate-200'}`}>
                        {application.review_due_at ? formatDate(application.review_due_at) : 'Not set'}
                        {isOverdue(application, now) && <span className="mt-1 block text-xs">Overdue</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pendingAction && (
        <Modal
          open
          onClose={() => {
            if (!busy) {
              setPendingAction(null)
              setActionError(null)
            }
          }}
          title={pendingAction.kind === 'reject' ? 'Review rejection' : pendingAction.kind === 'archive' ? 'Archive applications' : pendingAction.kind === 'unarchive' ? 'Restore applications' : pendingAction.kind === 'approve' ? 'Review approval' : 'Confirm bulk action'}
          description={`${selectedIds.length} application${selectedIds.length === 1 ? '' : 's'} selected. Review the summary before applying changes.`}
          size="lg"
        >
          <form className="space-y-4" onSubmit={(event) => pendingAction.kind === 'reject' && selectedApplication ? void rejectOne(event) : void submitBulkAction(event)}>
            <div className="max-h-44 overflow-y-auto rounded-lg border border-ink/10 dark:border-white/10 bg-ink/[0.03] dark:bg-white/[0.03] p-3">
              <ul className="space-y-2 text-sm text-ink dark:text-slate-200">
                {(selectedApplication ? [selectedApplication] : selectedApplications).map((application) => (
                  <li key={application.id} className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">{application.school_name}</span>
                    <span className="font-mono text-xs text-graphite dark:text-slate-400">{application.id}</span>
                  </li>
                ))}
              </ul>
            </div>

            {pendingAction.kind === 'assign_reviewer' && (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Select label="Reviewer" value={reviewerId} onChange={(event) => setReviewerId(event.target.value)} required>
                    <option value="">Choose reviewer</option>
                    <option value="unassigned">Unassign</option>
                    {operators.map((operator) => <option key={operator.id} value={operator.userId}>{operator.fullName || operator.email}</option>)}
                  </Select>
                  <Input label="Review due date" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
                </div>
                <Textarea label="Internal instructions" value={assignmentInstructions} onChange={(event) => setAssignmentInstructions(event.target.value)} placeholder="Optional context for the assigned reviewer" rows={3} />
              </div>
            )}

            {pendingAction.kind === 'change_priority' && (
              <Select label="Priority" value={priority} onChange={(event) => setPriority(event.target.value as ApplicationPriority)}>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </Select>
            )}

            {pendingAction.kind === 'send_template' && (
              <Select label="Email template" value={template} onChange={(event) => {
                const value = event.target.value as EmailTemplateId
                if (value in emailTemplates) setTemplate(value)
              }}>
                <option value="rejection" disabled={!selectedApplications.every((application) => application.status === 'rejected')}>Rejection</option>
                <option value="documents_needed">Documents needed</option>
                <option value="onboarding_instructions" disabled={!selectedApplications.every((application) => application.status === 'approved' || application.status === 'onboarding')}>Onboarding instructions</option>
              </Select>
            )}

            {pendingAction.kind === 'reject' && (
              <div className="space-y-4">
                <Select label="Rejection reason" value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} required>
                  <option value="">Choose a standardized reason</option>
                  {rejectionReasons.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
                </Select>
                <Textarea label="Applicant message" value={rejectionMessage} onChange={(event) => setRejectionMessage(event.target.value)} placeholder="Optional message explaining the decision" rows={4} />
                <p className="text-xs text-graphite dark:text-slate-300">This is a permanent decision for the selected application. Reopening remains available from its detail view.</p>
              </div>
            )}

            {pendingAction.kind === 'archive' && (
              <p className="text-sm text-ink dark:text-slate-200">Archived applications leave the active queue and remain available in the audit history.</p>
            )}

            {pendingAction.kind === 'unarchive' && (
              <p className="text-sm text-ink dark:text-slate-200">These applications will return to the active queue. Their review history will be preserved.</p>
            )}

            {pendingAction.kind === 'approve' && (
              <div className="space-y-3">
                <p className="text-sm text-ink dark:text-slate-200">Each school is created separately and its administrator receives a single-use activation link. Enter a unique shortcode for each school before confirming.</p>
                <div className="space-y-3">
                  {selectedApplications.map((application) => (
                    <Input
                      key={application.id}
                      label={`${application.school_name} shortcode`}
                      value={shortcodes[application.id] ?? ''}
                      onChange={(event) => setShortcodes((current) => ({ ...current, [application.id]: event.target.value }))}
                      placeholder="school-code"
                      required
                    />
                  ))}
                </div>
              </div>
            )}

            {actionError && <p role="alert" className="rounded-lg border border-red-500/25 dark:border-rose-300/30 bg-red-500/[0.06] dark:bg-rose-300/5 p-3 text-sm text-red-700 dark:text-rose-100">{actionError}</p>}

            <div className="flex flex-wrap justify-end gap-2 border-t border-ink/10 dark:border-white/10 pt-4">
              <Button type="button" variant="outline" onClick={() => setPendingAction(null)} disabled={busy}>Cancel</Button>
              <Button
                type="submit"
                variant={pendingAction.kind === 'reject' ? 'danger' : 'accent'}
                loading={busy}
                disabled={
                  ((pendingAction.kind === 'reject' || pendingAction.kind === 'approve') && !canDecideSelected) ||
                  (!EMAIL_WORKFLOW_ENABLED && (pendingAction.kind === 'reject' || pendingAction.kind === 'send_template')) ||
                  (pendingAction.kind === 'reject' && !rejectionReason) ||
                  (pendingAction.kind === 'approve' && selectedApplications.some((application) => !shortcodes[application.id]?.trim()))
                }
              >
                {pendingAction.kind === 'reject' ? 'Confirm rejection' : pendingAction.kind === 'archive' ? 'Archive applications' : pendingAction.kind === 'unarchive' ? 'Restore applications' : pendingAction.kind === 'approve' ? 'Confirm approvals' : 'Apply to selected'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    </section>
  )
}
