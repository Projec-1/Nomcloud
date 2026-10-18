import { IdentificationCard, Users, UserSwitch } from '@phosphor-icons/react'
import { KpiTile, Panel, SectionHeader, UnavailableNotice } from './PrototypeKit'

export default function PeopleSection() {
  return <>
    <SectionHeader eyebrow="Network directory" title="People" description="People and access across the platform’s schools." />
    <UnavailableNotice scope="Network-wide people directory" detail="Profiles, memberships, teachers, and guardians are school-scoped. No platform-scoped directory read exists, and row-level security must continue to protect those records." />
    <div className="grid gap-4 md:grid-cols-3"><KpiTile label="Profiles" value="Not available" detail="No platform-wide read" icon={IdentificationCard} tone="warning" /><KpiTile label="Memberships" value="Not available" detail="School-scoped source" icon={Users} tone="warning" /><KpiTile label="Role changes" value="Not available" detail="No platform workflow" icon={UserSwitch} tone="warning" /></div>
    <Panel title="Available today" description="A narrow, verified alternative."><p className="text-sm text-graphite">Individual organization records remain searchable through Schools. A platform-wide directory must be designed with explicit data scope and authorization before it can be exposed here.</p></Panel>
  </>
}
