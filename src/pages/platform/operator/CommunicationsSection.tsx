import { useMemo, useState } from 'react'
import { ArrowClockwise as RefreshCw, CaretRight as ChevronRight, Check, Megaphone, PaperPlaneTilt, Trash, Users, Warning } from '@phosphor-icons/react'
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
  relativeDays,
  stamp,
  useActionLog,
  type ActionRequest,
  type Column,
} from './PrototypeKit'
import { platformAnnouncements, sampleSchools } from './prototypeData'
import { timeAgo } from '@/utils/format'

type Announcement = typeof platformAnnouncements[number]

const statusOptions = ['All', 'Draft', 'Scheduled', 'Sent', 'Partially failed'] as const
const audienceOptions = [
  'All school administrators',
  'Administrators of affected schools',
  'All school staff (teachers and administrators)',
  'Guardians on Growth and Enterprise plans',
  'Platform operators only',
  'A single school',
] as const

export default function CommunicationsSection({ onNotify, operator }: { onNotify: (message: string) => void; operator: string }) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([...platformAnnouncements])
  const [status, setStatus] = useState<(typeof statusOptions)[number]>('All')
  const [announcementId, setAnnouncementId] = useState<string | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [request, setRequest] = useState<ActionRequest | null>(null)
  const [verified, setVerified] = useState<Array<{ label: string; value: string; ok?: boolean }> | null>(null)
  const { entries, record } = useActionLog(operator)

  const visible = useMemo(() => announcements.filter((item) => status === 'All' || item.status === status), [announcements, status])
  const selected = useMemo(() => announcements.find((item) => item.id === announcementId) ?? null, [announcements, announcementId])

  const sent = announcements.filter((item) => item.status === 'Sent')
  const drafts = announcements.filter((item) => item.status === 'Draft')
  const partial = announcements.filter((item) => item.status === 'Partially failed')
  const deliveredTotal = sent.reduce((sum, item) => sum + item.delivered, 0)
  const failedTotal = announcements.reduce((sum, item) => sum + item.failed, 0)

  const sendNow = (announcement: Announcement) => {
    setRequest({
      title: 'Send this announcement now',
      target: `${announcement.id} · ${announcement.audience}`,
      description: `The message goes to ${announcement.recipients.toLocaleString()} recipients through ${announcement.channel.toLowerCase()}. A platform-wide message needs a second operator.`,
      confirmLabel: 'Send now',
      requiresReason: true,
      requiresApproval: announcement.recipients > 50,
      reasonLabel: 'Why is this being sent now?',
      options: [{ key: 'test', label: 'Send a copy to the operator team first', defaultChecked: true }],
      onConfirm: ({ reason, approver, options }) => {
        setAnnouncements((current) => current.map((item) => item.id === announcement.id
          ? { ...item, status: 'Sent', sentAt: new Date().toISOString(), delivered: item.recipients, failed: 0 }
          : item))
        record({
          action: 'Sent a platform announcement',
          target: `${announcement.id} · ${announcement.audience}`,
          reason,
          approver: approver || undefined,
          before: announcement.status,
          after: 'Sent',
          result: 'Applied',
          options: options.test ? ['Test copy sent to the operator team first'] : [],
        })
        setVerified([
          { label: 'Announcement', value: announcement.title },
          { label: 'Recipients', value: announcement.recipients.toLocaleString() },
          { label: 'Channel', value: announcement.channel },
          { label: 'Delivery confirmed', value: 'Not yet — no email provider is connected', ok: false },
        ])
        setAnnouncementId(null)
        onNotify(`${announcement.title} queued for ${announcement.recipients.toLocaleString()} recipients.`)
      },
    })
  }

  const retryFailed = (announcement: Announcement) => {
    setRequest({
      title: 'Retry undelivered recipients',
      target: `${announcement.id} · ${announcement.failed} recipient${announcement.failed === 1 ? '' : 's'}`,
      description: 'Only the recipients that did not receive the message are tried again, so nobody is messaged twice.',
      confirmLabel: `Retry ${announcement.failed}`,
      requiresReason: true,
      onConfirm: ({ reason }) => {
        setAnnouncements((current) => current.map((item) => item.id === announcement.id
          ? { ...item, status: 'Sent', delivered: item.recipients, failed: 0 }
          : item))
        record({
          action: 'Retried undelivered recipients',
          target: `${announcement.id} · ${announcement.audience}`,
          reason,
          before: `${announcement.failed} undelivered`,
          after: 'All delivered',
          result: 'Applied',
        })
        setVerified([
          { label: 'Announcement', value: announcement.title },
          { label: 'Recipients retried', value: announcement.failed.toString() },
          { label: 'Delivered after retry', value: announcement.recipients.toLocaleString() },
          { label: 'Still failing', value: '0' },
        ])
        setAnnouncementId(null)
        onNotify(`${announcement.failed} recipients retried.`)
      },
    })
  }

  const deleteDraft = (announcement: Announcement) => {
    setRequest({
      title: 'Delete this draft',
      target: `${announcement.id} · ${announcement.title}`,
      description: 'A draft has never been sent, so nothing has left the platform. The deletion is recorded.',
      confirmLabel: 'Delete draft',
      danger: true,
      requiresReason: true,
      onConfirm: ({ reason }) => {
        setAnnouncements((current) => current.filter((item) => item.id !== announcement.id))
        record({ action: 'Deleted a draft announcement', target: `${announcement.id} · ${announcement.title}`, reason, before: 'Draft', after: 'Deleted', result: 'Applied' })
        setVerified([
          { label: 'Draft', value: announcement.title },
          { label: 'State', value: 'Draft → Deleted' },
          { label: 'Nobody was messaged', value: 'Correct — it was never sent', ok: true },
        ])
        setAnnouncementId(null)
        onNotify('Draft deleted.')
      },
    })
  }

  const createAnnouncement = (input: { title: string; body: string; audience: string; channel: Announcement['channel']; sendNow: boolean }) => {
    const id = `ANN-${Math.floor(62 + Math.random() * 30)}`
    const recipients = input.audience.includes('single school') ? 1 : input.audience.includes('operators') ? 5 : input.audience.includes('Guardians') ? 18_400 : sampleSchools.length * 8
    const announcement: Announcement = {
      id,
      title: input.title,
      audience: input.audience,
      channel: input.channel,
      status: input.sendNow ? 'Sent' : 'Draft',
      sentAt: input.sendNow ? new Date().toISOString() : null,
      recipients: input.sendNow ? recipients : 0,
      delivered: 0,
      failed: 0,
      author: operator,
      body: input.body,
    }
    setAnnouncements((current) => [announcement, ...current])
    record({
      action: input.sendNow ? 'Sent a platform announcement' : 'Drafted a platform announcement',
      target: `${id} · ${input.audience}`,
      reason: input.sendNow ? 'Sent directly from the composer.' : 'Drafted for review before sending.',
      before: 'Not created',
      after: input.sendNow ? `Sent to ${recipients.toLocaleString()} recipients` : 'Draft',
      result: input.sendNow ? 'Queued' : 'Applied',
    })
    setVerified([
      { label: 'Announcement', value: `${id} · ${input.title}` },
      { label: 'Audience', value: input.audience },
      { label: 'Channel', value: input.channel },
      { label: 'State', value: input.sendNow ? `Queued for ${recipients.toLocaleString()} recipients` : 'Saved as a draft' },
    ])
    setComposerOpen(false)
    onNotify(input.sendNow ? `${id} queued.` : `${id} saved as a draft.`)
  }

  const exportAnnouncements = () => {
    downloadCsv('platform-announcements.csv', [
      ['Announcement', 'Title', 'Audience', 'Channel', 'Status', 'Sent', 'Recipients', 'Delivered', 'Failed', 'Author'],
      ...announcements.map((item) => [item.id, item.title, item.audience, item.channel, item.status, item.sentAt ?? '', item.recipients, item.delivered, item.failed, item.author]),
    ])
    onNotify('Announcement history exported.')
  }

  const columns: Array<Column<Announcement>> = [
    { key: 'title', label: 'Announcement', width: 'minmax(0,1.6fr)', render: (item) => <span><span className="block font-semibold">{item.title}</span><span className="block truncate text-xs text-graphite">{item.body}</span></span> },
    { key: 'audience', label: 'Audience', width: 'minmax(0,1.2fr)', render: (item) => <span className="text-xs text-graphite">{item.audience}</span> },
    { key: 'channel', label: 'Channel', render: (item) => <Pill label={item.channel} tone="info" /> },
    { key: 'delivery', label: 'Delivery', render: (item) => <span className="text-xs text-graphite">{item.recipients ? `${item.delivered.toLocaleString()} of ${item.recipients.toLocaleString()}` : 'Not sent'}{item.failed > 0 && <span className="mt-1 block font-semibold text-red-600 dark:text-red-300">{item.failed} failed</span>}</span> },
    { key: 'status', label: 'Status', render: (item) => <Pill label={item.status} /> },
    { key: 'when', label: 'When', render: (item) => <span className="text-xs text-graphite">{item.sentAt ? (new Date(item.sentAt).getTime() > Date.now() ? relativeDays(item.sentAt) : timeAgo(item.sentAt)) : 'Not sent'}</span> },
  ]

  return (
    <>
      <SectionHeader
        eyebrow="Platform messaging"
        title="Communications"
        description="Messages that go to every school at once, with who received them and who did not."
        action={<ExportButton onClick={exportAnnouncements} label="Export history" />}
      />
      <PrototypeNotice
        scope="Communications"
        detail="Announcements belong to a single school in the database. There is no table for a message addressed to every school at once, and no email or SMS provider is connected, so nothing here could be sent or saved. The composer, approvals, delivery results and retries behave as they will once that exists."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Announcements sent" value={sent.length.toString()} detail={`${sent.reduce((sum, item) => sum + item.recipients, 0).toLocaleString()} recipients in total`} icon={Megaphone} tone="success" />
        <KpiTile label="Drafts waiting" value={drafts.length.toString()} detail={drafts.map((item) => item.title).join(', ') || 'No draft is waiting'} icon={PaperPlaneTilt} tone={drafts.length ? 'warning' : 'success'} />
        <KpiTile label="Undelivered messages" value={failedTotal.toString()} detail={partial.length ? `${partial.length} announcement needs a retry` : 'Every message reached its recipient'} icon={Warning} tone={failedTotal ? 'danger' : 'success'} />
        <KpiTile label="Delivered" value={deliveredTotal.toLocaleString()} detail="Confirmed by the delivery provider" icon={Users} />
      </div>

      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterChips options={statusOptions} value={status} onChange={setStatus} label="Status" />
        <Button variant="accent" size="sm" onClick={() => setComposerOpen(true)}><PaperPlaneTilt className="h-4 w-4" /> New announcement</Button>
      </div>

      <div className="mt-5">
        <Panel title="Announcements" description="Open one to see its delivery result and act on it." action={<SampleTag />}>
          <DataTable columns={columns} rows={visible} rowKey={(item) => item.id} onRow={(item) => setAnnouncementId(item.id)} emptyLabel="No announcement matches this filter." />
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <ActionLogPanel entries={entries} description="Messages drafted, sent and retried from this session." />
        {verified
          ? <VerificationPanel title="Result of the last action" checks={verified} note="Delivery is confirmed by the email or SMS provider reporting back. No provider is connected yet." />
          : <Panel title="Verify the result" description="Every message reports who received it."><p className="text-sm text-graphite">Draft or send an announcement to see the confirmation here.</p></Panel>}
      </div>

      <DetailModal
        open={Boolean(selected)}
        onClose={() => setAnnouncementId(null)}
        title={selected?.title ?? ''}
        description={selected ? `${selected.id} · ${selected.audience}` : ''}
        summary={selected && (
          <Callout tone={selected.status === 'Sent' ? 'success' : selected.status === 'Partially failed' ? 'danger' : selected.status === 'Draft' ? 'info' : 'warning'} title={`${selected.status} · ${selected.channel}`}>
            {selected.body}
          </Callout>
        )}
        meta={selected ? [
          ['Audience', selected.audience],
          ['Channel', selected.channel],
          ['Sent', selected.sentAt ? `${stamp(selected.sentAt)}${new Date(selected.sentAt).getTime() > Date.now() ? ` · scheduled ${relativeDays(selected.sentAt)}` : ` · ${timeAgo(selected.sentAt)}`}` : 'Not sent'],
          ['Recipients', selected.recipients ? selected.recipients.toLocaleString() : 'Not sent yet'],
          ['Delivered', selected.delivered.toLocaleString()],
          ['Undelivered', selected.failed.toString()],
          ['Author', selected.author],
        ] : []}
        footer={selected && (
          <>
            {selected.status === 'Draft' && <Button variant="accent" size="sm" onClick={() => sendNow(selected)}><PaperPlaneTilt className="h-4 w-4" /> Send now</Button>}
            {selected.status !== 'Sent' && selected.status !== 'Draft' && <Button variant="accent" size="sm" onClick={() => sendNow(selected)}><PaperPlaneTilt className="h-4 w-4" /> Send now</Button>}
            {selected.failed > 0 && <Button variant="outline" size="sm" onClick={() => retryFailed(selected)}><RefreshCw className="h-4 w-4" /> Retry {selected.failed} undelivered</Button>}
            {selected.status === 'Draft' && <Button variant="danger" size="sm" onClick={() => deleteDraft(selected)}><Trash className="h-4 w-4" /> Delete draft</Button>}
          </>
        )}
        size="lg"
      >
        {selected && (
          <>
            <MetaList
              columns={1}
              items={[
                ['Who receives this', 'Only the audience chosen. A message about one school\'s incident goes to that school, never to everyone.'],
                ['Undelivered recipients', selected.failed > 0 ? `${selected.failed} recipient${selected.failed === 1 ? '' : 's'} did not receive it. A retry targets only those addresses.` : 'Everyone in the audience received the message.'],
                ['What is missing', 'There is no platform announcement table, and no provider is connected, so a real send cannot happen from here.'],
              ]}
            />
            <p className="flex items-center gap-2 text-xs text-graphite">
              <Check className="h-3.5 w-3.5" /> Messages to more than 50 recipients need a second operator, and a test copy can be sent to the operator team first.
            </p>
          </>
        )}
      </DetailModal>

      {composerOpen && (
        <ComposerModal
          onClose={() => setComposerOpen(false)}
          onCreate={createAnnouncement}
        />
      )}

      <ActionDialog request={request} onClose={() => setRequest(null)} actor={operator} />

      <p className="mt-6 flex items-center gap-2 text-xs text-graphite">
        <ChevronRight className="h-3.5 w-3.5" /> School-level announcements stay in the school workspace. This screen only covers messages written by the platform team.
      </p>
    </>
  )
}

