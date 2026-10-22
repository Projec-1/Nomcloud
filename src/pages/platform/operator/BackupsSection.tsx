import { useEffect, useState } from 'react'
import { HardDrives, ShieldCheck, Warning } from '@phosphor-icons/react'
import Button from '@/components/ui/Button'
import {
  checkPlatformBackupStatus,
  fetchPlatformBackupChecks,
  type PlatformBackupCheck,
} from '@/services/platformControlsService'
import { errorMessage } from '@/utils/errorMessage'
import { KpiTile, Panel, SectionHeader } from './PrototypeKit'

const checkErrorLabels: Record<string, string> = {
  management_api_unconfigured: 'Supabase Management API token is not configured.',
  provider_rejected: 'Supabase did not authorize or accept the backup-status request.',
  provider_unavailable: 'Supabase backup status could not be reached.',
  provider_response_invalid: 'Supabase returned an unsupported backup-status response.',
}

export default function BackupsSection() {
  const [checks, setChecks] = useState<PlatformBackupCheck[]>([])
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const latest = checks[0] ?? null

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setChecks([])
    fetchPlatformBackupChecks()
      .then((rows) => { if (!cancelled) setChecks(rows) })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setChecks([])
          setError(errorMessage(cause, 'Backup evidence could not be loaded.'))
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [reload])

  const runCheck = async () => {
    if (checking) return
    setChecking(true)
    setError(null)
    try {
      await checkPlatformBackupStatus()
      setReload((value) => value + 1)
    } catch (cause) {
      setError(errorMessage(cause, 'Backup status could not be checked.'))
    } finally {
      setChecking(false)
    }
  }

  const backupLabel = loading ? '…'
    : error ? 'Unavailable'
    : latest?.status === 'records_found' ? `${latest.backup_count} listed`
      : latest?.status === 'none_found' ? 'None listed'
        : 'Not verified'

  return <>
    <SectionHeader eyebrow="Business continuity" title="Backups & recovery" description="Read-only evidence from the Supabase backup inventory. Listing a backup does not prove it can be restored." action={<Button size="sm" onClick={() => void runCheck()} disabled={checking}>{checking ? 'Checking…' : 'Check provider status'}</Button>} />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiTile label="Provider-listed backups" value={backupLabel} detail={latest?.checked_at ? `Checked ${new Date(latest.checked_at).toLocaleString()}` : 'No provider result yet'} icon={HardDrives} tone={latest?.status === 'unknown' || latest?.status === 'none_found' ? 'warning' : undefined} />
      <KpiTile label="Latest listed backup" value={error ? 'Unavailable' : latest?.latest_backup_at ? new Date(latest.latest_backup_at).toLocaleDateString() : 'Not available'} detail={error ? 'Backup history could not be loaded' : latest?.latest_backup_status ? `Provider status: ${latest.latest_backup_status}` : 'Timestamp unavailable from provider'} icon={HardDrives} />
      <KpiTile label="Restore test" value="Not verified" detail="Inventory checks do not test restoration" icon={ShieldCheck} tone="warning" />
      <KpiTile label="Recovery objectives" value="Not configured" detail="No tracked RPO or RTO" icon={Warning} tone="warning" />
    </div>

    {error && <div role="alert" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/20 p-4 text-sm text-red-700 dark:text-red-300">
      <span>{error}</span><Button size="sm" variant="outline" onClick={() => setReload((value) => value + 1)}>Retry history</Button>
    </div>}
    {latest?.error_code && <p role="status" className="mt-4 text-sm text-amber-800 dark:text-amber-300">{checkErrorLabels[latest.error_code] ?? 'Provider status is unknown.'}</p>}

    <Panel title="Provider evidence" description="Only a read-only Supabase Management API inventory is queried. This control never starts or restores a backup." className="mt-6">
      {loading ? <p role="status" className="text-sm text-graphite">Loading recorded provider checks…</p>
        : error ? <p className="text-sm text-graphite">Provider-check history could not be loaded. Retry history above before treating this result as empty.</p>
          : latest?.status === 'records_found' ? <p className="text-sm leading-6 text-graphite">Supabase listed {latest.backup_count} backup record(s) at {new Date(latest.checked_at).toLocaleString()}. This is evidence of inventory availability only—not a successful backup verification, a completed restore, or Storage-object coverage.</p>
          : latest?.status === 'none_found' ? <p className="text-sm text-graphite">The provider returned an empty backup inventory at {new Date(latest.checked_at).toLocaleString()}.</p>
            : <p className="text-sm text-graphite">No confirmed backup inventory is available. Configure an authorized Supabase Management API token in Edge Function secrets, then check again.</p>}
    </Panel>
    <Panel title="Recovery verification" description="Backup listing and restore verification are separate controls." className="mt-6">
      <p className="text-sm leading-6 text-graphite">A restore test remains explicitly unverified. Storage objects are outside the database backup inventory. Before deployment, a separately approved backup and demonstrated restore path are still required.</p>
    </Panel>
  </>
}
