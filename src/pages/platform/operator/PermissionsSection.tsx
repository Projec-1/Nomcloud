import { useMemo, useState } from 'react'
import { CalendarPlus, Check, Key as KeyRound, LockKey as LockKeyhole, Shield, Users, Warning } from '@phosphor-icons/react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Switch from '@/components/ui/Switch'
import { cn } from '@/utils/cn'
import {
  ActionDialog,
  ActionLogPanel,
  Callout,
  DataTable,
  DetailModal,
  ExportButton,
  KpiTile,
  MetaList,
  Panel,
  Pill,
  PrototypeNotice,
  SampleTag,
  SectionHeader,
  VerificationPanel,
  downloadCsv,
  relativeDays,
  stamp,
  useActionLog,
  type ActionRequest,
  type Column,
} from './PrototypeKit'
import {
  approverNames,
  approvalPolicies,
  operatorProfiles,
  permissionCapabilities,
  permissionMatrix,
  permissionRoles,
  privilegedGrants,
  type PermissionLevel,
  type PrivilegedGrant,
} from './prototypeData'

const capabilityGroups: Array<{ area: string; capabilities: string[] }> = [
  { area: 'School access', capabilities: ['View school records', 'Edit school records', 'Approve school applications', 'Suspend or reactivate a school'] },
  { area: 'Student data', capabilities: ['View student data', 'Export student data'] },
  { area: 'Billing', capabilities: ['View billing', 'Change billing and issue credits'] },
  { area: 'Security', capabilities: ['View security signals', 'Revoke sessions and contain incidents'] },
  { area: 'Platform', capabilities: ['Manage operators and permissions', 'Delete records'] },
]

const sensitiveCapabilities = new Set(['Delete records', 'Change billing and issue credits', 'Export student data', 'Manage operators and permissions'])

const roleMatch: Record<string, string> = {
  'role-founder': 'Super admin',
  'role-operations': 'Operations lead',
  'role-finance': 'Finance operator',
  'role-security': 'Security reviewer',
  'role-support': 'Support operator',
}

function levelTone(level: PermissionLevel) {
  return level === 'Allow' ? 'success' : level === 'Approval required' ? 'warning' : 'danger'
}

