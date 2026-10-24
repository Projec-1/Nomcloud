import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Checks as CheckCheck, Megaphone, BookOpen, CalendarCheck, Wallet, ClipboardText as ClipboardCheck, ChatText as MessageSquare } from '@phosphor-icons/react'
import PageHeader from '@/components/ui/PageHeader'
import { useLanguage } from '@/context/LanguageContext'
import Button from '@/components/ui/Button'
import ResourceGate from '@/components/ui/ResourceGate'
import { timeAgo } from '@/utils/format'
import { cn } from '@/utils/cn'
import { useNotifications } from '@/hooks/useCommunications'
import { markNotificationsRead } from '@/services/communicationService'
import { ThinkingOrb } from 'thinking-orbs'
import { useToast } from '@/context/ToastContext'
import { errorMessage } from '@/utils/errorMessage'

// Phase 8 batch 7. Real notifications, READ ONLY.
//
// See NotificationsDropdown for the full reasoning. In short: notifications has
// no INSERT policy for any school role and nothing in the system writes one, so
// this page renders its empty state until an emitter exists (open decision 8).
// Marking read touches only `read_at` on the caller's own rows, which the column
// grant and the policy both confine.

const iconByType: Record<string, typeof Bell> = {
  announcement: Megaphone,
  grade: BookOpen,
  attendance: CalendarCheck,
  fee: Wallet,
  homework: ClipboardCheck,
  message: MessageSquare,
}

export default function ParentNotifications() {
  const { t } = useLanguage()
  const { state, notifications, unreadCount, schoolId, userId, reload } = useNotifications()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [pendingReadIds, setPendingReadIds] = useState<Set<string>>(new Set())
  const [markingAll, setMarkingAll] = useState(false)
  const pendingReadRef = useRef(new Set<string>())

  const markRead = async (ids: string[], all = false) => {
    if (!schoolId || !userId || ids.length === 0) return
    const requestedIds = ids.filter((id) => !pendingReadRef.current.has(id))
    if (requestedIds.length === 0) return
    requestedIds.forEach((id) => pendingReadRef.current.add(id))
    setPendingReadIds((current) => new Set([...current, ...requestedIds]))
    if (all) setMarkingAll(true)
    try {
      await markNotificationsRead(schoolId, userId, requestedIds)
      reload()
    } catch (error: unknown) {
      showToast({ type: 'error', title: 'Could not update notifications', description: errorMessage(error) })
    } finally {
      requestedIds.forEach((id) => pendingReadRef.current.delete(id))
      setPendingReadIds((current) => {
        const next = new Set(current)
        requestedIds.forEach((id) => next.delete(id))
        return next
      })
      if (all) setMarkingAll(false)
    }
  }

  return (
    <div>
      <PageHeader
        title={t('parent.notifications.title')}
        description={unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up"}
        actions={
          unreadCount > 0 ? (
            <Button
              variant="outline"
              size="sm"
              loading={markingAll}
              disabled={markingAll}
              onClick={() => void markRead(notifications.filter((n) => !n.readAt).map((n) => n.id), true)}
              icon={<CheckCheck className="h-4 w-4" />}
            >
              Mark all as read
            </Button>
          ) : undefined
        }
      />

      <ResourceGate
        state={state}
        empty={{
          icon: Bell,
          title: 'No notifications yet',
          description: 'Updates about grades, attendance, fees and more will show up here.',
        }}
        deniedHint="Notifications are available to signed-in school members."
      >
        {(rows) => (
          <div className="card divide-y divide-ink/5 dark:divide-white/5">
            {rows.map((n) => {
              const Icon = iconByType[n.type] ?? Bell
              const markingRead = pendingReadIds.has(n.id)
              return (
                <button
                  key={n.id}
                  type="button"
                  disabled={markingRead}
                  aria-busy={markingRead || undefined}
                  onClick={() => {
                    void markRead([n.id])
                    if (n.link) navigate(n.link)
                  }}
                  className={cn(
                    'flex w-full items-start gap-3 px-5 py-4 text-left hover:bg-ink/[0.03] dark:hover:bg-white/[0.03]',
                    !n.readAt && 'bg-brand/[0.04]',
                  )}
                >
                  <span className="mt-0.5 rounded-xl bg-ink/5 p-2 text-graphite dark:bg-white/10">
                    {markingRead ? <ThinkingOrb state="working" size={20} color="#C9471B" aria-label="Marking notification as read" /> : <Icon className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink dark:text-white">{n.title}</span>
                    <span className="block text-xs text-graphite">{n.body}</span>
                    <span className="mt-0.5 block text-[11px] text-graphite">{timeAgo(n.createdAt)}</span>
                  </span>
                  {!n.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" />}
                </button>
              )
            })}
          </div>
        )}
      </ResourceGate>
    </div>
  )
}
