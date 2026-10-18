import { Clock, EnvelopeSimple, Warning } from '@phosphor-icons/react'
import { Panel, SectionHeader, UnavailableNotice } from './PrototypeKit'

export default function ActivitySection() {
  return <>
    <SectionHeader eyebrow="Platform traceability" title="Activity" description="A cross-platform event feed for operational follow-up." />
    <UnavailableNotice scope="Activity feed" detail="Nom Cloud has no network-wide activity stream, delivery-event store, or event-detail source. The audit log remains available separately for the records that do exist." />
    <div className="grid gap-4 md:grid-cols-3">
      <Panel title="Live feed" description="Events across the network, newest first."><p className="text-sm text-graphite">No activity source is connected.</p></Panel>
      <Panel title="Deliveries" description="Email, SMS, and webhook outcomes."><p className="text-sm text-graphite">No delivery-event source is connected.</p></Panel>
      <Panel title="Warnings" description="Events that still need attention."><p className="text-sm text-graphite">No warning or investigation source is connected.</p></Panel>
    </div>
    <Panel title="What will make this available" description="The missing operational sources." className="mt-6">
      <ul className="grid gap-3 text-sm text-graphite sm:grid-cols-3"><li className="flex gap-2"><Clock className="mt-0.5 h-4 w-4 shrink-0 text-brand" />Timestamped platform events</li><li className="flex gap-2"><EnvelopeSimple className="mt-0.5 h-4 w-4 shrink-0 text-brand" />Delivery outcomes from providers</li><li className="flex gap-2"><Warning className="mt-0.5 h-4 w-4 shrink-0 text-brand" />A reviewed warning workflow</li></ul>
    </Panel>
  </>
}
