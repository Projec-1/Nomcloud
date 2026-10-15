import { useMemo, useState } from 'react'
import { CaretRight as ChevronRight, FileText, LockKey as LockKeyhole, ShieldWarning, Trash } from '@phosphor-icons/react'
import { formatDate } from '@/utils/format'
import {
  ActionDialog,
  ActionLogPanel,
  Callout,
  DataTable,
  DetailModal,
  Dropdown,
  ExportButton,
  FilterChips,
  KpiTile,
  MetaList,
  Panel,
  Pill,
  SampleTag,
  SearchBox,
  SectionHeader,
  Toolbar,
  VerificationPanel,
  downloadCsv,
  stamp,
  useActionLog,
  type ActionRequest,
  type Column,
} from './PrototypeKit'
import { auditFlags, auditPolicy, type AuditFlag } from './prototypeData'
import type { PlatformAuditRecord } from '@/services/platformService'

const windowOptions = ['Last 24 hours', 'Last 7 days', 'Last 30 days', 'All time'] as const
type WindowFilter = (typeof windowOptions)[number]

const windowHours: Record<WindowFilter, number> = {
  'Last 24 hours': 24,
  'Last 7 days': 24 * 7,
  'Last 30 days': 24 * 30,
  'All time': Number.POSITIVE_INFINITY,
}

