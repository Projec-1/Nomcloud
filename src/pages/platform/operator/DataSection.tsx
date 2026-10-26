import { useMemo, useState } from 'react'
import { Check, Database, DownloadSimple as Download, LockKey as LockKeyhole, Prohibit as Ban, UploadSimple as Upload, Warning } from '@phosphor-icons/react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import {
  ActionDialog,
  ActionLogPanel,
  Callout,
  DataTable,
  DetailModal,
  ExportButton,
  FilterChips,
  KpiTile,
  MetaList,
  Panel,
  Pill,
  PrototypeNotice,
  SampleTag,
  SectionHeader,
  VerificationPanel,
  downloadCsv,
  relativeDays,
  stamp,
  useActionLog,
  type ActionRequest,
  type Column,
} from './PrototypeKit'
import { dataJobs, sampleSchools } from './prototypeData'
import { timeAgo } from '@/utils/format'

type DataJob = typeof dataJobs[number]

const kindOptions = ['All', 'Export', 'Import', 'Deletion request', 'Access request'] as const
const statusOptions = ['All', 'Pending', 'Running', 'Completed', 'Rejected'] as const

const retentionPolicy: Array<{ id: string; data: string; window: string; note: string }> = [
  { id: 'ret-1', data: 'School applications', window: '24 months after the decision', note: 'Kept for audit and dispute handling' },
  { id: 'ret-2', data: 'Audit records', window: '730 days', note: 'Append-only until the retention job prunes them' },
  { id: 'ret-3', data: 'Exports', window: '7 days from creation', note: 'Links expire and the file is removed' },
  { id: 'ret-4', data: 'Imports', window: 'Permanent', note: 'The report of what was imported is kept' },
  { id: 'ret-5', data: 'Deletion requests', window: 'Permanent', note: 'A decision has to stay explainable' },
  { id: 'ret-6', data: 'School data after closure', window: '90 days', note: 'Then removed unless a legal hold applies' },
]

