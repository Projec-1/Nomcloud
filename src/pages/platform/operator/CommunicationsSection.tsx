import { EnvelopeSimple, Megaphone, Users } from '@phosphor-icons/react'
import { KpiTile, Panel, SectionHeader, UnavailableNotice } from './PrototypeKit'

export default function CommunicationsSection() {
  return <>
    <SectionHeader eyebrow="Platform communications" title="Communications" description="Platform-wide notices and their delivery status." />
    <UnavailableNotice scope="Platform communications" detail="The current announcements and messaging tables are school-scoped. There is no platform-wide announcement composer, delivery provider, or delivery history to show here." />
    <div className="grid gap-4 md:grid-cols-3"><KpiTile label="Platform announcements" value="Not available" detail="No platform-wide source" icon={Megaphone} tone="warning" /><KpiTile label="Drafts" value="Not available" detail="No platform composer" icon={EnvelopeSimple} tone="warning" /><KpiTile label="Delivery status" value="Not available" detail="No provider event source" icon={Users} tone="warning" /></div>
    <Panel title="Current boundary" description="What the workspace can and cannot claim."><p className="text-sm text-graphite">School communications remain separate from platform operations. No announcement is sent, queued, or counted from this screen.</p></Panel>
  </>
}
