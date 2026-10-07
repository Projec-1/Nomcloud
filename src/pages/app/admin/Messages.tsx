import { ChatText as MessageSquare } from '@phosphor-icons/react'
import PageHeader from '@/components/ui/PageHeader'
import AdminSectionInsights from '@/components/dashboard/AdminSectionInsights'
import { useAuth } from '@/context/AuthContext'
import ResourceGate from '@/components/ui/ResourceGate'
import MessagesPanel from '@/components/dashboard/MessagesPanel'
import { useMessageThreads } from '@/hooks/useCommunications'
import { monthAnchor, recentMonthlyCounts } from '@/utils/adminAnalytics'

// Phase 8 batch 7. NEW SCREEN, and it exists for a structural reason.
//
// Only owner, director and administrator can open a conversation:
// message_threads INSERT and message_thread_participants INSERT are both keyed
// on has_school_admin_role. The prototype routed messaging to teachers and
// parents only, which are exactly the two roles that cannot start one. Without
// this page the feature has no entry point and every inbox stays permanently
// empty.
//
// Adding it is the inverse of the rule earlier batches applied when removing
// controls the database refuses. Here the database permits something the
// interface never offered.
//
// Participation still bounds what is visible. An administrator sees the threads
// they are in, not the school's mail.

export default function AdminMessages() {
  const { school } = useAuth()
  const { state, schoolId, userId, canStartThread, reload } = useMessageThreads()

  return (
    <div>
      <PageHeader title="Messages" description="Start and continue conversations with staff and parents." />
      <ResourceGate
        state={state}
        empty={{ icon: MessageSquare, title: 'No conversations yet' }}
        deniedHint="Messages are available to signed-in school members."
      >
        {(threads) => {
          const conversationTrend = recentMonthlyCounts(
            threads.map((thread) => thread.createdAt),
            6,
            monthAnchor(school?.timezone),
          )
          return (
          <>
            <AdminSectionInsights
              metrics={[
                { label: 'Conversations', value: threads.length },
                { label: 'Unread', value: threads.filter((thread) => thread.unread).length },
                { label: 'With message history', value: threads.filter((thread) => thread.lastMessageAt !== null).length },
              ]}
              charts={[
                {
                  kind: 'line',
                  title: 'Conversations started',
                  categories: conversationTrend.labels,
                  series: [{
                    label: 'Started',
                    values: conversationTrend.values,
                  }],
                },
                {
                  kind: 'donut',
                  title: 'Unread conversations',
                  segments: [
                    { label: 'Unread', value: threads.filter((thread) => thread.unread).length, tone: 'warning' },
                    { label: 'No unread marker', value: threads.filter((thread) => !thread.unread).length, tone: 'neutral' },
                  ],
                },
              ]}
              insight="Conversation history is available; individual message counts, reach, and reply times are not in this summary data."
            />
            <MessagesPanel
            threads={threads}
            schoolId={schoolId as string}
            currentUserId={userId as string}
            canStartThread={canStartThread}
            emptyDescription="Start a conversation with a teacher or a parent."
            onChanged={reload}
            />
          </>
          )
        }}
      </ResourceGate>
    </div>
  )
}
