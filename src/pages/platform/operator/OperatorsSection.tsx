import { useMemo, useState } from 'react'
import { Check, Key as KeyRound, Shield, UserPlus, Users, Warning } from '@phosphor-icons/react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import {
  ActionDialog,
  ActionLogPanel,
  Callout,
  DataTable,
  DetailModal,
  ExportButton,
  FilterChips,
  KpiTile,
  MetaList,
  Panel,
  Pill,
  PrototypeNotice,
  SampleTag,
  SectionHeader,
  VerificationPanel,
  downloadCsv,
  stamp,
  useActionLog,
  type ActionRequest,
  type Column,
} from './PrototypeKit'
import { operatorLoginHistory, operatorProfiles, operatorTeams, type OperatorProfile } from './prototypeData'
import type { PlatformOperatorRecord } from '@/services/platformService'
import { timeAgo } from '@/utils/format'

const statusOptions = ['All', 'Active', 'Deactivated'] as const

export default function OperatorsSection({ operators, onNotify, operator }: {
  operators: PlatformOperatorRecord[]
  onNotify: (message: string) => void
  operator: string
}) {
  const [profiles, setProfiles] = useState<OperatorProfile[]>(operatorProfiles)
  const [teams, setTeams] = useState(operatorTeams)
  const [revocationRequests, setRevocationRequests] = useState<string[]>([])
  const [status, setStatus] = useState<(typeof statusOptions)[number]>('All')
  const [profileEmail, setProfileEmail] = useState<string | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [request, setRequest] = useState<ActionRequest | null>(null)
  const [verified, setVerified] = useState<Array<{ label: string; value: string; ok?: boolean }> | null>(null)
  const { entries, record } = useActionLog(operator)

  const visibleProfiles = useMemo(() => profiles.filter((profile) => status === 'All' || profile.status === status), [profiles, status])
  const selected = useMemo(() => profiles.find((profile) => profile.email === profileEmail) ?? null, [profiles, profileEmail])

  const activeReal = operators.filter((item) => item.revokedAt === null)
  const withoutMfa = profiles.filter((profile) => profile.mfa === 'Not enabled')
  const overdueTotal = profiles.reduce((sum, profile) => sum + profile.overdue, 0)

  const requestRevocation = (record_: PlatformOperatorRecord) => {
    setRequest({
      title: 'Request revocation of platform access',
      target: `${record_.fullName} · ${record_.email}`,
      description: 'Removing platform access is a founder-level action that needs a second operator. The request is recorded here; the grant itself is removed from the database by the server.',
      confirmLabel: 'Submit request',
      danger: true,
      requiresReason: true,
      requiresApproval: true,
      reasonLabel: 'Why should this access be removed?',
      onConfirm: ({ reason, approver }) => {
        setRevocationRequests((current) => [...current, record_.id])
        record({
          action: 'Requested revocation of platform access',
          target: `${record_.fullName} · ${record_.email}`,
          reason,
          approver: approver || undefined,
          before: 'Active grant',
          after: 'Revocation requested',
          result: 'Queued',
        })
        setVerified([
          { label: 'Operator', value: `${record_.fullName} · ${record_.email}` },
          { label: 'Request state', value: 'Awaiting founder approval' },
          { label: 'Access still active', value: 'Yes — the client cannot revoke it', ok: false },
          { label: 'Co-signed by', value: approver || 'Not recorded' },
        ])
        onNotify('Revocation request recorded. Access is unchanged until the server applies it.')
      },
    })
  }

  const updateProfile = (profile: OperatorProfile, kind: 'mfa' | 'recovery' | 'deactivate' | 'reactivate') => {
    const config = {
      mfa: { title: 'Require multi-factor authentication', action: 'Required MFA re-enrolment', after: 'Not enabled', danger: false, approval: false, reason: 'Account security review: MFA needs to be re-enrolled on this account.' },
      recovery: { title: 'Reset account recovery options', action: 'Reset account recovery options', after: 'Recovery reset required', danger: false, approval: true, reason: 'The operator cannot reach the recovery address on file.' },
      deactivate: { title: 'Deactivate this operator account', action: 'Deactivated an operator account', after: 'Deactivated', danger: true, approval: true, reason: 'Access is being withdrawn from this operator.' },
      reactivate: { title: 'Reactivate this operator account', action: 'Reactivated an operator account', after: 'Active', danger: false, approval: false, reason: 'The operator is returning and needs access again.' },
    }[kind]

    setRequest({
      title: config.title,
      target: `${profile.name} · ${profile.email}`,
      description: 'The change is recorded against your name, and the operator is told what happened and what they have to do next.',
      confirmLabel: 'Apply',
      danger: config.danger,
      requiresReason: true,
      requiresApproval: config.approval,
      reasonLabel: 'Reason for this account change',
      options: [{ key: 'notify', label: 'Email the operator about this change', defaultChecked: true }],
      onConfirm: ({ reason, approver, options }) => {
        setProfiles((current) => current.map((item) => item.email === profile.email
          ? kind === 'deactivate' ? { ...item, status: 'Deactivated' }
            : kind === 'reactivate' ? { ...item, status: 'Active' }
              : { ...item, mfa: 'Not enabled' }
          : item))
        record({
          action: config.action,
          target: `${profile.name} · ${profile.email}`,
          reason,
          approver: approver || undefined,
          before: kind === 'deactivate' ? 'Active' : kind === 'reactivate' ? 'Deactivated' : profile.mfa,
          after: config.after,
          result: 'Applied',
          options: options.notify ? ['Operator emailed'] : [],
        })
        setVerified([
          { label: 'Operator', value: `${profile.name} · ${profile.email}` },
          { label: 'Change', value: config.action },
          { label: 'New state', value: config.after },
          { label: 'Operator notified', value: options.notify ? 'Yes' : 'No' },
        ])
        setProfileEmail(null)
        onNotify(`${profile.name}: ${config.action.toLowerCase()}.`)
      },
    })
  }

  const inviteOperator = (input: { name: string; email: string; team: string; role: string }) => {
    setProfiles((current) => [{
      email: input.email,
      name: input.name,
      team: input.team,
      role: input.role,
      status: 'Active',
      mfa: 'Not enabled',
      lastLoginAt: new Date().toISOString(),
      assigned: 0,
      overdue: 0,
      closedThisWeek: 0,
      cases: [],
    }, ...current])
    setTeams((current) => current.map((team) => team.name === input.team ? { ...team, members: team.members + 1 } : team))
    record({
      action: 'Invited an operator',
      target: `${input.name} · ${input.email}`,
      reason: `Invited to ${input.team} as ${input.role}.`,
      before: 'No access',
      after: 'Invitation pending',
      result: 'Queued',
    })
    setVerified([
      { label: 'Invited', value: `${input.name} · ${input.email}` },
      { label: 'Team', value: input.team },
      { label: 'Role', value: input.role },
      { label: 'MFA', value: 'Must be set up before the first sign-in', ok: false },
    ])
    setInviteOpen(false)
    onNotify(`Invitation prepared for ${input.name}.`)
  }

  const assignTeam = (profile: OperatorProfile, team: string) => {
    setProfiles((current) => current.map((item) => item.email === profile.email ? { ...item, team } : item))
    record({
      action: 'Assigned an operator to a team',
      target: `${profile.name} · ${profile.email}`,
      reason: `Responsibility moved to ${team}.`,
      before: profile.team,
      after: team,
      result: 'Applied',
    })
    setProfileEmail(null)
    onNotify(`${profile.name} moved to ${team}.`)
  }

  const exportOperators = () => {
    downloadCsv('platform-operators.csv', [
      ['Operator', 'Email', 'Team', 'Role', 'Account status', 'MFA', 'Last sign-in', 'Assigned cases', 'Overdue', 'Closed this week'],
      ...profiles.map((profile) => [profile.name, profile.email, profile.team, profile.role, profile.status, profile.mfa, profile.lastLoginAt, profile.assigned, profile.overdue, profile.closedThisWeek]),
      [],
      ['Platform access grant', 'Email', 'Granted', 'Status'],
      ...operators.map((item) => [item.fullName, item.email, item.grantedAt, item.revokedAt ? 'Revoked' : 'Active']),
    ])
    onNotify('Operator report exported.')
  }

  const workloadColumns: Array<Column<OperatorProfile>> = [
    { key: 'name', label: 'Operator', width: 'minmax(0,1.3fr)', render: (profile) => <span className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">{profile.name.charAt(0)}</span><span className="min-w-0"><span className="block font-semibold">{profile.name}</span><span className="block truncate text-xs text-graphite">{profile.email}</span></span></span> },
    { key: 'team', label: 'Team', render: (profile) => <span className="text-sm">{profile.team}</span> },
    { key: 'role', label: 'Role', render: (profile) => <span className="text-xs text-graphite">{profile.role}</span> },
    { key: 'cases', label: 'Cases', render: (profile) => <span className="text-sm">{profile.assigned}<span className="block text-xs text-graphite">{profile.overdue} overdue</span></span> },
    { key: 'closed', label: 'Closed this week', render: (profile) => <span className="text-sm">{profile.closedThisWeek}</span> },
    { key: 'mfa', label: 'MFA', render: (profile) => <Pill label={profile.mfa} /> },
    { key: 'status', label: 'Account', render: (profile) => <Pill label={profile.status} /> },
  ]

  const accessColumns: Array<Column<PlatformOperatorRecord>> = [
    { key: 'name', label: 'Operator', width: 'minmax(0,1.4fr)', render: (item) => <span><span className="block font-semibold">{item.fullName}</span><span className="block text-xs text-graphite">{item.email}</span></span> },
    { key: 'granted', label: 'Access granted', render: (item) => <span className="text-xs text-graphite">{stamp(item.grantedAt)} · {timeAgo(item.grantedAt)}</span> },
    { key: 'status', label: 'Status', render: (item) => revocationRequests.includes(item.id) ? <Pill label="Revocation requested" /> : <Pill label={item.revokedAt ? 'Revoked' : 'Active'} /> },
  ]

  return (
    <>
      <SectionHeader
        eyebrow="Internal staff management"
        title="Operators"
        description="Who can reach the Control Center, what they are responsible for, and how their accounts are protected."
        action={<ExportButton onClick={exportOperators} label="Export operators" />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Platform access grants" value={activeReal.length.toString()} detail={`${operators.length} grants read from the database${revocationRequests.length ? ` · ${revocationRequests.length} revocation requested` : ''}`} icon={KeyRound} />
        <KpiTile label="Operators on this screen" value={profiles.filter((profile) => profile.status === 'Active').length.toString()} detail={`${profiles.filter((profile) => profile.status === 'Deactivated').length} deactivated`} icon={Users} />
        <KpiTile label="Accounts without MFA" value={withoutMfa.length.toString()} detail={withoutMfa.map((profile) => profile.name).join(', ') || 'Every operator has MFA'} icon={Shield} tone={withoutMfa.length ? 'warning' : 'success'} />
        <KpiTile label="Overdue tasks across the team" value={overdueTotal.toString()} detail="Cases past their due date" icon={Warning} tone={overdueTotal ? 'warning' : 'success'} />
      </div>

      <div className="mt-6">
        <Panel
          title="Platform access grants"
          description="Read from platform_admins — the real source of who can reach the Control Center."
        >
          <DataTable
            columns={accessColumns}
            rows={operators}
            rowKey={(item) => item.id}
            renderActions={(item) => (
              item.revokedAt === null && !revocationRequests.includes(item.id)
                ? <button onClick={() => requestRevocation(item)} className="rounded-xl border border-ink/10 px-3 py-2 text-xs font-semibold dark:border-white/10"><Warning className="mr-1.5 inline h-3.5 w-3.5" /> Revoke</button>
                : <span className="text-xs text-graphite">{revocationRequests.includes(item.id) ? 'Awaiting founder approval' : 'No action available'}</span>
            )}
            emptyLabel="No platform access grants were found."
          />
          <p className="mt-3 text-xs text-graphite">
            Revoking a grant is not possible from this client: platform_admins is written by the server. The request above is recorded and shown to a founder,
            who applies it in the database.
          </p>
        </Panel>
      </div>

      <div className="mt-6">
        <PrototypeNotice
          scope="Teams, workload and login history"
          detail="Platform access grants above are real. Teams, workload, login history and MFA state come from sample data, because nothing records operator shifts, assigned cases or sign-in history yet."
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <FilterChips options={statusOptions} value={status} onChange={setStatus} label="Account status" />
        <Button variant="accent" size="sm" onClick={() => setInviteOpen(true)}><UserPlus className="h-4 w-4" /> Invite an operator</Button>
      </div>

      <div className="mt-5 grid gap-6 xl:grid-cols-[1.7fr_1fr]">
        <Panel title="Workload and responsibility" description="Open an operator to see their cases, sign-in history and account controls." action={<SampleTag />}>
          <DataTable columns={workloadColumns} rows={visibleProfiles} rowKey={(profile) => profile.email} onRow={(profile) => setProfileEmail(profile.email)} />
        </Panel>

        <Panel title="Teams" description="Every team has one lead, and every case belongs to a team." action={<SampleTag />}>
          <ul className="space-y-3">
            {teams.map((team) => (
              <li key={team.id} className="border-b border-ink/[0.06] pb-3 text-sm last:border-0 last:pb-0 dark:border-white/[0.08]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 font-semibold">{team.name}</span>
                  <Pill label={`${team.members} member${team.members === 1 ? '' : 's'}`} tone="neutral" />
                </div>
                <p className="mt-1 text-xs text-graphite">Lead {team.lead} · {team.focus}</p>
              </li>
            ))}
          </ul>
          <Callout tone="info" title="High-risk actions need two operators">
            Suspending a school, exporting student data, crediting an account above the threshold, rotating credentials and deleting records all require a second
            operator. Those rules live in Permissions, and every action dialog in the Control Center enforces them.
          </Callout>
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <ActionLogPanel entries={entries} description="Account changes, invitations, team assignments and revocation requests from this session." />
        {verified
          ? <VerificationPanel title="Result of the last action" checks={verified} note="Verification reads this screen back. Server-side changes such as a real grant removal would also be confirmed by the database." />
          : <Panel title="Verify the result" description="Every account change reports what changed."><p className="text-sm text-graphite">Change an account, invite an operator or request a revocation to see the confirmation here.</p></Panel>}
      </div>

      <DetailModal
        open={Boolean(selected)}
        onClose={() => setProfileEmail(null)}
        title={selected?.name ?? ''}
        description={selected ? `${selected.email} · ${selected.role}` : ''}
        summary={selected && (
          <Callout tone={selected.mfa === 'Enabled' ? 'success' : 'warning'} title={selected.status === 'Deactivated' ? 'This account is deactivated' : selected.mfa === 'Enabled' ? 'Account protection is in place' : 'This account has no multi-factor authentication'}>
            {selected.status === 'Deactivated'
              ? 'The operator cannot sign in. Their history and audit trail are kept.'
              : selected.mfa === 'Enabled'
                ? 'MFA is enabled and the account is currently active.'
                : 'Anyone with the password can reach the Control Center. Require MFA re-enrolment below.'}
          </Callout>
        )}
        meta={selected ? [
          ['Team', selected.team],
          ['Role', selected.role],
          ['Status', <Pill key="status" label={selected.status} />],
          ['Last sign-in', `${timeAgo(selected.lastLoginAt)} · ${stamp(selected.lastLoginAt)}`],
          ['Assigned cases', `${selected.assigned} (${selected.overdue} overdue)`],
          ['Closed this week', selected.closedThisWeek.toString()],
        ] : []}
        footer={selected && (
          <>
            <Button variant="outline" size="sm" onClick={() => updateProfile(selected, 'mfa')}><Shield className="h-4 w-4" /> Require MFA</Button>
            <Button variant="outline" size="sm" onClick={() => updateProfile(selected, 'recovery')}><KeyRound className="h-4 w-4" /> Reset recovery</Button>
            {selected.status === 'Active'
              ? <Button variant="danger" size="sm" onClick={() => updateProfile(selected, 'deactivate')}><Warning className="h-4 w-4" /> Deactivate</Button>
              : <Button variant="accent" size="sm" onClick={() => updateProfile(selected, 'reactivate')}><Check className="h-4 w-4" /> Reactivate</Button>}
          </>
        )}
        size="lg"
      >
        {selected && (
          <>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-graphite">Assigned cases</p>
              <ul className="flex flex-wrap gap-2">
                {selected.cases.length ? selected.cases.map((item) => <li key={item}><Pill label={item} tone="info" /></li>) : <li className="text-sm text-graphite">No case is assigned.</li>}
              </ul>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-graphite">Sign-in history</p>
              <ul className="space-y-2">
                {(operatorLoginHistory[selected.email] ?? operatorLoginHistory.default).map((entry) => (
                  <li key={entry.at} className="flex flex-wrap items-center gap-3 rounded-xl bg-ink/[0.035] p-3 text-sm dark:bg-white/[0.05]">
                    <Pill label={entry.result} />
                    <span className="min-w-0 flex-1 text-xs text-graphite">{entry.device} · {entry.location}</span>
                    <span className="text-xs text-graphite">{stamp(entry.at)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-graphite">Move to another team</p>
              <div className="flex flex-wrap gap-2">
                {teams.filter((team) => team.name !== selected.team).map((team) => (
                  <button key={team.id} onClick={() => assignTeam(selected, team.name)} className="rounded-xl border border-ink/10 px-3 py-2 text-xs font-semibold dark:border-white/10">{team.name}</button>
                ))}
              </div>
            </div>
            <MetaList
              columns={1}
              items={[
                ['Audited actions', 'Every action an operator takes in the Control Center is written to the action log with their name. Audit records for platform changes are not written yet.'],
                ['Account recovery', 'Recovery is configured per operator by the identity provider. This screen can request a reset; it cannot set a new password.'],
              ]}
            />
          </>
        )}
      </DetailModal>

      <InviteOperatorModal open={inviteOpen} onClose={() => setInviteOpen(false)} teams={teams.map((team) => team.name)} onInvite={inviteOperator} />

      <ActionDialog request={request} onClose={() => setRequest(null)} actor={operator} />

      <p className="mt-6 text-xs text-graphite">
        Two operators are required for suspending a school, exporting student data, crediting above the threshold, rotating credentials and deleting records.
      </p>
    </>
  )
}

function InviteOperatorModal({ open, onClose, teams, onInvite }: { open: boolean; onClose: () => void; teams: string[]; onInvite: (input: { name: string; email: string; team: string; role: string }) => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [team, setTeam] = useState(teams[0] ?? 'Platform operations')
  const [role, setRole] = useState('Support operator')
  const [error, setError] = useState<string | null>(null)

  const submit = () => {
    if (name.trim().length < 3) { setError('Enter the operator’s full name.'); return }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setError('Enter a valid work email address.'); return }
    onInvite({ name: name.trim(), email: email.trim().toLowerCase(), team, role })
    setName('')
    setEmail('')
    setError(null)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="Invite an operator"
      description="An invitation gives the person access to the Control Center once they accept it and set up multi-factor authentication."
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant="accent" onClick={submit}>Send invitation</Button></>}
    >
      <div className="space-y-4">
        <label className="block"><span className="label">Full name</span><input value={name} onChange={(event) => setName(event.target.value)} className="input" placeholder="Amina Yusuf" /></label>
        <label className="block"><span className="label">Work email</span><input value={email} onChange={(event) => setEmail(event.target.value)} className="input" placeholder="name@nom.cloud" /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="label">Team</span>
            <select value={team} onChange={(event) => setTeam(event.target.value)} className="input py-2">{teams.map((option) => <option key={option} value={option}>{option}</option>)}</select>
          </label>
          <label className="block">
            <span className="label">Role</span>
            <select value={role} onChange={(event) => setRole(event.target.value)} className="input py-2">
              {['Super admin', 'Operations lead', 'Finance operator', 'Security reviewer', 'Support operator'].map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
        </div>
        {error && <p role="alert" className="text-sm font-semibold text-red-600 dark:text-red-300">{error}</p>}
        <Callout tone="info" title="What the invitation does">
          It creates a pending platform grant and emails the person. Their permissions come from the role chosen here, and high-risk actions will still need a
          second operator.
        </Callout>
      </div>
    </Modal>
  )
}
