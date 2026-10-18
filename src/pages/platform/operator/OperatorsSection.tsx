import { Key, Shield, Users, Warning } from '@phosphor-icons/react'
import type { PlatformOperatorRecord } from '@/services/platformService'
import { timeAgo } from '@/utils/format'
import { Callout, DataTable, ExportButton, KpiTile, Panel, Pill, SectionHeader, downloadCsv, stamp, type Column } from './PrototypeKit'

export default function OperatorsSection({ operators, onNotify }: { operators: PlatformOperatorRecord[]; onNotify: (message: string) => void }) {
  const active = operators.filter((item) => item.revokedAt === null)
  const exportOperators = () => {
    if (!operators.length) return
    downloadCsv('platform-operators.csv', [['Operator', 'Email', 'Access granted', 'Status'], ...operators.map((item) => [item.fullName, item.email, item.grantedAt, item.revokedAt ? 'Revoked' : 'Active'])])
    onNotify(`${operators.length} platform access record${operators.length === 1 ? '' : 's'} exported.`)
  }
  const columns: Array<Column<PlatformOperatorRecord>> = [
    { key: 'operator', label: 'Operator', width: 'minmax(0,1.5fr)', render: (item) => <span><span className="block font-semibold">{item.fullName}</span><span className="block text-xs text-graphite">{item.email}</span></span> },
    { key: 'granted', label: 'Access granted', render: (item) => <span className="text-xs text-graphite">{stamp(item.grantedAt)} · {timeAgo(item.grantedAt)}</span> },
    { key: 'status', label: 'Status', render: (item) => <Pill label={item.revokedAt ? 'Revoked' : 'Active'} tone={item.revokedAt ? 'neutral' : 'success'} /> },
  ]
  return <>
    <SectionHeader eyebrow="Platform access" title="Operators" description="Platform access grants read from the database. This client can inspect and export the records, but cannot create, revoke, or alter a grant." action={<ExportButton onClick={exportOperators} label="Export access" disabled={!operators.length} />} />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><KpiTile label="Active access grants" value={active.length.toLocaleString()} detail={`${operators.length} records loaded`} icon={Key} /><KpiTile label="Operator accounts" value="Not available" detail="No account directory source" icon={Users} tone="warning" /><KpiTile label="MFA status" value="Not available" detail="No identity-provider read" icon={Shield} tone="warning" /><KpiTile label="Workload" value="Not available" detail="No task source" icon={Warning} tone="warning" /></div>
    <Panel title="Platform access grants" description="Directly from the platform access record." className="mt-6"><DataTable columns={columns} rows={operators} rowKey={(item) => item.id} emptyLabel="No platform access grants were found." /></Panel>
    <Callout tone="warning" title="Access changes are unavailable">Platform access must be changed through an authorized server-side workflow. The former browser-only invitation and revocation requests have been removed because they did not create, notify, or persist a real access change.</Callout>
  </>
}
