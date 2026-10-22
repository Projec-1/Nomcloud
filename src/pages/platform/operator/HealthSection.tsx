import { useEffect, useMemo, useState } from 'react'
import { Heartbeat, PlugsConnected, Warning } from '@phosphor-icons/react'
import Button from '@/components/ui/Button'
import {
  fetchPlatformHealthChecks,
  runPlatformHealthChecks,
  type PlatformHealthCheck,
} from '@/services/platformControlsService'
import { errorMessage } from '@/utils/errorMessage'
import { KpiTile, Panel, SectionHeader } from './PrototypeKit'

const serviceLabels = {
  database: 'Database connectivity',
  operator_tables: 'Operations tables',
} as const

const statusLabels: Record<PlatformHealthCheck['status'], string> = {
  healthy: 'Healthy',
  degraded: 'Degraded',
  unavailable: 'Unavailable',
  unknown: 'Unknown',
}

export default function HealthSection() {
  const [checks, setChecks] = useState<PlatformHealthCheck[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setChecks([])
    fetchPlatformHealthChecks()
      .then((rows) => { if (!cancelled) setChecks(rows) })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setChecks([])
          setError(errorMessage(cause, 'Health-check history could not be loaded.'))
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [reload])

  const latest = useMemo(() => {
    const byService = new Map<PlatformHealthCheck['service_name'], PlatformHealthCheck>()
    for (const check of checks) {
      if (!byService.has(check.service_name)) byService.set(check.service_name, check)
    }
    return [...byService.values()]
  }, [checks])

  const runChecks = async () => {
    if (running) return
    setRunning(true)
    setError(null)
    try {
      await runPlatformHealthChecks()
      setReload((value) => value + 1)
    } catch (cause) {
      setError(errorMessage(cause, 'Health checks could not be completed or recorded.'))
    } finally {
      setRunning(false)
    }
  }

  const healthValue = loading ? '…' : error ? 'Unavailable' : latest.length === 0 ? 'Not checked'
    : latest.length < 2 ? 'Partial'
      : latest.every((check) => check.status === 'healthy') ? 'Healthy'
      : latest.some((check) => check.status === 'unavailable') ? 'Unavailable' : 'Degraded'

  return <>
    <SectionHeader eyebrow="Reliability monitoring" title="System health" description="On-demand service probes and incident history. Automated probes are distinct from operator-authored incident records." action={<Button size="sm" onClick={() => void runChecks()} disabled={running}>{running ? 'Checking…' : 'Run health checks'}</Button>} />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiTile label="Service health" value={healthValue} detail={error ? 'Health history could not be loaded' : latest.length ? 'Latest on-demand probe' : 'No recorded probe'} icon={Heartbeat} tone={healthValue === 'Unavailable' || healthValue === 'Degraded' ? 'warning' : undefined} />
      <KpiTile label="Incident command" value="Manual + detected" detail="Automated incidents require repeated failures" icon={Warning} tone="warning" />
      <KpiTile label="Probe coverage" value={error ? 'Unavailable' : `${latest.length}/2`} detail="Database and operations tables" icon={Heartbeat} />
      <KpiTile label="Integrations" value="Not probed" detail="No provider health checks are configured" icon={PlugsConnected} tone="warning" />
    </div>

    {error && <div role="alert" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/20 p-4 text-sm text-red-700 dark:text-red-300">
      <span>{error}</span><Button size="sm" variant="outline" onClick={() => setReload((value) => value + 1)}>Retry history</Button>
    </div>}

    <Panel title="On-demand health probes" description="These checks run only when an operator requests them; there is no scheduled monitor or background alerting." className="mt-6">
      {loading ? <p role="status" className="text-sm text-graphite">Loading health history…</p>
        : error ? <p className="text-sm text-graphite">Health history could not be loaded. Use Retry history above before treating this result as empty.</p>
          : latest.length ? <ul className="divide-y divide-ink/[0.06] dark:divide-white/[0.08]">
          {latest.map((check) => <li key={check.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
            <span>
              <span className="block text-sm font-semibold">{serviceLabels[check.service_name]}</span>
              <span className="mt-1 block text-xs text-graphite">
                Checked {new Date(check.checked_at).toLocaleString()}
                {check.duration_ms !== null ? ` · ${check.duration_ms} ms` : ''}
                {check.failure_code ? ` · ${check.failure_code}` : ''}
              </span>
            </span>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${check.status === 'healthy' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/10 text-amber-800 dark:text-amber-300'}`}>
              {statusLabels[check.status]}
            </span>
          </li>)}
        </ul> : <p className="text-sm text-graphite">No health checks have been recorded. Run an on-demand probe to test the database and platform operations tables.</p>}
    </Panel>
    <Panel title="Incident source and response" description="Health probes can open an automated incident after two consecutive failures." className="mt-6">
      <p className="text-sm leading-6 text-graphite">The monitor does not automatically resolve incidents. A successful later probe moves an automated incident into monitoring; an operator must verify recovery and resolve it. Incidents created from operator command remain explicitly manual. No job queue, external integration, email provider, or infrastructure telemetry is included in these checks.</p>
    </Panel>
  </>
}
