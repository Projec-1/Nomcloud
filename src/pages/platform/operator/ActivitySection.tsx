import { useMemo, useState } from 'react'
import { Clock, Pulse } from '@phosphor-icons/react'
import type { PlatformAuditRecord } from '@/services/platformService'
import { Panel, SearchBox, SectionHeader, stamp } from './PrototypeKit'

export default function ActivitySection({
  rows,
  loading,
}: {
  rows: PlatformAuditRecord[]
  loading: boolean
}) {
  const [query, setQuery] = useState('')
  const [visibleLimit, setVisibleLimit] = useState(50)
  const filteredRows = useMemo(() => rows.filter((row) =>
    `${row.action} ${row.actorEmail ?? ''} ${row.summary ?? ''} ${row.entityType ?? ''} ${row.schoolId ?? ''}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  ), [query, rows])
  const visibleRows = filteredRows.slice(0, visibleLimit)

  return <>
    <SectionHeader eyebrow="Platform operations" title="Activity" description="Recent records from the available platform audit log." />
    <Panel title="Audit activity" description={loading ? 'Loading the latest audit records…' : `${rows.length.toLocaleString()} audit records loaded for this workspace.`}>
      <p className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 text-xs leading-5 text-graphite">
        Audit records are not a complete event feed. This does not report message delivery, security monitoring, or system telemetry, and it only reflects events written to the audit source.
      </p>
      <SearchBox value={query} onChange={(value) => { setQuery(value); setVisibleLimit(50) }} placeholder="Search audit activity…" label="Search audit activity" />
      {loading ? <p role="status" className="py-6 text-sm text-graphite">Loading audit activity…</p>
        : visibleRows.length ? <ol className="mt-4 divide-y divide-ink/[0.06] dark:divide-white/[0.08]">
          {visibleRows.map((row) => <li key={row.id} className="flex gap-3 py-4">
            <span className="mt-0.5 rounded-xl bg-brand/10 p-2.5 text-brand"><Pulse className="h-4 w-4" aria-hidden="true" /></span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{row.action || 'Audit event'}</span>
              <span className="mt-1 block text-sm text-graphite">{row.summary || 'No event summary was recorded.'}</span>
              <span className="mt-1 block break-all text-xs text-graphite">
                {[row.actorEmail, row.entityType, row.schoolId ? `School ${row.schoolId}` : null].filter(Boolean).join(' · ') || 'Actor or entity not recorded'}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1.5 text-xs text-graphite"><Clock className="h-3.5 w-3.5" aria-hidden="true" />{stamp(row.createdAt)}</span>
          </li>)}
        </ol> : <p className="py-6 text-sm text-graphite">{rows.length ? 'No audit events match this search.' : 'No audit records are available.'}</p>}
      {!loading && visibleRows.length < filteredRows.length && <button type="button" onClick={() => setVisibleLimit((limit) => limit + 50)} className="mt-3 rounded-lg px-3 py-2 text-sm font-semibold text-brand hover:bg-brand/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">Load more audit events</button>}
      {!loading && rows.length > 0 && <p className="mt-3 text-xs text-graphite">Showing {visibleRows.length.toLocaleString()} of {filteredRows.length.toLocaleString()} matching records ({rows.length.toLocaleString()} loaded).</p>}
    </Panel>
  </>
}