function ComposerModal({ onClose, onCreate }: {
  onClose: () => void
  onCreate: (input: { title: string; body: string; audience: string; channel: Announcement['channel']; sendNow: boolean }) => void
}) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [audience, setAudience] = useState<string>(audienceOptions[0])
  const [channel, setChannel] = useState<Announcement['channel']>('Email')
  const [error, setError] = useState<string | null>(null)

  const save = (sendNow: boolean) => {
    if (title.trim().length < 4) { setError('Give the announcement a title.'); return }
    if (body.trim().length < 20) { setError('Write at least a sentence (20 characters).'); return }
    onCreate({ title: title.trim(), body: body.trim(), audience, channel, sendNow })
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="New platform announcement"
      description="Written by the platform team and sent to the schools you choose."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="outline" onClick={() => save(false)}>Save as draft</Button>
          <Button variant="accent" onClick={() => save(true)}>Queue for sending</Button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block"><span className="label">Title</span><input value={title} onChange={(event) => setTitle(event.target.value)} className="input" placeholder="Scheduled maintenance on Saturday" /></label>
        <label className="block">
          <span className="label">Message</span>
          <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={5} className="input resize-none" placeholder="What is happening, when, and what the school needs to do about it." />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="label">Audience</span>
            <select value={audience} onChange={(event) => setAudience(event.target.value)} className="input py-2">
              {audienceOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="label">Channel</span>
            <select value={channel} onChange={(event) => setChannel(event.target.value as Announcement['channel'])} className="input py-2">
              {['In-app', 'Email', 'SMS'].map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
        </div>
        <Callout tone="info" title="Before it is sent">
          More than 50 recipients needs a second operator. Keeping the audience narrow is the difference between telling the schools affected and alarming every
          school on the platform.
        </Callout>
        {error && <p role="alert" className="text-sm font-semibold text-red-600 dark:text-red-300">{error}</p>}
      </div>
    </Modal>
  )
}
