import { useMemo, useState } from 'react'
import { ArrowClockwise as RefreshCw, CalendarPlus, Check, Clock, Cube, Power, Warning, Wrench } from '@phosphor-icons/react'
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
  backgroundJobs,
  deployments,
  maintenanceMode,
  maintenanceWindows,
  sampleSchools,
  type BackgroundJob,
  type Deployment,
  type MaintenanceWindow,
} from './prototypeData'
import { timeAgo } from '@/utils/format'

const stageOrder = ['Awaiting approval', 'Staged', 'Rolled out'] as const

export default function MaintenanceSection({ onNotify, operator }: { onNotify: (message: string) => void; operator: string }) {
  const [windows, setWindows] = useState<MaintenanceWindow[]>(maintenanceWindows)
  const [releases, setReleases] = useState<Deployment[]>(deployments)
  const [jobs, setJobs] = useState<BackgroundJob[]>(backgroundJobs)
  const [modeOn, setModeOn] = useState(maintenanceMode.enabled)
  const [modeMessage, setModeMessage] = useState(maintenanceMode.message)
  const [windowId, setWindowId] = useState<string | null>(null)
  const [releaseId, setReleaseId] = useState<string | null>(null)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [request, setRequest] = useState<ActionRequest | null>(null)
  const [verified, setVerified] = useState<Array<{ label: string; value: string; ok?: boolean }> | null>(null)
  const { entries, record } = useActionLog(operator)

  const pendingReleases = releases.filter((release) => release.stage === 'Awaiting approval' || release.stage === 'Staged')
  const scheduledWindows = windows.filter((window) => window.status === 'Scheduled')
  const failedJobs = jobs.filter((job) => job.status === 'Failed')

  const selectedWindow = useMemo(() => windows.find((window) => window.id === windowId) ?? null, [windows, windowId])
  const selectedRelease = useMemo(() => releases.find((release) => release.id === releaseId) ?? null, [releases, releaseId])

  const toggleMode = (enable: boolean) => {
    setRequest({
      title: enable ? 'Enable maintenance mode' : 'Disable maintenance mode',
      target: enable ? 'All schools' : 'Current maintenance mode',
      description: enable
        ? 'Schools see a maintenance notice instead of the workspace. Sign-in stays available so operators can work.'
        : 'The maintenance notice is removed and every school returns to normal.',
      confirmLabel: enable ? 'Enable maintenance mode' : 'Disable maintenance mode',
      danger: enable,
      requiresReason: true,
      requiresApproval: enable,
      options: enable ? [{ key: 'notify', label: 'Email every school administrator about the maintenance window', defaultChecked: true }] : [],
      onConfirm: ({ reason, approver, options }) => {
        setModeOn(enable)
        record({
          action: enable ? 'Enabled maintenance mode' : 'Disabled maintenance mode',
          target: 'Platform-wide',
          reason,
          approver: approver || undefined,
          before: enable ? 'Off' : 'On',
          after: enable ? 'On' : 'Off',
          result: 'Applied',
          options: options.notify ? ['All schools notified'] : [],
        })
        setVerified([
          { label: 'Maintenance mode', value: enable ? 'On' : 'Off' },
          { label: 'Notice shown to schools', value: enable ? modeMessage : 'No notice shown' },
          { label: 'Schools notified', value: options.notify ? `${sampleSchools.length} schools in the sample directory` : 'Nobody notified' },
          { label: 'Sign-in availability', value: 'Still available to operators' },
        ])
        onNotify(enable ? 'Maintenance mode enabled.' : 'Maintenance mode disabled.')
      },
    })
  }

  const advanceRelease = (release: Deployment) => {
    const index = stageOrder.indexOf(release.stage as (typeof stageOrder)[number])
    const next = stageOrder[Math.min(index + 1, stageOrder.length - 1)]
    setRequest({
      title: next === 'Rolled out' ? 'Release to every school' : `Move release to ${next.toLowerCase()}`,
      target: `${release.id} · ${release.version}`,
      description: next === 'Rolled out'
        ? 'The release goes to every school. A rollout that breaks can still be rolled back to the previous version.'
        : 'The release advances one stage. Each stage keeps the previous version available for rollback.',
      confirmLabel: next === 'Rolled out' ? 'Release to all schools' : `Move to ${next}`,
      requiresReason: true,
      requiresApproval: next === 'Rolled out',
      options: next === 'Rolled out' ? [{ key: 'staged', label: 'Roll out to 10% of schools first, then continue automatically' }] : [],
      onConfirm: ({ reason, approver, options }) => {
        setReleases((current) => current.map((item) => item.id === release.id
          ? { ...item, stage: next, checks: item.checks.map((check) => check.status === 'Pending' ? { ...check, status: 'Passed' } : check) }
          : item))
        record({
          action: next === 'Rolled out' ? 'Released a version to all schools' : `Moved a release to ${next}`,
          target: `${release.id} · ${release.version}`,
          reason,
          approver: approver || undefined,
          before: release.stage,
          after: next,
          result: 'Applied',
          options: options.staged ? ['Staged rollout: 10% first'] : [],
        })
        setVerified([
          { label: 'Release', value: `${release.version} (${release.id})` },
          { label: 'Stage', value: `${release.stage} → ${next}` },
          { label: 'Checks cleared', value: release.checks.every((check) => check.status !== 'Failed') ? 'All checks passed' : 'A check failed earlier' },
          { label: 'Rollback available', value: 'Previous version kept until the next release' },
        ])
        onNotify(`${release.version} moved to ${next.toLowerCase()}.`)
      },
    })
  }

  const rollBack = (release: Deployment) => {
    setRequest({
      title: 'Roll back this release',
      target: `${release.id} · ${release.version}`,
      description: 'Every school returns to the previous version. The reason is recorded and the release is marked so it is not re-released by accident.',
      confirmLabel: 'Roll back',
      danger: true,
      requiresReason: true,
      requiresApproval: true,
      reasonLabel: 'What is going wrong, and what will be done instead?',
      options: [{ key: 'notify', label: 'Notify affected schools about the rollback' }],
      onConfirm: ({ reason, approver, options }) => {
        setReleases((current) => current.map((item) => item.id === release.id ? { ...item, stage: 'Rolled back' } : item))
        record({
          action: 'Rolled back a release',
          target: `${release.id} · ${release.version}`,
          reason,
          approver: approver || undefined,
          before: release.stage,
          after: 'Rolled back',
          result: 'Applied',
          options: options.notify ? ['Affected schools notified'] : [],
        })
        setVerified([
          { label: 'Release', value: release.version },
          { label: 'Stage', value: 'Rolled back' },
          { label: 'Schools on the previous version', value: 'All schools after the rollback completes' },
          { label: 'Follow-up', value: 'The release needs a fix before it can be offered again' },
        ])
        onNotify(`${release.version} rolled back.`)
      },
    })
  }

  const runJob = (job: BackgroundJob) => {
    setRequest({
      title: job.status === 'Failed' ? 'Retry a failed job' : 'Run a job now',
      target: `${job.name} · ${job.id}`,
      description: 'Jobs are written to be repeatable, so running one early is safe. The run is recorded against your name.',
      confirmLabel: job.status === 'Failed' ? 'Retry job' : 'Run now',
      requiresReason: true,
      onConfirm: ({ reason }) => {
        const now = new Date().toISOString()
        setJobs((current) => current.map((item) => item.id === job.id
          ? { ...item, status: 'Succeeded', lastRunAt: now, attempts: item.attempts + 1, lastError: null }
          : item))
        record({
          action: job.status === 'Failed' ? 'Retried a failed background job' : 'Ran a background job early',
          target: `${job.name} · ${job.id}`,
          reason,
          before: job.status,
          after: 'Succeeded',
          result: 'Applied',
        })
        setVerified([
          { label: 'Job', value: job.name },
          { label: 'Last run', value: stamp(now) },
          { label: 'Previous error', value: job.lastError ?? 'None' },
          { label: 'Next scheduled run', value: job.schedule },
        ])
        onNotify(`${job.name} completed.`)
      },
    })
  }

  const exportPlan = () => {
    downloadCsv('maintenance-plan.csv', [
      ['Window', 'Title', 'Scope', 'Starts', 'Ends', 'Status', 'Schools notified', 'Owner'],
      ...windows.map((window) => [window.id, window.title, window.scope, window.startsAt, window.endsAt, window.status, window.notifySchools ? 'Yes' : 'No', window.owner]),
      [],
      ['Release', 'Version', 'Stage', 'Summary', 'Scheduled for', 'Owner'],
      ...releases.map((release) => [release.id, release.version, release.stage, release.summary, release.scheduledFor, release.owner]),
    ])
    onNotify('Maintenance plan exported.')
  }

  const releaseColumns: Array<Column<Deployment>> = [
    { key: 'version', label: 'Release', width: 'minmax(0,1.1fr)', render: (release) => <span><span className="block font-semibold">{release.version}</span><span className="block text-xs text-graphite">{release.id} · {release.owner}</span></span> },
    { key: 'stage', label: 'Stage', render: (release) => <Pill label={release.stage} /> },
    { key: 'summary', label: 'What changes', width: 'minmax(0,1.6fr)', render: (release) => <span className="text-xs text-graphite">{release.summary}</span> },
    { key: 'when', label: 'Planned', render: (release) => <span className="text-xs text-graphite">{relativeDays(release.scheduledFor)}</span> },
    { key: 'checks', label: 'Checks', render: (release) => <span className="flex flex-wrap gap-1.5">{release.checks.map((check) => <Pill key={check.name} label={check.status} />)}</span> },
  ]

  const jobColumns: Array<Column<BackgroundJob>> = [
    { key: 'name', label: 'Job', width: 'minmax(0,1.3fr)', render: (job) => <span><span className="block font-semibold">{job.name}</span><span className="block text-xs text-graphite">{job.schedule}</span></span> },
    { key: 'status', label: 'Last result', render: (job) => <Pill label={job.status} /> },
    { key: 'last', label: 'Last run', render: (job) => <span className="text-xs text-graphite">{timeAgo(job.lastRunAt)}</span> },
    { key: 'error', label: 'Last error', width: 'minmax(0,1.2fr)', render: (job) => <span className="text-xs text-graphite">{job.lastError ?? 'None'}</span> },
  ]

  return (
    <>
      <SectionHeader
        eyebrow="Change control"
        title="Maintenance & releases"
        description="Plan maintenance, control the maintenance notice, review pending releases and recover from a bad rollout."
        action={<ExportButton onClick={exportPlan} label="Export plan" />}
      />
      <PrototypeNotice
        scope="Maintenance"
        detail="There is no maintenance-window, deployment or job table yet, and no queue an operator can trigger. Every change here behaves exactly as it will once those exist, and is recorded in the action log, but nothing leaves this screen."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Maintenance mode" value={modeOn ? 'On' : 'Off'} detail={modeOn ? 'Schools see the maintenance notice' : 'Every school works normally'} icon={Power} tone={modeOn ? 'warning' : 'success'} />
        <KpiTile label="Scheduled windows" value={scheduledWindows.length.toString()} detail={scheduledWindows[0] ? `Next: ${scheduledWindows[0].title}, ${relativeDays(scheduledWindows[0].startsAt)}` : 'Nothing scheduled'} icon={CalendarPlus} />
        <KpiTile label="Releases awaiting action" value={pendingReleases.length.toString()} detail={pendingReleases.map((release) => release.version).join(', ') || 'Nothing pending'} icon={Cube} />
        <KpiTile label="Failed jobs" value={failedJobs.length.toString()} detail={failedJobs.map((job) => job.name).join(', ') || 'Every job succeeded'} icon={Warning} tone={failedJobs.length ? 'danger' : 'success'} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1.3fr]">
        <Panel title="Maintenance mode" description="A platform-wide notice, with the option to email every school." action={<SampleTag />}>
          <Callout tone={modeOn ? 'warning' : 'success'} title={modeOn ? 'Maintenance mode is on' : 'Maintenance mode is off'}>
            {modeOn ? modeMessage : 'Schools are working normally. Turning this on shows a maintenance notice instead of the workspace.'}
          </Callout>
          <label className="mt-4 block">
            <span className="label">Notice shown to schools</span>
            <textarea value={modeMessage} onChange={(event) => setModeMessage(event.target.value)} rows={3} className="input resize-none" />
          </label>
          <div className="mt-4 flex flex-wrap gap-3">
            {modeOn
              ? <Button variant="accent" size="sm" onClick={() => toggleMode(false)}><Power className="h-4 w-4" /> Disable maintenance mode</Button>
              : <Button variant="danger" size="sm" onClick={() => toggleMode(true)}><Power className="h-4 w-4" /> Enable maintenance mode</Button>}
            <Button variant="outline" size="sm" onClick={() => setScheduleOpen(true)}><CalendarPlus className="h-4 w-4" /> Schedule a window</Button>
          </div>
          <p className="mt-3 text-xs text-graphite">
            Last changed {timeAgo(maintenanceMode.changedAt)} by {maintenanceMode.changedBy}. Enabling it needs a reason and a second operator.
          </p>
        </Panel>

        <Panel title="Maintenance windows" description="Open a window to see its scope, changes and who owns it." action={<SampleTag />}>
          <ul className="space-y-3">
            {windows.map((window) => (
              <li key={window.id}>
                <button onClick={() => setWindowId(window.id)} className="w-full rounded-2xl border border-ink/[0.08] p-4 text-left hover:bg-ink/[0.02] dark:border-white/[0.08] dark:hover:bg-white/[0.03]">
                  <span className="flex flex-wrap items-center gap-3">
                    <span className="rounded-xl bg-brand/10 p-2 text-brand"><Wrench className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{window.title}</span>
                      <span className="block text-xs text-graphite">{window.id} · {window.scope} · owner {window.owner}</span>
                    </span>
                    <Pill label={window.status} />
                    <Pill label={window.notifySchools ? 'Schools notified' : 'No notice'} tone={window.notifySchools ? 'success' : 'neutral'} />
                  </span>
                  <span className="mt-3 block text-xs text-graphite">
                    {stamp(window.startsAt)} → {new Date(window.endsAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · {relativeDays(window.startsAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Panel title="Releases and rollouts" description="Approve, stage, release or roll back. Every stage keeps the previous version available." action={<SampleTag />}>
          <DataTable columns={releaseColumns} rows={releases} rowKey={(release) => release.id} onRow={(release) => setReleaseId(release.id)} />
        </Panel>

        <Panel title="Background jobs" description="Run a job early or retry one that failed." action={<SampleTag />}>
          <DataTable columns={jobColumns} rows={jobs} rowKey={(job) => job.id} renderActions={(job) => (
            job.status === 'Failed'
              ? <button onClick={() => runJob(job)} className="rounded-xl border border-ink/10 px-3 py-2 text-xs font-semibold dark:border-white/10"><RefreshCw className="mr-1.5 inline h-3.5 w-3.5" />Retry</button>
              : <button onClick={() => runJob(job)} className="rounded-xl border border-ink/10 px-3 py-2 text-xs font-semibold dark:border-white/10">Run now</button>
          )} />
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <ActionLogPanel entries={entries} description="Maintenance mode changes, releases, rollbacks and job runs from this session." />
        {verified ? (
          <VerificationPanel title="Result of the last action" checks={verified} note="Verification reads this screen back. A real rollout would also confirm the deployed version per school." />
        ) : (
          <Panel title="Verify the result" description="Every change on this screen reports what changed.">
            <p className="text-sm text-graphite">Enable maintenance mode, move a release or run a job to see the confirmation here.</p>
          </Panel>
        )}
      </div>

      <ScheduleWindowModal
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        onSchedule={(window) => {
          setWindows((current) => [window, ...current])
          record({
            action: 'Scheduled a maintenance window',
            target: `${window.id} · ${window.title}`,
            reason: 'Planned change window created from the maintenance screen.',
            before: 'Not scheduled',
            after: `Scheduled for ${stamp(window.startsAt)}`,
            result: 'Applied',
            options: window.notifySchools ? ['Affected schools notified'] : [],
          })
          setVerified([
            { label: 'Window', value: `${window.id} · ${window.title}` },
            { label: 'Scope', value: window.scope },
            { label: 'Starts', value: stamp(window.startsAt) },
            { label: 'Schools notified', value: window.notifySchools ? 'Yes — notice queued to the affected schools' : 'No notice sent' },
          ])
          setScheduleOpen(false)
          onNotify(`${window.title} scheduled.`)
        }}
      />

      <DetailModal
        open={Boolean(selectedWindow)}
        onClose={() => setWindowId(null)}
        title={selectedWindow?.title ?? ''}
        description={selectedWindow ? `${selectedWindow.id} · ${selectedWindow.scope}` : ''}
        summary={selectedWindow && (
          <Callout tone={selectedWindow.status === 'Completed' ? 'success' : selectedWindow.status === 'Cancelled' ? 'danger' : 'info'} title={`Status: ${selectedWindow.status}`}>
            {selectedWindow.notifySchools ? 'Affected schools were notified before this window.' : 'No school was notified for this window.'}
          </Callout>
        )}
        meta={selectedWindow ? [
          ['Starts', `${stamp(selectedWindow.startsAt)} · ${relativeDays(selectedWindow.startsAt)}`],
          ['Ends', stamp(selectedWindow.endsAt)],
          ['Owner', selectedWindow.owner],
          ['Scope', selectedWindow.scope],
          ['Notified', selectedWindow.notifySchools ? 'Yes' : 'No'],
        ] : []}
        footer={selectedWindow && selectedWindow.status === 'Scheduled' && (
          <>
            <Button variant="outline" size="sm" onClick={() => onNotify('Window notifications are re-queued through the communications screen once it is connected.')}>Notify schools again</Button>
            <Button variant="danger" size="sm" onClick={() => {
              setRequest({
                title: 'Cancel this maintenance window',
                target: `${selectedWindow.id} · ${selectedWindow.title}`,
                description: 'The window is cancelled and every school that was notified is told it will not happen.',
                confirmLabel: 'Cancel window',
                danger: true,
                requiresReason: true,
                onConfirm: ({ reason }) => {
                  setWindows((current) => current.map((item) => item.id === selectedWindow.id ? { ...item, status: 'Cancelled', notifySchools: false } : item))
                  record({ action: 'Cancelled a maintenance window', target: `${selectedWindow.id} · ${selectedWindow.title}`, reason, before: 'Scheduled', after: 'Cancelled', result: 'Applied' })
                  setVerified([
                    { label: 'Window', value: selectedWindow.title },
                    { label: 'Status', value: 'Cancelled' },
                    { label: 'Schools told', value: 'Cancellation notice queued to the schools that were notified' },
                  ])
                  setWindowId(null)
                  onNotify('Maintenance window cancelled.')
                },
              })
            }}>Cancel window</Button>
          </>
        )}
        size="md"
      >
        {selectedWindow && (
          <MetaList columns={1} items={selectedWindow.changes.map((change, index) => [`Change ${index + 1}`, change] as [string, string])} />
        )}
      </DetailModal>

      <DetailModal
        open={Boolean(selectedRelease)}
        onClose={() => setReleaseId(null)}
        title={selectedRelease?.version ?? ''}
        description={selectedRelease ? `${selectedRelease.id} · owner ${selectedRelease.owner}` : ''}
        summary={selectedRelease && (
          <Callout tone={selectedRelease.stage === 'Rolled back' ? 'danger' : selectedRelease.stage === 'Rolled out' ? 'success' : 'info'} title={`Stage: ${selectedRelease.stage}`}>
            {selectedRelease.summary}
          </Callout>
        )}
        meta={selectedRelease ? [
          ['Planned', `${stamp(selectedRelease.scheduledFor)} · ${relativeDays(selectedRelease.scheduledFor)}`],
          ['Checks', selectedRelease.checks.map((check) => `${check.name}: ${check.status}`).join(' · ')],
          ['Rollback of', selectedRelease.rollbackOf ?? 'Not a rollback'],
          ['Owner', selectedRelease.owner],
        ] : []}
        footer={selectedRelease && (
          <>
            {(selectedRelease.stage === 'Awaiting approval' || selectedRelease.stage === 'Staged') && (
              <Button variant="accent" size="sm" onClick={() => { setReleaseId(null); advanceRelease(selectedRelease) }}>
                <Check className="h-4 w-4" /> {stageOrder[stageOrder.indexOf(selectedRelease.stage as (typeof stageOrder)[number]) + 1] === 'Rolled out' ? 'Release to all schools' : 'Move to staged'}
              </Button>
            )}
            {selectedRelease.stage === 'Rolled out' && (
              <Button variant="danger" size="sm" onClick={() => { setReleaseId(null); rollBack(selectedRelease) }}><Warning className="h-4 w-4" /> Roll back</Button>
            )}
          </>
        )}
        size="lg"
      >
        <MetaList
          columns={1}
          items={[
            ['Staged rollout', 'A release can go to a small group of schools first and continue automatically when the error rate holds.'],
            ['Rollback', 'The previous version stays available until the next release, so a rollback is a pointer change rather than a redeploy.'],
            ['What is missing', 'There is no release table and no deployment pipeline this screen can read. Versions, stages and checks are sample data.'],
          ]}
        />
        {selectedRelease?.stage === 'Rolled back' && (
          <Callout tone="danger" title="This release was rolled back">
            It failed after release and needs a fix before it can be offered again. The rollback reason is kept in the action log.
          </Callout>
        )}
      </DetailModal>

      <ActionDialog request={request} onClose={() => setRequest(null)} actor={operator} />

      <p className="mt-6 flex items-center gap-2 text-xs text-graphite">
        <Clock className="h-3.5 w-3.5" /> Windows and releases on this screen are sample data. A real maintenance plan would be stored and published to schools from the communications screen.
      </p>
    </>
  )
}

function ScheduleWindowModal({ open, onClose, onSchedule }: { open: boolean; onClose: () => void; onSchedule: (window: MaintenanceWindow) => void }) {
  const [title, setTitle] = useState('')
  const [scope, setScope] = useState('All schools')
  const [startsAt, setStartsAt] = useState(() => new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 16))
  const [hours, setHours] = useState('2')
  const [notify, setNotify] = useState(true)
  const [change, setChange] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = () => {
    if (title.trim().length < 4) { setError('Give the window a short title.'); return }
    if (change.trim().length < 6) { setError('Describe at least one change this window makes.'); return }
    const start = new Date(startsAt)
    if (Number.isNaN(start.getTime())) { setError('Choose a valid start time.'); return }
    if (start.getTime() < Date.now()) { setError('The window has to start in the future.'); return }
    onSchedule({
      id: `MW-${Math.floor(100 + Math.random() * 900)}`,
      title: title.trim(),
      scope,
      startsAt: start.toISOString(),
      endsAt: new Date(start.getTime() + Number(hours) * 3_600_000).toISOString(),
      status: 'Scheduled',
      notifySchools: notify,
      owner: 'You',
      changes: [change.trim()],
    })
    setTitle('')
    setChange('')
    setError(null)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Schedule a maintenance window"
      description="Schools are told before the window starts if you keep the notification on."
      size="md"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant="accent" onClick={submit}>Schedule window</Button></>}
    >
      <div className="space-y-4">
        <label className="block"><span className="label">Title</span><input value={title} onChange={(event) => setTitle(event.target.value)} className="input" placeholder="Database upgrade" /></label>
        <label className="block">
          <span className="label">Scope</span>
          <select value={scope} onChange={(event) => setScope(event.target.value)} className="input py-2">
            {['All schools', 'Selected schools', 'One school', 'Internal only'].map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block"><span className="label">Starts</span><input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className="input" /></label>
          <label className="block"><span className="label">Duration (hours)</span><input type="number" min="1" max="12" value={hours} onChange={(event) => setHours(event.target.value)} className="input" /></label>
        </div>
        <label className="block"><span className="label">What changes during this window?</span><textarea value={change} onChange={(event) => setChange(event.target.value)} rows={3} className="input resize-none" placeholder="Swap the search index and rebuild it in place." /></label>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={notify} onChange={(event) => setNotify(event.target.checked)} className="h-4 w-4 rounded border-ink/20" />
          Email the affected school administrators before the window starts
        </label>
        {error && <p role="alert" className="text-sm font-semibold text-red-600 dark:text-red-300">{error}</p>}
        <p className="text-xs text-graphite">Scheduling reads {sampleSchools.length} sample schools for scope. Nothing is delivered until the communications backend exists.</p>
      </div>
    </Modal>
  )
}
