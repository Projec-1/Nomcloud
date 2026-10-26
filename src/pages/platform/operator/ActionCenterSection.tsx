import { useMemo, useState } from 'react'
import {
  CaretRight as ChevronRight,
  Check,
  ClipboardText as ClipboardCheck,
  CreditCard,
  FileText,
  MagnifyingGlass as Search,
  Megaphone,
  UserCircle,
  Warning as AlertTriangle,
} from '@phosphor-icons/react'
import Button from '@/components/ui/Button'
import { InlineLoader } from '@/components/ui/Loader'
import Modal from '@/components/ui/Modal'
import Status from '@/pages/platform/StatusPill'
import type { Request, School } from '@/pages/platform/types'
import type { PlatformOperatorRecord } from '@/services/platformService'
import { cn } from '@/utils/cn'
import {
  ActionDialog,
  type ActionRequest,
  ActionLogPanel,
  useActionLog,
  Callout,
  Panel,
  Pill,
  PrototypeNotice,
  SectionHeader,
  SampleTag,
  type Tone,
} from './PrototypeKit'
import { billingInvoices, billingPayments, schoolSubscriptions } from './prototypeData'

/**
 * Action centre: one inbox for everything that needs an operator decision.
 *
 * Approvals, overdue tasks and billing problems arrive here from one place,
 * each with an owner, a status and a recorded resolution.
 */

export type InboxCategory = 'Approval' | 'Task' | 'Billing'

export interface InboxItem {
  id: string
  category: InboxCategory
  title: string
  detail: string
  nextStep: string
  path: string
  pathLabel: string
  sample: boolean
  severity: 'danger' | 'warning' | 'info'
  school?: School
  request?: Request
}

export interface InboxEntry {
  assignee?: string
  resolved: boolean
  reason?: string
  resolvedBy?: string
  resolvedAt?: string
}

export type InboxState = Record<string, InboxEntry>

const CATEGORIES: Array<'All' | InboxCategory> = ['All', 'Approval', 'Task', 'Billing']
const STATUSES = ['All', 'Unassigned', 'Assigned', 'Resolved'] as const
type StatusFilter = (typeof STATUSES)[number]

const categoryTone: Record<InboxCategory, Tone> = {
  Approval: 'warning',
  Task: 'info',
  Billing: 'warning',
}

const categoryIcon: Record<InboxCategory, typeof AlertTriangle> = {
  Approval: ClipboardCheck,
  Task: FileText,
  Billing: CreditCard,
}

function itemStatus(entry: InboxEntry | undefined): StatusFilter | 'Open' {
  if (entry?.resolved) return 'Resolved'
  if (entry?.assignee) return 'Assigned'
  return 'Open'
}

function statusPill(entry: InboxEntry | undefined) {
  const state = itemStatus(entry)
  if (state === 'Resolved') return <Pill label="Resolved" tone="success" />
  if (state === 'Assigned') return <Pill label="Assigned" tone="info" />
  return <Pill label="Open" tone="warning" />
}

interface ActionCenterSectionProps {
  schools: School[]
  requests: Request[]
  pendingApplicationCount: number
  operators: PlatformOperatorRecord[]
  state: InboxState
  onStateChange: (next: InboxState) => void
  navigate: (path: string) => void
  onSchool: (school: School) => void
  onRequest: (request: Request) => void
  notify: (message: string) => void
  operator: string
  loading: boolean
}

