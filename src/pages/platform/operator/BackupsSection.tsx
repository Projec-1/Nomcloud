import { useMemo, useState } from 'react'
import { ArrowClockwise as RefreshCw, Check, HardDrives, ShieldCheck, Warning } from '@phosphor-icons/react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import {
  ActionDialog,
  ActionLogPanel,
  Callout,
  DataTable,
  DetailModal,
  ExportButton,
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
import {
  backupJobs,
  backupRuns,
  recoveryChecklist,
  recoveryObjectives,
  restoreTests,
  type BackupJob,
} from './prototypeData'
import { timeAgo } from '@/utils/format'

export default function BackupsSection({ onNotify, operator }: { onNotify: (message: string) => void; operator: string }) {
  const [jobs, setJobs] = useState<BackupJob[]>(backupJobs)
  const [runs, setRuns] = useState(backupRuns)
  const [tests, setTests] = useState(restoreTests)
  const [checklist, setChecklist] = useState(recoveryChecklist)
  const [jobId, setJobId] = useState<string | null>(null)
  const [scheduleFor, setScheduleFor] = useState<BackupJob | null>(null)
  const [request, setRequest] = useState<ActionRequest | null>(null)
  const [verified, setVerified] = useState<Array<{ label: string; value: string; ok?: boolean }> | null>(null)
  const { entries, record } = useActionLog(operator)

  const selectedJob = useMemo(() => jobs.find((job) => job.id === jobId) ?? null, [jobs, jobId])
  const unverified = jobs.filter((job) => !job.restoreTestId || tests.find((test) => test.id === job.restoreTestId)?.result !== 'Passed')
  const failedRuns = runs.filter((run) => run.status === 'Failed')
  const lastSuccess = runs.filter((run) => run.status === 'Succeeded').sort((a, b) => new Date(b.finishedAt ?? b.startedAt).getTime() - new Date(a.finishedAt ?? a.startedAt).getTime())[0]
  const passingTests = tests.filter((test) => test.result === 'Passed')

  const runBackup = (job: BackupJob) => {
    setRequest({
      title: 'Run this backup now',
      target: `${job.type} · ${job.schedule}`,
      description: 'Starts an extra backup outside the schedule. The schedule continues unchanged, and the run is recorded with its size and checksum.',
      confirmLabel: 'Run backup',
      requiresReason: true,
      reasonLabel: 'Why is an extra backup needed?',
      onConfirm: ({ reason }) => {
        const now = new Date().toISOString()
        setRuns((current) => [{ id: `RUN-${Math.floor(8850 + Math.random() * 90)}`, jobId: job.id, startedAt: now, finishedAt: now, status: 'Succeeded', sizeGb: job.sizeGb, note: 'On-demand run' }, ...current])
        setJobs((current) => current.map((item) => item.id === job.id ? { ...item, lastRunAt: now, lastStatus: 'Succeeded' } : item))
        record({ action: 'Ran an extra backup', target: `${job.type} backup`, reason, before: `Last run ${timeAgo(job.lastRunAt)}`, after: 'Run just now', result: 'Applied' })
        setVerified([
          { label: 'Backup type', value: job.type },
          { label: 'Run', value: stamp(now) },
          { label: 'Result', value: 'Succeeded' },
          { label: 'Verified by a restore test', value: job.restoreTestId ? 'Yes, an earlier test passed' : 'No restore test has passed for this backup', ok: Boolean(job.restoreTestId) },
        ])
        onNotify(`${job.type} backup completed.`)
      },
    })
  }

  const startRestoreTest = (job: BackupJob) => {
    setRequest({
      title: 'Start a restore test',
      target: `${job.type} · last run ${timeAgo(job.lastRunAt)}`,
      description: 'The backup is restored into an isolated project and checked. A backup is not proven reliable until this has been done and recorded.',
      confirmLabel: 'Start restore test',
      requiresReason: true,
      requiresApproval: true,
      reasonLabel: 'What will this test prove?',
      options: [{ key: 'checklist', label: 'Walk through the recovery checklist during the test', defaultChecked: true }],
      onConfirm: ({ reason, approver, options }) => {
        const id = `RT-${Math.floor(45 + Math.random() * 40)}`
        setTests((current) => [{ id, jobId: job.id, at: new Date().toISOString(), operator, target: 'Staging project', result: 'Not run', durationMin: 0, recordsChecked: 0, notes: `Started: ${reason}` }, ...current])
        record({
          action: 'Started a restore test',
          target: `${id} · ${job.type} backup`,
          reason,
          approver: approver || undefined,
          before: job.restoreTestId ? 'Previous test passed' : 'Never tested',
          after: 'Test running',
          result: 'Queued',
          options: options.checklist ? ['Recovery checklist walked through'] : [],
        })
        setVerified([
          { label: 'Test', value: `${id} started` },
          { label: 'Backup', value: `${job.type} · ${job.sizeGb} GB` },
          { label: 'Target', value: 'Isolated staging project' },
          { label: 'Proven reliable yet', value: 'No — the outcome has to be recorded', ok: false },
        ])
        setJobId(null)
        onNotify(`${id} started for the ${job.type.toLowerCase()} backup.`)
      },
    })
  }

  const recordOutcome = (testId: string, jobType: string, jobForUpdate: string, result: 'Passed' | 'Failed') => {
    setRequest({
      title: `Record the restore test as ${result.toLowerCase()}`,
      target: `${testId} · ${jobType} backup`,
      description: 'The outcome decides whether this backup counts as verified. A failed test stays visible and blocks a claim that recovery is ready.',
      confirmLabel: `Mark ${result.toLowerCase()}`,
      danger: result === 'Failed',
      requiresReason: true,
      reasonLabel: 'What did the restore show?',
      onConfirm: ({ reason }) => {
        const minutes = result === 'Passed' ? 35 + Math.round(Math.random() * 15) : 10 + Math.round(Math.random() * 10)
        const records = result === 'Passed' ? 128_000 + Math.round(Math.random() * 4_000) : 0
        setTests((current) => current.map((test) => test.id === testId ? { ...test, result, durationMin: minutes, recordsChecked: records, notes: reason } : test))
        setJobs((current) => current.map((item) => item.id === jobForUpdate ? { ...item, restoreTestId: result === 'Passed' ? testId : item.restoreTestId } : item))
        record({
          action: `Recorded a restore test outcome: ${result.toLowerCase()}`,
          target: `${testId} · ${jobType} backup`,
          reason,
          before: 'Not run',
          after: result,
          result: result === 'Passed' ? 'Applied' : 'Failed',
        })
        setVerified([
          { label: 'Test', value: `${testId} · ${jobType} backup` },
          { label: 'Outcome', value: result },
          { label: 'Duration', value: `${minutes} minutes` },
          { label: 'Records checked', value: records.toLocaleString() },
          { label: 'Backup counts as verified', value: result === 'Passed' ? 'Yes' : 'No — the next run needs a passing test', ok: result === 'Passed' },
        ])
        onNotify(`${testId} recorded as ${result.toLowerCase()}.`)
      },
    })
  }

  const saveSchedule = (job: BackupJob, schedule: string, retentionDays: number, reason: string) => {
    setJobs((current) => current.map((item) => item.id === job.id ? { ...item, schedule, retentionDays } : item))
    record({
      action: 'Changed a backup schedule',
      target: `${job.type} backup`,
      reason,
      before: `${job.schedule} · ${job.retentionDays} days retained`,
      after: `${schedule} · ${retentionDays} days retained`,
      result: 'Applied',
    })
    setVerified([
      { label: 'Backup', value: job.type },
      { label: 'Schedule', value: `${job.schedule} → ${schedule}` },
      { label: 'Retention', value: `${job.retentionDays} → ${retentionDays} days` },
      { label: 'Oldest recovery point after the change', value: `Anything within ${retentionDays} days` },
    ])
    setScheduleFor(null)
    onNotify(`${job.type} schedule updated.`)
  }

  const updateChecklist = (id: string, status: 'Ready' | 'Needs work', step: string) => {
    setChecklist((current) => current.map((item) => item.id === id ? { ...item, status } : item))
    record({
      action: status === 'Ready' ? 'Marked a recovery step as ready' : 'Marked a recovery step as needing work',
      target: step,
      reason: 'Recovery readiness reviewed against the current procedure.',
      before: status === 'Ready' ? 'Needs work' : 'Ready',
      after: status,
      result: 'Applied',
    })
  }

  const exportRecovery = () => {
    downloadCsv('platform-backups.csv', [
      ['Backup', 'Schedule', 'Retention (days)', 'Last run', 'Last status', 'Size (GB)', 'Location', 'Restore test'],
      ...jobs.map((job) => [job.type, job.schedule, job.retentionDays, job.lastRunAt, job.lastStatus, job.sizeGb, job.location, job.restoreTestId ?? 'Never tested']),
      [],
      ['Run', 'Backup', 'Started', 'Finished', 'Status', 'Size (GB)', 'Note'],
      ...runs.map((run) => [run.id, run.jobId, run.startedAt, run.finishedAt ?? '', run.status, run.sizeGb, run.note]),
      [],
      ['Restore test', 'Backup', 'Date', 'Operator', 'Target', 'Result', 'Duration (minutes)', 'Records checked', 'Notes'],
      ...tests.map((test) => [test.id, test.jobId, test.at, test.operator, test.target, test.result, test.durationMin, test.recordsChecked, test.notes]),
      [],
      ['Recovery objective', 'Value'],
      ['RPO', `${recoveryObjectives.rpoMinutes} minutes`],
      ['RTO', `${recoveryObjectives.rtoMinutes} minutes`],
      ['Retention', `${recoveryObjectives.retentionDays} days`],
      ['Offsite copy', recoveryObjectives.offsite],
    ])
    onNotify('Backup and recovery report exported.')
  }

  const jobColumns: Array<Column<BackupJob>> = [
    { key: 'type', label: 'Backup', width: 'minmax(0,1.1fr)', render: (job) => <span><span className="block font-semibold">{job.type}</span><span className="block text-xs text-graphite">{job.schedule} · {job.location}</span></span> },
    { key: 'last', label: 'Last run', render: (job) => <span className="text-xs text-graphite">{timeAgo(job.lastRunAt)}<span className="block">{job.sizeGb} GB</span></span> },
    { key: 'status', label: 'Result', render: (job) => <Pill label={job.lastStatus} /> },
    { key: 'retention', label: 'Retention', render: (job) => <span className="text-sm">{job.retentionDays} days</span> },
    {
      key: 'verified',
      label: 'Proven by a restore test',
      width: 'minmax(0,1.2fr)',
      render: (job) => {
        const test = tests.find((item) => item.id === job.restoreTestId)
        return test?.result === 'Passed'
          ? <span className="text-xs text-graphite"><Pill label="Verified" /><span className="mt-1 block">{test.id} passed {relativeDays(test.at)}</span></span>
          : <span className="text-xs text-graphite"><Pill label={test ? test.result : 'Never tested'} /><span className="mt-1 block">Recovery is not proven for this backup</span></span>
      },
    },
  ]

  const runColumns: Array<Column<typeof backupRuns[number]>> = [
    { key: 'run', label: 'Run', width: 'minmax(0,1fr)', render: (run) => <span><span className="block font-semibold">{run.id}</span><span className="block text-xs text-graphite">{jobs.find((job) => job.id === run.jobId)?.type ?? run.jobId}</span></span> },
    { key: 'started', label: 'Started', render: (run) => <span className="text-xs text-graphite">{stamp(run.startedAt)}</span> },
    { key: 'status', label: 'Status', render: (run) => <Pill label={run.status} /> },
    { key: 'size', label: 'Size', render: (run) => <span className="text-sm">{run.sizeGb} GB</span> },
    { key: 'note', label: 'Note', width: 'minmax(0,1.4fr)', render: (run) => <span className="text-xs text-graphite">{run.note}</span> },
  ]

  return (
    <>
      <SectionHeader
        eyebrow="Business continuity"
        title="Backups & recovery"
        description="What is backed up, what has been proven restorable, and what happens in the first hour of an incident."
        action={<ExportButton onClick={exportRecovery} label="Export report" />}
      />
      <PrototypeNotice
        scope="Backups & recovery"
        detail="Nom Cloud does not record backups, restore tests or recovery objectives anywhere, and no backup service is connected. Every run, size and test below is sample data — but the rule the screen enforces is real: a backup is not proven reliable until a restore has been tested and recorded."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Last successful backup" value={lastSuccess ? timeAgo(lastSuccess.finishedAt ?? lastSuccess.startedAt) : 'None recorded'} detail={lastSuccess ? `${lastSuccess.sizeGb} GB · ${lastSuccess.note}` : 'No successful run'} icon={HardDrives} tone={lastSuccess ? 'success' : 'danger'} />
        <KpiTile label="Backups not proven restorable" value={unverified.length.toString()} detail={unverified.map((job) => job.type).join(', ') || 'Every backup has a passing restore test'} icon={Warning} tone={unverified.length ? 'warning' : 'success'} />
        <KpiTile label="Failed runs" value={failedRuns.length.toString()} detail={failedRuns[0]?.note ?? 'No failed run recorded'} icon={RefreshCw} tone={failedRuns.length ? 'danger' : 'success'} />
        <KpiTile label="Recovery objectives" value={`${recoveryObjectives.rpoMinutes} min RPO`} detail={`${recoveryObjectives.rtoMinutes} minutes to restore · ${recoveryObjectives.retentionDays} days retained`} icon={ShieldCheck} />
      </div>

      <div className="mt-6">
        <Callout tone={passingTests.length ? 'success' : 'danger'} title={passingTests.length ? `${passingTests.length} restore test${passingTests.length === 1 ? '' : 's'} have passed` : 'No restore test has ever passed'}>
          A backup that has never been restored is an assumption, not a recovery plan. Every backup above is marked with whether a restore test has proven it, and
          the recovery checklist says which steps are still unfinished. {recoveryObjectives.offsite === 'Not configured' ? 'No copy is kept outside the primary region.' : `An offsite copy is kept: ${recoveryObjectives.offsite}.`}
        </Callout>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Panel title="Backup jobs" description="Open a job to run a backup, start a restore test or change its schedule." action={<SampleTag />}>
          <DataTable columns={jobColumns} rows={jobs} rowKey={(job) => job.id} onRow={(job) => setJobId(job.id)} />
        </Panel>

        <Panel title="Restore tests" description="The only evidence that recovery works." action={<SampleTag />}>
          <ul className="space-y-3">
            {tests.map((test) => (
              <li key={test.id} className="border-b border-ink/[0.06] pb-3 text-sm last:border-0 last:pb-0 dark:border-white/[0.08]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 font-semibold">{test.id} · {jobs.find((job) => job.id === test.jobId)?.type ?? test.jobId}</span>
                  <Pill label={test.result} />
                </div>
                <p className="mt-1 text-xs text-graphite">{test.operator} · {relativeDays(test.at)} · {test.durationMin} minutes · {test.recordsChecked.toLocaleString()} records checked</p>
                <p className="mt-1 text-xs text-graphite">{test.notes}</p>
                {test.result === 'Not run' && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button onClick={() => recordOutcome(test.id, jobs.find((job) => job.id === test.jobId)?.type ?? test.jobId, test.jobId, 'Passed')} className="rounded-xl border border-ink/10 px-3 py-2 text-xs font-semibold dark:border-white/10">Mark passed</button>
                    <button onClick={() => recordOutcome(test.id, jobs.find((job) => job.id === test.jobId)?.type ?? test.jobId, test.jobId, 'Failed')} className="rounded-xl border border-red-500/20 px-3 py-2 text-xs font-semibold text-red-600 dark:text-red-300">Mark failed</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Panel title="Recent runs" description="Every run keeps its size, status and any note explaining a failure." action={<SampleTag />}>
          <DataTable columns={runColumns} rows={runs} rowKey={(run) => run.id} />
        </Panel>

        <div className="space-y-6">
          <Panel title="Recovery objectives" description="What recovery has to achieve, and whether it has been reviewed." action={<SampleTag />}>
            <MetaList
              items={[
                ['Recovery point objective', `${recoveryObjectives.rpoMinutes} minutes — the most work that can be lost`],
                ['Recovery time objective', `${recoveryObjectives.rtoMinutes} minutes — the longest acceptable outage`],
                ['Retention', `${recoveryObjectives.retentionDays} days of recovery points`],
                ['Offsite copy', recoveryObjectives.offsite],
                ['Last reviewed', `${relativeDays(recoveryObjectives.lastReviewedAt)} by ${recoveryObjectives.owner}`],
              ]}
            />
          </Panel>

          <Panel title="Recovery checklist" description="What the first hour of an incident looks like." action={<SampleTag />}>
            <ul className="space-y-2">
              {checklist.map((item, index) => (
                <li key={item.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-ink/[0.035] p-3 text-sm dark:bg-white/[0.05]">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{index + 1}. {item.step}</span>
                    <span className="block text-xs text-graphite">{item.owner}</span>
                  </span>
                  <Pill label={item.status} />
                  <button onClick={() => updateChecklist(item.id, item.status === 'Ready' ? 'Needs work' : 'Ready', item.step)} className="text-xs font-semibold text-brand">
                    {item.status === 'Ready' ? 'Needs work' : 'Mark ready'}
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <ActionLogPanel entries={entries} description="Backup runs, restore tests and checklist changes from this session. This is also the authorisation record: who agreed to a recovery." />
        {verified
          ? <VerificationPanel title="Result of the last action" checks={verified} note="In a real incident the target project would also confirm the restored row counts before the application is re-pointed." />
          : <Panel title="Verify the result" description="Every backup action reports what changed."><p className="text-sm text-graphite">Run a backup, start a restore test or change a schedule to see the confirmation here.</p></Panel>}
      </div>

      <DetailModal
        open={Boolean(selectedJob)}
        onClose={() => setJobId(null)}
        title={`${selectedJob?.type ?? ''} backup`}
        description={selectedJob ? `${selectedJob.schedule} · ${selectedJob.location} · ${selectedJob.retentionDays} days retained` : ''}
        summary={selectedJob && (
          <Callout
            tone={selectedJob.lastStatus === 'Succeeded' ? 'success' : 'danger'}
            title={`Last run ${timeAgo(selectedJob.lastRunAt)} · ${selectedJob.lastStatus}`}
          >
            {selectedJob.restoreTestId && tests.find((test) => test.id === selectedJob.restoreTestId)?.result === 'Passed'
              ? 'This backup has been restored and checked, so recovery for it is proven.'
              : 'No passing restore test is recorded for this backup, so it is not yet proven that it can be restored.'}
          </Callout>
        )}
        meta={selectedJob ? [
          ['Schedule', selectedJob.schedule],
          ['Retention', `${selectedJob.retentionDays} days`],
          ['Location', selectedJob.location],
          ['Size of the last run', `${selectedJob.sizeGb} GB`],
          ['Last run', `${stamp(selectedJob.lastRunAt)} · ${timeAgo(selectedJob.lastRunAt)}`],
          ['Restore test', selectedJob.restoreTestId ?? 'Never tested'],
        ] : []}
        footer={selectedJob && (
          <>
            <Button variant="outline" size="sm" onClick={() => runBackup(selectedJob)}><RefreshCw className="h-4 w-4" /> Run backup now</Button>
            <Button variant="outline" size="sm" onClick={() => { setScheduleFor(selectedJob); setJobId(null) }}>Change schedule</Button>
            <Button variant="accent" size="sm" onClick={() => startRestoreTest(selectedJob)}><ShieldCheck className="h-4 w-4" /> Start restore test</Button>
          </>
        )}
        size="lg"
      >
        {selectedJob && (
          <>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-graphite">Recent runs of this backup</p>
              <ul className="space-y-2">
                {runs.filter((run) => run.jobId === selectedJob.id).map((run) => (
                  <li key={run.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-ink/[0.035] p-3 text-sm dark:bg-white/[0.05]">
                    <Pill label={run.status} />
                    <span className="min-w-0 flex-1 text-xs text-graphite">{run.id} · {run.sizeGb} GB · {run.note}</span>
                    <span className="text-xs text-graphite">{timeAgo(run.startedAt)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <MetaList
              columns={1}
              items={[
                ['Why a restore test matters', 'A run that reports success can still be unrestorable: locks, missing files or a rotated credential only appear when the restore is attempted.'],
                ['What a restore test does', `The recovery point is restored into an isolated project, row counts are compared, and a sample of financial records is checked. It needs a second operator because a restore can be risky in itself.`],
                ['What is missing', 'No backup provider is connected and nothing records a run, so this screen cannot prove anything about the real data.'],
              ]}
            />
            {selectedJob.lastStatus === 'Failed' && (
              <Callout tone="danger" title="The last run failed">
                {runs.find((run) => run.jobId === selectedJob.id && run.status === 'Failed')?.note ?? 'No note was recorded for the failure.'}
              </Callout>
            )}
          </>
        )}
      </DetailModal>

      <ScheduleModal job={scheduleFor} onClose={() => setScheduleFor(null)} onSave={saveSchedule} />

      <ActionDialog request={request} onClose={() => setRequest(null)} actor={operator} />

      <p className="mt-6 flex items-center gap-2 text-xs text-graphite">
        <Check className="h-3.5 w-3.5" /> Recovery history keeps who approved each restore, when it ran and how long it took.
      </p>
    </>
  )
}

function ScheduleModal({ job, onClose, onSave }: { job: BackupJob | null; onClose: () => void; onSave: (job: BackupJob, schedule: string, retentionDays: number, reason: string) => void }) {
  const [schedule, setSchedule] = useState(job?.schedule ?? '')
  const [retention, setRetention] = useState(String(job?.retentionDays ?? 35))
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (!job) return null

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={`Change the ${job.type.toLowerCase()} schedule`}
      description="Longer retention keeps more recovery points, and costs more storage."
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant="accent" onClick={() => {
        if (Number(retention) < 7) { setError('Keep at least seven days of recovery points.'); return }
        if (reason.trim().length < 8) { setError('Write a short reason (8 characters).'); return }
        onSave(job, schedule, Number(retention), reason.trim())
      }}>Save schedule</Button></>}
    >
      <div className="space-y-4">
        <label className="block">
          <span className="label">Schedule</span>
          <select value={schedule} onChange={(event) => setSchedule(event.target.value)} className="input py-2">
            {['Daily at 02:00', 'Daily at 04:00', 'Every 12 hours', 'Every 6 hours', 'Weekly on Sunday'].map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="label">Retention (days)</span>
          <input type="number" min="7" max="365" value={retention} onChange={(event) => setRetention(event.target.value)} className="input" />
          <span className="mt-1 block text-xs text-graphite">Currently {job.retentionDays} days. Recovery objectives assume {recoveryObjectives.retentionDays} days.</span>
        </label>
        <label className="block">
          <span className="label">Reason (recorded in the action log)</span>
          <textarea value={reason} onChange={(event) => { setReason(event.target.value); setError(null) }} rows={3} className="input resize-none" placeholder="Reporting needs a longer window than a week." />
        </label>
        {error && <p role="alert" className="text-sm font-semibold text-red-600 dark:text-red-300">{error}</p>}
      </div>
    </Modal>
  )
}
