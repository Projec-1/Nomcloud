import { Key, LockKey, Shield } from '@phosphor-icons/react'
import type { PlatformOperatorRecord } from '@/services/platformService'
import { KpiTile, Panel, SectionHeader, stamp } from './PrototypeKit'

export default function PermissionsSection({
  operators,
  loading,
}: {
  operators: PlatformOperatorRecord[]
  loading: boolean
}) {
  const activeCount = operators.filter((operator) => operator.revokedAt === null).length
  const revokedCount = operators.length - activeCount

  return <>
    <SectionHeader eyebrow="Access governance" title="Permissions" description="Verified platform administrator grants, with their current active status." />
    <div className="grid gap-4 md:grid-cols-3">
      <KpiTile label="Platform administrator grants" value={loading ? '…' : operators.length.toLocaleString()} detail="From the platform operator records" icon={Shield} />
      <KpiTile label="Active grants" value={loading ? '…' : activeCount.toLocaleString()} detail="Currently marked active" icon={Key} />
      <KpiTile label="Revoked grants" value={loading ? '…' : revokedCount.toLocaleString()} detail="No longer marked active" icon={LockKey} tone={revokedCount ? 'warning' : 'success'} />
    </div>
    <Panel title="Platform administrator access" description="These records verify platform-admin grants only; they do not define a general role matrix or school-level permissions." className="mt-6">
      {loading ? <p role="status" className="text-sm text-graphite">Loading platform access records…</p>
        : operators.length ? <div className="overflow-x-auto">
          <table className="w-full min-w-[38rem] text-left text-sm">
            <thead><tr className="border-b border-ink/[0.08] text-xs uppercase tracking-wide text-graphite dark:border-white/[0.1]"><th className="py-3 pr-4 font-semibold">Operator</th><th className="py-3 pr-4 font-semibold">Grant type</th><th className="py-3 pr-4 font-semibold">Status</th><th className="py-3 font-semibold">Granted</th></tr></thead>
            <tbody>{operators.map((operator) => <tr key={operator.id} className="border-b border-ink/[0.05] last:border-0 dark:border-white/[0.06]">
              <td className="py-3 pr-4"><span className="block font-semibold">{operator.fullName || 'Name not recorded'}</span><span className="text-xs text-graphite">{operator.email}</span></td>
              <td className="py-3 pr-4">Platform administrator</td>
              <td className="py-3 pr-4">{operator.revokedAt ? 'Revoked' : 'Active'}</td>
              <td className="py-3">{stamp(operator.grantedAt)}</td>
            </tr>)}</tbody>
          </table>
        </div> : <p className="text-sm text-graphite">No platform administrator grant records are available.</p>}
    </Panel>
    <Panel title="Permission changes unavailable" description="No permission-management workflow is connected." className="mt-6">
      <p className="text-sm leading-6 text-graphite">This page is read-only. It cannot change roles, create temporary grants, or approve access. A secure change needs server-side authorization, explicit scope and reason, and a durable audit event.</p>
    </Panel>
  </>
}
