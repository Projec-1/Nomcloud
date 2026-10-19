import { useMemo, useState } from 'react'
import {
  ArrowUpRight,
  CheckCircle,
  ClipboardText as ClipboardCheck,
  EnvelopeSimple,
  Eye,
  FileText,
  MagnifyingGlass as Search,
  ShieldWarning,
  UserCircle,
  X,
} from '@phosphor-icons/react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Status from '@/pages/platform/StatusPill'
import type { Request, RequestStatus } from '@/pages/platform/types'
import type { PlatformOperatorRecord } from '@/services/platformService'
import { cn } from '@/utils/cn'
import {
  ActionDialog,
  ActionLogPanel,
  Callout,
  Panel,
  Pill,
  SectionHeader,
  useActionLog,
  type ActionRequest,
} from './PrototypeKit'

/**
 * Requests & reviews: the queue of everything schools and visitors have sent in.
 *
 * Contact-message handled status is stored in the database. Assignment,
 * information requests, escalation and decision details are local to this
 * browser session and do not contact the school.
 */

export interface RequestWorkEntry {
  reviewerId?: string
  reviewerName?: string
  status?: Extract<RequestStatus, 'Open' | 'In review' | 'Resolved'>
  escalated?: boolean
  history: Array<{ at: string; actor: string; action: string; detail?: string }>
}

export type RequestWorkMap = Record<string, RequestWorkEntry>

const STATUS_FILTERS = ['All', 'Open', 'In review', 'Resolved'] as const
type StatusFilter = (typeof STATUS_FILTERS)[number]

function effectiveStatus(request: Request, work: RequestWorkEntry | undefined): RequestStatus {
  return work?.status ?? request.status
}

interface RequestsSectionProps {
  requests: Request[]
  operators: PlatformOperatorRecord[]
  work: RequestWorkMap
  onWorkChange: (next: RequestWorkMap) => void
  onResolve: (id: string, status: RequestStatus, message: string) => void
  onOpenSchool: (name: string) => void
  notify: (message: string) => void
  operator: string
}