export default function DataSection({ onNotify, operator }: { onNotify: (message: string) => void; operator: string }) {
  const [jobs, setJobs] = useState<DataJob[]>([...dataJobs])
  const [kind, setKind] = useState<(typeof kindOptions)[number]>('All')
  const [status, setStatus] = useState<(typeof statusOptions)[number]>('All')
  const [jobId, setJobId] = useState<string | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [request, setRequest] = useState<ActionRequest | null>(null)
  const [verified, setVerified] = useState<Array<{ label: string; value: string; ok?: boolean }> | null>(null)
  const { entries, record } = useActionLog(operator)

  const visible = useMemo(() => jobs.filter((job) => {
    if (kind !== 'All' && job.kind !== kind) return false
    if (status !== 'All' && job.status !== status) return false
    return true
  }), [jobs, kind, status])

  const selected = useMemo(() => jobs.find((job) => job.id === jobId) ?? null, [jobs, jobId])
  const pendingRequests = jobs.filter((job) => job.status === 'Pending')
  const expiringExports = jobs.filter((job) => job.kind === 'Export' && job.expiresAt && new Date(job.expiresAt).getTime() - Date.now() < 3 * 86_400_000)
  const largeExports = jobs.filter((job) => job.kind === 'Export' && job.records > 10_000)

  const decideDeletion = (job: DataJob, approve: boolean) => {
    setRequest({
      title: approve ? 'Approve this deletion request' : 'Reject this deletion request',
      target: `${job.id} · ${job.scope}`,
      description: approve
        ? 'The records are scheduled for removal. Deletion is permanent, is checked against retention and legal holds first, and is recorded in the audit trail.'
        : 'The records are kept and the requester is told why. Nothing is removed.',
      confirmLabel: approve ? 'Approve deletion' : 'Reject request',
      danger: approve,
      requiresReason: true,
      requiresApproval: approve,
      reasonLabel: approve ? 'Why may these records be removed?' : 'Why is the request being declined?',
      options: [{ key: 'notify', label: 'Tell the requester the decision', defaultChecked: true }],
      onConfirm: ({ reason, approver, options }) => {
        setJobs((current) => current.map((item) => item.id === job.id
          ? { ...item, status: approve ? 'Completed' : 'Rejected', note: approve ? `Approved by ${operator}: ${reason}` : `Rejected by ${operator}: ${reason}` }
          : item))
        record({
          action: approve ? 'Approved a deletion request' : 'Rejected a deletion request',
          target: `${job.id} · ${job.scope}`,
          reason,
          approver: approver || undefined,
          before: 'Pending',
          after: approve ? 'Scheduled for deletion' : 'Rejected — records kept',
          result: approve ? 'Applied' : 'Rejected',
          options: options.notify ? ['Requester notified'] : [],
        })
        setVerified([
          { label: 'Request', value: `${job.id} · ${job.scope}` },
          { label: 'Decision', value: approve ? 'Approved' : 'Rejected' },
          { label: 'Records affected', value: job.records.toLocaleString() },
          { label: 'Retention check', value: approve ? 'No hold found within the retention window' : 'Not applicable', ok: true },
        ])
        setJobId(null)
        onNotify(approve ? `${job.id} approved for deletion.` : `${job.id} rejected; records kept.`)
      },
    })
  }

  const manageExportLink = (job: DataJob, action: 'extend' | 'revoke') => {
    setRequest({
      title: action === 'extend' ? 'Extend this export link' : 'Revoke this export link',
      target: `${job.id} · ${job.scope}`,
      description: action === 'extend'
        ? 'The download link is valid for another seven days. The file itself is unchanged.'
        : 'The link stops working immediately and the file is removed. Anyone who already downloaded it keeps their copy.',
      confirmLabel: action === 'extend' ? 'Extend by 7 days' : 'Revoke link',
      danger: action === 'revoke',
      requiresReason: true,
      requiresApproval: action === 'revoke',
      onConfirm: ({ reason, approver }) => {
        const expiresAt = action === 'extend' ? new Date(Date.now() + 7 * 86_400_000).toISOString() : null
        setJobs((current) => current.map((item) => item.id === job.id
          ? { ...item, expiresAt, note: action === 'extend' ? `${item.note} · link extended` : `${item.note} · link revoked: ${reason}` }
          : item))
        record({
          action: action === 'extend' ? 'Extended an export link' : 'Revoked an export link',
          target: `${job.id} · ${job.scope}`,
          reason,
          approver: approver || undefined,
          before: job.expiresAt ? `Expired ${relativeDays(job.expiresAt)}` : 'No expiry',
          after: action === 'extend' ? `Expires ${relativeDays(expiresAt ?? new Date().toISOString())}` : 'Revoked',
          result: 'Applied',
        })
        setVerified([
          { label: 'Export', value: `${job.id} · ${job.scope}` },
          { label: 'Records in the export', value: job.records.toLocaleString() },
          { label: 'Link', value: action === 'extend' ? 'Valid for seven more days' : 'Revoked' },
          { label: 'Copies already downloaded', value: action === 'revoke' ? 'Cannot be recalled' : 'Unaffected', ok: action === 'extend' },
        ])
        setJobId(null)
        onNotify(action === 'extend' ? 'Export link extended.' : 'Export link revoked.')
      },
    })
  }

  const createExport = (input: { scope: string; format: string; reason: string; options: Record<string, boolean>; approver: string }) => {
    const job: DataJob = {
      id: `DJ-${Math.floor(780 + Math.random() * 40)}`,
      kind: 'Export',
      scope: input.scope,
      requestedBy: operator,
      at: new Date().toISOString(),
      status: 'Running',
      records: input.options.includeStudents ? 18_420 : 104,
      expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      note: `${input.format} export requested: ${input.reason}`,
    }
    setJobs((current) => [job, ...current])
    record({
      action: 'Requested a data export',
      target: `${job.id} · ${input.scope}`,
      reason: input.reason,
      approver: input.approver || undefined,
      before: 'Not requested',
      after: `Running · ${input.format}`,
      result: 'Queued',
      options: input.options.includeStudents ? ['Includes student records'] : [],
    })
    setVerified([
      { label: 'Export', value: `${job.id} · ${input.scope}` },
      { label: 'Format', value: input.format },
      { label: 'Link expires', value: relativeDays(job.expiresAt ?? new Date().toISOString()) },
      { label: 'Approved by a second operator', value: input.approver || 'Not required for this scope', ok: Boolean(input.approver) || !input.options.includeStudents },
    ])
    setExportOpen(false)
    onNotify(`${job.id} queued.`)
  }

  const exportRecord = () => {
    downloadCsv('platform-data-requests.csv', [
      ['Job', 'Kind', 'Scope', 'Requested by', 'Time', 'Status', 'Records', 'Link expires', 'Note'],
      ...jobs.map((job) => [job.id, job.kind, job.scope, job.requestedBy, job.at, job.status, job.records, job.expiresAt ?? '', job.note]),
      [],
      ['Data', 'Retention window', 'Note'],
      ...retentionPolicy.map((rule) => [rule.data, rule.window, rule.note]),
    ])
    onNotify('Records center exported.')
  }

  const columns: Array<Column<DataJob>> = [
    { key: 'scope', label: 'Request', width: 'minmax(0,1.5fr)', render: (job) => <span><span className="block font-semibold">{job.scope}</span><span className="block text-xs text-graphite">{job.id} · {job.note}</span></span> },
    { key: 'kind', label: 'Kind', render: (job) => <Pill label={job.kind} tone="info" /> },
    { key: 'records', label: 'Records', render: (job) => <span className="text-sm">{job.records.toLocaleString()}</span> },
    { key: 'requested', label: 'Requested by', render: (job) => <span className="text-xs text-graphite">{job.requestedBy}<span className="block">{timeAgo(job.at)}</span></span> },
    { key: 'expires', label: 'Link expires', render: (job) => <span className="text-xs text-graphite">{job.expiresAt ? relativeDays(job.expiresAt) : 'No link'}</span> },
    { key: 'status', label: 'Status', render: (job) => <Pill label={job.status} /> },
  ]

  return (
    <>
      <SectionHeader
        eyebrow="Records center"
        title="Data"
        description="Exports, imports and every request to remove or read records, with the decision and the reason attached."
        action={<ExportButton onClick={exportRecord} label="Export register" />}
      />
      <PrototypeNotice
        scope="Data"
        detail="Exports, imports, retention and data requests are not recorded anywhere. Schools can already import and export their own spreadsheets from the Students, Teachers and Classes pages. Decisions taken here behave like the real approvals and are recorded, but nothing is exported or removed."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Requests awaiting a decision" value={pendingRequests.length.toString()} detail={pendingRequests.map((job) => job.id).join(', ') || 'Nothing is waiting'} icon={Warning} tone={pendingRequests.length ? 'warning' : 'success'} />
        <KpiTile label="Export links expiring soon" value={expiringExports.length.toString()} detail={expiringExports.map((job) => job.id).join(', ') || 'No link expires in the next three days'} icon={Download} />
        <KpiTile label="Large exports" value={largeExports.length.toString()} detail="Over 10,000 records — these are reviewed against the audit rules" icon={Database} tone={largeExports.length ? 'warning' : 'success'} />
        <KpiTile label="Deletion approvals" value="Founder only" detail="With a written reason and a second operator co-signing" icon={LockKeyhole} />
      </div>

      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterChips options={kindOptions} value={kind} onChange={setKind} label="Request kind" />
        <FilterChips options={statusOptions} value={status} onChange={setStatus} label="Status" />
        <Button variant="accent" size="sm" onClick={() => setExportOpen(true)}><Download className="h-4 w-4" /> Request an export</Button>
      </div>

      <div className="mt-5 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Panel title="Requests and jobs" description="Open a record to decide it or manage its link." action={<SampleTag />}>
          <DataTable columns={columns} rows={visible} rowKey={(job) => job.id} onRow={(job) => setJobId(job.id)} emptyLabel="No request matches these filters." />
        </Panel>

        <Panel title="Retention" description="How long each kind of record is kept, and why." action={<SampleTag />}>
          <ul className="space-y-3">
            {retentionPolicy.map((rule) => (
              <li key={rule.id} className="border-b border-ink/[0.06] pb-3 text-sm last:border-0 last:pb-0 dark:border-white/[0.08]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 font-semibold">{rule.data}</span>
                  <Pill label={rule.window} tone="neutral" />
                </div>
                <p className="mt-1 text-xs text-graphite">{rule.note}</p>
              </li>
            ))}
          </ul>
          <Callout tone="info" title="Retention is policy, not a setting">
            Windows change with a decision, not per request. A deletion request inside a retention window is declined, and the reason is recorded.
          </Callout>
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <ActionLogPanel entries={entries} description="Decisions and link changes from this session, with who approved them." />
        {verified
          ? <VerificationPanel title="Result of the last action" checks={verified} note="A real deletion would also be confirmed by the database and by the retention job's next run." />
          : <Panel title="Verify the result" description="Every decision reports what changed."><p className="text-sm text-graphite">Approve, reject or manage a link to see the confirmation here.</p></Panel>}
      </div>

      <DetailModal
        open={Boolean(selected)}
        onClose={() => setJobId(null)}
        title={selected?.scope ?? ''}
        description={selected ? `${selected.id} · ${selected.kind} · ${selected.status}` : ''}
        summary={selected && (
          <Callout tone={selected.status === 'Rejected' ? 'danger' : selected.status === 'Pending' ? 'warning' : 'success'} title={`${selected.kind}: ${selected.status}`}>
            {selected.note}
          </Callout>
        )}
        meta={selected ? [
          ['Requested by', selected.requestedBy],
          ['Requested', `${stamp(selected.at)} · ${timeAgo(selected.at)}`],
          ['Records', selected.records.toLocaleString()],
          ['Link expires', selected.expiresAt ? `${stamp(selected.expiresAt)} · ${relativeDays(selected.expiresAt)}` : 'No download link'],
          ['Status', <Pill key="status" label={selected.status} />],
        ] : []}
        footer={selected && (
          <>
            {selected.kind === 'Deletion request' && selected.status === 'Pending' && (
              <>
                <Button variant="accent" size="sm" onClick={() => decideDeletion(selected, true)}><Check className="h-4 w-4" /> Approve deletion</Button>
                <Button variant="outline" size="sm" onClick={() => decideDeletion(selected, false)}><Ban className="h-4 w-4" /> Reject</Button>
              </>
            )}
            {selected.kind === 'Export' && selected.status === 'Completed' && (
              <>
                <Button variant="outline" size="sm" onClick={() => manageExportLink(selected, 'extend')}>Extend link</Button>
                <Button variant="danger" size="sm" onClick={() => manageExportLink(selected, 'revoke')}>Revoke link</Button>
              </>
            )}
          </>
        )}
        size="lg"
      >
        {selected && (
          <MetaList
            columns={1}
            items={[
              ['Who can decide', selected.kind === 'Deletion request'
                ? 'Only the founder, with a written reason and a second operator co-signing.'
                : 'Any operator with the data capability for that area. Student data exports need a second operator.'],
              ['What happens after a decision', 'The decision, the reason and both operators are recorded. For a deletion the retention window and any legal hold are checked first.'],
              ['What is missing', 'There is no table for export jobs, retention or deletion requests, so nothing can be listed from a query yet.'],
            ]}
          />
        )}
      </DetailModal>

      <ExportRequestModal open={exportOpen} onClose={() => setExportOpen(false)} onRequest={createExport} />

      <ActionDialog request={request} onClose={() => setRequest(null)} actor={operator} />

      <p className="mt-6 flex items-center gap-2 text-xs text-graphite">
        <Upload className="h-3.5 w-3.5" /> School-level imports stay in the school workspace: a platform operator cannot import records into a school they are not a member of.
      </p>
    </>
  )
}

