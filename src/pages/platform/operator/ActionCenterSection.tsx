import { useMemo, useState } from 'react'
import { Buildings, CaretRight, ClipboardText, FileText, MagnifyingGlass, Warning } from '@phosphor-icons/react'
import type { Request, School } from '@/pages/platform/types'
import { FilterChips, Panel, Pill, SearchBox, SectionHeader } from './PrototypeKit'

type InboxKind = 'All' | 'Applications' | 'Requests' | 'Schools'

interface InboxItem {
  id: string
  kind: Exclude<InboxKind, 'All'>
  title: string
  detail: string
  actionLabel: string
  onOpen: () => void
}

interface ActionCenterSectionProps {
  schools: School[]
  requests: Request[]
  pendingApplicationCount: number
  navigate: (path: string) => void
  onSchool: (school: School) => void
  onRequest: (request: Request) => void
  loading: boolean
}

const kinds: readonly InboxKind[] = ['All', 'Applications', 'Requests', 'Schools']

export default function ActionCenterSection({ schools, requests, pendingApplicationCount, navigate, onSchool, onRequest, loading }: ActionCenterSectionProps) {
  const [kind, setKind] = useState<InboxKind>('All')
  const [query, setQuery] = useState('')

  const items = useMemo<InboxItem[]>(() => {
    const next: InboxItem[] = []
    if (pendingApplicationCount > 0) {
      next.push({
        id: 'pending-applications',
        kind: 'Applications',
        title: `${pendingApplicationCount} school application${pendingApplicationCount === 1 ? '' : 's'} awaiting a decision`,
        detail: 'Open the application queue to review submitted records.',
        actionLabel: 'Open applications',
        onOpen: () => navigate('/platform/applications'),
      })
    }
    requests.filter((request) => request.status !== 'Resolved').forEach((request) => {
      next.push({
        id: `request-${request.id}`,
        kind: 'Requests',
        title: `${request.type} from ${request.submittedBy}`,
        detail: request.summary,
        actionLabel: 'Open request',
        onOpen: () => onRequest(request),
      })
    })
    schools.filter((school) => school.status === 'Suspended').forEach((school) => {
      next.push({
        id: `school-${school.id}`,
        kind: 'Schools',
        title: `${school.name} is suspended`,
        detail: `${school.location} · ${school.admin}`,
        actionLabel: 'Open school',
        onOpen: () => onSchool(school),
      })
    })
    return next
  }, [navigate, onRequest, onSchool, pendingApplicationCount, requests, schools])

  const visible = items.filter((item) => (kind === 'All' || item.kind === kind) && `${item.title} ${item.detail}`.toLowerCase().includes(query.toLowerCase()))
  const count = (target: Exclude<InboxKind, 'All'>) => items.filter((item) => item.kind === target).length

  return <>
    <SectionHeader eyebrow="Operations queue" title="Action center" description="A read-through of real pending applications, contact requests, and suspended schools. Opening an item takes you to its actual record; no local assignment or resolution is simulated here." />
    <div className="grid gap-4 sm:grid-cols-3">
      <Panel title="Applications" description="Awaiting an approval workflow"><p className="text-2xl font-semibold">{loading ? '…' : count('Applications')}</p></Panel>
      <Panel title="Contact requests" description="Not yet marked handled"><p className="text-2xl font-semibold">{loading ? '…' : count('Requests')}</p></Panel>
      <Panel title="Suspended schools" description="Review in the school record"><p className="text-2xl font-semibold">{loading ? '…' : count('Schools')}</p></Panel>
    </div>
    <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <FilterChips options={kinds} value={kind} onChange={setKind} label="Filter action center" />
      <div className="w-full lg:max-w-sm"><SearchBox value={query} onChange={setQuery} placeholder="Search items…" label="Search action center" /></div>
    </div>
    <Panel title="Items needing attention" description="These are derived only from records loaded for this operator." className="mt-5">
      {loading ? <p className="py-6 text-sm text-graphite">Loading platform records…</p> : visible.length === 0 ? <p className="py-6 text-sm text-graphite">No items match this view. New items appear when the underlying records are available.</p> : <ul className="divide-y divide-ink/[0.06] dark:divide-white/[0.08]">{visible.map((item) => {
        const Icon = item.kind === 'Applications' ? FileText : item.kind === 'Requests' ? ClipboardText : Buildings
        const tone = item.kind === 'Schools' ? 'danger' : item.kind === 'Applications' ? 'warning' : 'info'
        return <li key={item.id}><button type="button" onClick={item.onOpen} className="flex min-h-16 w-full items-center gap-3 py-3 text-left hover:bg-ink/[0.025] focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand dark:hover:bg-white/[0.03]"><span className="rounded-xl bg-brand/10 p-2.5 text-brand"><Icon className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><span className="font-semibold">{item.title}</span><Pill label={item.kind} tone={tone} /></span><span className="mt-1 block truncate text-xs text-graphite">{item.detail}</span></span><span className="hidden text-xs font-semibold text-brand sm:inline">{item.actionLabel}</span><CaretRight className="h-4 w-4 shrink-0 text-graphite" /></button></li>
      })}</ul>}
    </Panel>
    <p className="mt-6 flex items-start gap-2 text-xs leading-5 text-graphite"><Warning className="mt-0.5 h-4 w-4 shrink-0" />Health, security, billing, delivery, and integration alerts are omitted until verified sources are connected.</p>
  </>
}
