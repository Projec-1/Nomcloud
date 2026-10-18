import { Fingerprint, Key, Shield, Warning } from '@phosphor-icons/react'
import { KpiTile, Panel, SectionHeader, UnavailableNotice } from './PrototypeKit'

export default function SecuritySection() {
  return <>
    <SectionHeader eyebrow="Threat and access monitoring" title="Security" description="Security signals, active sessions, and access reviews." />
    <UnavailableNotice scope="Security monitoring and containment" detail="Nom Cloud does not store security events, session history, failed sign-ins, or access reviews, and the client cannot read the identity provider’s logs. No containment or revocation action is available here." />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><KpiTile label="Open signals" value="Not available" detail="No security-event source" icon={Warning} tone="warning" /><KpiTile label="Active sessions" value="Not available" detail="No session-history source" icon={Fingerprint} tone="warning" /><KpiTile label="Access reviews" value="Not available" detail="No review source" icon={Key} tone="warning" /><KpiTile label="Control checks" value="Not available" detail="No control-status source" icon={Shield} tone="warning" /></div>
    <Panel title="Response principle" description="Useful process guidance, not a simulated operation."><p className="text-sm text-graphite">When a verified security signal exists, contain access first, preserve evidence, record the decision, and communicate the outcome through an approved operational path. This screen cannot perform any of those actions yet.</p></Panel>
  </>
}
