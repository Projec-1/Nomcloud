import { useMemo, useState } from 'react'
import { ArrowClockwise as RefreshCw, CaretRight as ChevronRight, Eye, PlugsConnected, Pulse as Activity, Warning } from '@phosphor-icons/react'
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
  ResultBadge,
  SearchBox,
  SectionHeader,
  Toolbar,
  VerificationPanel,
  downloadCsv,
  stamp,
  useActionLog,
  type ActionRequest,
  type Column,
} from './PrototypeKit'
import { activityEvents, sampleOperators, type ActivityEvent, type ActivityKind } from './prototypeData'
import { timeAgo } from '@/utils/format'

const kindOptions = ['All', 'School', 'User', 'Billing', 'Delivery', 'Integration', 'Security'] as const
const outcomeOptions = ['All', 'Completed', 'Warning', 'Failed'] as const
const windowOptions = ['Last 24 hours', 'Last 7 days', 'Last 30 days', 'All time'] as const

type KindFilter = (typeof kindOptions)[number]
type OutcomeFilter = (typeof outcomeOptions)[number]
type WindowFilter = (typeof windowOptions)[number]

const windowHours: Record<WindowFilter, number> = {
  'Last 24 hours': 24,
  'Last 7 days': 24 * 7,
  'Last 30 days': 24 * 30,
  'All time': Number.POSITIVE_INFINITY,
}

