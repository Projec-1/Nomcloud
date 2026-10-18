import { HardDrives, ShieldCheck, Warning } from '@phosphor-icons/react'
import { KpiTile, Panel, SectionHeader, UnavailableNotice } from './PrototypeKit'

export default function BackupsSection() {
  return <>
    <SectionHeader eyebrow="Business continuity" title="Backups & recovery" description="Backup evidence and recovery readiness for the platform." />
    <UnavailableNotice scope="Backup and recovery operations" detail="No backup job, backup run, restore-test, or recovery-objective source is connected to Nom Cloud. This screen cannot start, verify, or report a backup." />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><KpiTile label="Last successful backup" value="Not available" detail="No backup-run source" icon={HardDrives} tone="warning" /><KpiTile label="Restore test" value="Not available" detail="No restore-test source" icon={ShieldCheck} tone="warning" /><KpiTile label="Failed runs" value="Not available" detail="No backup-run source" icon={Warning} tone="warning" /><KpiTile label="Recovery objectives" value="Not available" detail="No tracked objectives" icon={Warning} tone="warning" /></div>
    <Panel title="Recovery policy" description="Useful guidance, not an operational outcome." className="mt-6"><p className="text-sm leading-6 text-graphite">Do not treat a backup as recoverable until an isolated restore test has completed and the restored records have been checked. Provider configuration and any recovery procedure remain outside this client until their results can be read here.</p></Panel>
  </>
}