function ExportRequestModal({ open, onClose, onRequest }: {
  open: boolean
  onClose: () => void
  onRequest: (input: { scope: string; format: string; reason: string; options: Record<string, boolean>; approver: string }) => void
}) {
  const [scope, setScope] = useState(`School register · ${sampleSchools.length} schools`)
  const [format, setFormat] = useState('CSV')
  const [includeStudents, setIncludeStudents] = useState(false)
  const [reason, setReason] = useState('')
  const [approver, setApprover] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = () => {
    if (reason.trim().length < 8) { setError('Write a short reason (8 characters).'); return }
    if (includeStudents && !approver) { setError('Exporting student records needs a second operator.'); return }
    onRequest({ scope, format, reason: reason.trim(), options: { includeStudents }, approver })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="Request a data export"
      description="Exports are reviewed like any other access to records: who asked, what for, and who else agreed."
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant="accent" onClick={submit}>Queue export</Button></>}
    >
      <div className="space-y-4">
        <label className="block">
          <span className="label">What to export</span>
          <select value={scope} onChange={(event) => setScope(event.target.value)} className="input py-2">
            {[
              `School register · ${sampleSchools.length} schools`,
              'Billing history · all schools',
              'Audit records · current month',
              'Region report · Nairobi',
            ].map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="label">Format</span>
          <select value={format} onChange={(event) => setFormat(event.target.value)} className="input py-2">{['CSV', 'XLSX', 'PDF'].map((option) => <option key={option} value={option}>{option}</option>)}</select>
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" checked={includeStudents} onChange={(event) => setIncludeStudents(event.target.checked)} className="mt-1 h-4 w-4 rounded border-ink/20" />
          <span>
            <span className="block font-semibold">Include student records</span>
            <span className="block text-xs text-graphite">Student data needs a second operator, and the export is flagged to the audit rules.</span>
          </span>
        </label>
        {includeStudents && (
          <label className="block">
            <span className="label">Second operator</span>
            <select value={approver} onChange={(event) => setApprover(event.target.value)} className="input py-2">
              <option value="">Select an operator…</option>
              {['Leila Hassan', 'Amina Yusuf', 'Grace Wanjiru', 'Tom Bwire'].map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
        )}
        <label className="block">
          <span className="label">Reason (kept with the export)</span>
          <textarea value={reason} onChange={(event) => { setReason(event.target.value); setError(null) }} rows={3} className="input resize-none" placeholder="Regional review of school onboarding for the board pack." />
        </label>
        {error && <p role="alert" className="text-sm font-semibold text-red-600 dark:text-red-300">{error}</p>}
      </div>
    </Modal>
  )
}
