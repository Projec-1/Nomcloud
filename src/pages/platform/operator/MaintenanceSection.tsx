import { CalendarPlus, Power, Wrench } from '@phosphor-icons/react'
import { KpiTile, Panel, SectionHeader, UnavailableNotice } from './PrototypeKit'

export default function MaintenanceSection() {
  return <>
    <SectionHeader eyebrow="Platform operations" title="Maintenance" description="Scheduled work and maintenance-mode controls." />
    <UnavailableNotice scope="Maintenance controls" detail="There is no maintenance-mode configuration, schedule source, or server-side switch. Enabling a browser-only mode would not restrict access, so no maintenance action is available here." />
    <div className="grid gap-4 md:grid-cols-3"><KpiTile label="Maintenance mode" value="Not available" detail="No server-side control" icon={Power} tone="warning" /><KpiTile label="Scheduled work" value="Not available" detail="No schedule source" icon={CalendarPlus} tone="warning" /><KpiTile label="Operational jobs" value="Not available" detail="No job source" icon={Wrench} tone="warning" /></div>
    <Panel title="Safe maintenance requirement" description="What a genuine maintenance action needs."><p className="text-sm text-graphite">A real control must be enforced before application access, communicate its scope and duration, and record the operator and outcome. This page does not simulate those effects.</p></Panel>
  </>
}
