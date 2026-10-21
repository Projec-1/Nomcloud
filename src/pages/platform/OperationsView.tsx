import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowLeft, Clock, MagnifyingGlass, Plus, WarningCircle } from '@phosphor-icons/react'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import type { PlatformOperatorRecord } from '@/services/platformService'
import {
  addPlatformCaseEvent,
  createPlatformCase,
  fetchPlatformCaseEvents,
  fetchPlatformCases,
  updatePlatformCase,
  type PlatformCase,
  type PlatformCaseEvent,
  type PlatformCasePriority,
  type PlatformCaseSeverity,
  type PlatformCaseStatus,
  type PlatformCaseType,
} from '@/services/platformOperationsService'
import type { School } from './types'

const activeStatuses: PlatformCaseStatus[] = ['open', 'investigating', 'waiting', 'escalated']
const statusLabel: Record<PlatformCaseStatus, string> = {
  open: 'Open',
  investigating: 'Investigating',
  waiting: 'Waiting',
  escalated: 'Escalated',
  resolved: 'Resolved',
  closed: 'Closed',
}
const priorityLabel: Record<PlatformCasePriority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
}
const severityLabel: Record<PlatformCaseSeverity, string> = {
  sev1: 'SEV 1 · Critical',
  sev2: 'SEV 2 · High',
  sev3: 'SEV 3 · Moderate',
  sev4: 'SEV 4 · Low',
}
const caseTypeLabel: Record<PlatformCaseType, string> = {
  support: 'Support',
  account: 'Account',
  billing: 'Billing',
  technical: 'Technical',
  school_request: 'School request',
  incident: 'Incident',
  other: 'Other',
}
const fieldClass = 'input min-h-11 w-full'
const panelClass = 'border border-ink/[0.1] bg-white p-5 dark:border-white/[0.1] dark:bg-white/[0.03]'

function dateTime(value: string | null): string {
  if (!value) return 'No deadline'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Invalid date' : date.toLocaleString()
}

