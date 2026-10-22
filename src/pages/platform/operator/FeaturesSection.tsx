import { useEffect, useState } from 'react'
import { Flag, Gauge, Users } from '@phosphor-icons/react'
import Button from '@/components/ui/Button'
import {
  fetchPlatformFeatureFlags,
  updatePlatformFeatureFlag,
  type PlatformFeatureFlag,
  type PlatformFeatureKey,
} from '@/services/platformControlsService'
import { errorMessage } from '@/utils/errorMessage'
import { KpiTile, Panel, SectionHeader } from './PrototypeKit'

const FLAG_LABELS: Record<PlatformFeatureKey, string> = {
  operations_queue: 'Operations Queue',
  incident_command: 'Incident Command',
  school_application_review: 'School Application Review',
  billing_ledger: 'Billing Ledger',
}

export default function FeaturesSection() {
  const [flags, setFlags] = useState<PlatformFeatureFlag[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<PlatformFeatureKey | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setFlags([])
    fetchPlatformFeatureFlags()
      .then((rows) => { if (!cancelled) setFlags(rows) })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setFlags([])
          setError(errorMessage(cause, 'Feature flags could not be loaded.'))
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [reload])

  const toggleFlag = async (flag: PlatformFeatureFlag) => {
    if (saving) return
    setSaving(flag.flag_key)
    setError(null)
    try {
      await updatePlatformFeatureFlag(flag.flag_key, !flag.enabled)
      setFlags((current) => current.map((item) =>
        item.flag_key === flag.flag_key ? { ...item, enabled: !flag.enabled } : item,
      ))
    } catch (cause) {
      setError(errorMessage(cause, `Could not update ${FLAG_LABELS[flag.flag_key]}.`))
    } finally {
      setSaving(null)
    }
  }

  return <>
    <SectionHeader eyebrow="Product delivery" title="Features" description="Persistent platform feature flags enforced by database policies and workflow guards." />
    <div className="grid gap-4 md:grid-cols-3">
      <KpiTile label="Registered flags" value={loading ? '…' : flags.length.toLocaleString()} detail="Server-backed controls" icon={Flag} />
      <KpiTile label="Enabled flags" value={loading ? '…' : flags.filter((item) => item.enabled).length.toLocaleString()} detail="Database access follows each flag" icon={Gauge} />
      <KpiTile label="School overrides" value="Not available" detail="Flags are platform-wide" icon={Users} tone="warning" />
    </div>

    {error && <div role="alert" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/20 p-4 text-sm text-red-700 dark:text-red-300">
      <span>{error}</span><Button size="sm" variant="outline" onClick={() => setReload((value) => value + 1)}>Retry</Button>
    </div>}

    <Panel title="Platform feature flags" description="Changes are audited and enforced on protected database reads and writes." className="mt-6">
      {loading ? <p role="status" className="text-sm text-graphite">Loading feature flags…</p>
        : error ? <p className="text-sm text-graphite">Feature-flag records could not be loaded. Retry before treating this result as empty.</p>
          : flags.length ? <ul className="divide-y divide-ink/[0.06] dark:divide-white/[0.08]">
          {flags.map((flag) => <li key={flag.flag_key} className="flex flex-wrap items-center justify-between gap-4 py-4">
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{FLAG_LABELS[flag.flag_key]}</span>
              <span className="mt-1 block text-sm text-graphite">{flag.description}</span>
            </span>
            <label className="flex items-center gap-3 text-sm font-medium">
              <span>{flag.enabled ? 'Enabled' : 'Disabled'}</span>
              <input
                aria-label={`Enable ${FLAG_LABELS[flag.flag_key]}`}
                type="checkbox"
                checked={flag.enabled}
                disabled={saving !== null || loading || error !== null}
                onChange={() => void toggleFlag(flag)}
                className="h-5 w-5 accent-brand"
              />
            </label>
          </li>)}
        </ul> : <p className="text-sm text-graphite">No feature-flag records are available. Check that the platform controls migration has been applied.</p>}
    </Panel>
    <Panel title="Scope" description="No school-specific overrides or adoption analytics are configured." className="mt-6">
      <p className="text-sm leading-6 text-graphite">These flags control the Operations Queue, Incident Command, School Application Review, and Billing Ledger globally. A disabled flag also blocks its protected database operations; hiding a control in the browser is not the enforcement boundary.</p>
    </Panel>
  </>
}
