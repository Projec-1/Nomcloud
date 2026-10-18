import { Key, LockKey, Shield } from '@phosphor-icons/react'
import { KpiTile, Panel, SectionHeader, UnavailableNotice } from './PrototypeKit'

export default function PermissionsSection() {
  return <>
    <SectionHeader eyebrow="Access governance" title="Permissions" description="Roles, grants, approvals, and access review across the platform." />
    <UnavailableNotice scope="Permission governance" detail="No platform role matrix, temporary-grant source, approval-policy source, or access-review record exists. This workspace cannot change permissions or present a simulated grant as real." />
    <div className="grid gap-4 md:grid-cols-3"><KpiTile label="Role matrix" value="Not available" detail="No platform role source" icon={Shield} tone="warning" /><KpiTile label="Temporary grants" value="Not available" detail="No grant source" icon={Key} tone="warning" /><KpiTile label="Approvals" value="Not available" detail="No approval-policy source" icon={LockKey} tone="warning" /></div>
    <Panel title="Access-control requirement" description="What must exist before an operator can act."><p className="text-sm text-graphite">A permission change needs durable scope, authorization outside the browser, a reason, and an immutable audit event. The current data model does not supply that workflow.</p></Panel>
  </>
}
