import { useMemo, useState } from 'react'
import { CaretRight, EnvelopeSimple, FileText, MagnifyingGlass } from '@phosphor-icons/react'
import type { Request, RequestStatus } from '@/pages/platform/types'
import Status from '@/pages/platform/StatusPill'
import { FilterChips, Panel, SectionHeader } from './PrototypeKit'

const filters = ['All', 'Open', 'Resolved'] as const
type Filter = (typeof filters)[number]

interface RequestsSectionProps {
  requests: Request[]
  loading: boolean
  onOpenRequest: (request: Request) => void
}

export default function RequestsSection({ requests, loading, onOpenRequest }: RequestsSectionProps) {
  const [filter, setFilter] = useState<Filter>('All')
  const [query, setQuery] = useState('')
  const visible = useMemo(() => requests.filter((request) => {
    if (filter !== 'All' && request.status !== filter) return false
    return `${request.type} ${request.submittedBy} ${request.summary} ${request.id}`.toLowerCase().includes(query.toLowerCase())
  }), [filter, query, requests])
  const count = (status: RequestStatus) => requests.filter((request) => request.status === status).length

  return <>
    <SectionHeader eyebrow="Operations queue" title="Requests & reviews" description="The newest 500 contact messages read from the platform database. Older messages are not loaded in this view. A request can be opened for its stored details and, when supported, marked handled." />
    <div className="grid gap-4 sm:grid-cols-2"><Panel title="Open" description="Waiting to be handled"><p className="text-2xl font-semibold">{loading ? '…' : count('Open')}</p></Panel><Panel title="Resolved" description="Already marked handled"><p className="text-2xl font-semibold">{loading ? '…' : count('Resolved')}</p></Panel></div>
    <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><FilterChips options={filters} value={filter} onChange={setFilter} label="Filter requests" /><label className="relative w-full lg:max-w-sm"><MagnifyingGlass className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-graphite" aria-hidden="true" /><input aria-label="Search requests" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search requests…" className="input w-full pl-10" /></label></div>
    <Panel title="Request queue" description="Search and counts apply to the newest 500 returned messages. No reviewer assignment, note, escalation, rejection, or response is simulated in this browser." className="mt-5">
      {loading ? <p className="py-6 text-sm text-graphite">Loading requests…</p> : visible.length === 0 ? <p className="py-6 text-sm text-graphite">{requests.length ? 'No requests match these filters.' : 'No contact messages are available in the loaded result.'}</p> : <ul className="divide-y divide-ink/[0.06] dark:divide-white/[0.08]">{visible.map((request) => <li key={request.id}><button type="button" onClick={() => onOpenRequest(request)} className="grid min-h-20 w-full gap-3 py-4 text-left hover:bg-ink/[0.025] focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand dark:hover:bg-white/[0.03] sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1.6fr)_auto] sm:items-center"><span className="min-w-0"><span className="flex items-center gap-2 font-semibold"><FileText className="h-4 w-4 shrink-0 text-brand" />{request.type}</span><span className="mt-1 block text-xs text-graphite">{request.id}</span></span><span className="min-w-0"><span className="block truncate text-sm">{request.summary}</span><span className="mt-1 flex items-center gap-1.5 text-xs text-graphite"><EnvelopeSimple className="h-3.5 w-3.5" />{request.submittedBy} · {request.submitted}</span></span><span className="flex items-center justify-between gap-3 sm:justify-end"><Status value={request.status} /><CaretRight className="h-4 w-4 text-graphite" /></span></button></li>)}</ul>}
    </Panel>
  </>
}
