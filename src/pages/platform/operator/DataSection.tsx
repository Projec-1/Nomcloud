import { Database, DownloadSimple, UploadSimple } from '@phosphor-icons/react'
import { KpiTile, Panel, SectionHeader, UnavailableNotice } from './PrototypeKit'

export default function DataSection() {
  return <>
    <SectionHeader eyebrow="Data governance" title="Data" description="Exports, imports, access requests, and deletion requests." />
    <UnavailableNotice scope="Platform data operations" detail="No platform export-job, import-job, access-request, or deletion-request source exists. This screen cannot create a browser-only request that looks like a governed operation." />
    <div className="grid gap-4 md:grid-cols-3"><KpiTile label="Exports" value="Not available" detail="No export-job source" icon={DownloadSimple} tone="warning" /><KpiTile label="Imports" value="Not available" detail="No import-job source" icon={UploadSimple} tone="warning" /><KpiTile label="Requests" value="Not available" detail="No request register" icon={Database} tone="warning" /></div>
    <Panel title="Data handling" description="Policy boundary."><p className="text-sm text-graphite">A real data operation needs a scoped request, durable status, server-side authorization, and an audit event. None is initiated from this page until that path exists.</p></Panel>
  </>
}