export default function PermissionsSection({ onNotify, operator }: { onNotify: (message: string) => void; operator: string }) {
  const [matrix, setMatrix] = useState<Record<string, Record<string, PermissionLevel>>>(permissionMatrix)
  const [grants, setGrants] = useState<PrivilegedGrant[]>(privilegedGrants)
  const [policies, setPolicies] = useState(approvalPolicies)
  const [roleId, setRoleId] = useState(permissionRoles[1].id)
  const [editing, setEditing] = useState<{ capability: string; current: PermissionLevel } | null>(null)
  const [grantId, setGrantId] = useState<string | null>(null)
  const [request, setRequest] = useState<ActionRequest | null>(null)
  const [verified, setVerified] = useState<Array<{ label: string; value: string; ok?: boolean }> | null>(null)
  const { entries, record } = useActionLog(operator)

  const role = useMemo(() => permissionRoles.find((item) => item.id === roleId) ?? permissionRoles[0], [roleId])
  const selectedGrant = useMemo(() => grants.find((grant) => grant.id === grantId) ?? null, [grants, grantId])
  const members = useMemo(() => operatorProfiles.filter((profile) => profile.role.includes(roleMatch[role.id] ?? role.name)), [role])
  const elevatedGrants = grants.filter((grant) => grant.status === 'Active' || grant.status === 'Expiring soon')
  const expiringSoon = grants.filter((grant) => grant.status === 'Expiring soon')

  const applyLevel = (capability: string, current: PermissionLevel, next: PermissionLevel, reason: string, approver: string) => {
    setMatrix((existing) => ({
      ...existing,
      [role.id]: { ...existing[role.id], [capability]: next },
    }))
    record({
      action: `Changed a permission to ${next.toLowerCase()}`,
      target: `${role.name} · ${capability}`,
      reason,
      approver: approver || undefined,
      before: current,
      after: next,
      result: 'Applied',
    })
    setVerified([
      { label: 'Role', value: role.name },
      { label: 'Capability', value: capability },
      { label: 'Permission', value: `${current} → ${next}` },
      { label: 'Members affected', value: `${members.length} operator${members.length === 1 ? '' : 's'} on this role` },
    ])
    onNotify(`${capability} set to ${next.toLowerCase()} for ${role.name}.`)
  }

  const updateGrant = (grant: PrivilegedGrant, action: 'extend' | 'revoke') => {
    setRequest({
      title: action === 'extend' ? 'Extend temporary access' : 'Revoke temporary access',
      target: `${grant.id} · ${grant.operator} · ${grant.scope}`,
      description: action === 'extend'
        ? 'Temporary access is extended by seven days. Extensions are visible to every operator, and the reason is kept with the grant.'
        : 'The extra access ends now. The operator keeps the permissions of their own role.',
      confirmLabel: action === 'extend' ? 'Extend by 7 days' : 'Revoke access',
      danger: action === 'revoke',
      requiresReason: true,
      requiresApproval: true,
      reasonLabel: action === 'extend' ? 'Why does this access need longer?' : 'Why is this access being cut short?',
      onConfirm: ({ reason, approver }) => {
        const expiresAt = action === 'extend' ? new Date(new Date(grant.expiresAt).getTime() + 7 * 86_400_000).toISOString() : new Date().toISOString()
        setGrants((current) => current.map((item) => item.id === grant.id
          ? { ...item, expiresAt, status: action === 'revoke' ? 'Revoked' : 'Active' }
          : item))
        record({
          action: action === 'extend' ? 'Extended temporary privileged access' : 'Revoked temporary privileged access',
          target: `${grant.id} · ${grant.operator} · ${grant.scope}`,
          reason,
          approver: approver || undefined,
          before: `Expires ${relativeDays(grant.expiresAt)}`,
          after: action === 'revoke' ? 'Revoked now' : `Expires ${relativeDays(expiresAt)}`,
          result: 'Applied',
        })
        setVerified([
          { label: 'Grant', value: `${grant.id} · ${grant.scope}` },
          { label: 'Operator', value: grant.operator },
          { label: 'Expiry', value: action === 'revoke' ? 'Revoked' : stamp(expiresAt) },
          { label: 'Still temporary', value: 'Yes — the grant expires on its own', ok: true },
        ])
        setGrantId(null)
        onNotify(action === 'extend' ? 'Temporary access extended by seven days.' : 'Temporary access revoked.')
      },
    })
  }

  const togglePolicy = (id: string, action: string) => {
    const policy = policies.find((item) => item.id === id)
    if (!policy) return
    const enabled = !policy.enabled
    setPolicies((current) => current.map((item) => item.id === id ? { ...item, enabled } : item))
    record({
      action: enabled ? 'Enabled an approval requirement' : 'Disabled an approval requirement',
      target: `${action} · ${policy.rule}`,
      reason: 'Approval policy reviewed for this high-risk action.',
      before: policy.enabled ? 'Required' : 'Not required',
      after: enabled ? 'Required' : 'Not required',
      result: 'Applied',
    })
  }

  const exportAccess = () => {
    downloadCsv('platform-access.csv', [
      ['Role', 'Capability', 'Permission'],
      ...permissionRoles.flatMap((item) => permissionCapabilities.map((capability) => [item.name, capability, matrix[item.id]?.[capability] ?? 'Deny'])),
      [],
      ['Grant', 'Operator', 'Scope', 'Granted by', 'Granted', 'Expires', 'Status', 'Reason'],
      ...grants.map((grant) => [grant.id, grant.operator, grant.scope, grant.grantedBy, grant.grantedAt, grant.expiresAt, grant.status, grant.reason]),
    ])
    onNotify('Access report exported.')
  }

  const grantColumns: Array<Column<PrivilegedGrant>> = [
    { key: 'operator', label: 'Operator', width: 'minmax(0,1.1fr)', render: (grant) => <span><span className="block font-semibold">{grant.operator}</span><span className="block text-xs text-graphite">{grant.role}</span></span> },
    { key: 'scope', label: 'Extra access', render: (grant) => <span className="text-sm">{grant.scope}</span> },
    { key: 'granted', label: 'Granted', render: (grant) => <span className="text-xs text-graphite">{relativeDays(grant.grantedAt)} by {grant.grantedBy}</span> },
    { key: 'expires', label: 'Expires', render: (grant) => <span className="text-xs text-graphite">{grant.status === 'Revoked' ? 'Revoked' : `${stamp(grant.expiresAt)} · ${relativeDays(grant.expiresAt)}`}</span> },
    { key: 'status', label: 'Status', render: (grant) => <Pill label={grant.status} /> },
  ]

  return (
    <>
      <SectionHeader
        eyebrow="Access governance"
        title="Roles & permissions"
        description="What each operator may do, what needs a second operator, and who is holding access they were only meant to have for a while."
        action={<ExportButton onClick={exportAccess} label="Export access" />}
      />
      <PrototypeNotice
        scope="Permissions"
        detail="Roles are enforced by the database in row-level security, not stored as rows this screen could edit. Changing what a role may do is currently a migration. The matrix below is the interface the governance layer will use — an edit here records the decision and shows the effect, and it does not change any real permission."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Roles" value={permissionRoles.length.toString()} detail={`${permissionRoles.reduce((sum, item) => sum + item.members, 0)} operators across all roles`} icon={Users} />
        <KpiTile label="Temporary access active" value={elevatedGrants.length.toString()} detail={expiringSoon.length ? `${expiringSoon.length} expiring within three days` : 'Nothing expires in the next three days'} icon={KeyRound} tone={expiringSoon.length ? 'warning' : 'success'} />
        <KpiTile label="Elevated roles" value={permissionRoles.filter((item) => item.level === 'Elevated').length.toString()} detail={permissionRoles.filter((item) => item.level === 'Elevated').map((item) => item.name).join(', ')} icon={Shield} tone="warning" />
        <KpiTile label="Actions needing approval" value={policies.filter((policy) => policy.enabled).length.toString()} detail={`Of ${policies.length} sensitive operations`} icon={LockKeyhole} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1.7fr]">
        <Panel title="Roles" description="Select a role to see and change what it may do." action={<SampleTag />}>
          <ul className="space-y-2">
            {permissionRoles.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => setRoleId(item.id)}
                  className={cn('w-full rounded-2xl border p-4 text-left', roleId === item.id ? 'border-brand/30 bg-brand/[0.06]' : 'border-ink/[0.08] hover:bg-ink/[0.02] dark:border-white/[0.08] dark:hover:bg-white/[0.03]')}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{item.name}</span>
                      <span className="block text-xs text-graphite">{item.description}</span>
                    </span>
                    <Pill label={item.level} />
                    <span className="text-xs text-graphite">{item.members} member{item.members === 1 ? '' : 's'}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-4 rounded-2xl bg-ink/[0.035] p-4 dark:bg-white/[0.05]">
            <p className="text-xs font-semibold uppercase tracking-wider text-graphite">Members</p>
            <ul className="mt-2 space-y-1 text-sm">
              {members.length ? members.map((member) => (
                <li key={member.email} className="flex items-center justify-between gap-3">
                  <span>{member.name}</span>
                  <span className="text-xs text-graphite">{member.mfa === 'Enabled' ? 'MFA on' : 'No MFA'}</span>
                </li>
              )) : <li className="text-graphite">No operator currently holds this role.</li>}
            </ul>
          </div>
        </Panel>

        <Panel
          title={`Permission matrix · ${role.name}`}
          description="Select any cell to change it. Sensitive capabilities need a reason and a second operator."
          action={<SampleTag />}
        >
          <div className="space-y-5">
            {capabilityGroups.map((group) => (
              <div key={group.area}>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-graphite">{group.area}</p>
                <ul className="space-y-1.5">
                  {group.capabilities.map((capability) => {
                    const level = matrix[role.id]?.[capability] ?? 'Deny'
                    return (
                      <li key={capability} className="flex flex-wrap items-center gap-3 rounded-xl border border-ink/[0.07] px-4 py-3 dark:border-white/[0.08]">
                        <span className="min-w-0 flex-1 text-sm font-medium">{capability}</span>
                        {sensitiveCapabilities.has(capability) && <SampleTag />}
                        <Pill label={level} tone={levelTone(level)} />
                        <button onClick={() => setEditing({ capability, current: level })} className="text-xs font-semibold text-brand">Change</button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
          <Callout tone="info" title="Approval required means two people">
            A capability marked “Approval required” can be used, but only with a second operator co-signing. That is the same two-person rule the action
            dialogs across the Control Center enforce.
          </Callout>
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Panel title="Who holds elevated access" description="A grant is temporary by default and expires on its own." action={<SampleTag />}>
          <DataTable columns={grantColumns} rows={grants} rowKey={(grant) => grant.id} onRow={(grant) => setGrantId(grant.id)} emptyLabel="No privileged grants recorded." />
          <p className="mt-3 text-xs text-graphite">
            {elevatedGrants.length} grant{elevatedGrants.length === 1 ? '' : 's'} active. {permissionRoles.filter((item) => item.level === 'Elevated').length} roles are marked elevated, and those members are reviewed on the schedule in the Security section.
          </p>
        </Panel>

        <Panel title="Approval requirements" description="Which sensitive operations need a second operator." action={<SampleTag />}>
          <ul className="space-y-2">
            {policies.map((policy) => (
              <li key={policy.id} className="rounded-xl bg-ink/[0.035] p-3 dark:bg-white/[0.05]">
                <Switch
                  checked={policy.enabled}
                  onChange={() => togglePolicy(policy.id, policy.action)}
                  label={policy.action}
                  description={`${policy.rule} · ${policy.approvers}`}
                />
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-graphite">Sample policies. In the real system a policy is read by the server before the action runs, not only by this screen.</p>
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <ActionLogPanel entries={entries} description="Permission, grant and policy changes from this session." />
        {verified
          ? <VerificationPanel title="Result of the last action" checks={verified} note="Verification reads the matrix back. Real enforcement happens in the database, so a change here is a decision record, not a live permission." />
          : <Panel title="Verify the result" description="Every change on this screen reports what changed."><p className="text-sm text-graphite">Change a permission, extend or revoke a grant to see the confirmation here.</p></Panel>}
      </div>

      <DetailModal
        open={Boolean(selectedGrant)}
        onClose={() => setGrantId(null)}
        title={selectedGrant ? `${selectedGrant.scope}` : ''}
        description={selectedGrant ? `${selectedGrant.id} · ${selectedGrant.operator} · ${selectedGrant.role}` : ''}
        summary={selectedGrant && (
          <Callout tone={selectedGrant.status === 'Revoked' || selectedGrant.status === 'Expired' ? 'danger' : selectedGrant.status === 'Expiring soon' ? 'warning' : 'success'} title={`Status: ${selectedGrant.status}`}>
            Extra access beyond the operator's own role. It expires on its own unless it is extended.
          </Callout>
        )}
        meta={selectedGrant ? [
          ['Operator', selectedGrant.operator],
          ['Their role', selectedGrant.role],
          ['Extra access', selectedGrant.scope],
          ['Granted by', `${selectedGrant.grantedBy} · ${relativeDays(selectedGrant.grantedAt)}`],
          ['Granted at', stamp(selectedGrant.grantedAt)],
          ['Expires', `${stamp(selectedGrant.expiresAt)} · ${relativeDays(selectedGrant.expiresAt)}`],
          ['Reason', selectedGrant.reason],
        ] : []}
        footer={selectedGrant && selectedGrant.status !== 'Revoked' && (
          <>
            <Button variant="outline" size="sm" onClick={() => updateGrant(selectedGrant, 'extend')}><CalendarPlus className="h-4 w-4" /> Extend by 7 days</Button>
            <Button variant="danger" size="sm" onClick={() => updateGrant(selectedGrant, 'revoke')}><Warning className="h-4 w-4" /> Revoke now</Button>
          </>
        )}
        size="md"
      >
        <MetaList
          columns={1}
          items={[
            ['Why temporary', 'Access that exists for one investigation should not become permanent by accident. Every grant has an expiry and an owner.'],
            ['Who is told', `Grants above are visible to ${approverNames.length} operators. Extending or revoking needs a second operator.`],
          ]}
        />
      </DetailModal>

      <PermissionDialog
        key={editing ? `${role.id}-${editing.capability}` : 'closed'}
        editing={editing}
        roleName={role.name}
        actor={operator}
        onClose={() => setEditing(null)}
        onApply={(next, reason, approver) => {
          if (editing) applyLevel(editing.capability, editing.current, next, reason, approver)
          setEditing(null)
        }}
      />

      <ActionDialog request={request} onClose={() => setRequest(null)} actor={operator} />

      <p className="mt-6 flex items-center gap-2 text-xs text-graphite">
        <Check className="h-3.5 w-3.5" /> {permissionCapabilities.length} capabilities across {capabilityGroups.length} areas. Elevated access is reviewed on a schedule by the Security team.
      </p>
    </>
  )
}

function PermissionDialog({ editing, roleName, actor, onClose, onApply }: {
  editing: { capability: string; current: PermissionLevel } | null
  roleName: string
  actor: string
  onClose: () => void
  onApply: (level: PermissionLevel, reason: string, approver: string) => void
}) {
  const [level, setLevel] = useState<PermissionLevel>(editing?.current ?? 'Deny')
  const [reason, setReason] = useState('')
  const [approver, setApprover] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (!editing) return null
  const sensitive = sensitiveCapabilities.has(editing.capability)
  const coSigners = approverNames.filter((name) => name !== actor)
  const canApply = reason.trim().length >= 8 && (!sensitive || approver.length > 0)

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title="Change a permission"
      description={`${roleName} · ${editing.capability}`}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant="accent" disabled={!canApply} onClick={() => {
        if (!canApply) { setError(sensitive && !approver ? 'This capability needs a second operator.' : 'Write a short reason (8 characters).'); return }
        onApply(level, reason.trim(), approver)
      }}>Apply change</Button></>}
    >
      <div className="space-y-5">
        <p className="text-sm leading-6 text-graphite">
          The role currently has <span className="font-semibold text-ink dark:text-white">{editing.current}</span>. Choose what it should be instead.
        </p>
        <fieldset className="space-y-2">
          <legend className="label">New permission</legend>
          {(['Allow', 'Approval required', 'Deny'] as PermissionLevel[]).map((option) => (
            <label key={option} className={cn('flex items-start gap-3 rounded-xl border p-3 text-sm', level === option ? 'border-brand/40 bg-brand/[0.06]' : 'border-ink/10 dark:border-white/10')}>
              <input type="radio" name="permission-level" checked={level === option} onChange={() => setLevel(option)} className="mt-1" />
              <span>
                <span className="block font-semibold">{option}</span>
                <span className="block text-xs text-graphite">
                  {option === 'Allow' && 'The role can do this without anyone else.'}
                  {option === 'Approval required' && 'The role can do this, but a second operator has to co-sign each time.'}
                  {option === 'Deny' && 'The role cannot do this at all.'}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
        {sensitive && (
          <Callout tone="warning" title="This is a sensitive capability">
            Changing it affects student data, money or the platform itself, so a reason and a second operator are required.
            <label className="mt-3 block">
              <span className="label">Second operator co-signature</span>
              <select value={approver} onChange={(event) => { setApprover(event.target.value); setError(null) }} className="input py-2">
                <option value="">Select an operator…</option>
                {coSigners.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
          </Callout>
        )}
        <label className="block">
          <span className="label">Reason (recorded in the action log)</span>
          <textarea value={reason} onChange={(event) => { setReason(event.target.value); setError(null) }} rows={3} className="input resize-none" placeholder="Why is this role's access changing?" />
        </label>
        {error && <p role="alert" className="text-sm font-semibold text-red-600 dark:text-red-300">{error}</p>}
      </div>
    </Modal>
  )
}
