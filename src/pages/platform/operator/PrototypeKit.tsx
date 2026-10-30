import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import type { Icon as PhosphorIcon } from '@phosphor-icons/react'
import {
  ArrowCounterClockwise as RotateCcw,
  Check,
  CheckCircle,
  Clock,
  DownloadSimple as Download,
  MagnifyingGlass as Search,
  ShieldCheck,
  Warning,
} from '@phosphor-icons/react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { cn } from '@/utils/cn'
import { formatDate, formatDateShort } from '@/utils/format'
import { approverNames } from './prototypeData'

/**
 * Shared pieces for the operator screens that run on sample data.
 *
 * The point of these screens is not to display numbers: it is that an operator
 * can detect a problem, open the record behind it, take an action that is
 * authorised and recorded, and then see that the action changed something. The
 * components here exist so every section does those four things the same way.
 */

// ---------------------------------------------------------------------------
// Status and tone
// ---------------------------------------------------------------------------

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand'

const toneChip: Record<Tone, string> = {
  neutral: 'bg-ink/[0.06] text-graphite dark:bg-white/[0.08] dark:text-white/70',
  success: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  warning: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  danger: 'bg-red-500/10 text-red-700 dark:text-red-300',
  info: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
  brand: 'bg-brand/10 text-brand',
}

const SUCCESS_WORDS = new Set(['operational', 'resolved', 'applied', 'verified', 'active', 'enabled', 'delivered', 'paid', 'passed', 'succeeded', 'approved', 'contained', 'completed', 'published', 'connected', 'healthy', 'ok', 'reconciled', 'restored', 'clean', 'granted', 'allow', 'ready', 'sent', 'owned'])
const WARNING_WORDS = new Set(['degraded', 'pending', 'queued', 'scheduled', 'warning', 'beta', 'awaiting', 'monitoring', 'investigating', 'partial', 'retry', 'staged', 'due', 'open', 'attention', 'trialing', 'in-progress', 'provisioning', 'slow', 'expiring', 'needs', 'work', 'paused', 'draft', 'soon', 'unverified', 'approval', 'required', 'medium', 'low'])
const DANGER_WORDS = new Set(['outage', 'failed', 'failure', 'critical', 'suspended', 'revoked', 'blocked', 'overdue', 'breach', 'high', 'denied', 'error', 'compromised', 'expired', 'rejected', 'unpaid', 'failing', 'fraud', 'flagged', 'escalated', 'deny', 'disconnected', 'cancelled', 'missing'])
const INFO_WORDS = new Set(['new', 'identified', 'planned', 'temporary', 'note'])

export function toneFor(value: string): Tone {
  const words = value.toLowerCase().split(/[^a-z]+/).filter(Boolean)
  if (words.some((word) => SUCCESS_WORDS.has(word))) return 'success'
  if (words.some((word) => DANGER_WORDS.has(word))) return 'danger'
  if (words.some((word) => WARNING_WORDS.has(word))) return 'warning'
  if (words.some((word) => INFO_WORDS.has(word))) return 'info'
  return 'neutral'
}

export function Pill({ label, tone, className }: { label: string; tone?: Tone; className?: string }) {
  const resolved = tone ?? toneFor(label)
  return (
    <span className={cn('inline-flex max-w-full min-w-0 flex-wrap items-center gap-1.5 whitespace-normal break-words rounded-full px-2.5 py-1 text-left text-xs font-semibold leading-4', toneChip[resolved], className)}>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
      {label}
    </span>
  )
}

/** Marks a single value as sample data inside an otherwise real screen. */
export function SampleTag({ className }: { className?: string }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300', className)}>Sample</span>
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export function SectionHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="operator-page-heading mb-6 flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
      <div className="min-w-0">
        {eyebrow && <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-brand">{eyebrow}</p>}
        <h1 className="break-words text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-2 max-w-2xl break-words text-sm leading-6 text-graphite">{description}</p>
      </div>
      {action && <div className="min-w-0 max-w-full">{action}</div>}
    </div>
  )
}