export default function ActionCenterSection({
  schools,
  requests,
  pendingApplicationCount,
  operators,
  state,
  onStateChange,
  navigate,
  onSchool,
  onRequest,
  notify,
  operator,
  loading,
}: ActionCenterSectionProps) {
  const [category, setCategory] = useState<'All' | InboxCategory>('All')
  const [status, setStatus] = useState<StatusFilter>('All')
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [resolveRequest, setResolveRequest] = useState<ActionRequest | null>(null)
  const { entries: logEntries, record } = useActionLog(operator)

  const items = useMemo<InboxItem[]>(() => {
    const live: InboxItem[] = []

    if (pendingApplicationCount > 0) {
      live.push({
        id: 'approval-applications',
        category: 'Approval',
        title: `${pendingApplicationCount} school application${pendingApplicationCount === 1 ? '' : 's'} awaiting a decision`,
        detail: 'Submitted schools are waiting for a platform administrator to verify them and decide.',
        nextStep: 'Open School Applications, verify the checklist, then approve with a shortcode or reject with a reason.',
        path: '/platform/applications',
        pathLabel: 'School applications',
        sample: false,
        severity: 'warning',
      })
    }

    requests
      .filter((request) => request.status !== 'Resolved')
      .forEach((request) => {
        live.push({
          id: `task-request-${request.id}`,
          category: 'Task',
          title: `${request.type} from ${request.submittedBy}`,
          detail: request.summary,
          nextStep: 'Assign a reviewer, ask for more information, or close the request with a decision.',
          path: '/platform/requests',
          pathLabel: 'Request queue',
          sample: false,
          severity: 'info',
          request,
        })
      })

    schools
      .filter((school) => school.status === 'Suspended')
      .forEach((school) => {
        live.push({
          id: `task-school-${school.id}`,
          category: 'Task',
          title: `${school.name} is suspended`,
          detail: `${school.admin} · ${school.location}. A suspended school cannot sign in until it is reactivated.`,
          nextStep: 'Confirm the suspension still has a reason and an owner, then reactivate or leave it in place.',
          path: '/platform/schools',
          pathLabel: 'Schools',
          sample: false,
          severity: 'danger',
          school,
        })
      })

    const sampled: InboxItem[] = []

    billingInvoices
      .filter((invoice) => invoice.status === 'Overdue')
      .forEach((invoice) => {
        sampled.push({
          id: `billing-invoice-${invoice.id}`,
          category: 'Billing',
          title: `${invoice.school} invoice ${invoice.id} is overdue`,
          detail: `${invoice.plan} plan · due ${new Date(invoice.dueAt).toLocaleDateString()}.`,
          nextStep: 'Contact the school, or issue a credit if the delay came from our side.',
          path: '/platform/billing',
          pathLabel: 'Billing',
          sample: true,
          severity: 'warning',
        })
      })

    billingPayments
      .filter((payment) => payment.status === 'Failed')
      .slice(0, 4)
      .forEach((payment) => {
        sampled.push({
          id: `billing-payment-${payment.id}`,
          category: 'Billing',
          title: `${payment.school} payment failed`,
          detail: `${payment.method} · ${payment.failureReason ?? 'No reason recorded'}.`,
          nextStep: 'Retry the payment, confirm the card or mobile money link, or record an adjustment.',
          path: '/platform/billing',
          pathLabel: 'Billing',
          sample: true,
          severity: 'warning',
        })
      })

    schoolSubscriptions
      .filter((subscription) => subscription.status === 'Past due')
      .forEach((subscription) => {
        sampled.push({
          id: `billing-sub-${subscription.id}`,
          category: 'Billing',
          title: `${subscription.school} subscription is past due`,
          detail: `${subscription.plan} plan, ${subscription.seatsUsed.toLocaleString()} students on the account.`,
          nextStep: 'Decide whether to pause the subscription or agree a payment plan with the school.',
          path: '/platform/billing',
          pathLabel: 'Billing',
          sample: true,
          severity: 'warning',
        })
      })

    return [...live, ...sampled]
  }, [pendingApplicationCount, requests, schools])

  const visible = useMemo(() => items.filter((item) => {
    const entry = state[item.id]
    if (category !== 'All' && item.category !== category) return false
    const itemStatusValue = itemStatus(entry)
    if (status === 'Unassigned' && (itemStatusValue === 'Resolved' || itemStatusValue === 'Assigned')) return false
    if (status === 'Assigned' && itemStatusValue !== 'Assigned') return false
    if (status === 'Resolved' && itemStatusValue !== 'Resolved') return false
    if (query && !`${item.title} ${item.detail} ${item.category} ${entry?.assignee ?? ''}`.toLowerCase().includes(query.toLowerCase())) return false
    return true
  }), [items, state, category, status, query])

  const openItem = items.find((item) => item.id === openId) ?? null
  const openEntry = openId ? state[openId] : undefined

  const unresolvedCount = items.filter((item) => !state[item.id]?.resolved).length
  const categoryCounts = (target: 'All' | InboxCategory) => items.filter((item) => target === 'All' || item.category === target).filter((item) => !state[item.id]?.resolved).length

  const assign = (item: InboxItem, assignee: string) => {
    const previous = state[item.id]?.assignee
    onStateChange({ ...state, [item.id]: { ...state[item.id], resolved: state[item.id]?.resolved ?? false, assignee: assignee || undefined } })
    record({
      action: assignee ? 'Assigned' : 'Cleared assignment',
      target: item.title,
      reason: assignee ? `Assigned to ${assignee}` : 'Assignment removed',
      before: previous ?? 'Unassigned',
      after: assignee || 'Unassigned',
      result: 'Completed',
    })
    notify(assignee ? `Assigned to ${assignee}.` : 'Assignment cleared.')
  }

  const resolve = (item: InboxItem, reason: string) => {
    const entry = state[item.id]
    onStateChange({
      ...state,
      [item.id]: { ...entry, resolved: true, reason, resolvedBy: operator, resolvedAt: new Date().toISOString() },
    })
    record({
      action: 'Resolved',
      target: item.title,
      reason,
      before: entry?.assignee ?? 'Unassigned',
      after: `Resolved by ${operator}`,
      result: 'Completed',
    })
    setOpenId(null)
    notify('Item resolved. It stays in the log with your name and reason.')
  }

  const reopen = (item: InboxItem) => {
    onStateChange({ ...state, [item.id]: { ...state[item.id], resolved: false, reason: undefined, resolvedBy: undefined, resolvedAt: undefined } })
    record({ action: 'Reopened', target: item.title, reason: 'Item returned to the inbox', before: 'Resolved', after: 'Open', result: 'Completed' })
    notify('Item reopened.')
  }

  return (
    <div>
      <SectionHeader
        eyebrow="Operator attention"
        title="Action centre"
        description="Review approvals, overdue tasks and billing problems — open an item, give it an owner, and resolve it with a reason."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-xl border border-ink/[0.07] bg-white px-3 py-2 text-xs font-semibold text-graphite dark:border-white/[0.08] dark:bg-white/[0.04]">
              {unresolvedCount} open
            </span>
            <Button variant="outline" size="sm" onClick={() => navigate('/platform/requests')}>Go to requests</Button>
          </div>
        }
      />

      <PrototypeNotice
        scope="Billing alerts"
        detail="Applications, contact requests and suspended schools are read from the database. Billing examples are marked as sample data and link to Billing."
      />

      <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-3">
        {CATEGORIES.filter((item) => item !== 'All').map((item) => {
          const Icon = categoryIcon[item]
          return (
            <button
              key={item}
              onClick={() => setCategory(category === item ? 'All' : item)}
              className={cn(
                'rounded-2xl border p-4 text-left transition',
                category === item
                  ? 'border-brand/40 bg-brand/[0.05]'
                  : 'border-ink/[0.07] bg-white hover:border-brand/30 dark:border-white/[0.08] dark:bg-white/[0.04] dark:hover:bg-white/[0.06]',
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/10 text-brand"><Icon className="h-4 w-4" /></span>
                <span className="text-lg font-semibold">{categoryCounts(item)}</span>
              </span>
              <span className="mt-3 block text-xs font-semibold text-graphite">{item}</span>
            </button>
          )
        })}
      </div>

      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {CATEGORIES.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={category === item}
              onClick={() => setCategory(item)}
              className={cn('whitespace-nowrap rounded-xl px-3 py-2 text-xs font-semibold', category === item ? 'bg-ink text-white dark:bg-white dark:text-ink' : 'bg-white text-graphite dark:bg-white/[0.06]')}>
              {item}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {STATUSES.map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={status === item}
                onClick={() => setStatus(item)}
                className={cn('whitespace-nowrap rounded-xl px-3 py-2 text-xs font-semibold', status === item ? 'bg-ink text-white dark:bg-white dark:text-ink' : 'bg-white text-graphite dark:bg-white/[0.06]')}>
                {item}
              </button>
            ))}
          </div>
          <div className="relative min-w-0 sm:w-64">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-graphite" />
            <input
              aria-label="Search the action centre"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search items…"
              className="input h-10 pl-10"
            />
          </div>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-ink/[0.07] bg-white dark:border-white/[0.08] dark:bg-white/[0.04]">
        {loading ? (
          <div className="p-8 text-center"><InlineLoader label="Loading platform records" state="searching" /></div>
        ) : visible.length === 0 ? (
          <p className="p-8 text-center text-sm text-graphite">Nothing matches these filters — the inbox is clear.</p>
        ) : (
          <ul className="divide-y divide-ink/[0.06] dark:divide-white/[0.08]">
            {visible.map((item) => {
              const entry = state[item.id]
              const Icon = categoryIcon[item.category]
              return (
                <li key={item.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                  <button onClick={() => setOpenId(item.id)} className="flex min-w-0 flex-1 items-start gap-3 text-left">
                    <span className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                      item.severity === 'danger' ? 'bg-red-500/10 text-red-600 dark:text-red-300' : item.severity === 'warning' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-300' : 'bg-blue-500/10 text-blue-600 dark:text-blue-300',
                    )}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className={cn('text-sm font-semibold', entry?.resolved && 'line-through opacity-70')}>{item.title}</span>
                        <Pill label={item.category} tone={categoryTone[item.category]} />
                        {item.sample && <SampleTag />}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-graphite">{item.detail}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-graphite">
                        <span>Owner: {entry?.assignee ?? 'Unassigned'}</span>
                        <span>{item.pathLabel}</span>
                        {entry?.resolved && <span>Resolved by {entry.resolvedBy}</span>}
                      </span>
                    </span>
                  </button>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {statusPill(entry)}
                    <Button variant="outline" size="sm" onClick={() => setOpenId(item.id)}>Open</Button>
                    <Button variant="outline" size="sm" onClick={() => item.school ? onSchool(item.school) : item.request ? onRequest(item.request) : navigate(item.path)}>
                      {item.school ? 'School' : item.request ? 'Request' : 'Go to screen'}
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <ActionLogPanel
          entries={logEntries}
          title="Action centre log"
          description="Who took what action on the inbox, why, and what changed."
          emptyLabel="No assignment or resolution has been recorded yet."
        />

        <Panel title="How this inbox works" description="So a new operator is never guessing.">
          <ul className="space-y-3 text-sm text-graphite">
            <li className="flex gap-3"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" /> Everything that needs a decision arrives here, whatever screen it belongs to.</li>
            <li className="flex gap-3"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" /> Assigning gives the item an owner; resolving records who did it, when and why.</li>
            <li className="flex gap-3"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" /> Sample-data items stay in the log so the workflow can be practised end to end.</li>
          </ul>
          <Callout tone="warning" title="Resolving here does not change the underlying record">
            A resolved inbox item is closed for you and recorded in the log. Applications, requests, incidents and payments still have to be actioned on their own screen, which the item links to.
          </Callout>
        </Panel>
      </div>

      <Modal
        open={Boolean(openItem)}
        onClose={() => setOpenId(null)}
        size="lg"
        title={openItem?.title ?? ''}
        description={openItem ? `${openItem.category} · ${openItem.pathLabel}${openItem.sample ? ' · sample data' : ''}` : ''}
        footer={
          openItem ? (
            <>
              <Button variant="outline" onClick={() => openItem.school ? onSchool(openItem.school) : openItem.request ? onRequest(openItem.request) : navigate(openItem.path)}>
                <ChevronRight className="h-4 w-4" /> Open record
              </Button>
              {openEntry?.resolved
                ? <Button variant="outline" onClick={() => reopen(openItem)}>Reopen</Button>
                : <Button variant="accent" onClick={() => setResolveRequest({
                    title: 'Resolve item',
                    target: openItem.title,
                    description: 'Record what was done so the next operator does not repeat the work.',
                    confirmLabel: 'Resolve item',
                    requiresReason: true,
                    reasonLabel: 'What was done to resolve this?',
                    onConfirm: (input) => resolve(openItem, input.reason),
                  })}>Resolve</Button>}
            </>
          ) : null
        }
      >
        {openItem && (
          <div className="space-y-5">
            <p className="text-sm leading-6">{openItem.detail}</p>
            <Callout tone={openItem.severity === 'danger' ? 'danger' : openItem.severity === 'warning' ? 'warning' : 'info'} title="What to do next">
              {openItem.nextStep}
            </Callout>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-ink/10 p-4 dark:border-white/10">
                <p className="text-xs font-semibold text-graphite">Status</p>
                <div className="mt-2 flex items-center gap-2">{statusPill(openEntry)}</div>
                {openEntry?.resolved && (
                  <p className="mt-2 text-xs leading-5 text-graphite">
                    {openEntry.reason} — {openEntry.resolvedBy}, {openEntry.resolvedAt ? new Date(openEntry.resolvedAt).toLocaleString() : ''}
                  </p>
                )}
              </div>
              <div className="rounded-2xl border border-ink/10 p-4 dark:border-white/10">
                <label className="text-xs font-semibold text-graphite" htmlFor="action-assignee">Assigned to</label>
                <select
                  id="action-assignee"
                  className="input mt-2 py-2"
                  value={openEntry?.assignee ?? ''}
                  onChange={(event) => assign(openItem, event.target.value)}
                >
                  <option value="">Unassigned</option>
                  {operators.map((item) => <option key={item.id} value={item.fullName || item.email}>{item.fullName || item.email}</option>)}
                </select>
                <p className="mt-2 text-xs text-graphite">Assignments come from the platform administrators with live access.</p>
              </div>
            </div>

            {openItem.request && (
              <div className="rounded-2xl bg-ink/[0.035] p-4 text-sm dark:bg-white/[0.05]">
                <p className="font-semibold">{openItem.request.type} · {openItem.request.school}</p>
                <p className="mt-1 text-xs text-graphite">Submitted by {openItem.request.submittedBy} · {openItem.request.submitted}</p>
                <div className="mt-3"><Status value={openItem.request.status} /></div>
              </div>
            )}

            {openItem.school && (
              <div className="rounded-2xl bg-ink/[0.035] p-4 text-sm dark:bg-white/[0.05]">
                <p className="font-semibold">{openItem.school.name}</p>
                <p className="mt-1 text-xs text-graphite">{openItem.school.code ?? openItem.school.id} · {openItem.school.location} · {openItem.school.plan}</p>
                <div className="mt-3"><Status value={openItem.school.status} /></div>
              </div>
            )}

            <p className="flex items-center gap-2 text-xs text-graphite">
              <UserCircle className="h-3.5 w-3.5" /> Assigning and resolving are recorded in the action centre log on this screen with your name.
            </p>
            <p className="flex items-center gap-2 text-xs text-graphite">
              <Megaphone className="h-3.5 w-3.5" /> Nothing here notifies the school automatically — use Communications when a school needs to be told.
            </p>
          </div>
        )}
      </Modal>

      <ActionDialog request={resolveRequest} onClose={() => setResolveRequest(null)} actor={operator} />
    </div>
  )
}