export default function RequestsSection({ requests, operators, work, onWorkChange, onResolve, onOpenSchool, notify, operator }: RequestsSectionProps) {
  const [filter, setFilter] = useState<StatusFilter>('All')
  const [reviewerFilter, setReviewerFilter] = useState('all')
  const [escalatedOnly, setEscalatedOnly] = useState(false)
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [dialog, setDialog] = useState<ActionRequest | null>(null)
  const { entries: logEntries, record } = useActionLog(operator)

  const visible = useMemo(() => requests.filter((item) => {
    const entry = work[item.id]
    if (filter !== 'All' && effectiveStatus(item, entry) !== filter) return false
    if (reviewerFilter === 'unassigned' && entry?.reviewerId) return false
    if (reviewerFilter !== 'all' && reviewerFilter !== 'unassigned' && entry?.reviewerId !== reviewerFilter) return false
    if (escalatedOnly && !entry?.escalated) return false
    if (query && !`${item.type} ${item.school} ${item.summary} ${item.submittedBy} ${item.id}`.toLowerCase().includes(query.toLowerCase())) return false
    return true
  }), [requests, work, filter, reviewerFilter, escalatedOnly, query])

  const selected = requests.find((item) => item.id === openId) ?? null
  const selectedEntry = openId ? work[openId] : undefined

  const counts = (target: StatusFilter) => requests.filter((item) => (target === 'All' ? true : effectiveStatus(item, work[item.id]) === target)).length

  const log = (id: string, action: string, detail?: string, patch?: Partial<RequestWorkEntry>) => {
    const entry = work[id]
    onWorkChange({
      ...work,
      [id]: {
        ...entry,
        history: [{ at: new Date().toISOString(), actor: operator, action, detail }, ...(entry?.history ?? [])],
        ...patch,
      },
    })
  }

  const assignReviewer = (request: Request, reviewerId: string) => {
    const reviewer = operators.find((item) => item.id === reviewerId || item.userId === reviewerId)
    const previous = work[request.id]?.reviewerName
    log(request.id, reviewer ? `Assigned to ${reviewer.fullName || reviewer.email}` : 'Reviewer cleared', reviewer ? `${previous ?? 'Nobody'} → ${reviewer.fullName || reviewer.email}` : `${previous ?? 'Nobody'} → unassigned`, {
      reviewerId: reviewer ? reviewer.id : undefined,
      reviewerName: reviewer ? (reviewer.fullName || reviewer.email) : undefined,
    })
    record({
      action: 'Assigned reviewer',
      target: `${request.type} · ${request.id}`,
      reason: reviewer ? `Reviewer set to ${reviewer.fullName || reviewer.email}` : 'Reviewer cleared',
      before: previous ?? 'Unassigned',
      after: reviewer ? (reviewer.fullName || reviewer.email) : 'Unassigned',
      result: 'Completed',
    })
    notify(reviewer ? `Reviewer assigned: ${reviewer.fullName || reviewer.email}.` : 'Reviewer cleared.')
  }

  const runDialog = (request: Request, kind: 'more_info' | 'escalate' | 'approve' | 'reject') => {
    const configured: Record<typeof kind, ActionRequest> = {
      more_info: {
        title: 'Request more information',
        target: `${request.type} · ${request.school}`,
        description: 'Prototype only: this records a note for this session. It does not contact the school or change its request status.',
        confirmLabel: 'Record local note',
        requiresReason: true,
        reasonLabel: 'What do you need from the school?',
        onConfirm: (input) => {
          log(request.id, 'Requested more information', input.reason, { status: 'In review' })
          record({ action: 'Requested information', target: `${request.id} · ${request.school}`, reason: input.reason, before: effectiveStatus(request, work[request.id]), after: 'In review', result: 'Completed' })
          notify('Note recorded for this session. The school was not contacted.')
        },
      },
      escalate: {
        title: 'Escalate request',
        target: `${request.type} · ${request.school}`,
        description: 'Prototype only: this records a local escalation note. It does not notify another operator or persist an escalation.',
        confirmLabel: 'Record local note',
        danger: true,
        requiresReason: true,
        reasonLabel: 'Why does this need escalation?',
        onConfirm: (input) => {
          log(request.id, 'Escalated', input.reason, { escalated: true, status: 'In review' })
          record({ action: 'Escalated', target: `${request.id} · ${request.school}`, reason: input.reason, before: 'Not escalated', after: 'Escalated', result: 'Completed' })
          notify('Escalation note recorded for this session. No operator was notified.')
        },
      },
      approve: {
        title: 'Approve request',
        target: `${request.type} · ${request.school}`,
        description: 'This marks the contact message handled. The approval outcome and decision note are not persisted or sent to the school.',
        confirmLabel: 'Mark handled',
        requiresReason: true,
        reasonLabel: 'Internal note (local to this session)',
        onConfirm: (input) => {
          log(request.id, 'Approved', input.reason, { status: 'Resolved' })
          record({ action: 'Approved request', target: `${request.id} · ${request.school}`, reason: input.reason, before: effectiveStatus(request, work[request.id]), after: 'Resolved', result: 'Completed' })
          onResolve(request.id, 'Resolved', 'Contact message marked handled. Approval details remain local to this session.')
          setOpenId(null)
        },
      },
      reject: {
        title: 'Reject request',
        target: `${request.type} · ${request.school}`,
        description: 'A rejection proposal requires a second operator in this prototype. Confirming only marks the contact message handled; the rejection details are not persisted or sent to the school.',
        confirmLabel: 'Mark handled',
        danger: true,
        requiresReason: true,
        requiresApproval: true,
        reasonLabel: 'Internal reason (local to this session)',
        onConfirm: (input) => {
          log(request.id, 'Rejected', `${input.reason}${input.approver ? ` · co-signed by ${input.approver}` : ''}`, { status: 'Resolved' })
          record({ action: 'Rejected request', target: `${request.id} · ${request.school}`, reason: input.reason, approver: input.approver, before: effectiveStatus(request, work[request.id]), after: 'Resolved', result: 'Completed' })
          onResolve(request.id, 'Resolved', 'Contact message marked handled. Rejection details remain local to this session.')
          setOpenId(null)
        },
      },
    }
    setDialog(configured[kind])
  }

  const addNote = () => {
    if (!selected || !note.trim()) return
    log(selected.id, 'Note added', note.trim())
    setNote('')
    notify('Note added to the request history.')
  }

  return (
    <div>
      <SectionHeader
        eyebrow="Operations queue"
        title="Requests & reviews"
        description="Every incoming request, its reviewer, its decision history, and the actions that move it forward."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-xl border border-ink/[0.07] bg-white px-3 py-2 text-xs font-semibold text-graphite dark:border-white/[0.08] dark:bg-white/[0.04]">
              {counts('Open')} open · {counts('In review')} in review
            </span>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {([
          { label: 'Open', detail: 'Waiting for a first decision', tone: 'warning' },
          { label: 'In review', detail: 'An operator is working on it', tone: 'info' },
          { label: 'Resolved', detail: 'Decision recorded and closed', tone: 'success' },
        ] as Array<{ label: StatusFilter; detail: string; tone: 'warning' | 'info' | 'success' }>).map((item) => (
          <button
            key={item.label}
            onClick={() => setFilter(filter === item.label ? 'All' : item.label as StatusFilter)}
            className={cn(
              'rounded-2xl border p-4 text-left transition',
              filter === item.label ? 'border-brand/40 bg-brand/[0.05]' : 'border-ink/[0.07] bg-white hover:border-brand/30 dark:border-white/[0.08] dark:bg-white/[0.04] dark:hover:bg-white/[0.06]',
            )}
          >
            <span className="flex items-center justify-between gap-2">
              <Pill label={item.label} tone={item.tone} />
              <span className="text-lg font-semibold">{counts(item.label)}</span>
            </span>
            <span className="mt-3 block text-xs text-graphite">{item.detail}</span>
          </button>
        ))}
      </div>

      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {STATUS_FILTERS.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={filter === item}
              onClick={() => setFilter(item)}
              className={cn('whitespace-nowrap rounded-xl px-3 py-2 text-xs font-semibold', filter === item ? 'bg-ink text-white dark:bg-white dark:text-ink' : 'bg-white text-graphite dark:bg-white/[0.06]')}>
              {item}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="inline-flex items-center gap-2 text-xs font-semibold text-graphite">
            Reviewer
            <select value={reviewerFilter} onChange={(event) => setReviewerFilter(event.target.value)} className="input py-2" aria-label="Filter by reviewer">
              <option value="all">All reviewers</option>
              <option value="unassigned">Unassigned</option>
              {operators.map((item) => <option key={item.id} value={item.id}>{item.fullName || item.email}</option>)}
            </select>
          </label>
          <label className="inline-flex min-h-11 items-center gap-3 text-sm font-medium">
            <input type="checkbox" checked={escalatedOnly} onChange={(event) => setEscalatedOnly(event.target.checked)} className="h-4 w-4 rounded border-ink/20 accent-brand" />
            Escalated only
          </label>
          <div className="relative min-w-0 sm:w-64">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-graphite" />
            <input aria-label="Search requests" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search requests…" className="input h-10 pl-10" />
          </div>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-ink/[0.07] bg-white dark:border-white/[0.08] dark:bg-white/[0.04]">
        <div className="hidden gap-4 border-b border-ink/[0.06] px-5 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-graphite dark:border-white/[0.08] xl:grid xl:grid-cols-[1.2fr_1.5fr_1fr_1fr_auto]">
          <span>Request</span>
          <span>School &amp; context</span>
          <span>Submitted</span>
          <span>Reviewer &amp; status</span>
          <span />
        </div>
        {visible.length === 0 ? (
          <p className="p-8 text-center text-sm text-graphite">No requests match these filters.</p>
        ) : (
          <ul className="divide-y divide-ink/[0.06] dark:divide-white/[0.08]">
            {visible.map((item) => {
              const entry = work[item.id]
              const status = effectiveStatus(item, entry)
              return (
                <li key={item.id}>
                  <button onClick={() => setOpenId(item.id)} className="grid w-full min-w-0 gap-3 px-5 py-4 text-left hover:bg-ink/[0.025] dark:hover:bg-white/[0.03] xl:grid-cols-[1.2fr_1.5fr_1fr_1fr_auto] xl:items-center xl:gap-4">
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 font-semibold"><FileText className="h-4 w-4 text-brand" />{item.type}</span>
                      <span className="mt-1 block break-words text-xs text-graphite">{item.id}</span>
                    </span>
                    <span className="min-w-0">
                      <span className="block break-words text-sm font-medium">{item.school}</span>
                      <span className="mt-1 block break-words text-xs text-graphite">{item.summary}</span>
                    </span>
                    <span className="text-xs text-graphite">By {item.submittedBy}<span className="mt-1 block">{item.submitted}</span></span>
                    <span className="flex flex-wrap items-center gap-2">
                      {entry?.escalated && <Pill label="Escalated" tone="danger" />}
                      <Status value={status} />
                      <span className="text-xs text-graphite">{entry?.reviewerName ?? 'No reviewer'}</span>
                    </span>
                    <span className="flex items-center justify-end gap-2">
                      <Eye className="h-4 w-4 text-graphite" />
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="mt-6">
        <ActionLogPanel
          entries={logEntries}
          title="Decisions taken in this session"
          description="Assignments, escalations, approvals and rejections recorded while you work."
          emptyLabel="No request decision has been taken in this session yet."
        />
      </div>

      <Modal
        open={Boolean(selected)}
        onClose={() => { setOpenId(null); setNote('') }}
        size="lg"
        title={selected?.type ?? ''}
        description={selected ? `${selected.id} · ${selected.school}` : ''}
        footer={
          selected ? (
            <>
              <Button variant="outline" onClick={() => runDialog(selected, 'more_info')}><EnvelopeSimple className="h-4 w-4" /> More information</Button>
              <Button variant="outline" onClick={() => runDialog(selected, 'escalate')}><ShieldWarning className="h-4 w-4" /> Escalate</Button>
              <Button variant="danger" onClick={() => runDialog(selected, 'reject')}><X className="h-4 w-4" /> Reject</Button>
              <Button variant="accent" onClick={() => runDialog(selected, 'approve')}><CheckCircle className="h-4 w-4" /> Approve</Button>
            </>
          ) : null
        }
      >
        {selected && (
          <div className="space-y-5">
            <div className="rounded-2xl border border-brand/15 bg-brand/[0.05] p-4">
              <p className="text-sm font-semibold">{selected.summary}</p>
              <p className="mt-2 text-xs text-graphite">Submitted by {selected.submittedBy} · {selected.submitted}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Status value={effectiveStatus(selected, selectedEntry)} />
                {selectedEntry?.escalated && <Pill label="Escalated" tone="danger" />}
              </div>
            </div>

            {selected.details && selected.details.length > 0 && (
              <dl className="grid gap-3 sm:grid-cols-2">
                {selected.details.map((detail) => (
                  <div key={detail.label} className="rounded-xl bg-ink/[0.035] p-3 dark:bg-white/[0.05]">
                    <dt className="text-[11px] font-semibold uppercase tracking-wider text-graphite">{detail.label}</dt>
                    <dd className="mt-1.5 text-sm font-medium break-words">{detail.value}</dd>
                  </div>
                ))}
              </dl>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-ink/10 p-4 dark:border-white/10">
                <label className="text-xs font-semibold text-graphite" htmlFor="request-reviewer">Reviewer</label>
                <select id="request-reviewer" className="input mt-2 py-2" value={selectedEntry?.reviewerId ?? ''} onChange={(event) => assignReviewer(selected, event.target.value)}>
                  <option value="">Nobody yet</option>
                  {operators.map((item) => <option key={item.id} value={item.id}>{item.fullName || item.email}</option>)}
                </select>
                <p className="mt-2 text-xs text-graphite">Reviewers are the platform administrators with live access.</p>
              </div>
              <div className="rounded-2xl border border-ink/10 p-4 dark:border-white/10">
                <p className="text-xs font-semibold text-graphite">Contact</p>
                <p className="mt-2 text-sm font-medium break-all">{selected.details?.find((item) => item.label === 'Email')?.value ?? 'Not provided'}</p>
                <p className="mt-2 text-xs text-graphite">Messages the school receives are sent from Communications, so the wording is reviewed before it leaves.</p>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-graphite" htmlFor="request-note">Add to the decision history</label>
              <textarea
                id="request-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={3}
                placeholder="Context the next reviewer should have…"
                className="input mt-2 resize-none"
              />
              <div className="mt-2 flex justify-end">
                <Button variant="outline" size="sm" onClick={addNote} disabled={!note.trim()}>Add note</Button>
              </div>
            </div>

            <div className="rounded-2xl bg-ink/[0.035] p-4 dark:bg-white/[0.05]">
              <p className="flex items-center gap-2 text-xs font-semibold text-graphite"><ClipboardCheck className="h-3.5 w-3.5" /> Decision history</p>
              {selectedEntry?.history.length ? (
                <ol className="mt-3 space-y-3">
                  {selectedEntry.history.map((entry, index) => (
                    <li key={`${entry.at}-${index}`} className="relative flex gap-3 pl-1">
                      <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-brand ring-4 ring-brand/10" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-graphite">{new Date(entry.at).toLocaleString()}</p>
                        <p className="mt-0.5 text-sm font-semibold">{entry.action}</p>
                        {entry.detail && <p className="mt-0.5 text-xs leading-5 text-graphite">{entry.detail}</p>}
                        <p className="mt-0.5 text-xs text-graphite">by {entry.actor}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-2 text-xs text-graphite">No decision has been recorded for this request yet.</p>
              )}
            </div>

            <Callout tone="info" title="Open the school record before deciding">
              <button onClick={() => { setOpenId(null); onOpenSchool(selected.school) }} className="inline-flex items-center gap-1.5 font-semibold text-brand">
                <ArrowUpRight className="h-3.5 w-3.5" /> Open {selected.school}
              </button>
              <span className="ml-2 inline-flex items-center gap-1.5 text-graphite"><UserCircle className="h-3.5 w-3.5" /> Approving or rejecting closes the request in the database.</span>
            </Callout>
          </div>
        )}
      </Modal>

      <ActionDialog request={dialog} onClose={() => setDialog(null)} actor={operator} />
    </div>
  )
}
