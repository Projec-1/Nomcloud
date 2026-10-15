import { useMemo, useState } from 'react'
import { Check, FileText, Fingerprint, Key as KeyRound, Shield, ShieldWarning, SignOut as LogOut, Warning } from '@phosphor-icons/react'
import Button from '@/components/ui/Button'
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
  relativeDays,
  stamp,
  useActionLog,
  type ActionRequest,
  type Column,
} from './PrototypeKit'
import {
  accessReviews,
  operatorSessions,
  securityChecks,
  securitySignals,
  type OperatorSession,
  type SecuritySignal,
} from './prototypeData'
import { timeAgo } from '@/utils/format'

const severityOptions = ['All', 'High', 'Medium', 'Low'] as const
const statusOptions = ['All', 'New', 'Investigating', 'Contained', 'Closed'] as const
const kindOptions = ['All kinds', 'Suspicious sign-in', 'Failed sign-ins', 'Data access', 'Privacy incident', 'Configuration'] as const

export default function SecuritySection({ onNotify, onNavigate, operator }: { onNotify: (message: string) => void; onNavigate?: (path: string) => void; operator: string }) {
  const [signals, setSignals] = useState<SecuritySignal[]>(securitySignals)
  const [sessions, setSessions] = useState<OperatorSession[]>(operatorSessions)
  const [reviews, setReviews] = useState(accessReviews)
  const [checks, setChecks] = useState(securityChecks)
  const [severity, setSeverity] = useState<(typeof severityOptions)[number]>('All')
  const [status, setStatus] = useState<(typeof statusOptions)[number]>('All')
  const [kind, setKind] = useState<(typeof kindOptions)[number]>('All kinds')
  const [signalId, setSignalId] = useState<string | null>(null)
  const [request, setRequest] = useState<ActionRequest | null>(null)
  const [verified, setVerified] = useState<Array<{ label: string; value: string; ok?: boolean }> | null>(null)
  const { entries, record } = useActionLog(operator)

  const visible = useMemo(() => signals.filter((signal) => {
    if (severity !== 'All' && signal.severity !== severity) return false
    if (status !== 'All' && signal.status !== status) return false
    if (kind !== 'All kinds' && signal.kind !== kind) return false
    return true
  }), [signals, severity, status, kind])

  const selected = useMemo(() => signals.find((signal) => signal.id === signalId) ?? null, [signals, signalId])
  const openHigh = signals.filter((signal) => signal.severity === 'High' && signal.status !== 'Closed')
  const overdueReviews = reviews.filter((review) => review.status === 'Overdue')
  const attentionChecks = checks.filter((check) => check.status !== 'Passing')

  const revokeSession = (session: OperatorSession) => {
    setRequest({
      title: 'Revoke this session',
      target: `${session.id} · ${session.operator}`,
      description: 'The session ends immediately and the operator has to sign in again. Use this when an account may be compromised or a device is lost.',
      confirmLabel: 'Revoke session',
      danger: true,
      requiresReason: true,
      requiresApproval: true,
      reasonLabel: 'Why is this session being revoked?',
      options: [{ key: 'notify', label: 'Tell the operator their session was ended by a security review' }],
      onConfirm: ({ reason, approver, options }) => {
        setSessions((current) => current.filter((item) => item.id !== session.id))
        record({
          action: 'Revoked an operator session',
          target: `${session.id} · ${session.operator}`,
          reason,
          approver: approver || undefined,
          before: 'Active session',
          after: 'Revoked',
          result: 'Applied',
          options: options.notify ? ['Operator notified'] : [],
        })
        setVerified([
          { label: 'Session', value: session.id },
          { label: 'Operator', value: session.operator },
          { label: 'Sessions remaining', value: `${Math.max(0, sessions.length - 1)} active` },
          { label: 'Re-authentication', value: 'Required on the next request', ok: true },
        ])
        onNotify(`Session ${session.id} revoked.`)
      },
    })
  }

  const moveSignal = (signal: SecuritySignal, next: SecuritySignal['status'], title: string, reasonLabel: string) => {
    setRequest({
      title,
      target: `${signal.id} · ${signal.kind}`,
      description: next === 'Closed'
        ? 'Closing records your finding and keeps the whole history for the next review.'
        : 'The signal moves forward and the change is assigned to you.',
      confirmLabel: next === 'Closed' ? 'Close signal' : `Move to ${next.toLowerCase()}`,
      requiresReason: true,
      requiresApproval: (next === 'Closed' || next === 'Contained') && signal.severity === 'High',
      reasonLabel,
      onConfirm: ({ reason, approver }) => {
        setSignals((current) => current.map((item) => item.id === signal.id ? { ...item, status: next } : item))
        record({
          action: next === 'Closed' ? 'Closed a security signal' : `Moved a security signal to ${next}`,
          target: `${signal.id} · ${signal.kind}`,
          reason,
          approver: approver || undefined,
          before: signal.status,
          after: next,
          result: 'Applied',
        })
        setVerified([
          { label: 'Signal', value: `${signal.id} · ${signal.severity} severity` },
          { label: 'Status', value: `${signal.status} → ${next}` },
          { label: 'Actor under review', value: signal.actor },
          { label: 'Sessions left active', value: `${sessions.length}` },
        ])
        setSignalId(null)
        onNotify(`${signal.id} moved to ${next.toLowerCase()}.`)
      },
    })
  }

  const addNote = (signal: SecuritySignal) => {
    setRequest({
      title: 'Add an investigation note',
      target: `${signal.id} · ${signal.kind}`,
      description: 'Notes are kept with the signal so the next reviewer does not start from nothing.',
      confirmLabel: 'Save note',
      requiresReason: true,
      reasonLabel: 'What did you find?',
      onConfirm: ({ reason }) => {
        setSignals((current) => current.map((item) => item.id === signal.id ? { ...item, evidence: [...item.evidence, ['Note', reason]] } : item))
        record({ action: 'Added a security investigation note', target: `${signal.id} · ${signal.kind}`, reason, result: 'Applied' })
        setVerified([
          { label: 'Signal', value: signal.id },
          { label: 'Notes on record', value: `${signal.evidence.length + 1}` },
          { label: 'Latest note', value: reason.length > 70 ? `${reason.slice(0, 70)}…` : reason },
        ])
        onNotify('Investigation note saved.')
      },
    })
  }

  const startReview = (id: string, scope: string, owner: string) => {
    setRequest({
      title: 'Start an access review',
      target: `${id} · ${scope}`,
      description: 'The review is assigned to you and the due date is kept so overdue reviews stay visible.',
      confirmLabel: 'Start review',
      requiresReason: true,
      reasonLabel: 'What will you check?',
      onConfirm: ({ reason }) => {
        setReviews((current) => current.map((review) => review.id === id ? { ...review, status: 'In progress', owner } : review))
        record({ action: 'Started an access review', target: `${id} · ${scope}`, reason, before: 'Scheduled', after: 'In progress', result: 'Applied' })
        setVerified([
          { label: 'Review', value: `${id} · ${scope}` },
          { label: 'Status', value: 'In progress' },
          { label: 'Owner', value: owner },
          { label: 'Findings so far', value: `${reviews.find((review) => review.id === id)?.findings ?? 0}` },
        ])
        onNotify(`${id} started.`)
      },
    })
  }

  const resolveCheck = (id: string, control: string) => {
    setRequest({
      title: 'Mark this control as reviewed',
      target: `${id} · ${control}`,
      description: 'Records that a person looked at the control and what they found. The control becomes passing only if the finding is resolved.',
      confirmLabel: 'Record review',
      requiresReason: true,
      reasonLabel: 'What did you check, and what did you find?',
      onConfirm: ({ reason }) => {
        setChecks((current) => current.map((check) => check.id === id ? { ...check, status: 'Passing', detail: reason } : check))
        record({ action: 'Reviewed a security control', target: `${id} · ${control}`, reason, before: 'Attention', after: 'Passing', result: 'Applied' })
        setVerified([
          { label: 'Control', value: control },
          { label: 'Status', value: 'Attention → Passing' },
          { label: 'Controlling check recorded', value: reason.length > 70 ? `${reason.slice(0, 70)}…` : reason },
        ])
        onNotify(`${control} marked as reviewed.`)
      },
    })
  }

  const exportSecurity = () => {
    downloadCsv('security-signals.csv', [
      ['Signal', 'Time', 'Kind', 'Severity', 'Actor', 'School', 'Status', 'Summary'],
      ...visible.map((signal) => [signal.id, signal.at, signal.kind, signal.severity, signal.actor, signal.school, signal.status, signal.summary]),
      [],
      ['Session', 'Operator', 'Device', 'Location', 'Started', 'Current'],
      ...sessions.map((session) => [session.id, session.operator, session.device, session.location, session.startedAt, session.current ? 'Yes' : 'No']),
    ])
    onNotify('Security report exported.')
  }

  const signalColumns: Array<Column<SecuritySignal>> = [
    { key: 'kind', label: 'Signal', width: 'minmax(0,1.5fr)', render: (signal) => <span><span className="block font-semibold">{signal.kind}</span><span className="mt-0.5 block text-xs text-graphite">{signal.summary}</span></span> },
    { key: 'severity', label: 'Severity', render: (signal) => <Pill label={signal.severity} /> },
    { key: 'actor', label: 'Actor', render: (signal) => <span className="text-sm text-graphite">{signal.actor}</span> },
    { key: 'school', label: 'Where', render: (signal) => <span className="text-xs text-graphite">{signal.school}</span> },
    { key: 'status', label: 'Status', render: (signal) => <Pill label={signal.status} /> },
    { key: 'when', label: 'Detected', render: (signal) => <span className="text-xs text-graphite">{timeAgo(signal.at)}</span> },
  ]

  const sessionColumns: Array<Column<OperatorSession>> = [
    { key: 'operator', label: 'Operator', width: 'minmax(0,1.2fr)', render: (session) => <span><span className="block font-semibold">{session.operator}</span><span className="block text-xs text-graphite">{session.id}{session.current ? ' · current session' : ''}</span></span> },
    { key: 'device', label: 'Device', render: (session) => <span className="text-sm">{session.device}</span> },
    { key: 'location', label: 'Location', render: (session) => <span className="text-xs text-graphite">{session.location}</span> },
    { key: 'started', label: 'Started', render: (session) => <span className="text-xs text-graphite">{timeAgo(session.startedAt)}</span> },
    { key: 'lastSeen', label: 'Last seen', render: (session) => <span className="text-xs text-graphite">{timeAgo(session.lastSeenAt)}</span> },
  ]

  return (
    <>
      <SectionHeader
        eyebrow="Threat and access monitoring"
        title="Security"
        description="Signals that need a decision, the sessions they touch, and the reviews that keep access honest."
        action={<ExportButton onClick={exportSecurity} label="Export report" />}
      />
      <PrototypeNotice
        scope="Security"
        detail="Nom Cloud does not store security events, sessions or failed sign-in attempts anywhere, and the product cannot read the identity provider's own logs. Every signal, session and review here is sample data; the containment actions are the ones the real screen will use."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Open high-severity signals" value={openHigh.length.toString()} detail={openHigh.map((signal) => signal.id).join(', ') || 'Nothing high severity is open'} icon={ShieldWarning} tone={openHigh.length ? 'danger' : 'success'} />
        <KpiTile label="Active operator sessions" value={sessions.length.toString()} detail={`${sessions.filter((session) => session.current).length} in use right now`} icon={Fingerprint} />
        <KpiTile label="Access reviews overdue" value={overdueReviews.length.toString()} detail={overdueReviews.map((review) => review.scope).join(', ') || 'Every review is on schedule'} icon={KeyRound} tone={overdueReviews.length ? 'warning' : 'success'} />
        <KpiTile label="Controls needing attention" value={attentionChecks.length.toString()} detail={attentionChecks.map((check) => check.control).join(' · ') || 'Every control passes'} icon={Shield} tone={attentionChecks.length ? 'warning' : 'success'} />
      </div>

      <div className="mt-6 space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <FilterChips options={kindOptions} value={kind} onChange={setKind} label="Signal kind" />
          <FilterChips options={severityOptions} value={severity} onChange={setSeverity} label="Severity" />
          <FilterChips options={statusOptions} value={status} onChange={setStatus} label="Status" />
        </div>
      </div>

      <div className="mt-5">
        <Panel title="Signal queue" description="Open a signal to see the evidence and take a containment action." action={<SampleTag />}>
          <DataTable columns={signalColumns} rows={visible} rowKey={(signal) => signal.id} onRow={(signal) => setSignalId(signal.id)} emptyLabel="No signals match these filters." />
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Panel title="Active sessions" description="Revoking a session ends it immediately and needs a second operator." action={<SampleTag />}>
          <DataTable columns={sessionColumns} rows={sessions} rowKey={(session) => session.id} renderActions={(session) => (
            <button onClick={() => revokeSession(session)} className="rounded-xl border border-red-500/20 px-3 py-2 text-xs font-semibold text-red-600 dark:text-red-300">
              <LogOut className="mr-1.5 inline h-3.5 w-3.5" /> Revoke
            </button>
          )} emptyLabel="No active sessions." />
        </Panel>

        <div className="space-y-6">
          <Panel title="Access reviews" description="Elevated access gets reviewed on a schedule." action={<SampleTag />}>
            <ul className="space-y-3">
              {reviews.map((review) => (
                <li key={review.id} className="flex flex-wrap items-center gap-3 border-b border-ink/[0.06] pb-3 text-sm last:border-0 last:pb-0 dark:border-white/[0.08]">
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{review.scope}</span>
                    <span className="block text-xs text-graphite">{review.id} · {review.owner} · due {relativeDays(review.dueAt)} · {review.findings} finding{review.findings === 1 ? '' : 's'}</span>
                  </span>
                  <Pill label={review.status} />
                  {review.status !== 'In progress' && review.status !== 'Completed' && (
                    <button onClick={() => startReview(review.id, review.scope, operator)} className="text-xs font-semibold text-brand">Start</button>
                  )}
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Security configuration checks" description="The controls that decide whether the rest of this screen can be trusted." action={<SampleTag />}>
            <ul className="space-y-3">
              {checks.map((check) => (
                <li key={check.id} className="flex flex-wrap items-center gap-3 border-b border-ink/[0.06] pb-3 text-sm last:border-0 last:pb-0 dark:border-white/[0.08]">
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{check.control}</span>
                    <span className="block text-xs text-graphite">{check.detail}</span>
                  </span>
                  <Pill label={check.status} />
                  {check.status !== 'Passing' && <button onClick={() => resolveCheck(check.id, check.control)} className="text-xs font-semibold text-brand">Record review</button>}
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <ActionLogPanel entries={entries} description="Containment, session and review actions from this session." />
        <div className="space-y-6">
          {verified && <VerificationPanel title="Result of the last action" checks={verified} note="The identity provider would need to confirm a session revocation; without that integration this screen is the only record." />}
          <Panel title="Response procedure" description="What an operator is expected to do, in order.">
            <ol className="list-decimal space-y-2 pl-5 text-sm text-graphite">
              <li>Confirm the signal is real: check the session, the device and the location.</li>
              <li>Contain first if an account may be compromised: revoke sessions, then investigate. A containment action needs a second operator when severity is high.</li>
              <li>Record findings as investigation notes so the next reviewer has the evidence.</li>
              <li>Close with the outcome, or escalate to the founder when the data of a school may be affected.</li>
              <li>If school data was exposed, record it as a privacy incident and notify the school.</li>
            </ol>
          </Panel>
        </div>
      </div>

      <DetailModal
        open={Boolean(selected)}
        onClose={() => setSignalId(null)}
        title={selected?.kind ?? ''}
        description={selected ? `${selected.id} · ${selected.severity} severity · detected ${timeAgo(selected.at)}` : ''}
        summary={selected && (
          <Callout tone={selected.severity === 'High' ? 'danger' : selected.severity === 'Medium' ? 'warning' : 'info'} title="What was detected">
            {selected.summary}
          </Callout>
        )}
        meta={selected ? [
          ['Actor', selected.actor],
          ['School', selected.school],
          ['Source', selected.source],
          ['Status', <Pill key="status" label={selected.status} />],
          ['Detected', stamp(selected.at)],
          ['Related sessions', selected.sessionIds.join(', ') || 'None'],
        ] : []}
        footer={selected && (
          <>
            <Button variant="outline" size="sm" onClick={() => addNote(selected)}><FileText className="h-4 w-4" /> Add note</Button>
            {selected.status !== 'Contained' && selected.status !== 'Closed' && (
              <Button variant="accent" size="sm" onClick={() => moveSignal(selected, 'Contained', 'Contain this incident', 'What was contained, and how?')}><Shield className="h-4 w-4" /> Contain</Button>
            )}
            {selected.status !== 'Closed' && (
              <Button variant="outline" size="sm" onClick={() => moveSignal(selected, 'Closed', 'Close this signal', 'What did you find, and what was done about it?')}><Check className="h-4 w-4" /> Close</Button>
            )}
            {selected.sessionIds.length > 0 && selected.sessionIds.some((id) => sessions.some((session) => session.id === id)) && (
              <Button variant="danger" size="sm" onClick={() => { const session = sessions.find((item) => selected.sessionIds.includes(item.id)); if (session) { setSignalId(null); revokeSession(session) } }}>
                <LogOut className="h-4 w-4" /> Revoke linked session
              </Button>
            )}
          </>
        )}
        size="lg"
      >
        {selected && (
          <>
            <MetaList items={selected.evidence} />
            <Callout tone="warning" title="Acting on a signal without a monitoring source">
              There is no identity-provider integration yet, so containment is recorded here but a revoked session would keep working in the real system. That gap
              is why this screen is labelled as a prototype.
            </Callout>
            {onNavigate && (
              <Button variant="outline" size="sm" onClick={() => onNavigate('/platform/audit')}><Warning className="h-4 w-4" /> Review the audit trail</Button>
            )}
          </>
        )}
      </DetailModal>

      <ActionDialog request={request} onClose={() => setRequest(null)} actor={operator} />

      <p className="mt-6 text-xs text-graphite">
        Security incident history is kept per signal. Every containment action, session revocation and review outcome is recorded in the action log above.
      </p>
    </>
  )
}
