import { Heartbeat, PlugsConnected, Warning } from '@phosphor-icons/react'
import { KpiTile, Panel, SectionHeader, UnavailableNotice } from './PrototypeKit'

export default function HealthSection() {
  return <>
    <SectionHeader eyebrow="Reliability monitoring" title="System health" description="Service status, incidents, and monitoring coverage." />
    <UnavailableNotice scope="System health monitoring" detail="Nom Cloud does not collect service-health, job, incident, or alert-threshold data. A health check cannot be run from this client until a monitoring source is connected." />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><KpiTile label="Service health" value="Not available" detail="No monitoring source" icon={Heartbeat} tone="warning" /><KpiTile label="Incidents" value="Not available" detail="No incident source" icon={Warning} tone="warning" /><KpiTile label="Jobs" value="Not available" detail="No job source" icon={Heartbeat} tone="warning" /><KpiTile label="Integrations" value="Not available" detail="No provider health source" icon={PlugsConnected} tone="warning" /></div>
    <Panel title="Operational requirement" description="What makes a health signal trustworthy."><p className="text-sm text-graphite">A future health view must identify the source, its collection time, the affected service, and the action taken. Static green or red status values are deliberately not shown.</p></Panel>
  </>
}
