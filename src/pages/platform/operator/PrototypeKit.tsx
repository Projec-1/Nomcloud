import type { CSSProperties, ReactNode } from 'react'
import type { Icon as PhosphorIcon } from '@phosphor-icons/react'
import { DownloadSimple as Download, MagnifyingGlass as Search, ShieldCheck } from '@phosphor-icons/react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { cn } from '@/utils/cn'
import { formatDate } from '@/utils/format'

/** Shared, data-source-neutral building blocks for the Operator Workspace. */

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand'

const toneChip: Record<Tone, string> = {
  neutral: 'bg-ink/[0.06] text-graphite dark:bg-white/[0.08] dark:text-white/70',
  success: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  warning: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  danger: 'bg-red-500/10 text-red-700 dark:text-red-300',
  info: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
  brand: 'bg-brand/10 text-brand',
}

const SUCCESS_WORDS = new Set(['active', 'approved', 'completed', 'connected', 'healthy', 'recorded', 'resolved'])
const WARNING_WORDS = new Set(['open', 'pending', 'review', 'warning'])
const DANGER_WORDS = new Set(['cancelled', 'denied', 'error', 'failed', 'revoked', 'suspended'])

export function toneFor(value: string): Tone {
  const words = value.toLowerCase().split(/[^a-z]+/).filter(Boolean)
  if (words.some((word) => SUCCESS_WORDS.has(word))) return 'success'
  if (words.some((word) => DANGER_WORDS.has(word))) return 'danger'
  if (words.some((word) => WARNING_WORDS.has(word))) return 'warning'
  return 'neutral'
}

export function Pill({ label, tone, className }: { label: string; tone?: Tone; className?: string }) {
  const resolved = tone ?? toneFor(label)
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold', toneChip[resolved], className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  )
}

export function SectionHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div>
        {eyebrow && <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-brand">{eyebrow}</p>}
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-graphite">{description}</p>
      </div>
      {action}
    </div>
  )
}

