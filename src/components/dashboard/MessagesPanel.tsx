import { useCallback, useEffect, useRef, useState } from 'react'
import { PaperPlaneTilt as Send, Plus, ChatText as MessageSquare, MagnifyingGlass as Search, Lock } from '@phosphor-icons/react'
import { useToast } from '@/context/ToastContext'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import Button from '@/components/ui/Button'
import Avatar from '@/components/ui/Avatar'
import EmptyState from '@/components/ui/EmptyState'
import { SkeletonRows } from '@/components/ui/Loader'
import { formatDateShort, timeAgo } from '@/utils/format'
import { cn } from '@/utils/cn'
import {
  createThread,
  fetchMessageableUsers,
  fetchMessages,
  markThreadRead,
  sendMessage,
  type MessageView,
  type MessageableUser,
  type ThreadView,
} from '@/services/communicationService'
import { errorMessage } from '@/utils/errorMessage'
import { createSignedImageUrls, BUCKETS } from '@/services/storageService'

// ---------------------------------------------------------------------------
// Phase 8 batch 7. Real message_threads, message_thread_participants, messages.
//
// PARTICIPATION IS THE WHOLE BOUNDARY, FOR EVERYONE.
//
// Every SELECT here is gated on is_thread_participant, which tests for a row in
// message_thread_participants naming auth.uid(). An owner who is not in a
// thread cannot read it, and no screen offers a way around that. Migration 14
// corrected this from a school-wide model before it was committed, and this
// component must not quietly restore the wider one.
//
// ONLY AN ADMINISTRATOR CAN OPEN A CONVERSATION, AND THAT SETTLES DECISION 7.
//
// message_threads INSERT and message_thread_participants INSERT are both
// has_school_admin_role. A teacher or guardian may reply in any thread they are
// in, but cannot start one, and cannot add themselves to one. So the compose
// button appears only for owner, director and administrator.
//
// The two options recorded against decision 7 were to build a thread-creation
// database function, or to restrict conversation-starting in the interface to
// match the policies. The second needs nothing new and is what is implemented:
// the policies already say who may open a channel, and the interface now says
// the same thing.
//
// MESSAGES CANNOT BE EDITED OR UNSENT. Neither messages nor message_threads has
// an UPDATE or DELETE policy for any school role, so no such control exists. A
// conversation record is append-only by design.
// ---------------------------------------------------------------------------

interface MessagesPanelProps {
  threads: ThreadView[]
  schoolId: string
  currentUserId: string
  /** Owner, director and administrator only. Gates the compose control. */
  canStartThread: boolean
  /** Copy for the empty state, which differs by role. */
  emptyDescription: string
  onChanged: () => void
}

type MessageableUserWithAvatar = MessageableUser & { avatarUrl: string | null }

