import { useEffect, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowUpRight, Plus, WarningCircle } from '@phosphor-icons/react'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import type { PlatformOperatorRecord } from '@/services/platformService'
import { errorMessage } from '@/utils/errorMessage'
import {
  addPlatformIncidentUpdate,
  createPlatformIncident,
  fetchPlatformIncidentUpdates,
  fetchPlatformIncidents,
  setPlatformIncidentResponders,
  updatePlatformIncident,
  type PlatformCase,
  type PlatformCaseSeverity,
  type PlatformIncident,
  type PlatformIncidentUpdate,
} from '@/services/platformOperationsService'

const panelClass = 'border border-ink/[0.1] bg-white p-5 dark:border-white/[0.1] dark:bg-white/[0.03]'
const incidentSeverity: Record<PlatformCaseSeverity, string> = {
  sev1: 'SEV 1 · Critical',
  sev2: 'SEV 2 · High',
  sev3: 'SEV 3 · Moderate',
  sev4: 'SEV 4 · Low',
}

export default function IncidentCommand({
  operators,
  cases,
  authUserId,
  notify,
}: {
  operators: PlatformOperatorRecord[]
  cases: PlatformCase[]
  authUserId: string
  notify: (message: string) => void
}) {
  const navigate = useNavigate()
  const [incidents, setIncidents] = useState<PlatformIncident[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchPlatformIncidents()
      .then((rows) => {
        if (!cancelled) setIncidents(rows)
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setIncidents([])
          setError(errorMessage(cause, 'Could not load incident records.'))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [refresh])

  const reload = () => setRefresh((value) => value + 1)
  const activeOperators = operators.filter((item) => !item.revokedAt)

  return (
    <section id="incidents" className="mt-10 scroll-mt-24 border-t border-ink/10 pt-8 dark:border-white/10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Incident command</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-graphite">Coordinate responders, recovery steps and post-incident reviews. Incidents here do not represent an automated service-health monitor.</p>
        </div>
        <Button variant="accent" size="sm" disabled={loading || Boolean(error)} onClick={() => setShowForm((value) => !value)} icon={<Plus className="h-4 w-4" />}>{showForm ? 'Close form' : 'Open incident'}</Button>
      </div>

      <div className="mt-5 flex flex-wrap items-start justify-between gap-3 border-y border-amber-500/20 bg-amber-500/[0.04] px-4 py-3">
        <p className="flex items-start gap-2 text-sm text-amber-900 dark:text-amber-200"><WarningCircle className="mt-0.5 h-4 w-4 shrink-0" />Use System Health provider dashboards for live service telemetry. Use Maintenance for planned service windows.</p>
        <button type="button" onClick={() => navigate('/platform/maintenance')} className="text-sm font-semibold text-brand underline underline-offset-2">Maintenance center <ArrowUpRight className="ml-1 inline h-4 w-4" /></button>
      </div>

      {showForm && !loading && !error && <NewIncidentForm
        authUserId={authUserId}
        operators={activeOperators}
        cases={cases}
        onCancel={() => setShowForm(false)}
        onCreated={(message) => { setShowForm(false); reload(); if (message) notify(message) }}
        onError={notify}
      />}
      {error && <div role="alert" className="mt-5 flex flex-wrap items-center justify-between gap-3 border-y border-red-500/30 p-4 text-sm text-red-800 dark:text-red-300"><span>Could not load incidents: {error}</span><Button size="sm" variant="outline" onClick={reload}>Retry</Button></div>}
      {loading ? <p role="status" className="py-8 text-sm text-graphite">Loading incident records…</p> : error ? null : incidents.length ? (
        <div className="mt-5 space-y-5">
          {incidents.map((incident) => <IncidentCard key={incident.id} incident={incident} operators={activeOperators} cases={cases} notify={notify} onChanged={reload} />)}
        </div>
      ) : <p className="mt-5 border-y border-ink/10 py-8 text-sm text-graphite dark:border-white/10">No incidents have been recorded.</p>}
    </section>
  )
}

function NewIncidentForm({ authUserId, operators, cases, onCancel, onCreated, onError }: {
  authUserId: string
  operators: PlatformOperatorRecord[]
  cases: PlatformCase[]
  onCancel: () => void
  onCreated: (message?: string) => void
  onError: (message: string) => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState<PlatformCaseSeverity>('sev2')
  const [services, setServices] = useState('')
  const [commanderId, setCommanderId] = useState('')
  const [linkedCaseId, setLinkedCaseId] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    try {
      const incidentId = await createPlatformIncident({
        title,
        description,
        severity,
        affectedServices: services.split(',').map((item) => item.trim()).filter(Boolean),
        commanderId: commanderId || null,
        linkedCaseId: linkedCaseId || null,
        createdBy: authUserId,
      })
      if (commanderId) {
        try {
          await setPlatformIncidentResponders(incidentId, [commanderId])
        } catch (cause: unknown) {
          onError(`Incident was opened, but commander assignment failed: ${errorMessage(cause)}`)
          onCreated()
          return
        }
      }
      onCreated('Incident command opened.')
    } catch (cause: unknown) {
      onError(`Incident was not opened: ${errorMessage(cause)}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className={`${panelClass} mt-5`}>
      <h3 className="font-semibold">Open incident command</h3>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="block text-xs font-semibold text-graphite">Incident title<input className="input mt-1.5 w-full" required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label className="block text-xs font-semibold text-graphite">Severity<Select className="mt-1.5" value={severity} onChange={(event) => setSeverity(event.target.value as PlatformCaseSeverity)}>{Object.entries(incidentSeverity).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select></label>
        <label className="block text-xs font-semibold text-graphite">Affected services<input className="input mt-1.5 w-full" maxLength={300} value={services} onChange={(event) => setServices(event.target.value)} placeholder="Comma-separated service names" /></label>
        <label className="block text-xs font-semibold text-graphite">Incident commander<Select className="mt-1.5" value={commanderId} onChange={(event) => setCommanderId(event.target.value)}><option value="">Not assigned</option>{operators.map((operator) => <option key={operator.id} value={operator.id}>{operator.fullName}</option>)}</Select></label>
        <label className="block text-xs font-semibold text-graphite md:col-span-2">Linked operations case<Select className="mt-1.5" value={linkedCaseId} onChange={(event) => setLinkedCaseId(event.target.value)}><option value="">No linked case</option>{cases.filter((item) => item.status !== 'resolved' && item.status !== 'closed').map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</Select></label>
        <label className="block text-xs font-semibold text-graphite md:col-span-2">Incident summary<textarea className="input mt-1.5 min-h-24 w-full resize-y" required maxLength={5000} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
      </div>
      <div className="mt-4 flex justify-end gap-2"><Button type="button" size="sm" variant="outline" onClick={onCancel}>Cancel</Button><Button type="submit" size="sm" variant="accent" loading={saving}>Open command</Button></div>
    </form>
  )
}

function IncidentCard({ incident, operators, cases, notify, onChanged }: {
  incident: PlatformIncident
  operators: PlatformOperatorRecord[]
  cases: PlatformCase[]
  notify: (message: string) => void
  onChanged: () => void
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const [updates, setUpdates] = useState<PlatformIncidentUpdate[]>([])
  const [loadingUpdates, setLoadingUpdates] = useState(true)
  const [refresh, setRefresh] = useState(0)
  const [busy, setBusy] = useState(false)
  const [selectedResponders, setSelectedResponders] = useState<string[]>(incident.responders)
  const [draftUpdate, setDraftUpdate] = useState('')
  const [updateType, setUpdateType] = useState<PlatformIncidentUpdate['updateType']>('update')
  const [postmortem, setPostmortem] = useState(incident.postmortem ?? '')
  const [expanded, setExpanded] = useState(false)
  const linkedCase = cases.find((item) => item.id === incident.linkedCaseId)
  const commander = operators.find((item) => item.id === incident.commanderId)
  const stamp = (value: string | null) => value ? new Date(value).toLocaleString() : '—'

  useEffect(() => {
    let cancelled = false
    setLoadingUpdates(true)
    fetchPlatformIncidentUpdates(incident.id)
      .then((rows) => { if (!cancelled) setUpdates(rows) })
      .catch((cause: unknown) => { if (!cancelled) notify(`Could not load incident updates: ${errorMessage(cause)}`) })
      .finally(() => { if (!cancelled) setLoadingUpdates(false) })
    return () => { cancelled = true }
  }, [incident.id, refresh, notify])

  useEffect(() => {
    setSelectedResponders(incident.responders)
    setPostmortem(incident.postmortem ?? '')
  }, [incident.responders, incident.postmortem])

  const change = async (patch: Parameters<typeof updatePlatformIncident>[1], message: string) => {
    setBusy(true)
    try {
      await updatePlatformIncident(incident.id, patch)
      onChanged()
      notify(message)
    } catch (cause: unknown) {
      notify(`Incident was not updated: ${errorMessage(cause)}`)
    } finally {
      setBusy(false)
    }
  }

  const saveResponders = async () => {
    setBusy(true)
    try {
      await setPlatformIncidentResponders(incident.id, selectedResponders)
      onChanged()
      notify('Incident responders updated.')
    } catch (cause: unknown) {
      notify(`Responders were not updated: ${errorMessage(cause)}`)
    } finally {
      setBusy(false)
    }
  }

  const addUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!draftUpdate.trim()) return
    setBusy(true)
    try {
      await addPlatformIncidentUpdate(incident.id, updateType, draftUpdate)
      setDraftUpdate('')
      setRefresh((value) => value + 1)
      notify(updateType === 'recovery_step' ? 'Recovery step recorded.' : 'Incident update recorded.')
    } catch (cause: unknown) {
      notify(`Incident update was not saved: ${errorMessage(cause)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className="border-y border-ink/10 py-5 dark:border-white/10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="break-words text-lg font-semibold">{incident.title}</h3>
            <span className="rounded-md bg-red-500/10 px-2 py-1 text-xs font-semibold text-red-800 dark:text-red-300">{incidentSeverity[incident.severity]}</span>
          </div>
          <p className="mt-2 max-w-3xl whitespace-pre-wrap text-sm leading-6 text-graphite">{incident.description}</p>
          <p className="mt-2 text-xs text-graphite">{incident.detectionSource === 'automated_monitor' ? `Detected by on-demand monitor${incident.monitorService ? ` (${incident.monitorService})` : ''}` : 'Operator-recorded'} · Opened {stamp(incident.startedAt)} · Commander {commander?.fullName ?? 'unassigned'} · {incident.affectedServices.length ? incident.affectedServices.join(', ') : 'Affected services not listed'}</p>
          {linkedCase && <button className="mt-2 text-xs font-semibold text-brand underline underline-offset-2" onClick={() => navigate(`/platform/operations/${linkedCase.id}`, { state: { from: location.pathname } })}>Linked case: {linkedCase.title}</button>}
        </div>
        <button type="button" className="min-h-11 border border-ink/10 px-3 text-sm font-semibold dark:border-white/10" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>{expanded ? 'Hide command' : 'Manage incident'}</button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="block text-xs font-semibold text-graphite">Status<Select className="mt-1.5" disabled={busy} value={incident.status} onChange={(event) => void change({ status: event.target.value as PlatformIncident['status'] }, 'Incident status updated.')}><option value="investigating">Investigating</option><option value="mitigating">Mitigating</option><option value="monitoring">Monitoring</option><option value="resolved">Resolved</option></Select></label>
        <label className="block text-xs font-semibold text-graphite">Severity<Select className="mt-1.5" disabled={busy} value={incident.severity} onChange={(event) => void change({ severity: event.target.value as PlatformCaseSeverity }, 'Incident severity updated.')} >{Object.entries(incidentSeverity).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select></label>
        <div className="border-y border-ink/10 py-2 dark:border-white/10"><p className="text-xs font-semibold text-graphite">Recovery</p><p className="mt-1 text-sm">{incident.status === 'resolved' ? `Resolved ${stamp(incident.resolvedAt)}` : 'In progress'}</p></div>
      </div>

      {expanded && <div className="mt-5 grid gap-6 border-t border-ink/10 pt-5 dark:border-white/10 xl:grid-cols-2">
        <section>
          <label className="block text-xs font-semibold text-graphite">Incident commander<Select className="mt-1.5" disabled={busy} value={incident.commanderId ?? ''} onChange={(event) => void change({ commanderId: event.target.value || null }, 'Incident commander updated.')}><option value="">Not assigned</option>{operators.map((operator) => <option key={operator.id} value={operator.id}>{operator.fullName}</option>)}</Select></label>
          <fieldset className="mt-4">
            <legend className="text-xs font-semibold text-graphite">Responders</legend>
            <div className="mt-2 max-h-40 space-y-2 overflow-y-auto">
              {operators.length ? operators.map((operator) => <label key={operator.id} className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={selectedResponders.includes(operator.id)} onChange={(event) => setSelectedResponders((current) => event.target.checked ? [...current, operator.id] : current.filter((id) => id !== operator.id))} />{operator.fullName}<span className="text-xs text-graphite">{operator.team ?? 'Team metadata unavailable'}</span></label>) : <p className="text-sm text-graphite">No active operators available.</p>}
            </div>
            <Button className="mt-3" size="sm" variant="outline" disabled={busy || selectedResponders.length === incident.responders.length && selectedResponders.every((id) => incident.responders.includes(id))} onClick={() => void saveResponders()}>Save responders</Button>
          </fieldset>
          <form className="mt-5 space-y-3" onSubmit={(event) => void addUpdate(event)}>
            <label className="block text-xs font-semibold text-graphite">Command log<Select className="mt-1.5" value={updateType} onChange={(event) => setUpdateType(event.target.value as PlatformIncidentUpdate['updateType'])}><option value="update">Situation update</option><option value="recovery_step">Recovery step</option></Select></label>
            <textarea className="input min-h-20 w-full resize-y" required maxLength={3000} value={draftUpdate} onChange={(event) => setDraftUpdate(event.target.value)} placeholder="Record a status update or recovery action" />
            <Button type="submit" size="sm" variant="accent" disabled={busy || !draftUpdate.trim()}>Record update</Button>
          </form>
        </section>

        <section>
          <h4 className="font-semibold">Command timeline</h4>
          {loadingUpdates ? <p className="mt-3 text-sm text-graphite">Loading updates…</p> : updates.length ? <ol className="mt-3 max-h-64 divide-y divide-ink/10 overflow-y-auto dark:divide-white/10">{updates.map((update) => <li key={update.id} className="py-3"><p className="text-sm">{update.body}</p><p className="mt-1 text-xs text-graphite">{update.updateType.replace('_', ' ')} · {update.actorName} · {stamp(update.createdAt)}</p></li>)}</ol> : <p className="mt-3 text-sm text-graphite">No command updates recorded.</p>}
          <form className="mt-5 space-y-3 border-t border-ink/10 pt-4 dark:border-white/10" onSubmit={(event) => { event.preventDefault(); void change({ postmortem }, 'Post-incident review saved.') }}>
            <label className="block text-xs font-semibold text-graphite">Post-incident review<textarea className="input mt-1.5 min-h-24 w-full resize-y" maxLength={5000} value={postmortem} onChange={(event) => setPostmortem(event.target.value)} placeholder="Document impact, cause, response and follow-up" /></label>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" size="sm" variant="outline" disabled={busy || !postmortem.trim()}>Save review</Button>
              {incident.postmortem && !incident.postmortemReviewedAt && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void change({ postmortemReviewedAt: new Date().toISOString() }, 'Post-incident review marked reviewed.')}>Mark reviewed</Button>}
              {incident.postmortemReviewedAt && <span className="text-xs text-emerald-700 dark:text-emerald-300">Reviewed {stamp(incident.postmortemReviewedAt)}</span>}
            </div>
          </form>
        </section>
      </div>}
    </article>
  )
}
