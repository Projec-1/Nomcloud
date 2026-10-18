import { useMemo, useState } from 'react'
import { FileText, LockKey, ShieldWarning } from '@phosphor-icons/react'
import type { PlatformAuditRecord } from '@/services/platformService'
import { Callout, DataTable, DetailModal, Dropdown, ExportButton, FilterChips, KpiTile, Panel, Pill, SearchBox, SectionHeader, Toolbar, downloadCsv, stamp, type Column } from './PrototypeKit'

const windows = ['Last 24 hours', 'Last 7 days', 'Last 30 days', 'All time'] as const
type WindowFilter = (typeof windows)[number]
const windowHours: Record<WindowFilter, number> = { 'Last 24 hours': 24, 'Last 7 days': 24 * 7, 'Last 30 days': 24 * 30, 'All time': Number.POSITIVE_INFINITY }

export default function AuditSection({ rows, notify }: { rows: PlatformAuditRecord[]; notify: (message: string) => void }) {
  const [query, setQuery] = useState('')
  const [actor, setActor] = useState('Everyone')
  const [entity, setEntity] = useState('All records')
  const [window, setWindow] = useState<WindowFilter>('All time')
  const [recordId, setRecordId] = useState<string | null>(null)
  const actors = useMemo(() => ['Everyone', ...Array.from(new Set(rows.map((row) => row.actorEmail ?? 'System')))], [rows])
  const entities = useMemo(() => ['All records', ...Array.from(new Set(rows.map((row) => row.entityType)))], [rows])
  const visible = useMemo(() => rows.filter((row) => {
    if ((Date.now() - new Date(row.createdAt).getTime()) / 3_600_000 > windowHours[window]) return false
    if (actor !== 'Everyone' && (row.actorEmail ?? 'System') !== actor) return false
    if (entity !== 'All records' && row.entityType !== entity) return false
    return !query || `${row.action} ${row.actorEmail ?? ''} ${row.entityType} ${row.entityId ?? ''} ${row.summary ?? ''}`.toLowerCase().includes(query.toLowerCase())
  }), [actor, entity, query, rows, window])
  const selected = rows.find((row) => row.id === recordId) ?? null
  const exportRecords = () => {
    if (!visible.length) return
    downloadCsv('platform-audit-log.csv', [['Time', 'Actor', 'Action', 'Record type', 'Record ID', 'School ID', 'Summary'], ...visible.map((row) => [row.createdAt, row.actorEmail ?? 'System', row.action, row.entityType, row.entityId ?? '', row.schoolId ?? '', row.summary ?? ''])])
    notify(`${visible.length} audit record${visible.length === 1 ? '' : 's'} exported.`)
  }
  const columns: Array<Column<PlatformAuditRecord>> = [
    { key: 'action', label: 'Action', width: 'minmax(0,1.2fr)', render: (row) => <span className="flex items-center gap-2 font-semibold"><FileText className="h-4 w-4 shrink-0 text-brand" />{row.action}</span> },
    { key: 'actor', label: 'Actor', render: (row) => <span className="text-sm text-graphite">{row.actorEmail ?? 'System'}</span> },
    { key: 'record', label: 'Record', width: 'minmax(0,1.2fr)', render: (row) => <span className="text-xs text-graphite">{row.entityType}{row.entityId ? ` · ${row.entityId}` : ''}</span> },
    { key: 'when', label: 'When', render: (row) => <span className="text-xs text-graphite">{stamp(row.createdAt)}</span> },
    { key: 'state', label: 'State', render: () => <Pill label="Recorded" tone="neutral" /> },
  ]

  return <>
    <SectionHeader eyebrow="Accountability" title="Audit logs" description="Read-only records from the platform database. Filtering and CSV export operate only on records already loaded here." action={<ExportButton onClick={exportRecords} label="Export records" disabled={!visible.length} />} />
    {rows.length === 0 && <Callout tone="warning" title="No audit records yet">The audit table is available to this workspace, but no product path writes to it yet. This is an empty result, not a successful operation or an unavailable query.</Callout>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><KpiTile label="Records in view" value={visible.length.toLocaleString()} detail={`${rows.length} loaded from the database`} icon={FileText} /><KpiTile label="Investigations" value="Not available" detail="No investigation source" icon={ShieldWarning} tone="warning" /><KpiTile label="Mutation" value="Read-only" detail="The browser cannot edit or delete audit rows" icon={LockKey} /><KpiTile label="Retention" value="Not configured" detail="No retention policy or job is connected" icon={LockKey} tone="warning" /></div>
    <div className="mt-6 space-y-4"><Toolbar><SearchBox value={query} onChange={setQuery} placeholder="Search action, actor, or record…" label="Search audit records" /><Dropdown label="Actor" value={actor} onChange={setActor} options={actors.map((value) => ({ value, label: value }))} /><Dropdown label="Record type" value={entity} onChange={setEntity} options={entities.map((value) => ({ value, label: value }))} /></Toolbar><FilterChips options={windows} value={window} onChange={setWindow} label="Filter audit records by time" /></div>
    <div className="mt-5"><DataTable columns={columns} rows={visible} rowKey={(row) => row.id} onRow={(row) => setRecordId(row.id)} emptyLabel={rows.length ? 'No audit records match these filters.' : 'No audit records have been written yet.'} /></div>
    <Panel title="Audit boundary" description="What is known from the schema and current service."><p className="text-sm leading-6 text-graphite">Audit rows are append-only and this client has no mutation path. The source does not yet store a complete before-and-after record, decision reason, or outcome, so this page does not invent them. Investigation and deletion-request workflows are unavailable until durable server-side records exist.</p></Panel>
    <DetailModal open={Boolean(selected)} onClose={() => setRecordId(null)} title={selected?.action ?? ''} description={selected ? `${stamp(selected.createdAt)} · ${selected.actorEmail ?? 'System'}` : ''} summary={selected && <Callout tone="info" title="Record source">This detail is read from <code>audit_logs</code>. It is not editable from the browser.</Callout>} meta={selected ? [['Audit ID', selected.id], ['Actor', selected.actorEmail ?? 'System'], ['Record type', selected.entityType], ['Record ID', selected.entityId ?? '—'], ['School', selected.schoolId ?? 'Platform-wide'], ['Summary', selected.summary ?? 'No summary stored']] : []} size="lg"><p className="text-xs leading-5 text-graphite">The schema does not provide a stored outcome, request reason, or before-and-after value for this record.</p></DetailModal>
  </>
}