export default function MessagesPanel({
  threads,
  schoolId,
  currentUserId,
  canStartThread,
  emptyDescription,
  onChanged,
}: MessagesPanelProps) {
  const { showToast } = useToast()

  const [activeId, setActiveId] = useState<string | null>(threads[0]?.id ?? null)
  const [messages, setMessages] = useState<MessageView[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [search, setSearch] = useState('')

  const [newModalOpen, setNewModalOpen] = useState(false)
  const [recipients, setRecipients] = useState<MessageableUserWithAvatar[]>([])
  const [newRecipientId, setNewRecipientId] = useState('')
  const [recipientSearch, setRecipientSearch] = useState('')
  const [newSubject, setNewSubject] = useState('')
  const [newMessage, setNewMessage] = useState('')
  const [creating, setCreating] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)

  const active = threads.find((t) => t.id === activeId) ?? threads[0] ?? null

  useEffect(() => {
    if (!activeId && threads.length > 0) setActiveId(threads[0].id)
  }, [threads, activeId])

  // Load the open conversation, and mark it read. Marking read touches only the
  // caller's own participant row and only its last_read_at column, which is all
  // the policy and the column grant permit.
  useEffect(() => {
    let cancelled = false
    if (!active) {
      setMessages([])
      return
    }

    setLoadingMessages(true)
    fetchMessages(schoolId, active.id)
      .then((rows) => {
        if (cancelled) return
        setMessages(rows)
        return markThreadRead(schoolId, active.id, currentUserId)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        showToast({
          type: 'error',
          title: 'Could not open the conversation',
          description: errorMessage(err),
        })
      })
      .finally(() => {
        if (!cancelled) setLoadingMessages(false)
      })

    return () => {
      cancelled = true
    }
  }, [schoolId, active, currentUserId, showToast])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length])

  const openCompose = useCallback(async () => {
    setNewSubject('')
    setNewMessage('')
    setRecipientSearch('')
    setNewModalOpen(true)
    try {
      const people = await fetchMessageableUsers(schoolId, currentUserId)
      const avatarPaths = people.map((person) => person.avatarPath).filter((path): path is string => Boolean(path))
      const avatarUrls = await createSignedImageUrls(BUCKETS.profileAvatars, avatarPaths)
      setRecipients(people.map((person) => ({
        ...person,
        avatarUrl: person.avatarPath ? avatarUrls.get(person.avatarPath) ?? null : null,
      })))
      setNewRecipientId(people[0]?.userId ?? '')
    } catch (err: unknown) {
      showToast({
        type: 'error',
        title: 'Could not load recipients',
        description: errorMessage(err),
      })
    }
  }, [schoolId, currentUserId, showToast])

  const handleSend = async () => {
    if (!active || !draft.trim()) return
    setSending(true)
    const body = draft.trim()
    try {
      await sendMessage(schoolId, active.id, body)
      setDraft('')
      const rows = await fetchMessages(schoolId, active.id)
      setMessages(rows)
      onChanged()
    } catch (err: unknown) {
      showToast({
        type: 'error',
        title: 'Message not sent',
        description: errorMessage(err),
      })
    } finally {
      setSending(false)
    }
  }

  const handleCreate = async () => {
    const recipient = recipients.find((r) => r.userId === newRecipientId)
    if (!recipient || !newMessage.trim()) {
      showToast({ type: 'error', title: 'Choose a recipient and write a message.' })
      return
    }
    setCreating(true)
    try {
      const threadId = await createThread(
        schoolId,
        newSubject.trim() || `Conversation with ${recipient.name}`,
        [recipient.userId],
        newMessage.trim(),
      )
      setActiveId(threadId)
      setNewModalOpen(false)
      showToast({ type: 'success', title: 'Message sent', description: `Your message to ${recipient.name} was delivered.` })
      onChanged()
    } catch (err: unknown) {
      showToast({
        type: 'error',
        title: 'Conversation not started',
        description: errorMessage(err),
      })
    } finally {
      setCreating(false)
    }
  }

  const filtered = threads.filter(
    (t) =>
      t.subject.toLowerCase().includes(search.toLowerCase()) ||
      t.participants.some((p) => p.name.toLowerCase().includes(search.toLowerCase())),
  )

  if (threads.length === 0) {
    return (
      <>
        <EmptyState
          icon={MessageSquare}
          title="No conversations yet"
          description={emptyDescription}
          action={
            canStartThread ? (
              <Button onClick={openCompose} icon={<Plus className="h-4 w-4" />}>
                Start a Conversation
              </Button>
            ) : undefined
          }
        />
        <ComposeModal
          open={newModalOpen}
          onClose={() => setNewModalOpen(false)}
          recipients={recipients}
          recipientId={newRecipientId}
          setRecipientId={setNewRecipientId}
          recipientSearch={recipientSearch}
          setRecipientSearch={setRecipientSearch}
          subject={newSubject}
          setSubject={setNewSubject}
          message={newMessage}
          setMessage={setNewMessage}
          onSubmit={handleCreate}
          creating={creating}
        />
      </>
    )
  }

  return (
    <>
      <div className="card grid overflow-hidden lg:grid-cols-[320px_1fr]" style={{ minHeight: 560 }}>
        <div className="flex flex-col border-b border-ink/5 dark:border-white/10 lg:border-b-0 lg:border-r">
          <div className="flex items-center gap-2 border-b border-ink/5 p-3 dark:border-white/10">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-graphite" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search conversations…"
                aria-label="Search conversations"
                className="input w-full pl-8 text-sm"
              />
            </div>
            {canStartThread && (
              <button
                type="button"
                onClick={openCompose}
                aria-label="Start a conversation"
                className="rounded-xl bg-brand p-2 text-white hover:opacity-90"
              >
                <Plus className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex-1 divide-y divide-ink/5 overflow-y-auto dark:divide-white/5">
            {filtered.map((t) => {
              const others = t.participants.filter((p) => p.userId !== currentUserId)
              const label = others.map((p) => p.name).join(', ') || 'You'
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveId(t.id)}
                  className={cn(
                    'flex w-full items-start gap-3 p-3.5 text-left hover:bg-ink/[0.03] dark:hover:bg-white/[0.03]',
                    active?.id === t.id && 'bg-ink/[0.04] dark:bg-white/[0.06]',
                  )}
                >
                  <Avatar name={label} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-ink dark:text-white">{label}</p>
                      {t.lastMessageAt && (
                        <span className="shrink-0 text-[11px] text-graphite">{timeAgo(t.lastMessageAt)}</span>
                      )}
                    </div>
                    <p className="truncate text-xs text-graphite">{t.subject}</p>
                    {t.preview && <p className="mt-0.5 truncate text-xs text-graphite/80">{t.preview}</p>}
                  </div>
                  {t.unread && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" />}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex flex-col">
          {active ? (
            <>
              <div className="border-b border-ink/5 px-5 py-3.5 dark:border-white/10">
                <p className="font-medium text-ink dark:text-white">{active.subject}</p>
                <p className="text-xs text-graphite">
                  {active.participants.map((p) => p.name).join(', ')}
                </p>
              </div>
              <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-5">
                {loadingMessages ? (
                  <SkeletonRows />
                ) : (
                  messages.map((m) => {
                    const mine = m.senderId === currentUserId
                    return (
                      <div key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                        <div
                          className={cn(
                            'max-w-[75%] rounded-2xl px-4 py-2.5',
                            mine ? 'bg-brand text-white' : 'bg-mist text-ink dark:bg-white/10 dark:text-white',
                          )}
                        >
                          {!mine && <p className="mb-0.5 text-[11px] font-semibold opacity-80">{m.senderName}</p>}
                          <p className="whitespace-pre-line text-sm leading-relaxed">{m.body}</p>
                          <p className={cn('mt-1 text-[10px]', mine ? 'text-white/70' : 'text-graphite')}>
                            {formatDateShort(m.sentAt)}
                          </p>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
              <div className="flex items-end gap-2 border-t border-ink/5 p-3 dark:border-white/10">
                <Textarea
                  rows={1}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Write a message…"
                  aria-label="Write a message"
                  className="flex-1"
                />
                <Button onClick={handleSend} disabled={sending || !draft.trim()} icon={<Send className="h-4 w-4" />}>
                  Send
                </Button>
              </div>
            </>
          ) : (
            <EmptyState icon={MessageSquare} title="Select a conversation" />
          )}
        </div>
      </div>

      {!canStartThread && (
        <p className="mt-4 flex items-center gap-2 rounded-2xl border border-ink/5 bg-white/60 px-4 py-3 text-xs text-graphite dark:border-white/10 dark:bg-white/[0.03]">
          <Lock className="h-3.5 w-3.5 shrink-0" />
          You can reply to any conversation you are part of. New conversations are opened by the school office.
        </p>
      )}

      <ComposeModal
        open={newModalOpen}
        onClose={() => setNewModalOpen(false)}
        recipients={recipients}
        recipientId={newRecipientId}
        setRecipientId={setNewRecipientId}
        recipientSearch={recipientSearch}
        setRecipientSearch={setRecipientSearch}
        subject={newSubject}
        setSubject={setNewSubject}
        message={newMessage}
        setMessage={setNewMessage}
        onSubmit={handleCreate}
        creating={creating}
      />
    </>
  )
}

function ComposeModal({
  open,
  onClose,
  recipients,
  recipientId,
  setRecipientId,
  recipientSearch,
  setRecipientSearch,
  subject,
  setSubject,
  message,
  setMessage,
  onSubmit,
  creating,
}: {
  open: boolean
  onClose: () => void
  recipients: MessageableUserWithAvatar[]
  recipientId: string
  setRecipientId: (v: string) => void
  recipientSearch: string
  setRecipientSearch: (v: string) => void
  subject: string
  setSubject: (v: string) => void
  message: string
  setMessage: (v: string) => void
  onSubmit: () => void
  creating: boolean
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Start a Conversation"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={creating || recipients.length === 0}>
            {creating ? 'Sending…' : 'Send'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {recipients.length === 0 ? (
          <p className="text-sm text-graphite">
            No one else has an active account at this school yet. A person can be messaged once they have accepted
            their invitation and signed in.
          </p>
        ) : (
          <>
            <div>
              <label htmlFor="message-recipient-search" className="label">Search people</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-graphite" aria-hidden="true" />
                <input
                  id="message-recipient-search"
                  value={recipientSearch}
                  onChange={(event) => setRecipientSearch(event.target.value)}
                  placeholder="Search teachers and parents by name"
                  className="input pl-9"
                  autoComplete="off"
                />
              </div>
              <div className="mt-2 max-h-52 space-y-1 overflow-y-auto" aria-label="Message recipients">
                {recipients
                  .filter((recipient) => `${recipient.name} ${recipient.role}`.toLowerCase().includes(recipientSearch.trim().toLowerCase()))
                  .map((recipient) => (
                    <button
                      key={recipient.userId}
                      type="button"
                      aria-pressed={recipientId === recipient.userId}
                      onClick={() => setRecipientId(recipient.userId)}
                      className={`flex min-h-14 w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left ${recipientId === recipient.userId ? 'bg-brand/10' : 'hover:bg-ink/5 dark:hover:bg-white/10'}`}
                    >
                      <Avatar name={recipient.name} size="sm" src={recipient.avatarUrl ?? undefined} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink dark:text-white">{recipient.name}</span>
                        <span className="block truncate text-xs text-graphite">{recipient.role}</span>
                      </span>
                    </button>
                  ))}
                {recipients.every((recipient) => !`${recipient.name} ${recipient.role}`.toLowerCase().includes(recipientSearch.trim().toLowerCase())) && (
                  <p className="px-2 py-3 text-sm text-graphite">No matching contacts.</p>
                )}
              </div>
            </div>
            <div className="rounded-lg border border-ink/[0.08] p-3 dark:border-white/10">
              {(() => {
                const recipient = recipients.find((person) => person.userId === recipientId)
                return recipient ? (
                  <div className="flex items-center gap-3">
                    <Avatar name={recipient.name} size="sm" src={recipient.avatarUrl ?? undefined} />
                    <div className="min-w-0"><p className="truncate text-sm font-semibold">{recipient.name}</p><p className="text-xs text-graphite">{recipient.role}</p></div>
                  </div>
                ) : <p className="text-sm text-graphite">Select a person to message.</p>
              })()}
            </div>
            <Input label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Optional" />
            <Textarea
              label="Message"
              required
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </>
        )}
      </div>
    </Modal>
  )
}
