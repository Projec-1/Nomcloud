import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Checks as CheckCheck, Megaphone, BookOpen, CalendarCheck, Wallet, ClipboardText as ClipboardCheck, ChatText as MessageSquare } from '@phosphor-icons/react'
import { timeAgo } from '@/utils/format'
import { cn } from '@/utils/cn'
import EmptyState from '@/components/ui/EmptyState'
import { useNotifications } from '@/hooks/useCommunications'
import { markNotificationsRead } from '@/services/communicationService'

// ---------------------------------------------------------------------------
// Phase 8 batch 7. Real notifications, READ ONLY.
//
// NOTHING IN THIS SYSTEM CREATES A NOTIFICATION, and this component does not
// either. notifications has SELECT, UPDATE and DELETE policies all keyed on
// `user_id = auth.uid()`, and NO INSERT POLICY FOR ANY SCHOOL ROLE. Migration 14
// established that deliberately after confirming no migration, trigger or edge
// function writes one, and that the table is empty.
//
// So expect this to render its empty state, always, until an emitter exists.
// That is honest rather than broken, and it is the state open decision 8 covers.
//
// Marking read is not a write path to the feature: the UPDATE column grant
// admits exactly `read_at`, so a user can mark their own notification seen and
// change nothing else, and cannot bring one into existence.
//
// The prototype resolved "whose notifications" through a client-side
// `scopeKey(role, teacherId, guardianId)` string. That concept has no
// counterpart in the real schema and is gone: a notification belongs to a USER,
// and the policy says so.
// ---------------------------------------------------------------------------

const iconByType: Record<string, typeof Bell> = {
  announcement: Megaphone,
  grade: BookOpen,
  attendance: CalendarCheck,
  fee: Wallet,
  homework: ClipboardCheck,
  message: MessageSquare,
}

export default function NotificationsDropdown() {
  const { notifications, unreadCount, schoolId, userId, reload } = useNotifications()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const markRead = async (ids: string[]) => {
    if (!schoolId || !userId || ids.length === 0) return
    try {
      await markNotificationsRead(schoolId, userId, ids)
      reload()
    } catch {
      // Marking read is a convenience. A failure must not interrupt the user.
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-graphite hover:bg-ink/5 dark:hover:bg-white/10"
        aria-label="Notifications"
      >
        <Bell className="h-4.5 w-4.5" />
        {unreadCount > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold text-white">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="interaction-menu absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-ink/5 bg-white shadow-xl dark:border-white/10 dark:bg-[#1c1c1e]">
          <div className="flex items-center justify-between border-b border-ink/5 px-4 py-3 dark:border-white/10">
            <p className="text-sm font-semibold text-ink dark:text-white">Notifications</p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markRead(notifications.filter((n) => !n.readAt).map((n) => n.id))}
                className="flex items-center gap-1 text-xs font-medium text-graphite hover:text-ink dark:hover:text-white"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8">
                <EmptyState icon={Bell} title="No notifications" description="You have nothing new right now." />
              </div>
            ) : (
              notifications.map((n) => {
                const Icon = iconByType[n.type] ?? Bell
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => {
                      void markRead([n.id])
                      if (n.link) navigate(n.link)
                      setOpen(false)
                    }}
                    className={cn(
                      'flex w-full items-start gap-3 border-b border-ink/5 px-4 py-3 text-left last:border-b-0 hover:bg-ink/[0.03] dark:border-white/5 dark:hover:bg-white/[0.03]',
                      !n.readAt && 'bg-brand/[0.04]',
                    )}
                  >
                    <span className="mt-0.5 rounded-lg bg-ink/5 p-1.5 text-graphite dark:bg-white/10">
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-ink dark:text-white">{n.title}</span>
                      <span className="block truncate text-xs text-graphite">{n.body}</span>
                      <span className="mt-0.5 block text-[11px] text-graphite">{timeAgo(n.createdAt)}</span>
                    </span>
                    {!n.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" />}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