function localDateTimeInput(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function isOverdue(item: PlatformCase): boolean {
  return Boolean(item.dueAt && activeStatuses.includes(item.status) && new Date(item.dueAt).getTime() < Date.now())
}

function badgeClass(value: string): string {
  if (value === 'urgent' || value === 'sev1' || value === 'escalated') return 'bg-red-500/10 text-red-700 dark:text-red-300'
  if (value === 'high' || value === 'sev2' || value === 'waiting') return 'bg-amber-500/10 text-amber-800 dark:text-amber-300'
  if (value === 'resolved' || value === 'closed') return 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
  if (value === 'investigating' || value === 'sev3') return 'bg-blue-500/10 text-blue-800 dark:text-blue-300'
  return 'bg-ink/[0.06] text-graphite dark:bg-white/[0.08]'
}

function safeEvidenceUrl(reference: string): string | null {
  try {
    const url = new URL(reference)
    return url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

function LabeledField({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block min-w-0"><span className="mb-1.5 block text-xs font-semibold text-graphite">{label}</span>{children}</label>
}

interface OperationsViewProps {
  currentPath: string
  authUserId: string
  schools: School[]
  operators: PlatformOperatorRecord[]
  navigate: (path: string) => void
  notify: (message: string) => void
}

export default function OperationsView({ currentPath, authUserId, schools, operators, navigate, notify }: OperationsViewProps) {
  const [cases, setCases] = useState<PlatformCase[]>([])
  const [events, setEvents] = useState<PlatformCaseEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('active')
  const [priorityFilter, setPriorityFilter] = useState(() => new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search).get('priority') ?? 'all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [deadlineFilter, setDeadlineFilter] = useState(() => new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search).get('deadline') ?? 'all')
  const [assigneeFilter, setAssigneeFilter] = useState(() => new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search).get('assignment') ?? 'all')
  const [showCreate, setShowCreate] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [evidenceBody, setEvidenceBody] = useState('')
  const [evidenceReference, setEvidenceReference] = useState('')
  const [resolution, setResolution] = useState('')
  const [deadlineDraft, setDeadlineDraft] = useState('')
  const caseId = currentPath.startsWith('/platform/operations/')
    ? currentPath.slice('/platform/operations/'.length).split('/')[0]
    : null

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchPlatformCases()
      .then((rows) => {
        if (!cancelled) setCases(rows)
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [refresh])

  useEffect(() => {
    if (!caseId) {
      setEvents([])
      return
    }
    let cancelled = false
    setDetailLoading(true)
    fetchPlatformCaseEvents(caseId)
      .then((rows) => {
        if (!cancelled) setEvents(rows)
      })
      .catch((cause: unknown) => {
        if (!cancelled) notify(`Could not load the investigation timeline: ${cause instanceof Error ? cause.message : String(cause)}`)
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [caseId, refresh, notify])

  const selected = caseId ? cases.find((item) => item.id === caseId) : undefined
  useEffect(() => {
    setResolution(selected?.resolution ?? '')
    setDeadlineDraft(localDateTimeInput(selected?.dueAt ?? null))
  }, [selected?.id, selected?.resolution, selected?.dueAt])

  const currentOperatorId = operators.find((operator) => operator.userId === authUserId)?.id
  const visible = useMemo(() => cases.filter((item) => {
    const matchesSearch = `${item.title} ${item.id} ${item.description} ${item.team ?? ''}`.toLowerCase().includes(search.trim().toLowerCase())
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' ? activeStatuses.includes(item.status) : item.status === statusFilter)
    const matchesPriority = priorityFilter === 'all' || item.priority === priorityFilter
    const matchesType = typeFilter === 'all' || item.caseType === typeFilter
    const matchesDeadline = deadlineFilter === 'all'
      || (deadlineFilter === 'overdue' && isOverdue(item))
      || (deadlineFilter === 'no-deadline' && !item.dueAt)
    const matchesAssignee = assigneeFilter === 'all'
      || (assigneeFilter === 'unassigned' && !item.assignedOperatorId)
      || (assigneeFilter === 'mine' && item.assignedOperatorId === currentOperatorId)
      || item.assignedOperatorId === assigneeFilter
    return matchesSearch && matchesStatus && matchesPriority && matchesType && matchesDeadline && matchesAssignee
  }), [assigneeFilter, cases, currentOperatorId, deadlineFilter, operators, priorityFilter, search, statusFilter, typeFilter])
  const overdueCount = cases.filter(isOverdue).length
  const activeCount = cases.filter((item) => activeStatuses.includes(item.status)).length
  const unassignedCount = cases.filter((item) => activeStatuses.includes(item.status) && !item.assignedOperatorId).length

  const refreshCases = () => setRefresh((value) => value + 1)

  const update = async (patch: Parameters<typeof updatePlatformCase>[1], message: string) => {
    if (!selected) return
    setBusy(true)
    try {
      await updatePlatformCase(selected.id, patch)
      refreshCases()
      notify(message)
    } catch (cause: unknown) {
      notify(`Case was not updated: ${cause instanceof Error ? cause.message : String(cause)}`)
    } finally {
      setBusy(false)
    }
  }

  const saveNote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selected || !note.trim()) return
    setBusy(true)
    try {
      await addPlatformCaseEvent(selected.id, 'note', note, null)
      setNote('')
      refreshCases()
      notify('Private note added to the case history.')
    } catch (cause: unknown) {
      notify(`Note was not saved: ${cause instanceof Error ? cause.message : String(cause)}`)
    } finally {
      setBusy(false)
    }
  }

  const saveEvidence = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selected || !evidenceBody.trim() || !evidenceReference.trim()) return
    setBusy(true)
    try {
      await addPlatformCaseEvent(selected.id, 'evidence', evidenceBody, evidenceReference)
      setEvidenceBody('')
      setEvidenceReference('')
      refreshCases()
      notify('Evidence reference added to the case history.')
    } catch (cause: unknown) {
      notify(`Evidence reference was not saved: ${cause instanceof Error ? cause.message : String(cause)}`)
    } finally {
      setBusy(false)
    }
  }

  if (caseId) {
    if (loading) return <QueueLoading />
    if (error) return <QueueError error={error} retry={refreshCases} />
    if (!selected) {
      return <div className="space-y-5"><Button variant="outline" size="sm" onClick={() => navigate('/platform/operations')} icon={<ArrowLeft className="h-4 w-4" />}>Back to operations queue</Button><p className="border border-ink/10 p-6 text-sm text-graphite dark:border-white/10">This case was not found or is no longer available.</p></div>
    }
    const linkedSchool = schools.find((school) => school.id === selected.schoolId)
    const assignee = operators.find((operator) => operator.id === selected.assignedOperatorId)
    return (
      <div>
        <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <Button variant="ghost" size="sm" className="mb-3 px-0" onClick={() => navigate('/platform/operations')} icon={<ArrowLeft className="h-4 w-4" />}>Operations queue</Button>
            <h1 className="break-words text-2xl font-semibold tracking-tight sm:text-3xl">{selected.title}</h1>
            <p className="mt-2 break-all text-xs text-graphite">Case {selected.id} · Opened {dateTime(selected.createdAt)}</p>
          </div>
          <span className={`rounded-md px-3 py-1.5 text-sm font-semibold ${badgeClass(selected.status)}`}>{statusLabel[selected.status]}</span>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.8fr)]">
          <div className="min-w-0 space-y-6">
            <section className={panelClass}>
              <h2 className="font-semibold">Investigation</h2>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-ink dark:text-white">{selected.description || 'No case description was provided.'}</p>
              <p className="mt-4 border-t border-ink/10 pt-3 text-xs text-graphite dark:border-white/10">
                Keep student-identifiable information out of notes and evidence references. Use the school's existing records for any student-level review.
              </p>
            </section>

            <section className={panelClass}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-semibold">Case history</h2>
                {detailLoading && <span className="text-xs text-graphite">Refreshing history…</span>}
              </div>
              {events.length ? (
                <ol className="mt-4 divide-y divide-ink/10 dark:divide-white/10">
                  {events.map((event) => (
                    <li key={event.id} className="grid gap-1 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{event.body}</p>
                        <p className="mt-1 text-xs text-graphite">{event.eventType.split('_').join(' ')} · {event.actorName}</p>
                        {event.evidenceReference && (safeEvidenceUrl(event.evidenceReference)
                          ? <a className="mt-2 block break-all text-xs font-semibold text-brand underline underline-offset-2" href={safeEvidenceUrl(event.evidenceReference) ?? undefined} target="_blank" rel="noreferrer">Open evidence reference</a>
                          : <p className="mt-2 break-all text-xs text-graphite">Evidence reference: {event.evidenceReference}</p>)}
                      </div>
                      <time className="text-xs text-graphite">{dateTime(event.createdAt)}</time>
                    </li>
                  ))}
                </ol>
              ) : <p className="mt-4 text-sm text-graphite">No case history is recorded yet.</p>}
            </section>

            <section className={panelClass}>
              <h2 className="font-semibold">Internal notes</h2>
              <form className="mt-4 space-y-3" onSubmit={(event) => void saveNote(event)}>
                <LabeledField label="Private note">
                  <textarea className={`${fieldClass} min-h-24 resize-y`} value={note} onChange={(event) => setNote(event.target.value)} maxLength={3000} placeholder="Record investigation context for other operators" />
                </LabeledField>
                <Button type="submit" size="sm" variant="outline" disabled={busy || !note.trim()}>Add note</Button>
              </form>
              <form className="mt-5 grid gap-3 border-t border-ink/10 pt-5 dark:border-white/10 sm:grid-cols-2" onSubmit={(event) => void saveEvidence(event)}>
                <LabeledField label="Evidence description">
                  <input className={fieldClass} value={evidenceBody} onChange={(event) => setEvidenceBody(event.target.value)} maxLength={250} placeholder="Short description" />
                </LabeledField>
                <LabeledField label="Evidence URL or reference">
                  <input className={fieldClass} value={evidenceReference} onChange={(event) => setEvidenceReference(event.target.value)} maxLength={1000} placeholder="Link to approved evidence storage" />
                </LabeledField>
                <div className="sm:col-span-2"><Button type="submit" size="sm" variant="outline" disabled={busy || !evidenceBody.trim() || !evidenceReference.trim()}>Add evidence reference</Button></div>
              </form>
            </section>

            {selected.requiresApproval && (
              <section className={panelClass}>
                <h2 className="font-semibold">Approval</h2>
                <p className="mt-2 text-sm text-graphite">Approval status: <span className="font-semibold capitalize text-ink dark:text-white">{selected.approvalStatus.replace('_', ' ')}</span></p>
                {selected.approvalStatus === 'pending' && <div className="mt-4 flex flex-wrap gap-2"><Button variant="accent" size="sm" disabled={busy} onClick={() => void update({ approvalStatus: 'approved' }, 'Approval recorded.')}>Approve</Button><Button variant="danger" size="sm" disabled={busy} onClick={() => void update({ approvalStatus: 'declined' }, 'Approval declined.')}>Decline</Button></div>}
              </section>
            )}
          </div>

          <aside className="min-w-0 space-y-6">
            <section className={panelClass}>
              <h2 className="font-semibold">Case controls</h2>
              <div className="mt-4 space-y-4">
                <LabeledField label="Status"><Select className="min-h-11" value={selected.status} disabled={busy} onChange={(event) => void update({ status: event.target.value as PlatformCaseStatus }, 'Case status updated.')}><option value="open">Open</option><option value="investigating">Investigating</option><option value="waiting">Waiting</option><option value="escalated">Escalated</option><option value="resolved" disabled={!resolution.trim() || selected.approvalStatus === 'pending'}>Resolved</option><option value="closed" disabled={!resolution.trim() || selected.approvalStatus === 'pending'}>Closed</option></Select></LabeledField>
                <LabeledField label="Priority"><Select className="min-h-11" value={selected.priority} disabled={busy} onChange={(event) => void update({ priority: event.target.value as PlatformCasePriority }, 'Case priority updated.')}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></Select></LabeledField>
                <LabeledField label="Severity"><Select className="min-h-11" value={selected.severity} disabled={busy} onChange={(event) => void update({ severity: event.target.value as PlatformCaseSeverity }, 'Case severity updated.')}><option value="sev1">SEV 1 · Critical</option><option value="sev2">SEV 2 · High</option><option value="sev3">SEV 3 · Moderate</option><option value="sev4">SEV 4 · Low</option></Select></LabeledField>
                <LabeledField label="Assigned operator"><Select className="min-h-11" value={selected.assignedOperatorId ?? ''} disabled={busy} onChange={(event) => void update({ assignedOperatorId: event.target.value || null }, 'Case assignment updated.')}><option value="">Unassigned</option>{operators.filter((item) => !item.revokedAt).map((item) => <option key={item.id} value={item.id}>{item.fullName}</option>)}</Select></LabeledField>
                <LabeledField label="Team"><input className={fieldClass} defaultValue={selected.team ?? ''} disabled={busy} maxLength={80} placeholder="Assign a team" onBlur={(event) => { const value = event.target.value.trim() || null; if (value !== selected.team) void update({ team: value }, 'Team routing updated.') }} /></LabeledField>
                <LabeledField label="Deadline"><div className="flex gap-2"><input className={fieldClass} type="datetime-local" disabled={busy} value={deadlineDraft} onChange={(event) => setDeadlineDraft(event.target.value)} /><Button type="button" size="sm" variant="outline" disabled={busy || deadlineDraft === localDateTimeInput(selected.dueAt)} onClick={() => void update({ dueAt: deadlineDraft ? new Date(deadlineDraft).toISOString() : null }, 'Case deadline updated.')}>Save</Button></div></LabeledField>
                <button type="button" disabled={busy || selected.status === 'resolved' || selected.status === 'closed' || selected.approvalStatus === 'pending' || selected.approvalStatus === 'approved'} onClick={() => void update({ requiresApproval: true, approvalStatus: 'pending' }, 'Approval requested.')} className="min-h-11 w-full border border-ink/10 px-3 text-left text-sm font-semibold disabled:opacity-60 dark:border-white/10">{selected.approvalStatus === 'declined' ? 'Request approval again' : selected.requiresApproval ? 'Approval required' : 'Request approval'}</button>
              </div>
              {selected.status === 'escalated' && <p className="mt-4 flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300"><WarningCircle className="mt-0.5 h-4 w-4 shrink-0" />Escalated case. Confirm an owner and deadline.</p>}
            </section>

            {linkedSchool ? (
              <section className={panelClass}>
                <h2 className="font-semibold">School context</h2>
                <dl className="mt-3 divide-y divide-ink/10 text-sm dark:divide-white/10">
                  <div className="py-3"><dt className="text-xs text-graphite">School</dt><dd className="mt-1 font-semibold">{linkedSchool.name}</dd></div>
                  <div className="py-3"><dt className="text-xs text-graphite">School ID</dt><dd className="mt-1 break-all">{linkedSchool.code ?? linkedSchool.id}</dd></div>
                  <div className="py-3"><dt className="text-xs text-graphite">Administrator</dt><dd className="mt-1">{linkedSchool.admin}</dd></div>
                  <div className="py-3"><dt className="text-xs text-graphite">Contact</dt><dd className="mt-1 break-words">{linkedSchool.email}</dd><dd className="mt-1 text-xs text-graphite">{linkedSchool.phone}</dd></div>
                  <div className="py-3"><dt className="text-xs text-graphite">Status · plan</dt><dd className="mt-1">{linkedSchool.status} · {linkedSchool.plan}</dd></div>
                </dl>
                <button className="mt-2 text-sm font-semibold text-brand underline underline-offset-2" onClick={() => navigate('/platform/schools')}>Open school records</button>
              </section>
            ) : <section className={panelClass}><h2 className="font-semibold">{selected.sourceContactMessageId ? 'Enquiry context' : 'Account context'}</h2><p className="mt-2 text-sm text-graphite">{selected.sourceContactMessageId ? 'This case came from the public contact inbox and is not linked to a school account.' : 'No school account is linked to this case.'}</p></section>}

            <section className={panelClass}>
              <h2 className="font-semibold">Resolution</h2>
              {assignee && <p className="mt-2 text-sm text-graphite">Owner: <span className="font-medium text-ink dark:text-white">{assignee.fullName}</span></p>}
              <p className="mt-2 flex items-center gap-2 text-xs text-graphite"><Clock className="h-4 w-4" />Due {dateTime(selected.dueAt)}</p>
              <LabeledField label="Resolution summary"><textarea className={`${fieldClass} mt-3 min-h-24 resize-y`} value={resolution} onChange={(event) => setResolution(event.target.value)} maxLength={3000} placeholder="Record outcome and follow-up" /></LabeledField>
              <Button className="mt-3 w-full" size="sm" variant="accent" disabled={busy || !resolution.trim() || selected.status === 'resolved' || selected.approvalStatus === 'pending'} onClick={() => void update({ resolution: resolution.trim(), status: 'resolved' }, 'Case resolved and recorded.')}>Record resolution</Button>
              {selected.approvalStatus === 'pending' && <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">Resolve after the requested approval is decided.</p>}
            </section>
          </aside>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-3xl font-semibold tracking-tight">Operations queue</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-graphite">Assign, investigate, escalate and resolve platform cases in one place.</p></div>
        <Button variant="accent" onClick={() => setShowCreate((value) => !value)} icon={<Plus className="h-4 w-4" />}>{showCreate ? 'Close form' : 'New case'}</Button>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Summary label="Open workload" value={loading ? '—' : String(activeCount)} />
        <Summary label="Overdue" value={loading ? '—' : String(overdueCount)} alert={overdueCount > 0} />
        <Summary label="Unassigned" value={loading ? '—' : String(unassignedCount)} />
      </div>

      {showCreate && <NewCaseForm authUserId={authUserId} schools={schools} operators={operators} onCancel={() => setShowCreate(false)} onCreated={(id) => { setShowCreate(false); refreshCases(); navigate(`/platform/operations/${id}`); notify('Case created.') }} onError={(message) => notify(message)} />}
      {error && <QueueError error={error} retry={refreshCases} />}
      <div className="mb-4 grid gap-3 md:grid-cols-[minmax(220px,1fr)_150px_130px_150px_150px_170px]">
        <div className="relative min-w-0"><MagnifyingGlass className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-graphite" /><input aria-label="Search cases" className={`${fieldClass} pl-10`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search cases…" /></div>
        <Select aria-label="Filter by status" className="min-h-11" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="active">Active cases</option><option value="all">All statuses</option>{Object.entries(statusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
        <Select aria-label="Filter by priority" className="min-h-11" value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}><option value="all">All priorities</option>{Object.entries(priorityLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
        <Select aria-label="Filter by case type" className="min-h-11" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="all">All case types</option>{Object.entries(caseTypeLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
        <Select aria-label="Filter by deadline" className="min-h-11" value={deadlineFilter} onChange={(event) => setDeadlineFilter(event.target.value)}><option value="all">All deadlines</option><option value="overdue">Overdue</option><option value="no-deadline">No deadline</option></Select>
        <Select aria-label="Filter by assignment" className="min-h-11" value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)}><option value="all">All assignments</option><option value="mine">Assigned to me</option><option value="unassigned">Unassigned</option>{operators.filter((operator) => !operator.revokedAt).map((operator) => <option key={operator.id} value={operator.id}>{operator.fullName}</option>)}</Select>
      </div>

      {loading ? <QueueLoading /> : visible.length ? (
        <div className="divide-y divide-ink/10 border-y border-ink/10 dark:divide-white/10 dark:border-white/10">
          {visible.map((item) => {
            const school = schools.find((record) => record.id === item.schoolId)
            const owner = operators.find((record) => record.id === item.assignedOperatorId)
            return (
              <button key={item.id} type="button" onClick={() => navigate(`/platform/operations/${item.id}`)} className="grid w-full gap-3 py-4 text-left transition-colors hover:bg-ink/[0.025] dark:hover:bg-white/[0.025] md:grid-cols-[minmax(0,1.7fr)_120px_100px_minmax(150px,1fr)_auto] md:items-center md:gap-4">
                <span className="min-w-0"><span className="block truncate text-sm font-semibold">{item.title}</span><span className="mt-1 block truncate text-xs text-graphite">{caseTypeLabel[item.caseType]} · {school?.name ?? (item.sourceContactMessageId ? 'Platform enquiry' : 'No school linked')} · {item.team ?? 'No team'}</span></span>
                <span className={`w-fit rounded-md px-2.5 py-1 text-xs font-semibold ${badgeClass(item.priority)}`}>{priorityLabel[item.priority]}</span>
                <span className={`w-fit rounded-md px-2.5 py-1 text-xs font-semibold ${badgeClass(item.status)}`}>{statusLabel[item.status]}</span>
                <span className="min-w-0 text-xs text-graphite">{owner?.fullName ?? 'Unassigned'}<span className={`mt-1 block ${isOverdue(item) ? 'font-semibold text-red-700 dark:text-red-300' : ''}`}>{isOverdue(item) ? 'Overdue · ' : ''}{dateTime(item.dueAt)}</span></span>
                <span className="text-xs font-semibold text-brand">{isOverdue(item) ? 'Review now' : 'Investigate'} →</span>
              </button>
            )
          })}
        </div>
      ) : <p className="border-y border-ink/10 px-4 py-10 text-center text-sm text-graphite dark:border-white/10">No cases match these filters.</p>}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-ink/10 pt-4 dark:border-white/10">
        <p className="text-xs text-graphite">Contact enquiries are synced into this queue. School requests remain available in Requests &amp; Reviews.</p>
        <button type="button" className="text-sm font-semibold text-brand underline underline-offset-2" onClick={() => navigate('/platform/health#incidents')}>Open incident command</button>
      </div>
    </div>
  )
}

function Summary({ label, value, alert = false }: { label: string; value: string; alert?: boolean }) {
  return <div className="border-y border-ink/10 py-3 dark:border-white/10"><p className="text-xs font-medium text-graphite">{label}</p><p className={`mt-1 text-2xl font-semibold tabular-nums ${alert ? 'text-red-700 dark:text-red-300' : ''}`}>{value}</p></div>
}

function NewCaseForm({ authUserId, schools, operators, onCancel, onCreated, onError }: {
  authUserId: string
  schools: School[]
  operators: PlatformOperatorRecord[]
  onCancel: () => void
  onCreated: (id: string) => void
  onError: (message: string) => void
}) {
  const [title, setTitle] = useState('')
  const [caseType, setCaseType] = useState<PlatformCaseType>('support')
  const [description, setDescription] = useState('')
  const [schoolId, setSchoolId] = useState('')
  const [priority, setPriority] = useState<PlatformCasePriority>('normal')
  const [dueAt, setDueAt] = useState('')
  const [assignee, setAssignee] = useState('')
  const [team, setTeam] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    try {
      const id = await createPlatformCase({
        title,
        caseType,
        description,
        schoolId: schoolId || null,
        priority,
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        assignedOperatorId: assignee || null,
        team: team.trim() || null,
        createdBy: authUserId,
      })
      onCreated(id)
    } catch (cause: unknown) {
      onError(`Case was not created: ${cause instanceof Error ? cause.message : String(cause)}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className={`${panelClass} mb-6`}>
      <h2 className="font-semibold">Create operations case</h2>
      <p className="mt-1 text-xs text-graphite">Do not add student-identifiable information. This case record is visible to platform operators.</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <LabeledField label="Case title"><input className={fieldClass} required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} /></LabeledField>
        <LabeledField label="Case type"><Select className="min-h-11" value={caseType} onChange={(event) => setCaseType(event.target.value as PlatformCaseType)}>{Object.entries(caseTypeLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></LabeledField>
        <LabeledField label="School account"><Select className="min-h-11" value={schoolId} onChange={(event) => setSchoolId(event.target.value)}><option value="">No school linked</option>{schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}</Select></LabeledField>
        <LabeledField label="Priority"><Select className="min-h-11" value={priority} onChange={(event) => setPriority(event.target.value as PlatformCasePriority)}>{Object.entries(priorityLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></LabeledField>
        <LabeledField label="Assign operator"><Select className="min-h-11" value={assignee} onChange={(event) => setAssignee(event.target.value)}><option value="">Unassigned</option>{operators.filter((operator) => !operator.revokedAt).map((operator) => <option key={operator.id} value={operator.id}>{operator.fullName}</option>)}</Select></LabeledField>
        <LabeledField label="Route to team"><input className={fieldClass} maxLength={80} value={team} onChange={(event) => setTeam(event.target.value)} placeholder="Support, billing, platform…" /></LabeledField>
        <LabeledField label="Deadline"><input className={fieldClass} type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></LabeledField>
        <div className="md:col-span-2"><LabeledField label="Issue details"><textarea className={`${fieldClass} min-h-24 resize-y`} required maxLength={5000} value={description} onChange={(event) => setDescription(event.target.value)} /></LabeledField></div>
      </div>
      <div className="mt-4 flex justify-end gap-2"><Button type="button" variant="outline" size="sm" onClick={onCancel}>Cancel</Button><Button type="submit" variant="accent" size="sm" loading={saving}>Create case</Button></div>
    </form>
  )
}

function QueueLoading() {
  return <div role="status" className="space-y-4 py-4"><span className="sr-only">Loading operations cases</span>{[0, 1, 2, 3].map((item) => <div key={item} className="h-16 animate-pulse border-y border-ink/10 bg-ink/[0.02] dark:border-white/10 dark:bg-white/[0.02]" />)}</div>
}

function QueueError({ error, retry }: { error: string; retry: () => void }) {
  return <div role="alert" className="my-5 flex flex-wrap items-center justify-between gap-3 border-y border-red-500/30 bg-red-500/[0.04] p-4"><p className="text-sm text-red-800 dark:text-red-300">Could not load operations cases: {error}</p><Button variant="outline" size="sm" onClick={retry}>Retry</Button></div>
}