export function Panel({ title, description, action, children, className }: { title?: string; description?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-2xl border border-ink/[0.07] bg-white p-5 dark:border-white/[0.08] dark:bg-white/[0.04]', className)}>
      {(title || action) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && <h2 className="font-semibold">{title}</h2>}
            {description && <p className="mt-1 text-xs text-graphite">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function KpiTile({ label, value, detail, icon: Icon, tone = 'brand' }: { label: string; value: string; detail?: string; icon?: PhosphorIcon; tone?: 'brand' | 'danger' | 'warning' | 'success' }) {
  const tint = tone === 'danger' ? 'bg-red-500/10 text-red-600 dark:text-red-300' : tone === 'warning' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-300' : tone === 'success' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300' : 'bg-brand/10 text-brand'
  return (
    <div className="rounded-2xl border border-ink/[0.07] bg-white p-5 dark:border-white/[0.08] dark:bg-white/[0.04]">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-graphite">{label}</span>
        {Icon && <span className={cn('rounded-xl p-2.5', tint)}><Icon className="h-4 w-4" /></span>}
      </div>
      <p className="mt-4 text-2xl font-semibold tracking-tight">{value}</p>
      {detail && <p className="mt-1 text-xs font-medium text-graphite">{detail}</p>}
    </div>
  )
}

/** States an absent integration plainly, without inventing records or a local action. */
export function UnavailableNotice({ scope, detail }: { scope: string; detail: string }) {
  return (
    <div role="status" className="mb-6 rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] p-4">
      <p className="text-sm font-semibold text-ink dark:text-white">Unavailable — {scope}</p>
      <p className="mt-1 text-sm leading-6 text-graphite">{detail}</p>
    </div>
  )
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">{children}</div>
}

export function SearchBox({ value, onChange, placeholder, label }: { value: string; onChange: (value: string) => void; placeholder: string; label: string }) {
  return (
    <div className="relative min-w-0 flex-1">
      <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-graphite" aria-hidden="true" />
      <input aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="input pl-10" />
    </div>
  )
}

export function FilterChips<T extends string>({ options, value, onChange, label }: { options: readonly T[]; value: T; onChange: (value: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex gap-2 overflow-x-auto pb-1">
      {options.map((option) => (
        <button key={option} type="button" aria-pressed={value === option} onClick={() => onChange(option)} className={cn('min-h-10 whitespace-nowrap rounded-xl px-3 py-2 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand', value === option ? 'bg-ink text-white dark:bg-white dark:text-ink' : 'bg-white text-graphite dark:bg-white/[0.06]')}>
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
      <select value={value} onChange={(event) => onChange(event.target.value)} className="input min-w-0 py-2">
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  )
}

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
  const rowClass = 'grid gap-2 border-b border-ink/[0.06] px-5 py-4 text-sm last:border-0 md:grid-cols-[var(--platform-cols)] md:items-center md:gap-4 dark:border-white/[0.08]'

  return (
    <div className="overflow-hidden rounded-2xl border border-ink/[0.07] bg-white dark:border-white/[0.08] dark:bg-white/[0.04]">
      <div style={style} className="hidden border-b border-ink/[0.06] px-5 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-graphite md:grid md:grid-cols-[var(--platform-cols)] md:items-center md:gap-4 dark:border-white/[0.08]">
        {columns.map((column) => <span key={column.key}>{column.label}</span>)}
        {renderActions && <span>Actions</span>}
      </div>
      {rows.length === 0 && <p className="p-8 text-center text-sm text-graphite">{emptyLabel}</p>}
      {rows.map((row) => (
        <div key={rowKey(row)} style={style} role={onRow ? 'button' : undefined} tabIndex={onRow ? 0 : undefined} onClick={onRow ? () => onRow(row) : undefined} onKeyDown={onRow ? (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onRow(row) } } : undefined} className={cn(rowClass, onRow && 'cursor-pointer text-left hover:bg-ink/[0.025] focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand dark:hover:bg-white/[0.03]')}>
          {columns.map((column) => <div key={column.key} className="min-w-0">{column.render(row)}</div>)}
          {renderActions && <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>{renderActions(row)}</div>}
        </div>
      ))}
    </div>
  )
}

export function MetaList({ items, columns = 2 }: { items: Array<[string, ReactNode]>; columns?: number }) {
  return <dl className={cn('grid gap-3', columns === 3 ? 'sm:grid-cols-3' : columns === 1 ? '' : 'sm:grid-cols-2')}>{items.map(([label, value]) => <div key={label} className="rounded-xl bg-ink/[0.035] p-3 dark:bg-white/[0.05]"><dt className="text-[11px] font-semibold uppercase tracking-wider text-graphite">{label}</dt><dd className="mt-1.5 break-words text-sm font-medium">{value}</dd></div>)}</dl>
}

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
  return <Modal open={open} onClose={onClose} title={title} description={description} size={size} footer={footer}><div className="space-y-5">{summary}{meta && meta.length > 0 && <MetaList items={meta} />}{children}</div></Modal>
}

export function Callout({ tone = 'info', title, children }: { tone?: 'info' | 'warning' | 'danger' | 'success'; title?: string; children: ReactNode }) {
  const toneClass = { info: 'border-blue-500/20 bg-blue-500/[0.05]', warning: 'border-amber-500/25 bg-amber-500/[0.06]', danger: 'border-red-500/20 bg-red-500/[0.05]', success: 'border-emerald-500/20 bg-emerald-500/[0.05]' }[tone]
  return <div className={cn('rounded-2xl border p-4', toneClass)}>{title && <p className="text-sm font-semibold">{title}</p>}<div className={cn('text-sm leading-6 text-graphite', title && 'mt-1')}>{children}</div></div>
}

export function Restrict({ children }: { children: ReactNode }) {
  return <p className="flex items-start gap-2 text-xs leading-5 text-graphite"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-graphite" /><span>{children}</span></p>
}

export function stamp(iso: string): string {
  const date = new Date(iso)
  return `${formatDate(iso)} · ${date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
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
