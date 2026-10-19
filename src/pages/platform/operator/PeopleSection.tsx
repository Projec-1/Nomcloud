import { useMemo, useState } from 'react'
import { ArrowClockwise as RefreshCw, Check, Prohibit as Ban, UserCircle, Users } from '@phosphor-icons/react'
import Button from '@/components/ui/Button'
import {
  ActionDialog,
  ActionLogPanel,
  Callout,
  DataTable,
  DetailModal,
  Dropdown,
  ExportButton,
  FilterChips,
  KpiTile,
  MetaList,
  Panel,
  Pill,
  PrototypeNotice,
  SampleTag,
  SearchBox,
  SectionHeader,
  Toolbar,
  VerificationPanel,
  downloadCsv,
  relativeDays,
  stamp,
  useActionLog,
  type ActionRequest,
  type Column,
} from './PrototypeKit'
import { peopleDirectory } from './prototypeData'
import { timeAgo } from '@/utils/format'

type Person = typeof peopleDirectory[number]

const roleOptions = ['All roles', 'Administrator', 'Teacher', 'Parent', 'Operator'] as const
const statusOptions = ['All', 'Active', 'Invited', 'Deactivated'] as const

export default function PeopleSection({ onNotify, operator }: { onNotify: (message: string) => void; operator: string }) {
  const [people, setPeople] = useState<Person[]>(peopleDirectory)
  const [role, setRole] = useState<(typeof roleOptions)[number]>('All roles')
  const [status, setStatus] = useState<(typeof statusOptions)[number]>('All')
  const [school, setSchool] = useState('All schools')
  const [query, setQuery] = useState('')
  const [personId, setPersonId] = useState<string | null>(null)
  const [request, setRequest] = useState<ActionRequest | null>(null)
  const [verified, setVerified] = useState<Array<{ label: string; value: string; ok?: boolean }> | null>(null)
  const { entries, record } = useActionLog(operator)

  const schools = useMemo(() => ['All schools', ...Array.from(new Set(people.map((person) => person.school)))], [people])
  const visible = useMemo(() => people.filter((person) => {
    if (role !== 'All roles' && person.role !== role) return false
    if (status !== 'All' && person.status !== status) return false
    if (school !== 'All schools' && person.school !== school) return false
    if (query && !`${person.name} ${person.email} ${person.school} ${person.role}`.toLowerCase().includes(query.toLowerCase())) return false
    return true
  }), [people, role, status, school, query])

  const selected = useMemo(() => people.find((person) => person.id === personId) ?? null, [people, personId])
  const invited = people.filter((person) => person.status === 'Invited')
  const deactivated = people.filter((person) => person.status === 'Deactivated')

  const resendInvitation = (person: Person) => {
    setRequest({
      title: 'Send the invitation again',
      target: `${person.name} · ${person.email}`,
      description: 'A fresh invitation is emailed. The previous invitation stays valid until it expires, so the newest link is the one that works.',
      confirmLabel: 'Resend invitation',
      requiresReason: true,
      reasonLabel: 'Why is another invitation needed?',
      options: [{ key: 'extend', label: 'Give the new invitation a fresh 7-day expiry', defaultChecked: true }],
      onConfirm: ({ reason, options }) => {
        record({
          action: 'Resent an invitation',
          target: `${person.name} · ${person.email}`,
          reason,
          before: 'Invited',
          after: options.extend ? 'Invited · link valid 7 more days' : 'Invited · original expiry kept',
          result: 'Queued',
          options: options.extend ? ['Expiry extended'] : [],
        })
        setVerified([
          { label: 'Person', value: `${person.name} · ${person.email}` },
          { label: 'Role', value: person.role },
          { label: 'Invitation state', value: options.extend ? 'Valid for seven more days' : 'Original expiry kept' },
          { label: 'Delivered', value: 'Email provider not connected — delivery cannot be confirmed', ok: false },
        ])
        setPersonId(null)
        onNotify(`Invitation prepared for ${person.name}.`)
      },
    })
  }

  const changeStatus = (person: Person, deactivate: boolean) => {
    setRequest({
      title: deactivate ? 'Deactivate this account' : 'Reactivate this account',
      target: `${person.name} · ${person.email}`,
      description: deactivate
        ? 'The person loses access immediately. Their records, attendance history and financial history are kept.'
        : 'Access is restored with the same role and school as before.',
      confirmLabel: deactivate ? 'Deactivate account' : 'Reactivate account',
      danger: deactivate,
      requiresReason: true,
      requiresApproval: deactivate,
      reasonLabel: deactivate ? 'Why is this account being deactivated?' : 'Why is access being restored?',
      options: [{ key: 'notify', label: 'Tell the school administrator', defaultChecked: true }],
      onConfirm: ({ reason, approver, options }) => {
        setPeople((current) => current.map((item) => item.id === person.id ? { ...item, status: deactivate ? 'Deactivated' : 'Active' } : item))
        record({
          action: deactivate ? 'Deactivated a user account' : 'Reactivated a user account',
          target: `${person.name} · ${person.email}`,
          reason,
          approver: approver || undefined,
          before: person.status,
          after: deactivate ? 'Deactivated' : 'Active',
          result: 'Applied',
          options: options.notify ? ['School administrator told'] : [],
        })
        setVerified([
          { label: 'Person', value: `${person.name} · ${person.role}` },
          { label: 'School', value: person.school },
          { label: 'Status', value: `${person.status} → ${deactivate ? 'Deactivated' : 'Active'}` },
          { label: 'Records kept', value: 'Yes — history is not deleted with the account', ok: true },
        ])
        setPersonId(null)
        onNotify(`${person.name} ${deactivate ? 'deactivated' : 'reactivated'}.`)
      },
    })
  }

  const exportPeople = () => {
    downloadCsv('platform-people.csv', [
      ['Name', 'Email', 'Role', 'School', 'Status', 'Joined', 'Last active'],
      ...visible.map((person) => [person.name, person.email, person.role, person.school, person.status, person.joinedAt, person.lastActiveAt]),
    ])
    onNotify(`${visible.length} people exported.`)
  }

  const columns: Array<Column<Person>> = [
    { key: 'name', label: 'Person', width: 'minmax(0,1.4fr)', render: (person) => <span className="flex min-w-0 items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-sm font-bold text-brand">{person.name.charAt(0)}</span><span className="min-w-0"><span className="block break-words font-semibold">{person.name}</span><span className="block break-words text-xs text-graphite">{person.email}</span></span></span> },
    { key: 'role', label: 'Role', render: (person) => <Pill label={person.role} tone="info" /> },
    { key: 'school', label: 'School', width: 'minmax(0,1.2fr)', render: (person) => <span className="text-sm">{person.school}</span> },
    { key: 'status', label: 'Status', render: (person) => <Pill label={person.status} /> },
    { key: 'joined', label: 'Joined', render: (person) => <span className="text-xs text-graphite">{relativeDays(person.joinedAt)}</span> },
    { key: 'active', label: 'Last active', render: (person) => <span className="text-xs text-graphite">{timeAgo(person.lastActiveAt)}</span> },
  ]

  return (
    <>
      <SectionHeader
        eyebrow="Network directory"
        title="People"
        description="Administrators, teachers, parents and operators across every school, in one place."
        action={<ExportButton onClick={exportPeople} label="Export directory" />}
      />
      <PrototypeNotice
        scope="People"
        detail="The records exist — profiles, memberships, teachers and guardians — but nothing assembles them into a network-wide directory yet, and a platform operator is not a member of most schools, so row-level security would hide them. Until a platform-scoped read exists, this directory is sample data. Individual schools stay searchable from the Schools section today."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="People in the directory" value={people.length.toString()} detail={`${people.filter((person) => person.role === 'Operator').length} platform operators`} icon={Users} />
        <KpiTile label="Pending invitations" value={invited.length.toString()} detail={invited.map((person) => person.name).join(', ') || 'Nobody is waiting to join'} icon={UserCircle} tone={invited.length ? 'warning' : 'success'} />
        <KpiTile label="Deactivated accounts" value={deactivated.length.toString()} detail="Records are kept, access is removed" icon={Ban} />
        <KpiTile label="Active today" value={people.filter((person) => Date.now() - new Date(person.lastActiveAt).getTime() < 86_400_000).length.toString()} detail="Signed in within the last day" icon={Check} tone="success" />
      </div>

      <div className="mt-6 space-y-4">
        <Toolbar>
          <SearchBox value={query} onChange={setQuery} placeholder="Search names, emails or schools…" label="Search people" />
          <Dropdown label="School" value={school} onChange={setSchool} options={schools.map((value) => ({ value, label: value }))} />
        </Toolbar>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <FilterChips options={roleOptions} value={role} onChange={setRole} label="Role" />
          <FilterChips options={statusOptions} value={status} onChange={setStatus} label="Account status" />
        </div>
      </div>

      <div className="mt-5">
        <Panel title="Directory" description="Open a person to see their record and manage their account." action={<SampleTag />}>
          <DataTable columns={columns} rows={visible} rowKey={(person) => person.id} onRow={(person) => setPersonId(person.id)} emptyLabel="No person matches these filters." />
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <ActionLogPanel entries={entries} description="Invitations and account changes from this session." />
        {verified
          ? <VerificationPanel title="Result of the last action" checks={verified} note="A real invitation is confirmed by the email provider reporting a delivery; no provider is connected yet." />
          : <Panel title="Verify the result" description="Every account action reports what changed."><p className="text-sm text-graphite">Resend an invitation or change an account status to see the confirmation here.</p></Panel>}
      </div>

      <DetailModal
        open={Boolean(selected)}
        onClose={() => setPersonId(null)}
        title={selected?.name ?? ''}
        description={selected ? `${selected.email} · ${selected.role}` : ''}
        summary={selected && (
          <Callout tone={selected.status === 'Active' ? 'success' : selected.status === 'Invited' ? 'warning' : 'danger'} title={`${selected.status} · ${selected.school}`}>
            {selected.status === 'Active' && `Last active ${timeAgo(selected.lastActiveAt)}.`}
            {selected.status === 'Invited' && `The invitation is still open. Resending it issues a fresh link.`}
            {selected.status === 'Deactivated' && 'Access is removed. Attendance, grades and financial history are kept.'}
          </Callout>
        )}
        meta={selected ? [
          ['Role', selected.role],
          ['School', selected.school],
          ['Status', <Pill key="status" label={selected.status} />],
          ['Joined', `${stamp(selected.joinedAt)} · ${relativeDays(selected.joinedAt)}`],
          ['Last active', `${timeAgo(selected.lastActiveAt)} · ${stamp(selected.lastActiveAt)}`],
          ['Record id', selected.id],
        ] : []}
        footer={selected && (
          <>
            {selected.role !== 'Operator' && <Button variant="outline" size="sm" onClick={() => resendInvitation(selected)}><RefreshCw className="h-4 w-4" /> Resend invitation</Button>}
            {selected.status === 'Deactivated'
              ? <Button variant="accent" size="sm" onClick={() => changeStatus(selected, false)}><Check className="h-4 w-4" /> Reactivate</Button>
              : <Button variant="danger" size="sm" onClick={() => changeStatus(selected, true)}><Ban className="h-4 w-4" /> Deactivate</Button>}
          </>
        )}
        size="lg"
      >
        {selected && (
          <MetaList
            columns={1}
            items={[
              ['What a platform operator may see', 'Enough to help the school: who the person is, their role and whether their account works. Not their teaching records, marks or family details.'],
              ['What is missing', 'There is no platform-wide read for profiles and memberships, so this record cannot be loaded from the database yet.'],
              ['Account changes', 'Deactivation removes access without deleting history, which is why it is reversible and recorded.'],
            ]}
          />
        )}
      </DetailModal>

      <ActionDialog request={request} onClose={() => setRequest(null)} actor={operator} />
    </>
  )
}