export function Panel({ title, description, action, children, className }: { title?: string; description?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('operator-glass-panel rounded-2xl border border-ink/[0.07] bg-white p-5 dark:border-white/[0.08] dark:bg-white/[0.04]', className)}>
      {(title || action) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="break-words font-semibold">{title}</h2>}
            {description && <p className="mt-1 break-words text-xs text-graphite">{description}</p>}
          </div>
          {action && <div className="min-w-0 max-w-full">{action}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

export function KpiTile({ label, value, detail, icon: Icon, tone = 'brand' }: { label: string; value: ReactNode; detail?: ReactNode; icon?: PhosphorIcon; tone?: 'brand' | 'danger' | 'warning' | 'success' }) {
  const tint = tone === 'danger' ? 'bg-red-500/10 text-red-600 dark:text-red-300' : tone === 'warning' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-300' : tone === 'success' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300' : 'bg-brand/10 text-brand'
  return (
    <div className="operator-glass-metric rounded-2xl border border-ink/[0.07] bg-white p-5 dark:border-white/[0.08] dark:bg-white/[0.04]">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 break-words text-sm font-medium text-graphite">{label}</span>
        {Icon && <span className={cn('shrink-0 rounded-xl p-2.5', tint)}><Icon className="h-4 w-4" /></span>}
      </div>
      <div className="mt-4 break-words text-2xl font-semibold tracking-tight">{value}</div>
      {detail && <p className="mt-1 break-words text-xs font-medium text-graphite">{detail}</p>}
    </div>
  )
}

/**
 * Every section built on sample data states that plainly at the top. The
 * Control Center previously showed invented figures as though they were real,
 * so the label is not decoration — it is what makes the screens safe to use.
 */
export function PrototypeNotice({ scope, detail }: { scope: string; detail?: string }) {
  return (
    <div role="status" className="operator-prototype-notice mb-6 border-l-2 border-amber-500 bg-amber-500/[0.06] px-4 py-3">
      <p className="break-words text-sm font-semibold text-ink dark:text-white">Prototype data · {scope} is not connected to a backend yet</p>
      <p className="mt-1 break-words text-sm leading-6 text-graphite">
        {detail ?? 'Records, figures and actions on this screen come from built-in sample data. Actions behave like the real thing — they are authorised, recorded and visible below — but nothing is saved or sent until the backend is connected.'}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center">{children}</div>
}

export function SearchBox({ value, onChange, placeholder, label }: { value: string; onChange: (value: string) => void; placeholder: string; label: string }) {
  return (
    <div className="relative min-w-0 flex-1">
      <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-graphite" />
      <input aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="input pl-10" />
    </div>
  )
}

export function FilterChips<T extends string>({ options, value, onChange, label }: { options: readonly T[]; value: T; onChange: (value: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex gap-2 overflow-x-auto pb-1">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className={cn('whitespace-nowrap rounded-xl px-3 py-2 text-xs font-semibold', value === option ? 'bg-ink text-white dark:bg-white dark:text-ink' : 'bg-white text-graphite dark:bg-white/[0.06]')}
        >
          {option}
        </button>
      ))}
    </div>
  )
}

export function Dropdown({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <label className="flex min-w-0 items-center gap-2">
      <span className="whitespace-nowrap text-xs font-semibold text-graphite">{label}</span>
      <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className="input min-w-0 py-2">
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  )
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

export interface Column<T> {
  key: string
  label: string
  width?: string
  render: (row: T) => ReactNode
}

type GridStyle = CSSProperties & Record<'--platform-cols', string>

export function DataTable<T>({ columns, rows, rowKey, onRow, renderActions, emptyLabel = 'Nothing matches these filters.' }: {
  columns: Array<Column<T>>
  rows: T[]
  rowKey: (row: T) => string
  onRow?: (row: T) => void
  renderActions?: (row: T) => ReactNode
  emptyLabel?: string
}) {
  const template = [...columns.map((column) => column.width ?? 'minmax(0,1fr)'), ...(renderActions ? ['auto'] : [])].join(' ')
  const style: GridStyle = { '--platform-cols': template }
  const rowClass = 'grid gap-2 border-b border-ink/[0.06] px-5 py-4 text-sm last:border-0 xl:grid-cols-[var(--platform-cols)] xl:items-center xl:gap-4 dark:border-white/[0.08]'

  return (
    <div className="overflow-hidden rounded-2xl border border-ink/[0.07] bg-white dark:border-white/[0.08] dark:bg-white/[0.04]">
      <div style={style} className="hidden border-b border-ink/[0.06] px-5 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-graphite xl:grid xl:grid-cols-[var(--platform-cols)] xl:items-center xl:gap-4 dark:border-white/[0.08]">
        {columns.map((column) => <span key={column.key} className="min-w-0 break-words">{column.label}</span>)}
        {renderActions && <span>Actions</span>}
      </div>
      {rows.length === 0 && <p className="p-8 text-center text-sm text-graphite">{emptyLabel}</p>}
      {rows.map((row) => (
        <div
          key={rowKey(row)}
          style={style}
          role={onRow ? 'button' : undefined}
          tabIndex={onRow ? 0 : undefined}
          onClick={onRow ? () => onRow(row) : undefined}
          onKeyDown={onRow ? (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onRow(row) } } : undefined}
          className={cn(rowClass, onRow && 'cursor-pointer text-left hover:bg-ink/[0.025] dark:hover:bg-white/[0.03]')}
        >
          {columns.map((column) => <div key={column.key} className="min-w-0 break-words">{column.render(row)}</div>)}
          {renderActions && (
            <div className="flex min-w-0 flex-wrap items-center gap-2" onClick={(event) => event.stopPropagation()}>
              {renderActions(row)}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export function MetaList({ items, columns = 2 }: { items: Array<[string, ReactNode]>; columns?: number }) {
  return (
    <dl className={cn('grid gap-3', columns === 3 ? 'sm:grid-cols-3' : columns === 1 ? '' : 'sm:grid-cols-2')}>
      {items.map(([label, value]) => (
        <div key={label} className="rounded-xl bg-ink/[0.035] p-3 dark:bg-white/[0.05]">
          <dt className="text-[11px] font-semibold uppercase tracking-wider text-graphite">{label}</dt>
          <dd className="mt-1.5 text-sm font-medium break-words">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

// ---------------------------------------------------------------------------
// Detail modal
// ---------------------------------------------------------------------------

export function DetailModal({ open, onClose, title, description, summary, meta, children, footer, size = 'lg' }: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  summary?: ReactNode
  meta?: Array<[string, ReactNode]>
  children?: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} description={description} size={size} footer={footer}>
      <div className="space-y-5">
        {summary}
        {meta && meta.length > 0 && <MetaList items={meta} />}
        {children}
      </div>
    </Modal>
  )
}

export function Callout({ tone = 'info', title, children }: { tone?: 'info' | 'warning' | 'danger' | 'success'; title?: string; children: ReactNode }) {
  const toneClass = {
    info: 'border-blue-500/20 bg-blue-500/[0.05]',
    warning: 'border-amber-500/25 bg-amber-500/[0.06]',
    danger: 'border-red-500/20 bg-red-500/[0.05]',
    success: 'border-emerald-500/20 bg-emerald-500/[0.05]',
  }[tone]
  return (
    <div className={cn('rounded-2xl border p-4', toneClass)}>
      {title && <p className="text-sm font-semibold">{title}</p>}
      <div className={cn('text-sm leading-6 text-graphite', title && 'mt-1')}>{children}</div>
    </div>
  )
}

export function Timeline({ entries }: { entries: Array<{ at: string; title: string; detail?: string; by?: string }> }) {
  return (
    <ol className="space-y-4">
      {entries.map((entry, index) => (
        <li key={`${entry.at}-${index}`} className="relative flex gap-3 pl-1">
          <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-brand ring-4 ring-brand/10" />
          <div className="min-w-0">
            <p className="break-words text-xs font-semibold text-graphite">{stamp(entry.at)}{entry.by ? ` · ${entry.by}` : ''}</p>
            <p className="mt-1 break-words text-sm font-semibold">{entry.title}</p>
            {entry.detail && <p className="mt-1 break-words text-xs leading-5 text-graphite">{entry.detail}</p>}
          </div>
        </li>
      ))}
    </ol>
  )
}

// ---------------------------------------------------------------------------
// Authorised action dialog
// ---------------------------------------------------------------------------

export interface ActionInput {
  reason: string
  approver: string
  options: Record<string, boolean>
}

export interface ActionRequest {
  title: string
  target: string
  description?: string
  confirmLabel?: string
  danger?: boolean
  requiresReason?: boolean
  requiresApproval?: boolean
  reasonLabel?: string
  options?: Array<{ key: string; label: string; defaultChecked?: boolean }>
  onConfirm: (input: ActionInput) => void
}

export function ActionDialog({ request, onClose, actor }: { request: ActionRequest | null; onClose: () => void; actor: string }) {
  const [reason, setReason] = useState('')
  const [approver, setApprover] = useState('')
  const [options, setOptions] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setReason('')
    setApprover('')
    setError(null)
    setOptions(Object.fromEntries((request?.options ?? []).map((option) => [option.key, option.defaultChecked ?? false])))
  }, [request])

  const coSigners = useMemo(() => approverNames.filter((name) => name !== actor), [actor])

  if (!request) return null

  const reasonOk = !request.requiresReason || reason.trim().length >= 8
  const approvalOk = !request.requiresApproval || approver.length > 0
  const canConfirm = reasonOk && approvalOk

  const confirm = () => {
    if (!canConfirm) {
      setError(request.requiresApproval && !approvalOk ? 'A second operator has to co-sign this action.' : 'Write at least a short reason (8 characters).')
      return
    }
    request.onConfirm({ reason: reason.trim(), approver, options })
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={request.title}
      description={request.target}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant={request.danger ? 'danger' : 'accent'} onClick={confirm} disabled={!canConfirm}>
            {request.confirmLabel ?? 'Apply action'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {request.description && <p className="text-sm leading-6 text-graphite">{request.description}</p>}
        <div className="rounded-2xl border border-ink/10 p-4 text-xs leading-5 text-graphite dark:border-white/10">
          <p className="font-semibold text-ink dark:text-white">This action will be recorded</p>
          <p className="mt-1">Operator, reason, target, time and outcome are written to the action log on this screen. High-risk actions also require a second operator to co-sign.</p>
        </div>
        <label className="block">
          <span className="label">{request.reasonLabel ?? 'Reason (recorded in the action log)'}</span>
          <textarea value={reason} onChange={(event) => { setReason(event.target.value); setError(null) }} rows={3} className="input resize-none" placeholder="Why is this change being made?" />
        </label>
        {request.requiresApproval && (
          <label className="block">
            <span className="label">Second operator co-signature</span>
            <select value={approver} onChange={(event) => { setApprover(event.target.value); setError(null) }} className="input py-2">
              <option value="">Select an operator…</option>
              {coSigners.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
            <span className="mt-1 block text-xs text-graphite">Two operators must authorise this action. The co-signer is recorded next to your name.</span>
          </label>
        )}
        {(request.options ?? []).length > 0 && (
          <fieldset className="space-y-2 rounded-2xl border border-ink/10 p-4 dark:border-white/10">
            <legend className="px-1 text-xs font-semibold text-graphite">Options</legend>
            {(request.options ?? []).map((option) => (
              <label key={option.key} className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={options[option.key] ?? false}
                  onChange={(event) => setOptions((current) => ({ ...current, [option.key]: event.target.checked }))}
                  className="h-4 w-4 rounded border-ink/20"
                />
                {option.label}
              </label>
            ))}
          </fieldset>
        )}
        {error && <p role="alert" className="text-sm font-semibold text-red-600 dark:text-red-300">{error}</p>}
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Action log and verification
// ---------------------------------------------------------------------------

export interface ActionLogEntry {
  id: string
  at: string
  operator: string
  action: string
  target: string
  reason: string
  approver?: string
  before?: string
  after?: string
  result: string
  options?: string[]
}

export function useActionLog(operator: string) {
  const [entries, setEntries] = useState<ActionLogEntry[]>([])
  const record = useCallback((input: Omit<ActionLogEntry, 'id' | 'at' | 'operator'>) => {
    const entry: ActionLogEntry = {
      ...input,
      id: `LOG-${Date.now().toString(36).toUpperCase()}`,
      at: new Date().toISOString(),
      operator,
    }
    setEntries((current) => [entry, ...current])
    return entry
  }, [operator])
  return { entries, record }
}

export function ActionLogPanel({ entries, title = 'Action log', description, emptyLabel = 'No operator action has been taken on this screen yet.' }: { entries: ActionLogEntry[]; title?: string; description?: string; emptyLabel?: string }) {
  const exportLog = () => {
    if (entries.length === 0) return
    downloadCsv('operator-action-log.csv', [
      ['Time', 'Operator', 'Action', 'Target', 'Reason', 'Co-signed by', 'Before', 'After', 'Result'],
      ...entries.map((entry) => [entry.at, entry.operator, entry.action, entry.target, entry.reason, entry.approver ?? '', entry.before ?? '', entry.after ?? '', entry.result]),
    ])
  }
  return (
    <Panel
      title={title}
      description={description ?? 'What was done on this screen, by whom, why, and what changed.'}
      action={<Button variant="outline" size="sm" onClick={exportLog} disabled={entries.length === 0}><Download className="h-4 w-4" /> Export log</Button>}
    >
      {entries.length === 0 ? (
        <p className="text-sm text-graphite">{emptyLabel}</p>
      ) : (
        <ul className="divide-y divide-ink/[0.06] dark:divide-white/[0.08]">
          {entries.map((entry) => (
            <li key={entry.id} className="grid gap-2 py-4 first:pt-0 last:pb-0 text-sm sm:grid-cols-[1fr_auto] sm:items-start">
              <div className="min-w-0">
                <p className="break-words font-semibold">{entry.action}<span className="ml-2 text-xs font-normal text-graphite">{entry.target}</span></p>
                <p className="mt-1 break-words text-xs text-graphite">{entry.reason}</p>
                <p className="mt-1 break-words text-xs text-graphite">
                  {stamp(entry.at)} · {entry.operator}
                  {entry.approver ? ` · co-signed by ${entry.approver}` : ''}
                  {entry.options && entry.options.length > 0 ? ` · ${entry.options.join(', ')}` : ''}
                </p>
              </div>
              <div className="flex flex-col items-start gap-2 sm:items-end">
                <Pill label={entry.result} tone={toneFor(entry.result) === 'success' ? 'success' : toneFor(entry.result)} />
                {entry.before !== undefined && entry.after !== undefined && (
                  <p className="text-xs text-graphite">
                    <span className="line-through opacity-70">{entry.before}</span>
                    <span className="mx-1">→</span>
                    <span className="font-semibold text-ink dark:text-white">{entry.after}</span>
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

export function VerificationPanel({ title, checks, note }: { title: string; checks: Array<{ label: string; value: string; ok?: boolean }>; note?: string }) {
  return (
    <Panel title={title} description="Read back from this screen after the change, so the operator can see it took effect.">
      <ul className="grid gap-3 sm:grid-cols-2">
        {checks.map((check) => (
          <li key={check.label} className="flex items-start gap-3 rounded-xl bg-ink/[0.035] p-3 dark:bg-white/[0.05]">
            {check.ok === false
              ? <Warning className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" />
              : <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" />}
            <span className="min-w-0">
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-graphite">{check.label}</span>
              <span className="mt-1 block break-words text-sm font-medium">{check.value}</span>
            </span>
          </li>
        ))}
      </ul>
      {note && <p className="mt-3 text-xs text-graphite">{note}</p>}
    </Panel>
  )
}

// ---------------------------------------------------------------------------
// Careful controls
// ---------------------------------------------------------------------------

export function DangerList({ children }: { children: ReactNode }) {
  return <div className="space-y-3">{children}</div>
}

export function DangerAction({ icon: Icon = Warning, title, description, actionLabel, onAction }: { icon?: PhosphorIcon; title: string; description: string; actionLabel: string; onAction: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-red-500/15 p-4">
      <span className="rounded-xl bg-red-500/10 p-2.5 text-red-600 dark:text-red-300"><Icon className="h-4 w-4" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-1 block text-xs text-graphite">{description}</span>
      </span>
      <Button variant="outline" size="sm" onClick={onAction}><RotateCcw className="h-4 w-4" /> {actionLabel}</Button>
    </div>
  )
}

export function Restrict({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-xs leading-5 text-graphite">
      <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-graphite" />
      <span>{children}</span>
    </p>
  )
}

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------

export function Sparkline({ points, className }: { points: number[]; className?: string }) {
  const path = useMemo(() => {
    if (points.length < 2) return ''
    const max = Math.max(...points)
    const min = Math.min(...points)
    const span = max - min || 1
    return points
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${(index / (points.length - 1)) * 100} ${30 - ((point - min) / span) * 28}`)
      .join(' ')
  }, [points])
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className={cn('h-12 w-full text-brand', className)} aria-hidden="true">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export function BarSeries({ data, formatValue }: { data: Array<{ label: string; value: number }>; formatValue?: (value: number) => string }) {
  const max = Math.max(...data.map((item) => item.value), 1)
  return (
    <ul className="space-y-3">
      {data.map((item) => (
        <li key={item.label}>
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="font-medium">{item.label}</span>
            <span className="font-semibold text-graphite">{formatValue ? formatValue(item.value) : item.value.toLocaleString()}</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink/[0.07] dark:bg-white/[0.08]">
            <div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(2, (item.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

export function DistributionBar({ segments }: { segments: Array<{ label: string; value: number; tone?: 'brand' | 'muted' | 'light' }> }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0) || 1
  const colour = { brand: 'bg-brand', muted: 'bg-brand/55', light: 'bg-brand/25' }
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-ink/[0.06] dark:bg-white/[0.08]">
        {segments.map((segment, index) => (
          <div key={segment.label} className={colour[segment.tone ?? (index === 0 ? 'brand' : index === 1 ? 'muted' : 'light')]} style={{ width: `${(segment.value / total) * 100}%` }} />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs">
        {segments.map((segment, index) => (
          <li key={segment.label} className="flex items-center gap-2">
            <span className={cn('h-2 w-2 rounded-full', colour[segment.tone ?? (index === 0 ? 'brand' : index === 1 ? 'muted' : 'light')])} />
            <span className="font-medium">{segment.label}</span>
            <span className="text-graphite">{Math.round((segment.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Formatting and export
// ---------------------------------------------------------------------------

export function stamp(iso: string): string {
  const date = new Date(iso)
  return `${formatDate(iso)} · ${date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
}

export function shortStamp(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()
  return sameDay
    ? date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : formatDateShort(iso)
}

export function relativeDays(iso: string): string {
  const days = Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000)
  if (days === 0) return 'today'
  if (days > 0) return `in ${days} day${days === 1 ? '' : 's'}`
  return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`
}

export function downloadCsv(filename: string, rows: Array<Array<string | number>>) {
  const escape = (value: string | number) => {
    const text = String(value)
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  const csv = rows.map((row) => row.map(escape).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function ExportButton({ onClick, label = 'Export CSV', disabled }: { onClick: () => void; label?: string; disabled?: boolean }) {
  return <Button variant="outline" size="sm" onClick={onClick} disabled={disabled}><Download className="h-4 w-4" /> {label}</Button>
}

export function ResultBadge({ result }: { result: 'Completed' | 'Failed' | 'Warning' }) {
  const tone: Tone = result === 'Completed' ? 'success' : result === 'Failed' ? 'danger' : 'warning'
  const Icon = result === 'Completed' ? Check : result === 'Failed' ? Warning : Clock
  return <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', toneChip[tone])}><Icon className="h-3.5 w-3.5" />{result}</span>
}
