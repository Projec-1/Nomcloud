import { ChatText as MessageSquare } from '@phosphor-icons/react'
import PageHeader from '@/components/ui/PageHeader'
import { useLanguage } from '@/context/LanguageContext'
import ResourceGate from '@/components/ui/ResourceGate'
import MessagesPanel from '@/components/dashboard/MessagesPanel'
import { useMessageThreads } from '@/hooks/useCommunications'

// Phase 8 batch 7. Real threads, for whoever is an actual participant.
//
// The prototype filtered mock threads by `participantIds.includes(teacherId)`,
// comparing a teachers.id against what are really USER ids. Participation is now
// resolved server-side by is_thread_participant against auth.uid(), which is the
// only identity a participant row ever holds.
//
// A teacher cannot open a conversation, so MessagesPanel withholds the compose
// control and says why. They can reply in any thread they are part of, because
// messages INSERT is keyed on participation rather than on role.

export default function TeacherMessages() {
  const { t } = useLanguage()
  const { state, schoolId, userId, canStartThread, reload } = useMessageThreads()

  return (
    <div>
      <PageHeader title={t('teacher.messages.title')} description={t('teacher.messages.description')} />
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
            emptyDescription="When the school office starts a conversation with you, it will appear here."
            onChanged={reload}
          />
        )}
      </ResourceGate>
    </div>
  )
}
