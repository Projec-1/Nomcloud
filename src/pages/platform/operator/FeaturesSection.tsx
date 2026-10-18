import { Flag, Gauge, Users } from '@phosphor-icons/react'
import { KpiTile, Panel, SectionHeader, UnavailableNotice } from './PrototypeKit'

export default function FeaturesSection() {
  return <>
    <SectionHeader eyebrow="Product delivery" title="Features" description="Feature rollout, school overrides, and adoption monitoring." />
    <UnavailableNotice scope="Feature management" detail="Nom Cloud has no feature-flag registry, per-school override source, rollout history, or adoption metrics. No toggle on this screen can change a school’s product access." />
    <div className="grid gap-4 md:grid-cols-3"><KpiTile label="Feature flags" value="Not available" detail="No flag registry" icon={Flag} tone="warning" /><KpiTile label="Rollouts" value="Not available" detail="No rollout history" icon={Gauge} tone="warning" /><KpiTile label="School overrides" value="Not available" detail="No override source" icon={Users} tone="warning" /></div>
    <Panel title="Safe rollout requirement" description="Before a control is introduced."><p className="text-sm text-graphite">A feature-control action needs a persisted scope, a server-enforced rule, an audit event, and a way to read the resulting state. This page intentionally offers none until then.</p></Panel>
  </>
}