export default function AuditSection({ rows, notify, onNavigate, operator }: {
  rows: PlatformAuditRecord[]
  notify: (message: string) => void
  onNavigate?: (path: string) => void
  operator: string
}) {
  const [query, setQuery] = useState('')
  const [actor, setActor] = useState('Everyone')
  const [entity, setEntity] = useState('All records')
  const [window, setWindow] = useState<WindowFilter>('All time')
  const [recordId, setRecordId] = useState<string | null>(null)
  const [flagId, setFlagId] = useState<string | null>(null)
  const [flags, setFlags] = useState<AuditFlag[]>(auditFlags)
  const [request, setRequest] = useState<ActionRequest | null>(null)
  const [verified, setVerified] = useState<Array<{ label: string; value: string; ok?: boolean }> | null>(null)
  const { entries, record } = useActionLog(operator)

  const actors = useMemo(() => ['Everyone', ...Array.from(new Set(rows.map((row) => row.actorEmail ?? 'System')))], [rows])
  const entities = useMemo(() => ['All records', ...Array.from(new Set(rows.map((row) => row.entityType)))], [rows])

  const visible = useMemo(() => rows.filter((row) => {
    const ageHours = (Date.now() - new Date(row.createdAt).getTime()) / 3_600_000
    if (ageHours > windowHours[window]) return false
    if (actor !== 'Everyone' && (row.actorEmail ?? 'System') !== actor) return false
    if (entity !== 'All records' && row.entityType !== entity) return false
    if (query && !`${row.action} ${row.actorEmail ?? ''} ${row.entityType} ${row.entityId ?? ''} ${row.summary ?? ''}`.toLowerCase().includes(query.toLowerCase())) return false
    return true
  }), [rows, actor, entity, window, query])

  const selectedRecord = useMemo(() => rows.find((row) => row.id === recordId) ?? null, [rows, recordId])
  const selectedFlag = useMemo(() => flags.find((flag) => flag.id === flagId) ?? null, [flags, flagId])

  const exportRecords = () => {
    if (visible.length === 0) return
    downloadCsv('platform-audit-log.csv', [
      ['Time', 'Operator', 'Action', 'Record type', 'Record id', 'School id', 'Summary', 'Outcome', 'Before / after'],
      ...visible.map((row) => [row.createdAt, row.actorEmail ?? 'System', row.action, row.entityType, row.entityId ?? '', row.schoolId ?? '', row.summary ?? '', 'Recorded', 'Not recorded by the database yet']),
    ])
    notify(`${visible.length} audit records exported.`)
  }

  const updateFlag = (flag: AuditFlag, next: AuditFlag['status']) => {
    setRequest({
      title: next === 'Closed' ? 'Close this investigation' : 'Start an investigation',
      target: `${flag.id} · ${flag.rule}`,
      description: next === 'Closed'
        ? 'Closing records your finding and removes the item from the queue. The record itself is never changed or deleted.'
        : 'The item moves to investigating and is assigned to you so other operators can see it is being handled.',
      confirmLabel: next === 'Closed' ? 'Close investigation' : 'Start investigating',
      requiresReason: true,
      requiresApproval: next === 'Closed' && flag.severity === 'High',
      reasonLabel: next === 'Closed' ? 'What did you find, and what was done?' : 'What are you checking?',
      onConfirm: ({ reason, approver }) => {
        setFlags((current) => current.map((item) => item.id === flag.id ? { ...item, status: next } : item))
        record({
          action: next === 'Closed' ? 'Closed an audit investigation' : 'Started an audit investigation',
          target: `${flag.id} · ${flag.rule}`,
          reason,
          approver: approver || undefined,
          before: flag.status,
          after: next,
          result: 'Applied',
        })
        setVerified([
          { label: 'Flag', value: `${flag.id} · ${flag.severity} severity` },
          { label: 'Status', value: `${flag.status} → ${next}` },
          { label: 'Actor under review', value: flag.actor },
          { label: 'Audit record changed', value: 'No — audit records are append-only', ok: true },
        ])
        setFlagId(null)
        notify(`${flag.id} moved to ${next.toLowerCase()}.`)
      },
    })
  }

  const requestDeletion = (row: PlatformAuditRecord) => {
    setRequest({
      title: 'Request deletion of an audit record',
      target: `${row.action} · ${formatDate(row.createdAt)}`,
      description: 'Audit records exist for accountability. Deletion is founder-only, needs a written reason and a second operator, and is logged itself.',
      confirmLabel: 'Submit request',
      danger: true,
      requiresReason: true,
      requiresApproval: true,
      reasonLabel: 'Why should this record be deleted? (retention and legal holds are checked first)',
      onConfirm: ({ reason, approver }) => {
        record({
          action: 'Requested deletion of an audit record',
          target: `${row.id} · ${row.action}`,
          reason,
          approver: approver || undefined,
          before: 'Recorded',
          after: 'Deletion requested — awaiting founder approval',
          result: 'Queued',
        })
        setVerified([
          { label: 'Record', value: `${row.id} · ${formatDate(row.createdAt)}` },
          { label: 'Request state', value: 'Awaiting founder approval' },
          { label: 'Record still present', value: 'Yes — nothing was deleted', ok: true },
          { label: 'Deletion permitted by the client', value: 'No. The database restricts it.', ok: true },
        ])
        notify('Deletion request recorded. Nothing was deleted.')
      },
    })
  }

  const recordColumns: Array<Column<PlatformAuditRecord>> = [
    { key: 'action', label: 'Action', width: 'minmax(0,1.2fr)', render: (row) => <span className="flex items-center gap-2 font-semibold"><FileText className="h-4 w-4 text-brand" />{row.action}</span> },
    { key: 'actor', label: 'Operator', render: (row) => <span className="text-sm text-graphite">{row.actorEmail ?? 'System'}</span> },
    { key: 'target', label: 'Record', width: 'minmax(0,1.4fr)', render: (row) => <span className="text-xs text-graphite">{row.entityType}{row.entityId ? ` · ${row.entityId}` : ''}</span> },
    { key: 'when', label: 'When', render: (row) => <span className="text-xs text-graphite">{stamp(row.createdAt)}</span> },
    { key: 'outcome', label: 'Outcome', render: () => <Pill label="Recorded" tone="neutral" /> },
  ]

  const flagColumns: Array<Column<AuditFlag>> = [
    { key: 'rule', label: 'Rule that fired', width: 'minmax(0,1.6fr)', render: (flag) => <span><span className="block font-semibold">{flag.rule}</span><span className="block text-xs text-graphite">{flag.id} · {stamp(flag.at)}</span></span> },
    { key: 'severity', label: 'Severity', render: (flag) => <Pill label={flag.severity} /> },
    { key: 'actor', label: 'Actor', render: (flag) => <span className="text-sm text-graphite">{flag.actor}</span> },
    { key: 'target', label: 'Target', render: (flag) => <span className="text-xs text-graphite">{flag.target}</span> },
    { key: 'status', label: 'Status', render: (flag) => <Pill label={flag.status} /> },
  ]

  return (
    <>
      <SectionHeader
        eyebrow="Accountability"
        title="Audit logs"
        description="Who did what, when, and on which record. Records read from the platform database are shown unchanged."
        action={<ExportButton onClick={exportRecords} label="Export records" />}
      />

      {rows.length === 0 && (
        <Callout tone="warning" title="The audit table is empty">
          The audit_logs table exists and this screen reads it, but nothing in the product writes an event into it yet. Until sign-in, permission, billing
          and school-approval actions are recorded, this list stays empty. The investigation queue below runs on sample data and is labelled as such.
        </Callout>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Records in view" value={visible.length.toLocaleString()} detail={`${rows.length} records read from the database`} icon={FileText} />
        <KpiTile label="Flagged for investigation" value={flags.filter((flag) => flag.status !== 'Closed').length.toString()} detail={`${flags.filter((flag) => flag.severity === 'High' && flag.status !== 'Closed').length} high severity`} icon={ShieldWarning} tone={flags.some((flag) => flag.severity === 'High' && flag.status !== 'Closed') ? 'danger' : 'success'} />
        <KpiTile label="Deletion restrictions" value="Founder only" detail="Written reason and a second operator required" icon={LockKeyhole} />
        <KpiTile label="Retention" value={`${auditPolicy.retentionDays} days`} detail="Append-only: records are never edited" icon={LockKeyhole} />
      </div>

      <div className="mt-6 space-y-4">
        <Toolbar>
          <SearchBox value={query} onChange={setQuery} placeholder="Search action, operator or record…" label="Search audit records" />
          <Dropdown label="Operator" value={actor} onChange={setActor} options={actors.map((value) => ({ value, label: value }))} />
          <Dropdown label="Record type" value={entity} onChange={setEntity} options={entities.map((value) => ({ value, label: value }))} />
        </Toolbar>
        <FilterChips options={windowOptions} value={window} onChange={setWindow} label="Date range" />
      </div>

      <div className="mt-5">
        <DataTable columns={recordColumns} rows={visible} rowKey={(row) => row.id} onRow={(row) => setRecordId(row.id)} emptyLabel="No audit records match these filters." />
      </div>

      <div className="mt-6">
        <Panel
          title="Investigation queue"
          description="Rules that watch operator behaviour and need a human decision."
          action={<SampleTag />}
        >
          <DataTable columns={flagColumns} rows={flags} rowKey={(flag) => flag.id} onRow={(flag) => setFlagId(flag.id)} />
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <Panel title="Retention and record handling" description="What the platform promises about its own audit trail.">
          <MetaList
            items={[
              ['Retention', `${auditPolicy.retentionDays} days, after which records are pruned by a scheduled job.`],
              ['Deletion', auditPolicy.deletionPermission],
              ['Write mode', auditPolicy.writeMode],
              ['Coverage now', `${auditPolicy.coverage[0][0]}: ${auditPolicy.coverage[0][1]}`],
              ['Coverage gap', `${auditPolicy.coverage[1][0]}: ${auditPolicy.coverage[1][1]}`],
              ['What is missing', 'Before-and-after values, outcome, reason and actor identity are not stored by the table yet, so they cannot be filtered or shown.'],
            ]}
          />
        </Panel>
        <ActionLogPanel entries={entries} description="Investigations and deletion requests taken from this screen." />
      </div>

      {verified && (
        <div className="mt-6">
          <VerificationPanel title="Result of the last action" checks={verified} note="Audit records themselves are never modified by these actions — the investigation state is." />
        </div>
      )}

      <DetailModal
        open={Boolean(selectedRecord)}
        onClose={() => setRecordId(null)}
        title={selectedRecord?.action ?? ''}
        description={selectedRecord ? `${stamp(selectedRecord.createdAt)} · ${selectedRecord.actorEmail ?? 'System'}` : ''}
        summary={selectedRecord && (
          <Callout tone="info" title="This record comes from the platform database">
            It is read directly from audit_logs and shown as stored. Nothing on this screen changes it.
          </Callout>
        )}
        meta={selectedRecord ? [
          ['Record id', selectedRecord.id],
          ['Operator', selectedRecord.actorEmail ?? 'System'],
          ['Record type', selectedRecord.entityType],
          ['Record id', selectedRecord.entityId ?? '—'],
          ['School', selectedRecord.schoolId ?? 'Platform-wide'],
          ['Summary', selectedRecord.summary ?? 'No summary stored'],
          ['Outcome', 'Not stored by the table'],
          ['Before / after', 'Not stored by the table'],
        ] : []}
        footer={selectedRecord && (
          <>
            {onNavigate && <button onClick={() => { setRecordId(null); onNavigate('/platform/activity') }} className="btn-outline px-4 py-2 text-sm">Related activity <ChevronRight className="inline h-3.5 w-3.5" /></button>}
            <button onClick={() => { setRecordId(null); requestDeletion(selectedRecord) }} className="btn-outline px-4 py-2 text-sm">
              <Trash className="mr-2 inline h-4 w-4" /> Request deletion
            </button>
          </>
        )}
        size="lg"
      >
        <Callout tone="warning" title="What this record cannot answer yet">
          The table stores the action, the actor, the target and the time. It does not store what the value was before the change, what it became, why it was
          done, or whether it succeeded — so those columns would have to be invented. They will be filled in when the write path for audit events is built.
        </Callout>
        <p className="text-xs text-graphite">Deletion is restricted: the client cannot remove an audit record, and a request has to be approved by the founder with a second operator co-signing.</p>
      </DetailModal>

      <DetailModal
        open={Boolean(selectedFlag)}
        onClose={() => setFlagId(null)}
        title={selectedFlag?.rule ?? ''}
        description={selectedFlag ? `${selectedFlag.id} · ${selectedFlag.severity} severity · ${selectedFlag.status}` : ''}
        summary={selectedFlag && (
          <Callout tone={selectedFlag.severity === 'High' ? 'danger' : selectedFlag.severity === 'Medium' ? 'warning' : 'info'} title={`What changed`}>
            <span className="line-through opacity-70">{selectedFlag.before}</span>
            <span className="mx-2">→</span>
            <span className="font-semibold text-ink dark:text-white">{selectedFlag.after}</span>
          </Callout>
        )}
        meta={selectedFlag ? [
          ['Detected', `${stamp(selectedFlag.at)}`],
          ['Actor', selectedFlag.actor],
          ['Target', selectedFlag.target],
          ['Status', <Pill key="status" label={selectedFlag.status} />],
        ] : []}
        footer={selectedFlag && selectedFlag.status !== 'Closed' && (
          <>
            {selectedFlag.status === 'New' && <button onClick={() => { const flag = selectedFlag; setFlagId(null); updateFlag(flag, 'Investigating') }} className="btn px-4 py-2 text-sm">Start investigating</button>}
            <button onClick={() => { const flag = selectedFlag; setFlagId(null); updateFlag(flag, 'Closed') }} className="btn-accent px-4 py-2 text-sm">Close investigation</button>
          </>
        )}
        size="lg"
      >
        {selectedFlag && (
          <>
            <MetaList items={selectedFlag.evidence} />
            <Callout tone="info" title="Flagging is sample behaviour">
              In the real system these rules run against the audit table itself. Because nothing writes to that table yet, the queue is sample data — but the
              investigation workflow around it is the one that will be used.
            </Callout>
          </>
        )}
      </DetailModal>

      <ActionDialog request={request} onClose={() => setRequest(null)} actor={operator} />

      <p className="mt-6 text-xs text-graphite">
        Audit records are read-only here by design. The table is append-only, and the client has no permission to update or remove a row.
      </p>
    </>
  )
}