export default function ActivitySection({ onNotify, onNavigate, operator }: { onNotify: (message: string) => void; onNavigate?: (path: string) => void; operator: string }) {
  const [events, setEvents] = useState<ActivityEvent[]>(activityEvents)
  const [kind, setKind] = useState<KindFilter>('All')
  const [outcome, setOutcome] = useState<OutcomeFilter>('All')
  const [window, setWindow] = useState<WindowFilter>('Last 7 days')
  const [school, setSchool] = useState('All schools')
  const [actor, setActor] = useState('Anyone')
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [request, setRequest] = useState<ActionRequest | null>(null)
  const [lastAction, setLastAction] = useState<{ event: ActivityEvent; summary: string } | null>(null)
  const { entries, record } = useActionLog(operator)

  const schools = useMemo(() => ['All schools', ...Array.from(new Set(events.map((event) => event.school)))], [events])
  const actors = useMemo(() => ['Anyone', ...Array.from(new Set(events.map((event) => event.actor)))], [events])

  const visible = useMemo(() => events.filter((event) => {
    const ageHours = (Date.now() - new Date(event.at).getTime()) / 3_600_000
    if (ageHours > windowHours[window]) return false
    if (kind !== 'All' && event.kind !== kind) return false
    if (outcome !== 'All' && event.outcome !== outcome) return false
    if (school !== 'All schools' && event.school !== school) return false
    if (actor !== 'Anyone' && event.actor !== actor) return false
    if (query && !`${event.title} ${event.summary} ${event.target} ${event.school} ${event.id}`.toLowerCase().includes(query.toLowerCase())) return false
    return true
  }), [events, kind, outcome, window, school, actor, query])

  const selected = useMemo(() => events.find((event) => event.id === openId) ?? null, [events, openId])
  const failedDeliveries = visible.filter((event) => (event.kind === 'Delivery' || event.kind === 'Integration') && event.outcome === 'Failed')
  const unresolvedWarnings = visible.filter((event) => event.outcome === 'Warning')

  const openRetry = (event: ActivityEvent) => {
    setRequest({
      title: 'Retry this delivery',
      target: `${event.id} · ${event.target}`,
      description: 'The failed delivery is queued again with the current credentials. The result appears in this feed when the provider answers.',
      confirmLabel: 'Queue retry',
      requiresReason: true,
      options: [{ key: 'notify', label: `Notify ${event.school} that a delivery is being retried`, defaultChecked: true }],
      onConfirm: ({ reason, options }) => {
        setEvents((current) => current.map((item) => item.id === event.id ? { ...item, outcome: 'Warning', details: [...item.details, ['Retry', 'Queued by operator']] } : item))
        record({
          action: 'Queued delivery retry',
          target: `${event.id} · ${event.target}`,
          reason,
          before: 'Failed',
          after: 'Queued for retry',
          result: 'Queued',
          options: options.notify ? ['School notified'] : [],
        })
        setLastAction({ event, summary: 'Delivery queued for retry' })
        onNotify(`Retry queued for ${event.id}.`)
      },
    })
  }

  const openFollowUp = (event: ActivityEvent) => {
    setRequest({
      title: 'Flag this event for investigation',
      target: `${event.id} · ${event.title}`,
      description: 'Adds the event to the Action Center so another operator can pick it up with the full context.',
      confirmLabel: 'Flag event',
      requiresApproval: event.kind === 'Security',
      options: [{ key: 'notify', label: `Notify ${event.school} that an operator is looking into this` }],
      onConfirm: ({ reason, approver, options }) => {
        record({
          action: 'Flagged event for investigation',
          target: `${event.id} · ${event.title}`,
          reason,
          approver: approver || undefined,
          before: event.outcome,
          after: 'Under investigation',
          result: 'Escalated',
          options: options.notify ? ['School notified'] : [],
        })
        setLastAction({ event, summary: 'Flagged for investigation' })
        onNotify(`${event.id} flagged for investigation.`)
      },
    })
  }

  const exportFeed = () => {
    downloadCsv('platform-activity.csv', [
      ['Event', 'Time', 'Type', 'School', 'Actor', 'Title', 'Target', 'Outcome'],
      ...visible.map((event) => [event.id, event.at, event.kind, event.school, event.actor, event.title, event.target, event.outcome]),
    ])
    onNotify(`${visible.length} events exported.`)
  }

  const columns: Array<Column<ActivityEvent>> = [
    {
      key: 'event',
      label: 'Event',
      width: 'minmax(0,1.6fr)',
      render: (event) => (
        <span className="flex items-start gap-3">
          <span className="mt-0.5 rounded-xl bg-brand/10 p-2 text-brand"><Activity className="h-4 w-4" /></span>
          <span className="min-w-0">
            <span className="block font-semibold">{event.title}</span>
            <span className="mt-0.5 block break-words text-xs text-graphite">{event.summary}</span>
          </span>
        </span>
      ),
    },
    { key: 'kind', label: 'Type', render: (event) => <Pill label={event.kind} /> },
    { key: 'school', label: 'School', width: 'minmax(0,1fr)', render: (event) => <span className="text-sm">{event.school}</span> },
    { key: 'actor', label: 'Actor', render: (event) => <span className="text-sm text-graphite">{event.actor}</span> },
    { key: 'outcome', label: 'Outcome', render: (event) => <ResultBadge result={event.outcome} /> },
    { key: 'when', label: 'When', render: (event) => <span className="text-xs text-graphite">{timeAgo(event.at)}</span> },
  ]

  return (
    <>
      <SectionHeader
        eyebrow="Live operations feed"
        title="Activity"
        description="Everything that happened across the network, with the record behind each event and the tools to act on it."
        action={<ExportButton onClick={exportFeed} label="Export feed" />}
      />
      <PrototypeNotice
        scope="Activity"
        detail="A live feed would read the audit log, which exists but is never written to yet — no trigger, function or service records an event into it. Until something does, these sample events stand in for it, and the retry and follow-up actions change this screen only."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Events in window" value={visible.length.toLocaleString()} detail={`${window.toLowerCase()} · ${events.length} total in sample data`} icon={Activity} />
        <KpiTile label="Failed deliveries" value={failedDeliveries.length.toString()} detail="Email, SMS and webhook events that did not reach their destination" icon={PlugsConnected} tone={failedDeliveries.length ? 'danger' : 'success'} />
        <KpiTile label="Open warnings" value={unresolvedWarnings.length.toString()} detail="Events an operator has not acted on" icon={Warning} tone={unresolvedWarnings.length ? 'warning' : 'success'} />
        <KpiTile label="Actions this session" value={entries.length.toString()} detail="Recorded in the action log below" icon={RefreshCw} tone="brand" />
      </div>

      <div className="mt-6 space-y-4">
        <Toolbar>
          <SearchBox value={query} onChange={setQuery} placeholder="Search events, targets or schools…" label="Search activity" />
          <Dropdown label="School" value={school} onChange={setSchool} options={schools.map((value) => ({ value, label: value }))} />
          <Dropdown label="Actor" value={actor} onChange={setActor} options={actors.map((value) => ({ value, label: value }))} />
        </Toolbar>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <FilterChips options={kindOptions} value={kind} onChange={setKind} label="Event type" />
          <FilterChips options={outcomeOptions} value={outcome} onChange={setOutcome} label="Outcome" />
          <FilterChips options={windowOptions} value={window} onChange={setWindow} label="Date range" />
        </div>
      </div>

      <div className="mt-5">
        <DataTable columns={columns} rows={visible} rowKey={(event) => event.id} onRow={(event) => setOpenId(event.id)} emptyLabel="No activity matches these filters." />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <ActionLogPanel entries={entries} description="Every retry and escalation taken from the activity feed." />
        {lastAction ? (
          <VerificationPanel
            title="Last action verified"
            checks={[
              { label: 'Event', value: `${lastAction.event.id} · ${lastAction.event.title}` },
              { label: 'Action taken', value: lastAction.summary },
              { label: 'Current outcome', value: events.find((event) => event.id === lastAction.event.id)?.outcome ?? 'Unknown', ok: true },
              { label: 'Recorded in log', value: `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} on this screen`, ok: true },
            ]}
            note="Nothing was sent to a provider or a school: the backend that would do that is not connected yet."
          />
        ) : (
          <Panel title="Verify the result" description="After a retry or escalation, this panel confirms what changed.">
            <p className="text-sm text-graphite">Open an event and act on it to see the before-and-after confirmation here.</p>
          </Panel>
        )}
      </div>

      <DetailModal
        open={Boolean(selected)}
        onClose={() => setOpenId(null)}
        title={selected?.title ?? ''}
        description={selected ? `${selected.id} · ${selected.kind} event` : ''}
        summary={selected && (
          <Callout tone={selected.outcome === 'Failed' ? 'danger' : selected.outcome === 'Warning' ? 'warning' : 'success'} title={selected.outcome === 'Failed' ? 'This event did not complete' : selected.outcome === 'Warning' ? 'This event needs a decision' : 'This event completed'}>
            {selected.summary}
          </Callout>
        )}
        meta={selected ? [
          ['Occurred', stamp(selected.at)],
          ['School', selected.school],
          ['Actor', selected.actor],
          ['Related record', selected.target],
          ['Outcome', <ResultBadge key="outcome" result={selected.outcome} />],
          ['Type', <Pill key="kind" label={selected.kind} />],
        ] : []}
        footer={selected && (
          <>
            <button onClick={() => { setOpenId(null); onNavigate?.(selected.kind === 'Security' ? '/platform/security' : selected.kind === 'Billing' ? '/platform/billing' : '/platform/schools') }} className="btn-outline px-4 py-2 text-sm">
              <Eye className="mr-2 inline h-4 w-4" /> Open related record
            </button>
            {(selected.kind === 'Delivery' || selected.kind === 'Integration') && selected.outcome !== 'Completed' && (
              <button onClick={() => { setOpenId(null); openRetry(selected) }} className="btn-accent px-4 py-2 text-sm">
                <RefreshCw className="mr-2 inline h-4 w-4" /> Retry delivery
              </button>
            )}
            {selected.outcome === 'Warning' && (
              <button onClick={() => { setOpenId(null); openFollowUp(selected) }} className="btn px-4 py-2 text-sm">
                <Warning className="mr-2 inline h-4 w-4" /> Flag for investigation
              </button>
            )}
          </>
        )}
        size="lg"
      >
        {selected && (
          <>
            <MetaList columns={2} items={selected.details} />
            <Callout tone="info" title="What this event carries">
              An event like this will store its own payload, the actor that caused it, the school it belongs to and the attempts made. The backend tables for that are not written yet.
            </Callout>
            {entries.some((entry) => entry.target.startsWith(selected.id)) && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-graphite">Operator actions on this event</p>
                <ul className="space-y-2 text-sm">
                  {entries.filter((entry) => entry.target.startsWith(selected.id)).map((entry) => (
                    <li key={entry.id} className="rounded-xl bg-ink/[0.035] p-3 dark:bg-white/[0.05]">
                      <p className="font-semibold">{entry.action}</p>
                      <p className="mt-1 text-xs text-graphite">{stamp(entry.at)} · {entry.operator} · {entry.before} → {entry.after}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </DetailModal>

      <ActionDialog request={request} onClose={() => setRequest(null)} actor={operator} />

      <p className="mt-6 flex flex-wrap items-center gap-2 text-xs text-graphite">
        <ChevronRight className="h-3.5 w-3.5" /> Operators in the sample directory: {sampleOperators.map((item) => item.name).join(', ')}.
      </p>
    </>
  )
}
