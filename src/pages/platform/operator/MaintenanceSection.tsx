import { useEffect, useState } from 'react'
import { CalendarPlus, Power, Wrench } from '@phosphor-icons/react'
import Button from '@/components/ui/Button'
import {
  fetchPlatformMaintenanceSettings,
  updatePlatformMaintenanceSettings,
  type PlatformMaintenanceSettings,
} from '@/services/platformControlsService'
import { errorMessage } from '@/utils/errorMessage'
import { KpiTile, Panel, SectionHeader } from './PrototypeKit'

function toLocalInput(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 16)
}

function toIsoOrNull(value: string): string | null {
  if (!value) return null
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null
}

export default function MaintenanceSection() {
  const [settings, setSettings] = useState<PlatformMaintenanceSettings | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [message, setMessage] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchPlatformMaintenanceSettings()
      .then((row) => {
        if (cancelled) return
        setSettings(row)
        setEnabled(row.enabled)
        setMessage(row.message)
        setStartsAt(toLocalInput(row.starts_at))
        setEndsAt(toLocalInput(row.ends_at))
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(errorMessage(cause, 'Maintenance settings could not be loaded.'))
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [reload])

  const activeNow = Boolean(
    settings?.enabled
    && (!settings.starts_at || new Date(settings.starts_at).getTime() <= Date.now())
    && (!settings.ends_at || new Date(settings.ends_at).getTime() > Date.now()),
  )
  const scheduled = Boolean(settings?.enabled && settings.starts_at && new Date(settings.starts_at).getTime() > Date.now())

  const save = async () => {
    if (saving) return
    const startsAtIso = toIsoOrNull(startsAt)
    const endsAtIso = toIsoOrNull(endsAt)
    if (!message.trim() || message.trim().length > 500) {
      setError('Enter a maintenance message of at most 500 characters.')
      return
    }
    if (startsAt && !startsAtIso || endsAt && !endsAtIso) {
      setError('Enter valid maintenance start and end times.')
      return
    }
    if (startsAtIso && endsAtIso && Date.parse(endsAtIso) <= Date.parse(startsAtIso)) {
      setError('The maintenance end time must be after its start time.')
      return
    }
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await updatePlatformMaintenanceSettings({
        enabled,
        message,
        startsAt: startsAtIso,
        endsAt: endsAtIso,
      })
      setSaved(true)
      setReload((value) => value + 1)
    } catch (cause) {
      setError(errorMessage(cause, 'Maintenance settings were not saved.'))
    } finally {
      setSaving(false)
    }
  }

  return <>
    <SectionHeader eyebrow="Platform operations" title="Maintenance" description="Server-enforced maintenance mode, schedule, and operator audit history." />
    <div className="grid gap-4 md:grid-cols-3">
      <KpiTile label="Maintenance mode" value={loading ? '…' : activeNow ? 'Active' : scheduled ? 'Scheduled' : 'Off'} detail="Enforced by database access policies" icon={Power} tone={activeNow ? 'warning' : undefined} />
      <KpiTile label="Scheduled work" value={settings?.starts_at ? new Date(settings.starts_at).toLocaleString() : 'None'} detail="Automatic start and end window" icon={CalendarPlus} />
      <KpiTile label="Operational jobs" value="Not available" detail="No job scheduler is connected" icon={Wrench} tone="warning" />
    </div>

    {error && <div role="alert" className="mt-6 rounded-xl border border-red-500/20 p-4 text-sm text-red-700 dark:text-red-300">{error}</div>}
    {saved && <p role="status" className="mt-4 text-sm text-emerald-700 dark:text-emerald-300">Maintenance settings saved and recorded in the operator audit history.</p>}

    <Panel title="Maintenance controls" description="School members lose tenant-data access while enabled; platform administrators retain emergency access. Public application submissions remain available." className="mt-6">
      {loading ? <p role="status" className="text-sm text-graphite">Loading server settings…</p>
        : !settings ? <Button size="sm" variant="outline" onClick={() => setReload((value) => value + 1)}>Retry</Button>
          : <div className="space-y-5">
            <label className="flex items-center gap-3 text-sm font-semibold">
              <input type="checkbox" checked={enabled} onChange={(event) => { setEnabled(event.target.checked); setSaved(false) }} className="h-5 w-5 accent-brand" />
              Enable maintenance mode
            </label>
            <label className="block text-sm font-medium">
              Message shown to operators
              <textarea value={message} maxLength={500} onChange={(event) => { setMessage(event.target.value); setSaved(false) }} className="input mt-2 min-h-24 w-full resize-y" />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium">Starts at (optional)
                <input type="datetime-local" value={startsAt} onChange={(event) => { setStartsAt(event.target.value); setSaved(false) }} className="input mt-2 w-full" />
              </label>
              <label className="block text-sm font-medium">Ends at (optional)
                <input type="datetime-local" value={endsAt} onChange={(event) => { setEndsAt(event.target.value); setSaved(false) }} className="input mt-2 w-full" />
              </label>
            </div>
            <p className="text-xs leading-5 text-graphite">All school-scoped database policies that use the shared membership predicates enforce the active window. Platform-admin access is preserved. Settings changes are audited.</p>
            <Button size="sm" onClick={() => void save()} disabled={saving}>{saving ? 'Saving…' : 'Save maintenance settings'}</Button>
          </div>}
    </Panel>
  </>
}
