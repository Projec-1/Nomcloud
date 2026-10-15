import { useMemo, useState } from 'react'
import { ArrowClockwise as RefreshCw, Bell, Check, Clock, Heartbeat, PlugsConnected, Pulse as ActivityIcon, Warning } from '@phosphor-icons/react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Switch from '@/components/ui/Switch'
import { cn } from '@/utils/cn'
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
  Sparkline,
  VerificationPanel,
  downloadCsv,
  stamp,
  useActionLog,
  type ActionRequest,
  type Column,
} from './PrototypeKit'
import {
  alertThresholds,
  backgroundJobs,
  healthHistory,
  healthIncidents,
  healthServices,
  monitoringSources,
  type AlertThreshold,
  type BackgroundJob,
  type HealthIncident,
  type HealthService,
  type MonitoringSource,
} from './prototypeData'
import { timeAgo } from '@/utils/format'

const incidentStages = ['Investigating', 'Identified', 'Monitoring', 'Resolved'] as const

export default function HealthSection({ onNotify, onNavigate, operator }: { onNotify: (message: string) => void; onNavigate?: (path: string) => void; operator: string }) {
  const [sources, setSources] = useState<MonitoringSource[]>(monitoringSources)
  const [services, setServices] = useState<HealthService[]>(healthServices)
  const [incidents, setIncidents] = useState<HealthIncident[]>(healthIncidents)
  const [jobs, setJobs] = useState<BackgroundJob[]>(backgroundJobs)
  const [thresholds, setThresholds] = useState<AlertThreshold[]>(alertThresholds)
  const [connectOpen, setConnectOpen] = useState(false)
  const [serviceId, setServiceId] = useState<string | null>(null)
  const [incidentId, setIncidentId] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [request, setRequest] = useState<ActionRequest | null>(null)
  const [verified, setVerified] = useState<Array<{ label: string; value: string; ok?: boolean }> | null>(null)
  const { entries, record } = useActionLog(operator)

  const connected = sources.filter((source) => source.status === 'Connected')
  const monitoringConnected = connected.length > 0
  const failing = services.filter((service) => service.status !== 'Operational')
  const openIncidents = incidents.filter((incident) => incident.status !== 'Resolved')
  const failedJobs = jobs.filter((job) => job.status === 'Failed')

  const selectedService = useMemo(() => services.find((service) => service.id === serviceId) ?? null, [services, serviceId])
  const selectedIncident = useMemo(() => incidents.find((incident) => incident.id === incidentId) ?? null, [incidents, incidentId])
  const selectedJob = useMemo(() => jobs.find((job) => job.id === jobId) ?? null, [jobs, jobId])

  const connectSource = (source: MonitoringSource) => {
    setSources((current) => current.map((item) => item.id === source.id ? { ...item, status: 'Connected' } : item))
    record({
      action: 'Connected monitoring source',
      target: `${source.name} (${source.kind})`,
      reason: 'Health signals for this area had no source at all.',
      before: 'Not connected',
      after: 'Connected',
      result: 'Queued',
    })
    setConnectOpen(false)
    setVerified([
      { label: 'Monitoring source', value: `${source.name} · ${source.kind}` },
      { label: 'Status', value: 'Connected' },
      { label: 'Values on this screen', value: 'Still sample data until the provider reports', ok: false },
    ])
    onNotify(`${source.name} marked as connected. Values stay sample data until a provider reports.`)
  }

  const checkService = (service: HealthService) => {
    setRequest({
      title: 'Run a health check',
      target: `${service.name} · ${service.category}`,
      description: 'Asks the monitoring source for a fresh reading of availability, response time and error rate.',
      confirmLabel: 'Run check',
      requiresReason: true,
      reasonLabel: 'Reason for the manual check',
      onConfirm: ({ reason }) => {
        const now = new Date().toISOString()
        setServices((current) => current.map((item) => item.id === service.id ? { ...item, lastCheckedAt: now } : item))
        record({
          action: 'Ran a manual health check',
          target: service.name,
          reason,
          before: `Last checked ${timeAgo(service.lastCheckedAt)}`,
          after: 'Checked just now',
          result: monitoringConnected ? 'Completed' : 'Queued',
        })
        setVerified([
          { label: 'Service', value: service.name },
          { label: 'Last checked', value: stamp(now) },
          { label: 'Reading returned', value: monitoringConnected ? `${service.availability}% availability` : 'No source connected — sample value kept', ok: monitoringConnected },
        ])
        onNotify(`Health check recorded for ${service.name}.`)
      },
    })
  }

  const postUpdate = (incident: HealthIncident) => {
    setRequest({
      title: 'Post an incident update',
      target: `${incident.id} · ${incident.title}`,
      description: 'The note becomes part of the incident history and is visible to every operator.',
      confirmLabel: 'Post update',
      requiresReason: true,
      reasonLabel: 'What changed?',
      onConfirm: ({ reason }) => {
        setIncidents((current) => current.map((item) => item.id === incident.id
          ? { ...item, updates: [...item.updates, { at: new Date().toISOString(), note: reason, by: operator }] }
          : item))
        record({ action: 'Posted an incident update', target: `${incident.id} · ${incident.title}`, reason, result: 'Applied' })
        setVerified([
          { label: 'Incident', value: incident.id },
          { label: 'Updates on record', value: `${incident.updates.length + 1}` },
          { label: 'Last update', value: `${reason.slice(0, 60)}${reason.length > 60 ? '…' : ''}` },
        ])
        onNotify(`Update posted to ${incident.id}.`)
      },
    })
  }

  const advanceIncident = (incident: HealthIncident) => {
    const index = incidentStages.indexOf(incident.status)
    const next = incidentStages[Math.min(index + 1, incidentStages.length - 1)]
    setRequest({
      title: next === 'Resolved' ? 'Resolve this incident' : `Move incident to ${next.toLowerCase()}`,
      target: `${incident.id} · ${incident.title}`,
      description: next === 'Resolved'
        ? 'Resolving closes the incident, records the recovery time and notifies the operators who were paged.'
        : 'The incident moves to the next response stage and the change is recorded against your name.',
      confirmLabel: next === 'Resolved' ? 'Resolve incident' : `Move to ${next}`,
      danger: next === 'Resolved',
      requiresReason: true,
      requiresApproval: next === 'Resolved' && incident.severity === 'Critical',
      reasonLabel: next === 'Resolved' ? 'What fixed it, and how was it confirmed?' : 'What changed?',
      onConfirm: ({ reason, approver }) => {
        const resolvedAt = next === 'Resolved' ? new Date().toISOString() : null
        setIncidents((current) => current.map((item) => item.id === incident.id
          ? {
            ...item,
            status: next,
            resolvedAt,
            updates: [...item.updates, { at: new Date().toISOString(), note: `${next === 'Resolved' ? 'Resolved' : `Moved to ${next}`}: ${reason}`, by: operator }],
          }
          : item))
        record({
          action: next === 'Resolved' ? 'Resolved incident' : `Moved incident to ${next}`,
          target: `${incident.id} · ${incident.title}`,
          reason,
          approver: approver || undefined,
          before: incident.status,
          after: next,
          result: 'Applied',
        })
        setVerified([
          { label: 'Incident', value: `${incident.id} · ${incident.title}` },
          { label: 'Stage', value: `${incident.status} → ${next}` },
          { label: 'Recovery time', value: resolvedAt ? `${Math.round((new Date(resolvedAt).getTime() - new Date(incident.startedAt).getTime()) / 3600000)} hours` : 'Still open' },
          { label: 'Affected services', value: incident.services.join(', ') },
        ])
        onNotify(`${incident.id} moved to ${next.toLowerCase()}.`)
      },
    })
  }

  const retryJob = (job: BackgroundJob) => {
    setRequest({
      title: 'Retry a background job',
      target: `${job.name} · ${job.id}`,
      description: 'The failed run is retried once, with its original arguments. The new attempt is recorded.',
      confirmLabel: 'Retry job',
      requiresReason: true,
      onConfirm: ({ reason }) => {
        const now = new Date().toISOString()
        setJobs((current) => current.map((item) => item.id === job.id
          ? { ...item, status: 'Succeeded', lastRunAt: now, attempts: item.attempts + 1, lastError: null, durationMs: Math.max(600, Math.round(item.durationMs * 0.8)) }
          : item))
        record({
          action: 'Retried a failed background job',
          target: `${job.name} · ${job.id}`,
          reason,
          before: `Failed · attempt ${job.attempts}`,
          after: `Succeeded · attempt ${job.attempts + 1}`,
          result: 'Applied',
        })
        setVerified([
          { label: 'Job', value: job.name },
          { label: 'Attempts', value: `${job.attempts} → ${job.attempts + 1}` },
          { label: 'Last run', value: stamp(now) },
          { label: 'Error cleared', value: job.lastError ?? 'None' },
        ])
        onNotify(`${job.name} retried successfully.`)
      },
    })
  }

  const toggleThreshold = (threshold: AlertThreshold) => {
    const enabled = !threshold.enabled
    setThresholds((current) => current.map((item) => item.id === threshold.id ? { ...item, enabled } : item))
    record({
      action: enabled ? 'Enabled an alert threshold' : 'Disabled an alert threshold',
      target: `${threshold.metric} ${threshold.comparison} ${threshold.value}${threshold.unit}`,
      reason: 'Threshold owner reviewed the alert volume for this metric.',
      before: threshold.enabled ? 'Enabled' : 'Disabled',
      after: enabled ? 'Enabled' : 'Disabled',
      result: 'Applied',
    })
  }

  const exportHealth = () => {
    downloadCsv('platform-health.csv', [
      ['Service', 'Category', 'Status', 'Availability %', 'p95 (ms)', 'Error rate %', 'Monitored', 'Last checked'],
      ...services.map((service) => [service.name, service.category, service.status, service.availability, service.p95Ms, service.errorRate, monitoringConnected ? 'Yes' : 'No source', service.lastCheckedAt]),
      [],
      ['Incident', 'Severity', 'Status', 'Services', 'Started', 'Resolved', 'Owner'],
      ...incidents.map((incident) => [incident.id, incident.severity, incident.status, incident.services.join(' / '), incident.startedAt, incident.resolvedAt ?? '', incident.owner]),
    ])
    onNotify('Health snapshot exported.')
  }

  const serviceColumns: Array<Column<HealthService>> = [
    {
      key: 'name',
      label: 'Service',
      width: 'minmax(0,1.5fr)',
      render: (service) => (
        <span className="flex items-center gap-3">
          <span className={cn('h-2 w-2 shrink-0 rounded-full', service.status === 'Operational' ? 'bg-emerald-500' : service.status === 'Degraded' ? 'bg-amber-500' : 'bg-red-500')} />
          <span className="min-w-0">
            <span className="block font-semibold">{service.name}</span>
            <span className="block text-xs text-graphite">{service.category}</span>
          </span>
        </span>
      ),
    },
    { key: 'status', label: 'Status', render: (service) => <Pill label={service.status} /> },
    { key: 'availability', label: 'Availability', render: (service) => <span>{service.availability}%</span> },
    { key: 'p95', label: 'p95 response', render: (service) => <span>{service.p95Ms.toLocaleString()} ms</span> },
    { key: 'errors', label: 'Error rate', render: (service) => <span className={cn(service.errorRate > 2 && 'font-semibold text-red-600 dark:text-red-300')}>{service.errorRate}%</span> },
    { key: 'checked', label: 'Last checked', render: (service) => <span className="text-xs text-graphite">{timeAgo(service.lastCheckedAt)}</span> },
  ]

  const jobColumns: Array<Column<BackgroundJob>> = [
    { key: 'name', label: 'Job', width: 'minmax(0,1.4fr)', render: (job) => <span><span className="block font-semibold">{job.name}</span><span className="block text-xs text-graphite">{job.schedule}</span></span> },
    { key: 'status', label: 'Last result', render: (job) => <Pill label={job.status} /> },
    { key: 'last', label: 'Last run', render: (job) => <span className="text-xs text-graphite">{timeAgo(job.lastRunAt)}</span> },
    { key: 'attempts', label: 'Attempts', render: (job) => <span>{job.attempts}</span> },
    { key: 'error', label: 'Last error', width: 'minmax(0,1.4fr)', render: (job) => <span className="text-xs text-graphite">{job.lastError ?? 'None'}</span> },
  ]

  return (
    <>
      <SectionHeader
        eyebrow="Technical monitoring"
        title="System health"
        description="Availability, response times, incidents and the alerting that decides when an operator is woken up."
        action={<ExportButton onClick={exportHealth} label="Export snapshot" />}
      />

      {!monitoringConnected ? (
        <Callout tone="warning" title="No monitoring source is connected — nothing here is a live measurement">
          <p>
            Nom Cloud does not collect or store service health. The values below are sample data, and they stay labelled as sample data until at least one
            monitoring source is connected and reporting. Connect a source to start the workflow, and treat every figure as illustrative until a provider
            actually answers.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Button variant="accent" size="sm" onClick={() => setConnectOpen(true)}><PlugsConnected className="h-4 w-4" /> Connect a monitoring source</Button>
            {onNavigate && <Button variant="outline" size="sm" onClick={() => onNavigate('/platform/integrations')}>Review integrations</Button>}
          </div>
        </Callout>
      ) : (
        <Callout tone="info" title={`${connected.length} monitoring source${connected.length === 1 ? '' : 's'} connected — figures are still sample data`}>
          Connecting a source records the intent and the configuration. Until a provider returns real readings, every value on this screen remains sample data,
          and each number is marked as such.
        </Callout>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Services needing attention" value={failing.length.toString()} detail={failing.map((service) => service.name).join(', ') || 'All services operational'} icon={Heartbeat} tone={failing.length ? 'danger' : 'success'} />
        <KpiTile label="Open incidents" value={openIncidents.length.toString()} detail={openIncidents.map((incident) => incident.id).join(', ') || 'No open incident'} icon={Warning} tone={openIncidents.length ? 'warning' : 'success'} />
        <KpiTile label="Failed background jobs" value={failedJobs.length.toString()} detail={failedJobs.map((job) => job.name).join(', ') || 'Every job succeeded'} icon={RefreshCw} tone={failedJobs.length ? 'danger' : 'success'} />
        <KpiTile label="Alert thresholds" value={`${thresholds.filter((threshold) => threshold.enabled).length} of ${thresholds.length} on`} detail="Thresholds decide when an operator is paged" icon={Bell} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Panel
          title="Service status"
          description={monitoringConnected ? 'Sample readings from the connected source configuration.' : 'Sample readings. No source is connected, so nothing here is measured.'}
          action={<SampleTag />}
        >
          <DataTable columns={serviceColumns} rows={services} rowKey={(service) => service.id} onRow={(service) => setServiceId(service.id)} />
        </Panel>

        <div className="space-y-6">
          <Panel title="Uptime and error rate" description="Fourteen days of sample history with the alert threshold marked." action={<SampleTag />}>
            <p className="text-sm text-graphite">Availability (%) — threshold 99.9%</p>
            <Sparkline points={healthHistory.availability.map((value) => value - 98.5)} />
            <p className="mt-3 text-sm text-graphite">Error rate (%) — threshold 2%</p>
            <Sparkline points={healthHistory.errorRate} />
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-graphite">
              {healthHistory.labels.filter((_, index) => index % 4 === 0).map((label) => <span key={label}>{label}</span>)}
            </div>
          </Panel>

          <Panel title="Monitoring sources" description="What has to be connected before this screen shows anything real.">
            <ul className="space-y-3">
              {sources.map((source) => (
                <li key={source.id} className="flex flex-wrap items-center gap-3 border-b border-ink/[0.06] pb-3 text-sm last:border-0 last:pb-0 dark:border-white/[0.08]">
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{source.name}</span>
                    <span className="block text-xs text-graphite">{source.kind} · {source.detail}</span>
                  </span>
                  <Pill label={source.status} />
                  {source.status === 'Not connected' && <button onClick={() => connectSource(source)} className="text-xs font-semibold text-brand">Connect</button>}
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <Panel
          title="Incidents and recovery progress"
          description="Open an incident to see its history, post an update or move it forward."
          action={<SampleTag />}
        >
          <ul className="space-y-4">
            {incidents.map((incident) => {
              const stageIndex = incidentStages.indexOf(incident.status)
              return (
                <li key={incident.id}>
                  <button onClick={() => setIncidentId(incident.id)} className="w-full rounded-2xl border border-ink/[0.08] p-4 text-left hover:bg-ink/[0.02] dark:border-white/[0.08] dark:hover:bg-white/[0.03]">
                    <span className="flex flex-wrap items-center gap-3">
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{incident.title}</span>
                        <span className="mt-1 block text-xs text-graphite">{incident.id} · started {timeAgo(incident.startedAt)} · owner {incident.owner}</span>
                      </span>
                      <Pill label={incident.severity} />
                      <Pill label={incident.status} />
                    </span>
                    <span className="mt-4 flex items-center gap-1.5">
                      {incidentStages.map((stage, index) => (
                        <span key={stage} className="flex flex-1 flex-col gap-1.5">
                          <span className={cn('h-1.5 rounded-full', index <= stageIndex ? 'bg-brand' : 'bg-ink/[0.1] dark:bg-white/[0.12]')} />
                          <span className={cn('text-[10px] font-semibold uppercase tracking-wider', index <= stageIndex ? 'text-brand' : 'text-graphite')}>{stage}</span>
                        </span>
                      ))}
                    </span>
                    <span className="mt-3 block text-xs text-graphite">{incident.impact}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </Panel>

        <div className="space-y-6">
          <Panel title="Background jobs" description="Failed jobs can be retried here; each retry is recorded." action={<SampleTag />}>
            <DataTable columns={jobColumns} rows={jobs} rowKey={(job) => job.id} onRow={(job) => setJobId(job.id)} emptyLabel="No background jobs are registered." />
          </Panel>

          <Panel title="Alert thresholds" description="A threshold decides when someone is told, and how." action={<SampleTag />}>
            <ul className="space-y-2">
              {thresholds.map((threshold) => (
                <li key={threshold.id} className="rounded-xl bg-ink/[0.035] p-3 dark:bg-white/[0.05]">
                  <Switch
                    checked={threshold.enabled}
                    onChange={() => toggleThreshold(threshold)}
                    label={`${threshold.metric} ${threshold.comparison} ${threshold.value}${threshold.unit}`}
                    description={`Notifies: ${threshold.channel}`}
                  />
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-graphite">Thresholds are sample values. Nothing is being watched until a monitoring source reports.</p>
          </Panel>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <ActionLogPanel entries={entries} description="Health checks, incident updates, job retries and threshold changes from this session." />
        {verified ? (
          <VerificationPanel title="Result of the last action" checks={verified} note="Verification reads this screen back. With no monitoring source connected, provider-side confirmation is not possible yet." />
        ) : (
          <Panel title="Verify the result" description="Every action on this screen reports what changed.">
            <p className="text-sm text-graphite">Run a health check, move an incident or retry a job to see the confirmation here.</p>
          </Panel>
        )}
      </div>

      <Modal
        open={connectOpen}
        onClose={() => setConnectOpen(false)}
        title="Connect a monitoring source"
        description="Choose what should feed this screen. Each source covers a different part of the platform."
        size="lg"
        footer={<Button variant="outline" onClick={() => setConnectOpen(false)}>Close</Button>}
      >
        <ul className="space-y-3">
          {sources.map((source) => (
            <li key={source.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-ink/[0.08] p-4 dark:border-white/[0.08]">
              <span className="rounded-xl bg-brand/10 p-2.5 text-brand"><ActivityIcon className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{source.name}</span>
                <span className="block text-xs text-graphite">{source.kind} · {source.detail}</span>
              </span>
              {source.status === 'Connected'
                ? <Pill label="Connected" />
                : <Button variant="accent" size="sm" onClick={() => connectSource(source)}>Connect</Button>}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-graphite">
          Connecting records the configuration and the operator who did it. A real connection needs credentials for the provider, which live in Supabase
          configuration — see Integrations.
        </p>
      </Modal>

      <DetailModal
        open={Boolean(selectedService)}
        onClose={() => setServiceId(null)}
        title={selectedService?.name ?? ''}
        description={selectedService ? `${selectedService.category} · sample reading` : ''}
        summary={selectedService && (
          <Callout tone={selectedService.status === 'Operational' ? 'success' : selectedService.status === 'Degraded' ? 'warning' : 'danger'} title={`Status: ${selectedService.status}`}>
            {monitoringConnected
              ? 'This reading comes from the sample configuration. A connected provider will replace it with a measured value.'
              : 'No monitoring source is connected, so this reading is sample data rather than a measurement.'}
          </Callout>
        )}
        meta={selectedService ? [
          ['Availability', `${selectedService.availability}%`],
          ['p95 response', `${selectedService.p95Ms.toLocaleString()} ms`],
          ['Error rate', `${selectedService.errorRate}%`],
          ['Requests per minute', selectedService.requestsPerMin.toLocaleString()],
          ['Last checked', `${stamp(selectedService.lastCheckedAt)} · ${timeAgo(selectedService.lastCheckedAt)}`],
          ['Monitored', monitoringConnected ? 'Source connected' : 'No source connected'],
        ] : []}
        footer={selectedService && (
          <>
            <Button variant="outline" size="sm" onClick={() => selectedService && checkService(selectedService)}><RefreshCw className="h-4 w-4" /> Run a health check</Button>
            {onNavigate && <Button variant="ghost" size="sm" onClick={() => onNavigate('/platform/activity')}>Related activity</Button>}
          </>
        )}
        size="lg"
      >
        {selectedService && (
          <>
            <div>
              <p className="text-sm text-graphite">Fourteen-day error rate for this service</p>
              <Sparkline points={healthHistory.errorRate.map((value) => value + (selectedService.errorRate - 1))} />
            </div>
            <MetaList
              columns={1}
              items={[
                ['Incidents touching this service', incidents.filter((incident) => incident.services.includes(selectedService.name)).map((incident) => incident.id).join(', ') || 'None recorded'],
                ['What a real check needs', `A ${selectedService.category.toLowerCase()} probe with credentials the platform can read. Credentials are not stored in the application database.`],
              ]}
            />
          </>
        )}
      </DetailModal>

      <DetailModal
        open={Boolean(selectedIncident)}
        onClose={() => setIncidentId(null)}
        title={selectedIncident?.title ?? ''}
        description={selectedIncident ? `${selectedIncident.id} · ${selectedIncident.severity} severity · owner ${selectedIncident.owner}` : ''}
        summary={selectedIncident && (
          <Callout tone={selectedIncident.status === 'Resolved' ? 'success' : 'warning'} title={`Recovery progress: ${selectedIncident.status}`}>
            {selectedIncident.impact}
          </Callout>
        )}
        meta={selectedIncident ? [
          ['Started', `${stamp(selectedIncident.startedAt)} · ${timeAgo(selectedIncident.startedAt)}`],
          ['Resolved', selectedIncident.resolvedAt ? `${stamp(selectedIncident.resolvedAt)} · took ${Math.round((new Date(selectedIncident.resolvedAt).getTime() - new Date(selectedIncident.startedAt).getTime()) / 3600000)} hours` : 'Still open'],
          ['Affected services', selectedIncident.services.join(', ')],
          ['Updates posted', selectedIncident.updates.length.toString()],
        ] : []}
        footer={selectedIncident && (
          <>
            <Button variant="outline" size="sm" onClick={() => selectedIncident && postUpdate(selectedIncident)}><Clock className="h-4 w-4" /> Post update</Button>
            {selectedIncident.status !== 'Resolved' && (
              <Button variant="accent" size="sm" onClick={() => selectedIncident && advanceIncident(selectedIncident)}>
                <Check className="h-4 w-4" /> {incidentStages[incidentStages.indexOf(selectedIncident.status) + 1] === 'Resolved' ? 'Resolve incident' : 'Advance stage'}
              </Button>
            )}
          </>
        )}
        size="lg"
      >
        {selectedIncident && <TimelineSafe incident={selectedIncident} />}
      </DetailModal>

      <DetailModal
        open={Boolean(selectedJob)}
        onClose={() => setJobId(null)}
        title={selectedJob?.name ?? ''}
        description={selectedJob ? `${selectedJob.id} · ${selectedJob.schedule}` : ''}
        summary={selectedJob && (
          <Callout tone={selectedJob.status === 'Failed' ? 'danger' : 'success'} title={`Last result: ${selectedJob.status}`}>
            {selectedJob.lastError ?? 'The last run completed without an error.'}
          </Callout>
        )}
        meta={selectedJob ? [
          ['Last run', `${stamp(selectedJob.lastRunAt)} · ${timeAgo(selectedJob.lastRunAt)}`],
          ['Duration', `${(selectedJob.durationMs / 1000).toFixed(1)} s`],
          ['Attempts', selectedJob.attempts.toString()],
          ['Next run', 'Per the schedule above'],
        ] : []}
        footer={selectedJob && (
          <>
            <Button variant="outline" size="sm" onClick={() => onNotify('Job arguments are not stored yet, so this preview stops here.')}>Inspect arguments</Button>
            {selectedJob.status === 'Failed' && <Button variant="accent" size="sm" onClick={() => selectedJob && retryJob(selectedJob)}><RefreshCw className="h-4 w-4" /> Retry job</Button>}
          </>
        )}
        size="md"
      >
        <MetaList
          columns={1}
          items={[
            ['Why retrying is safe', 'The job is written to be repeatable: a retry re-reads the records it needs rather than continuing from the failed run.'],
            ['What the backend needs', 'A job table with run history and a queue the operator can trigger. Neither exists yet.'],
          ]}
        />
      </DetailModal>

      <ActionDialog request={request} onClose={() => setRequest(null)} actor={operator} />

      <p className="mt-6 text-xs text-graphite">
        Recovery progress, incident history and threshold changes are recorded per incident. A real response procedure would also page the on-call operator and
        notify the schools that are affected.
      </p>
    </>
  )
}

function TimelineSafe({ incident }: { incident: HealthIncident }) {
  return (
    <ol className="space-y-4">
      {[...incident.updates].reverse().map((update, index) => (
        <li key={`${update.at}-${index}`} className="relative flex gap-3 pl-1">
          <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-brand ring-4 ring-brand/10" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-graphite">{stamp(update.at)} · {update.by}</p>
            <p className="mt-1 text-sm leading-6">{update.note}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}
