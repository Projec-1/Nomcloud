import { ChatText as MessageSquare } from '@phosphor-icons/react'
import PageHeader from '@/components/ui/PageHeader'
import { useLanguage } from '@/context/LanguageContext'
import ResourceGate from '@/components/ui/ResourceGate'
import MessagesPanel from '@/components/dashboard/MessagesPanel'
import { useMessageThreads } from '@/hooks/useCommunications'

// Phase 8 batch 7. Real threads, for whoever is an actual participant.
//
// The prototype filtered mock threads by `participantIds.includes(parentId)`,
// comparing a guardians.id against what are really USER ids, and offered a
// compose control listing the teachers of the child's class. Neither works
// against the real tables: participation is by auth.uid(), and a guardian holds
// no INSERT policy on message_threads or message_thread_participants.
//
// So a guardian replies here and does not start. That is decision 7 applied
// consistently, not a parent-specific restriction.

export default function ParentMessages() {
  const { t } = useLanguage()
  const { state, schoolId, userId, canStartThread, reload } = useMessageThreads()

  return (
    <div>
      <PageHeader title={t('parent.messages.title')} description={t('parent.messages.description')} />
      <ResourceGate
        state={state}
        empty={{ icon: MessageSquare, title: 'No conversations yet' }}
        deniedHint="Messages are available to signed-in school members."
      >
        {(threads) => (
          <MessagesPanel
            threads={threads}
            schoolId={schoolId as string}
            currentUserId={userId as string}
            canStartThread={canStartThread}
            emptyDescription="When the school starts a conversation with you, it will appear here."
            onChanged={reload}
          />
        )}
      </ResourceGate>
    </div>
  )
}
